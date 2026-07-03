#!/usr/bin/env node
/*
 * agent-pixel selftest — spins the real server on an ephemeral port with a
 * temp state file and PIXEL_FAKE_AI=1, then exercises the protocol end to end:
 * full-frame sync, SET persistence across reconnect, broadcast to a second
 * client, and an invited (fake) Claude contribution. No API key needed.
 *
 *   node selftest.mjs
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 12337;
const dir = mkdtempSync(join(tmpdir(), 'pixel-test-'));
const state = join(dir, 'canvas.json');

let failures = 0;
function ok(cond, name) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
}

const srv = spawn(process.execPath, [join(HERE, 'server.mjs'), '--listen', String(PORT)], {
  env: { ...process.env, PIXEL_STATE: state, PIXEL_FAKE_AI: '1', PIXEL_AI_HOURS: '0' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
srv.stderr.on('data', d => process.env.PIXEL_TEST_VERBOSE && process.stderr.write(d));

const sleep = ms => new Promise(r => setTimeout(r, ms));

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, '127.0.0.1', () => resolve(sock));
    sock.on('error', reject);
    sock.lines = [];
    let buf = '';
    sock.on('data', d => {
      buf += d.toString('latin1');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        sock.lines.push(buf.slice(0, i).replace(/\r$/, ''));
        buf = buf.slice(i + 1);
      }
    });
  });
}

async function waitFor(sock, pred, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = sock.lines.find(pred);
    if (hit) return hit;
    await sleep(30);
  }
  return null;
}

try {
  await sleep(600);   // let the server bind

  // 1. full frame on connect
  const a = await connect();
  ok(await waitFor(a, l => l === 'PXEND'), 'frame arrives on connect');
  ok(a.lines[0] === 'PXINFO 64 64', 'PXINFO header');
  ok(a.lines.filter(l => l.startsWith('PXROW ')).length === 64, '64 rows');
  ok(a.lines.every(l => !l.startsWith('PXROW') || /^PXROW \d+ [0-9a-f]{16}$/.test(l)), 'rows are 16 hex chars');
  ok(await waitFor(a, l => l.startsWith('PXNOTE ')), 'note after frame');

  // 2. SET + broadcast to a second client (not echoed to sender)
  const b = await connect();
  await waitFor(b, l => l === 'PXEND');
  a.lines = []; b.lines = [];
  a.write('SET 3 5 1\r');
  ok(await waitFor(b, l => l === 'PX 3 5 1'), 'SET broadcast to other client');
  await sleep(200);
  ok(!a.lines.includes('PX 3 5 1'), 'SET not echoed to sender');

  // 3. bad SET rejected
  a.lines = [];
  a.write('SET 99 5 1\r');
  ok(await waitFor(a, l => l.startsWith('PXERR')), 'bad SET -> PXERR');

  // 4. persistence across reconnect
  a.destroy();
  const c = await connect();
  await waitFor(c, l => l === 'PXEND');
  const row5 = c.lines.find(l => l.startsWith('PXROW 5 '));
  // x=3 -> byte 0, bit 4 (0x10)
  ok(row5 && row5.split(' ')[2].startsWith('10'), 'pixel persisted across reconnect');

  // 5. invited (fake) Claude contribution: strokes broadcast + note
  b.lines = []; c.lines = [];
  c.write('CLAUDE\r');
  ok(await waitFor(b, l => /^PX \d+ \d+ 1$/.test(l), 8000), 'claude strokes broadcast');
  ok(await waitFor(b, l => l.startsWith('PXNOTE fake claude'), 8000), 'claude note broadcast');

  // 6. SYNC resends the frame
  b.lines = [];
  b.write('SYNC\r');
  ok(await waitFor(b, l => l === 'PXEND'), 'SYNC resends frame');

  b.destroy(); c.destroy();
} catch (e) {
  console.error(`selftest crashed: ${e.message}`);
  failures++;
} finally {
  srv.kill();
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall tests passed');
process.exit(failures ? 1 : 0);
