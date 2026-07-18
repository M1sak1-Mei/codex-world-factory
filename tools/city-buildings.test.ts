import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHorizontalCollisionProbe } from '../src/core/Collision';
import { WorldSeed } from '../src/core/Seed';
import { parseParams } from '../src/core/Params';
import { createDefaultWorldFeatureRegistry } from '../src/generation/DefaultWorldFeatures';
import type { TerrainSurface } from '../src/generation/core/WorldFeature';
import { parseWorldRecipeId } from '../src/generation/core/WorldRecipe';
import {
  assembleCityDistrict,
  type CityBuildingsPlan,
} from '../src/generation/libraries/city-buildings/generator';
import { createCityBuildingsLibrary } from '../src/generation/libraries/city-buildings/CityBuildingsLibrary';
import {
  CITY_BUILDINGS_MODEL_CATALOG,
  createCityBuildingsModelKit,
} from '../src/generation/models/city-buildings';

const terrain: TerrainSurface = {
  heightAt: (x, z) => 300 + x * 0.008 - z * 0.006 + Math.sin(x * 0.004) * 2,
  waterAt: () => -10_000,
  slopeAt: () => 0.014,
  reliefAt: (_x, _z, radius) => radius * 0.035,
};

test('fantasy city is a selectable world recipe with its own environment', () => {
  assert.equal(parseWorldRecipeId('fantasy-city'), 'fantasy-city');
  assert.equal(parseParams('?world=fantasy-city').timeOfDay, 14.4);
  assert.equal(parseParams('?world=fantasy-city&T=9.25').timeOfDay, 9.25);
});

test('city district planning is deterministic and reserves vegetation clearance', () => {
  const context = { terrain, seed: new WorldSeed(84), worldHalf: 2048 };
  const a = createDefaultWorldFeatureRegistry().plan('fantasy-city', context);
  const b = createDefaultWorldFeatureRegistry().plan('fantasy-city', context);
  assert.deepEqual(a, b);
  assert.equal(a.plans.length, 1);
  assert.equal(a.exclusions.length, 4);
  assert.equal(a.exclusions.filter((zone) => zone.id.startsWith('city-access:')).length, 3);
  const plan = a.plans[0] as CityBuildingsPlan;
  assert.equal(plan.libraryId, 'city-buildings');
  assert.equal(plan.districts.length, 1);
  const district = plan.districts[0]!;
  assert.ok(district.slope <= 0.24);
  assert.ok(district.relief <= 28);
  assert.ok(terrain.waterAt(district.center[0], district.center[1]) < district.baseY);
});

test('city grammar expands a plan into render-independent buildings and collision', () => {
  const collection = createDefaultWorldFeatureRegistry().plan(
    'fantasy-city',
    { terrain, seed: new WorldSeed(23), worldHalf: 2048 },
  );
  const plan = collection.plans[0] as CityBuildingsPlan;
  const assembly = assembleCityDistrict(plan.districts[0]!, terrain);
  assert.equal(assembly.buildingCount, 33);
  assert.equal(assembly.foundations.length, 33);
  assert.equal(assembly.walls.length, 33);
  assert.equal(assembly.roofs.length, 33);
  assert.equal(assembly.doors.length, 33);
  assert.equal(assembly.obstacles.length, 33 * 4);
  assert.ok(assembly.beams.length > 500);
  assert.ok(assembly.windows.length > 500);
  assert.equal('group' in assembly, false);
  assert.equal(new Set(assembly.obstacles.map((obstacle) => obstacle.id)).size, 33 * 4);
  const edge = assembly.obstacles[0]!;
  const hit = buildHorizontalCollisionProbe(assembly.obstacles)(
    (edge.a[0] + edge.b[0]) * 0.5,
    (edge.a[1] + edge.b[1]) * 0.5,
    0.4,
  );
  assert.equal(hit.blocked, true);
});

test('mountain terrain falls back to the best available district instead of failing', () => {
  const mountainTerrain: TerrainSurface = {
    heightAt: (x, z) => 330 + x * 0.012 - z * 0.009,
    waterAt: () => -10_000,
    slopeAt: () => 0.3,
    reliefAt: (_x, _z, radius) => radius * 0.6,
  };
  const collection = createDefaultWorldFeatureRegistry().plan(
    'fantasy-city',
    { terrain: mountainTerrain, seed: new WorldSeed(41), worldHalf: 2048 },
  );
  const plan = collection.plans[0] as CityBuildingsPlan;
  assert.ok(plan.districts[0]!.relief > 28);
  const runtime = createDefaultWorldFeatureRegistry().build(collection, {
    terrain: mountainTerrain,
    seed: new WorldSeed(41),
  });
  assert.equal(runtime.stats['features.cityBuildings'], 33);
});

test('wet building plots are omitted without invalidating the district', () => {
  const collection = createDefaultWorldFeatureRegistry().plan(
    'fantasy-city',
    { terrain, seed: new WorldSeed(61), worldHalf: 2048 },
  );
  const plan = collection.plans[0] as CityBuildingsPlan;
  const district = plan.districts[0]!;
  const mixedTerrain: TerrainSurface = {
    ...terrain,
    waterAt: (x, z) => x > district.center[0] + 5 ? terrain.heightAt(x, z) : -10_000,
  };
  const assembly = assembleCityDistrict(district, mixedTerrain);
  assert.ok(assembly.buildingCount > 0);
  assert.ok(assembly.buildingCount < 33);
  assert.equal(assembly.obstacles.length, assembly.buildingCount * 4);
});

test('city model catalog is unique and reusable independently of planning', () => {
  const ids = CITY_BUILDINGS_MODEL_CATALOG.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'city-buildings/stone-foundation',
    'city-buildings/plaster-shell',
    'city-buildings/steep-roof',
    'city-buildings/timber-frame',
    'city-buildings/lit-window',
    'city-buildings/wooden-door',
  ]);
});

test('city library creates its injected model kit only during runtime build', () => {
  let modelKitFactoryCalls = 0;
  const library = createCityBuildingsLibrary(() => {
    modelKitFactoryCalls++;
    return createCityBuildingsModelKit();
  });
  const seed = new WorldSeed(31);
  const plan = library.plan('fantasy-quarter', { terrain, seed, worldHalf: 2048 });
  assert.equal(modelKitFactoryCalls, 0);
  const runtime = library.build(plan, { terrain, seed });
  assert.equal(modelKitFactoryCalls, 1);
  assert.equal(runtime.group.name, 'feature-library:city-buildings');
  assert.equal(runtime.stats['features.cityBuildings'], 33);
  assert.equal(runtime.obstacles.length, 33 * 4);
  assert.ok(runtime.primarySpawn !== null);
  const spawn = runtime.primarySpawn!;
  assert.ok(terrain.waterAt(spawn.position[0], spawn.position[2]) < spawn.position[1] - 1.7);
});

test('default registry builds useful city runtime statistics', () => {
  const registry = createDefaultWorldFeatureRegistry();
  const seed = new WorldSeed(9);
  const collection = registry.plan('fantasy-city', { terrain, seed, worldHalf: 2048 });
  const runtime = registry.build(collection, { terrain, seed });
  assert.equal(runtime.stats['features.cityDistricts'], 1);
  assert.equal(runtime.stats['features.cityBuildings'], 33);
  assert.ok((runtime.stats['features.cityWindows'] ?? 0) > 500);
  assert.ok((runtime.stats['features.cityStructuralParts'] ?? 0) > 600);
  assert.equal(runtime.obstacles.length, 132);
});
