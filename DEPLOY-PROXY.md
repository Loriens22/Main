# Make the NVIDIA API actually work in the browser (CORS fix)

NVIDIA's API (`https://integrate.api.nvidia.com`) **does not send CORS headers**, so
a web page cannot call it directly — the browser blocks it and Co-op 3D falls back to
the offline persona engine. You need a **CORS proxy** between the page and NVIDIA.

There are two ways. Pick one.

---

## ✅ Option A — Your own Cloudflare Worker (recommended: reliable + your key stays yours)

Free, no credit card, ~1 minute. Your API key only ever passes through **your** proxy.

1. Open <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Worker**.
2. Give it a name (e.g. `nvidia-proxy`) → **Deploy** → **Edit code**.
3. Delete the sample code, paste **all of [`nvidia-cors-proxy.js`](./nvidia-cors-proxy.js)**, click **Deploy**.
4. Copy the worker URL, e.g. `https://nvidia-proxy.YOURNAME.workers.dev`.
5. In Co-op 3D → **＋ New neighbor** → **AI / NVIDIA API**:
   - turn the toggle **on**
   - **CORS proxy:** `https://nvidia-proxy.YOURNAME.workers.dev/`  *(keep the trailing `/`)*
   - **API key:** your `nvapi-…` key
   - **Endpoint:** `https://integrate.api.nvidia.com/v1/chat/completions`
   - **Model:** e.g. `meta/llama-3.1-70b-instruct` (or a reasoning model like
     `nvidia/llama-3.1-nemotron-70b-instruct`)
6. Click **🧪 Test connection** → you should see **✅ Connected**.

> Prefer Deno Deploy? The same file contains a ready Deno snippet at the bottom —
> deploy at <https://dash.deno.com> and use the `*.deno.dev` URL the same way.

---

## ⚡ Option B — A public proxy (zero deploy, but unreliable & sees your key)

Use the **proxy preset** dropdown in the app. Caveats:

- **proxy.cors.sh** — forwards your `Authorization` header. It may require a free
  temporary key: get one at <https://cors.sh>, then put it in the app's
  **Proxy header** field as `x-cors-api-key: temp_xxx`.
- **thingproxy** — forwards headers too, but is often rate-limited or down.
- **allorigins / corsproxy.io** — usually **strip** the `Authorization` header, so
  NVIDIA returns 401. Fine for testing CORS, not for a real key.

Public proxies can log your key and disappear without notice. For anything beyond a
quick test, use **Option A**.

---

## Notes
- The app auto-detects the proxy format: a plain prefix (`https://host/…`), a
  `?url=` style (it URL-encodes the endpoint), or a `{url}` placeholder.
- Reasoning-model output (`<think>…</think>`) is stripped automatically.
- The **Test connection** button tells you exactly what's wrong (CORS vs 401 vs network).
- Each chat transcript shows which engine produced it (🔌 NVIDIA vs 🗣️ offline).
- Your key and proxy settings are stored only in your browser (localStorage).
