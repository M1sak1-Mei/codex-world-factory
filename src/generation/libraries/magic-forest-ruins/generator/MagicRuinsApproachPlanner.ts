import { buildHorizontalCollisionProbe, type SegmentObstacle } from '../../../../core/Collision';
import type { FeatureSpawn, TerrainSurface } from '../../../core/WorldFeature';
import { SANCTUARY_ENTRANCE_ANGLE } from './MagicForestRuinsLayout';
import type { MagicRuinsSitePlan } from './MagicForestRuinsPlanner';

const EYE_HEIGHT = 1.7;

/** CPU-only composition query; it never moves terrain, sites, or seed streams. */
export function planMagicRuinsApproach(
  site: MagicRuinsSitePlan,
  terrain: TerrainSurface,
  obstacles: readonly SegmentObstacle[],
): FeatureSpawn | null {
  const ca = Math.cos(site.yaw);
  const sa = Math.sin(site.yaw);
  const toWorld = (x: number, z: number): [number, number] => [
    site.center[0] + ca * x + sa * z,
    site.center[1] - sa * x + ca * z,
  ];
  const [targetX, targetZ] = toWorld(0, -1.05);
  const targetY = terrain.heightAt(targetX, targetZ) + (site.kind === 'forest-shrine' ? 2.7 : 3.6);
  const collision = buildHorizontalCollisionProbe(obstacles);
  const distances = [site.radius + 5, site.radius + 1, site.radius * 0.82,
    site.radius * 0.68, site.radius * 0.54, site.radius * 0.42, 5.5];
  let best: { spawn: FeatureSpawn; score: number } | null = null;
  for (const distance of distances) {
    for (const side of [0, -1.4, 1.4]) {
      // All candidates stay inside the existing entrance clearance or site
      // footprint; looking better must not require an unplanned forest hole.
      const localX = Math.cos(SANCTUARY_ENTRANCE_ANGLE) * distance + side;
      const localZ = Math.sin(SANCTUARY_ENTRANCE_ANGLE) * distance;
      const [x, z] = toWorld(localX, localZ);
      const ground = terrain.heightAt(x, z);
      if (!Number.isFinite(ground) || terrain.slopeAt(x, z, 1) > 0.34
        || collision(x, z, 0.52).blocked) continue;
      const dryFooting = [[0, 0], [-0.55, 0], [0.55, 0], [0, -0.55], [0, 0.55]]
        .every(([dx, dz]) => terrain.waterAt(x + dx!, z + dz!)
          < terrain.heightAt(x + dx!, z + dz!) - 0.3);
      if (!dryFooting) continue;
      const eye = ground + EYE_HEIGHT;
      const dx = targetX - x;
      const dz = targetZ - z;
      const horizontalDistance = Math.hypot(dx, dz);
      const steps = Math.max(8, Math.ceil(horizontalDistance / 0.75));
      let blockedSamples = 0;
      // Check the focal point AND its lower entrance. Seeing only a bright
      // portal tip over a foreground ridge is not a successful composition.
      for (const targetLift of [0, -1.6]) {
        for (let sample = 1; sample < steps; sample++) {
          const t = sample / steps;
          const rayY = eye + (targetY + targetLift - eye) * t;
          if (terrain.heightAt(x + dx * t, z + dz * t) + 0.12 > rayY) blockedSamples++;
        }
      }
      const score = blockedSamples * 100
        + Math.abs(distance - site.radius * 0.86) * 0.2 + Math.abs(side) * 0.4;
      if (!best || score < best.score) {
        best = {
          score,
          spawn: {
            position: [x, eye, z],
            yaw: Math.atan2(-dx, -dz),
            pitch: Math.atan2(targetY - eye, horizontalDistance),
            mode: 'walk',
          },
        };
      }
    }
  }
  // If every line is obstructed, prefer the least-obstructed dry, collision-
  // free footing. If none is safe, let the world use its normal spawn logic.
  return best?.spawn ?? null;
}
