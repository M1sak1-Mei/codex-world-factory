import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  bumpMap,
  float,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  uv,
  vec3,
} from 'three/tsl';
import { fbm3, valueNoise3 } from '../../../gpu/noise/NoiseTSL';
import type { NV3 } from '../../../gpu/TSLTypes';
import { MAGIC_RUINS_STYLE } from './MagicRuinsStyle';

export interface MagicRuinsMaterials {
  stone: MeshPhysicalNodeMaterial;
  ground: MeshPhysicalNodeMaterial;
  crystal: readonly MeshPhysicalNodeMaterial[];
  portal: readonly MeshPhysicalNodeMaterial[];
}

function stoneMaterial(): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial();
  material.name = `${MAGIC_RUINS_STYLE.id}/stone`;
  material.specularIntensity = 0.42;
  // NoiseTSL already returns [0, 1]. Remapping it to [0.5, 1] made moss
  // cover almost every face and erased the mineral/organic distinction.
  const grain = fbm3(positionWorld.mul(0.7), 3);
  const age = valueNoise3(positionWorld.mul(0.17));
  let color = mix(
    vec3(0.045, 0.052, 0.057),
    vec3(0.16, 0.153, 0.13),
    grain.mul(0.62).add(age.mul(0.38)).clamp(0, 1),
  ) as unknown as NV3;
  const mossNoise = fbm3(positionWorld.mul(1.12).add(vec3(11.2, 3.7, -8.4)), 3);
  const moss = smoothstep(0.43, 0.69, mossNoise)
    .mul(smoothstep(0.08, 0.75, normalWorld.y).mul(0.8).add(0.2));
  color = mix(color, vec3(0.03, 0.075, 0.015), moss) as unknown as NV3;
  const pores = smoothstep(0.68, 0.88, valueNoise3(positionWorld.mul(28)));
  const veins = float(1).sub(smoothstep(0.018, 0.075,
    valueNoise3(positionWorld.mul(vec3(3.2, 8, 3.2))).sub(0.52).abs()));
  const micro = fbm3(positionWorld.mul(8.5), 3)
    .sub(pores.mul(0.35)).sub(veins.mul(0.4));
  const streak = smoothstep(0.58, 0.82, valueNoise3(positionWorld.mul(vec3(1.9, 0.18, 1.9))))
    .mul(float(1).sub(normalWorld.y.abs()))
    .mul(0.32);
  material.colorNode = mix(color, color.mul(vec3(0.38, 0.42, 0.34)), streak)
    .mul(float(1).sub(veins.mul(0.16)).sub(pores.mul(0.14)));
  material.normalNode = bumpMap(micro.add(moss.mul(0.18)), float(MAGIC_RUINS_STYLE.stone.microRelief));
  material.roughnessNode = mix(float(MAGIC_RUINS_STYLE.stone.roughness), float(0.98), moss)
    .add(pores.mul(0.05)).clamp(0, 1);
  material.aoNode = float(1).sub(pores.mul(0.22)).sub(veins.mul(0.15));
  material.metalness = 0;
  return material;
}

function lichenMaterial(): MeshPhysicalNodeMaterial {
  const material = new MeshPhysicalNodeMaterial();
  material.name = `${MAGIC_RUINS_STYLE.id}/lichen`;
  const broad = fbm3(positionWorld.mul(1.3).add(vec3(4.2, 13.7, -2.1)), 3);
  const detail = valueNoise3(positionWorld.mul(18));
  const soil = mix(vec3(0.012, 0.017, 0.009), vec3(0.035, 0.032, 0.015), detail);
  const moss = mix(vec3(0.012, 0.036, 0.008), vec3(0.05, 0.11, 0.022), detail);
  material.colorNode = mix(soil, moss, smoothstep(0.24, 0.62, broad));
  const edge = uv().sub(0.5).length().mul(2).add(broad.sub(0.5).mul(0.4));
  const filaments = valueNoise3(positionWorld.mul(56));
  material.opacityNode = float(1).sub(smoothstep(0.63, 0.98, edge))
    .mul(smoothstep(0.14, 0.33, filaments));
  material.alphaTest = 0.4;
  material.alphaToCoverage = true;
  material.normalNode = bumpMap(detail.mul(0.6).add(filaments.mul(0.25)), float(0.025));
  material.aoNode = detail.mul(0.22).add(0.78);
  material.roughness = 0.97;
  material.sheen = 0.18;
  material.sheenColor.setRGB(0.09, 0.15, 0.04);
  material.sheenRoughness = 0.95;
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
  material.name = `${MAGIC_RUINS_STYLE.id}/magic-${variant}-${intensity}`;
  const base = vec3(color[0], color[1], color[2]);
  const pulse = fbm3(positionWorld.mul(1.7), 3).mul(0.48).add(0.52);
  material.colorNode = base.mul(0.18).add(vec3(0.008, 0.012, 0.02));
  material.emissiveNode = base.mul(pulse).mul(intensity);
  material.roughness = 0.27;
  material.metalness = 0;
  material.clearcoat = 0.25;
  material.clearcoatRoughness = 0.18;
  return material;
}

export function createMagicRuinsMaterials(): MagicRuinsMaterials {
  return {
    stone: stoneMaterial(),
    ground: lichenMaterial(),
    crystal: MAGIC_COLORS.map((_color, index) => magicMaterial(index, MAGIC_RUINS_STYLE.magic.crystalEmission)),
    portal: MAGIC_COLORS.map((_color, index) => magicMaterial(index, MAGIC_RUINS_STYLE.magic.portalEmission)),
  };
}
