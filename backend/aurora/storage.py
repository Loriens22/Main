"""SQLite experiment store with reproducibility metadata."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

DB_PATH = Path(os.environ.get("AURORA_DB", Path(__file__).resolve().parents[1] / "aurora.sqlite3"))
_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    created REAL NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    request TEXT NOT NULL,
    result TEXT,
    error TEXT,
    backend TEXT,
    versions TEXT,
    seed INTEGER,
    elapsed_s REAL,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS runs_created ON runs(created);
"""


def _conn(path: Path | None = None) -> sqlite3.Connection:
    c = sqlite3.connect(path or DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    return c


def create(kind: str, request: dict, backend: str, seed: int | None, path: Path | None = None) -> str:
    rid = uuid.uuid4().hex[:12]
    with _lock, _conn(path) as c:
        c.execute("INSERT INTO runs (id, created, kind, status, request, backend, seed) VALUES (?,?,?,?,?,?,?)",
                  (rid, time.time(), kind, "queued", json.dumps(request), backend, seed))
    return rid


def update(rid: str, path: Path | None = None, **fields: Any) -> None:
    cols, vals = [], []
    for k, v in fields.items():
        cols.append(f"{k} = ?")
        vals.append(json.dumps(v) if isinstance(v, (dict, list)) else v)
    with _lock, _conn(path) as c:
        c.execute(f"UPDATE runs SET {', '.join(cols)} WHERE id = ?", (*vals, rid))


def get(rid: str, path: Path | None = None) -> dict | None:
    with _conn(path) as c:
        row = c.execute("SELECT * FROM runs WHERE id = ?", (rid,)).fetchone()
    return _row(row) if row else None


def recent(limit: int = 50, path: Path | None = None) -> list[dict]:
    with _conn(path) as c:
        rows = c.execute("SELECT * FROM runs ORDER BY created DESC LIMIT ?", (limit,)).fetchall()
    return [_row(r) for r in rows]


def _row(r: sqlite3.Row) -> dict:
    d = dict(r)
    for k in ("request", "result", "versions"):
        if d.get(k):
            try:
                d[k] = json.loads(d[k])
            except (TypeError, json.JSONDecodeError):
                pass
    return d
