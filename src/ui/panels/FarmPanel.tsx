import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { PanelFrame } from '../App';
import { useUI } from '../store';
import { FARM, FIELDS } from '../../world/earth/EarthMap';
import type { Farm, Machine } from '../../world/earth/Farm';

/** Farm command interface: every autonomous machine, its state, and the instructions it accepts. */
export function FarmPanel({ game, close, machine }: { game: Game; close: () => void; machine?: string }) {
  useUI((s) => s.tick);
  const farm: Farm | undefined = (game.zone as any)?.farm;
  const [sel, setSel] = useState<string>(machine ?? farm?.machines[0]?.id ?? '');
  const [field, setField] = useState(FIELDS[0].id);
  const [, setN] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), 500); return () => clearInterval(t); }, []);
  useEffect(() => {
    const c = cv.current;
    if (!c || !farm) return;
    const ctx = c.getContext('2d')!;
    const W = c.width, H = c.height;
    const span = 1000, sc = W / span;
    const X = (x: number) => (x - FARM.x) * sc + W / 2, Z = (z: number) => (z - FARM.z) * sc + H / 2;
    ctx.fillStyle = '#080b0c'; ctx.fillRect(0, 0, W, H);
    for (const f of FIELDS) {
      const h = farm.harvest.get(f.id)!;
      ctx.fillStyle = '#1d3317';
      ctx.fillRect(X(f.cx - f.w / 2), Z(f.cz - f.d / 2), f.w * sc, f.d * sc);
      // cut ground
      ctx.fillStyle = '#5a4c33';
      const step = 6;
      for (let j = 0; j < h.d; j += step) for (let i = 0; i < h.w; i += step) {
        if (h.data[j * h.w + i]) ctx.fillRect(X(f.cx - f.w / 2 + i * 2), Z(f.cz - f.d / 2 + j * 2), step * 2 * sc + 0.5, step * 2 * sc + 0.5);
      }
      ctx.strokeStyle = f.id === field ? '#e2c48a' : 'rgba(233,230,223,0.25)';
      ctx.strokeRect(X(f.cx - f.w / 2) + 0.5, Z(f.cz - f.d / 2) + 0.5, f.w * sc, f.d * sc);
      ctx.fillStyle = 'rgba(233,230,223,0.75)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${f.name.toUpperCase()}  ${Math.round(h.fraction * 100)}%`, X(f.cx), Z(f.cz));
    }
    ctx.fillStyle = '#3a3a36'; ctx.beginPath(); ctx.arc(X(FARM.x), Z(FARM.z), 62 * sc, 0, 7); ctx.fill();
    ctx.fillStyle = '#d9d6cc'; ctx.fillRect(X(FARM.x - 12), Z(FARM.z - 22), 18 * sc, 12 * sc);
    for (const m of farm.machines) {
      const p = m.vehicle.position;
      ctx.fillStyle = m.fault ? '#e07b53' : m.id === sel ? '#e2c48a' : '#c8413a';
      ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), m.id === sel ? 5 : 3.5, 0, 7); ctx.fill();
      if (m.path.length && m.pathIndex < m.path.length) {
        ctx.strokeStyle = 'rgba(226,196,138,0.5)'; ctx.beginPath(); ctx.moveTo(X(p.x), Z(p.z));
        for (let i = m.pathIndex; i < Math.min(m.path.length, m.pathIndex + 14); i++) ctx.lineTo(X(m.path[i].x), Z(m.path[i].z));
        ctx.stroke();
      }
    }
    const pp = game.player.pos;
    ctx.fillStyle = '#7fd6cf'; ctx.beginPath(); ctx.arc(X(pp.x), Z(pp.z), 3, 0, 7); ctx.fill();
  });
  if (!farm) return <PanelFrame title="Farm management" close={close}><p>No farm link in this location.</p></PanelFrame>;
  const m: Machine | undefined = farm.machines.find((x) => x.id === sel);
  const cmd = (c: string, arg?: string) => m && farm.command(m, c, arg);
  return (
    <PanelFrame title="Farm management" sub="autonomous machinery" close={close}>
      <div class="grid2">
        <div>
          <canvas class="map" ref={cv} width={520} height={470} />
          <div class="kv" style={{ marginTop: 8 }}><span>Weather</span><b>{farm.stormShelter ? 'DUST STORM — machines sheltering' : 'Workable'}</b></div>
        </div>
        <div>
          <div class="card">
            <h4>Machines</h4>
            {farm.machines.map((x) => (
              <div class="kv" style={{ cursor: 'pointer', padding: '5px 0' }} onClick={() => setSel(x.id)}>
                <span style={{ color: x.id === sel ? 'var(--accent)' : undefined }}>{x.name}</span>
                <b class={x.fault ? 'bad' : x.task === 'idle' ? '' : 'ok'}>{farm.statusText(x)}</b>
              </div>
            ))}
          </div>
          {m && (
            <div class="card" style={{ marginTop: 14 }}>
              <h4>{m.name}</h4>
              <div class="kv"><span>Status</span><b>{farm.statusText(m)}{m.field && (m.task === 'harvest' || m.task === 'moveField') ? ` — ${m.field.name}` : ''}</b></div>
              <div class="kv"><span>Fuel</span><b>{Math.round((m.vehicle.fuel / m.vehicle.tuning.fuelCapacity) * 100)}%</b></div>
              <div class={`meter ${m.vehicle.fuel / m.vehicle.tuning.fuelCapacity < 0.15 ? 'warn' : ''}`}><i style={{ width: `${(m.vehicle.fuel / m.vehicle.tuning.fuelCapacity) * 100}%` }} /></div>
              <div class="kv" style={{ marginTop: 8 }}><span>Condition</span><b class={m.vehicle.condition < 0.6 ? 'bad' : 'ok'}>{Math.round(m.vehicle.condition * 100)}%</b></div>
              {m.kind === 'combine' && <div class="kv"><span>Grain tank</span><b>{Math.round(m.grain * 100)}%</b></div>}
              <div class="kv"><span>Speed</span><b>{(Math.abs(m.speed) * 3.6).toFixed(1)} km/h</b></div>
              {m.fault && <div class="kv"><span>Fault</span><b class="bad">{m.fault}</b></div>}
              <div class="kv" style={{ marginTop: 8 }}><span>Selected field</span>
                <select value={field} onChange={(e) => setField((e.target as HTMLSelectElement).value)} style={{ background: '#0c0f11', color: 'inherit', border: '1px solid var(--line)', padding: '3px 6px' }}>
                  {FIELDS.map((f) => <option value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div class="btnrow">
                <button class="btn" disabled={m.kind !== 'combine'} onClick={() => cmd('harvest', field)}>Start harvesting</button>
                <button class="btn" onClick={() => cmd('stop')}>Stop vehicle</button>
                <button class="btn" onClick={() => cmd('return')}>Return to farm</button>
                <button class="btn" onClick={() => cmd('route')}>Follow assigned route</button>
                <button class="btn" onClick={() => cmd('moveField', field)}>Move to selected field</button>
                <button class="btn" onClick={() => cmd('refuel')}>Refuel</button>
                <button class="btn" onClick={() => cmd('repair')}>Repair</button>
                <button class="btn" onClick={() => { cmd('manual'); close(); }}>Switch to manual control</button>
              </div>
              <h4 style={{ marginTop: 14 }}>Machine log</h4>
              <div class="log">{m.log.length ? m.log.slice(0, 6).join('\n') : 'No messages.'}</div>
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  );
}
