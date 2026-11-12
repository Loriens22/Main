import * as THREE from 'three';
import type SurfaceZone from '../zones/SurfaceZone';
import { NPC } from '../../npc/NPC';
import { DialogueRunner } from '../../npc/Dialogue';
import { LAZARUS_DIALOGUES } from '../../data/lazarus';
import { h } from '../../ui/UI';
import { Site } from '../Site';
import { LightPool } from '../../render/LightPool';
import type { Interactable } from '../../interact/Interaction';
import type { SurfaceSite } from '../../space/surfaceFrame';
import type { SurfaceDef } from '../../data/landing';
import type { TerrainPad } from './SurfaceGen';

/**
 * The Lazarus explorers' sites on the Gargantua worlds (original story content for this game's timeline).
 *   Miller  — her capsule lies tilted in the shallows near the beacon, Dr. Laura Miller alive beside it. She will not
 *             leave without her data recorder (inside the capsule); then she follows you to the Ranger. The waves
 *             keep coming meanwhile.
 *   Mann    — his camp on the glacier (model mann_camp.glb): a long rust-orange ribbed hab half-buried in a drift,
 *             an airlock porch, the beacon; inside, Dr. Mann asleep in the cryo pod. His survey terminal holds both
 *             the summaries he broadcast and the raw logs. Wake him, read them, decide whether he comes along.
 *   Edmunds — his camp among the boulder piles (edmunds_camp.glb): a silent beacon, the lantern hab with his log and
 *             a greenhouse still growing in local soil, his lander, rover and lab module, and at the foot of the
 *             boulder ridge the place his last walk ended.
 * Both camps stand on levelled ground (terrain pads, LazarusSite.pads) and are Sites: colliders, sliding/hinged
 * doors, lamp groups (camp lights come on at dusk), rooms, and the story props as `interact=lazarus` nodes.
 * Flags (game.flag): miller_recorder, miller_rescued, mann_awake, mann_logs_read, mann_aboard, mann_left,
 * edmunds_log, edmunds_soil, edmunds_fate. Rescued explorers ride in Ranger 1 (npc.aboard = 'ranger1').
 */
type Prop = { id: string; label: () => string | null; use: () => void; target: THREE.Object3D; range?: number };
type CampProp = { label: () => string | null; use: () => void; range?: number };

/** Camp placements (frame-local metres from the landing point) and their levelled pads. */
const CAMPS: Record<string, { x: number; z: number; r: number; blend: number; model: string; view: [number, number] }> = {
  // view: the direction (Blender x, y in the model) from which the camp faces the landing point
  mann: { x: -58, z: 46, r: 36, blend: 14, model: 'mann_camp', view: [-0.35, -1] },
  edmunds: { x: 52, z: 58, r: 33, blend: 18, model: 'edmunds_camp', view: [-0.3, -1] },
};

export class LazarusSite {
  readonly root = new THREE.Group();
  private colliders: import('@dimforge/rapier3d-compat').Collider[] = [];
  private props: string[] = [];
  private npcs: NPC[] = [];
  private beacons: { light: THREE.PointLight; lens: THREE.Mesh; period: number; on: number }[] = [];
  private dialogue: DialogueRunner;
  private t = 0;
  private spoke = new Set<string>();
  /** the camp model (Mann, Edmunds) */
  camp: Site | null = null;
  private pool: LightPool | null = null;
  private campInv = new THREE.Matrix4();
  private campProps: Record<string, CampProp> = {};
  private nightGroups: string[] = [];
  private nightOn: boolean | null = null;
  private lid: { node: THREE.Object3D; t: number; open: boolean } | null = null;

  constructor(readonly zone: SurfaceZone) {
    this.dialogue = new DialogueRunner(zone.game);
  }

  get game() {
    return this.zone.game;
  }

  /** landing at the beacon site (first named site) of a Gargantua world */
  static atBeacon(site: SurfaceSite, def: SurfaceDef) {
    if (!['miller', 'mann', 'edmunds'].includes(site.body)) return false;
    const first = def.sites[0];
    return Math.abs(site.lat - first.lat) < 0.5 && Math.abs(site.lon - first.lon) < 0.5;
  }

  /** levelled ground under the camp (passed to the terrain generator before the maps are built) */
  static pads(site: SurfaceSite, def: SurfaceDef): TerrainPad[] | undefined {
    const c = CAMPS[site.body];
    if (!c || !LazarusSite.atBeacon(site, def)) return undefined;
    return [{ x: c.x, z: c.z, r: c.r, blend: c.blend }];
  }

  /** The beacon site of a Gargantua world (first named site), or null. */
  static async create(zone: SurfaceZone): Promise<LazarusSite | null> {
    const body = zone.site.body;
    if (!LazarusSite.atBeacon(zone.site, zone.def)) return null;
    const s = new LazarusSite(zone);
    zone.scene.add(s.root);
    if (body === 'miller') await s.buildMiller();
    else if (body === 'mann') await s.buildMann();
    else await s.buildEdmunds();
    return s;
  }

  /**
   * Place a camp model on its pad, facing the landing point; boulder piles and the ice cliff (snap_* nodes) are
   * dropped onto the natural ground where they reach past the pad. Returns the Site.
   */
  private async placeCamp(body: string, opts: { groupsOn: string[]; nightGroups: string[]; doorSound: 'airlock' | 'hatch' | 'wood'; glow?: Record<string, number> }) {
    const c = CAMPS[body];
    const inst = await this.game.assets.instance(c.model);
    const y0 = this.y(c.x, c.z);
    // model +Z (Blender -Y) is its front; turn the camp so `view` points at the landing point
    const toLander = Math.atan2(-c.x, -c.z);
    const viewAng = Math.atan2(c.view[0], -c.view[1]);
    const yaw = toLander - viewAng;
    const placement = new THREE.Matrix4().compose(new THREE.Vector3(c.x, y0, c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    inst.root.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    for (const [, n] of inst.nodes) {
      if (!n.userData.snap) continue;
      p.setFromMatrixPosition(n.matrixWorld).applyMatrix4(placement);
      n.position.y += this.y(p.x, p.z) - y0;
      n.updateMatrixWorld(true);
    }
    this.pool = new LightPool(this.root, this.game.settings.graphics.shadowQuality >= 2 ? 6 : 4);
    const site = new Site(this.game, inst, {
      name: c.model,
      frame: this.zone.ground,
      parent: this.root,
      placement,
      lightPool: this.pool,
      doorSound: opts.doorSound,
      groupsOn: opts.groupsOn,
      handlers: {
        lazarus: (n) => this.campInteract(n),
        slidedoor: (n, st) => {
          st.registerDoor(n, 'door', { kind: 'slide', angle: n.userData.travel ?? 1.0, speed: 0.9, sound: 'airlock' });
          return null;
        },
      },
    });
    this.campInv.copy(placement).invert();
    // interior strip lights: softer than the default lamp glow (white rooms bloom)
    for (const [gname, k] of Object.entries(opts.glow ?? {})) {
      const g = site.groups.get(gname);
      if (g?.material) g.material.emissiveIntensity = k;
    }
    this.nightGroups = opts.nightGroups;
    this.camp = site;
    return site;
  }

  private campInteract(n: THREE.Object3D): Interactable | null {
    const iid = n.userData.iid as string;
    const id = `lazarus:${iid}`;
    return {
      id,
      targets: [n],
      range: this.campProps[iid]?.range ?? 2.6,
      label: () => this.campProps[iid]?.label() ?? null,
      use: () => this.campProps[iid]?.use(),
    };
  }

  /** the camp room containing a frame-local point, or null */
  indoorAt(p: THREE.Vector3) {
    return this.camp?.roomAt(p) ?? null;
  }

  /** frame-local position of a camp node */
  spot(name: string) {
    const n = this.camp?.node(name);
    return n ? this.camp!.localPos(n) : null;
  }

  // ------------------------------------------------------------------------------------------------ helpers
  private mat(name: string, fallback = 0x888888) {
    return this.game.materials.get(name) ?? new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.6 });
  }
  private y(x: number, z: number) {
    return this.zone.terrainY(x, z);
  }
  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** a static box collider for an oriented object part (half extents in its local frame) */
  private collide(o: THREE.Object3D, half: THREE.Vector3, offset = new THREE.Vector3()) {
    o.updateWorldMatrix(true, false);
    const p = offset.clone().applyMatrix4(o.matrixWorld);
    const q = new THREE.Quaternion();
    o.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    this.colliders.push(this.zone.ground.physics.addBox(half, p, q));
  }
  private prop(p: Prop) {
    this.props.push(p.id);
    this.game.interaction.add({ id: p.id, targets: [p.target], range: p.range ?? 2.6, label: p.label, use: p.use });
  }
  private beacon(parent: THREE.Object3D, x: number, y: number, z: number, height: number, color: number, period: number, lit: boolean) {
    const mast = this.mesh(new THREE.CylinderGeometry(0.05, 0.08, height, 8), this.mat('metal_gray'), parent, x, y + height / 2, z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const guy = this.mesh(new THREE.CylinderGeometry(0.008, 0.008, height * 1.05, 4), this.mat('metal_dark'), parent, x + Math.cos(a) * height * 0.22, y + height * 0.48, z + Math.sin(a) * height * 0.22);
      guy.lookAt(new THREE.Vector3(x, y + height, z).add(parent.position));
      guy.rotateX(Math.PI / 2);
    }
    const lens = this.mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 0 }), parent, x, y + height + 0.12, z);
    const light = new THREE.PointLight(color, 0, 60, 2);
    light.position.copy(lens.position);
    parent.add(light);
    if (lit) this.beacons.push({ light, lens, period, on: 0.18 });
    return mast;
  }
  private say(who: string, text: string, key?: string) {
    if (key) {
      if (this.spoke.has(key)) return;
      this.spoke.add(key);
    }
    this.zone.say(who, text);
  }
  private readPanel(title: string, lines: [string, string][]) {
    const game = this.game;
    game.input.releaseLock();
    game.ui.openPanel(title, (b) => {
      for (const [head, body] of lines) b.append(h('div', { style: { margin: '10px 0' } }, h('div', { class: 'mono', style: { fontSize: '12px', opacity: '0.75' } }, head), h('div', { style: { marginTop: '4px', lineHeight: '1.5' } }, body)));
    }, { narrow: true, onClose: () => game.input.requestLock() });
  }
  private async npc(id: string, x: number, z: number, yaw: number) {
    const st = this.game.state.npcs[id];
    if (!st) return null;
    st.frame = `surface:${this.zone.site.body}`;
    const n = await new NPC(this.game, st, this.zone.ground).init();
    n.groundMode = 'fn';
    n.groundFn = (p) => this.y(p.x, p.z);
    n.pos.set(x, this.y(x, z), z);
    n.yaw = yaw;
    n.sync();
    this.npcs.push(n);
    this.game.interaction.add({
      id: `npc:${id}`, targets: [n.body.root], range: 3.2,
      label: () => (n.visible ? `Talk to ${n.def.name}` : null),
      use: () => this.talk(n),
    });
    this.props.push(`npc:${id}`);
    return n;
  }
  private talk(n: NPC) {
    n.faceTo(this.game.player.pos);
    n.talking = 999;
    this.dialogue.start(LAZARUS_DIALOGUES[n.state.id], 'start', () => {
      n.talking = 0;
      if (!n.state.memory.includes('met')) n.state.memory.push('met');
    });
  }
  /** a following explorer close to the landed Ranger climbs aboard */
  private boarding(n: NPC, flagKey: string, line: string) {
    const st = n.state;
    if (!st.following || !n.visible) return;
    const r = this.zone.ranger.root.position;
    const d = Math.hypot(n.pos.x - r.x, n.pos.z - r.z);
    const pl = this.game.player;
    const playerAboard = pl.mode === 'seat' || this.zone.cabinPressurisedAt(pl.pos);
    const pr = Math.hypot(pl.pos.x - r.x, pl.pos.z - r.z);
    // beside the Ranger, or trailing the player who is (followers stop two metres short of you)
    if (d < 9 || (pr < 12 && d < 16 && n.distToPlayer() < 6) || (playerAboard && d < 40)) {
      st.following = false;
      st.aboard = 'ranger1';
      st.frame = 'ranger1';
      const pax = this.game.state.vehicles.ranger1.passengers;
      if (!pax.includes(st.id)) pax.push(st.id);
      n.visible = false;
      n.sync();
      this.game.flag(flagKey, true);
      this.game.notify(`${n.def.name} is aboard Ranger 1.`, 'ok', 5);
      this.say(st.id, line);
    }
  }

  // ------------------------------------------------------------------------------------------------ Miller
  private async buildMiller() {
    const g = this.game;
    const x0 = 78, z0 = -42;
    // the capsule: a squat cone on a cylinder, tilted where it settled on the seabed after the first wave
    const cap = new THREE.Group();
    cap.position.set(x0, this.y(x0, z0) - 0.35, z0);
    cap.rotation.set(0.24, 0.9, -0.12);
    this.root.add(cap);
    const shell = this.mat('lander_silver', 0xb8b8b8);
    this.mesh(new THREE.CylinderGeometry(2.1, 2.3, 1.6, 24), shell, cap, 0, 0.8, 0);
    this.mesh(new THREE.CylinderGeometry(0.9, 2.1, 2.0, 24), shell, cap, 0, 2.6, 0);
    this.mesh(new THREE.CylinderGeometry(2.32, 2.32, 0.18, 24), this.mat('thermal_tile', 0x222222), cap, 0, 0.05, 0);
    this.mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.3, 16), this.mat('metal_dark'), cap, 0, 3.7, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const leg = this.mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.4, 6), this.mat('metal_gray'), cap, Math.cos(a) * 2.2, -0.2, Math.sin(a) * 2.2);
      leg.rotation.z = Math.cos(a) * 0.35;
      leg.rotation.x = -Math.sin(a) * 0.35;
    }
    // side hatch (port side) and the strapped recorder behind it
    const hatch = this.mesh(new THREE.BoxGeometry(1.0, 1.25, 0.12), this.mat('hatch_gray'), cap, 0, 1.0, 2.22);
    this.mesh(new THREE.BoxGeometry(0.75, 0.95, 0.05), this.mat('frame_black'), cap, 0, 1.0, 2.3);
    this.collide(cap, new THREE.Vector3(2.2, 1.6, 2.2), new THREE.Vector3(0, 1.4, 0));
    this.beacon(cap, 0, 3.85, 0, 2.6, 0xff2a1a, 1.6, true);
    // floating debris
    for (let i = 0; i < 6; i++) {
      const bx = x0 - 14 + i * 5.3, bz = z0 + 6 + Math.sin(i * 2.1) * 7;
      const crate = this.mesh(new THREE.BoxGeometry(0.6 + (i % 3) * 0.2, 0.35, 0.5), this.mat(i % 2 ? 'fabric_orange' : 'plastic_white'), this.root, bx, this.zone.waterLevel(bx, bz) + 0.05, bz);
      crate.rotation.y = i * 1.3;
    }
    const rec = () => !!g.flag('miller_recorder');
    this.prop({
      id: 'lazarus:miller_recorder', target: hatch, range: 2.8,
      label: () => (rec() ? null : 'Recover the data recorder'),
      use: () => {
        g.flag('miller_recorder', true);
        g.audio.ui('click');
        g.notify('Data recorder recovered — every tide and sample Dr. Miller logged.', 'ok', 5);
        if (!g.state.discoveries.includes('miller_ocean_data')) g.state.discoveries.push('miller_ocean_data');
      },
    });
    if (g.state.npcs.miller?.aboard || g.flag('miller_rescued')) return;
    const n = await this.npc('miller', x0 + 3.5, z0 + 3.2, -2.2);
    if (n) n.think = (npc) => {
      // waves at the Ranger until met
      if (!npc.state.memory.includes('met') && npc.distToPlayer() < 60 && npc.distToPlayer() > 6) npc.forcedAnim = 'wave';
      else npc.forcedAnim = null;
    };
  }

  // ------------------------------------------------------------------------------------------------ Mann
  private async buildMann() {
    const g = this.game;
    const awake = () => !!g.flag('mann_awake');
    let mann: NPC | null = null;
    // story props (registered by the camp Site from its interact=lazarus nodes)
    this.campProps.mann_pod = {
      range: 2.4,
      label: () => (awake() ? null : 'Wake the sleeper (cryo pod controls)'),
      use: () => {
        g.flag('mann_awake', true);
        g.state.npcs.mann.task = 'mann_awake';
        g.audio.ui('click');
        if (this.lid) this.lid.open = true;
        if (mann) {
          mann.visible = true;
          mann.forcedAnim = null;
          mann.sync();
        }
        g.notify('The pod vents and the lid lifts. Dr. Mann is awake.', 'info', 5);
      },
    };
    this.campProps.mann_terminal = {
      range: 2.4,
      label: () => 'Read the survey records',
      use: () => {
        g.flag('mann_logs_read', true);
        this.readPanel('MANN SURVEY — BROADCAST SUMMARIES AND RAW LOGS', MANN_LOGS);
      },
    };
    const camp = await this.placeCamp('mann', { groupsOn: ['int', 'floor'], nightGroups: ['ext'], doorSound: 'airlock', glow: { int: 2.2, floor: 1.4 } });
    const bp = this.spot('spot_beacon');
    if (bp) this.beacon(this.root, bp.x, bp.y, bp.z, 6.5, 0xffffff, 3.0, true);
    const hinge = camp.node('pod_hinge');
    if (hinge) this.lid = { node: hinge, t: awake() ? 1 : 0, open: awake() };
    const sp = this.spot('spot_mann');
    if (!g.state.npcs.mann?.aboard && !g.flag('mann_aboard') && sp) {
      mann = await this.npc('mann', sp.x, sp.z, 0);
      if (mann) {
        mann.groundFn = (q) => this.floorAt(q);
        mann.pos.y = this.floorAt(mann.pos);
        const pod = this.spot('spot_pod');
        if (pod) mann.faceTo(pod);
        mann.visible = awake();
        mann.sync();
      }
    }
  }

  /** standing height at a frame-local point: the hab floor / steps where there are colliders, else the ground */
  private floorAt(q: THREE.Vector3) {
    const hit = this.zone.ground.physics.raycast(new THREE.Vector3(q.x, q.y + 1.2, q.z), new THREE.Vector3(0, -1, 0), 4);
    return hit ? hit.point.y : this.y(q.x, q.z);
  }

  /** Mann's hab: main room (0), airlock (1), outside (2), from a frame-local point */
  private habRegion(q: THREE.Vector3) {
    const m = q.clone().applyMatrix4(this.campInv);
    const bx = m.x, by = -m.z;
    if (Math.abs(by) > 2.3 || bx < -8.2 || bx > 6.1 || m.y > 3.2) return 2;
    return bx >= -3.0 ? 0 : 1;
  }

  /** a follower walks the hab's doorways instead of through its walls (true while it is routing) */
  private routeFollower(n: NPC) {
    if (n.state.id !== 'mann' || !this.camp) return false;
    const pl = this.game.player;
    const a = this.habRegion(n.pos), b = this.habRegion(pl.pos);
    if (a === b) return false;
    const last = n.path[n.path.length - 1];
    if (n.path.length > 1 && last && last.distanceTo(pl.pos) < 2.5) return true;
    const legs: Record<string, string[]> = { '0-1': ['nav_main', 'nav_inner'], '1-0': ['nav_inner', 'nav_main'], '1-2': ['nav_lock', 'nav_outer', 'nav_porch'], '2-1': ['nav_porch', 'nav_outer', 'nav_lock'] };
    const names: string[] = [];
    for (let r = a; r !== b; r += Math.sign(b - a)) names.push(...legs[`${r}-${r + Math.sign(b - a)}`]);
    const pts = names.map((nm) => this.spot(nm)).filter((v): v is THREE.Vector3 => !!v);
    pts.push(pl.pos.clone());
    n.goTo(pts, 1.5);
    // he opens the doors on his way
    for (const id of ['mann_inner', 'mann_outer']) if (!this.camp.doors.get(id)?.open) this.camp.toggleDoor(id, true);
    return true;
  }

  // ------------------------------------------------------------------------------------------------ Edmunds
  private async buildEdmunds() {
    const g = this.game;
    const found = (k: string) => {
      g.flag(k, true);
      if (g.flag('edmunds_log') && g.flag('edmunds_soil') && g.flag('edmunds_fate')) {
        if (!g.state.discoveries.includes('edmunds_habitable')) g.state.discoveries.push('edmunds_habitable');
        this.say('computer', 'Recording a recommendation: Edmunds’ world grows food in its own soil. Flagging for the settlement plan.', 'edmunds_rec');
      }
    };
    this.campProps.edmunds_log = { label: () => 'Read the hab log', use: () => { found('edmunds_log'); this.readPanel('EDMUNDS — HAB LOG (LAST ENTRIES)', EDMUNDS_LOG); } };
    this.campProps.edmunds_greenhouse = {
      range: 3.0,
      label: () => 'Examine the greenhouse beds',
      use: () => {
        found('edmunds_soil');
        this.readPanel('GREENHOUSE', [['Raised beds of local soil', 'The condenser still drips into the trough. Beans climbing their strings, rye, and something with blue flowers — the third or fourth generation, by the seed packets pinned up in the living module. Nothing here was watered by hand for a long time. It grew anyway.']]);
      },
    };
    this.campProps.edmunds_beacon = { range: 2.6, label: () => 'Check the beacon transmitter', use: () => this.readPanel('BEACON TRANSMITTER', [['Transmitter cells: 0 %', 'The camp lights still come on at dusk off the solar array; the transmitter drew from its own cells, and those failed long after the last log entry. The beacon kept calling for a man who was no longer there to answer it.']]) };
    this.campProps.edmunds_helmet = { range: 2.4, label: () => 'Look at the helmet', use: () => { found('edmunds_fate'); this.readPanel('AT THE FOOT OF THE RIDGE', [['A cracked helmet among fallen rock', 'The boulders above have slipped; the scree is fresh. The seismometer lies toppled near the top of the pile. His last entry said he was going up to reseat it and would be back by dark.']]); } };
    await this.placeCamp('edmunds', { groupsOn: ['hab'], nightGroups: ['camp', 'cont', 'lander'], doorSound: 'hatch' });
  }

  // ------------------------------------------------------------------------------------------------ frame
  update(dt: number) {
    this.t += dt;
    for (const b of this.beacons) {
      const on = this.t % b.period < b.on;
      b.light.intensity = on ? 40 : 0;
      (b.lens.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 6 : 0.15;
    }
    const night = THREE.MathUtils.clamp(1 - (this.zone.sunHeight() + 0.05) * 4, 0, 1);
    if (this.camp) {
      // lamps on at dusk (they would only glare on a sunlit glacier or desert)
      const on = night > 0.3;
      if (on !== this.nightOn) {
        this.nightOn = on;
        for (const gname of this.nightGroups) this.camp.setGroup(gname, on);
      }
      // Edmunds' hab glows like a lantern after dark
      const fab = this.game.materials.get('hab_fabric') as THREE.MeshStandardMaterial | null;
      // (night exposure is ~3× the day's, so a little emission reads as a warm lantern, not a white blob)
      if (fab && this.zone.site.body === 'edmunds') fab.emissiveIntensity = 0.13 * night;
      this.camp.update(dt);
      if (this.lid && this.lid.t < 1 && this.lid.open) {
        this.lid.t = Math.min(1, this.lid.t + dt * 0.45);
      }
      if (this.lid) this.lid.node.rotation.x = -1.15 * this.lid.t * this.lid.t * (3 - 2 * this.lid.t);
      this.pool?.update(dt, this.game.camera.getWorldPosition(new THREE.Vector3()));
    }
    const cam = this.game.camera.position;
    for (const n of this.npcs) {
      if (!n.visible) continue;
      const d = n.pos.distanceTo(cam);
      if (d > 400) continue;
      if (n.state.following && !this.routeFollower(n)) {
        const pd = n.distToPlayer();
        if (pd > 3 && (!n.path.length || n.path[0].distanceTo(this.game.player.pos) > 2)) n.goTo(this.game.player.pos.clone(), pd > 8 ? 3.0 : 1.5);
        if (pd < 2.2) n.stop();
      }
      n.update(dt);
      if (n.state.id === 'miller') this.boarding(n, 'miller_rescued', 'Get us off this water. Please.');
      if (n.state.id === 'mann') this.boarding(n, 'mann_aboard', 'I had forgotten what other people sound like when they breathe.');
    }
    // Miller's world: she has seen enough waves to call them before the computer does
    const W = this.zone.waves;
    const miller = this.npcs.find((n) => n.state.id === 'miller' && n.visible);
    if (W && miller && miller.distToPlayer() < 150) {
      const nx = W.next(miller.pos.x, miller.pos.z, this.zone.time);
      if (nx && nx.tta < 150 && nx.tta > 100) this.say('miller', 'Feel that? The water’s pulling out. You have about two minutes.', `miller_wave_${nx.wave.n}`);
    }
  }

  dispose() {
    for (const id of this.props) this.game.interaction.remove(id);
    const ph = this.zone.ground?.physics;
    if (ph) for (const c of this.colliders) ph.world.removeCollider(c, false);
    if (this.camp) {
      if (ph) for (const cols of this.camp.colliderMap.values()) for (const c of cols) ph.world.removeCollider(c, false);
      this.camp.dispose();
      this.camp = null;
      const fab = this.game.materials.get('hab_fabric') as THREE.MeshStandardMaterial | null;
      if (fab) fab.emissiveIntensity = 0;
    }
    this.pool?.clear();
    for (const n of this.npcs) {
      n.body?.root.removeFromParent();
      n.dispose();
    }
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

const MANN_LOGS: [string, string][] = [
  ['DAY 64 — BROADCAST', 'Ice sheet over liquid water at depth. Surface chemistry promising. Prospect: favourable.'],
  ['DAY 64 — RAW', 'Core to 40 m: frozen throughout. Spectrometer: no organics above detection limit. Ammonia and chlorine in the air.'],
  ['DAY 117 — BROADCAST', 'Second survey confirms earlier findings. Recommend follow-up mission.'],
  ['DAY 117 — RAW', 'Second core to 60 m: frozen throughout. Battery 31 %. Same results. Same results.'],
  ['DAY 160 — BROADCAST', 'Conditions remain favourable. Entering long sleep to conserve power. Beacon active.'],
  ['DAY 160 — RAW', 'There is nothing here. I am going to sleep and I am going to keep the light on.'],
];

const EDMUNDS_LOG: [string, string][] = [
  ['DAY 388', 'Rye took in the north bed. The soil wants nitrogen but it does not want to kill anything, which is more than I can say for most places.'],
  ['DAY 395', 'Condenser output steady. Air thin but honest. I walked to the ridge and back without the mask for ten minutes. Headache, nothing worse.'],
  ['DAY 401', 'Third generation of beans flowering. If anyone reads this: you could live here. Not easily. But you could.'],
  ['DAY 402', 'Seismometer on the ridge stopped reporting. Going up to reseat it. Back by dark.'],
  ['—', '(no further entries)'],
];
