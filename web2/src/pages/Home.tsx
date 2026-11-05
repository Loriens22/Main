import { Badge, Stat } from '../components/ui';
import { fmt, useData } from '../lib/data';

const GALLERY = [
  { src: 'renders/toroid_exploded.webp', t: 'Toroid die stack, exploded', c: 'Qubit die, indium bumps, routing layers A and B, ground planes and the interposer, generated from the layout engine.' },
  { src: 'renders/toroid_macro.webp', t: 'Qubit lattice, macro', c: 'X-check crosses, Z-check rings, data double-pads, tunable couplers, meander resonators and airbridges at 0.8 mm pitch.' },
  { src: 'renders/toroid_routing.webp', t: 'Long-range couplers', c: '324 Manhattan-routed couplers on two interposer layers, at most 11 tracks per channel.' },
  { src: 'renders/module_hero.webp', t: 'Toroid module', c: 'Gold-plated package with flex connectors, cavity-attenuator block and photonic drive receiver.' },
  { src: 'renders/cryo_payload.webp', t: 'MXC payload ring', c: '20 module positions on cold fingers, cavity attenuators and the cryo-link ring at 10 mK.' },
  { src: 'renders/cryo_cmos.webp', t: '4 K cryo-CMOS deck', c: '24 controller boards generate multiplexed drive and coupler bias next to the qubits’ wiring.' },
];

export default function Home() {
  const { data: R } = useData<any>('q2_resources');
  const g3 = R?.equal_error?.find((e: any) => e.code === 'gross144' && e.p === 0.003);
  const fr = R?.fridge;
  return (
    <>
      <section className="hero2">
        <img className="hero2-img" src="renders/cryo_hero.webp" alt="Cutaway render of the AURORA-CRYO refrigerator with its plates, cryo-CMOS deck, flex harnesses and payload ring" />
        <div className="hero-scrim" />
        <div className="wrap hero2-body">
          <span className="eyebrow"><b>AURORA-Q2</b> · a quantum computer architecture study · 2026</span>
          <h1>Twelve logical qubits per 288-qubit chip, and a refrigerator built around them.</h1>
          <p className="lede">AURORA-Q2 pairs <strong>Toroid</strong>, a superconducting chip that embeds IBM’s gross bivariate-bicycle code on a two-tier die stack, with <strong>AURORA-CRYO</strong>, a cooling and wiring architecture that moves control to 4 K, carries drive on optical fibre and filters thermal photons at 10 mK. Each design choice was tested in circuit-level simulation or a physical model before it went in.</p>
          <div className="row">
            <a className="btn primary" href="#explore">Explore the machine in 3D</a>
            <a className="btn" href="#paper">Read the paper</a>
            <a className="btn ghost" href="#decoder">Try the decoder</a>
          </div>
        </div>
      </section>

      <section className="wrap block">
        <div className="grid-4">
          <Stat v={g3 ? `${g3.advantage.toFixed(0)}×` : '…'} k="fewer physical qubits per logical qubit than a surface code at equal logical error (p = 0.3 %)" sub="simulated, same circuits and decoder" />
          <Stat v={g3 ? fmt.sci(g3.ler, 2) : '…'} k="gross-code logical error per qubit per round at p = 0.3 %" sub="Stim + BP-OSD, measured" />
          <Stat v={fr ? fr.aurora_plus12W.max_qubits.toLocaleString() : '…'} k="physical qubits per AURORA-CRYO refrigerator" sub={fr ? `${fr.conventional.max_qubits} with coax + room-temperature control (model)` : ''} />
          <Stat v="0" k="crossings on the qubit die" sub="540 nearest-neighbour couplers; 324 long-range in 2 routing layers" />
        </div>
        <p className="small muted" style={{ marginTop: '1rem' }}>Every figure on this site carries an evidence grade: <Badge g="lit" /> <Badge g="sim" /> <Badge g="model" /> <Badge g="prop" /> <Badge g="neg" /></p>
      </section>

      <section className="wrap block">
        <div className="stack" style={{ gap: '1.4rem' }}>
          <div className="stack" style={{ gap: '0.5rem' }}>
            <span className="eyebrow">Architecture at a glance</span>
            <h2>Four layers, one design rule: measure before adopting</h2>
          </div>
          <div className="grid-2">
            <div className="panel arch-card">
              <span className="eyebrow"><b>01</b> · Code</span>
              <h3>Gross bivariate-bicycle code</h3>
              <p>[[144,12,12]]: 144 data and 144 check qubits store 12 logical qubits at distance 12. Each check touches 6 qubits, each qubit 6 couplers. In our simulations it beats surface codes by 8–14× in qubits per logical qubit at equal error.</p>
            </div>
            <div className="panel arch-card">
              <span className="eyebrow"><b>02</b> · Chip</span>
              <h3>Toroid two-tier die stack</h3>
              <p>A placement on a 24 × 12 grid makes 4 of 6 couplings nearest-neighbour, so the qubit die is planar with zero crossings. The other 324 couplers run in two Manhattan routing layers of a flip-chip interposer (≤ 11 tracks per channel).</p>
            </div>
            <div className="panel arch-card">
              <span className="eyebrow"><b>03</b> · Cooling</span>
              <h3>AURORA-CRYO</h3>
              <p>4 K cryo-CMOS control (1 mW/qubit target), superconducting flex, photonic drive, cavity attenuators (n̄ ≤ 2×10⁻⁴), gap-engineered junctions and phonon traps, and dedicated 4 K coolers: modelled ≈ 5,900 qubits per refrigerator.</p>
            </div>
            <div className="panel arch-card">
              <span className="eyebrow"><b>04</b> · System</span>
              <h3>Modules, decoding, logic</h3>
              <p>20 module positions per refrigerator (16 memory, 4 logic/factory), a cryo-link ring between modules, Relay-BP decoding on FPGAs, and magic-state cultivation for non-Clifford gates.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap block">
        <div className="stack" style={{ gap: '1.2rem' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
            <div className="stack" style={{ gap: '0.5rem' }}>
              <span className="eyebrow">Rendered in Blender Cycles</span>
              <h2>From the payload ring to a single coupler</h2>
            </div>
            <a href="#explore">Open the interactive models →</a>
          </div>
          <div className="gallery">
            {GALLERY.map((g) => (
              <figure key={g.src}>
                <img src={g.src} alt={g.t} loading="lazy" />
                <figcaption><strong>{g.t}.</strong> {g.c}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap block">
        <div className="grid-2">
          <div className="stack" style={{ gap: '0.7rem' }}>
            <span className="eyebrow">What this is, and what it is not</span>
            <h2>A design study with its working shown</h2>
            <div className="prose">
              <p>AURORA-Q2 has not been fabricated. Its numbers come from circuit-level simulations (Stim with BP-OSD decoding), analytical cryogenic models with every parameter traced to a source or labelled as an assumption, and a layout engine that also generates the 3D models.</p>
              <p>Some ideas did not survive testing. Straight-line long couplers would need 13 interposer layers, so Toroid uses Manhattan routing. Dual-rail erasure qubits gave only a 0.85–1.8× error budget at equal transmon count, so they stay an upgrade path. Radiation bursts remain the largest unsolved risk, and the paper says so.</p>
            </div>
          </div>
          <div className="panel stack" style={{ gap: '0.6rem' }}>
            <span className="eyebrow">Built on the work of</span>
            <ul className="refs-mini">
              <li>Bravyi, Cross, Gambetta, Maslov, Rall, Yoder: gross code and its thickness-2 embedding (Nature 2024)</li>
              <li>IBM Quantum: Tour de gross, Relay-BP, Loon c-couplers (2025)</li>
              <li>Gidney, Shutty, Jones: magic-state cultivation (2024)</li>
              <li>Levine et al.: dual-rail erasure qubits (PRX 2024)</li>
              <li>Wang et al.: cavity attenuators (PR Applied 2019)</li>
              <li>Lecocq et al.: photonic-link qubit control (Nature 2021)</li>
              <li>McEwen et al.: cosmic-ray bursts (Nat. Phys. 2022) and gap engineering (PRL 2024)</li>
              <li>Cardani et al.: underground operation (Nat. Commun. 2021)</li>
              <li>Bland et al.: millisecond Ta-on-Si transmons (Nature 2025)</li>
            </ul>
            <a href="#methods">Full source ledger and methods →</a>
          </div>
        </div>
      </section>
    </>
  );
}
