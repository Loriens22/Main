import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { logger } from './log.js';
import { opencode } from './opencode.js';

const log = logger('catalog');

export interface ModelInfo {
  id: string; // providerID/modelID
  providerID: string;
  modelID: string;
  providerName: string;
  name: string;
  family?: string;
  free: boolean;
  /** Usable right now (provider connected). Paid models from unconnected providers are listed as locked. */
  available: boolean;
  cost: { input: number; output: number };
  limit: { context: number; output: number };
  caps: { tools: boolean; reasoning: boolean; vision: boolean; attachments: boolean; pdf: boolean; temperature: boolean };
  status?: string;
  releaseDate?: string;
}

export interface Catalog {
  models: ModelInfo[];
  defaultModel: string | null;
  refreshedAt: number;
  source: 'opencode' | 'cache';
}

let cache: Catalog = { models: [], defaultModel: null, refreshedAt: 0, source: 'opencode' };
let inflight: Promise<Catalog> | null = null;

function toInfo(p: any, m: any, connected: boolean): ModelInfo {
  const cost = { input: Number(m?.cost?.input ?? 0), output: Number(m?.cost?.output ?? 0) };
  const free = cost.input === 0 && cost.output === 0;
  const caps = m?.capabilities ?? {};
  return {
    id: `${p.id}/${m.id}`,
    providerID: p.id,
    modelID: m.id,
    providerName: p.name ?? p.id,
    name: m.name ?? m.id,
    family: m.family,
    free,
    available: connected,
    cost,
    limit: { context: Number(m?.limit?.context ?? 0), output: Number(m?.limit?.output ?? 0) },
    caps: {
      tools: caps.toolcall ?? m.tool_call ?? false,
      reasoning: caps.reasoning ?? m.reasoning ?? false,
      vision: caps.input?.image ?? false,
      attachments: caps.attachment ?? m.attachment ?? false,
      pdf: caps.input?.pdf ?? false,
      temperature: caps.temperature ?? true,
    },
    status: m.status,
    releaseDate: m.release_date,
  };
}

/** Paid OpenCode Zen models are hidden by opencode when no key is set; read them from the models.dev cache to show them as locked. */
function lockedZenModels(known: Set<string>): ModelInfo[] {
  const dir = join(config.cacheDir, 'opencode');
  if (!existsSync(dir)) return [];
  try {
    const file = readdirSync(dir).find((f) => /^models.*\.json$/.test(f));
    if (!file) return [];
    const all = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const zen = all?.opencode;
    if (!zen?.models) return [];
    const out: ModelInfo[] = [];
    for (const m of Object.values<any>(zen.models)) {
      const info = toInfo({ id: 'opencode', name: zen.name ?? 'OpenCode Zen' }, m, false);
      if (info.free || known.has(info.id)) continue;
      out.push(info);
    }
    return out;
  } catch (e) {
    log.warn('could not read models cache', (e as Error).message);
    return [];
  }
}

export async function refreshCatalog(): Promise<Catalog> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await opencode.request<{ all: any[]; default: Record<string, string>; connected: string[] }>('GET', '/provider', {
        directory: config.workspacesDir,
      });
      const connected = new Set(res.connected ?? []);
      const models: ModelInfo[] = [];
      for (const p of res.all ?? []) {
        for (const m of Object.values<any>(p.models ?? {})) {
          if (m.status === 'deprecated') continue;
          models.push(toInfo(p, m, connected.has(p.id)));
        }
      }
      const known = new Set(models.map((m) => m.id));
      models.push(...lockedZenModels(known));
      models.sort((a, b) => Number(b.free) - Number(a.free) || Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));
      const freeAvail = models.filter((m) => m.free && m.available);
      const dflt = res.default?.opencode ? `opencode/${res.default.opencode}` : null;
      const defaultModel = dflt && freeAvail.some((m) => m.id === dflt) ? dflt : freeAvail[0]?.id ?? null;
      cache = { models, defaultModel, refreshedAt: Date.now(), source: 'opencode' };
      log.info(`catalog: ${freeAvail.length} free models available, ${models.length - freeAvail.length} other; default ${defaultModel}`);
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function getCatalog(maxAgeMs = 5 * 60_000): Promise<Catalog> {
  if (Date.now() - cache.refreshedAt > maxAgeMs || cache.models.length === 0) {
    try {
      await refreshCatalog();
    } catch (e) {
      log.warn('catalog refresh failed', (e as Error).message);
    }
  }
  return cache;
}

export function findModel(id: string): ModelInfo | undefined {
  return cache.models.find((m) => m.id === id);
}

export function splitModel(id: string): { providerID: string; modelID: string } {
  const i = id.indexOf('/');
  return { providerID: id.slice(0, i), modelID: id.slice(i + 1) };
}

export class ModelPolicyError extends Error {
  status = 400;
}

/**
 * Enforces the "never silently use a paid model" rule: a paid model can only run when the chat
 * has explicit paid consent and the provider is connected. Free models must exist in the live catalog.
 */
export async function assertModelAllowed(modelId: string, allowPaid: boolean): Promise<ModelInfo> {
  await getCatalog();
  let m = findModel(modelId);
  if (!m) {
    await refreshCatalog().catch(() => undefined);
    m = findModel(modelId);
  }
  if (!m) throw new ModelPolicyError(`Model ${modelId} is not available on this server anymore. Pick another model.`);
  if (!m.available) throw new ModelPolicyError(`${m.name} needs a ${m.providerName} API key. Add one in Settings → Providers.`);
  if (!m.free && !allowPaid)
    throw new ModelPolicyError(`${m.name} is a paid model. Confirm paid usage for this chat before sending.`);
  return m;
}
