#!/usr/bin/env -S npx tsx
/*
 * The Macinclaude multiplexer.
 *
 *   tsx src/main.ts --listen 2330
 *
 * The Plus's always-on .WIFI driver makes ONE TCP connection here (via the
 * RetroWiFi modem). Every app on the Plus shares it by opening logical
 * channels; this process relays each channel to/from the right backend agent.
 *
 * The Plus connection is the "downlink"; each channel gets its own "uplink"
 * socket to a backend (Code 2324 / Paint 2325 / Surf 2326 / Foundry 2327 /
 * Talking 2329, or a host:port the service name encodes).
 */

import net from 'node:net';
import {
  MuxDecoder, frameData, frameClose, frameErr, FRAME_PING, FRAME_PONG, MAX_CHAN,
} from './protocol.ts';

const SERVICES: Record<string, { host: string; port: number }> = {
  code:    { host: '127.0.0.1', port: 2324 },
  paint:   { host: '127.0.0.1', port: 2325 },
  surf:    { host: '127.0.0.1', port: 2326 },
  foundry: { host: '127.0.0.1', port: 2327 },
  talk:    { host: '127.0.0.1', port: 2329 },
  diag:    { host: '127.0.0.1', port: 2331 },  // diagnostic sink — Plus streams logs here
  quote:   { host: '127.0.0.1', port: 2332 },  // quote of the day
};
// "echo" is handled internally (no backend) — a round-trip test for bring-up.

function log(m: string): void { console.error(`[mux ${new Date().toISOString()}] ${m}`); }

/** Resolve a service token: a known name, or an explicit "host:port". */
function resolve(service: string): { host: string; port: number } | null {
  if (SERVICES[service]) return SERVICES[service];
  const m = service.match(/^([\w.-]+):(\d+)$/);
  if (m) return { host: m[1], port: Number(m[2]) };
  return null;
}

// pace the downlink to wire speed so the modem/SCC buffers never overrun
const BAUD = Math.max(300, parseInt(process.env.SURF_BAUD || '9600', 10) || 9600);
const TICK_MS = 100;
const BYTES_PER_TICK = Math.max(16, Math.round((BAUD / 10) * (TICK_MS / 1000)));

class Downlink {
  private outQ = Buffer.alloc(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private dec: MuxDecoder;
  private uplinks = new Map<number, net.Socket>();
  private echoChans = new Set<number>();

  constructor(private sock: net.Socket) {
    this.dec = new MuxDecoder({
      onOpen: (c, s) => this.openChannel(c, s),
      onClose: (c) => this.closeChannel(c),
      onData: (c, b) => this.toUplink(c, b),
      onPing: () => this.sendRaw(FRAME_PONG),
      onPong: () => {},
    });
    sock.setNoDelay(true);
    sock.on('data', (d) => this.dec.feed(d));
    sock.on('close', () => this.shutdown());
    sock.on('error', () => this.shutdown());
  }

  private send(buf: Buffer): void {
    this.outQ = this.outQ.length ? Buffer.concat([this.outQ, buf]) : buf;
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (this.outQ.length === 0) { clearInterval(this.timer!); this.timer = null; return; }
        const chunk = this.outQ.subarray(0, BYTES_PER_TICK);
        this.outQ = this.outQ.subarray(chunk.length);
        this.sock.write(chunk);
      }, TICK_MS);
    }
  }
  // ping/pong bypass pacing (tiny, latency-sensitive)
  private sendRaw(buf: Buffer): void { this.sock.write(buf); }

  private openChannel(chan: number, service: string): void {
    if (chan < 0 || chan > MAX_CHAN) return;
    this.closeChannel(chan);
    if (service === 'echo') {                 // internal round-trip test, no backend
      this.echoChans.add(chan);
      log(`channel ${chan} -> echo (internal)`);
      return;
    }
    const target = resolve(service);
    if (!target) { this.send(frameErr(chan, `unknown service "${service}"`)); return; }
    log(`channel ${chan} -> ${service} (${target.host}:${target.port})`);
    const up = net.createConnection(target, () => {});
    up.setNoDelay(true);
    up.on('data', (d) => this.send(frameData(chan, d)));   // backend -> Plus
    up.on('close', () => {
      if (this.uplinks.get(chan) === up) {
        this.uplinks.delete(chan);
        this.send(frameClose(chan));
      }
    });
    up.on('error', (e) => {
      this.send(frameErr(chan, e.message));
      this.uplinks.delete(chan);
    });
    this.uplinks.set(chan, up);
  }

  private toUplink(chan: number, bytes: Buffer): void {
    if (this.echoChans.has(chan)) { this.send(frameData(chan, bytes)); return; }
    const up = this.uplinks.get(chan);
    if (up) up.write(bytes);
  }

  private closeChannel(chan: number): void {
    this.echoChans.delete(chan);
    const up = this.uplinks.get(chan);
    if (up) { this.uplinks.delete(chan); up.destroy(); }
  }

  private shutdown(): void {
    if (this.timer) clearInterval(this.timer);
    for (const up of this.uplinks.values()) up.destroy();
    this.uplinks.clear();
  }
}

const idx = process.argv.indexOf('--listen');
const port = idx >= 0 ? parseInt(process.argv[idx + 1] ?? '2330', 10) || 2330 : 2330;
const server = net.createServer((sock) => {
  log(`downlink from ${sock.remoteAddress}`);
  new Downlink(sock);
});
server.listen(port, () => log(`multiplexer listening on :${port}`));
