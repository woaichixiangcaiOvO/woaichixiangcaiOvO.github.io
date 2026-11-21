import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] ?? 4320);
const origin = `http://127.0.0.1:${port}`;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.glb': 'model/gltf-binary',
};

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return start <= end && start < size ? { start, end } : null;
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const url = new URL(request.url, origin);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\\') || /[:\u0000-\u001f]/.test(pathname)) {
      response.writeHead(400).end();
      return;
    }
    let filename = path.resolve(root, `.${pathname}`);
    const relative = path.relative(root, filename);
    if (path.isAbsolute(relative) || relative.split(path.sep)[0] === '..') {
      response.writeHead(404).end();
      return;
    }
    let file = await stat(filename);
    if (file.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(308, { Location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      filename = path.join(filename, 'index.html');
      file = await stat(filename);
    }
    if (!file.isFile()) {
      response.writeHead(404).end();
      return;
    }
    const type = types[path.extname(filename)] ?? 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Content-Length': file.size, Vary:'Accept-Encoding' };
    if(!request.headers.range && /(?:javascript|text\/|svg|gltf)/.test(type)){
      const accepted=request.headers['accept-encoding']??'';
      const extension=/\bbr\b/.test(accepted)?'.br':/\bgzip\b/.test(accepted)?'.gz':null;
      const compressed=extension&&await stat(filename+extension).catch(()=>null);
      if(compressed){filename+=extension;headers['Content-Encoding']=extension==='.br'?'br':'gzip';headers['Content-Length']=compressed.size;}
    }
    let range;
    if (type === 'video/mp4') {
      headers['Accept-Ranges'] = 'bytes';
      if (request.headers.range) {
        range = byteRange(request.headers.range, file.size);
        if (!range) {
          response.writeHead(416, { 'Content-Range': `bytes */${file.size}` }).end();
          return;
        }
        headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.size}`;
        headers['Content-Length'] = range.end - range.start + 1;
      }
    }
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(filename, range);
    stream.on('error', error => response.destroy(error));
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    const status = error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
    if (status === 500) console.error(error);
    if(status===404){const {readFile}=await import('node:fs/promises');const html=await readFile(path.join(root,'404.html'));response.writeHead(404,{'Content-Type':'text/html; charset=utf-8','Content-Length':html.length});response.end(request.method==='HEAD'?undefined:html);}else response.writeHead(status).end();
  }
});

if (!(await stat(path.join(root, 'index.html'))).isFile()) throw new Error('Run npm run build before preview.');
server.listen(port, '127.0.0.1', () => console.log(`Local: ${origin}/`));
