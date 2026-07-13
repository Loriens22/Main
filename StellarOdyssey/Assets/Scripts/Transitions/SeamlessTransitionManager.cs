using UnityEngine;
using StellarOdyssey.Core;
using StellarOdyssey.Physics;

namespace StellarOdyssey.Transitions
{
    /// <summary>
    /// Orchestrates the space -> orbit -> atmosphere -> surface pipeline.
    /// Watches ship altitude over the dominant body and cross-fades every
    /// environment system through five states, No Man's Sky style — there is
    /// never a loading screen, only continuous parameter blends:
    ///
    ///   DeepSpace   – scaled-space planets, starfield exposure, no fog
    ///   Orbit       – procedural planet activates, atmosphere shell visible from above
    ///   HighAtmo    – sky dome fades in, stars fade out, aero forces ramp
    ///   LowAtmo     – volumetric clouds/fog, wind audio, terrain colliders live
    ///   Surface     – full-detail terrain, surface scatter, landing dust enabled
    /// </summary>
    public sealed class SeamlessTransitionManager : MonoBehaviour
    {
        public enum FlightState { DeepSpace, Orbit, HighAtmosphere, LowAtmosphere, Surface }

        [Header("Refs")]
        public Ship.ShipController ship;
        public UnityEngine.Rendering.Volume skyVolume;          // HDRP PBR sky + fog profile
        public UnityEngine.Rendering.Volume cloudsVolume;       // volumetric clouds profile
        public AudioSource windAudio;
        public UI.HUDController hud;

        [Header("Thresholds (fractions of atmosphere height)")]
        public float orbitEntryFactor = 3f;      // within 3x atmo height => Orbit state
        public float surfaceAltitude = 2500f;    // m AGL

        public FlightState State { get; private set; } = FlightState.DeepSpace;
        public event System.Action<FlightState, FlightState> OnStateChanged;

        private void Update()
        {
            var body = GravitySimulation.Instance != null ? GravitySimulation.Instance.ShipDominantBody : null;
            FlightState next = Classify(body);
            if (next != State)
            {
                var prev = State;
                State = next;
                OnStateChanged?.Invoke(prev, next);
                hud?.SetFlightStateLabel(next.ToString());
            }
            BlendEnvironment(body);
        }

        private FlightState Classify(CelestialBody body)
        {
            if (body == null || body.parent == null && body.atmosphereHeight <= 0)
                return FlightState.DeepSpace;

            double altitude = Vector3d.Distance(ship.UniversePosition, body.UniversePosition) - body.radius;
            double atmo = System.Math.Max(body.atmosphereHeight, 20000.0);

            if (altitude > atmo * orbitEntryFactor) return FlightState.DeepSpace;
            if (altitude > atmo) return FlightState.Orbit;
            if (altitude > atmo * 0.35) return FlightState.HighAtmosphere;
            if (altitude > surfaceAltitude) return FlightState.LowAtmosphere;
            return FlightState.Surface;
        }

        private void BlendEnvironment(CelestialBody body)
        {
            if (body == null) return;
            double altitude = Vector3d.Distance(ship.UniversePosition, body.UniversePosition) - body.radius;
            double atmo = System.Math.Max(body.atmosphereHeight, 20000.0);

            // 0 in space, 1 at sea level — the master blend factor.
            float atmosphereDepth = Mathf.Clamp01(1f - (float)(altitude / atmo));

            // HDRP volumes support weight blending — sky, exposure, fog in one profile.
            if (skyVolume != null) skyVolume.weight = atmosphereDepth;
            if (cloudsVolume != null) cloudsVolume.weight = Mathf.Clamp01((atmosphereDepth - 0.4f) / 0.6f);

            if (windAudio != null)
            {
                double speed = (ship.UniverseVelocity - body.UniverseVelocity).magnitude;
                windAudio.volume = atmosphereDepth * Mathf.Clamp01((float)(speed / 300.0));
            }
        }
    }
}
