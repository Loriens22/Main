# SolarSystem Scene Assembly

Build order (15 min):

1. **Managers** (empty GameObject):
   - `FloatingOrigin` (focus ← Ship), `ScaleSpaceManager`, `GravitySimulation`,
     `GameManager` (celestialBodyPrefab ← step 3, ship ← step 4),
     `SeamlessTransitionManager`.

2. **Cameras**:
   - `LocalCamera`: HDRP camera, near 0.1, far 100000, depth 0, clear = depth only.
     Add `CameraRig` + anchors from the ship prefab.
   - `ScaledCamera`: near 0.01, far 1e7, depth -1, culling mask `ScaledSpace` layer,
     clear = skybox (starfield HDRI cubemap).
   - Wire both into `ScaleSpaceManager`.

3. **CelestialBody prefab**:
   - Root: `CelestialBody` + `ProceduralPlanet` (assign PlanetTerrain.compute,
     terrain material, atmosphere material).
   - Child `ScaledProxy` (layer `ScaledSpace`): sphere mesh, per-body material,
     atmosphere shell child using `AtmosphereScattering.shader`.

4. **Ship prefab**: see `Docs/SHIP_MODEL_GUIDE.md` hierarchy.
   - Also add `WormholeSystem` (mouth + tunnel prefabs), `PlanetScanner`,
     `AtmosphereEntry`.

5. **HUD**: GameObject + `UIDocument` (HUD.uxml) + `HUDController`.
   UXML needs elements named: `velocity`, `altitude`, `ap-pe`, `flight-state`,
   `toast`, `fuel`, `oxygen`, `hull`, `warp-charge`, `create-wormhole` (Button),
   `target-picker`.

6. **Volumes**: global HDRP volume (exposure, bloom, lens flare), sky volume +
   clouds volume (assigned to `SeamlessTransitionManager`), wormhole overlay
   volume (chromatic aberration 1, weight 0, assigned to `HUDController`).

7. **Input** (new Input System): map WASDQE → SetRotationInput, IJKL/HN →
   SetTranslationInput, LeftShift/LeftCtrl → throttle, G → gear toggle,
   V → camera toggle, F → scanner, `,`/`.` → time warp.

Press Play → you spawn in 400 km Earth orbit.
