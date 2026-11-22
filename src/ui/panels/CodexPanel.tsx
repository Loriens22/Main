import { useState } from 'preact/hooks';
import { bus } from '../../core/events';
import { PanelFrame } from '../App';
import { BEHAVIOUR, codex } from '../../life/Codex';
import { SPECIES, type Planet, type SpeciesDef } from '../../life/species';

const LEVEL = ['Unknown', 'Unidentified contact', 'Sighted', 'Behaviour documented', 'Studied'];
const PLANETS: [Planet, string][] = [['miller', "Miller's planet"], ['mars', 'Mars'], ['jupiter', 'Jupiter']];
const CERT_CLASS: Record<string, string> = { OBSERVED: 'obs', INFERRED: 'inf', HYPOTHESIS: 'hyp', HYPOTHETICAL: 'hyp', SPECULATIVE: 'spec', UNKNOWN: 'unk' };

/** The exobiology field database: what has been recorded of each species, and how certain it is. */
export function CodexPanel({ close, planet }: { close: () => void; planet?: Planet }) {
  const [tab, setTab] = useState<Planet>(planet ?? 'miller');
  const list = Object.values(SPECIES).filter((s) => s.planet === tab);
  const [sel, setSel] = useState<string | null>(null);
  const cur = sel ? SPECIES[sel] : null;
  return (
    <PanelFrame title="Field codex" sub="Exobiology database · original speculative species" close={close}
      tabs={PLANETS.map(([id, l]) => [id, l])} tab={tab} setTab={(t) => { setTab(t as Planet); setSel(null); }}>
      <div class="codex">
        <div class="codex-list">
          {list.map((s) => {
            const lv = codex.level(s.id);
            return (
              <button class={`codex-item ${sel === s.id ? 'on' : ''} ${lv === 0 ? 'unknown' : ''}`} onClick={() => { bus.emit('ui:click'); setSel(s.id); }}>
                <b>{lv >= 2 ? s.name : lv === 1 ? 'Unidentified contact' : '— not yet recorded —'}</b>
                <small>{lv >= 2 ? s.latin : ''}</small>
                <span class="lv">{'●'.repeat(lv)}{'○'.repeat(4 - lv)}</span>
              </button>
            );
          })}
          <p class="note">Every species here is an original speculative design for this game: no such organisms are known. Sizes are design estimates.</p>
        </div>
        <div class="codex-entry">{cur ? <Entry s={cur} /> : <p class="note">Select a record. Scan animals (R) at close range and watch what they do to fill the database.</p>}</div>
      </div>
    </PanelFrame>
  );
}

function Entry({ s }: { s: SpeciesDef }) {
  const r = codex.rec(s.id);
  const lv = r.level;
  if (lv === 0) return <p class="note">Nothing recorded yet.</p>;
  if (lv === 1) return <div><h3>Unidentified contact</h3><p>A sensor contact has been logged, but nothing has been seen clearly. Get closer, with lights, and scan.</p></div>;
  return (
    <div>
      <h3>{s.name} <small><i>{s.latin}</i></small></h3>
      <div class="kv"><span>Research status</span><b>{LEVEL[lv]}</b></div>
      <div class="kv"><span>Records</span><b>{r.sightings} sightings · {r.scans} scans · {r.individuals.length} individuals</b></div>
      {r.maxSize > 0 && <div class="kv"><span>Largest measured</span><b>{r.maxSize.toFixed(r.maxSize < 1 ? 2 : 1)} m</b></div>}
      {s.artScale && <div class="kv"><span>Concept-sheet scale (not simulated)</span><b>{s.artScale[0]}–{s.artScale[1]} m</b></div>}
      {s.codex.filter((e) => e.level <= lv).map((e) => (
        <div class="codex-fact">
          <h4>{e.label} <span class={`cert ${CERT_CLASS[e.c] ?? ''}`}>{e.c}</span></h4>
          <p>{e.text}</p>
        </div>
      ))}
      {r.seen.length > 0 && (
        <div class="codex-fact">
          <h4>Behaviour documented <span class="cert obs">OBSERVED</span></h4>
          <ul>{r.seen.map((k) => <li>{BEHAVIOUR[k] ?? k}</li>)}</ul>
        </div>
      )}
      <div class="codex-fact"><h4>Sound</h4><p>{s.sound}</p></div>
      {lv < 4 && <p class="note">{lv < 3 ? 'Further scans and observed behaviour will add to this record.' : 'Document more behaviour and scan again to complete the study.'}</p>}
    </div>
  );
}
