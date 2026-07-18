import type { TerrainSurface } from '../core/WorldFeature';
import type { Heightfield } from '../../world/Heightfield';

export function heightfieldTerrainSurface(heightfield: Heightfield): TerrainSurface {
  return {
    heightAt: (x, z) => heightfield.heightAtCpu(x, z),
    waterAt: (x, z) => heightfield.waterYAtCpu(x, z),
    slopeAt(x, z, step = 6): number {
      const dx = heightfield.heightAtCpu(x + step, z) - heightfield.heightAtCpu(x - step, z);
      const dz = heightfield.heightAtCpu(x, z + step) - heightfield.heightAtCpu(x, z - step);
      return Math.hypot(dx, dz) / (step * 2);
    },
    reliefAt(x, z, radius, samples = 12): number {
      let minH = heightfield.heightAtCpu(x, z);
      let maxH = minH;
      for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const h = heightfield.heightAtCpu(
          x + Math.cos(angle) * radius,
          z + Math.sin(angle) * radius,
        );
        minH = Math.min(minH, h);
        maxH = Math.max(maxH, h);
      }
      return maxH - minH;
    },
  };
}
