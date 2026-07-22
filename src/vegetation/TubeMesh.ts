/**
 * Mesh assembly helpers. MeshGrower accumulates one big indexed buffer
 * (position/normal/uv/vdata) — every generator appends into it, so a whole
 * asset is 1–2 draw calls. TubeMesh turns skeleton branches into generalized
 * cylinders via parallel-transport frames, with root flare/buttresses on the
 * trunk and jagged caps on broken branches.
 *
 * vdata layout (vec4, consumed by VegMaterials):
 *   x: hue jitter (−1..1)   y: sway flexibility (0 rigid .. 1 tip)
 *   z: sway phase (0..2π)   w: baked AO (0 dark .. 1 open)
 */

import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import type { Rng } from '../core/Seed';
import type { SkelBranch, Skeleton } from './VegTypes';
import type {
  HeroBarkGeometryProfile,
  HeroDefectProfile,
  HeroRootProfile,
} from './VegetationProfiles';

export class MeshGrower {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private dat: number[] = [];
  private idx: number[] = [];
  vertCount = 0;

  vertex(
    px: number, py: number, pz: number,
    nx: number, ny: number, nz: number,
    u: number, v: number,
    d0: number, d1: number, d2: number, d3: number,
  ): number {
    this.pos.push(px, py, pz);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.dat.push(d0, d1, d2, d3);
    return this.vertCount++;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  get triCount(): number {
    return this.idx.length / 3;
  }

  /** blend normals toward a sphere around `center` (foliage cohesion trick) */
  bendNormals(center: Vector3, radius: number, k: number, fromVert = 0): void {
    const inv = 1 / Math.max(0.001, radius);
    for (let i = fromVert; i < this.vertCount; i++) {
      const px = this.pos[i * 3] as number;
      const py = this.pos[i * 3 + 1] as number;
      const pz = this.pos[i * 3 + 2] as number;
      let sx = (px - center.x) * inv;
      let sy = (py - center.y) * inv;
      let sz = (pz - center.z) * inv;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl; sy /= sl; sz /= sl;
      const nx = (this.nrm[i * 3] as number) * (1 - k) + sx * k;
      const ny = (this.nrm[i * 3 + 1] as number) * (1 - k) + sy * k;
      const nz = (this.nrm[i * 3 + 2] as number) * (1 - k) + sz * k;
      const l = Math.hypot(nx, ny, nz) || 1;
      this.nrm[i * 3] = nx / l;
      this.nrm[i * 3 + 1] = ny / l;
      this.nrm[i * 3 + 2] = nz / l;
    }
  }

  /** depth-in-crown AO: vdata.w *= darkening for verts inside the crown hull */
  crownAO(center: Vector3, radius: number, strength: number, fromVert = 0): void {
    const inv = 1 / Math.max(0.001, radius);
    for (let i = fromVert; i < this.vertCount; i++) {
      const dx = ((this.pos[i * 3] as number) - center.x) * inv;
      const dy = ((this.pos[i * 3 + 1] as number) - center.y) * inv;
      const dz = ((this.pos[i * 3 + 2] as number) - center.z) * inv;
      const d = Math.min(1, Math.hypot(dx, dy, dz));
      const ao = 1 - strength * (1 - d) * (1 - d);
      this.dat[i * 4 + 3] = (this.dat[i * 4 + 3] as number) * ao;
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('vdata', new BufferAttribute(new Float32Array(this.dat), 4));
    g.setIndex(
      this.vertCount > 65535
        ? new BufferAttribute(new Uint32Array(this.idx), 1)
        : new BufferAttribute(new Uint16Array(this.idx), 1),
    );
    g.computeBoundingSphere();
    return g;
  }
}

export interface TubeOpts {
  /** ring vertex count at the branch base (tapers down along the branch) */
  ringSegs: number;
  /** around-tube texture repeats at the base */
  uRepeats: number;
  /** lengthwise texture scale (v per meter ≈ uRepeats / circumference) */
  vScale: number;
  /** trunk-only root flare */
  flare?: { amp: number; height: number; lobes: number; phase: number };
  /** jagged cap over ring 0 — tubes historically had NO start cap (invisible
   *  on branches attached to a parent; an open hole on free-lying deadfall) */
  capBase?: boolean;
  /** per-branch sway phase + flexibility for vdata */
  swayPhase: number;
  swayFlexBase: number;
  swayFlexTip: number;
  hue: number;
  /** Hero-only resolved silhouette and junction treatment. */
  surface?: HeroBarkGeometryProfile;
}

const _N = new Vector3();
const _B = new Vector3();
const _T = new Vector3();
const _v = new Vector3();

/** generalized cylinder along a skeleton branch via parallel transport */
export function tubeForBranch(
  g: MeshGrower,
  br: SkelBranch,
  opts: TubeOpts,
  rng: Rng,
): void {
  if (br.pts.length < 2) return;
  const pts: Vector3[] = [];
  const radii: number[] = [];
  const dirs: Vector3[] = [];
  if (opts.surface) {
    // WebGPU exposes no tessellation stage. Resolve hero bark on the CPU by
    // adaptively sampling the growth spline; the generated buffer remains a
    // normal instanced mesh at runtime.
    const spacing = br.level === 0 ? 0.32 : br.level === 1 ? 0.42 : 0.62;
    for (let si = 0; si < br.pts.length - 1; si++) {
      const a = br.pts[si] as Vector3;
      const b = br.pts[si + 1] as Vector3;
      const steps = Math.max(1, Math.ceil(a.distanceTo(b) / spacing));
      for (let j = 0; j < steps; j++) {
        const k = j / steps;
        pts.push(a.clone().lerp(b, k));
        radii.push((br.radii[si] as number) * (1 - k) + (br.radii[si + 1] as number) * k);
        dirs.push((br.dirs[si] as Vector3).clone().lerp(br.dirs[si + 1] as Vector3, k).normalize());
      }
    }
    pts.push((br.pts[br.pts.length - 1] as Vector3).clone());
    radii.push(br.radii[br.radii.length - 1] as number);
    dirs.push((br.dirs[br.dirs.length - 1] as Vector3).clone());
  } else {
    pts.push(...br.pts);
    radii.push(...br.radii);
    dirs.push(...br.dirs);
  }
  const n = pts.length;
  const rings: number[][] = [];
  let lastRingPos: number[] = [];
  let firstRingPos: number[] = [];
  // initial frame
  _T.copy(dirs[0] as Vector3);
  const ref = Math.abs(_T.y) < 0.94 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  _N.crossVectors(ref, _T).normalize();
  _B.crossVectors(_T, _N).normalize();

  const segsAround = Math.max(4, opts.ringSegs);
  let vAlong = 0;
  const baseR = Math.max(radii[0] as number, 1e-4);

  for (let i = 0; i < n; i++) {
    const p = pts[i] as Vector3;
    const r = radii[i] as number;
    if (i > 0) {
      const prev = pts[i - 1] as Vector3;
      vAlong += _v.subVectors(p, prev).length();
      // parallel transport: rotate N,B by the rotation prev-tangent → tangent
      const tPrev = dirs[i - 1] as Vector3;
      const tCur = dirs[i] as Vector3;
      const axis = _v.crossVectors(tPrev, tCur);
      const s = axis.length();
      if (s > 1e-6) {
        axis.multiplyScalar(1 / s);
        const ang = Math.asin(Math.min(1, s));
        _N.applyAxisAngle(axis, ang).normalize();
        _B.applyAxisAngle(axis, ang).normalize();
      }
    }
    const tt = i / (n - 1);
    // taper slope tilts ring normals toward the tangent
    const rNext = radii[Math.min(n - 1, i + 1)] as number;
    const rPrev = radii[Math.max(0, i - 1)] as number;
    const slope = (rPrev - rNext) * (n - 1) / Math.max(0.05, br.len) * 0.5;
    const ring: number[] = [];
    const ringPos: number[] = [];
    const ao = 1; // bark AO baked later via crownAO/groundAO passes
    const flex = opts.swayFlexBase + (opts.swayFlexTip - opts.swayFlexBase) * tt;
    for (let k = 0; k <= segsAround; k++) {
      const a = (k / segsAround) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let rr = r;
      if (opts.flare && br.level === 0) {
        const h = (pts[i] as Vector3).y - (pts[0] as Vector3).y;
        const lobe = Math.pow(
          Math.max(0, Math.cos(opts.flare.lobes * a + opts.flare.phase)),
          1.6,
        );
        rr *= 1 + opts.flare.amp * Math.exp(-h / opts.flare.height) * (0.45 + 0.9 * lobe);
      }
      if (opts.surface) {
        const srf = opts.surface;
        const branchK = br.level === 0 ? 1 : br.level === 1 ? 0.58 : 0.22;
        const h = vAlong;
        // A twisted ellipse breaks the generalized-cylinder read at the
        // silhouette. Two incommensurate waves provide old-growth swelling;
        // the powered ridge term resolves individual bark plates.
        const elliptical = Math.cos(2 * (a + h * srf.twist)) * srf.ellipticity * branchK;
        const swell =
          (Math.sin(a * 3 + h * 0.61) * 0.58 + Math.sin(a * 5.1 - h * 0.37) * 0.42) *
          srf.irregularity * branchK;
        const ridgeRaw = Math.max(0, Math.cos(a * srf.ridgeCount + h * 1.7));
        const ridges = (Math.pow(ridgeRaw, 4) - 0.16) * srf.microDepth * branchK;
        rr *= Math.max(0.58, 1 + elliptical + swell + ridges);
        if (br.level > 0) {
          // A short swollen collar hides the hard child/parent tube seam and
          // reads as compressed reaction wood in the branch crotch.
          rr *= 1 + srf.junctionBlend * Math.exp(-tt * 12);
        }
      }
      const dx = _N.x * ca + _B.x * sa;
      const dy = _N.y * ca + _B.y * sa;
      const dz = _N.z * ca + _B.z * sa;
      const tan = dirs[i] as Vector3;
      let nx = dx + tan.x * slope;
      let ny = dy + tan.y * slope;
      let nz = dz + tan.z * slope;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      ringPos.push(p.x + dx * rr, p.y + dy * rr, p.z + dz * rr);
      ring.push(
        g.vertex(
          p.x + dx * rr, p.y + dy * rr, p.z + dz * rr,
          nx, ny, nz,
          (k / segsAround) * opts.uRepeats,
          (vAlong / (Math.PI * 2 * baseR)) * opts.uRepeats * opts.vScale,
          opts.hue, flex, opts.swayPhase, ao,
        ),
      );
    }
    rings.push(ring);
    lastRingPos = ringPos;
    if (i === 0) firstRingPos = ringPos;
  }

  // winding: rings are built on (N, B=T×N) — increasing angle is CCW viewed
  // from −T, so quads must run base-ring-first to put front faces OUTWARD
  // (the old b-first order rendered tube interiors on FrontSide materials)
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i] as number[];
    const b = rings[i + 1] as number[];
    for (let k = 0; k < segsAround; k++) {
      g.quad(a[k] as number, a[k + 1] as number, b[k + 1] as number, b[k] as number);
    }
  }

  // base cap (free-lying pieces): jagged disc facing −T0. Winding note: the
  // cap advances along −T, which flips handedness vs the wall quads — the
  // outward order here is the MIRROR of the tip-cap order.
  if (opts.capBase && baseR > 0.015) {
    const baseP = pts[0] as Vector3;
    const baseD = dirs[0] as Vector3;
    const first = rings[0] as number[];
    const center = g.vertex(
      baseP.x - baseD.x * baseR * 0.4,
      baseP.y - baseD.y * baseR * 0.4,
      baseP.z - baseD.z * baseR * 0.4,
      -baseD.x, -baseD.y, -baseD.z,
      0.5, 0.5, opts.hue, opts.swayFlexBase, opts.swayPhase, 0.55,
    );
    const jag: number[] = [];
    for (let k = 0; k <= segsAround; k++) {
      const px = baseP.x + ((firstRingPos[k * 3] as number) - baseP.x) * 0.45;
      const py = baseP.y + ((firstRingPos[k * 3 + 1] as number) - baseP.y) * 0.45;
      const pz = baseP.z + ((firstRingPos[k * 3 + 2] as number) - baseP.z) * 0.45;
      const spike = (rng.float() * 0.9 + 0.25) * baseR * 1.4;
      jag.push(
        g.vertex(
          px - baseD.x * spike, py - baseD.y * spike, pz - baseD.z * spike,
          -baseD.x, -baseD.y, -baseD.z,
          0.5, 0.5, opts.hue, opts.swayFlexBase, opts.swayPhase, 0.5,
        ),
      );
    }
    for (let k = 0; k < segsAround; k++) {
      g.quad(first[k] as number, jag[k] as number, jag[k + 1] as number, first[k + 1] as number);
      g.tri(jag[k] as number, center, jag[k + 1] as number);
    }
  }

  // cap
  const last = rings[rings.length - 1] as number[];
  const tipP = pts[n - 1] as Vector3;
  const tipD = dirs[n - 1] as Vector3;
  const tipR = radii[n - 1] as number;
  if (br.broken && tipR > 0.015) {
    // jagged break: ring of inward spikes at randomized heights
    const center = g.vertex(
      tipP.x + tipD.x * tipR * 0.4,
      tipP.y + tipD.y * tipR * 0.4,
      tipP.z + tipD.z * tipR * 0.4,
      tipD.x, tipD.y, tipD.z,
      0.5, 0.5, opts.hue, opts.swayFlexTip, opts.swayPhase, 0.55,
    );
    const jag: number[] = [];
    for (let k = 0; k <= segsAround; k++) {
      const px = tipP.x + ((lastRingPos[k * 3] as number) - tipP.x) * 0.45;
      const py = tipP.y + ((lastRingPos[k * 3 + 1] as number) - tipP.y) * 0.45;
      const pz = tipP.z + ((lastRingPos[k * 3 + 2] as number) - tipP.z) * 0.45;
      const spike = (rng.float() * 0.9 + 0.25) * tipR * 1.4;
      jag.push(
        g.vertex(
          px + tipD.x * spike, py + tipD.y * spike, pz + tipD.z * spike,
          tipD.x, tipD.y, tipD.z,
          0.5, 0.5, opts.hue, opts.swayFlexTip, opts.swayPhase, 0.5,
        ),
      );
    }
    for (let k = 0; k < segsAround; k++) {
      g.quad(last[k] as number, last[k + 1] as number, jag[k + 1] as number, jag[k] as number);
      g.tri(jag[k + 1] as number, center, jag[k] as number);
    }
  } else {
    // taper to a point
    const tip = g.vertex(
      tipP.x + tipD.x * tipR * 2.0,
      tipP.y + tipD.y * tipR * 2.0,
      tipP.z + tipD.z * tipR * 2.0,
      tipD.x, tipD.y, tipD.z,
      0.5, vAlong / (Math.PI * 2 * baseR) + 0.2,
      opts.hue, opts.swayFlexTip, opts.swayPhase, 1,
    );
    for (let k = 0; k < segsAround; k++) {
      g.tri(last[k + 1] as number, tip, last[k] as number);
    }
  }
}

/** ring resolution by branch level (LOD scales these down) */
export function ringsForLevel(level: number, lodK: number): number {
  const base = level === 0 ? 14 : level === 1 ? 8 : level === 2 ? 6 : 5;
  return Math.max(4, Math.round(base * lodK));
}

/** mesh every branch of a skeleton into the grower */
export function tubesForSkeleton(
  g: MeshGrower,
  skel: Skeleton,
  rng: Rng,
  opts: {
    lodK: number;
    uRepeats: number;
    flare?: { amp: number; height: number; lobes: number; phase: number };
    /** skip branches at or above this level (LOD cut) */
    maxLevel?: number;
    /** keep only every Nth branch of level ≥ 1 (far-LOD bark diet) */
    branchStride?: number;
    /** Hero-only resolved bark silhouette. */
    surface?: HeroBarkGeometryProfile;
  },
): void {
  const maxLevel = opts.maxLevel ?? 99;
  const stride = opts.branchStride ?? 1;
  let bi = 0;
  for (const br of skel.branches) {
    if (br.level > maxLevel) continue;
    if (br.level >= 1 && stride > 1 && bi++ % stride !== 0) continue;
    // sway: trunk rigid, outer levels flexible
    const flexB = br.level === 0 ? 0 : br.level === 1 ? 0.12 : 0.3;
    const flexT = br.level === 0 ? 0.05 : br.level === 1 ? 0.35 : 0.7;
    tubeForBranch(
      g,
      br,
      {
        ringSegs: opts.surface
          ? Math.max(
              ringsForLevel(br.level, opts.lodK),
              br.level === 0 ? 32 : br.level === 1 ? 14 : 7,
            )
          : ringsForLevel(br.level, opts.lodK),
        uRepeats: br.level === 0 ? opts.uRepeats : Math.max(1, Math.round(opts.uRepeats * 0.4)),
        vScale: 1,
        ...(br.level === 0 && opts.flare ? { flare: opts.flare } : {}),
        swayPhase: rng.float() * Math.PI * 2,
        swayFlexBase: flexB,
        swayFlexTip: flexT,
        hue: rng.float() * 2 - 1,
        ...(opts.surface ? { surface: opts.surface } : {}),
      },
      rng,
    );
  }
}

function pointOnBranch(br: SkelBranch, t: number): { p: Vector3; tangent: Vector3; radius: number } {
  const f = Math.max(0, Math.min(0.9999, t)) * (br.pts.length - 1);
  const i = Math.min(br.pts.length - 2, Math.floor(f));
  const k = f - i;
  return {
    p: (br.pts[i] as Vector3).clone().lerp(br.pts[i + 1] as Vector3, k),
    tangent: (br.dirs[i] as Vector3).clone().lerp(br.dirs[i + 1] as Vector3, k).normalize(),
    radius: (br.radii[i] as number) * (1 - k) + (br.radii[i + 1] as number) * k,
  };
}

/** Append old-growth knots, recessed scars, and lifted peeling-bark strips. */
export function heroBarkDefects(
  g: MeshGrower,
  skel: Skeleton,
  rng: Rng,
  profile: HeroDefectProfile,
): void {
  const trunk = skel.branches.find((b) => b.level === 0);
  if (!trunk) return;

  const disc = (kind: 'knot' | 'scar', t: number, angle: number, size: number): void => {
    const at = pointOnBranch(trunk, t);
    const ref = Math.abs(at.tangent.y) < 0.94 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const n = new Vector3().crossVectors(ref, at.tangent).normalize();
    const b = new Vector3().crossVectors(at.tangent, n).normalize();
    const radial = n.clone().multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle)).normalize();
    const side = new Vector3().crossVectors(at.tangent, radial).normalize();
    const base = at.p.clone().addScaledVector(radial, at.radius * (kind === 'knot' ? 0.92 : 1.003));
    const rings: number[][] = [];
    const RINGS = kind === 'knot' ? 4 : 2;
    const SEGS = 12;
    for (let ri = 0; ri <= RINGS; ri++) {
      const s = ri / RINGS;
      const rr = size * Math.sin(s * Math.PI * 0.5);
      const lift = kind === 'knot' ? size * 0.75 * (1 - s * s) : -size * 0.22 * (1 - s);
      const ring: number[] = [];
      for (let k = 0; k <= SEGS; k++) {
        const a = (k / SEGS) * Math.PI * 2;
        const p = base
          .clone()
          .addScaledVector(side, Math.cos(a) * rr)
          .addScaledVector(at.tangent, Math.sin(a) * rr * (kind === 'scar' ? 1.65 : 0.85))
          .addScaledVector(radial, lift);
        const nn = kind === 'knot'
          ? radial.clone().multiplyScalar(0.75).addScaledVector(side, Math.cos(a) * 0.25).normalize()
          : radial.clone();
        ring.push(g.vertex(
          p.x, p.y, p.z, nn.x, nn.y, nn.z,
          k / SEGS, s, (rng.float() - 0.5) * 0.25, 0.02, rng.float() * Math.PI * 2,
          kind === 'scar' ? 0.22 : 0.62,
        ));
      }
      rings.push(ring);
    }
    for (let ri = 0; ri < RINGS; ri++) {
      const a = rings[ri] as number[];
      const b2 = rings[ri + 1] as number[];
      for (let k = 0; k < SEGS; k++) g.quad(a[k] as number, a[k + 1] as number, b2[k + 1] as number, b2[k] as number);
    }
  };

  for (let i = 0; i < profile.knots; i++) {
    const t = 0.08 + rng.float() * 0.7;
    const at = pointOnBranch(trunk, t);
    disc('knot', t, rng.float() * Math.PI * 2, at.radius * (0.22 + rng.float() * 0.22));
  }
  for (let i = 0; i < profile.scars; i++) {
    const t = 0.06 + rng.float() * 0.48;
    const at = pointOnBranch(trunk, t);
    disc('scar', t, rng.float() * Math.PI * 2, at.radius * (0.18 + rng.float() * 0.16));
  }

  // Peeling strips are lifted, tapered ribbons following the trunk tangent.
  for (let i = 0; i < profile.peelStrips; i++) {
    const t = 0.04 + rng.float() * 0.55;
    const at = pointOnBranch(trunk, t);
    const angle = rng.float() * Math.PI * 2;
    const ref = Math.abs(at.tangent.y) < 0.94 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const n = new Vector3().crossVectors(ref, at.tangent).normalize();
    const b = new Vector3().crossVectors(at.tangent, n).normalize();
    const radial = n.multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle)).normalize();
    const side = new Vector3().crossVectors(at.tangent, radial).normalize();
    const length = at.radius * (0.8 + rng.float() * 1.8);
    const width = at.radius * (0.05 + rng.float() * 0.08);
    const rows: number[][] = [];
    for (let j = 0; j <= 4; j++) {
      const s = j / 4;
      const lift = Math.sin(s * Math.PI) * width * 0.55 + 0.004;
      const center = at.p.clone().addScaledVector(at.tangent, (s - 0.5) * length).addScaledVector(radial, at.radius * 1.08 + lift);
      rows.push([-1, 1].map((sideK, k) => {
        const p = center.clone().addScaledVector(side, sideK * width * (1 - s * 0.42));
        return g.vertex(p.x, p.y, p.z, radial.x, radial.y, radial.z, k, s, 0.08, 0.02, angle, 0.48);
      }));
    }
    for (let j = 0; j < 4; j++) {
      const a = rows[j] as number[];
      const b2 = rows[j + 1] as number[];
      g.quad(a[0] as number, b2[0] as number, b2[1] as number, a[1] as number);
    }
  }
}

/** Append a radial set of curved, surface-resolved roots around the trunk. */
export function heroRoots(
  g: MeshGrower,
  skel: Skeleton,
  rng: Rng,
  roots: HeroRootProfile,
  surface: HeroBarkGeometryProfile,
  uRepeats: number,
): void {
  const trunk = skel.branches.find((b) => b.level === 0);
  if (!trunk || roots.count <= 0) return;
  const origin = (trunk.pts[0] as Vector3).clone();
  const baseR = trunk.radii[0] as number;
  for (let i = 0; i < roots.count; i++) {
    const a = (i / roots.count) * Math.PI * 2 + (rng.float() - 0.5) * 0.35;
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new Vector3(-dir.z, 0, dir.x);
    const len = roots.length[0] + rng.float() * (roots.length[1] - roots.length[0]);
    const pts: Vector3[] = [];
    const radii: number[] = [];
    const dirs: Vector3[] = [];
    const N = 6;
    for (let j = 0; j < N; j++) {
      const t = j / (N - 1);
      pts.push(origin.clone()
        .addScaledVector(dir, len * t)
        .addScaledVector(side, Math.sin(t * Math.PI * 1.4 + a) * len * 0.08 * t)
        .add(new Vector3(0, roots.rise * (1 - t) - t * t * 0.16, 0)));
      radii.push(Math.max(0.018, baseR * roots.radiusScale * Math.pow(1 - t, 1.35)));
    }
    for (let j = 0; j < N; j++) {
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(N - 1, j + 1);
      dirs.push(new Vector3().subVectors(pts[j1] as Vector3, pts[j0] as Vector3).normalize());
    }
    const br: SkelBranch = { level: 0, pts, radii, dirs, len, tParent: 0, broken: false };
    tubeForBranch(g, br, {
      ringSegs: 14,
      uRepeats,
      vScale: 1,
      swayPhase: rng.float() * Math.PI * 2,
      swayFlexBase: 0,
      swayFlexTip: 0,
      hue: rng.float() * 0.3 - 0.15,
      surface: { ...surface, ellipticity: surface.ellipticity * 0.4, twist: 0 },
    }, rng);
  }
}
