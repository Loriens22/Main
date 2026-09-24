// Placement solver: turns a placement intent ("in front of me", "next to the
// house", "far away", "on the lake", "floating above me", "replace the
// car"...) plus the entity's footprint into a world position and facing.
// A spiral free-space search avoids overlapping existing entities, steep
// slopes, water (unless the thing floats or is a boat) and world bounds.

import * as THREE from 'three';
import { G } from '../core/context.js';

export function footprintOverlaps(world, x, z, r, ignore = null) {
  for (const e of world.entities) {
    if (e === ignore || !e.footprint || e.isCharacter || e.floating) continue;
    const er = (e.footprint.radius || 1) * (e.scale || 1);
    if (Math.hypot(e.root.position.x - x, e.root.position.z - z) < er + r) return e;
  }
  return null;
}

function groundAt(world, x, z) { return world.heightAt(x, z); }

function slopeOK(world, x, z, r, maxSlope) {
  if (!world.terrain) return true;
  const h = [];
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    h.push(groundAt(world, x + Math.cos(ang) * r * 0.8, z + Math.sin(ang) * r * 0.8));
  }
  const c = groundAt(world, x, z);
  let mx = 0;
  for (const v of h) mx = Math.max(mx, Math.abs(v - c));
  return mx / Math.max(1, r * 0.8) < maxSlope;
}

function inWater(world, x, z, r) {
  if (!(world.waterLevel > -1e8)) return false;
  const w = world.waterLevel + 0.3;
  if (groundAt(world, x, z) < w) return true;
  for (let a = 0; a < 4; a++) {
    const ang = (a / 4) * Math.PI * 2;
    if (groundAt(world, x + Math.cos(ang) * r, z + Math.sin(ang) * r) < w) return true;
  }
  return false;
}

// info: { radius, height, floating, onWater, wantsWater, isBuilding, isCharacter, count }
export function resolvePlacement(item, info, ctx) {
  const { world, player, registry } = ctx;
  const P = player.position;
  const fwd = player.forward(new THREE.Vector3());
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const r = Math.max(0.3, info.radius);
  const pl = item.placement || (item.attrs && item.attrs.placementFloat ? { mode: 'above' } : null);
  const mode = pl ? pl.mode : 'front';
  let target = new THREE.Vector3();
  let facePlayer = true;
  let yOffset = 0;
  let exact = false;
  let refEntity = null;
  const dFront = Math.max(2.6, r + 2.2 + (info.isBuilding ? 3 : 0));
  switch (mode) {
    case 'behind': target.copy(P).addScaledVector(fwd, -dFront); break;
    case 'beside': target.copy(P).addScaledVector(right, r + 1.5).addScaledVector(fwd, 1.0); break;
    case 'left': target.copy(P).addScaledVector(right, -(r + 2)); break;
    case 'right': target.copy(P).addScaledVector(right, r + 2); break;
    case 'far': target.copy(P).addScaledVector(fwd, 45 + r * 1.6); break;
    case 'here': target.copy(P).addScaledVector(fwd, Math.max(1.2, r + 0.6)); break;
    case 'above': target.copy(P).addScaledVector(fwd, Math.max(3, r * 0.8)); yOffset = Math.max(3.5, info.height * 0.5 + 3); break;
    case 'around': target.copy(P); break;
    case 'high': {
      let best = null, bh = -Infinity;
      for (let i = 0; i < 64; i++) {
        const ang = Math.atan2(fwd.x, fwd.z) + (i / 64 - 0.5) * Math.PI * 1.2;
        const d = 20 + (i % 8) * 12;
        const x = P.x + Math.sin(ang) * d, z = P.z + Math.cos(ang) * d;
        const h = groundAt(world, x, z);
        if (h > bh && slopeOK(world, x, z, r, 0.5)) { bh = h; best = new THREE.Vector3(x, h, z); }
      }
      target.copy(best || P.clone().addScaledVector(fwd, dFront));
      break;
    }
    case 'nearWater': case 'onWater': {
      if (world.lake) {
        const lk = new THREE.Vector3(world.lake.x, 0, world.lake.z);
        const dir = P.clone().sub(lk).setY(0).normalize();
        // March from the lake centre outward to the shoreline.
        let d = 0;
        while (d < world.lake.r + 60 && groundAt(world, lk.x + dir.x * d, lk.z + dir.z * d) < world.waterLevel + (mode === 'onWater' ? -1.2 : 0.8)) d += 1;
        const shoreD = mode === 'onWater' ? Math.max(0, d - r - 2) : d + r + 1.5;
        target.set(lk.x + dir.x * shoreD, 0, lk.z + dir.z * shoreD);
      } else target.copy(P).addScaledVector(fwd, dFront);
      break;
    }
    case 'relative': case 'replace': {
      const refs = pl.ref ? registry.findRef(pl.ref, { ...ctx, prev: ctx.prev }) : [];
      refEntity = refs[0] || null;
      if (!refEntity) { target.copy(P).addScaledVector(fwd, dFront); break; }
      const rp = refEntity.root.position;
      const rr = (refEntity.footprint ? refEntity.footprint.radius : 1) * (refEntity.scale || 1);
      const toPlayer = P.clone().sub(rp).setY(0).normalize();
      const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      if (mode === 'replace') { target.copy(rp); exact = true; facePlayer = false; ctx.replaceEntity = refEntity; break; }
      const rel = pl.rel || 'beside';
      if (rel === 'front') target.copy(rp).addScaledVector(toPlayer, rr + r + 1.2);
      else if (rel === 'behind') target.copy(rp).addScaledVector(toPlayer, -(rr + r + 1.2));
      else if (rel === 'on' || rel === 'above') {
        const box = refEntity.worldBox();
        target.set(rp.x, 0, rp.z);
        yOffset = box.max.y - groundAt(world, rp.x, rp.z) + (rel === 'above' ? 2 + info.height * 0.5 : 0);
        exact = true;
      } else if (rel === 'inside') { target.copy(rp); exact = true; yOffset = refEntity.interiorFloorY !== undefined ? refEntity.interiorFloorY : 0; }
      else if (rel === 'under') { target.copy(rp); exact = true; }
      else target.copy(rp).addScaledVector(side, (rr + r + 1.2) * (ctx.sideSign || 1)).addScaledVector(toPlayer, 0.5);
      break;
    }
    default: target.copy(P).addScaledVector(fwd, dFront);
  }
  // Free-space search (spiral), unless the user asked for an exact spot.
  let pos = target.clone();
  if (!exact && world.entities) {
    const maxSlope = info.isBuilding ? 0.45 : 0.7;
    const needDry = !info.floating && !info.wantsWater && mode !== 'onWater' && yOffset === 0;
    let found = false;
    for (let i = 0; i < 90 && !found; i++) {
      const ang = i * 2.39996;
      const rad = i === 0 ? 0 : Math.sqrt(i) * Math.max(1.2, r * 0.6);
      const x = target.x + Math.cos(ang) * rad, z = target.z + Math.sin(ang) * rad;
      if (Math.abs(x) > world.bounds - r || Math.abs(z) > world.bounds - r) continue;
      if (!info.floating && yOffset === 0 && footprintOverlaps(world, x, z, r * 0.9, ctx.replaceEntity)) continue;
      if (needDry && inWater(world, x, z, r * 0.7)) continue;
      if (mode === 'onWater' && !inWater(world, x, z, 0.1)) continue;
      if (!info.floating && !slopeOK(world, x, z, r, maxSlope)) continue;
      // Don't drop things on top of the player.
      if (Math.hypot(x - P.x, z - P.z) < r + 0.8 && mode !== 'around') continue;
      pos.set(x, 0, z); found = true;
    }
  }
  // Height.
  let y;
  if (mode === 'onWater' || info.wantsWater) y = Math.max(world.waterLevel, groundAt(world, pos.x, pos.z));
  else if (info.isBuilding && world.terrain) {
    // Average ground under the footprint (the building then flattens it).
    let sum = 0, n = 0;
    for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; sum += groundAt(world, pos.x + Math.cos(ang) * r * 0.7, pos.z + Math.sin(ang) * r * 0.7); n++; }
    y = Math.max(sum / n, groundAt(world, pos.x, pos.z) - 0.5);
    if (world.waterLevel > -1e8) y = Math.max(y, world.waterLevel + 0.4);
  } else if (world.colliders) y = world.colliders.groundHeight(pos.x, pos.z, 0.2, 1e5, 0);
  else y = groundAt(world, pos.x, pos.z);
  if (!Number.isFinite(y) || y < -1e5) y = 0;
  pos.y = y + yOffset + (info.floating && yOffset === 0 && mode !== 'onWater' ? info.floatHeight || 0 : 0);
  // Facing.
  let yaw;
  if (ctx.replaceEntity) yaw = ctx.replaceEntity.root.rotation.y;
  else if (facePlayer) yaw = Math.atan2(P.x - pos.x, P.z - pos.z);
  else yaw = player.yaw;
  if (info.sideways) yaw += Math.PI / 2 * (ctx.sideSign || 1);
  return { pos, yaw, mode, refEntity };
}

// Arrange multiple copies around a base position.
export function arrangeMany(base, count, info, idx, rng, mode, player) {
  if (count <= 1) return base.clone();
  const r = Math.max(0.5, info.radius);
  if (mode === 'around') {
    const R = Math.max(4, r * count * 0.45 + 2);
    const a = (idx / count) * Math.PI * 2 + player.yaw;
    return new THREE.Vector3(player.position.x + Math.sin(a) * R, 0, player.position.z + Math.cos(a) * R);
  }
  if (info.isBuilding) {
    // A row, like a street.
    const fwd = player.forward(new THREE.Vector3());
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const spacing = r * 2.3 + 3;
    return base.clone().addScaledVector(right, (idx - (count - 1) / 2) * spacing);
  }
  // Loose cluster (phyllotaxis).
  const ang = idx * 2.39996;
  const rad = Math.sqrt(idx + 0.5) * (r * 1.7 + 0.6);
  return new THREE.Vector3(base.x + Math.cos(ang) * rad + rng.range(-0.3, 0.3), 0, base.z + Math.sin(ang) * rad + rng.range(-0.3, 0.3));
}

export { G };
