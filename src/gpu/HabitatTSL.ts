/** GPU adapters for renderer-independent, CPU-tested habitat rules. */
import { float, smoothstep, texture, vec2 } from 'three/tsl';
import type { NF, NV2, NV4 } from './TSLTypes';
import type { Heightfield } from '../world/Heightfield';
import { groundPatchDensity, habitatResponse, type HabitatMath } from '../world/HabitatModel';
import { PERIOD_VAL } from './passes/NoiseBake';

export const TSL_HABITAT_MATH: HabitatMath<NF> = {
  value: float,
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  div: (a, b) => a.div(b),
  max: (a, b) => a.max(b),
  pow: (a, exponent) => a.pow(exponent),
  smooth: smoothstep,
};

export function habitatAt(hf: Heightfield, sand: NF, moisture: NF) {
  return habitatResponse(TSL_HABITAT_MATH, {
    sand, moisture, desert: float(Math.min(1, hf.mp.landscape.ecology.desert)),
  });
}

/** Two pre-baked value-noise reads per candidate, never live per-pixel fBm.
 * Seed offsets are existing named macro streams; season/camera are absent.
 */
export function groundHabitatPatch(hf: Heightfield, wpos: NV2, sand: NF, moisture: NF): NF {
  if (!hf.noiseA) return float(1);
  const off = vec2(hf.mp.off.plains[0], hf.mp.off.plains[1]);
  const coarse = (texture(hf.noiseA, wpos.div(22 * PERIOD_VAL).add(off), 0) as unknown as NV4).r;
  const fine = (texture(hf.noiseA, wpos.div(1.8 * PERIOD_VAL).add(off.yx), 0) as unknown as NV4).r;
  return groundPatchDensity(TSL_HABITAT_MATH, coarse, fine, habitatAt(hf, sand, moisture).aridity);
}
