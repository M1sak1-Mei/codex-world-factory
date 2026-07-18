# Gaussian terrain generator

LAAS terrain variants are data-driven recipes layered into the existing world
pipeline. A recipe does not bypass erosion, rivers, biome classification,
vegetation, water, or CDLOD rendering:

```text
seed + terrain recipe
        ↓
macro terrain + anisotropic Gaussian stamps
        ↓
hydraulic/thermal erosion → hydrology → biome/snow
        ↓
the normal LAAS world renderer
```

This placement is important. Gaussian stamps are evaluated before valley
carving, so the main valley and its map-edge outlet remain authoritative when
a generated mountain range crosses them.

## Use a recipe

Select a recipe with the `terrain` URL parameter:

```text
http://localhost:5173/?terrain=folded-ranges&seed=42&preset=low
```

Available recipes:

| ID | Result |
|---|---|
| `laas` | Original terrain; no Gaussian stamps. |
| `folded-ranges` | Three long, offset mountain folds. |
| `rift-valley` | A diagonal low rift with two hard shoulders. |
| `caldera-lake` | A nested Gaussian caldera with a southwest breach. |

An unknown recipe safely falls back to `laas`. The same recipe and seed always
resolve to the same stamp positions, rotations, and amplitudes.

## Generate and render a batch

First start the dev server in one terminal:

```bash
npm run dev
```

Build a deterministic Cartesian-product manifest in another terminal:

```bash
npm run terrain:batch -- \
  --recipes folded-ranges,rift-valley,caldera-lake \
  --seeds 1..4 \
  --shots 1,5,9 \
  --preset low
```

This writes `generated/terrain-batch.json`. Render every manifest entry through
the real WebGPU scene and collect screenshots plus engine statistics:

```bash
npm run terrain:shoot -- --manifest generated/terrain-batch.json
```

Batch rendering is sequential by design. Each world owns large height,
hydrology, vegetation, and render buffers; parallel pages can multiply GPU
memory use and make otherwise valid scenes fail.

Useful batch options:

| Tool | Option | Default |
|---|---|---|
| `terrain:batch` | `--recipes` | all recipes |
| `terrain:batch` | `--seeds` | `1` (supports `1..8,100`) |
| `terrain:batch` | `--shots` | `1` |
| `terrain:batch` | `--preset` | `low` |
| `terrain:batch` | `--time` | `11` |
| `terrain:batch` | `--out` | `generated/terrain-batch.json` |
| `terrain:shoot` | `--limit` | all entries |
| `terrain:shoot` | `--settle` | 24 frames |
| `terrain:shoot` | `--timeout` | 240 seconds per world |
| `terrain:shoot` | `--out` | `generated/terrain-shots` |

## Add or tune a recipe

Recipes live in `src/world/TerrainRecipe.ts`. Each stamp has:

- `center`: world x/z center in meters;
- `sigma`: local long/short standard-deviation radii;
- `rotation`: local-axis angle in radians;
- `amplitude`: signed peak height in meters;
- `sharpness`: Gaussian exponent multiplier;
- `hardness`: signed erosion-resistance contribution;
- bounded seed jitter for center, rotation, and amplitude.

Prefer several readable, moderate stamps over one extreme stamp. Negative
stamps can create closed basins; pair deep bowls with a breach aligned to the
existing drainage spine or the hydrology pass may fill them to a distant spill
saddle.

For every recipe change:

1. Run `npm run typecheck` and `npm run test:terrain`.
2. Render at least three seeds at shots 1, 5, and 9 on `low`.
3. Check water coverage, map-edge outlets, camera starts, and tree placement.
4. Render one representative seed on `high` before accepting the recipe.
5. Keep the original `laas` recipe in the batch as the regression control.

## Current boundary

The first version intentionally changes only macro relief and hardness. LAAS's
alpine, karst, lake, and valley semantic zones still drive biome art direction.
That makes the feature low-risk and immediately usable for large batches, but
it is not yet a fully arbitrary planet generator. The next useful extension is
to move those semantic zone anchors and drainage splines into the recipe data,
then add manifest-level QA thresholds for flooded area, height range, and GPU
cost.
