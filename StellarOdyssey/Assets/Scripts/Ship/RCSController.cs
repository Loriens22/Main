using UnityEngine;

namespace StellarOdyssey.Ship
{
    /// <summary>
    /// Fires the correct RCS thruster VFX for a requested rotation/translation.
    /// Each thruster is a small ParticleSystem + point light placed on the hull;
    /// its <see cref="RCSThruster.thrustDirection"/> is the direction it PUSHES
    /// the ship (opposite its exhaust plume).
    /// </summary>
    public sealed class RCSController : MonoBehaviour
    {
        [System.Serializable]
        public struct RCSThruster
        {
            public ParticleSystem vfx;
            public Light light;
            public Vector3 localPosition;       // for torque computation
            public Vector3 thrustDirection;     // local space, normalized
        }

        public RCSThruster[] thrusters;
        [Range(0.05f, 0.5f)] public float fireThreshold = 0.15f;

        public void VisualiseRotation(Vector3 controlInput, Vector3 angularVelocity)
        {
            // Torque a thruster produces: r × F (local space).
            Vector3 desiredTorque = new Vector3(controlInput.x, controlInput.y, -controlInput.z);
            foreach (var t in thrusters)
            {
                Vector3 torque = Vector3.Cross(t.localPosition, t.thrustDirection);
                float alignment = Vector3.Dot(torque.normalized, desiredTorque.normalized) * desiredTorque.magnitude;
                SetThruster(t, alignment > fireThreshold);
            }
        }

        public void VisualiseTranslation(Vector3 translationInput)
        {
            foreach (var t in thrusters)
            {
                float alignment = Vector3.Dot(t.thrustDirection, translationInput.normalized) * translationInput.magnitude;
                if (alignment > fireThreshold) SetThruster(t, true);
            }
        }

        private void SetThruster(in RCSThruster t, bool firing)
        {
            if (t.vfx != null)
            {
                if (firing && !t.vfx.isEmitting) t.vfx.Play();
                else if (!firing && t.vfx.isEmitting) t.vfx.Stop();
            }
            if (t.light != null) t.light.enabled = firing;
        }
    }
}
