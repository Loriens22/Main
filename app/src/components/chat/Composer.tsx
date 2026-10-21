import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Glass } from '@/glass/Glass';
import { haptic } from '@/lib/platform';
import { toneDot } from '@/lib/tone';
import type { Agent, Attachment, Chat, ModelInfo } from '@/lib/types';
import { useStore } from '@/state/store';

const MAX_FILE = 6 * 1024 * 1024;

function readFile(f: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    if (f.size > MAX_FILE) return reject(new Error(`${f.name} is larger than 6 MB`));
    const r = new FileReader();
    r.onload = () => resolve({ mime: f.type || 'application/octet-stream', filename: f.name, dataUrl: String(r.result), size: f.size });
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(f);
  });
}

export function Composer({
  chat,
  busy,
  onSend,
  onStop,
  onPickModel,
  model,
  agents,
}: {
  chat: Chat;
  busy: boolean;
  onSend: (text: string, attachments: Attachment[], opts: { agent: 'build' | 'plan'; targetAgentId?: string }) => Promise<boolean>;
  onStop: () => void;
  onPickModel: () => void;
  model?: ModelInfo;
  agents?: Agent[];
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'build' | 'plan'>('build');
  const [target, setTarget] = useState<string | undefined>();
  const [error, setError] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const draftKey = `draft:${chat.id}`;

  useEffect(() => {
    try {
      setText(sessionStorage.getItem(draftKey) ?? '');
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(draftKey, text);
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    const el = ta.current;
    if (!el || expanded) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(168, el.scrollHeight)}px`;
  }, [text, expanded, draftKey]);

  // Sending while the agent works queues the message in OpenCode; with an empty box the button stops the run.
  const canSend = text.trim().length > 0 || files.length > 0;
  const send = async () => {
    if (!canSend) return;
    haptic.tap();
    const t = text;
    const f = files;
    setText('');
    setFiles([]);
    setExpanded(false);
    setError('');
    const ok = await onSend(t, f, { agent: mode, targetAgentId: target });
    if (!ok) {
      setText(t);
      setFiles(f);
    }
  };

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    try {
      const add = await Promise.all([...list].slice(0, 6).map(readFile));
      setFiles((cur) => [...cur, ...add].slice(0, 8));
      if (model && !model.caps.attachments && add.some((a) => a.mime.startsWith('image/'))) setError(`${model.name} may not read images. Pick a vision model to send pictures.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const conn = useStore((s) => s.conn);
  return (
    <div className="composer-wrap content-max">
      <Glass className={`composer${expanded ? ' composer--expanded' : ''}`} radius={22} refract blur={24}>
        {files.length > 0 && (
          <div className="attachments">
            {files.map((f, i) => (
              <div className="attachment" key={i}>
                {f.mime.startsWith('image/') ? <img src={f.dataUrl} alt={f.filename} /> : <span>{f.filename}</span>}
                <button onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${f.filename}`}>
                  <Icon name="close" size={10} stroke={3} />
                </button>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="muted" style={{ fontSize: 12, padding: '0 6px 6px', color: 'var(--warn)' }}>
            {error}
          </div>
        )}
        {chat.kind === 'group' && (
          // Who the message goes to gets its own row, so every teammate stays reachable.
          <div className="composer__chips composer__chips--targets">
            <button className="composer__chip" aria-pressed={!target} onClick={() => setTarget(undefined)}>
              <Icon name="users" size={12} /> <span>Whole team</span>
            </button>
            {agents?.map((a) => (
              <button key={a.id} className="composer__chip" aria-pressed={target === a.id} onClick={() => setTarget(target === a.id ? undefined : a.id)}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: toneDot(a.color) }} /> <span>@{a.name}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={ta}
          className="composer__input"
          rows={1}
          value={text}
          placeholder={chat.kind === 'group' ? (target ? `Message @${agents?.find((a) => a.id === target)?.name}` : 'Give the team a goal…') : busy ? 'Maverick is working…' : 'Ask Maverick anything…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              e.preventDefault();
              void send();
            }
          }}
          aria-label="Message"
        />
        <div className="composer__bar">
          <button className="composer__btn" onClick={() => fileInput.current?.click()} aria-label="Attach files">
            <Icon name="attach" size={18} />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept="image/*,.txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.pdf,.log,.yaml,.yml,.xml,.java,.kt,.swift,.go,.rs,.c,.cpp,.h,.sh"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="composer__chips">
            {chat.kind === 'single' && (
              <>
                <button className="composer__chip" onClick={onPickModel} aria-label="Choose model">
                  <Icon name="sparkle" size={12} />
                  <span>{model?.name ?? chat.model.split('/').pop()}</span>
                  {model && !model.free && <span style={{ color: 'var(--warn)', flex: 'none' }}>Paid</span>}
                  <Icon name="chevronDown" size={11} />
                </button>
                <button className="composer__chip" onClick={() => setMode((m) => (m === 'build' ? 'plan' : 'build'))} aria-label="Toggle plan mode" title="Plan mode reads and plans without editing files">
                  <Icon name={mode === 'build' ? 'bolt' : 'list'} size={12} />
                  <span>{mode === 'build' ? 'Build' : 'Plan only'}</span>
                </button>
              </>
            )}
            {conn !== 'online' && (
              <span className="composer__chip" style={{ color: 'var(--warn)' }}>
                <Icon name="wifiOff" size={12} /> <span>{conn === 'unauthorized' ? 'Signed out' : 'Reconnecting'}</span>
              </span>
            )}
          </div>
          {(text.split('\n').length > 2 || text.length > 120 || expanded) && (
            <button className="composer__btn" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? 'Collapse editor' : 'Expand editor'}>
              <Icon name={expanded ? 'collapse' : 'expand'} size={16} />
            </button>
          )}
          {busy && !canSend ? (
            <Glass as="button" className="composer__send" radius={999} interactive variant="danger" onClick={onStop} aria-label="Stop">
              <Icon name="stop" size={11} />
            </Glass>
          ) : (
            <Glass as="button" className="composer__send" radius={999} interactive variant="primary" onClick={send} disabled={!canSend} aria-label="Send">
              <Icon name="send" size={17} stroke={2.6} />
            </Glass>
          )}
        </div>
      </Glass>
    </div>
  );
}
