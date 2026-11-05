import os
import tempfile
import time

os.environ["AURORA_DB"] = os.path.join(tempfile.mkdtemp(), "test.sqlite3")

from fastapi.testclient import TestClient  # noqa: E402

from aurora.api import app  # noqa: E402

client = TestClient(app)
BELL = {"num_qubits": 2, "ops": [{"name": "h", "qubits": [0]}, {"name": "cx", "qubits": [0, 1]}]}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_run_and_store():
    r = client.post("/api/circuits/run", json={"circuit": BELL, "shots": 1000, "seed": 1})
    assert r.status_code == 200
    body = r.json()
    assert set(body["counts"]) == {"00", "11"}
    assert "simulation" in body["execution"]
    runs = client.get("/api/runs").json()["runs"]
    assert any(x["id"] == body["id"] and x["status"] == "done" for x in runs)


def test_noise_preset():
    r = client.post("/api/circuits/run", json={"circuit": BELL, "shots": 4000, "seed": 1, "noise_preset": "heron_class"})
    assert r.status_code == 200
    assert len(r.json()["counts"]) > 2


def test_validation_error_is_422():
    r = client.post("/api/circuits/run", json={"circuit": {"num_qubits": 2, "ops": [{"name": "cx", "qubits": [0, 5]}]}})
    assert r.status_code == 422


def test_job_queue():
    r = client.post("/api/jobs", json={"circuit": BELL, "shots": 100, "seed": 2})
    rid = r.json()["id"]
    for _ in range(100):
        s = client.get(f"/api/jobs/{rid}").json()
        if s["status"] in ("done", "error"):
            break
        time.sleep(0.05)
    assert s["status"] == "done"


def test_transpile_square_lattice():
    ghz = {"num_qubits": 5, "ops": [{"name": "h", "qubits": [0]}] + [{"name": "cx", "qubits": [0, i]} for i in range(1, 5)]}
    r = client.post("/api/transpile", json={"circuit": ghz, "topology": "nighthawk_square"})
    assert r.status_code == 200
    assert r.json()["output"]["two_qubit_gates"] >= 4


def test_ibm_requires_server_token():
    os.environ.pop("IBM_QUANTUM_TOKEN", None)
    r = client.post("/api/ibm/run", json={"circuit": BELL})
    assert r.status_code == 503


def test_qasm_export():
    r = client.post("/api/qasm", json=BELL)
    assert "OPENQASM 3" in r.json()["qasm"]
