import * as THREE from 'three';
import { indexModel } from '../../render/Assets';
import type { EarthContent } from './EarthContent';
import { Site } from '../Site';
import { NASA } from '../../data/earthLayout';
import type { MusicMood } from '../../audio/Audio';
import { Loops, type LoopHandle } from '../../audio/Audio';
import { MissionClock } from '../../core/MissionClock';
import type { Surface } from '../Frame';
import type { ModelInstance } from '../../render/Assets';
import { h } from '../../ui/UI';
import { SPECS, deltaV } from '../../data/vehicles';

const LOW = -35;
const SILO_R = 16;

interface Mover {
  id: string;
  node: THREE.Object3D;
  colliders: string[];
  levels: number[]; // local y stops
  level: number;
  y: number;
  target: number;
  speed: number;
  bounds: THREE.Box3; // local footprint relative to node (frame-local updated each frame)
}

interface ScreenRt {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  draw: (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
}

/**
 * The secret NASA facility: gate, portal, tunnel, atrium, mission control, labs, elevator, silo, rocket, Ranger 1.
 */
export class NasaSite {
  site!: Site;
  gate!: Site;
  rocket!: ModelInstance;
  ranger!: ModelInstance;
  doors!: ModelInstance;
  readonly origin = new THREE.Vector3();
  movers: Mover[] = [];
  screens: ScreenRt[] = [];
  private screenT = 0;
  siloTopLocal = 60;
  siloOpen = 0;
  siloDoorsOpen = false;
  private hum: LoopHandle | null = null;
  private shaft: THREE.Mesh | null = null;

  constructor(readonly content: EarthContent) {}

  get game() {
    return this.content.game;
  }

  get zone() {
    return this.content.zone;
  }

  /** Ventilation stacks and the antenna mast on the hill above the portal; staff vehicles in the parking bays. */
  private async placeHillAndParking() {
    const game = this.game;
    const z = this.zone;
    try {
      const hill = await game.assets.load('nasa_hill');
      for (const hs of NASA.hillSites) {
        const src = hill.scene.getObjectByName(hs.kind);
        if (!src) continue;
        const node = src.clone(true);
        node.position.set(hs.x, z.height(hs.x, hs.z) - 0.25, hs.z);
        node.rotation.set(0, hs.yaw, 0);
        z.scene.add(node);
        node.updateMatrixWorld(true);
        const inst = indexModel(node);
        z.ground.physics.addModelColliders(inst, node.matrixWorld.clone(), 'all');
      }
    } catch (e) {
      console.warn('[nasa] hill structures unavailable', e);
    }
    // parked staff trucks in faded fleet colours (static, with box colliders)
    const tints: [number, number, number][] = [[0.62, 0.63, 0.64], [0.08, 0.09, 0.1], [0.55, 0.5, 0.4], [0.32, 0.36, 0.4]];
    for (let i = 0; i < NASA.parking.length; i++) {
      const [px, pz] = NASA.parking[i];
      const inst = await game.assets.instance('pickup');
      const tint = new THREE.Color(...tints[i % tints.length]);
      inst.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat?.name?.startsWith('car_paint')) {
          const c = mat.clone();
          c.color.copy(mat.name.startsWith('car_paint_blue') ? tint.clone().multiplyScalar(0.6) : tint);
          m.material = c;
        }
      });
      const y = z.height(px, pz);
      inst.root.position.set(px, y, pz);
      inst.root.rotation.y = (i % 2 ? 0.04 : -0.03);
      z.scene.add(inst.root);
      z.ground.physics.addBox(new THREE.Vector3(0.98, 0.6, 2.8), new THREE.Vector3(px, y + 0.9, pz), inst.root.quaternion.clone());
    }
  }

  async load() {
    const game = this.game;
    const z = this.zone;
    this.origin.set(NASA.portal.x, z.gen.portalLevel, NASA.portal.z);
    const inst = await game.assets.instance('nasa');
    this.site = new Site(game, inst, {
      name: 'nasa',
      frame: z.ground,
      parent: z.scene,
      placement: new THREE.Matrix4().makeTranslation(this.origin.x, this.origin.y, this.origin.z),
      lightPool: this.content.lightPool,
      groupsOn: ['*'],
      doorSound: 'blast',
      handlers: {
        blastdoor: (n) => (n.name === 'blast_L' ? null : null),
        blastpanel: (n) => ({
          id: 'nasa_blast_panel', targets: [n], label: () => (this.blastOpen ? 'Close blast doors' : 'Security panel — open blast doors'),
          use: () => this.toggleBlast(),
        }),
        slidedoor: (n, site) => {
          site.registerDoor(n, 'door', { kind: 'slide', angle: 6.2, speed: 0.35, sound: 'blast' });
          return null;
        },
        terminal: (n) => ({ id: `term:${n.userData.iid}`, targets: [n], label: () => `Use terminal — ${termTitle(n.userData.iid)}`, use: () => this.openTerminal(n.userData.iid) }),
        elevator: (n) => (n.name === 'elevator' ? null : { id: 'nasa_el_btn', targets: [n], label: () => `Elevator — ${this.elevatorAtTop() ? 'go down to the launch silo level' : 'go up to the atrium'}`, use: () => this.callMover('nasa_elevator') }),
        gantrylift: (n) => (n.name === 'gantry_lift' ? null : { id: 'gl_btn', targets: [n], label: () => `Gantry lift — ${this.mover('gantry_lift')?.level === 0 ? 'up to the crew access arm' : 'down to the silo floor'}`, use: () => this.callMover('gantry_lift') }),
      },
    });
    // blast doors are two sliding leaves driven together
    this.blastL = inst.nodes.get('blast_L')!;
    this.blastR = inst.nodes.get('blast_R')!;
    this.blastBaseL = this.blastL.position.clone();
    this.blastBaseR = this.blastR.position.clone();
    // gate
    const gi = await game.assets.instance('gate');
    const [gx, , gz] = NASA.gate.pos;
    const gm = new THREE.Matrix4().compose(new THREE.Vector3(gx, z.height(gx, gz), gz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), NASA.gate.yaw), new THREE.Vector3(1, 1, 1));
    this.gate = new Site(game, gi, {
      name: 'gate', frame: z.ground, parent: z.scene, placement: gm, lightPool: this.content.lightPool,
      handlers: {
        barrier: (n) => {
          this.barrier = n;
          return null;
        },
        gatebooth: (n) => ({
          id: 'gate_booth', targets: [n], label: () => 'Security booth — show credentials',
          use: () => {
            this.barrierOpen = true;
            game.say('capcom', 'Credentials verified. Welcome back, Commander. Proceed to the portal.', 5);
          },
        }),
      },
    });
    await this.placeHillAndParking();
    // movers
    this.addMover('nasa_elevator', inst.nodes.get('elevator')!, ['COL_elevator_deck'], [0, LOW], new THREE.Box3(new THREE.Vector3(-4.2, -1, -4.2), new THREE.Vector3(4.2, 3, 4.2)), 2.2);
    this.addMover('gantry_lift', inst.nodes.get('gantry_lift')!, ['COL_gl_deck'], [LOW, LOW + 64.8], new THREE.Box3(new THREE.Vector3(-1.0, -1, -0.8), new THREE.Vector3(1.0, 3, 0.8)), 3.5);
    // silo shaft from the hall ledge up to the terrain, plus the concealed doors at the top
    this.siloTopLocal = z.gen.siloTop - this.origin.y;
    this.buildShaft();
    // open the terrain over the shaft (the concealed doors sit on top of it)
    (z.terrain.uniforms.uHole.value as THREE.Vector4).set(NASA.silo.x, NASA.silo.z, SILO_R + 0.45, 0);
    this.doors = await game.assets.instance('silo_doors');
    const siloLocal = new THREE.Vector3(0, this.siloTopLocal, -(NASA.silo.z - NASA.portal.z) * -1);
    this.doors.root.position.set(NASA.silo.x, z.gen.siloTop - 0.2, NASA.silo.z);
    z.scene.add(this.doors.root);
    z.ground.physics.addModelColliders(this.doors, this.doors.root.matrixWorld.clone().compose(this.doors.root.position, this.doors.root.quaternion, new THREE.Vector3(1, 1, 1)), 'all');
    void siloLocal;
    // rocket + Ranger 1 on top (if Ranger 1 still mounted)
    this.rocket = await game.assets.instance('rocket');
    const base = inst.nodes.get('rocket_base')!.getWorldPosition(new THREE.Vector3());
    this.rocket.root.position.copy(base);
    z.scene.add(this.rocket.root);
    const r1 = game.state.vehicles.ranger1;
    if (r1 && r1.location === 'earth' && r1.data.mounted) {
      this.ranger = await game.assets.instance('ranger');
      this.mountRanger();
      z.scene.add(this.ranger.root);
      const board = this.rocket.nodes.get('adapter_door')!;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 2.4), new THREE.MeshBasicMaterial({ visible: false }));
      board.add(hit);
      game.interaction.add({
        id: 'board_ranger1', targets: [hit], range: 4,
        label: () => (game.state.mission.decision === 'endurance' ? 'Board Ranger 1 — begin launch preparation' : 'Board Ranger 1 (launch requires the Endurance mission decision)'),
        use: () => this.board(),
      });
    }
    // mission control & atrium screens
    for (const scr of inst.screens) this.addScreen(scr);
    this.hum = null;
  }

  // ------------------------------------------------------------------------------------------ geometry helpers
  private buildShaft() {
    const z = this.zone;
    const y0 = LOW + 14.8;
    const y1 = this.siloTopLocal;
    const hgt = Math.max(5, y1 - y0);
    const g = new THREE.CylinderGeometry(SILO_R + 0.5, SILO_R + 0.5, hgt, 48, Math.ceil(hgt / 6), true);
    const mat = this.game.materials.get('concrete')!.clone() as THREE.MeshStandardMaterial;
    mat.side = THREE.BackSide;
    const m = new THREE.Mesh(g, mat);
    m.position.set(NASA.silo.x, this.origin.y + y0 + hgt / 2, NASA.silo.z);
    m.userData.owned = true;
    m.receiveShadow = true;
    // metre-scale UVs on the cylinder
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * (SILO_R + 0.5), uv.getY(i) * hgt);
    z.scene.add(m);
    this.shaft = m;
    // rings & vertical service rails
    const ringMat = this.game.materials.get('metal_dark')!;
    for (let y = y0 + 8; y < y1 - 3; y += 9) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(SILO_R + 0.3, 0.18, 6, 64), ringMat);
      r.rotation.x = Math.PI / 2;
      r.position.set(NASA.silo.x, this.origin.y + y, NASA.silo.z);
      r.userData.owned = true;
      z.scene.add(r);
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, hgt, 8), this.game.materials.get(k % 2 ? 'pipe_blue' : 'steel_painted_white')!);
      p.position.set(NASA.silo.x + Math.cos(a) * (SILO_R + 0.2), this.origin.y + y0 + hgt / 2, NASA.silo.z + Math.sin(a) * (SILO_R + 0.2));
      p.userData.owned = true;
      z.scene.add(p);
    }
    // a few warm work lights up the shaft
    for (let y = y0 + 12; y < y1 - 4; y += 18) {
      const k = Math.floor(y);
      this.content.lightPool.add({
        pos: () => new THREE.Vector3(NASA.silo.x + Math.cos(k) * (SILO_R - 1), this.origin.y + y, NASA.silo.z + Math.sin(k) * (SILO_R - 1)),
        color: new THREE.Color(1, 0.86, 0.66), intensity: 30, distance: 30, on: () => true,
      });
    }
  }

  mountRanger() {
    const mount = this.rocket.nodes.get('ranger_mount')!;
    this.rocket.root.updateMatrixWorld(true);
    const mountW = mount.getWorldPosition(new THREE.Vector3());
    const r = this.ranger.root;
    // nose up: rotate the Ranger so its forward (-Z) points +Y
    r.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    r.position.set(0, 0, 0);
    r.updateMatrixWorld(true);
    const dock = this.ranger.nodes.get('dock_rear')!;
    const dockW = dock.getWorldPosition(new THREE.Vector3());
    r.position.copy(mountW).sub(dockW).add(new THREE.Vector3(0, 0.15, 0));
    r.updateMatrixWorld(true);
    // landing gear stowed for flight
    for (const k of ['gear_FL', 'gear_FR', 'gear_RL', 'gear_RR']) {
      const gnode = this.ranger.nodes.get(k);
      if (gnode) gnode.rotation.x = -Math.PI / 2;
    }
  }

  private addMover(id: string, node: THREE.Object3D, colliders: string[], levels: number[], bounds: THREE.Box3, speed: number) {
    if (!node) return;
    this.movers.push({ id, node, colliders, levels, level: 0, y: node.position.y, target: node.position.y, speed, bounds });
  }

  mover(id: string) {
    return this.movers.find((m) => m.id === id) ?? null;
  }

  elevatorAtTop() {
    const m = this.mover('nasa_elevator');
    return !m || m.level === 0;
  }

  callMover(id: string) {
    const m = this.mover(id);
    if (!m) return;
    if (m.y !== m.target) return;
    m.level = (m.level + 1) % m.levels.length;
    m.target = m.levels[m.level];
    this.game.audio.door('elevator', m.node.getWorldPosition(new THREE.Vector3()));
    this.game.audio.loop('elev_' + id, 'sfx', Loops.hum(48, 0.6, 220), { pos: m.node.getWorldPosition(new THREE.Vector3()), gain: 0.9 });
  }

  // ------------------------------------------------------------------------------------------ blast doors & gate
  private blastL!: THREE.Object3D;
  private blastR!: THREE.Object3D;
  private blastBaseL!: THREE.Vector3;
  private blastBaseR!: THREE.Vector3;
  blastOpen = false;
  private blastT = 0;
  private barrier: THREE.Object3D | null = null;
  barrierOpen = false;
  private barrierT = 0;

  toggleBlast() {
    this.blastOpen = !this.blastOpen;
    this.game.audio.door('blast', this.origin);
    this.game.say('computer', this.blastOpen ? 'Access authorised. Blast doors opening.' : 'Blast doors closing.', 4);
    if (this.blastOpen) this.zone.ground.physics.setDoorOpen('nasa_blast', true);
  }

  // ------------------------------------------------------------------------------------------ spawn & queries
  spawn(at: string): boolean {
    const p = this.game.player;
    const g = this.zone.ground;
    const node = at === 'nasa_mc' ? 'spawn_mc' : at === 'nasa_silo' ? 'spawn_silo' : at === 'nasa_atrium' ? 'spawn_atrium' : 'spawn_entry';
    const n = this.site.inst.nodes.get(node);
    if (!n) return false;
    const pos = this.site.localPos(n);
    if (at !== 'nasa' && at !== 'nasa_gate') {
      this.blastOpen = true;
      this.blastT = 1;
      this.zone.ground.physics.setDoorOpen('nasa_blast', true);
      this.site.toggleDoor('nasa_inner', true);
    }
    if (at === 'nasa_silo') {
      const el = this.mover('nasa_elevator');
      if (el) {
        el.level = 1;
        el.target = el.y = LOW;
      }
    }
    p.enterFrame(g, pos, at === 'nasa_mc' ? Math.PI / 2 : 0);
    return true;
  }

  contains(p: THREE.Vector3) {
    return this.site.roomAt(p) !== null;
  }

  surfaceAt(p: THREE.Vector3): Surface {
    const r = this.site.roomAt(p);
    if (r === 'nasa_silo' && p.y > this.origin.y + LOW + 1) return 'metal';
    return r === 'nasa_mc' || r?.startsWith('nasa_lab') ? 'concrete' : 'concrete';
  }

  describeHere(): { name: string; sub: string } | null {
    const p = this.game.player.pos;
    const r = this.site.roomAt(p.clone().add(new THREE.Vector3(0, 1, 0)));
    const names: Record<string, string> = {
      nasa_tunnel: 'Entry tunnel', nasa_atrium: 'Central atrium', nasa_mc: 'Mission control', nasa_labs: 'Laboratory wing', nasa_greenhouse: 'Experimental greenhouse',
      nasa_briefing: 'Crew briefing room', nasa_workshop: 'Engineering workshop', nasa_lifesupport: 'Life-support plant', nasa_computers: 'Computer centre', nasa_storage: 'Equipment storage',
      nasa_lower: 'Hangar level', nasa_silo: 'Launch silo',
    };
    if (r) {
      if (r === 'nasa_mc') this.game.flag('visitedMissionControl', true);
      if (!this.game.state.flags.enteredNasa) {
        this.game.flag('enteredNasa', true);
        this.game.notify('You are inside the facility. Mission control is west of the atrium; the launch silo is below.', 'info', 7);
      }
      return { name: 'NASA — LAZARUS PROGRAM', sub: names[r] ?? 'Facility' };
    }
    if (p.distanceTo(this.origin) < 160) return { name: 'FACILITY 12', sub: 'Restricted area' };
    return null;
  }

  musicMood(): MusicMood | null {
    const r = this.site.roomAt(this.game.player.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    if (!r) return null;
    return r === 'nasa_silo' ? 'launch' : 'facility';
  }

  // ------------------------------------------------------------------------------------------ boarding & launch
  board() {
    const game = this.game;
    if (game.state.mission.decision !== 'endurance') {
      game.notify('Director Kessler must authorise the Endurance mission first (mission control).', 'warn', 6);
      return;
    }
    const launch = (this.zone as any).startLaunch as ((n: NasaSite) => void) | undefined;
    if (launch) launch.call(this.zone, this);
    else game.notify('Launch systems unavailable.', 'alert');
  }

  // ------------------------------------------------------------------------------------------ terminals
  openTerminal(iid: string) {
    const game = this.game;
    game.input.releaseLock();
    game.ui.openPanel(`MISSION CONTROL — ${termTitle(iid).toUpperCase()}`, (b) => {
      const render = () => {
        b.innerHTML = '';
        b.append(terminalContent(this, iid));
      };
      render();
      const iv = setInterval(() => (b.isConnected ? render() : clearInterval(iv)), 1000);
    }, { onClose: () => game.input.requestLock() });
  }

  computerTabs() {
    const inside = this.site.roomAt(this.game.player.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    if (!inside && this.game.player.pos.distanceTo(this.origin) > 300) return [];
    return [{ id: 'nasa', label: 'LAZARUS PROGRAM', build: (b: HTMLElement) => b.append(decisionPanel(this)) }];
  }

  decide(choice: 'research' | 'endurance') {
    const game = this.game;
    game.state.mission.decision = choice;
    game.log('mission', 'KESSLER', choice === 'endurance' ? 'Endurance mission authorised. Crew to the silo.' : 'Mission held. Research continues on Earth.');
    if (choice === 'endurance') {
      game.flag('launchEarthTime', game.state.clock.earthTime);
      game.say('kessler', 'Then it is decided. Ranger 1 is fuelled on the pad. Your crew will meet you at the silo. Godspeed, Commander.', 8);
      (this.content as any).people?.gatherForLaunch?.();
      game.notify('Go to the launch silo (elevator north of the atrium → gantry lift → crew access arm) and board Ranger 1.', 'ok', 10);
    } else {
      game.say('kessler', 'Then we keep working. The pad stays ready — the decision is yours whenever you want it.', 7);
    }
  }

  // ------------------------------------------------------------------------------------------ screens
  private addScreen(mesh: THREE.Mesh) {
    const w = mesh.userData.sw ?? 1, hh = mesh.userData.sh ?? 0.6;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1024, Math.max(256, Math.round(w * 140)));
    canvas.width = scale;
    canvas.height = Math.max(64, Math.round((scale * hh) / w));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.flipY = false; // glTF already flips V: with three's default flipY the canvas would show upside down
    mesh.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const name = mesh.name;
    const draw = name === 'screen_mc_main' || name === 'screen_atrium' ? drawOrbitScreen(this) : name.startsWith('screen_mc_') ? drawTelemetry(this, name) : drawGeneric(this, name);
    this.screens.push({ mesh, canvas, tex, draw });
  }

  // ------------------------------------------------------------------------------------------ update
  update(dt: number) {
    const game = this.game;
    // blast doors slide apart into the piers (6.5 s)
    const tgt = this.blastOpen ? 1 : 0;
    if (this.blastT !== tgt) {
      this.blastT = THREE.MathUtils.clamp(this.blastT + Math.sign(tgt - this.blastT) * dt / 6.5, 0, 1);
      const e = this.blastT * this.blastT * (3 - 2 * this.blastT);
      this.blastL.position.copy(this.blastBaseL).add(new THREE.Vector3(-5.2 * e, 0, 0));
      this.blastR.position.copy(this.blastBaseR).add(new THREE.Vector3(5.2 * e, 0, 0));
      if (this.blastT === 0) this.zone.ground.physics.setDoorOpen('nasa_blast', false);
    }
    // auto-open the gate barrier when the player approaches (permanent Creative authorisation)
    if (this.barrier) {
      const gp = new THREE.Vector3(NASA.gate.pos[0], 0, NASA.gate.pos[2]);
      const ctrl = game.control as any;
      const pp = ctrl?.root?.position ?? game.player.pos;
      if (Math.hypot(pp.x - gp.x, pp.z - gp.z) < 28 && !this.barrierOpen) {
        this.barrierOpen = true;
        game.audio.beep(880, 0.15, 0.06, 'sine', gp);
      }
      const bt = this.barrierOpen ? 1 : 0;
      if (this.barrierT !== bt) {
        this.barrierT = THREE.MathUtils.clamp(this.barrierT + Math.sign(bt - this.barrierT) * dt / 2.5, 0, 1);
        this.barrier.rotation.z = this.barrierT * 1.45;
        this.zone.ground.physics.setDoorOpen('gate_barrier', this.barrierT > 0.5);
      }
    }
    // auto-open the portal for an approaching player who has passed the gate
    if (!this.blastOpen && game.player.pos.distanceTo(this.origin) < 12 && game.state.flags.reachedNasa) {
      this.toggleBlast();
    }
    // movers (elevator / gantry lift) carrying the player
    const player = game.player;
    for (const m of this.movers) {
      if (m.y === m.target) continue;
      const dy = THREE.MathUtils.clamp(m.target - m.y, -m.speed * dt, m.speed * dt);
      const nodeW = m.node.getWorldPosition(new THREE.Vector3());
      const local = player.pos.clone().sub(nodeW);
      const onboard = player.frame === this.zone.ground && local.x > m.bounds.min.x && local.x < m.bounds.max.x && local.z > m.bounds.min.z && local.z < m.bounds.max.z && local.y > -0.8 && local.y < 2.5;
      m.y += dy;
      m.node.position.y = m.y;
      m.node.updateMatrixWorld(true);
      for (const cn of m.colliders) {
        for (const c of this.site.colliderMap.get(cn) ?? []) {
          const t = c.translation();
          c.setTranslation({ x: t.x, y: t.y + dy, z: t.z });
        }
      }
      if (onboard) player.pos.y += dy;
      (this.content as any).people?.carry?.(nodeW, m.bounds, dy);
      if (m.y === m.target) {
        game.audio.stopLoop('elev_' + m.id, 0.4);
        game.audio.door('elevator', m.node.getWorldPosition(new THREE.Vector3()));
      }
    }
    // silo doors
    const st = this.siloDoorsOpen ? 1 : 0;
    if (this.siloOpen !== st) {
      this.siloOpen = THREE.MathUtils.clamp(this.siloOpen + Math.sign(st - this.siloOpen) * dt / 9, 0, 1);
      const e = this.siloOpen * this.siloOpen * (3 - 2 * this.siloOpen);
      for (const [nm, side] of [['silodoor_L', -1], ['silodoor_R', 1]] as const) {
        const d = this.doors.nodes.get(nm);
        if (d) d.position.x = side * (0.02 + e * (SILO_R + 1.5));
      }
      this.zone.ground.physics.setDoorOpen('silo_doors', this.siloOpen > 0.3);
    }
    // screens (2 Hz)
    this.screenT -= dt;
    const cam0 = game.camera.position;
    const stale = this.screens.some((s) => !(s as any).fresh && s.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(cam0) < 70);
    if (this.screenT <= 0 || stale) {
      this.screenT = 0.5;
      const cam = game.camera.position;
      for (const s of this.screens) {
        if (s.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(cam) > 70) {
          (s as any).fresh = false;
          continue;
        }
        const g = s.canvas.getContext('2d')!;
        s.draw(g, s.canvas.width, s.canvas.height, this.zone.time);
        s.tex.needsUpdate = true;
        (s as any).fresh = true;
      }
    }
    // facility hum
    const inside = this.content.indoorRoom === 'nasa';
    const a = game.audio;
    if (a.ctx) {
      if (inside && !this.hum) this.hum = a.loop('nasa_hum', 'ambience', Loops.hum(60, 0.35, 420), { gain: 0.9 });
      else if (!inside && this.hum) {
        this.hum.stop(1);
        this.hum = null;
      }
    }
  }
}

// ============================================================================================ terminals & screens
const TERMS: Record<string, string> = {
  mc_telemetry: 'Spacecraft telemetry', mc_orbits: 'Orbital trajectories', mc_fuel: 'Fuel predictions', mc_crew: 'Crew status', mc_config: 'Spacecraft configuration',
  mc_saturn: 'Saturn navigation', mc_wormhole: 'Wormhole research', mc_planets: 'Lazarus planetary data', mc_countdown: 'Launch countdown', mc_environment: 'Environmental conditions',
  mc_eng: 'Flight engineering', mc_sci: 'Science desk', mc_med: 'Flight surgeon', mc_dir: 'Program director',
  lab_greenhouse: 'Greenhouse control', lab_briefing: 'Mission briefing', lab_workshop: 'Engineering workshop', lab_lifesupport: 'Life-support plant', lab_computers: 'Computer centre',
};
function termTitle(iid: string) {
  return TERMS[iid] ?? 'Terminal';
}

function kv(rows: [string, string][]) {
  const el = h('div', { class: 'kv' });
  for (const [k, v] of rows) el.append(h('span', {}, k), h('span', {}, v));
  return el;
}

function terminalContent(n: NasaSite, iid: string): HTMLElement {
  const st = n.game.state;
  const e = st.vehicles.endurance;
  const r1 = st.vehicles.ranger1;
  const card = (t: string, ...c: (HTMLElement | string)[]) => h('div', { class: 'card' }, h('h3', {}, t), ...c);
  const grid = h('div', { class: 'grid2' });
  const date = MissionClock.formatDate(st.clock.earthTime);
  switch (iid) {
    case 'mc_telemetry':
      grid.append(card('ENDURANCE', kv([['Orbit', 'LEO 420 km × 420 km'], ['Inclination', '28.6°'], ['Period', '92.8 min'], ['Ring rotation', `${(st.endurance.omega * 60 / (2 * Math.PI)).toFixed(2)} rpm`], ['Ring gravity (r=32 m)', `${(st.endurance.omega ** 2 * 32 / 9.81).toFixed(2)} g`], ['Docked craft', 'Ranger 2, Lander 1, Lander 2']])),
        card('RANGER 1 (PAD)', kv([['Status', r1.data.mounted ? 'Mated to launch vehicle' : 'Away'], ['Propellant', `${Math.round(r1.fuel).toLocaleString()} kg`], ['Δv (own)', `${(deltaV(SPECS.ranger, r1.fuel) / 1000).toFixed(2)} km/s`], ['Cabin', 'Pressurised · 101 kPa']])));
      break;
    case 'mc_orbits':
      grid.append(card('PARKING ORBIT', kv([['Semi-major axis', '6 791 km'], ['Eccentricity', '0.0004'], ['Next launch window', 'continuous (Creative)'], ['Phase angle to Endurance', 'computed at ignition']])),
        card('EARTH → SATURN (FAST TRANSFER)', kv([['Time of flight', '≈ 2.0 years'], ['Departure Δv', '≈ 15–18 km/s (Lambert)'], ['Arrival', 'wormhole vicinity, Saturn orbit'], ['Hohmann alternative', '6.1 years, 15.7 km/s total']])));
      break;
    case 'mc_fuel':
      grid.append(card('LAUNCH VEHICLE', kv([['Stage 1', 'RP-1/LOX · 5 engines · 410 t'], ['Stage 2', 'LH2/LOX · 1 engine · 96 t'], ['Ranger (payload)', '41 t wet'], ['Orbit margin', '+4.2 %']])),
        card('ENDURANCE', kv([['Propellant', `${Math.round(e.fuel / 1000).toLocaleString()} t`], ['Main drive Isp', `${SPECS.endurance.mainIsp.toLocaleString()} s (fictional fusion drive)`], ['Δv budget', `${(deltaV(SPECS.endurance, e.fuel) / 1000).toFixed(1)} km/s`]])));
      break;
    case 'mc_crew':
    case 'mc_med':
      grid.append(card('CREW', kv([['Commander', 'You'], ['Flight systems', 'E. Ward — nominal'], ['Planetary science', 'H. Sato — nominal'], ['Mission & medical', 'A. Reyes — nominal'], ['Cryo readiness', '4 pods certified']])));
      break;
    case 'mc_config':
    case 'mc_eng':
      grid.append(card('STACK', kv([['Launch vehicle', '2 stages + adapter'], ['Payload', 'Ranger 1 (nose-up mount)'], ['Endurance ports', 'FWD: free (for Ranger 1) · AFT: Ranger 2 · TOP/BOTTOM: Landers'], ['Ring modules', '12 (4 engines, 2 habitats, command, cryo-lab, 4 landing pods)']])));
      break;
    case 'mc_saturn':
      grid.append(card('SATURN ARRIVAL', kv([['Distance (now)', '≈ 9.5 AU'], ['Light time', '≈ 79 min'], ['Wormhole position', 'co-orbiting Saturn, ~2.1 million km trailing'], ['Approach', 'capture into Saturn orbit, then low-Δv drift to the anomaly']])));
      break;
    case 'mc_wormhole':
      grid.append(card('ANOMALY', kv([['Discovered', '48 years ago'], ['Apparent diameter', '≈ 2 km sphere'], ['Lensing', 'consistent with a traversable (Ellis-type) throat'], ['Status', 'SPECULATIVE PHYSICS — modelled, not proven']])),
        card('NOTES', h('div', { class: 'dim', style: { fontSize: '12px', lineHeight: '1.6' } }, 'Light passing near the sphere shows a distorted image of another star field — a galaxy no telescope here can see directly. Probes sent through return data from a system with a supermassive rotating black hole (designated Gargantua).')));
      break;
    case 'mc_planets':
      grid.append(card('MILLER', kv([['Type', 'Ocean world, ~1 m deep'], ['Gravity', '1.30 g'], ['Time dilation', '1 h ≈ 7 Earth years'], ['Beacon', 'positive (intermittent)']])),
        card('MANN', kv([['Type', 'Ice world, ammonia atmosphere'], ['Gravity', '0.80 g'], ['Beacon', 'positive — strong data'], ['Notes', 'Lead scientist of the program']])),
        card('EDMUNDS', kv([['Type', 'Rocky desert, breathable traces'], ['Gravity', '0.95 g'], ['Beacon', 'stopped transmitting'], ['Notes', 'Promising early data']])));
      break;
    case 'mc_countdown':
      grid.append(card('LAUNCH SEQUENCE', kv([['Decision', st.mission.decision === 'endurance' ? 'GO' : 'HOLD'], ['Ranger 1', r1.data.mounted ? 'on pad' : 'launched'], ['Silo doors', n.siloDoorsOpen ? 'OPEN' : 'closed'], ['Range', 'clear'], ['Earth time', date]])));
      break;
    case 'mc_environment':
      grid.append(card('SURFACE CONDITIONS', kv([['Dust storm', `${Math.round(n.zone.storm * 100)} %`], ['Wind', `${Math.round(8 + n.zone.storm * 60)} km/h`], ['Visibility', `${(20 - n.zone.storm * 19).toFixed(1)} km`], ['Particulates', `${Math.round(40 + n.zone.storm * 900)} µg/m³`]])));
      break;
    case 'mc_dir':
    case 'mc_sci':
    case 'lab_briefing':
      grid.append(decisionPanel(n));
      break;
    default:
      grid.append(card(termTitle(iid).toUpperCase(), h('div', { class: 'dim' }, labText(iid))));
  }
  return grid;
}

function labText(iid: string) {
  switch (iid) {
    case 'lab_greenhouse': return 'Hydroponic corn and soybean trials under controlled atmosphere. Blight resistance: 41 % of strains survive past week six. Seed vault samples are packed for the colony module.';
    case 'lab_workshop': return 'Spare Ranger landing leg under inspection (retraction cylinder seal replaced). RCS pod RF-31D bench-tested: 98.6 % nominal thrust.';
    case 'lab_lifesupport': return 'Scrubbers nominal. O₂ reserve 31 days. Filtration load elevated by dust ingress during storms.';
    case 'lab_computers': return 'Trajectory computation cluster: 14 racks online. Gravitational data from the anomaly is being processed for the population-transfer equations.';
    default: return 'Terminal online.';
  }
}

function decisionPanel(n: NasaSite): HTMLElement {
  const st = n.game.state;
  const wrap = h('div', { class: 'card' }, h('h3', {}, 'MISSION DECISION'));
  wrap.append(h('div', { style: { fontSize: '13px', lineHeight: '1.6', marginBottom: '12px' } },
    'Endurance waits in orbit with Ranger 2 and both Landers docked. Ranger 1 is mated to the launch vehicle in the silo. The Lazarus beacons from beyond the wormhole are still transmitting. There is no deadline: you may continue research on Earth for as long as you like.'));
  const state = h('div', { class: 'mono', style: { marginBottom: '10px', color: 'var(--data)' } }, `Current: ${st.mission.decision === 'undecided' ? 'PENDING' : st.mission.decision === 'research' ? 'RESEARCH ON EARTH' : 'ENDURANCE MISSION — GO'}`);
  wrap.append(state);
  wrap.append(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
    n.game.ui.button('CONTINUE RESEARCH ON EARTH', () => { n.decide('research'); state.textContent = 'Current: RESEARCH ON EARTH'; }, 'btn'),
    n.game.ui.button('BEGIN ENDURANCE MISSION', () => { n.decide('endurance'); state.textContent = 'Current: ENDURANCE MISSION — GO'; }, 'btn primary'),
  ));
  return wrap;
}

function drawOrbitScreen(n: NasaSite) {
  return (g: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    g.fillStyle = '#04090d';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(80,140,170,0.15)';
    g.lineWidth = 1;
    for (let x = 0; x < W; x += W / 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += H / 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const cx = W * 0.32, cy = H * 0.55, R = H * 0.22;
    const grd = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    grd.addColorStop(0, '#5d8fb3'); grd.addColorStop(1, '#16324a');
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#9fd4ea';
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(cx, cy, R * 1.5, R * 1.25, -0.2, 0, Math.PI * 2); g.stroke();
    const a = t * 0.25;
    const ex = cx + Math.cos(a) * R * 1.5 * Math.cos(-0.2) - Math.sin(a) * R * 1.25 * Math.sin(-0.2);
    const ey = cy + Math.cos(a) * R * 1.5 * Math.sin(-0.2) + Math.sin(a) * R * 1.25 * Math.cos(-0.2);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(ex, ey, 6, 0, Math.PI * 2); g.fill();
    g.font = `${Math.round(H * 0.045)}px JetBrains Mono, monospace`;
    g.fillText('ENDURANCE', ex + 10, ey - 8);
    // transfer arc to Saturn
    g.strokeStyle = '#e8c070';
    g.setLineDash([10, 8]);
    g.beginPath(); g.ellipse(W * 0.62, H * 0.55, W * 0.32, H * 0.36, 0, Math.PI * 0.95, Math.PI * 2.0); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#e8c070';
    g.beginPath(); g.arc(W * 0.94, H * 0.55, H * 0.045, 0, Math.PI * 2); g.fill();
    g.fillText('SATURN / ANOMALY', W * 0.72, H * 0.42);
    g.fillStyle = '#9fd4ea';
    g.font = `${Math.round(H * 0.06)}px Michroma, sans-serif`;
    g.fillText('LAZARUS / ENDURANCE', W * 0.03, H * 0.1);
    g.font = `${Math.round(H * 0.04)}px JetBrains Mono, monospace`;
    g.fillStyle = '#ecebe6';
    g.fillText(MissionClock.formatDate(n.game.state.clock.earthTime), W * 0.03, H * 0.17);
    g.fillText(`DECISION: ${n.game.state.mission.decision.toUpperCase()}`, W * 0.03, H * 0.95);
  };
}

function drawTelemetry(n: NasaSite, name: string) {
  const seed = name.length;
  return (g: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    g.fillStyle = '#050b0e';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#4fb6dc';
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x < W; x += 4) {
      const y = H * 0.55 + Math.sin(x * 0.03 + t * 1.5 + seed) * H * 0.18 * Math.sin(x * 0.005 + seed) + Math.sin(x * 0.11 + t * 3) * H * 0.03;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = '#9fd4ea';
    g.font = `${Math.round(H * 0.12)}px JetBrains Mono, monospace`;
    const labels = ['O2 PARTIAL', 'BUS A VOLTS', 'LOX TEMP', 'CH4 PRESS', 'GUIDANCE', 'COMM LINK'];
    g.fillText(labels[seed % labels.length], W * 0.04, H * 0.18);
    g.fillStyle = '#ecebe6';
    g.fillText((Math.sin(t * 0.7 + seed) * 3 + 21 + seed).toFixed(2), W * 0.04, H * 0.34);
    void n;
  };
}

function drawGeneric(n: NasaSite, name: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number, t: number) => {
    g.fillStyle = '#071015';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#9fd4ea';
    g.font = `${Math.round(H * 0.11)}px JetBrains Mono, monospace`;
    const lines = name.includes('checkpoint') ? ['ACCESS CONTROL', 'CREDENTIAL: COMMANDER', 'CLEARANCE: ALL AREAS', 'STATUS: GRANTED'] : ['CREW BRIEFING', 'ENDURANCE — LAZARUS', 'T-0: ON DECISION', MissionClock.formatDate(n.game.state.clock.earthTime)];
    lines.forEach((l, i) => g.fillText(l, W * 0.05, H * (0.2 + i * 0.2)));
    g.fillStyle = `rgba(159,212,234,${0.5 + 0.5 * Math.sin(t * 4)})`;
    g.fillRect(W * 0.05, H * 0.88, W * 0.06, H * 0.05);
  };
}
