using UnityEngine;

namespace StellarOdyssey.Ship
{
    /// <summary>
    /// One landing leg: spring-damper suspension implemented with a raycast
    /// (stable at any mass, unlike stacked colliders), plus surface-aware dust
    /// kick-up when the engine plume or touchdown disturbs the ground.
    /// </summary>
    public sealed class LandingGear : MonoBehaviour
    {
        [Header("Suspension")]
        public float travel = 0.8f;             // m
        public float springStrength = 220000f;  // N/m
        public float damper = 30000f;           // N·s/m
        public Transform footMesh;              // visual foot, slides along travel

        [Header("Deploy")]
        public bool deployed = true;
        public float deploySeconds = 2.2f;

        [Header("Dust")]
        public ParticleSystem dustVFX;
        public Gradient[] dustColorBySurface;   // indexed by BiomeSettings.dustColorIndex

        private Rigidbody shipBody;
        private float deployT = 1f;

        private void Start() => shipBody = GetComponentInParent<Rigidbody>();

        private void FixedUpdate()
        {
            deployT = Mathf.MoveTowards(deployT, deployed ? 1f : 0f, Time.fixedDeltaTime / deploySeconds);
            if (deployT < 0.99f || shipBody == null) return;

            if (UnityEngine.Physics.Raycast(transform.position, -transform.up, out RaycastHit hit, travel))
            {
                float compression = 1f - hit.distance / travel;
                float springVel = Vector3.Dot(shipBody.GetPointVelocity(transform.position), transform.up);
                float force = compression * springStrength - springVel * damper;
                if (force > 0)
                    shipBody.AddForceAtPosition(transform.up * force, transform.position);

                if (footMesh != null)
                    footMesh.localPosition = new Vector3(0, -hit.distance + 0.05f, 0);

                EmitDust(hit, compression, springVel);
            }
            else if (footMesh != null)
            {
                footMesh.localPosition = new Vector3(0, -travel, 0);
            }
        }

        private void EmitDust(in RaycastHit hit, float compression, float verticalSpeed)
        {
            if (dustVFX == null) return;
            bool shouldEmit = compression > 0.15f && Mathf.Abs(verticalSpeed) > 0.4f;
            if (shouldEmit && !dustVFX.isEmitting)
            {
                dustVFX.transform.position = hit.point;
                var main = dustVFX.main;
                main.startColor = SampleSurfaceColor(hit);
                dustVFX.Play();
            }
            else if (!shouldEmit && dustVFX.isEmitting)
            {
                dustVFX.Stop();
            }
        }

        private Color SampleSurfaceColor(in RaycastHit hit)
        {
            // Biome id is packed into vertex color red channel by the terrain compute shader.
            var mc = hit.collider as MeshCollider;
            if (mc != null && mc.sharedMesh != null && mc.sharedMesh.colors.Length > 0)
            {
                var colors = mc.sharedMesh.colors;
                int v = mc.sharedMesh.triangles[hit.triangleIndex * 3];
                int biome = Mathf.RoundToInt(colors[v].r * 8f);
                if (dustColorBySurface != null && biome < dustColorBySurface.Length)
                    return dustColorBySurface[biome].Evaluate(0.5f);
            }
            return new Color(0.55f, 0.5f, 0.42f); // generic regolith
        }

        public void Toggle() => deployed = !deployed;
    }
}
