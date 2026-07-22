/**
 * ?scene=veghero — fast, isolated vegetation quality lab.
 * Left and right trees share the exact growth seed; only surface realization
 * and the PBR profile differ. This is the visual regression target used while
 * each species graduates into the hero pipeline.
 */

import {
  CanvasTexture,
  CircleGeometry,
  Mesh,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { positionWorld, vec3 } from 'three/tsl';
import { bakeBarkTextures } from '../gpu/passes/BarkSynth';
import { PostStack } from '../render/PostStack';
import { setupSunShadows } from '../render/ShadowSetup';
import {
  barkTexturedMaterial,
  foliageCardMaterial,
  foliageMaterial,
  updateSunUniforms,
} from '../render/VegMaterials';
import { SunSky } from '../sky/SunSky';
import { captureFoliageAtlas } from '../vegetation/FoliageCards';
import { OAK } from '../vegetation/Species';
import { buildTree } from '../vegetation/TreeBuilder';
import {
  barkProfileForTier,
  vegetationSurfaceProfile,
} from '../vegetation/VegetationProfiles';
import type { WorldContext } from './Scenes';

function label(text: string, sub: string): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(14,18,14,0.88)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#eef1e7';
    ctx.font = '600 48px system-ui, sans-serif';
    ctx.fillText(text, 22, 64);
    ctx.fillStyle = '#b4c1a3';
    ctx.font = '400 30px system-ui, sans-serif';
    ctx.fillText(sub, 22, 120);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const mat = new MeshStandardNodeMaterial();
  mat.map = tex;
  mat.roughness = 0.9;
  return new Mesh(new PlaneGeometry(5.8, 1.2), mat);
}

export async function buildHeroVegetationScene(ctx: WorldContext): Promise<void> {
  const { engine, params, seed } = ctx;
  const surface = vegetationSurfaceProfile(OAK.id);

  ctx.progress(0.05, 'hero vegetation: lighting');
  const sunSky = new SunSky(engine, params.timeOfDay);
  await sunSky.init(engine.renderer);
  updateSunUniforms(sunSky.sun);
  setupSunShadows(sunSky.sun, engine.camera, undefined, {
    maxFar: 180,
    lightMargin: 65,
  });

  const groundMat = new MeshStandardNodeMaterial();
  groundMat.colorNode = vec3(0.09, 0.115, 0.065).mul(
    positionWorld.x.mul(0.7).sin().mul(0.035).add(0.965),
  );
  groundMat.roughness = 0.98;
  const ground = new Mesh(new CircleGeometry(100, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  engine.scene.add(ground);

  ctx.progress(0.15, 'hero vegetation: baking oak PBR maps');
  const atlas = await captureFoliageAtlas(engine.renderer, OAK, seed.rng('cards/oak'));
  const bark = await bakeBarkTextures(
    engine.renderer,
    OAK.barkLayer,
    seed.sub(`bark/${OAK.barkLayer}`) % 977,
  );

  const variants = [
    { x: -9, enhanced: false, title: 'BASELINE OAK' },
    { x: 9, enhanced: true, title: 'HERO OAK' },
  ];
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (!variant) continue;
    ctx.progress(0.3 + i * 0.28, `hero vegetation: ${variant.title.toLowerCase()}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const built = buildTree(OAK, seed.rng('hero/oak-comparison'), {
      foliageMode: 'hybrid',
      heroSurface: variant.enhanced,
      hero: { cardTarget: 1800, meshAnchorTarget: 320, barkK: 0.8 },
    });
    const barkMat = variant.enhanced
      ? barkTexturedMaterial(bark, barkProfileForTier(surface, 'hero'))
      : barkTexturedMaterial(bark);
    const trunk = new Mesh(built.bark, barkMat);
    trunk.position.set(variant.x, 0, 0);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    engine.scene.add(trunk);

    if (built.foliage) {
      const cards = new Mesh(
        built.foliage,
        foliageCardMaterial(
          atlas,
          { color: OAK.foliageColor },
          variant.enhanced ? surface.leaf : undefined,
        ),
      );
      cards.position.copy(trunk.position);
      cards.castShadow = true;
      cards.receiveShadow = true;
      engine.scene.add(cards);
    }
    if (built.foliageMesh) {
      const leaves = new Mesh(
        built.foliageMesh,
        foliageMaterial(
          { color: OAK.foliageColor },
          variant.enhanced ? surface.leaf : undefined,
        ),
      );
      leaves.position.copy(trunk.position);
      leaves.receiveShadow = true;
      engine.scene.add(leaves);
    }

    const tag = label(
      variant.title,
      variant.enhanced
        ? `${surface.id} · deep bark relief / lobed leaves / venation`
        : 'same seed · generalized tubes / standard leaf surface',
    );
    tag.position.set(variant.x, 1.5, 4.4);
    tag.rotation.x = -0.22;
    engine.scene.add(tag);
    engine.stats.counters[`hero.oak.${variant.enhanced ? 'enhanced' : 'baseline'}`] =
      built.stats.tris;
  }

  const post = new PostStack(engine, sunSky.atmosphere, params.timeOfDay, null);
  engine.post = post;
  ctx.hooks.setTimeOfDay = (time) => {
    void (async () => {
      await sunSky.setTimeOfDay(time);
      updateSunUniforms(sunSky.sun);
      post.setTimeOfDay(time);
    })();
  };

  if (params.cam === null) {
    engine.camera.position.set(0, 7.2, 30);
    engine.camera.lookAt(new Vector3(0, 7.5, 0));
  }
  engine.onUpdate(() => {
    if (engine.camera.position.y < 0.55) engine.camera.position.y = 0.55;
  });
  ctx.progress(1, 'hero vegetation lab ready');
}
