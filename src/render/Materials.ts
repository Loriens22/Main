import * as THREE from 'three';
import { applySkin, adoptAO, type SkinSpec } from './CreatureSkin';

/**
 * Material library: upgrades the named Blender materials (see blender/lib/kit.py PALETTE) to full PBR
 * materials with tiling detail textures and a shared weathering layer (dirt, scratches, roughness break-up).
 * GLB meshes carry metre-scale box-projected UVs, so every texture has a consistent texel density.
 */
const TEX_BASE = 'assets/textures/';

export interface Weather {
  grime: number; // dirt amount
  grimeScale: number; // tiles per metre
  grimeTint: THREE.Color;
  scratch: number;
  scratchColor: THREE.Color;
  streak: number; // vertical streaking
  roughVar: number;
}

interface Recipe {
  kind?: 'standard' | 'physical';
  color?: number | [number, number, number];
  rough?: number;
  metal?: number;
  normal?: string;
  normalScale?: number;
  normalRepeat?: number;
  map?: string;
  mapRepeat?: number;
  alphaMap?: string;
  emissive?: [number, number, number];
  emissiveIntensity?: number;
  emissiveMap?: string;
  opacity?: number;
  transmission?: number;
  clearcoat?: number;
  envMapIntensity?: number;
  side?: THREE.Side;
  weather?: Partial<Weather> | false;
  alphaTest?: number;
  sheen?: number;
  /** thin-film colour shift (pearly gas bags) */
  iridescence?: number;
  aoMap?: string;
  /** procedural object-space skin (creatures): replaces the UV weathering layer */
  skin?: SkinSpec;
}

const W_DEFAULT: Weather = {
  grime: 0.35,
  grimeScale: 0.35,
  grimeTint: new THREE.Color(0.55, 0.5, 0.44),
  scratch: 0.15,
  scratchColor: new THREE.Color(0.75, 0.75, 0.74),
  streak: 0.15,
  roughVar: 0.18,
};

const C = (r: number, g: number, b: number): [number, number, number] => [r, g, b];

/** Name → recipe. Names not listed fall back to the GLB material (lightly weathered). */
const RECIPES: Record<string, Recipe> = {
  // ---- aerospace exteriors
  paint_white_aero: { color: C(0.78, 0.78, 0.76), rough: 0.5, normal: 'panel_n', normalScale: 0.35, normalRepeat: 0.5, weather: { grime: 0.45, streak: 0.35, scratch: 0.12 } },
  paint_white_worn: { color: C(0.68, 0.67, 0.63), rough: 0.62, normal: 'panel_n', normalScale: 0.4, normalRepeat: 0.5, weather: { grime: 0.7, streak: 0.5, scratch: 0.25 } },
  paint_dark_aero: { color: C(0.05, 0.052, 0.056), rough: 0.6, normal: 'panel_n', normalScale: 0.3, normalRepeat: 0.4, weather: { grime: 0.3, grimeTint: new THREE.Color(1.8, 1.7, 1.6), scratch: 0.25, scratchColor: new THREE.Color(0.3, 0.3, 0.3) } },
  paint_charcoal: { color: C(0.1, 0.104, 0.11), rough: 0.58, normal: 'panel_n', normalScale: 0.3, normalRepeat: 0.4, weather: { grime: 0.3, grimeTint: new THREE.Color(1.6, 1.55, 1.5), scratch: 0.25, scratchColor: new THREE.Color(0.35, 0.35, 0.35) } },
  frame_black: { color: C(0.025, 0.025, 0.027), rough: 0.4, weather: { grime: 0.15, grimeTint: new THREE.Color(2, 2, 2), scratch: 0.2, scratchColor: new THREE.Color(0.3, 0.3, 0.3) } },
  glass_dark: { kind: 'physical', color: C(0.02, 0.024, 0.03), rough: 0.03, metal: 0, opacity: 0.55, envMapIntensity: 1.6, clearcoat: 1, weather: false },
  glass_clear: { kind: 'physical', color: C(0.7, 0.75, 0.8), rough: 0.02, metal: 0, opacity: 0.16, envMapIntensity: 1.4, weather: false },
  metal_gray: { color: C(0.42, 0.43, 0.44), rough: 0.4, metal: 1, normal: 'brushed', normalScale: 0.08, weather: { grime: 0.3, scratch: 0.3 } },
  metal_dark: { color: C(0.17, 0.175, 0.18), rough: 0.46, metal: 1, weather: { grime: 0.3, scratch: 0.35, scratchColor: new THREE.Color(0.6, 0.6, 0.6) } },
  metal_silver: { color: C(0.82, 0.82, 0.84), rough: 0.2, metal: 1, weather: { grime: 0.15, scratch: 0.1 } },
  metal_brushed: { color: C(0.64, 0.64, 0.66), rough: 0.3, metal: 1, weather: { grime: 0.2, scratch: 0.2 } },
  metal_gunmetal: { color: C(0.19, 0.19, 0.21), rough: 0.45, metal: 0.9, normal: 'panel_n', normalScale: 0.35, normalRepeat: 0.4, weather: { grime: 0.35, scratch: 0.35, scratchColor: new THREE.Color(0.55, 0.55, 0.58) } },
  metal_purple: { color: C(0.34, 0.33, 0.42), rough: 0.5, metal: 0.7, normal: 'panel_n', normalScale: 0.3, normalRepeat: 0.4, weather: { grime: 0.35, scratch: 0.3 } },
  metal_bronze: { color: C(0.42, 0.3, 0.18), rough: 0.45, metal: 1, weather: { grime: 0.3, scratch: 0.2 } },
  honeycomb_purple: { color: C(0.42, 0.41, 0.52), rough: 0.48, metal: 0.55, normal: 'hexmesh_n', normalScale: 0.9, normalRepeat: 1.2, weather: { grime: 0.35 } },
  rivet_steel: { color: C(0.5, 0.5, 0.52), rough: 0.35, metal: 1, weather: false },
  thermal_tile: { color: C(0.07, 0.07, 0.075), rough: 0.88, normal: 'panel_n', normalScale: 0.5, normalRepeat: 1.2, weather: { grime: 0.3, grimeTint: new THREE.Color(1.5, 1.45, 1.4) } },
  hull_seam: { color: C(0.02, 0.02, 0.022), rough: 0.75, weather: false },
  hatch_gray: { color: C(0.62, 0.63, 0.64), rough: 0.38, metal: 0.35, weather: { grime: 0.35, scratch: 0.3 } },
  warning_yellow: { color: C(0.85, 0.6, 0.05), rough: 0.5, weather: { grime: 0.35, scratch: 0.3 } },
  warning_red: { color: C(0.6, 0.05, 0.04), rough: 0.5 },
  nozzle_inner: { color: C(0.1, 0.085, 0.075), rough: 0.6, metal: 1, weather: { grime: 0.6, grimeTint: new THREE.Color(0.4, 0.35, 0.3) } },
  radiator_black: { color: C(0.03, 0.03, 0.035), rough: 0.5, metal: 0.4, normal: 'ribbed_n', normalScale: 0.6, normalRepeat: 2, weather: { grime: 0.2, grimeTint: new THREE.Color(2, 2, 2) } },
  foil_gold: { color: C(0.8, 0.58, 0.2), rough: 0.25, metal: 1, normal: 'fabric_n', normalScale: 0.6, normalRepeat: 2 },
  // ---- interiors
  int_panel_dark: { color: C(0.11, 0.11, 0.115), rough: 0.5, metal: 0.5, normal: 'panel_n', normalScale: 0.4, normalRepeat: 0.8, weather: { grime: 0.3, scratch: 0.3 } },
  int_panel_mid: { color: C(0.27, 0.27, 0.26), rough: 0.55, metal: 0.2, normal: 'panel_n', normalScale: 0.35, normalRepeat: 0.8, weather: { grime: 0.35, scratch: 0.25 } },
  int_panel_light: { color: C(0.62, 0.62, 0.6), rough: 0.6, normal: 'panel_n', normalScale: 0.3, normalRepeat: 0.8, weather: { grime: 0.4, scratch: 0.2 } },
  int_panel_green: { color: C(0.45, 0.48, 0.44), rough: 0.6, normal: 'panel_n', normalScale: 0.3, normalRepeat: 0.8, weather: { grime: 0.4 } },
  int_floor: { color: C(0.24, 0.23, 0.21), rough: 0.62, metal: 0.3, normal: 'panel_n', normalScale: 0.5, normalRepeat: 0.8, weather: { grime: 0.55, scratch: 0.5 } },
  int_grate: { color: C(0.32, 0.23, 0.14), rough: 0.5, metal: 0.9, alphaMap: 'grate', alphaTest: 0.5, mapRepeat: 2, side: THREE.DoubleSide, weather: { grime: 0.4 } },
  pad_beige: { color: C(0.6, 0.55, 0.46), rough: 0.88, normal: 'quilt_n', normalScale: 0.7, normalRepeat: 1.2, sheen: 0.4, weather: { grime: 0.4, scratch: 0 } },
  pad_blue: { color: C(0.15, 0.25, 0.48), rough: 0.88, normal: 'quilt_n', normalScale: 0.8, normalRepeat: 1.5, sheen: 0.4, weather: { grime: 0.3, scratch: 0 } },
  pad_white: { color: C(0.82, 0.82, 0.8), rough: 0.9, normal: 'quilt_n', normalScale: 0.7, normalRepeat: 1.2, sheen: 0.3, weather: { grime: 0.4, scratch: 0 } },
  pad_gray: { color: C(0.2, 0.2, 0.22), rough: 0.9, normal: 'quilt_n', normalScale: 0.8, normalRepeat: 1.4, weather: { grime: 0.2, scratch: 0 } },
  fabric_red: { color: C(0.3, 0.065, 0.065), rough: 0.78, normal: 'ribbed_n', normalScale: 0.6, normalRepeat: 2, sheen: 0.6, weather: { grime: 0.3, scratch: 0 } },
  fabric_bag: { color: C(0.74, 0.73, 0.68), rough: 0.92, normal: 'fabric_n', normalScale: 0.8, normalRepeat: 4, sheen: 0.3, weather: { grime: 0.5, scratch: 0 } },
  fabric_orange: { color: C(0.75, 0.3, 0.08), rough: 0.85, normal: 'fabric_n', normalScale: 0.6, normalRepeat: 4, weather: { grime: 0.4, scratch: 0 } },
  net: { color: C(0.1, 0.1, 0.1), rough: 0.8, alphaMap: 'net', alphaTest: 0.4, mapRepeat: 3, side: THREE.DoubleSide, weather: false },
  tile_white: { color: 0xffffff, map: 'tile_a', mapRepeat: 1, rough: 0.32, normal: 'tile_n', normalScale: 0.7, normalRepeat: 1, weather: { grime: 0.3, scratch: 0.05 } },
  plastic_white: { color: C(0.84, 0.84, 0.82), rough: 0.42, weather: { grime: 0.35, scratch: 0.2 } },
  plastic_dark: { color: C(0.06, 0.06, 0.065), rough: 0.45, weather: { grime: 0.2, grimeTint: new THREE.Color(1.8, 1.8, 1.8), scratch: 0.2 } },
  rubber_black: { color: C(0.02, 0.02, 0.02), rough: 0.92, weather: { grime: 0.4, grimeTint: new THREE.Color(2.5, 2.3, 2.1) } },
  pipe_blue: { color: C(0.05, 0.12, 0.35), rough: 0.4, weather: { grime: 0.2 } },
  console_dark: { color: C(0.075, 0.08, 0.085), rough: 0.45, metal: 0.4, normal: 'panel_n', normalScale: 0.3, normalRepeat: 1, weather: { grime: 0.25, scratch: 0.3, scratchColor: new THREE.Color(0.4, 0.4, 0.4) } },
  console_beige: { color: C(0.55, 0.52, 0.44), rough: 0.55, normal: 'panel_n', normalScale: 0.3, normalRepeat: 1, weather: { grime: 0.4, scratch: 0.2 } },
  switch_panel: { color: C(0.09, 0.09, 0.09), rough: 0.5, weather: { grime: 0.2 } },
  emit_warm: { color: C(1, 0.88, 0.7), emissive: C(1.0, 0.82, 0.6), emissiveIntensity: 6, rough: 0.5, weather: false },
  emit_cool: { color: C(0.85, 0.92, 1), emissive: C(0.82, 0.9, 1.0), emissiveIntensity: 6, rough: 0.5, weather: false },
  // monitors show a procedural telemetry UI atlas (≈0.6 m per panel on metre-scale UVs)
  emit_screen: { color: C(0.02, 0.025, 0.03), emissive: C(1, 1, 1), emissiveMap: 'screen_ui_a', mapRepeat: 1 / 2.4, emissiveIntensity: 1.5, rough: 0.15, weather: false },
  emit_screen_amber: { color: C(0.02, 0.02, 0.02), emissive: C(1.0, 0.72, 0.4), emissiveMap: 'screen_ui_a', mapRepeat: 1 / 2.4, emissiveIntensity: 1.4, rough: 0.15, weather: false },
  emit_red: { color: C(1, 0.1, 0.05), emissive: C(1, 0.08, 0.04), emissiveIntensity: 8, weather: false },
  emit_green: { color: C(0.1, 1, 0.2), emissive: C(0.1, 1, 0.25), emissiveIntensity: 5, weather: false },
  emit_white: { color: C(1, 1, 1), emissive: C(1, 1, 1), emissiveIntensity: 10, weather: false },
  leather_brown: { color: C(0.25, 0.14, 0.08), rough: 0.6, sheen: 0.3, weather: { grime: 0.3 } },
  // ---- earth
  clapboard: { color: 0xffffff, map: 'clapboard_a', mapRepeat: 1 / 3.68, rough: 0.88, normal: 'clapboard_n', normalScale: 0.7, normalRepeat: 1 / 3.68, weather: { grime: 0.22, grimeScale: 0.15, streak: 0.35, scratch: 0 } },
  shingle_dark: { color: 0xffffff, map: 'shingle_a', mapRepeat: 1, rough: 0.95, normal: 'shingle_n', normalScale: 0.8, normalRepeat: 1, weather: { grime: 0.25, grimeScale: 0.2, streak: 0.3, scratch: 0 } },
  shingle_dusty: { color: 0xffffff, map: 'shingle_dusty_a', mapRepeat: 1, rough: 0.97, normal: 'shingle_n', normalScale: 0.7, normalRepeat: 1, weather: { grime: 0.3, grimeScale: 0.2, streak: 0.25, scratch: 0 } },
  wood_board: { color: C(0.62, 0.48, 0.34), map: 'wood_floor_a', mapRepeat: 0.6, rough: 0.88, weather: { grime: 0.5, streak: 0.4, scratch: 0 } },
  wood_gray: { color: 0xffffff, map: 'wood_weathered_a', mapRepeat: 1, rough: 0.9, normal: 'wood_weathered_n', normalScale: 0.6, normalRepeat: 1, weather: { grime: 0.45, streak: 0.2, scratch: 0 } },
  screen_mesh: { color: C(0.04, 0.04, 0.045), rough: 0.6, opacity: 0.42, side: THREE.DoubleSide, weather: false },
  sand_dust: { color: C(0.39, 0.36, 0.31), rough: 0.97, normal: 'sand_n', normalScale: 0.5, normalRepeat: 0.4, weather: { grime: 0.25, grimeScale: 0.1, grimeTint: new THREE.Color(0.85, 0.8, 0.72), scratch: 0, streak: 0 } },
  firewood: { color: C(0.62, 0.5, 0.36), map: 'wood_floor_a', mapRepeat: 1.2, rough: 0.9, weather: { grime: 0.4 } },
  bark: { color: C(0.24, 0.2, 0.16), rough: 0.95, normal: 'rock_n', normalScale: 1.0, normalRepeat: 2, weather: { grime: 0.3 } },
  poly_blue: { color: C(0.1, 0.26, 0.55), rough: 0.42, weather: { grime: 0.45, grimeTint: new THREE.Color(0.75, 0.65, 0.5), streak: 0.3, scratch: 0.1 } },
  enamel_white: { color: C(0.82, 0.82, 0.79), rough: 0.32, weather: { grime: 0.4, streak: 0.3, scratch: 0.2 } },
  car_paint_cream: { kind: 'physical', color: C(0.7, 0.68, 0.61), rough: 0.58, metal: 0.15, clearcoat: 0.25, weather: { grime: 0.75, grimeScale: 0.4, grimeTint: new THREE.Color(0.72, 0.64, 0.52), scratch: 0.35, streak: 0.45 } },
  car_paint_blue_faded: { kind: 'physical', color: C(0.15, 0.25, 0.38), rough: 0.6, metal: 0.25, clearcoat: 0.25, weather: { grime: 0.75, grimeScale: 0.4, grimeTint: new THREE.Color(1.6, 1.45, 1.2), scratch: 0.35, streak: 0.4 } },
  steel_painted_blue: { color: C(0.07, 0.16, 0.4), rough: 0.5, metal: 0.4, weather: { grime: 0.5, grimeTint: new THREE.Color(1.5, 1.4, 1.2), scratch: 0.4, streak: 0.3 } },
  vinyl_blue: { color: C(0.1, 0.14, 0.24), rough: 0.55, normal: 'fabric_n', normalScale: 0.3, normalRepeat: 3, sheen: 0.3, weather: { grime: 0.35, scratch: 0.15 } },
  lamp_lens: { kind: 'physical', color: C(0.5, 0.52, 0.52), rough: 0.12, metal: 0.2, clearcoat: 1, weather: { grime: 0.5, scratch: 0 } },
  lamp_lens_red: { kind: 'physical', color: C(0.5, 0.03, 0.02), rough: 0.12, clearcoat: 1, weather: { grime: 0.4, scratch: 0 } },
  lamp_lens_amber: { kind: 'physical', color: C(0.8, 0.42, 0.05), rough: 0.12, clearcoat: 1, weather: { grime: 0.4, scratch: 0 } },
  gauge_face: { color: C(0.03, 0.03, 0.035), rough: 0.4, weather: false },
  rubber_mat: { color: C(0.05, 0.05, 0.05), rough: 0.92, normal: 'ribbed_n', normalScale: 0.5, normalRepeat: 6, weather: { grime: 0.6, grimeTint: new THREE.Color(4, 3.6, 3) } },
  plate_white: { color: C(0.78, 0.78, 0.74), rough: 0.4, weather: { grime: 0.6, streak: 0.4 } },
  plastic_gray: { color: C(0.22, 0.22, 0.23), rough: 0.5, weather: { grime: 0.4 } },
  lander_silver: { color: C(0.6, 0.61, 0.64), rough: 0.36, metal: 0.75, normal: 'panel_n', normalScale: 0.5, normalRepeat: 0.6, weather: { grime: 0.35, scratch: 0.35, streak: 0.25 } },
  lander_graphite: { color: C(0.15, 0.14, 0.17), rough: 0.55, metal: 0.5, normal: 'panel_n', normalScale: 0.45, normalRepeat: 0.6, weather: { grime: 0.3, grimeTint: new THREE.Color(1.6, 1.5, 1.6), scratch: 0.35, scratchColor: new THREE.Color(0.45, 0.43, 0.48), streak: 0.2 } },
  endu_panel: { color: C(0.52, 0.57, 0.66), rough: 0.3, metal: 0.4, normal: 'panel_n', normalScale: 0.25, normalRepeat: 1.4, weather: { grime: 0.2 } },
  endu_panel_dark: { color: C(0.14, 0.17, 0.23), rough: 0.45, metal: 0.35, normal: 'panel_n', normalScale: 0.4, normalRepeat: 1.0, weather: { grime: 0.2, grimeTint: new THREE.Color(1.6, 1.6, 1.7) } },
  console_blue: { color: C(0.12, 0.24, 0.44), rough: 0.5, metal: 0.15, normal: 'panel_n', normalScale: 0.3, normalRepeat: 1.5, weather: { grime: 0.45, scratch: 0.35, scratchColor: new THREE.Color(0.6, 0.62, 0.65) } },
  endu_floor: { color: C(0.07, 0.07, 0.075), rough: 0.82, normal: 'hexmesh_n', normalScale: 0.9, normalRepeat: 3, weather: { grime: 0.5, grimeTint: new THREE.Color(2.5, 2.3, 2.1) } },
  endu_seam: { color: C(0.4, 0.4, 0.4), rough: 0.6, weather: false },
  endu_edge: { color: C(0.6, 0.61, 0.6), rough: 0.42, metal: 0.3, normal: 'brushed', normalScale: 0.08, weather: { grime: 0.4, scratch: 0.25 } },
  carpet_gray: { color: C(0.16, 0.17, 0.2), rough: 0.96, normal: 'fabric_n', normalScale: 0.9, normalRepeat: 3, weather: { grime: 0.3, scratch: 0 } },
  chrome_dull: { color: C(0.72, 0.72, 0.71), rough: 0.32, metal: 1, weather: { grime: 0.55, grimeTint: new THREE.Color(0.7, 0.62, 0.5), scratch: 0.25, streak: 0.3 } },
  needles_spruce: { color: C(0.82, 0.9, 0.86), map: 'conifer_branch_rgba', mapRepeat: 1, alphaTest: 0.42, rough: 0.82, side: THREE.DoubleSide, weather: false },
  needles_fir: { color: C(0.95, 1.05, 0.92), map: 'conifer_branch_rgba', mapRepeat: 1, alphaTest: 0.42, rough: 0.82, side: THREE.DoubleSide, weather: false },
  needles_pine: { color: C(0.95, 1.0, 0.9), map: 'pine_branch_rgba', mapRepeat: 1, alphaTest: 0.42, rough: 0.8, side: THREE.DoubleSide, weather: false },
  bark_spruce: { color: 0xffffff, map: 'bark_a', mapRepeat: 1, rough: 0.95, normal: 'bark_n', normalScale: 1.2, normalRepeat: 1, weather: false },
  bark_pine: { color: 0xffffff, map: 'bark_pine_a', mapRepeat: 1, rough: 0.93, normal: 'bark_pine_n', normalScale: 1.2, normalRepeat: 1, weather: false },
  snag_wood: { color: C(1.35, 1.35, 1.35), map: 'bark_a', mapRepeat: 1, rough: 0.95, normal: 'bark_n', normalScale: 1.0, normalRepeat: 1, weather: false },
  wood_siding: { color: 0xffffff, map: 'wood_siding_a', mapRepeat: 0.62, rough: 0.86, normal: 'wood_siding_n', normalScale: 1.0, normalRepeat: 0.62, weather: { grime: 0.18, grimeScale: 0.12, streak: 0.22, scratch: 0 } },
  wood_trim: { color: C(0.78, 0.77, 0.72), rough: 0.8, normal: 'fabric_n', normalScale: 0.2, normalRepeat: 1, weather: { grime: 0.5, streak: 0.4, scratch: 0 } },
  wood_floor: { color: 0xffffff, map: 'wood_floor_a', mapRepeat: 0.4, rough: 0.55, normal: 'wood_floor_n', normalScale: 0.6, normalRepeat: 0.4, weather: { grime: 0.25, scratch: 0.2 } },
  wood_dark: { color: C(0.25, 0.17, 0.1), map: 'wood_floor_a', mapRepeat: 0.8, rough: 0.55, weather: { grime: 0.3 } },
  wood_raw: { color: C(0.5, 0.4, 0.28), map: 'wood_floor_a', mapRepeat: 0.5, rough: 0.85, weather: { grime: 0.4 } },
  roof_shingle: { color: C(0.33, 0.32, 0.3), rough: 0.92, normal: 'ribbed_n', normalScale: 0.6, normalRepeat: 3, weather: { grime: 0.6, streak: 0.3, scratch: 0 } },
  roof_metal: { color: C(0.45, 0.44, 0.42), rough: 0.55, metal: 0.8, normal: 'ribbed_n', normalScale: 0.5, normalRepeat: 1.5, weather: { grime: 0.6, streak: 0.6 } },
  plaster_wall: { color: C(0.74, 0.7, 0.62), rough: 0.9, normal: 'concrete_n', normalScale: 0.15, normalRepeat: 0.5, weather: { grime: 0.3, scratch: 0 } },
  wallpaper: { color: C(0.6, 0.56, 0.46), rough: 0.9, normal: 'fabric_n', normalScale: 0.3, normalRepeat: 2, weather: { grime: 0.4, streak: 0.3, scratch: 0 } },
  concrete: { color: 0xffffff, map: 'concrete_a', mapRepeat: 0.25, rough: 0.9, normal: 'concrete_n', normalScale: 0.6, normalRepeat: 0.25, weather: { grime: 0.45, streak: 0.5, scratch: 0 } },
  concrete_dark: { color: C(0.62, 0.61, 0.6), map: 'concrete_a', mapRepeat: 0.25, rough: 0.9, normal: 'concrete_n', normalScale: 0.6, normalRepeat: 0.25, weather: { grime: 0.5, streak: 0.5, scratch: 0 } },
  asphalt: { color: 0xffffff, map: 'asphalt_a', mapRepeat: 0.25, rough: 0.92, normal: 'asphalt_n', normalScale: 0.5, normalRepeat: 0.25, weather: false },
  steel_painted_gray: { color: C(0.35, 0.36, 0.36), rough: 0.5, metal: 0.6, weather: { grime: 0.45, scratch: 0.35, streak: 0.4 } },
  steel_painted_yellow: { color: C(0.78, 0.56, 0.05), rough: 0.5, metal: 0.3, weather: { grime: 0.45, scratch: 0.4 } },
  steel_painted_white: { color: C(0.78, 0.78, 0.76), rough: 0.5, metal: 0.3, weather: { grime: 0.45, scratch: 0.3, streak: 0.4 } },
  steel_galv: { color: C(0.6, 0.6, 0.6), rough: 0.42, metal: 1, normal: 'brushed', normalScale: 0.1, weather: { grime: 0.4, streak: 0.4 } },
  farm_red: { color: C(0.46, 0.06, 0.04), rough: 0.42, metal: 0.25, clearcoat: 0.3, weather: { grime: 0.55, grimeTint: new THREE.Color(0.75, 0.62, 0.48), scratch: 0.3, streak: 0.3 } },
  farm_red_faded: { color: C(0.45, 0.14, 0.09), rough: 0.6, metal: 0.1, weather: { grime: 0.7, grimeTint: new THREE.Color(0.75, 0.62, 0.48), scratch: 0.4, streak: 0.5 } },
  tire_rubber: { color: C(0.025, 0.025, 0.025), rough: 0.88, normal: 'ribbed_n', normalScale: 0.6, normalRepeat: 4, weather: { grime: 0.7, grimeTint: new THREE.Color(5, 4.2, 3.2) } },
  car_paint_blue: { kind: 'physical', color: C(0.07, 0.13, 0.21), rough: 0.42, metal: 0.4, clearcoat: 0.6, weather: { grime: 0.6, grimeTint: new THREE.Color(1.6, 1.4, 1.1), scratch: 0.3, streak: 0.3 } },
  car_paint_tan: { kind: 'physical', color: C(0.55, 0.48, 0.36), rough: 0.5, metal: 0.3, clearcoat: 0.4, weather: { grime: 0.6, scratch: 0.3, streak: 0.3 } },
  chrome: { color: C(0.9, 0.9, 0.9), rough: 0.08, metal: 1, weather: { grime: 0.25, scratch: 0.1 } },
  fabric_sofa: { color: C(0.36, 0.3, 0.24), rough: 0.92, normal: 'fabric_n', normalScale: 0.8, normalRepeat: 4, sheen: 0.6, weather: { grime: 0.3, scratch: 0 } },
  fabric_bed: { color: C(0.7, 0.68, 0.62), rough: 0.92, normal: 'fabric_n', normalScale: 0.6, normalRepeat: 4, sheen: 0.4, weather: { grime: 0.2, scratch: 0 } },
  fabric_curtain: { color: C(0.65, 0.6, 0.5), rough: 0.92, normal: 'fabric_n', normalScale: 0.5, normalRepeat: 4, side: THREE.DoubleSide, sheen: 0.4, weather: { grime: 0.3, scratch: 0 } },
  ceramic_white: { color: C(0.9, 0.9, 0.88), rough: 0.18, weather: { grime: 0.2, scratch: 0 } },
  rust: { color: 0xffffff, map: 'rust_a', mapRepeat: 0.5, rough: 0.88, metal: 0.3, normal: 'concrete_n', normalScale: 0.6, normalRepeat: 0.5, weather: { grime: 0.4 } },
  rock_granite: { color: C(0.55, 0.47, 0.4), map: 'rock_a', mapRepeat: 0.3, rough: 0.9, normal: 'rock_n', normalScale: 1.2, normalRepeat: 0.3, weather: { grime: 0.3, scratch: 0 } },
  rock_dark: { color: C(0.5, 0.48, 0.46), map: 'rock_a', mapRepeat: 0.3, rough: 0.9, normal: 'rock_n', normalScale: 1.2, normalRepeat: 0.3, weather: { grime: 0.3, scratch: 0 } },
  ice: { kind: 'physical', color: C(0.8, 0.85, 0.9), map: 'ice_a', mapRepeat: 0.2, rough: 0.22, normal: 'ice_n', normalScale: 0.8, normalRepeat: 0.2, clearcoat: 0.6, weather: false },
  // alien life (blender/lib/creature.py)
  strider_shell: { kind: 'physical', color: C(0.66, 0.24, 0.15), rough: 0.36, clearcoat: 0.45, sheen: 0.2, weather: false,
    skin: { plates: 0.0025, plateSize: 0.05, plateGroove: 0.12, pores: 0.0012, poreSize: 0.012, wrinkle: 0.0015, wrinkleSize: 0.04, mottle: 0.5, mottleSize: 0.25, mottleColor: [0.45, 0.15, 0.09], mottle2: 0.4, mottle2Size: 0.06, mottle2Color: [0.8, 0.4, 0.28], cavity: 0.35, wet: 0.3, vary: 0.25 } },
  strider_hide: { kind: 'physical', color: C(0.12, 0.075, 0.06), rough: 0.5, sheen: 0.35, clearcoat: 0.2, weather: false,
    skin: { wrinkle: 0.006, wrinkleSize: 0.035, wrinkleAxis: [1, 4, 1], plates: 0.002, plateSize: 0.018, plateGroove: 0.25, pores: 0.001, poreSize: 0.008, mottle: 0.5, mottleSize: 0.12, mottleColor: [0.22, 0.15, 0.12], cavity: 0.45, wet: 0.2, vary: 0.3 } },
  strider_seam: { kind: 'physical', color: C(0.04, 0.028, 0.022), rough: 0.4, clearcoat: 0.3, weather: false, skin: { wrinkle: 0.002, wrinkleSize: 0.02, mottle: 0.4, mottleSize: 0.05, mottleColor: [0.1, 0.06, 0.05] } },
  strider_glow: { kind: 'physical', color: C(0.1, 0.5, 0.7), emissive: C(0.15, 0.75, 1.0), emissiveIntensity: 1.2, rough: 0.12, clearcoat: 1, weather: false },
  claw_black: { kind: 'physical', color: C(0.035, 0.03, 0.03), rough: 0.25, clearcoat: 0.6, weather: false,
    skin: { wrinkle: 0.0015, wrinkleSize: 0.02, wrinkleAxis: [4, 1, 4], mottle: 0.3, mottleSize: 0.05, mottleColor: [0.08, 0.07, 0.06] } },
  stalker_skin: { color: C(0.34, 0.3, 0.26), rough: 0.6, normal: 'rock_n', normalScale: 0.55, normalRepeat: 2.2, sheen: 0.25, weather: { grime: 0.45, grimeScale: 0.8, grimeTint: new THREE.Color(0.7, 0.58, 0.48), scratch: 0, streak: 0 } },
  mouth_red: { kind: 'physical', color: C(0.26, 0.04, 0.05), rough: 0.25, clearcoat: 0.8, weather: false, skin: { wrinkle: 0.002, wrinkleSize: 0.015, mottle: 0.5, mottleSize: 0.03, mottleColor: [0.12, 0.02, 0.03], cavity: 0.5, wet: 0.7 } },
  tooth: { kind: 'physical', color: C(0.82, 0.78, 0.65), rough: 0.3, clearcoat: 0.6, weather: false,
    skin: { wrinkle: 0.001, wrinkleSize: 0.02, wrinkleAxis: [4, 1, 4], mottle: 0.4, mottleSize: 0.05, mottleColor: [0.6, 0.55, 0.45] } },
  wing_skin: { kind: 'physical', color: C(0.56, 0.64, 0.73), rough: 0.4, normal: 'hexmesh_n', normalScale: 0.15, normalRepeat: 1, sheen: 0.4, clearcoat: 0.2, weather: { grime: 0.2, grimeScale: 0.5, grimeTint: new THREE.Color(0.8, 0.85, 0.95), scratch: 0, streak: 0.2 } },
  wing_dark: { kind: 'physical', color: C(0.12, 0.13, 0.17), rough: 0.35, clearcoat: 0.4, weather: false },
  wing_mark: { kind: 'physical', color: C(0.78, 0.2, 0.13), emissive: C(1.0, 0.22, 0.1), emissiveIntensity: 0.55, rough: 0.35, clearcoat: 0.5, weather: false },
  // Jupiter
  floater_bag: { kind: 'physical', color: C(0.72, 0.38, 0.25), rough: 0.07, clearcoat: 1, iridescence: 0.95, sheen: 0.2, envMapIntensity: 1.9, weather: false,
    skin: { wrinkle: 0.01, wrinkleSize: 0.6, wrinkleAxis: [1, 1, 3], pores: 0.003, poreSize: 0.15, cavity: 0.25, wet: 0.6, vary: 0.15 } },
  floater_shell: { kind: 'physical', color: C(0.82, 0.78, 0.7), rough: 0.3, clearcoat: 0.6, weather: false,
    skin: { wrinkle: 0.01, wrinkleSize: 0.08, wrinkleAxis: [4, 1, 4], pores: 0.002, poreSize: 0.03, mottle: 0.4, mottleSize: 0.2, mottleColor: [0.62, 0.55, 0.45], cavity: 0.4, vary: 0.25 } },
  floater_tendril: { kind: 'physical', color: C(0.32, 0.22, 0.17), emissive: C(0.45, 0.75, 1.0), emissiveIntensity: 0, rough: 0.5, sheen: 0.3, weather: false,
    skin: { wrinkle: 0.006, wrinkleSize: 0.1, wrinkleAxis: [1, 1, 5], mottle: 0.4, mottleSize: 0.4, mottleColor: [0.2, 0.13, 0.1], cavity: 0.4 } },
  ray_skin: { kind: 'physical', color: C(0.03, 0.035, 0.038), rough: 0.36, sheen: 0.35, clearcoat: 0.5, weather: false,
    skin: { wrinkle: 0.012, wrinkleSize: 0.4, wrinkleAxis: [3, 1, 3], pores: 0.004, poreSize: 0.08, plates: 0.003, plateSize: 0.12, plateGroove: 0.25, mottle: 0.45, mottleSize: 1.5, mottleColor: [0.07, 0.08, 0.085], cavity: 0.35, wet: 0.3, vary: 0.3 } },
  ray_belly: { kind: 'physical', color: C(0.1, 0.11, 0.115), rough: 0.45, sheen: 0.3, weather: false,
    skin: { wrinkle: 0.01, wrinkleSize: 0.3, wrinkleAxis: [4, 1, 1], pores: 0.003, poreSize: 0.06, mottle: 0.4, mottleSize: 1.0, mottleColor: [0.16, 0.17, 0.18], cavity: 0.35, vary: 0.25 } },
  ray_lip: { kind: 'physical', color: C(0.12, 0.12, 0.12), rough: 0.35, clearcoat: 0.5, weather: false,
    skin: { wrinkle: 0.01, wrinkleSize: 0.12, pores: 0.003, poreSize: 0.05, mottle: 0.4, mottleSize: 0.3, mottleColor: [0.25, 0.22, 0.22], cavity: 0.45, wet: 0.5 } },
  ray_eye: { color: C(0.3, 0.05, 0.03), emissive: C(1.0, 0.18, 0.08), emissiveIntensity: 0.4, rough: 0.2, weather: false },
  maw_throat: { color: C(0.12, 0.02, 0.025), emissive: C(0.6, 0.05, 0.03), emissiveIntensity: 0, rough: 0.3, weather: false },
  puff_bladder: { kind: 'physical', color: C(0.78, 0.7, 0.55), rough: 0.32, sheen: 0.5, clearcoat: 0.4, weather: false,
    skin: { wrinkle: 0.008, wrinkleSize: 0.2, wrinkleAxis: [1, 1, 3], pores: 0.002, poreSize: 0.05, retic: 0.3, reticSize: 0.5, reticWidth: 0.04, reticColor: [0.6, 0.45, 0.33], cavity: 0.35, vary: 0.25 } },
  puff_spore: { kind: 'physical', color: C(0.84, 0.78, 0.64), emissive: C(0.45, 1.0, 0.3), emissiveIntensity: 0, rough: 0.25, clearcoat: 0.6, weather: false,
    skin: { wrinkle: 0.004, wrinkleSize: 0.1, pores: 0.002, poreSize: 0.04, cavity: 0.3, vary: 0.2 } },
  puff_tendril: { kind: 'physical', color: C(0.8, 0.72, 0.58), rough: 0.45, sheen: 0.4, weather: false, skin: { wrinkle: 0.002, wrinkleSize: 0.05, wrinkleAxis: [1, 1, 4], mottle: 0.3, mottleSize: 0.3, mottleColor: [0.6, 0.52, 0.42] } },
  hunter_bag: { kind: 'physical', color: C(0.6, 0.45, 0.1), rough: 0.45, sheen: 0.45, clearcoat: 0.2, weather: false,
    skin: { wrinkle: 0.025, wrinkleSize: 1.2, wrinkleAxis: [3, 1, 3], pores: 0.008, poreSize: 0.25, plates: 0.002, plateSize: 0.35, plateGroove: 0.35, mottle: 0.4, mottleSize: 3, mottleColor: [0.42, 0.3, 0.06], cavity: 0.35, vary: 0.3 } },
  hunter_groove: { kind: 'physical', color: C(0.22, 0.2, 0.05), rough: 0.55, weather: false, skin: { wrinkle: 0.02, wrinkleSize: 0.6, cavity: 0.5, vary: 0.3 } },
  hunter_fin: { kind: 'physical', color: C(0.78, 0.7, 0.36), rough: 0.42, sheen: 0.4, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.01, wrinkleSize: 0.8, wrinkleAxis: [1, 0.3, 1], mottle: 0.35, mottleSize: 2, mottleColor: [0.6, 0.52, 0.25], cavity: 0.3 } },
  hunter_crest: { kind: 'physical', color: C(0.66, 0.26, 0.06), rough: 0.5, weather: false,
    skin: { pores: 0.02, poreSize: 0.4, wrinkle: 0.015, wrinkleSize: 0.6, mottle: 0.4, mottleSize: 1.5, mottleColor: [0.85, 0.42, 0.12], cavity: 0.45, vary: 0.3 } },
  hunter_pore: { color: C(0.12, 0.07, 0.04), rough: 0.7, weather: false },
  hunter_organ: { kind: 'physical', color: C(0.08, 0.25, 0.9), emissive: C(0.1, 0.3, 1.0), emissiveIntensity: 0.45, rough: 0.15, clearcoat: 1, weather: false },
  hunter_whisker: { kind: 'physical', color: C(0.04, 0.035, 0.035), rough: 0.35, clearcoat: 0.4, weather: false, skin: { wrinkle: 0.003, wrinkleSize: 0.1, wrinkleAxis: [1, 1, 4] } },
  hunter_cord: { color: C(0.1, 0.08, 0.07), rough: 0.6, weather: false },
  hunter_body: { kind: 'physical', color: C(0.16, 0.12, 0.13), rough: 0.45, sheen: 0.35, clearcoat: 0.25, weather: false,
    skin: { wrinkle: 0.02, wrinkleSize: 0.3, pores: 0.008, poreSize: 0.12, plates: 0.005, plateSize: 0.2, plateGroove: 0.25, mottle: 0.45, mottleSize: 1.2, mottleColor: [0.3, 0.22, 0.25], cavity: 0.4, wet: 0.3, vary: 0.3 } },
  hunter_sclera: { kind: 'physical', color: C(0.85, 0.55, 0.6), rough: 0.12, clearcoat: 1, weather: false, skin: { mottle: 0.3, mottleSize: 0.4, mottleColor: [0.7, 0.3, 0.35] } },
  hunter_iris: { color: C(0.38, 0.26, 0.78), emissive: C(0.5, 0.3, 1.0), emissiveIntensity: 0.25, rough: 0.2, weather: false },
  hunter_feather: { color: C(0.62, 0.58, 0.56), rough: 0.65, side: THREE.DoubleSide, sheen: 0.4, weather: false, skin: { wrinkle: 0.004, wrinkleSize: 0.2, wrinkleAxis: [1, 1, 4], mottle: 0.3, mottleSize: 0.8, mottleColor: [0.45, 0.42, 0.42] } },
  mstalker_skin: { kind: 'physical', color: C(0.34, 0.29, 0.24), rough: 0.5, sheen: 0.4, clearcoat: 0.25, weather: false,
    skin: { wrinkle: 0.007, wrinkleSize: 0.045, wrinkleAxis: [1, 1, 3], pores: 0.0012, poreSize: 0.014, plates: 0.0006, plateSize: 0.012, plateGroove: 0.3, mottle: 0.5, mottleSize: 0.15, mottleColor: [0.22, 0.18, 0.15], mottle2: 0.35, mottle2Size: 0.04, mottle2Color: [0.45, 0.4, 0.34], cavity: 0.45, wet: 0.25, vary: 0.3 } },
  mstalker_belly: { kind: 'physical', color: C(0.48, 0.42, 0.35), rough: 0.55, sheen: 0.3, weather: false,
    skin: { wrinkle: 0.003, wrinkleSize: 0.025, wrinkleAxis: [4, 1, 1], pores: 0.001, poreSize: 0.006, mottle: 0.4, mottleSize: 0.1, mottleColor: [0.38, 0.32, 0.27], cavity: 0.4, vary: 0.25 } },
  mstalker_eye: { kind: 'physical', color: C(0.25, 0.16, 0.06), emissive: C(0.3, 0.18, 0.05), emissiveIntensity: 0.15, rough: 0.05, clearcoat: 1, weather: false },
  strider_eye: { kind: 'physical', color: C(0.02, 0.02, 0.02), rough: 0.05, clearcoat: 1, weather: false },
  lance_skin: { kind: 'physical', color: C(0.44, 0.5, 0.58), rough: 0.4, sheen: 0.35, clearcoat: 0.3, weather: false,
    skin: { wrinkle: 0.002, wrinkleSize: 0.04, wrinkleAxis: [1, 3, 1], pores: 0.0008, poreSize: 0.01, plates: 0.001, plateSize: 0.02, plateGroove: 0.3, mottle: 0.45, mottleSize: 0.2, mottleColor: [0.32, 0.37, 0.44], cavity: 0.35, vary: 0.25 } },
  lance_carapace: { kind: 'physical', color: C(0.03, 0.033, 0.045), rough: 0.2, clearcoat: 1, weather: false,
    skin: { pores: 0.0008, poreSize: 0.01, mottle: 0.4, mottleSize: 0.1, mottleColor: [0.08, 0.085, 0.1], cavity: 0.3, vary: 0.2 } },
  lance_wing: { kind: 'physical', color: C(0.48, 0.55, 0.63), rough: 0.35, sheen: 0.4, clearcoat: 0.3, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.0015, wrinkleSize: 0.05, wrinkleAxis: [3, 0.4, 3], mottle: 0.4, mottleSize: 0.3, mottleColor: [0.36, 0.42, 0.5], mottleAxis: [1, 0.3, 1], cavity: 0.3, vary: 0.25 } },
  kite_skin: { kind: 'physical', color: C(0.55, 0.6, 0.68), rough: 0.38, sheen: 0.4, clearcoat: 0.3, weather: false,
    skin: { wrinkle: 0.0015, wrinkleSize: 0.04, pores: 0.0006, poreSize: 0.008, mottle: 0.4, mottleSize: 0.2, mottleColor: [0.42, 0.47, 0.55], cavity: 0.3, vary: 0.25 } },
  ray_tent: { kind: 'physical', color: C(0.05, 0.055, 0.06), rough: 0.4, sheen: 0.35, clearcoat: 0.4, weather: false,
    skin: { wrinkle: 0.008, wrinkleSize: 0.15, wrinkleAxis: [1, 4, 1], pores: 0.002, poreSize: 0.05, mottle: 0.4, mottleSize: 0.6, mottleColor: [0.12, 0.13, 0.14], cavity: 0.35, vary: 0.25 } },
  ray_gill: { kind: 'physical', color: C(0.03, 0.02, 0.02), rough: 0.3, clearcoat: 0.7, weather: false, skin: { wrinkle: 0.006, wrinkleSize: 0.08, cavity: 0.5, wet: 0.6 } },
  // Miller (blender/assets/fauna_miller*.py). Skin is procedural (src/render/CreatureSkin.ts), matched per species to
  // the concept images: patterns in object space (no UV seams), relief as bump, wet cavities, baked AO.
  cornea: { kind: 'physical', color: C(1, 1, 1), rough: 0.02, clearcoat: 1, opacity: 0.14, weather: false },
  // Ferracaris (image 6): translucent amber plates mottled olive-brown, glossy; pink translucent fringe; pale legs
  ferra_plate: { kind: 'physical', color: C(0.5, 0.33, 0.22), rough: 0.25, clearcoat: 0.9, sheen: 0.3, weather: false,
    skin: { mottle: 0.75, mottleSize: 0.012, mottleColor: [0.26, 0.2, 0.1], mottle2: 0.6, mottle2Size: 0.008, mottle2Color: [0.66, 0.4, 0.36], spots: 0.4, spotSize: 0.008, spotRadius: 0.2, spotDensity: 0.35, spotColor: [0.72, 0.6, 0.46], pores: 0.0004, poreSize: 0.0025, cavity: 0.4, vary: 0.25, aoAlbedo: 0.5 } },
  ferra_rim: { kind: 'physical', color: C(0.56, 0.3, 0.3), rough: 0.3, clearcoat: 0.7, weather: false, skin: { mottle: 0.5, mottleSize: 0.006, mottleColor: [0.7, 0.45, 0.42], vary: 0.2 } },
  ferra_leg: { kind: 'physical', color: C(0.74, 0.68, 0.6), rough: 0.4, sheen: 0.3, weather: false, skin: { wrinkle: 0.0003, wrinkleSize: 0.003, mottle: 0.3, mottleSize: 0.006, mottleColor: [0.55, 0.5, 0.45] } },
  ferra_fringe: { kind: 'physical', color: C(0.86, 0.55, 0.58), rough: 0.3, opacity: 0.75, weather: false },
  // Sediment Maw (image 3): sandy beige hide gritted with dark gravel patches; ringed scales; pale fleshy funnel
  maw_hide: { kind: 'physical', color: C(0.5, 0.45, 0.38), rough: 0.85, sheen: 0.2, weather: false,
    skin: { plates: 0.003, plateSize: 0.012, plateGroove: 0.25, mottle: 0.85, mottleSize: 0.18, mottleColor: [0.1, 0.1, 0.1], mottle2: 0.6, mottle2Size: 0.03, mottle2Color: [0.66, 0.6, 0.5], pores: 0.003, poreSize: 0.012, cavity: 0.5, wet: 0.5, vary: 0.4 } },
  maw_pebble: { color: C(0.07, 0.07, 0.075), rough: 0.5, weather: false, skin: { mottle: 0.5, mottleSize: 0.02, mottleColor: [0.2, 0.19, 0.18], pores: 0.002, poreSize: 0.008, vary: 0.4 } },
  maw_lip: { kind: 'physical', color: C(0.55, 0.45, 0.38), rough: 0.4, sheen: 0.3, clearcoat: 0.5, weather: false,
    skin: { plates: 0.003, plateSize: 0.014, plateGroove: 0.3, plateStretch: [1, 2.2, 1], mottle: 0.5, mottleSize: 0.1, mottleColor: [0.38, 0.3, 0.26], spots: 0.4, spotSize: 0.03, spotRadius: 0.22, spotDensity: 0.5, spotColor: [0.68, 0.6, 0.5], cavity: 0.55, wet: 0.6, vary: 0.25 } },
  maw_gullet: { kind: 'physical', color: C(0.11, 0.06, 0.055), rough: 0.3, clearcoat: 0.6, weather: false, skin: { wrinkle: 0.006, wrinkleSize: 0.05, wrinkleAxis: [1, 4, 1], mottle: 0.5, mottleSize: 0.08, mottleColor: [0.2, 0.08, 0.07], cavity: 0.5 } },
  maw_limb: { kind: 'physical', color: C(0.52, 0.44, 0.37), rough: 0.5, sheen: 0.3, clearcoat: 0.35, weather: false,
    skin: { plates: 0.003, plateSize: 0.016, plateGroove: 0.3, mottle: 0.55, mottleSize: 0.12, mottleColor: [0.3, 0.26, 0.22], mottle2: 0.4, mottle2Size: 0.02, mottle2Color: [0.66, 0.58, 0.48], cavity: 0.5, wet: 0.5, vary: 0.3 } },
  // Mimic Crawler (image 4): near-black skin with a gold-orange reticulated net, shingled plates, pink-purple undersides
  mimic_skin: { kind: 'physical', color: C(0.045, 0.038, 0.032), rough: 0.45, sheen: 0.3, clearcoat: 0.4, weather: false,
    skin: { plates: 0.0015, plateSize: 0.009, plateGroove: 0.3, retic: 0.7, reticSize: 0.022, reticWidth: 0.07, reticColor: [0.42, 0.28, 0.1], mottle: 0.55, mottleSize: 0.12, mottleColor: [0.16, 0.11, 0.07], mottle2: 0.35, mottle2Size: 0.05, mottle2Color: [0.28, 0.12, 0.16], pores: 0.001, poreSize: 0.006, cavity: 0.5, wet: 0.5, vary: 0.3 } },
  mimic_plate: { kind: 'physical', color: C(0.055, 0.048, 0.04), rough: 0.5, clearcoat: 0.35, weather: false,
    skin: { retic: 0.65, reticSize: 0.018, reticWidth: 0.08, reticColor: [0.48, 0.32, 0.11], mottle: 0.6, mottleSize: 0.08, mottleColor: [0.2, 0.15, 0.09], spots: 0.3, spotSize: 0.02, spotRadius: 0.2, spotDensity: 0.4, spotColor: [0.36, 0.3, 0.2], pores: 0.0012, poreSize: 0.006, cavity: 0.45, vary: 0.35 } },
  mimic_under: { kind: 'physical', color: C(0.42, 0.22, 0.3), rough: 0.35, sheen: 0.4, clearcoat: 0.5, weather: false,
    skin: { wrinkle: 0.003, wrinkleSize: 0.03, mottle: 0.5, mottleSize: 0.06, mottleColor: [0.55, 0.32, 0.36], cavity: 0.4, wet: 0.6, vary: 0.25 } },
  mimic_sucker: { kind: 'physical', color: C(0.76, 0.6, 0.6), rough: 0.3, clearcoat: 0.6, weather: false, skin: { mottle: 0.4, mottleSize: 0.02, mottleColor: [0.6, 0.4, 0.45], wrinkle: 0.001, wrinkleSize: 0.006 } },
  mimic_hook: { kind: 'physical', color: C(0.86, 0.8, 0.7), rough: 0.25, clearcoat: 0.8, weather: false, skin: { mottle: 0.5, mottleSize: 0.02, mottleColor: [0.55, 0.42, 0.36] } },
  mimic_eye: { kind: 'physical', color: C(0.62, 0.42, 0.12), emissive: C(0.6, 0.4, 0.12), emissiveIntensity: 0.12, rough: 0.08, clearcoat: 1, weather: false,
    skin: { retic: 0.6, reticSize: 0.012, reticWidth: 0.25, reticColor: [0.3, 0.18, 0.05], mottle: 0.5, mottleSize: 0.02, mottleColor: [0.85, 0.65, 0.25] } },
  mimic_pupil: { kind: 'physical', color: C(0.01, 0.01, 0.01), rough: 0.05, clearcoat: 1, weather: false },
  // Breaker Shield (image 8): olive-grey shell, knobbly, worn paler edges, moss in the seams; dark green-grey scaly skin
  breaker_shell: { kind: 'physical', color: C(0.13, 0.125, 0.085), rough: 0.45, clearcoat: 0.35, weather: false,
    skin: { wrinkle: 0.004, wrinkleSize: 0.05, wrinkleAxis: [3, 1, 3], pores: 0.004, poreSize: 0.016, mottle: 0.7, mottleSize: 0.25, mottleColor: [0.09, 0.11, 0.06], mottle2: 0.55, mottle2Size: 0.06, mottle2Color: [0.27, 0.24, 0.17], spots: 0.4, spotSize: 0.05, spotRadius: 0.2, spotDensity: 0.3, spotColor: [0.2, 0.27, 0.12], cavity: 0.4, wet: 0.5, vary: 0.35 } },
  breaker_edge: { kind: 'physical', color: C(0.26, 0.24, 0.17), rough: 0.45, clearcoat: 0.35, weather: false,
    skin: { pores: 0.003, poreSize: 0.018, mottle: 0.6, mottleSize: 0.12, mottleColor: [0.22, 0.22, 0.14], cavity: 0.5, vary: 0.35 } },
  breaker_skin: { kind: 'physical', color: C(0.11, 0.12, 0.085), rough: 0.42, sheen: 0.3, clearcoat: 0.45, weather: false,
    skin: { plates: 0.002, plateSize: 0.012, plateGroove: 0.25, wrinkle: 0.006, wrinkleSize: 0.07, mottle: 0.6, mottleSize: 0.18, mottleColor: [0.26, 0.27, 0.18], mottle2: 0.4, mottle2Size: 0.04, mottle2Color: [0.09, 0.1, 0.07], cavity: 0.55, wet: 0.5, vary: 0.3 } },
  breaker_feeler: { kind: 'physical', color: C(0.34, 0.3, 0.24), rough: 0.35, clearcoat: 0.6, weather: false, skin: { mottle: 0.5, mottleSize: 0.03, mottleColor: [0.2, 0.18, 0.15], wrinkle: 0.002, wrinkleSize: 0.012 } },
  breaker_eye: { kind: 'physical', color: C(0.42, 0.34, 0.12), rough: 0.08, clearcoat: 1, weather: false },
  // Rift Architect (image 7): violet-grey iridescent shell crusted with orange-yellow growth, spined purple legs
  arch_shell: { kind: 'physical', color: C(0.27, 0.24, 0.32), rough: 0.42, clearcoat: 0.45, iridescence: 0.35, weather: false,
    skin: { plates: 0.0012, plateSize: 0.01, plateGroove: 0.25, pores: 0.0015, poreSize: 0.008, mottle: 0.6, mottleSize: 0.12, mottleColor: [0.5, 0.36, 0.14], mottle2: 0.5, mottle2Size: 0.04, mottle2Color: [0.18, 0.22, 0.24], spots: 0.4, spotSize: 0.025, spotRadius: 0.25, spotDensity: 0.3, spotColor: [0.72, 0.55, 0.2], cavity: 0.3, wet: 0.4, vary: 0.35 } },
  arch_leg: { kind: 'physical', color: C(0.3, 0.25, 0.36), rough: 0.4, clearcoat: 0.4, iridescence: 0.3, weather: false,
    skin: { plates: 0.0012, plateSize: 0.01, plateGroove: 0.25, plateStretch: [1, 1, 2.5], mottle: 0.5, mottleSize: 0.06, mottleColor: [0.46, 0.4, 0.5], mottle2: 0.35, mottle2Size: 0.03, mottle2Color: [0.55, 0.42, 0.2], cavity: 0.3, vary: 0.3 } },
  // the young: paler, softer, less crusted (their own painted maps)
  arch_shell_juv: { kind: 'physical', color: C(0.4, 0.36, 0.44), rough: 0.42, clearcoat: 0.35, iridescence: 0.2, weather: false,
    skin: { plates: 0.0008, plateSize: 0.008, plateGroove: 0.25, pores: 0.0008, poreSize: 0.006, mottle: 0.4, mottleSize: 0.06, mottleColor: [0.55, 0.47, 0.42], cavity: 0.25, vary: 0.25 } },
  maw_hide_juv: { kind: 'physical', color: C(0.6, 0.55, 0.47), rough: 0.8, sheen: 0.2, weather: false,
    skin: { plates: 0.002, plateSize: 0.01, plateGroove: 0.25, mottle: 0.5, mottleSize: 0.08, mottleColor: [0.32, 0.3, 0.27], pores: 0.0015, poreSize: 0.01, cavity: 0.4, wet: 0.5, vary: 0.3 } },
  ferra_plate_juv: { kind: 'physical', color: C(0.62, 0.47, 0.36), rough: 0.22, clearcoat: 0.9, sheen: 0.3, opacity: 0.92, weather: false,
    skin: { mottle: 0.5, mottleSize: 0.008, mottleColor: [0.7, 0.52, 0.48], pores: 0.0003, poreSize: 0.002, cavity: 0.3, vary: 0.2 } },
  arch_tendril: { kind: 'physical', color: C(0.62, 0.52, 0.58), rough: 0.4, sheen: 0.5, weather: false },
  arch_wart: { kind: 'physical', color: C(0.5, 0.33, 0.1), rough: 0.6, weather: false, skin: { pores: 0.002, poreSize: 0.006, mottle: 0.6, mottleSize: 0.02, mottleColor: [0.85, 0.7, 0.3], vary: 0.4 } },
  // Luminous Siren (image 2): glass-clear tissue, a mottled brown-purple organ mass inside, a darker translucent head
  siren_glass: { kind: 'physical', color: C(0.62, 0.72, 0.8), rough: 0.06, clearcoat: 1, opacity: 0.26, weather: false,
    skin: { mottle: 0.4, mottleSize: 0.04, mottleColor: [0.8, 0.85, 0.95], wrinkle: 0.0008, wrinkleSize: 0.01, wrinkleAxis: [1, 1, 3] } },
  siren_core: { kind: 'physical', color: C(0.1, 0.06, 0.06), rough: 0.4, clearcoat: 0.5, weather: false,
    skin: { mottle: 0.8, mottleSize: 0.03, mottleColor: [0.32, 0.16, 0.2], mottle2: 0.6, mottle2Size: 0.012, mottle2Color: [0.02, 0.015, 0.02], spots: 0.6, spotSize: 0.01, spotRadius: 0.18, spotDensity: 0.3, spotColor: [0.75, 0.55, 0.5], vary: 0.4 } },
  siren_head: { kind: 'physical', color: C(0.22, 0.18, 0.18), rough: 0.12, clearcoat: 1, opacity: 0.82, weather: false,
    skin: { mottle: 0.6, mottleSize: 0.012, mottleColor: [0.5, 0.42, 0.42], spots: 0.4, spotSize: 0.006, spotRadius: 0.2, spotDensity: 0.4, spotColor: [0.8, 0.75, 0.75] } },
  siren_fin: { kind: 'physical', color: C(0.7, 0.8, 0.9), rough: 0.06, clearcoat: 1, opacity: 0.22, side: THREE.DoubleSide, weather: false },
  siren_ray: { kind: 'physical', color: C(0.85, 0.92, 1.0), rough: 0.1, opacity: 0.5, weather: false },
  siren_eye: { kind: 'physical', color: C(0.6, 0.66, 0.7), rough: 0.05, clearcoat: 1, iridescence: 0.6, weather: false },
  siren_lure: { color: C(0.3, 0.95, 0.9), emissive: C(0.3, 1.0, 0.92), emissiveIntensity: 4, rough: 0.2, weather: false },
  // Abyssal Stalker (image 9): navy-black, pebbly fine scales, glossy wet, faint lighter mottling, grey belly;
  // flippers dark and half-translucent over pale bony rays
  stalker_hide: { kind: 'physical', color: C(0.025, 0.032, 0.045), rough: 0.34, clearcoat: 0.75, sheen: 0.25, weather: false,
    skin: { plates: 0.0012, plateSize: 0.011, plateGroove: 0.3, wrinkle: 0.004, wrinkleSize: 0.12, mottle: 0.6, mottleSize: 0.35, mottleColor: [0.07, 0.09, 0.12], mottle2: 0.4, mottle2Size: 0.06, mottle2Color: [0.012, 0.014, 0.02], pores: 0.0012, poreSize: 0.01, cavity: 0.25, wet: 0.6, vary: 0.35 } },
  stalker_belly: { kind: 'physical', color: C(0.12, 0.13, 0.15), rough: 0.36, clearcoat: 0.6, weather: false,
    skin: { plates: 0.001, plateSize: 0.01, plateGroove: 0.3, wrinkle: 0.003, wrinkleSize: 0.05, wrinkleAxis: [4, 4, 1], mottle: 0.4, mottleSize: 0.2, mottleColor: [0.2, 0.21, 0.23], cavity: 0.4, vary: 0.3 } },
  stalker_fin: { kind: 'physical', color: C(0.05, 0.07, 0.09), rough: 0.25, clearcoat: 0.6, opacity: 0.86, side: THREE.DoubleSide, weather: false,
    skin: { mottle: 0.6, mottleSize: 0.1, mottleColor: [0.12, 0.15, 0.18], mottleAxis: [1, 1, 4], vary: 0.3 } },
  stalker_gum: { kind: 'physical', color: C(0.1, 0.04, 0.05), rough: 0.3, clearcoat: 0.7, weather: false, skin: { wrinkle: 0.002, wrinkleSize: 0.02, mottle: 0.5, mottleSize: 0.03, mottleColor: [0.05, 0.02, 0.03] } },
  stalker_ray: { kind: 'physical', color: C(0.22, 0.25, 0.28), rough: 0.3, clearcoat: 0.5, weather: false },
  stalker_eye: { kind: 'physical', color: C(0.1, 0.085, 0.04), emissive: C(0.25, 0.22, 0.08), emissiveIntensity: 0.06, rough: 0.05, clearcoat: 1, weather: false },
  // Chorus Hunter (image 1): dark slate-blue, glossy, pale streaks and fine grooves along the flanks, paler belly
  chorus_hide: { kind: 'physical', color: C(0.07, 0.09, 0.115), rough: 0.25, clearcoat: 0.85, sheen: 0.25, iridescence: 0.15, weather: false,
    skin: { wrinkle: 0.0025, wrinkleSize: 0.05, wrinkleAxis: [5, 5, 0.6], mottle: 0.55, mottleSize: 0.12, mottleColor: [0.2, 0.24, 0.28], mottleAxis: [5, 5, 0.5], mottle2: 0.45, mottle2Size: 0.05, mottle2Color: [0.03, 0.04, 0.055], pores: 0.0006, poreSize: 0.006, cavity: 0.45, wet: 0.6, vary: 0.3 } },
  chorus_belly: { kind: 'physical', color: C(0.26, 0.29, 0.32), rough: 0.3, clearcoat: 0.7, weather: false,
    skin: { wrinkle: 0.0015, wrinkleSize: 0.02, wrinkleAxis: [5, 5, 0.6], mottle: 0.35, mottleSize: 0.08, mottleColor: [0.36, 0.4, 0.44], vary: 0.25 } },
  chorus_gill: { kind: 'physical', color: C(0.55, 0.6, 0.66), rough: 0.2, clearcoat: 0.8, iridescence: 0.5, weather: false },
  chorus_fin: { kind: 'physical', color: C(0.09, 0.11, 0.14), rough: 0.25, clearcoat: 0.7, iridescence: 0.3, side: THREE.DoubleSide, weather: false,
    skin: { mottle: 0.5, mottleSize: 0.08, mottleColor: [0.22, 0.26, 0.3], mottleAxis: [1, 4, 1], vary: 0.3 } },
  chorus_pore: { kind: 'physical', color: C(0.85, 0.66, 0.3), emissive: C(0.95, 0.7, 0.3), emissiveIntensity: 0.35, rough: 0.25, clearcoat: 1, weather: false },
  chorus_eye: { kind: 'physical', color: C(0.18, 0.15, 0.08), rough: 0.05, clearcoat: 1, weather: false },
  // Abyssal Cathedral (image 10): pale blue-grey translucent skin sculpted round dark cavities, small white spots;
  // iridescent feathered wings streaked rust, gold and teal; cream lattice filter plates; cyan throat lights
  cath_hide: { kind: 'physical', color: C(0.3, 0.37, 0.45), rough: 0.35, clearcoat: 0.6, sheen: 0.4, weather: false,
    skin: { wrinkle: 0.012, wrinkleSize: 0.25, wrinkleAxis: [1, 3, 1], mottle: 0.55, mottleSize: 0.8, mottleColor: [0.46, 0.53, 0.6], mottle2: 0.4, mottle2Size: 0.2, mottle2Color: [0.12, 0.16, 0.22], spots: 0.75, spotSize: 0.09, spotRadius: 0.13, spotDensity: 0.35, spotColor: [0.82, 0.86, 0.9], pores: 0.004, poreSize: 0.05, cavity: 0.5, wet: 0.5, vary: 0.3 } },
  cath_belly: { kind: 'physical', color: C(0.3, 0.36, 0.42), rough: 0.35, clearcoat: 0.5, weather: false,
    skin: { wrinkle: 0.01, wrinkleSize: 0.12, wrinkleAxis: [4, 1, 0.5], mottle: 0.4, mottleSize: 0.5, mottleColor: [0.42, 0.48, 0.54], spots: 0.4, spotSize: 0.08, spotRadius: 0.12, spotDensity: 0.3, spotColor: [0.8, 0.85, 0.9], cavity: 0.5 } },
  cath_cavity: { kind: 'physical', color: C(0.07, 0.1, 0.15), rough: 0.25, clearcoat: 0.8, weather: false,
    skin: { wrinkle: 0.015, wrinkleSize: 0.12, mottle: 0.5, mottleSize: 0.3, mottleColor: [0.16, 0.2, 0.28], cavity: 0.5, wet: 0.7 } },
  cath_wing: { kind: 'physical', color: C(0.22, 0.3, 0.38), rough: 0.3, sheen: 0.5, clearcoat: 0.5, iridescence: 0.6, side: THREE.DoubleSide, weather: false,
    skin: { mottle: 0.4, mottleSize: 0.9, mottleColor: [0.4, 0.27, 0.17], mottleAxis: [0.8, 1, 1.4], mottle2: 0.45, mottle2Size: 0.35, mottle2Color: [0.16, 0.32, 0.38], spots: 0.35, spotSize: 0.25, spotRadius: 0.12, spotDensity: 0.35, spotColor: [0.55, 0.62, 0.66], vary: 0.35 } },
  cath_ray: { kind: 'physical', color: C(0.34, 0.24, 0.17), rough: 0.35, clearcoat: 0.4, iridescence: 0.4, weather: false },
  cath_lamella: { kind: 'physical', color: C(0.8, 0.77, 0.66), rough: 0.5, sheen: 0.4, side: THREE.DoubleSide, weather: false,
    skin: { lattice: 0.11, latticeSize: 0.07, mottle: 0.4, mottleSize: 0.3, mottleColor: [0.62, 0.55, 0.42], vary: 0.3 } },
  cath_glow: { color: C(0.3, 0.9, 1.0), emissive: C(0.3, 0.9, 1.0), emissiveIntensity: 3, rough: 0.2, weather: false },
  // Gargantuan Crown (image 5): wet black hide, deep wrinkles and pores with a silvery-blue sheen; dark glossy horn;
  // red gums; long translucent fangs; fine dark barbels
  crown_hide: { kind: 'physical', color: C(0.018, 0.021, 0.028), rough: 0.36, clearcoat: 0.85, sheen: 0.3, iridescence: 0.25, weather: false,
    skin: { wrinkle: 0.022, wrinkleSize: 0.2, wrinkleAxis: [1.5, 1.5, 4], pores: 0.0025, poreSize: 0.04, plates: 0.0025, plateSize: 0.03, plateGroove: 0.3, mottle: 0.55, mottleSize: 0.7, mottleColor: [0.06, 0.07, 0.09], mottle2: 0.5, mottle2Size: 0.12, mottle2Color: [0.008, 0.009, 0.012], spots: 0.3, spotSize: 0.08, spotRadius: 0.12, spotDensity: 0.25, spotColor: [0.16, 0.18, 0.22], cavity: 0.55, wet: 0.65, vary: 0.35, aoAlbedo: 0.6 } },
  crown_horn: { kind: 'physical', color: C(0.1, 0.1, 0.12), rough: 0.22, clearcoat: 1, iridescence: 0.2, weather: false,
    skin: { wrinkle: 0.006, wrinkleSize: 0.05, wrinkleAxis: [1, 4, 1], mottle: 0.6, mottleSize: 0.2, mottleColor: [0.3, 0.29, 0.3], pores: 0.002, poreSize: 0.02, cavity: 0.4, vary: 0.35 } },
  crown_gum: { kind: 'physical', color: C(0.26, 0.045, 0.05), rough: 0.25, clearcoat: 0.8, weather: false,
    skin: { wrinkle: 0.008, wrinkleSize: 0.06, mottle: 0.5, mottleSize: 0.1, mottleColor: [0.12, 0.02, 0.03], cavity: 0.55, wet: 0.7 } },
  crown_throat: { kind: 'physical', color: C(0.04, 0.008, 0.01), rough: 0.3, clearcoat: 0.6, weather: false },
  crown_tooth: { kind: 'physical', color: C(0.82, 0.8, 0.74), rough: 0.18, clearcoat: 1, weather: false,
    skin: { mottle: 0.5, mottleSize: 0.08, mottleColor: [0.55, 0.5, 0.4], wrinkle: 0.0015, wrinkleSize: 0.02, wrinkleAxis: [4, 1, 4] } },
  crown_fin: { kind: 'physical', color: C(0.022, 0.026, 0.034), rough: 0.3, clearcoat: 0.8, iridescence: 0.35, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.01, wrinkleSize: 0.12, wrinkleAxis: [0.4, 1, 5], mottle: 0.55, mottleSize: 0.5, mottleColor: [0.07, 0.085, 0.1], mottleAxis: [0.3, 1, 5], cavity: 0.5, wet: 0.5, vary: 0.35 } },
  crown_barbel: { kind: 'physical', color: C(0.06, 0.05, 0.05), rough: 0.35, sheen: 0.4, weather: false },
  crown_eye: { kind: 'physical', color: C(0.14, 0.09, 0.04), emissive: C(0.3, 0.18, 0.05), emissiveIntensity: 0.2, rough: 0.05, clearcoat: 1, weather: false },
  // Miller's cave shells (blender/assets/miller_caves.py): wet basalt, strata, pitting, crusts
  miller_cave_rock: { kind: 'physical', color: C(0.07, 0.072, 0.075), rough: 0.8, clearcoat: 0.25, weather: false,
    skin: { wrinkle: 0.035, wrinkleSize: 0.6, wrinkleAxis: [0.5, 3, 0.5], pores: 0.02, poreSize: 0.15, mottle: 0.6, mottleSize: 1.2, mottleColor: [0.12, 0.12, 0.11], mottle2: 0.45, mottle2Size: 0.3, mottle2Color: [0.05, 0.08, 0.07], cavity: 0.45, wet: 0.5, vary: 0.4 } },
  // prey (instanced): dart fish, lantern shrimp, krill
  prey_silver: { kind: 'physical', color: C(0.62, 0.66, 0.7), rough: 0.18, metal: 0.4, iridescence: 0.5, clearcoat: 0.6, weather: false,
    skin: { mottle: 0.3, mottleSize: 0.02, mottleColor: [0.45, 0.5, 0.55], vary: 0.2 } },
  prey_back: { kind: 'physical', color: C(0.08, 0.12, 0.15), rough: 0.25, clearcoat: 0.5, weather: false, skin: { spots: 0.5, spotSize: 0.006, spotRadius: 0.25, spotDensity: 0.5, spotColor: [0.03, 0.04, 0.05] } },
  prey_fin: { kind: 'physical', color: C(0.7, 0.75, 0.8), rough: 0.2, opacity: 0.45, side: THREE.DoubleSide, weather: false },
  prey_shrimp: { kind: 'physical', color: C(0.7, 0.3, 0.26), rough: 0.25, clearcoat: 0.6, opacity: 0.85, weather: false,
    skin: { mottle: 0.5, mottleSize: 0.004, mottleColor: [0.9, 0.5, 0.42], spots: 0.5, spotSize: 0.003, spotRadius: 0.22, spotDensity: 0.4, spotColor: [0.45, 0.08, 0.08] } },
  prey_glow: { color: C(0.3, 0.9, 1.0), emissive: C(0.3, 0.9, 1.0), emissiveIntensity: 2.5, rough: 0.2, weather: false },
  // krill carry light organs (photophores): a faint blue-green glow makes a swarm visible in the dark
  prey_krill: { kind: 'physical', color: C(0.8, 0.42, 0.38), emissive: C(0.25, 0.85, 0.8), emissiveIntensity: 0.55, rough: 0.3, opacity: 0.8, weather: false },
  // ---- Jupiter, the reference sheet's nine (blender/assets/fauna_jupiter_sheet.py, painted maps; `glow` lights the
  //      bright saturated parts of each map: cobalt vein nets, ember fissures, the hunter's crimson underside)
  js_keel: { kind: 'physical', color: C(0.03, 0.025, 0.06), rough: 0.16, metal: 0.4, clearcoat: 1, iridescence: 0.6, envMapIntensity: 1.5, weather: false,
    skin: { wrinkle: 0.003, wrinkleSize: 0.3, wrinkleAxis: [1, 4, 1], pores: 0.001, poreSize: 0.05, cavity: 0.4, wet: 0.5, vary: 0.2, glow: 0.35 } },
  js_spar: { kind: 'physical', color: C(0.03, 0.02, 0.05), rough: 0.22, metal: 0.3, clearcoat: 0.9, iridescence: 0.5, weather: false,
    skin: { wrinkle: 0.003, wrinkleSize: 0.15, wrinkleAxis: [4, 1, 1], cavity: 0.4, wet: 0.4, vary: 0.2 } },
  js_wing: { kind: 'physical', color: C(0.05, 0.025, 0.1), rough: 0.2, clearcoat: 0.8, sheen: 0.4, iridescence: 0.8, opacity: 0.86, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.002, wrinkleSize: 0.5, cavity: 0.2, wet: 0.4, vary: 0.15, glow: 1.1 } },
  js_vein: { kind: 'physical', color: C(0.2, 0.45, 1.0), emissive: C(0.1, 0.25, 0.75), emissiveIntensity: 0.6, rough: 0.15, metal: 0.4, clearcoat: 1, iridescence: 0.8, weather: false,
    skin: { cavity: 0.1, glow: 0.8 } },
  js_eye: { kind: 'physical', color: C(0.6, 0.9, 1.0), emissive: C(0.4, 0.75, 1.0), emissiveIntensity: 0.7, rough: 0.03, clearcoat: 1, weather: false },
  sj_bell: { kind: 'physical', color: C(0.34, 0.28, 0.8), emissive: C(0.12, 0.07, 0.3), emissiveIntensity: 0.25, rough: 0.08, clearcoat: 1, iridescence: 0.45, opacity: 0.45, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.001, wrinkleSize: 0.2, wet: 0.8, glow: 0.5 } },
  sj_inner: { kind: 'physical', color: C(0.62, 0.32, 0.72), rough: 0.1, opacity: 0.6, side: THREE.DoubleSide, weather: false, skin: { wet: 0.7, glow: 0.6 } },
  sj_core: { kind: 'physical', color: C(0.95, 0.42, 0.35), rough: 0.2, opacity: 0.88, weather: false, skin: { wet: 0.6, glow: 1.2 } },
  sj_arm: { kind: 'physical', color: C(0.66, 0.56, 0.9), rough: 0.15, clearcoat: 0.8, opacity: 0.72, side: THREE.DoubleSide, weather: false, skin: { wet: 0.7, glow: 0.4 } },
  sj_tent: { kind: 'physical', color: C(0.55, 0.45, 0.95), rough: 0.2, opacity: 0.72, weather: false, skin: { wet: 0.6, glow: 0.6 } },
  sb_hide: { kind: 'physical', color: C(0.17, 0.11, 0.09), rough: 0.42, clearcoat: 0.45, sheen: 0.3, weather: false,
    skin: { wrinkle: 0.006, wrinkleSize: 0.5, wrinkleAxis: [4, 1, 1], pores: 0.003, poreSize: 0.12, cavity: 0.5, wet: 0.35, vary: 0.25, glow: 0.15 } },
  sb_belly: { kind: 'physical', color: C(0.5, 0.35, 0.27), rough: 0.45, clearcoat: 0.3, weather: false, skin: { wrinkle: 0.005, wrinkleSize: 0.5, wrinkleAxis: [4, 1, 1], cavity: 0.4 } },
  sb_sheet: { kind: 'physical', color: C(0.32, 0.14, 0.08), rough: 0.4, sheen: 0.4, opacity: 0.82, side: THREE.DoubleSide, weather: false, skin: { wrinkle: 0.003, wrinkleSize: 0.6, cavity: 0.3 } },
  sb_mouth: { kind: 'physical', color: C(0.42, 0.07, 0.06), rough: 0.28, clearcoat: 0.85, weather: false, skin: { wrinkle: 0.004, wrinkleSize: 0.18, cavity: 0.5, wet: 0.85, glow: 0.2 } },
  co_body: { kind: 'physical', color: C(0.12, 0.08, 0.065), rough: 0.75, weather: false, skin: { pores: 0.01, poreSize: 0.12, cavity: 0.4, vary: 0.35, glow: 2.2 } },
  co_ember: { kind: 'physical', color: C(1.0, 0.45, 0.1), emissive: C(1.0, 0.4, 0.08), emissiveIntensity: 1.2, rough: 0.6, weather: false },
  co_thread: { kind: 'physical', color: C(0.42, 0.13, 0.05), rough: 0.6, weather: false, skin: { cavity: 0.2, glow: 0.7 } },
  vd_skin: { kind: 'physical', color: C(0.1, 0.06, 0.13), rough: 0.2, clearcoat: 0.9, iridescence: 0.6, sheen: 0.3, weather: false,
    skin: { pores: 0.0015, poreSize: 0.05, wrinkle: 0.002, wrinkleSize: 0.15, cavity: 0.4, wet: 0.6, vary: 0.2, glow: 0.35 } },
  vd_belly: { kind: 'physical', color: C(0.4, 0.3, 0.55), rough: 0.25, clearcoat: 0.7, weather: false, skin: { pores: 0.0015, poreSize: 0.04, cavity: 0.35, wet: 0.5 } },
  vd_fin: { kind: 'physical', color: C(0.2, 0.11, 0.33), rough: 0.18, clearcoat: 0.8, iridescence: 0.7, opacity: 0.82, side: THREE.DoubleSide, weather: false, skin: { wet: 0.5, glow: 0.3 } },
  vd_iris: { kind: 'physical', color: C(0.1, 0.45, 0.95), emissive: C(0.05, 0.3, 0.8), emissiveIntensity: 0.5, rough: 0.03, clearcoat: 1, weather: false },
  vd_lid: { kind: 'physical', color: C(0.05, 0.03, 0.05), rough: 0.3, clearcoat: 0.6, weather: false, skin: { cavity: 0.4, wet: 0.5 } },
  vd_eye: { kind: 'physical', color: C(0.05, 0.05, 0.08), rough: 0.03, clearcoat: 1, weather: false },
  dd_plate: { kind: 'physical', color: C(0.06, 0.06, 0.065), rough: 0.3, metal: 0.3, clearcoat: 0.6, weather: false,
    skin: { pores: 0.002, poreSize: 0.08, wrinkle: 0.002, wrinkleSize: 0.2, cavity: 0.45, vary: 0.25, glow: 1.4 } },
  dd_skin: { kind: 'physical', color: C(0.09, 0.075, 0.075), rough: 0.4, clearcoat: 0.4, weather: false, skin: { wrinkle: 0.003, wrinkleSize: 0.3, cavity: 0.4, glow: 0.9 } },
  dd_fin: { kind: 'physical', color: C(0.08, 0.075, 0.08), rough: 0.3, clearcoat: 0.5, side: THREE.DoubleSide, weather: false, skin: { wrinkle: 0.002, wrinkleSize: 0.4, cavity: 0.3, glow: 0.9 } },
  dd_eye: { kind: 'physical', color: C(1.0, 0.5, 0.12), emissive: C(1.0, 0.4, 0.08), emissiveIntensity: 0.8, rough: 0.05, clearcoat: 1, weather: false },
  gg_hide: { kind: 'physical', color: C(0.66, 0.63, 0.65), rough: 0.33, clearcoat: 0.55, sheen: 0.4, weather: false,
    skin: { wrinkle: 0.008, wrinkleSize: 0.7, wrinkleAxis: [1, 5, 1], pores: 0.004, poreSize: 0.25, cavity: 0.45, wet: 0.35, vary: 0.25 } },
  gg_belly: { kind: 'physical', color: C(0.4, 0.15, 0.12), rough: 0.4, clearcoat: 0.4, weather: false, skin: { wrinkle: 0.008, wrinkleSize: 0.6, wrinkleAxis: [5, 1, 1], cavity: 0.45 } },
  gg_comb: { kind: 'physical', color: C(0.84, 0.78, 0.66), rough: 0.42, clearcoat: 0.3, side: THREE.DoubleSide, weather: false, skin: { wrinkle: 0.002, wrinkleSize: 0.08, wrinkleAxis: [1, 4, 1], cavity: 0.4 } },
  gg_fringe: { kind: 'physical', color: C(0.7, 0.55, 0.52), rough: 0.38, clearcoat: 0.4, sheen: 0.4, weather: false, skin: { wrinkle: 0.003, wrinkleSize: 0.3, cavity: 0.3 } },
  am_body: { kind: 'physical', color: C(1.0, 0.72, 0.28), emissive: C(1.0, 0.6, 0.15), emissiveIntensity: 0.9, rough: 0.3, metal: 0.3, weather: false, skin: { glow: 1.2 } },
  am_hair: { kind: 'physical', color: C(1.0, 0.82, 0.45), emissive: C(0.8, 0.55, 0.2), emissiveIntensity: 0.7, rough: 0.2, opacity: 0.8, weather: false, skin: { glow: 1.0 } },
  am_wing: { kind: 'physical', color: C(1.0, 0.82, 0.4), emissive: C(0.6, 0.45, 0.15), emissiveIntensity: 0.5, rough: 0.2, opacity: 0.6, side: THREE.DoubleSide, weather: false },
  sh_armor: { kind: 'physical', color: C(0.38, 0.38, 0.41), rough: 0.22, metal: 0.45, clearcoat: 0.8, weather: false,
    skin: { pores: 0.002, poreSize: 0.08, wrinkle: 0.002, wrinkleSize: 0.2, cavity: 0.5, vary: 0.25, glow: 0.8 } },
  sh_skin: { kind: 'physical', color: C(0.5, 0.08, 0.04), rough: 0.33, clearcoat: 0.5, sheen: 0.3, weather: false, skin: { pores: 0.002, poreSize: 0.06, wrinkle: 0.003, wrinkleSize: 0.25, cavity: 0.4, glow: 0.7 } },
  sh_web: { kind: 'physical', color: C(0.5, 0.12, 0.05), rough: 0.3, sheen: 0.4, opacity: 0.86, side: THREE.DoubleSide, weather: false, skin: { wrinkle: 0.002, wrinkleSize: 0.4, cavity: 0.3, glow: 0.7 } },
  sh_spine: { kind: 'physical', color: C(0.72, 0.65, 0.58), rough: 0.3, clearcoat: 0.6, weather: false, skin: { cavity: 0.3 } },
  sh_eye: { kind: 'physical', color: C(1.0, 0.55, 0.1), emissive: C(0.8, 0.35, 0.05), emissiveIntensity: 0.6, rough: 0.05, clearcoat: 1, weather: false },
  // ---- the Mars refuge (blender/assets/mars_refuge.py): object-space procedural rock, AO from the bake
  refuge_crust: { kind: 'physical', color: C(0.4, 0.2, 0.12), rough: 0.92, weather: false,
    skin: { plates: 0.05, plateSize: 3.2, plateGroove: 0.12, wrinkle: 0.04, wrinkleSize: 0.9, wrinkleAxis: [0.4, 3, 0.4], pores: 0.012, poreSize: 0.25, mottle: 0.55, mottleSize: 6, mottleColor: [0.27, 0.13, 0.08], mottle2: 0.45, mottle2Size: 0.7, mottle2Color: [0.48, 0.25, 0.14], cavity: 0.5, vary: 0.35 } },
  refuge_basalt: { kind: 'physical', color: C(0.075, 0.06, 0.052), rough: 0.62, clearcoat: 0.35, weather: false,
    skin: { plates: 0.05, plateSize: 1.8, plateGroove: 0.16, wrinkle: 0.035, wrinkleSize: 0.7, wrinkleAxis: [0.5, 2.5, 0.5], pores: 0.02, poreSize: 0.14, mottle: 0.55, mottleSize: 3, mottleColor: [0.2, 0.08, 0.04], mottle2: 0.45, mottle2Size: 0.4, mottle2Color: [0.12, 0.1, 0.09], cavity: 0.55, wet: 0.6, vary: 0.4 } },
  refuge_mineral: { kind: 'physical', color: C(0.3, 0.13, 0.06), rough: 0.42, clearcoat: 0.6, weather: false,
    skin: { wrinkle: 0.03, wrinkleSize: 0.25, wrinkleAxis: [3, 0.3, 3], pores: 0.008, poreSize: 0.06, mottle: 0.6, mottleSize: 0.9, mottleColor: [0.52, 0.3, 0.12], mottle2: 0.5, mottle2Size: 0.25, mottle2Color: [0.12, 0.05, 0.03], cavity: 0.5, wet: 0.7, vary: 0.35 } },
  refuge_floor: { kind: 'physical', color: C(0.09, 0.066, 0.052), rough: 0.6, clearcoat: 0.3, weather: false,
    skin: { pores: 0.014, poreSize: 0.09, wrinkle: 0.02, wrinkleSize: 0.5, wrinkleAxis: [1, 0.3, 1], mottle: 0.6, mottleSize: 2.5, mottleColor: [0.2, 0.09, 0.045], mottle2: 0.5, mottle2Size: 0.35, mottle2Color: [0.045, 0.04, 0.036], spots: 0.35, spotSize: 0.6, spotRadius: 0.3, spotDensity: 0.25, spotColor: [0.16, 0.12, 0.09], cavity: 0.55, wet: 0.65, vary: 0.4 } },
  refuge_ice: { kind: 'physical', color: C(0.62, 0.78, 0.86), rough: 0.06, clearcoat: 1, opacity: 0.72, envMapIntensity: 1.4, weather: false,
    skin: { wrinkle: 0.012, wrinkleSize: 0.5, pores: 0.003, poreSize: 0.05, mottle: 0.45, mottleSize: 1.2, mottleColor: [0.85, 0.9, 0.95], cavity: 0.2, wet: 0.8, vary: 0.25 } },
  // ---- Mars & Jupiter speculative expansion: the nine Mars species (blender/assets/fauna_mars_deep.py, painted maps)
  // 909 Crimson Icebloom: thin translucent gel lamellae, wet, frost-speckled
  ib_petal: { kind: 'physical', color: C(0.62, 0.08, 0.3), rough: 0.16, clearcoat: 0.9, sheen: 0.35, opacity: 0.62, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.0006, wrinkleSize: 0.01, pores: 0.0002, poreSize: 0.003, cavity: 0.2, wet: 0.7, vary: 0.2 } },
  ib_petal_in: { kind: 'physical', color: C(0.72, 0.06, 0.22), rough: 0.18, clearcoat: 0.9, sheen: 0.35, opacity: 0.78, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.0006, wrinkleSize: 0.01, cavity: 0.25, wet: 0.7, vary: 0.2 } },
  ib_core: { kind: 'physical', color: C(0.5, 0.02, 0.05), rough: 0.28, clearcoat: 0.7, weather: false, skin: { pores: 0.0004, poreSize: 0.003, cavity: 0.4, wet: 0.5 } },
  ib_vein: { kind: 'physical', color: C(0.66, 0.04, 0.08), rough: 0.3, clearcoat: 0.7, opacity: 0.85, weather: false, skin: { cavity: 0.2, wet: 0.5 } },
  ib_nodule: { kind: 'physical', color: C(0.25, 0.02, 0.04), rough: 0.35, clearcoat: 0.5, weather: false, skin: { pores: 0.0004, poreSize: 0.004, cavity: 0.4 } },
  // 912 Ferric Cathedral: wet velvet tissue over glassy-rusty mineral scaffold
  fc_tissue: { kind: 'physical', color: C(0.36, 0.05, 0.025), rough: 0.26, clearcoat: 0.75, sheen: 0.35, weather: false,
    skin: { wrinkle: 0.002, wrinkleSize: 0.03, wrinkleAxis: [1, 1, 4], pores: 0.0008, poreSize: 0.008, cavity: 0.5, wet: 0.7, vary: 0.25 } },
  fc_mineral: { kind: 'physical', color: C(0.22, 0.08, 0.04), rough: 0.55, clearcoat: 0.3, weather: false,
    skin: { pores: 0.002, poreSize: 0.02, wrinkle: 0.002, wrinkleSize: 0.04, cavity: 0.55, wet: 0.35, vary: 0.3 } },
  fc_frond: { kind: 'physical', color: C(0.7, 0.2, 0.05), rough: 0.3, clearcoat: 0.6, sheen: 0.4, opacity: 0.9, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.0008, wrinkleSize: 0.01, cavity: 0.3, wet: 0.5 } },
  // 913 Glass Ribbon: a hydrated transparent membrane with a violet organ tract
  gr_glass: { kind: 'physical', color: C(0.82, 0.86, 0.92), rough: 0.06, clearcoat: 1, iridescence: 0.4, opacity: 0.3, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.0002, wrinkleSize: 0.004, wet: 0.8 } },
  gr_tract: { kind: 'physical', color: C(0.38, 0.12, 0.62), emissive: C(0.18, 0.05, 0.3), emissiveIntensity: 0.25, rough: 0.2, opacity: 0.85, weather: false },
  gr_cilia: { kind: 'physical', color: C(0.9, 0.92, 0.95), rough: 0.2, opacity: 0.55, weather: false },
  // 915 Prism Architect: layered mineralised plates with strong thin-film colour, worn matte seams
  pa_plate: { kind: 'physical', color: C(0.36, 0.2, 0.11), rough: 0.3, metal: 0.15, clearcoat: 0.45, iridescence: 1.0, envMapIntensity: 1.0, weather: false,
    skin: { wrinkle: 0.0006, wrinkleSize: 0.008, wrinkleAxis: [1, 4, 1], pores: 0.0003, poreSize: 0.004, cavity: 0.3, wet: 0.45, vary: 0.3 } },
  pa_body: { kind: 'physical', color: C(0.2, 0.12, 0.08), rough: 0.4, clearcoat: 0.4, iridescence: 0.35, weather: false,
    skin: { wrinkle: 0.0015, wrinkleSize: 0.02, pores: 0.0006, poreSize: 0.006, cavity: 0.4, vary: 0.25 } },
  pa_leg: { kind: 'physical', color: C(0.34, 0.2, 0.13), rough: 0.32, metal: 0.12, clearcoat: 0.4, iridescence: 0.75, weather: false,
    skin: { pores: 0.0004, poreSize: 0.005, wrinkle: 0.0006, wrinkleSize: 0.01, cavity: 0.35, vary: 0.25 } },
  pa_eye: { kind: 'physical', color: C(0.01, 0.01, 0.012), rough: 0.03, clearcoat: 1, weather: false },
  pa_stone: { kind: 'physical', color: C(0.28, 0.24, 0.2), rough: 0.75, weather: false, skin: { pores: 0.002, poreSize: 0.02, cavity: 0.5, vary: 0.3 } },
  pa_egg: { kind: 'physical', color: C(0.88, 0.78, 0.66), emissive: C(0.55, 0.32, 0.12), emissiveIntensity: 0.18, rough: 0.3, clearcoat: 0.8, sheen: 0.4, opacity: 0.9, weather: false,
    skin: { wrinkle: 0.0004, wrinkleSize: 0.01, cavity: 0.2, wet: 0.4 } },
  pa_fibre: { kind: 'physical', color: C(0.45, 0.38, 0.3), rough: 0.8, weather: false, skin: { cavity: 0.3 } },
  // 911 Ghost of Valles: silver-lilac translucent membranes, silver venation, purple core
  gv_membrane: { kind: 'physical', color: C(0.66, 0.62, 0.78), rough: 0.1, clearcoat: 1, sheen: 0.4, iridescence: 0.45, opacity: 0.4, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.0006, wrinkleSize: 0.04, wet: 0.7 } },
  gv_body: { kind: 'physical', color: C(0.55, 0.42, 0.68), rough: 0.1, clearcoat: 1, iridescence: 0.3, opacity: 0.62, side: THREE.DoubleSide, weather: false,
    skin: { wrinkle: 0.0008, wrinkleSize: 0.03, pores: 0.0004, poreSize: 0.008, wet: 0.7 } },
  gv_core: { kind: 'physical', color: C(0.38, 0.14, 0.5), emissive: C(0.2, 0.06, 0.28), emissiveIntensity: 0.2, rough: 0.2, opacity: 0.85, weather: false },
  gv_vein: { kind: 'physical', color: C(0.9, 0.9, 0.95), rough: 0.15, clearcoat: 0.8, metal: 0.3, opacity: 0.8, weather: false },
  gv_eye: { kind: 'physical', color: C(0.08, 0.06, 0.1), rough: 0.05, clearcoat: 1, weather: false },
  // 910 Basalt Mimic: granular vesicular basalt skin, rust mottling, damp
  bm_skin: { kind: 'physical', color: C(0.05, 0.04, 0.035), rough: 0.62, clearcoat: 0.2, weather: false,
    skin: { pores: 0.0016, poreSize: 0.012, wrinkle: 0.0018, wrinkleSize: 0.03, cavity: 0.55, wet: 0.3, vary: 0.3 } },
  bm_shield: { kind: 'physical', color: C(0.06, 0.05, 0.045), rough: 0.7, clearcoat: 0.12, weather: false,
    skin: { pores: 0.0024, poreSize: 0.016, cavity: 0.6, wet: 0.2, vary: 0.35 } },
  bm_belly: { kind: 'physical', color: C(0.12, 0.07, 0.05), rough: 0.55, clearcoat: 0.2, weather: false, skin: { pores: 0.001, poreSize: 0.008, wrinkle: 0.0012, wrinkleSize: 0.02, cavity: 0.4 } },
  bm_eye: { kind: 'physical', color: C(0.6, 0.38, 0.08), emissive: C(0.25, 0.14, 0.02), emissiveIntensity: 0.12, rough: 0.05, clearcoat: 1, weather: false },
  // 914 Red Dune Hermit: matte, dust-caked, impact-pitted
  dh_shell: { kind: 'physical', color: C(0.36, 0.12, 0.06), rough: 0.88, sheen: 0.3, weather: false,
    skin: { pores: 0.0006, poreSize: 0.004, wrinkle: 0.0006, wrinkleSize: 0.008, cavity: 0.4, vary: 0.25 } },
  dh_leg: { kind: 'physical', color: C(0.32, 0.12, 0.06), rough: 0.82, sheen: 0.3, weather: false, skin: { pores: 0.0005, poreSize: 0.003, cavity: 0.4 } },
  dh_soft: { kind: 'physical', color: C(0.28, 0.1, 0.06), rough: 0.6, sheen: 0.3, weather: false, skin: { wrinkle: 0.0006, wrinkleSize: 0.005, cavity: 0.4 } },
  // 907 Thermal Rift Serpent: wet black hide, rust-copper banding
  rs_hide: { kind: 'physical', color: C(0.05, 0.025, 0.02), rough: 0.3, clearcoat: 0.85, sheen: 0.25, weather: false,
    skin: { pores: 0.0008, poreSize: 0.008, wrinkle: 0.0015, wrinkleSize: 0.025, wrinkleAxis: [1, 1, 3], cavity: 0.5, wet: 0.85, vary: 0.25 } },
  rs_belly: { kind: 'physical', color: C(0.25, 0.14, 0.09), rough: 0.35, clearcoat: 0.7, weather: false,
    skin: { wrinkle: 0.0012, wrinkleSize: 0.02, wrinkleAxis: [4, 1, 1], cavity: 0.4, wet: 0.7 } },
  rs_eye: { kind: 'physical', color: C(0.65, 0.45, 0.1), emissive: C(0.3, 0.18, 0.03), emissiveIntensity: 0.15, rough: 0.05, clearcoat: 1, weather: false },
  rs_whisker: { kind: 'physical', color: C(0.75, 0.68, 0.6), rough: 0.3, clearcoat: 0.5, weather: false },
  // 908 Subglacial Monarch: elastic black-blue skin, ivory scars, pale underside
  mo_hide: { kind: 'physical', color: C(0.025, 0.035, 0.055), rough: 0.32, clearcoat: 0.9, sheen: 0.2, weather: false,
    skin: { wrinkle: 0.003, wrinkleSize: 0.08, wrinkleAxis: [3, 1, 3], pores: 0.0015, poreSize: 0.03, cavity: 0.45, wet: 0.8, vary: 0.25 } },
  mo_belly: { kind: 'physical', color: C(0.3, 0.32, 0.34), rough: 0.35, clearcoat: 0.8, weather: false,
    skin: { wrinkle: 0.003, wrinkleSize: 0.04, wrinkleAxis: [4, 1, 1], cavity: 0.4, wet: 0.7 } },
  mo_gum: { kind: 'physical', color: C(0.28, 0.1, 0.12), rough: 0.3, clearcoat: 0.8, weather: false, skin: { wrinkle: 0.002, wrinkleSize: 0.02, cavity: 0.5, wet: 0.8 } },
  mo_eye: { kind: 'physical', color: C(0.35, 0.2, 0.06), rough: 0.05, clearcoat: 1, weather: false },
  miller_canister: { kind: 'physical', color: C(0.8, 0.79, 0.74), rough: 0.4, metal: 0.3, weather: { grime: 0.6, streak: 0.3, scratch: 0.4 } },
  // the explorer camps on the Gargantua worlds (blender/lib/camp.py)
  granite_pale: { color: C(2.3, 2.05, 1.75), map: 'rock_a', mapRepeat: 0.22, rough: 0.92, normal: 'rock_n', normalScale: 1.1, normalRepeat: 0.22, weather: { grime: 0.35, grimeScale: 0.12, grimeTint: new THREE.Color(0.8, 0.72, 0.62), scratch: 0, streak: 0.25 } },
  mann_orange: { color: C(0.5, 0.14, 0.055), rough: 0.6, normal: 'panel_n', normalScale: 0.35, normalRepeat: 0.35, weather: { grime: 0.8, grimeScale: 0.25, grimeTint: new THREE.Color(0.7, 0.66, 0.62), streak: 0.75, scratch: 0.3, scratchColor: new THREE.Color(0.55, 0.42, 0.36) } },
  snow_drift: { color: C(0.84, 0.86, 0.9), rough: 0.82, normal: 'sand_n', normalScale: 0.45, normalRepeat: 0.3, weather: false },
  ice_cliff: { kind: 'physical', color: C(0.36, 0.4, 0.47), map: 'ice_a', mapRepeat: 0.07, rough: 0.32, normal: 'ice_n', normalScale: 1.1, normalRepeat: 0.12, clearcoat: 0.35, weather: { grime: 0.6, grimeScale: 0.05, grimeTint: new THREE.Color(0.45, 0.47, 0.52), streak: 0.9, scratch: 0 } },
  ice_slab: { kind: 'physical', color: C(0.62, 0.66, 0.71), map: 'ice_a', mapRepeat: 0.25, rough: 0.3, normal: 'ice_n', normalScale: 0.9, normalRepeat: 0.3, clearcoat: 0.5, weather: { grime: 0.35, grimeScale: 0.2, grimeTint: new THREE.Color(0.7, 0.72, 0.76), scratch: 0, streak: 0 } },
  crevasse: { color: C(0.025, 0.035, 0.05), rough: 0.35, weather: false },
  frost: { color: C(0.9, 0.93, 0.97), rough: 0.6, normal: 'ice_n', normalScale: 0.7, normalRepeat: 2.5, sheen: 0.4, weather: false },
  hab_fabric: { color: C(0.86, 0.85, 0.8), rough: 0.85, normal: 'fabric_n', normalScale: 0.5, normalRepeat: 1.5, sheen: 0.35, emissive: C(1.0, 0.62, 0.3), emissiveIntensity: 0, weather: { grime: 0.55, grimeScale: 0.2, grimeTint: new THREE.Color(0.75, 0.68, 0.58), streak: 0.4, scratch: 0 } },
  hab_rib: { color: C(0.78, 0.77, 0.72), rough: 0.85, normal: 'ribbed_n', normalScale: 0.6, normalRepeat: 1.5, sheen: 0.35, emissive: C(1.0, 0.62, 0.3), emissiveIntensity: 0, weather: { grime: 0.55, grimeScale: 0.2, grimeTint: new THREE.Color(0.75, 0.68, 0.58), streak: 0.4, scratch: 0 } },
  flag_red: { color: C(0.5, 0.06, 0.06), rough: 0.85, normal: 'fabric_n', normalScale: 0.6, normalRepeat: 3, sheen: 0.4, weather: { grime: 0.3, scratch: 0 } },
  flag_white: { color: C(0.82, 0.81, 0.78), rough: 0.85, normal: 'fabric_n', normalScale: 0.6, normalRepeat: 3, sheen: 0.4, weather: { grime: 0.3, scratch: 0 } },
  flag_blue: { color: C(0.06, 0.085, 0.22), rough: 0.85, normal: 'fabric_n', normalScale: 0.6, normalRepeat: 3, sheen: 0.4, weather: { grime: 0.2, scratch: 0 } },
  soil_bed: { color: C(0.3, 0.21, 0.13), map: 'soil_a', mapRepeat: 0.8, rough: 0.95, normal: 'soil_n', normalScale: 1, normalRepeat: 0.8, weather: false },
  leaf_green: { color: C(0.19, 0.36, 0.11), rough: 0.65, sheen: 0.3, weather: false, side: THREE.DoubleSide },
  leaf_pale: { color: C(0.4, 0.52, 0.2), rough: 0.7, sheen: 0.3, weather: false, side: THREE.DoubleSide },
  flower_blue: { color: C(0.2, 0.28, 0.75), rough: 0.55, weather: false },
  suit_white: { color: C(0.8, 0.79, 0.76), rough: 0.82, normal: 'fabric_n', normalScale: 0.8, normalRepeat: 6, sheen: 0.5, weather: { grime: 0.45, scratch: 0 } },
  suit_gray: { color: C(0.35, 0.36, 0.37), rough: 0.7, normal: 'fabric_n', normalScale: 0.6, normalRepeat: 6, weather: { grime: 0.3, scratch: 0 } },
  cloth_denim: { color: C(0.18, 0.24, 0.34), rough: 0.92, normal: 'fabric_n', normalScale: 0.8, normalRepeat: 8, sheen: 0.4, weather: { grime: 0.4, scratch: 0 } },
  cloth_khaki: { color: C(0.48, 0.42, 0.3), rough: 0.92, normal: 'fabric_n', normalScale: 0.8, normalRepeat: 8, sheen: 0.4, weather: { grime: 0.4, scratch: 0 } },
  cloth_flannel: { color: C(0.4, 0.14, 0.1), rough: 0.92, normal: 'fabric_n', normalScale: 0.8, normalRepeat: 8, sheen: 0.4, weather: { grime: 0.3, scratch: 0 } },
  cloth_jumpsuit: { color: C(0.3, 0.33, 0.3), rough: 0.88, normal: 'fabric_n', normalScale: 0.8, normalRepeat: 8, sheen: 0.4, weather: { grime: 0.25, scratch: 0 } },
  cloth_navy: { color: C(0.1, 0.12, 0.18), rough: 0.88, normal: 'fabric_n', normalScale: 0.8, normalRepeat: 8, sheen: 0.4, weather: { grime: 0.2, scratch: 0 } },
  skin: { color: C(0.62, 0.46, 0.38), rough: 0.55, sheen: 0.3, weather: false },
  skin_dark: { color: C(0.36, 0.24, 0.17), rough: 0.55, sheen: 0.3, weather: false },
};

export class MaterialLibrary {
  private loader = new THREE.TextureLoader();
  private texCache = new Map<string, THREE.Texture>();
  private matCache = new Map<string, THREE.Material>();
  grime: THREE.Texture;
  streaks: THREE.Texture;
  anisotropy = 8;
  textureQuality = 2;
  /** global weathering multiplier (e.g. dust storms increase dirt) */
  readonly globalUniforms = { uDustAccum: { value: 0 } };

  constructor() {
    this.grime = this.tex('grime', false);
    this.streaks = this.tex('streaks', false);
  }

  tex(name: string, srgb: boolean, repeat = 1): THREE.Texture {
    const key = `${name}|${srgb}|${repeat}`;
    let t = this.texCache.get(key);
    if (t) return t;
    const base = this.texCache.get(`${name}|${srgb}|1`);
    if (base && repeat !== 1) {
      t = base.clone();
      t.repeat.set(repeat, repeat);
      t.needsUpdate = true;
    } else {
      const ext = name === 'grate' || name === 'net' || name === 'noise' || name.endsWith('_rgba') ? 'png' : 'jpg';
      t = this.loader.load(TEX_BASE + name + '.' + ext);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = this.anisotropy;
      t.repeat.set(repeat, repeat);
      if (repeat !== 1) this.texCache.set(`${name}|${srgb}|1`, t.clone());
    }
    this.texCache.set(key, t);
    return t;
  }

  /** Get (or build) the library material for a name. Returns null for unknown names. */
  get(name: string): THREE.Material | null {
    const cached = this.matCache.get(name);
    if (cached) return cached;
    const base = name.replace(/\.\d+$/, '');
    const r = RECIPES[base];
    if (!r) return null;
    const m = this.build(base, r);
    this.matCache.set(name, m);
    return m;
  }

  private build(name: string, r: Recipe): THREE.Material {
    const params: any = {
      name,
      color: Array.isArray(r.color) ? new THREE.Color(...r.color) : new THREE.Color(r.color ?? 0xffffff),
      roughness: r.rough ?? 0.5,
      metalness: r.metal ?? 0,
    };
    if (r.map) params.map = this.tex(r.map, true, r.mapRepeat ?? 1);
    if (r.normal && this.textureQuality > 0) {
      params.normalMap = this.tex(r.normal, false, r.normalRepeat ?? 1);
      const s = r.normalScale ?? 1;
      params.normalScale = new THREE.Vector2(s, s);
    }
    if (r.alphaMap) {
      params.alphaMap = this.tex(r.alphaMap, false, r.mapRepeat ?? 1);
      params.alphaTest = r.alphaTest ?? 0.5;
    } else if (r.alphaTest !== undefined) params.alphaTest = r.alphaTest;
    if (r.emissive) {
      params.emissive = new THREE.Color(...r.emissive);
      params.emissiveIntensity = r.emissiveIntensity ?? 1;
    }
    if (r.emissiveMap) params.emissiveMap = this.tex(r.emissiveMap, true, r.mapRepeat ?? 1);
    if (r.opacity !== undefined && r.opacity < 1) {
      params.transparent = true;
      params.opacity = r.opacity;
      params.depthWrite = false;
    }
    if (r.side !== undefined) params.side = r.side;
    if (r.envMapIntensity !== undefined) params.envMapIntensity = r.envMapIntensity;
    let m: THREE.MeshStandardMaterial;
    if (r.kind === 'physical' || r.clearcoat || r.sheen || r.iridescence) {
      const pm = new THREE.MeshPhysicalMaterial(params);
      if (r.iridescence) {
        pm.iridescence = r.iridescence;
        pm.iridescenceIOR = 1.6;
        pm.iridescenceThicknessRange = [180, 620];
      }
      if (r.clearcoat) {
        pm.clearcoat = r.clearcoat;
        pm.clearcoatRoughness = 0.15;
      }
      if (r.sheen && this.textureQuality >= 2) {
        pm.sheen = r.sheen;
        pm.sheenRoughness = 0.8;
        pm.sheenColor = new THREE.Color(1, 1, 1);
      }
      m = pm;
    } else m = new THREE.MeshStandardMaterial(params);
    if (r.skin) applySkin(m, r.skin, this.textureQuality);
    else if (r.weather !== false) this.applyWeather(m, { ...W_DEFAULT, ...(r.weather ?? {}) });
    return m;
  }

  /** a recipe material carrying a baked colour map: the map holds the colour pattern, the skin adds relief only */
  private painted(base: string, map: THREE.Texture, nmap: THREE.Texture | null = null, nscale: THREE.Vector2 | null = null): THREE.Material {
    const key = base + '|' + map.uuid + (nmap ? '|' + nmap.uuid : '');
    const hit = this.matCache.get(key);
    if (hit) return hit;
    const r = RECIPES[base];
    const sk = r.skin!;
    // the baked maps hold colour pattern and medium relief: the runtime skin adds only the finest relief (pores,
    // fine wrinkles) and wet cavities — with a baked normal map the coarser procedural cells are dropped
    const skin: SkinSpec = { ...sk, mottle: 0, mottle2: 0, spots: 0, retic: 0, belly: 0, aoAlbedo: 0.15, vary: 0.04, cavity: Math.min(sk.cavity ?? 0.3, 0.15),
      ...(nmap ? { plates: 0, wrinkle: (sk.wrinkle ?? 0) * 0.35, wrinkleSize: (sk.wrinkleSize ?? 0.05) * 0.4, pores: (sk.pores ?? 0) * 0.6, poreSize: (sk.poreSize ?? 0.01) * 0.5 } : {}) };
    const m = this.build(base, { ...r, color: [1, 1, 1], skin, normal: undefined }) as THREE.MeshStandardMaterial;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = this.anisotropy;
    m.map = map;
    if (nmap && this.textureQuality > 0) {
      nmap.anisotropy = this.anisotropy;
      m.normalMap = nmap;
      m.normalScale = (nscale ?? new THREE.Vector2(1, 1)).clone();
    }
    m.needsUpdate = true;
    this.matCache.set(key, m);
    return m;
  }

  /** Inject the shared weathering layer into a standard/physical material. */
  applyWeather(m: THREE.MeshStandardMaterial, w: Weather) {
    const grime = this.grime;
    const streaks = this.streaks;
    const g = this.globalUniforms;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.tGrime = { value: grime };
      shader.uniforms.tStreak = { value: streaks };
      shader.uniforms.uGrime = { value: w.grime };
      shader.uniforms.uGrimeScale = { value: w.grimeScale };
      shader.uniforms.uGrimeTint = { value: w.grimeTint };
      shader.uniforms.uScratch = { value: w.scratch };
      shader.uniforms.uScratchColor = { value: w.scratchColor };
      shader.uniforms.uStreak = { value: w.streak };
      shader.uniforms.uRoughVar = { value: w.roughVar };
      shader.uniforms.uDustAccum = g.uDustAccum;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWUv;\nvarying vec3 vWNormal;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWUv = uv;\nvWNormal = normalize(mat3(modelMatrix) * normal);');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vWUv; varying vec3 vWNormal;
          uniform sampler2D tGrime; uniform sampler2D tStreak;
          uniform float uGrime, uGrimeScale, uScratch, uStreak, uRoughVar, uDustAccum;
          uniform vec3 uGrimeTint, uScratchColor;
          float wDirt; float wScratch; float wFine;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            vec3 g1 = texture2D(tGrime, vWUv * uGrimeScale).rgb;
            vec3 g2 = texture2D(tGrime, vWUv * uGrimeScale * 0.27 + vec2(0.37, 0.61)).rgb;
            vec3 st = texture2D(tStreak, vWUv * vec2(0.35, 0.18)).rgb;
            float up = clamp(vWNormal.y, 0.0, 1.0);
            float side = 1.0 - abs(vWNormal.y);
            wFine = g1.g;
            wDirt = smoothstep(0.25, 0.95, g1.r * 0.55 + g2.r * 0.65) * uGrime;
            wDirt += st.r * uStreak * side * 0.8;
            wDirt += up * uDustAccum * (0.6 + 0.4 * g1.g);
            wDirt = clamp(wDirt, 0.0, 1.0);
            wScratch = smoothstep(0.35, 0.9, g1.b) * uScratch * (0.4 + 0.6 * g2.g);
            diffuseColor.rgb *= mix(vec3(1.0), uGrimeTint, wDirt);
            diffuseColor.rgb *= 0.93 + 0.14 * wFine;
            diffuseColor.rgb = mix(diffuseColor.rgb, uScratchColor, wScratch * 0.6);
          }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (wFine - 0.5) * uRoughVar + wDirt * 0.18 - wScratch * 0.15, 0.03, 1.0);`,
        );
    };
    m.customProgramCacheKey = () => 'weather1';
  }

  /** Replace materials on all meshes below root with library materials (by name). */
  upgrade(root: THREE.Object3D, opts: { shadows?: boolean } = {}) {
    const shadows = opts.shadows ?? true;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (shadows) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      const swap = (mat: THREE.Material): THREE.Material => {
        const lib = this.get(mat.name);
        // a creature with a painted colour map baked in Blender (blender/lib/paint.py): keep the map
        const gm = mat as THREE.MeshStandardMaterial;
        const base = mat.name.replace(/\.\d+$/, '');
        if (lib && gm.map && RECIPES[base]?.skin) return this.painted(base, gm.map, gm.normalMap, gm.normalScale);
        if (lib) return lib;
        // unknown material: keep, mark as weathered lightly
        const sm = mat as THREE.MeshStandardMaterial;
        if (sm.isMeshStandardMaterial && !this.matCache.has('__w_' + mat.name)) {
          this.applyWeather(sm, { ...W_DEFAULT, grime: 0.2 });
          this.matCache.set('__w_' + mat.name, sm);
        }
        return mat;
      };
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(swap);
      else mesh.material = swap(mesh.material);
      const m = mesh.material as THREE.Material;
      if ((Array.isArray(mesh.material) ? mesh.material : [m]).some((x) => x.userData.skin)) adoptAO(mesh.geometry);
      if ((m as any).transparent || (m as any).emissiveIntensity > 2) mesh.castShadow = false;
    });
  }
}
