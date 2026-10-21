import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PermissionCard, QuestionCard, TaskBoard, TodoCard } from '@/components/chat/Cards';
import { Composer } from '@/components/chat/Composer';
import { buildTimeline, DaySeparator, MessageView } from '@/components/chat/MessageList';
import { Icon } from '@/components/Icon';
import { ModelPicker } from '@/components/ModelPicker';
import { Glass } from '@/glass/Glass';
import { haptic } from '@/lib/platform';
import type { Attachment, ModelInfo } from '@/lib/types';
import { MascotAnchor } from '@/mascot/MascotLayer';
import { abortChat, goBack, loadThread, openSheet, patchChat, sendMessage, setCallChat, toast, useStore, type Thread } from '@/state/store';

const EMPTY: Thread = { loaded: false, loading: true, kind: 'single', msgs: {}, todos: [], status: 'idle', permissions: [], questions: [], activities: [] };

export function ChatScreen({ chatId }: { chatId: string }) {
  const chat = useStore((s) => s.chats[chatId]);
  const thread = useStore((s) => s.threads[chatId]) ?? EMPTY;
  const catalog = useStore((s) => s.catalog);
  const [picker, setPicker] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    void loadThread(chatId);
  }, [chatId]);

  const model: ModelInfo | undefined = catalog?.models.find((m) => m.id === chat?.model);
  const busy = thread.status === 'busy' || thread.status === 'retry' || chat?.status === 'busy';
  const timeline = useMemo(() => buildTimeline(thread), [thread]);
  const lastAssistantId = useMemo(() => [...timeline].reverse().find((i) => i.kind === 'msg' && i.msg?.info.role === 'assistant')?.key, [timeline]);
  const lastUserIdx = useMemo(() => {
    for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i].kind === 'msg' && timeline[i].msg?.info.role === 'user') return i;
    return -1;
  }, [timeline]);

  // Keep pinned to the bottom while content streams in, unless the user scrolled up.
  const contentKey = `${timeline.length}:${thread.permissions.length}:${thread.questions.length}:${JSON.stringify(timeline[timeline.length - 1]?.msg?.order.length ?? 0)}:${Object.values(timeline[timeline.length - 1]?.msg?.parts ?? {}).reduce((n: number, p: any) => n + (p.text?.length ?? 0), 0)}`;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [contentKey, thread.loaded]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    atBottom.current = near;
    setShowJump(!near);
  };
  const jump = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const onSend = useCallback(
    async (text: string, attachments: Attachment[], opts: { agent: 'build' | 'plan'; targetAgentId?: string }) => {
      atBottom.current = true;
      try {
        await sendMessage(chatId, { text, attachments: attachments.map(({ mime, filename, dataUrl }) => ({ mime, filename, dataUrl })), agent: opts.agent, targetAgentId: opts.targetAgentId });
        return true;
      } catch (e) {
        haptic.error();
        toast((e as Error).message, 'error', 5000);
        return false;
      }
    },
    [chatId],
  );

  // iOS-style back gesture: swipe right from the left screen edge.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const edgeSwipe = {
    onPointerDown: (e: React.PointerEvent) => {
      swipe.current = e.clientX < 26 ? { x: e.clientX, y: e.clientY } : null;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s0 = swipe.current;
      if (!s0) return;
      if (Math.abs(e.clientY - s0.y) > 60) swipe.current = null;
      else if (e.clientX - s0.x > 80) {
        swipe.current = null;
        haptic.tap();
        goBack();
      }
    },
    onPointerUp: () => (swipe.current = null),
  };

  const lastUserText = useMemo(() => {
    for (let i = timeline.length - 1; i >= 0; i--) {
      const m = timeline[i].msg;
      if (m?.info.role === 'user') return m.order.map((id) => m.parts[id]).filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('\n');
      if (timeline[i].user) return timeline[i].user!.text;
    }
    return '';
  }, [timeline]);

  if (!chat) {
    return (
      <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="empty">
          <h2>Chat not found</h2>
          <button className="btn" onClick={goBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const latest = thread.activities[thread.activities.length - 1];
  const statusText = thread.permissions.length
    ? 'Waiting for your approval'
    : thread.status === 'retry'
      ? `Model busy — ${thread.retry?.message?.slice(0, 60) ?? 'retrying'}`
      : busy
        ? latest && Date.now() - latest.at < 120_000
          ? `${latest.label}…`
          : 'Thinking…'
        : chat.kind === 'group'
          ? `${chat.projectName} · ${chat.agents?.length ?? 0} agents`
          : chat.projectName;
  const activeRun = chat.kind === 'group' ? [...(thread.runs ?? [])].reverse().find((r) => r) : undefined;

  return (
    <div className="screen" {...edgeSwipe}>
      <header className="chat-head">
        <Glass as="button" className="circle-btn" radius={999} refract interactive onClick={() => openSheet('chat-menu', { chatId })} aria-label="Chat menu">
          <Icon name="menu" size={18} stroke={2.2} />
        </Glass>
        <div className="chat-head__center">
          <MascotAnchor id="maverick" size={64} />
          <Glass className="name-capsule" radius={999} refract blur={20} interactive onClick={goBack} role="button" aria-label="Back to chats">
            <span className="name-capsule__text">{chat.kind === 'group' ? chat.title : 'Maverick'}</span>
          </Glass>
          <div className={`head-status${busy ? ' head-status--busy' : ''}`}>
            {busy && <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.6 }} />}
            {statusText}
          </div>
        </div>
        <Glass as="button" className="circle-btn" radius={999} refract interactive onClick={() => (haptic.medium(), setCallChat(chatId))} aria-label="Start voice call">
          <Icon name="phone" size={17} />
        </Glass>
      </header>

      <div className="scroll" ref={scroller} onScroll={onScroll} style={{ paddingTop: 'calc(var(--safe-top) + 140px)' }}>
        <div className="messages content-max">
          {activeRun && <TaskBoard run={activeRun} agents={thread.agents ?? chat.agents ?? []} />}
          {thread.loading && !thread.loaded && (
            <div className="empty">
              <span className="spinner" />
            </div>
          )}
          {thread.error && (
            <div className="banner banner--err">
              <Icon name="wifiOff" size={15} /> <span style={{ flex: 1 }}>{thread.error}</span>
              <button className="btn btn--sm" onClick={() => loadThread(chatId)}>
                Retry
              </button>
            </div>
          )}
          {thread.loaded && timeline.length === 0 && <EmptyChat kind={chat.kind} onPick={(t) => onSend(t, [], { agent: 'build' })} />}
          {timeline.map((item, i) => {
            const prev = timeline[i - 1];
            const sep = !prev || item.at - prev.at > 30 * 60_000 || new Date(item.at).toDateString() !== new Date(prev.at).toDateString();
            let node: React.ReactNode = null;
            if (item.kind === 'msg' && item.msg) {
              const m = item.msg;
              const agent = thread.agents?.find((a) => a.id === m.agentId) ?? chat.agents?.find((a) => a.id === m.agentId);
              const prevAgent = prev?.kind === 'msg' ? prev.msg?.agentId : undefined;
              const seen = m.info.role === 'user' && i === lastUserIdx ? (m.info.pending ? 'sending' : timeline.slice(i + 1).some((x) => x.msg?.info.role === 'assistant') ? 'seen' : 'sent') : undefined;
              node = (
                <MessageView
                  msg={m}
                  isLastAssistant={item.key === lastAssistantId}
                  busy={busy}
                  agent={agent}
                  showAgentTag={chat.kind === 'group' && (prevAgent !== m.agentId || prev?.kind !== 'msg')}
                  hidePlanJson={chat.kind === 'group'}
                  seen={seen}
                  onRetry={m.info.error && item.key === lastAssistantId && lastUserText ? () => onSend(lastUserText, [], { agent: 'build' }) : undefined}
                  onSwitchModel={m.info.error && chat.kind === 'single' ? () => setPicker(true) : undefined}
                />
              );
            } else if (item.kind === 'group-user' && item.user) {
              const target = chat.agents?.find((a) => a.id === item.user!.targetAgentId);
              node = (
                <div className="msg-row msg-row--me">
                  <div className="bubble bubble--me selectable" style={{ whiteSpace: 'pre-wrap' }}>
                    {target && <b>@{target.name} </b>}
                    {item.user.text.replace(/^@\S+\s*/, '')}
                  </div>
                </div>
              );
            } else if (item.kind === 'delegation') {
              node = (
                <div className="delegation">
                  <Icon name="arrowRight" size={12} /> {item.text}
                </div>
              );
            }
            return (
              <Fragment key={item.key}>
                {sep && <DaySeparator at={item.at} />}
                <div style={{ display: 'flex', flexDirection: 'column', contentVisibility: i < timeline.length - 12 ? 'auto' : undefined }}>{node}</div>
              </Fragment>
            );
          })}
          {chat.kind === 'single' && thread.todos.length > 0 && <TodoCard todos={thread.todos} />}
          {busy && !thread.permissions.length && <TypingIndicator label={latest && Date.now() - latest.at < 120_000 ? latest.label : undefined} />}
          {thread.status === 'retry' && (
            <div className="banner banner--warn">
              <Icon name="refresh" size={15} />
              <span style={{ flex: 1 }}>OpenCode is retrying the model request automatically. {thread.retry?.message}</span>
              {chat.kind === 'single' && (
                <button className="btn btn--sm" onClick={() => setPicker(true)}>
                  Switch model
                </button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {thread.permissions.map((p) => (
              <PermissionCard key={p.id} chatId={chatId} req={p} agent={chat.agents?.find((a) => a.id === p.agentId)} />
            ))}
            {thread.questions.map((q) => (
              <QuestionCard key={q.id} chatId={chatId} req={q} />
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showJump && (
          <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} style={{ position: 'absolute', right: 0, bottom: 'calc(var(--safe-bottom) + 132px)', zIndex: 15 }}>
            <Glass as="button" className="jump-btn" radius={999} refract interactive onClick={jump} aria-label="Scroll to latest" style={{ position: 'relative', right: 'max(14px, calc((100vw - 720px) / 2 + 14px))' }}>
              <Icon name="chevronDown" size={17} />
            </Glass>
          </motion.div>
        )}
      </AnimatePresence>

      <Composer
        chat={chat}
        busy={busy}
        model={model}
        agents={chat.agents}
        onSend={onSend}
        onStop={() => {
          haptic.medium();
          void abortChat(chatId).catch((e) => toast(e.message, 'error'));
        }}
        onPickModel={() => setPicker(true)}
      />

      <ModelPicker
        open={picker}
        onClose={() => setPicker(false)}
        value={chat.model}
        onPick={(m, allowPaid) => {
          void patchChat(chatId, { model: m.id, ...(allowPaid ? { allowPaid: true } : {}) })
            .then(() => toast(`Using ${m.name}${m.free ? ' (free)' : ' (paid)'}`, 'ok'))
            .catch((e) => toast(e.message, 'error'));
        }}
      />
    </div>
  );
}

function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="msg-row msg-row--ai">
      <div className="typing">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        {label && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.replace(/`/g, '')}</span>}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Create a small Express API with a /health route and a test',
  'Build a Python CLI that converts CSV to JSON, then run it',
  'Set up a Vite + React app with a counter and a passing test',
  'Explain this project’s structure and suggest improvements',
];
const TEAM_SUGGESTIONS = ['Build a to-do REST API in Node with tests, and review it', 'Create a Python package with a function, docs and pytest tests'];

function EmptyChat({ kind, onPick }: { kind: 'single' | 'group'; onPick: (t: string) => void }) {
  const list = kind === 'group' ? TEAM_SUGGESTIONS : SUGGESTIONS;
  return (
    <div style={{ padding: '20px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="muted" style={{ textAlign: 'center', marginBottom: 8, fontSize: 13 }}>
        {kind === 'group' ? 'Give your team a goal. The lead plans, delegates, and reports back.' : 'Ask for real code. Maverick edits files, runs commands and tests on your server.'}
      </div>
      {list.map((s) => (
        <button key={s} className="option" onClick={() => onPick(s)} style={{ background: 'var(--s1)', boxShadow: 'inset 0 0 0 0.5px var(--line-2)' }}>
          <Icon name="sparkle" size={15} style={{ color: 'var(--t3)' }} />
          <div className="option__main" style={{ color: 'var(--t2)' }}>
            {s}
          </div>
        </button>
      ))}
    </div>
  );
}
