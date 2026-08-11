import type { ProviderDescriptor, ProviderId } from './index.js';

/**
 * The provider registry. This is deliberately data, not code: adding an agent
 * to Ornight is one entry here plus one adapter in `@ornight/core`.
 *
 * `accent` is an `r g b` triple so it can be dropped straight into
 * `rgb(var(--accent) / <alpha>)` in the glass design system.
 */
export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    command: 'claude',
    accent: '214 155 108',
    glyph: '✳',
    defaultModel: 'claude-opus-5',
    models: [
      { id: 'claude-opus-5', label: 'Opus 5', note: 'Deepest reasoning' },
      { id: 'claude-sonnet-5', label: 'Sonnet 5', note: 'Balanced, fast' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', note: 'Cheapest' },
    ],
    permissionModes: ['plan', 'ask', 'auto-edit', 'full-access'],
    defaultPermissionMode: 'auto-edit',
    supportsResume: true,
    supportsStreaming: true,
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    accent: '236 240 246',
    glyph: '◆',
    defaultModel: 'gpt-5-codex',
    models: [
      { id: 'gpt-5-codex', label: 'GPT-5 Codex', note: 'Default' },
      { id: 'gpt-5-codex-mini', label: 'Codex Mini', note: 'Fast' },
    ],
    permissionModes: ['plan', 'ask', 'auto-edit', 'full-access'],
    defaultPermissionMode: 'auto-edit',
    supportsResume: true,
    supportsStreaming: true,
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    command: 'cursor-agent',
    accent: '148 163 184',
    glyph: '▸',
    defaultModel: 'composer-1',
    models: [
      { id: 'composer-1', label: 'Composer', note: 'Cursor native' },
      { id: 'auto', label: 'Auto', note: 'Cursor picks' },
    ],
    permissionModes: ['ask', 'auto-edit', 'full-access'],
    defaultPermissionMode: 'auto-edit',
    supportsResume: true,
    supportsStreaming: true,
  },
  grok: {
    id: 'grok',
    label: 'Grok Build',
    command: 'grok',
    accent: '129 140 248',
    glyph: '✦',
    defaultModel: 'grok-code',
    models: [
      { id: 'grok-code', label: 'Grok Code', note: 'Build mode' },
      { id: 'grok-4', label: 'Grok 4', note: 'General' },
    ],
    permissionModes: ['ask', 'auto-edit', 'full-access'],
    defaultPermissionMode: 'auto-edit',
    supportsResume: false,
    supportsStreaming: true,
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    accent: '110 231 183',
    glyph: '⬡',
    defaultModel: 'default',
    models: [{ id: 'default', label: 'Configured model', note: 'From opencode config' }],
    permissionModes: ['plan', 'ask', 'auto-edit', 'full-access'],
    defaultPermissionMode: 'auto-edit',
    supportsResume: true,
    supportsStreaming: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    command: 'gemini',
    accent: '125 211 252',
    glyph: '◇',
    defaultModel: 'gemini-3-pro',
    models: [
      { id: 'gemini-3-pro', label: 'Gemini 3 Pro', note: 'Default' },
      { id: 'gemini-3-flash', label: 'Gemini 3 Flash', note: 'Fast' },
    ],
    permissionModes: ['ask', 'auto-edit', 'full-access'],
    defaultPermissionMode: 'auto-edit',
    supportsResume: true,
    supportsStreaming: true,
  },
  mock: {
    id: 'mock',
    label: 'Demo Agent',
    command: 'ornight-mock',
    accent: '147 178 255',
    glyph: '✳',
    defaultModel: 'demo',
    models: [{ id: 'demo', label: 'Demo', note: 'Scripted, offline' }],
    permissionModes: ['plan', 'ask', 'auto-edit', 'full-access'],
    defaultPermissionMode: 'ask',
    supportsResume: true,
    supportsStreaming: true,
  },
};

/** Registry order used everywhere a provider list is rendered. */
export const PROVIDER_ORDER: ProviderId[] = [
  'claude-code',
  'codex',
  'cursor',
  'grok',
  'opencode',
  'gemini',
  'mock',
];

export function providerOf(id: ProviderId): ProviderDescriptor {
  return PROVIDERS[id] ?? PROVIDERS.mock;
}
