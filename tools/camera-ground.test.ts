import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAMERA_NEAR,
  FLY_GROUND_CLEAR,
  TERRAIN_MICRO_RISE_BUDGET,
  terrainNearPlaneHeadroom,
} from '../src/core/CameraTuning';

test('low camera keeps its near plane above terrain micro relief', () => {
  assert.ok(CAMERA_NEAR <= 0.08, 'near plane is too far away for ground inspection');
  assert.ok(FLY_GROUND_CLEAR > TERRAIN_MICRO_RISE_BUDGET);
  assert.ok(
    terrainNearPlaneHeadroom() >= 0.4,
    'camera clearance no longer covers displacement plus the near plane',
  );
});
