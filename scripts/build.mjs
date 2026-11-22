import { cp, copyFile, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.resolve(root, 'dist');
const previousBuild = await lstat(dist).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (previousBuild && !previousBuild.isDirectory()) throw new Error('dist must be a real directory.');
await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'site'), dist, { recursive: true });

const vendors = [
  ['three/build/three.module.js', 'three/build/three.module.js'],
  ['three/build/three.core.js', 'three/build/three.core.js'],
  ['three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/loaders/GLTFLoader.js'],
  ['three/examples/jsm/utils/BufferGeometryUtils.js', 'three/examples/jsm/utils/BufferGeometryUtils.js'],
  ['three/examples/jsm/utils/SkeletonUtils.js', 'three/examples/jsm/utils/SkeletonUtils.js'],
  ['three/LICENSE', 'three/LICENSE'],
  ['@dimforge/rapier3d-compat/LICENSE', '@dimforge/rapier3d-compat/LICENSE'],
];

async function writeOutput(relative, contents) {
  const filename = path.join(dist, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, contents);
}

async function copyVendor([from, to]) {
  const filename = path.join(dist, 'vendor', to);
  await mkdir(path.dirname(filename), { recursive: true });
  await copyFile(path.join(root, 'node_modules', from), filename);
}

function sharePage(html, id) {
  // Match the iframe's asset base while leaving in-page chapter links at the share URL.
  const caseDirectory = `design/${id}-case/v0.7`;
  const rebased = html.replace(/<(?:link|script|img|video|a)\b[^>]*>/gi, tag =>
    tag.replace(/\s(href|src|poster)="([^"]+)"/gi, (attribute, name, reference) => {
      if (/^(?:#|\/|[a-z][a-z\d+.-]*:)/i.test(reference)) return attribute;
      return ` ${name}="../../${path.posix.normalize(`${caseDirectory}/${reference}`)}"`;
    }));
  const style = '<link rel="stylesheet" href="../../design/studio-desktop/computer-route-preview/share-preview.css">';
  const enter = '<a class="share-studio" href="../../?enter=1" data-en="Enter studio →">进入工作室 →</a>';
  const pause = "<script>addEventListener('pagehide', () => document.querySelector('video')?.pause());</script>";
  return rebased
    .replace('</head>', `  ${style}\n</head>`)
    .replace(/<div class="(?:languages|language-switch)"[^>]*>[\s\S]*?<\/div>/,
      group => `<div class="share-actions">${group}${enter}</div>`)
    .replace('</body>', `${pause}\n</body>`);
}

async function buildCase(id) {
  const html = await readFile(path.join(root, 'content', `${id}.html`), 'utf8');
  await Promise.all([
    writeOutput(`works/${id}/index.html`, sharePage(html, id)),
    writeOutput(`design/studio-desktop/${id}-window-preview/case-source.js`,
      `window.${id}CaseSource = ${JSON.stringify(html)};\n`),
  ]);
}

await Promise.all([...vendors.map(copyVendor), buildCase('yingyu'), buildCase('bounce')]);
// Small, content-addressed gzip pieces avoid one large module transfer stalling entry.
const { gzipSync: packGzip } = await import('node:zlib');
const { createHash } = await import('node:crypto');
async function packedAsset(sourcePath, directory, name) {
  const source = await readFile(path.join(root, sourcePath));
  const packed = packGzip(source);
  const sha256 = createHash('sha256').update(packed).digest('hex');
  const chunks = [];
  for (let start = 0; start < packed.length; start += 65536) {
    const bytes = packed.subarray(start, start + 65536);
    const file = `${name}-${sha256.slice(0, 16)}-${chunks.length}.bin`;
    chunks.push({ file, bytes: bytes.length });
    await writeOutput(`${directory}/${file}`, bytes);
  }
  return {sha256, sourceBytes: source.length, chunks};
}
const physics = await packedAsset('node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs', 'vendor/physics', 'rapier');
await writeOutput('vendor/physics/rapier-manifest.js', `export const rapierAsset = ${JSON.stringify(physics)};\n`);
const models = {
  room: await packedAsset('site/models/studio_interior/v0.6/OvO_Studio_Interior.glb', 'vendor/models', 'room'),
  car: await packedAsset('site/models/track_car/sf26/v0.2/SF-26_Preview.glb', 'vendor/models', 'car'),
};
await writeOutput('vendor/models/model-manifest.js', `export const modelAssets = ${JSON.stringify(models)};\n`);
// Flatten the cold module waterfall without starting the unused scene's assets.
const preload = [
  'design/studio-desktop/three-preview/scene.js',
  'vendor/three/build/three.module.js', 'vendor/three/build/three.core.js',
  'vendor/three/examples/jsm/loaders/GLTFLoader.js',
  'vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
  'vendor/three/examples/jsm/utils/SkeletonUtils.js',
  'vendor/physics/rapier-manifest.js', 'vendor/models/model-manifest.js',
];
const home = await readFile(path.join(dist, 'index.html'), 'utf8');
await writeOutput('index.html', home.replace('</head>', preload.map(file => `<link rel="modulepreload" href="./${file}">`).join('\n')+'\n</head>'));
await writeOutput('.nojekyll','');
await writeOutput('release.json',JSON.stringify({site:'OvO',commit:process.env.GITHUB_SHA??null,builtAt:new Date().toISOString()},null,2));
console.log('Built the portfolio in dist/.');

// Precompressed sidecars keep the static distribution portable (including Pages).
const {readdir}=await import('node:fs/promises');
const {brotliCompressSync,gzipSync,constants}=await import('node:zlib');
async function compress(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const name=path.join(dir,entry.name);if(entry.isDirectory())await compress(name);else if(/\.(?:html|css|js|mjs|svg|glb)$/.test(name)){const data=await readFile(name);await Promise.all([writeFile(name+'.br',brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:5}})),writeFile(name+'.gz',gzipSync(data))]);}}}
await compress(dist);
