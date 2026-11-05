// Dependency-free SVG charts (validated categorical palette: --s1..--s8; see dataviz checks in docs).

import { useMemo, useRef, useState, type ReactNode } from 'react';

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

export interface Pt { x: number; y: number; lo?: number; hi?: number; label?: string }
export interface Series { name: string; points: Pt[]; color?: string; dash?: boolean; band?: boolean }

type Scale = ((v: number) => number) & { ticks: number[]; fmt: (v: number) => string };

function niceTicks(a: number, b: number, n = 5): number[] {
  if (a === b) return [a];
  const span = b - a;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-12 * span; v += step) out.push(+v.toPrecision(12));
  return out;
}

const fmtNum = (v: number) => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e4 || a < 1e-3) return v.toExponential(0).replace('e', 'e');
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1).replace(/\.0$/, '');
  return (+v.toPrecision(3)).toString();
};

function makeScale(d0: number, d1: number, r0: number, r1: number, log: boolean, fmt?: (v: number) => string): Scale {
  if (log) {
    const l0 = Math.log10(d0), l1 = Math.log10(d1);
    const f = ((v: number) => r0 + ((Math.log10(Math.max(v, 1e-300)) - l0) / (l1 - l0)) * (r1 - r0)) as Scale;
    const ticks: number[] = [];
    for (let e = Math.ceil(l0 - 1e-9); e <= Math.floor(l1 + 1e-9); e++) ticks.push(10 ** e);
    f.ticks = ticks.length >= 2 ? ticks : [d0, d1];
    f.fmt = fmt ?? ((v) => `1e${Math.round(Math.log10(v))}`);
    return f;
  }
  const f = ((v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0)) as Scale;
  f.ticks = niceTicks(d0, d1);
  f.fmt = fmt ?? fmtNum;
  return f;
}

export function Legend({ items }: { items: { name: string; color: string; dash?: boolean }[] }) {
  if (items.length < 2) return null;
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.name}><i style={{ background: it.color, opacity: it.dash ? 0.7 : 1 }} />{it.name}</span>
      ))}
    </div>
  );
}

export interface LineChartProps {
  series: Series[];
  xLabel: string;
  yLabel: string;
  logX?: boolean;
  logY?: boolean;
  height?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  hLines?: { y: number; label: string }[];
  vLines?: { x: number; label: string }[];
  caption?: ReactNode;
  markers?: boolean;
}

export function LineChart(p: LineChartProps) {
  const W = 640, H = p.height ?? 300, m = { l: 58, r: 16, t: 14, b: 42 };
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const all = p.series.flatMap((s) => s.points);
  const xs = all.map((d) => d.x);
  const ys = all.flatMap((d) => [d.y, d.lo ?? d.y, d.hi ?? d.y]).filter((v) => !p.logY || v > 0);
  const xd = p.xDomain ?? [Math.min(...xs), Math.max(...xs)];
  let yd = p.yDomain ?? [Math.min(...ys), Math.max(...ys)];
  if (!p.yDomain) {
    if (p.logY) yd = [10 ** Math.floor(Math.log10(yd[0])), 10 ** Math.ceil(Math.log10(yd[1]))];
    else { const pad = (yd[1] - yd[0]) * 0.08 || 1; yd = [Math.min(0, yd[0]) === 0 && yd[0] >= 0 ? 0 : yd[0] - pad, yd[1] + pad]; }
  }
  const sx = makeScale(xd[0], xd[1], m.l, W - m.r, !!p.logX, p.xFmt);
  const sy = makeScale(yd[0], yd[1], H - m.b, m.t, !!p.logY, p.yFmt);
  const uniqX = useMemo(() => [...new Set(xs)].sort((a, b) => a - b), [JSON.stringify(xs)]);
  const colorOf = (s: Series, i: number) => s.color ?? SERIES[i % SERIES.length];
  const onMove = (e: React.MouseEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    uniqX.forEach((x, i) => { const d = Math.abs(sx(x) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };
  const hx = hover !== null ? uniqX[hover] : null;
  return (
    <figure>
      <div style={{ position: 'relative' }}>
        <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${p.yLabel} versus ${p.xLabel}`}>
          <g className="grid">{sy.ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} />)}</g>
          <g className="axis">
            <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
            {sx.ticks.map((t) => <text key={t} x={sx(t)} y={H - m.b + 16} textAnchor="middle">{sx.fmt(t)}</text>)}
            {sy.ticks.map((t) => <text key={t} x={m.l - 8} y={sy(t) + 4} textAnchor="end">{sy.fmt(t)}</text>)}
            <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">{p.xLabel}</text>
            <text transform={`translate(13 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle">{p.yLabel}</text>
          </g>
          {p.hLines?.map((h) => (
            <g key={h.label}><line x1={m.l} x2={W - m.r} y1={sy(h.y)} y2={sy(h.y)} stroke="var(--gold)" strokeDasharray="4 4" strokeWidth={1.2} />
              <text x={W - m.r - 4} y={sy(h.y) - 5} textAnchor="end" style={{ fill: 'var(--gold)' }}>{h.label}</text></g>
          ))}
          {p.vLines?.map((v) => (
            <g key={v.label}><line y1={m.t} y2={H - m.b} x1={sx(v.x)} x2={sx(v.x)} stroke="var(--gold)" strokeDasharray="4 4" strokeWidth={1.2} />
              <text x={sx(v.x) + 5} y={m.t + 12} style={{ fill: 'var(--gold)' }}>{v.label}</text></g>
          ))}
          {p.series.map((s, i) => {
            const c = colorOf(s, i);
            const pts = s.points.filter((d) => !p.logY || d.y > 0);
            const path = pts.map((d, k) => `${k ? 'L' : 'M'}${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`).join('');
            const band = s.band && pts.every((d) => d.lo !== undefined)
              ? pts.map((d, k) => `${k ? 'L' : 'M'}${sx(d.x)},${sy(Math.max(d.hi!, p.logY ? 1e-300 : -Infinity))}`).join('') +
                [...pts].reverse().map((d) => `L${sx(d.x)},${sy(Math.max(d.lo!, p.logY ? yd[0] : -Infinity))}`).join('') + 'Z'
              : null;
            return (
              <g key={s.name}>
                {band && <path d={band} fill={c} opacity={0.14} />}
                <path d={path} fill="none" stroke={c} strokeWidth={2} strokeDasharray={s.dash ? '6 5' : undefined} strokeLinejoin="round" />
                {!s.band && pts.map((d, k) => d.lo !== undefined && d.hi !== undefined && (
                  <line key={k} x1={sx(d.x)} x2={sx(d.x)} y1={sy(Math.max(d.lo, p.logY ? yd[0] : d.lo))} y2={sy(d.hi)} stroke={c} strokeWidth={1.4} />
                ))}
                {(p.markers ?? pts.length <= 24) && pts.map((d, k) => (
                  <circle key={k} cx={sx(d.x)} cy={sy(d.y)} r={hx === d.x ? 5.5 : 4} fill={c} stroke="var(--surface)" strokeWidth={2} />
                ))}
              </g>
            );
          })}
          {hx !== null && <line x1={sx(hx)} x2={sx(hx)} y1={m.t} y2={H - m.b} stroke="var(--fg-2)" strokeOpacity={0.35} />}
        </svg>
        {hx !== null && (
          <div className="tooltip" style={{ left: `${Math.min(70, (sx(hx) / W) * 100)}%`, top: 8 }}>
            <div style={{ color: 'var(--muted)' }}>{p.xLabel}: {sx.fmt(hx)}</div>
            {p.series.map((s, i) => {
              const d = s.points.find((q) => q.x === hx);
              return d ? <div key={s.name}><span style={{ color: colorOf(s, i) }}>■</span> {s.name}: {fmtFull(d.y)}{d.lo !== undefined ? ` [${fmtFull(d.lo)}, ${fmtFull(d.hi!)}]` : ''}</div> : null;
            })}
          </div>
        )}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Legend items={p.series.map((s, i) => ({ name: s.name, color: colorOf(s, i), dash: s.dash }))} />
        <button className="btn sm ghost" type="button" onClick={() => setTable(!table)} aria-pressed={table}>Table</button>
      </div>
      {table && <DataTable series={p.series} xLabel={p.xLabel} />}
      {p.caption && <figcaption>{p.caption}</figcaption>}
    </figure>
  );
}

export function fmtFull(v: number) {
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  return (+v.toPrecision(4)).toString();
}

function DataTable({ series, xLabel }: { series: Series[]; xLabel: string }) {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  return (
    <div className="table-wrap" style={{ maxHeight: 260 }}>
      <table>
        <thead><tr><th className="num">{xLabel}</th>{series.map((s) => <th key={s.name} className="num">{s.name}</th>)}</tr></thead>
        <tbody>{xs.map((x) => (
          <tr key={x}><td className="num">{fmtFull(x)}</td>{series.map((s) => {
            const d = s.points.find((p) => p.x === x);
            return <td key={s.name} className="num">{d ? fmtFull(d.y) : '—'}</td>;
          })}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export interface BarGroup { label: string; values: { name: string; v: number; lo?: number; hi?: number }[] }

export function BarChart({ groups, yLabel, height = 280, yDomain, logY, caption, refY, yFmt }: { groups: BarGroup[]; yLabel: string; height?: number; yDomain?: [number, number]; logY?: boolean; caption?: ReactNode; refY?: { y: number; label: string }; yFmt?: (v: number) => string }) {
  const W = 640, H = height, m = { l: 58, r: 12, t: 14, b: 54 };
  const [hover, setHover] = useState<{ g: number; s: number } | null>(null);
  const names = [...new Set(groups.flatMap((g) => g.values.map((v) => v.name)))];
  const vals = groups.flatMap((g) => g.values.flatMap((v) => [v.v, v.hi ?? v.v]));
  const yd = yDomain ?? (logY ? [10 ** Math.floor(Math.log10(Math.min(...vals.filter((v) => v > 0)))), 10 ** Math.ceil(Math.log10(Math.max(...vals)))] as [number, number] : [0, Math.max(...vals) * 1.1]);
  const sy = makeScale(yd[0], yd[1], H - m.b, m.t, !!logY, yFmt);
  const gw = (W - m.l - m.r) / groups.length;
  const bw = Math.min(28, (gw * 0.8) / names.length - 2);
  const base = sy(logY ? yd[0] : Math.max(0, yd[0]));
  return (
    <figure>
      <div style={{ position: 'relative' }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={yLabel} onMouseLeave={() => setHover(null)}>
          <g className="grid">{sy.ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} />)}</g>
          <g className="axis">
            <line x1={m.l} x2={W - m.r} y1={base} y2={base} />
            {sy.ticks.map((t) => <text key={t} x={m.l - 8} y={sy(t) + 4} textAnchor="end">{sy.fmt(t)}</text>)}
            <text transform={`translate(13 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
            {groups.map((g, gi) => (
              <text key={g.label} x={m.l + gw * (gi + 0.5)} y={H - m.b + 16} textAnchor="middle">{g.label.length > 16 ? g.label.slice(0, 15) + '…' : g.label}</text>
            ))}
          </g>
          {refY && <g><line x1={m.l} x2={W - m.r} y1={sy(refY.y)} y2={sy(refY.y)} stroke="var(--gold)" strokeDasharray="4 4" />
            <text x={W - m.r - 4} y={sy(refY.y) - 5} textAnchor="end" style={{ fill: 'var(--gold)' }}>{refY.label}</text></g>}
          {groups.map((g, gi) => g.values.map((v) => {
            const si = names.indexOf(v.name);
            const x = m.l + gw * gi + (gw - names.length * (bw + 2)) / 2 + si * (bw + 2);
            const y = sy(Math.max(v.v, logY ? yd[0] : -Infinity));
            const h = Math.max(1, base - y);
            const c = SERIES[si % SERIES.length];
            const r = Math.min(4, bw / 2, h);
            return (
              <g key={v.name} onMouseEnter={() => setHover({ g: gi, s: si })}>
                <rect x={x - 2} y={m.t} width={bw + 4} height={H - m.b - m.t} fill="transparent" />
                <path d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`} fill={c} opacity={hover && (hover.g !== gi || hover.s !== si) ? 0.55 : 1} />
                {v.lo !== undefined && v.hi !== undefined && (
                  <g stroke="var(--fg)" strokeWidth={1.3} opacity={0.85}>
                    <line x1={x + bw / 2} x2={x + bw / 2} y1={sy(Math.max(v.lo, logY ? yd[0] : v.lo))} y2={sy(v.hi)} />
                    <line x1={x + bw / 2 - 3} x2={x + bw / 2 + 3} y1={sy(v.hi)} y2={sy(v.hi)} />
                  </g>
                )}
              </g>
            );
          }))}
        </svg>
        {hover && (() => {
          const g = groups[hover.g];
          const v = g.values.find((q) => q.name === names[hover.s]);
          if (!v) return null;
          return <div className="tooltip" style={{ left: `${Math.min(68, ((m.l + gw * (hover.g + 0.5)) / W) * 100)}%`, top: 6 }}>
            <div style={{ color: 'var(--muted)' }}>{g.label}</div>
            <div><span style={{ color: SERIES[hover.s % 8] }}>■</span> {v.name}: {fmtFull(v.v)}{v.lo !== undefined ? ` [${fmtFull(v.lo)}, ${fmtFull(v.hi!)}]` : ''}</div>
          </div>;
        })()}
      </div>
      <Legend items={names.map((n, i) => ({ name: n, color: SERIES[i % SERIES.length] }))} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** Measurement histogram (top-K outcomes), exact probabilities overlaid when available. */
export function Histogram({ counts, probs, nbits, maxBars = 32 }: { counts: Record<string, number>; probs?: number[]; nbits: number; maxBars?: number }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const [hover, setHover] = useState<number | null>(null);
  let keys = Object.keys(counts);
  if (probs && nbits <= 6) keys = Array.from({ length: 1 << nbits }, (_, i) => i.toString(2).padStart(nbits, '0'));
  keys.sort((a, b) => (keys.length > maxBars ? (counts[b] ?? 0) - (counts[a] ?? 0) : a < b ? -1 : 1));
  const shown = keys.slice(0, maxBars);
  if (keys.length > maxBars) shown.sort();
  const W = 640, H = 240, m = { l: 46, r: 8, t: 10, b: nbits > 8 ? 74 : 54 };
  const maxP = Math.max(...shown.map((k) => Math.max((counts[k] ?? 0) / total, probs ? probs[parseInt(k, 2)] ?? 0 : 0)), 1e-9);
  const sy = makeScale(0, Math.min(1, maxP * 1.12), H - m.b, m.t, false, (v) => v.toFixed(2));
  const bw = (W - m.l - m.r) / shown.length;
  return (
    <figure>
      <div style={{ position: 'relative' }}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Measurement outcome histogram" onMouseLeave={() => setHover(null)}>
          <g className="grid">{sy.ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} />)}</g>
          <g className="axis">
            {sy.ticks.map((t) => <text key={t} x={m.l - 6} y={sy(t) + 4} textAnchor="end">{sy.fmt(t)}</text>)}
            <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} />
          </g>
          {shown.map((k, i) => {
            const f = (counts[k] ?? 0) / total;
            const x = m.l + i * bw + bw * 0.12, w = bw * 0.76, y = sy(f), h = H - m.b - y;
            const r = Math.min(4, w / 2, h);
            const pe = probs ? probs[parseInt(k, 2)] : undefined;
            return (
              <g key={k} onMouseEnter={() => setHover(i)}>
                <rect x={m.l + i * bw} y={m.t} width={bw} height={H - m.b - m.t} fill="transparent" />
                {h > 0.5 && <path d={`M${x},${H - m.b} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${H - m.b} Z`} fill="var(--s1)" opacity={hover !== null && hover !== i ? 0.6 : 1} />}
                {pe !== undefined && <line x1={x - 1} x2={x + w + 1} y1={sy(pe)} y2={sy(pe)} stroke="var(--gold)" strokeWidth={2} />}
                {shown.length <= 40 && <text x={m.l + (i + 0.5) * bw} y={H - m.b + 10} transform={`rotate(-60 ${m.l + (i + 0.5) * bw} ${H - m.b + 10})`} textAnchor="end" style={{ fontSize: nbits > 10 ? 8 : 10 }}>{k.length > 14 ? k.slice(0, 6) + '…' + k.slice(-6) : k}</text>}
              </g>
            );
          })}
        </svg>
        {hover !== null && shown[hover] && (
          <div className="tooltip" style={{ left: `${Math.min(70, ((m.l + hover * bw) / W) * 100)}%`, top: 4 }}>
            <div>|{shown[hover].length > 24 ? shown[hover].slice(0, 10) + '…' + shown[hover].slice(-10) : shown[hover]}⟩</div>
            <div>measured: {counts[shown[hover]] ?? 0} / {total} ({(((counts[shown[hover]] ?? 0) / total) * 100).toFixed(2)} %)</div>
            {probs && <div style={{ color: 'var(--gold)' }}>exact: {((probs[parseInt(shown[hover], 2)] ?? 0) * 100).toFixed(3)} %</div>}
          </div>
        )}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--s1)' }} />Sampled frequency</span>
        {probs && <span><i style={{ background: 'var(--gold)' }} />Exact probability</span>}
        {keys.length > maxBars && <span className="muted">Showing the {maxBars} most frequent of {keys.length} observed outcomes</span>}
      </div>
    </figure>
  );
}
