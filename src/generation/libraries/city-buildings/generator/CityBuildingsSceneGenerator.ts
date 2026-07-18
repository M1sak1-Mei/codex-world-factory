import { Group, Vector3, type PerspectiveCamera } from 'three';
import type { SegmentObstacle } from '../../../../core/Collision';
import type {
  FeatureSpawn,
  TerrainSurface,
  WorldFeatureRuntime,
} from '../../../core/WorldFeature';
import type {
  CityBuildingsModelKit,
  CityPalettePlacement,
  CityPartPlacement,
} from '../../../models/city-buildings';
import { assembleCityDistrict } from './CityBuildingsGrammar';
import { CITY_ENTRANCE_ANGLE } from './CityBuildingsLayout';
import type { CityDistrictPlan } from './CityBuildingsPlanner';

interface DistrictStats {
  buildings: number;
  windows: number;
  structuralParts: number;
}

interface BuiltDistrict {
  group: Group;
  detailGroup: Group;
  obstacles: readonly SegmentObstacle[];
  stats: DistrictStats;
  update(camera: PerspectiveCamera): void;
}

function palettePlacements(
  placements: readonly CityPalettePlacement[],
  palette: number,
): CityPartPlacement[] {
  return placements.filter((placement) => placement.palette === palette);
}

function buildDistrict(
  district: CityDistrictPlan,
  terrain: TerrainSurface,
  models: CityBuildingsModelKit,
): BuiltDistrict {
  const assembly = assembleCityDistrict(district, terrain);
  const group = new Group();
  group.name = `city:${district.id}`;
  group.position.set(district.center[0], district.baseY, district.center[1]);
  group.rotation.y = district.yaw;

  const structureGroup = new Group();
  structureGroup.name = `${district.id}:structures`;
  structureGroup.add(models.createFoundations(
    `${district.id}:foundations`,
    assembly.foundations,
  ));
  for (let palette = 0; palette < 3; palette++) {
    const walls = palettePlacements(assembly.walls, palette);
    const roofs = palettePlacements(assembly.roofs, palette);
    if (walls.length > 0) {
      structureGroup.add(models.createWalls(
        `${district.id}:walls-${palette}`,
        palette,
        walls,
      ));
    }
    if (roofs.length > 0) {
      structureGroup.add(models.createRoofs(
        `${district.id}:roofs-${palette}`,
        palette,
        roofs,
      ));
    }
  }
  group.add(structureGroup);

  const detailGroup = new Group();
  detailGroup.name = `${district.id}:architectural-details`;
  detailGroup.add(models.createBeams(`${district.id}:timber-frames`, assembly.beams));
  detailGroup.add(models.createWindows(`${district.id}:windows`, assembly.windows));
  detailGroup.add(models.createDoors(`${district.id}:doors`, assembly.doors));
  group.add(detailGroup);

  const worldCenter = new Vector3(district.center[0], district.baseY, district.center[1]);
  return {
    group,
    detailGroup,
    obstacles: assembly.obstacles,
    stats: {
      buildings: assembly.buildingCount,
      windows: assembly.windows.length,
      structuralParts:
        assembly.foundations.length
        + assembly.walls.length
        + assembly.roofs.length
        + assembly.beams.length,
    },
    update(camera): void {
      const distanceSq = camera.position.distanceToSquared(worldCenter);
      group.visible = distanceSq < 3600 * 3600;
      detailGroup.visible = distanceSq < 1050 * 1050;
    },
  };
}

function primarySpawnFor(
  districts: readonly CityDistrictPlan[],
  terrain: TerrainSurface,
): FeatureSpawn | null {
  const district = districts[0];
  if (!district) return null;
  const spawnDistance = district.radius + 8;
  const localX = Math.cos(CITY_ENTRANCE_ANGLE) * spawnDistance;
  const localZ = Math.sin(CITY_ENTRANCE_ANGLE) * spawnDistance;
  const ca = Math.cos(district.yaw);
  const sa = Math.sin(district.yaw);
  const x = district.center[0] + ca * localX + sa * localZ;
  const z = district.center[1] - sa * localX + ca * localZ;
  const dx = district.center[0] - x;
  const dz = district.center[1] - z;
  return {
    position: [x, terrain.heightAt(x, z) + 1.7, z],
    yaw: Math.atan2(-dx, -dz),
    pitch: -0.045,
    mode: 'walk',
  };
}

/** Scene orchestration: renderable models are injected and planning stays pure. */
export function generateCityBuildingsScene(
  districts: readonly CityDistrictPlan[],
  terrain: TerrainSurface,
  models: CityBuildingsModelKit,
): WorldFeatureRuntime {
  const root = new Group();
  root.name = 'feature-library:city-buildings';
  const builtDistricts = districts.map((district) => buildDistrict(district, terrain, models));
  for (const district of builtDistricts) root.add(district.group);
  return {
    group: root,
    primarySpawn: primarySpawnFor(districts, terrain),
    obstacles: builtDistricts.flatMap((district) => district.obstacles),
    stats: {
      'features.cityDistricts': districts.length,
      'features.cityBuildings': builtDistricts.reduce(
        (sum, district) => sum + district.stats.buildings,
        0,
      ),
      'features.cityWindows': builtDistricts.reduce(
        (sum, district) => sum + district.stats.windows,
        0,
      ),
      'features.cityStructuralParts': builtDistricts.reduce(
        (sum, district) => sum + district.stats.structuralParts,
        0,
      ),
    },
    update(camera): void {
      for (const district of builtDistricts) district.update(camera);
    },
  };
}
