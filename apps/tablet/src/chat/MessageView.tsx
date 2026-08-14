import { memo, useState } from 'react';
import type { Message, MessagePart } from '@ornight/protocol';
import { ToolCallCard } from '@/review';
import { ChevronRightIcon } from '../shell/icons';
import { Markdown } from './Markdown';

function Reasoning({ text, defaultOpen }: { text: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="on-chat-reason" data-open={open}>
      <button
        type="button"
        className="on-chat-reason-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="on-chat-reason-chevron" aria-hidden="true">
          <ChevronRightIcon size={14} />
        </span>
        Thought
      </button>
      {open ? <div className="on-chat-reason-body">{text}</div> : null}
    </div>
  );
}

function isLastTextPart(parts: MessagePart[], index: number): boolean {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i]?.kind === 'text') return i === index;
  }
  return false;
}

export interface MessageViewProps {
  message: Message;
  /** Store flag: when on, reasoning opens expanded instead of collapsed. */
  showReasoning: boolean;
}

/**
 * One message. Memoised on identity: the store's folding helpers return the
 * same object for every untouched message, so a streaming delta re-renders
 * exactly one of these rather than the whole timeline.
 */
export const MessageView = memo(function MessageView({ message, showReasoning }: MessageViewProps) {
  const { role, parts, streaming } = message;

  if (role === 'system') {
    const text = parts.map((part) => (part.kind === 'text' ? part.text : '')).join('');
    return (
      <div className="on-chat-msg" data-role="system">
        <div className="on-chat-system">{text}</div>
      </div>
    );
  }

  const body = parts.map((part, index) => {
    const key = `${message.id}:${index}`;
    switch (part.kind) {
      case 'text':
        return (
          <div className="on-chat-part" key={key}>
            <Markdown text={part.text} />
            {streaming && isLastTextPart(parts, index) ? (
              <span className="on-chat-caret" aria-hidden="true" />
            ) : null}
          </div>
        );
      case 'reasoning':
        return (
          <div className="on-chat-part" key={key}>
            <Reasoning text={part.text} defaultOpen={showReasoning && !part.collapsed} />
          </div>
        );
      case 'tool':
        return (
          <div className="on-chat-part" key={key}>
            <ToolCallCard call={part.call} />
          </div>
        );
    }
  });

  const hasBody = parts.length > 0;

  return (
    <div className="on-chat-msg" data-role={role} data-streaming={streaming}>
      <div className={role === 'user' ? 'on-chat-user' : 'on-chat-assistant'}>
        {hasBody ? (
          body
        ) : streaming ? (
          <span className="on-chat-caret" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
});
