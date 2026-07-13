using System.Collections;
using UnityEngine;
using StellarOdyssey.Core;
using StellarOdyssey.Physics;

namespace StellarOdyssey.Wormhole
{
    /// <summary>
    /// "Create Wormhole" fast travel:
    ///  1. Player presses the Create Wormhole button -> target picker opens.
    ///  2. Target chosen -> a wormhole mouth (gravitational-lensing sphere +
    ///     accretion disk, see Wormhole.shader) grows 2 km ahead of the ship.
    ///  3. Ship is pulled in; camera enters the tunnel state (swirling energy
    ///     shader on an inverted cylinder + heavy chromatic aberration).
    ///  4. After <see cref="tunnelSeconds"/>, the ship is teleported (double
    ///     precision) to a safe orbit above the target, exit mouth collapses.
    /// </summary>
    public sealed class WormholeSystem : MonoBehaviour
    {
        [Header("Costs & timing")]
        public float warpChargeCostPercent = 60f;
        public float mouthGrowSeconds = 3.5f;
        public float tunnelSeconds = 5f;
        [Tooltip("Exit altitude above target body radius, as a multiple of its radius.")]
        public float exitAltitudeFactor = 3f;

        [Header("Scene hooks")]
        public GameObject wormholeMouthPrefab;   // lensing sphere + accretion disk VFX
        public GameObject tunnelPrefab;          // inverted cylinder around camera, scrolling shader
        public Ship.ShipController ship;
        public UI.HUDController hud;

        public bool Travelling { get; private set; }

        public event System.Action<CelestialBody> OnArrived;

        /// <summary>UI entry point — wired to the big "Create Wormhole" button.</summary>
        public void RequestWormhole()
        {
            if (Travelling) return;
            hud.ShowTargetPicker(GravitySimulation.Instance.bodies, OnTargetChosen);
        }

        private void OnTargetChosen(CelestialBody target)
        {
            if (target == null) return;
            if (ship.systems != null && !ship.systems.TryConsumeWarpCharge(warpChargeCostPercent))
            {
                hud.Toast("Warp drive charging — " + ship.systems.warpChargePercent.ToString("F0") + "%");
                return;
            }
            StartCoroutine(TravelSequence(target));
        }

        private IEnumerator TravelSequence(CelestialBody target)
        {
            Travelling = true;

            // --- 1. Open the mouth ahead of the ship. -------------------------
            Vector3 mouthPos = ship.transform.position + ship.transform.forward * 2000f;
            var mouth = Instantiate(wormholeMouthPrefab, mouthPos, Quaternion.LookRotation(-ship.transform.forward));
            float t = 0f;
            while (t < mouthGrowSeconds)
            {
                t += Time.deltaTime;
                float s = EaseOutElastic(t / mouthGrowSeconds) * 600f; // 600 m mouth
                mouth.transform.localScale = Vector3.one * s;
                yield return null;
            }

            // --- 2. Auto-pilot the ship into the mouth. ------------------------
            hud.Toast("Wormhole stable — committing");
            float approach = 0f;
            Vector3 start = ship.transform.position;
            while (approach < 1f)
            {
                approach += Time.deltaTime / 2.5f;
                ship.transform.position = Vector3.Lerp(start, mouth.transform.position, approach * approach);
                yield return null;
            }

            // --- 3. Tunnel state. ----------------------------------------------
            var tunnel = Instantiate(tunnelPrefab, ship.transform);
            hud.EnterWormholeOverlay();     // chromatic aberration, FOV pull, speed lines
            Destroy(mouth);
            yield return new WaitForSeconds(tunnelSeconds);

            // --- 4. Exit: place ship on a circular orbit above the target. -----
            double exitRadius = target.radius * exitAltitudeFactor;
            Vector3d radialDir = (ship.UniversePosition - target.UniversePosition).normalized;
            if (radialDir.magnitude < 0.5) radialDir = new Vector3d(1, 0, 0);

            Vector3d exitPos = target.UniversePosition + radialDir * exitRadius;
            double orbitalSpeed = OrbitalMechanics.CircularOrbitSpeed(target.Mu, exitRadius);
            Vector3d prograde = Vector3d.Cross(new Vector3d(0, 1, 0), radialDir).normalized;
            Vector3d exitVel = target.UniverseVelocity + prograde * orbitalSpeed;

            ship.SetStateVectors(exitPos, exitVel);
            ship.InvalidateRails();
            ship.SyncToUnityWorld();

            Destroy(tunnel);
            hud.ExitWormholeOverlay();
            hud.Toast("Arrived: " + target.bodyName);

            Travelling = false;
            OnArrived?.Invoke(target);
        }

        private static float EaseOutElastic(float x)
        {
            const float c4 = 2f * Mathf.PI / 3f;
            return x <= 0f ? 0f : x >= 1f ? 1f
                 : Mathf.Pow(2f, -10f * x) * Mathf.Sin((x * 10f - 0.75f) * c4) + 1f;
        }
    }
}
