import { float, smoothstep, vec2 } from 'three/tsl';
import type { NF, NV2 } from '../../gpu/TSLTypes';
import type { ScatterExclusionZone } from '../core/WorldFeature';

export type ExclusionRadius =
  | 'treeRadius'
  | 'understoryRadius'
  | 'extrasRadius'
  | 'stonesRadius';

/**
 * Renderer-side adapter for the feature system's CPU-authored occupancy zones.
 * Keeping it here lets every GPU scatter layer consume the same public contract
 * without coupling feature libraries to TSL or a particular renderer.
 */
export function scatterExclusionMask(
  wpos: NV2,
  zones: readonly ScatterExclusionZone[],
  radiusKey: ExclusionRadius,
): NF {
  let mask: NF = float(0);
  for (const zone of zones) {
    const radius = zone[radiusKey];
    if (radius <= 0) continue;
    const distance = wpos.sub(vec2(zone.center[0], zone.center[1])).length();
    mask = mask.max(smoothstep(radius + 2.5, radius, distance));
  }
  return mask;
}
