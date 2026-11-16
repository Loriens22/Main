import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { PanelFrame } from '../App';
import { ENDURANCE } from '../../space/Endurance';
import { mission } from '../../mission/Mission';
import { NavTab } from './NavPanel';

const KV = ({ k, v, warn }: { k: string; v: any; warn?: boolean }) => <div class="kv"><span>{k}</span><b style={warn ? { color: 'var(--warn)' } : {}}>{v}</b></div>;
const TABS: [string, string][] = [['rotation', 'Rotation · gravity'], ['vehicles', 'Vehicles · docking'], ['crew', 'Crew'], ['systems', 'Ship systems'], ['navigation', 'Navigation']];

/** Radii of the places people stand, for the gravity table. */
const DECKS: [string, number][] = [['Main decks (floor r = 29 m)', 29], ['Corridor decks and tunnels (r = 25 m)', 25], ['Spoke, halfway (r = 12 m)', 12], ['Spoke lift at the hub (r = 4.8 m)', 4.8], ['Hub wall (r = 2.35 m)', 2.35]];

/** Endurance command computer: rotation and artificial gravity, the vehicles and their ports, crew, ship systems. */
export function ShipPanel({ game, close, tab: first }: { game: Game; close: () => void; tab?: string }) {
  const [tab, setTab] = useState(first ?? 'rotation');
  const [, setN] = useState(0);
  const [rpm, setRpm] = useState<number>(() => { const e = (game.zones.get('orbit') as any)?.endurance; return e ? e.targetRate * 60 / (2 * Math.PI) : ENDURANCE.spinRpm; });
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), 300); return () => clearInterval(t); }, []);
  const o: any = game.zones.get('orbit');
  const e = o?.endurance;
  const ez: any = game.zones.get('endurance');
  if (!e) return <PanelFrame title="Endurance" close={close}><p>Ship systems offline.</p></PanelFrame>;
  const w = e.rate, rpmNow = e.rpm;
  const click = (f: () => void) => () => { bus.emit('ui:click'); f(); setN((n) => n + 1); };
  let body: any = null;
  if (tab === 'rotation') {
    body = (
      <div class="grid2">
        <div>
          <h4>Ring rotation</h4>
          <KV k="Spin rate" v={`${rpmNow.toFixed(2)} rpm (target ${(e.targetRate * 60 / (2 * Math.PI)).toFixed(2)})`} />
          <KV k="Period" v={w > 0.001 ? `${(2 * Math.PI / w).toFixed(1)} s` : 'stopped'} />
          <KV k="Rim speed (r = 32 m)" v={`${(w * ENDURANCE.ringR).toFixed(1)} m/s`} />
          <KV k="Automatic gravity control" v={e.autoGravity ? 'ON · holds 1 g at the outer floor' : 'OFF'} />
          <KV k="Spin thrusters" v={Math.abs(e.targetRate - e.rate) > 1e-3 ? (e.targetRate > e.rate ? 'FIRING · spin-up' : 'FIRING · spin-down') : 'idle'} />
          <div class="row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button class="btn" onClick={click(() => { e.startRotation(rpm); e.autoGravity = false; mission.note(`Ring spin-up ordered: ${rpm.toFixed(2)} rpm.`); })}>Start rotation</button>
            <button class="btn warn" onClick={click(() => { e.stopRotation(); e.autoGravity = false; mission.note('Ring spin-down ordered.'); })}>Stop rotation</button>
            <button class={'btn' + (e.autoGravity ? ' on' : '')} onClick={click(() => { e.setAutoGravity(true); mission.note('Automatic gravity control engaged.'); })}>Automatic gravity</button>
          </div>
          <div class="row" style={{ marginTop: '12px' }}>
            <span>Set rotation speed · {rpm.toFixed(2)} rpm</span>
            <input type="range" min={0} max={7} step={0.05} value={rpm} onInput={(ev) => setRpm(parseFloat((ev.target as HTMLInputElement).value))} onChange={() => { e.setRotationSpeed(rpm); e.autoGravity = false; }} />
          </div>
          <p class="note">Spin changes at about 1 rpm every 30 s. Gravity on board is the centripetal acceleration ω²r of the ring: it falls to nothing toward the hub, and everyone and everything inside floats if the ring is stopped. Docking needs the visiting craft to match the spin, or the ring to be stopped first.</p>
        </div>
        <div>
          <h4>Gravity on board</h4>
          {DECKS.map(([k, r]) => <KV k={k} v={`${(w * w * r).toFixed(2)} m/s² · ${(w * w * r / 9.81).toFixed(2)} g`} />)}
          <KV k="Coriolis at walking pace (1.4 m/s)" v={`${(2 * w * 1.4).toFixed(2)} m/s²`} />
        </div>
      </div>
    );
  } else if (tab === 'vehicles') {
    const crafts: [string, any, string][] = [['Ranger 1', o.ranger, 'axial_fwd'], ['Ranger 2', o.ranger2, 'axial_aft']];
    body = (
      <div>
        <div class="grid2">
          {crafts.map(([name, c, home]) => {
            const link = c ? o.docking.linkOf(c) : null;
            const ports = ez?.ports as any[] | undefined;
            const pg = ports?.find((p) => p.id === home);
            return (
              <div class="card">
                <h4>{name}</h4>
                <KV k="Status" v={link ? `Docked · ${link.port.label} (${home === 'axial_fwd' ? 'forward' : 'aft'})` : c ? 'In free flight' : 'Not aboard'} />
                <KV k="Propellant" v={c ? `${(c.fuel / 1000).toFixed(2)} t of ${(c.spec.fuelMax / 1000).toFixed(0)} t` : '—'} warn={c && c.fuel < 1500} />
                <KV k="Hull" v={c ? (c.damage > 0 ? `${(c.damage * 100).toFixed(0)} % damage` : 'Nominal') : '—'} warn={c && c.damage > 0} />
                <KV k="Maintenance" v={c && c.damage > 0 ? 'Repair needed' : 'Serviceable'} />
                <KV k="Hatches" v={pg ? (pg.open ? 'Open' : 'Closed') : '—'} />
                {link && c && c.fuel < c.spec.fuelMax && (
                  <button class="btn" onClick={click(() => { c.fuel = c.spec.fuelMax; mission.note(`${name} topped up from the ship's propellant.`); })}>Transfer propellant</button>
                )}
                {link && c && c.damage > 0 && (
                  <button class="btn" onClick={click(() => { c.damage = 0; mission.note(`${name} hull repaired.`); })}>Repair hull</button>
                )}
                {pg && <button class="btn" onClick={click(() => ez.setHatches(pg, !pg.open))}>{pg.open ? 'Close hatches' : 'Open hatches'}</button>}
              </div>
            );
          })}
        </div>
        <h4>Docking assignments</h4>
        {(o.docking.ports as any[]).map((p) => <KV k={`${p.label} · ${p.id}`} v={p.occupant ? (p.occupant === o.ranger ? 'Ranger 1' : p.occupant === o.ranger2 ? 'Ranger 2' : 'occupied') : p.accepts === 'lander' ? 'Free · reserved for the Landers' : 'Free'} />)}
      </div>
    );
  } else if (tab === 'crew') {
    const crew = [...(ez?.npcs?.list ?? []), ...(o.npcs?.list ?? [])];
    body = (
      <div>
        <KV k="Commander" v="On board · you" />
        {crew.map((n: any) => <KV k={`${n.name} · ${n.def?.role ?? ''}`} v={n.post ?? (n.attached ? 'Seated' : 'On board')} />)}
        <KV k="Cryo pods" v="4 of 4 ready (Cryo-lab, 6 o'clock)" />
        <KV k="Suits" v="4 EVA suits stowed (Landing pod 1)" />
        <p class="note">Hibernation for the long transfer is managed from the cryo-lab once the ship departs Earth orbit.</p>
      </div>
    );
  } else if (tab === 'systems') {
    body = (
      <div class="grid2">
        <div>
          <h4>Life support</h4>
          <KV k="Cabin pressure" v="101.3 kPa" />
          <KV k="O₂ partial pressure" v="21.2 kPa" />
          <KV k="CO₂" v="0.31 kPa · scrubbers nominal" />
          <KV k="Water recovery" v="93 % (Habitat B)" />
          <KV k="Temperature" v="21.4 °C" />
        </div>
        <div>
          <h4>Propulsion and power</h4>
          <KV k="Main engine modules" v="4 · standing by (2, 4, 8, 10 o'clock)" />
          <KV k="Spin thrusters" v={Math.abs(e.targetRate - e.rate) > 1e-3 ? 'Firing' : 'Idle'} />
          <KV k="Mass" v={`${(ENDURANCE.mass / 1000).toFixed(0)} t`} />
          <KV k="Ring airlocks" v="4 · sealed" />
        </div>
      </div>
    );
  } else {
    body = <NavTab game={game} />;
  }
  return <PanelFrame title="Endurance · command computer" sub="Ship systems" close={close} tabs={TABS} tab={tab} setTab={setTab}>{body}</PanelFrame>;
}
