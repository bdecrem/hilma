/*
 * Porthole wire frames (binary, over raw TCP via nettcp — no hex needed).
 *
 * Every message is: 1 type byte + a payload.
 *   'F' frame:  x,y,w,h,rowbytes (uint16 BE) + clen (uint32 BE) + clen bytes
 *               of zlib. Inflates to h*rowbytes of 1-bit rows (MSB-first,
 *               set bit = black, QuickDraw convention from dither.py). The Plus
 *               blits the rect at (x,y). Full screen = (0,0,512,300).
 *   'S' status: len (uint16 BE) + latin1 text  -> Plus title-bar status.
 *   'T' title:  len (uint16 BE) + latin1 text  -> Plus window title.
 *
 * The Plus does a fresh zss_inflate_init per 'F' frame: each frame is a
 * complete, independent zlib stream (header + blocks; the trailing adler32 is
 * harmless trailing input once the final block is decoded).
 */
import { deflateSync } from 'node:zlib';

/** packed = h*rb bytes of 1-bit rows for the rect at (x,y). */
export function frameRect(packed: Uint8Array, x: number, y: number, w: number, h: number, rb: number): Buffer {
  if (packed.length !== rb * h) throw new Error(`frame size ${packed.length} != ${rb}*${h}`);
  const z = deflateSync(Buffer.from(packed), { level: 6 });
  const hdr = Buffer.alloc(1 + 2 * 5 + 4);
  hdr.write('F', 0, 'latin1');
  hdr.writeUInt16BE(x, 1); hdr.writeUInt16BE(y, 3);
  hdr.writeUInt16BE(w, 5); hdr.writeUInt16BE(h, 7);
  hdr.writeUInt16BE(rb, 9); hdr.writeUInt32BE(z.length, 11);
  return Buffer.concat([hdr, z]);
}

export function frameFull(packed: Uint8Array, w: number, h: number, rb: number): Buffer {
  return frameRect(packed, 0, 0, w, h, rb);
}

function tlv(type: string, text: string): Buffer {
  const t = Buffer.from(text.replace(/[\r\n]+/g, ' ').slice(0, 200), 'latin1');
  const hdr = Buffer.alloc(3);
  hdr.write(type, 0, 'latin1');
  hdr.writeUInt16BE(t.length, 1);
  return Buffer.concat([hdr, t]);
}

export const msgStatus = (text: string) => tlv('S', text);
export const msgTitle  = (text: string) => tlv('T', text);
