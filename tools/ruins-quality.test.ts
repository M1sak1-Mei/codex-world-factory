import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstancedMesh, Mesh, Vector3 } from 'three';
import { Rng } from '../src/core/Seed';
import type { TerrainSurface } from '../src/generation/core/WorldFeature';
import { assembleMagicRuinsSite } from '../src/generation/libraries/magic-forest-ruins/generator/MagicForestRuinsGrammar';
import type { MagicRuinsSitePlan } from '../src/generation/libraries/magic-forest-ruins/generator/MagicForestRuinsPlanner';
import { createMagicRuinsModelKit } from '../src/generation/models/magic-ruins';
import { MAGIC_RUINS_STYLE } from '../src/generation/models/magic-ruins/MagicRuinsStyle';
import { planMagicRuinsApproach } from '../src/generation/libraries/magic-forest-ruins/generator/MagicRuinsApproachPlanner';
import { buildHorizontalCollisionProbe } from '../src/core/Collision';

const terrain: TerrainSurface = {
  heightAt: (x, z) => 300 + Math.sin(x * 0.2) * 0.8 + Math.cos(z * 0.13) * 0.4,
  waterAt: () => -1000,
  slopeAt: () => 0.08,
  reliefAt: () => 1.6,
};

const site: MagicRuinsSitePlan = {
  id: 'quality-sanctuary', kind: 'sanctuary', center: [0, 0], baseY: 300,
  radius: 30, yaw: 0, ruinSeed: 42, magicVariant: 0, slope: 0.08, relief: 1.6,
};

test('weathered masonry is instanced, beveled, deterministic and within its geometry budget', () => {
  const kit = createMagicRuinsModelKit();
  const placements = assembleMagicRuinsSite(site, terrain).blocks;
  const a = kit.createStoneBlocks('test-a', placements);
  const b = kit.createStoneBlocks('test-b', placements);
  assert.ok(a instanceof InstancedMesh);
  assert.ok(a.instanceColor);
  assert.deepEqual(a.instanceColor.array, b.instanceColor!.array);
  assert.deepEqual(a.instanceMatrix.array, b.instanceMatrix.array);
  assert.ok(new Set(a.instanceColor.array).size > 12, 'masonry must have stable per-stone color variation');
  const geometry = a.geometry;
  const position = geometry.getAttribute('position');
  assert.ok(position.count / 3 <= MAGIC_RUINS_STYLE.stone.maxTriangles);
  assert.ok(Array.from(position.array).every(Number.isFinite));
  const bounds = new Vector3();
  geometry.computeBoundingBox();
  geometry.boundingBox!.getSize(bounds);
  assert.ok(bounds.x > 0.94 && bounds.x < 1.1);
  assert.ok(kit.materials.stone.normalNode);
  assert.ok(kit.materials.stone.aoNode);
  assert.ok(kit.materials.stone.roughnessNode);
  assert.equal(kit.materials.stone.metalness, 0);
});

test('lichen samples curved ground at every vertex and has bounded cells and softened cutout edges', () => {
  const kit = createMagicRuinsModelKit();
  const groundAt = (x: number, z: number): number => Math.sin(x * 0.4) * 0.8 + Math.cos(z * 0.3) * 0.6;
  const create = (): Mesh => kit.createLichenColonies({
    name: 'quality-lichen', siteId: site.id, radius: 32, rng: new Rng(81), groundAt,
  });
  const mesh = create();
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const index = mesh.geometry.getIndex()!;
  assert.deepEqual(position.array, create().geometry.getAttribute('position').array);
  assert.ok(mesh.geometry.getAttribute('uv'));
  assert.ok(index.count / 3 <= MAGIC_RUINS_STYLE.lichen.maxTriangles);
  for (let i = 0; i < position.count; i++) {
    assert.ok(Math.abs(position.getY(i) - groundAt(position.getX(i), position.getZ(i))
      - MAGIC_RUINS_STYLE.lichen.lift) < 1e-5);
    assert.ok(normal.getY(i) > 0.8, 'lichen winding must face the sky');
  }
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    for (let j = 1; j <= 2; j++) {
      const b = index.getX(i + j);
      const distance = Math.hypot(position.getX(a) - position.getX(b), position.getZ(a) - position.getZ(b));
      assert.ok(distance <= MAGIC_RUINS_STYLE.lichen.maxCellSize * Math.SQRT2 + 1e-5);
    }
  }
  assert.ok(kit.materials.ground.normalNode);
  assert.ok(kit.materials.ground.opacityNode);
  assert.ok(kit.materials.ground.alphaTest > 0);
  assert.ok(kit.materials.ground.alphaToCoverage);
  assert.equal(kit.materials.ground.transparent, false, 'ground cover must keep opaque depth writes');
});

test('crystal facets face outward and portal keeps a bounded emissive structure', () => {
  const kit = createMagicRuinsModelKit();
  const crystal = kit.createCrystals('quality-crystal', 0, [{ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }]);
  const position = crystal.geometry.getAttribute('position');
  const normal = crystal.geometry.getAttribute('normal');
  for (let i = 0; i < position.count; i++) {
    assert.ok(Number.isFinite(position.getX(i)) && Number.isFinite(normal.getX(i)));
    if (Math.abs(normal.getY(i)) < 0.3) {
      assert.ok(position.getX(i) * normal.getX(i) + position.getZ(i) * normal.getZ(i) > 0,
        'crystal body normals must point outwards');
    }
  }
  assert.ok(MAGIC_RUINS_STYLE.magic.crystalEmission < 1);
  assert.ok(MAGIC_RUINS_STYLE.magic.portalEmission < 1.5);
  const portal = kit.createPortal(0, 1);
  const runes = portal.getObjectByName('portal:orbit-runes') as InstancedMesh;
  assert.equal(runes.count, 24);
  assert.equal(portal.children.filter((child) => child instanceof Mesh).length, 3);
  assert.equal(kit.materials.crystal[0]!.metalness, 0);
  assert.equal(kit.materials.crystal[0]!.transmission, 0, 'solid faceted gems need no full-screen transmission pass');
});

test('ruins grammar frames the ritual center and leaves its entrance axis free of crystal clutter', () => {
  for (const kind of ['sanctuary', 'watch-circle', 'forest-shrine'] as const) {
    for (const ruinSeed of [1, 42, 84, 109]) {
      const plan = { ...site, kind, ruinSeed };
      const a = assembleMagicRuinsSite(plan, terrain);
      const b = assembleMagicRuinsSite(plan, terrain);
      assert.deepEqual(a.blocks, b.blocks);
      assert.deepEqual(a.crystals, b.crystals);
      assert.ok(a.crystals.length >= 10);
      for (const crystal of a.crystals) {
        const [x, , z] = crystal.position;
        assert.ok(Math.hypot(x, z) > 4.8);
        assert.ok(!(z > -2 && Math.abs(x) < 3.6));
      }
      assert.ok(a.obstacles.length > 0);
      assert.ok(a.blocks.every((block) => [...block.position, ...block.rotation, ...block.scale].every(Number.isFinite)));
      assert.ok(a.blocks.length < 700);
    }
  }
});

test('approach composition steps inside a foreground ridge without raising walk eye height', () => {
  const ridge: TerrainSurface = {
    ...terrain,
    heightAt: (_x, z) => 300 + 6 * Math.exp(-(((z - 23) / 3.2) ** 2)),
    slopeAt: (_x, z) => Math.abs(12 * (z - 23) / (3.2 ** 2) * Math.exp(-(((z - 23) / 3.2) ** 2))),
  };
  const assembly = assembleMagicRuinsSite(site, ridge);
  const spawn = planMagicRuinsApproach(site, ridge, assembly.obstacles)!;
  assert.ok(spawn);
  assert.equal(spawn.mode, 'walk');
  assert.ok(spawn.position[2] < 20, 'the camera must step past the occluding ridge');
  assert.ok(Math.abs(spawn.position[1] - ridge.heightAt(spawn.position[0], spawn.position[2]) - 1.7) < 1e-8);
  assert.equal(buildHorizontalCollisionProbe(assembly.obstacles)(spawn.position[0], spawn.position[2], 0.52).blocked, false);
  assert.ok(spawn.pitch > 0, 'the camera should aim at the portal center, not a fixed downward angle');
  assert.deepEqual(spawn, planMagicRuinsApproach(site, ridge, assembly.obstacles));
});

test('approach planner rejects wet, steep or obstructed footings and has a safe no-site fallback', () => {
  assert.equal(planMagicRuinsApproach(site, { ...terrain, waterAt: () => 400 }, []), null);
  assert.equal(planMagicRuinsApproach(site, { ...terrain, slopeAt: () => 0.9 }, []), null);
  assert.equal(planMagicRuinsApproach(site, terrain, [{ id: 'blocked', a: [0, 0], b: [0, 40], radius: 3 }]), null);
  const rotated = { ...site, center: [120, -70] as [number, number], yaw: Math.PI / 2 };
  const spawn = planMagicRuinsApproach(rotated, terrain, [])!;
  assert.ok(spawn.position[0] > rotated.center[0]);
  assert.ok(Math.abs(spawn.position[2] - rotated.center[1]) <= 1.4 + 1e-6);
});
