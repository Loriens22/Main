import { layers } from '../quantum/circuit';
import { GATE_INFO } from '../quantum/gates';
import type { Circuit, Op } from '../quantum/types';

const CW = 46, RH = 40, LM = 44;

function fmtAngle(a: number) {
  const k = a / Math.PI;
  for (const d of [1, 2, 3, 4, 6, 8, 12, 16]) {
    const n = k * d;
    if (Math.abs(n - Math.round(n)) < 1e-9) {
      const num = Math.round(n);
      if (num === 0) return '0';
      return `${num === 1 ? '' : num === -1 ? '−' : num}π${d === 1 ? '' : '/' + d}`;
    }
  }
  return a.toFixed(2);
}

export function CircuitDiagram({ circuit, onWire, onOp, pending = [], highlightOps }: {
  circuit: Circuit; onWire?: (q: number) => void; onOp?: (index: number) => void; pending?: number[]; highlightOps?: Set<number>;
}) {
  const n = circuit.num_qubits;
  const indexed = circuit.ops.map((op, i) => ({ ...op, _i: i } as Op & { _i: number }));
  const L = layers({ ...circuit, ops: indexed }) as (Op & { _i: number })[][];
  const cols = Math.max(L.length + 1, 8);
  const W = LM + cols * CW + 20, H = n * RH + 12;
  const y = (q: number) => 22 + q * RH;
  return (
    <div className="circuit">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Circuit diagram with ${n} qubits and ${circuit.ops.length} operations`} style={{ display: 'block' }}>
        {Array.from({ length: n }, (_, q) => (
          <g key={q} onClick={() => onWire?.(q)} style={{ cursor: onWire ? 'copy' : 'default' }}>
            <rect x={0} y={y(q) - RH / 2} width={W} height={RH} fill={pending.includes(q) ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent'} />
            <text x={8} y={y(q) + 4} style={{ fill: 'var(--muted)', font: '11px var(--f-mono)' }}>q{q}</text>
            <line x1={LM - 8} x2={W - 8} y1={y(q)} y2={y(q)} stroke="var(--line-2)" strokeWidth={1.4} />
          </g>
        ))}
        {L.map((layer, li) => layer.map((op) => {
          const x = LM + li * CW + CW / 2;
          const info = GATE_INFO[op.name];
          const hl = highlightOps?.has(op._i);
          const color = op.name === 'measure' || op.name === 'reset' ? 'var(--gold)' : op.qubits.length > 1 ? 'var(--cyan)' : 'var(--accent-2)';
          const click = (e: React.MouseEvent) => { e.stopPropagation(); onOp?.(op._i); };
          if (op.name === 'barrier') {
            return <g key={op._i} onClick={click}>{op.qubits.map((q) => <line key={q} x1={x} x2={x} y1={y(q) - RH / 2 + 4} y2={y(q) + RH / 2 - 4} stroke="var(--muted)" strokeDasharray="3 3" />)}</g>;
          }
          if (op.name === 'measure') {
            return <g key={op._i} onClick={click} style={{ cursor: 'pointer' }}>{op.qubits.map((q, k) => (
              <g key={q}><rect x={x - 15} y={y(q) - 14} width={30} height={28} rx={5} fill="var(--surface-2)" stroke={color} />
                <path d={`M${x - 9},${y(q) + 6} A9,9 0 0 1 ${x + 9},${y(q) + 6}`} fill="none" stroke={color} />
                <line x1={x} y1={y(q) + 7} x2={x + 7} y2={y(q) - 6} stroke={color} />
                <text x={x + 12} y={y(q) + 13} style={{ fill: 'var(--muted)', font: '8px var(--f-mono)' }}>c{(op.clbits ?? op.qubits)[k]}</text></g>
            ))}</g>;
          }
          if (op.qubits.length === 1 || op.name === 'reset') {
            return <g key={op._i} onClick={click} style={{ cursor: 'pointer' }}>{op.qubits.map((q) => (
              <g key={q}><rect x={x - 17} y={y(q) - 14} width={34} height={28} rx={5} fill={hl ? 'color-mix(in oklab, var(--accent) 35%, var(--surface-2))' : 'var(--surface-2)'} stroke={color} />
                <text x={x} y={y(q) + (op.params?.length ? 0 : 4)} textAnchor="middle" style={{ fill: 'var(--fg)', font: '600 11px var(--f-mono)' }}>{info.label}</text>
                {op.params?.length ? <text x={x} y={y(q) + 10} textAnchor="middle" style={{ fill: 'var(--muted)', font: '8px var(--f-mono)' }}>{op.params.map(fmtAngle).join(',')}</text> : null}</g>
            ))}</g>;
          }
          const qs = op.qubits;
          const lo = Math.min(...qs), hi = Math.max(...qs);
          const ctrl = ['cx', 'cy', 'cz', 'ch', 'crx', 'cry', 'crz', 'cp'].includes(op.name) ? [qs[0]] : op.name === 'ccx' || op.name === 'cswap' ? [qs[0]] .concat(op.name === 'ccx' ? [qs[1]] : []) : [];
          const targets = qs.filter((q) => !ctrl.includes(q));
          return (
            <g key={op._i} onClick={click} style={{ cursor: 'pointer' }}>
              <line x1={x} x2={x} y1={y(lo)} y2={y(hi)} stroke={color} strokeWidth={1.6} />
              {ctrl.map((q) => <circle key={q} cx={x} cy={y(q)} r={5} fill={color} />)}
              {targets.map((q) => op.name === 'cx' || op.name === 'ccx' ? (
                <g key={q}><circle cx={x} cy={y(q)} r={10} fill="var(--surface-2)" stroke={color} strokeWidth={1.6} /><line x1={x - 10} x2={x + 10} y1={y(q)} y2={y(q)} stroke={color} /><line x1={x} x2={x} y1={y(q) - 10} y2={y(q) + 10} stroke={color} /></g>
              ) : op.name === 'cz' ? <circle key={q} cx={x} cy={y(q)} r={5} fill={color} /> : op.name === 'swap' || op.name === 'cswap' ? (
                <g key={q} stroke={color} strokeWidth={1.8}><line x1={x - 6} x2={x + 6} y1={y(q) - 6} y2={y(q) + 6} /><line x1={x - 6} x2={x + 6} y1={y(q) + 6} y2={y(q) - 6} /></g>
              ) : (
                <g key={q}><rect x={x - 18} y={y(q) - 14} width={36} height={28} rx={5} fill="var(--surface-2)" stroke={color} />
                  <text x={x} y={y(q) + (op.params?.length ? 0 : 4)} textAnchor="middle" style={{ fill: 'var(--fg)', font: '600 10px var(--f-mono)' }}>{info.label.replace(/^C/, ctrl.length ? '' : 'C') || info.label}</text>
                  {op.params?.length ? <text x={x} y={y(q) + 10} textAnchor="middle" style={{ fill: 'var(--muted)', font: '8px var(--f-mono)' }}>{fmtAngle(op.params[0])}</text> : null}</g>
              ))}
            </g>
          );
        }))}
      </svg>
    </div>
  );
}

/** Safe angle-expression parser: numbers, pi/π, + - * / and parentheses. */
export function parseAngle(src: string): number {
  const s = src.replace(/π/g, 'pi').replace(/\s+/g, '').toLowerCase();
  let i = 0;
  const peek = () => s[i];
  const num = (): number => {
    if (s.startsWith('pi', i)) { i += 2; return Math.PI; }
    const m = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`cannot parse "${src}"`);
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const factor = (): number => {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('missing )'); return v; }
    return num();
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '/' || peek() === 'p') {
      if (peek() === 'p') { v *= factor(); continue; } // implicit multiplication: 3pi
      const op = s[i++];
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  const v = expr();
  if (i !== s.length || !Number.isFinite(v)) throw new Error(`cannot parse "${src}"`);
  return v;
}
