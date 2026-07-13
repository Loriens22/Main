using UnityEngine;

namespace StellarOdyssey.Core
{
    /// <summary>
    /// Kerbal-style dual-scale rendering. A true-scale solar system cannot be
    /// rendered directly (Neptune is 4.5e12 m from the Sun), so we keep two
    /// representations in sync:
    ///
    ///  LOCAL SPACE  (1 unit = 1 m)  — everything within <see cref="localBubbleRadius"/>
    ///     of the player: the ship, nearby terrain patches, physics colliders.
    ///  SCALED SPACE (1 unit = <see cref="scaledSpaceFactor"/> m) — distant planets,
    ///     rendered by a second camera that draws first (depth-cleared under the
    ///     local camera), giving the illusion of a full-size solar system.
    ///
    /// A body migrates from scaled space to local space as the player approaches
    /// (the "sphere of loading"), at which point its ProceduralPlanet quadtree
    /// starts streaming real terrain.
    /// </summary>
    public sealed class ScaleSpaceManager : MonoBehaviour
    {
        public static ScaleSpaceManager Instance { get; private set; }

        [Tooltip("1 scaled-space unit equals this many metres.")]
        public double scaledSpaceFactor = 100000.0; // 1 unit = 100 km

        [Tooltip("Bodies closer than this (metres) to the player are promoted to local space.")]
        public double localBubbleRadius = 500000.0; // 500 km

        [Header("Cameras")]
        public UnityEngine.Camera localCamera;   // near 0.1 m, far ~100 km
        public UnityEngine.Camera scaledCamera;  // renders scaled-space layer, drawn first

        private Physics.CelestialBody[] bodies;

        private void Awake()
        {
            Instance = this;
        }

        private void Start()
        {
            bodies = FindObjectsOfType<Physics.CelestialBody>();
        }

        private void LateUpdate()
        {
            if (FloatingOrigin.Instance == null) return;
            Vector3d playerUniverse = FloatingOrigin.Instance.WorldToUniverse(
                localCamera != null ? localCamera.transform.position : Vector3.zero);

            foreach (var body in bodies)
            {
                double dist = Vector3d.Distance(body.UniversePosition, playerUniverse) - body.radius;

                if (dist < localBubbleRadius)
                    PromoteToLocal(body);
                else
                    KeepInScaledSpace(body, playerUniverse);
            }

            // Scaled camera mirrors local camera rotation; its position is the
            // player's universe position divided by the scale factor.
            if (scaledCamera != null && localCamera != null)
            {
                scaledCamera.transform.rotation = localCamera.transform.rotation;
                scaledCamera.transform.position = (Vector3)(playerUniverse / scaledSpaceFactor);
            }
        }

        private void PromoteToLocal(Physics.CelestialBody body)
        {
            if (!body.InLocalSpace)
                body.EnterLocalSpace();

            // Position the local-space representation relative to the floating origin.
            body.transform.position = FloatingOrigin.Instance.UniverseToWorld(body.UniversePosition);
        }

        private void KeepInScaledSpace(Physics.CelestialBody body, Vector3d playerUniverse)
        {
            if (body.InLocalSpace)
                body.ExitLocalSpace();

            var scaled = body.ScaledSpaceTransform;
            if (scaled == null) return;
            scaled.position = (Vector3)(body.UniversePosition / scaledSpaceFactor);
            scaled.localScale = Vector3.one * (float)(body.radius * 2.0 / scaledSpaceFactor);
        }
    }
}
