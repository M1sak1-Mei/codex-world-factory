import type { SegmentObstacle } from '../../../../core/Collision';
import { Rng as SeededRng, type Rng } from '../../../../core/Seed';
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

  constructor(
    readonly site: MagicRuinsSitePlan,
    readonly terrain: TerrainSurface,
  ) {
    this.rng = new SeededRng(site.ruinSeed);
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
      radius: 0.68,
    });
    const courses = Math.max(2, Math.floor(height / 0.82));
    for (let course = 0; course < courses; course++) {
      if (course > 2 && this.rng.chance(brokenness + course * 0.035)) break;
      const taper = 1 - (course / courses) * 0.16;
      const sy = this.rng.range(0.7, 0.88);
      this.block(
        x + this.rng.range(-0.05, 0.05),
        this.groundAt(x, z) + sy * 0.5 + course * 0.79,
        z + this.rng.range(-0.05, 0.05),
        this.rng.range(1.0, 1.24) * taper,
        sy,
        this.rng.range(1.0, 1.24) * taper,
        this.rng.range(-0.12, 0.12),
        0.018,
      );
    }
  }

  rubble(x: number, z: number, count: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(this.rng.float()) * spread;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      const scale = this.rng.range(0.35, 1.0);
      this.block(
        px,
        this.groundAt(px, pz) + scale * 0.22,
        pz,
        scale * this.rng.range(0.8, 1.5),
        scale * this.rng.range(0.35, 0.7),
        scale * this.rng.range(0.65, 1.2),
        this.rng.range(-Math.PI, Math.PI),
        0.28,
      );
    }
  }

  crystal(x: number, z: number, scale: number): void {
    this.crystals.push({
      position: [x, this.groundAt(x, z) + scale * 0.9, z],
      rotation: [this.rng.range(-0.16, 0.16), this.rng.range(-Math.PI, Math.PI), 0],
      scale,
    });
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
  assembler.pillar(-3.5, -1.2, 7.8, 0.03);
  assembler.pillar(3.5, -1.2, 7.8, 0.03);
  for (let i = -2; i <= 2; i++) {
    if (i === 2 && assembler.rng.chance(0.45)) continue;
    assembler.block(
      i * 1.45,
      7.0 + assembler.groundAt(i * 1.45, -1.2),
      -1.2,
      1.42,
      0.82,
      1.25,
      0,
      0.02,
    );
  }
  assembler.portals.push({
    x: 0,
    y: assembler.groundAt(0, -1.05) + 3.6,
    z: -1.05,
    scale: 1,
  });
  assembler.rubble(0, 0, 55, 29);
  for (let i = 0; i < 18; i++) {
    const angle = assembler.rng.range(0, Math.PI * 2);
    const r = assembler.rng.range(5, 21);
    assembler.crystal(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      assembler.rng.range(0.45, 1.35),
    );
  }
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
  assembler.rubble(0, 0, 38, 21);
  for (let i = 0; i < 10; i++) {
    const angle = assembler.rng.range(0, Math.PI * 2);
    const r = assembler.rng.range(3, 14);
    assembler.crystal(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      assembler.rng.range(0.35, 0.9),
    );
  }
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
  assembler.rubble(0, 0, 34, 17);
  for (let i = 0; i < 12; i++) {
    const angle = assembler.rng.range(0, Math.PI * 2);
    const r = assembler.rng.range(2, 13);
    assembler.crystal(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      assembler.rng.range(0.3, 0.85),
    );
  }
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
