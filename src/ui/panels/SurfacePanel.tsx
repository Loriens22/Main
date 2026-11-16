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
          <button class="btn" disabled={!!z.program} onClick={() => { bus.emit('ui:click'); const e = z.launch(); setErr(e); if (!e) close(); }}>Launch · automatic return</button>
          {err && <p class="note" style={{ color: 'var(--warn)' }}>{err}</p>}
          {z.program && <p class="note">{z.program.status()}</p>}
        </div>
      </div>
    </PanelFrame>
  );
}
