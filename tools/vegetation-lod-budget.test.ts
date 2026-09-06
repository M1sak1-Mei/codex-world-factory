import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HERO_EMPTY_KEY, HERO_SLOT_LIMIT, HERO_SLOT_MASK, heroPriorityKey, insertHeroPriority,
} from '../src/vegetation/VegetationLodBudget';
import { VEGETATION_TIER_POLICY } from '../src/vegetation/VegetationProfiles';

test('Hero insertion selects the same nearest identities in any submission order', () => {
  const policy = VEGETATION_TIER_POLICY.hero;
  const candidates = Array.from({ length: 37 }, (_, slot) =>
    heroPriorityKey((slot * 7) % 33, slot, policy.far + policy.band));
  const expected = [...candidates].sort((a, b) => a - b).slice(0, policy.maxPerVariant);
  for (let shift = 0; shift < candidates.length; shift++) {
    const keys = new Uint32Array(policy.maxPerVariant).fill(HERO_EMPTY_KEY);
    for (const key of [...candidates.slice(shift), ...candidates.slice(0, shift)].reverse()) {
      insertHeroPriority(keys, key);
    }
    assert.deepEqual(Array.from(keys), expected);
    assert.equal(new Set(Array.from(keys, (key) => key & HERO_SLOT_MASK)).size, keys.length);
  }
});

test('Hero key ties preserve identity and never collide with empty sentinel', () => {
  assert.ok(heroPriorityKey(10, 3, 33) < heroPriorityKey(10, 4, 33));
  assert.ok(heroPriorityKey(33, HERO_SLOT_LIMIT - 1, 33) < HERO_EMPTY_KEY);
  assert.throws(() => heroPriorityKey(1, HERO_SLOT_LIMIT, 33), RangeError);
  assert.throws(() => heroPriorityKey(NaN, 0, 33), RangeError);
});

test('over-budget trees retain R1 instead of being faded out below the Hero boundary', () => {
  const policy = VEGETATION_TIER_POLICY.hero;
  const keys = new Uint32Array(policy.maxPerVariant).fill(HERO_EMPTY_KEY);
  for (let slot = 0; slot < 9; slot++) insertHeroPriority(keys, heroPriorityKey(10 + slot, slot, 33));
  const chosen = new Set(Array.from(keys, (key) => key & HERO_SLOT_MASK));
  for (let slot = 0; slot < 9; slot++) {
    const selected = chosen.has(slot);
    const nearIsDrawn = !selected || 10 + slot >= policy.far - policy.band;
    const fadeIn = selected ? 0 : 1; // below 23m; unselected R1 is fully opaque
    assert.ok(selected || (nearIsDrawn && fadeIn === 1));
  }
});
