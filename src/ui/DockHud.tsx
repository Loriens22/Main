import { useUI } from './store';

const fmt = (v: number, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
const dist = (m: number) => (m < 1000 ? `${m.toFixed(m < 100 ? 2 : 1)} m` : `${(m / 1000).toFixed(2)} km`);

/**
 * Docking display: relative position and velocity, range, closing speed, alignment and attitude errors, clocking
 * and spin match, propellant, RCS mode, clearance, and the capture sequence. The reticle shows the port seen
 * from the craft's ring: the dot is the lateral offset, the bars the tilt of the docking axis, the arc the clocking.
 */
export function DockHud() {
  const d = useUI((s) => s.dock);
  const view = useUI((s) => s.view);
  const panel = useUI((s) => s.panel);
  if (!d || panel) return null;
  const ok = (b: boolean) => (b ? 'ok' : 'bad');
  // lateral offset on a log-like scale: 0.2 m at the inner ring, 2 m mid, 20 m at the edge
  const sc = (v: number) => Math.sign(v) * Math.min(1, Math.log10(1 + Math.abs(v) / 0.05) / Math.log10(1 + 20 / 0.05));
  const R = 70;
  const dx = sc(d.lx) * R, dy = -sc(d.ly) * R;
  const tx = Math.max(-1, Math.min(1, d.tiltX / 10)) * R, ty = -Math.max(-1, Math.min(1, d.tiltY / 10)) * R;
  const roll = (d.roll * Math.PI) / 180;
  const closeWarn = d.closing > Math.max(0.45, d.axial * 0.06);
  const reticle = (
    <svg viewBox="-90 -90 180 180" class="dock-reticle">
      <circle r={R} class="ring" />
      <circle r={R * Math.log10(1 + 2 / 0.05) / Math.log10(1 + 20 / 0.05)} class="ring dim" />
      <circle r={R * Math.log10(1 + 0.22 / 0.05) / Math.log10(1 + 20 / 0.05)} class={'ring cap ' + ok(d.lx * d.lx + d.ly * d.ly < 0.22 * 0.22)} />
      <line x1={-R - 8} y1={0} x2={R + 8} y2={0} class="axis" />
      <line x1={0} y1={-R - 8} x2={0} y2={R + 8} class="axis" />
      <line x1={tx} y1={-R + 4} x2={tx} y2={R - 4} class={'tilt ' + ok(Math.abs(d.tiltX) < 2)} />
      <line x1={-R + 4} y1={ty} x2={R - 4} y2={ty} class={'tilt ' + ok(Math.abs(d.tiltY) < 2)} />
      <path d={`M ${Math.sin(roll) * (R + 6)} ${-Math.cos(roll) * (R + 6)} L ${Math.sin(roll) * (R + 14)} ${-Math.cos(roll) * (R + 14)}`} class={'roll ' + ok(Math.abs(d.roll) < 12)} />
      <path d="M 0 -76 L -4 -84 L 4 -84 Z" class="rollref" />
      <circle cx={dx} cy={dy} r={5} class={'dot ' + ok(d.lx * d.lx + d.ly * d.ly < 0.22 * 0.22)} />
    </svg>
  );
  return (
    <>
      {view === 'dockcam' && (
        <div class="dockcam">
          <div class="frame" />
          <div class="label">DOCKING CAMERA · AFT · {dist(Math.max(0, d.axial))}</div>
          <div class="cross" />
          <div class="ticks">{[-3, -2, -1, 1, 2, 3].map((k) => <i style={{ left: `calc(50% + ${k * 9}vh)` }} />)}</div>
        </div>
      )}
      <div class="dockhud">
        <header><b>DOCKING</b><span>{d.target} · {d.port}</span></header>
        <div class="state"><span class={d.state === 'DOCKED' ? 'good' : ''}>{d.state}</span><span class={d.clearance.includes('OCCUPIED') || d.clearance.includes('RESERVED') ? 'bad' : 'good'}>{d.clearance}</span></div>
        {reticle}
        <div class="grid">
          <div><span>RANGE</span><b>{dist(d.range)}</b></div>
          <div><span>AXIAL</span><b>{dist(Math.max(0, d.axial))}</b></div>
          <div class={closeWarn ? 'bad' : ''}><span>CLOSING</span><b>{fmt(d.closing, 2)} m/s</b></div>
          <div><span>REL POS X · Y</span><b>{fmt(d.lx, 2)} · {fmt(d.ly, 2)} m</b></div>
          <div><span>REL VEL X · Y</span><b>{fmt(d.vx, 2)} · {fmt(d.vy, 2)}</b></div>
          <div class={d.align > 5 ? 'bad' : ''}><span>ALIGNMENT</span><b>{d.align.toFixed(1)}°</b></div>
          <div class={Math.abs(d.tiltX) > 5 || Math.abs(d.tiltY) > 5 ? 'bad' : ''}><span>ATT ERR P · Y</span><b>{fmt(d.tiltY, 1)}° · {fmt(d.tiltX, 1)}°</b></div>
          <div class={Math.abs(d.roll) > 12 ? 'bad' : ''}><span>CLOCKING</span><b>{fmt(d.roll, 1)}°</b></div>
          <div class={Math.abs(d.rollRate) > 3.5 ? 'bad' : ''}><span>SPIN MATCH</span><b>{fmt(d.rollRate, 1)}°/s</b></div>
          <div><span>TARGET SPIN</span><b>{d.spin.toFixed(2)} rpm</b></div>
          <div class={d.fuel < 0.15 ? 'bad' : ''}><span>PROPELLANT</span><b>{(d.fuel * 100).toFixed(0)} %</b></div>
          <div><span>RCS</span><b>{d.rcs}</b></div>
        </div>
        <div class="auto">{d.auto}{d.time >= 0 && <em> · {d.time.toFixed(0)} s</em>}</div>
        {d.issues.length > 0 && d.axial < 30 && <div class="issues">{d.issues.join(' · ')}</div>}
      </div>
    </>
  );
}
