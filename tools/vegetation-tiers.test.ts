import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Matrix4, type BufferAttribute } from 'three';
import { WorldSeed } from '../src/core/Seed';
import { BARK_TABLE } from '../src/gpu/passes/BarkSynth';
import { buildLeaf, buildNeedleSpray } from '../src/vegetation/LeafMesh';
import { OAK, SPRUCE, TREE_SPECIES } from '../src/vegetation/Species';
import { buildTree } from '../src/vegetation/TreeBuilder';
import { MeshGrower } from '../src/vegetation/TubeMesh';
import type { SpeciesParams } from '../src/vegetation/VegTypes';
import {
  ANCIENT_OAK_SURFACE,
  VEGETATION_TIER_POLICY,
  barkProfileForTier,
  vegetationSurfaceProfile,
} from '../src/vegetation/VegetationProfiles';

const TEST_OAK: SpeciesParams = {
  ...OAK,
  height: [7, 7],
  levels: OAK.levels.map((level, i) => ({
    ...level,
    density: i === 0 ? 0 : level.density * 0.2,
  })),
};

const heroOptions = {
  foliageMode: 'hybrid' as const,
  hero: { cardTarget: 80, meshAnchorTarget: 80, barkK: 0.65 },
};

function branchPoints(tree: ReturnType<typeof buildTree>): number[][][] {
  return tree.skeleton.branches.map((branch) =>
    branch.pts.map((point) => [point.x, point.y, point.z]),
  );
}

test('ancient oak selects a complete PBR and geometry profile', () => {
  assert.equal(vegetationSurfaceProfile('oak'), ANCIENT_OAK_SURFACE);
  assert.equal(vegetationSurfaceProfile('spruce').hero.enabled, true);
  assert.ok(ANCIENT_OAK_SURFACE.bark.parallaxScale > 0);
  assert.ok(ANCIENT_OAK_SURFACE.bark.parallaxSteps >= 4);
  assert.ok(ANCIENT_OAK_SURFACE.bark.cavityStrength >= 0.35);
  assert.ok(ANCIENT_OAK_SURFACE.leaf.veinNormal > 0);
  assert.ok(ANCIENT_OAK_SURFACE.hero.roots.count >= 6);
  assert.ok(ANCIENT_OAK_SURFACE.hero.defects.knots > 0);
  assert.ok(ANCIENT_OAK_SURFACE.hero.leaf.rows >= 14);
  assert.ok(ANCIENT_OAK_SURFACE.hero.leaf.lobeDepth >= 0.3);
  assert.ok(ANCIENT_OAK_SURFACE.hero.leaf.veinPairs >= 6);
  assert.ok(ANCIENT_OAK_SURFACE.hero.leaf.meshAnchorTarget <= 400);
  assert.equal(OAK.barkLayer, 6);
  assert.ok((BARK_TABLE[OAK.barkLayer]?.secondaryCrack ?? 0) > 0.4);
  assert.ok((BARK_TABLE[OAK.barkLayer]?.normalK ?? 0) > 4);
  assert.ok(
    barkProfileForTier(ANCIENT_OAK_SURFACE, 'near').parallaxSteps <
      barkProfileForTier(ANCIENT_OAK_SURFACE, 'hero').parallaxSteps,
  );
  assert.equal(barkProfileForTier(ANCIENT_OAK_SURFACE, 'mid').parallaxScale, 0);
});

test('hero oak leaf resolves repeated lobes and a thick curved blade', () => {
  const grower = new MeshGrower();
  const leaf = ANCIENT_OAK_SURFACE.hero.leaf;
  buildLeaf(
    grower,
    new Matrix4(),
    OAK.foliage!.leaf,
    0,
    0.7,
    1.37,
    1,
    leaf,
  );
  const geometry = grower.build();
  const positions = geometry.getAttribute('position') as BufferAttribute;
  const vertsPerRow = 10; // five front + five back
  const widths: number[] = [];
  for (let row = 0; row <= leaf.rows; row++) {
    let minX = Infinity;
    let maxX = -Infinity;
    for (let column = 0; column < 5; column++) {
      const x = positions.getX(row * vertsPerRow + column);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    widths.push(maxX - minX);
  }
  let localPeaks = 0;
  for (let i = 1; i < widths.length - 1; i++) {
    if ((widths[i] as number) > (widths[i - 1] as number) &&
        (widths[i] as number) > (widths[i + 1] as number)) localPeaks++;
  }
  assert.ok(localPeaks >= 4, `expected repeated oak lobes, got ${localPeaks}`);
  assert.equal(grower.triCount, 331);
  geometry.computeBoundingBox();
  assert.ok((geometry.boundingBox?.max.y ?? 0) - (geometry.boundingBox?.min.y ?? 0) > 0.1);
});

test('vegetation bands are ordered and cap costly oak heroes at twenty', () => {
  assert.ok(VEGETATION_TIER_POLICY.hero.far < VEGETATION_TIER_POLICY.near.far);
  assert.ok(VEGETATION_TIER_POLICY.near.far < VEGETATION_TIER_POLICY.mid.far);
  assert.equal(VEGETATION_TIER_POLICY.hero.maxPerVariant * 4, 20);
});

test('every tree species owns a complete realistic surface contract', () => {
  assert.equal(new Set(TREE_SPECIES.map((species) => species.barkLayer)).size, TREE_SPECIES.length);
  assert.ok(BARK_TABLE.length >= TREE_SPECIES.length);
  const profileIds = new Set<string>();
  for (const species of TREE_SPECIES) {
    const profile = vegetationSurfaceProfile(species.id);
    assert.ok(profile.hero.enabled, `${species.id} must opt into hero realization`);
    assert.ok(profile.bark.parallaxSteps >= 3, `${species.id} needs near relief sampling`);
    assert.ok(profile.bark.normalScale > 0.8, `${species.id} needs a readable normal response`);
    assert.ok(profile.hero.roots.count >= 5, `${species.id} needs a rooted trunk transition`);
    assert.ok(profile.hero.bark.ridgeCount >= 5, `${species.id} needs silhouette breakup`);
    assert.ok(!profileIds.has(profile.id), `${species.id} surface id must be unique`);
    profileIds.add(profile.id);
    if (species.foliage?.kind === 'leafCluster') {
      assert.ok(profile.hero.leaf.columns >= 5);
      assert.ok(profile.hero.leaf.rows >= 10);
      assert.ok(profile.leaf.veinNormal >= 0.2);
    } else if (species.foliage?.kind === 'needleSpray') {
      assert.ok(profile.hero.leaf.needleSegments >= 2);
      assert.ok(profile.hero.leaf.needleCrossPlanes >= 2);
    }
  }
});

test('enhanced surface preserves every species skeleton and enriches its bark', () => {
  const seed = new WorldSeed(8419);
  for (const species of TREE_SPECIES) {
    const compact: SpeciesParams = {
      ...species,
      height: [6, 6],
      levels: species.levels.map((level, i) => ({
        ...level,
        density: i === 0 ? 0 : level.density * 0.08,
      })),
    };
    const options = { foliageMode: 'cards' as const, hero: { barkK: 0.55 } };
    const baseline = buildTree(compact, seed.rng(`all/${species.id}`), {
      ...options,
      heroSurface: false,
    });
    const enhanced = buildTree(compact, seed.rng(`all/${species.id}`), {
      ...options,
      heroSurface: true,
    });
    assert.deepEqual(branchPoints(enhanced), branchPoints(baseline), species.id);
    assert.equal(enhanced.stats.anchors, baseline.stats.anchors, species.id);
    assert.ok(
      (enhanced.bark.index?.count ?? 0) > (baseline.bark.index?.count ?? 0),
      `${species.id} enhanced bark should add resolved surface geometry`,
    );
  }
});

test('hero conifer needles use curved crossed ribbons', () => {
  const grower = new MeshGrower();
  const shape = { ...SPRUCE.foliage!.leaf, needleCount: 4 };
  buildNeedleSpray(
    grower,
    new Matrix4(),
    shape,
    0.3,
    new WorldSeed(84).rng('needle/unit'),
    0,
    0.6,
    1.2,
    1,
    vegetationSurfaceProfile('spruce').hero.leaf,
  );
  // 8 stem triangles + 4 needles × 2 segments × 2 planes × 2 triangles.
  assert.equal(grower.triCount, 40);
});

test('hero surface preserves the seeded skeleton while enriching geometry', () => {
  const seed = new WorldSeed(8407);
  const baseline = buildTree(TEST_OAK, seed.rng('oak/control'), {
    ...heroOptions,
    heroSurface: false,
  });
  const enhanced = buildTree(TEST_OAK, seed.rng('oak/control'), {
    ...heroOptions,
    heroSurface: true,
  });

  assert.deepEqual(branchPoints(enhanced), branchPoints(baseline));
  assert.equal(enhanced.stats.anchors, baseline.stats.anchors);
  assert.equal(enhanced.stats.branches, baseline.stats.branches);
  assert.ok((enhanced.bark.index?.count ?? 0) > (baseline.bark.index?.count ?? 0) * 1.5);
  assert.ok(
    (enhanced.foliageMesh?.index?.count ?? 0) >
      (baseline.foliageMesh?.index?.count ?? 0) * 1.5,
  );

  enhanced.bark.computeBoundingBox();
  baseline.bark.computeBoundingBox();
  const eb = enhanced.bark.boundingBox;
  const bb = baseline.bark.boundingBox;
  assert.ok(eb && bb);
  const enhancedSpan = Math.max(eb.max.x - eb.min.x, eb.max.z - eb.min.z);
  const baselineSpan = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  assert.ok(enhancedSpan > baselineSpan + 1);

  const vdata = enhanced.bark.getAttribute('vdata') as BufferAttribute;
  let minAo = 1;
  for (let i = 0; i < vdata.count; i++) minAo = Math.min(minAo, vdata.getW(i));
  assert.ok(minAo <= 0.22, 'recessed scar vertices carry dark cavity AO');

  const positions = enhanced.bark.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    assert.ok(Number.isFinite(positions.getX(i)));
    assert.ok(Number.isFinite(positions.getY(i)));
    assert.ok(Number.isFinite(positions.getZ(i)));
  }
});
