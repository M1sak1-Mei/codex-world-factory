import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseParams } from '../src/core/Params';
import { WorldSeed } from '../src/core/Seed';
import { buildCactus } from '../src/vegetation/AridPlants';
import { cactusMaterial } from '../src/render/VegMaterials';
import { BIRCH, PINE, TREE_SPECIES } from '../src/vegetation/Species';
import {
  SEASON_IDS,
  parseSeasonId,
  seasonalFoliageStyle,
  treeSeasonCoverages,
} from '../src/vegetation/Seasons';
import {
  LANDSCAPE_PROFILE_IDS,
  resolveLandscapeProfile,
} from '../src/world/LandscapeProfile';
import { TERRAIN_RECIPE_IDS, terrainRecipe } from '../src/world/TerrainRecipe';

test('expanded landform and ecology catalogues expose stable ids', () => {
  for (const id of [
    'canyon-badlands',
    'dune-oasis',
    'coastal-islands',
    'karst-sinklands',
    'volcanic-highlands',
  ] as const) {
    assert.ok(TERRAIN_RECIPE_IDS.includes(id));
    assert.ok(terrainRecipe(id).stamps.length >= 4);
  }
  for (const id of ['oasis', 'coastal', 'moorland'] as const) {
    assert.ok(LANDSCAPE_PROFILE_IDS.includes(id));
  }
});

test('cactus ecology is habitat-controlled and exclusions win', () => {
  const oasis = resolveLandscapeProfile('oasis');
  assert.ok(oasis.ecology.cacti > 1);
  assert.ok(oasis.ecology.desert > 1);
  assert.ok(oasis.ecology.wetland > 1);
  assert.ok(oasis.surfaces.sand > 1);

  const requested = resolveLandscapeProfile('coastal', ['cacti'], []);
  assert.ok(requested.ecology.cacti >= 1);
  assert.ok(requested.surfaces.sand >= 0.65);
  const forbidden = resolveLandscapeProfile('arid', ['cacti'], ['cacti']);
  assert.equal(forbidden.ecology.cacti, 0);
  assert.ok(forbidden.ecology.desert > 1);
});

test('four cactus forms are deterministic and carry PBR vertex channels', () => {
  const triangleCounts: number[] = [];
  for (let variant = 0; variant < 4; variant++) {
    const a = buildCactus(new WorldSeed(2026).rng(`cactus/${variant}`), variant);
    const b = buildCactus(new WorldSeed(2026).rng(`cactus/${variant}`), variant);
    const posA = a.getAttribute('position');
    const posB = b.getAttribute('position');
    const indexA = a.getIndex();
    const indexB = b.getIndex();
    assert.ok(posA.count > 100);
    assert.equal(posA.count, posB.count);
    assert.deepEqual(Array.from(posA.array), Array.from(posB.array));
    assert.ok(indexA && indexB && indexA.count > 300);
    assert.equal(indexA.count, indexB.count);
    assert.equal(a.getAttribute('normal').count, posA.count);
    assert.equal(a.getAttribute('uv').count, posA.count);
    assert.equal(a.getAttribute('vdata').count, posA.count);
    triangleCounts.push(indexA.count / 3);
  }
  assert.ok(new Set(triangleCounts).size >= 3);
  const material = cactusMaterial();
  assert.equal(
    (material as unknown as { isMeshPhysicalNodeMaterial?: boolean }).isMeshPhysicalNodeMaterial,
    true,
  );
  assert.ok(material.normalNode);
  assert.equal(material.metalness, 0);
});

test('season parsing and leaf retention distinguish deciduous and conifer trees', () => {
  assert.deepEqual(SEASON_IDS, ['spring', 'summer', 'autumn', 'winter']);
  assert.equal(parseSeasonId(null), 'summer');
  assert.equal(parseSeasonId('autumn'), 'autumn');
  assert.equal(parseSeasonId('monsoon'), 'summer');
  assert.equal(parseParams('?season=winter').season, 'winter');

  const birchWinter = seasonalFoliageStyle(BIRCH, 'winter');
  const pineWinter = seasonalFoliageStyle(PINE, 'winter');
  const birchAutumn = seasonalFoliageStyle(BIRCH, 'autumn');
  assert.equal(birchWinter.coverage, 0);
  assert.ok(pineWinter.coverage > 0.75);
  assert.ok(birchAutumn.tint[0] > birchAutumn.tint[2] * 10);

  for (const season of SEASON_IDS) {
    const coverage = treeSeasonCoverages(season);
    assert.equal(coverage.length, TREE_SPECIES.length);
    assert.ok(coverage.every((value) => value >= 0 && value <= 1));
  }
});

test('season changes presentation without changing terrain or landscape selection', () => {
  const summer = parseParams(
    '?seed=84&terrain=karst-sinklands&landscape=moorland&include=hills,shrubs&season=summer',
  );
  const winter = parseParams(
    '?seed=84&terrain=karst-sinklands&landscape=moorland&include=hills,shrubs&season=winter',
  );
  assert.equal(summer.seed, winter.seed);
  assert.equal(summer.terrainRecipe, winter.terrainRecipe);
  assert.equal(summer.landscapeProfile, winter.landscapeProfile);
  assert.deepEqual(summer.landscapeInclude, winter.landscapeInclude);
  assert.notEqual(summer.season, winter.season);
});
