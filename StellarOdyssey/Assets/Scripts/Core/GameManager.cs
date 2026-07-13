using UnityEngine;
using StellarOdyssey.Physics;

namespace StellarOdyssey.Core
{
    /// <summary>
    /// Bootstraps the solar system with real astronomical data (SI units) and
    /// wires input to the ship. Bodies are created as children of this object;
    /// designers can also hand-place CelestialBody components instead.
    /// </summary>
    public sealed class GameManager : MonoBehaviour
    {
        [Header("Prefabs")]
        public GameObject celestialBodyPrefab;   // CelestialBody + scaled proxy + ProceduralPlanet
        public Ship.ShipController ship;
        public Camera.CameraRig cameraRig;

        [Header("Start")]
        public string startOrbitBody = "Earth";
        public double startAltitude = 400000;    // ISS-ish, m

        private void Start()
        {
            var bodies = BuildSolarSystem();
            GravitySimulation.Instance.bodies = bodies;

            foreach (var b in bodies) b.Propagate(0);
            PlaceShipInOrbit(bodies);
        }

        // name, parent, mass(kg), radius(m), a(m), e, inc(deg), atmoHeight(m), pressure(kPa), day(s)
        private static readonly object[][] SystemData =
        {
            new object[] { "Sun",     null,      1.989e30, 6.9634e8, 0.0,       0.0,    0.0,  0.0,      0.0,    2.16e6 },
            new object[] { "Mercury", "Sun",     3.301e23, 2.4397e6, 5.791e10,  0.2056, 7.0,  0.0,      0.0,    5.067e6 },
            new object[] { "Venus",   "Sun",     4.867e24, 6.0518e6, 1.0821e11, 0.0068, 3.39, 250000.0, 9200.0, -2.1e7 },
            new object[] { "Earth",   "Sun",     5.972e24, 6.371e6,  1.496e11,  0.0167, 0.0,  100000.0, 101.3,  86164.0 },
            new object[] { "Moon",    "Earth",   7.342e22, 1.7374e6, 3.844e8,   0.0549, 5.14, 0.0,      0.0,    2.36e6 },
            new object[] { "Mars",    "Sun",     6.417e23, 3.3895e6, 2.2794e11, 0.0934, 1.85, 80000.0,  0.6,    88642.0 },
            new object[] { "Phobos",  "Mars",    1.066e16, 1.1267e4, 9.376e6,   0.0151, 1.09, 0.0,      0.0,    27553.0 },
            new object[] { "Jupiter", "Sun",     1.898e27, 6.9911e7, 7.7857e11, 0.0489, 1.30, 5000000.0,7000.0, 35730.0 },
            new object[] { "Io",      "Jupiter", 8.932e22, 1.8216e6, 4.217e8,   0.0041, 0.05, 0.0,      0.0,    152853.0 },
            new object[] { "Europa",  "Jupiter", 4.800e22, 1.5608e6, 6.709e8,   0.009,  0.47, 0.0,      0.0,    306822.0 },
            new object[] { "Saturn",  "Sun",     5.683e26, 5.8232e7, 1.4335e12, 0.0565, 2.49, 4000000.0,1400.0, 38362.0 },
            new object[] { "Titan",   "Saturn",  1.345e23, 2.5747e6, 1.2219e9,  0.0288, 0.35, 600000.0, 146.7,  1377648.0 },
            new object[] { "Uranus",  "Sun",     8.681e25, 2.5362e7, 2.8725e12, 0.0457, 0.77, 3000000.0,800.0,  -62064.0 },
            new object[] { "Neptune", "Sun",     1.024e26, 2.4622e7, 4.4951e12, 0.0113, 1.77, 3000000.0,1000.0, 57996.0 },
        };

        private CelestialBody[] BuildSolarSystem()
        {
            var list = new System.Collections.Generic.List<CelestialBody>();
            var byName = new System.Collections.Generic.Dictionary<string, CelestialBody>();

            foreach (var row in SystemData)
            {
                var go = Instantiate(celestialBodyPrefab, transform);
                go.name = (string)row[0];
                var body = go.GetComponent<CelestialBody>();
                body.bodyName = (string)row[0];
                body.mass = (double)row[2];
                body.radius = (double)row[3];
                body.semiMajorAxis = (double)row[4];
                body.eccentricity = (double)row[5];
                body.inclinationDeg = (double)row[6];
                body.atmosphereHeight = (double)row[7];
                body.seaLevelPressure = (double)row[8];
                body.rotationPeriod = System.Math.Abs((double)row[9]);
                body.meanAnomalyAtEpochDeg = Hash01(body.bodyName) * 360.0; // spread bodies around their orbits

                string parentName = row[1] as string;
                if (parentName != null && byName.TryGetValue(parentName, out var parent))
                    body.parent = parent;

                byName[body.bodyName] = body;
                list.Add(body);
            }
            return list.ToArray();
        }

        private void PlaceShipInOrbit(CelestialBody[] bodies)
        {
            CelestialBody home = null;
            foreach (var b in bodies) if (b.bodyName == startOrbitBody) { home = b; break; }
            if (home == null || ship == null) return;

            double r = home.radius + startAltitude;
            double v = OrbitalMechanics.CircularOrbitSpeed(home.Mu, r);

            Vector3d pos = home.UniversePosition + new Vector3d(r, 0, 0);
            Vector3d vel = home.UniverseVelocity + new Vector3d(0, 0, v);
            ship.SetStateVectors(pos, vel);
            ship.SyncToUnityWorld();
        }

        private static float Hash01(string s)
        {
            unchecked
            {
                uint h = 2166136261;
                foreach (char c in s) { h ^= c; h *= 16777619; }
                return (h % 10000) / 10000f;
            }
        }
    }
}
