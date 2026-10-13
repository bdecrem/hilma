// Receives PDF bytes POSTed from a page in the user's Chrome and writes ~/Desktop/GAMI/papers/<id>.pdf
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const PAPERS = path.join(os.homedir(), 'Desktop/GAMI/papers');
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Private-Network': 'true' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const id = new URL(req.url, 'http://x').searchParams.get('id');
  if (req.method !== 'POST' || !/^\d+$/.test(id || '')) { res.writeHead(400, cors); return res.end('bad'); }
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    const buf = Buffer.concat(chunks);
    if (!buf.subarray(0, 5).toString('latin1').startsWith('%PDF')) { res.writeHead(422, cors); return res.end('not pdf'); }
    fs.writeFileSync(path.join(PAPERS, `${id}.pdf`), buf); console.log(new Date().toISOString(), id, buf.length);
    res.writeHead(200, cors); res.end(String(buf.length));
  });
}).listen(4789, '127.0.0.1', () => console.log('receiver on 4789'));
