import {
  defineWorldFeatureLibrary,
  type WorldFeatureLibrary,
} from '../../core/WorldFeature';
import {
  createMagicRuinsModelKit,
  type MagicRuinsModelKit,
} from '../../models/magic-ruins';
import {
  generateMagicForestRuinsScene,
  MAGIC_FOREST_RUINS_RECIPE_IDS,
  planMagicForestRuins,
  type MagicForestRuinsPlan,
} from './generator';

export function createMagicForestRuinsLibrary(
  modelKitFactory: () => MagicRuinsModelKit = createMagicRuinsModelKit,
): WorldFeatureLibrary {
  return defineWorldFeatureLibrary<MagicForestRuinsPlan>({
    id: 'magic-forest-ruins',
    recipeIds: MAGIC_FOREST_RUINS_RECIPE_IDS,
    plan: planMagicForestRuins,
    build(plan, context) {
      return generateMagicForestRuinsScene(
        plan.sites,
        context.terrain,
        modelKitFactory(),
      );
    },
  });
}

export const magicForestRuinsLibrary = createMagicForestRuinsLibrary();
