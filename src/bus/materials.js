import * as THREE from 'three';
import * as TX from '../textures.js';

/** All trolleybus materials. Created once. */
export function makeBusMaterials() {
  const band = TX.liveryBand();
  const tr = TX.tread();
  tr.map.repeat.set(6, 1); tr.normal.repeat.set(6, 1);
  const seat = TX.seatFabric(); seat.repeat.set(3, 3);
  const floor = TX.busFloor(); floor.repeat.set(1, 1);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const emis = (color, intensity = 0) => std({ color: 0x222222, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.3 });

  const M = {
    paint: phys({ name: 'paint', map: band, roughness: 0.32, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.07 }),
    paintBlue: phys({ name: 'paintBlue', color: TX.LIVERY.blue, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
    paintYellow: phys({ name: 'paintYellow', color: TX.LIVERY.yellow, roughness: 0.32, clearcoat: 1.0, clearcoatRoughness: 0.07 }),
    black: std({ name: 'blackGloss', color: 0x0b0c0e, roughness: 0.22, metalness: 0.1 }),
    blackMatte: std({ name: 'blackMatte', color: 0x17181a, roughness: 0.75 }),
    rubber: std({ name: 'rubber', color: 0x0f0f10, roughness: 0.92 }),
    rubberDS: std({ name: 'rubberDS', color: 0x0f0f10, roughness: 0.92, side: THREE.DoubleSide }),
    under: std({ name: 'under', color: 0x1d1e20, roughness: 0.9 }),
    glassSide: phys({ name: 'glassSide', color: 0x1a2328, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6, specularIntensity: 1 }),
    glassFront: phys({ name: 'glassFront', color: 0xb9c9c2, roughness: 0.02, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4 }),
    glassDark: phys({ name: 'glassDark', color: 0x040506, roughness: 0.04, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5 }),
    chrome: std({ name: 'chrome', color: 0xe6e9ec, metalness: 1.0, roughness: 0.1, side: THREE.DoubleSide }),
    alu: std({ name: 'alu', color: 0xb9bdc1, metalness: 0.85, roughness: 0.38 }),
    steel: std({ name: 'steel', color: 0x5a5e62, metalness: 0.7, roughness: 0.5 }),
    poleMetal: std({ name: 'poleMetal', color: 0xc9cdd1, metalness: 0.8, roughness: 0.32 }),
    tire: std({ name: 'tire', color: 0x1b1b1c, map: tr.map, normalMap: tr.normal, roughness: 0.9, side: THREE.DoubleSide }),
    tireWall: std({ name: 'tireWall', color: 0x19191a, roughness: 0.85, side: THREE.DoubleSide }),
    rim: std({ name: 'rim', color: 0xd4d8db, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide }),
    hub: std({ name: 'hub', color: 0x8e9398, metalness: 0.8, roughness: 0.35 }),
    lensClear: phys({ name: 'lensClear', color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 2 }),
    lensRed: phys({ name: 'lensRed', color: 0xb0100a, roughness: 0.1, transparent: true, opacity: 0.85, envMapIntensity: 1.5 }),
    lensAmber: phys({ name: 'lensAmber', color: 0xe07a00, roughness: 0.1, transparent: true, opacity: 0.8, envMapIntensity: 1.5 }),
    // lamp emitters (intensity animated by the sim)
    headLo: emis(0xfff4e0, 0.0),
    drl: emis(0xf4f8ff, 2.2),
    indL: emis(0xff8a00, 0), indR: emis(0xff8a00, 0),
    tail: emis(0xff1a10, 0.6), brake: emis(0xff1a10, 0), reverse: emis(0xffffff, 0),
    marker: emis(0xff9a20, 0.9),
    // interior
    floor: std({ name: 'floor', map: floor, roughness: 0.78 }),
    wallInt: std({ name: 'wallInt', color: 0xc6cacd, roughness: 0.55 }),
    wallInt2: std({ name: 'wallInt2', color: 0x8b9197, roughness: 0.55 }),
    wallInt2DS: std({ name: 'wallInt2DS', color: 0x5d6368, roughness: 0.7, side: THREE.DoubleSide }),
    ceiling: std({ name: 'ceiling', color: 0xe3e5e7, roughness: 0.65 }),
    led: std({ name: 'led', color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 1.6, roughness: 0.4 }),
    rail: phys({ name: 'rail', color: 0xe0400f, roughness: 0.26, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    railGrey: std({ name: 'railGrey', color: 0x8a9096, roughness: 0.35, metalness: 0.6 }),
    seatFabric: std({ name: 'seatFabric', map: seat, roughness: 0.96 }),
    seatShell: std({ name: 'seatShell', color: 0x8d949a, roughness: 0.45 }),
    seatDark: std({ name: 'seatDark', color: 0x3c4146, roughness: 0.5 }),
    bellowsExt: std({ name: 'bellowsExt', color: 0x222326, roughness: 0.82, side: THREE.DoubleSide }),
    bellowsInt: std({ name: 'bellowsInt', color: 0x72787e, roughness: 0.62, side: THREE.DoubleSide }),
    turntable: std({ name: 'turntable', color: 0xa3a8ad, metalness: 0.75, roughness: 0.45 }),
    yellowStrip: std({ name: 'yellowStrip', color: 0xf1c000, roughness: 0.55 }),
    dash: std({ name: 'dash', color: 0x2c3035, roughness: 0.62 }),
    dashDark: std({ name: 'dashDark', color: 0x121416, roughness: 0.5 }),
    driverSeat: std({ name: 'driverSeat', color: 0x1f2124, roughness: 0.9 }),
    red: std({ name: 'red', color: 0xc8161b, roughness: 0.4 }),
    validator: std({ name: 'validator', color: 0xf3c318, roughness: 0.4 }),
    screen: std({ name: 'screen', color: 0x050608, roughness: 0.15, emissive: 0x0a2a4a, emissiveIntensity: 0.6 }),
    mirrorGlass: std({ name: 'mirrorGlass', color: 0x9aa5ad, metalness: 1, roughness: 0.05 }),
  };
  // Lamp materials never cast shadows etc. handled per mesh.
  for (const k of ['glassSide', 'glassFront', 'glassDark', 'lensClear']) M[k].userData = { cast: false };
  return M;
}

export function decalMat(tex, opts = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex, transparent: true, alphaTest: 0.35, roughness: opts.roughness ?? 0.4, metalness: opts.metalness ?? 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false, side: opts.side ?? THREE.FrontSide,
    emissive: opts.emissive ? new THREE.Color(0xffffff) : new THREE.Color(0), emissiveMap: opts.emissive ? tex : null, emissiveIntensity: opts.emissive ?? 0,
  });
}
