import * as THREE from 'three';
import type { Assets } from '../core/assets';
import type { Grade } from '../core/post';

export class FoldScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 100);
  constructor(A: Assets, renderer: THREE.WebGLRenderer) { this.scene.background = new THREE.Color(0x777777); }
  update(t: number) { this.camera.position.set(0, 0, 5); }
  grade(t: number): Grade { return {}; }
}
