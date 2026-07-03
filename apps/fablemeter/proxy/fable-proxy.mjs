/*
 * fable-proxy — a transparent logging proxy in front of api.anthropic.com.
 *
 * Point any Anthropic client at it and it forwards every request upstream
 * unchanged, streaming the response straight back, while tapping a copy to
 * pull `model` + `usage` (works for both JSON and SSE/streaming responses).
 * Each call is appended as one JSON line to ~/.fablemeter/usage.jsonl, which
 * the FableMeter menu bar app reads and prices. No API key ever touches this
 * process's storage — it only reads token counts out of the response.
 *
 *   node fable-proxy.mjs            # listens on 127.0.0.1:8787
 *
 * Then in whatever calls the API (a script, the `ant` CLI, Claude Code):
 *   export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
 *
 * Only calls that flow through here are counted — that's the whole design.
 */
import http from 'node:http';
import https from 'node:https';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PORT = parseInt(process.env.FABLE_PROXY_PORT || '8787', 10);
const UPSTREAM = 'api.anthropic.com';
const LOGDIR = join(homedir(), '.fablemeter');
const LOGFILE = join(LOGDIR, 'usage.jsonl');
mkdirSync(LOGDIR, { recursive: true });

function log(rec) {
  try { appendFileSync(LOGFILE, JSON.stringify(rec) + '\n'); } catch (e) { console.error('[fable-proxy] log write failed:', e.message); }
}

/** Extract model + usage from a full response body (JSON or SSE). */
function tap(buf) {
  const text = buf.toString('utf8');
  const trimmed = text.trimStart();
  let model = null, input = 0, output = 0, cacheCreate = 0, cacheRead = 0;

  if (trimmed.startsWith('{')) {                     // non-streaming JSON
    try {
      const o = JSON.parse(text);
      if (o && o.usage) {
        model = o.model || null;
        input = o.usage.input_tokens || 0;
        output = o.usage.output_tokens || 0;
        cacheCreate = o.usage.cache_creation_input_tokens || 0;
        cacheRead = o.usage.cache_read_input_tokens || 0;
      }
    } catch { /* not a usage-bearing JSON response */ }
  } else {                                            // SSE stream
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let o; try { o = JSON.parse(payload); } catch { continue; }
      if (o.type === 'message_start' && o.message) {
        model = o.message.model || model;
        const u = o.message.usage || {};
        input = u.input_tokens || input;
        cacheCreate = u.cache_creation_input_tokens || cacheCreate;
        cacheRead = u.cache_read_input_tokens || cacheRead;
      } else if (o.type === 'message_delta' && o.usage) {
        output = o.usage.output_tokens || output;    // cumulative; last one wins
      }
    }
  }

  if (!model) return;                                 // not a Messages response — skip
  log({
    ts: Date.now() / 1000,
    model,
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: cacheCreate,
    cache_read_input_tokens: cacheRead,
  });
  console.error(`[fable-proxy] ${model}  in=${input} out=${output} cw=${cacheCreate} cr=${cacheRead}`);
}

const server = http.createServer((req, res) => {
  const reqChunks = [];
  req.on('data', (c) => reqChunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(reqChunks);
    const headers = { ...req.headers };
    delete headers['host'];
    headers['accept-encoding'] = 'identity';          // force uncompressed so the tap can read it
    if (body.length) headers['content-length'] = String(body.length);

    const upstream = https.request(
      { hostname: UPSTREAM, port: 443, path: req.url, method: req.method, headers },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers);
        const respChunks = [];
        up.on('data', (c) => { res.write(c); respChunks.push(c); });  // stream to client in real time
        up.on('end', () => { res.end(); tap(Buffer.concat(respChunks)); });
      }
    );
    upstream.on('error', (e) => {
      console.error('[fable-proxy] upstream error:', e.message);
      if (!res.headersSent) res.writeHead(502);
      res.end('proxy upstream error: ' + e.message);
    });
    if (body.length) upstream.write(body);
    upstream.end();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.error(`[fable-proxy] listening on http://127.0.0.1:${PORT}  ->  https://${UPSTREAM}`);
  console.error(`[fable-proxy] logging usage to ${LOGFILE}`);
  console.error(`[fable-proxy] point clients at it:  export ANTHROPIC_BASE_URL=http://127.0.0.1:${PORT}`);
});
