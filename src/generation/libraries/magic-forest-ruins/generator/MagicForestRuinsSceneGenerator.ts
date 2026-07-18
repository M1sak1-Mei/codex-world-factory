import { Group, Vector3, type PerspectiveCamera } from 'three';
import type { SegmentObstacle } from '../../../../core/Collision';
import type {
  FeatureSpawn,
  TerrainSurface,
  WorldFeatureRuntime,
} from '../../../core/WorldFeature';
import type { MagicRuinsModelKit } from '../../../models/magic-ruins';
import { assembleMagicRuinsSite } from './MagicForestRuinsGrammar';
import { SANCTUARY_ENTRANCE_ANGLE } from './MagicForestRuinsLayout';
import type { MagicRuinsSitePlan } from './MagicForestRuinsPlanner';

interface SiteStats {
  blocks: number;
  crystals: number;
  portals: number;
}

interface BuiltSite {
  group: Group;
  detailGroup: Group;
  stats: SiteStats;
  obstacles: readonly SegmentObstacle[];
  update(camera: PerspectiveCamera): void;
}

function buildSite(
  site: MagicRuinsSitePlan,
  terrain: TerrainSurface,
  models: MagicRuinsModelKit,
): BuiltSite {
  const assembly = assembleMagicRuinsSite(site, terrain);
  const group = new Group();
  group.name = `ruins:${site.id}`;
  group.position.set(site.center[0], site.baseY, site.center[1]);
  group.rotation.y = site.yaw;

  group.add(models.createLichenColonies({
    name: `${site.id}:lichen-colonies`,
    siteId: site.id,
    radius: site.radius + 2,
    rng: assembly.rng,
    groundAt: (x, z) => assembly.groundAt(x, z),
  }));
  group.add(models.createStoneBlocks(`${site.id}:stone-blocks`, assembly.blocks));

  const detailGroup = new Group();
  detailGroup.name = `${site.id}:magic-details`;
  detailGroup.add(models.createCrystals(
    `${site.id}:crystal-spires`,
    site.magicVariant,
    assembly.crystals,
  ));
  for (const anchor of assembly.portals) {
    const portal = models.createPortal(site.magicVariant, anchor.scale);
    portal.position.set(anchor.x, anchor.y, anchor.z);
    detailGroup.add(portal);
  }
  group.add(detailGroup);

  const worldCenter = new Vector3(site.center[0], site.baseY, site.center[1]);
  return {
    group,
    detailGroup,
    stats: {
      blocks: assembly.blocks.length,
      crystals: assembly.crystals.length,
      portals: assembly.portals.length,
    },
    obstacles: assembly.obstacles,
    update(camera): void {
      const distanceSq = camera.position.distanceToSquared(worldCenter);
      group.visible = distanceSq < 2400 * 2400;
      detailGroup.visible = distanceSq < 720 * 720;
    },
  };
}

function primarySpawnFor(
  sites: readonly MagicRuinsSitePlan[],
  terrain: TerrainSurface,
): FeatureSpawn | null {
  const hero = sites.find((site) => site.kind === 'sanctuary') ?? sites[0];
  if (!hero) return null;
  const localX = Math.cos(SANCTUARY_ENTRANCE_ANGLE) * (hero.radius + 5);
  const localZ = Math.sin(SANCTUARY_ENTRANCE_ANGLE) * (hero.radius + 5);
  const ca = Math.cos(hero.yaw);
  const sa = Math.sin(hero.yaw);
  const x = hero.center[0] + ca * localX + sa * localZ;
  const z = hero.center[1] - sa * localX + ca * localZ;
  const dx = hero.center[0] - x;
  const dz = hero.center[1] - z;
  return {
    position: [x, terrain.heightAt(x, z) + 1.7, z],
    yaw: Math.atan2(-dx, -dz),
    pitch: -0.055,
    mode: 'walk',
  };
}

/**
 * Scene orchestration only. All visible primitives come from the injected
 * model kit; this generator owns placement, hierarchy, LOD, stats, and spawn.
 */
export function generateMagicForestRuinsScene(
  sites: readonly MagicRuinsSitePlan[],
  terrain: TerrainSurface,
  models: MagicRuinsModelKit,
): WorldFeatureRuntime {
  const root = new Group();
  root.name = 'feature-library:magic-forest-ruins';
  const builtSites = sites.map((site) => buildSite(site, terrain, models));
  for (const site of builtSites) root.add(site.group);
  return {
    group: root,
    primarySpawn: primarySpawnFor(sites, terrain),
    obstacles: builtSites.flatMap((site) => site.obstacles),
    stats: {
      'features.ruinsSites': sites.length,
      'features.ruinBlocks': builtSites.reduce((sum, site) => sum + site.stats.blocks, 0),
      'features.magicCrystals': builtSites.reduce((sum, site) => sum + site.stats.crystals, 0),
      'features.magicPortals': builtSites.reduce((sum, site) => sum + site.stats.portals, 0),
    },
    update(camera): void {
      for (const site of builtSites) site.update(camera);
    },
  };
}
