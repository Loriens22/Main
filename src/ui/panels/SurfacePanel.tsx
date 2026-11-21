import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { PanelFrame } from '../App';
import { surfaceGravity } from '../../space/Bodies';
import { RANGER_SPEC } from '../../vehicles/Spacecraft';

const KV = ({ k, v, warn }: { k: string; v: any; warn?: boolean }) => <div class="kv"><span>{k}</span><b style={warn ? { color: 'var(--warn)' } : {}}>{v}</b></div>;

/** Ranger 1 flight computer on the ground: where we are, the clocks, and the automatic return to the Endurance. */
export function SurfacePanel({ game, close }: { game: Game; close: () => void }) {
  const [, setN] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), 300); return () => clearInterval(t); }, []);
  const z: any = game.zones.get('surface');
  const o: any = game.zones.get('orbit');
  if (!z || game.zone !== z) return <PanelFrame title="Ranger 1" close={close}><p>Not on a planetary surface.</p></PanelFrame>;
  const b = z.body;
  const a = b.atmosphere;
  const clocks = o.missionClocks() as { label: string; value: string }[];
  return (
    <PanelFrame title={`Ranger 1 · ${b.name}`} sub={b.landing?.site ?? ''} close={close}>
      <div class="grid2">
        <div class="card">
          <h4>Site</h4>
          <KV k="Surface gravity" v={`${surfaceGravity(b).toFixed(2)} m/s² · ${(surfaceGravity(b) / 9.80665).toFixed(2)} g`} />
          <KV k="Atmosphere" v={a ? `${(a.rho0).toFixed(3)} kg/m³ at the surface${a.breathable ? ' · breathable' : ' · not breathable'}` : 'none (vacuum)'} />
          <KV k="Propellant" v={`${((o.rangerFuel / RANGER_SPEC.fuelMax) * 100).toFixed(0)} %`} warn={o.rangerFuel < RANGER_SPEC.fuelMax * 0.5} />
          {clocks.map((c) => <KV k={c.label} v={c.value} />)}
          <p class="note">{b.blurb}</p>
        </div>
        <div class="card">
          <h4>Return to the Endurance</h4>
          <p>The computer waits on the pad for the launch window (the Endurance passing the right distance ahead, the site close to its orbit plane), climbs out of the dense air under a dynamic-pressure limit, inserts into the Endurance's orbit about a kilometre behind it, and closes in. The docking autopilot then brings the Ranger into a free port.</p>
          {z.flooded > 0 && <KV k="Engines flooded · draining" v={`${Math.floor(z.flooded / 60)}:${String(Math.floor(z.flooded % 60)).padStart(2, '0')} (local)`} warn />}
          {z.wave && <KV k="Next wave" v={z.wave.eta(0) > 0 ? `${Math.floor(z.wave.eta(0) / 60)} min ${String(Math.floor(z.wave.eta(0) % 60)).padStart(2, '0')} s` : 'passing'} warn={z.wave.eta(0) < 480} />}
          <button class="btn" disabled={!!z.program || z.flooded > 0 || z.riding} onClick={() => { bus.emit('ui:click'); const e = z.launch(); setErr(e); if (!e) close(); }}>Launch · automatic return</button>
          {!z.program && (
            <div class="row" style={{ marginTop: '10px' }}><span>Time compression</span>
              <div class="seg">{[1, 10, 60].map((w) => <button class={z.warp === w ? 'on' : ''} onClick={() => { bus.emit('ui:click'); z.warp = w; }}>{`×${w}`}</button>)}</div>
            </div>
          )}
          {z.body.id === 'miller' && <p class="note">Every hour of local time is about seven years on Earth.</p>}
          {z.body.id === 'earth' && !z.program && (
            <>
              <h4 style={{ marginTop: '12px' }}>Home</h4>
              <p class="note">Ranger 1 stands on the landing field west of the NASA gate. Walk out into the countryside round the facility; the Ranger stays on the field for the return.</p>
              <button class="btn" onClick={() => { bus.emit('ui:click'); close(); void z.walkOutAtNasa(); }}>Walk out at NASA</button>
            </>
          )}
          {err && <p class="note" style={{ color: 'var(--warn)' }}>{err}</p>}
          {z.program && <p class="note">{z.program.status()}</p>}
        </div>
      </div>
    </PanelFrame>
  );
}
