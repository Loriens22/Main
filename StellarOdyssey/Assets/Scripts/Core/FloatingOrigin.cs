using System.Collections.Generic;
using UnityEngine;

namespace StellarOdyssey.Core
{
    /// <summary>
    /// Floating-origin system. Single-precision floats break down beyond ~10 km
    /// from the world origin (jittering meshes, physics explosions), so whenever
    /// the player drifts past <see cref="rebaseThreshold"/> we shift the ENTIRE
    /// world back so the player sits near (0,0,0) again.
    ///
    /// All absolute positions (planet orbits, ship state vectors) are stored in
    /// double precision inside <see cref="UniversePosition"/>; Unity transforms
    /// only ever hold the small local offset from the current universe origin.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public sealed class FloatingOrigin : MonoBehaviour
    {
        public static FloatingOrigin Instance { get; private set; }

        [Tooltip("Distance from origin (metres) that triggers a rebase. Keep well below 32-bit float precision limits.")]
        [SerializeField] private float rebaseThreshold = 6000f;

        [Tooltip("Transform tracked for rebasing (the player ship or camera rig).")]
        [SerializeField] private Transform focus;

        /// <summary>Absolute universe-space position (double precision, metres) of Unity's world origin.</summary>
        public Vector3d OriginUniversePosition { get; private set; }

        /// <summary>Raised after every rebase with the applied offset, so systems with cached world positions can fix themselves up.</summary>
        public event System.Action<Vector3> OnOriginShifted;

        private readonly List<IFloatingOriginClient> clients = new List<IFloatingOriginClient>();
        private readonly List<ParticleSystem> trackedParticles = new List<ParticleSystem>();

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
        }

        public void SetFocus(Transform t) => focus = t;
        public void Register(IFloatingOriginClient client) { if (!clients.Contains(client)) clients.Add(client); }
        public void Unregister(IFloatingOriginClient client) => clients.Remove(client);
        public void TrackParticles(ParticleSystem ps) { if (!trackedParticles.Contains(ps)) trackedParticles.Add(ps); }

        /// <summary>Universe-space position of a Unity transform.</summary>
        public Vector3d WorldToUniverse(Vector3 worldPos) => OriginUniversePosition + new Vector3d(worldPos);

        /// <summary>Unity world position of a universe-space point (only valid while it is within float range).</summary>
        public Vector3 UniverseToWorld(Vector3d universePos) => (Vector3)(universePos - OriginUniversePosition);

        private void LateUpdate()
        {
            if (focus == null) return;

            Vector3 p = focus.position;
            if (p.sqrMagnitude < rebaseThreshold * rebaseThreshold) return;

            Rebase(p);
        }

        private void Rebase(Vector3 offset)
        {
            OriginUniversePosition += new Vector3d(offset);

            // Shift every root object back by the offset.
            var scene = gameObject.scene;
            var roots = scene.GetRootGameObjects();
            foreach (var root in roots)
                root.transform.position -= offset;

            // Particle systems simulate in world space and must be shifted manually.
            foreach (var ps in trackedParticles)
            {
                if (ps == null) continue;
                var particles = new ParticleSystem.Particle[ps.particleCount];
                int count = ps.GetParticles(particles);
                for (int i = 0; i < count; i++) particles[i].position -= offset;
                ps.SetParticles(particles, count);
            }

            foreach (var c in clients) c.OnOriginShift(offset);
            OnOriginShifted?.Invoke(offset);

            UnityEngine.Physics.SyncTransforms();
        }
    }

    /// <summary>Implemented by systems that cache world-space positions (trajectory renderers, ocean sim, etc.).</summary>
    public interface IFloatingOriginClient
    {
        void OnOriginShift(Vector3 offset);
    }

    /// <summary>Minimal double-precision vector for universe-space bookkeeping.</summary>
    [System.Serializable]
    public struct Vector3d
    {
        public double x, y, z;

        public Vector3d(double x, double y, double z) { this.x = x; this.y = y; this.z = z; }
        public Vector3d(Vector3 v) { x = v.x; y = v.y; z = v.z; }

        public double magnitude => System.Math.Sqrt(x * x + y * y + z * z);
        public double sqrMagnitude => x * x + y * y + z * z;
        public Vector3d normalized { get { double m = magnitude; return m > 1e-12 ? this / m : new Vector3d(0, 0, 0); } }

        public static Vector3d operator +(Vector3d a, Vector3d b) => new Vector3d(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3d operator -(Vector3d a, Vector3d b) => new Vector3d(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3d operator *(Vector3d a, double s) => new Vector3d(a.x * s, a.y * s, a.z * s);
        public static Vector3d operator /(Vector3d a, double s) => new Vector3d(a.x / s, a.y / s, a.z / s);
        public static explicit operator Vector3(Vector3d v) => new Vector3((float)v.x, (float)v.y, (float)v.z);

        public static double Dot(Vector3d a, Vector3d b) => a.x * b.x + a.y * b.y + a.z * b.z;
        public static Vector3d Cross(Vector3d a, Vector3d b) =>
            new Vector3d(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
        public static double Distance(Vector3d a, Vector3d b) => (a - b).magnitude;
    }
}
