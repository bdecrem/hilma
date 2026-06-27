#!/usr/bin/env -S npx tsx
/*
 * The Macinclaude diagnostic sink.
 *
 *   tsx src/main.ts --listen 2331 [--logdir DIR]
 *
 * The Plus's diagnostic logger streams lines here over the serial/WiFi link.
 * Every line is timestamped and appended to a dated file AND echoed to stdout,
 * so I (Claude, on the mini) read the Plus's logs live — no SD-card round-trip.
 * Each connection is a "session"; a banner marks where it starts.
 *
 * The Plus sends plain newline-terminated text; whatever shape the diag.inc
 * logger emits ("TAG  message  n=123") is preserved verbatim.
 */

import net from 'node:net';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const port = parseInt(arg('--listen', '2331'), 10) || 2331;
// persistent shared logs folder (survives reboot); every Plus app appends here.
const logdir = arg('--logdir', join(homedir(), 'macplus-logs'));
mkdirSync(logdir, { recursive: true });
const allLog = join(logdir, 'all.log');     // combined, timestamped, one line per event

function stamp(): string {
  // ISO without the timezone Z, millisecond precision
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

let sessionSeq = 0;

const server = net.createServer((sock) => {
  const id = ++sessionSeq;
  const file = join(logdir, `diag-session-${String(id).padStart(3, '0')}.log`);
  const head = `\n===== diag session ${id} from ${sock.remoteAddress} @ ${stamp()} =====`;
  process.stderr.write(head + '\n');
  appendFileSync(file, head + '\n');

  let buf = '';
  sock.setNoDelay(true);
  sock.on('data', (d) => {
    buf += d.toString('latin1');
    let nl: number;
    while ((nl = buf.search(/[\r\n]/)) >= 0) {
      const raw = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!raw) continue;
      const line = `${stamp()}  ${raw}`;
      process.stderr.write(line + '\n');
      appendFileSync(file, line + '\n');
      appendFileSync(allLog, line + '\n');   // the joint feed I pull from
    }
  });
  sock.on('close', () => {
    const tail = `===== diag session ${id} ended @ ${stamp()} =====`;
    process.stderr.write(tail + '\n');
    appendFileSync(file, tail + '\n');
  });
  sock.on('error', () => {});
});

server.listen(port, () => {
  process.stderr.write(`[diag-sink] listening on :${port}, logs -> ${logdir}/\n`);
});
