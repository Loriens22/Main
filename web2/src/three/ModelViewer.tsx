import { Html, OrbitControls } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { useGLB } from './glb';

export interface Focus { cam: [number, number, number]; target: [number, number, number] }

export interface ViewerProps {
  url: string;
  foci: Record<string, Focus>;
  focus: string;
  explode: number;
  showShields: boolean;
  xray: boolean;
  thermal?: boolean;
  labels?: boolean;
  selected: string | null;
  onSelect?: (id: string | null) => void;
  onIndex?: (comps: { id: string; label: string; shield: boolean }[]) => void;
  autoRotate?: boolean;
  minDistance?: number;
  maxDistance?: number;
  floor?: { y: number; r: number } | null;
  children?: ReactNode;
}

const STAGE_K: Record<string, number> = { plate_300k: 300, plate_50k: 50, plate_4k: 4, plate_still: 0.8, plate_cp: 0.1, plate_mxc: 0.01 };
const STAGE_TXT: Record<string, string> = { plate_300k: '300 K', plate_50k: '50 K', plate_4k: '4 K · cryo-CMOS', plate_still: '0.8 K still', plate_cp: '100 mK', plate_mxc: '10 mK · MXC' };

/** Sequential ice ramp keyed on log10(T): 10 mK darkest blue, 300 K pale. */
function tempColor(k: number) {
  const t = (Math.log10(k) + 2) / (Math.log10(300) + 2);
  return new THREE.Color().setHSL(0.58 - 0.04 * t, 0.7, 0.2 + 0.52 * t);
}

function topComponent(o: THREE.Object3D | null): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  while (o) { if (o.userData?.component) best = o; o = o.parent; }
  return best;
}

export function ModelViewer(p: ViewerProps) {
  const gltf = useGLB(p.url);
  const root = gltf.scene;
  const controls = useRef<OrbitImpl>(null);
  const { camera } = useThree();
  const ex = useRef(0);
  const anim = useRef(1);

  const index = useMemo(() => {
    const comps: { node: THREE.Object3D; base: THREE.Vector3; ex: THREE.Vector3; id: string; shield: boolean; label: string }[] = [];
    const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    root.traverse((o) => {
      if (o.userData?.component) {
        const e = o.userData.explode as number[] | undefined;
        comps.push({ node: o, base: o.position.clone(), ex: new THREE.Vector3(...(e ?? [0, 0, 0])), id: o.userData.component, shield: !!o.userData.shield, label: o.userData.label ?? o.userData.component });
        if (o.userData.shield) o.visible = false;
      }
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true;
        mats.set(m, m.material);
        const mm = m.material as THREE.MeshStandardMaterial;
        if (mm.transparent) { mm.depthWrite = false; m.renderOrder = 2; }
      }
    });
    const centers: Record<string, THREE.Vector3> = {};
    for (const c of comps) if (c.id.startsWith('plate_')) centers[c.id] = new THREE.Box3().setFromObject(c.node).getCenter(new THREE.Vector3());
    return { comps, mats, centers };
  }, [root]);

  useEffect(() => {
    p.onIndex?.(index.comps.filter((c) => topComponent(c.node.parent) === null).map((c) => ({ id: c.id, label: c.label, shield: c.shield })));
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const hl = new Map<THREE.Material, THREE.Material>();
    const highlight = (m: THREE.Material) => {
      if (!hl.has(m)) {
        const c = (m as THREE.MeshStandardMaterial).clone();
        c.emissive = new THREE.Color('#3f8cff');
        c.emissiveIntensity = 0.5;
        hl.set(m, c);
      }
      return hl.get(m)!;
    };
    const ghost = new THREE.MeshStandardMaterial({ color: '#a9c4e8', metalness: 0.5, roughness: 0.3, transparent: true, opacity: 0.1, depthWrite: false });
    const thermalMats = new Map<string, THREE.MeshStandardMaterial>();
    for (const c of index.comps) {
      const sel = p.selected === c.id;
      c.node.visible = !c.shield || p.showShields || p.xray;
      c.node.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const orig = index.mats.get(m)!;
        let mat: THREE.Material | THREE.Material[] = orig;
        if (p.thermal && STAGE_K[c.id] !== undefined) {
          if (!thermalMats.has(c.id)) { const col = tempColor(STAGE_K[c.id]); thermalMats.set(c.id, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3, metalness: 0.2, roughness: 0.5 })); }
          mat = thermalMats.get(c.id)!;
        } else if (c.shield && p.xray) mat = ghost;
        else if (sel) mat = Array.isArray(orig) ? orig.map(highlight) : highlight(orig);
        m.material = mat;
      });
    }
    return () => { hl.forEach((m) => m.dispose()); ghost.dispose(); thermalMats.forEach((m) => m.dispose()); };
  }, [index, p.selected, p.showShields, p.xray, p.thermal]);

  useEffect(() => { anim.current = 0; }, [p.focus]);

  useFrame((_, dt) => {
    ex.current += (p.explode - ex.current) * Math.min(1, dt * 5);
    for (const c of index.comps) c.node.position.copy(c.base).addScaledVector(c.ex, ex.current);
    if (anim.current < 1 && controls.current) {
      anim.current = Math.min(1, anim.current + dt * 1.4);
      const f = p.foci[p.focus];
      const k = 1 - Math.pow(1 - anim.current, 3);
      camera.position.lerp(new THREE.Vector3(...f.cam), k * 0.12 + 0.02);
      controls.current.target.lerp(new THREE.Vector3(...f.target), k * 0.12 + 0.02);
      controls.current.update();
    }
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!p.onSelect) return;
    e.stopPropagation();
    const c = topComponent(e.object);
    p.onSelect(c ? (c.userData.component as string) : null);
  };
  const f0 = p.foci[p.focus];
  return (
    <>
      <primitive object={root} onClick={click} onPointerMissed={() => p.onSelect?.(null)} />
      {p.floor && (
        <mesh rotation-x={-Math.PI / 2} position={[0, p.floor.y, 0]} receiveShadow>
          <circleGeometry args={[p.floor.r, 72]} />
          <meshStandardMaterial color="#090d14" roughness={0.6} metalness={0.2} />
        </mesh>
      )}
      {p.labels && Object.entries(index.centers).map(([id, v]) => {
        const c = index.comps.find((x) => x.id === id)!;
        return (
          <Html key={id} position={[v.x - 1.0, v.y + c.ex.y * p.explode, v.z]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <span className="stage-label">{STAGE_TXT[id]}</span>
          </Html>
        );
      })}
      {p.children}
      <OrbitControls ref={controls as any} makeDefault target={f0.target} enableDamping dampingFactor={0.08}
        minDistance={p.minDistance ?? 0.1} maxDistance={p.maxDistance ?? 20} autoRotate={p.autoRotate} autoRotateSpeed={0.4} />
    </>
  );
}
