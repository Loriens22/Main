import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { Glass } from '@/glass/Glass';
import { timeAgo } from '@/lib/format';
import { haptic } from '@/lib/platform';
import type { Chat } from '@/lib/types';
import { MascotAnchor } from '@/mascot/MascotLayer';
import { deleteChat, navigate, openSheet, patchChat, setPrefs, toast, useStore } from '@/state/store';

export function Home() {
  const chats = useStore((s) => s.chats);
  const projects = useStore((s) => s.projects);
  const conn = useStore((s) => s.conn);
  const prefs = useStore((s) => s.prefs);
  const [q, setQ] = useState('');
  const [sortOpen, setSortOpen] = useState(false);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    let all = Object.values(chats).filter((c) => !c.archived);
    if (prefs.projectFilter) all = all.filter((c) => c.projectId === prefs.projectFilter);
    if (term) all = all.filter((c) => `${c.title} ${c.preview} ${c.projectName}`.toLowerCase().includes(term));
    const sorted = [...all].sort((a, b) => {
      if (prefs.sort === 'name') return a.title.localeCompare(b.title);
      if (prefs.sort === 'project') return a.projectName.localeCompare(b.projectName) || b.lastActivityAt - a.lastActivityAt;
      return b.lastActivityAt - a.lastActivityAt;
    });
    return { pinned: sorted.filter((c) => c.pinned), rest: sorted.filter((c) => !c.pinned) };
  }, [chats, q, prefs.sort, prefs.projectFilter]);

  const busyCount = Object.values(chats).filter((c) => c.status === 'busy').length;
  const groupsByProject = useMemo(() => {
    if (prefs.sort !== 'project') return null;
    const m = new Map<string, Chat[]>();
    for (const c of list.rest) m.set(c.projectName, [...(m.get(c.projectName) ?? []), c]);
    return [...m.entries()];
  }, [list.rest, prefs.sort]);

  const total = list.pinned.length + list.rest.length;

  return (
    <div className="screen">
      <div className="scroll" style={{ paddingBottom: 'calc(var(--safe-bottom) + 120px)' }}>
        <div className="content-max">
          <header className="home-head">
            <div>
              <h1 className="home-title">Chats</h1>
              <div className="home-sub">
                <span className={`conn-dot${conn === 'online' ? '' : ' conn-dot--off'}`} />
                {conn === 'online'
                  ? busyCount
                    ? `${busyCount} agent${busyCount > 1 ? 's' : ''} working`
                    : 'Connected to your OpenCode server'
                  : conn === 'reconnecting' || conn === 'connecting'
                    ? 'Waking up the server…'
                    : 'Offline'}
              </div>
            </div>
            <MascotAnchor id="maverick" size={78} />
          </header>

          <Glass className="searchbar" radius={999} refract blur={16}>
            <Icon name="search" size={19} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats and projects" aria-label="Search chats" enterKeyHint="search" />
            {q && (
              <button onClick={() => setQ('')} aria-label="Clear search">
                <Icon name="close" size={17} />
              </button>
            )}
          </Glass>

          <div className="filters">
            <Glass as="button" className={`chip${!prefs.projectFilter ? ' chip--active' : ''}`} radius={999} interactive onClick={() => setPrefs({ projectFilter: null })} variant={!prefs.projectFilter ? 'strong' : 'clear'}>
              All
            </Glass>
            {projects.map((p) => (
              <Glass
                key={p.id}
                as="button"
                className={`chip${prefs.projectFilter === p.id ? ' chip--active' : ''}`}
                radius={999}
                interactive
                variant={prefs.projectFilter === p.id ? 'strong' : 'clear'}
                onClick={() => setPrefs({ projectFilter: prefs.projectFilter === p.id ? null : p.id })}
              >
                <span className="dot" style={{ background: p.color }} />
                {p.name}
              </Glass>
            ))}
            <div style={{ flex: 1 }} />
            <Glass as="button" className="chip" radius={999} interactive variant="clear" onClick={() => setSortOpen(true)} aria-label="Sort chats">
              <Icon name="sort" size={16} />
              {prefs.sort === 'recent' ? 'Recent' : prefs.sort === 'name' ? 'Name' : 'Project'}
            </Glass>
          </div>

          {total === 0 && (
            <div className="empty">
              <h2>{q ? 'No matches' : 'Let’s build something'}</h2>
              <p>{q ? 'Try another search.' : 'Tap + to start a chat with Maverick, or assemble a whole team of agents.'}</p>
              {!q && (
                <Glass as="button" className="btn" variant="accent" radius={999} interactive onClick={() => openSheet('new-chat')} style={{ marginTop: 14 }}>
                  <Icon name="plus" size={20} /> New chat
                </Glass>
              )}
            </div>
          )}

          {list.pinned.length > 0 && (
            <>
              <div className="section-title">
                <Icon name="pin" size={14} /> Pinned
              </div>
              <Glass className="list" radius={24} blur={18}>
                <AnimatePresence initial={false}>
                  {list.pinned.map((c) => (
                    <ChatRow key={c.id} chat={c} />
                  ))}
                </AnimatePresence>
              </Glass>
            </>
          )}

          {groupsByProject
            ? groupsByProject.map(([name, items]) => (
                <div key={name}>
                  <div className="section-title">
                    <span className="dot" style={{ width: 8, height: 8, borderRadius: 4, background: items[0].projectColor, display: 'inline-block' }} /> {name}
                  </div>
                  <Glass className="list" radius={24} blur={18}>
                    {items.map((c) => (
                      <ChatRow key={c.id} chat={c} />
                    ))}
                  </Glass>
                </div>
              ))
            : list.rest.length > 0 && (
                <>
                  <div className="section-title">{list.pinned.length ? 'Recent' : 'All chats'}</div>
                  <Glass className="list" radius={24} blur={18}>
                    <AnimatePresence initial={false}>
                      {list.rest.map((c) => (
                        <ChatRow key={c.id} chat={c} />
                      ))}
                    </AnimatePresence>
                  </Glass>
                </>
              )}
        </div>
      </div>

      <SortSheet open={sortOpen} onClose={() => setSortOpen(false)} />
    </div>
  );
}

function SortSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sort = useStore((s) => s.prefs.sort);
  if (!open) return null;
  return createPortal(
    <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} style={{ display: 'grid', placeItems: 'center' }}>
      <Glass className="card" variant="strong" radius={26} refract onClick={(e) => e.stopPropagation()} style={{ width: 280 }}>
        <div className="card__title">Sort chats by</div>
        <div style={{ marginTop: 8 }}>
          {(['recent', 'name', 'project'] as const).map((s) => (
            <button
              key={s}
              className="option"
              aria-selected={sort === s}
              onClick={() => {
                haptic.tap();
                setPrefs({ sort: s });
                onClose();
              }}
            >
              <div className="option__main">
                <div className="option__title">{s === 'recent' ? 'Most recent' : s === 'name' ? 'Name' : 'Project'}</div>
              </div>
              {sort === s && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
      </Glass>
    </motion.div>,
    document.body,
  );
}

function ChatAvatar({ chat }: { chat: Chat }) {
  if (chat.kind === 'group') {
    const agents = (chat.agents ?? []).slice(0, 3);
    return (
      <div className="avatar__stack">
        {agents.map((a, i) => (
          <span key={a.id} style={{ background: a.color, left: i === 0 ? 0 : i === 1 ? 20 : 10, top: i === 2 ? 20 : i === 1 ? 6 : 0, zIndex: 3 - i }}>
            {a.name[0]}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="avatar avatar--star">
      <StarGlyph />
      <span className="avatar__badge" style={{ background: chat.projectColor }} />
    </div>
  );
}

export function StarGlyph({ size = 30 }: { size?: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i;
    const r = i % 2 === 0 ? 11 : 6.6;
    pts.push(`${12 + Math.cos(a) * r},${12 + Math.sin(a) * r}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points={pts.join(' ')} fill="rgba(255,255,255,0.92)" stroke="rgba(255,255,255,0.92)" strokeWidth="2.4" strokeLinejoin="round" />
      <ellipse cx="9.7" cy="11" rx="1.15" ry="1.6" fill="#0d1a33" />
      <ellipse cx="14.3" cy="11" rx="1.15" ry="1.6" fill="#0d1a33" />
      <path d="M6 6.2c2-2.6 9.6-3.2 12.4-.4-2.2-.2-9.6-.6-12.4.4Z" fill="#111" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function ChatRow({ chat }: { chat: Chat }) {
  const [dx, setDx] = useState(0);
  const [menu, setMenu] = useState(false);
  const start = useRef<{ x: number; y: number; t: number; dx: number; locked?: 'x' | 'y' } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), dx };
    moved.current = false;
    press.current = setTimeout(() => {
      if (!moved.current) {
        haptic.medium();
        setMenu(true);
      }
    }, 520);
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.locked && Math.hypot(mx, my) > 8) s.locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    if (Math.hypot(mx, my) > 6) {
      moved.current = true;
      if (press.current) clearTimeout(press.current);
    }
    if (s.locked === 'x') setDx(Math.max(-160, Math.min(0, s.dx + mx)));
  };
  const onUp = () => {
    if (press.current) clearTimeout(press.current);
    const s = start.current;
    start.current = null;
    if (s?.locked === 'x') setDx(dx < -70 ? -156 : 0);
  };
  const open = () => {
    if (moved.current || menu) return;
    if (dx !== 0) return setDx(0);
    haptic.tap();
    navigate({ name: 'chat', chatId: chat.id });
  };
  const togglePin = async () => {
    setDx(0);
    setMenu(false);
    await patchChat(chat.id, { pinned: !chat.pinned }).catch((e) => toast(e.message, 'error'));
  };
  const remove = async () => {
    setDx(0);
    setMenu(false);
    if (!confirm(`Delete “${chat.title}”? The project files stay on the server.`)) return;
    haptic.medium();
    await deleteChat(chat.id).catch((e) => toast(e.message, 'error'));
  };
  const busy = chat.status === 'busy' || chat.status === 'retry';
  return (
    <motion.div layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ position: 'relative', overflow: 'hidden' }}>
      {dx < 0 && <div className="swipe-actions">
        <button style={{ background: '#6366f1' }} onClick={togglePin}>
          <Icon name="pin" size={20} />
          {chat.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button style={{ background: 'var(--danger)' }} onClick={remove}>
          <Icon name="trash" size={20} />
          Delete
        </button>
      </div>}
      <button
        className="row"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform .35s var(--ease-spring)' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={open}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(true);
        }}
      >
        <ChatAvatar chat={chat} />
        <div className="row__main">
          <div className="row__top">
            <span className="row__title">{chat.title}</span>
            <span className="row__time">{timeAgo(chat.lastActivityAt)}</span>
          </div>
          {busy ? (
            <div className="row__status">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              {chat.status === 'retry' ? 'Waiting for the model…' : chat.kind === 'group' ? 'Team is working' : 'Working'}
            </div>
          ) : (
            <div className="row__preview">{chat.preview || 'No messages yet'}</div>
          )}
          <div className="row__meta">
            <span className="badge badge--muted">
              <span style={{ width: 6, height: 6, borderRadius: 3, background: chat.projectColor }} /> {chat.projectName}
            </span>
            {chat.kind === 'group' && <span className="badge badge--muted">Team · {chat.agents?.length ?? 0}</span>}
            {chat.pendingApprovals > 0 && <span className="badge badge--warn">Needs approval</span>}
            {chat.pinned && <Icon name="pin" size={13} style={{ color: 'var(--ink-3)' }} />}
          </div>
        </div>
      </button>
      {menu &&
        createPortal(
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setMenu(false)} style={{ display: 'grid', placeItems: 'center' }}>
          <Glass className="card" variant="strong" radius={26} refract onClick={(e) => e.stopPropagation()} style={{ width: 290 }}>
            <div className="card__title" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {chat.title}
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="option" onClick={togglePin}>
                <Icon name="pin" size={19} />
                <div className="option__main">{chat.pinned ? 'Unpin' : 'Pin to top'}</div>
              </button>
              <button
                className="option"
                onClick={() => {
                  setMenu(false);
                  openSheet('rename-chat', { chatId: chat.id });
                }}
              >
                <Icon name="edit" size={19} />
                <div className="option__main">Rename</div>
              </button>
              <button className="option" onClick={remove} style={{ color: 'var(--danger)' }}>
                <Icon name="trash" size={19} />
                <div className="option__main">Delete chat</div>
              </button>
            </div>
          </Glass>
        </motion.div>,
          document.body,
        )}
    </motion.div>
  );
}
