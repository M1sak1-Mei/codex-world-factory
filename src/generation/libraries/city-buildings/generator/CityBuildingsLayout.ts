/** Shared district dimensions used by planning, grammar, occupancy, and spawn. */
export const CITY_DISTRICT_RADIUS = 96;
export const CITY_BLOCK_PITCH = 48;
export const CITY_BLOCK_INNER = 34;
export const CITY_ENTRANCE_ANGLE = Math.PI * 0.5;

/** Three-by-three blocks: eight dense housing blocks around a civic center. */
export const CITY_BLOCK_COORDINATES = [-1, 0, 1] as const;
