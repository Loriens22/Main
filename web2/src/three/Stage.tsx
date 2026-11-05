import { Canvas, useThree } from '@react-three/fiber';
import { Component, Suspense, useEffect, type ReactNode } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useStore } from '../lib/store';

/** Procedural studio environment (no external HDRI fetch — the hosting CSP blocks third-party assets). */
function StudioEnvironment({ intensity = 0.9 }: { intensity?: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => { env.dispose(); pmrem.dispose(); scene.environment = null; };
  }, [gl, scene, intensity]);
  return null;
}

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String(e) }; }
  render() {
    if (this.state.err) return <div className="loader" style={{ padding: '1rem', textAlign: 'center' }}>3D view unavailable: {this.state.err}</div>;
    return this.props.children;
  }
}

export function Stage({ children, camera, height = 560, envIntensity = 0.9, overlay, label }: {
  children: ReactNode; camera: { position: [number, number, number]; fov?: number; near?: number; far?: number };
  height?: number | string; envIntensity?: number; overlay?: ReactNode; label: string;
}) {
  const quality = useStore((s) => s.quality);
  const dpr: [number, number] = quality === 'low' ? [1, 1] : quality === 'medium' ? [1, 1.5] : [1, 2];
  return (
    <div className="canvas-frame" style={{ height }} role="region" aria-label={label}>
      <Boundary>
        <Canvas
          dpr={dpr}
          shadows={quality === 'high'}
          camera={{ position: camera.position, fov: camera.fov ?? 40, near: camera.near ?? 0.01, far: camera.far ?? 200 }}
          gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}
        >
          <StudioEnvironment intensity={envIntensity} />
          <ambientLight intensity={0.12} />
          <directionalLight position={[-3, 5, 4]} intensity={1.6} castShadow={quality === 'high'} shadow-mapSize={[2048, 2048]} />
          <directionalLight position={[4, 3, -3]} intensity={0.7} color="#9fbaff" />
          <Suspense fallback={null}>{children}</Suspense>
        </Canvas>
      </Boundary>
      {overlay}
    </div>
  );
}

export function LoadingNote({ text }: { text: string }) {
  return <div className="loader" aria-live="polite">{text}</div>;
}
