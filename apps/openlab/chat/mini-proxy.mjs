// Runs on the Mac mini. A thin bearer-token gate in front of Ollama so the
// tunnel (openlab-mini.tunn3l.sh) does not expose the model to the world.
// Reads OPENLAB_MINI_TOKEN from ~/.openlab.env. Listens on 11440, forwards
// to Ollama on 11434, streams the body through untouched.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const env = Object.fromEntries(
  readFileSync(`${homedir()}/.openlab.env`, 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const TOKEN = env.OPENLAB_MINI_TOKEN;
if (!TOKEN) throw new Error('OPENLAB_MINI_TOKEN missing from ~/.openlab.env');
const PORT = 11440;
const OLLAMA = { host: '127.0.0.1', port: 11434 };

http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end('unauthorized'); }
  if (!req.url.startsWith('/api/')) { res.writeHead(404); return res.end('not found'); }
  const up = http.request({ ...OLLAMA, path: req.url, method: req.method, headers: { 'content-type': req.headers['content-type'] || 'application/json' } }, (ur) => {
    res.writeHead(ur.statusCode, { 'content-type': ur.headers['content-type'] || 'application/json' });
    ur.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end(`ollama unreachable: ${e.message}`); });
  req.pipe(up);
}).listen(PORT, '127.0.0.1', () => console.log(`openlab proxy on ${PORT} → ollama ${OLLAMA.port}`));
