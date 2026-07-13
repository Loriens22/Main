using UnityEngine;
using StellarOdyssey.Core;
using StellarOdyssey.Physics;

namespace StellarOdyssey.Ship
{
    /// <summary>
    /// Player vessel. Double-precision state vectors live here (universe space);
    /// the Unity Rigidbody is only used for local-scale contact physics (landing,
    /// collisions) and is kept in sync by <see cref="GravitySimulation"/>.
    ///
    /// Two flight regimes, blended automatically by dynamic pressure:
    ///  SPACE MODE       — torque from RCS, translation from main engine + RCS,
    ///                     pure Newtonian; SAS-style rotation damping.
    ///  ATMOSPHERIC MODE — adds lift/drag from control surfaces, control authority
    ///                     scales with dynamic pressure, flight-assist keeps the
    ///                     nose aligned with velocity if enabled.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public sealed class ShipController : MonoBehaviour
    {
        [Header("Mass & geometry")]
        public double dryMass = 12000;          // kg
        public double dragCoefficient = 0.35;
        public double referenceArea = 24;       // m^2
        public double liftCoefficient = 0.9;

        [Header("Main propulsion")]
        public double maxThrust = 450000;       // N (vacuum)
        public double specificImpulse = 380;    // s
        [Range(0f, 1f)] public float throttle;

        [Header("RCS")]
        public double rcsThrust = 4000;         // N per axis
        public float rcsTorque = 25000f;        // N·m
        public RCSController rcs;

        [Header("Systems")]
        public ShipSystems systems;
        public LandingGear[] landingGear;

        [Header("FX")]
        public ParticleSystem[] mainEngineVFX;
        public Light[] engineLights;

        // Double-precision state (universe space).
        public Vector3d UniversePosition { get; private set; }
        public Vector3d UniverseVelocity { get; private set; }
        public double TotalMass => dryMass + (systems != null ? systems.fuelKg : 0);

        public bool IsThrusting => throttle > 0.001f && systems != null && systems.fuelKg > 0;
        public bool IsLandedOrColliding { get; private set; }
        public bool FlightAssist { get; set; } = true;

        // Rails (coasting orbit) cache.
        private bool railsValid;
        private OrbitalMechanics.Orbit railsOrbit;
        private CelestialBody railsBody;
        private double railsEpoch;
        private Vector3d railsPosAtEpoch, railsVelAtEpoch;

        private Rigidbody rb;
        private Vector3 controlInput;   // pitch, yaw, roll (-1..1)
        private Vector3 translationInput;

        private void Awake()
        {
            rb = GetComponent<Rigidbody>();
            rb.useGravity = false;
            rb.mass = (float)System.Math.Min(TotalMass, 100000); // PhysX-friendly clamp
            rb.interpolation = RigidbodyInterpolation.Interpolate;
        }

        private void Start()
        {
            UniversePosition = FloatingOrigin.Instance.WorldToUniverse(transform.position);
            FloatingOrigin.Instance.SetFocus(transform);
        }

        // ------------------------------------------------------------ input --
        public void SetRotationInput(float pitch, float yaw, float roll) => controlInput = new Vector3(pitch, yaw, roll);
        public void SetTranslationInput(Vector3 rcsAxes) => translationInput = rcsAxes;
        public void SetThrottle(float value) => throttle = Mathf.Clamp01(value);

        // ------------------------------------------------- state management --
        public void SetStateVectors(Vector3d pos, Vector3d vel)
        {
            UniversePosition = pos;
            UniverseVelocity = vel;
        }

        public void SyncToUnityWorld()
        {
            Vector3 world = FloatingOrigin.Instance.UniverseToWorld(UniversePosition);
            // While in ground contact, trust PhysX (suspension, collisions) and
            // read back; otherwise drive the transform from the double-precision sim.
            if (IsLandedOrColliding)
            {
                UniversePosition = FloatingOrigin.Instance.WorldToUniverse(rb.position);
                UniverseVelocity = new Vector3d(rb.velocity) + ReferenceFrameVelocity();
            }
            else
            {
                rb.MovePosition(world);
                rb.velocity = (Vector3)(UniverseVelocity - ReferenceFrameVelocity());
            }
        }

        /// <summary>Velocity of the local reference frame (dominant body surface frame when landed).</summary>
        private Vector3d ReferenceFrameVelocity()
        {
            var body = GravitySimulation.Instance != null ? GravitySimulation.Instance.ShipDominantBody : null;
            return body != null ? body.UniverseVelocity : new Vector3d(0, 0, 0);
        }

        public Vector3d GetThrustAcceleration()
        {
            if (!IsThrusting) return new Vector3d(0, 0, 0);
            double thrust = maxThrust * throttle;
            Vector3d dir = new Vector3d(transform.forward);
            return dir * (thrust / TotalMass);
        }

        // ------------------------------------------------------------ rails --
        public void InvalidateRails() => railsValid = false;

        public void EnsureRails(CelestialBody body)
        {
            if (railsValid && railsBody == body) return;
            railsBody = body;
            railsEpoch = GravitySimulation.Instance.universalTime;
            railsPosAtEpoch = UniversePosition - body.UniversePosition;
            railsVelAtEpoch = UniverseVelocity - body.UniverseVelocity;
            railsOrbit = OrbitalMechanics.OrbitFromStateVectors(body.Mu, railsPosAtEpoch, railsVelAtEpoch);
            railsValid = true;
        }

        public void PropagateRails(double universalTime)
        {
            if (!railsValid || railsOrbit.hyperbolic)
            {
                // Hyperbolic rails propagation omitted for brevity — fall back to RK4.
                return;
            }
            double meanMotion = 2.0 * System.Math.PI / railsOrbit.period;
            double m0 = MeanAnomalyFromState(railsOrbit, railsPosAtEpoch, railsVelAtEpoch);
            OrbitalMechanics.KeplerToStateVectors(
                railsBody.Mu, railsOrbit.semiMajorAxis, railsOrbit.eccentricity,
                railsOrbit.inclination, railsOrbit.lan, railsOrbit.argPe,
                m0, universalTime - railsEpoch,
                out Vector3d rel, out Vector3d relVel);
            UniversePosition = railsBody.UniversePosition + rel;
            UniverseVelocity = railsBody.UniverseVelocity + relVel;
        }

        private static double MeanAnomalyFromState(OrbitalMechanics.Orbit o, Vector3d r, Vector3d v)
        {
            double E = 2.0 * System.Math.Atan(System.Math.Tan(o.trueAnomaly / 2.0)
                     * System.Math.Sqrt((1 - o.eccentricity) / (1 + o.eccentricity)));
            return E - o.eccentricity * System.Math.Sin(E);
        }

        // -------------------------------------------------------- attitude ---
        private void FixedUpdate()
        {
            var body = GravitySimulation.Instance != null ? GravitySimulation.Instance.ShipDominantBody : null;

            double dynamicPressure = 0;
            if (body != null && body.atmosphereHeight > 0)
            {
                double alt = Vector3d.Distance(UniversePosition, body.UniversePosition) - body.radius;
                double rho = body.AtmosphericDensity(alt);
                double speed = (UniverseVelocity - body.UniverseVelocity).magnitude;
                dynamicPressure = 0.5 * rho * speed * speed;
            }

            ApplyRotation(dynamicPressure);
            ApplyRCSTranslation();
            UpdateVFX();
            ConsumeFuel();
        }

        private void ApplyRotation(double q)
        {
            // RCS torque everywhere + aero control surfaces that gain authority with q.
            float aeroAuthority = Mathf.Clamp01((float)(q / 5000.0)) * 3f;
            float totalTorque = rcsTorque * (1f + aeroAuthority);

            Vector3 torque =
                transform.right * (controlInput.x * totalTorque) +
                transform.up * (controlInput.y * totalTorque) +
                transform.forward * (-controlInput.z * totalTorque);
            rb.AddTorque(torque);

            // SAS: damp residual angular velocity when there's no input.
            if (FlightAssist && controlInput.sqrMagnitude < 0.01f)
                rb.AddTorque(-rb.angularVelocity * rcsTorque * 0.15f);

            rcs?.VisualiseRotation(controlInput, rb.angularVelocity);
        }

        private void ApplyRCSTranslation()
        {
            if (translationInput.sqrMagnitude < 0.001f) return;
            Vector3d accel = (new Vector3d(transform.TransformDirection(translationInput)))
                             * (rcsThrust / TotalMass);
            UniverseVelocity += accel * Time.fixedDeltaTime;
            InvalidateRails();
            rcs?.VisualiseTranslation(translationInput);
        }

        private void UpdateVFX()
        {
            float power = IsThrusting ? throttle : 0f;
            foreach (var ps in mainEngineVFX)
            {
                var emission = ps.emission;
                emission.rateOverTimeMultiplier = power * 400f;
                if (power > 0 && !ps.isPlaying) ps.Play();
                else if (power <= 0 && ps.isPlaying) ps.Stop();
            }
            foreach (var l in engineLights)
                l.intensity = Mathf.Lerp(l.intensity, power * 60000f, Time.fixedDeltaTime * 8f); // HDRP lumen-scale
        }

        private void ConsumeFuel()
        {
            if (!IsThrusting || systems == null) return;
            // mdot = F / (Isp * g0)
            double mdot = maxThrust * throttle / (specificImpulse * 9.80665);
            systems.ConsumeFuel(mdot * Time.fixedDeltaTime);
            InvalidateRails();
        }

        // ---------------------------------------------------------- contact --
        private void OnCollisionStay(Collision c)
        {
            IsLandedOrColliding = true;
            float impact = c.relativeVelocity.magnitude;
            if (impact > 6f && systems != null)
                systems.ApplyHullDamage(impact * 1.5f);
        }

        private void OnCollisionExit(Collision c) => IsLandedOrColliding = false;
    }
}
