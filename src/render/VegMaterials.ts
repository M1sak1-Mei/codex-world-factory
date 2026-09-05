/**
 * Vegetation materials (v1: structure-review shading; TexSynth bark/leaf
 * detail + translucency land with the texture milestone).
 *
 * All vegetation geometry carries a `vdata` vec4 attribute:
 *   x hue jitter (−1..1) · y sway flexibility · z sway phase · w baked AO.
 * Hue/AO are consumed here; sway feeds the Phase-6 wind field.
 */

import { Color, DoubleSide, type DirectionalLight, type Texture, Vector3 } from 'three';
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  bumpMap,
  cameraPosition,
  clamp,
  float,
  mix,
  normalMap,
  normalWorld,
  parallaxUV,
  positionWorld,
  smoothstep,
  texture,
  uv,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { fbm3, valueNoise3 } from '../gpu/noise/NoiseTSL';
import type { NF, NV3, NV4 } from '../gpu/TSLTypes';
import { applyCaustics } from './Caustics';
import { runiform } from '../gpu/RenderUniform';
import type { BarkPbrProfile, LeafPbrProfile } from '../vegetation/VegetationProfiles';
import type { SeasonalFoliageStyle } from '../vegetation/Seasons';
import { foliageAtlasAppearance } from '../vegetation/FoliageCards';

/**
 * Shared sun uniforms for the foliage translucency term (D-2). Updated by
 * the scene on init + time-of-day changes.
 */
export const sunU = {
  dir: runiform(new Vector3(0, 1, 0)),
  color: runiform(new Color(1, 1, 1)),
  intensity: runiform(0),
};

export function updateSunUniforms(sun: DirectionalLight): void {
  sunU.dir.value.copy(sun.position).normalize();
  sunU.color.value.copy(sun.color);
  sunU.intensity.value = sun.intensity;
}

/**
 * Back-lit transmission glow: light through the blade toward a camera that
 * faces the sun. Thin-surface approximation; modest k since it is not
 * shadow-gated yet (full gating with Phase-5/6 light queries).
 */
function translucency(albedo: NV3, k: number): NV3 {
  const viewDir = positionWorld.sub(cameraPosition).normalize();
  const toward = clamp(viewDir.dot(vec3(sunU.dir).negate()), 0, 1);
  const glow = toward.pow(5).mul(sunU.intensity).mul(k);
  const sunCol = sunU.color as unknown as NV3;
  return albedo.mul(sunCol).mul(glow).mul(vec3(0.9, 1.05, 0.55));
}

/** grass variant: transmission strengthens toward the blade tip */
export function grassTranslucency(albedo: NV3, tipT: NF): NV3 {
  return translucency(albedo, 0.09).mul(tipT);
}

function vdata(): NV4 {
  return attribute('vdata', 'vec4') as unknown as NV4;
}

/** hue jitter: rotate albedo toward yellow (+) / blue-green (−) */
function hueShift(base: NV3, hue: NF, amount: number): NV3 {
  const k = hue.mul(amount);
  const warm = vec3(1.18, 1.0, 0.55);
  const cool = vec3(0.7, 0.95, 1.25);
  const shifted = base
    .mul(warm)
    .mul(clamp(k, 0, 1))
    .add(base.mul(cool).mul(clamp(k.negate(), 0, 1)))
    .add(base.mul(float(1).sub(k.abs())));
  return shifted;
}

export interface BarkMatParams {
  color: { r: number; g: number; b: number };
  roughness?: number;
}

export function barkMaterial(p: BarkMatParams): MeshStandardNodeMaterial {
  const mat = new MeshPhysicalNodeMaterial();
  mat.specularIntensity = 0.45;
  const d = vdata();
  const base = vec3(p.color.r, p.color.g, p.color.b);
  mat.colorNode = hueShift(base, d.x, 0.18).mul(d.w.mul(0.75).add(0.25));
  mat.roughness = p.roughness ?? 0.93;
  mat.metalness = 0;
  return mat;
}

/**
 * Synthesized bark material: tileable albedo/cavity + normal/rough/height.
 * Cavity feeds `aoNode` — AO on indirect light only (DEVIATIONS D-1 close).
 */
export function barkTexturedMaterial(tex: {
  texA: Texture;
  texB: Texture;
}, profile?: BarkPbrProfile): MeshStandardNodeMaterial {
  const mat = new MeshPhysicalNodeMaterial();
  const p = profile ?? {
    parallaxScale: 0,
    parallaxSteps: 0,
    cavityStrength: 0.1,
    normalScale: 1,
    roughnessBias: 0,
    specularIntensity: 0.45,
    clearcoat: 0,
    clearcoatRoughness: 0.9,
  };
  mat.specularIntensity = p.specularIntensity;
  mat.clearcoat = p.clearcoat;
  mat.clearcoatRoughness = p.clearcoatRoughness;
  const d = vdata();
  const baseUv = uv();
  const height0 = texture(tex.texB, baseUv as never).w;
  // Fixed-point relief refinement. Five taps remain limited to hero trees;
  // near trees use three, while mid/far tiers skip the branch entirely.
  let reliefUv = p.parallaxScale > 0
    ? parallaxUV(baseUv, height0.sub(0.5).mul(p.parallaxScale))
    : baseUv;
  for (let step = 1; step < p.parallaxSteps; step++) {
    const heightStep = texture(tex.texB, reliefUv as never).w;
    reliefUv = parallaxUV(baseUv, heightStep.sub(0.5).mul(p.parallaxScale));
  }
  const a = texture(tex.texA, reliefUv as never) as unknown as NV4;
  const b = texture(tex.texB, reliefUv as never) as unknown as NV4;
  const albedo = a.rgb.mul(a.rgb); // sqrt-encoded at bake
  // AO only affects indirect light, so height-derived crevice shading also
  // modulates the base colour. This makes fissures readable under direct sun
  // without painting a fake directional shadow into the texture.
  const plateHeight = smoothstep(0.12, 0.7, b.w);
  const creviceShade = mix(float(1 - p.cavityStrength), float(1), plateHeight);
  mat.colorNode = hueShift(albedo, d.x, 0.14)
    .mul(d.w.mul(0.45).add(0.55))
    .mul(creviceShade);
  mat.normalNode = normalMap(vec3(b.x, b.y, 1), float(p.normalScale));
  mat.aoNode = a.w.mul(mix(float(1 - p.cavityStrength * 0.35), float(1), plateHeight));
  mat.roughnessNode = b.z.add(p.roughnessBias).clamp(0.28, 1);
  mat.metalness = 0;
  // tubes are closed — DoubleSide costs ~nothing and guarantees a trunk can
  // never read hollow regardless of LOD/dither state ("inside-out" report)
  mat.side = DoubleSide;
  return mat;
}

/**
 * Procedural rock shading (no UVs): strata banding from vdata.y, lichen
 * spots + dust on open faces, moss by upness (dressing rule), cavity AO via
 * aoNode. Geometric normals carry the meso detail (displaced mesh).
 */
export function rockMaterial(opts?: {
  moss?: number;
  /** Near-field procedural bump amplitude. */
  microRelief?: number;
  /** Damp stone sheen; deliberately capped below a polished clear coat. */
  wetness?: number;
  /** base albedo of the lit rock — talus must match the pale cliff that
   *  shed it; the default dark tone is for mossy forest boulders */
  tone?: { r: number; g: number; b: number };
}): MeshStandardNodeMaterial {
  const mat = new MeshPhysicalNodeMaterial();
  const wetness = Math.min(0.32, Math.max(0, opts?.wetness ?? 0.06));
  mat.specularIntensity = 0.34 + wetness * 0.24;
  mat.clearcoat = wetness * 0.16;
  mat.clearcoatRoughness = 0.74;
  const d = vdata();
  const wp = positionWorld;
  const strataT = d.y;
  const upness = normalWorld.y.max(0);
  // band tint: alternating warm/cool sediment layers + grain
  const bandTint = valueNoise3(vec3(float(0), strataT.mul(7.3), float(0)).add(wp.mul(0.02)));
  const grain = fbm3(wp.mul(2.1), 3).mul(0.5).add(0.5);
  // mid-gray default: the old near-black tone (0.21/0.165/0.12 peak) was
  // darker than ANY ground splat — boulders read as alien dark blobs on
  // pale dry soil (user feedback). Moss + canopy shade still darken
  // forest rocks; lit field rock is mid-gray in every reference.
  const tone = opts?.tone ?? { r: 0.285, g: 0.255, b: 0.215 };
  let albedo = mix(
    vec3(tone.r * 0.42, tone.g * 0.44, tone.b * 0.55),
    vec3(tone.r, tone.g, tone.b),
    bandTint.mul(0.55).add(grain.mul(0.45)).clamp(0, 1),
  ) as unknown as NV3;
  // pale lichen patches on exposed faces
  const lich = smoothstep(0.62, 0.78, valueNoise3(wp.mul(3.7)))
    .mul(d.z.mul(0.7).add(0.3));
  albedo = mix(albedo, vec3(0.16, 0.175, 0.14), lich.mul(0.55)) as unknown as NV3;
  // dust settles on up-faces
  albedo = mix(albedo, vec3(0.17, 0.15, 0.12), upness.pow(2).mul(0.3)) as unknown as NV3;
  // dirt streaks bleeding down steep faces (dressing rule)
  const steep = float(1).sub(upness);
  const streakN = valueNoise3(vec3(wp.x.mul(2.6), wp.y.mul(0.22), wp.z.mul(2.6)));
  const streak = smoothstep(0.55, 0.82, streakN)
    .mul(smoothstep(0.45, 0.8, steep))
    .mul(0.55);
  albedo = mix(albedo, albedo.mul(vec3(0.5, 0.46, 0.4)), streak) as unknown as NV3;
  const mossAmt = opts?.moss ?? 0.25;
  if (mossAmt > 0) {
    const mossN = smoothstep(0.45, 0.75, fbm3(wp.mul(1.7), 3).mul(0.5).add(0.5));
    const moss = smoothstep(0.45, 0.85, upness)
      .mul(mossN).mul(d.w).mul(mossAmt * 2).clamp(0, 1);
    albedo = mix(albedo, vec3(0.045, 0.085, 0.03), moss) as unknown as NV3;
    mat.roughnessNode = mix(float(0.93), float(1), moss).sub(lich.mul(0.06));
  } else {
    mat.roughnessNode = float(0.93).sub(lich.mul(0.06));
  }
  mat.colorNode = albedo.mul(d.w.mul(0.35).add(0.65));
  mat.aoNode = d.w;
  const rockGrain = fbm3(wp.mul(7.5), 4).mul(0.5).add(0.5);
  const mineralPits = smoothstep(0.7, 0.86, valueNoise3(wp.mul(19))).mul(-0.28);
  mat.normalNode = bumpMap(
    rockGrain.add(mineralPits),
    float(opts?.microRelief ?? 0.18),
  );
  mat.metalness = 0;
  // submerged boulders / streambed cobbles dance with the water caustics
  applyCaustics(mat);
  return mat;
}

/** deadfall wood: bark textures + moss carpet on the up-side by vdata.z */
export function deadwoodMaterial(
  tex: {
    texA: Texture;
    texB: Texture;
  },
  /** albedo multiplier — branches use the pale snag bark and blow out white
   *  at noon without a dry-wood darkening */
  dim?: { r: number; g: number; b: number },
  profile?: BarkPbrProfile,
): MeshStandardNodeMaterial {
  const mat = new MeshPhysicalNodeMaterial();
  const p = profile ?? {
    parallaxScale: 0.018, parallaxSteps: 2, cavityStrength: 0.28,
    normalScale: 1.25, roughnessBias: 0.04, specularIntensity: 0.32,
    clearcoat: 0, clearcoatRoughness: 0.9,
  };
  mat.specularIntensity = p.specularIntensity;
  mat.clearcoat = p.clearcoat;
  mat.clearcoatRoughness = p.clearcoatRoughness;
  const d = vdata();
  const baseUv = uv();
  const height0 = texture(tex.texB, baseUv as never).w;
  let reliefUv = p.parallaxScale > 0
    ? parallaxUV(baseUv, height0.sub(0.5).mul(p.parallaxScale))
    : baseUv;
  for (let step = 1; step < p.parallaxSteps; step++) {
    const heightStep = texture(tex.texB, reliefUv as never).w;
    reliefUv = parallaxUV(baseUv, heightStep.sub(0.5).mul(p.parallaxScale));
  }
  const a = texture(tex.texA, reliefUv as never) as unknown as NV4;
  const b = texture(tex.texB, reliefUv as never) as unknown as NV4;
  let albedo = a.rgb.mul(a.rgb) as unknown as NV3;
  if (dim) albedo = albedo.mul(vec3(dim.r, dim.g, dim.b)) as unknown as NV3;
  const mossN = smoothstep(0.24, 0.58, fbm3(positionWorld.mul(2.6), 3).mul(0.5).add(0.5));
  const moss = smoothstep(0.05, 0.65, normalWorld.y).mul(d.z).mul(mossN).clamp(0, 1);
  albedo = mix(albedo, vec3(0.05, 0.1, 0.032), moss) as unknown as NV3;
  // rot darkening for heavily decayed wood
  albedo = albedo.mul(float(1).sub(d.z.mul(0.25))) as unknown as NV3;
  const plateHeight = smoothstep(0.1, 0.68, b.w);
  const creviceShade = mix(float(1 - p.cavityStrength), float(1), plateHeight);
  mat.colorNode = hueShift(albedo, d.x, 0.1).mul(creviceShade);
  // logs lying across streams sit in the caustic band
  applyCaustics(mat);
  mat.normalNode = normalMap(vec3(b.x, b.y, 1), float(p.normalScale));
  mat.aoNode = a.w.mul(mix(float(0.8), float(1), plateHeight));
  mat.roughnessNode = mix(
    b.z.add(p.roughnessBias).clamp(0.3, 1),
    float(1),
    moss,
  );
  mat.metalness = 0;
  // same crossfade insurance as bark: a dither hole in a FrontSide closed
  // tube shows clean through (interior wall is a back face)
  mat.side = DoubleSide;
  return mat;
}

/**
 * Flower shading by vdata.x part id: 0 stem/leaf, 0.5 flower center, 1 petal.
 */
export function flowerMaterial(petal: {
  r: number;
  g: number;
  b: number;
}): MeshStandardNodeMaterial {
  const mat = new MeshPhysicalNodeMaterial();
  mat.specularIntensity = 0.34;
  mat.clearcoat = 0.055;
  mat.clearcoatRoughness = 0.58;
  const d = vdata();
  const stem = vec3(0.045, 0.1, 0.03);
  const center = vec3(0.5, 0.32, 0.045);
  const petalC = vec3(petal.r, petal.g, petal.b);
  const centerK = smoothstep(0.12, 0.02, d.x.sub(0.5).abs());
  const petalK = smoothstep(0.85, 0.95, d.x);
  let albedo = mix(stem, center, centerK) as unknown as NV3;
  albedo = mix(albedo, petalC, petalK) as unknown as NV3;
  mat.colorNode = albedo.mul(d.w.mul(0.5).add(0.5));
  mat.emissiveNode = translucency(albedo, 0.035).mul(petalK);
  const fuv = uv();
  const petalVeins = float(1).sub(
    fuv.y.mul(35).add(fuv.x.sub(0.5).abs().mul(18)).sin().abs(),
  ).pow(8).mul(petalK);
  mat.normalNode = bumpMap(petalVeins, float(0.16));
  mat.roughnessNode = mix(float(0.82), float(0.66), petalK);
  mat.metalness = 0;
  mat.side = DoubleSide;
  return mat;
}

/** mushroom shading by vdata.x part id: 0 stem, 0.5 gills, 1 cap */
export function mushroomMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshPhysicalNodeMaterial();
  mat.specularIntensity = 0.32;
  mat.clearcoat = 0.035;
  mat.clearcoatRoughness = 0.66;
  const d = vdata();
  const stem = vec3(0.32, 0.29, 0.24);
  const gills = vec3(0.42, 0.37, 0.28);
  const cap = vec3(0.23, 0.12, 0.05);
  const gillK = smoothstep(0.12, 0.02, d.x.sub(0.5).abs());
  const capK = smoothstep(0.85, 0.95, d.x);
  let albedo = mix(stem, gills, gillK) as unknown as NV3;
  albedo = mix(albedo, cap, capK) as unknown as NV3;
  mat.colorNode = albedo.mul(d.w);
  const muv = uv();
  const gillRibs = float(1).sub(muv.x.mul(58).sin().abs()).pow(9).mul(gillK);
  const capPores = fbm3(positionWorld.mul(42), 3).mul(0.5).add(0.5).mul(capK);
  mat.normalNode = bumpMap(gillRibs.mul(0.65).add(capPores.mul(0.22)), float(0.14));
  mat.roughnessNode = mix(float(0.76), float(0.58), capK);
  mat.metalness = 0;
  return mat;
}

/** Waxy ribbed cactus skin; vdata.x > .8 marks flower petals. */
export function cactusMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshPhysicalNodeMaterial();
  const d = vdata();
  const cuv = uv();
  const flower = smoothstep(0.82, 0.96, d.x);
  const body = hueShift(vec3(0.058, 0.19, 0.082), d.x, 0.22)
    .mul(d.w.mul(0.72).add(0.28));
  const petal = mix(vec3(0.72, 0.09, 0.2), vec3(1, 0.55, 0.08), cuv.y);
  mat.colorNode = mix(body, petal, flower);
  const ribs = cuv.x.mul(Math.PI * 2).cos().abs().pow(7);
  const skinCells = valueNoise3(positionWorld.mul(21)).mul(0.5).add(0.5);
  const spinePores = valueNoise3(positionWorld.mul(46)).greaterThan(0.72).select(float(1), float(0));
  mat.normalNode = bumpMap(
    ribs.mul(0.74).add(skinCells.mul(0.18)).add(spinePores.mul(0.2)),
    mix(float(0.16), float(0.04), flower),
  );
  mat.roughnessNode = mix(float(0.57), float(0.7), flower);
  mat.specularIntensity = 0.46;
  mat.clearcoat = 0.11;
  mat.clearcoatRoughness = 0.48;
  mat.metalness = 0;
  mat.side = DoubleSide;
  return mat;
}

export interface FoliageMatParams {
  color: { r: number; g: number; b: number; hueVar: number };
}

export function foliageMaterial(
  p: FoliageMatParams,
  surface?: LeafPbrProfile,
  season?: SeasonalFoliageStyle,
): MeshStandardNodeMaterial {
  // Physical variant for specularIntensity: white dielectric F0 0.04 at
  // glancing sun desaturates sunlit leaves to SILVER (user) — real leaves
  // read color-first; translucency + diffuse carry the lit look
  const mat = new MeshPhysicalNodeMaterial();
  const pbr = surface ?? {
    roughness: 0.8,
    specularIntensity: 0.3,
    clearcoat: 0,
    clearcoatRoughness: 0.75,
    transmission: 0.032,
    veinNormal: 0,
  };
  mat.specularIntensity = pbr.specularIntensity;
  mat.clearcoat = pbr.clearcoat;
  mat.clearcoatRoughness = pbr.clearcoatRoughness;
  const d = vdata();
  const seasonalTint = season?.tint ?? [1, 1, 1];
  const base = vec3(p.color.r, p.color.g, p.color.b).mul(
    vec3(seasonalTint[0], seasonalTint[1], seasonalTint[2]),
  );
  const tinted = hueShift(base, d.x, p.color.hueVar).mul(d.w.mul(0.8).add(0.2));
  // vertex-stage hoist: hue/age are flat per leaf, glow smooth at leaf scale
  mat.colorNode = varying(
    tinted as unknown as Parameters<typeof varying>[0],
  ) as unknown as typeof mat.colorNode;
  mat.emissiveNode = varying(
    translucency(
      tinted as unknown as NV3,
      pbr.transmission * (season?.transmissionScale ?? 1),
    ) as unknown as Parameters<typeof varying>[0],
  ) as unknown as typeof mat.emissiveNode;
  if (season && season.coverage < 0.999) {
    // vdata.z is constant per generated leaf, so this removes whole leaves
    // with a stable hash instead of creating fragment-level stipple.
    const keep = d.z.mul(12.9898).sin().mul(43758.5453).fract()
      .lessThan(season.coverage);
    mat.opacityNode = keep.select(float(1), float(0));
    mat.alphaTest = 0.5;
  }
  if (pbr.veinNormal > 0) {
    const luv = uv();
    const side = luv.x.sub(0.5).abs();
    const bladeMask = smoothstep(0.5, 0.42, side).mul(smoothstep(0.02, 0.11, side));
    const midrib = smoothstep(0.07, 0.008, side).mul(smoothstep(0.02, 0.1, luv.y));
    const primaryVeins = float(1).sub(
      luv.y.mul(43).add(side.mul(22)).sin().abs(),
    ).pow(7).mul(bladeMask).mul(0.52);
    const secondaryVeins = float(1).sub(
      luv.y.mul(91).sub(side.mul(37)).sin().abs(),
    ).pow(11).mul(bladeMask).mul(0.15);
    const cellularRipple = luv.x.mul(71).add(luv.y.mul(83)).sin().mul(0.025);
    mat.normalNode = bumpMap(
      midrib.mul(1.25).add(primaryVeins).add(secondaryVeins).add(cellularRipple),
      float(pbr.veinNormal),
    );
  }
  mat.roughness = Math.min(1, Math.max(0, pbr.roughness + (season?.roughnessBias ?? 0)));
  mat.metalness = 0;
  mat.side = DoubleSide;
  return mat;
}

/** captured cluster-card material: sqrt-decoded atlas albedo, alpha-tested */
export function foliageCardMaterial(
  atlas: Texture,
  p: FoliageMatParams,
  surface?: LeafPbrProfile,
): MeshStandardNodeMaterial {
  const mat = new MeshPhysicalNodeMaterial();
  const pbr = surface;
  const appearance = foliageAtlasAppearance(atlas);
  // Legacy RGBA-only atlases keep the original diffuse-safe response.
  mat.specularIntensity = Math.min(appearance ? 0.3 : 0.22, pbr?.specularIntensity ?? 0.18);
  mat.clearcoat = Math.min(appearance ? 0.035 : 0.018, pbr?.clearcoat ?? 0);
  mat.clearcoatRoughness = pbr?.clearcoatRoughness ?? 0.8;
  const d = vdata();
  const t = texture(atlas, uv() as never) as unknown as NV4;
  const albedo = t.rgb.mul(t.rgb); // sqrt-encoded at capture
  if (appearance) {
    const packed = texture(appearance.surface, uv() as never) as unknown as NV4;
    const xy = packed.xy.mul(2).sub(1);
    const nz = float(1).sub(xy.dot(xy)).max(0.02).sqrt();
    // Preserve the captured leaf-to-leaf normal changes. A bounded tilt
    // avoids grazing needles turning into glitter; no extra mesh leaves.
    mat.normalNode = normalMap(vec3(packed.xy, nz.mul(0.5).add(0.5)), vec2(0.68));
    mat.roughnessNode = packed.z.clamp(0.62, 0.96);
    mat.aoNode = packed.w.mul(0.18).add(0.82);
  }
  // vertex-stage hoist (Phase 7 perf): hueShift is LINEAR in its base color
  // (per-channel factor) and vdata is flat per card — fold hue + age into
  // one varying factor and multiply the atlas read by it per fragment.
  // Translucency glow likewise (view/sun terms are smooth at card scale).
  const tintF = varying(
    hueShift(vec3(1, 1, 1), d.x, p.color.hueVar * 0.8).mul(
      d.w.mul(0.75).add(0.25),
    ) as unknown as Parameters<typeof varying>[0],
  ) as unknown as NV3;
  mat.colorNode = albedo.mul(tintF);
  mat.emissiveNode = albedo.mul(
    varying(
      // Retention is baked into atlas coverage, while transmission follows
      // the same seasonal profile as real leaves. Local AO tempers the
      // emissive approximation; this is not a substitute for shadow queries.
      translucency(
        tintF,
        Math.max(0.025, pbr?.transmission ?? 0.045) * (appearance?.season?.transmissionScale ?? 1),
      ).mul(d.w.mul(0.5).add(0.5)) as unknown as Parameters<typeof varying>[0],
    ) as unknown as NV3,
  );
  // edge-on fade: a card whose plane is parallel to the view ray shows as a
  // bare dark sheet at close range (DELTA #5 — they read as floating slabs).
  // Fade those out within ~70 m; cross-plane cards keep crown coverage via
  // their perpendicular plane, and beyond 70 m a card is a few px anyway.
  // (flat card normal + ≤2 m extent → vertex eval is identical)
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const ndv = normalWorld.normalize().dot(viewDir).abs();
  const camDist = positionWorld.sub(cameraPosition).length();
  const edgeFade = varying(
    mix(
      smoothstep(0.06, 0.2, ndv),
      float(1),
      smoothstep(35, 70, camDist),
    ) as unknown as Parameters<typeof varying>[0],
  ) as unknown as NF;
  mat.opacityNode = t.w.mul(edgeFade);
  mat.alphaTest = 0.32;
  // RGBA-only callers have no surface atlas and retain near-diffuse shading.
  mat.roughness = 0.92;
  mat.metalness = 0;
  mat.side = DoubleSide;
  return mat;
}
