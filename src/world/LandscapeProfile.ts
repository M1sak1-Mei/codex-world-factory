/**
 * Declarative landscape controls shared by terrain, biome, surface, and
 * vegetation generation. URL requests select a preset, then apply explicit
 * include/exclude tags; exclusions always win.
 */

export const LANDSCAPE_PROFILE_IDS = [
  'legacy',
  'balanced',
  'wild',
  'settled',
  'paved',
  'arid',
  'alpine',
  'oasis',
  'coastal',
  'moorland',
] as const;

export type LandscapeProfileId = (typeof LANDSCAPE_PROFILE_IDS)[number];

export const LANDSCAPE_TAGS = [
  'mountains',
  'hills',
  'plains',
  'basins',
  'forest',
  'meadow',
  'wetland',
  'desert',
  'snow',
  'grass',
  'shrubs',
  'flowers',
  'cacti',
  'cobble',
  'concrete',
] as const;

export type LandscapeTag = (typeof LANDSCAPE_TAGS)[number];

export interface LandscapeNoiseControls {
  macroScale: number;
  hills: number;
  plains: number;
  basins: number;
  mountains: number;
  detailScale: number;
  detailAmplitude: number;
  warp: number;
}

export interface LandscapeEcologyControls {
  forest: number;
  meadow: number;
  wetland: number;
  desert: number;
  snow: number;
  grass: number;
  shrubs: number;
  flowers: number;
  cacti: number;
}

export interface LandscapeSurfaceControls {
  sand: number;
  cobble: number;
  concrete: number;
  layout: 'none' | 'organic' | 'paved-network';
}

export interface ResolvedLandscapeProfile {
  id: LandscapeProfileId;
  include: readonly LandscapeTag[];
  exclude: readonly LandscapeTag[];
  noise: LandscapeNoiseControls;
  ecology: LandscapeEcologyControls;
  surfaces: LandscapeSurfaceControls;
}

interface LandscapePreset {
  noise: LandscapeNoiseControls;
  ecology: LandscapeEcologyControls;
  surfaces: LandscapeSurfaceControls;
}

const LEGACY: LandscapePreset = {
  noise: {
    macroScale: 1,
    hills: 1,
    plains: 0,
    basins: 0,
    mountains: 1,
    detailScale: 1,
    detailAmplitude: 1,
    warp: 1,
  },
  ecology: {
    forest: 1,
    meadow: 1,
    wetland: 1,
    desert: 0,
    snow: 1,
    grass: 1,
    shrubs: 1,
    flowers: 1,
    cacti: 0,
  },
  surfaces: { sand: 0, cobble: 0, concrete: 0, layout: 'none' },
};

const PRESETS: Readonly<Record<LandscapeProfileId, LandscapePreset>> = {
  legacy: LEGACY,
  balanced: {
    noise: {
      macroScale: 0.92,
      hills: 1.15,
      plains: 0.62,
      basins: 0.72,
      mountains: 1,
      detailScale: 0.92,
      detailAmplitude: 1.12,
      warp: 1.12,
    },
    ecology: {
      forest: 1.08,
      meadow: 1.15,
      wetland: 1.05,
      desert: 0.34,
      snow: 1,
      grass: 1.12,
      shrubs: 1.1,
      flowers: 1.18,
      cacti: 0.24,
    },
    surfaces: { sand: 0.38, cobble: 0.72, concrete: 0.32, layout: 'organic' },
  },
  wild: {
    noise: {
      macroScale: 0.82,
      hills: 1.35,
      plains: 0.22,
      basins: 0.9,
      mountains: 1.18,
      detailScale: 0.8,
      detailAmplitude: 1.3,
      warp: 1.35,
    },
    ecology: {
      forest: 1.25,
      meadow: 0.9,
      wetland: 1.15,
      desert: 0.16,
      snow: 1.05,
      grass: 1.08,
      shrubs: 1.25,
      flowers: 0.9,
      cacti: 0.08,
    },
    surfaces: { sand: 0.18, cobble: 0, concrete: 0, layout: 'none' },
  },
  settled: {
    noise: {
      macroScale: 1.2,
      hills: 0.72,
      plains: 1.2,
      basins: 0.42,
      mountains: 0.82,
      detailScale: 1.2,
      detailAmplitude: 0.72,
      warp: 0.75,
    },
    ecology: {
      forest: 0.78,
      meadow: 1.35,
      wetland: 0.8,
      desert: 0.15,
      snow: 0.9,
      grass: 1.22,
      shrubs: 0.72,
      flowers: 1.25,
      cacti: 0.04,
    },
    surfaces: { sand: 0.2, cobble: 1.25, concrete: 1.1, layout: 'organic' },
  },
  paved: {
    noise: {
      macroScale: 1.35,
      hills: 0.34,
      plains: 1.55,
      basins: 0.2,
      mountains: 0.12,
      detailScale: 1.4,
      detailAmplitude: 0.38,
      warp: 0.28,
    },
    ecology: {
      forest: 0.45,
      meadow: 0.9,
      wetland: 0.3,
      desert: 0.08,
      snow: 0,
      grass: 0.82,
      shrubs: 0.32,
      flowers: 0.55,
      cacti: 0.02,
    },
    surfaces: { sand: 0.08, cobble: 1.6, concrete: 1.45, layout: 'paved-network' },
  },
  arid: {
    noise: {
      macroScale: 1.08,
      hills: 0.88,
      plains: 0.92,
      basins: 0.48,
      mountains: 0.92,
      detailScale: 0.72,
      detailAmplitude: 1.2,
      warp: 0.68,
    },
    ecology: {
      forest: 0.16,
      meadow: 0.22,
      wetland: 0.3,
      desert: 1.5,
      snow: 0.08,
      grass: 0.24,
      shrubs: 0.52,
      flowers: 0.14,
      cacti: 1.45,
    },
    surfaces: { sand: 1.55, cobble: 0.25, concrete: 0.12, layout: 'organic' },
  },
  alpine: {
    noise: {
      macroScale: 0.84,
      hills: 1.05,
      plains: 0.18,
      basins: 0.56,
      mountains: 1.32,
      detailScale: 0.74,
      detailAmplitude: 1.28,
      warp: 1.08,
    },
    ecology: {
      forest: 0.7,
      meadow: 0.62,
      wetland: 0.55,
      desert: 0,
      snow: 1.45,
      grass: 0.68,
      shrubs: 0.72,
      flowers: 0.5,
      cacti: 0,
    },
    surfaces: { sand: 0, cobble: 0.12, concrete: 0, layout: 'organic' },
  },
  oasis: {
    noise: {
      macroScale: 1.12,
      hills: 0.62,
      plains: 1.08,
      basins: 1.18,
      mountains: 0.4,
      detailScale: 0.9,
      detailAmplitude: 0.82,
      warp: 0.62,
    },
    ecology: {
      forest: 0.22,
      meadow: 0.38,
      wetland: 1.18,
      desert: 1.28,
      snow: 0,
      grass: 0.42,
      shrubs: 0.58,
      flowers: 0.32,
      cacti: 1.35,
    },
    surfaces: { sand: 1.35, cobble: 0.08, concrete: 0, layout: 'none' },
  },
  coastal: {
    noise: {
      macroScale: 1.08,
      hills: 0.72,
      plains: 0.92,
      basins: 1.1,
      mountains: 0.38,
      detailScale: 0.94,
      detailAmplitude: 0.86,
      warp: 1.18,
    },
    ecology: {
      forest: 0.68,
      meadow: 1.02,
      wetland: 1.42,
      desert: 0.16,
      snow: 0,
      grass: 1.08,
      shrubs: 0.9,
      flowers: 0.8,
      cacti: 0.04,
    },
    surfaces: { sand: 1.18, cobble: 0.18, concrete: 0, layout: 'none' },
  },
  moorland: {
    noise: {
      macroScale: 0.92,
      hills: 1.2,
      plains: 0.56,
      basins: 0.92,
      mountains: 0.66,
      detailScale: 0.8,
      detailAmplitude: 1.14,
      warp: 1.26,
    },
    ecology: {
      forest: 0.34,
      meadow: 1.18,
      wetland: 1.32,
      desert: 0,
      snow: 0.46,
      grass: 1.18,
      shrubs: 1.28,
      flowers: 0.56,
      cacti: 0,
    },
    surfaces: { sand: 0.12, cobble: 0.08, concrete: 0, layout: 'none' },
  },
};

export function isLandscapeProfileId(value: string): value is LandscapeProfileId {
  return (LANDSCAPE_PROFILE_IDS as readonly string[]).includes(value);
}

export function parseLandscapeProfileId(value: string | null): LandscapeProfileId {
  return value !== null && isLandscapeProfileId(value) ? value : 'balanced';
}

export function isLandscapeTag(value: string): value is LandscapeTag {
  return (LANDSCAPE_TAGS as readonly string[]).includes(value);
}

export function parseLandscapeTags(value: string | null): LandscapeTag[] {
  if (!value) return [];
  const unique = new Set<LandscapeTag>();
  for (const raw of value.split(',')) {
    const tag = raw.trim();
    if (isLandscapeTag(tag)) unique.add(tag);
  }
  return [...unique];
}

function copyPreset(preset: LandscapePreset): LandscapePreset {
  return {
    noise: { ...preset.noise },
    ecology: { ...preset.ecology },
    surfaces: { ...preset.surfaces },
  };
}

function includeTag(profile: LandscapePreset, tag: LandscapeTag): void {
  switch (tag) {
    case 'mountains': profile.noise.mountains = Math.max(profile.noise.mountains, 1); break;
    case 'hills': profile.noise.hills = Math.max(profile.noise.hills, 1); break;
    case 'plains': profile.noise.plains = Math.max(profile.noise.plains, 0.8); break;
    case 'basins': profile.noise.basins = Math.max(profile.noise.basins, 0.8); break;
    case 'forest': profile.ecology.forest = Math.max(profile.ecology.forest, 0.85); break;
    case 'meadow': profile.ecology.meadow = Math.max(profile.ecology.meadow, 0.9); break;
    case 'wetland': profile.ecology.wetland = Math.max(profile.ecology.wetland, 0.9); break;
    case 'desert':
      profile.ecology.desert = Math.max(profile.ecology.desert, 1);
      profile.surfaces.sand = Math.max(profile.surfaces.sand, 1);
      break;
    case 'snow': profile.ecology.snow = Math.max(profile.ecology.snow, 1); break;
    case 'grass': profile.ecology.grass = Math.max(profile.ecology.grass, 0.9); break;
    case 'shrubs': profile.ecology.shrubs = Math.max(profile.ecology.shrubs, 0.9); break;
    case 'flowers': profile.ecology.flowers = Math.max(profile.ecology.flowers, 0.9); break;
    case 'cacti':
      profile.ecology.cacti = Math.max(profile.ecology.cacti, 1);
      profile.ecology.desert = Math.max(profile.ecology.desert, 0.8);
      profile.surfaces.sand = Math.max(profile.surfaces.sand, 0.65);
      break;
    case 'cobble': profile.surfaces.cobble = Math.max(profile.surfaces.cobble, 1); break;
    case 'concrete': profile.surfaces.concrete = Math.max(profile.surfaces.concrete, 1); break;
  }
}

function excludeTag(profile: LandscapePreset, tag: LandscapeTag): void {
  switch (tag) {
    case 'mountains': profile.noise.mountains = 0; break;
    case 'hills': profile.noise.hills = 0; break;
    case 'plains': profile.noise.plains = 0; break;
    case 'basins': profile.noise.basins = 0; break;
    case 'forest': profile.ecology.forest = 0; break;
    case 'meadow': profile.ecology.meadow = 0; break;
    case 'wetland': profile.ecology.wetland = 0; break;
    case 'desert':
      profile.ecology.desert = 0;
      profile.surfaces.sand = 0;
      break;
    case 'snow': profile.ecology.snow = 0; break;
    case 'grass': profile.ecology.grass = 0; break;
    case 'shrubs': profile.ecology.shrubs = 0; break;
    case 'flowers': profile.ecology.flowers = 0; break;
    case 'cacti': profile.ecology.cacti = 0; break;
    case 'cobble': profile.surfaces.cobble = 0; break;
    case 'concrete': profile.surfaces.concrete = 0; break;
  }
}

export function resolveLandscapeProfile(
  id: LandscapeProfileId,
  include: readonly LandscapeTag[] = [],
  exclude: readonly LandscapeTag[] = [],
): ResolvedLandscapeProfile {
  const resolved = copyPreset(PRESETS[id]);
  for (const tag of include) includeTag(resolved, tag);
  for (const tag of exclude) excludeTag(resolved, tag);
  return {
    id,
    include: [...new Set(include)],
    exclude: [...new Set(exclude)],
    noise: resolved.noise,
    ecology: resolved.ecology,
    surfaces: resolved.surfaces,
  };
}
