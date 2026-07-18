export const MAGIC_FOREST_RUINS_RECIPE_IDS = ['ancient-grove'] as const;

export type MagicForestRuinsRecipeId = (typeof MAGIC_FOREST_RUINS_RECIPE_IDS)[number];
export type MagicRuinsSiteKind = 'sanctuary' | 'watch-circle' | 'forest-shrine';

export interface MagicForestRuinsRecipe {
  id: MagicForestRuinsRecipeId;
  siteKinds: readonly MagicRuinsSiteKind[];
  minAltitude: number;
  maxAltitude: number;
  maxSlope: number;
  maxRelief: number;
  minSpacing: number;
}

export const ANCIENT_GROVE_RECIPE: MagicForestRuinsRecipe = {
  id: 'ancient-grove',
  siteKinds: ['sanctuary', 'watch-circle', 'forest-shrine'],
  minAltitude: 165,
  maxAltitude: 760,
  maxSlope: 0.24,
  maxRelief: 6.5,
  minSpacing: 360,
};

export function magicForestRuinsRecipe(id: string): MagicForestRuinsRecipe {
  if (id !== 'ancient-grove') throw new Error(`Unknown magic forest ruins recipe: ${id}`);
  return ANCIENT_GROVE_RECIPE;
}
