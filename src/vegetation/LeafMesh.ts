/**
 * Foliage geometry — REAL meshes, no alpha cards at LOD0 (cards come from
 * captures of these meshes at LOD1+). A leaf is a folded/curled strip with a
 * parametric outline; a needle spray is a stem with dozens of single-quad
 * needles in comb or brush arrangement. Everything appends into a MeshGrower
 * in the anchor's local frame (+z outward, +y up) via a supplied transform.
 *
 * vdata: x hue, y sway flex, z sway phase, w AO (crown depth applied later).
 */

import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Rng } from '../core/Seed';
import type { MeshGrower } from './TubeMesh';
import type { LeafAnchor, LeafShapeParams } from './VegTypes';
import type { HeroLeafGeometryProfile } from './VegetationProfiles';

const _p = new Vector3();
const _n = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();

function pushXf(
  g: MeshGrower,
  m: Matrix4,
  px: number, py: number, pz: number,
  nx: number, ny: number, nz: number,
  u: number, v: number,
  d0: number, d1: number, d2: number, d3: number,
): number {
  _p.set(px, py, pz).applyMatrix4(m);
  _n.set(nx, ny, nz).transformDirection(m);
  return g.vertex(_p.x, _p.y, _p.z, _n.x, _n.y, _n.z, u, v, d0, d1, d2, d3);
}

/**
 * One leaf: 4-row strip along +z, 3 verts per row (−w, mid, +w), folded along
 * the midrib and curled toward the tip. ~18 tris. Local: base at origin,
 * blade along +z, face up +y.
 */
export function buildLeaf(
  g: MeshGrower,
  m: Matrix4,
  shape: LeafShapeParams,
  hue: number,
  flex: number,
  phase: number,
  ao: number,
  detail?: HeroLeafGeometryProfile,
): void {
  const ROWS = Math.max(4, detail?.rows ?? 4);
  const heroOak = (detail?.lobes ?? 0) > 0;
  const COLS = Math.max(3, detail?.columns ?? (heroOak ? 5 : 3));
  const centerCol = Math.floor(COLS / 2);
  const L = shape.len;
  const W = shape.width;
  const front: number[][] = [];
  const back: number[][] = [];
  const thickness = detail?.thickness ?? 0;
  // tiny petiole
  const stem = L * 0.14;
  const phaseAsymmetry = Math.sin(phase * 1.731) * (detail?.asymmetry ?? 0);
  const lobePhase = Math.sin(phase * 0.913) * 0.09;
  const twistSign = 0.7 + Math.sin(phase * 1.217) * 0.3;
  for (let i = 0; i <= ROWS; i++) {
    const s = i / ROWS;
    const outlineT = heroOak ? 0.035 + s * 0.93 : Math.min(1, s * 0.86 + 0.07);
    const outline = Math.pow(Math.sin(Math.PI * outlineT), shape.shapePow);
    const lobeWave = heroOak
      ? Math.pow(Math.abs(Math.sin(Math.PI * (s * (detail?.lobes ?? 0) + lobePhase))), 0.52)
      : 1;
    const lobeFade = Math.pow(Math.sin(Math.PI * s), 0.7);
    const lobeScale = 1 - (detail?.lobeDepth ?? 0) * (1 - lobeWave) * lobeFade;
    const serrationL = detail
      ? 1 + Math.sin(s * Math.PI * 2 * detail.serrationCount + phase * 0.31) *
        detail.serration * Math.sin(Math.PI * s)
      : 1;
    const serrationR = detail
      ? 1 + Math.sin(s * Math.PI * 2 * detail.serrationCount + 1.7 + phase * 0.23) *
        detail.serration * Math.sin(Math.PI * s)
      : 1;
    const sideFlutter = (detail?.asymmetry ?? 0) * 0.45 * Math.sin(s * 17 + phase);
    const leftW = W * outline * lobeScale * serrationL * (1 + phaseAsymmetry + sideFlutter);
    const rightW = W * outline * lobeScale * serrationR * (1 - phaseAsymmetry - sideFlutter);
    const z = stem + s * (L - stem);
    const curlVariation = 0.78 + Math.sin(phase * 1.43 + 0.4) * 0.22;
    const curlY = -shape.curl * curlVariation * s * s * L;
    const midrib = (detail?.midrib ?? 0) * Math.sin(Math.PI * s);
    const cup = (detail?.cup ?? 0) * W * Math.sin(Math.PI * s);
    const veinWave = heroOak
      ? Math.pow(Math.abs(Math.sin(Math.PI * s * (detail?.veinPairs ?? 0))), 5)
      : 0;
    const twist = (detail?.twist ?? 0) * twistSign * s * s;
    const cosTwist = Math.cos(twist);
    const sinTwist = Math.sin(twist);
    const frontRow: number[] = [];
    const backRow: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const across = c / (COLS - 1) * 2 - 1;
      const sideW = across < 0 ? leftW : rightW;
      const x0 = across * sideW;
      const edge = Math.abs(across);
      const crossY = midrib * (1 - Math.pow(edge, 0.75))
        - shape.fold * sideW * Math.pow(edge, 1.35)
        - cup * edge * edge
        + veinWave * midrib * 0.32 * (edge > 0 && edge < 1 ? 1 : 0);
      const x = x0 * cosTwist - crossY * sinTwist;
      const y = curlY + x0 * sinTwist + crossY * cosTwist;
      const normalX = across * shape.fold * 0.9 + sinTwist;
      const texU = c / (COLS - 1);
      const edgeAo = 1 - edge * 0.08;
      frontRow.push(pushXf(
        g, m, x, y, z, normalX, 1, shape.curl * s,
        texU, s, hue, flex, phase, ao * edgeAo,
      ));
      if (thickness > 0) {
        backRow.push(pushXf(
          g, m, x, y - thickness, z, -normalX, -1, -shape.curl * s,
          texU, s, hue, flex, phase, ao * (edgeAo - 0.08),
        ));
      }
    }
    front.push(frontRow);
    if (thickness > 0) {
      back.push(backRow);
    }
  }
  for (let i = 0; i < ROWS; i++) {
    const a = front[i] as number[];
    const b = front[i + 1] as number[];
    for (let c = 0; c < COLS - 1; c++) {
      g.quad(a[c] as number, b[c] as number, b[c + 1] as number, a[c + 1] as number);
    }
    if (thickness > 0) {
      const ab = back[i] as number[];
      const bb = back[i + 1] as number[];
      for (let c = 0; c < COLS - 1; c++) {
        g.quad(ab[c + 1] as number, bb[c + 1] as number, bb[c] as number, ab[c] as number);
      }
      g.quad(a[0] as number, ab[0] as number, bb[0] as number, b[0] as number);
      g.quad(
        a[COLS - 1] as number, b[COLS - 1] as number,
        bb[COLS - 1] as number, ab[COLS - 1] as number,
      );
    }
  }
  // petiole quad
  const p0 = pushXf(g, m, -W * 0.06, 0, 0, 0, 1, 0, 0.45, 0, hue, flex * 0.7, phase, ao);
  const p1 = pushXf(g, m, W * 0.06, 0, 0, 0, 1, 0, 0.55, 0, hue, flex * 0.7, phase, ao);
  const r0 = front[0] as number[];
  g.quad(p0, r0[centerCol - 1] as number, r0[centerCol] as number, p1);
  g.tri(p1, r0[centerCol] as number, r0[centerCol + 1] as number);
  if (thickness > 0) {
    const ft = front[ROWS] as number[];
    const bt = back[ROWS] as number[];
    for (let c = 0; c < COLS - 1; c++) {
      g.quad(ft[c] as number, bt[c] as number, bt[c + 1] as number, ft[c + 1] as number);
    }
  }
}

/**
 * Needle spray: drooping stem polyline + `needleCount` single-quad needles,
 * comb (flat, ±row) or brush (radial) arrangement. Local: along +z.
 */
export function buildNeedleSpray(
  g: MeshGrower,
  m: Matrix4,
  shape: LeafShapeParams,
  scale: number,
  rng: Rng,
  hue: number,
  flex: number,
  phase: number,
  ao: number,
  detail?: HeroLeafGeometryProfile,
): void {
  const SEGS = 4;
  const L = scale;
  // stem: thin two-sided strip (cheaper than a tube, reads as twig)
  const stemPts: Vector3[] = [];
  let dz = 1;
  let dy = 0;
  let z = 0;
  let y = 0;
  for (let i = 0; i <= SEGS; i++) {
    stemPts.push(new Vector3(0, y, z));
    const step = L / SEGS;
    dy -= 0.16 * (i / SEGS); // sag
    const dl = Math.hypot(dy, dz);
    z += (dz / dl) * step;
    y += (dy / dl) * step;
  }
  const sw = L * 0.012 + 0.002;
  const stemRows: number[][] = [];
  for (let i = 0; i <= SEGS; i++) {
    const p = stemPts[i] as Vector3;
    const w = sw * (1 - (i / SEGS) * 0.7);
    stemRows.push([
      pushXf(g, m, p.x - w, p.y, p.z, 0, 1, 0, 0.48, i / SEGS, hue, flex, phase, ao * 0.85),
      pushXf(g, m, p.x + w, p.y, p.z, 0, 1, 0, 0.52, i / SEGS, hue, flex, phase, ao * 0.85),
    ]);
  }
  for (let i = 0; i < SEGS; i++) {
    const a = stemRows[i] as number[];
    const b = stemRows[i + 1] as number[];
    g.quad(a[0] as number, b[0] as number, b[1] as number, a[1] as number);
  }

  // needles
  const count = shape.needleCount;
  const nl = shape.len;
  const nw = shape.width;
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) / count;
    const idxF = s * SEGS;
    const i0 = Math.min(SEGS - 1, Math.floor(idxF));
    const f = idxF - i0;
    const base = _p
      .copy(stemPts[i0] as Vector3)
      .lerp(stemPts[i0 + 1] as Vector3, f)
      .clone();
    // comb: two layered rows ±x (fills the bough plane); brush: radial
    const side = i % 2 === 0 ? 1 : -1;
    const layer = i % 4 < 2 ? 1 : 0;
    const az = shape.brush > 0.5
      ? rng.float() * Math.PI * 2
      : side * (1.05 + (rng.float() - 0.5) * 0.85);
    const elev = shape.brush > 0.5
      ? (rng.float() - 0.2) * 1.1
      : (layer === 1 ? 0.42 : 0.02) + (rng.float() - 0.5) * 0.3;
    const swing = (rng.float() - 0.5) * 0.3 + s * 0.55; // sweep toward tip
    const dir = new Vector3(
      Math.sin(az) * Math.cos(elev),
      Math.sin(elev),
      Math.cos(az) * Math.cos(elev) * 0.35 + swing,
    ).normalize();
    const lenJ = nl * (0.75 + rng.float() * 0.5) * (0.65 + 0.35 * Math.sin(Math.PI * Math.min(1, s * 1.18)));
    const needleSegs = Math.max(1, detail?.needleSegments ?? 1);
    const planes = Math.max(1, detail?.needleCrossPlanes ?? 1);
    const curl = detail?.needleCurl ?? 0;
    // quad across the needle, normal ≈ up-out blend
    const across0 = new Vector3(-dir.z, 0, dir.x).normalize();
    const normal0 = new Vector3().crossVectors(dir, across0).normalize();
    const hueN = hue + (rng.float() - 0.5) * 0.5;
    for (let plane = 0; plane < planes; plane++) {
      const across = plane === 0 ? across0 : normal0;
      const rows: number[][] = [];
      for (let j = 0; j <= needleSegs; j++) {
        const t = j / needleSegs;
        const center = base.clone()
          .addScaledVector(dir, lenJ * t)
          .add(new Vector3(0, -curl * lenJ * t * t, 0));
        const tangent = dir.clone().add(new Vector3(0, -2 * curl * t, 0)).normalize();
        const nrm = new Vector3().crossVectors(tangent, across).normalize();
        const halfW = nw * 0.5 * (1 - t * 0.78);
        const edge = across.clone().multiplyScalar(halfW);
        rows.push([
          pushXf(
            g, m, center.x - edge.x, center.y - edge.y, center.z - edge.z,
            nrm.x, nrm.y, nrm.z, 0, t,
            hueN, flex * (1 + t * 0.15), phase, ao * (0.9 + t * 0.1),
          ),
          pushXf(
            g, m, center.x + edge.x, center.y + edge.y, center.z + edge.z,
            nrm.x, nrm.y, nrm.z, 1, t,
            hueN, flex * (1 + t * 0.15), phase, ao * (0.9 + t * 0.1),
          ),
        ]);
      }
      for (let j = 0; j < needleSegs; j++) {
        const a = rows[j] as number[];
        const b = rows[j + 1] as number[];
        g.quad(a[0] as number, b[0] as number, b[1] as number, a[1] as number);
      }
    }
  }
}

/** leaf cluster: `n` leaves fanned around the anchor's +z */
export function buildLeafCluster(
  g: MeshGrower,
  anchor: LeafAnchor,
  shape: LeafShapeParams,
  clusterSize: [number, number],
  rng: Rng,
  detail?: HeroLeafGeometryProfile,
): void {
  const n = Math.round(clusterSize[0] + rng.float() * (clusterSize[1] - clusterSize[0]));
  const flex = 0.55 + rng.float() * 0.3;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const baseAz = rng.float() * Math.PI * 2;
  const spread = detail?.clusterSpread ?? 1;
  for (let i = 0; i < n; i++) {
    const az = detail
      ? baseAz + i * golden * spread + (rng.float() - 0.5) * 0.28
      : (i / n) * Math.PI * 2 + rng.float() * 0.9;
    const pitch = detail
      ? 0.38 + rng.float() * 0.7 + Math.sin(i * golden) * 0.12
      : 0.5 + rng.float() * 0.6;
    const roll = detail ? (rng.float() - 0.5) * 0.7 : 0;
    _q.setFromAxisAngle(new Vector3(0, 1, 0), az);
    const qp = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch);
    const qroll = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll);
    const qr = anchor.quat.clone().multiply(_q).multiply(qp).multiply(qroll);
    const s = anchor.scale * (0.8 + rng.float() * 0.45);
    _m.compose(anchor.pos, qr, new Vector3(s, s, s));
    buildLeaf(
      g, _m, shape,
      anchor.hue + (rng.float() - 0.5) * 0.4,
      flex,
      rng.float() * Math.PI * 2,
      1,
      detail,
    );
  }
}

/** needle spray at an anchor */
export function buildSprayAt(
  g: MeshGrower,
  anchor: LeafAnchor,
  shape: LeafShapeParams,
  rng: Rng,
  detail?: HeroLeafGeometryProfile,
): void {
  _m.compose(anchor.pos, anchor.quat, new Vector3(1, 1, 1));
  buildNeedleSpray(
    g, _m, shape, anchor.scale, rng,
    anchor.hue, 0.5 + rng.float() * 0.3, rng.float() * Math.PI * 2, 1,
    detail,
  );
}
