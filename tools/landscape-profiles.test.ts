import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseParams } from '../src/core/Params';
import { WorldSeed } from '../src/core/Seed';
import { TREE_SPECIES } from '../src/vegetation/Species';
import {
  parseLandscapeProfileId,
  parseLandscapeTags,
  resolveLandscapeProfile,
} from '../src/world/LandscapeProfile';
import { makeLandscapeSurfaceLayout } from '../src/world/LandscapeSurface';
import { makeMacroParams } from '../src/world/MacroMap';
import { TERRAIN_RECIPE_IDS } from '../src/world/TerrainRecipe';

test('balanced landscape is the default and URL controls are declarative', () => {
  const defaults = parseParams('');
  assert.equal(defaults.landscapeProfile, 'balanced');
  assert.deepEqual(defaults.landscapeInclude, []);
  assert.deepEqual(defaults.landscapeExclude, []);

  const requested = parseParams(
    '?landscape=settled&include=plains,flowers,cobble,flowers&exclude=desert,snow,unknown',
  );
  assert.equal(requested.landscapeProfile, 'settled');
  assert.deepEqual(requested.landscapeInclude, ['plains', 'flowers', 'cobble']);
  assert.deepEqual(requested.landscapeExclude, ['desert', 'snow']);
  assert.equal(parseLandscapeProfileId('unknown'), 'balanced');
  assert.deepEqual(parseLandscapeTags('forest, forest,NOPE,hills'), ['forest', 'hills']);
});

test('explicit exclusions win over presets and explicit inclusions', () => {
  const profile = resolveLandscapeProfile(
    'arid',
    ['forest', 'snow', 'concrete'],
    ['forest', 'snow', 'concrete'],
  );
  assert.equal(profile.ecology.forest, 0);
  assert.equal(profile.ecology.snow, 0);
  assert.equal(profile.surfaces.concrete, 0);
  assert.ok(profile.ecology.desert > 1);
  assert.ok(profile.surfaces.sand > 1);
});

test('legacy profile preserves old noise values and creates no artificial ground', () => {
  const legacy = resolveLandscapeProfile('legacy');
  assert.deepEqual(legacy.noise, {
    macroScale: 1,
    hills: 1,
    plains: 0,
    basins: 0,
    mountains: 1,
    detailScale: 1,
    detailAmplitude: 1,
    warp: 1,
  });
  assert.deepEqual(
    makeLandscapeSurfaceLayout(new WorldSeed(42), legacy),
    { paths: [], pads: [] },
  );
});

test('landscape selection does not reroll existing terrain streams', () => {
  const seed = new WorldSeed(42);
  const legacy = makeMacroParams(seed, 'laas', resolveLandscapeProfile('legacy'));
  const balanced = makeMacroParams(seed, 'laas', resolveLandscapeProfile('balanced'));
  assert.deepEqual(legacy.alpC, balanced.alpC);
  assert.deepEqual(legacy.lakeC, balanced.lakeC);
  assert.deepEqual(legacy.valley, balanced.valley);
  assert.deepEqual(legacy.trib, balanced.trib);
  for (const key of ['warp', 'ridge', 'hills', 'karst', 'detail', 'hard', 'far'] as const) {
    assert.deepEqual(legacy.off[key], balanced.off[key]);
  }
});

test('artificial-ground layouts are deterministic and seed isolated', () => {
  const settled = resolveLandscapeProfile('settled');
  const a = makeLandscapeSurfaceLayout(new WorldSeed(42), settled);
  const b = makeLandscapeSurfaceLayout(new WorldSeed(42), settled);
  const c = makeLandscapeSurfaceLayout(new WorldSeed(43), settled);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.paths.length >= 1);
  assert.ok(a.pads.length >= 1);
  assert.ok(a.paths.every((path) => path.points.length >= 4 && path.width > 0));
  assert.ok(a.pads.every((pad) => pad.halfSize[0] > 0 && pad.halfSize[1] > 0));
});

test('expanded terrain and tree catalogues are unique', () => {
  assert.ok(TERRAIN_RECIPE_IDS.includes('rolling-lowlands'));
  assert.ok(TERRAIN_RECIPE_IDS.includes('basin-country'));
  assert.ok(TERRAIN_RECIPE_IDS.includes('desert-mesas'));
  assert.ok(TERRAIN_RECIPE_IDS.includes('glacial-uplands'));

  const treeIds = TREE_SPECIES.map((species) => species.id);
  assert.equal(treeIds.length, 8);
  assert.equal(new Set(treeIds).size, treeIds.length);
  assert.ok(treeIds.includes('oak'));
  assert.ok(treeIds.includes('willow'));
});
