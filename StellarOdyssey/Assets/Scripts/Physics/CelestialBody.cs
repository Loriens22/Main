using UnityEngine;
using StellarOdyssey.Core;

namespace StellarOdyssey.Physics
{
    /// <summary>
    /// A star, planet or moon. Holds real physical parameters (SI units) and the
    /// Keplerian elements of its orbit around <see cref="parent"/>. Position is
    /// propagated analytically (planets stay on rails, KSP-style), which is
    /// stable at any time-warp factor.
    /// </summary>
    public class CelestialBody : MonoBehaviour
    {
        public const double G = 6.67430e-11;

        [Header("Physical parameters (SI)")]
        public string bodyName = "Unnamed";
        public double mass = 5.972e24;          // kg
        public double radius = 6.371e6;         // m
        public double rotationPeriod = 86400.0; // s (sidereal day)
        public double atmosphereHeight;         // m, 0 = airless
        public double seaLevelPressure = 101.325; // kPa
        public float surfaceGravity => (float)(G * mass / (radius * radius));

        [Header("Orbit (Keplerian elements around parent)")]
        public CelestialBody parent;
        public double semiMajorAxis;            // m
        public double eccentricity;
        public double inclinationDeg;
        public double longitudeOfAscendingNodeDeg;
        public double argumentOfPeriapsisDeg;
        public double meanAnomalyAtEpochDeg;

        [Header("Rendering")]
        [Tooltip("Low-poly proxy rendered on the scaled-space layer when far away.")]
        public Transform scaledSpaceProxy;
        [Tooltip("Procedural terrain system activated in local space.")]
        public Planets.ProceduralPlanet proceduralPlanet;

        public Vector3d UniversePosition { get; private set; }
        public Vector3d UniverseVelocity { get; private set; }
        public bool InLocalSpace { get; private set; }
        public Transform ScaledSpaceTransform => scaledSpaceProxy;

        /// <summary>Standard gravitational parameter GM (m^3/s^2).</summary>
        public double Mu => G * mass;

        /// <summary>Radius of the sphere of influence (patched conics), m.</summary>
        public double SphereOfInfluence =>
            parent == null ? double.PositiveInfinity
                           : semiMajorAxis * System.Math.Pow(mass / parent.mass, 0.4);

        /// <summary>Propagate the body along its orbit to universal time t (seconds since epoch).</summary>
        public void Propagate(double universalTime)
        {
            if (parent == null)
            {
                UniversePosition = new Vector3d(0, 0, 0);
                UniverseVelocity = new Vector3d(0, 0, 0);
            }
            else
            {
                parent.Propagate(universalTime); // ensure parent is current
                OrbitalMechanics.KeplerToStateVectors(
                    parent.Mu, semiMajorAxis, eccentricity,
                    inclinationDeg * Mathd.Deg2Rad,
                    longitudeOfAscendingNodeDeg * Mathd.Deg2Rad,
                    argumentOfPeriapsisDeg * Mathd.Deg2Rad,
                    meanAnomalyAtEpochDeg * Mathd.Deg2Rad,
                    universalTime,
                    out Vector3d localPos, out Vector3d localVel);

                UniversePosition = parent.UniversePosition + localPos;
                UniverseVelocity = parent.UniverseVelocity + localVel;
            }

            // Axial rotation (drives terrain and surface-fixed reference frame).
            if (rotationPeriod > 0)
            {
                float angle = (float)((universalTime / rotationPeriod % 1.0) * 360.0);
                transform.rotation = Quaternion.Euler(0f, angle, 0f);
                if (scaledSpaceProxy != null) scaledSpaceProxy.rotation = transform.rotation;
            }
        }

        /// <summary>Gravitational acceleration this body exerts at a universe-space point.</summary>
        public Vector3d GravityAt(Vector3d point)
        {
            Vector3d delta = UniversePosition - point;
            double r2 = delta.sqrMagnitude;
            if (r2 < 1.0) return new Vector3d(0, 0, 0);
            return delta.normalized * (Mu / r2);
        }

        /// <summary>Atmospheric density (kg/m^3) at altitude, simple exponential model.</summary>
        public double AtmosphericDensity(double altitude)
        {
            if (atmosphereHeight <= 0 || altitude > atmosphereHeight) return 0;
            double scaleHeight = atmosphereHeight / 10.0;
            double rho0 = seaLevelPressure * 1000.0 / (287.0 * 288.0); // ideal gas approx.
            return rho0 * System.Math.Exp(-altitude / scaleHeight);
        }

        public void EnterLocalSpace()
        {
            InLocalSpace = true;
            if (scaledSpaceProxy != null) scaledSpaceProxy.gameObject.SetActive(false);
            if (proceduralPlanet != null) proceduralPlanet.Activate(this);
        }

        public void ExitLocalSpace()
        {
            InLocalSpace = false;
            if (scaledSpaceProxy != null) scaledSpaceProxy.gameObject.SetActive(true);
            if (proceduralPlanet != null) proceduralPlanet.Deactivate();
        }
    }

    internal static class Mathd
    {
        public const double Deg2Rad = System.Math.PI / 180.0;
        public const double Rad2Deg = 180.0 / System.Math.PI;
    }
}
