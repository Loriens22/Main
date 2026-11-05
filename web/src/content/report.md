# AURORA-Q: Research and Simulation of a Next-Generation Quantum Computing Architecture for Reliable Computation and Hybrid Artificial Intelligence

*AURORA-Q Research Platform · technical report v1.0 · 5 November 2026*

> **Status of this work.** AURORA-Q is a *design study* supported by software. Nothing described here has been fabricated or measured in a laboratory. Every quantitative statement carries one of these grades: :::lit reported in literature::: (manufacturer claims are flagged as such), :::sim simulated in this work:::, :::model analytical model:::, :::prop engineering proposal:::, :::cont contested / unverified::: or :::neg negative result:::.

## 1. Abstract

We ask how today's increasingly capable quantum processors can become more reliable, faster, more scalable and more useful for scientific and AI workloads. We review two June–September 2026 milestones in depth: Microsoft's **Majorana 2** topological-qubit device, which reports a characteristic Z-parity switching time of $\tau_Z = 22 \pm 1$ s in an InAs–Pb tetron[^1], and IBM's **Nighthawk r2**, a 120-qubit square-lattice superconducting processor with 218 couplers and 120 dedicated reset elements that IBM reports runs over 100,000 circuits per second[^12]. We then build AURORA-Q, a superconducting compute-tile architecture inspired by Nighthawk r2, and test its design choices with reproducible simulations: circuit routing on three connectivity graphs, a frequency-collision yield model, noise-aware placement, surface-code memory with Stim and PyMatching, a Lindblad model of a dissipative reset element, error mitigation, and hybrid quantum–classical learning.

Our main findings are: (i) dedicated, fast, high-fidelity reset lowers simulated surface-code logical error per round by **≈4.5×** at distance 7 under Heron-class noise, mostly through lower initialisation error and shorter idling :::sim:::; (ii) our own pre-registered hypothesis that sparse diagonal couplers would cut routed two-qubit gate counts by ≥10 % is **rejected**: the best placement with ≤11 % extra couplers saves 3.7 %, while lowering modelled collision-free yield from ≈93 % to ≈28 % :::neg:::; (iii) noise-aware placement raises estimated success probability by 21–45 % on a synthetic heterogeneous device :::sim:::; (iv) with a 22 s parity lifetime, quasiparticle poisoning stops being the error bottleneck for a tetron-based code; the binding constraint becomes measurement fidelity, especially the X-loop measurement that Majorana 2 has not yet reported :::model:::; and (v) none of our small quantum-machine-learning experiments beat simple classical baselines :::neg:::. All of the code, results and 3D assets are in the repository; the browser engine is cross-validated against Qiskit and Aer in 110 automated tests.

## 2. Introduction

A quantum computer manipulates a state $|\psi\rangle$ in a $2^n$-dimensional Hilbert space. A pure state evolves unitarily, $|\psi(t)\rangle = U(t)|\psi(0)\rangle$, and an open (noisy) system evolves through a completely positive trace-preserving map

$$\rho \;\mapsto\; \mathcal{E}(\rho) = \sum_k K_k \rho K_k^\dagger, \qquad \sum_k K_k^\dagger K_k = \mathbb{1}.$$

A measurement in the computational basis returns bit-string $b$ with probability $p(b) = \langle b|\rho|b\rangle$. Computation is useful when interference among the $2^n$ amplitudes produces output distributions that classical machines cannot sample or estimate efficiently. It fails when decoherence, gate errors, leakage and measurement errors accumulate faster than error correction can remove them. That race between useful interference and accumulated error is the subject of this report.

Two regimes matter. In the noisy intermediate-scale (NISQ) regime[^51], circuits run without full error correction, and error mitigation trades sampling overhead for bias reduction[^48][^49][^50]. In the fault-tolerant regime, logical qubits are encoded in many physical qubits; once physical error rates fall below a code's threshold, logical error is suppressed exponentially with code distance $d$[^43][^24]. The engineering question is how to get to, and then cheaply through, that threshold.

## 3. Research motivation

Three observations motivated AURORA-Q.

1. **Useful computation per unit time, not qubit count.** IBM's Nighthawk r2 improves circuit throughput by roughly 25× over Heron *without* changing the qubit count, by replacing measurement-and-feed-forward (conditional) reset with dedicated dissipative reset hardware[^12]. That suggests reset and scheduling are an under-explored architectural lever.
2. **Connectivity has diminishing returns.** Square lattices (degree 4) need fewer SWAPs than heavy-hex (degree ≤ 3), but each added coupler costs frequency-allocation space, crosstalk and fabrication yield. The optimum is a quantitative trade-off, not "more is better".
3. **Topological qubits change *which* error dominates.** If Majorana 2's ≈20 s parity lifetime holds up, parity-flip errors per QEC cycle become negligible. That moves the bottleneck to measurement fidelity, a point that needs to be made quantitatively.

## 4. Current state of quantum computing

### 4.1 Fundamentals that shape engineering

- **Physical vs logical qubits.** A rotated surface code of distance $d$ uses $d^2$ data and $d^2-1$ measurement qubits. A logical error rate per round scales approximately as $\varepsilon_L \approx A\,\Lambda^{-(d+1)/2}$, where $\Lambda$ is the suppression factor gained per $d \to d+2$[^43][^24].
- **Gate fidelity vs coherence.** The error of an idle or gated qubit grows with time through amplitude damping ($T_1$) and dephasing ($T_2$). This is why faster gates, faster measurement and faster *reset* all reduce error per logical operation.
- **Initialisation.** Every shot and every reused ancilla starts with a reset. Residual excited population after reset enters syndrome extraction directly as a measurement-like error (Section 13).
- **Compilation.** Two-qubit gates between non-adjacent qubits need SWAP chains; each SWAP costs three CNOT/CZ-equivalent gates. Routing overhead is therefore a hardware property (the coupling graph) as much as a software one[^47].
- **Verifying advantage.** Claims of quantum advantage need a verifiable task and a credible classical baseline[^58][^59]. Doped-Clifford and random-circuit-sampling demonstrations on Nighthawk r2 are already being contested by classical simulation work[^16][^17].

### 4.2 Hardware landscape (2024–2026)

| Platform | Representative result | Strengths | Limiting factors | Grade |
|---|---|---|---|---|
| Superconducting transmons | Google Willow: distance-7 surface code with 0.143 % error per cycle, ≈2× suppression per distance step; 1.1 µs cycle; real-time decoding[^24] | Fast gates (tens of ns), mature lithography, real-time QEC demonstrated | Wiring and cryogenic heat per qubit; frequency crowding; TLS defects; leakage | :::lit reported::: |
| Superconducting materials | Ta-on-high-resistivity-Si transmons with $T_1$ up to 1.68 ms and 99.994 % single-qubit fidelity[^26] | Materials path to ~1 ms coherence | Single devices; wafer-scale uniformity still to show | :::lit reported::: |
| Trapped ions | Quantinuum Helios: 98 ¹³⁷Ba⁺ qubits, 99.921 % two-qubit fidelity across all pairs, 48 error-corrected logical qubits[^27] | Highest fidelities, all-to-all connectivity | Gate speed (~100 µs scale), transport overhead, only a subset of gates in parallel | :::lit reported::: |
| Neutral atoms | Up to 448 atoms executing the key elements of a fault-tolerant architecture, ≈2.1× below-threshold suppression[^28] | Large reconfigurable arrays, native multi-qubit layouts | Slow cycles (ms), atom loss, laser complexity | :::lit reported::: |
| Photonics | PsiQuantum Omega: 99.98 % SPAM, 99.22 % fusion fidelity, GlobalFoundries manufacturing[^29] | Room-temperature networking, foundry fab | Photon loss; probabilistic fusion; needs very large resource counts | :::lit company-reported::: |
| Silicon spins | 300 mm foundry unit cells with >99 % one- and two-qubit fidelity[^30] | CMOS compatibility, tiny footprint | Variability, nuclear-spin noise, control fan-out | :::lit reported::: |
| Topological (Majorana) | InAs–Al tetrons: single-shot parity readout, Z/X loop lifetimes 12.4 ms / 14.5 µs[^3][^4]; InAs–Pb tetron: $\tau_Z = 22 \pm 1$ s[^1] | Hardware-level protection, measurement-only operations, small footprint | Topological nature disputed; no X-measurement lifetime yet reported for Pb devices; no two-qubit operation yet | :::cont contested::: |

Numbers measured on different platforms are not interchangeable. A parity lifetime is not a coherence time, and per-gate fidelities measured with different protocols (randomized benchmarking, layer fidelity, gate-set tomography) are not directly comparable. Table entries are therefore descriptive only.

## 5. Microsoft Majorana 2: technical analysis

### 5.1 What was reported

The Majorana 2 preprint, *"20 Second Parity Lifetime in an InAs–Pb Tetron Device"* (arXiv:2606.03884, 2 June 2026, 165 authors)[^1], reports interferometric single-shot parity measurements in a **tetron**. A tetron is two parallel topological nanowires joined by a trivial superconducting backbone, hosting four Majorana zero modes and encoding one qubit in their joint fermion parity[^5]. The main change from Majorana 1 is the superconductor: **lead replaces aluminium**[^2]. The paper reports a characteristic parity switching time of about 20 s, with an exponential fit to dwell times giving $\tau_Z = 22 \pm 1$ s and some dwell times reaching minutes[^1]. Earlier aluminium-based devices showed Z-parity lifetimes of 1–12 ms[^2]. In the companion X/Z study on an InAs–Al tetron, τ_Z ≈ 12.4 ms (attributed to quasiparticle poisoning), τ_X ≈ 14.5 µs (thermal excitation and residual Majorana splitting), with single-shot errors of 0.5 % (Z) and 16 % (X)[^4]. Microsoft frames the change as a ≈1,000× reliability gain and now targets a scalable machine by 2029[^2]. In September 2026, DARPA received on-site access to a Majorana 2-based system at a new Maryland facility under the US2QC track of its Quantum Benchmarking Initiative[^10]. Microsoft says its *Microsoft Discovery* agentic-AI platform helped manage workflows, automate measurements, optimise fabrication and flag defects, with scientists validating results[^2].

### 5.2 What the measured quantity means

The 22 s figure is a **parity switching time**: the mean time between changes in the fermion parity of one nanowire, observed through a quantum-capacitance-style interferometric readout. It measures protection against *quasiparticle poisoning*, the arrival of a single electron that flips the parity. It is **not** a $T_2$ coherence time of a qubit in superposition, and it should not be compared with transmon $T_1$/$T_2$ values. For a tetron used as a qubit, both $Z$ (single-wire parity) and $X$ (joint parity across both wires) measurements are needed, and the Al-device data show the two can differ by three orders of magnitude[^4].

Independent analysis notes that the radio-frequency spectroscopy and Z-parity lifetime were measured on **one nanowire of one grounded tetron**, not on a multi-qubit unit cell, and that **X measurements are absent**[^8]. Critics including H. Legg argue that "nothing in the presented data proves the existence of a topological qubit or Majoranas in these devices"[^9], continuing earlier disputes over the topological gap protocol[^6][^7]. Secondary reports place the Pb-device topological gap at ≈70 µeV, about twice the ≈30 µeV aluminium figure[^8]. A larger induced gap is a physically plausible reason for suppressed poisoning, but it does not settle whether the zero modes are topological. We grade the topological interpretation :::cont contested::: and treat the lifetime as a reported measurement.

### 5.3 Manufacturing architecture (public information)

Public documents describe a semiconductor–superconductor heterostructure: an InAs two-dimensional electron gas with an epitaxial superconductor (formerly Al, now Pb) patterned into nanowires, gate electrodes that tune the chemical potential into the topological regime, quantum dots coupled to the wire ends for interferometric readout, and rf resonators for capacitance sensing[^3][^5]. Theory predicts that poisoning rates fall exponentially with the charging energy relative to temperature, and that leads and gaps set extrinsic rates[^11]. **Experimentally supported:** single-shot Z-parity readout and long Z-parity dwell times. **Not yet shown publicly:** an X-measurement lifetime and fidelity in Pb devices, a measurement-based single-qubit Clifford, a two-qubit operation, and wafer-scale yield.

### 5.4 Improvement hypotheses we can test

Using a phenomenological surface-code model in which each faulty measurement also leaves an error of the same rate on the data (Section 12.4), we ask which parameter now limits the error budget.

- Poisoning-limited flip probability per QEC cycle: $p_{\rm flip} = 1 - e^{-T_{\rm cyc}/\tau}$. For a 10 µs cycle this gives $8.1\times10^{-4}$ with Al ($\tau_Z$ = 12.4 ms) and $4.5\times10^{-7}$ with Pb ($\tau_Z$ = 22 s) :::model:::. **Poisoning is no longer a meaningful contributor.**
- Under the measurement-dominated model, the threshold on the per-measurement error sits at roughly 5 % in our finite-size simulation :::sim:::. The Al-device X-loop error of 16 % is far above this; the Z-loop error of 0.5 % is well below.
- **Hypothesis M1:** for Majorana 2 to support a fault-tolerant memory, its X-type parity measurement must reach a single-shot error ≲1 % at a cycle time short compared with any X-loop decay time. This is directly testable by the experiment that has not yet been published.
- Further levers, all speculative until demonstrated: larger charging energies, tighter filtering of lead-induced poisoning[^11], measurement-integration optimisation, and on-package cryo-electronics to reduce readout-line noise.

## 6. IBM Quantum Nighthawk r2: technical analysis

### 6.1 Architecture

Nighthawk (November 2025) introduced 120 qubits on a **square lattice** with 218 tunable couplers, more than 20 % more couplers than Heron's 176, and a stated capacity of 5,000 two-qubit gates per circuit, with roadmap targets of 7,500 (2026), 10,000 (2027) and 15,000 (2028)[^13]. We note that 218 is exactly the number of edges of a 10 × 12 grid ($10\cdot11 + 12\cdot9$), and we use that graph throughout. The first device, *ibm_miami*, was described as exploratory; its default repetition delay was raised from 250 µs to 4 ms[^14].

Nighthawk r2 adds **120 independent reset elements**, one per qubit: 120 qubits + 218 couplers + 120 reset elements = **458 physical quantum elements**, of which only 120 are programmable qubits[^12]. IBM's blog and secondary reports describe a *dissipative reset gadget* that, when activated, pulls the qubit toward its ground state, lowering the effective $T_1$ from ≈200 µs to ≈25 ns. IBM also reports a ≈25× reduction in initialisation error across the device[^12].

### 6.2 Throughput claims and what they mean

IBM reports **>100,000 circuits per second**, compared with ≈4,000 for Heron, a ≈25× speed-up, with the idle interval between circuits reduced to about 1 µs[^12]. This is a circuits-per-second figure, **not** the layer-based CLOPS metric[^18], and the sources we could access do not state the benchmark circuits or their depth. Our throughput model (Section 12.3) shows why that matters: Heron's ≈4,000 circuits/s is what a 250 µs repetition delay implies for short circuits, and a ≈1 µs idle interval allows ≫100k/s for few-µs circuits. For a 50 µs circuit, however, the same hardware gives only ≈5.8× speed-up :::model:::. Partner reports give a workload-level picture: Q-CTRL measured a 60-qubit, 30-Trotter-step dynamics pipeline at 4 min 25 s on Heron r3 (ibm_boston) versus 23 s on Nighthawk r2 (ibm_phoenix), ≈12×[^15].

### 6.3 Execution quality and contested advantage claims

Public dashboards put Heron r3 around a 1.5 × 10⁻³ median two-qubit error and 1.3 × 10⁻² readout error (August 2025 snapshot)[^20]. IBM defines EPLG over a 100-qubit chain[^19]. Nighthawk r2 has been used for doped-Clifford sampling with syndrome post-selection and for random-circuit sampling[^17]; a classical simulation of the doped-Clifford instance reports a log-XEB compatible with IBM's fidelity bound under some assumptions[^16]. We grade those advantage claims :::cont under active debate:::.

### 6.4 Nighthawk-inspired improvements (each with a measurable criterion)

| Proposal | Metric | Test in this work |
|---|---|---|
| Reset-overlapped scheduling | QEC cycle time; logical error per round | Section 13.3 :::sim::: |
| Multi-level (e–f) reset tone | Residual leakage after reset | Section 12.5 :::sim::: |
| Noise-aware placement | Estimated success probability (ESP) | Section 15 :::sim::: |
| Sparse diagonal couplers | Routed CZ count *and* collision-free yield | Section 15 :::neg rejected::: |
| Pipelined reset + result streaming | Circuits per second vs circuit length | Section 12.3 :::model::: |

## 7. Comparative hardware review

The most relevant comparison for AURORA-Q is between superconducting connectivity graphs, because those choices are under our control in simulation. Across 12 held-out benchmark circuits (QAOA on 3-regular graphs, quantum-volume, QFT, sparse random, Bernstein–Vazirani, GHZ and 2D Ising), routing on the Heron-class heavy-hex graph used **1.49×** the CZ gates of the 10 × 12 square lattice (geometric mean) :::sim:::. That figure is consistent in direction with IBM's statement that Nighthawk runs ~30 % more complex circuits than Heron[^13], though the two figures measure different things.

Majorana 2 and Nighthawk r2 cannot be ranked on a common scale today. One reports a parity-switching time on a single wire; the other operates a 120-qubit programmable processor. The fair statement is that superconducting systems lead on *demonstrated system integration*, while topological devices remain *potential* contenders whose physics claims are still under independent review.

## 8. Identified engineering bottlenecks

1. **Reset and idle time** limit both throughput and QEC cycle error (quantified in Sections 12–13).
2. **Readout fidelity** (≈1 % class) dominates the error budget of conditional reset and of syndrome measurement.
3. **Leakage** into $|f\rangle$ survives a reset that only addresses the $|e\rangle \to |g\rangle$ transition (79 % of leaked population remains after 400 ns in our model).
4. **Frequency crowding**: adding couplers raises the number of collision constraints faster than it saves gates.
5. **Wiring**: ≈392 lines per 120-qubit tile in our counting (drive, coupler flux, multiplexed reset pumps, readout), all passing through mK stages with µW-scale cooling power.
6. **Classical co-processing**: real-time decoding at µs-scale cycle times[^22][^23] and low-latency feed-forward.
7. **Variational QML** shows no evidence of advantage at the scales we can simulate, and concentration effects[^34][^33] argue against simply scaling it up.

## 9. Proposed AURORA-Q architecture

**Primary candidate (Architecture A): a superconducting compute tile.** We chose it because it is the only one of the three candidate directions whose key ingredients (tunable couplers, dedicated reset elements, real-time decoding) have all been demonstrated separately on real hardware, so its improvements can be tested quantitatively today.

- **T1 tile:** 120 fixed-frequency transmons on a **10 × 12 square lattice** (218 tunable couplers, maximum degree 4), **one dissipative reset element per qubit**, 120 readout resonators on 12 feedlines, flip-chip interposer with 458 signal bumps. Materials target: tantalum on high-resistivity silicon[^26] (an assumption).
- **Control stack:** reset-overlapped scheduling, multi-level (e–f) reset tone, noise-aware placement from live calibration data, FPGA real-time decoder co-located with readout.
- **Modularity:** tiles joined by inter-module couplers. The path to qLDPC codes such as the [[144,12,12]] gross code[^21] requires degree-6 connectivity that the T1 tile deliberately does **not** provide. We treat long-range couplers as a separate, later research track.
- **Rejected:** diagonal "Square-X" couplers (Section 15).

**Reference models kept for comparison:** (B) a Majorana-tetron measurement-based model used only for requirement analysis, and (C) a modular quantum–classical system model used for the hybrid-AI workflow and the energy and resource estimates. We do **not** propose combining topological and superconducting qubits on one chip; no experimental evidence supports such integration.

## 10. Mathematical and physical assumptions

**Gate noise.** Depolarising channels use Qiskit's definition, $\mathcal{D}_\lambda(\rho) = (1-\lambda)\rho + \lambda\,\mathbb{1}/2^n$. Relaxation over time $t$ uses amplitude damping with $\gamma = 1-e^{-t/T_1}$,

$$K_0 = \begin{pmatrix}1&0\\0&\sqrt{1-\gamma}\end{pmatrix},\quad K_1 = \begin{pmatrix}0&\sqrt{\gamma}\\0&0\end{pmatrix},$$

followed by pure dephasing chosen so that coherences decay as $e^{-t/T_2}$ overall. Readout is a symmetric bit-flip with probability $p_{\rm ro}$; reset leaves $|1\rangle$ with probability $p_{\rm reset}$.

**Fidelity and success.** State fidelity $F(\rho,\sigma) = \big(\mathrm{Tr}\sqrt{\sqrt{\rho}\,\sigma\sqrt{\rho}}\big)^2$. For placement studies we use the estimated success probability $\mathrm{ESP} = \prod_g (1-e_g)$ over all gates and measurements.

**QEC.** Total logical failure over $r$ rounds $P$ is converted to a per-round rate $\varepsilon = \tfrac12\big[1-(1-2P)^{1/r}\big]$. Idle error during a window $t$ uses the Pauli-twirled relaxation channel, $p_x = p_y = (1-e^{-t/T_1})/4$ and $p_z = (1-e^{-t/T_2})/2 - p_x$.

**Reset element.** A qubit coupled with strength $g$ to a mode damped at rate $\kappa$ relaxes at $\Gamma_{\rm eff} \approx 4g^2/\kappa$ for $g \ll \kappa$ (the Purcell limit); near $g \approx \kappa/4$ the exchange is critically damped.

**Throughput.** $T_{\rm shot} = t_{\rm init} + t_{\rm circ} + t_{\rm meas}$, so the speed-up from shortening $t_{\rm init}$ is $(t_{\rm rep}+t_{\rm c}+t_{\rm m})/(t_{\rm idle}+t_{\rm c}+t_{\rm m})$, which shrinks with circuit length.

**Variational methods.** QAOA maximises $\langle C\rangle = \langle\gamma,\beta|\sum_{(u,v)}\tfrac12(1-Z_uZ_v)|\gamma,\beta\rangle$[^52]. VQE minimises $E(\theta) = \langle\psi(\theta)|H|\psi(\theta)\rangle$ with $H = \sum_P c_P P$[^53]. Gradients use the exact parameter-shift rule $\partial_\theta\langle O\rangle = \tfrac12[\langle O\rangle_{\theta+\pi/2} - \langle O\rangle_{\theta-\pi/2}]$[^57]. Quantum kernels are fidelities $k(x,x') = |\langle\phi(x)|\phi(x')\rangle|^2$[^55].

**Assumed durations** (not AURORA-Q measurements): single-qubit gate 25 ns, CZ 70 ns, measurement 1 µs, dissipative reset 200 ns, conditional reset 1.5 µs (including feed-forward latency).

## 11. Quantum processor design

The T1 die (20 × 20 mm) is generated from a single layout file shared by the texture painter, the 3D geometry and the website's digital twin. Each cell contains a double-pad transmon (two 340 × 120 µm pads around an Al/AlOx/Al junction) in a ground-plane cutout. A quarter-wave readout resonator meanders in the north-east quadrant to its row's feedline. A reset element in the south-west quadrant consists of a SQUID switch, a damped resonator stub, and a bump that leads to an off-chip matched load. Couplers sit on lattice bonds, each with its own SQUID loop and flux-bias bump. The die carries 458 signal bumps: 120 drive, 218 coupler-flux and 120 reset-pump. Vertical couplers cross feedlines on airbridges. Drive, flux and reset-pump signals arrive from an interposer through indium bumps, so only the 12 feedlines launch at the die edge.

**Physical, computational, auxiliary and logical qubits.** All 120 transmons are *computational* (programmable). Couplers and reset elements are *auxiliary* quantum elements, not qubits. A distance-7 surface-code patch would use 97 of the 120 qubits for **one** logical qubit, so a single T1 tile is a memory testbed, not a logical processor.

## 12. Simulation methodology

### 12.1 Software and validation

- **Python research backend:** Qiskit 2.6 and Aer 0.18 for circuits and noise; Stim 1.16 with PyMatching 2.4 for QEC; QuTiP 5.3 for Lindblad dynamics; PySCF 2.15 for chemistry; scikit-learn for classical baselines; FastAPI with SQLite for the experiment service.
- **Browser engine (TypeScript):** dense statevector (≤22 qubits), density matrix (≤8 qubits, exact Kraus noise), Monte-Carlo trajectories (≤16 qubits), and a bit-packed CHP stabilizer tableau[^44] for Clifford circuits up to 2,048 qubits. The browser never attempts unrestricted exact simulation of 120 non-Clifford qubits: it refuses with an explanation.
- **Cross-validation:** 60 random circuits over the full gate set match Qiskit statevectors to 10⁻¹⁰; 12 noisy circuits match Aer density matrices to 10⁻⁷; 10 Clifford circuits match Qiskit stabilizer distributions (total-variation distance < 0.05). Analytic checks cover Bell states, T1 decay, readout convolution, teleportation and the routing permutation. Cross-validation exposed one real bug in our Python noise model, where thermal relaxation was silently dropped when a depolarising rate was zero; it has been fixed.

### 12.2 Experiment protocol

Every experiment records its hypothesis, parameters, seeds, library versions and timestamp in the exported JSON. Intervals are 95 % Student-t (continuous) or Wilson (binomial). Negative results are reported.

### 12.3 Throughput model

With a 250 µs repetition delay, a 3 µs circuit runs at 3,953 circuits/s, matching Heron's reported ≈4,000. With a 1 µs idle interval the same circuit runs at 250,000/s, consistent with ">100,000" :::model:::. The speed-up falls from ≈84× for 1 µs circuits to ≈5.8× for 50 µs circuits. Throughput claims therefore need to state the circuit duration.

### 12.4 Majorana requirement model

We use a phenomenological rotated surface code in which data bit flips and syndrome measurement flips both occur with probability $q$, a deliberately crude stand-in for measurement-based tetron codes. It is used only to locate the region in which measurement fidelity, rather than poisoning, limits performance.

### 12.5 Reset-element physics

A three-level transmon (anharmonicity −300 MHz, native $T_1$ = 200 µs) is coupled by a switchable $g/2\pi$ = 10 MHz to a mode damped at $\kappa/2\pi$ = 40 MHz with residual thermal occupation $3\times10^{-4}$. With the element on, the effective $T_1$ is **11.2 ns** (the weak-coupling estimate is 15.9 ns). Excited population reaches 10⁻³ after **87.5 ns** and settles at a 3 × 10⁻⁴ thermal floor :::sim:::. Leakage is the important caveat: population in $|f\rangle$ is detuned by the anharmonicity and **79 %** of it remains after 400 ns. Adding an e–f reset tone removes it to 10⁻⁷. AURORA-Q therefore specifies multi-level reset, in the spirit of earlier leakage-removal work[^32].

## 13. Quantum error analysis

### 13.1 Pipeline validation

For uniform circuit-level depolarising noise, the distance-3 and distance-7 per-round curves cross near **1.2 %**, in the range commonly reported for this noise model with MWPM[^43] :::sim:::. For phenomenological noise, the crossing drifts downward with code size, from above 4 % (d = 3 vs 7) to ≈3.6–3.7 % (d = 11 vs 15), toward the asymptotic ≈2.9 % MWPM value[^61]. This is a known finite-size effect, and we do not claim to have resolved the asymptotic threshold.

### 13.2 Initialisation error matters most where conditional reset lives

With all other noise fixed (one-qubit 2.5 × 10⁻⁴, two-qubit 1.5 × 10⁻³, idle 10⁻³, measurement 5 × 10⁻³), raising reset error from 4 × 10⁻⁴ (dissipative-class) to 10⁻² (readout-limited conditional reset) raises the distance-7 logical error per round from 1.4 × 10⁻⁵ to 5.1 × 10⁻⁵ (3.5×), and at 2 × 10⁻² to 2.6 × 10⁻⁴ (18×) :::sim:::. In a dynamic ancilla-reuse circuit, false syndrome events rise from 1.8 % to 12.1 % of shots over the same range.

### 13.3 Logical error per round and per microsecond

| Device model | Reset strategy | Cycle | $\varepsilon_L$ per round (d = 7) |
|---|---|---|---|
| Heron-class | Conditional (1.5 µs, readout-limited) | 2.83 µs | 1.46 × 10⁻³ |
| Heron-class | Dissipative element (200 ns, 25× lower init. error) | 1.53 µs | 3.25 × 10⁻⁴ |
| Heron-class | AURORA reset-overlapped schedule | 1.33 µs | 2.78 × 10⁻⁴ |
| AURORA target | Conditional | 2.83 µs | 3.86 × 10⁻⁵ |
| AURORA target | Dissipative | 1.53 µs | 7.5 × 10⁻⁶ |
| AURORA target | Reset-overlapped | 1.33 µs | 6.4 × 10⁻⁶ |

Dedicated reset gives ≈4.5× lower error per round together with a 1.85× faster logical clock. Overlapping the reset with the next round's gates adds a further ≈15 % lower error per round and a 13 % faster cycle :::sim:::. Because error per microsecond is per-round error divided by cycle time, the faster cycle mostly buys *more logical operations per second* rather than lower error per unit time. Under the AURORA-target noise, the fitted suppression factor is $\Lambda \approx 9.4$; this is a property of an assumed noise model, not of hardware.

## 14. Quantum AI applications

**Methodological stance.** We assume no quantum speed-up. Every quantum model is paired with classical baselines on the same data split, and wall-clock times are reported only for comparing relative cost.

- **Variational classifier** (2 qubits, 3 data-reuploading layers, 12 parameters, exact parameter-shift gradients, Adam): test accuracy 0.81 [0.60, 1.01] on two moons and 0.83 [0.72, 0.94] on circles (3 seeds). An RBF-SVM reaches 0.97 and 1.00, and a 65-parameter MLP 0.87 and 1.00. Training took ≈27 s against <0.4 s for any classical model :::neg:::.
- **Quantum kernels** (ZZ feature map): 0.79 and 0.87, against 0.97 and 1.00 for RBF :::neg:::. Off-diagonal kernel variance collapses from 4.9 × 10⁻² (2 qubits) to 1.3 × 10⁻⁶ (12 qubits), reproducing exponential concentration[^34]. With bandwidth scaling[^35] it stays ≈1.3 × 10⁻² at 12 qubits, but such well-behaved models are exactly those suspected of classical simulability[^33].
- **Noise vs learning:** under depolarising noise up to $p_2$ = 0.3, the parity-readout classifier keeps its accuracy, but the mean decision margin shrinks 7× (0.26 → 0.04). Estimating each prediction then needs ≈50× more shots. Noise shows up as sampling cost before it shows up as accuracy loss.
- **QAOA MaxCut** (12 random 3-regular graphs, n = 8–12): approximation ratios of 0.69–0.83 at p = 1 and 0.87–0.97 at p = 3, while simulated annealing found the optimum on every instance in milliseconds :::neg:::.
- **Quantum chemistry (H₂/STO-3G):** our Jordan–Wigner Hamiltonian matches PySCF FCI at all 24 bond lengths, and the 1-parameter particle-conserving ansatz reaches FCI within 2 × 10⁻¹² Ha. A 2-layer hardware-efficient circuit keeps chemical accuracy (1.6 mHa) only for $p_2 \le 10^{-4}$; at $p_2$ = 3 × 10⁻⁴ the error is 1.63 mHa, and at 10⁻³ it is 5.4 mHa :::sim:::.

**Could quantum computing accelerate large AI models?** The honest answer from the literature and from these experiments is: not with known methods at foreseeable scales. Loading classical data costs at least as many operations as the data has entries. Measurement returns one sample per shot, so estimating $m$ expectation values to precision ε costs $O(m/\varepsilon^2)$ shots. Error-correction overhead multiplies physical resources by $10^2$–$10^3$. Classical accelerators keep improving, and dequantisation results remove several proposed speed-ups[^59]. The credible near-term roles are *scientific*: generating training data for scientific foundation models from quantum simulations of materials and molecules, and sampling tasks with verified hardness. Both require fault tolerance at scale.

## 15. Experimental benchmarking

| ID | Hypothesis | Result | Verdict |
|---|---|---|---|
| H-CONN | ≤ +11 % diagonal couplers cut held-out routed CZ count by ≥ 10 % | −3.7 % (24 diagonals); −7.6 % even at +45 % couplers. Optimised placements reached −10 % on *training* circuits only, a generalisation gap | :::neg rejected::: |
| H-YIELD | Added couplers carry a fabrication cost | Collision-free yield at σ = 8 MHz: square ≈93 %, +24 diagonals ≈28 %, checkerboard ≈6 % (illustrative model[^60]) | :::sim supported::: |
| H-LAYOUT | Noise-aware placement raises ESP | ×1.21–1.45 across 5 circuits; improved in 100 % of 20 synthetic devices | :::sim supported::: |
| H-RESET | Dedicated reset lowers logical error per round | 4.5× at d = 7 (Heron-class noise) | :::sim supported::: |
| H-OVERLAP | Reset-overlapped scheduling improves QEC | −15 % per round, −13 % cycle time | :::sim modest::: |
| H-LEAK | g–e dissipative reset also removes leakage | No: 79 % of $|f\rangle$ remains; needs an e–f tone | :::neg::: |
| H-ZNE | ZNE + readout mitigation reduces bias | ≈10× lower error for 10–30 CZ circuits with ≈3× larger estimator spread; no clear benefit at 60 CZ | :::sim conditional::: |
| H-QML | Small quantum models match classical ones | Worse accuracy and ~10⁴× slower training | :::neg::: |
| M1 | Poisoning no longer limits tetron codes at τ = 22 s | $p_{\rm flip}$ = 4.5 × 10⁻⁷ per 10 µs; bottleneck moves to X-measurement fidelity | :::model::: |

All of these runs can be reproduced with `python -m aurora.run_all` (see Documentation).

## 16. Engineering feasibility

- **Wiring:** 120 drive + 218 coupler-flux + 30 reset-pump (4:1 multiplexing assumed) + 24 readout lines ≈ **392 lines per tile**. AURORA-Q routes DC and low-frequency lines on high-density flex and reserves coax for microwave lines. Heat loads per line must come from the cryostat's own data; published 100-qubit-scale studies show both passive and active (signal-dissipation) loads matter[^37].
- **Scaling:** with the fitted AURORA-target model, a logical error of 10⁻⁶, 10⁻⁹ or 10⁻¹² per logical operation needs $d$ = 11, 19 or 25. One hundred logical qubits would then need ≈48 k, 144 k or 250 k physical qubits (including a 2× routing allowance), i.e. 402, 1,202 or 2,082 T1 tiles :::model:::. qLDPC codes promise ≈10× savings[^21] but need connectivity a square tile lacks. For comparison, recent estimates put RSA-2048 at <1 M noisy qubits under similar assumptions[^36].
- **Energy:** at today's scale, a dilution refrigerator's pulse-tube compressor (order 10 kW) dominates wall-plug power. Control electronics grow with line count. Energy per useful logical operation therefore improves mainly through throughput (Section 12.3) and qubit count per cryostat.
- **Fabrication:** fixed-frequency transmons need post-fabrication frequency trimming; our yield model shows the square lattice tolerates roughly 8–10 MHz spread, while denser graphs need much tighter control.

## 17. Limitations

- No device was fabricated or measured. All AURORA-Q device parameters are assumptions or targets.
- Vendor pages could not be opened directly from the build environment. Facts were collected through a search service that returns sourced digests, and several items are graded secondary in the source ledger.
- Noise models are Pauli/thermal approximations without non-Markovian TLS noise, correlated cosmic-ray events, or full crosstalk physics. Leakage is studied only in the reset model.
- The connectivity and yield studies use one compiler (Qiskit SABRE) and an illustrative collision model.
- The Majorana analysis maps measurement-based tetron codes onto a phenomenological surface code, a deliberate simplification.
- QML experiments are small (2–12 qubits) by necessity and cannot speak to large-scale behaviour.

## 18. Research conclusions

1. **Reset is a first-class architectural resource.** Dedicated, fast, low-error reset improves both throughput and logical error per round; Nighthawk r2's design direction is well supported by our simulations. It must be multi-level to handle leakage.
2. **Square-lattice connectivity sits near a sweet spot.** Our attempt to beat it with sparse diagonals failed on the joint metric of gate count and yield, and we report that negative result.
3. **Calibration-aware compilation is cheap and effective**, giving 21–45 % ESP gains in our synthetic study.
4. **For topological qubits, the next decisive experiment is a high-fidelity X-parity measurement** in the Pb platform, together with independent confirmation of the topological phase.
5. **Quantum AI needs fault tolerance and the right problems.** Near-term variational QML did not beat classical baselines in any of our tests. Scientific data generation is the most credible long-term role.

## 19. Future development roadmap

See the Roadmap page for the phased plan. Its components are: materials and junction-uniformity studies; a single-tile prototype with dedicated multi-level reset; a QEC memory demonstration with real-time decoding; a modular two-tile link; and a long-range-coupler research track toward qLDPC. Each phase has explicit go/no-go metrics.

## 20. Bibliography

[^1]: Microsoft Quantum (M. Aghaee et al.), *20 Second Parity Lifetime in an InAs–Pb Tetron Device*, arXiv:2606.03884 (2026). [arxiv.org/abs/2606.03884](https://arxiv.org/abs/2606.03884)
[^2]: C. Nayak, *Majorana 2* (Microsoft Quantum blog, June 2026), [quantum.microsoft.com](https://quantum.microsoft.com/en-us/insights/blogs/majorana-2-scalable-quantum-processor); see also [TNW](https://thenextweb.com/news/microsoft-majorana-2-quantum-chip-agentic-ai-discovery), [SiliconANGLE](https://siliconangle.com/2026/06/02/microsofts-new-majorana-2-quantum-chip-claims-dramatic-breakthrough-qubit-stability/). Manufacturer claims.
[^3]: Microsoft Azure Quantum, *Interferometric single-shot parity measurement in InAs–Al hybrid devices*, Nature 638, 651–655 (2025), doi:10.1038/s41586-024-08445-2.
[^4]: Microsoft Quantum, *Distinct lifetimes for X and Z loop measurements in a Majorana tetron device*, arXiv:2507.08795 (2025).
[^5]: D. Aasen et al., *Roadmap to fault tolerant quantum computation using topological qubit arrays*, arXiv:2502.12252 (2025).
[^6]: H. Legg, *Comment on "Interferometric single-shot parity measurement in InAs–Al hybrid devices"*, arXiv:2503.08944 (2025).
[^7]: H. Legg, *Comment on "InAs-Al hybrid devices passing the topological gap protocol"*, arXiv:2502.19560 (2025).
[^8]: PostQuantum, *Microsoft Majorana 2: 20-second qubits, same questions* (2026), [postquantum.com](https://postquantum.com/industry-news/microsoft-majorana-2-analysis/). Secondary analysis.
[^9]: Science News, *Microsoft's quantum chip got an upgrade. Critics are still skeptical* (2026), [sciencenews.org](https://www.sciencenews.org/article/microsoft-quantum-chip-upgrade-majorana).
[^10]: The Quantum Insider, *Microsoft gives DARPA access to Majorana system* (22 Sep 2026), [thequantuminsider.com](https://thequantuminsider.com/2026/09/22/microsoft-gives-darpa-access-to-majorana-system-opens-maryland-quantum-research-center/).
[^11]: S. Bhattacharyya, B. van Heck, *Dynamics of Majorana tetron qubits under quasiparticle poisoning*, arXiv:2608.18042 (2026).
[^12]: IBM Quantum, *IBM Quantum Nighthawk r2—more circuits, faster* (2026), [ibm.com/quantum/blog/nighthawk-r2](https://www.ibm.com/quantum/blog/nighthawk-r2); see also [The Quantum Insider](https://thequantuminsider.com/2026/09/03/ibms-nighthawk-r2-quantum-processor-targets-a-25-fold-increase-in-circuit-speed/). Manufacturer claims.
[^13]: Tom's Hardware, *IBM unveils new 120-qubit processor and software stack* (Nov 2025), [tomshardware.com](https://www.tomshardware.com/tech-industry/semiconductors/ibm-unveils-new-120-qubit-processor-and-software-stack); [The Next Platform](https://www.nextplatform.com/compute/2025/11/12/ibm-lets-fly-nighthawk-and-loon-qpus-on-the-way-to-quantum-advantage/1689519).
[^14]: The Quantum Insider, *IBM announces Nighthawk and latest Heron are now available* (Jan 2026), [thequantuminsider.com](https://thequantuminsider.com/2026/01/13/ibm-announces-nighthawk-and-latest-heron-are-now-available/).
[^15]: Q-CTRL, *Q-CTRL sets the standard for quantum execution speed with IBM Quantum Nighthawk* (2026), [q-ctrl.com](https://q-ctrl.com/blog/q-ctrl-sets-the-standard-for-quantum-execution-speed-with-ibm-quantum-nighthawk).
[^16]: *Classical simulation and design frontiers for IBM's doped Clifford sampling experiment*, arXiv:2608.13110 (2026).
[^17]: BlueQubit, *Quantum computational advantage in random-circuit sampling on IBM superconducting quantum computers*, arXiv:2609.28657 (2026).
[^18]: A. Wack et al., *Scale, Quality, and Speed: three key attributes to measure the performance of near-term quantum computers*, arXiv:2110.14108 (2021).
[^19]: IBM Quantum documentation, *QPU information*, [quantum.cloud.ibm.com/docs](https://quantum.cloud.ibm.com/docs/en/guides/qpu-information).
[^20]: PostQuantum, *IBM Heron r3 (ibm_pittsburgh) dashboard snapshot* (Aug 2025), [postquantum.com](https://postquantum.com/industry-news/ibm-heron-r3-pittsburgh/).
[^21]: S. Bravyi et al., *High-threshold and low-overhead fault-tolerant quantum memory*, Nature 627, 778 (2024), doi:10.1038/s41586-024-07107-7.
[^22]: *Improved belief propagation is sufficient for real-time decoding of quantum memory* (Relay-BP), arXiv:2506.01779 (2025).
[^23]: *Real-time decoding of the gross code memory with FPGAs*, arXiv:2510.21600 (2025).
[^24]: Google Quantum AI, *Quantum error correction below the surface code threshold*, Nature 638, 920 (2025).
[^25]: Google, *Our Quantum Echoes algorithm is a big step toward real-world applications* (Oct 2025), [blog.google](https://blog.google/technology/research/quantum-echoes-willow-verifiable-quantum-advantage/).
[^26]: M. P. Bland, F. Bahrami et al., *Millisecond lifetimes and coherence times in 2D transmon qubits*, Nature 647, 343 (2025); arXiv:2503.14798.
[^27]: Quantinuum, *Introducing Helios* (Nov 2025), [quantinuum.com](https://quantinuum.com/blog/introducing-helios-the-most-accurate-quantum-computer-in-the-world).
[^28]: D. Bluvstein et al., *A fault-tolerant neutral-atom architecture for universal quantum computation*, Nature (2025), doi:10.1038/s41586-025-09848-5; arXiv:2506.20661.
[^29]: PsiQuantum, *Omega: a manufacturable chipset for utility-scale quantum computing*, [psiquantum.com/omega](https://psiquantum.com/omega). Company-reported.
[^30]: *Industry-compatible silicon spin-qubit unit cells exceeding 99 % fidelity*, Nature 646, 81 (2025), doi:10.1038/s41586-025-09531-9; arXiv:2410.15590.
[^31]: P. Magnard et al., *Fast and unconditional all-microwave reset of a superconducting qubit*, PRL 121, 060502 (2018).
[^32]: M. McEwen et al., *Removing leakage-induced correlated errors in superconducting quantum error correction*, Nat. Commun. 12, 1761 (2021).
[^33]: M. Cerezo et al., *Does provable absence of barren plateaus imply classical simulability?*, Nat. Commun. 16, 7907 (2025); arXiv:2312.09121.
[^34]: S. Thanasilp, S. Wang, M. Cerezo, Z. Holmes, *Exponential concentration in quantum kernel methods*, Nat. Commun. 15, 5200 (2024).
[^35]: R. Shaydulin, S. M. Wild, *Importance of kernel bandwidth in quantum machine learning*, PRA 106, 042407 (2022).
[^36]: C. Gidney, *How to factor 2048 bit RSA integers with less than a million noisy qubits*, arXiv:2505.15917 (2025).
[^37]: S. Krinner et al., *Engineering cryogenic setups for 100-qubit scale superconducting circuit systems*, EPJ Quantum Technol. 6, 2 (2019).
[^38]: A. Yu. Kitaev, *Unpaired Majorana fermions in quantum wires*, Phys.-Usp. 44, 131 (2001).
[^39]: R. M. Lutchyn, J. D. Sau, S. Das Sarma, PRL 105, 077001 (2010); Y. Oreg, G. Refael, F. von Oppen, PRL 105, 177002 (2010).
[^40]: T. Karzig et al., *Scalable designs for quasiparticle-poisoning-protected topological quantum computation with Majorana zero modes*, PRB 95, 235305 (2017).
[^41]: J. Koch et al., *Charge-insensitive qubit design derived from the Cooper pair box*, PRA 76, 042319 (2007).
[^42]: P. Krantz et al., *A quantum engineer's guide to superconducting qubits*, Appl. Phys. Rev. 6, 021318 (2019).
[^43]: A. G. Fowler et al., *Surface codes: towards practical large-scale quantum computation*, PRA 86, 032324 (2012).
[^44]: S. Aaronson, D. Gottesman, *Improved simulation of stabilizer circuits*, PRA 70, 052328 (2004).
[^45]: C. Gidney, *Stim: a fast stabilizer circuit simulator*, Quantum 5, 497 (2021).
[^46]: O. Higgott, C. Gidney, *Sparse Blossom: correcting a million errors per core second with minimum-weight matching*, arXiv:2303.15933 (2023).
[^47]: G. Li, Y. Ding, Y. Xie, *Tackling the qubit mapping problem for NISQ-era quantum devices*, ASPLOS 2019; arXiv:1809.02573.
[^48]: K. Temme, S. Bravyi, J. M. Gambetta, *Error mitigation for short-depth quantum circuits*, PRL 119, 180509 (2017).
[^49]: T. Giurgica-Tiron et al., *Digital zero noise extrapolation for quantum error mitigation*, arXiv:2005.10921 (2020).
[^50]: Y. Kim et al., *Evidence for the utility of quantum computing before fault tolerance*, Nature 618, 500 (2023).
[^51]: J. Preskill, *Quantum Computing in the NISQ era and beyond*, Quantum 2, 79 (2018).
[^52]: E. Farhi, J. Goldstone, S. Gutmann, *A Quantum Approximate Optimization Algorithm*, arXiv:1411.4028 (2014).
[^53]: A. Peruzzo et al., *A variational eigenvalue solver on a photonic quantum processor*, Nat. Commun. 5, 4213 (2014).
[^54]: A. Kandala et al., *Hardware-efficient variational quantum eigensolver for small molecules and quantum magnets*, Nature 549, 242 (2017).
[^55]: V. Havlíček et al., *Supervised learning with quantum-enhanced feature spaces*, Nature 567, 209 (2019).
[^56]: J. R. McClean et al., *Barren plateaus in quantum neural network training landscapes*, Nat. Commun. 9, 4812 (2018).
[^57]: K. Mitarai et al., PRA 98, 032309 (2018); M. Schuld et al., *Evaluating analytic gradients on quantum hardware*, PRA 99, 032331 (2019).
[^58]: S. Aaronson, *Read the fine print*, Nat. Phys. 11, 291 (2015).
[^59]: E. Tang, *A quantum-inspired classical algorithm for recommendation systems*, STOC 2019.
[^60]: J. B. Hertzberg et al., *Laser-annealing Josephson junctions for yielding scaled-up superconducting quantum processors*, npj Quantum Inf. 7, 129 (2021).
[^61]: C. Wang, J. Harrington, J. Preskill, *Confinement-Higgs transition in a disordered gauge theory and the accuracy threshold for quantum memory*, Ann. Phys. 303, 31 (2003).
