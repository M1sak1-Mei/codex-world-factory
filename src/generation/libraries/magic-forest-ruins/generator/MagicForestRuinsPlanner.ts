import type { Rng } from '../../../../core/Seed';
import type {
  ScatterExclusionZone,
  TerrainSurface,
  WorldFeaturePlan,
  WorldFeaturePlanContext,
} from '../../../core/WorldFeature';
import {
  MAGIC_RUINS_SITE_RADIUS,
  MAGIC_RUINS_TARGET_DISTANCE,
  SANCTUARY_ENTRANCE_ANGLE,
} from './MagicForestRuinsLayout';
import {
  magicForestRuinsRecipe,
  type MagicForestRuinsRecipe,
  type MagicRuinsSiteKind,
} from './MagicForestRuinsRecipe';

export interface MagicRuinsSitePlan {
  id: string;
  kind: MagicRuinsSiteKind;
  center: [number, number];
  baseY: number;
  radius: number;
  yaw: number;
  ruinSeed: number;
  magicVariant: number;
  slope: number;
  relief: number;
}

export interface MagicForestRuinsPlan extends WorldFeaturePlan {
  libraryId: 'magic-forest-ruins';
  sites: MagicRuinsSitePlan[];
}

interface Candidate {
  x: number;
  z: number;
  y: number;
  slope: number;
  relief: number;
  score: number;
}

function footprintIsDry(
  terrain: TerrainSurface,
  x: number,
  z: number,
  radius: number,
): boolean {
  const rings = [0, 0.45, 0.78, 1] as const;
  for (const ring of rings) {
    const samples = ring === 0 ? 1 : 12;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius * ring;
      const pz = z + Math.sin(angle) * radius * ring;
      const ground = terrain.heightAt(px, pz);
      if (terrain.waterAt(px, pz) > ground - 0.35) return false;
    }
  }
  return true;
}

function candidateScore(
  terrain: TerrainSurface,
  recipe: MagicForestRuinsRecipe,
  kind: MagicRuinsSiteKind,
  x: number,
  z: number,
  radius: number,
): Candidate | null {
  const y = terrain.heightAt(x, z);
  if (
    !footprintIsDry(terrain, x, z, radius + 8)
    || y < recipe.minAltitude
    || y > recipe.maxAltitude
  ) return null;
  const slope = terrain.slopeAt(x, z, 8);
  const relief = terrain.reliefAt(x, z, radius, 16);
  if (slope > recipe.maxSlope * 1.45 || relief > recipe.maxRelief * 1.65) return null;
  const distance = Math.hypot(x, z);
  const targetDistance = MAGIC_RUINS_TARGET_DISTANCE[kind];
  const altitudeTarget = kind === 'sanctuary' ? 290 : kind === 'watch-circle' ? 390 : 330;
  const score =
    (slope / recipe.maxSlope) * 3.2
    + (relief / recipe.maxRelief) * 2.5
    + Math.abs(y - altitudeTarget) / 420
    + Math.abs(distance - targetDistance) / Math.max(targetDistance, 1);
  return { x, z, y, slope, relief, score };
}

function isSpaced(
  candidate: Candidate,
  sites: readonly MagicRuinsSitePlan[],
  spacing: number,
): boolean {
  return sites.every((site) =>
    Math.hypot(candidate.x - site.center[0], candidate.z - site.center[1]) >= spacing,
  );
}

function pickSite(
  terrain: TerrainSurface,
  recipe: MagicForestRuinsRecipe,
  kind: MagicRuinsSiteKind,
  rng: Rng,
  worldHalf: number,
  sites: readonly MagicRuinsSitePlan[],
): Candidate {
  const radius = MAGIC_RUINS_SITE_RADIUS[kind];
  const target = MAGIC_RUINS_TARGET_DISTANCE[kind];
  const candidates: Candidate[] = [];
  for (let i = 0; i < 520; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = Math.max(100, target + rng.gauss() * (target * 0.34 + 120));
    const x = Math.cos(angle) * distance + rng.range(-100, 100);
    const z = Math.sin(angle) * distance + rng.range(-100, 100);
    if (Math.abs(x) > worldHalf - 150 || Math.abs(z) > worldHalf - 150) continue;
    const candidate = candidateScore(terrain, recipe, kind, x, z, radius);
    if (!candidate || !isSpaced(candidate, sites, recipe.minSpacing)) continue;
    candidates.push(candidate);
  }
  candidates.sort((a, b) => a.score - b.score);
  const strict = candidates.find(
    (candidate) => candidate.slope <= recipe.maxSlope && candidate.relief <= recipe.maxRelief,
  );
  const selected = strict ?? candidates[0];
  if (!selected) throw new Error(`Unable to place magic ruins site: ${kind}`);
  return selected;
}

function exclusionFor(site: MagicRuinsSitePlan): ScatterExclusionZone {
  return {
    id: `ruins-clearance:${site.id}`,
    center: site.center,
    treeRadius: site.radius + 8,
    understoryRadius: site.radius,
    extrasRadius: Math.max(site.radius - 1, 10),
    stonesRadius: Math.max(site.radius - 6, 8),
  };
}

function accessExclusionsFor(site: MagicRuinsSitePlan): ScatterExclusionZone[] {
  if (site.kind !== 'sanctuary') return [];
  const localX = Math.cos(SANCTUARY_ENTRANCE_ANGLE);
  const localZ = Math.sin(SANCTUARY_ENTRANCE_ANGLE);
  const ca = Math.cos(site.yaw);
  const sa = Math.sin(site.yaw);
  const dirX = ca * localX + sa * localZ;
  const dirZ = -sa * localX + ca * localZ;
  return [
    { distance: site.radius + 5, treeRadius: 16 },
    { distance: site.radius + 17, treeRadius: 10 },
  ].map((spec, index) => ({
    id: `ruins-access:${site.id}:${index}`,
    center: [
      site.center[0] + dirX * spec.distance,
      site.center[1] + dirZ * spec.distance,
    ] as const,
    treeRadius: spec.treeRadius,
    understoryRadius: index === 0 ? 4 : 2,
    extrasRadius: 2,
    stonesRadius: 1,
  }));
}

export function planMagicForestRuins(
  recipeId: string,
  context: WorldFeaturePlanContext,
): MagicForestRuinsPlan {
  const recipe = magicForestRuinsRecipe(recipeId);
  const sites: MagicRuinsSitePlan[] = [];
  for (let i = 0; i < recipe.siteKinds.length; i++) {
    const kind = recipe.siteKinds[i] as MagicRuinsSiteKind;
    const rng = context.seed.rng(`feature/magic-forest-ruins/${recipe.id}/site-${i}`);
    const candidate = pickSite(
      context.terrain,
      recipe,
      kind,
      rng,
      context.worldHalf,
      sites,
    );
    sites.push({
      id: `${kind}-${i + 1}`,
      kind,
      center: [candidate.x, candidate.z],
      baseY: candidate.y,
      radius: MAGIC_RUINS_SITE_RADIUS[kind],
      yaw: rng.range(-Math.PI, Math.PI),
      ruinSeed: rng.u32(),
      magicVariant: rng.int(3),
      slope: candidate.slope,
      relief: candidate.relief,
    });
  }
  return {
    libraryId: 'magic-forest-ruins',
    recipeId: recipe.id,
    sites,
    exclusions: sites.flatMap((site) => [exclusionFor(site), ...accessExclusionsFor(site)]),
  };
}
