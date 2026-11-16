import * as THREE from 'three';
import { Zone } from '../Zone';
import { StarField } from '../../render/Stars';
import { SystemView } from '../../render/SystemView';
import { BODY } from '../../space/Bodies';
import { LAUNCH_JD, pole, state } from '../../space/Ephemeris';
import { add, cross, norm, scale, unit, V3 } from '../../space/Kepler';
import { Soundscape } from '../../audio/Audio';
import { ui } from '../../ui/store';

const OBL = (23.4392911 * Math.PI) / 180;

/**
 * Observation view of any body from space, used to inspect the worlds up close: the camera sits at a chosen
 * distance (in body radii) and angle from the sunlit side, with the rest of the system around it.
 * URL: ?zone=viewer&body=saturn&dist=4&az=40&el=12&date=<julian date>
 */
export class ViewerZone extends Zone {
  stars!: StarField;
  view!: SystemView;
  body = 'mars';
  dist = 3;
  az = 30;
  el = 10;
  jd = LAUNCH_JD;
  fov = 40;
  private rot = new THREE.Matrix4();
  private cam: V3 = [0, 0, 0];

  async load() {
    this.stars = new StarField();
    // the stars are catalogued in equatorial coordinates; this zone draws in ecliptic ones
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -OBL);
    this.stars.group.quaternion.copy(q);
    this.view = new SystemView(BODY[this.body]?.system ?? 'sol');
  }

  setTarget(body: string, dist: number, az: number, el: number, jd?: number) {
    this.body = body; this.dist = dist; this.az = az; this.el = el;
    if (jd) this.jd = jd;
    if (BODY[body].system !== this.view.system) {
      this.view.dispose();
      this.view = new SystemView(BODY[body].system);
      this.game.renderer.spaceScene.add(this.view.group);
    }
  }

  override enter() {
    super.enter();
    const g = this.game;
    g.renderer.spaceScene.add(this.stars.group, this.view.group);
    g.player.cameraOverride = true;
    g.renderer.setLook({ exposure: 1.0, saturation: 1.05, contrast: 1.12, bloom: 0.55, aoIntensity: 0, aoRadius: 1 }, true);
    g.renderer.preRender.push(this.place);
    ui.set({ mode: 'foot', hints: [] });
  }

  override leave() {
    super.leave();
    const g = this.game;
    g.renderer.spaceScene.remove(this.stars.group, this.view.group);
    g.player.cameraOverride = false;
    g.renderer.preRender = g.renderer.preRender.filter((f) => f !== this.place);
  }

  /** camera placement: azimuth from the sub-solar direction about the body's pole, elevation above its equator */
  private place = (cam: THREE.PerspectiveCamera) => {
    const b = BODY[this.body];
    const s = state(this.body, this.jd).r;
    const n = pole(this.body);
    const toSun = unit(scale(s, -1));
    // sub-solar direction projected on the equator
    let e1 = unit(add(toSun, scale(n, -(toSun[0] * n[0] + toSun[1] * n[1] + toSun[2] * n[2]))));
    if (!isFinite(e1[0])) e1 = [1, 0, 0];
    const e2 = cross(n, e1);
    const a = (this.az * Math.PI) / 180, el = (this.el * Math.PI) / 180;
    const dir = add(add(scale(e1, Math.cos(a) * Math.cos(el)), scale(e2, Math.sin(a) * Math.cos(el))), scale(n, Math.sin(el)));
    this.cam = add(s, scale(dir, b.R * this.dist));
    // look at the body centre, ecliptic north (or the body's pole) up
    const look = new THREE.Vector3(-dir[0], -dir[1], -dir[2]);
    const up = new THREE.Vector3(n[0], n[1], n[2]);
    if (Math.abs(look.dot(up)) > 0.98) up.set(0, 0, 1);
    cam.position.set(0, 0, 0);
    cam.up.copy(up);
    cam.lookAt(look);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.rot.identity();
    const pxPerRad = this.game.renderer.height / ((this.fov * Math.PI) / 180);
    this.view.update(this.jd, this.cam, this.rot, pxPerRad);
    // the eye adapts to the light at the target: Saturn gets 1/90 of the sunlight at Earth
    const irr = b.system === 'sol' ? (1.495978707e11 / Math.hypot(s[0], s[1], s[2])) ** 2 : b.insolation ?? 0.5;
    const exposure = 0.45 * Math.min(250, Math.pow(1 / Math.max(irr, 1e-4), 0.92));
    this.game.renderer.setLook({ exposure, saturation: 1.05, contrast: 1.12, bloom: 0.55, aoIntensity: 0, aoRadius: 1 }, true);
    // stars keep their screen brightness whatever the exposure, and fade when a lit disc fills the view
    const fill = Math.min(1, (b.R / (b.R * this.dist)) * 2.5);
    this.stars.setVisibility((1.4 / exposure) * (1 - 0.7 * fill), 6.0);
    void norm;
  };

  override update(dt: number) {
    void dt;
    const g = this.game;
    g.renderer.spaceCamera.quaternion.copy(g.renderer.camera.quaternion);
  }

  override soundscape(o: Soundscape) { o.wind = 0; o.vacuum = 1; o.indoors = 0; o.hum = 0; o.music = 'orbit'; return o; }
  override locationName() { return `${BODY[this.body].name} · ${this.dist.toFixed(1)} radii`; }
}
