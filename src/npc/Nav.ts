import * as THREE from 'three';

export interface NavNode { id: string; pos: THREE.Vector3; links: number[]; tags?: string[] }

/**
 * Walkable graph for interiors (rooms, corridors, ladders, ring modules). Nodes come from Blender `nav`
 * markers or are authored in code; coordinates are in the owning frame (a zone, or a spacecraft's local frame).
 */
export class NavGraph {
  nodes: NavNode[] = [];
  private index = new Map<string, number>();

  add(id: string, pos: THREE.Vector3Like, tags?: string[]) {
    const i = this.nodes.length;
    this.nodes.push({ id, pos: new THREE.Vector3(pos.x, pos.y, pos.z), links: [], tags });
    this.index.set(id, i);
    return i;
  }

  link(a: string | number, b: string | number) {
    const i = typeof a === 'number' ? a : this.index.get(a), j = typeof b === 'number' ? b : this.index.get(b);
    if (i === undefined || j === undefined || i === j) return;
    if (!this.nodes[i].links.includes(j)) this.nodes[i].links.push(j);
    if (!this.nodes[j].links.includes(i)) this.nodes[j].links.push(i);
  }

  chain(...ids: string[]) { for (let i = 1; i < ids.length; i++) this.link(ids[i - 1], ids[i]); }

  /** Connect every pair of nodes closer than `maxDist` that passes the optional visibility test. */
  autoLink(maxDist: number, visible?: (a: THREE.Vector3, b: THREE.Vector3) => boolean) {
    for (let i = 0; i < this.nodes.length; i++) for (let j = i + 1; j < this.nodes.length; j++) {
      const a = this.nodes[i].pos, b = this.nodes[j].pos;
      if (a.distanceTo(b) > maxDist) continue;
      if (visible && !visible(a, b)) continue;
      this.link(i, j);
    }
  }

  get(id: string) { const i = this.index.get(id); return i === undefined ? null : this.nodes[i]; }

  nearest(p: THREE.Vector3Like, maxDist = Infinity): number {
    let best = -1, bd = maxDist * maxDist;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i].pos;
      const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2 * 4 + (n.z - p.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** A* over the graph. Returns node positions from the node nearest `from` to the node nearest `to`. */
  path(from: THREE.Vector3Like, to: THREE.Vector3Like | string): THREE.Vector3[] | null {
    const s = this.nearest(from);
    const g = typeof to === 'string' ? this.index.get(to) ?? -1 : this.nearest(to);
    if (s < 0 || g < 0) return null;
    const N = this.nodes.length;
    const cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    cost[s] = 0;
    const open = [s];
    const goal = this.nodes[g].pos;
    while (open.length) {
      let bi = 0, bf = Infinity;
      for (let k = 0; k < open.length; k++) {
        const n = open[k];
        const f = cost[n] + this.nodes[n].pos.distanceTo(goal);
        if (f < bf) { bf = f; bi = k; }
      }
      const cur = open.splice(bi, 1)[0];
      if (cur === g) break;
      closed[cur] = 1;
      for (const nb of this.nodes[cur].links) {
        if (closed[nb]) continue;
        const c = cost[cur] + this.nodes[cur].pos.distanceTo(this.nodes[nb].pos);
        if (c < cost[nb]) { cost[nb] = c; prev[nb] = cur; if (!open.includes(nb)) open.push(nb); }
      }
    }
    if (g !== s && prev[g] < 0) return null;
    const out: THREE.Vector3[] = [];
    for (let n = g; n >= 0; n = prev[n]) { out.push(this.nodes[n].pos); if (n === s) break; }
    out.reverse();
    // skip the first node when the agent is already past it on the way to the second
    if (out.length > 1) {
      const a = out[0], b = out[1];
      const ab = b.clone().sub(a), ap = new THREE.Vector3(from.x, from.y, from.z).sub(a);
      if (ap.dot(ab) > 0) out.shift();
    }
    return out;
  }
}
