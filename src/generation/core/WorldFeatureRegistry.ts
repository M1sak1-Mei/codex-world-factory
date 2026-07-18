import { Group, type PerspectiveCamera } from 'three';
import type { SegmentObstacle } from '../../core/Collision';
import type {
  FeatureSpawn,
  ScatterExclusionZone,
  WorldFeatureBuildContext,
  WorldFeatureLibrary,
  WorldFeaturePlan,
  WorldFeaturePlanContext,
  WorldFeatureRuntime,
} from './WorldFeature';
import { worldRecipe, type WorldRecipeId } from './WorldRecipe';

export interface WorldFeatureCollectionPlan {
  worldRecipeId: WorldRecipeId;
  plans: WorldFeaturePlan[];
  exclusions: ScatterExclusionZone[];
}

export class WorldFeatureRegistry {
  private readonly libraries = new Map<string, WorldFeatureLibrary>();

  register(library: WorldFeatureLibrary): this {
    if (this.libraries.has(library.id)) {
      throw new Error(`World feature library already registered: ${library.id}`);
    }
    this.libraries.set(library.id, library);
    return this;
  }

  plan(
    worldRecipeId: WorldRecipeId,
    context: WorldFeaturePlanContext,
  ): WorldFeatureCollectionPlan {
    const recipe = worldRecipe(worldRecipeId);
    const plans = recipe.features.map((spec) => {
      const library = this.libraries.get(spec.libraryId);
      if (!library) throw new Error(`World recipe references unknown library: ${spec.libraryId}`);
      if (!library.recipeIds.includes(spec.recipeId)) {
        throw new Error(`Feature library ${spec.libraryId} has no recipe ${spec.recipeId}`);
      }
      return library.plan(spec.recipeId, context);
    });
    return {
      worldRecipeId,
      plans,
      exclusions: plans.flatMap((plan) => plan.exclusions),
    };
  }

  build(
    collection: WorldFeatureCollectionPlan,
    context: WorldFeatureBuildContext,
  ): WorldFeatureRuntime {
    const runtimes = collection.plans.map((plan) => {
      const library = this.libraries.get(plan.libraryId);
      if (!library) throw new Error(`Missing feature library at build time: ${plan.libraryId}`);
      return library.build(plan, context);
    });
    const group = new Group();
    group.name = `world-features:${collection.worldRecipeId}`;
    const stats: Record<string, number> = {};
    let primarySpawn: FeatureSpawn | null = null;
    const obstacles: SegmentObstacle[] = [];
    for (const runtime of runtimes) {
      group.add(runtime.group);
      Object.assign(stats, runtime.stats);
      primarySpawn ??= runtime.primarySpawn;
      obstacles.push(...runtime.obstacles);
    }
    return {
      group,
      stats,
      primarySpawn,
      obstacles,
      update(camera: PerspectiveCamera): void {
        for (const runtime of runtimes) runtime.update(camera);
      },
    };
  }
}
