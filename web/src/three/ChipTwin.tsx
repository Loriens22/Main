// Digital twin of the AURORA-Q T1 die. Qubit/coupler activity is driven by the routed schedule of the
// circuit you executed (real engine output) — never by a canned animation.

import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { TwinRun } from '../lib/store';
import { clbitMarginals } from '../lib/twin';

export const CHIP_URL = 'models/aurora_chip.glb';
const S = 0.1; // mm -> scene units
const TOP = (0.5 + 0.02) * S;

export interface ChipLayout {
  qubits: { q: number; x: number; y: number; row: number; col: number }[];
  couplers: { a: number; b: number; squid: [number, number] }[];
}

const COL = {
  idle: new THREE.Color('#9db0d0'), used: new THREE.Color('#2f6cff'), g1: new THREE.Color('#7fb0ff'), g2: new THREE.Color('#b9a2ff'),
  meas: new THREE.Color('#e8c27a'), reset: new THREE.Color('#3ecf8e'), swap: new THREE.Color('#ff8f6b'),
};

export function ChipTwinModel({ layout, twin, time, explode, onHover, showInterposer }: {
  layout: ChipLayout; twin: TwinRun | null; time: number; explode: number; onHover?: (q: number | null) => void; showInterposer: boolean;
}) {
  const gltf = useGLTF(CHIP_URL, false, false);
  const scene = useMemo(() => gltf.scene, [gltf]);
  const rings = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.InstancedMesh>(null);
  const lines = useRef<THREE.LineSegments>(null);
  const comps = useMemo(() => {
    const out: { node: THREE.Object3D; base: THREE.Vector3; ex: THREE.Vector3; id: string }[] = [];
    scene.traverse((o) => {
      // the textured die skin sits 1 µm above the die body: push it forward in depth to avoid z-fighting
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshStandardMaterial)?.map) {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.polygonOffset = true; mat.polygonOffsetFactor = -4; mat.polygonOffsetUnits = -4;
      }
      if (o.userData?.component) out.push({ node: o, base: o.position.clone(), ex: new THREE.Vector3(...((o.userData.explode as number[]) ?? [0, 0, 0])), id: o.userData.component });
    });
    return out;
  }, [scene]);
  useEffect(() => {
    for (const c of comps) {
      if (c.id === 'chip_interposer') {
        c.node.visible = showInterposer;
        c.node.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && !(m.userData as any).ghosted) {
            const mat = (m.material as THREE.MeshStandardMaterial).clone();
            mat.transparent = true; mat.opacity = 0.28; mat.depthWrite = false;
            m.material = mat; (m.userData as any).ghosted = true;
          }
        });
      }
    }
  }, [comps, showInterposer]);

  const pos = useMemo(() => layout.qubits.map((q) => new THREE.Vector3(q.x * S, TOP, -q.y * S)), [layout]);
  const schedule = twin?.route.layers ?? [];
  const used = useMemo(() => new Set(twin?.route.usedPhysical ?? []), [twin]);
  const marg = useMemo(() => (twin ? clbitMarginals(twin.result.counts) : []), [twin]);
  const finalP1 = useMemo(() => {
    const m = new Map<number, number>();
    if (!twin) return m;
    // logical qubit q measured into clbit q by convention of the editor; map to its final physical position
    twin.route.finalLayout.forEach((phys, logical) => { if (marg[logical] !== undefined) m.set(phys, marg[logical]); });
    return m;
  }, [twin, marg]);

  useFrame(({ clock }) => {
    const r = rings.current, g = glow.current, ls = lines.current;
    if (!r || !g || !ls) return;
    const dummy = new THREE.Object3D();
    const L = Math.floor(time);
    const layer = L >= 0 && L < schedule.length ? schedule[L] : [];
    const active = new Map<number, THREE.Color>();
    const segs: number[] = [];
    for (const op of layer) {
      const c = op.name === 'measure' ? COL.meas : op.name === 'reset' ? COL.reset : op.name === 'swap' ? COL.swap : op.qubits.length > 1 ? COL.g2 : COL.g1;
      op.qubits.forEach((q) => active.set(q, c));
      if (op.qubits.length === 2) {
        const [a, b] = op.qubits;
        segs.push(pos[a].x, TOP + 0.004, pos[a].z, pos[b].x, TOP + 0.004, pos[b].z);
      }
    }
    const pulse = 0.65 + 0.35 * Math.sin(clock.elapsedTime * 10);
    const done = twin && time >= schedule.length;
    pos.forEach((p, q) => {
      dummy.position.copy(p);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      r.setMatrixAt(q, dummy.matrix);
      let col = used.has(q) ? COL.used : COL.idle;
      let gs = 0.0001;
      if (active.has(q)) { col = active.get(q)!; gs = pulse; }
      else if (done && finalP1.has(q)) {
        const p1 = finalP1.get(q)!;
        col = new THREE.Color().lerpColors(new THREE.Color('#123a7a'), new THREE.Color('#e8c27a'), p1);
        gs = 0.35 + 0.65 * p1;
      }
      r.setColorAt(q, col);
      dummy.scale.setScalar(gs);
      dummy.updateMatrix();
      g.setMatrixAt(q, dummy.matrix);
      g.setColorAt(q, col);
    });
    r.instanceMatrix.needsUpdate = true;
    g.instanceMatrix.needsUpdate = true;
    if (r.instanceColor) r.instanceColor.needsUpdate = true;
    if (g.instanceColor) g.instanceColor.needsUpdate = true;
    const geo = ls.geometry as THREE.BufferGeometry;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(segs.length ? segs : [0, 0, 0, 0, 0, 0], 3));
    ls.visible = segs.length > 0;
    for (const c of comps) c.node.position.copy(c.base).addScaledVector(c.ex, explode);
  });

  return (
    <>
      <primitive object={scene} scale={S} />
      <instancedMesh ref={rings} args={[undefined, undefined, pos.length]} onPointerMove={(e) => { e.stopPropagation(); onHover?.(e.instanceId ?? null); }} onPointerOut={() => onHover?.(null)}>
        <ringGeometry args={[0.03, 0.038, 32]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.95} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={glow} args={[undefined, undefined, pos.length]}>
        <circleGeometry args={[0.027, 32]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.85} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <lineSegments ref={lines}>
        <bufferGeometry />
        <lineBasicMaterial color="#b9a2ff" toneMapped={false} linewidth={2} />
      </lineSegments>
      <OrbitControls makeDefault target={[0, 0, 0]} enableDamping minDistance={0.25} maxDistance={6} maxPolarAngle={Math.PI * 0.49} />
    </>
  );
}

export function QubitTag({ layout, q }: { layout: ChipLayout; q: number }) {
  const qq = layout.qubits[q];
  return (
    <Html position={[qq.x * S, TOP + 0.02, -qq.y * S]} center style={{ pointerEvents: 'none' }}>
      <span className="hud chip-label" style={{ position: 'static' }}>Q{q} · row {qq.row} col {qq.col}</span>
    </Html>
  );
}

useGLTF.preload(CHIP_URL, false, false);
