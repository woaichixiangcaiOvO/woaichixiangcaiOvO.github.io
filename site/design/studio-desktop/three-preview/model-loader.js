import { modelAssets } from '../../../vendor/models/model-manifest.js';
import { fetchPackedAsset } from './packed-asset.js';

const assetBase = new URL('../../../vendor/models/', import.meta.url);
const requests = new Map();
const imageRequests = new Map();

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

export function loadPackedImage(id) {
  if (!imageRequests.has(id)) {
    const pending = loadModelBytes(id).then(async bytes => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
      } finally { URL.revokeObjectURL(url); }
    }).catch(error => { imageRequests.delete(id); throw error; });
    imageRequests.set(id, pending);
  }
  return imageRequests.get(id);
}
