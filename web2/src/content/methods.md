# Methods and reproducibility

All code is in the repository `loriens22/main`, branch `ccr-85cdbb21-oinq24`. Every number on this site comes from the files below; nothing is typed in by hand except values from the literature, which are listed with their sources in `research/sources.md` (sections 10–14).

## Pipeline

| Stage | File | Output |
|---|---|---|
| Code construction (GF(2), logical operators) | `backend/aurora/q2/codes.py` | BB codes bb72, bb90, bb108, gross144, bb288; rotated surface codes |
| Circuit-level memory experiments | `backend/aurora/q2/memory.py` | Stim circuits, detector error models, BP-OSD decoding |
| Simulation campaign | `backend/aurora/q2/study.py` | `results/q2_qec.json`, `results/q2_cryo_qec.json` |
| Cryogenic models | `backend/aurora/q2/cryo.py` | `results/q2_cryo_models.json` |
| Layout engine | `backend/aurora/q2/layout.py` | `results/q2_layout.json` |
| Analysis and projections | `backend/aurora/q2/resources.py` | `results/q2_resources.json` |
| 3D assets | `blender/aurora3d/q2chip.py`, `q2system.py`, `blender/build_q2.py`, `render_q2.py` | GLB models and Cycles renders |
| Website | `web2/` | this site |

```bash
cd backend
python -m aurora.q2.study qec --workers 3     # memory scans + erasure study (~45 min on 3 cores)
python -m aurora.q2.study cryo --workers 3    # cryo noise budgets through QEC
python -m aurora.q2.cryo && python -m aurora.q2.layout && python -m aurora.q2.resources
python -m aurora.q2.export                    # copies JSON into web2/public/data
cd ../blender && python build_q2.py && python render_q2.py all 128
cd ../web2 && npm test && npm run build
```

## Memory experiments

**Circuit.** One generator serves every CSS code. Each syndrome round has a Z phase (reset Z ancillas, CNOT layers data→ancilla, measure) followed by an X phase (prepare X ancillas in |+⟩, CNOT layers ancilla→data, measure in X). Bivariate bicycle codes use the exact one-layer-per-polynomial-term schedule: 6 Z layers and 6 X layers, each a perfect matching. The construction asserts that the layers reproduce H_X and H_Z exactly. Surface codes use a greedy proper edge colouring. The schedule has 12 CNOT layers and two measurement windows per round, deeper than IBM's depth-7 interleaved cycle, so absolute BB numbers are conservative.

**Noise (SD6-style).** After every CNOT: two-qubit depolarising noise p₂. Every idle qubit in a CNOT layer: single-qubit depolarising p_idle. Bit flips before measurement and after reset: p_meas and p_reset. Data qubits waiting through ancilla measurement and reset: p_idle_meas. The "uniform p" scans set all of these to p.

**Heralded erasures.** A fraction f of each CNOT's error budget is replaced by `HERALDED_ERASE(p₂ f/2)` on both qubits, and the herald record becomes a detector. The decoder never sees heralds as syndrome bits. Instead, each fired herald raises the prior of every error mechanism it enables to 0.49 for that shot.

**Decoding.** The detector error model is built without decomposition. Z-check detectors form the parity-check matrix; mechanisms that flip only heralds are dropped. BP-OSD from the `ldpc` package: min-sum, scaling factor 0.625, 100 iterations, OSD-CS order 7. Stopping rule: 100 logical failures, 300,000 shots or 900–1,200 s per point. Failure means any of the k logical Z observables flips.

**Normalisation.** Block error P_B over r rounds becomes a per-round block error 1 − (1 − P_B)^{1/r}, then a per-logical-qubit error 1 − (1 − ε_round)^{1/k}. Confidence intervals are 95 % Wilson intervals carried through the same transformation.

**Validation.** The browser and Python code constructions agree on n, k and the supports of the first parity checks for every code (unit tests). A herald bookkeeping bug was found and fixed during the study: herald records shifted the measurement-record offsets of later detectors. After the fix, noiseless circuits fire no detectors and heralding improves logical error, as expected.

## Equal-error overhead

For each physical error rate where the surface code is clearly below threshold (Λ ≥ 1.3), we fit log ε(d) = a + b·d over d = 5–9. We then report the smallest odd d whose fitted ε is at or below the BB code's measured ε. The resulting overhead is (2d² − 1) physical qubits per surface-code logical qubit, against 24 for the gross code and 12 for bb72. "Measured" means a simulated surface distance already matches or beats the BB code without extrapolation.

## Cryogenic models

The photon chain uses a beam-splitter attenuator model; dephasing uses the low-occupation Clerk–Utami formula; quasiparticle relaxation uses Γ = x_qp √(2ωΔ/π²ħ) (Catelani et al.). T₁ combines dielectric, quasiparticle and Purcell rates. Idle Pauli error over time t is t/(4T₁) + t/(2T₂). Two-qubit error is p₂ = p_control + 2 × idle(t_2q). Heat loads add per-line passive conduction by stage, active dissipation and 4 K control power for each wiring architecture. The qubit count is the minimum over stages of (capacity × margin) / load per qubit, and over the RF line count.

## Limitations

- Nothing was fabricated or measured. Device parameters are literature values or labelled assumptions.
- Pauli noise models leave out leakage dynamics (except as heralded erasure), crosstalk, non-Markovian noise and correlated errors apart from the radiation model.
- Memory experiments are memory-Z only, 6 rounds for BB codes. Full X+Z memory would roughly double the logical error rate by symmetry.
- Extrapolations to p = 10⁻³ and to the AURORA-CRYO budget are fits and are labelled as such wherever they appear.
- Logical processing units, lattice surgery and magic-state cultivation are taken from the literature and were not simulated here.
- The search service gave digests of sources, not full texts; numbers flagged *(digest)* in the ledger should be checked against the PDFs.
