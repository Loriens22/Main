import { OrbitControls } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadGLB, useGLB } from './glb';

export const PACKAGE_URL = 'models/aurora_package.glb';
const S = 0.02; // mm -> scene units

function nearestComponent(o: THREE.Object3D | null): string | null {
  while (o) {
    if (o.userData?.component) return o.userData.component as string;
    o = o.parent;
  }
  return null;
}

export function PackageModel({ explode, selected, onSelect, hideLid }: { explode: number; selected: string | null; onSelect: (id: string | null) => void; hideLid: boolean }) {
  const gltf = useGLB(PACKAGE_URL);
  const scene = gltf.scene;
  const ex = useRef(0);
  const comps = useMemo(() => {
    const out: { node: THREE.Object3D; base: THREE.Vector3; v: THREE.Vector3; id: string; mats: Map<THREE.Mesh, THREE.Material | THREE.Material[]> }[] = [];
    scene.traverse((o) => {
      if (o.userData?.component && String(o.userData.component).startsWith('pkg_')) {
        const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
        o.traverse((m) => { if ((m as THREE.Mesh).isMesh) mats.set(m as THREE.Mesh, (m as THREE.Mesh).material); });
        out.push({ node: o, base: o.position.clone(), v: new THREE.Vector3(...((o.userData.explode as number[]) ?? [0, 0, 0])), id: o.userData.component, mats });
      }
    });
    return out;
  }, [scene]);
  useEffect(() => {
    const clones: THREE.Material[] = [];
    for (const c of comps) {
      c.node.visible = !(hideLid && c.id === 'pkg_lid');
      c.mats.forEach((orig, mesh) => {
        if (c.id === selected && !Array.isArray(orig)) {
          const m = (orig as THREE.MeshStandardMaterial).clone();
          m.emissive = new THREE.Color('#2f6cff');
          m.emissiveIntensity = 0.5;
          clones.push(m);
          mesh.material = m;
        } else mesh.material = orig;
      });
    }
    return () => clones.forEach((m) => m.dispose());
  }, [comps, selected, hideLid]);
  useFrame((_, dt) => {
    ex.current += (explode - ex.current) * Math.min(1, dt * 5);
    for (const c of comps) c.node.position.copy(c.base).addScaledVector(c.v, ex.current);
  });
  return (
    <>
      <primitive object={scene} scale={S} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(nearestComponent(e.object)); }} onPointerMissed={() => onSelect(null)} />
      <OrbitControls makeDefault target={[0, 0.3, 0]} enableDamping minDistance={0.5} maxDistance={10} />
    </>
  );
}

loadGLB(PACKAGE_URL);
