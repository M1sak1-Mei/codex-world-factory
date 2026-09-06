import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorldSeed } from '../src/core/Seed';
import { resolveLandscapeProfile } from '../src/world/LandscapeProfile';
import {
  NUMBER_HABITAT_MATH as math,
  TREE_HABITAT_PALETTE,
  UNDERSTORY_HABITAT_PALETTE,
  groundPatchDensity,
  habitatResponse,
  understoryIntensities,
  wetlandSuitability,
} from '../src/world/HabitatModel';

test('habitat palettes preserve pool identities and contain finite nonnegative weights', () => {
  assert.deepEqual(TREE_HABITAT_PALETTE.map((p) => p.id),
    ['spruce', 'pine', 'beech', 'birch', 'karst', 'snag', 'oak', 'willow']);
  assert.deepEqual(UNDERSTORY_HABITAT_PALETTE.map((p) => p.id),
    ['hazel', 'pink-shrub', 'juniper', 'fern', 'umbel', 'bell', 'daisy']);
  for (const palette of [TREE_HABITAT_PALETTE, UNDERSTORY_HABITAT_PALETTE]) {
    assert.equal(new Set(palette.map((p) => p.id)).size, palette.length);
    for (const entry of palette) {
      assert.equal(entry.biome.length, 6);
      assert.ok(entry.biome.every((weight) => Number.isFinite(weight) && weight >= 0));
      for (const moisture of [0, 0.25, 0.5, 0.75, 1]) {
        assert.ok(entry.moisture[0] + entry.moisture[1] * moisture >= 0);
      }
    }
  }
});

test('arid sand selects only dry habitat; wet oasis banks reject cacti', () => {
  const dry = habitatResponse(math, { sand: 1, moisture: 0.1, desert: 1 });
  const wet = habitatResponse(math, { sand: 0.1, moisture: 0.9, desert: 1 });
  assert.equal(dry.green, 0);
  assert.equal(dry.woodland, 0);
  assert.equal(dry.cactus, 1);
  assert.equal(wet.cactus, 0);
  assert.equal(wet.woodland, 1);
  const greenWeights = [0.15, 0.1, 0.2, 0.5, 0.2, 0.1, 0.1];
  const dryWeights = understoryIntensities(math, greenWeights, 0.4 * dry.green, 0.14 * dry.cactus);
  assert.deepEqual(dryWeights.slice(0, 7), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(dryWeights[7], 0.14);
  const wetWeights = understoryIntensities(math, greenWeights, 0.4 * wet.green, 0.14 * wet.cactus);
  assert.equal(wetWeights[7], 0);
  assert.ok(wetWeights[3]! > 0);
});

test('acceptance and category roulette use the same conserved intensities', () => {
  const actual = understoryIntensities(math, [1, 2, 0, 4, 0, 0, 1], 0.3, 0.12);
  assert.ok(Math.abs(actual.reduce((sum, weight) => sum + weight, 0) - 0.42) < 1e-12);
  assert.equal(actual[2], 0);
  assert.equal(actual[4], 0);
  assert.deepEqual(understoryIntensities(math, Array<number>(7).fill(0), 0.3, 0),
    Array<number>(8).fill(0));
});

test('explicit flora exclusions remain zero through habitat weighting', () => {
  for (const id of ['legacy', 'oasis', 'coastal', 'arid'] as const) {
    const profile = resolveLandscapeProfile(id, ['cacti'], ['cacti', 'shrubs', 'flowers', 'forest', 'grass']);
    const habitat = habitatResponse(math, { sand: 1, moisture: 0.1,
      desert: Math.min(1, profile.ecology.desert) });
    const weights = understoryIntensities(math,
      UNDERSTORY_HABITAT_PALETTE.map((_, index) =>
        index < 4 ? profile.ecology.shrubs : profile.ecology.flowers),
      habitat.green, habitat.cactus * profile.ecology.cacti);
    assert.deepEqual(weights, Array<number>(8).fill(0));
    assert.equal(habitat.woodland * profile.ecology.forest, 0);
    assert.equal(groundPatchDensity(math, 1, 1, habitat.aridity) * profile.ecology.grass, 0);
  }
});

test('wetland eligibility is local, admits mountain marshes and rejects frozen or steep sites', () => {
  // A 500 m marsh is above the old 212 m ceiling, but has a suitable temperature.
  const mountainTemperature = 11.8 - 500 * 0.0125;
  assert.ok(wetlandSuitability(math, 0.92, 0.08, mountainTemperature, 1) > 0.35);
  assert.equal(wetlandSuitability(math, 0.92, 0.08, -3, 1), 0);
  assert.equal(wetlandSuitability(math, 0.92, 0.6, 8, 1), 0);
  assert.equal(wetlandSuitability(math, 0.3, 0.08, 8, 1), 0);
  assert.equal(wetlandSuitability(math, 0.92, 0.08, 8, 0), 0);
});

test('grass communities retain real bare sand and nested world-space tufts', () => {
  assert.equal(groundPatchDensity(math, 0.2, 0.9, 1), 0);
  assert.equal(groundPatchDensity(math, 0.9, 0.2, 1), 0);
  assert.equal(groundPatchDensity(math, 0.9, 0.95, 1), 1);
  assert.ok(groundPatchDensity(math, 0.85, 0.9, 0) >
    groundPatchDensity(math, 0.15, 0.1, 0) * 20);
});

test('habitat outcomes are finite and deterministic across named seed streams', () => {
  const sample = () => {
    const rng = new WorldSeed(73).rng('habitat-regression');
    return Array.from({ length: 2048 }, () => {
      const sand = rng.range(0, 1);
      const moisture = rng.range(0, 1);
      const desert = rng.range(0, 1);
      const h = habitatResponse(math, { sand, moisture, desert });
      const patch = groundPatchDensity(math, rng.range(0, 1), rng.range(0, 1), h.aridity);
      for (const value of Object.values(h)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
      assert.ok(Number.isFinite(patch) && patch >= 0 && patch <= 2.15);
      return [h, patch];
    });
  };
  assert.deepEqual(sample(), sample());
});
