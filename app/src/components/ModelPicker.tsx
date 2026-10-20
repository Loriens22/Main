import { useMemo, useState } from 'react';
import { compactNumber, price } from '@/lib/format';
import type { ModelInfo } from '@/lib/types';
import { refreshCatalog, toast, useStore } from '@/state/store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

function Caps({ m }: { m: ModelInfo }) {
  return (
    <div className="caps">
      {m.caps.tools && <span className="cap">Tools</span>}
      {m.caps.reasoning && <span className="cap">Reasoning</span>}
      {(m.caps.vision || m.caps.attachments) && <span className="cap">Vision</span>}
      {m.caps.pdf && <span className="cap">PDF</span>}
      {m.limit.context > 0 && <span className="cap">{compactNumber(m.limit.context)} context</span>}
      {m.limit.output > 0 && <span className="cap">{compactNumber(m.limit.output)} out</span>}
      {m.status && m.status !== 'active' && <span className="cap">{m.status}</span>}
    </div>
  );
}

/**
 * Lists the models the server discovered at runtime. Free models first; paid models are clearly
 * labelled with prices and need an explicit confirmation — nothing ever switches to them silently.
 */
export function ModelPicker({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value?: string; onPick: (m: ModelInfo, allowPaid: boolean) => void }) {
  const catalog = useStore((s) => s.catalog);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<ModelInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const models = useMemo(() => {
    const term = q.toLowerCase();
    return (catalog?.models ?? []).filter((m) => !term || `${m.name} ${m.providerName} ${m.id}`.toLowerCase().includes(term));
  }, [catalog, q]);
  const free = models.filter((m) => m.free && m.available);
  const paid = models.filter((m) => !m.free && m.available);
  const locked = models.filter((m) => !m.available);

  const pick = (m: ModelInfo) => {
    if (!m.available) return toast(`Add a ${m.providerName} API key in Settings → Providers to use ${m.name}.`, 'info', 5000);
    if (!m.free) return setConfirm(m);
    onPick(m, false);
    onClose();
  };

  const row = (m: ModelInfo) => (
    <button key={m.id} className="option" aria-selected={m.id === value} onClick={() => pick(m)} style={!m.available ? { opacity: 0.55 } : undefined}>
      <div className="option__main">
        <div className="option__title">
          {m.name}
          <span className={`badge ${m.free ? 'badge--free' : 'badge--paid'}`}>{m.free ? 'Free' : `Paid · ${price(m.cost.input)}/${price(m.cost.output)} per 1M`}</span>
          {!m.available && <span className="badge badge--muted">Needs key</span>}
        </div>
        <div className="option__sub">
          {m.providerName} · <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{m.id}</span>
        </div>
        <Caps m={m} />
      </div>
      {m.id === value && <Icon name="check" size={20} style={{ color: 'var(--accent)' }} />}
    </button>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Choose a model"
      tall
      actions={
        <button
          className="circle-btn circle-btn--sm"
          style={{ background: 'var(--card-2)', borderRadius: '50%' }}
          aria-label="Refresh models"
          onClick={async () => {
            setRefreshing(true);
            await refreshCatalog(true).catch((e) => toast(e.message, 'error'));
            setRefreshing(false);
          }}
        >
          {refreshing ? <span className="spinner" /> : <Icon name="refresh" size={17} />}
        </button>
      }
    >
      <input className="field" placeholder="Search models" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      {confirm ? (
        <div className="card" style={{ width: '100%', background: 'var(--card)', border: '1px solid rgba(251,191,36,0.4)' }}>
          <div className="card__title">
            <Icon name="key" size={18} /> {confirm.name} is a paid model
          </div>
          <div className="card__body">
            It costs {price(confirm.cost.input)} per million input tokens and {price(confirm.cost.output)} per million output tokens, billed to your {confirm.providerName} account. Maverick will only use it in this chat after you confirm.
          </div>
          <div className="card__actions">
            <button className="btn" style={{ background: 'var(--card-2)' }} onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="btn"
              style={{ background: 'var(--warn)', color: '#1a1200' }}
              onClick={() => {
                onPick(confirm, true);
                setConfirm(null);
                onClose();
              }}
            >
              Use paid model
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="label">Free models · {free.length}</div>
          {free.length ? free.map(row) : <div className="muted" style={{ padding: 12 }}>No free models are available right now. Pull to refresh in a minute.</div>}
          {paid.length > 0 && (
            <>
              <div className="label">Paid models (your keys)</div>
              {paid.map(row)}
            </>
          )}
          {locked.length > 0 && (
            <>
              <div className="label">Paid models · locked</div>
              <div className="muted" style={{ fontSize: 13, margin: '0 8px 8px' }}>
                Add an API key in Settings → Providers to unlock these. They are never used without your confirmation.
              </div>
              {locked.slice(0, 40).map(row)}
            </>
          )}
          {catalog && (
            <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 16 }}>
              Discovered live from OpenCode · updated {new Date(catalog.refreshedAt).toLocaleTimeString()}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
