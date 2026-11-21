import {readdir,readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
for(const required of ['index.html','404.html','profile/index.html','works/yingyu/index.html','works/bounce/index.html','release.json','vendor/three/LICENSE','vendor/@dimforge/rapier3d-compat/LICENSE'])assert((await stat(path.join(root,required))).isFile(),`Missing ${required}`);
const files=await walk(root);let checked=0;
for(const file of files){const relative=path.relative(root,file).replaceAll('\\','/');assert(!/(?:^|\/)(?:\.env(?:\.|$)|\.git(?:\/|$)|node_modules\/)/.test(relative),`Unexpected private file: ${relative}`);if(!relative.endsWith('.html'))continue;
  const html=await readFile(file,'utf8');
  for(const match of html.matchAll(/\b(?:src|href|poster)="([^"]+)"/g)){
    const reference=match[1];if(/^(?:#|data:|https?:|mailto:|tel:|about:)/.test(reference))continue;
    const url=new URL(reference,'https://release.local/'+relative);
    const local=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    assert(!path.relative(root,local).split(path.sep).includes('..'),`Escaping reference: ${reference}`);
    assert(await stat(local).catch(()=>null),`${relative}: missing ${reference}`);checked++;
  }
}
console.log(JSON.stringify({files:files.length,localReferences:checked,privateBuildFiles:false,release:JSON.parse(await readFile(path.join(root,'release.json'),'utf8'))},null,2));
