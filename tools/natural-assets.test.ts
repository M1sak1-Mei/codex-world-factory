import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Texture, type BufferAttribute, type BufferGeometry } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { WorldSeed } from '../src/core/Seed';
import {
  deadwoodMaterial,
  flowerMaterial,
  mushroomMaterial,
  rockMaterial,
} from '../src/render/VegMaterials';
import { buildLog, buildStump } from '../src/vegetation/Deadfall';
import { buildMushroom } from '../src/vegetation/Dressing';
import {
  barkChipGeometry,
  debrisMaterial,
  grassBladeGeometry,
  grassMaterial,
  litterMaterial,
  twigGeometry,
} from '../src/vegetation/GroundCover';
import { buildRock } from '../src/vegetation/RockBuilder';
import { buildFlower } from '../src/vegetation/Understory';
import { vegetationSurfaceProfile } from '../src/vegetation/VegetationProfiles';

function assertFiniteGeometry(geometry: BufferGeometry): void {
  const positions = geometry.getAttribute('position') as BufferAttribute;
  assert.ok(positions.count > 0);
  for (let i = 0; i < positions.count; i++) {
    assert.ok(Number.isFinite(positions.getX(i)));
    assert.ok(Number.isFinite(positions.getY(i)));
    assert.ok(Number.isFinite(positions.getZ(i)));
  }
}

test('all natural material families use physical shading and micro normals', () => {
  const texture = new Texture();
  const materials = [
    rockMaterial(),
    deadwoodMaterial({ texA: texture, texB: texture }),
    flowerMaterial({ r: 0.7, g: 0.2, b: 0.3 }),
    mushroomMaterial(),
    grassMaterial(),
    debrisMaterial('twig'),
    debrisMaterial('chip'),
    litterMaterial(texture),
  ];
  for (const material of materials) {
    assert.ok(material instanceof MeshPhysicalNodeMaterial, material.type);
    assert.ok(material.normalNode, `${material.type} needs a micro-normal source`);
  }
});

test('rock LODs share the generator while increasing resolved surface density', () => {
  const seed = new WorldSeed(8423);
  const low = buildRock('boulder', seed.rng('rock/same'), 2);
  const high = buildRock('boulder', seed.rng('rock/same'), 3);
  assert.equal(high.stats.tris, low.stats.tris * 4);
  assertFiniteGeometry(low.geometry);
  assertFiniteGeometry(high.geometry);
});

test('deadwood uses irregular hero tubes and keeps broken assets finite', () => {
  const seed = new WorldSeed(8427);
  const log = buildLog(seed.rng('dead/log'), 'rotten');
  const stump = buildStump(seed.rng('dead/stump'));
  assert.ok(log.tris > 300);
  assert.ok(stump.tris > 160);
  assertFiniteGeometry(log.geometry);
  assertFiniteGeometry(stump.geometry);
});

test('small flora and forest-floor meshes meet the curved geometry floor', () => {
  const seed = new WorldSeed(8431);
  const grass = grassBladeGeometry();
  assert.equal((grass.index?.count ?? 0) / 3, 11);
  const geometries = [
    grass,
    twigGeometry(seed.rng('floor/twig')),
    barkChipGeometry(seed.rng('floor/chip')),
    buildFlower('daisy', seed.rng('flora/daisy')),
    buildFlower('bell', seed.rng('flora/bell')),
    buildFlower('umbel', seed.rng('flora/umbel')),
    buildMushroom(seed.rng('flora/mushroom'), 'cap'),
    buildMushroom(seed.rng('flora/shelf'), 'shelf'),
  ];
  for (const geometry of geometries) assertFiniteGeometry(geometry);
});

test('captured understory sources have species-specific curved detail', () => {
  for (const id of ['bushHazel', 'bushPink']) {
    const leaf = vegetationSurfaceProfile(id).hero.leaf;
    assert.ok(leaf.columns >= 5);
    assert.ok(leaf.rows >= 9);
  }
  for (const id of ['bushJuniper', 'fern']) {
    const leaf = vegetationSurfaceProfile(id).hero.leaf;
    assert.ok(leaf.needleSegments >= 2);
    assert.ok(leaf.needleCrossPlanes >= 2);
  }
});
