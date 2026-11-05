import { Html, OrbitControls } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadGLB, useGLB } from './glb';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { STAGE_TEMPS } from '../data/components';

export const INSTALLATION_URL = 'models/aurora_installation.glb';

export type Focus = 'all' | 'cryostat' | 'module' | 'top' | 'hero';
const FOCI: Record<Focus, { cam: [number, number, number]; target: [number, number, number] }> = {
  all: { cam: [3.3, 2.2, 4.7], target: [0.85, 1.15, -0.2] },
  cryostat: { cam: [1.05, 1.35, 1.75], target: [0, 1.25, 0] },
  module: { cam: [0.32, 0.72, 0.5], target: [0, 0.6, 0.01] },
  top: { cam: [1.2, 3.2, 1.6], target: [0.2, 2.1, 0] },
  hero: { cam: [1.9, 2.0, 5.4], target: [-1.15, 1.2, -0.1] },
};

interface Props {
  explode: number;
  showShields: boolean;
  xray: boolean;
  thermal: boolean;
  labels: boolean;
  selected: string | null;
  onSelect?: (id: string | null) => void;
  focus: Focus;
  autoRotate?: boolean;
  flow?: boolean;
  interactive?: boolean;
}

function topComponent(o: THREE.Object3D | null): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  while (o) {
    if (o.userData?.component) best = o;
    o = o.parent;
  }
  return best;
}

/** Sequential blue ramp keyed on log10(T): 10 mK -> darkest, 300 K -> lightest (conceptual thermal view). */
function tempColor(k: number) {
  const t = (Math.log10(k) + 2) / (Math.log10(300) + 2);
  return new THREE.Color().setHSL(0.6 - 0.05 * t, 0.75, 0.22 + 0.5 * t);
}

export function InstallationModel(p: Props) {
  const gltf = useGLB(INSTALLATION_URL);
  const root = gltf.scene;
  const controls = useRef<OrbitImpl>(null);
  const { camera } = useThree();
  const explodeNow = useRef(0);
  const focusAnim = useRef(1);

  const index = useMemo(() => {
    const comps: { node: THREE.Object3D; base: THREE.Vector3; ex: THREE.Vector3; id: string; shield: boolean }[] = [];
    const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    root.traverse((o) => {
      if (o.userData?.component && !String(o.userData.component).startsWith('pkg_') && !String(o.userData.component).startsWith('chip_')) {
        const ex = o.userData.explode as number[] | undefined;
        comps.push({ node: o, base: o.position.clone(), ex: new THREE.Vector3(...(ex ?? [0, 0, 0])), id: o.userData.component, shield: !!o.userData.shield });
        if (o.userData.shield) o.visible = false; // hidden from the very first frame; effects below may reveal them
      }
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        mats.set(m, m.material);
      }
    });
    const stageCenters: Record<string, THREE.Vector3> = {};
    for (const c of comps) if (c.id.startsWith('plate_')) stageCenters[c.id] = new THREE.Box3().setFromObject(c.node).getCenter(new THREE.Vector3());
    return { comps, mats, stageCenters };
  }, [root]);

  // material states: selection highlight, x-ray shields, conceptual thermal tint
  useEffect(() => {
    const hl = new Map<THREE.Material, THREE.Material>();
    const highlight = (m: THREE.Material) => {
      if (!hl.has(m)) {
        const c = (m as THREE.MeshStandardMaterial).clone();
        c.emissive = new THREE.Color('#2f6cff');
        c.emissiveIntensity = 0.55;
        hl.set(m, c);
      }
      return hl.get(m)!;
    };
    const ghost = new THREE.MeshStandardMaterial({ color: '#9fb4d6', metalness: 0.6, roughness: 0.3, transparent: true, opacity: 0.12, depthWrite: false });
    const thermalMats = new Map<string, THREE.MeshStandardMaterial>();
    for (const c of index.comps) {
      const isSel = p.selected === c.id;
      c.node.visible = !c.shield || p.showShields || p.xray;
      c.node.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const orig = index.mats.get(m)!;
        let mat: THREE.Material | THREE.Material[] = orig;
        if (p.thermal && c.id.startsWith('plate_')) {
          if (!thermalMats.has(c.id)) thermalMats.set(c.id, new THREE.MeshStandardMaterial({ color: tempColor(STAGE_TEMPS[c.id].kelvin), metalness: 0.2, roughness: 0.5, emissive: tempColor(STAGE_TEMPS[c.id].kelvin), emissiveIntensity: 0.25 }));
          mat = thermalMats.get(c.id)!;
        } else if (c.shield && p.xray) mat = ghost;
        else if (isSel) mat = Array.isArray(orig) ? orig.map(highlight) : highlight(orig);
        m.material = mat;
      });
    }
    return () => { hl.forEach((m) => m.dispose()); ghost.dispose(); thermalMats.forEach((m) => m.dispose()); };
  }, [index, p.selected, p.showShields, p.xray, p.thermal]);

  useEffect(() => { focusAnim.current = 0; }, [p.focus]);

  useFrame((_, dt) => {
    explodeNow.current += (p.explode - explodeNow.current) * Math.min(1, dt * 5);
    for (const c of index.comps) c.node.position.copy(c.base).addScaledVector(c.ex, explodeNow.current);
    if (focusAnim.current < 1 && controls.current) {
      focusAnim.current = Math.min(1, focusAnim.current + dt * 1.4);
      const f = FOCI[p.focus];
      const k = 1 - Math.pow(1 - focusAnim.current, 3);
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

  return (
    <>
      <primitive object={root} onClick={p.interactive === false ? undefined : click} onPointerMissed={() => p.onSelect?.(null)} />
      <mesh rotation-x={-Math.PI / 2} position={[0.6, -0.001, 0]} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#0a0e15" roughness={0.55} metalness={0.2} />
      </mesh>
      <gridHelper args={[12, 48, '#1b2740', '#121a29']} position={[0.6, 0.0005, 0]} />
      {p.labels && Object.entries(index.stageCenters).map(([id, v]) => (
        <Html key={id} position={[v.x - 0.45, v.y + (index.comps.find((c) => c.id === id)?.ex.y ?? 0) * p.explode, v.z + 0.1]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <span className="stage-label">{STAGE_TEMPS[id]?.label}</span>
        </Html>
      ))}
      {p.flow && <SignalFlow />}
      <OrbitControls ref={controls as any} makeDefault target={FOCI[p.focus].target} enableDamping dampingFactor={0.08} minDistance={0.15} maxDistance={12} autoRotate={p.autoRotate} autoRotateSpeed={0.45} maxPolarAngle={Math.PI * 0.53} />
    </>
  );
}

/** Conceptual animation: control pulses travel rack -> tray -> top plate -> MXC -> QPU, readout returns. */
function SignalFlow() {
  const group = useRef<THREE.Group>(null);
  const down = useMemo(() => new THREE.CatmullRomCurve3([
    [1.9, 2.0, -0.3], [1.9, 2.62, 0.05], [0.4, 2.65, 0.05], [0.25, 2.2, -0.05], [0.19, 2.1, 0.05],
    [0.19, 1.86, 0.05], [0.19, 1.64, 0.05], [0.19, 1.44, 0.05], [0.19, 1.28, 0.05], [0.19, 1.1, 0.05], [0.06, 0.86, 0.03], [0.0, 0.66, 0.02],
  ].map((v) => new THREE.Vector3(...(v as [number, number, number])))), []);
  const N = 14;
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      const up = i % 2 === 1;
      let t = ((clock.elapsedTime * 0.18 + i / N) % 1);
      if (up) t = 1 - t;
      c.position.copy(down.getPointAt(t));
      (c as THREE.Mesh).scale.setScalar(0.6 + 0.4 * Math.sin(clock.elapsedTime * 6 + i));
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: N }, (_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.012, 12, 8]} />
          <meshBasicMaterial color={i % 2 ? '#d9b26a' : '#4c8dff'} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

loadGLB(INSTALLATION_URL);
