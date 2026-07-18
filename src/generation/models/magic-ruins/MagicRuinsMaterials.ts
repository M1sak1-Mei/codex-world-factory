import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  float,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  vec3,
} from 'three/tsl';
import { fbm3, valueNoise3 } from '../../../gpu/noise/NoiseTSL';
import type { NV3 } from '../../../gpu/TSLTypes';

export interface MagicRuinsMaterials {
  stone: MeshPhysicalNodeMaterial;
  ground: MeshPhysicalNodeMaterial;
  crystal: readonly MeshPhysicalNodeMaterial[];
  portal: readonly MeshPhysicalNodeMaterial[];
}

function stoneMaterial(): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial();
  material.specularIntensity = 0.28;
  const grain = fbm3(positionWorld.mul(0.42), 4).mul(0.5).add(0.5);
  const age = valueNoise3(positionWorld.mul(0.11)).mul(0.5).add(0.5);
  let color = mix(
    vec3(0.035, 0.045, 0.04),
    vec3(0.105, 0.125, 0.095),
    grain.mul(0.62).add(age.mul(0.38)).clamp(0, 1),
  ) as unknown as NV3;
  const mossNoise = fbm3(positionWorld.mul(0.78).add(vec3(11.2, 3.7, -8.4)), 4)
    .mul(0.5)
    .add(0.5);
  const moss = smoothstep(0.36, 0.67, mossNoise)
    .mul(smoothstep(-0.05, 0.72, normalWorld.y).mul(0.72).add(0.28))
    .mul(0.96);
  color = mix(color, vec3(0.025, 0.115, 0.04), moss) as unknown as NV3;
  const streak = smoothstep(0.58, 0.82, valueNoise3(positionWorld.mul(vec3(1.9, 0.18, 1.9))))
    .mul(float(1).sub(normalWorld.y.abs()))
    .mul(0.32);
  material.colorNode = mix(color, color.mul(vec3(0.38, 0.42, 0.34)), streak);
  material.roughnessNode = mix(float(0.91), float(1), moss);
  material.metalness = 0;
  return material;
}

function lichenMaterial(): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial();
  const broad = fbm3(positionWorld.mul(0.085).add(vec3(4.2, 13.7, -2.1)), 4)
    .mul(0.5)
    .add(0.5);
  const detail = valueNoise3(positionWorld.mul(0.82)).mul(0.5).add(0.5);
  const soil = mix(vec3(0.012, 0.017, 0.009), vec3(0.035, 0.032, 0.015), detail);
  const moss = mix(vec3(0.006, 0.032, 0.008), vec3(0.024, 0.082, 0.014), detail);
  material.colorNode = mix(soil, moss, smoothstep(0.24, 0.62, broad));
  material.roughness = 1;
  material.metalness = 0;
  return material;
}

const MAGIC_COLORS = [
  [0.12, 0.68, 0.82],
  [0.42, 0.22, 0.9],
  [0.18, 0.88, 0.48],
] as const;

function magicMaterial(variant: number, intensity: number): MeshPhysicalNodeMaterial {
  const color = MAGIC_COLORS[variant % MAGIC_COLORS.length] as readonly [number, number, number];
  const material = new MeshPhysicalNodeMaterial();
  const base = vec3(color[0], color[1], color[2]);
  const pulse = fbm3(positionWorld.mul(1.7), 3).mul(0.16).add(0.84);
  material.colorNode = base.mul(0.48).add(vec3(0.02, 0.03, 0.035));
  material.emissiveNode = base.mul(pulse).mul(intensity);
  material.roughness = 0.2;
  material.metalness = 0.08;
  material.transmission = 0.08;
  return material;
}

export function createMagicRuinsMaterials(): MagicRuinsMaterials {
  return {
    stone: stoneMaterial(),
    ground: lichenMaterial(),
    crystal: MAGIC_COLORS.map((_color, index) => magicMaterial(index, 2.6)),
    portal: MAGIC_COLORS.map((_color, index) => magicMaterial(index, 4.8)),
  };
}
