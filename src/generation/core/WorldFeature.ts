/**
 * Stable contracts shared by every procedural world-feature library.
 *
 * Libraries plan against a read-only terrain surface, emit occupancy before
 * GPU scatter, then build an independently updateable runtime. The renderer,
 * terrain implementation, and concrete feature grammar stay decoupled.
 */

import type { Group, PerspectiveCamera } from 'three';
import type { WorldSeed } from '../../core/Seed';
import type { SegmentObstacle } from '../../core/Collision';

export interface TerrainSurface {
  heightAt(x: number, z: number): number;
  waterAt(x: number, z: number): number;
  slopeAt(x: number, z: number, step?: number): number;
  reliefAt(x: number, z: number, radius: number, samples?: number): number;
}

/** Per-layer vegetation clearance emitted before GPU scatter. */
export interface ScatterExclusionZone {
  id: string;
  center: readonly [number, number];
  treeRadius: number;
  understoryRadius: number;
  extrasRadius: number;
  stonesRadius: number;
}

export interface FeatureSpawn {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  mode: 'walk' | 'fly';
}

export interface WorldFeaturePlan {
  libraryId: string;
  recipeId: string;
  exclusions: ScatterExclusionZone[];
}

export interface WorldFeaturePlanContext {
  terrain: TerrainSurface;
  seed: WorldSeed;
  worldHalf: number;
}

export interface WorldFeatureBuildContext {
  terrain: TerrainSurface;
  seed: WorldSeed;
}

export interface WorldFeatureRuntime {
  group: Group;
  primarySpawn: FeatureSpawn | null;
  obstacles: readonly SegmentObstacle[];
  stats: Readonly<Record<string, number>>;
  update(camera: PerspectiveCamera): void;
}

export interface TypedWorldFeatureLibrary<TPlan extends WorldFeaturePlan> {
  id: string;
  recipeIds: readonly string[];
  plan(recipeId: string, context: WorldFeaturePlanContext): TPlan;
  build(plan: TPlan, context: WorldFeatureBuildContext): WorldFeatureRuntime;
}

/** Type-erased registry surface; concrete libraries keep their typed plans. */
export interface WorldFeatureLibrary {
  id: string;
  recipeIds: readonly string[];
  plan(recipeId: string, context: WorldFeaturePlanContext): WorldFeaturePlan;
  build(plan: WorldFeaturePlan, context: WorldFeatureBuildContext): WorldFeatureRuntime;
}

export function defineWorldFeatureLibrary<TPlan extends WorldFeaturePlan>(
  library: TypedWorldFeatureLibrary<TPlan>,
): WorldFeatureLibrary {
  return {
    id: library.id,
    recipeIds: library.recipeIds,
    plan: (recipeId, context) => library.plan(recipeId, context),
    build: (plan, context) => {
      if (plan.libraryId !== library.id) {
        throw new Error(`Feature plan ${plan.libraryId} cannot be built by ${library.id}`);
      }
      return library.build(plan as TPlan, context);
    },
  };
}
