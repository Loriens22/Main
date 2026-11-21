#!/usr/bin/env python3
"""Rebuild every Blender asset and compress the exported GLBs.

  python3 blender/build_all.py            # everything
  python3 blender/build_all.py pickup     # only scripts whose name matches
Each script runs in its own process (bpy keeps global state)."""
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRIPTS = ["farmhouse", "corn", "pickup", "farm_machines", "farm_props", "characters", "nasa", "ranger", "endurance", "endurance_int", "station", "lazarus"]
SKIP_OPT = {"corn"}

only = [a for a in sys.argv[1:] if not a.startswith("-")]
t00 = time.time()
for s in SCRIPTS:
    if only and not any(o in s for o in only):
        continue
    t0 = time.time()
    r = subprocess.run([sys.executable, os.path.join(HERE, "assets", s + ".py")], capture_output=True, text=True)
    lines = [l for l in (r.stdout + r.stderr).splitlines() if "exported" in l or "Traceback" in l or "Error" in l]
    print(f"[{s}] {time.time() - t0:.0f}s\n  " + "\n  ".join(lines[-6:]))
    if r.returncode != 0:
        print(r.stderr[-2000:])
        sys.exit(1)
names = [f[:-4] for f in os.listdir(os.path.join(ROOT, "public", "assets", "models")) if f.endswith(".glb") and f[:-4] not in SKIP_OPT]
subprocess.run(["node", os.path.join(ROOT, "tools", "optimize_glb.mjs"), *names], cwd=ROOT)
print(f"done in {time.time() - t00:.0f}s")
