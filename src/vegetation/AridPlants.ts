/** Procedural arid plants. Geometry is asset-local and independent of scatter. */

import { BufferGeometry, Vector3 } from 'three';
import type { Rng } from '../core/Seed';
import { MeshGrower } from './TubeMesh';

const TAU = Math.PI * 2;

function appendRibbedTube(
  g: MeshGrower,
  start: Vector3,
  end: Vector3,
  radiusAt: (t: number) => number,
  rng: Rng,
  ribs = 12,
  rings = 7,
  hue = 0,
): void {
  const tangent = end.clone().sub(start).normalize();
  const ref = Math.abs(tangent.y) < 0.92 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const side = new Vector3().crossVectors(ref, tangent).normalize();
  const binormal = new Vector3().crossVectors(tangent, side).normalize();
  const ringVerts: number[][] = [];
  const phase = rng.float() * TAU;
  const around = 24;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const center = start.clone().lerp(end, t);
    const baseRadius = radiusAt(t);
    const ring: number[] = [];
    for (let k = 0; k <= around; k++) {
      const a = (k / around) * TAU;
      const rib = 1 + Math.cos(a * ribs) * 0.075;
      const radial = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
      const p = center.clone().addScaledVector(radial, baseRadius * rib);
      ring.push(g.vertex(
        p.x, p.y, p.z,
        radial.x, radial.y, radial.z,
        (k / around) * ribs, t * Math.max(1, start.distanceTo(end)),
        hue, 0.035 + t * 0.055, phase, 0.82 + t * 0.18,
      ));
    }
    ringVerts.push(ring);
  }
  for (let i = 0; i < rings; i++) {
    const a = ringVerts[i] as number[];
    const b = ringVerts[i + 1] as number[];
    for (let k = 0; k < around; k++) {
      g.quad(a[k] as number, a[k + 1] as number, b[k + 1] as number, b[k] as number);
    }
  }
  const top = ringVerts[rings] as number[];
  const tip = g.vertex(
    end.x, end.y, end.z,
    tangent.x, tangent.y, tangent.z,
    0.5, 1, hue, 0.09, phase, 1,
  );
  for (let k = 0; k < around; k++) g.tri(top[k] as number, top[k + 1] as number, tip);
}

function appendPad(
  g: MeshGrower,
  center: Vector3,
  size: Vector3,
  yaw: number,
  rng: Rng,
  part = 0,
): void {
  const latN = 9;
  const lonN = 14;
  const rows: number[][] = [];
  const phase = rng.float() * TAU;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  for (let iy = 0; iy <= latN; iy++) {
    const lat = -Math.PI / 2 + (iy / latN) * Math.PI;
    const row: number[] = [];
    for (let ix = 0; ix <= lonN; ix++) {
      const lon = (ix / lonN) * TAU;
      const lx = Math.cos(lat) * Math.cos(lon);
      const ly = Math.sin(lat);
      const lz = Math.cos(lat) * Math.sin(lon);
      const px = lx * size.x;
      const pz = lz * size.z;
      const wx = center.x + px * cy - pz * sy;
      const wz = center.z + px * sy + pz * cy;
      const nx0 = lx / Math.max(0.01, size.x);
      const ny0 = ly / Math.max(0.01, size.y);
      const nz0 = lz / Math.max(0.01, size.z);
      const nx1 = nx0 * cy - nz0 * sy;
      const nz1 = nx0 * sy + nz0 * cy;
      const nl = Math.hypot(nx1, ny0, nz1) || 1;
      row.push(g.vertex(
        wx, center.y + ly * size.y, wz,
        nx1 / nl, ny0 / nl, nz1 / nl,
        ix / lonN * 10, iy / latN,
        part, part > 0.8 ? 0.2 : 0.08, phase, 0.9,
      ));
    }
    rows.push(row);
  }
  for (let iy = 0; iy < latN; iy++) {
    const a = rows[iy] as number[];
    const b = rows[iy + 1] as number[];
    for (let ix = 0; ix < lonN; ix++) {
      g.quad(a[ix] as number, a[ix + 1] as number, b[ix + 1] as number, b[ix] as number);
    }
  }
}

function appendFlower(g: MeshGrower, at: Vector3, rng: Rng): void {
  const petals = 7;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU;
    const center = at.clone().add(new Vector3(Math.cos(a) * 0.1, 0.035, Math.sin(a) * 0.1));
    appendPad(g, center, new Vector3(0.12, 0.06, 0.035), -a, rng.fork(`petal-${i}`), 1);
  }
}

function buildSaguaro(g: MeshGrower, rng: Rng, clustered: boolean): void {
  const count = clustered ? 3 : 1;
  for (let c = 0; c < count; c++) {
    const x = clustered ? (c - 1) * 0.55 + rng.range(-0.1, 0.1) : 0;
    const z = clustered ? rng.range(-0.18, 0.18) : 0;
    const h = (clustered ? 2.4 : 3.7) * rng.range(0.88, 1.12);
    const base = new Vector3(x, 0, z);
    appendRibbedTube(g, base, new Vector3(x, h, z), (t) => 0.34 * (1 - t * 0.42), rng.fork(`trunk-${c}`), 12, 9, rng.range(-0.2, 0.2));
    if (!clustered || c === 1) {
      const armCount = clustered ? 1 : 1 + rng.int(3);
      for (let a = 0; a < armCount; a++) {
        const side = a % 2 === 0 ? 1 : -1;
        const y = h * (0.36 + a * 0.16 + rng.range(-0.04, 0.04));
        const reach = rng.range(0.55, 0.9);
        const joint = new Vector3(x, y, z);
        const elbow = new Vector3(x + reach * side, y + rng.range(-0.04, 0.08), z + rng.range(-0.18, 0.18));
        const armTop = elbow.clone().add(new Vector3(0, rng.range(0.75, 1.35), 0));
        appendRibbedTube(g, joint, elbow, (t) => 0.2 * (1 - t * 0.15), rng.fork(`arm-h-${c}-${a}`), 10, 4, 0.05);
        appendRibbedTube(g, elbow, armTop, (t) => 0.19 * (1 - t * 0.38), rng.fork(`arm-v-${c}-${a}`), 10, 5, 0.05);
        if (rng.float() < 0.38) appendFlower(g, armTop.clone().add(new Vector3(0, 0.05, 0)), rng.fork(`flower-${c}-${a}`));
      }
    }
  }
}

function buildBarrel(g: MeshGrower, rng: Rng): void {
  const h = rng.range(1.05, 1.55);
  appendRibbedTube(
    g,
    new Vector3(0, 0, 0),
    new Vector3(0, h, 0),
    (t) => Math.max(0.09, Math.sin(Math.PI * (0.08 + t * 0.84)) * 0.62),
    rng.fork('barrel'),
    18,
    10,
    rng.range(-0.18, 0.18),
  );
  if (rng.float() < 0.65) appendFlower(g, new Vector3(0, h + 0.02, 0), rng.fork('barrel-flower'));
}

function buildPricklyPear(g: MeshGrower, rng: Rng): void {
  const pads = 5 + rng.int(4);
  for (let i = 0; i < pads; i++) {
    const tier = i === 0 ? 0 : i < 3 ? 1 : 2;
    const x = tier === 0 ? 0 : rng.range(-0.72, 0.72);
    const y = 0.48 + tier * 0.62 + rng.range(-0.12, 0.12);
    const z = rng.range(-0.22, 0.22);
    const sy = rng.range(0.46, 0.65);
    appendPad(
      g,
      new Vector3(x, y, z),
      new Vector3(rng.range(0.32, 0.46), sy, rng.range(0.065, 0.1)),
      rng.range(-0.55, 0.55),
      rng.fork(`pad-${i}`),
      rng.range(-0.16, 0.16),
    );
    if (tier === 2 && rng.float() < 0.45) appendFlower(g, new Vector3(x, y + sy, z), rng.fork(`pad-flower-${i}`));
  }
}

/** Four stable forms: saguaro, barrel, prickly pear, and column cluster. */
export function buildCactus(rng: Rng, variant: number): BufferGeometry {
  const g = new MeshGrower();
  switch ((variant % 4 + 4) % 4) {
    case 0: buildSaguaro(g, rng, false); break;
    case 1: buildBarrel(g, rng); break;
    case 2: buildPricklyPear(g, rng); break;
    default: buildSaguaro(g, rng, true); break;
  }
  return g.build();
}
