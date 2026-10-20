/**
 * Turns raw OpenCode tool events into short, factual activity descriptions used for
 * mascot reactions and voice narration. Nothing here is invented: every activity maps
 * to a real tool call, its real input, and its real result.
 */

export type ActivityKind =
  | 'thinking'
  | 'reading'
  | 'searching'
  | 'editing'
  | 'command'
  | 'installing'
  | 'testing'
  | 'building'
  | 'git'
  | 'browsing'
  | 'planning'
  | 'delegating'
  | 'test-result'
  | 'build-result'
  | 'command-result'
  | 'edit-result'
  | 'tool-error'
  | 'permission'
  | 'question'
  | 'done'
  | 'error'
  | 'retry'
  | 'idle';

export interface Activity {
  kind: ActivityKind;
  label: string;
  detail?: string;
  ok?: boolean;
  file?: string;
  command?: string;
  passed?: number;
  failed?: number;
  additions?: number;
  deletions?: number;
  files?: number;
  tool?: string;
  callID?: string;
}

const TEST_RE = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(jest|vitest|pytest|mocha|ava|tap|phpunit|rspec|playwright test)\b|\bgo\s+test\b|\bcargo\s+test\b|\bpython3?\s+-m\s+(pytest|unittest)\b|\bdeno\s+test\b|\bgradle\w*\s+test\b|\bmvn\s+test\b/;
const BUILD_RE = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|\btsc\b|\bvite\s+build\b|\bnext\s+build\b|\bcargo\s+build\b|\bgo\s+build\b|\bmake\b|\bgradle\w*\s+(assemble|build)|\bmvn\s+(package|compile)\b|\bwebpack\b|\besbuild\b/;
const INSTALL_RE = /\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci)\b|\bpip3?\s+install\b|\bpoetry\s+(add|install)\b|\bcargo\s+add\b|\bgo\s+get\b|\bapt(-get)?\s+install\b/;

export function classifyCommand(cmd: string): 'testing' | 'building' | 'installing' | 'git' | 'command' {
  if (TEST_RE.test(cmd)) return 'testing';
  if (INSTALL_RE.test(cmd)) return 'installing';
  if (BUILD_RE.test(cmd)) return 'building';
  if (/^\s*git\b/.test(cmd)) return 'git';
  return 'command';
}

function short(s: string, n = 60): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

function baseName(p?: string): string {
  if (!p) return 'a file';
  const parts = String(p).split('/');
  return parts[parts.length - 1] || String(p);
}

/** Extracts pass/fail counts from common test runner summaries. */
export function parseTestCounts(out: string): { passed?: number; failed?: number } {
  const text = out.slice(-6000);
  let passed: number | undefined;
  let failed: number | undefined;
  const jest = /Tests:\s+(?:(\d+)\s+failed,\s+)?(?:\d+\s+skipped,\s+)?(?:(\d+)\s+passed)?/i.exec(text);
  if (jest && (jest[1] || jest[2])) {
    failed = Number(jest[1] ?? 0);
    passed = Number(jest[2] ?? 0);
    return { passed, failed };
  }
  const vitest = /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed/i.exec(text);
  if (vitest) return { passed: Number(vitest[2]), failed: Number(vitest[1] ?? 0) };
  const pyt = /=+\s*(?:(\d+)\s+failed)?[, ]*(?:(\d+)\s+passed)?.*?in\s+[\d.]+s/i.exec(text);
  if (pyt && (pyt[1] || pyt[2])) return { passed: Number(pyt[2] ?? 0), failed: Number(pyt[1] ?? 0) };
  const unittest = /Ran\s+(\d+)\s+tests?[\s\S]*?(OK|FAILED\s*\((?:failures|errors)=(\d+))/i.exec(text);
  if (unittest) {
    const total = Number(unittest[1]);
    const f = unittest[3] ? Number(unittest[3]) : 0;
    return { passed: total - f, failed: f };
  }
  const gotest = text.match(/^(ok|FAIL)\s+\S+/gm);
  if (gotest) {
    return { passed: gotest.filter((l) => l.startsWith('ok')).length, failed: gotest.filter((l) => l.startsWith('FAIL')).length };
  }
  const cargo = /test result:\s+\w+\.\s+(\d+)\s+passed;\s+(\d+)\s+failed/i.exec(text);
  if (cargo) return { passed: Number(cargo[1]), failed: Number(cargo[2]) };
  return {};
}

/** Activity for a tool part transition. Returns null when the transition is not interesting. */
export function toolActivity(part: any): Activity | null {
  const tool: string = part?.tool ?? '';
  const st = part?.state ?? {};
  const input = st.input ?? {};
  const status: string = st.status;
  const callID: string = part.callID;
  const file = input.filePath ?? input.path ?? input.file;

  if (status === 'running' || status === 'pending') {
    if (status === 'pending' && !Object.keys(input).length) return null;
    switch (tool) {
      case 'read':
        return { kind: 'reading', label: `Reading ${baseName(file)}`, file, tool, callID };
      case 'glob':
      case 'grep':
      case 'list':
      case 'codesearch':
        return { kind: 'searching', label: input.pattern ? `Searching for “${short(input.pattern, 30)}”` : 'Searching the project', tool, callID };
      case 'edit':
      case 'write':
      case 'patch':
      case 'multiedit':
      case 'apply_patch':
        return { kind: 'editing', label: `${tool === 'write' ? 'Writing' : 'Editing'} ${baseName(file)}`, file, tool, callID };
      case 'bash': {
        const cmd: string = input.command ?? '';
        const k = classifyCommand(cmd);
        const verb = { testing: 'Running tests', building: 'Building', installing: 'Installing packages', git: 'Running git', command: 'Running' }[k];
        return { kind: k, label: k === 'command' || k === 'git' ? `${verb} \`${short(cmd, 40)}\`` : verb, command: cmd, tool, callID };
      }
      case 'webfetch':
      case 'websearch':
        return { kind: 'browsing', label: input.url ? `Reading ${short(input.url, 40)}` : 'Searching the web', tool, callID };
      case 'todowrite':
        return { kind: 'planning', label: 'Updating the plan', tool, callID };
      case 'task':
        return { kind: 'delegating', label: `Delegating: ${short(input.description ?? 'subtask', 40)}`, tool, callID };
      default:
        return { kind: 'command', label: `Using ${tool}`, tool, callID };
    }
  }

  if (status === 'completed') {
    if (tool === 'bash') {
      const cmd: string = input.command ?? '';
      const k = classifyCommand(cmd);
      const exit = st.metadata?.exit;
      const ok = exit === undefined || exit === null ? true : Number(exit) === 0;
      const out = String(st.metadata?.output ?? st.output ?? '');
      if (k === 'testing') {
        const c = parseTestCounts(out);
        const failedTests = c.failed ?? (ok ? 0 : undefined);
        const okTests = ok && !c.failed;
        const label = okTests
          ? c.passed !== undefined
            ? `All ${c.passed} tests passed`
            : 'Tests passed'
          : failedTests
            ? `${failedTests} test${failedTests === 1 ? '' : 's'} failed`
            : 'Tests failed';
        return { kind: 'test-result', label, ok: okTests, passed: c.passed, failed: c.failed, command: cmd, tool, callID };
      }
      if (k === 'building') return { kind: 'build-result', label: ok ? 'Build succeeded' : 'Build failed', ok, command: cmd, tool, callID };
      if (k === 'installing') return { kind: 'command-result', label: ok ? 'Packages installed' : 'Install failed', ok, command: cmd, tool, callID };
      if (!ok) return { kind: 'command-result', label: `Command failed (exit ${exit})`, detail: short(cmd, 60), ok, command: cmd, tool, callID };
      return null;
    }
    if (['edit', 'write', 'patch', 'multiedit', 'apply_patch'].includes(tool)) {
      const fd = st.metadata?.filediff;
      return {
        kind: 'edit-result',
        label: `${tool === 'write' ? 'Wrote' : 'Edited'} ${baseName(file)}`,
        ok: true,
        file,
        additions: fd?.additions,
        deletions: fd?.deletions,
        tool,
        callID,
      };
    }
    return null;
  }

  if (status === 'error') {
    const err = String(st.error ?? 'Tool failed');
    if (/rejected|denied|permission/i.test(err)) return { kind: 'tool-error', label: 'Action declined', detail: short(err, 80), ok: false, tool, callID };
    return { kind: 'tool-error', label: `${tool} failed`, detail: short(err, 100), ok: false, tool, callID };
  }
  return null;
}

export function describeError(err: any): string {
  if (!err) return 'Unknown error';
  const name = err.name ?? '';
  const msg = err.data?.message ?? err.message ?? '';
  const status = err.data?.statusCode;
  if (status === 429 || /rate.?limit|too many requests/i.test(msg)) return 'The free model is rate-limited right now';
  if (name === 'ProviderAuthError') return `Provider auth failed: ${msg}`;
  if (name === 'MessageAbortedError') return 'Stopped';
  if (name === 'ContextOverflowError') return 'The conversation is too long for this model';
  if (name === 'MessageOutputLengthError') return 'The model hit its output limit';
  return short(msg || name || 'Error', 140);
}
