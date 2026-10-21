import { useMemo, useState } from 'react';
import { compactNumber, price } from '@/lib/format';
import type { ModelInfo } from '@/lib/types';
import { refreshCatalog, toast, useStore } from '@/state/store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

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
    <button key={m.id} className="option" aria-selected={m.id === value} onClick={() => pick(m)} title={m.id} style={!m.available ? { opacity: 0.55 } : undefined}>
      <div className="option__main">
        <div className="option__title">
          {m.name}
          {!m.free && <span className="badge badge--paid">{`Paid · ${price(m.cost.input)}/${price(m.cost.output)} per 1M`}</span>}
          {!m.available && <span className="badge badge--muted">Needs key</span>}
        </div>
        <div className="option__sub">
          {[
            m.providerName,
            m.limit.context > 0 && `${compactNumber(m.limit.context)} context`,
            m.caps.reasoning && 'Reasoning',
            (m.caps.vision || m.caps.attachments) && 'Vision',
            m.caps.pdf && 'PDF',
            !m.caps.tools && 'No tools',
            m.status && m.status !== 'active' && m.status,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      {m.id === value && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
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
          className="icon-btn"
          aria-label="Refresh models"
          onClick={async () => {
            setRefreshing(true);
            await refreshCatalog(true).catch((e) => toast(e.message, 'error'));
            setRefreshing(false);
          }}
        >
          {refreshing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Icon name="refresh" size={13} />}
        </button>
      }
    >
      <input className="field" placeholder="Search models" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 4 }} />
      {confirm ? (
        <div className="card" style={{ width: '100%', boxShadow: 'inset 0 0 0 0.5px rgba(217,167,74,0.45)' }}>
          <div className="card__title">
            <Icon name="key" size={14} style={{ color: 'var(--warn)' }} /> {confirm.name} is a paid model
          </div>
          <div className="card__body">
            It costs {price(confirm.cost.input)} per million input tokens and {price(confirm.cost.output)} per million output tokens, billed to your {confirm.providerName} account. Maverick will only use it in this chat after you confirm.
          </div>
          <div className="card__actions">
            <button className="btn" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
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
