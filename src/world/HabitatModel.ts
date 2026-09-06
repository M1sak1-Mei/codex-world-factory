/**
 * Ecological placement rules, independent of geometry, renderer and season.
 * The same scalar model runs on numbers in tests and TSL nodes on the GPU.
 * Biome ids retain their existing texture/pool contract; habitat is a
 * continuous overlay, so adding dry/wet communities cannot break old LODs.
 */
export interface HabitatMath<T> {
  value(n: number): T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  mul(a: T, b: T): T;
  div(a: T, b: T): T;
  max(a: T, b: T): T;
  pow(a: T, exponent: number): T;
  smooth(a: number, b: number, x: T): T;
}

export const NUMBER_HABITAT_MATH: HabitatMath<number> = {
  value: (n) => n,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  max: Math.max,
  pow: Math.pow,
  smooth: (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  },
};

export interface HabitatSite<T> {
  sand: T;
  moisture: T;
  /** Resolved landscape control, clamped by the caller to 0..1. */
  desert: T;
}

export function habitatResponse<T>(m: HabitatMath<T>, site: HabitatSite<T>) {
  const one = m.value(1);
  const aridity = m.mul(
    m.mul(m.smooth(0.12, 0.8, site.sand), site.desert),
    m.sub(one, m.smooth(0.4, 0.78, site.moisture)),
  );
  const green = m.sub(one, m.smooth(0.25, 0.82, aridity));
  const moistWoodland = m.smooth(0.38, 0.76, site.moisture);
  const woodland = m.mul(green, m.add(
    m.sub(one, site.desert), m.mul(site.desert, moistWoodland),
  ));
  const cactus = m.mul(m.mul(m.pow(site.sand, 0.72), site.desert),
    m.sub(one, m.smooth(0.42, 0.78, site.moisture)));
  return { aridity, green, woodland, cactus };
}

/** Final category intensities, not a separate acceptance/selection roulette.
 * An accepted cactus candidate must never lend its probability to a fern.
 */
export function understoryIntensities<T>(
  m: HabitatMath<T>, greenWeights: readonly T[], greenDensity: T, cactusDensity: T,
): T[] {
  const sum = greenWeights.reduce((a, b) => m.add(a, b), m.value(0));
  const safeSum = m.max(sum, m.value(1e-6));
  return [...greenWeights.map((w) => m.mul(m.div(w, safeSum), greenDensity)), cactusDensity];
}

/** Stable world-space patches: broad drifts contain small tufts and gaps.
 * Dry ground deliberately retains exposed sand between isolated grass tufts.
 */
export function groundPatchDensity<T>(m: HabitatMath<T>, coarse: T, fine: T, aridity: T): T {
  const temperate = m.mul(
    m.add(m.value(0.15), m.mul(m.smooth(0.28, 0.75, coarse), m.value(1.5))),
    m.add(m.value(0.08), m.mul(m.smooth(0.25, 0.78, fine), m.value(1.22))),
  );
  const dry = m.mul(m.smooth(0.5, 0.8, coarse), m.smooth(0.65, 0.9, fine));
  return m.add(m.mul(temperate, m.sub(m.value(1), aridity)), m.mul(dry, aridity));
}

export function wetlandSuitability<T>(
  m: HabitatMath<T>, moisture: T, slope: T, temperature: T, enabled: number,
): T {
  return m.mul(m.mul(
    m.smooth(0.7, 0.82, moisture), m.sub(m.value(1), m.smooth(0.22, 0.38, slope)),
  ), m.mul(m.smooth(-0.5, 1.8, temperature), m.value(Math.min(1, Math.max(0, enabled)))));
}

export interface HabitatSpeciesWeight {
  id: string;
  /** Alpine, subalpine, conifer, karst, meadow, wetland. */
  biome: readonly [number, number, number, number, number, number];
  moisture: readonly [number, number]; // base + slope * moisture
}

/** Pool order is deliberately unchanged (Scatter/VegLibrary/Forests). */
export const TREE_HABITAT_PALETTE: readonly HabitatSpeciesWeight[] = [
  { id: 'spruce', biome: [0, 0.6, 0.58, 0.07, 0.05, 0.12], moisture: [0.75, 0.5] },
  { id: 'pine', biome: [0, 0.22, 0.27, 0.02, 0.15, 0], moisture: [1.45, -0.9] },
  { id: 'beech', biome: [0, 0, 0.02, 0.5, 0.42, 0.05], moisture: [0.55, 0.9] },
  { id: 'birch', biome: [0, 0.03, 0.08, 0.16, 0.3, 0.55], moisture: [0.7, 0.6] },
  { id: 'karst', biome: [0, 0, 0, 0.2, 0, 0], moisture: [1, 0] },
  { id: 'snag', biome: [0, 0.15, 0.05, 0.05, 0.08, 0.28], moisture: [1, 0] },
  { id: 'oak', biome: [0, 0.01, 0.1, 0.5, 0.34, 0.16], moisture: [0.65, 0.55] },
  { id: 'willow', biome: [0, 0, 0.02, 0.08, 0.12, 0.72], moisture: [1, 0] },
];

export const UNDERSTORY_HABITAT_PALETTE: readonly HabitatSpeciesWeight[] = [
  { id: 'hazel', biome: [0, 0.05, 0.15, 0.3, 0.04, 0.1], moisture: [1, 0] },
  { id: 'pink-shrub', biome: [0, 0, 0.02, 0.12, 0.1, 0.02], moisture: [1, 0] },
  { id: 'juniper', biome: [0, 0.55, 0.3, 0.02, 0.03, 0], moisture: [1.3, -0.8] },
  { id: 'fern', biome: [0, 0.1, 0.4, 0.38, 0.03, 0.5], moisture: [0.3, 1.1] },
  { id: 'umbel', biome: [0, 0.1, 0.05, 0.06, 0.3, 0.2], moisture: [1, 0] },
  { id: 'bell', biome: [0, 0.08, 0.04, 0.06, 0.22, 0.1], moisture: [1, 0] },
  { id: 'daisy', biome: [0, 0.12, 0.04, 0.06, 0.28, 0.08], moisture: [1, 0] },
];
