import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseParams } from '../src/core/Params';
import { resolveShowcaseParameters } from '../src/world/WorldShowcase';
import viteConfig from '../vite.config';
import { terrainSurfacePalette } from '../src/world/TerrainSurfacePalette';

test('showcases compose existing terrain, ecology and content modules', () => {
  const p = parseParams('?showcase=enchanted-river&preset=low');
  assert.equal(p.terrainRecipe, 'folded-ranges');
  assert.equal(p.landscapeProfile, 'wild');
  assert.equal(p.worldRecipe, 'magic-forest-ruins');
  assert.equal(p.seed, 42);
  assert.equal(p.preset, 'low');
  assert.ok(p.landscapeExclude.includes('concrete'));
});

test('explicit overrides take precedence and unknown showcases preserve old defaults', () => {
  const p = parseParams('?showcase=enchanted-river&seed=8&season=winter&world=wilderness&include=&T=11');
  assert.equal(p.seed, 8);
  assert.equal(p.season, 'winter');
  assert.equal(p.worldRecipe, 'wilderness');
  assert.deepEqual(p.landscapeInclude, []);
  assert.equal(p.timeOfDay, 11);
  assert.deepEqual(parseParams('?showcase=missing'), parseParams(''));
  assert.deepEqual(parseParams('?showcase=__proto__'), parseParams(''));
  assert.equal(resolveShowcaseParameters('?showcase=oasis-sanctuary').get('terrain'), 'dune-oasis');
});

test('production preview serves the same base path as production assets', async () => {
  assert.equal(typeof viteConfig, 'function');
  if (typeof viteConfig !== 'function') throw new Error('Expected an environment-aware Vite config');
  const build = await viteConfig({ command: 'build', mode: 'production', isPreview: false });
  const preview = await viteConfig({ command: 'serve', mode: 'production', isPreview: true });
  const dev = await viteConfig({ command: 'serve', mode: 'development', isPreview: false });
  assert.equal(build.base, '/codex-world-factory/');
  assert.equal(preview.base, build.base);
  assert.equal(dev.base, '/');
});

test('woodland bedrock has a distinct restrained palette without recolouring other landscapes', () => {
  const wild = terrainSurfacePalette('wild');
  const legacy = terrainSurfacePalette('legacy');
  assert.ok(wild.rockHigh.every((v, i) => v < legacy.rockHigh[i]!));
  assert.deepEqual(terrainSurfacePalette('balanced'), legacy);
  for (const rgb of [wild.rockLow, wild.rockHigh, wild.scree]) {
    assert.ok(rgb.every((v) => Number.isFinite(v) && v > 0 && v < 0.5));
  }
});
