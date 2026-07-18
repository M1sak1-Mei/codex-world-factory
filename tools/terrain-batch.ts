/** Build deterministic manifests for batch terrain rendering. */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  TERRAIN_RECIPE_IDS,
  isTerrainRecipeId,
  terrainRecipe,
  type TerrainRecipeId,
} from '../src/world/TerrainRecipe';
import {
  WORLD_RECIPE_IDS,
  isWorldRecipeId,
  type WorldRecipeId,
} from '../src/generation/core/WorldRecipe';

type QualityPreset = 'low' | 'high' | 'ultra';

export interface TerrainBatchEntry {
  id: string;
  recipe: TerrainRecipeId;
  recipeLabel: string;
  worldRecipe: WorldRecipeId;
  seed: number;
  shot: number;
  url: string;
}

export interface TerrainBatchManifest {
  schemaVersion: 1;
  generator: 'laas-gaussian-terrain';
  entries: TerrainBatchEntry[];
}

export interface BuildTerrainBatchOptions {
  baseUrl: string;
  recipes: readonly TerrainRecipeId[];
  seeds: readonly number[];
  shots: readonly number[];
  preset: QualityPreset;
  timeOfDay: number;
  worldRecipe: WorldRecipeId;
}

interface Flags {
  [key: string]: string | true;
}

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined || !token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function stringFlag(flags: Flags, key: string, fallback: string): string {
  const value = flags[key];
  return typeof value === 'string' ? value : fallback;
}

/** Parse comma-separated uints and inclusive ranges such as `1..4,20`. */
export function parseIntegerList(value: string, label: string): number[] {
  const result: number[] = [];
  for (const rawPart of value.split(',')) {
    const part = rawPart.trim();
    const range = /^(\d+)\.\.(\d+)$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end < start || end - start > 10_000) {
        throw new Error(`${label}: invalid or oversized range ${part}`);
      }
      for (let n = start; n <= end; n++) result.push(n);
      continue;
    }
    if (!/^\d+$/.test(part)) throw new Error(`${label}: invalid integer ${part}`);
    result.push(Number(part));
  }
  if (result.length === 0) throw new Error(`${label}: at least one value is required`);
  return result;
}

function parseRecipes(value: string): TerrainRecipeId[] {
  const ids = value.split(',').map((part) => part.trim());
  for (const id of ids) {
    if (!isTerrainRecipeId(id)) {
      throw new Error(`recipes: unknown recipe ${id}; expected ${TERRAIN_RECIPE_IDS.join(', ')}`);
    }
  }
  return ids as TerrainRecipeId[];
}

function parsePreset(value: string): QualityPreset {
  if (value === 'low' || value === 'high' || value === 'ultra') return value;
  throw new Error(`preset: expected low, high, or ultra; received ${value}`);
}

function parseWorldRecipe(value: string): WorldRecipeId {
  if (isWorldRecipeId(value)) return value;
  throw new Error(`world: unknown recipe ${value}; expected ${WORLD_RECIPE_IDS.join(', ')}`);
}

export function buildTerrainBatch(options: BuildTerrainBatchOptions): TerrainBatchManifest {
  const entries: TerrainBatchEntry[] = [];
  for (const recipeId of options.recipes) {
    for (const rawSeed of options.seeds) {
      if (!Number.isSafeInteger(rawSeed) || rawSeed < 0 || rawSeed > 0xffff_ffff) {
        throw new Error(`seed must be a uint32; received ${rawSeed}`);
      }
      for (const shot of options.shots) {
        if (!Number.isInteger(shot) || shot < 1 || shot > 9) {
          throw new Error(`shot must be in 1..9; received ${shot}`);
        }
        const url = new URL(options.baseUrl);
        url.searchParams.set('scene', 'world');
        url.searchParams.set('seed', String(rawSeed));
        url.searchParams.set('terrain', recipeId);
        url.searchParams.set('world', options.worldRecipe);
        url.searchParams.set('preset', options.preset);
        url.searchParams.set('shot', String(shot));
        url.searchParams.set('T', String(options.timeOfDay));
        url.searchParams.set('freeze', '1');
        url.searchParams.set('hud', '0');
        entries.push({
          id: `${recipeId}-s${rawSeed}-shot${shot}`,
          recipe: recipeId,
          recipeLabel: terrainRecipe(recipeId).label,
          worldRecipe: options.worldRecipe,
          seed: rawSeed,
          shot,
          url: url.toString(),
        });
      }
    }
  }
  return { schemaVersion: 1, generator: 'laas-gaussian-terrain', entries };
}

function usage(): string {
  return [
    'Generate a deterministic terrain batch manifest.',
    '',
    'npm run terrain:batch -- [options]',
    '  --recipes laas,folded-ranges,rift-valley,caldera-lake',
    '  --seeds 1..4,100',
    '  --shots 1,5,9',
    '  --preset low|high|ultra',
    '  --world wilderness|magic-forest-ruins',
    '  --time 11',
    '  --base-url http://localhost:5173/',
    '  --out generated/terrain-batch.json',
  ].join('\n');
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags['help'] === true) {
    console.log(usage());
    return;
  }
  const recipes = parseRecipes(stringFlag(flags, 'recipes', TERRAIN_RECIPE_IDS.join(',')));
  const seeds = parseIntegerList(stringFlag(flags, 'seeds', '1'), 'seeds');
  const shots = parseIntegerList(stringFlag(flags, 'shots', '1'), 'shots');
  const preset = parsePreset(stringFlag(flags, 'preset', 'low'));
  const worldRecipe = parseWorldRecipe(stringFlag(flags, 'world', 'wilderness'));
  const timeOfDay = Number(stringFlag(flags, 'time', '11'));
  if (!Number.isFinite(timeOfDay) || timeOfDay < 0 || timeOfDay > 24) {
    throw new Error(`time must be in 0..24; received ${timeOfDay}`);
  }
  const manifest = buildTerrainBatch({
    baseUrl: stringFlag(flags, 'base-url', 'http://localhost:5173/'),
    recipes,
    seeds,
    shots,
    preset,
    timeOfDay,
    worldRecipe,
  });
  const out = stringFlag(flags, 'out', 'generated/terrain-batch.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`[terrain:batch] wrote ${manifest.entries.length} entries to ${out}`);
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  main().catch((error: unknown) => {
    console.error('[terrain:batch] FAILED:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
