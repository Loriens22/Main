# AURORA-Q Documentation

## Getting started

The hosted site needs nothing installed: every quantum computation runs in your browser in the AURORA-Q engine, a TypeScript simulator validated against Qiskit. The **Quantum Lab** shows the full loop in about a minute:

1. Open **Quantum Lab** and load the *Bell state* example.
2. Press **Run**. The histogram shows sampled frequencies (bars) and exact probabilities (gold ticks).
3. Choose the *Nighthawk r2-class* noise preset and run again. Errors appear as 01/10 outcomes, and the Bloch vectors and purity change.
4. Press **Compile to AURORA-Q tile**, then **Open in 3D twin** to watch the routed schedule play out on the 120-qubit die.

Every result says which method produced it (statevector, density matrix, trajectories or stabilizer) and states that it is a simulation.

## System requirements

| Component | Requirement |
|---|---|
| Website | A current Chromium, Firefox or Safari with WebGL2. 8 GB RAM is recommended for 20+ qubit statevectors. Mobile devices default to the *Low* quality preset. |
| Python backend | Python ≥ 3.11 (tested on 3.13), about 2 GB of disk for Qiskit, Aer, Stim, PySCF and QuTiP |
| 3D pipeline | Blender 5.2 as a Python module (`pip install bpy==5.2.3`, CPython 3.13) or a Blender 5.2 install; 16 GB RAM for Cycles renders |
| Web toolchain | Node.js ≥ 20 |

## Installation

```
git clone <repository>   # loriens22/main
cd backend && pip install -e ".[test]"            # research backend
python -m pytest                                  # 23 tests
python -m aurora.run_all                          # full experiment suite (~20–40 min, 4 cores)
uvicorn aurora.api:app --port 8000                # optional HTTP API

cd ../web && npm ci
npm test                                          # 110 cross-validation tests
npm run dev                                       # http://localhost:5173
npm run build                                     # production bundle -> dist/ + dist-artifact/

cd ../blender
python build_parts.py && python build_installation.py   # regenerate GLB assets
python render_all.py                                      # Cycles renders
```

## Architecture overview

```
research/sources.md          graded source ledger (every external fact)
backend/aurora/              Python research layer
  circuits.py                portable circuit schema <-> Qiskit, validation, OpenQASM 3
  topologies.py              Heron heavy-hex (156q/176c), 10x12 square (120q/218c), Square-X
  noise.py, simulate.py      Aer noise models and the execution service
  experiments/               engine (connectivity), qec, reset, mitigation, qml, chemistry, scalability
  api.py, storage.py         FastAPI service + SQLite run store
blender/aurora3d/            procedural bpy pipeline: layout, textures, chip, package, cryostat, renders
web/src/quantum/             browser engine: statevector, density, stabilizer, router, library, ML
web/src/three/               React Three Fiber scenes driven by the GLB assets
web/public/data/             exported experiment results (JSON), chip layout
web/public/models/           Blender GLB exports
```

## Quantum computing fundamentals

A register of $n$ qubits is a unit vector in $\mathbb{C}^{2^n}$. Gates are unitaries; the engine uses Qiskit's little-endian convention, so qubit $q$ is bit $q$ of the basis index and bit-strings print as $c_{n-1}\dots c_0$. Single-qubit rotations are $R_\sigma(\theta) = e^{-i\theta\sigma/2}$. Noise is modelled by channels $\rho \mapsto \sum_k K_k\rho K_k^\dagger$. The **Bloch vector** of qubit $q$ is $(\langle X\rangle, \langle Y\rangle, \langle Z\rangle)$ of its reduced state; its length is 1 for a pure, unentangled qubit and shrinks under entanglement or noise. **Purity** $\mathrm{Tr}\rho^2$ equals 1 only for pure states. The **entanglement entropy** reported for pure states is the von Neumann entropy of the first $\lfloor n/2\rfloor$ qubits (at most 4).

## Simulator documentation

| Method | Used when | Limit in browser | Exactness |
|---|---|---|---|
| Statevector | noise-free | 22 qubits | exact amplitudes; sampling from the exact distribution |
| Density matrix | noise, terminal measurements | 8 qubits | exact Kraus evolution; readout error applied analytically |
| Trajectories | noise with mid-circuit measurement/reset, or 9–16 noisy qubits | 16 qubits, shot budget | Monte-Carlo unravelling (Pauli insertions, amplitude-damping jumps); converges to the density matrix |
| Stabilizer (CHP) | Clifford circuits (H, S, CX, CZ, CY, SWAP, iSWAP, Paulis, π/2 rotations) | 2,048 qubits | exact for Clifford circuits; relaxation applied as its Pauli twirl |

**Automatic selection** picks the first exact method that fits. The engine refuses circuits that would need an unrealistic exact simulation (for example 40 non-Clifford qubits) and says why. **Noise presets** mirror the Python backend; their values are illustrative assumptions, not device calibrations.

## Circuit programming guide

Circuits are JSON objects shared by the browser engine and the Python API:

```
{
  "num_qubits": 3,
  "num_clbits": 3,
  "ops": [
    {"name": "h",  "qubits": [0]},
    {"name": "cx", "qubits": [0, 1]},
    {"name": "rz", "qubits": [2], "params": [0.785398]},
    {"name": "measure", "qubits": [0, 1, 2], "clbits": [0, 1, 2]},
    {"name": "reset", "qubits": [1]}
  ]
}
```

Supported operations: `id x y z h s sdg t tdg sx sxdg rx ry rz p u cx cy cz ch swap iswap crx cry crz cp rzz rxx ryy ccx cswap measure reset barrier`. Angles are in radians; the Lab editor also accepts expressions such as `pi/4` or `-3*pi/8`. If a circuit has no `measure`, every qubit is measured into the clbit with the same index at the end. Export formats are JSON and OpenQASM 3.0.

## Quantum AI experiments

| Experiment | Model | Baselines | Where |
|---|---|---|---|
| Variational classifier | 2 qubits, data re-uploading, parity readout, parameter-shift + Adam | logistic regression, MLP (browser); RBF-SVM (Python) | Quantum AI → Classifier |
| Quantum vs classical | same data split, timings and parameter counts | as above | Quantum AI → Comparison |
| QAOA MaxCut | p = 1–3 on random 3-regular graphs, Nelder–Mead restarts | brute force optimum, greedy + local search, simulated annealing | Quantum AI → QAOA |
| VQE H₂ | particle-conserving and hardware-efficient ansätze, optional depolarising noise | exact FCI (PySCF) | Quantum AI → Chemistry |
| Noise vs learning | density-matrix evaluation of the trained classifier | noise-free model | Quantum AI → Classifier |

## API documentation

The FastAPI backend (`uvicorn aurora.api:app`) exposes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness, library versions, whether IBM hardware access is configured |
| GET | `/api/noise-presets` | preset parameters and notes |
| POST | `/api/circuits/run` | synchronous Aer run: `{circuit, shots, method, noise or noise_preset, seed}` |
| POST | `/api/jobs` · GET/DELETE `/api/jobs/{id}` | queued execution with status polling and cancellation |
| GET | `/api/runs` | recent runs with stored request, result, versions and seed |
| GET | `/api/experiments` · `/api/experiments/{name}` | exported experiment JSON |
| POST | `/api/transpile` | route onto `aurora_q_tile`, `nighthawk_square` or `heron_heavy_hex` |
| POST | `/api/qasm` | OpenQASM 3 export |
| POST | `/api/ibm/run` | optional real-QPU submission via qiskit-ibm-runtime; needs `IBM_QUANTUM_TOKEN` in the server environment and is never available from the browser |

Guards: 32 qubits for API simulations, 200,000 shots, 20,000 operations, and a configurable timeout (`AURORA_JOB_TIMEOUT`, default 60 s).

## Digital twin documentation

The twin connects three things built from the same layout file: the Blender die (geometry and texture), the router's coupling graph (10 × 12 square lattice), and the engine's results. When you open a Lab run in the twin:

1. The circuit is routed onto the tile (interaction-weighted placement + SABRE-style SWAP insertion); the physical qubits used are outlined.
2. The routed schedule is split into ASAP layers. Each layer lights the qubits it touches: single-qubit gates blue, two-qubit gates violet with a coupler line, SWAPs orange, measurement gold, reset green.
3. When the schedule ends, each measured qubit glows in proportion to its measured $P(1)$ from the actual counts.
4. The HUD shows estimated duration from assumed operation times (single-qubit 25 ns, CZ 70 ns, measurement 1 µs, reset 200 ns).

The glow is a conceptual visualisation of the schedule and of measured statistics. It is not an image of a physical quantum state.

## Research methodology

Each experiment starts from a stated hypothesis with a pass criterion, fixes its seeds, and records library versions in its JSON output. Results include confidence intervals (Student-t for means, Wilson for proportions). Training and held-out sets are kept separate wherever an optimiser is involved (the connectivity engine reports both). Negative results are published alongside positive ones. External facts come only from `research/sources.md`, where each entry is graded primary, secondary or contested.

## Reproducing experiments

| Result file | Command | Typical runtime (4 cores) |
|---|---|---|
| `engine_connectivity.json`, `aurora_lattice.json` | `python -m aurora.run_all --only engine` | ≈ 4 min |
| `qec.json` | `--only qec` | ≈ 8 min |
| `reset.json` | `--only reset` | < 1 min |
| `mitigation.json` | `--only mitigation` | < 1 min |
| `qml.json` | `--only qml` | ≈ 4 min |
| `chemistry.json` | `--only chemistry` | < 1 min |
| `scalability.json` | `--only scalability` (after qec) | seconds |

`--quick` runs every experiment at reduced size for smoke testing. The TypeScript engine's Qiskit fixtures are regenerated with `python backend/tools/make_fixtures.py`.

## Known limitations

- The browser engine simulates. It cannot run on real hardware; the optional IBM path exists only in the Python server and needs your own credentials.
- Noise models omit non-Markovian and correlated noise; crosstalk is a ZZ-Pauli proxy.
- 3D feature heights and CPW widths on the die are exaggerated for visibility (documented in the layout module).
- Vendor facts were collected through search digests (see the method note in the source ledger).

## Troubleshooting

| Symptom | Fix |
|---|---|
| 3D views are slow | Choose **Low** quality in the Explorer; it lowers pixel ratio and disables shadows. |
| "beyond exact simulation in a browser" | Reduce the qubit count to ≤ 22, or use only Clifford gates (stabilizer method). |
| Noisy run used fewer shots than requested | The trajectory method caps work to stay responsive; the notes field says how many shots ran. |
| Copy button says "Selected" | Your browser blocked clipboard access; the text is selected, so press Ctrl/⌘+C. |
| `pip install bpy` fails | bpy wheels exist only for the matching CPython version (3.13 for Blender 5.2). |
