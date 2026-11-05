// Minimal, safe Markdown renderer (headings, paragraphs, lists, tables, blockquotes, code, links,
// $inline$ / $$block$$ KaTeX math, [^n] citations, :::badge grade::: chips). Content is our own.

import katex from 'katex';
import { useMemo } from 'react';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function slug(s: string) {
  return s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function inline(src: string): string {
  const math: string[] = [];
  let s = src.replace(/\$([^$\n]+?)\$/g, (_, m) => { math.push(katex.renderToString(m, { throwOnError: false })); return `\u0000${math.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[\^(\w+)\]/g, '<a class="cite" href="#ref-$1" data-ref="$1">[$1]</a>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const ext = /^https?:/.test(u);
    return `<a href="${u}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${t}</a>`;
  });
  s = s.replace(/:::(sim|lit|model|prop|cont|neg|ok)\s+([^:]+?):::/g, '<span class="badge $1">$2</span>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => math[+i]);
  return s;
}

export function renderMarkdown(md: string): { html: string; toc: { level: number; text: string; id: string }[] } {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  const toc: { level: number; text: string; id: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('$$')) {
      const buf: string[] = [];
      const first = line.slice(2);
      if (first.trim().endsWith('$$') && first.trim().length > 2) { buf.push(first.trim().slice(0, -2)); i++; }
      else {
        if (first.trim()) buf.push(first);
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) buf.push(lines[i++]);
        if (i < lines.length) { buf.push(lines[i].replace(/\$\$\s*$/, '')); i++; }
      }
      out.push(katex.renderToString(buf.join('\n'), { displayMode: true, throwOnError: false }));
      continue;
    }
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="panel" style="overflow-x:auto;margin:0"><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length, text = h[2], id = slug(text);
      if (level >= 2 && level <= 3) toc.push({ level, text: text.replace(/\$[^$]*\$/g, ''), id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      const head = rows[0], body = rows.slice(2);
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^(\s*[-*]|\s*\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(\s*[-*]|\s*\d+\.)\s+/.test(lines[i])) {
        let item = lines[i].replace(/^(\s*[-*]|\s*\d+\.)\s+/, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^(\s*[-*]|\s*\d+\.)\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const m = /^\[\^(\w+)\]:\s*(.*)$/.exec(line);
    if (m) {
      const refs: string[] = [];
      while (i < lines.length && /^\[\^(\w+)\]:/.test(lines[i])) {
        const r = /^\[\^(\w+)\]:\s*(.*)$/.exec(lines[i])!;
        refs.push(`<li id="ref-${r[1]}"><span class="mono" style="color:var(--accent-2)">[${r[1]}]</span> ${inline(r[2])}</li>`);
        i++;
      }
      out.push(`<ol class="refs" style="list-style:none;padding-left:0">${refs.join('')}</ol>`);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\||```|\$\$|\s*[-*]\s|\s*\d+\.\s|\[\^\w+\]:)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return { html: out.join('\n'), toc };
}

export function Markdown({ source, className = 'article' }: { source: string; className?: string }) {
  const { html } = useMemo(() => renderMarkdown(source), [source]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
