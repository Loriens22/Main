using UnityEngine;

namespace StellarOdyssey.Camera
{
    /// <summary>
    /// First-person cockpit / third-person chase camera with smoothing,
    /// turbulence shake and speed-based FOV. Cockpit mode parents the camera
    /// to the interior seat anchor so instruments stay pixel-stable.
    /// </summary>
    public sealed class CameraRig : MonoBehaviour
    {
        public enum Mode { Cockpit, Chase }

        [Header("Anchors")]
        public Transform cockpitAnchor;      // inside the detailed cockpit
        public Transform chaseAnchor;        // behind & above the hull
        public Transform ship;

        [Header("Feel")]
        public float positionSmoothing = 6f;
        public float rotationSmoothing = 5f;
        public float baseFov = 65f;
        public float maxFovBoost = 18f;      // widened at high speed for sensation of velocity
        public float fovSpeedScale = 2500f;  // m/s at which boost saturates

        public Mode CurrentMode { get; private set; } = Mode.Cockpit;

        private UnityEngine.Camera cam;
        private float shakeAmplitude;
        private Vector3 shakeOffset;

        private void Awake() => cam = GetComponent<UnityEngine.Camera>();

        public void ToggleMode() =>
            CurrentMode = CurrentMode == Mode.Cockpit ? Mode.Chase : Mode.Cockpit;

        public void SetShake(float amplitude) => shakeAmplitude = amplitude;

        private void LateUpdate()
        {
            Transform anchor = CurrentMode == Mode.Cockpit ? cockpitAnchor : chaseAnchor;
            if (anchor == null) return;

            // Cockpit locks hard (no swimming instruments); chase lags for weight.
            if (CurrentMode == Mode.Cockpit)
            {
                transform.SetPositionAndRotation(anchor.position, anchor.rotation);
            }
            else
            {
                transform.position = Vector3.Lerp(transform.position, anchor.position, positionSmoothing * Time.deltaTime);
                transform.rotation = Quaternion.Slerp(transform.rotation, anchor.rotation, rotationSmoothing * Time.deltaTime);
            }

            // Perlin shake (smooth, no teleporting pixels).
            if (shakeAmplitude > 0.001f)
            {
                float t = Time.time * 25f;
                shakeOffset = new Vector3(
                    (Mathf.PerlinNoise(t, 0f) - 0.5f),
                    (Mathf.PerlinNoise(0f, t) - 0.5f),
                    (Mathf.PerlinNoise(t, t) - 0.5f)) * shakeAmplitude * 0.35f;
                transform.position += transform.TransformDirection(shakeOffset);
                transform.rotation *= Quaternion.Euler(shakeOffset * 4f);
            }

            // Speed FOV.
            var shipCtrl = ship != null ? ship.GetComponent<Ship.ShipController>() : null;
            if (shipCtrl != null && cam != null)
            {
                float speed = (float)shipCtrl.UniverseVelocity.magnitude;
                float target = baseFov + Mathf.Clamp01(speed / fovSpeedScale) * maxFovBoost;
                cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, target, 2f * Time.deltaTime);
            }
        }
    }
}
