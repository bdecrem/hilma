#!/usr/bin/env -S npx tsx
/*
 * Porthole agent — the mini-side half of the Plus "Porthole" browser.
 *
 * A long-running node:net TCP server (port 2336 by default). The Plus dials in
 * and sends one command per line + \r; we drive a real headless Chromium and
 * stream back the rendered screen as a binary 1-bit frame. One browser/page is
 * shared; commands are serialized (one Plus client at a time).
 *
 *   Up:   GO <url> | CLICK <x> <y> | SCROLL <dy> | KEY <code> | TYPE <text> | BACK
 *   Down: 'F' frame (zlib 1-bit), 'S' status, 'T' title  (see frame.ts)
 *
 * Run standalone:  npx tsx src/main.ts --listen 2336
 */
import net from 'node:net';
import { go, back, click, scroll, typeText, key, shot, title, CW, CH, CRB } from './browser.ts';
import { frameFull, frameRect, msgStatus, msgTitle } from './frame.ts';
import { dirtyRect } from './diff.ts';

function portFromArgs(): number {
  const i = process.argv.indexOf('--listen');
  if (i >= 0 && process.argv[i + 1]) return parseInt(process.argv[i + 1], 10);
  return parseInt(process.env.PORTHOLE_PORT || '2336', 10);
}
const PORT = portFromArgs();
const log = (...a: any[]) => console.error('[porthole]', ...a);

let busy = false;          // global: one browser, one command at a time
let lastPacked: Buffer | null = null;   // previous full framebuffer, for diffing

async function handle(lineRaw: string, send: (b: Buffer) => void): Promise<void> {
  const line = lineRaw.trim();
  if (!line) return;
  const sp = line.indexOf(' ');
  const cmd = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
  const arg = sp < 0 ? '' : line.slice(sp + 1).trim();
  try {
    switch (cmd) {
      case 'GO':     { send(msgStatus('loading ' + arg.slice(0, 60))); lastPacked = null; await go(arg); break; }
      case 'BACK':   { send(msgStatus('back')); await back(); break; }
      case 'CLICK':  { const [x, y] = arg.split(/\s+/).map(Number); await click(x | 0, y | 0); break; }
      case 'SCROLL': { await scroll(parseInt(arg, 10) || 0); break; }
      case 'TYPE':   { await typeText(arg); break; }
      case 'KEY':    { await key(arg || 'Enter'); break; }
      default:       { send(msgStatus('unknown: ' + cmd)); return; }
    }
    send(msgTitle(await title()));        /* page title can change via JS after any action */
    const packed = await shot();
    const d = dirtyRect(lastPacked, packed, CW, CH, CRB);   /* send only what changed */
    if (d.kind === 'full')      send(frameFull(packed, CW, CH, CRB));
    else if (d.kind === 'rect') send(frameRect(d.rect, d.x, d.y, d.w, d.h, d.rb));
    /* d.kind === 'none' -> nothing changed, no frame */
    const px = (d.kind === 'rect') ? ` (${d.w}x${d.h} dirty)` : (d.kind === 'none' ? ' (no change)' : '');
    lastPacked = packed;
    send(msgStatus('ready' + px));
  } catch (e: any) {
    send(msgStatus('error: ' + String(e?.message ?? e).slice(0, 80)));
  }
}

const server = net.createServer((sock) => {
  log('connection from', sock.remoteAddress);
  lastPacked = null;                     /* fresh client -> next frame is full */
  sock.setNoDelay(true);
  let buf = '';
  const queue: string[] = [];
  const send = (b: Buffer) => { try { sock.write(b); } catch {} };

  async function drain(): Promise<void> {
    if (busy) return;
    busy = true;
    try { while (queue.length) await handle(queue.shift()!, send); }
    finally { busy = false; }
  }

  sock.on('data', (d) => {
    buf += d.toString('latin1');
    let nl: number;
    while ((nl = buf.search(/[\r\n]/)) >= 0) {
      const ln = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (ln.trim()) queue.push(ln);
    }
    void drain();
  });
  sock.on('error', (e) => log('sock error', e.message));
  sock.on('close', () => log('connection closed'));
  send(msgStatus('Porthole ready — type a URL'));
});

server.listen(PORT, () => log(`listening on :${PORT}`));
