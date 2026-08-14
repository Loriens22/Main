/**
 * A small, deliberately incomplete Markdown parser.
 *
 * The output of a coding agent is untrusted text, so nothing here ever produces
 * HTML — it produces a typed tree that `Markdown.tsx` renders as React
 * elements. There is no `dangerouslySetInnerHTML` anywhere in the chat surface,
 * which means an agent cannot inject markup into the client no matter what it
 * writes.
 *
 * Supported: ATX headings, fenced code with a language tag, unordered and
 * ordered lists (one nesting level of indentation), blockquotes, thematic
 * breaks, paragraphs, and the inline set below. Everything else degrades to
 * plain text rather than being silently dropped.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'strike'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

export interface ListItem {
  inline: Inline[];
  /** Indent level, 0-based; deeper items are indented visually. */
  depth: number;
}

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'code'; lang: string | null; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'rule' };

/* -------------------------------------------------------------------------- */
/* Links                                                                      */
/* -------------------------------------------------------------------------- */

const SAFE_SCHEME = /^(https?:|mailto:)/i;

/**
 * Only absolute http(s) and mailto links survive. `javascript:`, `data:` and
 * anything else render as plain text, so a link can never become a script
 * vector.
 */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href.length === 0 || href.length > 2048) return null;
  if (SAFE_SCHEME.test(href)) return href;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Inline                                                                     */
/* -------------------------------------------------------------------------- */

const AUTOLINK = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/i;

function pushText(out: Inline[], text: string): void {
  if (text.length === 0) return;
  const last = out[out.length - 1];
  if (last && last.kind === 'text') last.text += text;
  else out.push({ kind: 'text', text });
}

/** Find the closing run of `marker` starting at `from`, skipping escaped chars. */
function findClose(src: string, marker: string, from: number): number {
  let i = from;
  while (i <= src.length - marker.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src.startsWith(marker, i)) return i;
    i += 1;
  }
  return -1;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let plain = '';

  const flush = () => {
    pushText(out, plain);
    plain = '';
  };

  while (i < src.length) {
    const char = src[i] as string;

    // Backslash escape.
    if (char === '\\' && i + 1 < src.length) {
      plain += src[i + 1] as string;
      i += 2;
      continue;
    }

    // Inline code: a run of N backticks closes on the next run of N backticks.
    if (char === '`') {
      let fence = 0;
      while (src[i + fence] === '`') fence += 1;
      const marker = '`'.repeat(fence);
      const close = findClose(src, marker, i + fence);
      if (close !== -1) {
        flush();
        out.push({ kind: 'code', text: src.slice(i + fence, close).trim() });
        i = close + fence;
        continue;
      }
    }

    // Strong / emphasis / strikethrough.
    const pair = char === '*' || char === '_' || char === '~' ? char : null;
    if (pair) {
      const double = src[i + 1] === pair;
      const marker = double ? pair + pair : pair;
      // `~` only ever means strikethrough, and only doubled.
      if (!(pair === '~' && !double)) {
        const close = findClose(src, marker, i + marker.length);
        if (close !== -1 && close > i + marker.length) {
          const children = parseInline(src.slice(i + marker.length, close));
          flush();
          if (pair === '~') out.push({ kind: 'strike', children });
          else if (double) out.push({ kind: 'strong', children });
          else out.push({ kind: 'em', children });
          i = close + marker.length;
          continue;
        }
      }
    }

    // Link: [label](href)
    if (char === '[') {
      const labelEnd = findClose(src, ']', i + 1);
      if (labelEnd !== -1 && src[labelEnd + 1] === '(') {
        const hrefEnd = findClose(src, ')', labelEnd + 2);
        if (hrefEnd !== -1) {
          const href = safeHref(src.slice(labelEnd + 2, hrefEnd));
          const label = src.slice(i + 1, labelEnd);
          flush();
          if (href) out.push({ kind: 'link', href, children: parseInline(label) });
          else pushText(out, `[${label}]`);
          i = hrefEnd + 1;
          continue;
        }
      }
    }

    // Bare URL.
    if (char === 'h') {
      const match = AUTOLINK.exec(src.slice(i));
      if (match) {
        const href = safeHref(match[0]);
        if (href) {
          flush();
          out.push({ kind: 'link', href, children: [{ kind: 'text', text: match[0] }] });
          i += match[0].length;
          continue;
        }
      }
    }

    plain += char;
    i += 1;
  }

  flush();
  return out;
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([A-Za-z0-9_+.#-]+)?\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.trim().length === 0) {
      i += 1;
      continue;
    }

    // Fenced code.
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = (fence[2] ?? '```')[0] as string;
      const length = (fence[2] ?? '```').length;
      const lang = fence[3] ?? null;
      const body: string[] = [];
      i += 1;
      while (i < lines.length) {
        const candidate = lines[i] ?? '';
        const trimmed = candidate.trim();
        if (trimmed.startsWith(marker.repeat(length)) && /^[`~]+$/.test(trimmed)) {
          i += 1;
          break;
        }
        body.push(candidate);
        i += 1;
      }
      blocks.push({ kind: 'code', lang, text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(6, (heading[1] ?? '#').length) as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ kind: 'heading', level, inline: parseInline(heading[2] ?? '') });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }

    // Blockquote: gather the run, strip one level of `>`, recurse.
    const quote = QUOTE.exec(line);
    if (quote) {
      const body: string[] = [];
      while (i < lines.length) {
        const candidate = QUOTE.exec(lines[i] ?? '');
        if (!candidate) break;
        body.push(candidate[1] ?? '');
        i += 1;
      }
      blocks.push({ kind: 'quote', blocks: parseMarkdown(body.join('\n')) });
      continue;
    }

    // Lists.
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = ordered !== null && bullet === null;
      const start = isOrdered ? Number.parseInt(ordered?.[2] ?? '1', 10) : 1;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const candidate = lines[i] ?? '';
        const nextBullet = BULLET.exec(candidate);
        const nextOrdered = ORDERED.exec(candidate);
        const match = nextBullet ?? nextOrdered;
        if (!match) {
          // A plain indented line continues the previous item.
          const previous = items[items.length - 1];
          if (previous && /^\s{2,}\S/.test(candidate)) {
            previous.inline = parseInline(
              `${inlineToPlain(previous.inline)} ${candidate.trim()}`,
            );
            i += 1;
            continue;
          }
          break;
        }
        const indent = (match[1] ?? '').replace(/\t/g, '  ').length;
        items.push({ inline: parseInline(match[3] ?? ''), depth: Math.min(3, Math.floor(indent / 2)) });
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: isOrdered, start: Number.isFinite(start) ? start : 1, items });
      continue;
    }

    // Paragraph: run until a blank line or the start of another block.
    const paragraph: string[] = [];
    while (i < lines.length) {
      const candidate = lines[i] ?? '';
      if (
        candidate.trim().length === 0 ||
        FENCE.test(candidate) ||
        HEADING.test(candidate) ||
        RULE.test(candidate) ||
        QUOTE.test(candidate) ||
        BULLET.test(candidate) ||
        ORDERED.test(candidate)
      ) {
        break;
      }
      paragraph.push(candidate.trim());
      i += 1;
    }
    blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join('\n')) });
  }

  return blocks;
}

/** Flatten an inline tree back to text — used when merging list continuations. */
function inlineToPlain(nodes: Inline[]): string {
  let out = '';
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        out += node.text;
        break;
      case 'code':
        out += `\`${node.text}\``;
        break;
      case 'link':
        out += `[${inlineToPlain(node.children)}](${node.href})`;
        break;
      case 'strong':
        out += `**${inlineToPlain(node.children)}**`;
        break;
      case 'em':
        out += `*${inlineToPlain(node.children)}*`;
        break;
      case 'strike':
        out += `~~${inlineToPlain(node.children)}~~`;
        break;
    }
  }
  return out;
}
