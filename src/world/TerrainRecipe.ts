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
  'canyon-badlands',
  'dune-oasis',
  'coastal-islands',
  'karst-sinklands',
  'volcanic-highlands',
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

const CANYON_BADLANDS: TerrainRecipe = {
  id: 'canyon-badlands',
  label: 'Canyon badlands',
  description: 'Hard tablelands are cut by a branching canyon and separated into dry benches.',
  foundation: {
    alpineMassif: 0,
    karstPlateau: 0.12,
    lakeBasin: 0,
    mainValley: 0.18,
    tributary: 0.34,
    outerRanges: 0.42,
  },
  stamps: [
    {
      id: 'north-tableland', center: [-460, -720], sigma: [1180, 610], rotation: 0.18,
      amplitude: 330, sharpness: 1.55, hardness: 0.36,
      centerJitter: 100, rotationJitter: 0.1, amplitudeJitter: 0.12,
    },
    {
      id: 'south-tableland', center: [460, 720], sigma: [1150, 570], rotation: 0.2,
      amplitude: 285, sharpness: 1.5, hardness: 0.32,
      centerJitter: 105, rotationJitter: 0.1, amplitudeJitter: 0.13,
    },
    {
      id: 'trunk-canyon', center: [0, 0], sigma: [1680, 145], rotation: 0.82,
      amplitude: -285, sharpness: 1.28, hardness: -0.3,
      centerJitter: 55, rotationJitter: 0.05, amplitudeJitter: 0.1,
    },
    {
      id: 'branch-canyon', center: [-280, 120], sigma: [940, 105], rotation: -0.58,
      amplitude: -150, sharpness: 1.2, hardness: -0.2,
      centerJitter: 60, rotationJitter: 0.08, amplitudeJitter: 0.12,
    },
  ],
};

const DUNE_OASIS: TerrainRecipe = {
  id: 'dune-oasis',
  label: 'Dune sea and oasis',
  description: 'Parallel dune swells wrap a sheltered interdune oasis basin.',
  foundation: {
    alpineMassif: 0,
    karstPlateau: 0,
    lakeBasin: 0.08,
    mainValley: 0.04,
    tributary: 0,
    outerRanges: 0.08,
  },
  stamps: [
    {
      id: 'west-dune', center: [-980, -130], sigma: [920, 150], rotation: -0.3,
      amplitude: 92, sharpness: 1.18, hardness: -0.18,
      centerJitter: 130, rotationJitter: 0.12, amplitudeJitter: 0.2,
    },
    {
      id: 'middle-dune', center: [-130, -330], sigma: [1080, 170], rotation: -0.24,
      amplitude: 118, sharpness: 1.12, hardness: -0.2,
      centerJitter: 150, rotationJitter: 0.1, amplitudeJitter: 0.2,
    },
    {
      id: 'east-dune', center: [930, 160], sigma: [1050, 180], rotation: -0.34,
      amplitude: 104, sharpness: 1.15, hardness: -0.18,
      centerJitter: 150, rotationJitter: 0.12, amplitudeJitter: 0.2,
    },
    {
      id: 'oasis-bowl', center: [140, 260], sigma: [420, 350], rotation: 0.1,
      amplitude: -88, sharpness: 0.94, hardness: -0.2,
      centerJitter: 65, rotationJitter: 0.12, amplitudeJitter: 0.1,
    },
  ],
};

const COASTAL_ISLANDS: TerrainRecipe = {
  id: 'coastal-islands',
  label: 'Coastal islands',
  description: 'A drowned lowland leaves a hooked main island, outer islets, and broad tidal channels.',
  foundation: {
    alpineMassif: 0,
    karstPlateau: 0,
    lakeBasin: 0.72,
    mainValley: 0.24,
    tributary: 0.12,
    outerRanges: 0.06,
  },
  stamps: [
    {
      id: 'main-island', center: [-260, -100], sigma: [980, 590], rotation: 0.52,
      amplitude: 210, sharpness: 1.05, hardness: 0.08,
      centerJitter: 90, rotationJitter: 0.12, amplitudeJitter: 0.12,
    },
    {
      id: 'north-islet', center: [920, -840], sigma: [390, 280], rotation: -0.25,
      amplitude: 155, sharpness: 1.25, hardness: 0.1,
      centerJitter: 80, rotationJitter: 0.2, amplitudeJitter: 0.15,
    },
    {
      id: 'south-islet', center: [880, 820], sigma: [470, 300], rotation: 0.35,
      amplitude: 138, sharpness: 1.18, hardness: 0.08,
      centerJitter: 85, rotationJitter: 0.2, amplitudeJitter: 0.16,
    },
    {
      id: 'tidal-channel', center: [380, 20], sigma: [1380, 135], rotation: 1.45,
      amplitude: -130, sharpness: 1.12, hardness: -0.2,
      centerJitter: 55, rotationJitter: 0.06, amplitudeJitter: 0.1,
    },
  ],
};

const KARST_SINKLANDS: TerrainRecipe = {
  id: 'karst-sinklands',
  label: 'Karst sinklands',
  description: 'Limestone towers surround overlapping sinkholes and a winding enclosed basin.',
  foundation: {
    alpineMassif: 0,
    karstPlateau: 0.78,
    lakeBasin: 0.18,
    mainValley: 0.18,
    tributary: 0.08,
    outerRanges: 0.3,
  },
  stamps: [
    {
      id: 'west-tower', center: [-820, -260], sigma: [330, 290], rotation: 0.15,
      amplitude: 340, sharpness: 1.72, hardness: 0.35,
      centerJitter: 90, rotationJitter: 0.25, amplitudeJitter: 0.15,
    },
    {
      id: 'east-tower', center: [720, -540], sigma: [360, 300], rotation: -0.1,
      amplitude: 390, sharpness: 1.8, hardness: 0.38,
      centerJitter: 85, rotationJitter: 0.22, amplitudeJitter: 0.14,
    },
    {
      id: 'south-tower', center: [380, 850], sigma: [420, 340], rotation: 0.28,
      amplitude: 315, sharpness: 1.62, hardness: 0.3,
      centerJitter: 90, rotationJitter: 0.25, amplitudeJitter: 0.15,
    },
    {
      id: 'main-sink', center: [-60, 80], sigma: [520, 430], rotation: 0,
      amplitude: -205, sharpness: 1.3, hardness: -0.28,
      centerJitter: 55, rotationJitter: 0.1, amplitudeJitter: 0.1,
    },
    {
      id: 'north-sink', center: [-120, -920], sigma: [330, 280], rotation: 0.1,
      amplitude: -135, sharpness: 1.45, hardness: -0.22,
      centerJitter: 55, rotationJitter: 0.14, amplitudeJitter: 0.12,
    },
  ],
};

const VOLCANIC_HIGHLANDS: TerrainRecipe = {
  id: 'volcanic-highlands',
  label: 'Volcanic highlands',
  description: 'A high shield volcano, nested crater, parasitic cone, and lava-cut breach dominate the horizon.',
  foundation: {
    alpineMassif: 0.08,
    karstPlateau: 0,
    lakeBasin: 0.08,
    mainValley: 0.12,
    tributary: 0,
    outerRanges: 0.52,
  },
  stamps: [
    {
      id: 'shield', center: [60, -80], sigma: [1180, 1040], rotation: 0.18,
      amplitude: 720, sharpness: 0.7, hardness: 0.28,
      centerJitter: 85, rotationJitter: 0.14, amplitudeJitter: 0.1,
    },
    {
      id: 'summit-crater', center: [60, -80], sigma: [310, 280], rotation: 0.18,
      amplitude: -410, sharpness: 1.22, hardness: -0.26,
      centerJitter: 35, rotationJitter: 0.1, amplitudeJitter: 0.08,
    },
    {
      id: 'parasitic-cone', center: [-940, 620], sigma: [360, 330], rotation: 0,
      amplitude: 310, sharpness: 1.5, hardness: 0.3,
      centerJitter: 75, rotationJitter: 0.2, amplitudeJitter: 0.14,
    },
    {
      id: 'lava-breach', center: [410, 520], sigma: [1100, 120], rotation: 2.2,
      amplitude: -155, sharpness: 1.2, hardness: 0.16,
      centerJitter: 45, rotationJitter: 0.06, amplitudeJitter: 0.1,
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
  'canyon-badlands': CANYON_BADLANDS,
  'dune-oasis': DUNE_OASIS,
  'coastal-islands': COASTAL_ISLANDS,
  'karst-sinklands': KARST_SINKLANDS,
  'volcanic-highlands': VOLCANIC_HIGHLANDS,
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
