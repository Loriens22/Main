import { bus } from '../../core/events';
import { PanelFrame } from '../App';

export interface ReaderEntry { head?: string; text: string }
export interface ReaderAction { label: string; run: () => void; disabled?: boolean }

/** A document on a screen or a page: logs, recorder data, notes found in the world. */
export function ReaderPanel({ close, title, sub, entries, actions }: { close: () => void; title: string; sub?: string; entries: ReaderEntry[]; actions?: ReaderAction[] }) {
  return (
    <PanelFrame title={title} sub={sub} close={close}>
      <div class="reader">
        {entries.map((e) => (
          <div class="entry">
            {e.head && <h4>{e.head}</h4>}
            {e.text.split('\n').map((p) => <p>{p}</p>)}
          </div>
        ))}
      </div>
      {actions && actions.length > 0 && (
        <div class="actions">
          {actions.map((a) => <button class="btn" disabled={a.disabled} onClick={() => { bus.emit('ui:click'); a.run(); close(); }}>{a.label}</button>)}
        </div>
      )}
    </PanelFrame>
  );
}
