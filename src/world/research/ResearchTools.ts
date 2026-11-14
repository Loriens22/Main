import * as THREE from 'three';
import type SurfaceZone from '../zones/SurfaceZone';
import type { Cinematic } from '../../core/Controllable';
import type { InputContext } from '../../core/Input';
import { SPECIES_EXPANSION } from '../../data/speciesExpansion';
import { REFUGE as L } from '../surface/marsRefuge';
import { checkProgramme } from './programme';

/**
 * Field research tools for the Mars & Jupiter expansion (every surface zone; most useful in the Mars refuge and in
 * Jupiter's clouds). No weapons: observation, sampling, recording.
 *   G  survey drone / ROV   a tethered camera drone with its own lamp (an ROV under water: slower, battery-limited);
 *                           the animals react to it as a probe — some ignore it, some inspect it, some learn it
 *   N  sampler              ice core, brine, biofilm swab, regolith, a borehole at the refuge skylight; in Ranger 1 on
 *                           Jupiter, the intake aerosol sampler
 *   B  photo mode           a free camera (WASD, Space/C, mouse, wheel zoom) with a species tag and size estimate,
 *                           location / depth / pressure / wind readouts and field-note annotation; E or click to
 *                           capture (a PNG download; the codex records the photograph)
 */
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

function hud(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:16px;bottom:16px;max-width:min(560px,calc(100vw - 32px));font:12px/1.45 ui-monospace,Menlo,monospace;color:#e8e2d2;' +
    'background:rgba(8,10,14,.62);border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:8px 10px;pointer-events:none;z-index:40;white-space:pre-wrap;display:none';
  document.body.append(el);
  return el;
}

// ================================================================================================ survey drone
export class SurveyDrone implements Cinematic {
  blocking = true;
  readonly touch = 'drone' as const;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  battery = 1;
  readonly group = new THREE.Group();
  readonly lamp: THREE.SpotLight;
  private done = false;
  private rotors: THREE.Mesh[] = [];
  private t = 0;
  /** knocked by an animal (seconds of wobble) */
  bump = 0;

  constructor(private tools: ResearchTools, readonly origin: THREE.Vector3, yaw: number) {
    const z = tools.zone;
    this.yaw = yaw;
    this.pos.copy(origin).add(_v.set(-Math.sin(yaw) * 1.2, 1.5, -Math.cos(yaw) * 1.2));
    const body = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.45, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.5 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.42), body);
    this.group.add(hull);
    for (let k = 0; k < 4; k++) {
      const sx = k % 2 ? 1 : -1, sz = k < 2 ? 1 : -1;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.03), dark);
      arm.position.set(sx * 0.2, 0.02, sz * 0.18);
      arm.rotation.y = sx * sz * 0.7;
      const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 16), new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.35 }));
      rot.position.set(sx * 0.3, 0.06, sz * 0.27);
      this.group.add(arm, rot);
      this.rotors.push(rot);
    }
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.2 }));
    lens.position.set(0, -0.02, -0.22);
    const lampHead = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0x8a8f96 }));
    lampHead.position.set(0, 0.02, -0.212);
    lampHead.rotation.y = Math.PI;
    this.group.add(lens, lampHead);
    // the camera rides inside the hull: the body is not drawn from its own camera (only its lamp shows)
    this.group.visible = false;
    this.lamp = new THREE.SpotLight(0xf2f6ff, 6, 40, 0.5, 0.5, 1.6);
    this.lamp.castShadow = false;
    z.scene.add(this.group, this.lamp, this.lamp.target);
  }

  get inWater() {
    return this.pos.y < this.tools.waterLevel(this.pos);
  }

  recall() {
    this.done = true;
  }

  /** knocked by an animal: a push and a few seconds of wobble (the ROV is sturdy; nothing breaks) */
  knock(k: THREE.Vector3) {
    this.vel.add(k);
    this.bump = Math.max(this.bump, 1.5);
    this.tools.zone.game.renderer.fx.shake = Math.max(this.tools.zone.game.renderer.fx.shake, 0.5);
    this.tools.zone.game.notify('Something knocked the drone.', 'warn', 3);
  }

  update(dt: number, cam: THREE.PerspectiveCamera) {
    const tools = this.tools;
    const z = tools.zone;
    const input = z.game.input;
    this.t += dt;
    if (this.done || input.pressed('drone') || input.pressed('menu')) {
      this.dispose();
      tools.droneEnded();
      return false;
    }
    // battery: ~8 minutes of flight, faster drain under water (thrusters against the brine)
    this.battery = Math.max(0, this.battery - dt / (this.inWater ? 300 : 480));
    if (this.battery <= 0) {
      z.game.notify('Drone battery flat — auto-return.', 'warn', 4);
      this.done = true;
    }
    this.yaw += input.look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.look.y, -1.3, 1.3);
    const water = this.inWater;
    const vmax = water ? 1.6 : 4.5;
    // the move stick / WASD (input.move: x right, y forward), Space/C (or the touch UP/DOWN) for height
    _v.set(input.move.x, (input.held('jump') ? 1 : 0) - (input.held('crouch') ? 1 : 0), -input.move.y);
    _v.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw).multiplyScalar(vmax * (input.held('sprint') ? 1.8 : 1));
    this.vel.lerp(_v, 1 - Math.exp(-(water ? 2 : 4) * dt));
    if (this.bump > 0) {
      this.bump -= dt;
      this.vel.add(_u.set(Math.sin(this.t * 31), Math.cos(this.t * 27) * 0.5, Math.cos(this.t * 23)).multiplyScalar(0.4));
    }
    const from = _u.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    // rock, floor, ice: the refuge guard; the ground; the tether
    tools.guard(from, this.pos, 0.3);
    const fy = tools.groundY(this.pos.x, this.pos.z) + 0.25;
    if (this.pos.y < fy) this.pos.y = fy;
    const tether = 140;
    _v.subVectors(this.pos, this.origin);
    if (_v.length() > tether) this.pos.copy(this.origin).add(_v.setLength(tether));
    this.group.position.copy(this.pos);
    this.group.rotation.set(-this.vel.z * 0.04, this.yaw, this.vel.x * 0.04, 'YXZ');
    for (const r of this.rotors) r.rotation.y += dt * 60;
    // its camera, its lamp
    _e.set(this.pitch, this.yaw, 0);
    _q.setFromEuler(_e);
    cam.position.copy(this.pos).add(_v.set(0, 0.05, 0));
    cam.quaternion.copy(_q);
    this.lamp.position.copy(cam.position);
    this.lamp.target.position.copy(cam.position).add(_v.set(0, 0, -10).applyQuaternion(_q));
    this.lamp.target.updateMatrixWorld();
    this.lamp.intensity = water ? 12 : 4;
    const d = this.pos.distanceTo(this.origin);
    const depth = tools.waterLevel(this.pos) - this.pos.y;
    tools.setHud(`SURVEY ${water ? 'ROV' : 'DRONE'}   battery ${Math.round(this.battery * 100)} %   range ${d.toFixed(0)} / ${tether} m${water ? `   depth ${depth.toFixed(1)} m` : ''}\n` +
      `WASD move · Space/C up/down · Shift fast · G recall${tools.sampleHint(this.pos) ? '   · N ' + tools.sampleHint(this.pos) : ''}`);
    if (input.pressed('sample')) tools.sample(this.pos, true);
    return true;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.group.removeFromParent();
    this.lamp.removeFromParent();
    this.lamp.target.removeFromParent();
    this.lamp.dispose();
  }
}

// ================================================================================================ photo mode
export class PhotoMode implements Cinematic {
  blocking = true;
  readonly touch = 'photo' as const;
  private pos = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private fov = 50;
  private done = false;
  private flash = 0;
  private tag: { id: string | null; species: string; d: number } | null = null;
  /** the input context before photo mode (flight / seat have no WASD); restored on exit */
  private ctx: InputContext;

  constructor(private tools: ResearchTools, cam: THREE.PerspectiveCamera) {
    const input = tools.zone.game.input;
    this.ctx = input.context;
    input.context = 'walk';
    this.pos.copy(cam.getWorldPosition(_v));
    this.origin.copy(this.pos);
    _e.setFromQuaternion(cam.getWorldQuaternion(_q), 'YXZ');
    this.yaw = _e.y;
    this.pitch = _e.x;
    this.fov = cam.fov;
  }

  update(dt: number, cam: THREE.PerspectiveCamera) {
    const tools = this.tools;
    const input = tools.zone.game.input;
    if (this.done || input.pressed('photo') || input.pressed('menu')) {
      input.context = this.ctx;
      tools.photoEnded();
      return false;
    }
    this.yaw += input.look.x * (this.fov / 60);
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.look.y * (this.fov / 60), -1.5, 1.5);
    if (input.wheel) this.fov = THREE.MathUtils.clamp(this.fov * (1 + input.wheel * 0.08), 6, 90);
    const zk = (input.held('zoomOut') ? 1 : 0) - (input.held('zoomIn') ? 1 : 0);
    if (zk) this.fov = THREE.MathUtils.clamp(this.fov * Math.exp(zk * dt * 0.9), 6, 90);
    _v.set(input.move.x, (input.held('jump') ? 1 : 0) - (input.held('crouch') ? 1 : 0), -input.move.y);
    _v.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw).multiplyScalar(dt * 3 * (input.held('sprint') ? 4 : 1));
    this.pos.add(_v);
    // a free camera on a short leash (photo mode is not a way to scout)
    _v.subVectors(this.pos, this.origin);
    if (_v.length() > 40) this.pos.copy(this.origin).add(_v.setLength(40));
    cam.position.copy(this.pos);
    cam.quaternion.setFromEuler(_e.set(this.pitch, this.yaw, 0, 'YXZ'));
    if (cam.fov !== this.fov) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    this.tag = tools.tagInView(cam);
    this.flash = Math.max(0, this.flash - dt * 3);
    tools.setHud(tools.photoHud(cam, this.tag, this.fov) + (this.flash > 0 ? '\n— captured —' : ''));
    if (input.pressed('interact') || input.pressed('sample')) {
      tools.capture(this.tag);
      this.flash = 1;
    }
    return true;
  }
}

// ================================================================================================ the tools
export class ResearchTools {
  drone: SurveyDrone | null = null;
  photo: PhotoMode | null = null;
  private hudEl: HTMLElement | null = null;
  private hudText = '';
  private progT = 0;
  readonly gallery: { at: number; species: string | null; url: string }[] = [];

  constructor(readonly zone: SurfaceZone) {}

  // ---- the world as the tools see it
  waterLevel(p: THREE.Vector3) {
    return this.zone.refuge ? this.zone.refuge.waterLevel(p.x, p.z) : -Infinity;
  }

  groundY(x: number, z: number) {
    if (this.zone.gas) return -1e9;
    return this.zone.refuge?.floorY(x, z) ?? this.zone.terrainY(x, z);
  }

  guard(from: THREE.Vector3, to: THREE.Vector3, r: number) {
    return this.zone.refuge ? this.zone.refuge.guard(from, to, r) : false;
  }

  setHud(text: string | null) {
    if (!this.hudEl) this.hudEl = hud();
    if (text === this.hudText) return;
    this.hudText = text ?? '';
    this.hudEl.textContent = this.hudText;
    this.hudEl.style.display = text ? 'block' : 'none';
  }

  // ---- per frame
  update(dt: number) {
    const z = this.zone;
    const g = z.game;
    const input = g.input;
    const pl = g.player;
    const onFoot = pl.frame === z.ground && pl.mode === 'walk';
    const flying = !!g.control && z.gas;
    // the key that just closed a tool must not reopen one in the same moment
    this.lock = Math.max(0, this.lock - dt);
    if (!g.cinematic && !g.ui.panelOpen && this.lock <= 0) {
      if (input.pressed('drone') && onFoot && !z.gas) {
        this.drone = new SurveyDrone(this, pl.pos.clone(), pl.yaw);
        g.playCinematic(this.drone);
        g.notify('Survey drone launched. G to recall.', 'info', 3);
      } else if (input.pressed('photo') && (onFoot || flying || g.control)) {
        this.photo = new PhotoMode(this, g.camera);
        g.playCinematic(this.photo);
      } else if (input.pressed('sample') && (onFoot || flying)) {
        this.sample(onFoot ? pl.pos : g.camera.getWorldPosition(_v), false);
      }
      const hint = onFoot ? this.sampleHint(pl.pos) : flying ? this.sampleHint(g.camera.getWorldPosition(_v)) : null;
      this.setHud(hint ? `N — ${hint}` : null);
    }
    // the research programme: stages complete as their evidence comes in
    this.progT -= dt;
    if (this.progT < 0) {
      this.progT = 2;
      checkProgramme(g, z.site.body);
      if (z.gas && g.control) {
        // stage 1: a minute of flight in the cloud layer logs a pressure-temperature-wind profile
        this.flyT += 2;
        if (this.flyT >= 60 && !g.flag('jupiter:profile')) {
          g.flag('jupiter:profile', `${Math.round(g.state.clock.earthTime)}|Pressure, temperature and wind profile logged through the cloud layer.`);
          g.notify('Instruments: pressure-temperature-wind profile logged.', 'ok', 4);
        }
        const alt = z.altitude();
        // the lower corridor (stage 6): well below the starting flight level, where the Deepdiver keeps
        if (!g.flag('jupiter:lower') && this.refAlt !== null && alt < this.refAlt - 450) g.flag('jupiter:lower', 1);
        if (this.refAlt === null) this.refAlt = alt;
      }
    }
  }
  private refAlt: number | null = null;
  private lock = 0;
  private flyT = 0;

  droneEnded() {
    this.lock = 0.3;
    this.drone = null;
    this.setHud(null);
  }

  photoEnded() {
    this.lock = 0.3;
    this.photo = null;
    this.setHud(null);
    const cam = this.zone.game.camera;
    cam.fov = 70;
    cam.updateProjectionMatrix();
  }

  // ---- sampling
  /** what the sampler would take here (null: nothing in reach) */
  sampleHint(p: THREE.Vector3): string | null {
    const s = this.sampleTarget(p);
    return s ? s.label : null;
  }

  private sampleTarget(p: THREE.Vector3): { key: string; label: string; result: string; species?: string; at?: THREE.Vector3 } | null {
    const z = this.zone;
    const body = z.site.body;
    const F = z.fauna;
    const near = (sp: string, r: number) => F?.creatures.find((c) => c.species === sp && c.pos.distanceTo(p) < r * ((c as unknown as { size?: number }).size ?? 1));
    if (body === 'mars') {
      const R = z.refuge;
      if (R) {
        const ib = near('icebloom', 2.2);
        if (ib) return { key: 'mars:icebloom', label: 'core the ice beside the colony', species: 'icebloom', at: ib.pos,
          result: 'Ice core beside the colony: absorption bands near 440 and 680 nm in the red lamellae (pigment analogues — hypothetical); a 0.4 mm meltwater film; −6 °C.' };
        const fc = near('ferric', 4);
        if (fc) return { key: 'mars:biofilm', label: 'swab the cathedral biofilm', species: 'ferric', at: fc.pos,
          result: 'Biofilm swab: Fe²⁺-rich seep water against an oxidised lake — a redox gradient across a few centimetres; the film is densest where the two waters meet.' };
        if (p.y < R.waterLevel(p.x, p.z) - 0.3) return { key: 'mars:brine', label: 'sample the brine',
          result: `Brine: chloride and perchlorate salts (≈ ${(12 + 6 * Math.random()).toFixed(0)} %), ${(2 + 6 * Math.random()).toFixed(1)} °C, dissolved iron rising toward the vents.` };
        const q = R.local(p, _u);
        const [sx, sz] = L.skylight.c;
        if (Math.hypot(q.x - sx, q.z - sz) < L.skylight.r + 3 && q.y > 5) return { key: 'mars:ice', label: 'drill a borehole into the ice plug',
          result: 'Borehole through the skylight ice: a cavity below; the core shows a faint red absorption band from the light-side of the plug — something photosynthetic-like beneath.' };
        if (R.inside(p) > 0.5) return { key: 'mars:mineral', label: 'chip a mineral sample', result: 'Basalt with iron-oxide and carbonate crusts — water-altered minerals (observed on Mars from orbit and rovers).' };
      }
      return { key: 'mars:regolith', label: 'scoop a regolith sample', result: 'Regolith: basaltic fines, perchlorate ≈ 0.5 % (as found by Phoenix), no organics detected in the field kit.' };
    }
    if (body === 'jupiter') {
      if (near('colony', 60)) return { key: 'jupiter:colony', label: 'intake-sample the colony stand', species: 'colony',
        result: 'Colony sample: porous organic units 0.5–3 m, each with its own gas inclusions; soft adhesive links between neighbours — a community, not one body.' };
      const am = F?.creatures.find((c) => c.species === 'aeromite' && c.pos.distanceTo(p) < 180);
      if (am) return { key: 'jupiter:aerosol', label: 'sample the aerosol', species: 'aeromite',
        result: 'Aerosol sample: ammonia ice, NH₄SH haze — and centimetre-scale gold organisms with radiating hairs (speculative).' };
      return { key: 'jupiter:haze', label: 'sample the haze', result: 'Haze: ammonia ice crystals and ammonium hydrosulfide; no cells resolved by the field microscope.' };
    }
    return null;
  }

  sample(p: THREE.Vector3, byDrone: boolean) {
    const s = this.sampleTarget(p);
    const g = this.zone.game;
    if (!s) return;
    g.flag(`sample:${s.key}`, `${Math.round(g.state.clock.earthTime)}|${s.result}`);
    g.notify(`Sample ${byDrone ? '(drone) ' : ''}— ${s.result}`, 'ok', 8);
    g.audio.ui?.('click');
    // touching the fragile lamellae while coring tears them: the colony goes dormant (the codex records it)
    if (s.species === 'icebloom' && s.at && p.distanceTo(s.at) < 1.0) {
      const c = this.zone.fauna?.creatures.find((k) => k.species === 'icebloom' && k.pos === s.at) as unknown as { tear?: () => void } | undefined;
      c?.tear?.();
    }
    if (s.species) {
      const k = `bio:${s.species}:sample`;
      if (!g.flag(k)) g.flag(k, `${Math.round(g.state.clock.earthTime)}|Sampled: ${s.result}`);
    }
  }

  // ---- photo mode
  /** the expansion animal nearest the centre of the view (and in range) */
  tagInView(cam: THREE.PerspectiveCamera) {
    const F = this.zone.fauna;
    if (!F) return null;
    cam.getWorldDirection(_v);
    let best: { id: string | null; species: string; d: number } | null = null;
    let bs = 0.92 + 0.07 * (1 - cam.fov / 90);
    for (const c of F.creatures) {
      if (!c.root.visible) continue;
      _u.subVectors(c.pos, cam.position);
      const d = _u.length();
      if (d > 3000) continue;
      const dot = _u.normalize().dot(_v);
      if (dot > bs) {
        bs = dot;
        best = { id: SPECIES_EXPANSION[c.species] ? c.species : null, species: c.species, d };
      }
    }
    return best;
  }

  photoHud(cam: THREE.PerspectiveCamera, tag: { id: string | null; species: string; d: number } | null, fov: number) {
    const z = this.zone;
    const p = cam.position;
    const lines: string[] = [`PHOTO MODE   zoom ${(50 / fov).toFixed(1)}×   E capture · B exit · wheel or +/− zoom`];
    if (tag) {
      const d = tag.id ? SPECIES_EXPANSION[tag.id] : null;
      const c = z.fauna?.creatures.find((k) => k.species === tag.species);
      const size = c ? 2 * c.bodyR * ((c as unknown as { size?: number }).size ?? 1) : 0;
      lines.push(`${d ? `${d.name.toUpperCase()} — ${d.latin}${d.panel ? ' · ' + d.panel : ''}` : tag.species.toUpperCase()}   ${tag.d.toFixed(0)} m`);
      if (size) lines.push(`size ≈ ${size.toFixed(1)} m ± ${(size * 0.12 + tag.d * 0.004).toFixed(1)} m (optical estimate)`);
      if (d) lines.push(`field note: ${d.note}`);
    }
    if (z.refuge && z.refuge.inside(p) > 0.5) {
      const q = z.refuge.local(p, _u);
      const depth = z.refuge.waterLevel(p.x, p.z) - p.y;
      lines.push(`refuge cavern  x ${q.x.toFixed(0)}  z ${q.z.toFixed(0)}  level ${q.y.toFixed(1)} m${depth > 0 ? `  depth ${depth.toFixed(1)} m (≈ ${(0.0078 + depth * 0.0117).toFixed(2)} bar water head on cave air)` : ''}`);
    } else if (z.gas) {
      const alt = z.altitude();
      const pBar = Math.exp(-alt / 27000);
      const air = z.fauna?.air;
      const w = air ? air.wind(p, new THREE.Vector3()) : null;
      lines.push(`altitude ${(alt / 1000).toFixed(2)} km above 1 bar   ≈ ${pBar.toFixed(2)} bar   ≈ ${Math.round(165 * Math.pow(pBar, 0.19))} K` +
        (w ? `\nlocal wind (rel. to the jet) ${Math.hypot(w.x, w.z).toFixed(1)} m/s   vertical ${w.y >= 0 ? '+' : ''}${w.y.toFixed(1)} m/s` : ''));
    } else {
      lines.push(`site ${z.site.lat.toFixed(3)}°, ${z.site.lon.toFixed(3)}°`);
    }
    return lines.join('\n');
  }

  capture(tag: { id: string | null; species: string; d: number } | null) {
    const g = this.zone.game;
    // the frame as rendered (hide the HUD for the picture itself on the next frame is not needed: it is HTML)
    const url = g.renderer.screenshot();
    this.gallery.push({ at: g.state.clock.earthTime, species: tag?.id ?? null, url });
    const a = document.createElement('a');
    a.href = url;
    a.download = `field-photo-${tag?.id ?? 'scene'}-${this.gallery.length}.jpg`;
    a.click();
    if (tag?.id) {
      const k = `bio:${tag.id}:photo`;
      if (!g.flag(k)) g.flag(k, `${Math.round(g.state.clock.earthTime)}|Photographed at ${tag.d.toFixed(0)} m.`);
      g.flag(`photo:${tag.id}`, (Number(g.flag(`photo:${tag.id}`) ?? 0) || 0) + 1);
    }
    g.audio.ui?.('click');
  }

  dispose() {
    this.drone?.dispose();
    this.drone = null;
    this.hudEl?.remove();
    this.hudEl = null;
  }
}
