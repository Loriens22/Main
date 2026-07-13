using UnityEngine;

namespace StellarOdyssey.Ship
{
    /// <summary>Fuel, oxygen and hull integrity — the survival loop's resource layer.</summary>
    public sealed class ShipSystems : MonoBehaviour
    {
        [Header("Fuel")]
        public double fuelCapacityKg = 18000;
        public double fuelKg = 18000;

        [Header("Life support")]
        public float oxygenCapacityHours = 48f;
        public float oxygenHours = 48f;
        public float crewCount = 1f;

        [Header("Hull")]
        public float hullIntegrity = 100f;

        [Header("Warp")]
        public float warpChargePercent;         // 0..100, consumed by wormhole jumps
        public float warpChargeRatePerSecond = 4f;

        public event System.Action OnHullBreach;
        public event System.Action OnOxygenDepleted;

        public float FuelFraction => (float)(fuelKg / fuelCapacityKg);
        public float OxygenFraction => oxygenHours / oxygenCapacityHours;

        private void Update()
        {
            oxygenHours -= Time.deltaTime / 3600f * crewCount;
            if (oxygenHours <= 0f) { oxygenHours = 0f; OnOxygenDepleted?.Invoke(); }

            warpChargePercent = Mathf.Min(100f, warpChargePercent + warpChargeRatePerSecond * Time.deltaTime);
        }

        public void ConsumeFuel(double kg) => fuelKg = System.Math.Max(0, fuelKg - kg);

        public void ApplyHullDamage(float amount)
        {
            hullIntegrity = Mathf.Max(0f, hullIntegrity - amount);
            if (hullIntegrity <= 0f) OnHullBreach?.Invoke();
        }

        public bool TryConsumeWarpCharge(float percent)
        {
            if (warpChargePercent < percent) return false;
            warpChargePercent -= percent;
            return true;
        }

        public void Refuel(double kg) => fuelKg = System.Math.Min(fuelCapacityKg, fuelKg + kg);
        public void RefillOxygen() => oxygenHours = oxygenCapacityHours;
        public void RepairHull(float amount) => hullIntegrity = Mathf.Min(100f, hullIntegrity + amount);
    }
}
