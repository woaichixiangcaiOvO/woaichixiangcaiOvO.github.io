import { modelAssets } from '../../../vendor/models/model-manifest.js';
import { fetchPackedAsset } from './packed-asset.js';

const assetBase = new URL('../../../vendor/models/', import.meta.url);
const requests = new Map();

export function loadModelBytes(id) {
  if (!modelAssets[id]) throw new Error(`Unknown model: ${id}`);
  if (!requests.has(id)) {
    const pending = fetchPackedAsset(modelAssets[id], assetBase).catch(error => {
      requests.delete(id);
      throw error;
    });
    requests.set(id, pending);
  }
  return requests.get(id);
}

export async function loadPackedModel(loader, id, originalUrl) {
  const bytes = await loadModelBytes(id);
  return loader.parseAsync(bytes, new URL('.', originalUrl).href);
}
