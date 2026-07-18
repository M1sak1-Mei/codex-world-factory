# Procedural world-feature libraries

The world factory separates terrain generation from authored-looking points
of interest. A terrain recipe controls landform synthesis; a world recipe
composes independent feature libraries and an environment profile.

```text
URL / batch manifest
  -> WorldRecipe (feature composition + environment defaults)
  -> WorldFeatureRegistry
  -> plan(TerrainSurface, named seed streams)
       -> site plans + per-layer scatter exclusions
  -> terrain / vegetation GPU systems consume exclusions
  -> build(plan)
       -> render groups + spawn + collision capsules + stats + LOD update
```

The contracts live in `src/generation/core/WorldFeature.ts`. Feature libraries
never receive the concrete `Heightfield`, renderer, camera controller, or GPU
scatter implementation. Renderer-specific adapters live in
`src/generation/integrations/`.

## Magic forest ruins V1

Select the library through the top-level world recipe:

```text
http://localhost:5173/?world=magic-forest-ruins&terrain=laas&seed=42&preset=low
```

The `ancient-grove` recipe deterministically places three site classes:

- an outer sanctuary with a broken ring wall, ritual pillars, active portal,
  crystal clusters, rubble, and lichen colonies;
- a ruined watch circle;
- a smaller forest shrine with an active portal.

Placement scores dry sites by slope, local relief, altitude, target distance,
and spacing. A site emits separate clearance radii for trees, understory,
extras, and stones before any GPU instances are appended. The same occupancy
contract is consumed by the camera-following grass and debris rings.

Walls use a continuous erosion-height profile and are filled foundation-up,
so missing stones cannot leave unsupported upper courses. The runtime uses
instanced procedural geometry, distance-gated magic detail, procedural TSL
materials, world-recipe environment defaults, an automatic walk spawn, useful
HUD counters, and engine-agnostic 2D capsule collision.

## Determinism rules

1. Derive an RNG from a stable semantic path, such as
   `feature/library/recipe/site-N`.
2. Do not share a mutable RNG between libraries. Adding a library must not
   move existing sites.
3. Put all information needed by the builder into the typed plan.
4. Keep selection and constraint evaluation on the CPU-facing
   `TerrainSurface`; do not read renderer state during planning.
5. Emit occupancy during planning, before vegetation scatter.

## Adding the next library

1. Create `src/generation/libraries/<library-id>/` with a typed recipe, planner,
   builder, and material module.
2. Implement `TypedWorldFeatureLibrary<TPlan>` and wrap it with
   `defineWorldFeatureLibrary`.
3. Register the library in `DefaultWorldFeatures.ts`.
4. Add a `WorldFeatureSpec` to a top-level recipe in `WorldRecipe.ts`.
5. Emit layer-specific scatter exclusions and, where relevant, collision
   capsules and a primary spawn.
6. Add deterministic plan tests, runtime/stat tests, collision tests, and at
   least two real WebGPU captures using different seeds or terrain recipes.
7. Verify the legacy `wilderness` recipe remains unchanged.

The intended next reusable modules are path/road graphs, plot and footprint
allocation, modular building grammar, interior/door connectors, prop sockets,
and biome-aware dressing. They should depend on the contracts above rather
than importing the magic-ruins implementation.

## Commands

```text
npm run test:world
npm run build
npm run shoot -- --world magic-forest-ruins --terrain laas --seed 42 --preset low
npm run terrain:batch -- --world magic-forest-ruins --recipes laas,folded-ranges --seeds 1-3
npm run terrain:shoot -- --manifest outputs/terrain-batch/manifest.json
```

## Current boundary

This milestone is the first maintainable library and factory foundation, not
the completed fantasy-world catalogue. Collision is horizontal walk collision;
there is not yet a navmesh, multi-floor interior solver, quest graph, or road
network. The block grammar is intentionally procedural and asset-free, so a
future art pass can add reusable arches, roofs, doors, trim, and facade kits
without changing site planning or world composition.
