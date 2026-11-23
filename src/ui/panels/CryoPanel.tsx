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
 * Hibernation in the cryo-lab: the crew sleeps through the long coast. Opened at a pod, it offers the sleep (the
 * pod then plays its sequence: lid, climbing in, film, lid); once the lid has closed it is opened again in `sleep`
 * mode, where the voyage is propagated analytically to the wake time while the display counts the time, distance
 * and arrival down. Closing it wakes the crew (the pods play their sequence backward).
 */
export function CryoPanel({ game, close, mode, until, pod }: { game: Game; close: () => void; mode?: 'sleep'; until?: number | null; pod?: number }) {
  const o: any = game.zones.get('orbit');
  const [phase, setPhase] = useState<'brief' | 'sleep' | 'awake'>(mode === 'sleep' ? 'sleep' : 'brief');
  const [, setN] = useState(0);
  const run = useRef<{ t0: number; from: number; to: number; slept: number; arrived: string | null; rest: boolean } | null>(
    mode === 'sleep' ? { t0: performance.now(), from: o.voyageT, to: until ?? o.voyageT, slept: 0, arrived: null, rest: until === null || until === undefined || !o.voyage } : null);
  const v: TransferPlan | null = o.voyage;
  // into the pod: the panel closes and the pod's sequence runs (the sleep display comes back when the lid is shut)
  const enter = (u: number | null) => () => {
    bus.emit('ui:click');
    o.setWarp(1);
    close();
    bus.emit('cryo:sleep', { pod: pod ?? 0, until: u });
  };

  useEffect(() => {
    if (phase !== 'sleep') return;
    let raf = 0;
    const r0 = run.current!;
    if (!r0.rest) mission.note(`Crew in hibernation for ${fmtDuration(r0.to - r0.from)}.`);
    const DUR = r0.rest ? 3500 : 7000;
    const step = () => {
      const r = run.current!;
      const f = Math.min(1, (performance.now() - r.t0) / DUR);
      // ease in and out: the readouts start slowly, race, and settle
      const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      const target = r.from + (r.to - r.from) * e;
      const before = o.voyage;
      if (before && !r.rest) o.skipTo(target);
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
        <h2>Hypersleep pod</h2>
        <p>Hibernation is for the long coasts between worlds: lay in a course on the navigation console (command module, or any ship terminal) and make the departure burn, then sleep here until arrival.</p>
        <div class="actions"><button class="btn" onClick={enter(null)}>Rest in the pod</button><button class="btn" onClick={close}>Close</button></div>
      </div></div>
    );
  }

  const left = v ? Math.max(0, v.tof - o.voyageT) : 0;
  const sleep = (u: number) => enter(Math.min(v!.tof, u));

  const status = () => {
    const vv: TransferPlan | null = o.voyage;
    return (
      <>
        <KV k="Mission elapsed time" v={fmtClock(o.met)} />
        <KV k="Earth reference" v={`${fmtClock(o.earthT)} · ${date(o.jd)}`} />
        <KV k="Destination" v={vv ? BODY[vv.to].name : run.current?.arrived ?? o.body.name} />
        <KV k="Distance remaining" v={vv ? fmtDistance(distanceRemaining(vv, o.voyageT)) : run.current?.arrived ? 'arrived' : 'no voyage under way'} />
        <KV k="Estimated arrival" v={vv ? `${fmtDuration(Math.max(0, vv.tof - o.voyageT))} · ${date(vv.jdDepart + vv.tof / DAY)}` : run.current?.arrived ? 'arrived' : '—'} />
        <KV k="Spacecraft status" v={`${vv ? 'coasting · drive cold' : 'in parking orbit'} · ring ${o.endurance.rpm.toFixed(1)} rpm · hull nominal`} />
        <KV k="Crew status" v={phase === 'sleep' ? (run.current?.rest ? 'Commander resting · pod sealed' : '4 in hibernation · 3.5 °C · vitals stable') : '4 awake · vitals nominal'} />
      </>
    );
  };

  if (phase === 'brief') {
    return (
      <div class="layer cryo interactive"><div class="pod">
        <h2>Hibernation · {BODY[v!.to].name}</h2>
        {status()}
        <div class="actions">
          <button class="btn" onClick={sleep(v!.tof)}>Sleep until arrival</button>
          {left > 60 * DAY && <button class="btn" onClick={sleep(o.voyageT + 30 * DAY)}>Sleep 30 days</button>}
          {o.voyageT < v!.tof / 2 && <button class="btn" onClick={sleep(v!.tof / 2)}>Wake at the halfway point</button>}
          <button class="btn" onClick={close}>Stay awake</button>
        </div>
        <p>The pods cool the body to a few degrees and slow its metabolism ten-fold: the crew ages a little over a month a year. The ship's computer flies the capture burn; the crew wakes in orbit at {BODY[v!.to].name}.</p>
      </div></div>
    );
  }

  const r = run.current!;
  const f = r.to > r.from ? Math.min(1, ((o.voyage ? o.voyageT : r.to) - r.from) / (r.to - r.from)) : 1;
  return (
    <div class={'layer cryo interactive' + (phase === 'sleep' ? ' deep' : '')}><div class="pod">
      <h2>{phase === 'sleep' ? (r.rest ? 'Resting' : 'Hibernation') : r.arrived ? `Arrived · ${r.arrived}` : 'Revival complete'}</h2>
      {status()}
      <div class="bar"><i style={{ width: `${(f * 100).toFixed(1)}%` }} /></div>
      {phase === 'awake' && <>
        <p>{r.rest ? 'The pod has kept you a while.' : `Slept ${fmtDuration(r.slept)}.`}{r.arrived ? ` The ship made its capture burn and is in orbit.` : ''} The pod opens when you wake.</p>
        <div class="actions"><button class="btn" onClick={() => { bus.emit('ui:click'); close(); }}>Wake up</button></div>
      </>}
    </div></div>
  );
}
