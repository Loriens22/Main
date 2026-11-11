import { shaderDetail, type GraphicsSettings } from '../core/Settings';

/**
 * Shared shader-quality uniforms. Materials put these exact objects in their `uniforms`, so one assignment here
 * retunes every live material without recompiling:
 *   uQAtmo   — fraction of the atmosphere ray-march samples (sky dome, Earth globe, planets from orbit)
 *   uQGarg   — fraction of the black-hole geodesic steps (the step length grows to compensate)
 *   uQDetail — fraction of the procedural terrain detail octaves (surface craters, regolith micro-relief)
 */
export const QU = {
  uQAtmo: { value: 1 },
  uQGarg: { value: 1 },
  uQDetail: { value: 1 },
};
/** environment-capture interval multiplier (zones read it) */
export const QENV = { k: 1 };

export function applyShaderQuality(g: GraphicsSettings) {
  const d = shaderDetail(g);
  QU.uQAtmo.value = d.atmo;
  QU.uQGarg.value = d.garg;
  QU.uQDetail.value = d.detail;
  QENV.k = d.env;
}
