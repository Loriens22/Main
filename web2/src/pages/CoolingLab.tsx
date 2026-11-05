import { useMemo, useState } from 'react';
import { BarChart } from '../components/charts';
import { Badge, PageHead, Panel, Stat, TeX } from '../components/ui';
import { burstMTBF, coherenceBudget, fmtTime, maxQubits, STAGE_ORDER, stageLoads, type Arch, type HeatParams } from '../lib/cryo';
import { fmt, useData } from '../lib/data';

const SYS_LABEL: Record<string, string> = { conventional: 'Coax + RT control', flex: 'Flex + RT control', aurora: 'AURORA-CRYO' };

function Slider({ id, label, value, min, max, step, onChange, log = false, unit = '' }: { id: string; label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; log?: boolean; unit?: string }) {
  const toS = (v: number) => (log ? Math.log10(v) : v);
  const fromS = (s: number) => (log ? 10 ** s : s);
  return (
    <label className="field" htmlFor={id}>
      <span className="row" style={{ justifyContent: 'space-between' }}><span>{label}</span><span className="mono" style={{ color: 'var(--fg)' }}>{fmt.num(value, 3)}{unit}</span></span>
      <input id={id} type="range" min={toS(min)} max={toS(max)} step={log ? 0.01 : step ?? 0.01} value={toS(value)} onChange={(e) => onChange(+fromS(+e.target.value).toPrecision(4))} />
    </label>
  );
}

export default function CoolingLab() {
  const { data, error } = useData<any>('q2_cryo_models');
  const { data: layout } = useData<any>('q2_layout');
  if (error) return <div className="wrap err">{error}</div>;
  if (!data) return <div className="wrap" style={{ paddingBlock: '4rem' }}><span className="eyebrow">Loading models…</span></div>;
  return (
    <>
      <PageHead eyebrow={<><b>Cooling Lab</b> · AURORA-CRYO models</>} title="How many qubits fit in one refrigerator, and how quiet they stay">
        <p>The same equations and parameters as the Python study (cross-checked in unit tests to 10⁻⁹) are used here. Change an assumption and every downstream number updates. Measured or published inputs are marked as such; the rest are design assumptions you can test.</p>
      </PageHead>
      <div className="wrap stack" style={{ gap: '1.5rem', paddingBottom: '3rem' }}>
        <HeatSection P={data.params as HeatParams} />
        <PhotonSection P={data.params} />
        <RadiationSection dieMM={layout?.summary?.die_mm ?? [21.2, 11.6]} />
      </div>
    </>
  );
}

function HeatSection({ P }: { P: HeatParams }) {
  const [cmos, setCmos] = useState(1.0);
  const [extra, setExtra] = useState(12);
  const [margin, setMargin] = useState(P.MARGIN);
  const [density, setDensity] = useState(10);
  const [N, setN] = useState(2000);
  const res = useMemo(() => ({
    conventional: maxQubits(P, 'conventional', { margin }),
    flex: maxQubits(P, 'flex', { margin, density }),
    aurora: maxQubits(P, 'aurora', { cmosW: cmos * 1e-3, extra4K: extra, margin, density }),
  }), [P, cmos, extra, margin, density]);
  const groups = STAGE_ORDER.map((st) => ({
    label: st,
    values: (['conventional', 'flex', 'aurora'] as const).map((s) => {
      const L = stageLoads(P, s, N, s === 'aurora' ? cmos * 1e-3 : undefined)[st];
      const cap = (P.CAPACITY[st] + (s === 'aurora' && st === '4 K' ? extra : 0)) * margin;
      return { name: SYS_LABEL[s], v: Math.max(L / cap, 1e-4) };
    }),
  }));
  return (
    <Panel eyebrow="1 · Heat load and wiring" title="Qubits per refrigerator" right={<Badge g="model" />}>
      <div className="grid-3" style={{ marginBottom: '1rem' }}>
        {(['conventional', 'flex', 'aurora'] as const).map((s) => (
          <div key={s} className={`panel tight sys-card ${s === 'aurora' ? 'hi' : ''}`}>
            <span className="eyebrow">{SYS_LABEL[s]}</span>
            <Stat v={res[s].max.toLocaleString()} k={`qubits · limited by ${res[s].limiting}`} />
            <span className="small muted">{Math.floor(res[s].max / 288)} Toroid modules · {Math.floor(res[s].max / 288) * 12} logical qubits (memory)</span>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="stack" style={{ gap: '0.7rem' }}>
          <Slider id="cmos" label="Cryo-CMOS power per qubit (AURORA)" value={cmos} min={0.25} max={25} log unit=" mW" onChange={setCmos} />
          <Slider id="extra" label="Dedicated extra 4 K cooling (AURORA)" value={extra} min={0} max={24} step={1} unit=" W" onChange={setExtra} />
          <Slider id="margin" label="Usable fraction of each stage" value={margin} min={0.2} max={0.9} step={0.05} onChange={setMargin} />
          <Slider id="density" label="Flex line density vs coax" value={density} min={1} max={20} step={1} unit="×" onChange={setDensity} />
          <p className="small muted">Reference points: measured cryo-CMOS 2 mW/qubit (28 nm) and 23 mW/qubit (14 nm FinFET); a published model proposes 0.9 mW per channel. MXC passive load of a stainless coax: 14 nW (measured). Platform: &gt; 90 µW at 20 mK, &gt; 4,000 RF lines (vendor specification).</p>
        </div>
        <div className="stack" style={{ gap: '0.5rem' }}>
          <Slider id="nq" label="Evaluate stage load at N qubits" value={N} min={100} max={10000} log onChange={(v) => setN(Math.round(v))} />
          <BarChart groups={groups} yLabel="load / usable capacity" logY yDomain={[1e-3, 30]} refY={{ y: 1, label: 'full' }} yFmt={(v) => `${+(v * 100).toPrecision(2)}%`}
            caption={`Stage utilisation at ${N.toLocaleString()} qubits. Above 100 % the stage cannot hold that many qubits.`} />
        </div>
      </div>
    </Panel>
  );
}

function PhotonSection({ P }: { P: any }) {
  const [tMxc, setTMxc] = useState(33);
  const [dbMxc, setDbMxc] = useState(30);
  const [cav, setCav] = useState(true);
  const [tq, setTq] = useState(35);
  const conv = P.ARCH.conventional as Arch;
  const aur = P.ARCH.aurora as Arch;
  const custom: Arch = useMemo(() => ({
    ...(cav ? aur : conv),
    T_eff_qubit: tq / 1000,
    chain: (cav ? aur : conv).chain.map((s: any, i: number, a: any[]) => (i === a.length - 1 ? { ...s, T_eff: tMxc / 1000, dB: dbMxc } : s)),
    n_floor: cav ? aur.n_floor : 0,
  }), [cav, tMxc, dbMxc, tq, aur, conv]);
  const b0 = coherenceBudget(conv, P.KAPPA_2pi_MHz, P.CHI_2pi_MHz);
  const b1 = coherenceBudget(aur, P.KAPPA_2pi_MHz, P.CHI_2pi_MHz);
  const bc = coherenceBudget(custom, P.KAPPA_2pi_MHz, P.CHI_2pi_MHz);
  const rows: [string, (b: typeof b0) => string][] = [
    ['Thermal photons in readout resonator n̄', (b) => fmt.sci(b.nRes, 2)],
    ['Thermal-photon dephasing T_φ', (b) => `${(b.Tphi_thermal * 1e6).toFixed(0)} µs`],
    ['T₁ (dielectric + quasiparticle + Purcell)', (b) => `${(b.T1 * 1e6).toFixed(0)} µs`],
    ['T₂', (b) => `${(b.T2 * 1e6).toFixed(0)} µs`],
    ['Residual excited population', (b) => fmt.pct(b.P_excited, 2)],
    ['Two-qubit gate error p₂', (b) => fmt.sci(b.noise.p2, 2)],
    ['Idle error per CNOT layer', (b) => fmt.sci(b.noise.p_idle, 2)],
    ['Data idle during measure + reset', (b) => fmt.sci(b.noise.p_idle_meas, 2)],
  ];
  return (
    <Panel eyebrow="2 · Thermal photons → coherence → circuit noise" title="Attenuation chain and qubit noise budget" right={<Badge g="model" />}>
      <div className="grid-2">
        <div className="stack" style={{ gap: '0.7rem' }}>
          <div className="prose small">
            <p>Each attenuator mixes the incoming noise with its own: <TeX>{String.raw`\bar n_{k+1}=\bar n_k/A_k+(1-1/A_k)\,\bar n(T_{\mathrm{eff},k})`}</TeX>. Photons left in the readout resonator dephase the qubit at <TeX>{String.raw`\Gamma_\varphi=\bar n\,\kappa\,4\chi^2/(\kappa^2+4\chi^2)`}</TeX> (Clerk and Utami), with κ/2π = {P.KAPPA_2pi_MHz} MHz and 2χ = κ.</p>
          </div>
          <label className="check"><input id="cav" type="checkbox" checked={cav} onChange={(e) => setCav(e.target.checked)} />Cavity attenuator at the MXC (floor n̄ ≤ 2×10⁻⁴, measured bound)</label>
          <Slider id="tmxc" label="MXC attenuator effective temperature" value={tMxc} min={15} max={90} step={1} unit=" mK" onChange={setTMxc} />
          <Slider id="dbmxc" label="MXC attenuation" value={dbMxc} min={0} max={40} step={1} unit=" dB" onChange={setDbMxc} />
          <Slider id="tq" label="Qubit effective temperature" value={tq} min={20} max={80} step={1} unit=" mK" onChange={setTq} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Quantity</th><th className="num">Conventional</th><th className="num">AURORA-CRYO</th><th className="num">Your settings</th></tr></thead>
            <tbody>{rows.map(([k, f]) => <tr key={k}><td>{k}</td><td className="num">{f(b0)}</td><td className="num">{f(b1)}</td><td className="num" style={{ color: 'var(--cyan)' }}>{f(bc)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

function RadiationSection({ dieMM }: { dieMM: number[] }) {
  const area = (dieMM[0] * dieMM[1]) / 100;
  const [dies, setDies] = useState(20);
  const [flux, setFlux] = useState(0.1);
  const [pf, setPf] = useState(1e-3);
  const [under, setUnder] = useState(false);
  const mtbf = burstMTBF(dies, area, flux, pf, under ? 1 / 50 : 1);
  const scen = [
    { k: 'Ungapped junctions, surface lab', p: 1, f: 1 },
    { k: 'Strong gap engineering + phonon traps', p: 1e-3, f: 1 },
    { k: 'Gap engineering + underground (Pb)', p: 1e-3, f: 1 / 50 },
  ];
  const day = 86400;
  const needed = 1 / (flux * area * dies * (under ? 1 / 50 : 1) * day);
  return (
    <Panel eyebrow="3 · Cosmic rays and radioactivity" title="Mean time between radiation-induced logical failures" right={<Badge g="model" />}>
      <div className="grid-2">
        <div className="stack" style={{ gap: '0.7rem' }}>
          <p className="small muted">An impact deposits energy that spreads as phonons and breaks Cooper pairs across the die; without mitigation it corrupts every logical qubit on that die. Strongly gap-engineered qubits showed no T₁ degradation during impacts (McEwen et al., PRL 2024), and going underground with lead cut quasiparticle bursts 50× (Cardani et al. 2021). The residual failure probability per impact is our assumption; set it here.</p>
          <Slider id="dies" label="Dies in the machine" value={dies} min={1} max={200} step={1} onChange={setDies} />
          <Slider id="flux" label="Impacts per cm² per second (assumed)" value={flux} min={0.01} max={1} log onChange={setFlux} />
          <Slider id="pf" label="Logical failure probability per impact" value={pf} min={1e-6} max={1} log onChange={setPf} />
          <label className="check"><input id="under" type="checkbox" checked={under} onChange={(e) => setUnder(e.target.checked)} />Underground site with Pb shielding (× 1/50)</label>
        </div>
        <div className="stack" style={{ gap: '0.8rem' }}>
          <div className="grid-2">
            <Stat v={fmtTime(mtbf)} k="mean time between failures" sub={`die ${dieMM[0].toFixed(1)} × ${dieMM[1].toFixed(1)} mm (${area.toFixed(2)} cm²)`} />
            <Stat v={needed >= 1 ? '≥ 1' : fmt.sci(needed, 2)} k="p_fail per impact needed for 1 day" />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Scenario (20 dies)</th><th className="num">p_fail</th><th className="num">MTBF</th></tr></thead>
              <tbody>{scen.map((s) => <tr key={s.k}><td>{s.k}</td><td className="num">{fmt.sci(s.p, 1)}</td><td className="num">{fmtTime(burstMTBF(20, area, flux, s.p, s.f))}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </Panel>
  );
}
