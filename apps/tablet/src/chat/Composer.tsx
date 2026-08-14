import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { GlassIconButton } from '@ornight/glass';
import { threadIsBusy } from '@ornight/protocol';
import { SendIcon, StopIcon } from '../shell/icons';
import { useOrnight } from '@/state/store';
import { useThread } from '@/state/selectors';
import './Composer.css';

/** Quick starts, offered only on an empty draft so they never crowd real input. */
const CHIPS = [
  'Explain what this thread changed',
  'Run the tests',
  'Review your own diff for bugs',
];

export interface ComposerProps {
  threadId: string;
}

export function Composer({ threadId }: ComposerProps) {
  const thread = useThread(threadId);
  const draft = useOrnight((s) => s.drafts[threadId] ?? '');
  const setDraft = useOrnight((s) => s.setDraft);
  const sendMessage = useOrnight((s) => s.sendMessage);
  const interrupt = useOrnight((s) => s.interrupt);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = thread ? threadIsBusy(thread.status) : false;

  // Grow with the content, up to a share of the viewport — past that the
  // textarea scrolls internally rather than eating the conversation.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = Math.round(window.innerHeight * 0.4);
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [draft]);

  // Refocus when the thread changes only if a draft is already in progress;
  // otherwise opening a thread would pop the on-screen keyboard unbidden.
  useEffect(() => {
    if (draft) textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- thread switch only
  }, [threadId]);

  const submit = useCallback(() => {
    if (!draft.trim() || busy) return;
    sendMessage(threadId, draft);
    textareaRef.current?.focus();
  }, [busy, draft, sendMessage, threadId]);

  /*
   * Enter sends on a hardware keyboard and inserts a newline on a touch one.
   * `event.shiftKey` covers the explicit case either way. Detecting the input
   * device from the event itself beats a setting nobody will find: a soft
   * keyboard's Enter arrives with no modifier and a coarse pointer present.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return;
    const touchKeyboard = window.matchMedia('(pointer: coarse)').matches;
    if (event.shiftKey || (touchKeyboard && !event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="on-chat-composer">
      {!draft && !busy && (
        <div className="on-chat-chips">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="on-chat-chip"
              onClick={() => {
                setDraft(threadId, chip);
                textareaRef.current?.focus();
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <div className="on-chat-composer-bar">
        <textarea
          ref={textareaRef}
          className="on-chat-input"
          value={draft}
          onChange={(event) => setDraft(threadId, event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={busy ? 'Working… you can queue the next message' : 'Ask for a change…'}
          rows={1}
          aria-label="Message the agent"
        />

        {busy ? (
          <GlassIconButton
            label="Stop the agent"
            size="lg"
            className="on-chat-send on-chat-stop"
            onClick={() => interrupt(threadId)}
          >
            <StopIcon />
          </GlassIconButton>
        ) : (
          <GlassIconButton
            label="Send"
            size="lg"
            className="on-chat-send"
            disabled={!draft.trim()}
            onClick={submit}
          >
            <SendIcon />
          </GlassIconButton>
        )}
      </div>
    </div>
  );
}
