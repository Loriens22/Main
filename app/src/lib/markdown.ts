import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Marked, Renderer } from 'marked';

const langs: Record<string, any> = { bash, css, diff, go, java, javascript, json, kotlin, markdown, python, rust, sql, swift, typescript, xml, yaml };
for (const [k, v] of Object.entries(langs)) hljs.registerLanguage(k, v);
const alias: Record<string, string> = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', sh: 'bash', shell: 'bash', zsh: 'bash', py: 'python', html: 'xml', vue: 'xml', yml: 'yaml', md: 'markdown', rs: 'rust', kt: 'kotlin', console: 'bash' };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function highlight(code: string, lang?: string): string {
  const l = lang ? alias[lang.toLowerCase()] ?? lang.toLowerCase() : '';
  try {
    if (l && hljs.getLanguage(l)) return hljs.highlight(code, { language: l, ignoreIllegals: true }).value;
  } catch {
    /* fall through */
  }
  return escapeHtml(code);
}

const renderer = new Renderer();
renderer.code = ({ text, lang }) => {
  const language = (lang || '').split(/\s/)[0];
  const body = highlight(text, language);
  return `<div class="code"><div class="code__bar"><span>${escapeHtml(language || 'code')}</span><button class="code__copy" data-copy="${encodeURIComponent(text)}">Copy</button></div><pre><code class="hljs">${body}</code></pre></div>`;
};
renderer.link = ({ href, text }) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;

const md = new Marked({ gfm: true, breaks: true, renderer });

/** Renders streaming markdown safely; unterminated code fences are closed so partial output looks right. */
export function renderMarkdown(src: string, streaming = false): string {
  let text = src;
  if (streaming) {
    const fences = (text.match(/```/g) || []).length;
    if (fences % 2 === 1) text += '\n```';
  }
  const html = md.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'data-copy'] });
}
