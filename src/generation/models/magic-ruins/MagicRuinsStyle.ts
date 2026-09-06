/** Surface quality is independent of site planning and its random streams. */
export const MAGIC_RUINS_STYLE = {
  id: 'magic-ruins/weathered-grove-v2',
  stone: {
    bevel: 0.075,
    segments: 2,
    microRelief: 0.055,
    roughness: 0.82,
    maxTriangles: 320,
  },
  lichen: {
    maxCellSize: 0.55,
    minRadius: 0.85,
    maxRadius: 2.9,
    maxPatches: 54,
    lift: 0.038,
    maxTriangles: 16_000,
  },
  magic: {
    crystalEmission: 0.72,
    portalEmission: 1.35,
    lightIntensity: 18,
  },
} as const;
