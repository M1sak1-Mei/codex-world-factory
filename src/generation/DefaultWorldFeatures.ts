import { WorldFeatureRegistry } from './core/WorldFeatureRegistry';
import { cityBuildingsLibrary } from './libraries/city-buildings/CityBuildingsLibrary';
import { magicForestRuinsLibrary } from './libraries/magic-forest-ruins/MagicForestRuinsLibrary';

/** Fresh registry per world boot keeps HMR/tests free from mutable singleton state. */
export function createDefaultWorldFeatureRegistry(): WorldFeatureRegistry {
  return new WorldFeatureRegistry()
    .register(magicForestRuinsLibrary)
    .register(cityBuildingsLibrary);
}
