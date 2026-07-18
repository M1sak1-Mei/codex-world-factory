import {
  defineWorldFeatureLibrary,
  type WorldFeatureLibrary,
} from '../../core/WorldFeature';
import {
  createCityBuildingsModelKit,
  type CityBuildingsModelKit,
} from '../../models/city-buildings';
import {
  CITY_BUILDINGS_RECIPE_IDS,
  generateCityBuildingsScene,
  planCityBuildings,
  type CityBuildingsPlan,
} from './generator';

export function createCityBuildingsLibrary(
  modelKitFactory: () => CityBuildingsModelKit = createCityBuildingsModelKit,
): WorldFeatureLibrary {
  return defineWorldFeatureLibrary<CityBuildingsPlan>({
    id: 'city-buildings',
    recipeIds: CITY_BUILDINGS_RECIPE_IDS,
    plan: planCityBuildings,
    build(plan, context) {
      return generateCityBuildingsScene(
        plan.districts,
        context.terrain,
        modelKitFactory(),
      );
    },
  });
}

export const cityBuildingsLibrary = createCityBuildingsLibrary();
