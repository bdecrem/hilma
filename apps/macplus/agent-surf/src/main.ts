#!/usr/bin/env -S npx tsx
/*
 * Macinclaude Surf agent — stdin/stdout line loop, run under socat:
 *
 *   socat TCP-LISTEN:2326,reuseaddr,fork \
 *     EXEC:'npx tsx /path/to/agent-surf/src/main.ts',pty,setsid,ctty,stderr
 *
 * Or interactively for testing: type GO/LINK/BACK/SUM/ASK lines.
 */

// Pick up ANTHROPIC_API_KEY from the hilma repo's .env.local when the
// listener environment doesn't provide it (socat/launchd env is fiddly).
import './main-env.ts';
import { Session } from './session.ts';

/*
 * Paced output: the wire is 9600 baud (~960 B/s) but TCP delivers bursts.
 * The receivers between us and the Plus (the emulator's SCC bridge, the
 * RetroWiFi SI's ESP8266) have small buffers — a 5 KB burst overruns them and
 * drops bytes mid-frame. So we meter writes to wire speed; the link is the
 * bottleneck anyway, this adds no real latency. Override with SURF_BAUD.
 */
const BAUD = Math.max(300, parseInt(process.env.SURF_BAUD || '9600', 10) || 9600);
const TICK_MS = 100;
const BYTES_PER_TICK = Math.max(16, Math.round((BAUD / 10) * (TICK_MS / 1000)));
let outQ = Buffer.alloc(0);
let flushTimer: ReturnType<typeof setInterval> | null = null;

function pacedWrite(s: string): void {
  outQ = Buffer.concat([outQ, Buffer.from(s, 'latin1')]);
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      if (outQ.length === 0) {
        clearInterval(flushTimer!);
        flushTimer = null;
        return;
      }
      const chunk = outQ.subarray(0, BYTES_PER_TICK);
      outQ = outQ.subarray(chunk.length);
      process.stdout.write(chunk);
    }, TICK_MS);
  }
}

const session = new Session(pacedWrite);

console.error(`[surf ${new Date().toISOString()}] session start pid=${process.pid} pace=${BYTES_PER_TICK}B/${TICK_MS}ms`);
session.sendWelcome();

let buf = '';
let busy = false;
const queue: string[] = [];

async function drain(): Promise<void> {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const line = queue.shift()!;
    await session.handle(line);
  }
  busy = false;
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buf += chunk;
  let nl: number;
  while ((nl = buf.search(/[\r\n]/)) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (line.trim()) queue.push(line);
  }
  void drain();
});
process.stdin.on('end', () => process.exit(0));
