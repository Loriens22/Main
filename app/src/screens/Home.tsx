import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { Glass } from '@/glass/Glass';
import { timeAgo } from '@/lib/format';
import { haptic } from '@/lib/platform';
import { toneDot, toneFill } from '@/lib/tone';
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
      <div className="scroll" style={{ paddingBottom: 'calc(var(--safe-bottom) + 96px)' }}>
        <div className="content-max">
          <header className="home-head">
            <div>
              <h1 className="home-title">Chats</h1>
              <div className="home-sub">
                <span className={`conn-dot${conn === 'online' ? '' : ' conn-dot--off'}`} />
                {conn === 'online'
                  ? busyCount
                    ? `${busyCount} agent${busyCount > 1 ? 's' : ''} working`
                    : 'Connected'
                  : conn === 'reconnecting' || conn === 'connecting'
                    ? 'Waking up the server…'
                    : 'Offline'}
              </div>
            </div>
            <MascotAnchor id="maverick" size={64} />
          </header>

          <label className="searchbar">
            <Icon name="search" size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search chats" enterKeyHint="search" />
            {q && (
              <button className="icon-btn" style={{ width: 20, height: 20 }} onClick={() => setQ('')} aria-label="Clear search">
                <Icon name="close" size={11} stroke={2.6} />
              </button>
            )}
          </label>

          <div className="filters">
            <button className={`chip${!prefs.projectFilter ? ' chip--active' : ''}`} onClick={() => setPrefs({ projectFilter: null })}>
              All
            </button>
            {projects.map((p) => (
              <button key={p.id} className={`chip${prefs.projectFilter === p.id ? ' chip--active' : ''}`} onClick={() => setPrefs({ projectFilter: prefs.projectFilter === p.id ? null : p.id })}>
                <span className="dot" style={{ background: toneDot(p.color) }} />
                {p.name}
              </button>
            ))}
            <div style={{ flex: 1, minWidth: 4 }} />
            <button className="chip" onClick={() => setSortOpen(true)} aria-label="Sort chats">
              <Icon name="sort" size={13} />
              {prefs.sort === 'recent' ? 'Recent' : prefs.sort === 'name' ? 'Name' : 'Project'}
            </button>
          </div>

          {total === 0 && (
            <div className="empty">
              <h2>{q ? 'No matches' : 'No chats yet'}</h2>
              <p style={{ margin: 0 }}>{q ? 'Try another search.' : 'Start a chat with Maverick, or set up a team of agents.'}</p>
              {!q && (
                <button className="btn btn--primary" onClick={() => openSheet('new-chat')} style={{ marginTop: 16 }}>
                  <Icon name="plus" size={15} stroke={2.4} /> New chat
                </button>
              )}
            </div>
          )}

          {list.pinned.length > 0 && (
            <>
              <div className="section-title">Pinned</div>
              <div className="list">
                <AnimatePresence initial={false}>
                  {list.pinned.map((c) => (
                    <ChatRow key={c.id} chat={c} />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}

          {groupsByProject
            ? groupsByProject.map(([name, items]) => (
                <div key={name}>
                  <div className="section-title">
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: toneDot(items[0].projectColor), display: 'inline-block' }} /> {name}
                  </div>
                  <div className="list">
                    {items.map((c) => (
                      <ChatRow key={c.id} chat={c} />
                    ))}
                  </div>
                </div>
              ))
            : list.rest.length > 0 && (
                <>
                  <div className="section-title">{list.pinned.length ? 'Recent' : 'All chats'}</div>
                  <div className="list">
                    <AnimatePresence initial={false}>
                      {list.rest.map((c) => (
                        <ChatRow key={c.id} chat={c} />
                      ))}
                    </AnimatePresence>
                  </div>
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
      {/* No refraction on menus: the scale-in would size the displacement map wrong. */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Sort chats"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <Glass className="menu" variant="strong" radius={16} blur={24} style={{ width: 240 }}>
          <div className="muted" style={{ fontSize: 12, padding: '6px 10px 2px' }}>Sort by</div>
          <div>
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
                {sort === s && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
              </button>
            ))}
          </div>
        </Glass>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function ChatAvatar({ chat }: { chat: Chat }) {
  if (chat.kind === 'group') {
    // Two faces on a diagonal, the way messaging apps show a group.
    const agents = (chat.agents ?? []).slice(0, 2);
    return (
      <div className="avatar__stack">
        {agents.map((a, i) => (
          <span key={a.id} style={{ background: toneFill(a.color), left: i ? 14 : 0, top: i ? 14 : 0, zIndex: 2 - i }}>
            {a.name[0]}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="avatar avatar--star">
      <StarGlyph size={24} />
      <span className="avatar__badge" style={{ background: toneDot(chat.projectColor) }} />
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
  const multiProject = useStore((s) => !s.prefs.projectFilter && s.projects.length > 1);

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
    if (s?.locked === 'x') setDx(dx < -70 ? -152 : 0);
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
        <button style={{ background: 'var(--s4)' }} onClick={togglePin}>
          <Icon name="pin" size={17} />
          {chat.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button style={{ background: 'var(--danger-fill)' }} onClick={remove}>
          <Icon name="trash" size={17} />
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
          {(multiProject || chat.kind === 'group' || chat.pendingApprovals > 0 || chat.pinned) && (
            <div className="row__meta">
              <span style={{ width: 5, height: 5, borderRadius: 3, background: toneDot(chat.projectColor) }} />
              <span>{chat.projectName}</span>
              {chat.kind === 'group' && (
                <>
                  <span className="sep">·</span>
                  <span>{chat.agents?.length ?? 0} agents</span>
                </>
              )}
              {chat.pendingApprovals > 0 && <span className="badge badge--warn">Needs approval</span>}
              {chat.pinned && <Icon name="pin" size={11} style={{ color: 'var(--t3)', marginLeft: 'auto' }} />}
            </div>
          )}
        </div>
      </button>
      {menu &&
        createPortal(
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setMenu(false)} style={{ display: 'grid', placeItems: 'center' }}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={chat.title}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <Glass className="menu" variant="strong" radius={16} blur={24} style={{ width: 250 }}>
                <div className="muted" style={{ fontSize: 12, padding: '6px 10px 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {chat.title}
                </div>
                <div>
                  <button className="option" onClick={togglePin}>
                    <Icon name="pin" size={16} />
                    <div className="option__main">{chat.pinned ? 'Unpin' : 'Pin to top'}</div>
                  </button>
                  <button
                    className="option"
                    onClick={() => {
                      setMenu(false);
                      openSheet('rename-chat', { chatId: chat.id });
                    }}
                  >
                    <Icon name="edit" size={16} />
                    <div className="option__main">Rename</div>
                  </button>
                  <button className="option" onClick={remove} style={{ color: 'var(--danger)' }}>
                    <Icon name="trash" size={16} />
                    <div className="option__main">Delete chat</div>
                  </button>
                </div>
              </Glass>
            </motion.div>
          </motion.div>,
          document.body,
        )}
    </motion.div>
  );
}
