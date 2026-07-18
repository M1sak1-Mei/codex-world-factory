import type { SegmentObstacle } from '../../../../core/Collision';
import { Rng } from '../../../../core/Seed';
import type { TerrainSurface } from '../../../core/WorldFeature';
import type {
  CityPartPlacement,
  CityPalettePlacement,
} from '../../../models/city-buildings';
import {
  CITY_BLOCK_COORDINATES,
  CITY_BLOCK_INNER,
  CITY_BLOCK_PITCH,
} from './CityBuildingsLayout';
import type { CityDistrictPlan } from './CityBuildingsPlanner';

export type CityBuildingArchetype = 'townhouse' | 'tower' | 'guildhall';

export interface CityDistrictAssembly {
  foundations: readonly CityPartPlacement[];
  walls: readonly CityPalettePlacement[];
  roofs: readonly CityPalettePlacement[];
  beams: readonly CityPartPlacement[];
  windows: readonly CityPartPlacement[];
  doors: readonly CityPartPlacement[];
  obstacles: readonly SegmentObstacle[];
  buildingCount: number;
  rng: Rng;
  groundAt(localX: number, localZ: number): number;
}

interface BuildingSpec {
  id: string;
  archetype: CityBuildingArchetype;
  x: number;
  z: number;
  yaw: number;
  width: number;
  depth: number;
  floors: number;
  palette: number;
}

class DistrictAssembler implements CityDistrictAssembly {
  readonly foundations: CityPartPlacement[] = [];
  readonly walls: CityPalettePlacement[] = [];
  readonly roofs: CityPalettePlacement[] = [];
  readonly beams: CityPartPlacement[] = [];
  readonly windows: CityPartPlacement[] = [];
  readonly doors: CityPartPlacement[] = [];
  readonly obstacles: SegmentObstacle[] = [];
  readonly rng: Rng;
  buildingCount = 0;

  constructor(
    readonly district: CityDistrictPlan,
    readonly terrain: TerrainSurface,
  ) {
    this.rng = new Rng(district.districtSeed);
  }

  private districtToWorld(localX: number, localZ: number): [number, number] {
    const ca = Math.cos(this.district.yaw);
    const sa = Math.sin(this.district.yaw);
    return [
      this.district.center[0] + ca * localX + sa * localZ,
      this.district.center[1] - sa * localX + ca * localZ,
    ];
  }

  groundAt(localX: number, localZ: number): number {
    const [x, z] = this.districtToWorld(localX, localZ);
    return this.terrain.heightAt(x, z) - this.district.baseY;
  }

  private buildingToDistrict(
    building: BuildingSpec,
    localX: number,
    localZ: number,
  ): [number, number] {
    const ca = Math.cos(building.yaw);
    const sa = Math.sin(building.yaw);
    return [
      building.x + ca * localX + sa * localZ,
      building.z - sa * localX + ca * localZ,
    ];
  }

  private part(
    building: BuildingSpec,
    localX: number,
    y: number,
    localZ: number,
    scale: [number, number, number],
    yawOffset = 0,
  ): CityPartPlacement {
    const [x, z] = this.buildingToDistrict(building, localX, localZ);
    return {
      position: [x, y, z],
      rotation: [0, building.yaw + yawOffset, 0],
      scale,
    };
  }

  private addObstacle(building: BuildingSpec): void {
    const margin = 0.55;
    const halfWidth = building.width * 0.5 + margin;
    const halfDepth = building.depth * 0.5 + margin;
    const localCorners = [
      [-halfWidth, -halfDepth],
      [halfWidth, -halfDepth],
      [halfWidth, halfDepth],
      [-halfWidth, halfDepth],
    ] as const;
    const worldCorners = localCorners.map(([x, z]) => {
      const [districtX, districtZ] = this.buildingToDistrict(building, x, z);
      return this.districtToWorld(districtX, districtZ);
    });
    for (let i = 0; i < worldCorners.length; i++) {
      const a = worldCorners[i] as [number, number];
      const b = worldCorners[(i + 1) % worldCorners.length] as [number, number];
      this.obstacles.push({
        id: `${this.district.id}:${building.id}:edge-${i}`,
        a,
        b,
        radius: 0.42,
      });
    }
  }

  private addFacadeWindows(
    building: BuildingSpec,
    ground: number,
    foundationHeight: number,
    bodyHeight: number,
    floorHeight: number,
  ): void {
    const facadeColumns = Math.max(2, Math.floor(building.width / 4.2));
    const sideColumns = Math.max(1, Math.floor(building.depth / 5.2));
    for (let floor = 0; floor < building.floors; floor++) {
      const y = ground + foundationHeight + floorHeight * (floor + 0.55);
      for (let column = 0; column < facadeColumns; column++) {
        const x = ((column + 1) / (facadeColumns + 1) - 0.5) * building.width;
        const isDoorBay = floor === 0 && column === Math.floor(facadeColumns / 2);
        if (!isDoorBay) {
          this.windows.push(this.part(
            building,
            x,
            y,
            building.depth * 0.5 + 0.09,
            [1.15, 1.45, 0.16],
          ));
        }
        this.windows.push(this.part(
          building,
          -x,
          y,
          -building.depth * 0.5 - 0.09,
          [1.15, 1.45, 0.16],
        ));
      }
      for (let column = 0; column < sideColumns; column++) {
        const z = ((column + 1) / (sideColumns + 1) - 0.5) * building.depth;
        this.windows.push(this.part(
          building,
          building.width * 0.5 + 0.09,
          y,
          z,
          [1.15, 1.45, 0.16],
          Math.PI * 0.5,
        ));
        this.windows.push(this.part(
          building,
          -building.width * 0.5 - 0.09,
          y,
          -z,
          [1.15, 1.45, 0.16],
          Math.PI * 0.5,
        ));
      }
    }
    this.doors.push(this.part(
      building,
      0,
      ground + foundationHeight + Math.min(bodyHeight * 0.24, 1.45),
      building.depth * 0.5 + 0.13,
      [1.55, 2.7, 0.24],
    ));
  }

  private addTimberFrame(
    building: BuildingSpec,
    ground: number,
    foundationHeight: number,
    bodyHeight: number,
    floorHeight: number,
  ): void {
    const bodyCenterY = ground + foundationHeight + bodyHeight * 0.5;
    for (const x of [-building.width * 0.5, building.width * 0.5]) {
      for (const z of [-building.depth * 0.5, building.depth * 0.5]) {
        this.beams.push(this.part(
          building,
          x,
          bodyCenterY,
          z,
          [0.28, bodyHeight + 0.35, 0.28],
        ));
      }
    }
    for (let level = 0; level <= building.floors; level++) {
      const y = ground + foundationHeight + Math.min(level * floorHeight, bodyHeight);
      for (const z of [-building.depth * 0.5 - 0.04, building.depth * 0.5 + 0.04]) {
        this.beams.push(this.part(
          building,
          0,
          y,
          z,
          [building.width + 0.45, 0.28, 0.28],
        ));
      }
      for (const x of [-building.width * 0.5 - 0.04, building.width * 0.5 + 0.04]) {
        this.beams.push(this.part(
          building,
          x,
          y,
          0,
          [building.depth + 0.45, 0.28, 0.28],
          Math.PI * 0.5,
        ));
      }
    }
  }

  private footprintIsDry(building: BuildingSpec): boolean {
    const halfWidth = building.width * 0.5 + 0.6;
    const halfDepth = building.depth * 0.5 + 0.6;
    for (const [localX, localZ] of [
      [0, 0],
      [-halfWidth, -halfDepth],
      [halfWidth, -halfDepth],
      [halfWidth, halfDepth],
      [-halfWidth, halfDepth],
    ] as const) {
      const [districtX, districtZ] = this.buildingToDistrict(building, localX, localZ);
      const [worldX, worldZ] = this.districtToWorld(districtX, districtZ);
      const ground = this.terrain.heightAt(worldX, worldZ);
      if (this.terrain.waterAt(worldX, worldZ) > ground - 0.45) return false;
    }
    return true;
  }

  addBuilding(building: BuildingSpec): void {
    const [worldX, worldZ] = this.districtToWorld(building.x, building.z);
    const lotRelief = this.terrain.reliefAt(
      worldX,
      worldZ,
      Math.max(building.width, building.depth) * 0.55,
      8,
    );
    if (!this.footprintIsDry(building) || lotRelief > 8.5) return;
    const ground = this.groundAt(building.x, building.z);
    const foundationHeight = 1.15
      + Math.min(lotRelief * 0.55, 3.1)
      + this.rng.range(0.05, 0.35);
    const floorHeight = building.archetype === 'guildhall' ? 3.35 : 2.85;
    const bodyHeight = building.floors * floorHeight;
    const roofHeight = building.archetype === 'tower'
      ? 5.6
      : Math.max(3.8, Math.min(building.width, building.depth) * 0.42);

    this.foundations.push(this.part(
      building,
      0,
      ground + foundationHeight * 0.5,
      0,
      [building.width + 1.3, foundationHeight, building.depth + 1.3],
    ));
    this.walls.push({
      ...this.part(
        building,
        0,
        ground + foundationHeight + bodyHeight * 0.5,
        0,
        [building.width, bodyHeight, building.depth],
      ),
      palette: building.palette,
    });
    this.roofs.push({
      ...this.part(
        building,
        0,
        ground + foundationHeight + bodyHeight + roofHeight * 0.5,
        0,
        [building.width * 0.58, roofHeight, building.depth * 0.58],
        Math.PI * 0.25,
      ),
      palette: building.palette,
    });
    this.addTimberFrame(building, ground, foundationHeight, bodyHeight, floorHeight);
    this.addFacadeWindows(building, ground, foundationHeight, bodyHeight, floorHeight);
    this.addObstacle(building);
    this.buildingCount++;
  }
}

function housingArchetype(rng: Rng): CityBuildingArchetype {
  return rng.chance(0.14) ? 'tower' : 'townhouse';
}

function buildMerchantQuarter(assembler: DistrictAssembler): void {
  let buildingIndex = 0;
  for (const blockX of CITY_BLOCK_COORDINATES) {
    for (const blockZ of CITY_BLOCK_COORDINATES) {
      const centerX = blockX * CITY_BLOCK_PITCH;
      const centerZ = blockZ * CITY_BLOCK_PITCH;
      if (blockX === 0 && blockZ === 0) {
        assembler.addBuilding({
          id: `building-${++buildingIndex}`,
          archetype: 'guildhall',
          x: centerX,
          z: centerZ,
          yaw: 0,
          width: 25,
          depth: 19,
          floors: 3,
          palette: 2,
        });
        continue;
      }
      const lotOffset = CITY_BLOCK_INNER * 0.245;
      for (const offsetX of [-lotOffset, lotOffset]) {
        for (const offsetZ of [-lotOffset, lotOffset]) {
          const archetype = housingArchetype(assembler.rng);
          const faceX = offsetX;
          const faceZ = offsetZ;
          const yaw = Math.atan2(faceX, faceZ);
          const jitterX = assembler.rng.range(-0.75, 0.75);
          const jitterZ = assembler.rng.range(-0.75, 0.75);
          assembler.addBuilding({
            id: `building-${++buildingIndex}`,
            archetype,
            x: centerX + offsetX + jitterX,
            z: centerZ + offsetZ + jitterZ,
            yaw,
            width: assembler.rng.range(12.1, 14.2),
            depth: assembler.rng.range(11.8, 13.8),
            floors: archetype === 'tower' ? 4 : 2 + assembler.rng.int(2),
            palette: assembler.rng.int(3),
          });
        }
      }
    }
  }
}

/** Pure procedural expansion: district plan in, render-agnostic placements out. */
export function assembleCityDistrict(
  district: CityDistrictPlan,
  terrain: TerrainSurface,
): CityDistrictAssembly {
  const assembler = new DistrictAssembler(district, terrain);
  buildMerchantQuarter(assembler);
  return assembler;
}
