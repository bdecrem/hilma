#!/usr/bin/env -S npx tsx
/*
 * The Macinclaude diagnostic sink.
 *
 *   tsx src/main.ts --listen 2331 [--logdir DIR]
 *
 * The Plus's apps stream "Name: event" lines here (net/applog.inc). Every line
 * is timestamped and appended to a per-session file AND the combined all.log,
 * so I (Claude, on the mini) read the Plus's logs live — no SD-card round-trip.
 *
 * v2 (2026-07-02) — liveness, matching applog.inc v2:
 *   - TCP keepalive on every connection (dead links get reaped, not wedged).
 *   - "Name: ~hb" heartbeats (sent by idle apps every 60 s) are swallowed:
 *     they go to the session file for forensics but NOT to all.log.
 *   - Liveness is derived per app: no heartbeat for ~3 min while the link is
 *     up -> "(went silent)" event; a line after that -> "(heartbeat resumed)";
 *     connection drop -> "(link closed)". So all.log distinguishes idle
 *     (heartbeats flowing, no events) from frozen/gone (silence events).
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

const HB_SILENT_MS = parseInt(process.env.DIAG_SILENT_MS || '170000', 10);  // ~3 missed 60 s heartbeats -> silent
const SWEEP_MS = parseInt(process.env.DIAG_SWEEP_MS || '15000', 10);

function stamp(): string {
  // ISO without the timezone Z, millisecond precision
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

// one line -> stderr + all.log (the joint feed I pull from)
function emit(raw: string): string {
  const line = `${stamp()}  ${raw}`;
  process.stderr.write(line + '\n');
  appendFileSync(allLog, line + '\n');
  return line;
}

// per-app liveness, fed by every line (heartbeats included)
type Live = { last: number; state: 'alive' | 'silent' | 'closed' };
const apps = new Map<string, Live>();

function seen(app: string): void {
  const a = apps.get(app);
  if (a?.state === 'silent') emit(`${app}: (heartbeat resumed)`);
  apps.set(app, { last: Date.now(), state: 'alive' });
}

setInterval(() => {
  const now = Date.now();
  for (const [app, a] of apps) {
    if (a.state === 'alive' && now - a.last > HB_SILENT_MS) {
      a.state = 'silent';
      emit(`${app}: (went silent - no heartbeat for ~3 min; idle apps still heartbeat, so it is frozen, offline, or pre-v2)`);
    }
  }
}, SWEEP_MS).unref?.();

let sessionSeq = 0;

const server = net.createServer((sock) => {
  const id = ++sessionSeq;
  const file = join(logdir, `diag-session-${String(id).padStart(3, '0')}.log`);
  const head = `\n===== diag session ${id} from ${sock.remoteAddress} @ ${stamp()} =====`;
  process.stderr.write(head + '\n');
  appendFileSync(file, head + '\n');

  let appName = '';                          // learned from the first "Name: ..." line
  let buf = '';
  sock.setNoDelay(true);
  sock.setKeepAlive(true, 10_000);           // reap dead links instead of wedging
  sock.on('data', (d) => {
    buf += d.toString('latin1');
    let nl: number;
    while ((nl = buf.search(/[\r\n]/)) >= 0) {
      const raw = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!raw) continue;
      const m = raw.match(/^([^:]{1,40}): (.*)$/);
      if (m) { appName = m[1]; seen(appName); }
      if (m && m[2] === '~hb') {
        appendFileSync(file, `${stamp()}  ${raw}\n`);   // session file only
        continue;
      }
      appendFileSync(file, emit(raw) + '\n');
    }
  });
  sock.on('close', () => {
    const tail = `===== diag session ${id} ended @ ${stamp()} =====`;
    process.stderr.write(tail + '\n');
    appendFileSync(file, tail + '\n');
    if (appName) {
      const a = apps.get(appName);
      if (a && a.state !== 'closed') { a.state = 'closed'; emit(`${appName}: (link closed)`); }
    }
  });
  sock.on('error', () => {});
});

server.listen(port, () => {
  process.stderr.write(`[diag-sink] listening on :${port}, logs -> ${logdir}/\n`);
});
