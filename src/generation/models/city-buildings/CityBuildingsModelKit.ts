import {
  BoxGeometry,
  ConeGeometry,
  InstancedMesh,
  Object3D,
} from 'three';
import type { MeshPhysicalNodeMaterial } from 'three/webgpu';
import type {
  ProceduralModelDescriptor,
  ProceduralModelKit,
} from '../ProceduralModelKit';
import {
  createCityBuildingsMaterials,
  type CityBuildingsMaterials,
} from './CityBuildingsMaterials';

export interface CityPartPlacement {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface CityPalettePlacement extends CityPartPlacement {
  palette: number;
}

export interface CityBuildingsModelKit extends ProceduralModelKit {
  readonly materials: CityBuildingsMaterials;
  createFoundations(name: string, placements: readonly CityPartPlacement[]): InstancedMesh;
  createWalls(
    name: string,
    palette: number,
    placements: readonly CityPartPlacement[],
  ): InstancedMesh;
  createRoofs(
    name: string,
    palette: number,
    placements: readonly CityPartPlacement[],
  ): InstancedMesh;
  createBeams(name: string, placements: readonly CityPartPlacement[]): InstancedMesh;
  createWindows(name: string, placements: readonly CityPartPlacement[]): InstancedMesh;
  createDoors(name: string, placements: readonly CityPartPlacement[]): InstancedMesh;
}

export const CITY_BUILDINGS_MODEL_CATALOG = [
  { id: 'city-buildings/stone-foundation', label: 'Terrain-set stone foundation', category: 'structure', instanced: true },
  { id: 'city-buildings/plaster-shell', label: 'Palette-driven plaster building shell', category: 'structure', instanced: true },
  { id: 'city-buildings/steep-roof', label: 'Steep fantasy roof', category: 'structure', instanced: true },
  { id: 'city-buildings/timber-frame', label: 'Exposed timber frame', category: 'structure', instanced: true },
  { id: 'city-buildings/lit-window', label: 'Warm lit window', category: 'prop', instanced: true },
  { id: 'city-buildings/wooden-door', label: 'Heavy wooden door', category: 'prop', instanced: true },
] as const satisfies readonly ProceduralModelDescriptor[];

function createInstances(
  geometry: BoxGeometry | ConeGeometry,
  material: MeshPhysicalNodeMaterial,
  name: string,
  placements: readonly CityPartPlacement[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const object = new Object3D();
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i] as CityPartPlacement;
    object.position.set(...placement.position);
    object.rotation.set(...placement.rotation);
    object.scale.set(...placement.scale);
    object.updateMatrix();
    mesh.setMatrixAt(i, object.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}

export function createCityBuildingsModelKit(): CityBuildingsModelKit {
  const materials = createCityBuildingsMaterials();
  const box = new BoxGeometry(1, 1, 1);
  const roof = new ConeGeometry(1, 1, 4, 1, false);
  return {
    id: 'city-buildings',
    models: CITY_BUILDINGS_MODEL_CATALOG,
    materials,
    createFoundations(name, placements) {
      return createInstances(box, materials.foundation, name, placements);
    },
    createWalls(name, palette, placements) {
      const material = materials.wall[palette % materials.wall.length] as MeshPhysicalNodeMaterial;
      return createInstances(box, material, name, placements);
    },
    createRoofs(name, palette, placements) {
      const material = materials.roof[palette % materials.roof.length] as MeshPhysicalNodeMaterial;
      return createInstances(roof, material, name, placements);
    },
    createBeams(name, placements) {
      return createInstances(box, materials.timber, name, placements);
    },
    createWindows(name, placements) {
      const mesh = createInstances(box, materials.window, name, placements);
      mesh.castShadow = false;
      return mesh;
    },
    createDoors(name, placements) {
      return createInstances(box, materials.door, name, placements);
    },
  };
}
