# World generator runtime

This document follows one boot of
`?world=magic-forest-ruins&terrain=laas&seed=42` from URL to rendered scene.

## Boot pipeline

1. `Params.ts` validates the URL and selects a top-level `WorldRecipe`. The
   recipe contains environment defaults and feature-library recipe IDs.
2. Terrain synthesis, erosion, hydrology, and the CPU height readback finish.
   `HeightfieldTerrainSurface` exposes only height, water, slope, and relief
   queries to content code.
3. `WorldFeatureRegistry.plan()` calls every selected feature planner with the
   terrain surface and stable named seed streams.
4. `MagicForestRuinsPlanner` scores deterministic candidates for dryness,
   slope, relief, altitude, target distance, and inter-site spacing. It returns
   typed site plans plus per-layer vegetation exclusion zones.
5. GPU scatter consumes those exclusions before it appends tree, understory,
   extra, and stone instances. Camera-following ground rings consume the same
   zones, so vegetation does not grow back while exploring.
6. `WorldFeatureRegistry.build()` invokes the library. The library creates one
   shared `MagicRuinsModelKit` and injects it into the scene generator.
7. For each planned site, `MagicForestRuinsGrammar` converts the recipe into
   plain block, crystal, portal, and collision placements. It does not create
   meshes, materials, groups, or LOD objects.
8. `MagicForestRuinsSceneGenerator` asks the model kit to instantiate those
   placements. It assembles the scene hierarchy and publishes a primary spawn,
   collision capsules, HUD stats, and a per-frame LOD callback.
9. The engine adds the combined feature group, installs collision and spawn
   data, then continues building terrain tiles, vegetation renderers, water,
   and the remaining world systems.

## Determinism

Terrain and feature generators use stable semantic RNG paths. A ruin site uses
`feature/magic-forest-ruins/ancient-grove/site-N`; its plan stores a `ruinSeed`
for the placement grammar. This prevents a future road, building, or prop
library from moving existing ruins merely because it was registered earlier.

Generation is boot-time work. Per frame, the ruins runtime only compares site
distance with the camera to update visibility; it does not re-plan terrain,
re-run the grammar, or rebuild instances.

## Extension points

- Add a visual variant by implementing `MagicRuinsModelKit` and injecting its
  factory into `createMagicForestRuinsLibrary`.
- Add a new ruin layout by extending recipe data and the pure grammar.
- Add a new content family, such as buildings, through its own model kit and
  feature library while reusing the registry, terrain, occupancy, spawn,
  collision, stats, and runtime contracts.
