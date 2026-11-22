import { fetchPackedAsset } from './packed-asset.js';
import { rapierAsset } from '../../../vendor/physics/rapier-manifest.js';

const assetBase = new URL('../../../vendor/physics/', import.meta.url);
let ready;

export function fetchRapierSource(options) {
  return fetchPackedAsset(rapierAsset, assetBase, options);
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
