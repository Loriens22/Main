import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ThreadId } from '@ornight/protocol';
import { SPRING, useReducedMotion } from '@ornight/glass';
import { PermissionPrompt } from '@/review';
import { useOrnight } from '@/state/store';
import { useMessages, usePendingPermissions } from '@/state/selectors';
import { ArrowDownIcon } from '../shell/icons';
import { MessageView } from './MessageView';
import './Conversation.css';

/** How close to the bottom still counts as "following the stream", in px. */
const STICK_THRESHOLD = 96;

export interface ConversationProps {
  threadId: ThreadId;
}

/**
 * The message stream.
 *
 * The one thing that has to be right here is autoscroll. It sticks to the
 * bottom only while the operator is already there; the moment they scroll up
 * to read something, the stream stops yanking them back and a "jump to latest"
 * pill takes over. Getting this wrong is the most-felt bug in a chat UI.
 */
export function Conversation({ threadId }: ConversationProps) {
  const messages = useMessages(threadId);
  const permissions = usePendingPermissions(threadId);
  const showReasoning = useOrnight((s) => s.showReasoning);
  const reducedMotion = useReducedMotion();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  /* `stick` drives the pill; `stickRef` is read from layout effects and
   * observers that must not wait for a re-render. */
  const stickRef = useRef(true);
  const [stick, setStick] = useState(true);
  const [unread, setUnread] = useState(0);
  const countRef = useRef(messages.length);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const setStickState = useCallback((next: boolean) => {
    if (stickRef.current === next) return;
    stickRef.current = next;
    setStick(next);
    if (next) setUnread(0);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickState(distance <= STICK_THRESHOLD);
  }, [setStickState]);

  /* Land at the bottom when a thread opens. */
  useLayoutEffect(() => {
    stickRef.current = true;
    setStick(true);
    setUnread(0);
    countRef.current = messages.length;
    scrollToBottom(false);
    // Only on thread change: `messages` is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  /* Follow new content while stuck to the bottom. */
  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom(false);
  }, [messages, scrollToBottom]);

  /*
   * Deltas grow the last message without changing the message count, and code
   * blocks and tool cards reflow after they mount. A ResizeObserver on the
   * content catches both without polling.
   */
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) scrollToBottom(false);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  /* Count what arrived while the operator was reading further up. */
  useEffect(() => {
    const delta = messages.length - countRef.current;
    countRef.current = messages.length;
    if (delta > 0 && !stickRef.current) setUnread((value) => value + delta);
  }, [messages.length]);

  const jump = useCallback(() => {
    setStickState(true);
    scrollToBottom(!reducedMotion);
  }, [reducedMotion, scrollToBottom, setStickState]);

  return (
    <div className="on-chat-conversation">
      <div className="on-chat-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="on-chat-stream" ref={contentRef}>
          {messages.length === 0 ? (
            <p className="on-chat-stream-empty">No messages yet — say something below.</p>
          ) : (
            messages.map((message) => (
              <MessageView key={message.id} message={message} showReasoning={showReasoning} />
            ))
          )}
        </div>
      </div>

      <div className="on-chat-jump-slot">
        <AnimatePresence initial={false}>
          {!stick ? (
            <motion.button
              type="button"
              className="on-chat-jump"
              onClick={jump}
              initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
              transition={reducedMotion ? { duration: 0 } : SPRING.snappy}
            >
              <ArrowDownIcon size={15} />
              {unread > 0 ? `${unread} new` : 'Jump to latest'}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      {permissions.length > 0 ? (
        <div className="on-chat-permissions">
          {permissions.map((request) => (
            <PermissionPrompt key={request.id} request={request} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
