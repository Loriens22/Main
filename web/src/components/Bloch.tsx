// Small oblique-projection Bloch sphere (SVG). Vector length < 1 indicates mixedness/entanglement.
export function Bloch({ v, label, size = 112 }: { v: [number, number, number]; label: string; size?: number }) {
  const r = size * 0.36, cx = size / 2, cy = size / 2;
  const P = (x: number, y: number, z: number) => [cx + r * (y * 0.92 - x * 0.38), cy - r * (z * 0.92 - x * 0.2)] as const;
  const [ex, ey] = P(v[0], v[1], v[2]);
  const len = Math.hypot(...v);
  return (
    <figure style={{ margin: 0, display: 'grid', justifyItems: 'center', gap: 2 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} Bloch vector (${v.map((x) => x.toFixed(2)).join(', ')})`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line-2)" />
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.3} fill="none" stroke="var(--line)" strokeDasharray="3 3" />
        {[[1, 0, 0, 'x'], [0, 1, 0, 'y'], [0, 0, 1, '|0⟩']].map(([x, y, z, t]) => {
          const [a, b] = P(x as number, y as number, z as number);
          return <g key={t as string}><line x1={cx} y1={cy} x2={a} y2={b} stroke="var(--line-2)" /><text x={a + 3} y={b - 2} style={{ fill: 'var(--muted)', font: '9px var(--f-mono)' }}>{t}</text></g>;
        })}
        <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--accent-2)" strokeWidth={2.2} strokeLinecap="round" />
        <circle cx={ex} cy={ey} r={4} fill="var(--accent-2)" stroke="var(--surface)" strokeWidth={2} />
      </svg>
      <figcaption className="mono" style={{ fontSize: 10 }}>{label} · |r| = {len.toFixed(2)}</figcaption>
    </figure>
  );
}
