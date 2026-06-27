#!/usr/bin/env node
/*
 * agent-netspeed — bulk TCP server for the Plus NetSpeed app.
 *
 * Protocol (download test):
 *   client connects  ->  server writes "SIZE <n>\n" then exactly <n> bytes, closes.
 * The Plus times the byte stream and reports throughput.
 *
 * It also accepts an optional first line from the client to pick a direction:
 *   "DOWN <n>\n"  -> server streams <n> bytes (default if the client just waits)
 *   "UP <n>\n"    -> client streams <n> bytes; server counts + replies "OK <n>\n"
 * NetSpeed v1 only uses the default download path, but UP is here for symmetry.
 *
 * Runs as a plain node:net server (no socat), like the other mini agents.
 * Deployed as a launchd LaunchAgent — see ../BACKEND.md.
 */
'use strict';
const net = require('net');

const PORT = parseInt(process.env.NETSPEED_PORT || '2335', 10);
const DEFAULT_BYTES = parseInt(process.env.NETSPEED_BYTES || '262144', 10); // 256 KB
const CHUNK = 4096;

// Pre-build a reusable payload chunk (pattern so it's not all zeros).
const chunk = Buffer.allocUnsafe(CHUNK);
for (let i = 0; i < CHUNK; i++) chunk[i] = 33 + (i % 94); // printable ASCII ramp

function streamBytes(sock, total) {
  sock.write(`SIZE ${total}\n`);
  let sent = 0;
  function pump() {
    while (sent < total) {
      const want = Math.min(CHUNK, total - sent);
      const buf = want === CHUNK ? chunk : chunk.subarray(0, want);
      sent += want;
      // honor backpressure: stop if the kernel buffer is full, resume on drain
      if (!sock.write(buf)) {
        sock.once('drain', pump);
        return;
      }
    }
    sock.end();
  }
  pump();
}

const server = net.createServer((sock) => {
  sock.setNoDelay(true);
  const peer = `${sock.remoteAddress}:${sock.remotePort}`;
  let decided = false;
  let upTarget = 0, upGot = 0;
  let headerBuf = '';

  // If the client says nothing within 400ms, default to a download test.
  const idle = setTimeout(() => {
    if (!decided) {
      decided = true;
      console.log(`[netspeed] ${peer} download ${DEFAULT_BYTES}B (default)`);
      streamBytes(sock, DEFAULT_BYTES);
    }
  }, 400);

  sock.on('data', (d) => {
    if (decided) {
      if (upTarget) {
        upGot += d.length;
        if (upGot >= upTarget) {
          sock.write(`OK ${upGot}\n`);
          sock.end();
        }
      }
      return;
    }
    headerBuf += d.toString('latin1');
    const nl = headerBuf.indexOf('\n');
    if (nl < 0) return;
    clearTimeout(idle);
    decided = true;
    const line = headerBuf.slice(0, nl).trim();
    const m = line.match(/^(DOWN|UP)\s+(\d+)$/i);
    if (m && m[1].toUpperCase() === 'UP') {
      upTarget = parseInt(m[2], 10);
      upGot = Math.max(0, headerBuf.length - (nl + 1)); // bytes already past the header
      console.log(`[netspeed] ${peer} upload ${upTarget}B`);
      if (upGot >= upTarget) { sock.write(`OK ${upGot}\n`); sock.end(); }
    } else {
      const n = m ? parseInt(m[2], 10) : DEFAULT_BYTES;
      console.log(`[netspeed] ${peer} download ${n}B`);
      streamBytes(sock, n);
    }
  });

  sock.on('error', () => {});
  sock.on('close', () => clearTimeout(idle));
});

server.on('error', (e) => { console.error('[netspeed] server error', e); process.exit(1); });
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[netspeed] listening on 0.0.0.0:${PORT}, default ${DEFAULT_BYTES}B`);
});
