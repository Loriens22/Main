import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { PanelFrame } from '../App';
import type { LaunchDirector } from '../../mission/Launch';
import { launcherDeltaV } from '../../mission/Mission';

const Step = ({ n, label, state, detail, children }: { n: number; label: string; state: 'done' | 'active' | 'wait' | 'run'; detail?: string; children?: any }) => (
  <div class={`kv step ${state}`}>
    <span>{n}. {label}{detail && <em style={{ marginLeft: '8px', color: 'var(--dim)' }}>{detail}</em>}</span>
    <b>{state === 'done' ? 'COMPLETE' : state === 'run' ? 'IN PROGRESS' : children ?? (state === 'active' ? '' : '—')}</b>
  </div>
);

/** Ranger 1 launch computer: the pre-launch checklist, guidance mode, compressed time, and the count. */
export function LaunchPanel({ game, close }: { game: Game; close: () => void }) {
  const [, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), 200); return () => clearInterval(t); }, []);
  const d = game.services.launch as LaunchDirector;
  const c = d.check;
  const click = (f: () => void) => () => { bus.emit('ui:click'); f(); setN((n) => n + 1); };
  const pre = d.state === 'prep';
  const flying = d.state === 'liftoff' || d.state === 'ascent';
  const dv = launcherDeltaV();
  const sim = d.sim;
  return (
    <PanelFrame title="Launch computer" sub="Ranger 1 · stack configuration" close={close}>
      <div class="grid2">
        <div>
          <h4>Pre-launch checklist</h4>
          <Step n={1} label="Crew boarding" state={c.crew ? 'done' : 'wait'} detail="commander + 3" />
          <Step n={2} label="Airlock closure" state={c.hatch ? 'done' : pre ? 'active' : 'wait'}>{pre && !c.hatch && <button class="btn" onClick={click(() => d.closeHatch())}>Close hatch</button>}</Step>
          <Step n={3} label="Cabin pressurisation" state={c.pressure >= 1 ? 'done' : c.pressure > 0 ? 'run' : c.hatch && pre ? 'active' : 'wait'} detail={c.pressure > 0 ? `${(c.pressure * 101.3).toFixed(1)} kPa` : ''}>
            {pre && c.hatch && c.pressure <= 0 && <button class="btn" onClick={click(() => d.pressurize())}>Pressurise</button>}
          </Step>
          <Step n={4} label="Launch computer initialisation" state={c.computer >= 1 ? 'done' : c.computer > 0 ? 'run' : c.pressure >= 1 && pre ? 'active' : 'wait'} detail={c.computer > 0 && c.computer < 1 ? `${Math.round(c.computer * 100)} %` : ''}>
            {pre && c.pressure >= 1 && c.computer <= 0 && <button class="btn" onClick={click(() => d.initComputer())}>Initialise</button>}
          </Step>
          <h4 style={{ marginTop: '14px' }}>Ascent guidance</h4>
          <div class="row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button class={'btn' + (d.mode === 'auto' ? ' on' : '')} disabled={!pre} onClick={click(() => { d.mode = 'auto'; })}>Autopilot ascent</button>
            <button class={'btn' + (d.mode === 'manual' ? ' on' : '')} disabled={!pre} onClick={click(() => { d.mode = 'manual'; })}>Manual steering</button>
          </div>
          <p class="note">Manual: W / S pitch the stack (the flight director shows the guidance pitch), SHIFT / CTRL throttle. Staging and the insertion cut-off stay automatic; guidance takes over if the climb turns unsafe.</p>
          <h4>Compressed time during the climb</h4>
          <div class="row" style={{ display: 'flex', gap: '8px' }}>
            {[1, 2, 4, 10].map((w) => <button class={'btn' + (d.warp === w ? ' on' : '')} onClick={click(() => { d.warp = w; })}>{w}×</button>)}
          </div>
        </div>
        <div>
          <h4>Count</h4>
          {pre && (
            <div class="row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button class="btn warn" onClick={click(() => { d.fullAuto(); close(); })}>FULL LAUNCH AUTOPILOT</button>
              <button class="btn" disabled={!d.ready()} onClick={click(() => { if (d.startCount()) close(); })}>Start count (T−60)</button>
            </div>
          )}
          {d.state === 'countdown' && (
            <div class="row" style={{ display: 'flex', gap: '8px' }}>
              <button class="btn" onClick={click(() => d.setHold(!d.hold))}>{d.hold ? 'Resume count' : 'Hold'}</button>
              <button class="btn warn" onClick={click(() => d.scrub())}>Scrub</button>
            </div>
          )}
          <div class="kv"><span>Status</span><b>{d.state === 'countdown' ? `T−${Math.max(0, -d.t).toFixed(0)} s${d.hold ? ' · HOLD' : ''}` : d.state.toUpperCase()}</b></div>
          <div class="kv"><span>Target orbit</span><b>400 km circular · 38.7°</b></div>
          <div class="kv"><span>Stack mass at ignition</span><b>{(dv.m0 / 1000).toFixed(0)} t · T/W {dv.twr.toFixed(2)}</b></div>
          <div class="kv"><span>Ideal Δv (stage 1 + 2)</span><b>{(dv.dv1 / 1000).toFixed(2)} + {(dv.dv2 / 1000).toFixed(2)} km/s</b></div>
          {flying && sim && (
            <>
              <div class="kv"><span>Altitude · speed</span><b>{(sim.h / 1000).toFixed(1)} km · {sim.speed.toFixed(0)} m/s</b></div>
              <div class="kv"><span>Downrange</span><b>{(sim.downrange / 1000).toFixed(0)} km</b></div>
              <div class="kv"><span>Pitch · guidance</span><b>{(sim.pitch * 57.3).toFixed(1)}° · {(sim.guidePitch * 57.3).toFixed(1)}°</b></div>
              <div class="kv"><span>Max-Q</span><b>{(sim.maxQ / 1000).toFixed(1)} kPa</b></div>
              <div class="row" style={{ marginTop: '8px' }}>
                <button class={'btn' + (sim.manual ? '' : ' on')} onClick={click(() => { sim.manual = !sim.manual; })}>{sim.manual ? 'Hand over to autopilot' : 'Take manual steering'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </PanelFrame>
  );
}
