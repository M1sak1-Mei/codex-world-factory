import { defineWorldFeatureLibrary } from '../../core/WorldFeature';
import { buildMagicForestRuinsGeometry } from './MagicForestRuinsGeometry';
import { buildMagicForestRuinsMaterials } from './MagicForestRuinsMaterials';
import {
  planMagicForestRuins,
  type MagicForestRuinsPlan,
} from './MagicForestRuinsPlanner';
import { MAGIC_FOREST_RUINS_RECIPE_IDS } from './MagicForestRuinsRecipe';

export const magicForestRuinsLibrary = defineWorldFeatureLibrary<MagicForestRuinsPlan>({
  id: 'magic-forest-ruins',
  recipeIds: MAGIC_FOREST_RUINS_RECIPE_IDS,
  plan: planMagicForestRuins,
  build(plan, context) {
    return buildMagicForestRuinsGeometry(
      plan.sites,
      context.terrain,
      buildMagicForestRuinsMaterials(),
    );
  },
});
