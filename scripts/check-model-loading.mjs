import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadModelBytes, loadPackedModel } from '../dist/design/studio-desktop/three-preview/model-loader.js';
import { modelAssets } from '../dist/vendor/models/model-manifest.js';

const originalFetch = globalThis.fetch;
let count = 0, fail = true;
globalThis.fetch = async (url, { signal } = {}) => {
  signal?.throwIfAborted(); count++;
  if (fail) return new Response('', { status: 503 });
  return new Response(await readFile(url));
};
try {
  await assert.rejects(loadModelBytes('room'), /HTTP 503/);
  fail = false; count = 0;
  const first = loadModelBytes('room'), second = loadModelBytes('room');
  assert.equal(first, second, 'Concurrent users must share one download');
  const room = await first;
  assert.equal(count, modelAssets.room.chunks.length);
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
  console.log(JSON.stringify({ recovery:true, sharedDownloads:true, models:results }, null, 2));
} finally { globalThis.fetch = originalFetch; }
