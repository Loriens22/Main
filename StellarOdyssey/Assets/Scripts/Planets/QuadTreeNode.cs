using UnityEngine;

namespace StellarOdyssey.Planets
{
    /// <summary>
    /// One patch of the cube-sphere quadtree. Owns a GameObject with a MeshRenderer
    /// (and a MeshCollider once the patch is fine enough for the ship to land on).
    /// </summary>
    public sealed class QuadTreeNode
    {
        public Vector3 FaceNormal { get; }
        public Vector2 Offset { get; }      // UV origin of this patch on the cube face [0..1]
        public float Size { get; }          // UV extent (1 at root, halves each split)
        public int Depth { get; }
        public bool WantsMesh { get; private set; }

        private readonly ProceduralPlanet planet;
        private readonly QuadTreeNode parent;
        private QuadTreeNode[] children;
        private GameObject patchObject;
        private Mesh mesh;
        private Vector3 centerLocal;        // patch centre in planet-local space
        private float worldSize;            // approximate metres across

        private const int ColliderDepthThreshold = 4; // only fine patches need physics

        public QuadTreeNode(ProceduralPlanet planet, QuadTreeNode parent, Vector3 faceNormal, Vector2 offset, int depth, float size = -1f)
        {
            this.planet = planet;
            this.parent = parent;
            FaceNormal = faceNormal;
            Offset = offset;
            Depth = depth;
            Size = size < 0 ? 1f : size;

            centerLocal = CubeToSphere(Offset + Vector2.one * (Size / 2f)) * planet.Radius;
            worldSize = planet.Radius * Size * 2f;

            WantsMesh = true;
            planet.EnqueueBuild(this);
        }

        /// <summary>Cube-face UV -> unit sphere direction (the classic cube-sphere mapping).</summary>
        private Vector3 CubeToSphere(Vector2 uv)
        {
            Vector3 axisA = new Vector3(FaceNormal.y, FaceNormal.z, FaceNormal.x);
            Vector3 axisB = Vector3.Cross(FaceNormal, axisA);
            Vector3 pointOnCube = FaceNormal + (uv.x - 0.5f) * 2f * axisA + (uv.y - 0.5f) * 2f * axisB;

            // Improved mapping (less area distortion than plain normalisation).
            Vector3 p = pointOnCube;
            float x2 = p.x * p.x, y2 = p.y * p.y, z2 = p.z * p.z;
            return new Vector3(
                p.x * Mathf.Sqrt(1f - y2 / 2f - z2 / 2f + y2 * z2 / 3f),
                p.y * Mathf.Sqrt(1f - x2 / 2f - z2 / 2f + x2 * z2 / 3f),
                p.z * Mathf.Sqrt(1f - x2 / 2f - y2 / 2f + x2 * y2 / 3f));
        }

        public void UpdateLOD(Vector3 camLocal)
        {
            float distance = Vector3.Distance(camLocal, centerLocal);
            bool shouldSplit = Depth < planet.maxDepth &&
                               distance < worldSize * planet.splitDistanceMultiplier;

            if (shouldSplit && children == null) Split();
            else if (!shouldSplit && children != null) Merge();

            if (children != null)
                foreach (var c in children) c.UpdateLOD(camLocal);
        }

        private void Split()
        {
            float half = Size / 2f;
            children = new QuadTreeNode[4];
            children[0] = new QuadTreeNode(planet, this, FaceNormal, Offset, Depth + 1, half);
            children[1] = new QuadTreeNode(planet, this, FaceNormal, Offset + new Vector2(half, 0), Depth + 1, half);
            children[2] = new QuadTreeNode(planet, this, FaceNormal, Offset + new Vector2(0, half), Depth + 1, half);
            children[3] = new QuadTreeNode(planet, this, FaceNormal, Offset + new Vector2(half, half), Depth + 1, half);
            // Parent mesh stays visible until every child is built (no cracks/pops).
        }

        private void Merge()
        {
            foreach (var c in children) c.DestroyRecursive();
            children = null;
            if (patchObject != null) patchObject.SetActive(true);
        }

        /// <summary>Kick off GPU generation of this patch's mesh.</summary>
        public void BuildMeshGPU()
        {
            WantsMesh = false;
            planet.DispatchPatch(this, (positions, normals, colors) =>
            {
                if (planet == null) return;
                CreatePatchObject(positions, normals, colors);
                NotifyChildBuilt();
            });
        }

        private void CreatePatchObject(Vector3[] positions, Vector3[] normals, Color[] colors)
        {
            int res = planet.patchResolution;

            mesh = new Mesh { indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            mesh.vertices = positions;
            mesh.normals = normals;
            mesh.colors = colors;
            mesh.triangles = SharedTriangles(res);
            mesh.RecalculateBounds();

            patchObject = new GameObject($"Patch d{Depth} ({Offset.x:F3},{Offset.y:F3})");
            patchObject.transform.SetParent(planet.transform, false);
            patchObject.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = patchObject.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = planet.terrainMaterial;

            // Only near-surface patches get colliders — MeshCollider cooking is expensive.
            if (Depth >= planet.maxDepth - ColliderDepthThreshold)
                patchObject.AddComponent<MeshCollider>().sharedMesh = mesh;
        }

        private void NotifyChildBuilt()
        {
            // Hide the parent's mesh once all four children have geometry.
            if (parent == null || parent.children == null) return;
            foreach (var c in parent.children)
                if (c.patchObject == null) return;
            if (parent.patchObject != null) parent.patchObject.SetActive(false);
        }

        public void DestroyRecursive()
        {
            if (children != null) foreach (var c in children) c.DestroyRecursive();
            children = null;
            if (patchObject != null) Object.Destroy(patchObject);
            if (mesh != null) Object.Destroy(mesh);
            WantsMesh = false;
        }

        // Index buffers are identical for every patch of a given resolution — cache one.
        private static int[] cachedTriangles;
        private static int cachedRes;
        private static int[] SharedTriangles(int res)
        {
            if (cachedTriangles != null && cachedRes == res) return cachedTriangles;
            cachedRes = res;
            cachedTriangles = new int[(res - 1) * (res - 1) * 6];
            int t = 0;
            for (int y = 0; y < res - 1; y++)
                for (int x = 0; x < res - 1; x++)
                {
                    int i = y * res + x;
                    cachedTriangles[t++] = i; cachedTriangles[t++] = i + res; cachedTriangles[t++] = i + 1;
                    cachedTriangles[t++] = i + 1; cachedTriangles[t++] = i + res; cachedTriangles[t++] = i + res + 1;
                }
            return cachedTriangles;
        }
    }
}
