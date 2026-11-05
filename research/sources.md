# AURORA-Q — Verified Source Ledger

This ledger records every external fact used in the AURORA-Q report together with the
source it was taken from and how strongly it is supported. It was compiled on
**2026-11-05**.

**Method note (important for reproducibility).** The research environment could not open
vendor pages directly (`ibm.com`, `microsoft.com`, `arxiv.org` were not reachable from the
build container). Facts were gathered through a web-search service that returns sourced
digests of the pages listed below. Every number here is therefore **as reported by the
cited source**, and items marked *secondary* were not confirmed against the primary
document. Nothing in this file was filled in from memory except the *foundational*
references in §9, which are standard textbook/journal citations.

Legend: **[P]** primary source (vendor paper/blog/peer-reviewed), **[S]** secondary
(press/analysis), **[C]** contested or inconsistent between sources.

---

## 1. Microsoft Majorana 2 (June 2026)

| Fact | Source | Grade |
|---|---|---|
| Preprint: *"20 Second Parity Lifetime in an InAs–Pb Tetron Device"*, arXiv:2606.03884, Microsoft Quantum (M. Aghaee + 164 authors), submitted 2 Jun 2026 | https://arxiv.org/abs/2606.03884 | P |
| Abstract: interferometric single-shot parity measurements in an InAs–Pb tetron; "characteristic parity switching time of about 20 s, with some instances reaching minute-scale" | arXiv:2606.03884 (via search digest) | P |
| Fitted value τ_Z = 22 ± 1 s from exponential fit to dwell times | arXiv:2606.03884 main text (digest); Quantum Insider | P/S |
| Lead (Pb) replaces aluminium (Al) as the superconductor | Microsoft blog by C. Nayak (digest); SiliconANGLE; TNW | P/S |
| Majorana 1 (Al) Z-parity lifetimes 1–12 ms → "≈1,000×" improvement framing | Microsoft blog (digest); TNW | P/S |
| Rf spectroscopy and Z-parity lifetime performed on a **single nanowire of one grounded tetron**, not a full multi-qubit unit cell; **only Z measurements** presented, X measurements absent | PostQuantum analysis https://postquantum.com/industry-news/microsoft-majorana-2-analysis/ | S |
| Topological gap ≈70 µeV (top quintile) in Pb devices vs ≈30 µeV in Al platform | Secondary reporting of preprint (digest) | S |
| Microsoft Discovery (agentic AI) used to manage workflows, automate measurements, optimise fabrication, flag defects; "scientist in the loop" | TNW https://thenextweb.com/news/microsoft-majorana-2-quantum-chip-agentic-ai-discovery ; Microsoft Signal https://news.microsoft.com/microsoft-signal/magazine/issue/06/quantum-2/ | S |
| Microsoft targets a scalable quantum computer by **2029** (framed as halving timeline) | SiliconANGLE https://siliconangle.com/2026/06/02/microsofts-new-majorana-2-quantum-chip-claims-dramatic-breakthrough-qubit-stability/ ; Forbes | S |
| 22 Sep 2026: Maryland research centre; DARPA given on-site access to a Majorana 2 system under US2QC within QBI (QBI asks whether utility-scale QC is possible by 2033) | Quantum Insider https://thequantuminsider.com/2026/09/22/microsoft-gives-darpa-access-to-majorana-system-opens-maryland-quantum-research-center/ | S |
| Critics: H. Legg — "Nothing in the presented data proves the existence of a topological qubit or Majoranas in these devices"; S. Frolov sceptical | Science News https://www.sciencenews.org/article/microsoft-quantum-chip-upgrade-majorana (via digest) | S |
| Independent theory on tetron poisoning: Bhattacharyya & van Heck, *Dynamics of Majorana tetron qubits under quasiparticle poisoning*, arXiv:2608.18042 | https://arxiv.org/abs/2608.18042 | P |

## 2. Microsoft Majorana 1 and its evidence base

| Fact | Source | Grade |
|---|---|---|
| *Interferometric single-shot parity measurement in InAs–Al hybrid devices*, Nature 638, 651–655 (2025), doi:10.1038/s41586-024-08445-2; readout via quantum capacitance C_Q of a quantum dot coupled to the nanowire; 1% assignment error | arXiv:2401.09549; Nature | P |
| H. Legg, Comment on the Nature paper, arXiv:2503.08944 — argues TGP can label the same regions gapped or gapless depending on parameters; concludes regions are disordered | https://arxiv.org/abs/2503.08944 | P (critique) |
| H. Legg, Comment on *InAs-Al hybrid devices passing the topological gap protocol* (PRB 107, 245423, 2023), arXiv:2502.19560 | https://arxiv.org/abs/2502.19560 | P (critique) |
| *Distinct lifetimes for X and Z loop measurements in a Majorana tetron device*, arXiv:2507.08795: τ_Z ≈ 12.4 ms (attributed to quasiparticle poisoning), τ_X ≈ 14.5 µs (thermal excitation / residual splitting); single-shot errors 0.5 % (Z), 16 % (X) | https://arxiv.org/abs/2507.08795 | P |
| Aasen et al., *Roadmap to fault tolerant quantum computation using topological qubit arrays*, arXiv:2502.12252 — four generations: 1-qubit benchmarking device → 2-qubit measurement-based braiding → 8-qubit error detection → array for lattice surgery on two logical qubits; tetron = two parallel topological wires joined by trivial SC backbone; measurement via interferometric loops & quantum-dot capacitance; example 2×12 logical array, surface code fault distance 7 | https://arxiv.org/abs/2502.12252 | P |

## 3. IBM Quantum Nighthawk (r1) and Nighthawk r2

| Fact | Source | Grade |
|---|---|---|
| Nighthawk announced Nov 2025: 120 qubits, square lattice, 218 tunable couplers, >20 % more couplers than Heron; 5,000 two-qubit gates per circuit; roadmap 7,500 (2026), 10,000 (2027), 15,000 (2028) | Tom's Hardware; Next Platform; Help Net Security (digest) | S |
| First Nighthawk QPU **ibm_miami** (exploratory); default rep-delay raised from 250 µs to 4 ms | Quantum Insider Jan 2026 (digest) | S |
| 120 qubits / 218 couplers is exactly the edge count of a 10 × 12 square grid (10·11 + 12·9 = 218) | derived (this work) | — |
| Nighthawk r2 (blog "IBM Quantum Nighthawk r2—more circuits, faster", ≈31 Aug / early Sep 2026): 120 programmable qubits + 218 couplers + 120 independent reset elements = 458 physical quantum elements | https://www.ibm.com/quantum/blog/nighthawk-r2 (digest); Quantum Insider | P/S |
| Replaces conditional (measure-and-flip) reset with a **dissipative reset gadget** per qubit; when activated, effective T1 falls from ≈200 µs to ≈25 ns | IBM blog (digest); pasqualepillitteri.it | P/S |
| ≈25× reduction in initialization error across the device | IBM blog (digest) | P/S |
| >100,000 circuits/s vs Heron ≈4,000 circuits/s (≈25×); idle interval between circuits down to ≈1 µs | IBM blog (digest); HPCwire | P/S [C: measurement protocol not stated; not CLOPS] |
| Q-CTRL: Heron r3 (ibm_boston) pipeline 4 min 25 s vs Nighthawk r2 (ibm_phoenix) 23 s, ≈12×; 30-site / 60-qubit dynamics, 30 Trotter steps | https://q-ctrl.com/blog/q-ctrl-sets-the-standard-for-quantum-execution-speed-with-ibm-quantum-nighthawk | S |
| Neutron-scattering-style spectra generated in ≈60 s with ≈12× speed-up (KCuF₃ figure supplied in the project brief shows ibm_boston 12.5 min vs ibm_phoenix 1 min) | digest + brief figure | S [C: 12.5 min not independently found] |
| Doped-Clifford advantage experiment (IBM + UChicago): 70-qubit 1D chain, 70 CZ layers, 468 T gates embedded in 97-qubit experiment with syndrome post-selection; brief's figure shows a 298-T variant on a square lattice | digest; arXiv:2608.13110 (classical-simulation response, log-XEB 0.350 [0.298, 0.403]) | P/S [C] |
| BlueQubit random-circuit-sampling advantage claim on Nighthawk r2, arXiv:2609.28657 | https://arxiv.org/abs/2609.28657 | P |

## 4. IBM Heron, metrics and roadmap

| Fact | Source | Grade |
|---|---|---|
| Heron r2/r3: 156 qubits, heavy-hex; r3 dashboard snapshot (Aug 2025) median 2Q error 1.52e-3, readout 1.3e-2, CLOPS 330K | PostQuantum https://postquantum.com/industry-news/ibm-heron-r3-pittsburgh/ | S |
| EPLG = error per layered gate over a 100-qubit chain; "Median 2Q error" from RB | IBM docs https://quantum.cloud.ibm.com/docs/en/guides/qpu-information (digest) | P |
| CLOPS originally defined in Wack et al., *Scale, Quality, and Speed*, arXiv:2110.14108; redefined 2023 (CLOPS_h, layer based) | https://arxiv.org/abs/2110.14108 | P |
| Bravyi et al., *High-threshold and low-overhead fault-tolerant quantum memory*, Nature 627, 778 (2024), doi:10.1038/s41586-024-07107-7: gross code [[144,12,12]], 288 physical qubits, threshold ≈0.7 % (Nature) / 0.8 % (arXiv), degree-6 connectivity from two planar subgraphs, depth-7 syndrome cycle | https://arxiv.org/abs/2308.07915 | P |
| Relay-BP decoder (arXiv:2506.01779); FPGA real-time decoding of gross code, 24 ns iteration (arXiv:2510.21600) | arXiv | P |
| Starling (2029): 200 logical qubits, 100 M operations; Blue Jay (2033): 2,000+ logical qubits | secondary roadmap summary | S |

## 5. Other platforms (comparative review)

| Platform | Fact | Source | Grade |
|---|---|---|---|
| Superconducting (Google Willow) | d=7 surface code, 101 qubits, 0.143 % ± 0.003 % logical error per cycle; error halves with each distance step (Λ ≈ 2.14); real-time decoding 63 µs latency at d=5, 1.1 µs cycle | Google Quantum AI, Nature 638, 920 (2025) | P |
| Superconducting (Google) | Quantum Echoes / OTOC, Nature 22 Oct 2025; ≈13,000× vs Frontier estimate | Google blog https://blog.google/technology/research/quantum-echoes-willow-verifiable-quantum-advantage/ | P |
| Superconducting materials | Bland, Bahrami et al., *Millisecond lifetimes and coherence times in 2D transmon qubits*, Nature 647, 343 (2025): Ta on high-resistivity Si, T1 up to 1.68 ms, Q up to 2.5e7, 1Q fidelity 99.994 % | Princeton https://collaborate.princeton.edu/en/publications/millisecond-lifetimes-and-coherence-times-in-2d-transmon-qubits/ | P |
| Trapped ions (Quantinuum Helios, Nov 2025) | 98 ¹³⁷Ba⁺ qubits, 2Q fidelity 99.921 % (all pairs), 1Q 99.9975 %, QCCD; 48 error-corrected / 94 error-detected logical qubits; independent Sandia benchmarking | https://quantinuum.com/blog/introducing-helios-the-most-accurate-quantum-computer-in-the-world | P |
| Neutral atoms (Harvard/MIT/QuEra) | Bluvstein et al., *A fault-tolerant neutral-atom architecture for universal quantum computation*, Nature (2025) doi:10.1038/s41586-025-09848-5: up to 448 atoms, 2.14(13)× below-threshold; separate continuous-operation work: >3,000 atoms for >2 h at 300,000 atoms/s reload | arXiv:2506.20661; NIST record | P |
| Photonic (PsiQuantum Omega) | 99.98 % SPAM, 99.5 % HOM visibility, 99.72 % chip-to-chip, 99.22 % fusion fidelity; GlobalFoundries fab | https://psiquantum.com/omega | P (company) |
| Si spin (Diraq/imec) | *Industry-compatible silicon spin-qubit unit cells exceeding 99 % fidelity*, Nature 646, 81 (2025), doi:10.1038/s41586-025-09531-9; 300 mm process; >99 % 1Q/2Q, >99.9 % SPAM | arXiv:2410.15590 | P |

## 6. Reset physics

| Fact | Source | Grade |
|---|---|---|
| Magnard et al., *Fast and unconditional all-microwave reset of a superconducting qubit*, PRL 121, 060502 (2018): 0.2 % residual excitation in < 500 ns | arXiv:1801.07689 | P |
| McEwen et al. (Google) multi-level reset: ground state with error < 5e-3 within 250 ns from any of first three excited levels; leakage removal reduces time-correlated errors | APS March Meeting 2021 abstract (published as Nat. Commun. 12, 1761 (2021)) | P/S |

## 7. Quantum machine learning — limits

| Fact | Source | Grade |
|---|---|---|
| Cerezo et al., *Does provable absence of barren plateaus imply classical simulability?*, Nat. Commun. 16, 7907 (2025), arXiv:2312.09121 | arXiv | P |
| Thanasilp, Wang, Cerezo, Holmes, *Exponential concentration in quantum kernel methods*, Nat. Commun. 15, 5200 (2024), doi:10.1038/s41467-024-49287-w | arXiv:2208.11060 | P |

## 8. Resource estimation

| Fact | Source | Grade |
|---|---|---|
| Gidney, *How to factor 2048 bit RSA integers with less than a million noisy qubits*, arXiv:2505.15917: < 1 M physical qubits, < 1 week; assumptions 0.1 % gate error, 1 µs cycle, 10 µs reaction time, square grid | arXiv | P |
| Krinner et al., *Engineering cryogenic setups for 100-qubit scale superconducting circuit systems*, EPJ Quantum Technol. 6, 2 (2019), arXiv:1806.07862 — passive/active heat loads of coax lines (exact per-line numbers not retrieved; used qualitatively only) | arXiv | P |

## 9. Foundational references (standard citations)

- A. Yu. Kitaev, *Unpaired Majorana fermions in quantum wires*, Phys.-Usp. 44, 131 (2001).
- R. M. Lutchyn, J. D. Sau, S. Das Sarma, PRL 105, 077001 (2010); Y. Oreg, G. Refael, F. von Oppen, PRL 105, 177002 (2010).
- T. Karzig et al., *Scalable designs for quasiparticle-poisoning-protected topological quantum computation with Majorana zero modes*, PRB 95, 235305 (2017).
- J. Koch et al., *Charge-insensitive qubit design derived from the Cooper pair box*, PRA 76, 042319 (2007).
- P. Krantz et al., *A quantum engineer's guide to superconducting qubits*, Appl. Phys. Rev. 6, 021318 (2019).
- A. G. Fowler et al., *Surface codes: Towards practical large-scale quantum computation*, PRA 86, 032324 (2012).
- S. Aaronson, D. Gottesman, *Improved simulation of stabilizer circuits*, PRA 70, 052328 (2004).
- C. Gidney, *Stim: a fast stabilizer circuit simulator*, Quantum 5, 497 (2021).
- O. Higgott, C. Gidney, *Sparse Blossom*, arXiv:2303.15933 (PyMatching 2).
- G. Li, Y. Ding, Y. Xie, *Tackling the qubit mapping problem for NISQ-era quantum devices* (SABRE), ASPLOS 2019, arXiv:1809.02573.
- K. Temme, S. Bravyi, J. Gambetta, *Error mitigation for short-depth quantum circuits*, PRL 119, 180509 (2017).
- T. Giurgica-Tiron et al., *Digital zero noise extrapolation for quantum error mitigation*, arXiv:2005.10921.
- Y. Kim et al., *Evidence for the utility of quantum computing before fault tolerance*, Nature 618, 500 (2023).
- J. Preskill, *Quantum Computing in the NISQ era and beyond*, Quantum 2, 79 (2018).
- E. Farhi, J. Goldstone, S. Gutmann, *A Quantum Approximate Optimization Algorithm*, arXiv:1411.4028.
- A. Peruzzo et al., *A variational eigenvalue solver on a photonic quantum processor*, Nat. Commun. 5, 4213 (2014).
- A. Kandala et al., *Hardware-efficient variational quantum eigensolver for small molecules and quantum magnets*, Nature 549, 242 (2017).
- V. Havlíček et al., *Supervised learning with quantum-enhanced feature spaces*, Nature 567, 209 (2019).
- J. R. McClean et al., *Barren plateaus in quantum neural network training landscapes*, Nat. Commun. 9, 4812 (2018).
- K. Mitarai et al., *Quantum circuit learning*, PRA 98, 032309 (2018); M. Schuld et al., *Evaluating analytic gradients on quantum hardware*, PRA 99, 032331 (2019).
- S. Aaronson, *Read the fine print*, Nat. Phys. 11, 291 (2015).
- E. Tang, *A quantum-inspired classical algorithm for recommendation systems*, STOC 2019.
- M. X. Goemans, D. P. Williamson, J. ACM 42, 1115 (1995).
- M. A. Nielsen, I. L. Chuang, *Quantum Computation and Quantum Information*, CUP (2010).

---

# AURORA-Q2 extension (Toroid chip + AURORA-CRYO), verified 2026-11-05

Same grading as above (**P** = primary or primary-derived, **S** = secondary, **M** = someone else's model or estimate, not a measurement). All entries were checked this session through a search service's sourced digests. Pages were not opened directly, so numbers flagged *(digest)* should be checked against the PDF before external use.

## 10. qLDPC architecture, decoding and logic

| Fact | Source | Grade |
|---|---|---|
| *Tour de gross: a modular quantum computer based on bivariate bicycle codes* (IBM, 3 Jun 2025): code modules of 12 logical qubits, gross [[144,12,12]] and two-gross [[288,12,18]] codes, logical processing units (LPUs) attached to each module perform selective logical measurements by qLDPC surgery; claims ~10× larger logical circuits per physical qubit than surface-code architectures | arXiv:2506.03094 | P |
| IBM Loon (12 Nov 2025): experimental processor with multiple low-loss routing layers for long-range on-chip couplers ("c-couplers"); real-time qLDPC decoding in < 480 ns; Nighthawk announced alongside (120 qubits, 218 tunable couplers) | IBM newsroom 2025-11-12; SiliconANGLE, HPCwire | P/S |
| Relay-BP (Müller et al., IBM): BP with disordered, partly negative memory strengths; *Improved belief propagation is sufficient for real-time decoding of quantum memory* | arXiv:2506.01779 | P |
| FPGA Relay-BP for the gross code: 24 ns per BP iteration; estimated < 240 ns average per 12-cycle window (AMD VU19P, int4 split X/Z) | arXiv:2510.21600 | P |
| IBM Starling: 200 logical qubits, 10⁸ operations, 2029, Poughkeepsie; "roughly 10,000 physical qubits" (IBM representatives, via Live Science); Blue Jay 2033: 2,000 logical qubits, 10⁹ operations | press coverage of the 10 Jun 2025 roadmap | S |
| Gidney, Shutty, Jones, *Magic state cultivation: growing T states as cheap as CNOT gates*: inside one surface-code patch; cost ≈ a lattice-surgery CNOT of similar reliability; 4×10⁻¹¹ logical error at 5×10⁻⁴ circuit noise | arXiv:2409.17595 | P |

## 11. Erasure and bosonic qubits

| Fact | Source | Grade |
|---|---|---|
| Levine et al., *Demonstrating a long-coherence dual-rail erasure qubit using tunable transmons*, PRX 14, 011051 (2024): erasure ≈ 2.19(2)×10⁻³ per single-qubit gate, residual errors ≈ 40× lower; mid-circuit erasure check adds < 0.1 % dephasing; ms-scale coherence in the dual-rail subspace | arXiv:2307.08737 | P |
| AWS Ocelot (Putterman et al., Nature 2025): 5 cat data qubits + 4 transmon ancillas (+ buffer modes), outer repetition code d = 5; logical error ≈ 1.75 %/cycle (d=3) → 1.65 %/cycle (d=5); AWS claims up to 90 % QEC overhead reduction (company claim). The digest garbled the paper title. | Amazon Science blog; Physics World | P/S |

## 12. Cryogenic engineering, wiring and control

| Fact | Source | Grade |
|---|---|---|
| Lecocq et al., *Control and readout of a superconducting qubit using a photonic link*, Nature 591, 575 (2021): photodiode at 20 mK; passive load **14 nW per 0.085″ stainless-steel coax** (measured) against a typical ~20 µW MXC cooling power; with fibre, active optical dissipation becomes the limit | arXiv:2009.01167 | P |
| Wang et al., *Cavity attenuators for superconducting qubits*, PR Applied 11, 014031 (2019): MXC-thermalised dissipative cavity; T₂E/2T₁ = 1.0 (+0.0/−0.1); residual readout-cavity photon population **≤ 2×10⁻⁴** | arXiv:1807.04849 | P |
| Cryo-CMOS at 4 K: IBM 14 nm FinFET controller ≈ **23 mW/qubit**, EPC 7.76×10⁻⁴ (comparable to room-temperature control); Bardin et al. 28 nm bulk CMOS **< 2 mW/qubit**; Intel 22 nm controller addressing 128 frequency-multiplexed qubits over 4 channels | IBM Research publication page; digests | P *(digest)* |
| Hybrid photonic/CMOS controller proposal: 0.905 mW per control channel (model), 3.448 mW for a normalised cryo-CMOS reference | arXiv:2606.10114 | M |
| Flexible striplines: about an order of magnitude higher cabling density without thermal overload (Paluch et al.); flex with integrated attenuators/filters equivalent to coax for transmon pulses (Monarkha et al., Bluefors/Delft Circuits) | arXiv:2410.01053; arXiv:2405.09211 | P |
| Semi-rigid coax at the MXC: practical limit ≈ **140 qubits** with engineering margin | arXiv:2502.01945 | M |
| Bluefors KIDE: 10 mK base; **> 90 µW at 20 mK, > 3,000 µW at 100 mK** (three sections); 1.6 m² base flange; > 4,000 RF lines; 500 kg payload; three dilution units each equal to an XLD1000sl (30 µW at 20 mK, 1,000 µW at 100 mK); nine pulse tubes; positioned for > 1,000 qubits (company claim) | bluefors.com KIDE page | P (company) |
| Third-party KIDE thermal model: ≈ 6 W at 4 K, ≈ 90 W at 50 K | arXiv:2608.00990 | M |
| Kawabata review, *Integration and resource estimation of cryoelectronics for superconducting FTQCs*: tens of µW at 10–20 mK shared by processor, wiring and base-stage electronics; heterogeneous cryo-CMOS (4 K) + superconducting logic | arXiv:2601.03922 | P (review) |
| Quantum-circuit refrigerator (Tan et al., Nat. Commun. 8, 15189 (2017)): photon-assisted NIS tunnelling, tunable dissipation; follow-up: qubit reset from 100 % to a few % in < 100 ns, non-exponential (APS March 2023); Sevriuk et al., APL 2022 | PMC5424155; APS abstract | P |

## 13. Radiation, quasiparticles, coherence

| Fact | Source | Grade |
|---|---|---|
| McEwen et al., *Resolving catastrophic error bursts from cosmic rays in large arrays of superconducting qubits*, Nat. Phys. 18, 107 (2022): impacts make chip-wide correlated error bursts via phonons → quasiparticles; Google blog: an impact roughly **every few seconds** | arXiv:2104.05219; Google Research blog (Jan 2022) | P |
| McEwen et al., *Resisting high-energy impact events through gap engineering in superconducting qubit arrays*, PRL 133, 240601 (2024): strongly gap-engineered qubits show **no T1 degradation** during impacts and resist optical QP poisoning | arXiv:2402.15644 | P |
| Vepsäläinen et al., Nature 584, 551 (2020): ionizing radiation raises QP density and would limit such qubits to **ms-range coherence**; lead shielding gives a modest improvement | arXiv:2001.09190 | P |
| Cardani et al., Nat. Commun. 12 (2021), doi:10.1038/s41467-021-23032-z: underground (Gran Sasso) with lead shielding, **QP burst rate × 1/50**, dissipation up to × 1/4 | arXiv:2005.02286 | P |
| Fluxonium: Somoroff et al. (arXiv:2103.08578) T₂* = 1.48 ± 0.13 ms, 1Q fidelity > 0.9999; Ding et al., PRX 13, 031035 (2023): 99.9 % 2Q gates with a transmon coupler (digest) | arXiv; phys.org | P/S |

## 14. Foundational references used in models (standard results, not re-verified this session)

- G. Catelani et al., PRL 106, 077002 (2011) and PRB 84, 064517 (2011): quasiparticle relaxation Γ = x_qp·√(2ω₁₀Δ/(π²ħ)).
- A. A. Clerk, D. W. Utami, PRA 75, 042302 (2007): thermal-photon dephasing; low-n limit Γφ = n̄κ·4χ²/(κ² + 4χ²).
- P. Panteleev, G. Kalachev (2021); J. Roffe et al., *Decoding across the quantum LDPC code landscape*, PRR 2, 043423 (2020) (BP-OSD, `ldpc` package).
- A. Kubica et al., *Erasure qubits: overcoming the T1 limit in superconducting circuits*, PRX 13, 041022 (2023); Y. Wu et al., *Erasure conversion for fault-tolerant quantum computing in alkaline earth Rydberg atom arrays*, Nat. Commun. 13, 4657 (2022).
- J.-H. Yeh et al., *Microwave attenuators for use with quantum devices below 100 mK*, J. Appl. Phys. 121, 224501 (2017).
- J. M. Martinis, *Saving superconducting quantum processors from decay and correlated errors generated by gamma and cosmic rays*, npj Quantum Inf. 7, 90 (2021) (phonon down-conversion / normal-metal traps).
- F. Henriques et al., *Phonon traps reduce the quasiparticle density in superconducting circuits*, APL 115, 212601 (2019).
