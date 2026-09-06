/** Shared CPU/GPU contract for stable, bounded near-tree selection. */
export const HERO_SLOT_BITS = 20;
export const HERO_SLOT_LIMIT = 2 ** HERO_SLOT_BITS;
export const HERO_SLOT_MASK = HERO_SLOT_LIMIT - 1;
export const HERO_DISTANCE_STEPS = 4094;
export const HERO_EMPTY_KEY = 0xffffffff;

/** Quantized distance first, stable scatter identity as the tie-breaker. */
export function heroPriorityKey(distance: number, slot: number, reach: number): number {
  if (!Number.isInteger(slot) || slot < 0 || slot >= HERO_SLOT_LIMIT) {
    throw new RangeError('Hero scatter slot exceeds the packed-key budget');
  }
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(reach) || reach <= 0) {
    throw new RangeError('Hero distances must be finite and non-negative');
  }
  const bucket = Math.floor(Math.min(1, distance / reach) * HERO_DISTANCE_STEPS);
  return (bucket * HERO_SLOT_LIMIT + slot) >>> 0;
}

/** CPU oracle for the GPU atomic-min insertion network (not a frame loop). */
export function insertHeroPriority(keys: Uint32Array, candidate: number): void {
  let carry = candidate >>> 0;
  for (let i = 0; i < keys.length; i++) {
    const old = keys[i] ?? HERO_EMPTY_KEY;
    keys[i] = Math.min(old, carry);
    carry = Math.max(old, carry);
  }
}
