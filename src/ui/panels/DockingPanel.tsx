import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { PanelFrame } from '../App';
import { ENDURANCE } from '../../space/Endurance';
import { RANGER_SPEC } from '../../vehicles/Spacecraft';
import { ui } from '../store';
import { BODIES } from '../../space/Bodies';

const KV = ({ k, v, warn }: { k: string; v: any; warn?: boolean }) => <div class="kv"><span>{k}</span><b style={warn ? { color: 'var(--warn)' } : {}}>{v}</b></div>;

/**
 * Ranger flight computer, rendezvous page: choose manual or automatic docking with the Endurance, and talk to
 * the ship's rotation system (start, stop, set speed, automatic gravity control).
 */
export function DockingPanel({ game, close }: { game: Game; close: () => void }) {
  const [, setN] = useState(0);
  const [rpm, setRpm] = useState<number>(() => { const e0 = (game.zone as any)?.endurance; return e0 ? e0.targetRate * 60 / (2 * Math.PI) : ENDURANCE.spinRpm; });
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), 300); return () => clearInterval(t); }, []);
  const z: any = game.zone;
  const e = z?.endurance;
  const c = z?.ranger;
  const flight = game.services.flight;
  if (!e || !c) return <PanelFrame title="Rendezvous" close={close}><p>No rendezvous target.</p></PanelFrame>;
  const pos = c.position();
  const vel = c.velocity();
  const docked = z.docking.isDocked(c);
  const port = z.docking.nearestPort(c, 'ranger');
  const range = port ? port.node.getWorldPosition(pos.clone()).distanceTo(pos) : 0;
  const g1 = e.gravityAtRadius(ENDURANCE.ringR);
  return (
    <PanelFrame title="Rendezvous · Endurance" sub="Ranger 1 flight computer" close={close}>
      <div class="grid2">
        <div class="card">
          <h4>Automatic docking</h4>
          <p>The computer picks the free Ranger port, plans a two-burn transfer to the approach gate {50} m out on the docking axis (coasting under time compression), then turns the docking ring to the port, matches the ship's spin and clocking, and flies the final approach. From the gate it docks in under a minute.</p>
          <button class="btn" disabled={docked} onClick={() => { bus.emit('ui:click'); close(); z.engageAutoDock(); }}>Engage automatic docking</button>
        </div>
        {z.body?.landing && !docked && (
          <div class="card">
            <h4>Automatic landing · {z.body.landing.site}</h4>
            <p>From here (the descent staging point) the computer waits for the window when the site passes under the orbit, makes the deorbit burn, coasts down{z.body.atmosphere ? ', flies a lifting entry with bank steering' : ''}, brakes under power to a gate {1200} m above the pad and lets down onto it. Time is compressed except for the burns and the last metres.</p>
            <button class="btn" onClick={() => { bus.emit('ui:click'); const err = z.beginDescent(); if (err) ui.toast(err, 'warn', 5); else close(); }}>Land on {z.body.name}</button>
          </div>
        )}
        {z.body && !z.body.landing && (z.body.kind === 'gas' || z.body.kind === 'ice') && (
          <div class="card">
            <h4>No landing at {z.body.name}</h4>
            <p>{z.body.name} has no surface: its atmosphere thickens into a hot fluid interior. A craft that descended to the cloud deck could not climb out again (orbital speed there is {(Math.sqrt(z.body.GM / z.body.R) / 1000).toFixed(0)} km/s, against the Ranger's {(13.9).toFixed(0)} km/s of drive). Fly to one of its moons instead: {BODIES.filter((m: any) => m.parent === z.body.id && m.landing).map((m: any) => m.name).join(', ')}.</p>
          </div>
        )}
        <div class="card">
          <h4>Manual docking</h4>
          <p>You fly. Translate with I K J L U O, rotate with W S A D Q E. The Ranger docks tail-first: press V for the docking camera. Inside 0.3 m capture needs offset under 0.22 m, closing under 0.45 m/s, alignment within 5°, clocking within 12° and the spin matched within 3.5°/s.</p>
          <button class="btn" disabled={docked} onClick={() => { bus.emit('ui:click'); if (flight.autopilot) flight.engage(null); close(); flight.cycleCamera('dock'); }}>Manual docking · docking camera</button>
          {docked && <button class="btn warn" style={{ marginLeft: '8px' }} onClick={() => { bus.emit('ui:click'); z.docking.undock(c, 0.15); close(); }}>Undock · release latches</button>}
        </div>
      </div>
      <div class="grid2">
        <div>
          <h4>Relative navigation</h4>
          <KV k="Range to port" v={range < 2000 ? `${range.toFixed(1)} m` : `${(range / 1000).toFixed(2)} km`} />
          <KV k="Position (along · radial · cross)" v={`${pos.x.toFixed(0)} · ${pos.y.toFixed(0)} · ${pos.z.toFixed(0)} m`} />
          <KV k="Velocity" v={`${vel.x.toFixed(2)} · ${vel.y.toFixed(2)} · ${vel.z.toFixed(2)} m/s`} />
          <KV k="Free Ranger port" v={port ? port.label : 'none'} warn={!port} />
          <KV k="Ranger 2" v="Docked · aft axial port" />
          <KV k="Propellant" v={`${(c.fuel / 1000).toFixed(2)} t of ${(RANGER_SPEC.fuelMax / 1000).toFixed(0)} t`} warn={c.fuel < 1500} />
          <KV k="Hull" v={c.damage > 0 ? `${(c.damage * 100).toFixed(0)} % damage (repairable)` : 'Nominal'} warn={c.damage > 0} />
        </div>
        <div>
          <h4>Endurance rotation</h4>
          <KV k="Spin" v={`${e.rpm.toFixed(2)} rpm → ${(e.targetRate * 60 / (2 * Math.PI)).toFixed(2)} rpm`} />
          <KV k="Ring floor (r = 32 m)" v={`${g1.toFixed(2)} m/s² · ${(g1 / 9.81).toFixed(2)} g`} />
          <KV k="Hub (r ≈ 2 m)" v={`${e.gravityAtRadius(2).toFixed(2)} m/s²`} />
          <KV k="Automatic gravity control" v={e.autoGravity ? 'ON · 1 g at the floor' : 'OFF'} />
          <div class="row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button class="btn" onClick={() => { e.startRotation(rpm); e.autoGravity = false; setN((n) => n + 1); }}>Start rotation</button>
            <button class="btn warn" onClick={() => { e.stopRotation(); e.autoGravity = false; setN((n) => n + 1); }}>Stop rotation</button>
            <button class={'btn' + (e.autoGravity ? ' on' : '')} onClick={() => { e.setAutoGravity(true); setN((n) => n + 1); }}>Automatic gravity</button>
          </div>
          <div class="row" style={{ marginTop: '10px' }}>
            <span>Set rotation speed · {rpm.toFixed(2)} rpm</span>
            <input type="range" min={0} max={7} step={0.05} value={rpm} onInput={(ev) => setRpm(parseFloat((ev.target as HTMLInputElement).value))} onChange={() => { e.setRotationSpeed(rpm); e.autoGravity = false; }} />
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}
