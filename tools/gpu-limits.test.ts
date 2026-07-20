import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRequiredLimits,
  WORLD_MIN_SAMPLED_TEXTURES,
  WORLD_REQUESTED_SAMPLED_TEXTURES,
  worldGpuLimitFailures,
} from '../src/core/Diagnostics';
import type { GpuDiagnostics } from '../src/core/Hooks';

function diagnostics(maxSampledTexturesPerShaderStage: number): GpuDiagnostics {
  return {
    ok: true,
    features: [],
    limits: {
      maxSampledTexturesPerShaderStage,
      maxStorageBuffersPerShaderStage: 16,
      maxStorageTexturesPerShaderStage: 8,
      maxBufferSize: 1 << 30,
      maxStorageBufferBindingSize: 1 << 30,
    },
  };
}

test('renderer explicitly requests sampled-texture headroom', () => {
  const limits = buildRequiredLimits(diagnostics(48));
  assert.equal(
    limits.maxSampledTexturesPerShaderStage,
    WORLD_REQUESTED_SAMPLED_TEXTURES,
  );
});

test('sampled-texture request is clamped to the adapter limit', () => {
  const limits = buildRequiredLimits(diagnostics(24));
  assert.equal(limits.maxSampledTexturesPerShaderStage, 24);
});

test('startup rejects the WebGPU default that drops the terrain pipeline', () => {
  assert.equal(worldGpuLimitFailures(diagnostics(WORLD_MIN_SAMPLED_TEXTURES)).length, 0);
  assert.match(
    worldGpuLimitFailures(diagnostics(WORLD_MIN_SAMPLED_TEXTURES - 1))[0] ?? '',
    /need 17/,
  );
});
