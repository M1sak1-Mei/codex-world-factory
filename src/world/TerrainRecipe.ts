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
  'rolling-lowlands',
  'basin-country',
  'desert-mesas',
  'glacial-uplands',
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

/**
 * Weights for the original LAAS macro-terrain skeleton. Recipes own these
 * controls so a new composition can replace the fixed massif/karst layout,
 * instead of merely adding Gaussian stamps on top of the same two mountains.
 */
export interface TerrainFoundation {
  alpineMassif: number;
  karstPlateau: number;
  lakeBasin: number;
  mainValley: number;
  tributary: number;
  outerRanges: number;
}

export interface TerrainRecipe {
  id: TerrainRecipeId;
  label: string;
  description: string;
  foundation: Readonly<TerrainFoundation>;
  stamps: readonly GaussianStampSpec[];
}

const ORIGINAL_FOUNDATION: Readonly<TerrainFoundation> = {
  alpineMassif: 1,
  karstPlateau: 1,
  lakeBasin: 1,
  mainValley: 1,
  tributary: 1,
  outerRanges: 1,
};

const LAAS: TerrainRecipe = {
  id: 'laas',
  label: 'LAAS original',
  description: 'The original hand-composed massif, karst plateau, valley, and lake.',
  foundation: ORIGINAL_FOUNDATION,
  stamps: [],
};

const FOLDED_RANGES: TerrainRecipe = {
  id: 'folded-ranges',
  label: 'Folded ranges',
  description: 'Three long, offset mountain folds create layered horizons and sheltered valleys.',
  foundation: {
    alpineMassif: 0.18,
    karstPlateau: 0.08,
    lakeBasin: 0.5,
    mainValley: 0.58,
    tributary: 0.08,
    outerRanges: 0.9,
  },
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
  foundation: {
    alpineMassif: 0.08,
    karstPlateau: 0,
    lakeBasin: 0.12,
    mainValley: 1,
    tributary: 0,
    outerRanges: 0.6,
  },
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
  foundation: {
    alpineMassif: 0,
    karstPlateau: 0,
    lakeBasin: 0.12,
    mainValley: 0.3,
    tributary: 0,
    outerRanges: 0.72,
  },
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

const ROLLING_LOWLANDS: TerrainRecipe = {
  id: 'rolling-lowlands',
  label: 'Rolling lowlands',
  description: 'Long gentle swells, shallow hollows, and open low country for forests and farmland.',
  foundation: {
    alpineMassif: 0,
    karstPlateau: 0,
    lakeBasin: 0.28,
    mainValley: 0.38,
    tributary: 0,
    outerRanges: 0.22,
  },
  stamps: [
    {
      id: 'west-swell', center: [-850, 250], sigma: [1100, 650], rotation: 0.35,
      amplitude: 105, sharpness: 0.72, hardness: -0.04,
      centerJitter: 140, rotationJitter: 0.18, amplitudeJitter: 0.18,
    },
    {
      id: 'east-swell', center: [920, -120], sigma: [1250, 520], rotation: -0.42,
      amplitude: 92, sharpness: 0.78, hardness: -0.03,
      centerJitter: 150, rotationJitter: 0.2, amplitudeJitter: 0.2,
    },
    {
      id: 'central-hollow', center: [60, 260], sigma: [720, 600], rotation: 0,
      amplitude: -58, sharpness: 0.8, hardness: -0.08,
      centerJitter: 100, amplitudeJitter: 0.16,
    },
  ],
};

const BASIN_COUNTRY: TerrainRecipe = {
  id: 'basin-country',
  label: 'Basin country',
  description: 'A broad inhabited basin ringed by asymmetric uplands and drainage saddles.',
  foundation: {
    alpineMassif: 0,
    karstPlateau: 0,
    lakeBasin: 0.2,
    mainValley: 0.3,
    tributary: 0,
    outerRanges: 0.28,
  },
  stamps: [
    {
      id: 'main-basin', center: [80, 120], sigma: [1050, 850], rotation: 0.18,
      amplitude: -145, sharpness: 0.82, hardness: -0.15,
      centerJitter: 90, rotationJitter: 0.1, amplitudeJitter: 0.1,
    },
    {
      id: 'north-rim', center: [-120, -1120], sigma: [1500, 310], rotation: 0.04,
      amplitude: 245, sharpness: 0.92, hardness: 0.14,
      centerJitter: 130, rotationJitter: 0.1, amplitudeJitter: 0.14,
    },
    {
      id: 'east-rim', center: [1260, 280], sigma: [960, 300], rotation: 1.35,
      amplitude: 210, sharpness: 0.95, hardness: 0.12,
      centerJitter: 120, rotationJitter: 0.1, amplitudeJitter: 0.14,
    },
  ],
};

const DESERT_MESAS: TerrainRecipe = {
  id: 'desert-mesas',
  label: 'Desert mesas',
  description: 'Separated hard tablelands rise above a broad dry plain.',
  foundation: {
    alpineMassif: 0,
    karstPlateau: 0,
    lakeBasin: 0,
    mainValley: 0.08,
    tributary: 0,
    outerRanges: 0.38,
  },
  stamps: [
    {
      id: 'west-mesa', center: [-920, 180], sigma: [520, 360], rotation: 0.25,
      amplitude: 315, sharpness: 1.7, hardness: 0.32,
      centerJitter: 120, rotationJitter: 0.2, amplitudeJitter: 0.15,
    },
    {
      id: 'east-mesa', center: [860, -420], sigma: [650, 330], rotation: -0.4,
      amplitude: 360, sharpness: 1.85, hardness: 0.36,
      centerJitter: 130, rotationJitter: 0.2, amplitudeJitter: 0.16,
    },
    {
      id: 'south-butte', center: [220, 1110], sigma: [300, 260], rotation: 0.1,
      amplitude: 270, sharpness: 2.1, hardness: 0.3,
      centerJitter: 90, rotationJitter: 0.3, amplitudeJitter: 0.18,
    },
  ],
};

const GLACIAL_UPLANDS: TerrainRecipe = {
  id: 'glacial-uplands',
  label: 'Glacial uplands',
  description: 'High shoulders and a long scooped trough create a snow-country composition.',
  foundation: {
    alpineMassif: 0.22,
    karstPlateau: 0,
    lakeBasin: 0.22,
    mainValley: 0.72,
    tributary: 0,
    outerRanges: 1,
  },
  stamps: [
    {
      id: 'upland-mass', center: [180, -260], sigma: [1450, 1100], rotation: -0.2,
      amplitude: 430, sharpness: 0.72, hardness: 0.2,
      centerJitter: 120, rotationJitter: 0.12, amplitudeJitter: 0.12,
    },
    {
      id: 'glacial-trough', center: [-180, 80], sigma: [1500, 260], rotation: 2.32,
      amplitude: -240, sharpness: 0.9, hardness: -0.16,
      centerJitter: 80, rotationJitter: 0.06, amplitudeJitter: 0.1,
    },
    {
      id: 'cirque', center: [780, -860], sigma: [430, 390], rotation: 0,
      amplitude: -190, sharpness: 1.25, hardness: -0.12,
      centerJitter: 75, amplitudeJitter: 0.12,
    },
  ],
};

const RECIPES: Readonly<Record<TerrainRecipeId, TerrainRecipe>> = {
  laas: LAAS,
  'folded-ranges': FOLDED_RANGES,
  'rift-valley': RIFT_VALLEY,
  'caldera-lake': CALDERA_LAKE,
  'rolling-lowlands': ROLLING_LOWLANDS,
  'basin-country': BASIN_COUNTRY,
  'desert-mesas': DESERT_MESAS,
  'glacial-uplands': GLACIAL_UPLANDS,
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
