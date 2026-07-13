using UnityEngine;
using StellarOdyssey.Core;

namespace StellarOdyssey.Physics
{
    /// <summary>
    /// Drives the whole simulation clock:
    ///  - advances universal time (with KSP-style time warp),
    ///  - propagates every celestial body along its orbit ("on rails"),
    ///  - integrates the player ship in double precision, and mirrors the result
    ///    into the Unity Rigidbody used for local collisions/landing.
    ///
    /// Ship integration strategy (hybrid, like KSP):
    ///  - COASTING in vacuum  -> ship is converted to Kepler elements and propagated
    ///    analytically (zero drift, supports high time warp).
    ///  - THRUSTING or IN ATMOSPHERE -> RK4 numeric integration at physics rate.
    /// </summary>
    public sealed class GravitySimulation : MonoBehaviour
    {
        public static GravitySimulation Instance { get; private set; }

        [Header("Time")]
        public double universalTime;         // seconds since epoch
        public float timeWarp = 1f;          // 1x .. 100000x (rails only above ~4x)
        public float maxPhysicsWarp = 4f;

        [Header("Bodies")]
        public CelestialBody[] bodies;

        public CelestialBody ShipDominantBody { get; private set; }

        private Ship.ShipController ship;

        private void Awake() => Instance = this;

        private void Start()
        {
            if (bodies == null || bodies.Length == 0)
                bodies = FindObjectsOfType<CelestialBody>();
            ship = FindObjectOfType<Ship.ShipController>();
        }

        private void FixedUpdate()
        {
            double dt = Time.fixedDeltaTime * timeWarp;
            universalTime += dt;

            // 1. Planets & moons: analytic propagation, stable at any warp.
            foreach (var b in bodies) b.Propagate(universalTime);

            // 2. Player ship.
            if (ship == null) return;
            ShipDominantBody = OrbitalMechanics.DominantBody(bodies, ship.UniversePosition);

            bool needsNumericIntegration =
                ship.IsThrusting ||
                ship.IsLandedOrColliding ||
                InAtmosphere(ship) ||
                timeWarp <= maxPhysicsWarp;

            if (needsNumericIntegration && timeWarp <= maxPhysicsWarp)
                IntegrateShipNumerically(dt);
            else
                PropagateShipOnRails(dt);

            ship.SyncToUnityWorld();
        }

        private bool InAtmosphere(Ship.ShipController s)
        {
            var body = ShipDominantBody;
            if (body == null || body.atmosphereHeight <= 0) return false;
            double alt = Vector3d.Distance(s.UniversePosition, body.UniversePosition) - body.radius;
            return alt < body.atmosphereHeight;
        }

        private void IntegrateShipNumerically(double dt)
        {
            Vector3d pos = ship.UniversePosition;
            Vector3d vel = ship.UniverseVelocity;

            OrbitalMechanics.IntegrateRK4(ref pos, ref vel, dt, (p, v) =>
            {
                // Sum gravity of all bodies (full n-body for the ship: free Lagrange points!).
                Vector3d accel = new Vector3d(0, 0, 0);
                foreach (var b in bodies) accel += b.GravityAt(p);

                accel += ship.GetThrustAcceleration();
                accel += ComputeDrag(p, v);
                return accel;
            });

            ship.SetStateVectors(pos, vel);
            ship.InvalidateRails();
        }

        private Vector3d ComputeDrag(Vector3d pos, Vector3d vel)
        {
            var body = ShipDominantBody;
            if (body == null || body.atmosphereHeight <= 0) return new Vector3d(0, 0, 0);

            double altitude = Vector3d.Distance(pos, body.UniversePosition) - body.radius;
            double rho = body.AtmosphericDensity(altitude);
            if (rho <= 0) return new Vector3d(0, 0, 0);

            // Velocity relative to the rotating atmosphere.
            Vector3d bodyAngularVel = new Vector3d(0, 2.0 * System.Math.PI / body.rotationPeriod, 0);
            Vector3d atmVel = Vector3d.Cross(bodyAngularVel, pos - body.UniversePosition);
            Vector3d relVel = vel - body.UniverseVelocity - atmVel;

            double speed = relVel.magnitude;
            double dragAccelMag = 0.5 * rho * speed * speed * ship.dragCoefficient * ship.referenceArea / ship.TotalMass;
            return relVel.normalized * (-dragAccelMag);
        }

        private void PropagateShipOnRails(double dt)
        {
            var body = ShipDominantBody;
            if (body == null) return;

            ship.EnsureRails(body);
            ship.PropagateRails(universalTime);
        }

        /// <summary>UI hook: step warp 1, 2, 4, 10, 100, 1000, 10000, 100000.</summary>
        private static readonly float[] WarpLevels = { 1, 2, 4, 10, 100, 1000, 10000, 100000 };
        private int warpIndex;
        public void WarpUp() { warpIndex = Mathf.Min(warpIndex + 1, WarpLevels.Length - 1); timeWarp = WarpLevels[warpIndex]; }
        public void WarpDown() { warpIndex = Mathf.Max(warpIndex - 1, 0); timeWarp = WarpLevels[warpIndex]; }
    }
}
