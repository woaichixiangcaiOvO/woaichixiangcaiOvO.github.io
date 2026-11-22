import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchRapierSource, loadRapier } from '../dist/design/studio-desktop/three-preview/physics-loader.js';
import { rapierAsset } from '../dist/vendor/physics/rapier-manifest.js';

const originalFetch = globalThis.fetch;
const originalCreateURL = URL.createObjectURL;
const originalRevokeURL = URL.revokeObjectURL;
const calls = new Map();
let active = 0, peak = 0;
async function fileFetch(url, { signal } = {}) {
  signal?.throwIfAborted();
  calls.set(String(url), (calls.get(String(url)) ?? 0) + 1);
  active++; peak = Math.max(peak, active);
  try { return new Response(await readFile(url)); }
  finally { active--; }
}
try {
  let failOnce = true;
  const source = await fetchRapierSource({ fetchImpl: async (url, options) => {
    if (failOnce) { failOnce = false; calls.set('retry', 1); return new Response('', { status: 503 }); }
    return fileFetch(url, options);
  }});
  assert(Buffer.from(source).equals(await readFile(new URL('../node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs', import.meta.url))));
  assert.equal(calls.get('retry'), 1);
  assert.equal(calls.size, rapierAsset.chunks.length + 1);
  assert(peak <= 4);
  let stalled = false, timedOut = false;
  await fetchRapierSource({ fetchImpl: async (url, options) => {
    if (!stalled) {
      stalled = true;
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => {
        timedOut = true;
        reject(options.signal.reason);
      }, { once: true }));
    }
    return fileFetch(url, options);
  }});
  assert(timedOut, 'A stalled request must time out and retry');
  await assert.rejects(fetchRapierSource({ fetchImpl: async (url, options) => {
    const response = await fileFetch(url, options);
    const bytes = new Uint8Array(await response.arrayBuffer()); bytes[0] ^= 1;
    return new Response(bytes);
  }}), /checksum/);
  let failures = 0;
  await assert.rejects(fetchRapierSource({ fetchImpl: async () => { failures++; return new Response('', { status: 503 }); } }), /HTTP 503/);
  assert(failures <= 8, 'A failed batch must not retry indefinitely');
  await assert.rejects(fetchRapierSource({ signal: AbortSignal.abort(), fetchImpl: fileFetch }), /abort/i);
  await assert.rejects(fetchRapierSource({ fetchImpl: async () => new Response(new Uint8Array(1)) }), /Incomplete/);
  await assert.rejects(fetchRapierSource({ signal: AbortSignal.timeout(20), fetchImpl: async (url, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  }), /abort|timeout/i);

  globalThis.fetch = async () => new Response('', { status: 503 });
  await assert.rejects(loadRapier(), /HTTP 503/);
  calls.clear();
  globalThis.fetch = fileFetch;
  // Node cannot import blob: modules. A data: URL runs the exact verified bytes instead.
  URL.createObjectURL = blob => {
    assert.equal(blob.size, source.byteLength);
    return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  };
  let revoked = 0;
  URL.revokeObjectURL = () => { revoked++; };
  const [rapier, second] = await Promise.all([loadRapier(), loadRapier()]);
  assert.equal(rapier, second);
  assert.equal(revoked, 1);
  assert.equal([...calls.values()].reduce((sum, count) => sum + count, 0), rapierAsset.chunks.length);
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(rapier.ColliderDesc.cuboid(10, .1, 10));
  const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(0, 2, 0));
  world.createCollider(rapier.ColliderDesc.ball(.2), body);
  for (let n = 0; n < 240; n++) world.step();
  const height = body.translation().y;
  assert(height > .25 && height < .35, `Unexpected resting height: ${height}`);
  world.free();
  console.log(JSON.stringify({ chunks: rapierAsset.chunks.length, bytes: rapierAsset.chunks.reduce((sum, part) => sum + part.bytes, 0), sourceBytes: source.byteLength, peakParallel: peak, recovery: true, timeoutRecovery: timedOut, checksum: true, cancellation: true, truncatedResponse: true, sharedInit: true, restingHeight: height }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateURL;
  URL.revokeObjectURL = originalRevokeURL;
}
