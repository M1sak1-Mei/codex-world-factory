/**
 * Vegetation quality contract.
 *
 * Growth (Skeleton.ts), surface realization (TubeMesh/LeafMesh), and shading
 * (VegMaterials.ts) deliberately consume separate sections of this profile.
 * A species can therefore gain richer surfaces without changing its planted
 * position, seed, or branching grammar.
 */

export type VegetationRenderTier = 'hero' | 'near' | 'mid' | 'far';

export interface BarkPbrProfile {
  /** UV parallax depth; zero means the tier samples the unshifted packed maps. */
  parallaxScale: number;
  /** Fixed refinement count for near-field relief parallax. */
  parallaxSteps: number;
  /** Direct-light crevice darkening derived from the packed height field. */
  cavityStrength: number;
  normalScale: number;
  roughnessBias: number;
  specularIntensity: number;
  /** restrained wet-resin/plate sheen, not a varnished clear coat. */
  clearcoat: number;
  clearcoatRoughness: number;
}

export interface LeafPbrProfile {
  roughness: number;
  specularIntensity: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** thin-surface back-light response. */
  transmission: number;
  /** analytic midrib/vein bump strength on real leaf geometry. */
  veinNormal: number;
}

export interface HeroBarkGeometryProfile {
  /** non-circular trunk cross-section. */
  ellipticity: number;
  /** slow rotation of that cross-section in radians per metre. */
  twist: number;
  /** multi-frequency silhouette breakup, as a fraction of branch radius. */
  irregularity: number;
  /** resolved bark plates/ridges, as a fraction of branch radius. */
  microDepth: number;
  ridgeCount: number;
  /** enlarged child bases visually blend branch crotches into the parent. */
  junctionBlend: number;
}

export interface HeroDefectProfile {
  knots: number;
  scars: number;
  peelStrips: number;
}

export interface HeroRootProfile {
  count: number;
  length: [number, number];
  radiusScale: number;
  rise: number;
}

export interface HeroLeafGeometryProfile {
  /** Stable anchor thinning target; captured cards preserve the rest of the crown. */
  meshAnchorTarget: number;
  /** Odd cross-blade sample count; five resolves curved broadleaf surfaces. */
  columns: number;
  rows: number;
  thickness: number;
  serration: number;
  serrationCount: number;
  midrib: number;
  /** Number of major lobes down each side of an oak leaf. */
  lobes: number;
  /** Width removed at the sinuses between major lobes. */
  lobeDepth: number;
  /** Left/right outline and vein variation. */
  asymmetry: number;
  /** Longitudinal blade twist, in radians at the tip. */
  twist: number;
  /** Edge droop relative to the raised midrib. */
  cup: number;
  /** Paired lateral veins represented by blade corrugation. */
  veinPairs: number;
  /** Angular spread of leaves around a terminal shoot. */
  clusterSpread: number;
  /** Curved segments along each real conifer needle. */
  needleSegments: number;
  /** Crossed ribbon planes used to give needles a readable solid volume. */
  needleCrossPlanes: number;
  /** Needle-tip bend as a fraction of needle length. */
  needleCurl: number;
}

export interface VegetationSurfaceProfile {
  id: string;
  bark: BarkPbrProfile;
  leaf: LeafPbrProfile;
  hero: {
    enabled: boolean;
    bark: HeroBarkGeometryProfile;
    defects: HeroDefectProfile;
    roots: HeroRootProfile;
    leaf: HeroLeafGeometryProfile;
  };
}

export interface VegetationTierPolicy {
  hero: { far: number; band: number; maxPerVariant: number };
  near: { far: number; band: number };
  mid: { far: number; band: number };
}

/**
 * Runtime representation bands. The expensive oak geometry is limited to
 * five instances in each of its four structural pools: at most twenty
 * enhanced oaks can be submitted even in an abnormally dense camera cell.
 */
export const VEGETATION_TIER_POLICY: VegetationTierPolicy = {
  hero: { far: 28, band: 5, maxPerVariant: 5 },
  near: { far: 150, band: 14 },
  mid: { far: 460, band: 36 },
};

const DEFAULT_PROFILE: VegetationSurfaceProfile = {
  id: 'standard-tree-v2',
  bark: {
    parallaxScale: 0.008,
    parallaxSteps: 1,
    cavityStrength: 0.12,
    normalScale: 1,
    roughnessBias: 0,
    specularIntensity: 0.4,
    clearcoat: 0,
    clearcoatRoughness: 0.9,
  },
  leaf: {
    roughness: 0.8,
    specularIntensity: 0.3,
    clearcoat: 0.025,
    clearcoatRoughness: 0.72,
    transmission: 0.032,
    veinNormal: 0.08,
  },
  hero: {
    enabled: false,
    bark: {
      ellipticity: 0,
      twist: 0,
      irregularity: 0,
      microDepth: 0,
      ridgeCount: 0,
      junctionBlend: 0.12,
    },
    defects: { knots: 0, scars: 0, peelStrips: 0 },
    roots: { count: 0, length: [0, 0], radiusScale: 0, rise: 0 },
    leaf: {
      meshAnchorTarget: 1200,
      columns: 3,
      rows: 4,
      thickness: 0,
      serration: 0,
      serrationCount: 0,
      midrib: 0,
      lobes: 0,
      lobeDepth: 0,
      asymmetry: 0,
      twist: 0,
      cup: 0,
      veinPairs: 0,
      clusterSpread: 1,
      needleSegments: 1,
      needleCrossPlanes: 1,
      needleCurl: 0,
    },
  },
};

/** First production profile: deliberately specific to old lowland oaks. */
export const ANCIENT_OAK_SURFACE: VegetationSurfaceProfile = {
  id: 'ancient-oak-v2-relief',
  bark: {
    parallaxScale: 0.052,
    parallaxSteps: 5,
    cavityStrength: 0.44,
    normalScale: 1.85,
    roughnessBias: 0.025,
    specularIntensity: 0.36,
    clearcoat: 0.018,
    clearcoatRoughness: 0.82,
  },
  leaf: {
    roughness: 0.72,
    specularIntensity: 0.34,
    clearcoat: 0.07,
    clearcoatRoughness: 0.58,
    transmission: 0.052,
    veinNormal: 0.34,
  },
  hero: {
    enabled: true,
    bark: {
      ellipticity: 0.1,
      twist: 0.075,
      irregularity: 0.085,
      microDepth: 0.065,
      ridgeCount: 13,
      junctionBlend: 0.42,
    },
    defects: { knots: 5, scars: 3, peelStrips: 7 },
    roots: { count: 8, length: [2.2, 4.8], radiusScale: 0.72, rise: 0.42 },
    leaf: {
      meshAnchorTarget: 320,
      columns: 5,
      rows: 16,
      thickness: 0.014,
      serration: 0.022,
      serrationCount: 18,
      midrib: 0.042,
      lobes: 6,
      lobeDepth: 0.52,
      asymmetry: 0.12,
      twist: 0.24,
      cup: 0.16,
      veinPairs: 7,
      clusterSpread: 0.82,
      needleSegments: 1,
      needleCrossPlanes: 1,
      needleCurl: 0,
    },
  },
};

interface SurfaceOverrides {
  bark?: Partial<BarkPbrProfile>;
  leaf?: Partial<LeafPbrProfile>;
  hero?: {
    enabled?: boolean;
    bark?: Partial<HeroBarkGeometryProfile>;
    defects?: Partial<HeroDefectProfile>;
    roots?: Partial<HeroRootProfile>;
    leaf?: Partial<HeroLeafGeometryProfile>;
  };
}

/** Build a fully-populated immutable contract from small species deltas. */
function surfaceProfile(id: string, overrides: SurfaceOverrides): VegetationSurfaceProfile {
  return {
    id,
    bark: { ...DEFAULT_PROFILE.bark, ...overrides.bark },
    leaf: { ...DEFAULT_PROFILE.leaf, ...overrides.leaf },
    hero: {
      enabled: overrides.hero?.enabled ?? false,
      bark: { ...DEFAULT_PROFILE.hero.bark, ...overrides.hero?.bark },
      defects: { ...DEFAULT_PROFILE.hero.defects, ...overrides.hero?.defects },
      roots: { ...DEFAULT_PROFILE.hero.roots, ...overrides.hero?.roots },
      leaf: { ...DEFAULT_PROFILE.hero.leaf, ...overrides.hero?.leaf },
    },
  };
}

export const SPRUCE_SURFACE = surfaceProfile('spruce-v3-fissured-needle', {
  bark: {
    parallaxScale: 0.034, parallaxSteps: 4, cavityStrength: 0.36,
    normalScale: 1.55, roughnessBias: 0.02, specularIntensity: 0.32,
  },
  leaf: {
    roughness: 0.76, specularIntensity: 0.3, clearcoat: 0.055,
    clearcoatRoughness: 0.65, transmission: 0.042, veinNormal: 0,
  },
  hero: {
    enabled: true,
    bark: {
      ellipticity: 0.035, twist: 0.018, irregularity: 0.045,
      microDepth: 0.035, ridgeCount: 17, junctionBlend: 0.28,
    },
    defects: { knots: 3, scars: 1, peelStrips: 4 },
    roots: { count: 6, length: [1.2, 2.8], radiusScale: 0.5, rise: 0.26 },
    leaf: {
      meshAnchorTarget: 220, needleSegments: 2, needleCrossPlanes: 2,
      needleCurl: 0.14, clusterSpread: 0.74,
    },
  },
});

export const PINE_SURFACE = surfaceProfile('pine-v3-plate-needle', {
  bark: {
    parallaxScale: 0.048, parallaxSteps: 5, cavityStrength: 0.42,
    normalScale: 1.72, roughnessBias: -0.015, specularIntensity: 0.34,
    clearcoat: 0.012, clearcoatRoughness: 0.84,
  },
  leaf: {
    roughness: 0.7, specularIntensity: 0.34, clearcoat: 0.075,
    clearcoatRoughness: 0.58, transmission: 0.048, veinNormal: 0,
  },
  hero: {
    enabled: true,
    bark: {
      ellipticity: 0.065, twist: 0.035, irregularity: 0.06,
      microDepth: 0.06, ridgeCount: 9, junctionBlend: 0.34,
    },
    defects: { knots: 5, scars: 2, peelStrips: 11 },
    roots: { count: 7, length: [1.5, 3.3], radiusScale: 0.58, rise: 0.3 },
    leaf: {
      meshAnchorTarget: 120, needleSegments: 3, needleCrossPlanes: 2,
      needleCurl: 0.22, clusterSpread: 0.9,
    },
  },
});

export const BEECH_SURFACE = surfaceProfile('beech-v3-smooth-broadleaf', {
  bark: {
    parallaxScale: 0.014, parallaxSteps: 3, cavityStrength: 0.16,
    normalScale: 0.92, roughnessBias: -0.04, specularIntensity: 0.38,
    clearcoat: 0.01, clearcoatRoughness: 0.82,
  },
  leaf: {
    roughness: 0.7, specularIntensity: 0.34, clearcoat: 0.065,
    clearcoatRoughness: 0.6, transmission: 0.052, veinNormal: 0.27,
  },
  hero: {
    enabled: true,
    bark: {
      ellipticity: 0.055, twist: 0.018, irregularity: 0.025,
      microDepth: 0.012, ridgeCount: 5, junctionBlend: 0.4,
    },
    defects: { knots: 2, scars: 3, peelStrips: 1 },
    roots: { count: 7, length: [1.6, 3.6], radiusScale: 0.62, rise: 0.34 },
    leaf: {
      meshAnchorTarget: 260, columns: 5, rows: 12, thickness: 0.01,
      serration: 0.035, serrationCount: 14, midrib: 0.032,
      asymmetry: 0.07, twist: 0.16, cup: 0.11, veinPairs: 7,
      clusterSpread: 0.7,
    },
  },
});

export const BIRCH_SURFACE = surfaceProfile('birch-v3-paper-diamond-leaf', {
  bark: {
    parallaxScale: 0.018, parallaxSteps: 3, cavityStrength: 0.22,
    normalScale: 1.15, roughnessBias: -0.08, specularIntensity: 0.4,
    clearcoat: 0.015, clearcoatRoughness: 0.78,
  },
  leaf: {
    roughness: 0.68, specularIntensity: 0.35, clearcoat: 0.07,
    clearcoatRoughness: 0.56, transmission: 0.057, veinNormal: 0.3,
  },
  hero: {
    enabled: true,
    bark: {
      ellipticity: 0.04, twist: 0.026, irregularity: 0.035,
      microDepth: 0.018, ridgeCount: 7, junctionBlend: 0.32,
    },
    defects: { knots: 3, scars: 2, peelStrips: 12 },
    roots: { count: 5, length: [0.9, 2.2], radiusScale: 0.45, rise: 0.22 },
    leaf: {
      meshAnchorTarget: 300, columns: 5, rows: 11, thickness: 0.009,
      serration: 0.065, serrationCount: 18, midrib: 0.028,
      asymmetry: 0.1, twist: 0.2, cup: 0.09, veinPairs: 6,
      clusterSpread: 0.78,
    },
  },
});

export const KARST_SURFACE = surfaceProfile('karst-v3-gnarled-evergreen', {
  bark: {
    parallaxScale: 0.052, parallaxSteps: 5, cavityStrength: 0.46,
    normalScale: 1.9, roughnessBias: 0.035, specularIntensity: 0.3,
  },
  leaf: {
    roughness: 0.76, specularIntensity: 0.3, clearcoat: 0.045,
    clearcoatRoughness: 0.68, transmission: 0.04, veinNormal: 0.25,
  },
  hero: {
    enabled: true,
    bark: {
      ellipticity: 0.14, twist: 0.16, irregularity: 0.13,
      microDepth: 0.09, ridgeCount: 11, junctionBlend: 0.48,
    },
    defects: { knots: 7, scars: 4, peelStrips: 8 },
    roots: { count: 8, length: [0.8, 2.1], radiusScale: 0.82, rise: 0.46 },
    leaf: {
      meshAnchorTarget: 220, columns: 5, rows: 12, thickness: 0.012,
      serration: 0.045, serrationCount: 15, midrib: 0.033,
      asymmetry: 0.15, twist: 0.25, cup: 0.14, veinPairs: 6,
      clusterSpread: 0.86,
    },
  },
});

export const SNAG_SURFACE = surfaceProfile('snag-v3-weathered-split', {
  bark: {
    parallaxScale: 0.044, parallaxSteps: 4, cavityStrength: 0.48,
    normalScale: 1.8, roughnessBias: 0.05, specularIntensity: 0.26,
  },
  hero: {
    enabled: true,
    bark: {
      ellipticity: 0.11, twist: 0.045, irregularity: 0.1,
      microDepth: 0.07, ridgeCount: 12, junctionBlend: 0.3,
    },
    defects: { knots: 8, scars: 7, peelStrips: 15 },
    roots: { count: 6, length: [1.0, 2.7], radiusScale: 0.58, rise: 0.26 },
    leaf: { meshAnchorTarget: 0 },
  },
});

export const WILLOW_SURFACE = surfaceProfile('willow-v3-furrow-lance-leaf', {
  bark: {
    parallaxScale: 0.032, parallaxSteps: 4, cavityStrength: 0.34,
    normalScale: 1.48, roughnessBias: 0.015, specularIntensity: 0.33,
  },
  leaf: {
    roughness: 0.69, specularIntensity: 0.33, clearcoat: 0.06,
    clearcoatRoughness: 0.62, transmission: 0.06, veinNormal: 0.25,
  },
  hero: {
    enabled: true,
    bark: {
      ellipticity: 0.075, twist: 0.052, irregularity: 0.07,
      microDepth: 0.038, ridgeCount: 12, junctionBlend: 0.38,
    },
    defects: { knots: 4, scars: 3, peelStrips: 6 },
    roots: { count: 8, length: [1.4, 3.5], radiusScale: 0.66, rise: 0.32 },
    leaf: {
      meshAnchorTarget: 280, columns: 5, rows: 14, thickness: 0.008,
      serration: 0.025, serrationCount: 16, midrib: 0.024,
      asymmetry: 0.08, twist: 0.28, cup: 0.07, veinPairs: 8,
      clusterSpread: 0.62,
    },
  },
});

const HAZEL_SURFACE = surfaceProfile('hazel-capture-v3', {
  bark: { parallaxScale: 0.012, parallaxSteps: 2, cavityStrength: 0.16, normalScale: 0.9 },
  leaf: { veinNormal: 0.26, transmission: 0.052, clearcoat: 0.055 },
  hero: { leaf: {
    columns: 5, rows: 10, thickness: 0.008, serration: 0.035,
    serrationCount: 13, midrib: 0.026, asymmetry: 0.08, twist: 0.16,
    cup: 0.1, veinPairs: 6, clusterSpread: 0.74,
  } },
});

const PINK_BUSH_SURFACE = surfaceProfile('pink-bush-capture-v3', {
  bark: { parallaxScale: 0.012, parallaxSteps: 2, cavityStrength: 0.16, normalScale: 0.9 },
  leaf: { veinNormal: 0.24, transmission: 0.05, clearcoat: 0.05 },
  hero: { leaf: {
    columns: 5, rows: 9, thickness: 0.008, serration: 0.03,
    serrationCount: 12, midrib: 0.024, asymmetry: 0.1, twist: 0.18,
    cup: 0.1, veinPairs: 6, clusterSpread: 0.8,
  } },
});

const JUNIPER_SURFACE = surfaceProfile('juniper-capture-v3', {
  leaf: { roughness: 0.75, specularIntensity: 0.28, transmission: 0.038 },
  hero: { leaf: {
    needleSegments: 2, needleCrossPlanes: 2, needleCurl: 0.1,
    clusterSpread: 0.7,
  } },
});

const FERN_SURFACE = surfaceProfile('fern-capture-v3', {
  leaf: { roughness: 0.72, specularIntensity: 0.3, transmission: 0.055, veinNormal: 0.22 },
  hero: { leaf: {
    needleSegments: 2, needleCrossPlanes: 2, needleCurl: 0.18,
    clusterSpread: 0.7,
  } },
});

export const VEGETATION_SURFACE_PROFILES = {
  spruce: SPRUCE_SURFACE,
  pine: PINE_SURFACE,
  beech: BEECH_SURFACE,
  birch: BIRCH_SURFACE,
  karst: KARST_SURFACE,
  snag: SNAG_SURFACE,
  oak: ANCIENT_OAK_SURFACE,
  willow: WILLOW_SURFACE,
  bushHazel: HAZEL_SURFACE,
  bushPink: PINK_BUSH_SURFACE,
  bushJuniper: JUNIPER_SURFACE,
  fern: FERN_SURFACE,
} as const satisfies Record<string, VegetationSurfaceProfile>;

export function vegetationSurfaceProfile(speciesId: string): VegetationSurfaceProfile {
  return VEGETATION_SURFACE_PROFILES[
    speciesId as keyof typeof VEGETATION_SURFACE_PROFILES
  ] ?? DEFAULT_PROFILE;
}

export function barkProfileForTier(
  profile: VegetationSurfaceProfile,
  tier: VegetationRenderTier,
): BarkPbrProfile {
  if (tier === 'hero') return profile.bark;
  if (tier === 'near') {
    return {
      ...profile.bark,
      parallaxSteps: Math.min(3, profile.bark.parallaxSteps),
      parallaxScale: profile.bark.parallaxScale * 0.78,
      cavityStrength: profile.bark.cavityStrength * 0.82,
    };
  }
  if (tier === 'mid') {
    return {
      ...profile.bark,
      parallaxScale: 0,
      parallaxSteps: 0,
      cavityStrength: profile.bark.cavityStrength * 0.5,
      normalScale: profile.bark.normalScale * 0.82,
      clearcoat: 0,
    };
  }
  return {
    ...profile.bark,
    parallaxScale: 0,
    parallaxSteps: 0,
    cavityStrength: 0,
    normalScale: 0,
    clearcoat: 0,
  };
}
