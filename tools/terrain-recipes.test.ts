import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorldSeed } from '../src/core/Seed';
import {
  TERRAIN_RECIPE_IDS,
  parseTerrainRecipeId,
  resolveGaussianStamps,
  terrainRecipe,
} from '../src/world/TerrainRecipe';
import {
  FAR_SHELL_CLIP_INNER,
  farShellCoverageAt,
  terrainSkirtDrop,
} from '../src/world/TerrainShell';
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

test('terrain recipes own distinct macro foundations', () => {
  const original = terrainRecipe('laas').foundation;
  const basin = terrainRecipe('basin-country').foundation;
  const lowlands = terrainRecipe('rolling-lowlands').foundation;
  assert.equal(original.alpineMassif, 1);
  assert.equal(original.karstPlateau, 1);
  assert.equal(basin.alpineMassif, 0);
  assert.equal(basin.karstPlateau, 0);
  assert.equal(lowlands.alpineMassif, 0);
  assert.notDeepEqual(basin, original);
  for (const id of TERRAIN_RECIPE_IDS) {
    for (const weight of Object.values(terrainRecipe(id).foundation)) {
      assert.ok(weight >= 0 && weight <= 1, `${id} foundation weight out of range`);
    }
  }
});

test('far shell cannot render below the interior terrain', () => {
  assert.equal(farShellCoverageAt(0, 0), 0);
  assert.equal(farShellCoverageAt(FAR_SHELL_CLIP_INNER - 1, 0), 0);
  assert.equal(farShellCoverageAt(2048, 0), 1);
  assert.equal(farShellCoverageAt(0, -2048), 1);
  assert.ok(terrainSkirtDrop(64) >= 9.5);
  assert.ok(terrainSkirtDrop(128) > terrainSkirtDrop(64));
});

test('batch manifest is a deterministic Cartesian product', () => {
  const options = {
    baseUrl: 'http://127.0.0.1:5173/',
    recipes: TERRAIN_RECIPE_IDS.slice(0, 2),
    seeds: [7, 8],
    shots: [1, 5],
    preset: 'low' as const,
    timeOfDay: 11,
    worldRecipe: 'wilderness' as const,
    landscapeProfile: 'arid' as const,
    landscapeInclude: ['desert'] as const,
    landscapeExclude: ['snow', 'concrete'] as const,
  };
  const a = buildTerrainBatch(options);
  const b = buildTerrainBatch(options);
  assert.deepEqual(a, b);
  assert.equal(a.entries.length, 8);
  const url = new URL(a.entries[0]?.url ?? '');
  assert.equal(url.searchParams.get('seed'), '7');
  assert.equal(url.searchParams.get('terrain'), 'laas');
  assert.equal(url.searchParams.get('landscape'), 'arid');
  assert.equal(url.searchParams.get('include'), 'desert');
  assert.equal(url.searchParams.get('exclude'), 'snow,concrete');
  assert.equal(url.searchParams.get('season'), 'summer');
  assert.equal(url.searchParams.get('freeze'), '1');
});

test('batch manifest can expand the same world across seasons', () => {
  const manifest = buildTerrainBatch({
    baseUrl: 'http://127.0.0.1:5173/',
    recipes: ['dune-oasis'],
    seeds: [73],
    shots: [1],
    preset: 'low',
    timeOfDay: 11,
    worldRecipe: 'wilderness',
    landscapeProfile: 'oasis',
    seasons: ['spring', 'autumn', 'winter'],
  });
  assert.equal(manifest.entries.length, 3);
  assert.deepEqual(manifest.entries.map((entry) => entry.season), [
    'spring',
    'autumn',
    'winter',
  ]);
});

test('integer list parser supports inclusive ranges', () => {
  assert.deepEqual(parseIntegerList('1..3,9', 'seeds'), [1, 2, 3, 9]);
  assert.throws(() => parseIntegerList('4..1', 'seeds'));
});
