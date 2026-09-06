/**
 * CanopyShell — far forests as a lit aggregate surface (spec: "mid-distance
 * forests as lit canopy-shell/impostor fields, never fog silhouettes").
 *
 * One static 512² grid over the world. Vertices ride the heightfield plus a
 * canopy-coverage lift (the scatter-splatted canopy map), with hash bumps at
 * crown scale so ridgelines stay lumpy; cells without forest sink below the
 * terrain and z-fail away. Normals come from finite differences of the same
 * field, so the shell shades like a rolling foliage surface. It dithers IN
 * past the impostor mid-range and owns the 600 m → world-edge band together
 * with sparse impostors (which continue to give individual-tree silhouettes).
 */

import { BufferAttribute, BufferGeometry, Mesh } from 'three';
import { MeshPhysicalNodeMaterial, type StorageTexture } from 'three/webgpu';
import {
  Discard,
  Fn,
  cameraPosition,
  float,
  interleavedGradientNoise,
  mix,
  normalLocal,
  positionLocal,
  positionWorld,
  screenCoordinate,
  smoothstep,
  texture,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { canopyAt, cellHash2 } from '../gpu/passes/Scatter';
import { fbm3 } from '../gpu/noise/NoiseTSL';
import { grassTranslucency } from '../render/VegMaterials';
import type { NF, NV2, NV3 } from '../gpu/TSLTypes';
import type { Heightfield } from './Heightfield';
import { WORLD_SIZE } from './WorldConst';
import { seasonalFoliageStyle, type SeasonId } from '../vegetation/Seasons';
import { TREE_SPECIES } from '../vegetation/Species';

const GRID = 512;
const FADE_IN = 620;
const FADE_BAND = 90;

type CanopyColor = readonly [number, number, number];

/** Appearance-only representative mixtures for the six biome render IDs.
 * Scatter remains the authority for individual tree placement. These broad
 * mixtures keep distant forests in the same species/season colour family;
 * they are not a new habitat or density rule.
 */
const CANOPY_FAMILIES: readonly (readonly [string, number][])[] = [
  [['spruce', 1]],
  [['spruce', 0.73], ['pine', 0.24], ['birch', 0.03]],
  [['spruce', 0.58], ['pine', 0.27], ['birch', 0.08], ['oak', 0.1]],
  [['beech', 0.5], ['oak', 0.5], ['karst', 0.2], ['birch', 0.16], ['spruce', 0.07]],
  [['beech', 0.42], ['oak', 0.34], ['birch', 0.3], ['pine', 0.15], ['spruce', 0.05]],
  [['willow', 0.72], ['birch', 0.55], ['oak', 0.16], ['spruce', 0.12]],
];

/** Deterministic, testable CPU palette sourced from the SAME authored leaves. */
export function canopyPaletteForSeason(season: SeasonId): CanopyColor[] {
  return CANOPY_FAMILIES.map((family) => {
    const rgb = [0, 0, 0];
    let total = 0;
    for (const [id, weight] of family) {
      const species = TREE_SPECIES.find((candidate) => candidate.id === id);
      if (!species) throw new Error(`unknown canopy species: ${id}`);
      const style = seasonalFoliageStyle(species, season);
      const w = weight * style.coverage;
      const authored = [species.foliageColor.r, species.foliageColor.g, species.foliageColor.b];
      for (let c = 0; c < 3; c++) rgb[c] += authored[c] * style.tint[c] * w;
      total += w;
    }
    // Canopy coverage already collapses leafless forests below the terrain;
    // this fallback is only used in completely empty representative groups.
    return (total > 0 ? rgb.map((c) => c / total) : [0.07, 0.065, 0.055]) as [number, number, number];
  });
}

export function buildCanopyShell(
  hf: Heightfield,
  canopyTex: StorageTexture,
  season: SeasonId = 'summer',
): Mesh {
  const n = GRID + 1;
  const pos = new Float32Array(n * n * 3);
  const normals = new Float32Array(n * n * 3);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = (z * n + x) * 3;
      pos[i] = (x / GRID - 0.5) * WORLD_SIZE;
      pos[i + 1] = 0;
      pos[i + 2] = (z / GRID - 0.5) * WORLD_SIZE;
      normals[i + 1] = 1;
    }
  }
  const idx = new Uint32Array(GRID * GRID * 6);
  let w = 0;
  for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
      const a = z * n + x;
      idx[w++] = a;
      idx[w++] = a + n;
      idx[w++] = a + 1;
      idx[w++] = a + 1;
      idx[w++] = a + n;
      idx[w++] = a + n + 1;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  // Required even though the vertex shader replaces the sampled normal.
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  geo.setIndex(new BufferAttribute(idx, 1));

  // physical for specularIntensity — the far-forest aggregate silvered at
  // glancing sun exactly like the cards (user feedback batch 2 item 11)
  const mat = new MeshPhysicalNodeMaterial();
  mat.specularIntensity = 0.2;

  /** canopy-top height field: terrain + coverage lift + crown bumps */
  const shellY = (p: NV2): NF => {
    const cov = canopyAt(canopyTex, p);
    const lift = smoothstep(0.18, 0.5, cov).mul(cov.mul(7).add(11));
    const bump = cellHash2(p.div(7).floor(), 911)
      .x.sub(0.5)
      .mul(4.5)
      .add(fbm3(vec3(p.x.mul(0.02), 4.4, p.y.mul(0.02)), 2).mul(2.6));
    const h = hf.sampleHeight(p);
    // forestless cells dive under the terrain and z-fail
    return mix(h.sub(8), h.add(lift).add(bump.mul(smoothstep(0.2, 0.45, cov))), smoothstep(0.16, 0.3, cov));
  };

  mat.positionNode = Fn(() => {
    const p = vec2(positionLocal.x, positionLocal.z);
    const e = float(WORLD_SIZE / GRID);
    const y0 = shellY(p).toVar();
    const yx = shellY(p.add(vec2(e, 0))).toVar();
    const yz = shellY(p.add(vec2(0, e))).toVar();
    const nrm = vec3(y0.sub(yx), e, y0.sub(yz)).normalize().toVar();
    normalLocal.assign(nrm);
    return vec3(positionLocal.x, y0, positionLocal.z);
  })();

  // Match authored species colours and season at every distance. Only one
  // existing biome texture is sampled; no per-species texture array is needed.
  const cov = canopyAt(canopyTex, positionWorld.xz);
  const macro = fbm3(positionWorld.mul(0.013).add(3.1), 2).mul(0.5).add(0.5);
  const palette = canopyPaletteForSeason(season);
  const colorNode = (c: CanopyColor): NV3 => vec3(c[0], c[1], c[2]) as unknown as NV3;
  let familyColor = colorNode(palette[2]);
  if (hf.biomeTex) {
    const bio = texture(hf.biomeTex, positionWorld.xz.div(WORLD_SIZE).add(0.5)).r.mul(8);
    // A short interpolated palette also softens categorical map boundaries
    // at shell scale, instead of printing hard green/gold seams on ridges.
    familyColor = colorNode(palette[0]);
    for (let i = 1; i < palette.length; i++) {
      familyColor = mix(familyColor, colorNode(palette[i]), smoothstep(i - 0.7, i + 0.15, bio)) as unknown as NV3;
    }
  }
  const albedo = familyColor.mul(macro.mul(0.28).add(0.8)).mul(cov.mul(-0.1).add(1)) as unknown as NV3;
  const distV = varying(
    vec3(positionLocal.x, 0, positionLocal.z).sub(cameraPosition).length(),
  ) as unknown as NF;
  mat.colorNode = Fn(() => {
    // dither IN beyond the impostor mid-band
    Discard(
      smoothstep(FADE_IN - FADE_BAND, FADE_IN + FADE_BAND, distV).lessThanEqual(
        interleavedGradientNoise(screenCoordinate.xy),
      ),
    );
    return albedo;
  })();
  mat.emissiveNode = grassTranslucency(albedo, float(0.5)).mul(0.5);
  mat.roughness = 0.85;
  mat.metalness = 0;

  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
