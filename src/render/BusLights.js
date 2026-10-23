// Real light sources for the focus bus (the one being driven or ridden):
// low-beam headlights and the LED ceiling lighting of both sections.
// The lights always exist (intensity 0 by day) so toggling them never
// changes the scene's light count, which would recompile every shader.
import * as THREE from 'three';
import { FRONT_Z } from '../vehicle/BusSpec.js';
import { frames } from '../vehicle/frames.js';

export class BusLightRig {
  constructor(scene) {
    this.scene = scene;
    this.head = new THREE.SpotLight(0xffe9cc, 0, 70, 0.62, 0.6, 1.6);
    this.head.position.set(0, 0.85, FRONT_Z - 0.15);
    this.headTarget = new THREE.Object3D();
    this.headTarget.position.set(0, -0.6, FRONT_Z - 22);
    this.head.target = this.headTarget;
    this.cabin = [new THREE.PointLight(0xeef2ff, 0, 8.5, 1.7), new THREE.PointLight(0xeef2ff, 0, 8.5, 1.7)];
    this.cabin[0].position.set(0, 1.55, -3.3);
    this.cabin[1].position.set(0, 1.55, -0.7);
    // parked off-scene until a bus is attached
    this.parking = new THREE.Group();
    scene.add(this.parking);
    for (const o of [this.head, this.headTarget, ...this.cabin]) this.parking.add(o);
    this.bus = null;
  }

  attach(bus) {
    if (bus === this.bus) return;
    this.bus = bus;
    if (!bus) {
      for (const o of [this.head, this.headTarget, ...this.cabin]) this.parking.add(o);
      return;
    }
    // headlights at this bus's bumper; one ceiling light per section (two along a rigid saloon)
    const F = frames(bus.spec);
    this.head.position.set(0, 0.85, F.frontZ - 0.15);
    this.headTarget.position.set(0, -0.6, F.frontZ - 22);
    bus.model.front.add(this.head, this.headTarget, this.cabin[0]);
    if (bus.spec.articulated) {
      this.cabin[0].position.set(0, 1.55, -3.3);
      this.cabin[1].position.set(0, 1.55, -0.7);
      bus.model.rear.add(this.cabin[1]);
    } else {
      const L = F.rearZ - F.frontZ;
      this.cabin[0].position.set(0, 1.55, F.frontZ + L * 0.32);
      this.cabin[1].position.set(0, 1.55, F.frontZ + L * 0.72);
      bus.model.front.add(this.cabin[1]);
    }
  }

  update(bus, night) {
    this.attach(bus || null);
    if (!bus) {
      this.head.intensity = 0;
      for (const l of this.cabin) l.intensity = 0;
      return;
    }
    const dark = THREE.MathUtils.smoothstep(night, 0.2, 0.8);
    this.head.intensity = bus.lights.head ? 95 * (0.35 + 0.65 * dark) : 0;
    const cabin = (bus.lights.interior ?? 1) > 0 ? 2.6 * dark : 0;
    for (const l of this.cabin) l.intensity = cabin;
  }
}
