import { useMemo, useState } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { BODIES, BODY, LAZARUS_DESTINATIONS, parkAlt, parkingOverride, SOL_DESTINATIONS, surfaceGravity } from '../../space/Bodies';
import { calendarDate } from '../../space/Ephemeris';
import { ENDURANCE_DV, fmtDistance, fmtDuration, planVoyage, TransferPlan, voyagePosition, distanceRemaining } from '../../space/Voyage';
import { fmtClock } from '../../world/space/OrbitZone';

const KV = ({ k, v, warn }: { k: string; v: any; warn?: boolean }) => <div class="kv"><span>{k}</span><b style={warn ? { color: 'var(--warn)' } : {}}>{v}</b></div>;
const kms = (v: number) => `${(v / 1000).toFixed(2)} km/s`;
const date = (jd: number) => { const c = calendarDate(jd); return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`; };
const WARPS = [1, 10, 100, 1000, 10000, 86400];

/** Destinations reachable from where the Endurance is: its own planetary system, or Gargantua's beyond the wormhole. */
function destinations(here: string) {
  const sys = BODY[here].system;
  if (sys === 'gargantua') return { groups: [['Gargantua system', [...LAZARUS_DESTINATIONS.filter((d) => BODY[d].system === 'gargantua'), 'gate']]] as [string, string[]][] };
  const moons = (p: string) => BODIES.filter((b) => b.parent === p && b.kind !== 'wormhole' && b.R > 150e3).map((b) => b.id);
  const planets = SOL_DESTINATIONS.filter((d) => BODY[d].parent === 'sun');
  const groups: [string, string[]][] = planets.map((p) => [BODY[p].name, [p, ...moons(p)]]);
  // the wormhole orbits Saturn: it is reached from the Saturn system (the film's route: two years to Saturn first)
  const atSaturn = here === 'saturn' || BODY[here].parent === 'saturn';
  groups.push(['Lazarus mission · wormhole' + (atSaturn ? '' : ' (reach Saturn first)'), atSaturn ? ['wormhole'] : []]);
  return { groups };
}

/**
 * The Endurance's navigation console: where the ship is, where it can go from here, the transfer options with
 * their real costs and times, the departure burn, and time compression while coasting.
 */
export function NavTab({ game }: { game: Game }) {
  const o: any = game.zones.get('orbit');
  const [dest, setDest] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, bump] = useState(0);
  const here: string = o.body.id;
  const jdDay = Math.floor(o.jd * 4) / 4;
  // the options as they would be flown from this orbit now (burn point, escape and capture legs, true costs)
  const survey = !!dest && !!BODY[dest]?.surveyAlt && parkingOverride[dest] === BODY[dest].surveyAlt;
  const plans: TransferPlan[] = useMemo(() => (dest && o.mode === 'orbit' ? planVoyage(here, dest, o.jd).map((p) => o.prepareVoyage(p).plan) : []), [dest, here, jdDay, o.mode, survey]);
  const left = ENDURANCE_DV - o.dvUsed;
  const click = (f: () => void) => () => { bus.emit('ui:click'); f(); };

  if (o.pending) {
    const p: TransferPlan = o.pending.plan;
    return (
      <div>
        <h4>Departure scheduled · {BODY[p.to].name}</h4>
        <KV k="Burn in" v={fmtDuration(Math.max(0, o.pending.burnMet - o.met))} />
        <KV k="Departure burn" v={kms(p.dvDepart)} />
        <KV k="Time of flight" v={fmtDuration(p.tof)} />
        <p class="note">The ship coasts round its parking orbit under time compression to the point where the escape hyperbola leaves along the transfer.</p>
        <button class="btn warn" onClick={click(() => o.cancelDeparture())}>Cancel departure</button>
      </div>
    );
  }

  if (o.mode === 'cruise' && o.voyage) {
    const v: TransferPlan = o.voyage;
    const p = voyagePosition(v, o.voyageT);
    const f = Math.min(1, o.voyageT / v.tof);
    const sunD = p ? Math.hypot(p.r[0], p.r[1], p.r[2]) : 0;
    const vh = p ? Math.hypot(p.v[0], p.v[1], p.v[2]) : 0;
    return (
      <div class="grid2">
        <div>
          <h4>Cruise · {BODY[v.from].name} → {BODY[v.to].name}</h4>
          <div class="progress"><i style={{ width: `${(f * 100).toFixed(1)}%` }} /></div>
          <KV k="Leg" v={v.label} />
          <KV k="Elapsed on this leg" v={fmtDuration(o.voyageT)} />
          <KV k="Estimated arrival" v={`${fmtDuration(Math.max(0, v.tof - o.voyageT))} · ${date(v.jdDepart + v.tof / 86400)}`} />
          <KV k="Distance to go" v={fmtDistance(distanceRemaining(v, o.voyageT))} />
          {p && v.center === 'sun' && <KV k="From the Sun" v={fmtDistance(sunD)} />}
          {p && <KV k={v.center === 'sun' ? 'Heliocentric speed' : 'Speed'} v={kms(vh)} />}
          <KV k="Capture burn on arrival" v={kms(v.dvArrive)} />
        </div>
        <div>
          <h4>Time</h4>
          <KV k="Mission elapsed (ship)" v={fmtClock(o.met)} />
          <KV k="Earth reference" v={fmtClock(o.earthT)} />
          <KV k="Clock rate here" v={`${o.dilation().toFixed(o.dilation() > 1.0001 ? 4 : 1)} Earth s per ship s`} />
          <div class="row" style={{ marginTop: '10px' }}><span>Time compression</span>
            <div class="seg">{WARPS.map((w) => <button class={o.warp === w ? 'on' : ''} onClick={click(() => o.setWarp(w))}>{w === 86400 ? '1 d/s' : `×${w}`}</button>)}</div>
          </div>
          <p class="note">Coasting: the ship follows its transfer arc under the Sun's gravity (two-body Kepler propagation); the planets move on their JPL orbits. For the long legs the crew goes into hibernation in the cryo-lab (module 6), which skips ahead to arrival.</p>
        </div>
      </div>
    );
  }

  if (o.traverse) {
    const T = o.traverse;
    return (
      <div>
        <h4>Wormhole passage</h4>
        <KV k="Distance from the throat" v={`${(T.l / 1000).toFixed(2)} km ${T.crossed ? '(through)' : ''}`} />
        <KV k="Approach speed" v={`${T.v.toFixed(0)} m/s`} />
        <p class="note">{T.manual ? 'Manual: throttle up / down sets the approach speed; reverse to abort before the throat.' : 'Automatic: the computer eases the ship through the throat and out to the far station.'}</p>
      </div>
    );
  }

  const { groups } = destinations(here);
  const mouth = o.body.kind === 'wormhole';
  const T = BODY[dest ?? here];
  return (
    <div class="grid2">
      <div>
        <h4>Position</h4>
        <KV k="Orbiting" v={o.body.kind === 'wormhole' ? `Holding station at the ${o.body.name.toLowerCase()} · ${(o.rE / 1000).toFixed(0)} km` : `${o.body.name} · ${((o.rE - o.body.R) / 1000).toFixed(0)} km circular`} />
        {o.n > 0 && <KV k="Period" v={fmtDuration((2 * Math.PI) / o.n)} />}
        <KV k="Ship clock (MET)" v={fmtClock(o.met)} />
        <KV k="Earth reference" v={`${fmtClock(o.earthT)} · ${date(o.jd)}`} />
        <KV k="Drive Δv remaining" v={`${(left / 1000).toFixed(1)} of ${(ENDURANCE_DV / 1000).toFixed(0)} km/s`} warn={left < 5000} />
        {o.body.station && o.body.surveyAlt && o.mode === 'orbit' && (() => {
          const b = o.body, low = Math.abs(parkAlt(b) - b.surveyAlt) < 1000;
          const alt = low ? b.parkingAlt : b.surveyAlt;
          const c = o.orbitChange(alt);
          return (
            <div class="plan">
              <b>{low ? 'Survey orbit' : 'Parking orbit'} · {b.station.name}</b>
              <p class="note" style={{ marginTop: 0 }}>{low ? `The Endurance is in the ${(b.surveyAlt / 1000).toFixed(0)} km survey orbit, below the radiation belts (as Juno flew), from which Ranger 1 can fly down to ${b.station.name} at the 1-bar level.` : `${b.station.name} floats at the 1-bar level. Landings are flown from the ${(b.surveyAlt / 1000).toFixed(0)} km survey orbit: the descent from this high orbit would take the Ranger round a planet spinning faster than its orbit with no way to time the arrival, and the climb back would need over 50 km/s.`}</p>
              <KV k={low ? 'Climb back to the parking orbit' : 'Transfer down to the survey orbit'} v={`${(c.dv / 1000).toFixed(2)} km/s · ${fmtDuration(c.time)}`} warn={c.dv > left} />
              <button class="btn" onClick={click(() => { const e = o.changeOrbit(alt); setErr(e); bump((n) => n + 1); })}>{low ? 'Climb to the parking orbit' : 'Transfer to the survey orbit'}</button>
            </div>
          );
        })()}
        {mouth && (
          <div class="plan">
            <b>The wormhole</b>
            <p class="note" style={{ marginTop: 0 }}>A sphere {(o.body.R * 2 / 1000).toFixed(0)} km across: a lens, not a gravity well. Inside it the {o.body.system === 'sol' ? "other galaxy, with Gargantua at the centre" : 'Solar System, with Saturn'}; round its edge the stars of this sky, bent and repeated in a ring. The passage takes about a minute.</p>
            <button class="btn" onClick={click(() => { const e = o.startTraversal(false); setErr(e); if (!e) game.closePanel?.(); })}>Enter the wormhole · automatic</button>{' '}
            <button class="btn" onClick={click(() => { const e = o.startTraversal(true); setErr(e); if (!e) game.closePanel?.(); })}>Manual approach</button>
          </div>
        )}
        <h4 style={{ marginTop: '14px' }}>Destinations</h4>
        <div class="dest">
          {groups.map(([g, ids]) => (
            <div class="dgroup"><span>{g}</span>
              {ids.filter((id) => id !== here).map((id) => <button class={'btn' + (dest === id ? ' on' : '')} onClick={click(() => { setDest(id); setErr(null); })}>{BODY[id].name}</button>)}
            </div>
          ))}
        </div>
      </div>
      <div>
        {!dest && <p class="note">Choose a destination. Transfers are solved as Lambert arcs between the planets' real positions on the departure and arrival dates; the burns are from this parking orbit and into the target's, with the Oberth gain of burning low in each gravity well.</p>}
        {dest && <>
          <h4>{T.name}</h4>
          <p class="note" style={{ marginTop: 0 }}>{T.blurb}</p>
          {T.GM > 0 && T.kind !== 'gas' && <KV k="Surface gravity" v={`${(surfaceGravity(T) / 9.80665).toFixed(2)} g`} />}
          {T.landing && <KV k="Landing site" v={T.landing.site} />}
          {T.surveyAlt && (
            <div class="row" style={{ marginTop: '8px' }}><span>Capture into</span>
              <div class="seg">
                <button class={!survey ? 'on' : ''} onClick={click(() => { delete parkingOverride[dest!]; bump((n) => n + 1); })}>{(T.parkingAlt / 1000).toFixed(0)} km parking orbit</button>
                <button class={survey ? 'on' : ''} onClick={click(() => { parkingOverride[dest!] = T.surveyAlt!; bump((n) => n + 1); })}>{(T.surveyAlt / 1000).toFixed(0)} km survey orbit (station landing)</button>
              </div>
            </div>
          )}
          {plans.length === 0 && <p class="note">No transfer found from here.</p>}
          {plans.map((p) => {
            const need = p.dvDepart + p.dvArrive;
            return (
              <div class="plan">
                <b>{p.label}</b>
                <KV k="Burn" v={(p.wait ?? 0) > 60 ? `in ${fmtDuration(p.wait!)} (at the right point of the orbit)` : 'now'} />
                <KV k="Time of flight" v={fmtDuration(p.tof)} />
                <KV k="Arrival (Earth date)" v={date(p.jdDepart + p.tof / 86400)} />
                <KV k="Departure burn" v={kms(p.dvDepart)} />
                <KV k={T.kind === 'wormhole' ? 'Braking at the wormhole' : 'Capture burn'} v={kms(p.dvArrive)} />
                <KV k="Total" v={kms(need)} warn={need > left} />
                {p.vInfDepart > 0 && <KV k="Hyperbolic excess (departure)" v={kms(p.vInfDepart)} />}
                <button class="btn" onClick={click(() => { const e = o.departVoyage(planVoyage(here, dest!, o.jd).find((q) => q.kind === p.kind) ?? p); setErr(e); if (!e) game.closePanel?.(); })}>Execute departure burn</button>
              </div>
            );
          })}
          {err && <p class="note" style={{ color: 'var(--warn)' }}>{err}</p>}
        </>}
      </div>
    </div>
  );
}
