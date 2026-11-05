"""Processor connectivity graphs used throughout the AURORA-Q study.

All graphs are undirected edge lists over integer qubit indices. Coordinates are
returned so the frontend digital twin can draw the exact same layouts.

Models
------
* ``heron_heavy_hex``  – Heron-class heavy-hex: 8 rows x 16 qubits + 28 bridge
  qubits = 156 qubits, 176 couplers (matches the publicly described Heron r2/r3
  coupler count).
* ``square_grid``      – Nighthawk-class square lattice. 10 x 12 gives 120 qubits and
  10*11 + 12*9 = 218 couplers, exactly the published Nighthawk coupler count.
* ``aurora_lattice``   – square lattice plus a *sparse* set of diagonal tunable
  couplers chosen by the AURORA Research Engine (see experiments/engine.py).
* ``all_to_all``       – idealised full connectivity (upper bound, not a hardware model).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

import networkx as nx


@dataclass
class Topology:
    name: str
    num_qubits: int
    edges: list[tuple[int, int]]
    coords: dict[int, tuple[float, float]] = field(default_factory=dict)
    description: str = ""

    @property
    def num_couplers(self) -> int:
        return len(self.edges)

    def graph(self) -> nx.Graph:
        g = nx.Graph()
        g.add_nodes_from(range(self.num_qubits))
        g.add_edges_from(self.edges)
        return g

    def coupling_list(self) -> list[list[int]]:
        """Directed list (both directions) as expected by qiskit CouplingMap."""
        out = []
        for a, b in self.edges:
            out.append([a, b])
            out.append([b, a])
        return out

    def degree_stats(self) -> dict:
        g = self.graph()
        degs = [d for _, d in g.degree()]
        return {
            "mean": sum(degs) / len(degs),
            "max": max(degs),
            "min": min(degs),
        }

    def to_json(self) -> dict:
        return {
            "name": self.name,
            "num_qubits": self.num_qubits,
            "num_couplers": self.num_couplers,
            "edges": [list(e) for e in self.edges],
            "coords": {str(k): list(v) for k, v in self.coords.items()},
            "degree": self.degree_stats(),
            "description": self.description,
        }


def square_grid(rows: int = 12, cols: int = 10, name: str | None = None) -> Topology:
    """Row-major square lattice. Default 12 rows x 10 cols = 120 qubits / 218 couplers."""
    edges: list[tuple[int, int]] = []
    coords: dict[int, tuple[float, float]] = {}
    for r in range(rows):
        for c in range(cols):
            q = r * cols + c
            coords[q] = (float(c), float(r))
            if c + 1 < cols:
                edges.append((q, q + 1))
            if r + 1 < rows:
                edges.append((q, q + cols))
    return Topology(
        name=name or f"square_{rows}x{cols}",
        num_qubits=rows * cols,
        edges=edges,
        coords=coords,
        description="Nighthawk-class square lattice with nearest-neighbour tunable couplers.",
    )


def heron_heavy_hex() -> Topology:
    """Heron-class heavy-hex lattice: 156 qubits, 176 couplers.

    Eight rows of 16 qubits; between consecutive rows sit four bridge qubits,
    alternating between columns (3, 7, 11, 15) and (1, 5, 9, 13).
    """
    rows, width = 8, 16
    edges: list[tuple[int, int]] = []
    coords: dict[int, tuple[float, float]] = {}
    q = 0
    for r in range(rows):
        this_row = q
        for c in range(width):
            coords[q] = (float(c), float(2 * r))
            if c > 0:
                edges.append((q - 1, q))
            q += 1
        if r < rows - 1:
            bridge_cols = (3, 7, 11, 15) if r % 2 == 0 else (1, 5, 9, 13)
            next_row = q + len(bridge_cols)  # next row starts after the bridges
            for c in bridge_cols:
                coords[q] = (float(c), float(2 * r + 1))
                edges.append((this_row + c, q))
                edges.append((q, next_row + c))
                q += 1
    return Topology(
        name="heron_heavy_hex_156",
        num_qubits=q,
        edges=edges,
        coords=coords,
        description="Heron-class heavy-hex (degree <= 3), 156 qubits / 176 couplers.",
    )


def heavy_hex_qiskit(distance: int = 7) -> Topology:
    from qiskit.transpiler import CouplingMap

    cm = CouplingMap.from_heavy_hex(distance, bidirectional=False)
    edges = sorted({tuple(sorted(e)) for e in cm.get_edges()})
    return Topology(name=f"heavy_hex_d{distance}", num_qubits=cm.size(), edges=edges)


def diagonal_candidates(rows: int = 12, cols: int = 10) -> list[tuple[int, int, int]]:
    """All diagonal coupler candidates on a square grid.

    Returns tuples (a, b, plaquette_id). Each plaquette has two candidate
    diagonals ("\\" and "/"); a plaquette may host at most one of them because
    crossing couplers inside one plaquette would require an extra routing layer.
    """
    out = []
    for r in range(rows - 1):
        for c in range(cols - 1):
            p = r * (cols - 1) + c
            a = r * cols + c
            out.append((a, a + cols + 1, p))  # "\" diagonal
            out.append((a + 1, a + cols, p))  # "/" diagonal
    return out


def aurora_lattice(diagonals: Iterable[tuple[int, int]], rows: int = 12, cols: int = 10) -> Topology:
    base = square_grid(rows, cols)
    diag = [tuple(sorted(d)) for d in diagonals]
    return Topology(
        name="aurora_q_square_x",
        num_qubits=base.num_qubits,
        edges=base.edges + diag,
        coords=base.coords,
        description=(
            "AURORA-Q 'Square-X' lattice: Nighthawk-class square grid plus a sparse set "
            "of non-crossing diagonal tunable couplers selected by the AURORA Research Engine."
        ),
    )


def checkerboard_diagonals(rows: int = 12, cols: int = 10) -> list[tuple[int, int]]:
    """Reference pattern: one '\\' diagonal in every other plaquette (checkerboard)."""
    out = []
    for r in range(rows - 1):
        for c in range(cols - 1):
            if (r + c) % 2 == 0:
                a = r * cols + c
                out.append((a, a + cols + 1))
    return out


def all_to_all(n: int = 120) -> Topology:
    edges = [(i, j) for i in range(n) for j in range(i + 1, n)]
    return Topology(name=f"all_to_all_{n}", num_qubits=n, edges=edges,
                    description="Idealised full connectivity (upper bound).")
