import { Fragment, memo, useMemo, useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon } from '../shell/icons';
import { parseMarkdown, type Block, type Inline } from './markdown';
import './Markdown.css';

/* -------------------------------------------------------------------------- */
/* Inline                                                                     */
/* -------------------------------------------------------------------------- */

function renderInline(nodes: Inline[], keyPrefix = 'i'): ReactNode {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.kind) {
      case 'text':
        return <Fragment key={key}>{node.text}</Fragment>;
      case 'code':
        return (
          <code key={key} className="on-chat-icode">
            {node.text}
          </code>
        );
      case 'strong':
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case 'em':
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case 'strike':
        return <del key={key}>{renderInline(node.children, key)}</del>;
      case 'link':
        return (
          <a key={key} href={node.href} target="_blank" rel="noreferrer noopener">
            {renderInline(node.children, key)}
          </a>
        );
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Code blocks                                                                */
/* -------------------------------------------------------------------------- */

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path below */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function CodeBlock({ lang, text }: { lang: string | null; text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="on-chat-code">
      <div className="on-chat-code-head">
        <span className="on-chat-code-lang">{lang ?? 'text'}</span>
        <button
          type="button"
          className="on-chat-code-copy"
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={() => {
            void writeClipboard(text).then((ok) => {
              if (!ok) return;
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* The only element allowed to scroll sideways. */}
      <div className="on-chat-code-scroll">
        <pre>
          <code>{text}</code>
        </pre>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

function renderBlocks(blocks: Block[], keyPrefix = 'b'): ReactNode {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (block.kind) {
      case 'heading': {
        const Tag = `h${block.level}` as 'h1';
        return <Tag key={key}>{renderInline(block.inline, key)}</Tag>;
      }
      case 'paragraph':
        return <p key={key}>{renderInline(block.inline, key)}</p>;
      case 'code':
        return <CodeBlock key={key} lang={block.lang} text={block.text} />;
      case 'rule':
        return <hr key={key} />;
      case 'quote':
        return <blockquote key={key}>{renderBlocks(block.blocks, key)}</blockquote>;
      case 'list': {
        const items = block.items.map((item, itemIndex) => (
          <li key={`${key}-${itemIndex}`} data-depth={item.depth}>
            {renderInline(item.inline, `${key}-${itemIndex}`)}
          </li>
        ));
        return block.ordered ? (
          <ol key={key} start={block.start}>
            {items}
          </ol>
        ) : (
          <ul key={key}>{items}</ul>
        );
      }
    }
  });
}

export interface MarkdownProps {
  text: string;
  className?: string;
}

/**
 * Renders model output as React elements. Never as HTML — see `markdown.ts`
 * for why that matters.
 */
export const Markdown = memo(function Markdown({ text, className }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className={className ? `on-chat-md ${className}` : 'on-chat-md'}>{renderBlocks(blocks)}</div>;
});
