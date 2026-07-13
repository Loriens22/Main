using System;
using StellarOdyssey.Core;

namespace StellarOdyssey.Physics
{
    /// <summary>
    /// Kerbal-style orbital mechanics toolbox:
    ///  - Kepler element &lt;-&gt; state-vector conversion (planets on rails)
    ///  - Kepler's equation solver (Newton-Raphson)
    ///  - Orbit determination from a state vector (for the ship's map-view orbit line)
    ///  - Symplectic (semi-implicit Euler) + RK4 integrators for the ship when
    ///    thrusting or inside an atmosphere.
    /// All math is double precision; conversion to floats happens only at render time.
    /// </summary>
    public static class OrbitalMechanics
    {
        /// <summary>Solve Kepler's equation M = E - e*sin(E) for eccentric anomaly E.</summary>
        public static double SolveKepler(double meanAnomaly, double eccentricity, int iterations = 12)
        {
            double M = meanAnomaly % (2.0 * Math.PI);
            double E = eccentricity < 0.8 ? M : Math.PI;
            for (int i = 0; i < iterations; i++)
            {
                double f = E - eccentricity * Math.Sin(E) - M;
                double fPrime = 1.0 - eccentricity * Math.Cos(E);
                E -= f / fPrime;
            }
            return E;
        }

        /// <summary>Convert Keplerian elements at time t to position/velocity relative to the parent body.</summary>
        public static void KeplerToStateVectors(
            double mu, double a, double e, double inc, double lan, double argPe, double m0,
            double time, out Vector3d position, out Vector3d velocity)
        {
            double n = Math.Sqrt(mu / (a * a * a));      // mean motion, rad/s
            double M = m0 + n * time;                    // mean anomaly at t
            double E = SolveKepler(M, e);

            // True anomaly and radius.
            double nu = 2.0 * Math.Atan2(Math.Sqrt(1 + e) * Math.Sin(E / 2), Math.Sqrt(1 - e) * Math.Cos(E / 2));
            double r = a * (1 - e * Math.Cos(E));

            // Perifocal frame.
            double xP = r * Math.Cos(nu);
            double yP = r * Math.Sin(nu);
            double h = Math.Sqrt(mu * a * (1 - e * e));  // specific angular momentum
            double vxP = -mu / h * Math.Sin(nu);
            double vyP = mu / h * (e + Math.Cos(nu));

            // Rotate perifocal -> inertial (Z-up celestial frame mapped to Unity Y-up: x, z horizontal, y vertical).
            double cosO = Math.Cos(lan), sinO = Math.Sin(lan);
            double cosI = Math.Cos(inc), sinI = Math.Sin(inc);
            double cosW = Math.Cos(argPe), sinW = Math.Sin(argPe);

            double r11 = cosO * cosW - sinO * sinW * cosI, r12 = -cosO * sinW - sinO * cosW * cosI;
            double r21 = sinO * cosW + cosO * sinW * cosI, r22 = -sinO * sinW + cosO * cosW * cosI;
            double r31 = sinW * sinI, r32 = cosW * sinI;

            position = new Vector3d(
                r11 * xP + r12 * yP,
                r31 * xP + r32 * yP,   // inclination lifts orbit out of the ecliptic (Unity Y)
                r21 * xP + r22 * yP);

            velocity = new Vector3d(
                r11 * vxP + r12 * vyP,
                r31 * vxP + r32 * vyP,
                r21 * vxP + r22 * vyP);
        }

        /// <summary>Osculating orbital elements computed from a state vector (ship map view, SOI predictions).</summary>
        public struct Orbit
        {
            public double semiMajorAxis, eccentricity, inclination, lan, argPe, trueAnomaly;
            public double apoapsis, periapsis, period;
            public bool hyperbolic;
        }

        public static Orbit OrbitFromStateVectors(double mu, Vector3d r, Vector3d v)
        {
            var orbit = new Orbit();
            double rMag = r.magnitude;
            double vMag2 = v.sqrMagnitude;

            Vector3d h = Vector3d.Cross(r, v);
            Vector3d eVec = Vector3d.Cross(v, h) / mu - r / rMag;
            orbit.eccentricity = eVec.magnitude;

            double energy = vMag2 / 2.0 - mu / rMag;
            orbit.semiMajorAxis = -mu / (2.0 * energy);
            orbit.hyperbolic = orbit.eccentricity >= 1.0;

            orbit.apoapsis = orbit.hyperbolic ? double.PositiveInfinity : orbit.semiMajorAxis * (1 + orbit.eccentricity);
            orbit.periapsis = orbit.semiMajorAxis * (1 - orbit.eccentricity);
            orbit.period = orbit.hyperbolic ? double.PositiveInfinity
                : 2.0 * Math.PI * Math.Sqrt(Math.Pow(orbit.semiMajorAxis, 3) / mu);

            orbit.inclination = Math.Acos(Math.Clamp(h.y / h.magnitude, -1.0, 1.0));

            Vector3d n = Vector3d.Cross(new Vector3d(0, 1, 0), h);
            orbit.lan = n.magnitude < 1e-9 ? 0 : Math.Acos(Math.Clamp(n.x / n.magnitude, -1.0, 1.0));
            if (n.z < 0) orbit.lan = 2.0 * Math.PI - orbit.lan;

            if (orbit.eccentricity > 1e-9 && n.magnitude > 1e-9)
            {
                orbit.argPe = Math.Acos(Math.Clamp(Vector3d.Dot(n, eVec) / (n.magnitude * orbit.eccentricity), -1.0, 1.0));
                if (eVec.y < 0) orbit.argPe = 2.0 * Math.PI - orbit.argPe;
            }

            orbit.trueAnomaly = Math.Acos(Math.Clamp(Vector3d.Dot(eVec, r) / (orbit.eccentricity * rMag), -1.0, 1.0));
            if (Vector3d.Dot(r, v) < 0) orbit.trueAnomaly = 2.0 * Math.PI - orbit.trueAnomaly;

            return orbit;
        }

        /// <summary>
        /// RK4 step for the ship under gravity + thrust + drag. Used while the ship
        /// is under acceleration; when coasting we convert to Kepler elements and
        /// put the ship on rails (cheap and drift-free, exactly like KSP).
        /// </summary>
        public static void IntegrateRK4(
            ref Vector3d position, ref Vector3d velocity, double dt,
            Func<Vector3d, Vector3d, Vector3d> acceleration)
        {
            Vector3d p0 = position, v0 = velocity;

            Vector3d a1 = acceleration(p0, v0);
            Vector3d v1 = v0;

            Vector3d a2 = acceleration(p0 + v1 * (dt / 2), v0 + a1 * (dt / 2));
            Vector3d v2 = v0 + a1 * (dt / 2);

            Vector3d a3 = acceleration(p0 + v2 * (dt / 2), v0 + a2 * (dt / 2));
            Vector3d v3 = v0 + a2 * (dt / 2);

            Vector3d a4 = acceleration(p0 + v3 * dt, v0 + a3 * dt);
            Vector3d v4 = v0 + a3 * dt;

            position = p0 + (v1 + v2 * 2 + v3 * 2 + v4) * (dt / 6.0);
            velocity = v0 + (a1 + a2 * 2 + a3 * 2 + a4) * (dt / 6.0);
        }

        /// <summary>Which body's sphere of influence contains this point? (Patched conics.)</summary>
        public static CelestialBody DominantBody(CelestialBody[] bodies, Vector3d point)
        {
            CelestialBody best = null;
            double bestSoi = double.PositiveInfinity;
            foreach (var b in bodies)
            {
                double d = Vector3d.Distance(b.UniversePosition, point);
                double soi = b.SphereOfInfluence;
                if (d < soi && soi < bestSoi) { best = b; bestSoi = soi; }
            }
            return best;
        }

        /// <summary>Circular orbital velocity at radius r around a body.</summary>
        public static double CircularOrbitSpeed(double mu, double r) => Math.Sqrt(mu / r);

        /// <summary>Escape velocity at radius r.</summary>
        public static double EscapeSpeed(double mu, double r) => Math.Sqrt(2.0 * mu / r);
    }
}
