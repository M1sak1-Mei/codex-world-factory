import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorldSeed } from '../src/core/Seed';
import { createDefaultWorldFeatureRegistry } from '../src/generation/DefaultWorldFeatures';
import type { TerrainSurface } from '../src/generation/core/WorldFeature';
import { parseWorldRecipeId } from '../src/generation/core/WorldRecipe';
import {
  assembleMagicRuinsSite,
  type MagicForestRuinsPlan,
} from '../src/generation/libraries/magic-forest-ruins/generator';
import { createMagicForestRuinsLibrary } from '../src/generation/libraries/magic-forest-ruins/MagicForestRuinsLibrary';
import {
  createMagicRuinsModelKit,
  MAGIC_RUINS_MODEL_CATALOG,
} from '../src/generation/models/magic-ruins';
import { buildHorizontalCollisionProbe } from '../src/core/Collision';
import { parseParams } from '../src/core/Params';

const terrain: TerrainSurface = {
  heightAt: (x, z) => 300 + x * 0.008 - z * 0.006 + Math.sin(x * 0.004) * 2,
  waterAt: () => -10_000,
  slopeAt: () => 0.014,
  reliefAt: (_x, _z, radius) => radius * 0.035,
};

test('world recipe parsing preserves wilderness compatibility', () => {
  assert.equal(parseWorldRecipeId(null), 'wilderness');
  assert.equal(parseWorldRecipeId('unknown'), 'wilderness');
  assert.equal(parseWorldRecipeId('magic-forest-ruins'), 'magic-forest-ruins');
});

test('world environment supplies defaults but explicit URL values win', () => {
  assert.equal(parseParams('?world=magic-forest-ruins').timeOfDay, 16.7);
  assert.equal(parseParams('?world=magic-forest-ruins&T=8.5').timeOfDay, 8.5);
  assert.equal(parseParams('').timeOfDay, 11);
});

test('magic forest ruin planning is deterministic and emits occupancy', () => {
  const registryA = createDefaultWorldFeatureRegistry();
  const registryB = createDefaultWorldFeatureRegistry();
  const context = { terrain, seed: new WorldSeed(42), worldHalf: 2048 };
  const a = registryA.plan('magic-forest-ruins', context);
  const b = registryB.plan('magic-forest-ruins', context);
  assert.deepEqual(a, b);
  assert.equal(a.plans.length, 1);
  const plan = a.plans[0] as MagicForestRuinsPlan;
  assert.equal(plan.sites.length, 3);
  assert.equal(a.exclusions.length, 5);
  assert.equal(a.exclusions.filter((zone) => zone.id.startsWith('ruins-access:')).length, 2);
  for (const site of plan.sites) {
    assert.ok(site.slope <= 0.24);
    assert.ok(site.relief <= 6.5);
    assert.ok(terrain.waterAt(site.center[0], site.center[1]) < site.baseY);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const x = site.center[0] + Math.cos(angle) * (site.radius + 8);
      const z = site.center[1] + Math.sin(angle) * (site.radius + 8);
      assert.ok(terrain.waterAt(x, z) < terrain.heightAt(x, z) - 0.35);
    }
  }
});

test('magic ruins model kit is discoverable and independent from site planning', () => {
  const ids = MAGIC_RUINS_MODEL_CATALOG.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'magic-ruins/aged-stone-block',
    'magic-ruins/crystal-spire',
    'magic-ruins/portal-ring',
    'magic-ruins/lichen-colony',
  ]);

  const plan = createDefaultWorldFeatureRegistry().plan(
    'magic-forest-ruins',
    { terrain, seed: new WorldSeed(42), worldHalf: 2048 },
  ).plans[0] as MagicForestRuinsPlan;
  const assembly = assembleMagicRuinsSite(plan.sites[0]!, terrain);
  assert.ok(assembly.blocks.length > 100);
  assert.ok(assembly.obstacles.length > 5);
  assert.equal('group' in assembly, false);
});

test('magic forest ruins library creates its injected model kit only during build', () => {
  let modelKitFactoryCalls = 0;
  const library = createMagicForestRuinsLibrary(() => {
    modelKitFactoryCalls++;
    return createMagicRuinsModelKit();
  });
  const seed = new WorldSeed(13);
  const plan = library.plan('ancient-grove', { terrain, seed, worldHalf: 2048 });
  assert.equal(modelKitFactoryCalls, 0);
  const runtime = library.build(plan, { terrain, seed });
  assert.equal(modelKitFactoryCalls, 1);
  assert.equal(runtime.group.name, 'feature-library:magic-forest-ruins');
});

test('feature registry builds an independent runtime with useful stats', () => {
  const registry = createDefaultWorldFeatureRegistry();
  const seed = new WorldSeed(9);
  const collection = registry.plan('magic-forest-ruins', { terrain, seed, worldHalf: 2048 });
  const runtime = registry.build(collection, { terrain, seed });
  assert.equal(runtime.stats['features.ruinsSites'], 3);
  assert.ok((runtime.stats['features.ruinBlocks'] ?? 0) > 250);
  assert.ok((runtime.stats['features.magicCrystals'] ?? 0) >= 30);
  assert.ok(runtime.primarySpawn !== null);
  assert.ok(runtime.obstacles.length > 10);
});

test('feature collision capsules block wall crossing and preserve clearance', () => {
  const probe = buildHorizontalCollisionProbe([
    { id: 'wall', a: [-5, 0], b: [5, 0], radius: 0.5 },
  ]);
  const hit = probe(0, 0.2, 0.4);
  assert.equal(hit.blocked, true);
  assert.ok(Math.abs(hit.z - 0.9) < 1e-6);
  const clear = probe(0, 3, 0.4);
  assert.deepEqual(clear, { x: 0, z: 3, blocked: false });
});
