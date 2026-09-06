import type { WorldSeed } from '../core/Seed';
import { generatePavedRoadNetwork } from '../generation/libraries/paved-roads/generator/PavedRoadNetworkGenerator';
import type { ResolvedLandscapeProfile } from './LandscapeProfile';

export type SurfacePathKind = 'cobble' | 'concrete';

export interface SurfacePath {
  id: string;
  kind: SurfacePathKind;
  points: [number, number][];
  width: number;
  strength: number;
}

export interface SurfacePad {
  id: string;
  kind: 'concrete';
  center: [number, number];
  halfSize: [number, number];
  rotation: number;
  strength: number;
}

export interface LandscapeSurfaceLayout {
  paths: SurfacePath[];
  pads: SurfacePad[];
}

/**
 * Resolve artificial ground as ordinary deterministic scene data. Keeping
 * layout generation on the CPU makes it serializable and lets later city,
 * road, and ruin modules inject the same surface primitives.
 */
export function makeLandscapeSurfaceLayout(
  seed: WorldSeed,
  profile: ResolvedLandscapeProfile,
): LandscapeSurfaceLayout {
  if (profile.surfaces.layout === 'paved-network') {
    return generatePavedRoadNetwork(seed, {
      worldHalf: 2048,
      cobbleStrength: profile.surfaces.cobble,
      concreteStrength: profile.surfaces.concrete,
    });
  }

  const paths: SurfacePath[] = [];
  const pads: SurfacePad[] = [];

  const pathCount = profile.surfaces.cobble > 0
    ? Math.max(1, Math.min(3, Math.round(profile.surfaces.cobble * 1.6)))
    : 0;
  for (let pathIndex = 0; pathIndex < pathCount; pathIndex++) {
    const rng = seed.rng(`landscape-surface/cobble/${pathIndex}`);
    const lane = pathIndex - (pathCount - 1) * 0.5;
    const points: [number, number][] = [];
    const rotation = -0.72 + lane * 0.58 + rng.range(-0.16, 0.16);
    const dirX = Math.cos(rotation);
    const dirZ = Math.sin(rotation);
    const sideX = -dirZ;
    const sideZ = dirX;
    for (let i = 0; i < 6; i++) {
      const along = -1550 + i * 620;
      const bend = Math.sin(i * 1.37 + rng.range(-0.4, 0.4)) * 145;
      points.push([
        dirX * along + sideX * (lane * 360 + bend) + rng.range(-55, 55),
        dirZ * along + sideZ * (lane * 360 + bend) + rng.range(-55, 55),
      ]);
    }
    paths.push({
      id: `cobble-${pathIndex}`,
      kind: 'cobble',
      points,
      width: 4.5 + rng.range(0, 4.5) * Math.min(profile.surfaces.cobble, 1.5),
      strength: Math.min(profile.surfaces.cobble, 1),
    });
  }

  const padCount = profile.surfaces.concrete > 0
    ? Math.max(1, Math.min(3, Math.round(profile.surfaces.concrete * 1.7)))
    : 0;
  for (let padIndex = 0; padIndex < padCount; padIndex++) {
    const rng = seed.rng(`landscape-surface/concrete/${padIndex}`);
    const angle = padIndex * 2.399963 + rng.range(-0.3, 0.3);
    const radius = 370 + padIndex * 260 + rng.range(-70, 70);
    pads.push({
      id: `concrete-${padIndex}`,
      kind: 'concrete',
      center: [Math.cos(angle) * radius, Math.sin(angle) * radius],
      halfSize: [rng.range(18, 42), rng.range(14, 34)],
      rotation: rng.range(-Math.PI, Math.PI),
      strength: Math.min(profile.surfaces.concrete, 1),
    });
  }

  return { paths, pads };
}
