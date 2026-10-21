# Maverick Bot

An AI coding companion for Android and iOS. You chat with real OpenCode coding agents, run multi-agent team chats, and talk to Maverick in live voice calls. Two 3D mascots react to what the agents are actually doing: Maverick (a blue star in a beret) and Sparky (a small flame).

- **Android:** [download the APK](https://github.com/Loriens22/Main/releases/latest/download/maverick-bot.apk). Allow "install from this source" when you open it.
- **iPhone/iPad:** open https://maverick-core-production.up.railway.app in Safari, then Share → Add to Home Screen.
- **First launch:** enter the access code. It is in Railway → `maverick-bot` → `maverick-core` → Variables → `ACCESS_CODE`.
- **No Railway?** [Run your own server](#run-your-own-server-no-account) on any computer with Docker. No account is needed.

## Architecture

```
 Phone (Capacitor app / PWA)
   │  HTTPS REST + WebSocket /ws (events) + /ws/voice (PCM audio)
   ▼
 maverick-core  (Railway, public)           volume /data
   ├─ Fastify gateway: pairing, devices, projects, chats, team orchestration,
   │  model policy, approvals, GitHub, voice bridge, serves the PWA
   └─ opencode serve (child process, localhost only, sandboxed env)
   │  private network
   ▼
 maverick-voice (Railway, private)
   ├─ sherpa-onnx streaming ASR (NeMo FastConformer, 480 ms chunks, int8)
   └─ Kokoro-82M TTS (kokoro-multi-lang v1.0)
```

| Path | What it is |
| --- | --- |
| `server/` | Core gateway (TypeScript, Node 22). The Dockerfile also builds the web app and installs `opencode-ai@1.19.3`. |
| `voice/` | Speech engine (Node 22, `sherpa-onnx-node`). Models are downloaded at image build time. |
| `app/` | Mobile app: React 19, Vite, Capacitor 8, three.js mascots, Liquid Glass UI. Includes the native `android/` and `ios/` projects. |
| `.github/workflows/mobile.yml` | Builds and signs the APK and publishes it as a GitHub Release. Also runs an iOS simulator build check. |

### Core features

- **Chats.** Each chat is an OpenCode session in a project workspace on the volume. Replies stream token by token, with tool cards (files, shell, diffs), reasoning, retries, and errors.
- **Approval modes** (per chat):
  - `ask`: edits, shell and web need approval.
  - `auto-edit`: edits allowed, shell asks.
  - `full`: everything allowed.

  Safe read-only shell commands are always allowed. Destructive patterns (`sudo`, `rm -rf /`, `mkfs`, …) and directories outside the workspace are always denied.
- **Team chats.** A lead agent plans with read-only tools and returns a task plan with dependencies. Tasks run on the team's agents, with a limited number running at once. The lead then reviews and summarizes. Delegations show live in the chat.
- **Models.**
  - Free OpenCode models are discovered live from the OpenCode server and labelled Free.
  - Paid models show their prices and are locked until you add your own API key. Even then, each chat needs an explicit confirmation before it uses one.
  - The server rejects any paid model a chat has not opted into, so nothing ever switches to a paid model on its own.
- **Voice calls.**
  - Your phone streams 16 kHz audio to the core. Partial transcripts show live, and a final transcript is sent to the same OpenCode session the chat uses.
  - Replies are spoken sentence by sentence, with code blocks skipped. Start talking to interrupt (barge-in).
  - Spoken commands work: "approve", "deny", "stop", "create a new project called …", "switch to project …".
- **GitHub.** Add a token in Settings to clone private repos and push. The token is stored encrypted (AES-256-GCM) and handed to git through a credential helper, never written to disk in plain text.
- **Security.**
  - Phones pair once with the access code and then use a device token, which the server stores as a SHA-256 hash.
  - Failed pairing attempts are rate-limited.
  - OpenCode listens only on localhost, behind a password. Its environment is sandboxed so paid provider keys in the host environment can't enable paid models.

## Railway deployment

Project **maverick-bot**, environment **production**.

| Service | Source | Networking | Notes |
| --- | --- | --- | --- |
| `maverick-core` | repo `Loriens22/Main`, Dockerfile `server/Dockerfile`, watch `/server/**`, `/app/**` | https://maverick-core-production.up.railway.app, port 8080 | Volume `maverick-data` at `/data`. Health check `/health`. Serverless sleep on. |
| `maverick-voice` | repo `Loriens22/Main`, root `/voice` (its Dockerfile), watch `/voice/**` | private only: `${{maverick-voice.RAILWAY_PRIVATE_DOMAIN}}:8090` | Health check `/health`. Serverless sleep on. |

Both services should track the branch `ccr-b02444a3-nlojc9` (or `main` once it is merged). Set this in Settings → Source.

### Variables

`maverick-core`:

| Name | Purpose |
| --- | --- |
| `ACCESS_CODE` | Pairing code a phone enters once. |
| `SERVER_SECRET` | Key used to encrypt stored credentials. If you change it, re-enter your GitHub token and provider keys. |
| `VOICE_URL` | `http://${{maverick-voice.RAILWAY_PRIVATE_DOMAIN}}:8090` |
| `VOICE_SECRET` | Shared secret between core and voice. Must match the voice service. |
| `PORT` | `8080` |
| `SELFTEST` | `1` runs an end-to-end self-test with a real free model at boot. Keep it at `0` in normal use. |
| Optional | `SELFTEST_MODEL`, `APK_URL` (target of `/download`), `AGENT_PATH`. |

`maverick-voice`:

| Name | Purpose |
| --- | --- |
| `VOICE_SECRET` | Same value as on core. |
| `PORT` | `8090` |
| `TTS_THREADS` | `2` |
| `ASR_THREADS` | `1` |

### Useful endpoints

| Endpoint | What it returns |
| --- | --- |
| `GET /health` | Gateway and OpenCode status. |
| `GET /api/info` | Server name and version. |
| `GET /download` | Redirects to the latest APK. |
| `POST /api/pair` `{code, deviceName}` | A device token. |

Everything under `/api/*` needs `Authorization: Bearer <device token>`. On the `/ws` and `/ws/voice` WebSockets, the first message must be `{"type":"auth","token":"<device token>"}`.

### Operating notes

- **Cold starts.** With serverless sleep, a service sleeps after about 10 minutes without traffic. The next request wakes it, which can take up to a minute while OpenCode starts. Calls also wake the voice engine. If you want instant responses, turn sleep off in each service's Settings.
- **Persistence.** Data lives on the volume: workspaces, the SQLite database, and OpenCode state. Redeploys keep it.
- **Free models** can be rate-limited by their providers. The app says so and offers to retry or pick another free model. It never falls back to a paid model.

## Run your own server (no account)

If Railway can't be used, run the same server on your own computer. You don't need a new account: Docker Desktop works without signing in, and the public HTTPS address comes from a free Cloudflare Quick Tunnel, which needs no Cloudflare account.

1. **Install Docker Desktop** (free) from https://www.docker.com/products/docker-desktop/. Open it once, click **Accept**, and skip signing in. On Windows, restart if the installer asks. On Linux you can run `curl -fsSL https://get.docker.com | sudo sh` instead.
2. **Download the server files** and unzip them: https://github.com/Loriens22/Main/archive/refs/heads/ccr-b02444a3-nlojc9.zip (on Windows: right-click the ZIP → **Extract All**).
3. **Start the server.**
   - Windows: in the extracted folder, open `selfhost` and double-click `start-windows` (`start-windows.cmd`). If Windows shows "Windows protected your PC", click **More info** → **Run anyway**.
   - macOS or Linux: open Terminal, type `bash ` (with a space), drag `selfhost/start.sh` into the window, and press Enter.

   The first start builds the server and takes 5–15 minutes. At the end it prints:
   ```
       Server URL:   https://<random-words>.trycloudflare.com
       Access code:  MAV-XXXX-XXXX-XXXX
   ```
4. **In the app:** on the pairing screen, tap **Server: … · change**, paste the Server URL, then enter the access code. If the app is already paired (to Railway or to an old address), first open **Settings** → **Sign out this device** to get back to the pairing screen.
   - iPhone: open the Server URL in Safari, then Share → **Add to Home Screen**. The icon only works for that address, so add it again after every address change, or use [Codespaces](#without-installing-anything-github-codespaces), whose address stays the same.

Good to know:
- Keep the computer on, awake and online, with Docker running. Phones then reach it from anywhere.
- The address changes whenever the server or the computer restarts; the access code stays the same. Run the start script again to see the current address (when the server is already running, it doesn't restart anything). Then, in the app, open **Settings** → **Sign out this device**, tap **Server: … · change** on the pairing screen, paste the new Server URL and enter the same access code.
- To stop the server, double-click `selfhost/stop-windows` (Windows) or run `bash selfhost/stop.sh`. Projects and chats are kept in the Docker volume `maverick_maverick-data`. The next start gets a new address, so the phone pairs again as above.
- The access code and secrets are created once, in `selfhost/.env`. That file is git-ignored; `selfhost/.env.example` shows its format. Deleting it gives a new code but also a new `SERVER_SECRET`, so you would have to enter your GitHub token and provider keys again. To change only the code, edit the `ACCESS_CODE` line, then stop and start the server.
- To update, download the ZIP again, copy `selfhost/.env` from the old folder into the new `selfhost` folder, stop the server, then start it from the new folder.
- You need about 8 GB of RAM and 10 GB of free disk. On Windows, Docker Desktop also needs WSL 2 and virtualization turned on; its installer guides you.
- Voice calls use about 520 MB of speech models, downloaded by the first build. If the voice engine can't be built, the script starts the server without it, and chat still works.
- Cloudflare Quick Tunnels are meant for testing. They have no uptime guarantee, allow up to 200 requests at a time, and fall under the Cloudflare Online Services Terms of Use. For an always-on server, use Railway.
- Through the tunnel, a request that takes longer than 100 seconds fails, so cloning a very large repository can show an error in the app while the server still finishes it. The tunnel also needs outbound TCP port 7844, which some school, office and hotel networks block.
- `.github/workflows/selfhost-check.yml` runs this kit on every change to it. Through the public address, it checks health, pairing, the WebSocket, the free models and voice.

### Without installing anything: GitHub Codespaces

This uses your existing GitHub account and its free monthly Codespaces hours (about 60 hours a month on the 2-core machine).

1. Open https://codespaces.new/Loriens22/Main/tree/ccr-b02444a3-nlojc9?quickstart=1 and click **Create codespace** (or **Resume** later).
2. After 2–3 minutes, the terminal prints the Server URL (`https://<name>-8080.app.github.dev`) and the access code. Enter them in the app as above.

Limits:
- Only the chat server runs; voice calls are off.
- A codespace stops after 30 minutes without activity, and after 12 hours in any case. To raise the idle limit to 240 minutes, set **Default idle timeout** at https://github.com/settings/codespaces. Requests from the phone don't count as activity, so while the app is connected the script prints a line every 3 minutes to keep the codespace awake.
- To start it again, reopen the same link and choose **Resume**. The URL and the code stay the same.
- GitHub makes the port private again on every restart, and the script makes it public again. If it can't, open the **PORTS** tab, right-click 8080, and choose **Port Visibility** → **Public**.
- GitHub's terms allow Codespaces for development and testing, not as a permanent production host.

## Local development

```bash
# speech models (one-time, ~520 MB)
sh voice/download-models.sh ./voice/models

# voice engine
cd voice && npm ci && MODELS_DIR=./models VOICE_SECRET=dev node src/server.mjs

# core (needs the opencode CLI: npm i -g opencode-ai@1.19.3)
cd server && npm ci && npx tsc -p tsconfig.json
DATA_DIR=./data PORT=8787 ACCESS_CODE=DEV-CODE SERVER_SECRET=dev \
  VOICE_URL=http://127.0.0.1:8090 VOICE_SECRET=dev node dist/index.js

# app (browser)
cd app && npm ci && VITE_DEFAULT_SERVER=http://localhost:8787 npm run dev
```

Native builds: `cd app && npm run build && npx cap sync`, then open `android/` in Android Studio or `ios/App/App.xcodeproj` in Xcode.

## Releases

Every push that touches `app/**` runs `mobile.yml`, which builds a signed release APK and publishes `v1.0.<run>` with `maverick-bot.apk` and its SHA-256.

Without repository secrets, CI generates one signing key and keeps it in the Actions cache. That cache can be evicted, and then later APKs could no longer be installed over older ones. To make the key permanent, add these repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

iOS: the native project is included and CI compiles it for the simulator. Installing on a device needs an Apple developer account for signing. Until then, use the PWA.
