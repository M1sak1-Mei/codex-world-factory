export interface SegmentObstacle {
  id: string;
  a: readonly [number, number];
  b: readonly [number, number];
  /** Horizontal capsule radius around the segment. */
  radius: number;
}

export interface HorizontalCollisionResult {
  x: number;
  z: number;
  blocked: boolean;
}

export type HorizontalCollisionProbe = (
  x: number,
  z: number,
  radius: number,
) => HorizontalCollisionResult;

/** Build a small, engine-agnostic 2D capsule solver for walk-mode obstacles. */
export function buildHorizontalCollisionProbe(
  obstacles: readonly SegmentObstacle[],
): HorizontalCollisionProbe {
  return (startX, startZ, radius) => {
    let x = startX;
    let z = startZ;
    let blocked = false;
    // A few projection passes resolve corners where two wall capsules meet.
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const obstacle of obstacles) {
        const ax = obstacle.a[0];
        const az = obstacle.a[1];
        const dx = obstacle.b[0] - ax;
        const dz = obstacle.b[1] - az;
        const lenSq = dx * dx + dz * dz;
        const t = lenSq > 1e-8
          ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lenSq))
          : 0;
        const closestX = ax + dx * t;
        const closestZ = az + dz * t;
        let nx = x - closestX;
        let nz = z - closestZ;
        const distance = Math.hypot(nx, nz);
        const clearance = radius + obstacle.radius;
        if (distance >= clearance) continue;
        if (distance < 1e-6) {
          const length = Math.sqrt(lenSq);
          nx = length > 1e-6 ? -dz / length : 1;
          nz = length > 1e-6 ? dx / length : 0;
        } else {
          nx /= distance;
          nz /= distance;
        }
        x = closestX + nx * clearance;
        z = closestZ + nz * clearance;
        moved = true;
        blocked = true;
      }
      if (!moved) break;
    }
    return { x, z, blocked };
  };
}
