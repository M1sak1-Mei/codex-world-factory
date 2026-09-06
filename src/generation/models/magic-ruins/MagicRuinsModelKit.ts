import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  PointLight,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Rng } from '../../../core/Seed';
import { hashString } from '../../../core/Seed';
import type {
  ProceduralModelDescriptor,
  ProceduralModelKit,
} from '../ProceduralModelKit';
import {
  createMagicRuinsMaterials,
  type MagicRuinsMaterials,
} from './MagicRuinsMaterials';
import { MAGIC_RUINS_STYLE } from './MagicRuinsStyle';

export interface StoneBlockPlacement {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface CrystalPlacement {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

export interface LichenColonyOptions {
  name: string;
  siteId: string;
  radius: number;
  rng: Rng;
  groundAt(localX: number, localZ: number): number;
}

export interface MagicRuinsModelKit extends ProceduralModelKit {
  readonly materials: MagicRuinsMaterials;
  createStoneBlocks(name: string, placements: readonly StoneBlockPlacement[]): InstancedMesh;
  createCrystals(
    name: string,
    variant: number,
    placements: readonly CrystalPlacement[],
  ): InstancedMesh;
  createPortal(variant: number, scale: number): Group;
  createLichenColonies(options: LichenColonyOptions): Mesh;
}

export const MAGIC_RUINS_MODEL_CATALOG = [
  { id: 'magic-ruins/aged-stone-block', label: 'Aged mossy stone block', category: 'structure', instanced: true },
  { id: 'magic-ruins/crystal-spire', label: 'Emissive crystal spire', category: 'prop', instanced: true },
  { id: 'magic-ruins/portal-ring', label: 'Luminous portal ring', category: 'effect', instanced: false },
  { id: 'magic-ruins/lichen-colony', label: 'Terrain-conforming lichen colony', category: 'ground-cover', instanced: false },
] as const satisfies readonly ProceduralModelDescriptor[];

function agedStoneGeometry(): RoundedBoxGeometry {
  const geometry = new RoundedBoxGeometry(1, 1, 1,
    MAGIC_RUINS_STYLE.stone.segments, MAGIC_RUINS_STYLE.stone.bevel);
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const wornEdge = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 0.43 ? 1 : 0.45;
    const chip = (Math.sin(x * 17.3 + y * 13.7 + z * 19.1) * 0.018
      + Math.sin(x * 53.2 - y * 27.1 + z * 47.8) * 0.01) * wornEdge;
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

function setStoneInstances(
  mesh: InstancedMesh,
  placements: readonly StoneBlockPlacement[],
): void {
  const object = new Object3D();
  const tint = new Color();
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i] as StoneBlockPlacement;
    object.position.set(...placement.position);
    object.rotation.set(...placement.rotation);
    object.scale.set(...placement.scale);
    object.updateMatrix();
    mesh.setMatrixAt(i, object.matrix);
    // Derive appearance from the placement identity without consuming any
    // generator RNG. Changing material quality cannot move the next block.
    const identity = hashString(placement.position.map((v) => v.toFixed(3)).join('/'));
    const warmth = (identity & 255) / 255;
    const value = 0.74 + ((identity >>> 8) & 255) / 255 * 0.35;
    tint.setRGB(value * (0.91 + warmth * 0.12), value * 0.96, value * (1.02 - warmth * 0.13));
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function lichenGeometry(options: LichenColonyOptions): BufferGeometry {
  const style = MAGIC_RUINS_STYLE.lichen;
  const patchCount = Math.min(style.maxPatches, Math.round(options.radius * 1.45));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let patch = 0; patch < patchCount; patch++) {
    const patchRadius = options.rng.range(style.minRadius, style.maxRadius);
    const angle = options.rng.range(0, Math.PI * 2);
    const distance = Math.sqrt(options.rng.float())
      * Math.max(options.radius - patchRadius, 1);
    const cx = Math.cos(angle) * distance;
    const cz = Math.sin(angle) * distance;
    const steps = Math.ceil(patchRadius * 2 / style.maxCellSize);
    const start = positions.length / 3;
    // Uniformly subdivide the full footprint: a triangle fan only samples the
    // perimeter and visibly bridges over curved ground at its center.
    for (let iz = 0; iz <= steps; iz++) {
      for (let ix = 0; ix <= steps; ix++) {
        const u = ix / steps;
        const v = iz / steps;
        const x = cx + (u * 2 - 1) * patchRadius;
        const z = cz + (v * 2 - 1) * patchRadius;
        positions.push(x, options.groundAt(x, z) + style.lift, z);
        uvs.push(u, v);
      }
    }
    for (let iz = 0; iz < steps; iz++) {
      for (let ix = 0; ix < steps; ix++) {
        const a = start + iz * (steps + 1) + ix;
        const b = a + 1;
        const c = a + steps + 1;
        indices.push(a, c, b, b, c, c + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal') as BufferAttribute;
  if (normals.count > 0 && normals.getY(0) <= 0) {
    throw new Error(`Lichen geometry for ${options.siteId} has inverted winding`);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

function crystalGeometry(): BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  const sides = 6;
  // A broad shoulder, distinct tapered termination and offset tip retain the
  // mineral silhouette even when emission is disabled. All faces stay planar.
  for (const [y, radius] of [[-1.05, 0.39], [0.48, 0.57], [1.24, 0]] as const) {
    for (let i = 0; i < sides; i++) {
      const angle = i / sides * Math.PI * 2;
      vertices.push(Math.cos(angle) * radius + Math.max(y, 0) * 0.09,
        y, Math.sin(angle) * radius);
    }
  }
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    indices.push(i, i + sides, next, next, i + sides, next + sides);
    indices.push(i + sides, i + sides * 2, next + sides);
    if (i > 0 && i < sides - 1) indices.push(0, i, next);
  }
  const indexed = new BufferGeometry();
  indexed.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

export function createMagicRuinsModelKit(): MagicRuinsModelKit {
  const materials = createMagicRuinsMaterials();
  const stoneGeometry = agedStoneGeometry();
  const spireGeometry = crystalGeometry();
  const portalGeometry = new TorusGeometry(3.15, 0.08, 8, 64);
  const portalCoreGeometry = new SphereGeometry(0.09, 8, 6);
  const portalRuneGeometry = new RoundedBoxGeometry(0.11, 0.31, 0.12, 1, 0.025);
  const portalColors = [0x35c9ff, 0x8a5cff, 0x39ef92] as const;

  return {
    id: 'magic-ruins',
    models: MAGIC_RUINS_MODEL_CATALOG,
    materials,
    createStoneBlocks(name, placements) {
      const mesh = new InstancedMesh(stoneGeometry, materials.stone, placements.length);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      setStoneInstances(mesh, placements);
      return mesh;
    },
    createCrystals(name, variant, placements) {
      const material = materials.crystal[
        variant % materials.crystal.length
      ] as MagicRuinsMaterials['crystal'][number];
      const mesh = new InstancedMesh(spireGeometry, material, placements.length);
      mesh.name = name;
      const object = new Object3D();
      for (let i = 0; i < placements.length; i++) {
        const placement = placements[i] as CrystalPlacement;
        object.position.set(...placement.position);
        object.rotation.set(...placement.rotation);
        object.scale.setScalar(placement.scale);
        object.updateMatrix();
        mesh.setMatrixAt(i, object.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      return mesh;
    },
    createPortal(variant, scale) {
      const material = materials.portal[
        variant % materials.portal.length
      ] as MagicRuinsMaterials['portal'][number];
      const group = new Group();
      group.name = 'model:magic-ruins/portal-ring';
      group.scale.setScalar(scale);
      const ring = new Mesh(portalGeometry, material);
      ring.castShadow = true;
      group.add(ring);
      group.add(new Mesh(portalCoreGeometry, material));
      const runes = new InstancedMesh(portalRuneGeometry, material, 24);
      runes.name = 'portal:orbit-runes';
      const glyph = new Object3D();
      for (let i = 0; i < 24; i++) {
        const angle = i / 24 * Math.PI * 2;
        glyph.position.set(Math.cos(angle) * 3.43, Math.sin(angle) * 3.43, 0);
        glyph.rotation.z = angle + Math.PI * 0.5;
        glyph.scale.y = i % 3 === 0 ? 1.4 : 0.7;
        glyph.updateMatrix();
        runes.setMatrixAt(i, glyph.matrix);
      }
      runes.instanceMatrix.needsUpdate = true;
      runes.computeBoundingSphere();
      group.add(runes);
      group.add(new PointLight(
        portalColors[variant % portalColors.length] as number,
        MAGIC_RUINS_STYLE.magic.lightIntensity,
        34,
        1.7,
      ));
      return group;
    },
    createLichenColonies(options) {
      const mesh = new Mesh(lichenGeometry(options), materials.ground);
      mesh.name = options.name;
      mesh.receiveShadow = true;
      return mesh;
    },
  };
}
