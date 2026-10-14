// Receives PDF bytes POSTed from a page in the user's Chrome and writes ~/Desktop/GAMI/papers/<id>.pdf
// Also holds a work queue for the ScienceDirect pass: POST /queue [{id,pii,url}], GET /next -> {id,pii,url} | {}
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const ROOT = process.env.GAMI_DIR || path.join(os.homedir(), 'Desktop/GAMI');
const PAPERS = path.join(ROOT, 'papers');
const TRIED = path.join(ROOT, 'debug/elsevier-tried.txt');
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Private-Network': 'true' };
let queue = [], current = null;
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (u.pathname === '/queue' && req.method === 'POST') { queue = JSON.parse(body.toString()); res.writeHead(200, cors); return res.end(String(queue.length)); }
    if (u.pathname === '/next') {
      if (current) fs.appendFileSync(TRIED, current.id + '\n');
      current = queue.shift() || null;
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); return res.end(JSON.stringify(current ? { ...current, left: queue.length } : {}));
    }
    if (process.env.GAMI_TOKEN && u.searchParams.get('k') !== process.env.GAMI_TOKEN) { res.writeHead(403, cors); return res.end('no'); }
    const id = u.searchParams.get('id');
    if (req.method !== 'POST' || !/^\d+$/.test(id || '')) { res.writeHead(400, cors); return res.end('bad'); }
    if (!body.subarray(0, 5).toString('latin1').startsWith('%PDF')) { res.writeHead(422, cors); return res.end('not pdf'); }
    fs.writeFileSync(path.join(PAPERS, `${id}.pdf`), body); console.log(new Date().toISOString(), id, body.length);
    res.writeHead(200, cors); res.end(String(body.length));
  });
}).listen(4789, '127.0.0.1', () => console.log('receiver on 4789'));
