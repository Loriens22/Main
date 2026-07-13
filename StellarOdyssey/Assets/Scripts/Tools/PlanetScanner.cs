using UnityEngine;
using StellarOdyssey.Core;
using StellarOdyssey.Physics;

namespace StellarOdyssey.Tools
{
    /// <summary>
    /// Basic scanning tool: point the ship at a body (or scan the dominant body)
    /// to reveal its physical stats, atmosphere composition class and biome
    /// summary on the HUD, with a sweep VFX pulse.
    /// </summary>
    public sealed class PlanetScanner : MonoBehaviour
    {
        public Ship.ShipController ship;
        public UI.HUDController hud;
        public ParticleSystem scanPulseVFX;
        public AudioSource scanAudio;
        public float scanDurationSeconds = 3f;
        public double maxScanRange = 5e10;   // m

        private float scanProgress = -1f;
        private CelestialBody scanTarget;

        public void BeginScan()
        {
            var bodies = GravitySimulation.Instance.bodies;
            scanTarget = FindBodyInCrosshair(bodies) ?? GravitySimulation.Instance.ShipDominantBody;

            if (scanTarget == null ||
                Vector3d.Distance(scanTarget.UniversePosition, ship.UniversePosition) > maxScanRange)
            {
                hud.Toast("No scannable body in range");
                return;
            }

            scanProgress = 0f;
            scanPulseVFX?.Play();
            scanAudio?.Play();
            hud.Toast($"Scanning {scanTarget.bodyName}…");
        }

        private CelestialBody FindBodyInCrosshair(CelestialBody[] bodies)
        {
            CelestialBody best = null;
            double bestAngle = 5.0 * System.Math.PI / 180.0; // 5° cone
            foreach (var b in bodies)
            {
                Vector3d toBody = (b.UniversePosition - ship.UniversePosition).normalized;
                double angle = System.Math.Acos(System.Math.Clamp(
                    Vector3d.Dot(toBody, new Vector3d(ship.transform.forward)), -1.0, 1.0));
                if (angle < bestAngle) { best = b; bestAngle = angle; }
            }
            return best;
        }

        private void Update()
        {
            if (scanProgress < 0f) return;
            scanProgress += Time.deltaTime / scanDurationSeconds;
            if (scanProgress < 1f) return;

            scanProgress = -1f;
            hud.Toast(BuildReport(scanTarget));
        }

        private string BuildReport(CelestialBody b)
        {
            string atmo = b.atmosphereHeight <= 0 ? "None"
                : b.seaLevelPressure > 50 ? $"Dense ({b.seaLevelPressure:F0} kPa)"
                : $"Thin ({b.seaLevelPressure:F1} kPa)";

            return $"{b.bodyName.ToUpperInvariant()} — " +
                   $"R {b.radius / 1000:F0} km · g {b.surfaceGravity:F2} m/s² · " +
                   $"Atmosphere: {atmo} · Day {b.rotationPeriod / 3600:F1} h";
        }
    }
}
