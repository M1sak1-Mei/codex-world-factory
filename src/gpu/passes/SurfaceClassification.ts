/**
 * Landscape surface classification. rgba8 channels are deliberately
 * independent of biome ids so natural and artificial ground can evolve
 * without exhausting the biome enum:
 *   r sand/desert, g cobble/paving, b concrete, a any artificial surface.
 */

import type { Renderer } from 'three/webgpu';
import { StorageTexture } from 'three/webgpu';
import {
  Fn,
  If,
  Return,
  abs,
  clamp,
  float,
  instanceIndex,
  max,
  min,
  mx_fractal_noise_float,
  smoothstep,
  texture,
  textureStore,
  uvec2,
  vec2,
  vec4,
} from 'three/tsl';
import type { NF, NV2 } from '../TSLTypes';
import type { MacroParams } from '../../world/MacroMap';
import { WORLD_SIZE } from '../../world/WorldConst';
import type { FloatBuffer } from './HeightSynthesis';

export interface SurfaceClassificationOpts {
  res: number;
  waterRes: number;
  mp: MacroParams;
  waterY: FloatBuffer;
  normalTex: StorageTexture;
  fieldsTex: StorageTexture;
  biomeTex: StorageTexture;
}

function segmentDistance(
  p: NV2,
  a: readonly [number, number],
  b: readonly [number, number],
): NF {
  const av = vec2(a[0], a[1]);
  const ab = vec2(b[0] - a[0], b[1] - a[1]);
  const t = clamp(p.sub(av).dot(ab).div(ab.dot(ab)), 0, 1);
  return p.sub(av.add(ab.mul(t))).length();
}

export async function runSurfaceClassification(
  renderer: Renderer,
  height: FloatBuffer,
  opts: SurfaceClassificationOpts,
): Promise<StorageTexture> {
  const { res, mp } = opts;
  const out = new StorageTexture(res, res);
  out.generateMipmaps = false;

  const kernel = Fn(() => {
    const i = instanceIndex;
    If(i.greaterThanEqual(res * res), () => {
      Return();
    });
    const x = i.mod(res);
    const y = i.div(res);
    const uv = vec2(float(x).add(0.5), float(y).add(0.5)).div(res);
    const wpos = uv.sub(0.5).mul(WORLD_SIZE);
    const h = height.element(i);
    const slope = texture(opts.normalTex, uv).w;
    const fields = texture(opts.fieldsTex, uv);
    const snow = texture(opts.biomeTex, uv).g;

    const dryNoise = mx_fractal_noise_float(
      wpos.div(780).add(vec2(mp.off.plains[0], mp.off.plains[1])),
      4,
      2.07,
      0.52,
      1,
    )
      .mul(0.5)
      .add(0.5);
    const dryness = fields.x.oneMinus().mul(0.74).add(dryNoise.mul(0.42));
    const lowSlope = smoothstep(0.12, 0.52, slope).oneMinus();
    const sand = smoothstep(0.56, 0.88, dryness)
      .mul(lowSlope)
      .mul(snow.oneMinus())
      .mul(mp.landscape.ecology.desert)
      .mul(mp.landscape.surfaces.sand)
      .clamp(0, 1)
      .toVar();

    // Sample the final render-water buffer, not hydrology fill W or the broad
    // riverDepth field. Dry waterY cells sit below the bed, so roads remain
    // continuous across drainage basins and stop only at actual open water.
    const waterX = x.mul(opts.waterRes).div(res);
    const waterZ = y.mul(opts.waterRes).div(res);
    const waterLevel = opts.waterY.element(waterZ.mul(opts.waterRes).add(waterX));
    const waterSafe = smoothstep(0.08, 0.45, h.sub(waterLevel));
    const cobble = float(0).toVar();
    const concrete = float(0).toVar();
    for (const path of mp.surfaceLayout.paths) {
      for (let segment = 0; segment < path.points.length - 1; segment++) {
        const a = path.points[segment];
        const b = path.points[segment + 1];
        if (!a || !b) continue;
        const d = segmentDistance(wpos, a, b);
        const edgeNoise = mx_fractal_noise_float(
          wpos.div(13.5).add(segment * 7.17),
          2,
          2.1,
          0.5,
          1,
        ).mul(path.kind === 'concrete' ? 0.55 : 1.25);
        const channel = path.kind === 'concrete' ? concrete : cobble;
        channel.assign(
          channel.max(
            smoothstep(path.width * 0.62, path.width + 2.5, d.add(edgeNoise))
              .oneMinus()
              .mul(path.strength),
          ),
        );
      }
    }

    for (const pad of mp.surfaceLayout.pads) {
      const ca = Math.cos(pad.rotation);
      const sa = Math.sin(pad.rotation);
      const q = wpos.sub(vec2(pad.center[0], pad.center[1]));
      const local = vec2(q.x.mul(ca).add(q.y.mul(sa)), q.y.mul(ca).sub(q.x.mul(sa)));
      const box = abs(local).sub(vec2(pad.halfSize[0], pad.halfSize[1]));
      const outside = max(box, vec2(0, 0)).length();
      const inside = min(max(box.x, box.y), 0);
      const signedDistance = outside.add(inside);
      concrete.assign(
        concrete.max(
          smoothstep(-1.2, 2.4, signedDistance).oneMinus().mul(pad.strength),
        ),
      );
    }

    cobble.mulAssign(waterSafe);
    concrete.mulAssign(waterSafe);
    const artificial = cobble.max(concrete).clamp(0, 1);
    sand.mulAssign(artificial.oneMinus());
    textureStore(
      out,
      uvec2(x.toUint(), y.toUint()),
      vec4(sand, cobble, concrete, artificial),
    ).toWriteOnly();
  })().compute(res * res);
  kernel.setName('surfaceClassify');
  await renderer.computeAsync(kernel);
  return out;
}
