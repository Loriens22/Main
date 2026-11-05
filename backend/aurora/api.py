"""AURORA-Q research backend (FastAPI).

    uvicorn aurora.api:app --port 8000

Endpoints
---------
GET  /api/health                  liveness + library versions
POST /api/circuits/run            synchronous run (small circuits), stored with metadata
POST /api/jobs                    queue a run; poll GET /api/jobs/{id}; cancel DELETE /api/jobs/{id}
GET  /api/runs                    recent stored runs
GET  /api/experiments             list exported experiment results
GET  /api/experiments/{name}      one experiment result (JSON)
POST /api/transpile               route a circuit onto a named topology, return stats + mapped circuit
POST /api/qasm                    export OpenQASM 3
GET  /api/topologies              processor graphs used in the study
POST /api/ibm/run                 OPTIONAL real-hardware submission via qiskit-ibm-runtime;
                                  requires IBM_QUANTUM_TOKEN in the server environment. Tokens
                                  are never accepted from, or returned to, the browser.
"""

from __future__ import annotations

import json
import os
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutTimeout
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import __version__, storage
from .circuits import CircuitValidationError, stats, to_openqasm3, to_qiskit, validate
from .experiments.common import RESULTS_DIR
from .noise import PRESET_NOTES, PRESETS
from .simulate import run_circuit, versions
from .topologies import aurora_lattice, heron_heavy_hex, square_grid

app = FastAPI(title="AURORA-Q Research Backend", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("AURORA_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["*"], allow_headers=["*"],
)

MAX_WORKERS = int(os.environ.get("AURORA_WORKERS", "2"))
JOB_TIMEOUT_S = float(os.environ.get("AURORA_JOB_TIMEOUT", "60"))
_pool = ThreadPoolExecutor(max_workers=MAX_WORKERS)
_futures: dict[str, Future] = {}
_flock = threading.Lock()


class RunRequest(BaseModel):
    circuit: dict[str, Any]
    shots: int = Field(1024, ge=1, le=200_000)
    method: str = "automatic"
    noise: dict[str, Any] | None = None
    noise_preset: str | None = None
    seed: int | None = None


class TranspileRequest(BaseModel):
    circuit: dict[str, Any]
    topology: str = "aurora_q_tile"
    optimization_level: int = Field(2, ge=0, le=3)
    seed: int = 1


def _noise_from(req: RunRequest) -> dict | None:
    if req.noise_preset:
        if req.noise_preset not in PRESETS:
            raise HTTPException(400, f"unknown preset {req.noise_preset}")
        return PRESETS[req.noise_preset]
    return req.noise


@app.get("/api/health")
def health():
    return {"status": "ok", "version": __version__, "versions": versions(), "workers": MAX_WORKERS,
            "ibm_runtime_configured": bool(os.environ.get("IBM_QUANTUM_TOKEN"))}


@app.get("/api/noise-presets")
def noise_presets():
    return {"presets": PRESETS, "notes": PRESET_NOTES}


@app.post("/api/circuits/run")
def run_sync(req: RunRequest):
    try:
        validate(req.circuit)
    except CircuitValidationError as exc:
        raise HTTPException(422, str(exc))
    noise = _noise_from(req)
    rid = storage.create("circuit", req.model_dump(), backend="qiskit_aer", seed=req.seed)
    fut = _pool.submit(run_circuit, req.circuit, req.shots, req.method, noise, req.seed)
    try:
        res = fut.result(timeout=JOB_TIMEOUT_S)
    except FutTimeout:
        storage.update(rid, status="timeout", error=f"exceeded {JOB_TIMEOUT_S}s")
        raise HTTPException(504, f"simulation exceeded {JOB_TIMEOUT_S}s; reduce qubits/shots or use the job queue")
    except ValueError as exc:
        storage.update(rid, status="error", error=str(exc))
        raise HTTPException(422, str(exc))
    storage.update(rid, status="done", result=res, versions=res["versions"], elapsed_s=res["elapsed_s"])
    return {"id": rid, **res}


@app.post("/api/jobs")
def submit_job(req: RunRequest):
    try:
        validate(req.circuit)
    except CircuitValidationError as exc:
        raise HTTPException(422, str(exc))
    noise = _noise_from(req)
    rid = storage.create("circuit", req.model_dump(), backend="qiskit_aer", seed=req.seed)

    def work():
        storage.update(rid, status="running")
        try:
            res = run_circuit(req.circuit, req.shots, req.method, noise, req.seed)
            storage.update(rid, status="done", result=res, versions=res["versions"], elapsed_s=res["elapsed_s"])
        except Exception as exc:  # noqa: BLE001
            storage.update(rid, status="error", error=str(exc))

    with _flock:
        _futures[rid] = _pool.submit(work)
    return {"id": rid, "status": "queued"}


@app.get("/api/jobs/{rid}")
def job_status(rid: str):
    r = storage.get(rid)
    if not r:
        raise HTTPException(404, "unknown job")
    return r


@app.delete("/api/jobs/{rid}")
def cancel_job(rid: str):
    with _flock:
        fut = _futures.get(rid)
    if fut and fut.cancel():
        storage.update(rid, status="cancelled")
        return {"id": rid, "status": "cancelled"}
    r = storage.get(rid)
    if not r:
        raise HTTPException(404, "unknown job")
    return {"id": rid, "status": r["status"], "note": "running jobs cannot be interrupted; they are bounded by the timeout"}


@app.get("/api/runs")
def runs(limit: int = 50):
    return {"runs": storage.recent(min(limit, 500))}


@app.get("/api/experiments")
def experiments():
    files = sorted(p.stem for p in RESULTS_DIR.glob("*.json"))
    return {"experiments": files}


@app.get("/api/experiments/{name}")
def experiment(name: str):
    if not name.replace("_", "").isalnum():
        raise HTTPException(400, "bad name")
    p = RESULTS_DIR / f"{name}.json"
    if not p.exists():
        raise HTTPException(404, "not found; run `python -m aurora.run_all`")
    return json.loads(p.read_text())


def _topology(name: str):
    if name == "heron_heavy_hex":
        return heron_heavy_hex()
    if name in ("nighthawk_square", "square"):
        return square_grid()
    if name == "aurora_q_tile":
        p = RESULTS_DIR / "aurora_lattice.json"
        if p.exists():
            d = json.loads(p.read_text())
            return aurora_lattice([tuple(e) for e in d["edges"][218:]])
        return square_grid()
    raise HTTPException(400, f"unknown topology {name}")


@app.get("/api/topologies")
def topologies():
    return {n: _topology(n).to_json() for n in ("heron_heavy_hex", "nighthawk_square", "aurora_q_tile")}


@app.post("/api/transpile")
def transpile_endpoint(req: TranspileRequest):
    from qiskit import transpile
    from qiskit.transpiler import CouplingMap

    from .circuits import from_qiskit

    try:
        validate(req.circuit, max_qubits=156)
    except CircuitValidationError as exc:
        raise HTTPException(422, str(exc))
    topo = _topology(req.topology)
    qc = to_qiskit(req.circuit)
    if qc.num_qubits > topo.num_qubits:
        raise HTTPException(422, "circuit larger than device")
    t0 = time.perf_counter()
    out = transpile(qc, coupling_map=CouplingMap(topo.coupling_list()), basis_gates=["cz", "rz", "sx", "x"],
                    optimization_level=req.optimization_level, seed_transpiler=req.seed)
    layout = out.layout.final_index_layout() if out.layout else list(range(qc.num_qubits))
    return {"topology": topo.name, "elapsed_s": time.perf_counter() - t0, "input": stats(req.circuit),
            "output": {"two_qubit_gates": sum(1 for d in out.data if d.operation.num_qubits == 2),
                       "depth": out.depth(), "size": out.size()},
            "final_layout": layout, "mapped": from_qiskit(out)}


@app.post("/api/qasm")
def qasm(circuit: dict[str, Any]):
    try:
        return {"qasm": to_openqasm3(circuit)}
    except CircuitValidationError as exc:
        raise HTTPException(422, str(exc))


@app.post("/api/ibm/run")
def ibm_run(req: RunRequest, backend: str = "least_busy"):
    """Submit to IBM Quantum hardware if — and only if — the server operator configured a token."""
    token = os.environ.get("IBM_QUANTUM_TOKEN")
    if not token:
        raise HTTPException(503, "Real-hardware execution is not configured on this server (IBM_QUANTUM_TOKEN unset). "
                                 "All results on this platform are simulations.")
    try:
        from qiskit import transpile
        from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2
    except ImportError:
        raise HTTPException(503, "qiskit-ibm-runtime is not installed on this server")
    validate(req.circuit)
    service = QiskitRuntimeService(channel=os.environ.get("IBM_QUANTUM_CHANNEL", "ibm_quantum_platform"), token=token)
    be = service.least_busy(operational=True, simulator=False) if backend == "least_busy" else service.backend(backend)
    qc = to_qiskit(req.circuit)
    if not any(d.operation.name == "measure" for d in qc.data):
        qc.measure_all()
    job = SamplerV2(be).run([transpile(qc, be)], shots=req.shots)
    rid = storage.create("ibm_hardware", req.model_dump(), backend=be.name, seed=None)
    storage.update(rid, status="submitted", notes=job.job_id())
    return {"id": rid, "ibm_job_id": job.job_id(), "backend": be.name,
            "execution": "REAL QPU submission — poll IBM Quantum for results"}
