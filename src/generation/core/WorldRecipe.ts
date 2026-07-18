/** Top-level world recipes compose terrain-independent feature libraries. */

export const WORLD_RECIPE_IDS = ['wilderness', 'magic-forest-ruins'] as const;

export type WorldRecipeId = (typeof WORLD_RECIPE_IDS)[number];

export interface WorldFeatureSpec {
  libraryId: string;
  recipeId: string;
}

export interface WorldRecipe {
  id: WorldRecipeId;
  label: string;
  description: string;
  features: readonly WorldFeatureSpec[];
  environment: {
    timeOfDay: number;
    fogDensity: number;
    windStrength: number;
  };
}

const RECIPES: Readonly<Record<WorldRecipeId, WorldRecipe>> = {
  wilderness: {
    id: 'wilderness',
    label: 'Procedural wilderness',
    description: 'Terrain, water, and ecology without authored points of interest.',
    features: [],
    environment: { timeOfDay: 11, fogDensity: 0.4, windStrength: 0.45 },
  },
  'magic-forest-ruins': {
    id: 'magic-forest-ruins',
    label: 'Magic forest ruins',
    description: 'Mossed sanctuaries, broken watch circles, and luminous forest shrines.',
    features: [{ libraryId: 'magic-forest-ruins', recipeId: 'ancient-grove' }],
    environment: { timeOfDay: 16.7, fogDensity: 0.52, windStrength: 0.32 },
  },
};

export function isWorldRecipeId(value: string): value is WorldRecipeId {
  return (WORLD_RECIPE_IDS as readonly string[]).includes(value);
}

export function parseWorldRecipeId(value: string | null): WorldRecipeId {
  return value !== null && isWorldRecipeId(value) ? value : 'wilderness';
}

export function worldRecipe(id: WorldRecipeId): WorldRecipe {
  return RECIPES[id];
}
