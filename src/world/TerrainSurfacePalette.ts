import type { LandscapeProfileId } from './LandscapeProfile';

type Rgb = readonly [number, number, number];
export interface TerrainSurfacePalette {
  id: string;
  rockLow: Rgb;
  rockHigh: Rgb;
  scree: Rgb;
}

const DEFAULT: TerrainSurfacePalette = {
  id: 'temperate-bedrock', rockLow: [0.26, 0.245, 0.225],
  rockHigh: [0.42, 0.39, 0.35], scree: [0.36, 0.345, 0.325],
};
const WOODLAND: TerrainSurfacePalette = {
  id: 'weathered-woodland', rockLow: [0.095, 0.115, 0.105],
  rockHigh: [0.22, 0.235, 0.205], scree: [0.2, 0.21, 0.18],
};

/** Linear reflectance palette; geometry and geology masks remain independent. */
export function terrainSurfacePalette(profile: LandscapeProfileId): TerrainSurfacePalette {
  return profile === 'wild' || profile === 'moorland' ? WOODLAND : DEFAULT;
}
