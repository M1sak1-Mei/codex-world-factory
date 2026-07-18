/**
 * Art-directable terrain recipes built from anisotropic Gaussian stamps.
 *
 * A stamp is deliberately a small data object rather than shader code. This
 * keeps scene variants reviewable, serializable, and deterministic while the
 * existing macro terrain, erosion, hydrology, and biome passes remain the
 * single world-generation pipeline.
 */

import type { WorldSeed } from '../core/Seed';

export const TERRAIN_RECIPE_IDS = [
  'laas',
  'folded-ranges',
  'rift-valley',
  'caldera-lake',
] as const;

export type TerrainRecipeId = (typeof TERRAIN_RECIPE_IDS)[number];

export interface GaussianStampSpec {
  /** Stable identifier used to derive an independent random stream. */
  id: string;
  /** World-space x/z center in meters. */
  center: readonly [number, number];
  /** One-standard-deviation radius along the local x/z axes, in meters. */
  sigma: readonly [number, number];
  /** Counter-clockwise local-axis rotation, in radians. */
  rotation: number;
  /** Signed height contribution at the center, in meters. */
  amplitude: number;
  /** Gaussian exponent multiplier; >1 tightens, <1 broadens the stamp. */
  sharpness: number;
  /** Signed erosion-hardness contribution at the center. */
  hardness: number;
  /** Maximum seed-driven center displacement, in meters. */
  centerJitter?: number;
  /** Maximum seed-driven rotation displacement, in radians. */
  rotationJitter?: number;
  /** Seed-driven relative amplitude range; 0.1 means +/-10%. */
  amplitudeJitter?: number;
}

export interface GaussianStamp {
  id: string;
  center: [number, number];
  sigma: [number, number];
  rotation: number;
  amplitude: number;
  sharpness: number;
  hardness: number;
}

export interface TerrainRecipe {
  id: TerrainRecipeId;
  label: string;
  description: string;
  stamps: readonly GaussianStampSpec[];
}

const LAAS: TerrainRecipe = {
  id: 'laas',
  label: 'LAAS original',
  description: 'The original hand-composed massif, karst plateau, valley, and lake.',
  stamps: [],
};

const FOLDED_RANGES: TerrainRecipe = {
  id: 'folded-ranges',
  label: 'Folded ranges',
  description: 'Three long, offset mountain folds create layered horizons and sheltered valleys.',
  stamps: [
    {
      id: 'north-fold',
      center: [360, -1050],
      sigma: [1500, 230],
      rotation: -0.72,
      amplitude: 420,
      sharpness: 0.9,
      hardness: 0.2,
      centerJitter: 110,
      rotationJitter: 0.12,
      amplitudeJitter: 0.12,
    },
    {
      id: 'middle-fold',
      center: [-140, -20],
      sigma: [1350, 210],
      rotation: -0.66,
      amplitude: 300,
      sharpness: 1.05,
      hardness: 0.16,
      centerJitter: 130,
      rotationJitter: 0.1,
      amplitudeJitter: 0.14,
    },
    {
      id: 'south-fold',
      center: [-520, 980],
      sigma: [1250, 260],
      rotation: -0.78,
      amplitude: 250,
      sharpness: 0.9,
      hardness: 0.12,
      centerJitter: 140,
      rotationJitter: 0.12,
      amplitudeJitter: 0.16,
    },
  ],
};

const RIFT_VALLEY: TerrainRecipe = {
  id: 'rift-valley',
  label: 'Rift valley',
  description: 'A broad diagonal rift with hard shoulders reinforces the designed drainage spine.',
  stamps: [
    {
      id: 'rift-floor',
      center: [0, 0],
      sigma: [1750, 250],
      rotation: 2.35,
      amplitude: -105,
      sharpness: 0.85,
      hardness: -0.12,
      centerJitter: 70,
      rotationJitter: 0.06,
      amplitudeJitter: 0.1,
    },
    {
      id: 'east-shoulder',
      center: [430, 430],
      sigma: [1600, 240],
      rotation: 2.35,
      amplitude: 260,
      sharpness: 1.0,
      hardness: 0.2,
      centerJitter: 90,
      rotationJitter: 0.08,
      amplitudeJitter: 0.12,
    },
    {
      id: 'west-shoulder',
      center: [-430, -430],
      sigma: [1600, 240],
      rotation: 2.35,
      amplitude: 230,
      sharpness: 1.0,
      hardness: 0.18,
      centerJitter: 90,
      rotationJitter: 0.08,
      amplitudeJitter: 0.12,
    },
  ],
};

const CALDERA_LAKE: TerrainRecipe = {
  id: 'caldera-lake',
  label: 'Caldera lake',
  description: 'Nested positive and negative Gaussians form a breached caldera above the main outlet.',
  stamps: [
    {
      id: 'caldera-mass',
      center: [260, 160],
      sigma: [960, 880],
      rotation: 0.2,
      amplitude: 600,
      sharpness: 0.78,
      hardness: 0.2,
      centerJitter: 90,
      rotationJitter: 0.2,
      amplitudeJitter: 0.1,
    },
    {
      id: 'caldera-bowl',
      center: [260, 160],
      sigma: [420, 380],
      rotation: 0.2,
      amplitude: -520,
      sharpness: 1.0,
      hardness: -0.2,
      centerJitter: 45,
      rotationJitter: 0.12,
      amplitudeJitter: 0.08,
    },
    {
      id: 'southwest-breach',
      center: [-230, 650],
      sigma: [980, 120],
      rotation: 2.35,
      amplitude: -170,
      sharpness: 1.0,
      hardness: -0.14,
      centerJitter: 55,
      rotationJitter: 0.07,
      amplitudeJitter: 0.1,
    },
  ],
};

const RECIPES: Readonly<Record<TerrainRecipeId, TerrainRecipe>> = {
  laas: LAAS,
  'folded-ranges': FOLDED_RANGES,
  'rift-valley': RIFT_VALLEY,
  'caldera-lake': CALDERA_LAKE,
};

export function isTerrainRecipeId(value: string): value is TerrainRecipeId {
  return (TERRAIN_RECIPE_IDS as readonly string[]).includes(value);
}

export function parseTerrainRecipeId(value: string | null): TerrainRecipeId {
  return value !== null && isTerrainRecipeId(value) ? value : 'laas';
}

export function terrainRecipe(id: TerrainRecipeId): TerrainRecipe {
  return RECIPES[id];
}

/** Resolve the recipe's bounded jitter without coupling any stamp to another. */
export function resolveGaussianStamps(
  seed: WorldSeed,
  recipeId: TerrainRecipeId,
): GaussianStamp[] {
  return terrainRecipe(recipeId).stamps.map((spec) => {
    const rng = seed.rng(`terrain-recipe/${recipeId}/${spec.id}`);
    const centerJitter = spec.centerJitter ?? 0;
    const rotationJitter = spec.rotationJitter ?? 0;
    const amplitudeJitter = spec.amplitudeJitter ?? 0;
    return {
      id: spec.id,
      center: [
        spec.center[0] + rng.range(-centerJitter, centerJitter),
        spec.center[1] + rng.range(-centerJitter, centerJitter),
      ],
      sigma: [spec.sigma[0], spec.sigma[1]],
      rotation: spec.rotation + rng.range(-rotationJitter, rotationJitter),
      amplitude: spec.amplitude * (1 + rng.range(-amplitudeJitter, amplitudeJitter)),
      sharpness: spec.sharpness,
      hardness: spec.hardness,
    };
  });
}
