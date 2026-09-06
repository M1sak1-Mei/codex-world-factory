import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import type { TerrainSurface } from '../../../core/WorldFeature';
import type {
  LandscapeSurfaceLayout,
  SurfacePad,
  SurfacePath,
  SurfacePathKind,
} from '../../../../world/LandscapeSurface';

export interface PathSample {
  x: number;
  z: number;
  distance: number;
}

const ROAD_CLEARANCE = 0.24;
const ROAD_MAX_GRADE = 0.025;
const ROAD_MAX_FILL = 2.5;
const ROAD_SHOULDER_CLEARANCE = 0.05;

function pavementTexture(kind: SurfacePathKind): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for pavement texture');

  const hash = (x: number, y: number): number => {
    const v = Math.sin(x * 127.1 + y * 311.7 + (kind === 'cobble' ? 17.3 : 91.7));
    return v - Math.floor(v);
  };

  if (kind === 'cobble') {
    ctx.fillStyle = '#34332f';
    ctx.fillRect(0, 0, 256, 256);
    const cellW = 32;
    const cellH = 26;
    for (let row = 0; row < 11; row++) {
      const offset = row % 2 === 0 ? 0 : -cellW * 0.5;
      for (let col = -1; col < 10; col++) {
        const n = hash(col, row);
        const value = 78 + Math.round(n * 34);
        ctx.fillStyle = `rgb(${value},${value - 2},${value - 7})`;
        ctx.fillRect(
          offset + col * cellW + 2,
          row * cellH + 2,
          cellW - 4,
          cellH - 4,
        );
      }
    }
  } else {
    ctx.fillStyle = '#77766f';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1200; i++) {
      const x = Math.floor(hash(i, 1) * 256);
      const y = Math.floor(hash(i, 2) * 256);
      const value = 92 + Math.floor(hash(i, 3) * 55);
      ctx.fillStyle = `rgba(${value},${value},${value - 3},0.34)`;
      ctx.fillRect(x, y, 1 + (i % 2), 1 + ((i >> 1) % 2));
    }
    ctx.strokeStyle = 'rgba(48,48,45,0.72)';
    ctx.lineWidth = 3;
    for (let p = 0; p <= 256; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(256, p);
      ctx.stroke();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function pavementMaterial(kind: SurfacePathKind): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    map: pavementTexture(kind),
    roughness: kind === 'cobble' ? 0.94 : 0.88,
    metalness: 0,
    side: DoubleSide,
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  return material;
}

export function resampleSurfacePath(
  points: readonly (readonly [number, number])[],
  step = 4,
): PathSample[] {
  const samples: PathSample[] = [];
  let total = 0;
  for (let segment = 0; segment < points.length - 1; segment++) {
    const a = points[segment];
    const b = points[segment + 1];
    if (!a || !b) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const subdivisions = Math.max(1, Math.ceil(length / step));
    const start = segment === 0 ? 0 : 1;
    for (let i = start; i <= subdivisions; i++) {
      const t = i / subdivisions;
      samples.push({ x: a[0] + dx * t, z: a[1] + dz * t, distance: total + length * t });
    }
    total += length;
  }
  return samples;
}

function pathSide(samples: readonly PathSample[], index: number): [number, number] {
  const sample = samples[index];
  if (!sample) return [0, 1];
  const prev = samples[Math.max(0, index - 1)] ?? sample;
  const next = samples[Math.min(samples.length - 1, index + 1)] ?? sample;
  const length = Math.max(Math.hypot(next.x - prev.x, next.z - prev.z), 1e-5);
  return [-(next.z - prev.z) / length, (next.x - prev.x) / length];
}

/**
 * Builds a bounded fill-only elevation profile that clears the complete road
 * width and targets maxGrade without raising any station by more than the
 * earthwork budget. Cross sections share one elevation, so a wide road stays
 * rigid instead of copying every small terrain undulation.
 */
export function buildRoadElevationProfile(
  samples: readonly PathSample[],
  halfWidth: number,
  terrain: TerrainSurface,
  maxGrade = ROAD_MAX_GRADE,
): number[] {
  if (samples.length === 0) return [];
  const crossSamples = Math.max(2, Math.ceil((halfWidth * 2) / 3));
  const required = samples.map((sample, index) => {
    const [sideX, sideZ] = pathSide(samples, index);
    let elevation = Number.NEGATIVE_INFINITY;
    for (let j = 0; j <= crossSamples; j++) {
      const offset = (j / crossSamples * 2 - 1) * halfWidth;
      elevation = Math.max(
        elevation,
        terrain.heightAt(sample.x + sideX * offset, sample.z + sideZ * offset),
      );
    }
    return elevation + ROAD_CLEARANCE;
  });

  const first = samples[0];
  const last = samples[samples.length - 1];
  const closed = !!first && !!last && Math.hypot(last.x - first.x, last.z - first.z) < 0.01;
  const totalDistance = last?.distance ?? 0;
  return samples.map((sample, index) => {
    let elevation = required[index] ?? 0;
    for (let source = 0; source < samples.length; source++) {
      const sourceSample = samples[source];
      const sourceElevation = required[source];
      if (!sourceSample || sourceElevation === undefined) continue;
      let distance = Math.abs(sample.distance - sourceSample.distance);
      if (closed && totalDistance > 0) distance = Math.min(distance, totalDistance - distance);
      elevation = Math.max(elevation, sourceElevation - maxGrade * distance);
    }
    return Math.min(elevation, (required[index] ?? elevation) + ROAD_MAX_FILL);
  });
}

function pointSegmentDistance(
  x: number,
  z: number,
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 1e-8) return Math.hypot(x - a[0], z - a[1]);
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

export function surfacePathContainsPoint(
  path: SurfacePath,
  x: number,
  z: number,
  margin = 0,
): boolean {
  const radius = path.width * 0.82 + margin;
  for (let segment = 0; segment < path.points.length - 1; segment++) {
    const a = path.points[segment];
    const b = path.points[segment + 1];
    if (a && b && pointSegmentDistance(x, z, a, b) <= radius) return true;
  }
  return false;
}

export function surfacePadContainsPoint(
  pad: SurfacePad,
  x: number,
  z: number,
  margin = 0,
): boolean {
  const ca = Math.cos(pad.rotation);
  const sa = Math.sin(pad.rotation);
  const dx = x - pad.center[0];
  const dz = z - pad.center[1];
  const localX = dx * ca + dz * sa;
  const localZ = dz * ca - dx * sa;
  return Math.abs(localX) <= pad.halfSize[0] + margin
    && Math.abs(localZ) <= pad.halfSize[1] + margin;
}

type SurfaceOccluder = SurfacePath | SurfacePad;

function isOccluded(x: number, z: number, occluders: readonly SurfaceOccluder[]): boolean {
  return occluders.some((surface) => (
    'points' in surface
      ? surfacePathContainsPoint(surface, x, z, 0.45)
      : surfacePadContainsPoint(surface, x, z, 0.45)
  ));
}

function buildPathGeometry(
  path: SurfacePath,
  terrain: TerrainSurface,
  occluders: readonly SurfaceOccluder[],
): BufferGeometry {
  const samples = resampleSurfacePath(path.points);
  const halfWidth = path.width * 0.82;
  const crossSegments = Math.max(4, Math.ceil((halfWidth * 2) / 2));
  const stride = crossSegments + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const uvScale = path.kind === 'cobble' ? 16 : 32;
  const elevations = buildRoadElevationProfile(samples, halfWidth, terrain);

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (!sample) continue;
    const [sideX, sideZ] = pathSide(samples, i);
    for (let j = 0; j <= crossSegments; j++) {
      const across = j / crossSegments;
      const offset = (across * 2 - 1) * halfWidth;
      const x = sample.x + sideX * offset;
      const z = sample.z + sideZ * offset;
      positions.push(x, elevations[i] ?? terrain.heightAt(x, z) + ROAD_CLEARANCE, z);
      uvs.push(sample.distance / uvScale, offset / uvScale);
    }
  }

  for (let i = 0; i < samples.length - 1; i++) {
    for (let j = 0; j < crossSegments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      const centerX = (positions[a * 3] + positions[c * 3]) * 0.5;
      const centerZ = (positions[a * 3 + 2] + positions[c * 3 + 2]) * 0.5;
      if (isOccluded(centerX, centerZ, occluders)) continue;
      indices.push(a, c, b, a, d, c);
    }
  }

  // Retaining shoulders hide fill gaps where the grade-limited road sits
  // above the original terrain. They are skipped inside higher-priority
  // intersections along with the road top.
  for (const edge of [0, crossSegments]) {
    const bottomStart = positions.length / 3;
    for (let i = 0; i < samples.length; i++) {
      const top = i * stride + edge;
      const sample = samples[i];
      if (!sample) continue;
      const [sideX, sideZ] = pathSide(samples, i);
      const direction = edge === 0 ? -1 : 1;
      const shoulderOffset = direction * (halfWidth + 4);
      const x = sample.x + sideX * shoulderOffset;
      const z = sample.z + sideZ * shoulderOffset;
      positions.push(x, terrain.heightAt(x, z) + ROAD_SHOULDER_CLEARANCE, z);
      uvs.push(uvs[top * 2] ?? 0, uvs[top * 2 + 1] ?? 0);
    }
    for (let i = 0; i < samples.length - 1; i++) {
      const topA = i * stride + edge;
      const topB = (i + 1) * stride + edge;
      const bottomA = bottomStart + i;
      const bottomB = bottomA + 1;
      const centerX = ((positions[topA * 3] ?? 0) + (positions[topB * 3] ?? 0)) * 0.5;
      const centerZ = ((positions[topA * 3 + 2] ?? 0) + (positions[topB * 3 + 2] ?? 0)) * 0.5;
      if (isOccluded(centerX, centerZ, occluders)) continue;
      indices.push(topA, topB, bottomB, topA, bottomB, bottomA);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildPadGeometry(pad: SurfacePad, terrain: TerrainSurface): BufferGeometry {
  const [halfX, halfZ] = pad.halfSize;
  const segX = Math.max(4, Math.ceil((halfX * 2) / 4));
  const segZ = Math.max(4, Math.ceil((halfZ * 2) / 4));
  const stride = segZ + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ca = Math.cos(pad.rotation);
  const sa = Math.sin(pad.rotation);

  for (let ix = 0; ix <= segX; ix++) {
    const localX = -halfX + (ix / segX) * halfX * 2;
    for (let iz = 0; iz <= segZ; iz++) {
      const localZ = -halfZ + (iz / segZ) * halfZ * 2;
      const x = pad.center[0] + localX * ca - localZ * sa;
      const z = pad.center[1] + localX * sa + localZ * ca;
      positions.push(x, terrain.heightAt(x, z) + ROAD_CLEARANCE, z);
      uvs.push(localX / 32, localZ / 32);
    }
  }

  for (let ix = 0; ix < segX; ix++) {
    for (let iz = 0; iz < segZ; iz++) {
      const a = ix * stride + iz;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, c, b, a, d, c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildPavedRoadSurfaces(
  layout: LandscapeSurfaceLayout,
  terrain: TerrainSurface,
): Group {
  const group = new Group();
  group.name = 'paved-road-surfaces';
  const materials = {
    cobble: pavementMaterial('cobble'),
    concrete: pavementMaterial('concrete'),
  };

  for (const path of layout.paths) {
    const occluders: SurfaceOccluder[] = [
      ...layout.pads,
      ...(path.kind === 'cobble'
        ? layout.paths.filter((candidate) => candidate.kind === 'concrete')
        : []),
    ];
    const mesh = new Mesh(buildPathGeometry(path, terrain, occluders), materials[path.kind]);
    mesh.name = path.id;
    mesh.receiveShadow = true;
    mesh.renderOrder = path.kind === 'concrete' ? 3 : 2;
    group.add(mesh);
  }
  for (const pad of layout.pads) {
    const mesh = new Mesh(buildPadGeometry(pad, terrain), materials.concrete);
    mesh.name = pad.id;
    mesh.receiveShadow = true;
    mesh.renderOrder = 4;
    group.add(mesh);
  }

  return group;
}
