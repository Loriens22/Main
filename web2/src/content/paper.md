**AURORA-Q project · design study · November 2026.** Prepared with AI assistance (Claude, Anthropic). No hardware was fabricated or measured. Every number is graded as reported literature, simulation (this work), analytical model or engineering proposal; the source ledger is `research/sources.md`, sections 10–14.

> **Abstract.** We propose AURORA-Q2, a superconducting quantum computer architecture built around the gross bivariate-bicycle code [[144,12,12]] [^1] and a refrigerator designed for it. **Toroid**, the chip, uses a placement that makes four of each qubit's six couplings nearest-neighbour on a 24 × 12 grid. The qubit die then carries 540 couplers with zero crossings, and the remaining 324 couplers (288 long-range, 36 torus wrap-around) fit in two Manhattan routing layers of a flip-chip interposer with at most 11 tracks per channel. Straight-line routing would have needed 13 layers. **AURORA-CRYO**, the cooling architecture, moves control to 4 K cryo-CMOS, carries qubit drive on optical fibre, puts cavity attenuators on every input at the mixing chamber, and protects the dies against quasiparticle bursts. In circuit-level simulations with one circuit family, one noise model and one decoder (Stim + BP-OSD) for all codes, the gross code reaches 6.9 × 10⁻⁵ logical error per logical qubit per round at physical error p = 0.2 % and 6.6 × 10⁻⁴ at p = 0.3 %. Matching it with a surface code takes d = 13: 337 instead of 24 physical qubits per logical qubit, a 14× overhead advantage. Converting most gate errors into heralded erasures improves the gross code up to 150×. Dual-rail erasure qubits, however, tolerate only 0.85–1.8× higher raw error than transmons at equal transmon count, so Toroid keeps transmons and treats dual-rail as an upgrade path. An analytical model of AURORA-CRYO predicts thermal-photon dephasing falling from 121 µs to 796 µs (T₂ from 95 µs to 343 µs). Fed through the same simulator, its noise budget lowers the gross code's logical error 8–17× relative to a conventional cryostat budget, to about 10⁻⁶ per logical qubit per round. The model also predicts about 5,900 qubits per large-format refrigerator: 20 Toroid modules and 192 logical memory qubits, against about 730 qubits for coax with room-temperature control. Radiation bursts remain the dominant open risk. A one-day computation on 20 dies needs a per-impact logical failure probability ≲ 2 × 10⁻⁶ at a surface site.

## 1. Introduction

Below-threshold surface-code memories have now been demonstrated: Google's Willow reported a distance-7 memory at 0.143 % logical error per cycle with an error-suppression factor Λ ≈ 2.14 [^2]. The surface code's overhead is the problem. One logical qubit costs 2d² − 1 physical qubits, and a resource estimate for factoring RSA-2048 still needs close to a million of them [^3]. Quantum low-density parity-check (qLDPC) codes promise far higher encoding rates. The bivariate-bicycle (BB) family of Bravyi et al. stores 12 logical qubits in 288 physical qubits at distance 12, with weight-6 checks and a Tanner graph of thickness 2 [^1]. IBM has since built a modular architecture on these codes (Tour de gross [^4]), real-time decoders (Relay-BP [^5], FPGA decoding in < 240 ns per 12-cycle window [^6]) and an experimental chip with long-range c-couplers on multiple routing layers (Loon [^7]).

Two engineering questions follow, and this study takes them up:

1. **Chip.** How do you lay out a degree-6, partly long-range Tanner graph on a manufacturable superconducting die stack, and what does the layout cost?
2. **Refrigerator.** A gross-code machine with hundreds of logical qubits needs thousands of physical qubits, each with about 4 control lines. Which cryogenic architecture lets one refrigerator hold them while keeping the qubits quiet enough for the code to work?

We answer both with a design whose every component was either tested in simulation or modelled from published measurements, and we report where the evidence is weak.

## 2. Background

**Bivariate-bicycle codes.** With commuting cyclic shifts x = S_l ⊗ I_m and y = I_l ⊗ S_m, and two polynomials A, B with three monomials each, H_X = [A | B] and H_Z = [Bᵀ | Aᵀ] define a CSS code with n = 2lm [^1]. The gross code has l = 12, m = 6, A = x³ + y + y² and B = y³ + x + x², which gives [[144,12,12]]. The two-gross code [[288,12,18]] uses l = m = 12 [^4]. Bravyi et al. report a threshold near 0.7–0.8 % under circuit noise with a depth-7 syndrome cycle [^1].

**Erasure qubits.** An error whose location is heralded costs the decoder about half the distance of an unheralded one. Dual-rail transmon qubits turn T₁ decay into erasures: Levine et al. report about 2.2 × 10⁻³ erasure probability per single-qubit gate, residual errors about 40× lower, and < 0.1 % dephasing per mid-circuit erasure check [^8].

**Cryogenic scaling.** At the mixing chamber, a stainless coax leaks a measured 14 nW against a typical ~20 µW of cooling, which motivates photonic links: Lecocq et al. controlled and read out a qubit through a photodiode at 20 mK [^9]. Superconducting flex striplines raise wiring density by about an order of magnitude [^10]. Cryo-CMOS controllers at 4 K have been demonstrated at 2 mW/qubit (28 nm) and 23 mW/qubit (14 nm FinFET, with error per Clifford 7.76 × 10⁻⁴) [^11]. Thermal photons in readout resonators dephase qubits; MXC-thermalised cavity attenuators bound the residual population at ≤ 2 × 10⁻⁴ [^12].

**Radiation.** High-energy impacts create chip-wide bursts of correlated errors, on Sycamore roughly every few seconds [^13]. Strongly gap-engineered qubits showed no T₁ degradation during impacts [^14]. Underground operation with lead shielding cut quasiparticle burst rates 50× [^15]. Ionizing radiation would otherwise limit transmon coherence to the millisecond range [^16].

## 3. Architecture

### 3.1 Toroid chip

**Placement.** For g = (i, j) ∈ Z₁₂ × Z₆ we place X_g at (2i, 2j), L_g at (2i, 2j − 3), R_g at (2i − 3, 2j) and Z_g at (2i − 3, 2j − 3), all mod (24, 12). The map is a bijection onto the 288 grid sites. The couplings generated by y, y², x and x² are then exactly nearest-neighbour and form the toroidal square grid C₂₄ × C₁₂. The x³ and y³ couplings each span a (6, 3) offset, 5.4 mm at 0.8 mm pitch.

**Die stack.** A torus is not planar, so the die keeps the open grid: 540 nearest-neighbour tunable couplers, all 0.8 mm long, with zero crossings. The 36 wrap-around edges and the 288 long couplers go to the interposer. Straight-segment routing of those 324 couplers has 15,348 pairwise crossings, and a greedy colouring of the crossing graph needs 13 layers, which we reject. Two-layer Manhattan routing (x-runs on layer A, y-runs on layer B, one via per corner) with greedy channel balancing needs at most 11 tracks per channel, mean 7.9. In a 0.4 mm channel that is a 36 µm track pitch, between three Nb ground planes.

**Device choices.** We use fixed-frequency transmons in tantalum on high-resistivity silicon (ms-class T₁ reported [^17]) with tunable couplers, 288 Purcell-filtered λ/4 resonators on 36 feedlines of 8 qubits, gap-engineered junctions, and multi-level reset with an e–f tone. The tone follows from our earlier finding that g–e dissipative reset leaves 79 % of |f⟩ population (AURORA-Q study). The die measures 21.2 × 11.6 mm.

### 3.2 AURORA-CRYO

AURORA-CRYO is a large-format three-unit dilution platform (vendor specification: > 90 µW at 20 mK, > 3 mW at 100 mK, 1.6 m² base flange, > 4,000 RF lines [^18]) with four changes:

1. **4 K cryo-CMOS deck.** 24 controller boards generate frequency-multiplexed drive (8 qubits per line), bias the 864 coupler fluxes and digitise readout. The design target is 1 mW/qubit, between the measured 2 mW/qubit and a modelled 0.9 mW per channel [^11]. Six dedicated cryocoolers add 12 W at 4 K (assumption).
2. **Photonic drive and flex below 4 K.** Drive arrives on fibre and is converted at 10 mK by photodiode arrays, so no drive coax and no passive load [^9]. Coupler flux and readout use superconducting flex with integrated attenuators [^10].
3. **Cavity attenuators** on every input at the MXC, with the measured bound n̄ ≤ 2 × 10⁻⁴ used as a conservative floor [^12].
4. **Radiation and quasiparticle defence.** Gap engineering [^14], backside phonon traps, IR-tight shields, magnetic shielding and an optional underground site with Pb shielding [^15].

### 3.3 System

The MXC carries 20 module positions on copper cold fingers: 16 memory modules (12 logical qubits each) and 4 logic/factory positions for logical processing units [^4] and magic-state cultivation [^19]. A superconducting cryo-link ring connects the modules. Relay-BP runs on FPGAs at room temperature [^6].

## 4. Methods

**Memory circuits.** A single generator builds memory-Z experiments for every CSS code. Each round has a Z phase (reset Z ancillas, CNOT layers, measure) and an X phase (prepare |+⟩, CNOT layers, measure in X). BB codes use an exact schedule of 6 + 6 perfect-matching layers, one per polynomial term; the generator asserts that these layers reproduce H_X and H_Z. Surface codes use greedy edge colouring. Our cycle has 12 CNOT layers and two measurement windows, deeper than IBM's depth-7 cycle, so absolute BB numbers are conservative.

**Noise.** SD6-style: DEPOLARIZE2(p₂) after CNOTs, DEPOLARIZE1(p_idle) on idle qubits in each layer, flips before measurement and after reset, and idle error on data during ancilla measurement and reset. "Uniform p" sets all rates to p. For heralded-erasure studies, a fraction f of each CNOT's error budget becomes HERALDED_ERASE on both qubits.

**Decoding.** BP-OSD [^20] (min-sum, scaling 0.625, 100 iterations, OSD-CS order 7) on the non-decomposed detector error model restricted to Z-check detectors. Fired heralds raise the priors of the mechanisms they enable to 0.49, shot by shot. Each point runs to 100 failures, 3 × 10⁵ shots or 900 s. Block errors are converted to per-round, per-logical-qubit rates with Wilson 95 % intervals.

**Equal-error overhead.** For each p with surface-code Λ ≥ 1.3, we fit log ε(d) linearly over d = 5–9 and report the smallest odd d whose fitted ε is at or below the BB code's measured ε.

**Cryogenic models.** Beam-splitter photon chain; Clerk–Utami dephasing Γ_φ = n̄κ·4χ²/(κ² + 4χ²) with κ/2π = 2 MHz and 2χ = κ [^21]; quasiparticle relaxation Γ = x_qp√(2ωΔ/π²ħ) [^22]. T₁ combines dielectric (500 µs, assumption), quasiparticle and Purcell (5 ms) rates. Idle Pauli error over time t is t/4T₁ + t/2T₂, and p₂ = p_control + 2·idle(60 ns). Heat loads are summed per stage from per-line passive conduction, active dissipation and 4 K control power. Capacity is the minimum over stages of (capacity × 0.5)/(load per qubit), and over the RF line count.

**Validation.** The browser and Python implementations of the codes and of the cryogenic model agree in unit tests: the same n, k and check supports, and coherence and heat outputs equal to 10⁻⁹. During the study we found and fixed a bookkeeping bug: herald records had shifted the measurement-record offsets used by later detectors. After the fix, noiseless circuits fire no detectors and heralding helps, as theory predicts.

## 5. Results

### 5.1 Quantum memory

| p | gross [[144,12,12]] | bb72 [[72,12,6]] | surface d=5 | surface d=7 | surface d=9 |
|---|---|---|---|---|---|
| 0.002 | **6.9 × 10⁻⁵** | 8.2 × 10⁻⁴ | 1.8 × 10⁻³ | 6.5 × 10⁻⁴ | 2.1 × 10⁻⁴ |
| 0.003 | **6.6 × 10⁻⁴** | 2.9 × 10⁻³ | 5.3 × 10⁻³ | 2.8 × 10⁻³ | 1.6 × 10⁻³ |
| 0.004 | **3.4 × 10⁻³** | 7.8 × 10⁻³ | 1.0 × 10⁻² | 8.1 × 10⁻³ | 4.6 × 10⁻³ |
| physical / logical | 24 | 12 | 49 | 97 | 161 |

*Logical error per logical qubit per round (simulated).* The surface code's suppression factor across d = 5–9 is Λ = 2.88, 1.84 and 1.48 at p = 0.2, 0.3 and 0.4 % and collapses to about 1 above 0.5 %. This places the threshold of our schedule and decoder near 0.5–0.6 %, lower than the 0.7 % reported for the optimised depth-7 BB cycle [^1], as expected for a deeper circuit. At every p below threshold the gross code beats surface d = 9 while using 6.7× fewer qubits per logical qubit.

A power-law fit of the gross code over p = 0.2–0.4 % gives an exponent of 5.6. Extrapolated to p = 10⁻³ this predicts about 1.4 × 10⁻⁶ per logical qubit per round. That value is an extrapolation over a factor of two in p with only three points, and should be read as an order of magnitude.

### 5.2 Equal-error overhead

At p = 0.2 % and 0.3 % a surface code needs d = 13 (337 physical qubits per logical qubit) to match the gross code's 24, a **14× advantage**. At 0.4 % it needs d = 11, a 10× advantage. These distances come from the surface-code fit. For bb72, the simulated surface d = 7 already matches it, giving 12 vs 97 qubits per logical qubit (8.1×) with no extrapolation. These figures agree with the order-of-magnitude advantage IBM reports for the bicycle architecture [^4].

### 5.3 Heralded erasures and the dual-rail trade

At p = 0.5 %, converting 50 %, 90 % and 97.5 % of the CNOT error budget into heralded erasures lowers the gross code's logical error from 1.2 × 10⁻² to 2.1 × 10⁻³, 2.5 × 10⁻⁴ and 8.2 × 10⁻⁵: improvements of 6×, 49× and 150×. bb72 saturates sooner, at 2.0 × 10⁻³ for f = 0.975, because unconverted measurement, reset and idle errors then dominate.

Dual-rail qubits pay for erasure conversion with a second transmon. At an equal 288 transmons the comparison is dual-rail bb72 (f = 0.975) against transmon gross (f = 0). Interpolating our runs, the dual-rail machine matches the transmon machine only when its raw error is at most 1.16×, 1.50×, 1.82× and 1.70× the transmon error at p_transmon = 0.3, 0.4, 0.5 and 0.6 %. At 0.2 % it is already worse at equal raw error (0.85×, extrapolated). **This is a negative result for dual-rail as the baseline.** It is not a negative result for erasure conversion. The architecture keeps transmons, adds leakage heralding where readout allows, and leaves dual-rail as an upgrade if dual-rail CNOTs come within these margins.

### 5.4 Layout

The layout engine confirms a planar die (540 couplers, 0 crossings) and 324 interposer couplers: 192 at 5.4 mm and the rest at 8.6–18.4 mm (wrap-around variants). A 5.4 mm coupler is close to a quarter wavelength at 5 GHz on silicon, so these couplers must be designed as tunable transmission-line couplers with their spurious modes detuned. We do not model that crosstalk here.

### 5.5 Coherence budget

| Quantity | Conventional | AURORA-CRYO |
|---|---|---|
| Thermal photons n̄ in readout resonator | 1.3 × 10⁻³ | 2.0 × 10⁻⁴ (measured bound used as floor) |
| Thermal dephasing T_φ,th | 121 µs | 796 µs |
| Quasiparticle T₁ limit (x_qp 3 × 10⁻⁸ → 3 × 10⁻⁹) | 0.84 ms | 8.4 ms |
| T₁ / T₂ | 295 / 95 µs | 431 / 343 µs |
| Residual excited population | 1.3 % | 0.21 % |
| p₂ / p_idle / p_idle,meas / p_meas / p_reset | 1.2e-3 / 4.9e-4 / 4.6e-3 / 2.9e-3 / 5e-3 | 8.4e-4 / 1.6e-4 / 1.2e-3 / 2.6e-3 / 2e-3 |

*Analytical model. Its inputs are listed in Methods; the AURORA-CRYO two-qubit error includes a +10⁻⁴ penalty for cryo-CMOS control.* Removing thermal photons is the largest single gain. The idle error on data during measurement falls about 4×, the main reason AURORA-CRYO helps the gross code.

### 5.6 Cooling → logical error

We fed both noise budgets from Section 5.5, unchanged and untuned, into the same memory simulator.

| Code | Conventional budget | AURORA-CRYO budget | improvement |
|---|---|---|---|
| gross [[144,12,12]] | 1.5 × 10⁻⁵ (18 failures / 17,152 shots) | **1.8 × 10⁻⁶** measured (4 / 30,208; 95 % upper bound 4.7 × 10⁻⁶); 8.8 × 10⁻⁷ from a fit of the ×2 and ×3 scaled budgets | 8–17× |
| bb72 [[72,12,6]] | 2.9 × 10⁻⁴ (100 / 4,907) | 3.4 × 10⁻⁵ (100 / 40,456) | 8× |
| surface d = 7 | 3.7 × 10⁻⁴ (100 / 38,668) | 8.6 × 10⁻⁶ (18 / 300,000) | 43× |

*Logical error per logical qubit per round (simulated).* Under either budget, the gross code beats surface d = 7 with 4× fewer qubits per logical qubit: about 25× better under the conventional budget and about 5–10× under AURORA-CRYO. The surface code gains more from the cooling design (43×) because its d-round experiment is dominated by data idle error during measurement and reset, which AURORA-CRYO cuts about 4×. For the gross code, AURORA-CRYO brings memory to about 10⁻⁶ per logical qubit per round. A 12-qubit module then fails about once per 8 × 10⁴ rounds (≈ 0.1 s at a 1.24 µs cycle). That is enough for memory and benchmarking, but long algorithms will need the two-gross code (d = 18) or lower physical error. We did not run the scaled budgets for bb72 and surface codes, or the surface d = 9 budget runs; none of these comparisons needs them.

### 5.7 Refrigerator capacity

| Wiring architecture | qubits / refrigerator | limiting stage | Toroid modules |
|---|---|---|---|
| Coax + room-temperature control | 727 | 4 K | 2 |
| Flex + room-temperature control | 1,237 | 4 K | 4 |
| AURORA-CRYO, 6 W at 4 K | 1,967 | 4 K | 6 |
| AURORA-CRYO + 12 W dedicated 4 K | **5,901** | 4 K | **20** |

*Analytical model.* The 4 K stage limits every option, so AURORA-CRYO's gain rests on cryo-CMOS power. At the measured 23 mW/qubit, one refrigerator holds only 127 qubits (382 with the extra cooling). At 2 mW it holds 1,188 (3,564), and at 0.5 mW, 2,926 (8,571, where the MXC becomes the limit). Line count limits coax at 941 qubits, before heat does.

### 5.8 Radiation

With 0.1 impacts per cm² per second (assumption, consistent with "every few seconds" on a single chip [^13]) and 2.46 cm² dies, a 20-die machine without mitigation suffers a radiation-induced logical failure every **0.2 s**. If gap engineering lowers the per-impact failure probability to 10⁻³ (assumption), the mean time between failures becomes 3.4 min, and 2.8 h underground. A one-day computation needs p_fail ≲ 2.4 × 10⁻⁶ at a surface site or ≲ 1.2 × 10⁻⁴ underground. McEwen et al. observed no T₁ degradation in strongly gap-engineered qubits [^14], but no experiment has yet bounded p_fail at these levels. This is the most important experiment AURORA-Q2 depends on.

## 6. One refrigerator, projected

| | Value | Grade |
|---|---|---|
| Physical qubits | 5,760 in 20 modules (≤ 5,901 modelled capacity) | model |
| Logical memory | 16 × 12 = 192 logical qubits | proposal |
| Memory error, uniform p = 0.2 % | 6.9 × 10⁻⁵ per logical qubit per round | simulated |
| Memory error, AURORA-CRYO noise budget | 1.8 × 10⁻⁶ per logical qubit per round (4 failures; fit 8.8 × 10⁻⁷) | simulated |
| Syndrome cycle | ≈ 1.24 µs interleaved (design) | proposal |
| Decoding | Relay-BP, FPGA, < 240 ns per 12-cycle window (reported estimate) | literature |
| Qubits per logical (system) | 5,760 / 192 = 30 | proposal |

IBM's Starling target, 200 logical qubits on roughly 10,000 physical qubits by 2029 [^23], is about 50 physical qubits per logical qubit at system level. AURORA-Q2 projects 30 per logical qubit in one refrigerator, provided cryo-CMOS reaches 1 mW/qubit. The two are not directly comparable: Starling's figure is a company target for a full system, and ours is a simulated and modelled design.

## 7. Comparison

Measured results from other platforms (Willow's d = 7 memory [^2], Quantinuum Helios' 98 qubits at 99.921 % two-qubit fidelity [^24], neutral-atom fault-tolerant architectures with up to 448 atoms [^25], AWS Ocelot's cat-qubit repetition code [^26], Microsoft's 20-second tetron parity lifetime [^27]) are listed beside our projections on the Comparison page, each with its evidence grade. AURORA-Q2's advantages are its encoding rate and the integration of the cooling design with the code. Its weaknesses are that it is unbuilt, that it depends on unproven cryo-CMOS power, and that it inherits the radiation problem.

## 8. Limitations

- Nothing was fabricated or measured. Device parameters are literature values or labelled assumptions.
- The Pauli noise model omits leakage (except as heralded erasure), crosstalk, frequency collisions, non-Markovian noise and long-coupler parasitics.
- The memory experiments are memory-Z only, 6 rounds for BB codes. Full X + Z memory roughly doubles logical error. Our syndrome cycle is deeper than the best published one.
- Extrapolations to p = 10⁻³ and the scaled-budget fits in Section 5.6 rest on few points.
- Logical processing units, surgery, the cryo-link and magic-state cultivation come from the literature and were not simulated.
- Sources were read through search digests. Numbers flagged in the ledger should be checked against the original PDFs.

## 9. Conclusions and the experiments that would falsify this design

A gross-code machine needs a chip with a planar nearest-neighbour die and a two-layer interposer, and a refrigerator whose 4 K stage, not its mixing chamber, sets the qubit count. Under one consistent simulation setup the gross code delivers a 10–14× qubit advantage over the surface code. AURORA-CRYO's thermal-photon and wiring changes lower the idle and gate errors the code is most sensitive to. Four experiments would confirm or kill the design:

1. A 5.4 mm interposer c-coupler at 36 µm pitch with low crosstalk and two-qubit error ≤ 2 × 10⁻³.
2. A cryo-CMOS controller at ≤ 1 mW/qubit with error per Clifford ≤ 10⁻³.
3. A measured bound on per-impact logical failure probability ≤ 10⁻⁴ in a gap-engineered, phonon-trapped multi-qubit die.
4. A dual-rail CNOT within 1.5× of transmon error at ≥ 97.5 % erasure fraction, which would switch Toroid to its erasure variant.

## References

[^1]: S. Bravyi, A. W. Cross, J. M. Gambetta, D. Maslov, P. Rall, T. J. Yoder, *High-threshold and low-overhead fault-tolerant quantum memory*, Nature 627, 778 (2024), doi:10.1038/s41586-024-07107-7; [arXiv:2308.07915](https://arxiv.org/abs/2308.07915).
[^2]: Google Quantum AI, *Quantum error correction below the surface code threshold*, Nature 638, 920 (2025).
[^3]: C. Gidney, *How to factor 2048 bit RSA integers with less than a million noisy qubits*, [arXiv:2505.15917](https://arxiv.org/abs/2505.15917) (2025).
[^4]: IBM Quantum, *Tour de gross: A modular quantum computer based on bivariate bicycle codes*, [arXiv:2506.03094](https://arxiv.org/abs/2506.03094) (2025).
[^5]: T. Müller et al., *Improved belief propagation is sufficient for real-time decoding of quantum memory*, [arXiv:2506.01779](https://arxiv.org/abs/2506.01779) (2025).
[^6]: IBM Quantum, *Real-time decoding of the gross code memory with FPGAs*, [arXiv:2510.21600](https://arxiv.org/abs/2510.21600) (2025).
[^7]: IBM, *IBM delivers new quantum processors, software, and algorithm breakthroughs on path to advantage and fault tolerance* (Loon and Nighthawk), press release, 12 Nov 2025, [newsroom.ibm.com](https://newsroom.ibm.com/2025-11-12-ibm-delivers-new-quantum-processors,-software,-and-algorithm-breakthroughs-on-path-to-advantage-and-fault-tolerance).
[^8]: H. Levine et al., *Demonstrating a long-coherence dual-rail erasure qubit using tunable transmons*, Phys. Rev. X 14, 011051 (2024); [arXiv:2307.08737](https://arxiv.org/abs/2307.08737).
[^9]: F. Lecocq et al., *Control and readout of a superconducting qubit using a photonic link*, Nature 591, 575 (2021); [arXiv:2009.01167](https://arxiv.org/abs/2009.01167).
[^10]: Paluch et al., [arXiv:2410.01053](https://arxiv.org/abs/2410.01053); Monarkha et al., *Equivalence of flexible stripline and coaxial cables for superconducting qubit control and readout pulses*, [arXiv:2405.09211](https://arxiv.org/abs/2405.09211) (2024).
[^11]: IBM Research, *A cryo-CMOS low-power semi-autonomous transmon qubit state controller in 14-nm FinFET technology*; J. C. Bardin et al., 28 nm bulk-CMOS cryogenic controller (< 2 mW/qubit); hybrid photonic/CMOS controller model, [arXiv:2606.10114](https://arxiv.org/abs/2606.10114) (figures via search digest).
[^12]: Z. Wang et al., *Cavity attenuators for superconducting qubits*, Phys. Rev. Applied 11, 014031 (2019); [arXiv:1807.04849](https://arxiv.org/abs/1807.04849).
[^13]: M. McEwen et al., *Resolving catastrophic error bursts from cosmic rays in large arrays of superconducting qubits*, Nat. Phys. 18, 107 (2022); Google Research blog (Jan 2022).
[^14]: M. McEwen et al., *Resisting high-energy impact events through gap engineering in superconducting qubit arrays*, Phys. Rev. Lett. 133, 240601 (2024); [arXiv:2402.15644](https://arxiv.org/abs/2402.15644).
[^15]: L. Cardani et al., *Reducing the impact of radioactivity on quantum circuits in a deep-underground facility*, Nat. Commun. 12 (2021), doi:10.1038/s41467-021-23032-z.
[^16]: A. P. Vepsäläinen et al., *Impact of ionizing radiation on superconducting qubit coherence*, Nature 584, 551 (2020).
[^17]: M. P. Bland, F. Bahrami et al., *Millisecond lifetimes and coherence times in 2D transmon qubits*, Nature 647, 343 (2025).
[^18]: Bluefors, *KIDE cryogenic platform*, product specification, [bluefors.com](https://bluefors.com/products/kide-cryogenic-platform/) (vendor claims).
[^19]: C. Gidney, N. Shutty, C. Jones, *Magic state cultivation: growing T states as cheap as CNOT gates*, [arXiv:2409.17595](https://arxiv.org/abs/2409.17595) (2024).
[^20]: J. Roffe et al., *Decoding across the quantum low-density parity-check code landscape*, Phys. Rev. Research 2, 043423 (2020) (`ldpc` package); P. Panteleev, G. Kalachev (2021).
[^21]: A. A. Clerk, D. W. Utami, *Using a qubit to measure photon-number statistics of a driven thermal oscillator*, Phys. Rev. A 75, 042302 (2007).
[^22]: G. Catelani et al., Phys. Rev. Lett. 106, 077002 (2011); Phys. Rev. B 84, 064517 (2011).
[^23]: IBM Quantum roadmap announcement (10 June 2025): Starling, 200 logical qubits and 10⁸ operations by 2029; press coverage.
[^24]: Quantinuum, *Introducing Helios* (Nov 2025), [quantinuum.com](https://quantinuum.com/blog/introducing-helios-the-most-accurate-quantum-computer-in-the-world).
[^25]: D. Bluvstein et al., *A fault-tolerant neutral-atom architecture for universal quantum computation*, Nature (2025), doi:10.1038/s41586-025-09848-5.
[^26]: H. Putterman et al. (AWS), cat-qubit logical memory with a distance-5 repetition code, Nature (2025); Amazon Science blog, *Amazon announces Ocelot quantum chip*.
[^27]: Microsoft Quantum, *20 Second Parity Lifetime in an InAs–Pb Tetron Device*, [arXiv:2606.03884](https://arxiv.org/abs/2606.03884) (2026).
