import * as THREE from 'three';

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
  aoMap?: string;
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
    if (r.kind === 'physical' || r.clearcoat || r.sheen) {
      const pm = new THREE.MeshPhysicalMaterial(params);
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
    if (r.weather !== false) this.applyWeather(m, { ...W_DEFAULT, ...(r.weather ?? {}) });
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
      if ((m as any).transparent || (m as any).emissiveIntensity > 2) mesh.castShadow = false;
    });
  }
}
