import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, DataTexture, NoColorSpace, PlaneGeometry, RenderTarget, Texture, type Material, type Mesh, type Scene } from 'three';
import { MeshPhysicalNodeMaterial, type Renderer } from 'three/webgpu';
import { WorldSeed } from '../src/core/Seed';
import { foliageCardMaterial } from '../src/render/VegMaterials';
import {
  ATLAS_RES,
  captureFoliageAtlas,
  createFoliageAtlasTextures,
  dilateFoliageSurface,
  foliageAtlasAppearance,
} from '../src/vegetation/FoliageCards';
import { seasonalFoliageStyle } from '../src/vegetation/Seasons';
import { BIRCH } from '../src/vegetation/Species';
import { vegetationSurfaceProfile } from '../src/vegetation/VegetationProfiles';
import { canopyPaletteForSeason } from '../src/world/CanopyShell';
import { captureImpostor, IMPOSTOR_TILE } from '../src/vegetation/Impostors';

test('foliage keeps RGBA albedo compatibility and packs one companion texture', () => {
  const albedo = new Uint8Array([80, 120, 40, 255]);
  const surface = new Uint8Array([170, 110, 188, 225]);
  const season = seasonalFoliageStyle(BIRCH, 'autumn');
  const atlas = createFoliageAtlasTextures(albedo, surface, 1, season);
  const appearance = foliageAtlasAppearance(atlas);
  assert.ok(atlas instanceof DataTexture);
  assert.strictEqual(atlas.image.data, albedo);
  assert.strictEqual(appearance?.surface.image.data, surface);
  assert.equal(atlas.colorSpace, NoColorSpace);
  assert.equal(appearance?.surface.colorSpace, NoColorSpace);
  assert.equal(appearance?.season?.roughnessBias, season.roughnessBias);
  const material = foliageCardMaterial(atlas, { color: BIRCH.foliageColor }, vegetationSurfaceProfile('birch').leaf);
  assert.ok(material instanceof MeshPhysicalNodeMaterial);
  assert.ok(material.normalNode);
  assert.ok(material.roughnessNode);
  assert.ok(material.aoNode);
  assert.equal(material.metalness, 0);
  assert.ok(material.specularIntensity <= 0.3);
  assert.ok(material.clearcoat <= 0.035);
  let disposed = 0;
  appearance?.surface.addEventListener('dispose', () => disposed++);
  atlas.dispose();
  assert.equal(disposed, 1);
  assert.equal(foliageAtlasAppearance(atlas), undefined);
  material.dispose();
});

test('legacy foliage textures remain supported without an extra sampler', () => {
  const texture = new Texture();
  const mat = foliageCardMaterial(texture, { color: BIRCH.foliageColor });
  assert.equal(foliageAtlasAppearance(texture), undefined);
  assert.equal(mat.normalNode, null);
  assert.equal(mat.roughnessNode, null);
  assert.equal(mat.roughness, 0.92);
  mat.dispose();
  texture.dispose();
});

test('surface gutter dilation preserves roughness/AO independently from coverage', () => {
  const coverage = new Uint8Array(3 * 3 * 4);
  coverage.set([90, 120, 40, 255], 16);
  const original = coverage.slice();
  const surface = new Uint8Array(coverage.length);
  surface.set([172, 105, 194, 203], 16);
  dilateFoliageSurface(surface, coverage, 3, 1);
  for (let i = 0; i < 9; i++) assert.deepEqual(Array.from(surface.slice(i * 4, i * 4 + 4)), [172, 105, 194, 203]);
  assert.deepEqual(coverage, original);
  const empty = new Uint8Array(16);
  dilateFoliageSurface(empty, new Uint8Array(16), 2);
  assert.deepEqual(Array.from(empty.slice(0, 4)), [128, 128, 210, 255]);
  assert.throws(() => createFoliageAtlasTextures(new Uint8Array(4), new Uint8Array(8), 1));
  assert.throws(() => dilateFoliageSurface(new Uint8Array(4), new Uint8Array(8), 1));
});

test('capture reuses identical source geometry and restores renderer state', async () => {
  let target: unknown = { id: 'original' };
  const originalTarget = target;
  const clear = new Color(0.1, 0.2, 0.3);
  let clearAlpha = 0.4;
  const originalColor = clear.clone();
  const captured: { geometry: unknown; surface: boolean }[] = [];
  const ownedReadbacks: Uint8Array[] = [];
  const renderer = {
    getRenderTarget: () => target,
    setRenderTarget: (next: unknown) => { target = next; },
    getClearAlpha: () => clearAlpha,
    getClearColor: (value: Color) => value.copy(clear),
    setClearColor: (value: Color | number, alpha: number) => {
      clear.set(value); clearAlpha = alpha;
    },
    render: (scene: Scene) => {
      const mesh = scene.children[0] as Mesh;
      captured.push({ geometry: mesh.geometry, surface: !!(mesh.material as MeshPhysicalNodeMaterial).outputNode });
    },
    readRenderTargetPixelsAsync: async () => {
      const pixels = new Uint8Array(ATLAS_RES * ATLAS_RES * 4);
      pixels.fill(255);
      ownedReadbacks.push(pixels);
      return pixels;
    },
  } as unknown as Renderer;
  const seed = new WorldSeed(624);
  const atlas = await captureFoliageAtlas(renderer, BIRCH, seed.rng('foliage/capture'), seasonalFoliageStyle(BIRCH, 'summer'));
  assert.equal(captured.length, 2);
  assert.strictEqual(captured[0].geometry, captured[1].geometry);
  assert.deepEqual(captured.map((c) => c.surface), [false, true]);
  assert.strictEqual(target, originalTarget);
  assert.deepEqual(clear, originalColor);
  assert.equal(clearAlpha, 0.4);
  assert.ok(foliageAtlasAppearance(atlas));
  assert.strictEqual(atlas.image.data, ownedReadbacks[0]);
  assert.strictEqual(foliageAtlasAppearance(atlas)?.surface.image.data, ownedReadbacks[1]);
  atlas.dispose();
  renderer.readRenderTargetPixelsAsync = async () => { throw new Error('readback rejected'); };
  await assert.rejects(
    captureFoliageAtlas(renderer, BIRCH, seed.rng('foliage/capture')),
    /readback rejected/,
  );
  assert.strictEqual(target, originalTarget);
  assert.deepEqual(clear, originalColor);
  assert.equal(clearAlpha, 0.4);
});

for (const rejectReadback of [false, true]) {
  test(`impostor ${rejectReadback ? 'failed' : 'successful'} capture releases only owned resources`, async () => {
    const geometry = new PlaneGeometry(1, 1);
    const texture = new Texture();
    let geometryDisposals = 0;
    let textureDisposals = 0;
    geometry.addEventListener('dispose', () => geometryDisposals++);
    texture.addEventListener('dispose', () => textureDisposals++);
    const originalTarget = { name: 'scene target' };
    let target: unknown = originalTarget;
    const color = new Color(0.11, 0.22, 0.33);
    const originalColor = color.clone();
    let alpha = 0.45;
    const materials = new Set<Material>();
    const disposedMaterials = new Set<Material>();
    const targets = new Set<RenderTarget>();
    let targetDisposals = 0;
    const renderer = {
      getRenderTarget: () => target,
      setRenderTarget: (next: unknown) => {
        target = next;
        if (next instanceof RenderTarget && !targets.has(next)) {
          targets.add(next);
          next.addEventListener('dispose', () => targetDisposals++);
        }
      },
      getClearAlpha: () => alpha,
      getClearColor: (copy: Color) => copy.copy(color),
      setClearColor: (next: Color | number, nextAlpha: number) => { color.set(next); alpha = nextAlpha; },
      render: (scene: Scene) => {
        for (const child of scene.children) {
          const mesh = child as Mesh;
          assert.strictEqual(mesh.geometry, geometry);
          const material = mesh.material as Material;
          if (!materials.has(material)) {
            materials.add(material);
            material.addEventListener('dispose', () => disposedMaterials.add(material));
          }
        }
      },
      readRenderTargetPixelsAsync: async () => {
        if (rejectReadback) throw new Error('impostor readback rejected');
        return new Uint8Array(IMPOSTOR_TILE * IMPOSTOR_TILE * 4).fill(255);
      },
    } as unknown as Renderer;
    const promise = captureImpostor(renderer, [
      { geometry, kind: 'cards', atlas: texture },
    ], { centerY: 0.5, radius: 1 });
    if (rejectReadback) {
      await assert.rejects(promise, /impostor readback rejected/);
    } else {
      const atlas = await promise;
      assert.equal(materials.size, 3);
      atlas.albedo.dispose();
      atlas.normalDepth.dispose();
    }
    assert.equal(disposedMaterials.size, materials.size);
    assert.equal(targetDisposals, 1);
    assert.strictEqual(target, originalTarget);
    assert.deepEqual(color, originalColor);
    assert.equal(alpha, 0.45);
    assert.equal(geometryDisposals, 0, 'capture must not dispose caller geometry');
    assert.equal(textureDisposals, 0, 'capture must not dispose shared atlas');
    geometry.dispose();
    texture.dispose();
  });
}

test('far canopy uses seasonal species colours and excludes leafless broadleaves', () => {
  const summer = canopyPaletteForSeason('summer');
  const autumn = canopyPaletteForSeason('autumn');
  const winter = canopyPaletteForSeason('winter');
  assert.equal(summer.length, 6);
  assert.deepEqual(autumn, canopyPaletteForSeason('autumn'));
  for (const palette of [summer, autumn, winter]) {
    for (const color of palette) assert.ok(color.every((c) => Number.isFinite(c) && c >= 0 && c <= 1));
  }
  // Broadleaf valley/riverbank families turn gold, not just near trees.
  assert.ok(autumn[4][0] > summer[4][0] * 3);
  assert.ok(autumn[5][0] > autumn[5][1]);
  // Winter tree coverage leaves only the spruce contributor in this family.
  const spruceWinter = winter[0];
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(winter[5][c] - spruceWinter[c]) < 1e-10);
});
