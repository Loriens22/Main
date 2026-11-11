import * as THREE from 'three';
import type SurfaceZone from '../zones/SurfaceZone';
import { NPC } from '../../npc/NPC';
import { DialogueRunner } from '../../npc/Dialogue';
import { LAZARUS_DIALOGUES } from '../../data/lazarus';
import { h } from '../../ui/UI';

/**
 * The Lazarus explorers' sites on the Gargantua worlds (original story content for this game's timeline).
 *   Miller  — her capsule lies tilted in the shallows near the beacon, Dr. Laura Miller alive beside it. She will not
 *             leave without her data recorder (inside the capsule); then she follows you to the Ranger. The waves
 *             keep coming meanwhile.
 *   Mann    — a hab, a beacon and a cryo shelter on the glacier; Dr. Mann asleep inside. His survey terminal holds
 *             both the summaries he broadcast and the raw logs. Wake him, read them, decide whether he comes along.
 *   Edmunds — a silent beacon, a hab with his log, a greenhouse still growing in local soil, and at the foot of the
 *             ridge the place his last walk ended.
 * Flags (game.flag): miller_recorder, miller_rescued, mann_awake, mann_logs_read, mann_aboard, mann_left,
 * edmunds_log, edmunds_soil, edmunds_fate. Rescued explorers ride in Ranger 1 (npc.aboard = 'ranger1').
 */
type Prop = { id: string; label: () => string | null; use: () => void; target: THREE.Object3D; range?: number };

export class LazarusSite {
  readonly root = new THREE.Group();
  private colliders: import('@dimforge/rapier3d-compat').Collider[] = [];
  private props: string[] = [];
  private npcs: NPC[] = [];
  private beacons: { light: THREE.PointLight; lens: THREE.Mesh; period: number; on: number }[] = [];
  /** work lamps: full at night, a faint glow by day (they would only glare on a sunlit glacier) */
  private lamps: { light: THREE.PointLight; mats: THREE.MeshStandardMaterial[]; k: number[] }[] = [];
  private dialogue: DialogueRunner;
  private t = 0;
  private spoke = new Set<string>();

  constructor(readonly zone: SurfaceZone) {
    this.dialogue = new DialogueRunner(zone.game);
  }

  get game() {
    return this.zone.game;
  }

  /** The beacon site of a Gargantua world (first named site), or null. */
  static async create(zone: SurfaceZone): Promise<LazarusSite | null> {
    const body = zone.site.body;
    if (!['miller', 'mann', 'edmunds'].includes(body)) return null;
    const first = zone.def.sites[0];
    const near = Math.abs(zone.site.lat - first.lat) < 0.5 && Math.abs(zone.site.lon - first.lon) < 0.5;
    if (!near) return null;
    const s = new LazarusSite(zone);
    if (body === 'miller') await s.buildMiller();
    else if (body === 'mann') await s.buildMann();
    else s.buildEdmunds();
    zone.scene.add(s.root);
    return s;
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
    const x0 = -58, z0 = 46;
    const camp = new THREE.Group();
    camp.position.set(x0, this.y(x0, z0), z0);
    this.root.add(camp);
    // hab dome on a ring footing, an airlock stub, orange marker band
    const dome = this.mesh(new THREE.SphereGeometry(3.4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), this.mat('paint_white_worn'), camp, 0, 0.35, 0);
    this.mesh(new THREE.CylinderGeometry(3.45, 3.5, 0.4, 28), this.mat('fabric_orange', 0xc05010), camp, 0, 0.2, 0);
    this.mesh(new THREE.BoxGeometry(1.4, 2.0, 1.6), this.mat('hatch_gray'), camp, 0, 1.0, 3.6);
    this.mesh(new THREE.BoxGeometry(0.9, 1.7, 0.06), this.mat('frame_black'), camp, 0, 0.95, 4.42);
    this.collide(dome, new THREE.Vector3(2.6, 1.6, 2.6), new THREE.Vector3(0, 1.4, 0));
    // cryo shelter: a long insulated housing with a window over the sleeper
    const pod = new THREE.Group();
    pod.position.set(5.4, 0, -1.2);
    pod.rotation.y = 0.3;
    camp.add(pod);
    this.mesh(new THREE.BoxGeometry(3.2, 1.3, 1.5), this.mat('paint_white_worn'), pod, 0, 0.65, 0);
    this.mesh(new THREE.BoxGeometry(1.8, 0.05, 0.9), this.mat('glass_dark'), pod, 0, 1.32, 0);
    const panel = this.mesh(new THREE.BoxGeometry(0.5, 0.4, 0.08), this.mat('emit_screen'), pod, 1.3, 0.85, 0.79);
    this.collide(pod, new THREE.Vector3(1.6, 0.65, 0.75), new THREE.Vector3(0, 0.65, 0));
    // survey terminal on a tripod by the hab
    const term = this.mesh(new THREE.BoxGeometry(0.6, 0.45, 0.35), this.mat('console_dark'), camp, -3.9, 1.1, 2.4);
    this.mesh(new THREE.BoxGeometry(0.5, 0.32, 0.02), this.mat('emit_screen_amber'), camp, -3.9, 1.12, 2.58);
    this.mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), this.mat('metal_gray'), camp, -3.9, 0.45, 2.4);
    this.beacon(camp, -2.5, 0, -4.2, 6.5, 0xffffff, 3.0, true);
    // he kept a work lamp burning over the camp the whole time: warm light on the ice, a glow in the hab window
    this.mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 8), this.mat('metal_gray'), camp, 3.6, 2.1, 3.2);
    const head = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 3 });
    this.mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), head, camp, 3.6, 4.25, 3.2);
    const lamp = new THREE.PointLight(0xffd2a0, 60, 40, 1.6);
    lamp.position.set(3.6, 4.0, 3.2);
    camp.add(lamp);
    const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc890, emissiveIntensity: 2 });
    this.mesh(new THREE.CircleGeometry(0.45, 16), glow, camp, 2.2, 2.0, 2.5).lookAt(new THREE.Vector3(x0 + 4.4, camp.position.y + 2.0, z0 + 5.0));
    this.lamps.push({ light: lamp, mats: [head, glow], k: [60, 3, 2] });
    const awake = () => !!g.flag('mann_awake');
    let mann: NPC | null = null;
    if (!g.state.npcs.mann?.aboard && !g.flag('mann_aboard')) {
      mann = await this.npc('mann', x0 + 5.4, z0 + 1.0, Math.PI);
      if (mann) mann.visible = awake();
    }
    this.prop({
      id: 'lazarus:mann_pod', target: panel, range: 2.6,
      label: () => (awake() ? null : 'Wake the sleeper (cryo shelter controls)'),
      use: () => {
        g.flag('mann_awake', true);
        g.state.npcs.mann.task = 'mann_awake';
        g.audio.ui('click');
        if (mann) {
          const p = new THREE.Vector3(x0 + 5.4 + 1.6, 0, z0 + 2.4);
          p.y = this.y(p.x, p.z);
          mann.pos.copy(p);
          mann.visible = true;
          mann.forcedAnim = null;
          mann.sync();
        }
        g.notify('The shelter vents. Dr. Mann is awake.', 'info', 5);
      },
    });
    this.prop({
      id: 'lazarus:mann_terminal', target: term, range: 2.4,
      label: () => 'Read the survey records',
      use: () => {
        g.flag('mann_logs_read', true);
        this.readPanel('MANN SURVEY — BROADCAST SUMMARIES AND RAW LOGS', MANN_LOGS);
      },
    });
  }

  // ------------------------------------------------------------------------------------------------ Edmunds
  private buildEdmunds() {
    const g = this.game;
    const x0 = 52, z0 = 58;
    const base = new THREE.Group();
    base.position.set(x0, this.y(x0, z0), z0);
    this.root.add(base);
    // hab: a horizontal cylinder on skids, dusted
    const hab = this.mesh(new THREE.CylinderGeometry(1.6, 1.6, 6.2, 20), this.mat('paint_white_worn'), base, 0, 1.9, 0);
    hab.rotation.z = Math.PI / 2;
    for (const sx of [-2.2, 2.2]) this.mesh(new THREE.BoxGeometry(0.2, 0.35, 3.0), this.mat('metal_dark'), base, sx, 0.18, 0);
    this.collide(hab, new THREE.Vector3(1.6, 3.1, 1.6));
    const term = this.mesh(new THREE.BoxGeometry(0.06, 0.5, 0.7), this.mat('emit_screen'), base, 3.15, 1.9, 0);
    // hatch and windows on the long side, a step at the door
    this.mesh(new THREE.BoxGeometry(1.0, 1.7, 0.08), this.mat('hatch_gray'), base, -0.8, 1.6, 1.57);
    for (const wx of [0.9, 2.0]) this.mesh(new THREE.BoxGeometry(0.55, 0.35, 0.05), this.mat('glass_dark'), base, wx, 2.3, 1.55);
    this.mesh(new THREE.BoxGeometry(1.1, 0.25, 0.7), this.mat('metal_dark'), base, -0.8, 0.45, 2.0);
    // solar array
    for (let i = 0; i < 3; i++) {
      const pan = this.mesh(new THREE.BoxGeometry(2.0, 0.05, 1.1), this.mat('radiator_black'), base, -4.6 + i * 0.0, 1.2, -3.2 + i * 1.25);
      pan.rotation.x = -0.45;
    }
    // greenhouse: a translucent half-tube over rows of green
    const gh = new THREE.Group();
    // on its own patch of ground (the base's footing height is not the greenhouse's)
    gh.position.set(-1.0, this.y(x0 - 1.0, z0 + 5.2) - base.position.y, 5.2);
    base.add(gh);
    const film = new THREE.MeshStandardMaterial({ color: 0xe4eee6, roughness: 0.25, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
    for (let k = 0; k < 5; k++) {
      const hoop = this.mesh(new THREE.TorusGeometry(1.52, 0.035, 6, 20, Math.PI), this.mat('metal_gray'), gh, 0, 0, -2.4 + k * 1.2);
      hoop.castShadow = false;
    }
    this.mesh(new THREE.BoxGeometry(2.8, 0.18, 4.9), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.95 }), gh, 0, 0.05, 0);
    // a full tube lying along z, its lower half below the ground: the visible half is the arch
    const tube = this.mesh(new THREE.CylinderGeometry(1.5, 1.5, 5.0, 16, 1, true), film, gh, 0, 0, 0);
    tube.rotation.x = Math.PI / 2;
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 0.7 });
    const leaf2 = new THREE.MeshStandardMaterial({ color: 0x6a9a34, roughness: 0.7 });
    for (let r = -1; r <= 1; r++) for (let k = 0; k < 9; k++) {
      const pl = this.mesh(new THREE.ConeGeometry(0.16 + ((k * 7 + r) % 3) * 0.04, 0.35 + ((k + r * 3) % 4) * 0.08, 6), k % 2 ? leaf : leaf2, gh, r * 0.6, 0.2, -2.1 + k * 0.52);
      pl.castShadow = false;
    }
    this.colliders.push(this.zone.ground.physics.addBox(new THREE.Vector3(1.5, 0.8, 2.5), new THREE.Vector3(x0 - 1.0, base.position.y + 0.8, z0 + 5.2)));
    // the beacon: dark, its battery long dead
    const bcn = this.beacon(base, 4.5, 0, 3.2, 5.5, 0xff3020, 2, false);
    this.mesh(new THREE.BoxGeometry(0.5, 0.6, 0.4), this.mat('warning_yellow'), base, 4.5, 0.3, 3.75);
    // at the foot of the ridge: fallen rock and his helmet
    const hx = x0 + 34, hz = z0 - 22;
    const rocks = new THREE.Group();
    rocks.position.set(hx, this.y(hx, hz), hz);
    this.root.add(rocks);
    for (let i = 0; i < 9; i++) {
      const rk = this.mesh(new THREE.DodecahedronGeometry(0.4 + (i % 4) * 0.35, 0), this.mat('rock_dark', 0x3a3530), rocks, Math.cos(i * 2.4) * (1 + i * 0.4), 0.2, Math.sin(i * 2.4) * (1 + i * 0.4));
      rk.rotation.set(i, i * 0.7, 0);
    }
    const helmet = this.mesh(new THREE.SphereGeometry(0.2, 14, 10), this.mat('suit_white'), rocks, 0.9, 0.18, -0.6);
    this.mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI), this.mat('glass_dark'), rocks, 0.98, 0.2, -0.47);
    const found = (k: string) => {
      g.flag(k, true);
      if (g.flag('edmunds_log') && g.flag('edmunds_soil') && g.flag('edmunds_fate')) {
        if (!g.state.discoveries.includes('edmunds_habitable')) g.state.discoveries.push('edmunds_habitable');
        this.say('computer', 'Recording a recommendation: Edmunds’ world grows food in its own soil. Flagging for the settlement plan.', 'edmunds_rec');
      }
    };
    this.prop({ id: 'lazarus:edmunds_log', target: term, range: 2.6, label: () => 'Read the hab log', use: () => { found('edmunds_log'); this.readPanel('EDMUNDS — HAB LOG (LAST ENTRIES)', EDMUNDS_LOG); } });
    this.prop({
      id: 'lazarus:edmunds_greenhouse', target: tube, range: 3.2, label: () => 'Examine the greenhouse',
      use: () => {
        found('edmunds_soil');
        this.readPanel('GREENHOUSE', [['Rows of seedlings in local soil', 'A condenser still drips into the trough. Beans, rye and something with blue flowers — the third or fourth generation, by the seed packets pinned to the frame. Nothing here was watered by hand for a long time. It grew anyway.']]);
      },
    });
    this.prop({ id: 'lazarus:edmunds_beacon', target: bcn, range: 3, label: () => 'Check the beacon power unit', use: () => this.readPanel('BEACON POWER UNIT', [['Battery: 0 %', 'The cells failed long after the last log entry. The beacon kept calling for a man who was no longer there to answer it.']]) });
    this.prop({ id: 'lazarus:edmunds_helmet', target: helmet, range: 2.4, label: () => 'Look at the helmet', use: () => { found('edmunds_fate'); this.readPanel('AT THE FOOT OF THE RIDGE', [['A cracked helmet among fallen rock', 'The slope above is fresh scree. His last entry said he was going up to the seismometer and would be back by dark.']]); } });
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
    for (const l of this.lamps) {
      const f = 0.08 + 0.92 * night;
      l.light.intensity = l.k[0] * f;
      l.mats.forEach((m, i) => (m.emissiveIntensity = l.k[i + 1] * (0.2 + 0.8 * night)));
    }
    const cam = this.game.camera.position;
    for (const n of this.npcs) {
      if (!n.visible) continue;
      const d = n.pos.distanceTo(cam);
      if (d > 400) continue;
      if (n.state.following) {
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
