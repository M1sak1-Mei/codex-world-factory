import { WORLD_HALF } from './WorldConst';

/**
 * The analytic far shell may overlap only a narrow strip at the square world
 * edge. Its radial geometry otherwise reaches about 100 m into the baked
 * terrain and becomes visible through CDLOD seams as an unrelated landscape.
 */
export const FAR_SHELL_CLIP_INNER = WORLD_HALF - 18;
export const FAR_SHELL_CLIP_OUTER = WORLD_HALF - 6;

/** CPU mirror of the shader clip, used by regression tests and diagnostics. */
export function farShellCoverageAt(x: number, z: number): number {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const t = Math.max(0, Math.min(1, (d - FAR_SHELL_CLIP_INNER) /
    (FAR_SHELL_CLIP_OUTER - FAR_SHELL_CLIP_INNER)));
  return t * t * (3 - 2 * t);
}

/** Deeper skirts cover steep, mixed-resolution CDLOD neighbours. */
export function terrainSkirtDrop(tileSize: number): number {
  return tileSize * 0.075 + 5;
}
