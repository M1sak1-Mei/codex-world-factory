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
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Rng } from '../../../core/Seed';
import type {
  ProceduralModelDescriptor,
  ProceduralModelKit,
} from '../ProceduralModelKit';
import {
  createMagicRuinsMaterials,
  type MagicRuinsMaterials,
} from './MagicRuinsMaterials';

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

function setStoneInstances(
  mesh: InstancedMesh,
  placements: readonly StoneBlockPlacement[],
): void {
  const object = new Object3D();
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i] as StoneBlockPlacement;
    object.position.set(...placement.position);
    object.rotation.set(...placement.rotation);
    object.scale.set(...placement.scale);
    object.updateMatrix();
    mesh.setMatrixAt(i, object.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function lichenGeometry(options: LichenColonyOptions): BufferGeometry {
  const patchCount = Math.round(options.radius * 1.55);
  const segments = 12;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let patch = 0; patch < patchCount; patch++) {
    const patchRadius = options.rng.range(1.4, 4.8);
    const angle = options.rng.range(0, Math.PI * 2);
    const distance = Math.sqrt(options.rng.float())
      * Math.max(options.radius - patchRadius, 1);
    const cx = Math.cos(angle) * distance;
    const cz = Math.sin(angle) * distance;
    const centerLift = options.rng.range(0.11, 0.19);
    const centerIndex = positions.length / 3;
    positions.push(cx, options.groundAt(cx, cz) + centerLift, cz);
    for (let segment = 0; segment < segments; segment++) {
      const theta = (segment / segments) * Math.PI * 2;
      const wobble = options.rng.range(0.72, 1.18)
        * (1 + Math.sin(theta * 3 + patch * 0.73) * 0.1);
      const x = cx + Math.cos(theta) * patchRadius * wobble;
      const z = cz + Math.sin(theta) * patchRadius * wobble;
      const edgeLift = options.rng.range(0.012, 0.045);
      positions.push(x, options.groundAt(x, z) + edgeLift, z);
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
    throw new Error(`Lichen geometry for ${options.siteId} has inverted winding`);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

export function createMagicRuinsModelKit(): MagicRuinsModelKit {
  const materials = createMagicRuinsMaterials();
  const stoneGeometry = agedStoneGeometry();
  const crystalGeometry = new CylinderGeometry(0.18, 0.62, 2.1, 5, 1, false);
  const portalGeometry = new TorusGeometry(3.15, 0.22, 10, 48);
  const portalCoreGeometry = new SphereGeometry(0.18, 10, 8);
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
      const mesh = new InstancedMesh(crystalGeometry, material, placements.length);
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
      group.add(new PointLight(
        portalColors[variant % portalColors.length] as number,
        34,
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
