import type { MagicRuinsSiteKind } from './MagicForestRuinsRecipe';

/** Shared semantic axis used by the wall opening, access corridor, spawn, and portal. */
export const SANCTUARY_ENTRANCE_ANGLE = Math.PI * 0.5;
export const SANCTUARY_SEGMENTS = 14;
export const SANCTUARY_ENTRANCE_SEGMENTS: ReadonlySet<number> = new Set([2, 3, 4]);

export const MAGIC_RUINS_SITE_RADIUS: Readonly<Record<MagicRuinsSiteKind, number>> = {
  sanctuary: 30,
  'watch-circle': 22,
  'forest-shrine': 18,
};

export const MAGIC_RUINS_TARGET_DISTANCE: Readonly<Record<MagicRuinsSiteKind, number>> = {
  sanctuary: 320,
  'watch-circle': 860,
  'forest-shrine': 1320,
};
