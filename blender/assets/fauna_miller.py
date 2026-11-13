"""
Miller's Planet fauna: entry point. The species live in
  fauna_miller_shore.py — ferracaris, sedimentmaw, mimic (+ mimic_juv), breaker (+ breaker_juv), architect
  fauna_miller_deep.py  — siren, stalker (+ stalker_juv), chorus (+ chorus_juv), cathedral (+ cathedral_calf), crown,
                          prey_dart, prey_shrimp, prey_krill
  miller_caves.py       — the cave shells (miller_cave_shelter, miller_cave_ledge, miller_cave_den)
This script builds any of them by name (all when none is given), e.g.
  python blender/assets/fauna_miller.py crown siren --nopreview
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import subprocess

SHORE = ["ferracaris", "sedimentmaw", "mimic", "mimic_juv", "breaker", "breaker_juv", "architect"]
DEEP = ["siren", "stalker", "stalker_juv", "chorus", "chorus_juv", "cathedral", "cathedral_calf", "crown", "prey_dart", "prey_shrimp", "prey_krill"]
CAVES = ["miller_cave_shelter", "miller_cave_ledge", "miller_cave_den"]

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if not a.startswith("--")] or SHORE + DEEP + CAVES
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    for group, script in ((SHORE, "fauna_miller_shore.py"), (DEEP, "fauna_miller_deep.py"), (CAVES, "miller_caves.py")):
        sel = [n for n in names if n in group]
        if sel:
            # one Blender session per species: each starts from a clean scene
            for n in sel:
                subprocess.run([sys.executable, os.path.join(HERE, script), n, *flags], check=True)
    unknown = [n for n in names if n not in SHORE + DEEP + CAVES]
    if unknown:
        print("unknown species:", ", ".join(unknown))
