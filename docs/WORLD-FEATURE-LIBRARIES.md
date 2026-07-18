# Procedural world-feature libraries

The world factory separates reusable visual models from scene-generation
rules. Terrain recipes control landform synthesis; world recipes compose
independent feature libraries and an environment profile.

```text
URL / batch manifest
  -> WorldRecipe (feature composition + environment defaults)
  -> WorldFeatureRegistry
  -> plan(TerrainSurface, named seed streams)
       -> site plans + per-layer scatter exclusions
  -> terrain / vegetation GPU systems consume exclusions
  -> build(plan)
       -> pure placement grammar
       -> injected procedural model kit
       -> render groups + spawn + collision capsules + stats + LOD update
```

The contracts live in `src/generation/core/WorldFeature.ts`. Feature libraries
never receive the concrete `Heightfield`, renderer, camera controller, or GPU
scatter implementation. Renderer-specific adapters live in
`src/generation/integrations/`.

## Architecture boundary

```text
src/generation/
  core/                         world composition contracts and registry
  integrations/                 engine-specific adapters
  models/
    ProceduralModelKit.ts       common discoverable model-kit contract
    magic-ruins/                geometry, materials, model constructors
    city-buildings/             instanced architectural parts and palettes
  libraries/
    magic-forest-ruins/
      MagicForestRuinsLibrary.ts  composition root / dependency injection
      generator/
        ...Recipe.ts            data-only content constraints
        ...Planner.ts           terrain selection and occupancy
        ...Grammar.ts           pure model placements and collision segments
        ...SceneGenerator.ts    scene hierarchy, LOD, stats, and spawn
    city-buildings/             terrain-aware district and building generator
```

The layers have deliberately one-way dependencies:

- A **model kit** knows how to construct a stone block, crystal, portal, or
  lichen colony. It does not know what a sanctuary is or where a site belongs.
- A **generator** knows site semantics and produces placement data. Its grammar
  creates no Three.js scene objects or materials.
- A **scene generator** turns placement data into a runtime by calling the
  injected typed model-kit interface.
- A **library** is only the composition root that pairs a planner, generator,
  and model kit for registration in a world recipe.

`MAGIC_RUINS_MODEL_CATALOG` makes the current primitives discoverable without
booting a world. `createMagicForestRuinsLibrary(modelKitFactory)` is the swap
point for a future high-fidelity, low-poly, biome-specific, or imported-asset
model kit. Site planning and the grammar do not need to change.

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

## City buildings V1

Select the city through its top-level world recipe:

```text
http://localhost:5173/?world=fantasy-city&terrain=laas&seed=84&preset=low
```

The `fantasy-quarter` recipe plans a stone-and-timber merchant district. Its
target layout is a three-by-three block skeleton containing one civic guildhall
and up to 32 deterministic townhouses or towers. The planner scores altitude,
slope, district relief, dry access, and the fraction of buildable lots.

On regular terrain it emits the complete 33-building district. On extreme
mountain or water-heavy terrain it chooses the best viable site and the pure
grammar omits wet or excessively uneven plots. This keeps world boot robust
while preserving seed determinism. Every accepted building emits a rectangular
collision perimeter; the district publishes vegetation clearance, an entrance
spawn, distance-gated architectural detail, and HUD counters.

`CityBuildingsModelKit` renders foundations, plaster shells, steep roofs,
timber framing, windows, and doors with instanced geometry. Planning and grammar
only exchange data records, so future elven, dwarven, port, or imported-asset
model kits can replace the visual layer without changing terrain selection.

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

1. Put reusable geometry and materials in `src/generation/models/<kit-id>/` and
   expose a typed model-kit interface plus model catalogue.
2. Create `src/generation/libraries/<library-id>/generator/` with a typed
   recipe, planner, pure placement grammar, and scene generator.
3. Keep terrain queries in the planner and geometry construction in the model
   kit; pass plain placement records across the boundary.
4. Implement `TypedWorldFeatureLibrary<TPlan>` and wrap it with
   `defineWorldFeatureLibrary`.
5. Register the library in `DefaultWorldFeatures.ts`.
6. Add a `WorldFeatureSpec` to a top-level recipe in `WorldRecipe.ts`.
7. Emit layer-specific scatter exclusions and, where relevant, collision
   capsules and a primary spawn.
8. Add model-catalogue, deterministic plan, pure-grammar, runtime/stat, and
   collision tests, plus at
   least two real WebGPU captures using different seeds or terrain recipes.
9. Verify the legacy `wilderness` recipe remains unchanged.

The intended next reusable modules are path/road graphs, cross-district plot
allocation, interior/door connectors, prop sockets, and biome-aware dressing.
They should depend on the contracts above rather than importing either concrete
content library.

## Commands

```text
npm run test:world
npm run test:city
npm run build
npm run shoot -- --world magic-forest-ruins --terrain laas --seed 42 --preset low
npm run shoot -- --world fantasy-city --terrain laas --seed 84 --preset low
npm run terrain:batch -- --world magic-forest-ruins --recipes laas,folded-ranges --seeds 1-3
npm run terrain:shoot -- --manifest outputs/terrain-batch/manifest.json
```

## Current boundary

This milestone contains two maintainable libraries and a factory foundation,
not the completed fantasy-world catalogue. Collision is horizontal walk
collision; there is not yet a navmesh, multi-floor interior solver, quest graph,
or road network. The city grammar is intentionally procedural and asset-free,
so a future art pass can add reusable arches, balconies, trim, and facade kits
without changing site planning or world composition.
