import { rapierAsset } from '../../../vendor/physics/rapier-manifest.js';

const assetBase = new URL('../../../vendor/physics/', import.meta.url);
let ready;

export async function fetchRapierSource({ fetchImpl = fetch, signal } = {}) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new Error('Physics load timed out')), 24000);
  const cancel = () => controller.abort(signal.reason);
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const chunks = new Array(rapierAsset.chunks.length);
  let next = 0;
  async function download(index) {
    const part = rapierAsset.chunks[index];
    for (let attempt = 0; attempt < 2; attempt++) {
      const timeout = new AbortController();
      const abort = () => timeout.abort(controller.signal.reason);
      controller.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => timeout.abort(new Error('Physics download timed out')), 8000);
      try {
        controller.signal.throwIfAborted();
        const response = await fetchImpl(new URL(part.file, assetBase), { signal: timeout.signal });
        if (!response.ok) throw new Error(`Physics download HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length !== part.bytes) throw new Error('Incomplete physics download');
        chunks[index] = bytes;
        return;
      } catch (error) {
        if (attempt === 1 || controller.signal.aborted) throw error;
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', abort);
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < chunks.length) await download(next++);
    }));
    const packed = new Uint8Array(chunks.reduce((sum, bytes) => sum + bytes.length, 0));
    let offset = 0;
    for (const bytes of chunks) { packed.set(bytes, offset); offset += bytes.length; }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', packed)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== rapierAsset.sha256) throw new Error('Physics download checksum mismatch');
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).arrayBuffer();
    if (source.byteLength !== rapierAsset.sourceBytes) throw new Error('Invalid physics module size');
    return source;
  } finally {
    clearTimeout(deadline);
    controller.abort();
    signal?.removeEventListener('abort', cancel);
  }
}

export function loadRapier() {
  ready ??= (async () => {
    const source = await fetchRapierSource();
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const { default: rapier } = await import(url);
      await rapier.init();
      return rapier;
    } finally {
      URL.revokeObjectURL(url);
    }
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
