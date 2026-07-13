using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using StellarOdyssey.Physics;
using StellarOdyssey.Core;

namespace StellarOdyssey.UI
{
    /// <summary>
    /// UI Toolkit HUD: navball-adjacent readouts (velocity, altitude, apoapsis/
    /// periapsis), resource bars, flight-state label, the Create Wormhole button
    /// and its target picker, plus wormhole tunnel overlay effects.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class HUDController : MonoBehaviour
    {
        public Ship.ShipController ship;
        public Wormhole.WormholeSystem wormholeSystem;
        public UnityEngine.Rendering.Volume wormholeOverlayVolume; // chromatic aberration + FOV punch profile

        private Label velocityLabel, altitudeLabel, apPeLabel, stateLabel, toastLabel;
        private ProgressBar fuelBar, oxygenBar, hullBar, warpBar;
        private VisualElement targetPicker;
        private float toastTimer;

        private void OnEnable()
        {
            var root = GetComponent<UIDocument>().rootVisualElement;

            velocityLabel = root.Q<Label>("velocity");
            altitudeLabel = root.Q<Label>("altitude");
            apPeLabel = root.Q<Label>("ap-pe");
            stateLabel = root.Q<Label>("flight-state");
            toastLabel = root.Q<Label>("toast");
            fuelBar = root.Q<ProgressBar>("fuel");
            oxygenBar = root.Q<ProgressBar>("oxygen");
            hullBar = root.Q<ProgressBar>("hull");
            warpBar = root.Q<ProgressBar>("warp-charge");
            targetPicker = root.Q<VisualElement>("target-picker");

            root.Q<Button>("create-wormhole").clicked += () => wormholeSystem.RequestWormhole();
            targetPicker.style.display = DisplayStyle.None;
        }

        private void Update()
        {
            if (ship == null) return;
            var body = GravitySimulation.Instance != null ? GravitySimulation.Instance.ShipDominantBody : null;

            double speed = body != null
                ? (ship.UniverseVelocity - body.UniverseVelocity).magnitude
                : ship.UniverseVelocity.magnitude;
            velocityLabel.text = speed > 10000 ? $"{speed / 1000:F1} km/s" : $"{speed:F0} m/s";

            if (body != null)
            {
                double alt = Vector3d.Distance(ship.UniversePosition, body.UniversePosition) - body.radius;
                altitudeLabel.text = alt > 100000 ? $"ALT {alt / 1000:F0} km" : $"ALT {alt:F0} m";

                var orbit = OrbitalMechanics.OrbitFromStateVectors(
                    body.Mu,
                    ship.UniversePosition - body.UniversePosition,
                    ship.UniverseVelocity - body.UniverseVelocity);
                apPeLabel.text = orbit.hyperbolic
                    ? "ESCAPE TRAJECTORY"
                    : $"AP {(orbit.apoapsis - body.radius) / 1000:F0} km   PE {(orbit.periapsis - body.radius) / 1000:F0} km";
            }

            if (ship.systems != null)
            {
                fuelBar.value = ship.systems.FuelFraction * 100f;
                oxygenBar.value = ship.systems.OxygenFraction * 100f;
                hullBar.value = ship.systems.hullIntegrity;
                warpBar.value = ship.systems.warpChargePercent;
            }

            if (toastTimer > 0f && (toastTimer -= Time.deltaTime) <= 0f)
                toastLabel.style.display = DisplayStyle.None;
        }

        public void SetFlightStateLabel(string label) => stateLabel.text = label.ToUpperInvariant();

        public void Toast(string message)
        {
            toastLabel.text = message;
            toastLabel.style.display = DisplayStyle.Flex;
            toastTimer = 3.5f;
        }

        // ------------------------------------------------- wormhole UI hooks --
        public void ShowTargetPicker(IReadOnlyList<CelestialBody> bodies, System.Action<CelestialBody> onChosen)
        {
            targetPicker.Clear();
            targetPicker.style.display = DisplayStyle.Flex;

            foreach (var body in bodies)
            {
                if (body.parent == null) continue; // skip the Sun as a landing target? no — allow stars later
                var b = new Button(() =>
                {
                    targetPicker.style.display = DisplayStyle.None;
                    onChosen(body);
                })
                { text = $"{body.bodyName}  ({Vector3d.Distance(body.UniversePosition, ship.UniversePosition) / 1e9:F2} Gm)" };
                b.AddToClassList("target-entry");
                targetPicker.Add(b);
            }

            var cancel = new Button(() => targetPicker.style.display = DisplayStyle.None) { text = "CANCEL" };
            cancel.AddToClassList("target-cancel");
            targetPicker.Add(cancel);
        }

        public void EnterWormholeOverlay() { if (wormholeOverlayVolume != null) wormholeOverlayVolume.weight = 1f; }
        public void ExitWormholeOverlay() { if (wormholeOverlayVolume != null) wormholeOverlayVolume.weight = 0f; }
    }
}
