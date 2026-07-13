using UnityEngine;
using StellarOdyssey.Core;
using StellarOdyssey.Physics;

namespace StellarOdyssey.Transitions
{
    /// <summary>
    /// Cinematic re-entry: drives plasma VFX, heat glow, camera shake, sky tint
    /// and audio from the physically-computed heating rate. Everything scales
    /// with real dynamic pressure and speed — a shallow aerobrake glows gently,
    /// a steep ballistic entry becomes a fireball.
    /// </summary>
    public sealed class AtmosphereEntry : MonoBehaviour
    {
        [Header("Refs")]
        public Ship.ShipController ship;
        public ParticleSystem plasmaTrail;          // VFX Graph: ionised sheath streaks
        public ParticleSystem shockwaveRing;
        public Material hullMaterial;               // emission driven by heat
        public Light plasmaLight;
        public Camera.CameraRig cameraRig;
        public AudioSource rumbleAudio;

        [Header("Tuning")]
        public double heatingOnsetSpeed = 1200.0;   // m/s — below this, no plasma
        public float maxShake = 1.2f;
        public Color plasmaColorCool = new Color(1f, 0.45f, 0.1f);
        public Color plasmaColorHot = new Color(0.7f, 0.85f, 1f);

        /// <summary>0..1 heating intensity, exposed for HUD warnings and hull damage.</summary>
        public float HeatIntensity { get; private set; }

        private static readonly int EmissionColorId = Shader.PropertyToID("_EmissiveColor");

        private void Update()
        {
            var body = GravitySimulation.Instance != null ? GravitySimulation.Instance.ShipDominantBody : null;
            if (body == null || body.atmosphereHeight <= 0) { SetIntensity(0f); return; }

            double altitude = Vector3d.Distance(ship.UniversePosition, body.UniversePosition) - body.radius;
            double rho = body.AtmosphericDensity(altitude);
            double speed = (ship.UniverseVelocity - body.UniverseVelocity).magnitude;

            if (rho <= 0 || speed < heatingOnsetSpeed) { SetIntensity(0f); return; }

            // Convective heating ~ rho^0.5 * v^3 (Sutton-Graves). Normalised to 0..1.
            double q = System.Math.Sqrt(rho) * System.Math.Pow(speed, 3.0);
            float intensity = Mathf.Clamp01((float)(q / 2.5e10));
            SetIntensity(intensity);

            if (intensity > 0.02f)
            {
                // Plasma trails stream opposite the airflow.
                Vector3 flow = (Vector3)((ship.UniverseVelocity - body.UniverseVelocity).normalized);
                plasmaTrail.transform.rotation = Quaternion.LookRotation(-flow);

                // Hull damage on sustained extreme heating.
                if (intensity > 0.85f && ship.systems != null)
                    ship.systems.ApplyHullDamage(intensity * 4f * Time.deltaTime);
            }
        }

        private void SetIntensity(float intensity)
        {
            HeatIntensity = intensity;

            // VFX emission.
            var emission = plasmaTrail.emission;
            emission.rateOverTimeMultiplier = intensity * 600f;
            if (intensity > 0.02f && !plasmaTrail.isPlaying) { plasmaTrail.Play(); shockwaveRing.Play(); }
            else if (intensity <= 0.02f && plasmaTrail.isPlaying) { plasmaTrail.Stop(); shockwaveRing.Stop(); }

            // Hull glow: black-body ramp from orange to blue-white.
            Color glow = Color.Lerp(plasmaColorCool, plasmaColorHot, intensity);
            if (hullMaterial != null)
                hullMaterial.SetColor(EmissionColorId, glow * intensity * 80000f); // HDRP nits

            if (plasmaLight != null)
            {
                plasmaLight.color = glow;
                plasmaLight.intensity = intensity * 500000f;
            }

            // Camera shake + rumble scale with turbulence.
            if (cameraRig != null) cameraRig.SetShake(intensity * maxShake);
            if (rumbleAudio != null)
            {
                rumbleAudio.volume = intensity;
                rumbleAudio.pitch = 0.7f + intensity * 0.6f;
                if (intensity > 0.02f && !rumbleAudio.isPlaying) rumbleAudio.Play();
                else if (intensity <= 0.02f && rumbleAudio.isPlaying) rumbleAudio.Stop();
            }
        }
    }
}
