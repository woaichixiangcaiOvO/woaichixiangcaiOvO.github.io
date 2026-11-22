export async function fetchPackedAsset(asset, assetBase, { fetchImpl = fetch, signal } = {}) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new Error('Asset load timed out')), 24000);
  const cancel = () => controller.abort(signal.reason);
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const chunks = new Array(asset.chunks.length);
  let next = 0;
  async function download(index) {
    const part = asset.chunks[index];
    for (let attempt = 0; attempt < 2; attempt++) {
      const timeout = new AbortController();
      const abort = () => timeout.abort(controller.signal.reason);
      controller.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => timeout.abort(new Error('Asset download timed out')), 8000);
      try {
        controller.signal.throwIfAborted();
        const response = await fetchImpl(new URL(part.file, assetBase), { signal: timeout.signal });
        if (!response.ok) throw new Error(`Asset download HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length !== part.bytes) throw new Error('Incomplete asset download');
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
    if (digest !== asset.sha256) throw new Error('Asset download checksum mismatch');
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).arrayBuffer();
    if (source.byteLength !== asset.sourceBytes) throw new Error('Invalid asset module size');
    return source;
  } finally {
    clearTimeout(deadline);
    controller.abort();
    signal?.removeEventListener('abort', cancel);
  }
}
