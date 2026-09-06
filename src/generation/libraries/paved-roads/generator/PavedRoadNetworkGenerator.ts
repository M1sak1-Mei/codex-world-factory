import type { WorldSeed } from '../../../../core/Seed';
import type {
  LandscapeSurfaceLayout,
  SurfacePad,
  SurfacePath,
  SurfacePathKind,
} from '../../../../world/LandscapeSurface';

export interface PavedRoadNetworkOptions {
  worldHalf: number;
  cobbleStrength: number;
  concreteStrength: number;
}

/**
 * Pure, serializable road-network grammar. It only emits surface primitives;
 * terrain classification, vegetation exclusion and rendering consume the
 * result later without the road library depending on Three.js or WebGPU.
 */
export function generatePavedRoadNetwork(
  seed: WorldSeed,
  options: PavedRoadNetworkOptions,
): LandscapeSurfaceLayout {
  const rng = seed.rng('paved-road-network/layout');
  const paths: SurfacePath[] = [];
  const pads: SurfacePad[] = [];
  const radius = Math.min(options.worldHalf * 0.84, 1720);
  const center: [number, number] = [rng.range(-90, 90), rng.range(-90, 90)];
  const rotation = rng.range(-0.34, 0.34);
  const ca = Math.cos(rotation);
  const sa = Math.sin(rotation);

  const worldPoint = (x: number, z: number): [number, number] => [
    center[0] + x * ca - z * sa,
    center[1] + x * sa + z * ca,
  ];
  const strengthFor = (kind: SurfacePathKind): number => Math.min(
    kind === 'cobble' ? options.cobbleStrength : options.concreteStrength,
    1,
  );
  const addPath = (
    id: string,
    kind: SurfacePathKind,
    points: [number, number][],
    width: number,
  ): void => {
    const strength = strengthFor(kind);
    if (strength <= 0) return;
    paths.push({ id, kind, points, width, strength });
  };
  const addPad = (
    id: string,
    localCenter: [number, number],
    halfSize: [number, number],
    localRotation: number,
  ): void => {
    const strength = Math.min(options.concreteStrength, 1);
    if (strength <= 0) return;
    pads.push({
      id,
      kind: 'concrete',
      center: worldPoint(localCenter[0], localCenter[1]),
      halfSize,
      rotation: rotation + localRotation,
      strength,
    });
  };

  // 3.4 km ceremonial boulevard: broad, almost straight, with a restrained
  // crown-line drift so it still reads as authored infrastructure.
  const boulevard: [number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const t = -radius + (i / 8) * radius * 2;
    const side = Math.sin(i * 0.92 + rng.range(-0.12, 0.12)) * 34;
    boulevard.push(worldPoint(t, side));
  }
  addPath('paved/boulevard', 'cobble', boulevard, 22 + rng.range(-2, 3));

  // A concrete cross-axis gives the network a visibly different construction
  // era/material and creates a legible central interchange.
  const crossAxis: [number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const t = -radius * 0.78 + (i / 6) * radius * 1.56;
    crossAxis.push(worldPoint(Math.sin(i * 1.13) * 24, t));
  }
  addPath('paved/cross-axis', 'concrete', crossAxis, 17 + rng.range(-1.5, 2.5));

  // Closed orbital road ties the district together and makes the generated
  // pavement read at aerial scale instead of as a few unrelated splines.
  const ring: [number, number][] = [];
  const ringX = radius * 0.56;
  const ringZ = radius * 0.42;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const ripple = 1 + Math.sin(a * 3 + rng.range(-0.08, 0.08)) * 0.035;
    ring.push(worldPoint(Math.cos(a) * ringX * ripple, Math.sin(a) * ringZ * ripple));
  }
  const ringStart = ring[0];
  if (ringStart) ring.push([...ringStart]);
  addPath('paved/orbital', 'cobble', ring, 12 + rng.range(-1, 2));

  // Four radial connectors divide the interior into buildable districts.
  for (let arm = 0; arm < 4; arm++) {
    const a = arm * Math.PI * 0.5;
    const endX = Math.cos(a) * ringX;
    const endZ = Math.sin(a) * ringZ;
    const bend = arm % 2 === 0 ? rng.range(-48, 48) : rng.range(-36, 36);
    addPath(
      `paved/radial-${arm}`,
      arm % 2 === 0 ? 'concrete' : 'cobble',
      [
        worldPoint(0, 0),
        worldPoint(endX * 0.34 - Math.sin(a) * bend, endZ * 0.34 + Math.cos(a) * bend),
        worldPoint(endX * 0.7, endZ * 0.7),
        worldPoint(endX, endZ),
      ],
      9 + rng.range(-0.5, 2),
    );
  }

  addPad('paved/central-plaza', [0, 0], [92, 72], 0);
  addPad('paved/north-gate', [0, ringZ], [42, 34], 0);
  addPad('paved/south-gate', [0, -ringZ], [42, 34], 0);
  addPad('paved/east-gate', [ringX, 0], [38, 32], Math.PI * 0.5);
  addPad('paved/west-gate', [-ringX, 0], [38, 32], Math.PI * 0.5);
  addPad('paved/depot-a', [radius * 0.66, radius * 0.58], [66, 42], 0.18);
  addPad('paved/depot-b', [-radius * 0.7, -radius * 0.5], [58, 38], -0.22);

  return { paths, pads };
}
