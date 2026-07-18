import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorldSeed } from '../src/core/Seed';
import {
  TERRAIN_RECIPE_IDS,
  parseTerrainRecipeId,
  resolveGaussianStamps,
} from '../src/world/TerrainRecipe';
import { buildTerrainBatch, parseIntegerList } from './terrain-batch';

test('unknown terrain recipe falls back to the original LAAS layout', () => {
  assert.equal(parseTerrainRecipeId('not-a-recipe'), 'laas');
  assert.equal(parseTerrainRecipeId(null), 'laas');
});

test('Gaussian stamps are deterministic and stream-isolated', () => {
  const a = resolveGaussianStamps(new WorldSeed(42), 'folded-ranges');
  const b = resolveGaussianStamps(new WorldSeed(42), 'folded-ranges');
  const c = resolveGaussianStamps(new WorldSeed(43), 'folded-ranges');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const stamp of a) {
    assert.ok(stamp.sigma[0] > 0 && stamp.sigma[1] > 0);
    assert.ok(stamp.sharpness > 0);
  }
});

test('batch manifest is a deterministic Cartesian product', () => {
  const options = {
    baseUrl: 'http://localhost:5173/',
    recipes: TERRAIN_RECIPE_IDS.slice(0, 2),
    seeds: [7, 8],
    shots: [1, 5],
    preset: 'low' as const,
    timeOfDay: 11,
    worldRecipe: 'wilderness' as const,
  };
  const a = buildTerrainBatch(options);
  const b = buildTerrainBatch(options);
  assert.deepEqual(a, b);
  assert.equal(a.entries.length, 8);
  const url = new URL(a.entries[0]?.url ?? '');
  assert.equal(url.searchParams.get('seed'), '7');
  assert.equal(url.searchParams.get('terrain'), 'laas');
  assert.equal(url.searchParams.get('freeze'), '1');
});

test('integer list parser supports inclusive ranges', () => {
  assert.deepEqual(parseIntegerList('1..3,9', 'seeds'), [1, 2, 3, 9]);
  assert.throws(() => parseIntegerList('4..1', 'seeds'));
});
