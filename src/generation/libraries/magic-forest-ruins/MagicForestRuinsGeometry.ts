import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Rng } from '../../../core/Seed';
import type { SegmentObstacle } from '../../../core/Collision';
import { Rng as SeededRng } from '../../../core/Seed';
import type {
  FeatureSpawn,
  TerrainSurface,
  WorldFeatureRuntime,
} from '../../core/WorldFeature';
import type { MagicRuinsSitePlan } from './MagicForestRuinsPlanner';
import type { MagicForestRuinsMaterials } from './MagicForestRuinsMaterials';

interface BlockTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

interface CrystalTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

interface SiteStats {
  blocks: number;
  crystals: number;
  portals: number;
}

interface BuiltSite {
  group: Group;
  near: Group;
  stats: SiteStats;
  obstacles: readonly SegmentObstacle[];
  update(camera: PerspectiveCamera): void;
}

const SANCTUARY_SEGMENTS = 14;
const SANCTUARY_ENTRANCE_ANGLE = Math.PI * 0.5;
const SANCTUARY_ENTRANCE_SEGMENTS = new Set([2, 3, 4]);

class SiteAssembler {
  readonly blocks: BlockTransform[] = [];
  readonly crystals: CrystalTransform[] = [];
  readonly portalAnchors: Array<{ x: number; y: number; z: number; scale: number }> = [];
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

  ground(localX: number, localZ: number): number {
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
    // Generate a continuous ruin silhouette first. Filling each column from
    // the foundation upward guarantees gravity-readable walls; erosion only
    // removes the top of a column, never a load-bearing middle stone.
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
      return { x, z, ground: this.ground(x, z) };
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
        this.ground(x, z) + sy * 0.5 + course * 0.79,
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
        this.ground(px, pz) + scale * 0.22,
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
      position: [x, this.ground(x, z) + scale * 0.9, z],
      rotation: [this.rng.range(-0.16, 0.16), this.rng.range(-Math.PI, Math.PI), 0],
      scale,
    });
  }
}

function buildSanctuary(assembler: SiteAssembler): void {
  const radius = 24;
  const segments = SANCTUARY_SEGMENTS;
  for (let i = 0; i < segments; i++) {
    if (
      SANCTUARY_ENTRANCE_SEGMENTS.has(i)
      || i === 8
      || assembler.rng.chance(0.08)
    ) continue;
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
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
  // Hero gate: two towers and a damaged lintel surrounding the active ring.
  assembler.pillar(-3.5, -1.2, 7.8, 0.03);
  assembler.pillar(3.5, -1.2, 7.8, 0.03);
  for (let i = -2; i <= 2; i++) {
    if (i === 2 && assembler.rng.chance(0.45)) continue;
    assembler.block(i * 1.45, 7.0 + assembler.ground(i * 1.45, -1.2), -1.2, 1.42, 0.82, 1.25, 0, 0.02);
  }
  assembler.portalAnchors.push({ x: 0, y: assembler.ground(0, -1.05) + 3.6, z: -1.05, scale: 1 });
  assembler.rubble(0, 0, 55, 29);
  for (let i = 0; i < 18; i++) {
    const angle = assembler.rng.range(0, Math.PI * 2);
    const r = assembler.rng.range(5, 21);
    assembler.crystal(Math.cos(angle) * r, Math.sin(angle) * r, assembler.rng.range(0.45, 1.35));
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
    assembler.crystal(Math.cos(angle) * r, Math.sin(angle) * r, assembler.rng.range(0.35, 0.9));
  }
}

function buildForestShrine(assembler: SiteAssembler): void {
  assembler.wall(-11, -8, -11, 8, 5, 0.15);
  assembler.wall(-11, 8, 11, 8, 4, 0.2);
  assembler.wall(11, 8, 11, -2, 5, 0.18);
  assembler.pillar(-4, -1, 5.8, 0.08);
  assembler.pillar(4, -1, 5.8, 0.08);
  assembler.portalAnchors.push({ x: 0, y: assembler.ground(0, -1) + 2.7, z: -1, scale: 0.72 });
  assembler.rubble(0, 0, 34, 17);
  for (let i = 0; i < 12; i++) {
    const angle = assembler.rng.range(0, Math.PI * 2);
    const r = assembler.rng.range(2, 13);
    assembler.crystal(Math.cos(angle) * r, Math.sin(angle) * r, assembler.rng.range(0.3, 0.85));
  }
}

function setInstances(mesh: InstancedMesh, transforms: readonly BlockTransform[]): void {
  const object = new Object3D();
  for (let i = 0; i < transforms.length; i++) {
    const transform = transforms[i] as BlockTransform;
    object.position.set(...transform.position);
    object.rotation.set(...transform.rotation);
    object.scale.set(...transform.scale);
    object.updateMatrix();
    mesh.setMatrixAt(i, object.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

/** Terrain-conforming lichen colonies scattered across the cleared courtyard. */
function courtyardGeometry(assembler: SiteAssembler, radius: number): BufferGeometry {
  const patchCount = Math.round(radius * 1.55);
  const segments = 12;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let patch = 0; patch < patchCount; patch++) {
    const patchRadius = assembler.rng.range(1.4, 4.8);
    const angle = assembler.rng.range(0, Math.PI * 2);
    const distance = Math.sqrt(assembler.rng.float()) * Math.max(radius - patchRadius, 1);
    const cx = Math.cos(angle) * distance;
    const cz = Math.sin(angle) * distance;
    const centerLift = assembler.rng.range(0.11, 0.19);
    const centerIndex = positions.length / 3;
    positions.push(cx, assembler.ground(cx, cz) + centerLift, cz);
    for (let segment = 0; segment < segments; segment++) {
      const theta = (segment / segments) * Math.PI * 2;
      const wobble = assembler.rng.range(0.72, 1.18)
        * (1 + Math.sin(theta * 3 + patch * 0.73) * 0.1);
      const x = cx + Math.cos(theta) * patchRadius * wobble;
      const z = cz + Math.sin(theta) * patchRadius * wobble;
      const edgeLift = assembler.rng.range(0.012, 0.045);
      positions.push(x, assembler.ground(x, z) + edgeLift, z);
    }
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      indices.push(centerIndex, centerIndex + 1 + next, centerIndex + 1 + segment);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal') as BufferAttribute;
  if (normals.getY(0) <= 0) {
    throw new Error(`Courtyard geometry for ${assembler.site.id} has inverted winding`);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

function agedBlockGeometry(): RoundedBoxGeometry {
  const geometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.03);
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const chip = Math.sin(x * 71.3 + y * 43.7 + z * 97.1) * 0.028;
    position.setXYZ(
      i,
      x + normal.getX(i) * chip,
      y + normal.getY(i) * chip,
      z + normal.getZ(i) * chip,
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function buildSite(
  site: MagicRuinsSitePlan,
  terrain: TerrainSurface,
  materials: MagicForestRuinsMaterials,
): BuiltSite {
  const assembler = new SiteAssembler(site, terrain);
  if (site.kind === 'sanctuary') buildSanctuary(assembler);
  else if (site.kind === 'watch-circle') buildWatchCircle(assembler);
  else buildForestShrine(assembler);

  const group = new Group();
  group.name = `ruins:${site.id}`;
  group.position.set(site.center[0], site.baseY, site.center[1]);
  group.rotation.y = site.yaw;

  const courtyard = new Mesh(courtyardGeometry(assembler, site.radius + 2), materials.ground);
  courtyard.name = `${site.id}:moss-courtyard`;
  courtyard.receiveShadow = true;
  group.add(courtyard);

  const blockGeometry = agedBlockGeometry();
  const blocks = new InstancedMesh(blockGeometry, materials.stone, assembler.blocks.length);
  blocks.name = `${site.id}:stone-blocks`;
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  setInstances(blocks, assembler.blocks);
  group.add(blocks);

  const near = new Group();
  near.name = `${site.id}:magic-details`;
  const crystalGeometry = new CylinderGeometry(0.18, 0.62, 2.1, 5, 1, false);
  const crystals = new InstancedMesh(
    crystalGeometry,
    materials.crystal[site.magicVariant] as MagicForestRuinsMaterials['crystal'][number],
    assembler.crystals.length,
  );
  const crystalObject = new Object3D();
  for (let i = 0; i < assembler.crystals.length; i++) {
    const crystal = assembler.crystals[i] as CrystalTransform;
    crystalObject.position.set(...crystal.position);
    crystalObject.rotation.set(...crystal.rotation);
    crystalObject.scale.setScalar(crystal.scale);
    crystalObject.updateMatrix();
    crystals.setMatrixAt(i, crystalObject.matrix);
  }
  crystals.instanceMatrix.needsUpdate = true;
  crystals.computeBoundingBox();
  crystals.computeBoundingSphere();
  crystals.castShadow = true;
  near.add(crystals);

  for (const anchor of assembler.portalAnchors) {
    const portal = new Mesh(
      new TorusGeometry(3.15 * anchor.scale, 0.22 * anchor.scale, 10, 48),
      materials.portal[site.magicVariant] as MagicForestRuinsMaterials['portal'][number],
    );
    portal.position.set(anchor.x, anchor.y, anchor.z);
    portal.castShadow = true;
    near.add(portal);
    const core = new Mesh(
      new SphereGeometry(0.18 * anchor.scale, 10, 8),
      materials.portal[site.magicVariant] as MagicForestRuinsMaterials['portal'][number],
    );
    core.position.set(anchor.x, anchor.y, anchor.z);
    near.add(core);
    const colors = [0x35c9ff, 0x8a5cff, 0x39ef92];
    const light = new PointLight(colors[site.magicVariant % colors.length] as number, 34, 34, 1.7);
    light.position.set(anchor.x, anchor.y, anchor.z);
    near.add(light);
  }
  group.add(near);

  const worldCenter = new Vector3(site.center[0], site.baseY, site.center[1]);
  return {
    group,
    near,
    stats: {
      blocks: assembler.blocks.length,
      crystals: assembler.crystals.length,
      portals: assembler.portalAnchors.length,
    },
    obstacles: assembler.obstacles,
    update(camera): void {
      const distanceSq = camera.position.distanceToSquared(worldCenter);
      group.visible = distanceSq < 2400 * 2400;
      near.visible = distanceSq < 720 * 720;
    },
  };
}

export function buildMagicForestRuinsGeometry(
  sites: readonly MagicRuinsSitePlan[],
  terrain: TerrainSurface,
  materials: MagicForestRuinsMaterials,
): WorldFeatureRuntime {
  const root = new Group();
  root.name = 'feature-library:magic-forest-ruins';
  const builtSites = sites.map((site) => buildSite(site, terrain, materials));
  for (const site of builtSites) root.add(site.group);
  const hero = sites.find((site) => site.kind === 'sanctuary') ?? sites[0];
  let primarySpawn: FeatureSpawn | null = null;
  if (hero) {
    // The spawn, rendered opening, and missing wall colliders share this
    // grammar angle. Do not independently art-direct a camera direction.
    const localX = Math.cos(SANCTUARY_ENTRANCE_ANGLE) * (hero.radius + 5);
    const localZ = Math.sin(SANCTUARY_ENTRANCE_ANGLE) * (hero.radius + 5);
    const ca = Math.cos(hero.yaw);
    const sa = Math.sin(hero.yaw);
    const x = hero.center[0] + ca * localX + sa * localZ;
    const z = hero.center[1] - sa * localX + ca * localZ;
    const dx = hero.center[0] - x;
    const dz = hero.center[1] - z;
    primarySpawn = {
      position: [x, terrain.heightAt(x, z) + 1.7, z] as [number, number, number],
      yaw: Math.atan2(-dx, -dz),
      pitch: -0.055,
      mode: 'walk' as const,
    };
  }
  return {
    group: root,
    primarySpawn,
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
