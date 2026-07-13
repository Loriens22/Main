# Ship Model — Import & Setup Guide

## Sourcing / creating the explorer vessel
Target: medium explorer, ~28 m long, believable greebling, detailed cockpit.

Options (best → fastest):
1. **Custom in Blender** — recommended topology budget: 150k tris exterior,
   80k cockpit interior, 4× 4K PBR texture sets (hull, cockpit, engines, glass).
2. Marketplace kit-bash (Unity Asset Store / Sketchfab "sci-fi explorer") —
   pick CC-licensed models with metallic/roughness PBR maps.
3. Blockout primitives now, swap art later (the demo scripts don't care).

## Blender export checklist
- Apply all transforms; +Z forward becomes Unity's +Z via FBX exporter
  ("!EXPERIMENTAL Apply Transform" or rotate -90°X trick).
- Real-world scale (1 unit = 1 m). Ship origin at center of mass, not geometry.
- Separate objects: `Hull`, `Cockpit_Interior`, `Canopy_Glass`, `Engine_L/R`,
  `GearLeg_FL/FR/RL/RR` (+ `Foot` child each), `RCS_xx` empties at thruster points.
- Bake AO into the mask map's green channel (HDRP mask: R=metallic, G=AO,
  B=detail, A=smoothness).

## Unity import settings
- Model: Read/Write off, mesh compression off (hull), Generate Lightmap UVs off.
- Materials: HDRP/Lit. Hull: metallic 0.85–1.0 workflow with roughness variation
  map — flat uniform roughness is what makes ships look fake.
- **Emissive panels**: separate emissive map, HDRP emission intensity in nits
  (cockpit glow ~50, engine internals ~5,000, formation lights ~1,000).
  Drive `_EmissiveColor` from scripts for power states.
- Canopy: HDRP transparent, IOR 1.45, thin refraction model, slight smudge
  detail normal. Enable "Receive SSR on transparent".

## Prefab hierarchy (matches the scripts)
```
Ship (Rigidbody, ShipController, ShipSystems, WormholeSystem, PlanetScanner,
      AtmosphereEntry, RCSController)
├── Hull (MeshRenderer + convex MeshCollider or compound box colliders)
├── Cockpit_Interior
│   └── SeatAnchor  ← CameraRig.cockpitAnchor
├── ChaseAnchor (behind/above)  ← CameraRig.chaseAnchor
├── Engine_L / Engine_R
│   ├── PlumeVFX (VFX Graph)   ← ShipController.mainEngineVFX
│   └── EngineLight (Point, 60k lm) ← ShipController.engineLights
├── RCS_FrontUp, RCS_FrontDown, ... (12×)
│   ├── PuffVFX + SpotLight    ← RCSController.thrusters[]
├── GearLeg_FL/FR/RL/RR (LandingGear)
│   ├── Foot (visual mesh)
│   └── DustVFX
└── PlasmaAnchor (nose) ← AtmosphereEntry.plasmaTrail
```

- Rigidbody: mass clamped in code; drag/angularDrag 0 (we compute our own);
  interpolate on; continuous-dynamic collision.
- Center of mass: set explicitly (`rb.centerOfMass`) slightly below geometric
  center so landings settle nose-up.

## Cockpit detail pass
- MFD screens = render textures (map view camera, systems status UI).
- Interactable throttle/joystick meshes lerp to input values — huge immersion win.
- Interior lighting: 2–3 small area lights + reflection probe; keep real-time
  shadows off inside, use contact shadows.
