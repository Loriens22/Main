/**
 * Stream framing helpers.
 *
 * Agent CLIs emit JSON lines, but not reliably *one line per object*: a stray
 * pretty-printed payload, a log line interleaved on stdout, or a chunk boundary
 * mid-object are all normal. `JsonLineStream` therefore buffers partial lines,
 * and when a line does not parse as JSON it keeps accumulating until the buffer
 * does parse (multi-line JSON) or it becomes clear the text is not JSON at all.
 */

export class LineSplitter {
  #buffer = '';

  push(chunk: string | Buffer, onLine: (line: string) => void): void {
    this.#buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let index = this.#buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.#buffer.slice(0, index).replace(/\r$/, '');
      this.#buffer = this.#buffer.slice(index + 1);
      onLine(line);
      index = this.#buffer.indexOf('\n');
    }
  }

  flush(onLine: (line: string) => void): void {
    if (this.#buffer.length > 0) {
      const line = this.#buffer;
      this.#buffer = '';
      onLine(line);
    }
  }
}

/** Loose JSON value type — deliberately not `any`; callers narrow before use. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const MAX_PENDING_BYTES = 4 * 1024 * 1024;

export class JsonLineStream {
  #splitter = new LineSplitter();
  #pending: string[] = [];
  #pendingBytes = 0;

  constructor(
    private readonly onJson: (value: JsonValue) => void,
    private readonly onText: (line: string) => void = () => {},
  ) {}

  push(chunk: string | Buffer): void {
    this.#splitter.push(chunk, (line) => this.#line(line));
  }

  end(): void {
    this.#splitter.flush((line) => this.#line(line));
    this.#drainPendingAsText();
  }

  #line(line: string): void {
    if (this.#pending.length === 0) {
      const trimmed = line.trim();
      if (trimmed.length === 0) return;
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        this.onText(line);
        return;
      }
      const parsed = tryParse(trimmed);
      if (parsed.ok) {
        this.onJson(parsed.value);
        return;
      }
      this.#pending.push(line);
      this.#pendingBytes = line.length;
      return;
    }

    this.#pending.push(line);
    this.#pendingBytes += line.length + 1;
    const parsed = tryParse(this.#pending.join('\n'));
    if (parsed.ok) {
      this.#pending = [];
      this.#pendingBytes = 0;
      this.onJson(parsed.value);
      return;
    }
    if (this.#pendingBytes > MAX_PENDING_BYTES) this.#drainPendingAsText();
  }

  #drainPendingAsText(): void {
    for (const line of this.#pending) this.onText(line);
    this.#pending = [];
    this.#pendingBytes = 0;
  }
}

function tryParse(text: string): { ok: true; value: JsonValue } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch {
    return { ok: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Narrowing helpers used by every adapter                                     */
/* -------------------------------------------------------------------------- */

export function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function arr(value: unknown): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

/** Best-effort "render this unknown payload as a string" for tool output. */
export function stringify(value: unknown, limit = 40_000): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return truncate(value, limit);
  try {
    return truncate(JSON.stringify(value, null, 2) ?? String(value), limit);
  } catch {
    return truncate(String(value), limit);
  }
}

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… (${text.length - limit} more characters)`;
}
