/** Camera/terrain clearance contract shared by the renderer and camera rig. */
export const CAMERA_NEAR = 0.08;
export const CAMERA_FAR = 30_000;

/**
 * Worst-case upward terrain micro-displacement, rounded above the current
 * material sum. Keep this in sync when TerrainMaterial.DISP is expanded.
 */
export const TERRAIN_MICRO_RISE_BUDGET = 0.9;

/** Fly-mode eye height over the undisplaced CPU heightfield. */
export const FLY_GROUND_CLEAR = 1.4;

/** Remaining flat-ground room between displaced terrain and the near plane. */
export function terrainNearPlaneHeadroom(): number {
  return FLY_GROUND_CLEAR - TERRAIN_MICRO_RISE_BUDGET - CAMERA_NEAR;
}
