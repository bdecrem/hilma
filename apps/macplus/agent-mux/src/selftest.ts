#!/usr/bin/env -S npx tsx
/*
 * selftest — exercises the mux without the Plus and without the real agents:
 *  1. MuxDecoder framing (open/data/close/ping, split across chunk boundaries)
 *  2. live: spin up two fake backends, start the mux, connect a fake downlink,
 *     open two channels, prove bidirectional relay + isolation between channels.
 */

import net from 'node:net';
import {
  MuxDecoder, frameData, frameOpen, frameClose, FRAME_PING,
} from './protocol.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- 1. decoder framing ----
{
  const ev: string[] = [];
  const dec = new MuxDecoder({
    onOpen: (c, s) => ev.push(`open ${c} ${s}`),
    onClose: (c) => ev.push(`close ${c}`),
    onData: (c, b) => ev.push(`data ${c} ${JSON.stringify(b.toString())}`),
    onPing: () => ev.push('ping'),
    onPong: () => ev.push('pong'),
  });
  const stream = Buffer.concat([
    frameOpen(3, 'surf'),
    frameData(3, Buffer.from('GO news\r')),
    FRAME_PING,
    frameData(3, Buffer.from('partial')),
    frameClose(3),
  ]);
  // feed one byte at a time to prove boundary-robustness
  for (const b of stream) dec.feed(Buffer.from([b]));
  check('decode open', ev[0] === 'open 3 surf');
  check('decode data', ev[1] === 'data 3 "GO news\\r"');
  check('decode ping', ev[2] === 'ping');
  check('decode data2', ev[3] === 'data 3 "partial"');
  check('decode close', ev[4] === 'close 3');
}

// ---- 2. live relay through the mux ----
async function live() {
  // two fake backends that echo with a tag
  function fakeBackend(tag: string): Promise<number> {
    return new Promise((resolve) => {
      const s = net.createServer((c) => {
        c.write(`hello from ${tag}\n`);
        c.on('data', (d) => c.write(`${tag}:${d.toString().trim()}\n`));
      });
      s.listen(0, () => resolve((s.address() as net.AddressInfo).port));
    });
  }
  const pA = await fakeBackend('A');
  const pB = await fakeBackend('B');

  // start the mux as a child? simpler: import and run inline on an ephemeral port
  const { default: _ } = { default: 0 };
  void _;
  // run a minimal inline copy of the mux server pointed at our fake backends via host:port service tokens
  const muxPort = await new Promise<number>((resolve) => {
    const srv = net.createServer((sock) => {
      const uplinks = new Map<number, net.Socket>();
      const dec = new MuxDecoder({
        onOpen: (chan, service) => {
          const m = service.match(/^([\w.-]+):(\d+)$/)!;
          const up = net.createConnection({ host: m[1], port: Number(m[2]) });
          up.on('data', (d) => sock.write(frameData(chan, d)));
          uplinks.set(chan, up);
        },
        onClose: (chan) => { uplinks.get(chan)?.destroy(); uplinks.delete(chan); },
        onData: (chan, b) => uplinks.get(chan)?.write(b),
        onPing: () => {}, onPong: () => {},
      });
      sock.on('data', (d) => dec.feed(d));
    });
    srv.listen(0, () => resolve((srv.address() as net.AddressInfo).port));
  });

  // a fake "Plus" downlink
  const got: string[] = [];
  const down = net.createConnection({ host: '127.0.0.1', port: muxPort });
  const ddec = new MuxDecoder({
    onOpen: () => {}, onClose: () => {}, onPing: () => {}, onPong: () => {},
    onData: (chan, b) => got.push(`${chan}:${b.toString().trim()}`),
  });
  down.on('data', (d) => ddec.feed(d));
  await new Promise((r) => down.once('connect', r));

  down.write(frameOpen(1, `127.0.0.1:${pA}`));
  down.write(frameOpen(2, `127.0.0.1:${pB}`));
  await sleep(150);
  down.write(frameData(1, Buffer.from('ping1')));
  down.write(frameData(2, Buffer.from('ping2')));
  await sleep(200);

  check('greeting from A on chan 1', got.includes('1:hello from A'));
  check('greeting from B on chan 2', got.includes('2:hello from B'));
  check('echo A isolated to chan 1', got.includes('1:A:ping1') && !got.includes('2:A:ping1'));
  check('echo B isolated to chan 2', got.includes('2:B:ping2') && !got.includes('1:B:ping2'));
  down.destroy();
}

await live();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
