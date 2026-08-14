import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PermissionPrompt } from '@/review';
import { useOrnight } from '@/state/store';
import { useMessages, usePendingPermissions, useThread } from '@/state/selectors';
import { MessageView } from './MessageView';
import './Conversation.css';

/** How close to the bottom still counts as "following along", in px. */
const STICK_THRESHOLD = 96;

export interface ConversationProps {
  threadId: string;
}

/**
 * The message stream.
 *
 * The one behaviour that matters more than any other here is autoscroll: it
 * must follow a streaming reply while you are at the bottom, and it must stop
 * dead the moment you scroll up to read something. Getting that wrong makes a
 * chat feel broken in a way no amount of visual polish recovers.
 */
export function Conversation({ threadId }: ConversationProps) {
  const messages = useMessages(threadId);
  const permissions = usePendingPermissions(threadId);
  const thread = useThread(threadId);
  const showReasoning = useOrnight((s) => s.showReasoning);

  const scrollerRef = useRef<HTMLDivElement>(null);
  // Ref rather than state: the scroll handler runs on every frame of a flick,
  // and re-rendering the whole stream from it would drop frames.
  const stickingRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const sticking = distance <= STICK_THRESHOLD;
    stickingRef.current = sticking;
    setShowJump((current) => (current === !sticking ? current : !sticking));
  }, []);

  // Jump to the bottom when the thread changes, before paint, so switching
  // threads never shows the top of a long history for a frame.
  useLayoutEffect(() => {
    stickingRef.current = true;
    setShowJump(false);
    scrollToBottom(false);
  }, [threadId, scrollToBottom]);

  // Follow new content only while the operator is following it.
  useEffect(() => {
    if (stickingRef.current) scrollToBottom(false);
  }, [messages, permissions.length, scrollToBottom]);

  return (
    <div className="on-chat-conversation">
      <div className="on-chat-scroll" ref={scrollerRef} onScroll={onScroll}>
        <div className="on-chat-stream">
          {messages.map((message) => (
            <MessageView key={message.id} message={message} showReasoning={showReasoning} />
          ))}

          {thread?.status === 'running' && messages[messages.length - 1]?.role === 'user' && (
            <div className="on-chat-thinking" aria-live="polite">
              <span className="on-chat-thinking-dot" aria-hidden="true" />
              Thinking…
            </div>
          )}

          {thread?.error && (
            <div className="on-chat-error" role="alert">
              <strong>The agent stopped.</strong>
              <p>{thread.error}</p>
            </div>
          )}

          {/* Pinned last so it sits directly above the composer, where a thumb
              already is. Never collapsed, never auto-dismissed. */}
          {permissions.length > 0 && permissions[0] && (
            <div className="on-chat-permissions">
              <PermissionPrompt request={permissions[0]} />
            </div>
          )}
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          className="on-chat-jump"
          onClick={() => {
            stickingRef.current = true;
            setShowJump(false);
            scrollToBottom(true);
          }}
        >
          Jump to latest ↓
        </button>
      )}
    </div>
  );
}
