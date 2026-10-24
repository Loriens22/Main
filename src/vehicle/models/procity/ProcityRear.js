// Rear end of the BMC Procity 12 CNG (photo ref07): white bumper and roof rim, a glossy black tail with a big
// window (clear on the right, louvred engine bay on the left), BMC / euro6 / CNG lettering, leaf logo, Sofia
// emblem, fleet number, grey vertical lamp housings with a red and a reverse lens, round bumper lamps.
import * as THREE from 'three';
import { M, box, surfaceGrid, lerp } from '../../BusGeom.js';
import spec from './spec.js';
import { REAR_Z, REAR_ROOF_END, hwAt, rearPatch, rearPos, rearZ, RCOLS, span } from './ProcityHull.js';

const D = spec.dims;

export const RearMixin = {
  rearEnd(parts) {
    const lite = this.lite;
    const dr = this.decalRects;
    // ---- white bumper, white upper body with the rounded roof edge
    parts.add('paint', rearPatch({ xs: RCOLS, y0: D.skirtY, y1: 0.6, nv: 2 }));
    parts.add('paint', rearPatch({ xs: RCOLS, y0: 0.6, y1: 2.76, nv: 4, scale: true }));
    parts.add('paint', rearPatch({ xs: RCOLS, y0: 2.76, y1: 2.878, nv: 3, scale: true }));
    const cap = surfaceGrid(RCOLS.length - 1, 1, (u, v) => {
      const q = RCOLS[Math.round(u * (RCOLS.length - 1))];
      const x = (q * hwAt(2.878)) / 1.275;
      const zEdge = rearZ(Math.abs(q), 2.878);
      return [x, 2.879, lerp(REAR_ROOF_END - 0.02, zEdge, v)];
    });
    parts.add('paint', cap);
    // ---- glossy black tail panel with the window frame
    parts.add('black', rearPatch({ xs: span(-1.19, 1.19, 24), y0: 0.62, y1: 2.64, nv: 8, off: 0.003, scale: true }));
    // window: right half clear glass, left half louvred engine bay
    const win = (x0, x1) => rearPatch({ xs: span(x0, x1, 10), y0: 1.58, y1: 2.56, nv: 4, off: 0.005, scale: true });
    parts.add('glassOut', win(0.05, 1.08));
    parts.add('glassIn', win(0.05, 1.08));
    parts.add('louvreDark', rearPatch({ xs: span(-1.08, -0.03, 8), y0: 1.58, y1: 2.56, nv: 2, off: 0.005, scale: true, uv: [0, 0, 2.6, 2.4] }));
    parts.add('matteBlack', rearPatch({ xs: [-0.03, 0.05], y0: 1.58, y1: 2.56, nv: 1, off: 0.006, scale: true }));
    // lettering band
    parts.add('decals', rearPatch({ xs: span(-0.16, 0.16, 2), y0: 1.36, y1: 1.5, nv: 1, off: 0.0065, uv: dr.bmcRear, scale: true }));
    parts.add('decals', rearPatch({ xs: span(0.5, 0.78, 2), y0: 1.38, y1: 1.47, nv: 1, off: 0.0065, uv: dr.euro6, scale: true }));
    parts.add('decals', rearPatch({ xs: span(0.84, 1.08, 2), y0: 1.35, y1: 1.5, nv: 1, off: 0.0065, uv: dr.cngRear, scale: true }));
    parts.add('decals', rearPatch({ xs: span(0.5, 0.82, 2), y0: 1.1, y1: 1.34, nv: 1, off: 0.0065, uv: dr.leaves, scale: true }));
    parts.add('decals', rearPatch({ xs: span(0.5, 0.84, 4), y0: 0.96, y1: 1.09, nv: 1, off: 0.0065, uv: dr.fleetRear, scale: true }));
    parts.add('decals', rearPatch({ xs: span(-0.05, 0.05, 2), y0: 0.96, y1: 1.1, nv: 1, off: 0.0065, uv: dr.armsRear, scale: true }));
    // round vent grille and camera at the top
    {
      const [px, py, pz] = rearPos(-0.62, 2.6, 0.007);
      const g = new THREE.CircleGeometry(0.05, 16);
      g.scale(1.3, 1, 1);
      parts.add('louvreDark', g, M(px, py, pz));
      const [cx, cy, cz] = rearPos(-0.06, 2.6, 0.012);
      parts.add('satin', box(0.07, 0.05, 0.03), M(cx, cy, cz));
    }
    // ---- plate on the bumper edge
    parts.add('black', rearPatch({ xs: span(-0.275, 0.275, 4), y0: 0.545, y1: 0.69, nv: 1, off: 0.004 }));
    parts.add('plate', rearPatch({ xs: span(-0.26, 0.26, 4), y0: 0.56, y1: 0.675, nv: 1, off: 0.0055 }));
    // ---- lamps: grey housings with a red lens (tail + brake) and a reverse lens, round lamps in the bumper corners, top markers
    for (const sg of [1, -1]) {
      parts.add('lampGrey', rearPatch({ xs: sg > 0 ? span(0.89, 1.12, 3) : span(-1.12, -0.89, 3), y0: 0.8, y1: 1.3, nv: 2, off: 0.006 }));
      const disc = (key, x, y, r, off) => {
        const [px, py, pz] = rearPos(x, y, off);
        const g = new THREE.CircleGeometry(r, 16);
        parts.add(key, g, M(px, py, pz));
      };
      disc('tail', sg * 1.0, 1.15, 0.043, 0.0085);
      disc('brake', sg * 1.0, 1.15, 0.027, 0.0095);
      disc('reverse', sg * 1.0, 0.95, 0.04, 0.0085);
      for (const [y, r] of [[1.15, 0.047], [0.95, 0.044]]) {
        const [px, py, pz] = rearPos(sg * 1.0, y, 0.0082);
        parts.add('satinChrome', new THREE.RingGeometry(r - 0.007, r, 16), M(px, py, pz));
      }
      disc(sg > 0 ? 'indicatorR' : 'indicatorL', sg * 0.98, 0.62, 0.032, 0.006);
      const [mx, my, mz] = rearPos(sg * 0.95, 2.6, 0.007);
      parts.add('tail', box(0.09, 0.035, 0.012), M(mx, my, mz));
    }
    // step edge under the plate
    if (!lite) parts.add('matteBlack', box(0.2, 0.05, 0.02), M(0, 0.38, REAR_Z - 0.04));
  },
};
