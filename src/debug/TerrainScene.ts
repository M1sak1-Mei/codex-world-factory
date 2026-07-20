/**
 * ?scene=terrain — terrain inspection scene (also currently ?scene=world).
 * Real CDLOD tiles + far shell + PBR terrain material, temporary sun/sky
 * lighting (replaced by the Phase-2 atmosphere stack).
 *
 * Views: ?view=hydro paints hydrology diagnostics on a preview grid.
 * ?alt=N puts the camera N meters above ground (ground-clamped spawn).
 */

import { BOOKMARKS, installBookmarks } from './Bookmarks';
import { Froxels } from '../gpu/passes/Froxels';
import { PARTICLE_COUNT, Particles } from '../gpu/passes/Particles';
import { ProbeGI } from '../gpu/passes/ProbeGI';
import { buildCanopyMap, runScatter } from '../gpu/passes/Scatter';
import { addScatterDebug } from './ScatterDebug';
import { Forests } from '../vegetation/Forests';
import { GroundRing } from '../vegetation/GroundRing';
import { buildVegLibrary } from '../vegetation/VegLibrary';
import { CausticsBake, setCausticContext } from '../render/Caustics';
import { setWindContext, windU } from '../render/Wind';
import { sunU, updateSunUniforms } from '../render/VegMaterials';
import { buildCanopyShell } from '../world/CanopyShell';
import { Heightfield } from '../world/Heightfield';
import { buildTerrainShadowProxy } from '../world/ShadowProxy';
import { TerrainTiles } from '../world/TerrainTiles';
import { WaterSurface } from '../world/WaterSurface';
import { PostStack } from '../render/PostStack';
import { setupSunShadows } from '../render/ShadowSetup';
import { Clouds } from '../sky/Clouds';
import { SunSky } from '../sky/SunSky';
import { createDefaultWorldFeatureRegistry } from '../generation/DefaultWorldFeatures';
import { heightfieldTerrainSurface } from '../generation/integrations/HeightfieldTerrainSurface';
import { buildPavedRoadSurfaces } from '../generation/libraries/paved-roads/runtime/PavedRoadSurfaceRenderer';
import { WORLD_HALF } from '../world/WorldConst';
import { buildHorizontalCollisionProbe } from '../core/Collision';
import { worldRecipe } from '../generation/core/WorldRecipe';
import type { WorldContext } from './Scenes';

export async function buildTerrainScene(ctx: WorldContext): Promise<void> {
  const { engine, params, seed } = ctx;
  const environment = worldRecipe(params.worldRecipe).environment;

  const hf = await Heightfield.generate(
    engine.renderer,
    params,
    seed,
    (p, m) => ctx.progress(p * 0.92, m),
  );
  (engine as unknown as { heightfield?: Heightfield }).heightfield = hf;

  if (hf.cpuHeights) {
    let maxH = -Infinity;
    for (let i = 0; i < hf.cpuHeights.length; i += 7) {
      const v = hf.cpuHeights[i] as number;
      if (v > maxH) maxH = v;
    }
    engine.stats.counters['terrain.maxH'] = Math.round(maxH);
  }

  // Plan feature libraries before GPU scatter so their occupancy clears
  // vegetation at the source. The planner only sees TerrainSurface, keeping
  // concrete Heightfield and renderer details out of every content library.
  ctx.progress(0.925, 'world: planning procedural features');
  const terrainSurface = heightfieldTerrainSurface(hf);
  const featureRegistry = createDefaultWorldFeatureRegistry();
  const featurePlan = featureRegistry.plan(params.worldRecipe, {
    terrain: terrainSurface,
    seed,
    worldHalf: WORLD_HALF,
  });
  const defaultWalkSpawn = findWalkSpawn(hf);
  const scatterExclusions = [
    ...featurePlan.exclusions,
    {
      id: 'system/default-walk-spawn',
      center: [defaultWalkSpawn.x, defaultWalkSpawn.z] as const,
      treeRadius: 14,
      understoryRadius: 9,
      extrasRadius: 7,
      stonesRadius: 3,
    },
  ];

  // physical sky first: probe gathering needs the atmosphere LUTs.
  // ?shot=N boots straight into a composed bookmark — use ITS time of day
  const bootBm = params.shot !== null ? BOOKMARKS[params.shot - 1] : undefined;
  const bootTod = bootBm?.tod ?? params.timeOfDay;
  ctx.progress(0.93, 'sky: baking atmosphere LUTs');
  const sunSky = new SunSky(engine, bootTod);
  await sunSky.init(engine.renderer);
  (engine as unknown as { sunSky?: SunSky }).sunSky = sunSky;
  // tooling probe handle (tools/probe-state.ts) — light/scene state triage
  (window as unknown as { __laasDbg?: unknown }).__laasDbg = { engine, sunSky };

  // vegetation/rock placement (Phase 5): GPU clustered-Poisson scatter +
  // canopy coverage map — BEFORE the probe field (probes ray-march the bare
  // heightfield; the canopy map is their only knowledge of the forest) and
  // before tiles (under-crown ambient)
  ctx.progress(0.94, 'vegetation: scattering instances');
  const scatter = await runScatter(engine.renderer, hf, seed, {
    exclusions: scatterExclusions,
  });
  const canopyTex = await buildCanopyMap(engine.renderer, scatter.trees);
  engine.stats.counters['veg.trees'] = scatter.trees.count;
  engine.stats.counters['veg.under'] = scatter.understory.count;
  engine.stats.counters['veg.extras'] = scatter.extras.count;
  engine.stats.counters['veg.stones'] = scatter.stones.count;

  const ablate = new Set(
    (new URLSearchParams(window.location.search).get('ablate') ?? '').split(','),
  );

  // irradiance probe field (Phase 3 GI; canopy-aware since Phase 5 —
  // ?ablate=canopygi rebuilds the bare-heightfield field for A/B)
  ctx.progress(0.95, 'gi: gathering irradiance probes');
  const gi = new ProbeGI(
    hf,
    sunSky.atmosphere,
    ablate.has('canopygi') ? null : canopyTex,
  );
  await gi.init(engine.renderer);
  sunSky.dimAmbientForGI();
  engine.onUpdate(() => gi.tick(engine.renderer));

  // Phase 6 caustics: per-frame analytic bake + module context — MUST be
  // set before any material factory runs (terrain tiles, rocks, debris all
  // self-apply at build time). ?ablate=caustics to A/B, ?caustk=N to tune.
  if (!ablate.has('caustics')) {
    const bake = new CausticsBake();
    const ck = Number(new URLSearchParams(window.location.search).get('caustk') ?? NaN);
    if (Number.isFinite(ck)) bake.focusK.value = ck;
    setCausticContext({ hf, bake, sunDir: sunU.dir });
    engine.onUpdate(() => bake.update(engine.renderer));
  }

  // Phase 6 wind: global gust field for all vegetation (?wind=N strength,
  // ?winddir=deg, ?ablate=wind to A/B) — context before veg materials build
  if (!ablate.has('wind') && hf.noiseA) {
    setWindContext({ noiseA: hf.noiseA, canopyTex });
    const q0 = new URLSearchParams(window.location.search);
    const ws = Number(q0.get('wind') ?? NaN);
    windU.strength.value = Number.isFinite(ws) ? ws : environment.windStrength;
    const wdeg = Number(q0.get('winddir') ?? NaN);
    if (Number.isFinite(wdeg)) {
      windU.dir.value.set(Math.cos((wdeg * Math.PI) / 180), Math.sin((wdeg * Math.PI) / 180));
    }
  }

  ctx.progress(0.957, 'world: building procedural features');
  const worldFeatures = featureRegistry.build(featurePlan, {
    terrain: terrainSurface,
    seed,
  });
  engine.scene.add(worldFeatures.group);
  engine.onUpdate(() => worldFeatures.update(engine.camera));
  Object.assign(engine.stats.counters, worldFeatures.stats);
  ctx.hooks.collisionProbe = buildHorizontalCollisionProbe(worldFeatures.obstacles);

  ctx.progress(0.958, 'terrain: building tiles');
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'scatter') addScatterDebug(engine.scene, scatter);
  if (view === 'split' && hf.preErosion) {
    // erosion before/after: pre-erosion clay on the left, eroded on the right
    const pre = new TerrainTiles(hf, null, {
      heightBuf: hf.preErosion,
      neutral: true,
      screenHalf: 'left',
    });
    const post = new TerrainTiles(hf, null, { neutral: true, screenHalf: 'right' });
    engine.scene.add(pre.mesh, post.mesh);
    engine.onUpdate(() => {
      pre.update(engine.camera);
      post.update(engine.camera);
    });
  } else {
    const tiles = new TerrainTiles(hf, view, { gi, canopyTex });
    engine.scene.add(tiles.mesh);
    engine.scene.add(tiles.farShell);
    // ?ablate=proxy — drop the terrain shadow caster (shadow-debug bisect)
    if (!ablate.has('proxy')) engine.scene.add(buildTerrainShadowProxy(hf));
    engine.onUpdate(() => {
      tiles.update(engine.camera);
      engine.stats.counters['terrain.tiles'] = tiles.activeTiles;
    });
  }

  if (
    view === null &&
    hf.mp.landscape.surfaces.layout === 'paved-network' &&
    !ablate.has('paving')
  ) {
    const paving = buildPavedRoadSurfaces(hf.mp.surfaceLayout, terrainSurface);
    engine.scene.add(paving);
    engine.stats.counters['paving.paths'] = hf.mp.surfaceLayout.paths.length;
    engine.stats.counters['paving.pads'] = hf.mp.surfaceLayout.pads.length;
  }

  // Phase 6: stream/lake water clipmap (?ablate=water to A/B)
  if (view !== 'split' && !ablate.has('water')) {
    const water = new WaterSurface(
      hf,
      sunSky.atmosphere,
      canopyTex,
      ablate.has('gi') ? null : gi,
    );
    engine.scene.add(water.group);
    engine.onUpdate(() => water.update(engine.camera));
  }

  // Phase 5: variant pools + GPU cull → compacted indirect draws
  let forestsRef: Forests | null = null;
  if (view !== 'scatter' && !ablate.has('veg')) {
    const lib = await buildVegLibrary(engine.renderer, seed, (p, m) =>
      ctx.progress(0.963 + p * 0.006, m),
    );
    const forests = new Forests(
      hf,
      scatter,
      lib,
      ablate.has('gi') ? null : gi,
      canopyTex,
    );
    forests.init(engine.renderer);
    forestsRef = forests;
    engine.scene.add(forests.group);
    updateSunUniforms(sunSky.sun);
    engine.onUpdate(() => {
      forests.update(engine.renderer, engine.camera);
      Object.assign(engine.stats.counters, forests.counterSnapshot());
    });

    // near-field carpets: 800k-blade grass ring + 80k debris ring
    if (!ablate.has('grass')) {
      const ring = new GroundRing(
        hf,
        canopyTex,
        seed,
        ablate.has('gi') ? null : gi,
        scatterExclusions,
      );
      ring.init(lib.atlases.get('beech') ?? null);
      engine.scene.add(ring.group);
      engine.onUpdate(() => {
        ring.update(engine.renderer, engine.camera);
        Object.assign(engine.stats.counters, ring.counterSnapshot());
      });
    }

    // far forests: aggregate canopy shell beyond the impostor mid-band
    if (!ablate.has('shell')) {
      engine.scene.add(buildCanopyShell(hf, canopyTex));
    }
  }

  // volumetric clouds (noise bake + sun-shadow map)
  ctx.progress(0.97, 'sky: baking cloud noise');
  const clouds = new Clouds(sunSky.atmosphere);
  await clouds.init(engine.renderer);
  // weather motion (Pillar F): drift on WORLD time so ?freeze=1 shots stay
  // deterministic; the drifted shadow map re-bakes itself every ~2.5 s
  let lastWt = 0;
  engine.onUpdate((_dt, wt) => {
    clouds.tick(engine.renderer, wt - lastWt);
    lastWt = wt;
  });

  // 4-cascade CSM + PCSS contact hardening; cloud shadows gate the sun term
  const shadowRig = setupSunShadows(sunSky.sun, engine.camera, (wxz) =>
    clouds.shadowAt(wxz),
  );
  // cascade cameras drive the per-cascade caster cull in Forests
  forestsRef?.setCSM(shadowRig.csm ?? null);
  (window as unknown as { __laasDbg?: Record<string, unknown> }).__laasDbg = {
    engine,
    sunSky,
    shadowRig,
  };

  // GPU particles: snow/pollen/leaves riding the wind (?ablate=particles)
  if (view !== 'split' && !ablate.has('particles')) {
    const parts = new Particles(hf, canopyTex, ablate.has('gi') ? null : gi);
    engine.scene.add(parts.mesh);
    engine.onUpdate((dt) => parts.update(engine.renderer, engine.camera, dt));
    engine.stats.counters['particles'] = PARTICLE_COUNT;
  }

  // froxel volumetrics: canopy shafts + valley fog (?ablate=froxels, ?fog=N)
  let froxels: Froxels | null = null;
  if (!ablate.has('froxels')) {
    froxels = new Froxels(hf, sunSky.atmosphere, canopyTex, clouds);
    const fq = Number(new URLSearchParams(window.location.search).get('fog') ?? NaN);
    froxels.fogK.value = Number.isFinite(fq) ? fq : environment.fogDensity;
    const fx = froxels;
    engine.onUpdate(() => fx.update(engine.renderer, engine.camera));
  }

  // HDR post stack: aerial perspective, clouds, GTAO, TRAA, bloom, exposure, grade
  ctx.progress(0.98, 'post: building pipeline');
  const post = new PostStack(engine, sunSky.atmosphere, bootTod, clouds, froxels);
  engine.post = post;

  ctx.hooks.setTimeOfDay = (t: number) => {
    void (async () => {
      await sunSky.setTimeOfDay(t);
      await clouds.refreshShadow(engine.renderer);
      gi.invalidate();
      post.setTimeOfDay(t);
    })();
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      void clouds.refreshShadow(engine.renderer);
      post.setTimeOfDay(sunSky.timeOfDay);
    }
  });

  // terrain/water probe for the camera rig: walk-mode ground physics + the
  // fly-mode soft collision / underwater guard both live in FlyCamera now
  ctx.hooks.groundProbe = (x, z) => ({
    ground: hf.heightAtCpu(x, z),
    water: hf.waterYAtCpu(x, z),
  });

  // camera spawn: ground-clamped (?alt/x/z → fly) or the DEFAULT WALK SPAWN
  // at the map center — first dry, reasonably flat spot on a spiral out
  // from (0,0), eye at head height, facing the NE massif
  const q = new URLSearchParams(window.location.search);
  const alt = Number(q.get('alt') ?? NaN);
  if (params.cam === null) {
    if (Number.isFinite(alt)) {
      const x = Number(q.get('x') ?? 600);
      const z = Number(q.get('z') ?? 900);
      const yaw = Number(q.get('yaw') ?? 2.4); // rad; 0 = looking −z (north)
      const pitch = Number(q.get('pitch') ?? -0.04); // rad; negative = down
      const y = hf.heightAtCpu(x, z) + alt;
      // the fly camera doesn't exist yet — main applies this after rigging
      ctx.hooks.initialPose = { p: [x, y, z], yaw, pitch };
      ctx.hooks.initialPoseMode = 'fly';
      engine.camera.position.set(x, y, z);
    } else {
      const featureSpawn = params.shot === null ? worldFeatures.primarySpawn : null;
      if (featureSpawn) {
        ctx.hooks.initialPose = {
          p: featureSpawn.position,
          yaw: featureSpawn.yaw,
          pitch: featureSpawn.pitch,
        };
        ctx.hooks.initialPoseMode = featureSpawn.mode;
        engine.camera.position.set(...featureSpawn.position);
      } else {
        const spawn = defaultWalkSpawn;
        ctx.hooks.initialPose = {
          p: [spawn.x, hf.heightAtCpu(spawn.x, spawn.z) + 1.7, spawn.z],
          yaw: -0.78, // face NE — the serrated massif anchors the first frame
          pitch: -0.02,
        };
        ctx.hooks.initialPoseMode = 'walk';
        engine.camera.position.set(spawn.x, ctx.hooks.initialPose.p[1], spawn.z);
      }
    }
  }

  // composed bookmarks (keys 1-9, ?shot=N) + 92 s flythrough (?fly=1 / F)
  installBookmarks(engine, hf, ctx.hooks, params);

  ctx.progress(1, 'terrain ready');
}

/**
 * Default walk spawn: first dry, reasonably flat spot on a coarse spiral
 * out from the map center (dry = waterY sits below the bed there; flat =
 * central-difference slope under ~19°).
 */
function findWalkSpawn(hf: Heightfield): { x: number; z: number } {
  let driestFallback: { x: number; z: number; slope: number } | null = null;
  const inspect = (x: number, z: number): { x: number; z: number; slope: number } | null => {
    // A dry point right on a lake bank still opens with a transparent water
    // sheet across most of the view. Require a small dry neighbourhood.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * 240;
      const pz = z + Math.sin(a) * 240;
      if (hf.waterYAtCpu(px, pz) > hf.heightAtCpu(px, pz) - 0.12) return null;
    }
    const h = hf.heightAtCpu(x, z);
    if (hf.waterYAtCpu(x, z) > h - 0.12) return null;
    const sx = hf.heightAtCpu(x + 6, z) - hf.heightAtCpu(x - 6, z);
    const sz = hf.heightAtCpu(x, z + 6) - hf.heightAtCpu(x, z - 6);
    return { x, z, slope: Math.hypot(sx, sz) / 12 };
  };

  // Artificial pads already suppress trees, bushes, grass and micro relief.
  // Prefer one when present so controllable/settled recipes open on a clear,
  // legible surface instead of inside procedurally scattered foliage.
  for (const pad of hf.mp.surfaceLayout.pads) {
    const candidate = inspect(pad.center[0], pad.center[1]);
    if (candidate === null) continue;
    if (driestFallback === null || candidate.slope < driestFallback.slope) {
      driestFallback = candidate;
    }
    if (candidate.slope <= 0.35) return candidate;
  }

  const pathPoints = hf.mp.surfaceLayout.paths
    .flatMap((path) => path.points)
    .sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  for (const point of pathPoints) {
    const candidate = inspect(point[0], point[1]);
    if (candidate === null) continue;
    if (driestFallback === null || candidate.slope < driestFallback.slope) {
      driestFallback = candidate;
    }
    if (candidate.slope <= 0.35) return candidate;
  }

  // Basin recipes can flood their central few hundred metres. Search through
  // the basin rim, and retain a dry fallback instead of returning wet (0, 0).
  for (let r = 0; r <= 1400; r += 20) {
    const steps = Math.max(1, Math.round((2 * Math.PI * r) / 24));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const candidate = inspect(x, z);
      if (candidate === null) continue;
      if (driestFallback === null || candidate.slope < driestFallback.slope) {
        driestFallback = candidate;
      }
      if (candidate.slope > 0.35) continue; // too steep
      return candidate;
    }
  }
  return driestFallback ?? { x: 0, z: 0 };
}
