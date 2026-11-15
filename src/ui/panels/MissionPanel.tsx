import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { PanelFrame } from '../App';
import { useUI } from '../store';
import { LAUNCHER, LAZARUS, launcherDeltaV, mission } from '../../mission/Mission';

const TABS: [string, string][] = [
  ['decision', 'Authorization'], ['countdown', 'Launch'], ['telemetry', 'Telemetry'], ['trajectory', 'Trajectories'], ['fuel', 'Propellant'],
  ['crew', 'Crew'], ['config', 'Spacecraft'], ['saturn', 'Saturn nav'], ['wormhole', 'Wormhole'], ['planets', 'Lazarus worlds'], ['environment', 'Site'],
];

const AU = 1.495978707e11, MU_SUN = 1.32712440018e20, MU_EARTH = 3.986004418e14, R_EARTH = 6.371e6;
const KV = ({ k, v, warn }: { k: string; v: any; warn?: boolean }) => <div class="kv"><span>{k}</span><b style={warn ? { color: 'var(--warn)' } : {}}>{v}</b></div>;
const km = (m: number, d = 0) => `${(m / 1000).toFixed(d)} km`;
const kms = (v: number) => `${(v / 1000).toFixed(2)} km/s`;

/** The mission computers of the facility: everything the flight controllers see, and the commander's decision. */
export function MissionPanel({ game, close, tab: first }: { game: Game; close: () => void; tab?: string }) {
  useUI((s) => s.tick);
  const [tab, setTab] = useState(first ?? 'countdown');
  const [, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), 500); return () => clearInterval(t); }, []);
  const zone: any = game.zone;
  const staff = zone?.nasaStaff;
  const dv = launcherDeltaV();
  const L = LAUNCHER;
  let body: any = null;

  if (tab === 'decision') {
    body = (
      <div>
        <p class="lead">Mission authorization — Endurance expedition. As mission commander the decision is yours alone, and it may be changed at any time before engine start.</p>
        <div class="grid2">
          <div class="card">
            <h4>Continue research on Earth</h4>
            <p>Remain at the facility or return to the farm. The crew keeps training, analysing the Lazarus data and maintaining Ranger 1. No departure is scheduled and no timer runs.</p>
            <button class={'btn' + (mission.choice === 'earth' ? ' on' : '')} onClick={() => { bus.emit('ui:click'); mission.decide('earth'); setN((n) => n + 1); }}>Continue research on Earth</button>
          </div>
          <div class="card">
            <h4>Begin Endurance mission</h4>
            <p>The crew collects its equipment, completes pre-flight checks and reports to the crew access arm in the launch cavern. Board Ranger 1 there when you are ready; the launch computer does the rest, or you may fly the ascent yourself.</p>
            <button class={'btn warn' + (mission.choice === 'endurance' ? ' on' : '')} onClick={() => { bus.emit('ui:click'); mission.decide('endurance'); setN((n) => n + 1); }}>Begin Endurance mission</button>
          </div>
        </div>
        <KV k="Current status" v={mission.choice === 'none' ? 'No decision recorded' : mission.choice === 'earth' ? 'Research continues on Earth' : `Endurance mission authorised — phase: ${mission.phase}`} />
      </div>
    );
  } else if (tab === 'countdown') {
    const ready = staff?.crewReady?.() ?? false;
    body = (
      <div class="grid2">
        <div>
          <h4>Launch status</h4>
          <KV k="Mission phase" v={mission.phase.toUpperCase()} />
          <KV k="Countdown" v={mission.countdown >= 0 ? `T−${mission.countdown.toFixed(0)} s${mission.hold ? ' (HOLD)' : ''}` : 'Not started'} />
          <KV k="Commander's authorization" v={mission.choice === 'endurance' ? 'GO' : 'Not given'} warn={mission.choice !== 'endurance'} />
          <KV k="Crew at access arm" v={ready ? 'All three ready' : `${staff?.crew?.filter((c: any) => c.state.flags.ready).length ?? 0} of 3`} warn={!ready} />
          <KV k="Propellant load" v="Stage 1 100 % · Stage 2 100 %" />
          <KV k="Silo cap" v={zone?.nasa?.siloOpen > 0.99 ? 'OPEN' : zone?.nasa?.siloOpen > 0.01 ? 'Moving' : 'Closed (opens at T−60 s)'} />
          <KV k="Umbilical arms" v={zone?.nasa?.armsRetract > 0.9 ? 'Retracted' : 'Connected'} />
          <p class="note">The countdown is started from the commander's seat in Ranger 1. Nothing here launches the vehicle without you aboard.</p>
        </div>
        <div>
          <h4>Mission log</h4>
          <div class="log">{mission.log.slice(-12).reverse().map((l) => <p>{l.text}</p>)}{!mission.log.length && <p>No entries.</p>}</div>
        </div>
      </div>
    );
  } else if (tab === 'telemetry') {
    const fl = game.services.flight?.telemetry?.();
    body = (
      <div class="grid2">
        <div>
          <h4>Ranger 1</h4>
          {fl ? Object.entries(fl).map(([k, v]) => <KV k={k} v={String(v)} />) : <>
            <KV k="State" v="Mated to launch vehicle, silo" /><KV k="Altitude" v="0 m (pit datum −40 m)" /><KV k="Velocity" v="0.0 m/s" /><KV k="Cabin pressure" v="101.2 kPa" /><KV k="Main bus" v="28.1 V · ground power" /></>}
        </div>
        <div>
          <h4>Launch vehicle</h4>
          <KV k="Lift-off mass" v={`${(dv.m0 / 1000).toFixed(1)} t`} /><KV k="Lift-off thrust" v={`${(L.stage1.thrust / 1e6).toFixed(2)} MN`} /><KV k="Thrust / weight" v={dv.twr.toFixed(2)} />
          <KV k="Stage 1 burn" v={`${L.stage1.burn.toFixed(0)} s`} /><KV k="Stage 2 burn" v={`${L.stage2.burn.toFixed(0)} s`} />
        </div>
      </div>
    );
  } else if (tab === 'trajectory') {
    const r1 = R_EARTH + 400e3, v1 = Math.sqrt(MU_EARTH / r1), T1 = 2 * Math.PI * Math.sqrt(r1 ** 3 / MU_EARTH);
    const ra = AU, rb = 9.5826 * AU, a = (ra + rb) / 2;
    const tH = Math.PI * Math.sqrt(a ** 3 / MU_SUN), dvH = Math.sqrt(MU_SUN / ra) * (Math.sqrt((2 * rb) / (ra + rb)) - 1);
    body = (
      <div class="grid2">
        <div>
          <h4>Ascent target</h4>
          <KV k="Parking orbit" v="400 km circular, 28.5°" /><KV k="Orbital speed" v={kms(v1)} /><KV k="Period" v={`${(T1 / 60).toFixed(1)} min`} /><KV k="Rendezvous" v="Endurance, same orbit, phase 0.8° ahead" />
        </div>
        <div>
          <h4>Earth → Saturn</h4>
          <KV k="Minimum-energy transfer" v={`${(tH / 31557600).toFixed(2)} years`} /><KV k="Departure Δv (heliocentric)" v={kms(dvH)} />
          <KV k="Planned fast transfer" v="≈ 2 years, Mars gravity assist" /><KV k="Arrival" v="Saturn orbit, wormhole station-keeping" />
        </div>
      </div>
    );
  } else if (tab === 'fuel') {
    body = (
      <div class="grid2">
        <div>
          <h4>Predicted performance</h4>
          <KV k="Stage 1 ideal Δv" v={kms(dv.dv1)} /><KV k="Stage 2 ideal Δv" v={kms(dv.dv2)} /><KV k="Total" v={kms(dv.total)} />
          <KV k="Required to orbit (with losses)" v="≈ 9.30 km/s" /><KV k="Margin" v={kms(dv.total - 9300)} warn={dv.total - 9300 < 150} />
        </div>
        <div>
          <h4>Loads</h4>
          <KV k="Stage 1 propellant" v={`${(L.stage1.prop / 1000).toFixed(0)} t`} /><KV k="Stage 2 propellant" v={`${(L.stage2.prop / 1000).toFixed(0)} t`} />
          <KV k="Ranger 1 at separation" v={`${(L.ranger / 1000).toFixed(1)} t`} /><KV k="Endurance reserve" v="Full — refuels docked craft in 10 s" />
        </div>
      </div>
    );
  } else if (tab === 'crew') {
    const list: any[] = staff ? [...staff.crew] : [];
    body = (
      <div>
        {list.map((c) => (
          <div class="card">
            <h4>{c.name}<small> {c.state.role}</small></h4>
            <KV k="Location" v={zone?.nasa?.area(c.pos) ?? c.state.location} /><KV k="Activity" v={c.state.task} /><KV k="Condition" v={`${c.state.health} % · ${c.state.emotion}`} /><KV k="Equipment" v={c.state.equipment.join(', ')} />
          </div>
        ))}
        {!list.length && <p>No crew data.</p>}
      </div>
    );
  } else if (tab === 'config') {
    body = (
      <div class="grid2">
        <div>
          <h4>Endurance</h4>
          <KV k="Ring diameter" v="64 m, 12 modules" /><KV k="Spin for gravity" v="5.25 rpm → 0.99 g at the rim" /><KV k="Habitat / command / cryo" v="2 / 1 / 1 modules" /><KV k="Engine modules" v="4" /><KV k="Landing pods" v="4" />
          <KV k="Docked craft" v="Ranger 2 · Lander 1 · Lander 2" /><KV k="Free port" v="Axial forward (for Ranger 1)" />
        </div>
        <div>
          <h4>Ranger 1</h4>
          <KV k="Length / span" v="17.4 m / 9.1 m" /><KV k="Crew" v="4" /><KV k="Role" v="Orbit, atmosphere, surface landing" /><KV k="Docking" v="Rear hatch, manual or automatic" />
        </div>
      </div>
    );
  } else if (tab === 'saturn') {
    body = (
      <div class="grid2">
        <div>
          <h4>Saturn</h4>
          <KV k="Mean distance from the Sun" v="9.58 AU (1.43 billion km)" /><KV k="Orbital period" v="29.46 years" /><KV k="Light time from Earth" v="≈ 71 to 87 min" />
        </div>
        <div>
          <h4>Approach plan</h4>
          <KV k="Capture" v="Retrograde burn at periapsis" /><KV k="Station" v="Co-orbit with the anomaly, 1.2 million km from Saturn" /><KV k="Entry" v="Manual or computer-guided, any attitude" />
        </div>
      </div>
    );
  } else if (tab === 'wormhole') {
    body = (
      <div>
        <p class="lead">First detected 48 years ago as a gravitational disturbance near Saturn. It is a sphere, not a hole: from every direction it shows the distorted starfield of another galaxy.</p>
        <KV k="Apparent diameter" v="≈ 2 km throat" /><KV k="Stability" v="No measurable decay in 48 years" /><KV k="Far side" v="Galaxy ≈ 10 billion light-years away; system of the black hole Gargantua" />
        <KV k="Transit" v="Bulk shortcut, ≈ minutes of ship time, no tidal damage observed by probes" /><KV k="Origin" v="Unknown. Artificial placement is the working assumption." />
      </div>
    );
  } else if (tab === 'planets') {
    body = (
      <div class="grid3">
        {LAZARUS.map((w) => (
          <div class="card">
            <h4>{w.name}</h4>
            <KV k="Scout" v={w.scout} /><KV k="Beacon" v={w.status.replace('Beacon: ', '')} /><KV k="Gravity" v={`${w.gravity} g`} /><KV k="Day" v={w.day} /><KV k="Time dilation" v={w.dilation} />
            <p>{w.surface}.</p><p class="note">{w.risk}.</p>
          </div>
        ))}
      </div>
    );
  } else if (tab === 'environment') {
    const w = zone?.weather;
    body = (
      <div class="grid2">
        <div>
          <h4>Surface conditions</h4>
          <KV k="Local time" v={w ? `${String(Math.floor(w.hours)).padStart(2, '0')}:${String(Math.floor((w.hours % 1) * 60)).padStart(2, '0')}` : '—'} />
          <KV k="Sky" v={w ? w.kind : '—'} /><KV k="Wind" v={w ? `${(w.wind * 14).toFixed(0)} m/s` : '—'} warn={w?.wind > 1.2} />
          <KV k="Dust storm" v={w ? (w.storm === 'none' ? 'None' : w.storm) : '—'} warn={w && w.storm !== 'none'} /><KV k="Launch weather rule" v={w && w.storm !== 'none' ? 'VIOLATED — hold advised' : 'Within limits'} warn={w && w.storm !== 'none'} />
        </div>
        <div>
          <h4>Facility</h4>
          <KV k="Internal air" v="20.9 % O₂ · 21 °C" /><KV k="Outside air" v="19.6 % O₂ and falling" warn /><KV k="Power" v="Reactor hall nominal" /><KV k="Blast doors" v="Automatic — commander cleared" />
        </div>
      </div>
    );
  }
  return (
    <PanelFrame title="Mission systems" sub="Facility 7" close={close} tabs={TABS} tab={tab} setTab={setTab}>
      {body}
    </PanelFrame>
  );
}
