import type { Rng } from '../../../../core/Seed';
import type {
  ScatterExclusionZone,
  TerrainSurface,
  WorldFeaturePlan,
  WorldFeaturePlanContext,
} from '../../../core/WorldFeature';
import {
  CITY_BLOCK_COORDINATES,
  CITY_BLOCK_INNER,
  CITY_BLOCK_PITCH,
  CITY_DISTRICT_RADIUS,
  CITY_ENTRANCE_ANGLE,
} from './CityBuildingsLayout';
import {
  cityBuildingsRecipe,
  type CityBuildingsRecipe,
  type CityDistrictKind,
} from './CityBuildingsRecipe';

export interface CityDistrictPlan {
  id: string;
  kind: CityDistrictKind;
  center: [number, number];
  baseY: number;
  radius: number;
  yaw: number;
  districtSeed: number;
  slope: number;
  relief: number;
}

export interface CityBuildingsPlan extends WorldFeaturePlan {
  libraryId: 'city-buildings';
  districts: CityDistrictPlan[];
}

interface Candidate {
  x: number;
  z: number;
  y: number;
  slope: number;
  relief: number;
  buildableLotRatio: number;
  score: number;
}

function lotIsDry(
  terrain: TerrainSurface,
  x: number,
  z: number,
): boolean {
  const radius = 9.5;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const pz = z + Math.sin(angle) * radius;
    const ground = terrain.heightAt(px, pz);
    if (terrain.waterAt(px, pz) > ground - 0.45) return false;
  }
  return true;
}

function localBuildingLots(): Array<readonly [number, number]> {
  const lotOffset = CITY_BLOCK_INNER * 0.245;
  const lots: Array<readonly [number, number]> = [[0, 0]];
  for (const blockX of CITY_BLOCK_COORDINATES) {
    for (const blockZ of CITY_BLOCK_COORDINATES) {
      if (blockX === 0 && blockZ === 0) continue;
      for (const offsetX of [-lotOffset, lotOffset]) {
        for (const offsetZ of [-lotOffset, lotOffset]) {
          lots.push([
            blockX * CITY_BLOCK_PITCH + offsetX,
            blockZ * CITY_BLOCK_PITCH + offsetZ,
          ]);
        }
      }
    }
  }
  return lots;
}

function localToWorld(
  centerX: number,
  centerZ: number,
  yaw: number,
  localX: number,
  localZ: number,
): [number, number] {
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  return [
    centerX + ca * localX + sa * localZ,
    centerZ - sa * localX + ca * localZ,
  ];
}

function lotIsBuildable(terrain: TerrainSurface, x: number, z: number): boolean {
  return lotIsDry(terrain, x, z) && terrain.reliefAt(x, z, 10, 8) <= 8.5;
}

function buildableLotRatio(
  terrain: TerrainSurface,
  centerX: number,
  centerZ: number,
  yaw: number,
): number {
  const lots = localBuildingLots();
  const buildable = lots.reduce((count, [localX, localZ]) => {
    const [x, z] = localToWorld(centerX, centerZ, yaw, localX, localZ);
    return count + (lotIsBuildable(terrain, x, z) ? 1 : 0);
  }, 0);
  return buildable / lots.length;
}

function accessIsDry(
  terrain: TerrainSurface,
  centerX: number,
  centerZ: number,
  yaw: number,
): boolean {
  for (const localZ of [CITY_DISTRICT_RADIUS - 12, CITY_DISTRICT_RADIUS + 8]) {
    const [x, z] = localToWorld(centerX, centerZ, yaw, 0, localZ);
    if (!lotIsDry(terrain, x, z)) return false;
  }
  return true;
}

function scoreCandidate(
  terrain: TerrainSurface,
  recipe: CityBuildingsRecipe,
  x: number,
  z: number,
  yaw: number,
): Candidate | null {
  const y = terrain.heightAt(x, z);
  if (
    y < recipe.minAltitude
    || y > recipe.maxAltitude
  ) return null;
  const slope = terrain.slopeAt(x, z, 12);
  const relief = terrain.reliefAt(x, z, CITY_DISTRICT_RADIUS, 32);
  if (
    slope > Math.max(recipe.maxSlope * 3, 0.72)
    || relief > Math.max(recipe.maxRelief * 5, 140)
    || !accessIsDry(terrain, x, z, yaw)
  ) return null;
  const buildableRatio = buildableLotRatio(terrain, x, z, yaw);
  if (buildableRatio < 0.18) return null;
  const distance = Math.hypot(x, z);
  const score =
    (slope / recipe.maxSlope) * 4.2
    + (relief / recipe.maxRelief) * 4.8
    + (1 - buildableRatio) * 18
    + Math.abs(y - 310) / 420
    + Math.abs(distance - recipe.targetDistance) / recipe.targetDistance;
  return { x, z, y, slope, relief, buildableLotRatio: buildableRatio, score };
}

function isSpaced(
  candidate: Candidate,
  districts: readonly CityDistrictPlan[],
  spacing: number,
): boolean {
  return districts.every((district) =>
    Math.hypot(candidate.x - district.center[0], candidate.z - district.center[1]) >= spacing,
  );
}

function pickDistrict(
  terrain: TerrainSurface,
  recipe: CityBuildingsRecipe,
  rng: Rng,
  yaw: number,
  worldHalf: number,
  districts: readonly CityDistrictPlan[],
): Candidate {
  const candidates: Candidate[] = [];
  for (let i = 0; i < 760; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = Math.max(
      CITY_DISTRICT_RADIUS + 80,
      recipe.targetDistance + rng.gauss() * 260,
    );
    const x = Math.cos(angle) * distance + rng.range(-90, 90);
    const z = Math.sin(angle) * distance + rng.range(-90, 90);
    const edge = worldHalf - CITY_DISTRICT_RADIUS - 80;
    if (Math.abs(x) > edge || Math.abs(z) > edge) continue;
    const candidate = scoreCandidate(terrain, recipe, x, z, yaw);
    if (!candidate || !isSpaced(candidate, districts, recipe.minSpacing)) continue;
    candidates.push(candidate);
  }
  candidates.sort((a, b) => a.score - b.score);
  const strict = candidates.find(
    (candidate) =>
      candidate.slope <= recipe.maxSlope
      && candidate.relief <= recipe.maxRelief
      && candidate.buildableLotRatio === 1,
  );
  const relaxed = candidates.find((candidate) => candidate.buildableLotRatio >= 0.55);
  const selected = strict ?? relaxed ?? candidates[0];
  if (!selected) throw new Error('Unable to place city district on dry, buildable terrain');
  return selected;
}

function districtExclusion(district: CityDistrictPlan): ScatterExclusionZone {
  return {
    id: `city-clearance:${district.id}`,
    center: district.center,
    treeRadius: district.radius + 10,
    understoryRadius: district.radius + 4,
    extrasRadius: district.radius,
    stonesRadius: district.radius - 4,
  };
}

function accessExclusions(district: CityDistrictPlan): ScatterExclusionZone[] {
  const localX = Math.cos(CITY_ENTRANCE_ANGLE);
  const localZ = Math.sin(CITY_ENTRANCE_ANGLE);
  const ca = Math.cos(district.yaw);
  const sa = Math.sin(district.yaw);
  const dirX = ca * localX + sa * localZ;
  const dirZ = -sa * localX + ca * localZ;
  return [district.radius + 8, district.radius + 25, district.radius + 42].map(
    (distance, index) => ({
      id: `city-access:${district.id}:${index}`,
      center: [
        district.center[0] + dirX * distance,
        district.center[1] + dirZ * distance,
      ] as const,
      treeRadius: 12 - index * 2,
      understoryRadius: 8 - index * 2,
      extrasRadius: 5,
      stonesRadius: 4,
    }),
  );
}

export function planCityBuildings(
  recipeId: string,
  context: WorldFeaturePlanContext,
): CityBuildingsPlan {
  const recipe = cityBuildingsRecipe(recipeId);
  const districts: CityDistrictPlan[] = [];
  for (let i = 0; i < recipe.districtKinds.length; i++) {
    const kind = recipe.districtKinds[i] as CityDistrictKind;
    const rng = context.seed.rng(`feature/city-buildings/${recipe.id}/district-${i}`);
    const yaw = rng.range(-Math.PI, Math.PI);
    const candidate = pickDistrict(
      context.terrain,
      recipe,
      rng,
      yaw,
      context.worldHalf,
      districts,
    );
    districts.push({
      id: `${kind}-${i + 1}`,
      kind,
      center: [candidate.x, candidate.z],
      baseY: candidate.y,
      radius: CITY_DISTRICT_RADIUS,
      yaw,
      districtSeed: rng.u32(),
      slope: candidate.slope,
      relief: candidate.relief,
    });
  }
  return {
    libraryId: 'city-buildings',
    recipeId: recipe.id,
    districts,
    exclusions: districts.flatMap((district) => [
      districtExclusion(district),
      ...accessExclusions(district),
    ]),
  };
}
