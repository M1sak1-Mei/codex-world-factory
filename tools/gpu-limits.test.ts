import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRequiredLimits,
  WORLD_MIN_SAMPLED_TEXTURES,
  WORLD_REQUESTED_SAMPLED_TEXTURES,
  WORLD_MIN_STORAGE_BUFFERS,
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

test('startup diagnoses insufficient tree-culling storage bindings before generation', () => {
  const d = diagnostics(32);
  d.limits.maxStorageBuffersPerShaderStage = WORLD_MIN_STORAGE_BUFFERS;
  assert.deepEqual(worldGpuLimitFailures(d), []);
  d.limits.maxStorageBuffersPerShaderStage = WORLD_MIN_STORAGE_BUFFERS - 1;
  assert.match(worldGpuLimitFailures(d)[0] ?? '', /maxStorageBuffersPerShaderStage/);
  delete d.limits.maxStorageBuffersPerShaderStage;
  assert.match(worldGpuLimitFailures(d)[0] ?? '', /unreported/);
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
