export const CITY_BUILDINGS_RECIPE_IDS = ['fantasy-quarter'] as const;

export type CityBuildingsRecipeId = (typeof CITY_BUILDINGS_RECIPE_IDS)[number];
export type CityDistrictKind = 'merchant-quarter';

export interface CityBuildingsRecipe {
  id: CityBuildingsRecipeId;
  districtKinds: readonly CityDistrictKind[];
  minAltitude: number;
  maxAltitude: number;
  maxSlope: number;
  maxRelief: number;
  minSpacing: number;
  targetDistance: number;
}

export const FANTASY_QUARTER_RECIPE: CityBuildingsRecipe = {
  id: 'fantasy-quarter',
  districtKinds: ['merchant-quarter'],
  minAltitude: 40,
  maxAltitude: 1100,
  maxSlope: 0.24,
  maxRelief: 28,
  minSpacing: 320,
  targetDistance: 560,
};

export function cityBuildingsRecipe(id: string): CityBuildingsRecipe {
  if (id !== 'fantasy-quarter') throw new Error(`Unknown city buildings recipe: ${id}`);
  return FANTASY_QUARTER_RECIPE;
}
