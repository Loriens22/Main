import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface LayoutQubit { id: string; type: 'X' | 'Z' | 'L' | 'R'; r: number; c: number; feedline: number }
export interface LayoutEdge { a: string; b: string; term: string; layer: 'die' | 'interposer'; wrap: boolean; len_mm: number; p: [number, number][]; route?: [number, number][]; route_layer?: number }
export interface Layout { summary: any; qubits: LayoutQubit[]; edges: LayoutEdge[] }

export const TYPE_COLOR: Record<string, string> = { X: '#ff8a5c', Z: '#4cc3ff', L: '#e8eef8', R: '#c9b6ff' };
export const TERM_COLOR: Record<string, string> = { A1: '#f0b44b', B1: '#f0b44b', A2: '#5d7390', A3: '#5d7390', B2: '#5d7390', B3: '#5d7390' };

/** Coupling graph drawn in the chip GLB frame (mm, glTF Y-up): qubit (r,c) -> (x, z_top, -y). */
export function ChipOverlay({ layout, selected, onSelect, show, lift = 0.0 }: {
  layout: Layout; selected: string | null; onSelect: (id: string | null) => void; show: 'all' | 'long' | 'none'; lift?: number;
}) {
  const S = layout.summary;
  const [R, C] = S.grid as [number, number];
  const p = S.pitch_mm as number;
  const zTop = 0.52 + lift;
  const xy = (r: number, c: number) => [(r - (R - 1) / 2) * p, (c - (C - 1) / 2) * p] as const;
  const byId = useMemo(() => new Map(layout.qubits.map((q) => [q.id, q])), [layout]);

  const lines = useMemo(() => {
    const pos: number[] = [], col: number[] = [];
    const cc = new THREE.Color();
    const push = (a: readonly [number, number], b: readonly [number, number], h: number, color: string) => {
      cc.set(color);
      pos.push(a[0], h, -a[1], b[0], h, -b[1]);
      col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
    };
    for (const e of layout.edges) {
      if (show === 'none') break;
      if (e.layer === 'die') {
        if (show === 'long') continue;
        const [a, b] = e.p;
        push(xy(a[0], a[1]), xy(b[0], b[1]), zTop + 0.02, '#3a5478');
      } else {
        const rt = e.route ?? e.p;
        for (let k = 0; k + 1 < rt.length; k++) push(xy(rt[k][0], rt[k][1]), xy(rt[k + 1][0], rt[k + 1][1]), zTop + 0.25, e.wrap ? '#b07cff' : '#f0b44b');
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [layout, show, zTop]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = useMemo(() => {
    const pos: number[] = [];
    if (selected) for (const e of layout.edges) {
      if (e.a !== selected && e.b !== selected) continue;
      const rt = e.layer === 'die' ? e.p : (e.route ?? e.p);
      const h = e.layer === 'die' ? zTop + 0.05 : zTop + 0.28;
      for (let k = 0; k + 1 < rt.length; k++) {
        const a = xy(rt[k][0], rt[k][1]), b = xy(rt[k + 1][0], rt[k + 1][1]);
        pos.push(a[0], h, -a[1], b[0], h, -b[1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [layout, selected, zTop]); // eslint-disable-line react-hooks/exhaustive-deps

  const inst = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = inst.current;
    if (!m) return;
    const o = new THREE.Object3D(), c = new THREE.Color();
    layout.qubits.forEach((q, i) => {
      const [x, y] = xy(q.r, q.c);
      o.position.set(x, zTop + 0.03, -y);
      const s = q.id === selected ? 1.6 : 1;
      o.scale.set(s, 1, s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(TYPE_COLOR[q.type]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [layout, selected, zTop]); // eslint-disable-line react-hooks/exhaustive-deps

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const q = layout.qubits[e.instanceId];
    onSelect(q && q.id !== selected ? q.id : null);
  };
  void byId;
  return (
    <group>
      <lineSegments geometry={lines}>
        <lineBasicMaterial vertexColors transparent opacity={0.85} depthTest={false} toneMapped={false} />
      </lineSegments>
      <lineSegments geometry={sel} renderOrder={5}>
        <lineBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
      </lineSegments>
      <instancedMesh ref={inst} args={[undefined, undefined, layout.qubits.length]} onClick={click} renderOrder={4}>
        <cylinderGeometry args={[0.09, 0.09, 0.03, 16]} />
        <meshBasicMaterial transparent opacity={0.9} depthTest={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function qubitRole(t: string) {
  return t === 'X' ? 'X-check ancilla' : t === 'Z' ? 'Z-check ancilla' : t === 'L' ? 'data qubit (left block)' : 'data qubit (right block)';
}
