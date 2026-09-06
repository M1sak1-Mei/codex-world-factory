/**
 * Seasonal presentation is deliberately independent from world generation.
 * A season changes foliage colour/retention and canopy light transmission,
 * but never consumes a random stream or changes terrain/scatter placement.
 */

import { TREE_SPECIES } from './Species';
import type { SpeciesParams } from './VegTypes';

export const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'] as const;

export type SeasonId = (typeof SEASON_IDS)[number];

export interface SeasonalFoliageStyle {
  /** Linear multiplier applied to the species' authored base colour. */
  tint: readonly [number, number, number];
  /** Fraction of leaf clusters retained; conifers retain most needles. */
  coverage: number;
  /** Relative subsurface/transmission response for live foliage. */
  transmissionScale: number;
  /** Added roughness for dry or dormant foliage. */
  roughnessBias: number;
}

const SUMMER: SeasonalFoliageStyle = {
  tint: [1, 1, 1],
  coverage: 1,
  transmissionScale: 1,
  roughnessBias: 0,
};

export function isSeasonId(value: string): value is SeasonId {
  return (SEASON_IDS as readonly string[]).includes(value);
}

export function parseSeasonId(value: string | null): SeasonId {
  return value !== null && isSeasonId(value) ? value : 'summer';
}

function autumnTint(id: string): readonly [number, number, number] {
  switch (id) {
    case 'birch': return [5.5, 1.5, 0.12];
    case 'willow': return [5, 1.38, 0.12];
    case 'beech': return [5.1, 1.16, 0.1];
    case 'oak': return [5, 1.26, 0.08];
    case 'karst': return [4.6, 1.08, 0.1];
    case 'hazel': return [4.8, 1.28, 0.14];
    case 'pink-shrub': return [4.4, 1.02, 0.16];
    default: return [4.7, 1.24, 0.14];
  }
}

/** Resolve a deterministic material/canopy style for one plant species. */
export function seasonalFoliageStyle(
  species: Pick<SpeciesParams, 'id' | 'kind'>,
  season: SeasonId,
): SeasonalFoliageStyle {
  if (species.kind === 'snag') return { ...SUMMER, coverage: 0 };
  const conifer = species.kind === 'conifer';
  switch (season) {
    case 'spring':
      return conifer
        ? { tint: [1.05, 1.12, 0.86], coverage: 0.96, transmissionScale: 1.08, roughnessBias: -0.02 }
        : { tint: [1.2, 1.38, 0.62], coverage: 0.76, transmissionScale: 1.2, roughnessBias: -0.04 };
    case 'autumn':
      return conifer
        ? { tint: [1.12, 1.02, 0.78], coverage: 0.96, transmissionScale: 0.9, roughnessBias: 0.03 }
        : { tint: autumnTint(species.id), coverage: 0.86, transmissionScale: 0.72, roughnessBias: 0.09 };
    case 'winter':
      return conifer
        ? { tint: [0.82, 0.96, 1.08], coverage: 0.84, transmissionScale: 0.72, roughnessBias: 0.08 }
        : { tint: [2.35, 0.78, 0.32], coverage: 0, transmissionScale: 0.28, roughnessBias: 0.16 };
    case 'summer':
    default:
      return SUMMER;
  }
}

/** Tree-class ordered crown coverage, consumed by canopy and shadow passes. */
export function treeSeasonCoverages(season: SeasonId): number[] {
  return TREE_SPECIES.map((species) => seasonalFoliageStyle(species, season).coverage);
}
