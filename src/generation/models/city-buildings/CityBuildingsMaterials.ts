import { Color } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { vec3 } from 'three/tsl';

export interface CityBuildingsMaterials {
  foundation: MeshPhysicalNodeMaterial;
  wall: readonly MeshPhysicalNodeMaterial[];
  roof: readonly MeshPhysicalNodeMaterial[];
  timber: MeshPhysicalNodeMaterial;
  window: MeshPhysicalNodeMaterial;
  door: MeshPhysicalNodeMaterial;
}

function coloredMaterial(
  hex: number,
  roughness: number,
  metalness = 0,
): MeshPhysicalNodeMaterial {
  const color = new Color(hex);
  const material = new MeshPhysicalNodeMaterial();
  material.colorNode = vec3(color.r, color.g, color.b);
  material.roughness = roughness;
  material.metalness = metalness;
  return material;
}

function windowMaterial(): MeshPhysicalNodeMaterial {
  const material = coloredMaterial(0x183447, 0.22, 0.08);
  material.emissiveNode = vec3(0.76, 0.45, 0.16).mul(0.32);
  return material;
}

export function createCityBuildingsMaterials(): CityBuildingsMaterials {
  return {
    foundation: coloredMaterial(0x51564f, 0.94),
    wall: [
      coloredMaterial(0xb8a789, 0.91),
      coloredMaterial(0x8fa5a0, 0.9),
      coloredMaterial(0xc6b66f, 0.92),
    ],
    roof: [
      coloredMaterial(0x59362f, 0.88),
      coloredMaterial(0x344d59, 0.87),
      coloredMaterial(0x5b4930, 0.91),
    ],
    timber: coloredMaterial(0x2b2118, 0.86),
    window: windowMaterial(),
    door: coloredMaterial(0x3a2417, 0.84),
  };
}
