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
    },
  },
};

export function vegetationSurfaceProfile(speciesId: string): VegetationSurfaceProfile {
  return speciesId === 'oak' ? ANCIENT_OAK_SURFACE : DEFAULT_PROFILE;
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
