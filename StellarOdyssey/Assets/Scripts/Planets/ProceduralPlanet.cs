using System.Collections.Generic;
using UnityEngine;
using StellarOdyssey.Core;

namespace StellarOdyssey.Planets
{
    /// <summary>
    /// No Man's Sky-style planet: a quadtree cube-sphere whose patches are
    /// generated on the GPU (see PlanetTerrain.compute) and refined as the
    /// camera approaches — from a whole-planet silhouette in orbit down to
    /// centimetre detail while walking.
    ///
    /// Six root faces (cube -> sphere mapping). Each node splits into 4 children
    /// when the camera is closer than <c>splitDistanceMultiplier * nodeSize</c>,
    /// up to <see cref="maxDepth"/>. At maxDepth 20 an Earth-size planet reaches
    /// ~10 cm vertex spacing.
    /// </summary>
    public sealed class ProceduralPlanet : MonoBehaviour, IFloatingOriginClient
    {
        [Header("Generation")]
        public ComputeShader terrainCompute;      // PlanetTerrain.compute
        public Material terrainMaterial;          // HDRP LitTessellation-based planet shader
        public int seed = 1337;
        [Range(2, 24)] public int maxDepth = 18;
        [Range(9, 65)] public int patchResolution = 33;   // verts per patch edge (2^n + 1)
        public float splitDistanceMultiplier = 3.0f;

        [Header("Terrain shaping (fed to the compute shader)")]
        public float mountainHeight = 8000f;      // m
        public float noiseBaseFrequency = 0.35f;
        public int noiseOctaves = 12;
        public float ridgeSharpness = 2.2f;
        public float oceanLevel = 0f;             // m above datum; below = ocean
        public float canyonDepth = 1200f;
        public BiomeSettings[] biomes;

        [Header("Water & sky")]
        public GameObject oceanPrefab;            // HDRP Water System surface
        public Material atmosphereMaterial;       // volumetric scattering shell

        private Physics.CelestialBody body;
        private QuadTreeNode[] rootFaces;
        private readonly Queue<QuadTreeNode> buildQueue = new Queue<QuadTreeNode>();
        private Transform observer;
        private bool active;

        private static readonly Vector3[] FaceNormals =
            { Vector3.up, Vector3.down, Vector3.left, Vector3.right, Vector3.forward, Vector3.back };

        public void Activate(Physics.CelestialBody owner)
        {
            body = owner;
            if (active) return;
            active = true;
            observer = UnityEngine.Camera.main != null ? UnityEngine.Camera.main.transform : null;
            FloatingOrigin.Instance?.Register(this);

            rootFaces = new QuadTreeNode[6];
            for (int i = 0; i < 6; i++)
                rootFaces[i] = new QuadTreeNode(this, null, FaceNormals[i], Vector2.zero, 0);
        }

        public void Deactivate()
        {
            active = false;
            if (rootFaces != null)
                foreach (var f in rootFaces) f?.DestroyRecursive();
            rootFaces = null;
            buildQueue.Clear();
            FloatingOrigin.Instance?.Unregister(this);
        }

        private void Update()
        {
            if (!active || observer == null || rootFaces == null) return;

            // Camera position in planet-local space (metres from planet centre).
            Vector3 camLocal = transform.InverseTransformPoint(observer.position);

            foreach (var face in rootFaces)
                face.UpdateLOD(camLocal);

            // Budgeted mesh building: a few patches per frame keeps descent hitch-free.
            int budget = 4;
            while (budget-- > 0 && buildQueue.Count > 0)
            {
                var node = buildQueue.Dequeue();
                if (node.WantsMesh) node.BuildMeshGPU();
            }
        }

        internal void EnqueueBuild(QuadTreeNode node) => buildQueue.Enqueue(node);
        internal float Radius => body != null ? (float)body.radius : 6371000f;
        internal Physics.CelestialBody Body => body;

        /// <summary>
        /// Dispatch the terrain compute shader for one patch. Returns vertices
        /// (positions displaced by layered noise) + normals + biome data packed
        /// into vertex color. Runs asynchronously via AsyncGPUReadback so the
        /// main thread never stalls.
        /// </summary>
        internal void DispatchPatch(QuadTreeNode node, System.Action<Vector3[], Vector3[], Color[]> onDone)
        {
            int vertCount = patchResolution * patchResolution;
            var posBuffer = new ComputeBuffer(vertCount, sizeof(float) * 3);
            var normBuffer = new ComputeBuffer(vertCount, sizeof(float) * 3);
            var biomeBuffer = new ComputeBuffer(vertCount, sizeof(float) * 4);

            int kernel = terrainCompute.FindKernel("GeneratePatch");
            terrainCompute.SetBuffer(kernel, "_Positions", posBuffer);
            terrainCompute.SetBuffer(kernel, "_Normals", normBuffer);
            terrainCompute.SetBuffer(kernel, "_BiomeData", biomeBuffer);
            terrainCompute.SetInt("_Resolution", patchResolution);
            terrainCompute.SetInt("_Seed", seed);
            terrainCompute.SetFloat("_PlanetRadius", Radius);
            terrainCompute.SetFloat("_MountainHeight", mountainHeight);
            terrainCompute.SetFloat("_BaseFrequency", noiseBaseFrequency);
            terrainCompute.SetInt("_Octaves", noiseOctaves);
            terrainCompute.SetFloat("_RidgeSharpness", ridgeSharpness);
            terrainCompute.SetFloat("_OceanLevel", oceanLevel);
            terrainCompute.SetFloat("_CanyonDepth", canyonDepth);
            terrainCompute.SetVector("_FaceNormal", node.FaceNormal);
            terrainCompute.SetVector("_PatchOffsetScale",
                new Vector4(node.Offset.x, node.Offset.y, node.Size, 0));

            int groups = Mathf.CeilToInt(patchResolution / 8f);
            terrainCompute.Dispatch(kernel, groups, groups, 1);

            UnityEngine.Rendering.AsyncGPUReadback.Request(posBuffer, posReq =>
            {
                UnityEngine.Rendering.AsyncGPUReadback.Request(normBuffer, normReq =>
                {
                    UnityEngine.Rendering.AsyncGPUReadback.Request(biomeBuffer, biomeReq =>
                    {
                        if (!posReq.hasError && !normReq.hasError && !biomeReq.hasError)
                        {
                            var positions = posReq.GetData<Vector3>().ToArray();
                            var normals = normReq.GetData<Vector3>().ToArray();
                            var biomeRaw = biomeReq.GetData<Vector4>().ToArray();
                            var colors = new Color[biomeRaw.Length];
                            for (int i = 0; i < biomeRaw.Length; i++)
                                colors[i] = new Color(biomeRaw[i].x, biomeRaw[i].y, biomeRaw[i].z, biomeRaw[i].w);
                            onDone(positions, normals, colors);
                        }
                        posBuffer.Release(); normBuffer.Release(); biomeBuffer.Release();
                    });
                });
            });
        }

        public void OnOriginShift(Vector3 offset)
        {
            // Patch GameObjects are children of the planet transform, which the
            // FloatingOrigin already shifted; nothing cached in world space here.
        }
    }

    [System.Serializable]
    public struct BiomeSettings
    {
        public string name;
        [Tooltip("0 = equator, 1 = poles")] public float latitudeMin, latitudeMax;
        public float altitudeMin, altitudeMax;   // m above datum
        public Color groundTint;
        public float vegetationDensity;          // drives GPU-instanced scatter
        public float dustColorIndex;             // landing dust VFX lookup
    }
}
