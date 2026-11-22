import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadModelBytes, loadPackedModel } from '../dist/design/studio-desktop/three-preview/model-loader.js';
import { modelAssets } from '../dist/vendor/models/model-manifest.js';
import { fetchPackedAsset } from '../dist/design/studio-desktop/three-preview/packed-asset.js';

const originalFetch = globalThis.fetch;
let count = 0, fail = true, active = 0, peakParallel = 0;
globalThis.fetch = async (url, { signal } = {}) => {
  signal?.throwIfAborted(); count++;
  if (fail) return new Response('', { status: 503 });
  active++; peakParallel = Math.max(peakParallel, active);
  try { await new Promise(resolve => setTimeout(resolve, 3)); return new Response(await readFile(url)); }
  finally { active--; }
};
try {
  await assert.rejects(loadModelBytes('room'), /HTTP 503/);
  fail = false; count = 0;
  const first = loadModelBytes('room'), second = loadModelBytes('room');
  assert.equal(first, second, 'Concurrent users must share one download');
  const [room] = await Promise.all([first, loadModelBytes('car'), loadModelBytes('wallpaper')]);
  assert.equal(count, ['room','car','wallpaper'].reduce((sum,id)=>sum+modelAssets[id].chunks.length,0));
  assert(peakParallel <= 6 && peakParallel > 4, 'Different assets must share the six-slot limit');
  const originals = { room: 'studio_interior/v0.6/OvO_Studio_Interior.glb', car: 'track_car/sf26/v0.2/SF-26_Preview.glb' };
  const results = [];
  for (const [id, file] of Object.entries(originals)) {
    const data = await loadModelBytes(id);
    const original = await readFile(new URL('../site/models/'+file, import.meta.url));
    assert(Buffer.from(data).equals(original), `Changed model bytes: ${id}`);
    assert.equal(original.readUInt32LE(0), 0x46546c67);
    const json = JSON.parse(original.subarray(20, 20 + original.readUInt32LE(12)).toString());
    assert(!json.buffers.some(buffer => buffer.uri), 'Packed GLBs must remain self-contained');
    const url = new URL('https://models.test/'+file);
    let parsed = false;
    await loadPackedModel({ parseAsync(bytes, base) { assert(Buffer.from(bytes).equals(original)); assert.equal(base, new URL('.', url).href); parsed = true; } }, id, url);
    assert(parsed);
    results.push({ id, sourceBytes:data.byteLength, packedBytes:modelAssets[id].chunks.reduce((sum,p)=>sum+p.bytes,0), chunks:modelAssets[id].chunks.length, meshes:json.meshes.length, exactMatch:true });
  }
  const wallpaper = await loadModelBytes('wallpaper');
  assert(Buffer.from(wallpaper).equals(await readFile(new URL('../site/design/studio-desktop/v0.1/wallpaper.png', import.meta.url))));
  results.push({id:'wallpaper',sourceBytes:wallpaper.byteLength,packedBytes:modelAssets.wallpaper.chunks.reduce((sum,p)=>sum+p.bytes,0),chunks:modelAssets.wallpaper.chunks.length,exactMatch:true});
  const base = new URL('../dist/vendor/models/', import.meta.url);
  const signal = AbortSignal.timeout(20);
  const cancelled = await Promise.allSettled(['room','car','wallpaper'].map(id => fetchPackedAsset(modelAssets[id], base, {
    signal, fetchImpl: async (url, {signal}) => new Promise((resolve,reject) => signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),
  })));
  assert(cancelled.every(result=>result.status==='rejected'), 'Active and queued requests must both cancel');
  await fetchPackedAsset(modelAssets.car, base);
  console.log(JSON.stringify({ recovery:true, sharedDownloads:true, queueCancellation:true, peakParallel, models:results }, null, 2));
} finally { globalThis.fetch = originalFetch; }
