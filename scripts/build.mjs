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
  ['@dimforge/rapier3d-compat/dist/rapier.mjs', '@dimforge/rapier3d-compat/dist/rapier.mjs'],
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
await writeOutput('.nojekyll','');
await writeOutput('release.json',JSON.stringify({site:'OvO',commit:process.env.GITHUB_SHA??null,builtAt:new Date().toISOString()},null,2));
console.log('Built the portfolio in dist/.');

// Precompressed sidecars keep the static distribution portable (including Pages).
const {readdir}=await import('node:fs/promises');
const {brotliCompressSync,gzipSync,constants}=await import('node:zlib');
async function compress(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const name=path.join(dir,entry.name);if(entry.isDirectory())await compress(name);else if(/\.(?:html|css|js|mjs|svg|glb)$/.test(name)){const data=await readFile(name);await Promise.all([writeFile(name+'.br',brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:5}})),writeFile(name+'.gz',gzipSync(data))]);}}}
await compress(dist);
