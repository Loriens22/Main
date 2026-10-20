import { KeepAwake } from '@capacitor-community/keep-awake';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Glass } from '@/glass/Glass';
import { haptic, isNative } from '@/lib/platform';
import { MascotAnchor, useMascot } from '@/mascot/MascotLayer';
import { loadThread, navigate, goHome, setCallChat, toast, useStore } from '@/state/store';
import { VoiceCallClient, type CallState } from '@/voice/callClient';

const STATE_LABEL: Record<CallState, string> = {
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Thinking…',
  working: 'Working on it',
  speaking: 'Speaking',
  ended: 'Call ended',
  error: 'Something went wrong',
};

/** Full-screen two-way voice call with Maverick, driving the same OpenCode session as the chat. */
export function Call() {
  const chatId = useStore((s) => s.callChatId);
  return <AnimatePresence>{chatId && <CallInner key="call" chatId={chatId} />}</AnimatePresence>;
}

function CallInner({ chatId: initialChat }: { chatId: string }) {
  const settings = useStore((s) => s.settings);
  const [chatId, setChatId] = useState(initialChat);
  const chat = useStore((s) => s.chats[chatId]);
  const [state, setState] = useState<CallState>('connecting');
  const [detail, setDetail] = useState<string | undefined>('Starting microphone…');
  const [partial, setPartial] = useState('');
  const [you, setYou] = useState('');
  const [said, setSaid] = useState('');
  const [acts, setActs] = useState<{ label: string; ok?: boolean; at: number }[]>([]);
  const [muted, setMuted] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const client = useRef<VoiceCallClient | null>(null);
  const mascot = useMascot();
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const c = new VoiceCallClient(
      initialChat,
      {
        onState: (s, d) => {
          setState(s);
          setDetail(d);
          mascot.setEmotion('maverick', s === 'listening' ? 'listening' : s === 'thinking' ? 'thinking' : s === 'working' ? 'working' : s === 'speaking' ? 'speaking' : 'idle');
          mascot.setEmotion('sparky', s === 'working' ? 'working' : s === 'thinking' ? 'thinking' : 'idle');
        },
        onPartial: (t) => setPartial(t),
        onFinal: (t) => {
          setYou(t);
          setPartial('');
          setSaid('');
          haptic.tap();
        },
        onAssistant: (t) => setSaid((cur) => (cur ? `${cur} ${t}` : t).slice(-420)),
        onActivity: (a) => {
          setActs((cur) => [...cur.slice(-2), { label: a.label, ok: a.ok, at: Date.now() }]);
          if (a.kind === 'test-result' || a.kind === 'build-result') {
            mascot.react('maverick', a.ok ? 'celebrate' : 'shake');
            mascot.setEmotion('sparky', a.ok ? 'celebrate' : 'error', { durationMs: 2500 });
          }
        },
        onChat: (id) => {
          setChatId(id);
          setCallChat(id);
        },
        onError: (m, fatal) => {
          if (fatal) {
            setState('error');
            setDetail(m);
          } else toast(m, 'error');
        },
        onBargeIn: () => {
          setSaid('');
          mascot.setEmotion('maverick', 'listening');
        },
      },
      { voice: settings?.voice.voice, speed: settings?.voice.speed },
    );
    client.current = c;
    c.start().catch((e) => {
      setState('error');
      setDetail(/denied|NotAllowed/i.test(String(e?.name ?? e?.message)) ? 'Microphone permission was denied. Allow it in system settings.' : (e as Error).message);
    });
    if (isNative) void KeepAwake.keepAwake().catch(() => undefined);
    let raf = 0;
    const loop = () => {
      const lv = c.levels();
      mascot.setSpeaking('maverick', lv.speaking);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      c.end();
      mascot.setSpeaking('maverick', 0);
      mascot.setEmotion('maverick', 'idle');
      mascot.setEmotion('sparky', 'idle');
      if (isNative) void KeepAwake.allowSleep().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChat]);

  const hangUp = () => {
    haptic.medium();
    setCallChat(null);
    void loadThread(chatId);
    if (chatId !== initialChat) {
      goHome();
      navigate({ name: 'chat', chatId });
    }
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <motion.div className="call" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.35 }}>
      <div className="call__top">
        <div className="call__name">Maverick</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {chat?.projectName ?? ''} · {mm}:{ss}
        </div>
        <div className="call__state">
          {(state === 'thinking' || state === 'working' || state === 'connecting') && <span className="spinner" />}
          {state === 'listening' && (
            <span className="dots" style={{ color: 'var(--ok)' }}>
              <i />
              <i />
              <i />
            </span>
          )}
          {detail && state !== 'listening' && state !== 'speaking' ? detail : STATE_LABEL[state]}
        </div>
      </div>

      <div className="call__stage" onClick={() => state === 'speaking' && client.current?.interrupt()}>
        <MascotAnchor id="maverick" size={200} />
        <div className="call__captions selectable">
          {(partial || you) && <span className="you">“{partial || you}”</span>}
          {said}
          {!partial && !you && !said && state === 'listening' && <span className="muted" style={{ fontWeight: 450, fontSize: 14 }}>Say something like “Create a new project called weather app” or “Run the tests and fix what fails”.</span>}
        </div>
        <div className="call__activity">
          <AnimatePresence initial={false}>
            {acts.map((a) => (
              <motion.div key={a.at} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="delegation" style={{ margin: 0 }}>
                <Icon name={a.ok === false ? 'x' : a.ok ? 'check' : 'bolt'} size={11} style={{ color: a.ok === false ? 'var(--danger)' : a.ok ? 'var(--ok)' : 'var(--accent)' }} />
                {a.label.replace(/`/g, '')}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {typing && (
        <Glass className="composer" radius={20} refract style={{ width: '100%', maxWidth: 520, marginBottom: 12, display: 'flex', gap: 6, padding: 4 }}>
          <input
            className="composer__input"
            autoFocus
            value={typed}
            placeholder="Type instead of speaking…"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed.trim()) {
                client.current?.sendText(typed.trim());
                setYou(typed.trim());
                setTyped('');
                setTyping(false);
              }
            }}
          />
        </Glass>
      )}

      <div className="call__controls">
        <Glass as="button" className={`call__btn${muted ? ' call__btn--on' : ''}`} radius={999} refract interactive onClick={() => (setMuted(!muted), client.current?.setMuted(!muted), haptic.tap())} aria-label={muted ? 'Unmute' : 'Mute'}>
          <Icon name={muted ? 'micOff' : 'mic'} size={21} />
        </Glass>
        <Glass as="button" className="call__btn call__btn--end" radius={999} variant="danger" interactive onClick={hangUp} aria-label="End call">
          <Icon name="phoneOff" size={24} />
        </Glass>
        <Glass as="button" className={`call__btn${typing ? ' call__btn--on' : ''}`} radius={999} refract interactive onClick={() => setTyping((v) => !v)} aria-label="Type a message">
          <Icon name="edit" size={19} />
        </Glass>
      </div>
      {state === 'speaking' && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          Tap Maverick or just start talking to interrupt
        </div>
      )}
    </motion.div>
  );
}
