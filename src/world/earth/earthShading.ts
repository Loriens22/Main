import * as THREE from 'three';
import type { MaterialLibrary } from '../../render/Materials';
import type { TerrainShading } from '../terrain/Terrain';
import type { EarthGen } from './EarthGen';
import { EARTH_TERRAIN } from '../../data/earthLayout';

/**
 * Earth terrain splat shader: dry grass and dusty soil plains, rock on steep slopes, compacted yard
 * gravel, road shoulders, furrowed field soil with stubble where harvested, and dust accumulation.
 * Two-scale detail sampling plus macro variation hides texture repetition.
 */
export function earthShading(gen: EarthGen, mats: MaterialLibrary, harvest: THREE.DataTexture, harvestRect: THREE.Vector4): TerrainShading {
  const T = EARTH_TERRAIN;
  const t = (n: string, srgb = true) => mats.tex(n, srgb, 1);
  return {
    uniforms: {
      tMask: { value: gen.mask },
      uMaskRect: { value: new THREE.Vector4(T.center[0] - T.size / 2, T.center[1] - T.size / 2, T.size, 0) },
      tSoilA: { value: t('soil_a') }, tSoilN: { value: t('soil_n', false) },
      tGrassA: { value: t('drygrass_a') }, tGrassN: { value: t('drygrass_n', false) },
      tRockA: { value: t('rock_a') }, tRockN: { value: t('rock_n', false) },
      tGravelA: { value: t('gravel_a') }, tGravelN: { value: t('gravel_n', false) },
      tNoise: { value: mats.tex('noise', false, 1) },
      tCanopy: { value: t('corn_canopy_a') },
      tHarvest: { value: harvest },
      uHarvestRect: { value: harvestRect },
      uDust: { value: 0 },
      uWet: { value: 0 },
    },
    glsl: /* glsl */ `
      uniform sampler2D tMask; uniform vec4 uMaskRect;
      uniform sampler2D tSoilA, tSoilN, tGrassA, tGrassN, tRockA, tRockN, tGravelA, tGravelN, tNoise, tCanopy, tHarvest;
      uniform vec4 uHarvestRect; uniform float uDust, uWet;
      vec3 sampleDual(sampler2D t, vec2 uv, float s1, float s2, float k) {
        return mix(texture2D(t, uv / s1).rgb, texture2D(t, uv / s2 + 0.37).rgb, k);
      }
      TerrainOut terrainShade(vec3 p, vec3 n) {
        TerrainOut o;
        vec2 uv = p.xz;
        float dist = distance(cameraPosition, p);
        float far = smoothstep(60.0, 400.0, dist);
        vec4 macro = texture2D(tNoise, uv / 1700.0);
        vec4 meso = texture2D(tNoise, uv / 190.0);
        vec4 micro = texture2D(tNoise, uv / 21.0);
        vec3 grass = sampleDual(tGrassA, uv, 3.5, 29.0, 0.35 + far * 0.4);
        vec3 soil = sampleDual(tSoilA, uv, 4.0, 31.0, 0.35 + far * 0.4);
        vec3 rockXZ = texture2D(tRockA, uv / 9.0).rgb;
        vec3 rockXY = texture2D(tRockA, p.xy / 11.0).rgb;
        vec3 rockZY = texture2D(tRockA, p.zy / 11.0).rgb;
        vec3 aw = pow(abs(n), vec3(4.0)); aw /= (aw.x + aw.y + aw.z);
        vec3 rock = rockZY * aw.x + rockXZ * aw.y + rockXY * aw.z;
        vec3 gravel = texture2D(tGravelA, uv / 3.0).rgb;
        // plains: patchy dry grass over dusty soil (declining biodiversity)
        float g = smoothstep(0.38, 0.68, macro.r * 0.6 + meso.g * 0.45 + micro.b * 0.15);
        vec3 col = mix(soil, grass * vec3(1.02, 1.0, 0.86), g);
        col *= 0.86 + 0.28 * macro.a;
        // field / road / yard masks
        vec2 muv = (p.xz - uMaskRect.xy) / uMaskRect.z;
        vec4 mk = vec4(0.0);
        if (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) mk = texture2D(tMask, muv);
        // fields: furrowed soil, darker and richer; stubble when harvested
        if (mk.a > 0.01) {
          vec2 huv = (p.xz - uHarvestRect.xy) / uHarvestRect.zw;
          float harvested = texture2D(tHarvest, huv).r;
          float rows = 0.5 + 0.5 * sin(dot(p.xz, vec2(0.0, 1.0)) * 8.27);
          vec3 furrow = soil * vec3(0.78, 0.74, 0.7) * (0.82 + 0.3 * rows);
          vec3 stubble = mix(furrow, vec3(0.55, 0.47, 0.32), 0.45 * smoothstep(0.3, 0.7, micro.r));
          vec3 fieldCol = mix(furrow, stubble, harvested);
          col = mix(col, fieldCol, mk.a);
        }
        float slope = 1.0 - n.y;
        float rockW = smoothstep(0.13, 0.33, slope + (meso.r - 0.5) * 0.22 + (micro.g - 0.5) * 0.08);
        float alt = smoothstep(60.0, 220.0, p.y + (macro.g - 0.5) * 80.0);
        rockW = max(rockW, alt * smoothstep(0.08, 0.2, slope) * 0.85);
        col = mix(col, rock * vec3(0.95, 0.92, 0.88), rockW);
        // mountain grass/scrub tint
        col = mix(col, col * vec3(0.55, 0.62, 0.45), alt * (1.0 - rockW) * smoothstep(0.35, 0.65, meso.a + macro.b * 0.4) * 0.85);
        // farmyards: compacted pale dust over dirt, a little gravel showing through in wheel-worn patches
        vec3 yardDust = mix(soil * vec3(1.05, 1.0, 0.93), vec3(0.53, 0.49, 0.43), 0.55) * (0.9 + 0.16 * micro.b);
        vec3 yardCol = mix(yardDust, gravel * vec3(0.92, 0.86, 0.78), 0.35 * smoothstep(0.55, 0.85, micro.g * 0.6 + meso.b * 0.6));
        col = mix(col, yardCol, mk.b * 0.97);
        vec3 roadCol = mk.g > 0.75 ? gravel * 0.55 : mk.g > 0.4 ? soil * vec3(1.1, 1.0, 0.9) : gravel * vec3(0.98, 0.9, 0.8);
        col = mix(col, roadCol, mk.r * 0.85);
        // dust accumulation from storms
        col = mix(col, vec3(0.58, 0.49, 0.37), uDust * 0.55 * (0.6 + 0.4 * micro.g));
        o.albedo = col;
        o.rough = mix(0.93, 0.98, rockW) - uWet * 0.3;
        // detail normal (tangent frame aligned to world X)
        vec3 dn;
        if (rockW > 0.5) dn = texture2D(tRockN, uv / 9.0).xyz * 2.0 - 1.0;
        else if (mk.r > 0.5) dn = texture2D(tGravelN, uv / 3.0).xyz * 2.0 - 1.0;
        else dn = mix(texture2D(tSoilN, uv / 4.0).xyz, texture2D(tGrassN, uv / 3.5).xyz, g) * 2.0 - 1.0;
        dn.xy *= (1.0 - far) * 0.9;
        vec3 tng = normalize(cross(n, vec3(0.0, 0.0, 1.0)));
        vec3 bit = normalize(cross(tng, n));
        o.normal = normalize(tng * dn.x + bit * dn.y + n * max(dn.z, 0.3));
        o.ao = 0.85 + 0.15 * micro.a;
        return o;
      }
    `,
  };
}
