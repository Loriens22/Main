"""Export AURORA-Q2 results for the website (web2/public/data)."""

from __future__ import annotations

import json
import pathlib

from .codes import BB_CODES, bb_code, rotated_surface_code
from .cryo import report as cryo_report
from .layout import toroid_layout

ROOT = pathlib.Path(__file__).resolve().parents[3]
RES = ROOT / "backend" / "results"
OUT = ROOT / "web2" / "public" / "data"


def codes_json():
    out = []
    for c in [bb_code(k) for k in BB_CODES] + [rotated_surface_code(d) for d in (3, 5, 7, 9, 11)]:
        s = c.summary()
        s["hx_support"] = [list(map(int, r.nonzero()[0])) for r in c.HX[:3]]
        s["hz_support"] = [list(map(int, r.nonzero()[0])) for r in c.HZ[:3]]
        s["hx_weight_total"] = int(c.HX.sum())
        out.append({k: v for k, v in s.items() if k not in ("A", "B")} | {"A": s.get("A"), "B": s.get("B")})
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "q2_cryo_models.json").write_text(json.dumps(cryo_report(), default=str))
    lay = toroid_layout()
    for e in lay["edges"]:
        e["len_mm"] = round(e["len_mm"], 3)
        e["len_pitch"] = round(e["len_pitch"], 3)
    (OUT / "q2_layout.json").write_text(json.dumps(lay))
    (OUT / "q2_codes.json").write_text(json.dumps(codes_json()))
    for name in ("q2_qec", "q2_cryo_qec", "q2_resources"):
        p = RES / f"{name}.json"
        if p.exists():
            (OUT / f"{name}.json").write_text(p.read_text())
    print("exported", sorted(x.name for x in OUT.iterdir()))


if __name__ == "__main__":
    main()
