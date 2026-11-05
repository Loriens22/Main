# AURORA-Q — Research Platform for a Next-Generation Quantum Computing Architecture

**Advanced Unified Research Architecture for Quantum Optimization.** A browser-accessible research platform that analyses Microsoft **Majorana 2** and IBM **Quantum Nighthawk r2**, proposes a superconducting compute-tile architecture (AURORA-Q T1), and tests every design choice in reproducible simulations, with a Blender-generated 3D digital twin.

> **AURORA-Q is a design study, not a fabricated quantum computer.** All quantum results are simulations (browser engine validated against Qiskit/Aer; Stim + PyMatching for QEC; QuTiP for reset physics). Every claim on the site and in the report is graded as *reported literature*, *simulated (this work)*, *analytical model*, *engineering proposal*, *contested* or *negative result*.

## Live platform

**https://claude.ai/artifact/PvqLPMwbhB2j5bLreAyXQi**: the full site (3D explorer and digital twin, Quantum Lab, Quantum AI lab, architecture, report, benchmarks, docs). It is private to its owner until shared from the page's Share menu. Everything runs client-side; the Python backend is optional for local use.

## What is in this repository

| Path | Contents |
|---|---|
| `research/sources.md` | Graded ledger of every external fact (primary / secondary / contested) |
| `docs/AURORA-Q_research_report.md` | 20-section technical report, 61 references |
| `backend/` | Python research layer: Qiskit/Aer simulation service, topologies, noise models, seven experiment modules, FastAPI + SQLite, 23 tests |
| `blender/` | Procedural Blender 5.2 (bpy) pipeline: chip layout → textures → die, QPU package, dilution refrigerator, racks → GLB + Cycles renders |
| `web/` | React + Three.js site. Browser quantum engine (statevector, density matrix, trajectories, CHP stabilizer, router), Quantum Lab, Quantum AI lab, 3D explorer and digital twin, benchmarks, docs; 110 cross-validation tests |

## Headline results (all simulated or modelled — see the report for conditions)

| ID | Question | Result |
|---|---|---|
| H-RESET | Does a dedicated reset element lower QEC error? | 4.5× lower logical error per round at d = 7 (Heron-class noise) and a 1.85× faster cycle |
| H-CONN | Do ≤ 11 % extra diagonal couplers cut routed CZ count ≥ 10 %? | **Rejected**: −3.7 %, while modelled collision-free yield falls ≈ 93 % → ≈ 28 % |
| H-LAYOUT | Does noise-aware placement help? | +21–45 % estimated success probability on synthetic devices |
| H-LEAK | Does g–e dissipative reset clear leakage? | **No**: 79 % of \|f⟩ remains; an e–f tone removes it |
| M1 | What limits a Majorana-2-class tetron code? | Poisoning becomes negligible at τ_Z = 22 s (4.5 × 10⁻⁷ per 10 µs); X-measurement fidelity becomes the bottleneck |
| H-QML | Do small quantum models beat classical ones? | **No**: e.g. VQC 0.81 vs RBF-SVM 0.97 on two moons, with ~10⁴× longer training |

## Quick start

```bash
# research backend
cd backend && pip install -e ".[test]" && python -m pytest
python -m aurora.run_all            # regenerate all results (≈ 20–40 min on 4 cores)
uvicorn aurora.api:app --port 8000  # optional API (real IBM hardware only with IBM_QUANTUM_TOKEN on the server)

# website
cd web && npm ci && npm test && npm run dev    # http://localhost:5173
npm run build                                  # dist/ and dist-artifact/

# 3D assets (Blender 5.2 as a Python module: pip install bpy==5.2.3)
cd blender && python build_parts.py && python build_installation.py && python render_all.py
```

## Validation

- Browser engine vs Qiskit: 60 random circuits (full gate set) match statevectors to 1e-10; 12 noisy circuits match Aer density matrices to 1e-7; 10 Clifford circuits match `StabilizerState` distributions; VQE reaches FCI from exported Hamiltonians.
- Cross-validation found and fixed a real bug: the Aer noise model dropped thermal relaxation when a depolarising rate was zero.
- QEC pipeline reproduces the expected circuit-level threshold region (≈1.2 % finite-size crossing) and the downward drift of phenomenological crossings toward ≈2.9 %.

## Limitations

No hardware was fabricated or measured; device parameters are assumptions or targets. Vendor pages were read through a search service's sourced digests rather than directly (see `research/sources.md`). Noise models are Markovian Pauli/thermal approximations. See §17 of the report.

---

# AURORA-Q2: Toroid chip + AURORA-CRYO cooling architecture

A second study proposes a full machine: **Toroid**, a superconducting chip that embeds the gross bivariate-bicycle code [[144,12,12]] on a two-tier die stack, and **AURORA-CRYO**, a cooling and wiring architecture designed around it. Like the first study, it is a design study, and every number is simulated, modelled or sourced.

**Live site:** https://claude.ai/artifact/4214a2hrtrSfkyqC9UmwdP (3D explorer of the refrigerator, module and chip; in-browser BP-OSD decoder lab; cooling lab; results; research paper; comparison with other platforms). It is private to its owner until shared.

| Result (simulated or modelled) | Value |
|---|---|
| Gross-code logical error per logical qubit per round, p = 0.2 % / 0.3 % | 6.9e-5 / 6.6e-4 (Stim + BP-OSD) |
| Surface code needed to match it | d = 13 → 337 vs 24 physical qubits per logical qubit (14×) |
| Toroid die / interposer | 540 nearest-neighbour couplers, 0 crossings / 324 couplers in 2 Manhattan layers, ≤ 11 tracks per channel (straight routing would need 13 layers) |
| Heralded erasures (gross, p = 0.5 %) | 6× / 49× / 150× lower error at 50 / 90 / 97.5 % of CNOT errors heralded |
| Dual-rail vs transmon at equal transmon count | dual-rail affords only 0.85–1.8× raw error → negative result, transmons kept |
| AURORA-CRYO coherence model | T_φ,thermal 121 → 796 µs; T₂ 95 → 343 µs |
| Qubits per refrigerator (model) | 727 (coax + RT control) → 5,901 (AURORA-CRYO with 12 W extra 4 K cooling) |
| Cooling → logical error (same simulator) | gross: 1.5e-5 (conventional budget) → 1.8e-6 (AURORA-CRYO budget) per logical qubit per round |
| Radiation (20 dies) | unmitigated MTBF ≈ 0.2 s; a one-day run needs p_fail ≲ 2e-6 per impact (open risk) |

```bash
cd backend && python -m pytest tests/test_q2.py
python -m aurora.q2.study qec && python -m aurora.q2.study cryo
python -m aurora.q2.resources && python -m aurora.q2.export
cd ../blender && python build_q2.py && python render_q2.py all 64
cd ../web2 && npm test && npm run build      # dist-artifact/ is the published site
```

Files: `backend/aurora/q2/` (codes, memory circuits, cryo models, layout, analysis), `blender/aurora3d/q2chip.py`, `q2system.py`, `web2/` (site), `research/sources.md` sections 10–14.
