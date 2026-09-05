import type { SegmentObstacle } from '../../../../core/Collision';
import { hashCombine, hashString, Rng as SeededRng, type Rng } from '../../../../core/Seed';
import type { TerrainSurface } from '../../../core/WorldFeature';
import type {
  CrystalPlacement,
  StoneBlockPlacement,
} from '../../../models/magic-ruins';
import {
  SANCTUARY_ENTRANCE_SEGMENTS,
  SANCTUARY_SEGMENTS,
} from './MagicForestRuinsLayout';
import type { MagicRuinsSitePlan } from './MagicForestRuinsPlanner';

export interface PortalAnchor {
  x: number;
  y: number;
  z: number;
  scale: number;
}

/** Pure placement output: no Three.js meshes, materials, scene groups, or LOD. */
export interface MagicRuinsSiteAssembly {
  blocks: readonly StoneBlockPlacement[];
  crystals: readonly CrystalPlacement[];
  portals: readonly PortalAnchor[];
  obstacles: readonly SegmentObstacle[];
  rng: Rng;
  groundAt(localX: number, localZ: number): number;
}

class SiteAssembler implements MagicRuinsSiteAssembly {
  readonly blocks: StoneBlockPlacement[] = [];
  readonly crystals: CrystalPlacement[] = [];
  readonly portals: PortalAnchor[] = [];
  readonly obstacles: SegmentObstacle[] = [];
  readonly rng: Rng;
  private readonly dressingRng: Rng;

  constructor(
    readonly site: MagicRuinsSitePlan,
    readonly terrain: TerrainSurface,
  ) {
    this.rng = new SeededRng(site.ruinSeed);
    this.dressingRng = new SeededRng(hashCombine(site.ruinSeed, hashString('ruins/dressing-v2')));
  }

  private toWorld(localX: number, localZ: number): [number, number] {
    const ca = Math.cos(this.site.yaw);
    const sa = Math.sin(this.site.yaw);
    return [
      this.site.center[0] + ca * localX + sa * localZ,
      this.site.center[1] - sa * localX + ca * localZ,
    ];
  }

  groundAt(localX: number, localZ: number): number {
    const [x, z] = this.toWorld(localX, localZ);
    return this.terrain.heightAt(x, z) - this.site.baseY;
  }

  block(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    yaw = 0,
    tilt = 0,
  ): void {
    this.blocks.push({
      position: [x, y, z],
      rotation: [this.rng.range(-tilt, tilt), yaw, this.rng.range(-tilt, tilt)],
      scale: [sx, sy, sz],
    });
  }

  wall(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    courses: number,
    ruin: number,
  ): void {
    const [worldAx, worldAz] = this.toWorld(ax, az);
    const [worldBx, worldBz] = this.toWorld(bx, bz);
    this.obstacles.push({
      id: `${this.site.id}:wall-${this.obstacles.length}`,
      a: [worldAx, worldAz],
      b: [worldBx, worldBz],
      radius: 0.58,
    });
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dz, dx);
    const count = Math.max(1, Math.ceil(length / 1.55));
    const columnHeights = Array.from({ length: count }, (_unused, index) => {
      const edge = Math.min(index, count - 1 - index);
      const edgeLoss = edge === 0 ? this.rng.int(2) : 0;
      const erosion = Math.floor(this.rng.range(0, ruin + 0.22) * courses);
      return Math.max(1, courses - edgeLoss - erosion);
    });
    const columns = Array.from({ length: count }, (_unused, index) => {
      const t = Math.min(1, (index + 0.5) / count);
      const x = ax + dx * t;
      const z = az + dz * t;
      return { x, z, ground: this.groundAt(x, z) };
    });
    for (let course = 0; course < courses; course++) {
      for (let i = 0; i < count; i++) {
        if (course >= (columnHeights[i] as number)) continue;
        const column = columns[i] as { x: number; z: number; ground: number };
        const x = column.x + this.rng.range(-0.055, 0.055);
        const z = column.z + this.rng.range(-0.055, 0.055);
        const sy = this.rng.range(0.68, 0.88);
        this.block(
          x,
          column.ground + sy * 0.5 + course * 0.77,
          z,
          length / count * this.rng.range(0.88, 1.05),
          sy,
          this.rng.range(0.92, 1.18),
          yaw + this.rng.range(-0.025, 0.025),
          0.025,
        );
      }
    }
  }

  pillar(x: number, z: number, height: number, brokenness: number): void {
    const [worldX, worldZ] = this.toWorld(x, z);
    this.obstacles.push({
      id: `${this.site.id}:pillar-${this.obstacles.length}`,
      a: [worldX, worldZ],
      b: [worldX, worldZ],
      radius: 0.84,
    });
    const courses = Math.max(2, Math.floor(height / 0.82));
    const ground = this.groundAt(x, z);
    this.block(x, ground + 0.15, z, 1.62, 0.38, 1.62);
    for (let course = 0; course < courses; course++) {
      if (brokenness > 0 && course > 2 && this.rng.chance(brokenness + course * 0.035)) break;
      const taper = 1 - (course / courses) * 0.16;
      const sy = this.rng.range(0.7, 0.88);
      this.block(
        x + this.rng.range(-0.05, 0.05),
        ground + sy * 0.5 + course * 0.79 + 0.24,
        z + this.rng.range(-0.05, 0.05),
        this.rng.range(1.0, 1.24) * taper,
        sy,
        this.rng.range(1.0, 1.24) * taper,
        this.rng.range(-0.12, 0.12),
        0.018,
      );
    }
  }

  /** Keep a readable processional axis and empty ritual center in every site. */
  private dressingAllowed(x: number, z: number): boolean {
    return Math.hypot(x, z) > 4.8 && !(z > -2 && Math.abs(x) < 3.6);
  }

  arch(x: number, z: number, radius: number, springHeight: number): void {
    const ground = this.groundAt(x, z);
    const segments = 13;
    for (let i = 0; i < segments; i++) {
      const angle = (i + 0.5) / segments * Math.PI;
      this.blocks.push({
        position: [x + Math.cos(angle) * radius, ground + springHeight + Math.sin(angle) * radius, z],
        rotation: [0, 0, angle + Math.PI * 0.5],
        scale: [Math.PI * radius / segments * 0.94, 0.82, 1.3],
      });
    }
  }

  rubble(count: number): void {
    const rng = this.dressingRng;
    const wallFootings = this.blocks.filter((block) =>
      block.position[1] < this.groundAt(block.position[0], block.position[2]) + 0.8);
    for (let i = 0; i < count; i++) {
      // Debris comes from nearby collapsed masonry, not uniform noise over
      // the whole sanctuary. Keep the existing instanced stone draw call.
      const footing = rng.pick(wallFootings);
      const angle = rng.range(0, Math.PI * 2);
      const radius = rng.range(0.8, 3.2);
      const px = footing.position[0] + Math.cos(angle) * radius;
      const pz = footing.position[2] + Math.sin(angle) * radius;
      if (!this.dressingAllowed(px, pz)) continue;
      const scale = rng.range(0.22, 0.8);
      this.blocks.push({
        position: [px, this.groundAt(px, pz) + scale * 0.16, pz],
        rotation: [rng.range(-0.28, 0.28), rng.range(-Math.PI, Math.PI), rng.range(-0.28, 0.28)],
        scale: [scale * rng.range(0.8, 1.5), scale * rng.range(0.35, 0.7), scale * rng.range(0.65, 1.2)],
      });
    }
  }

  crystal(x: number, z: number, scale: number): void {
    this.crystals.push({
      position: [x, this.groundAt(x, z) + scale * 0.9, z],
      rotation: [this.dressingRng.range(-0.16, 0.16), this.dressingRng.range(-Math.PI, Math.PI), 0],
      scale,
    });
  }

  crystalClusters(clusters: number, radius: number, scale: number): void {
    const rng = this.dressingRng;
    for (let cluster = 0; cluster < clusters; cluster++) {
      // Leave the entrance quadrant open; groups frame the portal instead of
      // becoming equally spaced lone luminous cones throughout the clearing.
      const angle = (cluster + 0.25) / clusters * Math.PI * 2 + rng.range(-0.16, 0.16);
      let cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      if (cz > -2 && Math.abs(cx) < 5) cx = cx < 0 ? -5 : 5;
      for (let member = 0; member < 3; member++) {
        const x = cx + rng.range(-0.8, 0.8);
        const z = cz + rng.range(-0.8, 0.8);
        if (this.dressingAllowed(x, z)) this.crystal(x, z, scale * (member === 0 ? 1 : rng.range(0.32, 0.58)));
      }
    }
  }
}

function buildSanctuary(assembler: SiteAssembler): void {
  const radius = 24;
  for (let i = 0; i < SANCTUARY_SEGMENTS; i++) {
    if (
      SANCTUARY_ENTRANCE_SEGMENTS.has(i)
      || i === 8
      || assembler.rng.chance(0.08)
    ) continue;
    const a0 = (i / SANCTUARY_SEGMENTS) * Math.PI * 2;
    const a1 = ((i + 1) / SANCTUARY_SEGMENTS) * Math.PI * 2;
    assembler.wall(
      Math.cos(a0) * radius,
      Math.sin(a0) * radius,
      Math.cos(a1) * radius,
      Math.sin(a1) * radius,
      assembler.rng.int(4) + 4,
      0.12,
    );
  }
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.35;
    assembler.pillar(Math.cos(angle) * 11, Math.sin(angle) * 11, 5.5, 0.14);
  }
  assembler.pillar(-3.65, -1.2, 3.6, 0);
  assembler.pillar(3.65, -1.2, 3.6, 0);
  assembler.arch(0, -1.2, 3.65, 3.48);
  assembler.portals.push({
    x: 0,
    y: assembler.groundAt(0, -1.05) + 3.6,
    z: -1.05,
    scale: 1,
  });
  assembler.rubble(55);
  assembler.crystalClusters(6, 16, 1.15);
}

function buildWatchCircle(assembler: SiteAssembler): void {
  const radius = 16;
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    assembler.pillar(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      assembler.rng.range(3.5, 7.2),
      0.22,
    );
    if (i % 3 !== 1) {
      const next = ((i + 1) / 9) * Math.PI * 2;
      assembler.wall(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        Math.cos(next) * radius,
        Math.sin(next) * radius,
        assembler.rng.int(3) + 2,
        0.24,
      );
    }
  }
  assembler.rubble(38);
  assembler.crystalClusters(4, 10, 0.8);
}

function buildForestShrine(assembler: SiteAssembler): void {
  assembler.wall(-11, -8, -11, 8, 5, 0.15);
  assembler.wall(-11, 8, 11, 8, 4, 0.2);
  assembler.wall(11, 8, 11, -2, 5, 0.18);
  assembler.pillar(-4, -1, 5.8, 0.08);
  assembler.pillar(4, -1, 5.8, 0.08);
  assembler.portals.push({
    x: 0,
    y: assembler.groundAt(0, -1) + 2.7,
    z: -1,
    scale: 0.72,
  });
  assembler.rubble(34);
  assembler.crystalClusters(4, 8, 0.78);
}

export function assembleMagicRuinsSite(
  site: MagicRuinsSitePlan,
  terrain: TerrainSurface,
): MagicRuinsSiteAssembly {
  const assembler = new SiteAssembler(site, terrain);
  if (site.kind === 'sanctuary') buildSanctuary(assembler);
  else if (site.kind === 'watch-circle') buildWatchCircle(assembler);
  else buildForestShrine(assembler);
  return assembler;
}
