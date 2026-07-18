/** Render every entry in a terrain batch manifest through the real WebGPU world. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchWebGPU } from './launch';
import type { TerrainBatchEntry, TerrainBatchManifest } from './terrain-batch';

interface Flags {
  [key: string]: string | true;
}

interface RenderResult {
  id: string;
  status: 'ok' | 'failed';
  image?: string;
  stats?: string;
  error?: string;
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

function validateManifest(value: unknown): TerrainBatchManifest {
  if (typeof value !== 'object' || value === null || !('entries' in value)) {
    throw new Error('manifest is missing entries');
  }
  const manifest = value as TerrainBatchManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
    throw new Error('unsupported terrain batch manifest');
  }
  for (const entry of manifest.entries) {
    if (typeof entry.id !== 'string' || typeof entry.url !== 'string') {
      throw new Error('manifest contains an invalid entry');
    }
  }
  return manifest;
}

async function renderEntry(
  entry: TerrainBatchEntry,
  browser: Awaited<ReturnType<typeof launchWebGPU>>['browser'],
  outDir: string,
  timeoutMs: number,
  settleFrames: number,
): Promise<RenderResult> {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const imagePath = join(outDir, `${entry.id}.png`);
  const statsPath = join(outDir, `${entry.id}.stats.json`);
  try {
    console.log(`[terrain:shoot] ${entry.id} ${entry.url}`);
    await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__laas && (window.__laas.ready || window.__laas.error !== null),
      undefined,
      { timeout: timeoutMs, polling: 250 },
    );
    const appError = await page.evaluate(() => window.__laas.error);
    if (appError) throw new Error(appError);
    await page.evaluate(
      async (frames) => window.__laas.settle && (await window.__laas.settle(frames)),
      settleFrames,
    );
    await page.screenshot({ path: imagePath });
    const stats = await page.evaluate(() => window.__laas.stats);
    await writeFile(statsPath, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
    return { id: entry.id, status: 'ok', image: imagePath, stats: statsPath };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failedPath = join(outDir, `${entry.id}.failed.png`);
    await page.screenshot({ path: failedPath }).catch(() => undefined);
    return { id: entry.id, status: 'failed', image: failedPath, error: message };
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const manifestPath = stringFlag(flags, 'manifest', 'generated/terrain-batch.json');
  const outDir = stringFlag(flags, 'out', 'generated/terrain-shots');
  const limit = Number(stringFlag(flags, 'limit', String(Number.MAX_SAFE_INTEGER)));
  const timeoutMs = Number(stringFlag(flags, 'timeout', '240000'));
  const settleFrames = Number(stringFlag(flags, 'settle', '24'));
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('timeout must be positive');
  if (!Number.isSafeInteger(settleFrames) || settleFrames < 0) {
    throw new Error('settle must be a non-negative integer');
  }

  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')) as unknown);
  const entries = manifest.entries.slice(0, limit);
  await mkdir(outDir, { recursive: true });
  const { browser } = await launchWebGPU();
  const results: RenderResult[] = [];
  try {
    // Sequential by design: concurrent 4096² worlds multiply GPU memory use.
    for (const entry of entries) {
      results.push(await renderEntry(entry, browser, outDir, timeoutMs, settleFrames));
    }
  } finally {
    await browser.close();
  }
  const indexPath = join(outDir, 'index.json');
  await writeFile(indexPath, `${JSON.stringify({ manifest: manifestPath, results }, null, 2)}\n`, 'utf8');
  const failures = results.filter((result) => result.status === 'failed').length;
  console.log(`[terrain:shoot] rendered ${results.length - failures}/${results.length}; index ${indexPath}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error('[terrain:shoot] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
