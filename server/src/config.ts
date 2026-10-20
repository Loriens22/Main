import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

const dataDir = resolve(env('DATA_DIR', '/data'));

export const config = {
  version: '1.0.0',
  port: Number(env('PORT', '8080')),
  dataDir,
  workspacesDir: join(dataDir, 'workspaces'),
  dbPath: join(dataDir, 'maverick.db'),
  opencodeHome: join(dataDir, 'home'),
  opencodeBin: env('OPENCODE_BIN', 'opencode'),
  opencodePort: Number(env('OPENCODE_PORT', '4096')),
  cacheDir: env('CACHE_DIR', '/tmp/maverick-cache'),
  /** Pairing code a phone must present once to obtain a device token. */
  accessCode: env('ACCESS_CODE'),
  /** Secret used to encrypt stored credentials (GitHub token). */
  serverSecret: env('SERVER_SECRET'),
  /** Internal URL of the speech service (sherpa-onnx ASR + Kokoro TTS). */
  voiceUrl: env('VOICE_URL'),
  voiceSecret: env('VOICE_SECRET'),
  /** Directory with the built PWA (served at /). */
  webDir: env('WEB_DIR', resolve(process.cwd(), 'public')),
  selfTest: env('SELFTEST') === '1',
  selfTestModel: env('SELFTEST_MODEL'),
  /** Extra shell PATH entries for the coding agent. */
  agentPath: env('AGENT_PATH', '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'),
  apkUrl: env('APK_URL', 'https://github.com/Loriens22/Main/releases/latest/download/maverick-bot.apk'),
  /** Optional mock/custom OpenAI-compatible provider, used only by local integration tests. */
  testProviderUrl: env('TEST_PROVIDER_URL'),
};

export function ensureDirs(): void {
  for (const d of [config.dataDir, config.workspacesDir, config.opencodeHome, config.cacheDir]) {
    mkdirSync(d, { recursive: true });
  }
}
