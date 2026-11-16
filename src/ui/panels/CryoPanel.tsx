import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { BODY } from '../../space/Bodies';
import { calendarDate } from '../../space/Ephemeris';
import { distanceRemaining, fmtDistance, fmtDuration, TransferPlan } from '../../space/Voyage';
import { fmtClock } from '../../world/space/OrbitZone';
import { mission } from '../../mission/Mission';

const KV = ({ k, v }: { k: string; v: any }) => <div class="kv"><span>{k}</span><b>{v}</b></div>;
const date = (jd: number) => { const c = calendarDate(jd); return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`; };
const DAY = 86400;

/**
 * Hibernation in the cryo-lab: the crew sleeps through the long coast. The voyage is propagated analytically to
 * the wake time while the pod display counts the time, distance and arrival down.
 */
export function CryoPanel({ game, close }: { game: Game; close: () => void }) {
  const o: any = game.zones.get('orbit');
  const [phase, setPhase] = useState<'brief' | 'sleep' | 'awake'>('brief');
  const [, setN] = useState(0);
  const run = useRef<{ t0: number; from: number; to: number; slept: number; arrived: string | null } | null>(null);
  const v: TransferPlan | null = o.voyage;

  useEffect(() => {
    if (phase !== 'sleep') return;
    let raf = 0;
    const DUR = 7000;
    const step = () => {
      const r = run.current!;
      const f = Math.min(1, (performance.now() - r.t0) / DUR);
      // ease in and out: the readouts start slowly, race, and settle
      const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      const target = r.from + (r.to - r.from) * e;
      const before = o.voyage;
      if (before) o.skipTo(target);
      if (before && !o.voyage) r.arrived = BODY[before.to].name;
      setN((n) => n + 1);
      if (f < 1 && o.voyage) raf = requestAnimationFrame(step);
      else { r.slept = (o.voyage ? o.voyageT : r.to) - r.from; setPhase('awake'); bus.emit('sfx', { id: 'door_slide', gain: 0.4 }); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (!v && phase === 'brief') {
    return (
      <div class="layer cryo interactive"><div class="pod">
        <h2>Hibernation pod</h2>
        <p>Hibernation is for the long coasts between worlds. Lay in a course on the navigation console (command module, or any ship terminal) and make the departure burn first.</p>
        <div class="actions"><button class="btn" onClick={close}>Close</button></div>
      </div></div>
    );
  }

  const left = v ? Math.max(0, v.tof - o.voyageT) : 0;
  const margin = Math.min(DAY, left * 0.05);
  const sleep = (until: number) => () => {
    bus.emit('ui:click');
    o.setWarp(1);
    run.current = { t0: performance.now(), from: o.voyageT, to: Math.min(v!.tof, until), slept: 0, arrived: null };
    mission.note(`Crew in hibernation for ${fmtDuration(run.current.to - run.current.from)}.`);
    setPhase('sleep');
  };

  const status = () => {
    const vv: TransferPlan | null = o.voyage;
    return (
      <>
        <KV k="Mission elapsed time" v={fmtClock(o.met)} />
        <KV k="Earth reference" v={`${fmtClock(o.earthT)} · ${date(o.jd)}`} />
        <KV k="Destination" v={vv ? BODY[vv.to].name : run.current?.arrived ?? o.body.name} />
        <KV k="Distance remaining" v={vv ? fmtDistance(distanceRemaining(vv, o.voyageT)) : 'arrived'} />
        <KV k="Estimated arrival" v={vv ? `${fmtDuration(Math.max(0, vv.tof - o.voyageT))} · ${date(vv.jdDepart + vv.tof / DAY)}` : 'arrived'} />
        <KV k="Spacecraft status" v={`${vv ? 'coasting · drive cold' : 'in parking orbit'} · ring ${o.endurance.rpm.toFixed(1)} rpm · hull nominal`} />
        <KV k="Crew status" v={phase === 'sleep' ? '4 in hibernation · 3.5 °C · vitals stable' : '4 awake · vitals nominal'} />
      </>
    );
  };

  if (phase === 'brief') {
    return (
      <div class="layer cryo interactive"><div class="pod">
        <h2>Hibernation · {BODY[v!.to].name}</h2>
        {status()}
        <div class="actions">
          <button class="btn" onClick={sleep(v!.tof - margin)}>Sleep until arrival</button>
          {left > 60 * DAY && <button class="btn" onClick={sleep(o.voyageT + 30 * DAY)}>Sleep 30 days</button>}
          {o.voyageT < v!.tof / 2 && <button class="btn" onClick={sleep(v!.tof / 2)}>Wake at the halfway point</button>}
          <button class="btn" onClick={close}>Stay awake</button>
        </div>
        <p>The pods cool the body to a few degrees and slow its metabolism ten-fold: the crew ages a little over a month a year. The ship is woken {fmtDuration(margin)} before arrival for the capture burn.</p>
      </div></div>
    );
  }

  const r = run.current!;
  const f = r.to > r.from ? Math.min(1, ((o.voyage ? o.voyageT : r.to) - r.from) / (r.to - r.from)) : 1;
  return (
    <div class={'layer cryo interactive' + (phase === 'sleep' ? ' deep' : '')}><div class="pod">
      <h2>{phase === 'sleep' ? 'Hibernation' : r.arrived ? `Arrived · ${r.arrived}` : 'Revival complete'}</h2>
      {status()}
      <div class="bar"><i style={{ width: `${(f * 100).toFixed(1)}%` }} /></div>
      {phase === 'awake' && <>
        <p>Slept {fmtDuration(r.slept)}.{r.arrived ? ` The ship made its capture burn and is in orbit.` : ''}</p>
        <div class="actions"><button class="btn" onClick={() => { bus.emit('ui:click'); close(); }}>Wake up</button></div>
      </>}
    </div></div>
  );
}
