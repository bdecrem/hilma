/*
 * The Atkinson wire frame. Plus <-> agent protocol (see atkinson.c):
 *
 *   "ATKIMG <w> <h> <rowbytes>\r\n"
 *   <h lines, each rowbytes*2 hex chars + \r\n>   (one image row per line)
 *   "ATKEND\r\n"
 *     or on failure  "ATKERR <message>\r\n"
 *
 * Hex (not raw binary) so the bytes survive the modem's telnet layer - a raw
 * 0xFF would be read as a telnet IAC - and so the 68000 parser stays trivial.
 * The Plus paints each row as its line lands, so the picture develops like a
 * Polaroid with byte arrival.
 */

const HEX = '0123456789abcdef';

/** packed = w/8*h bytes, MSB-first, set bit = black (QuickDraw / dither.py). */
export function encodeFrame(packed: Uint8Array, w: number, h: number, rb: number): string {
  if (packed.length !== rb * h) {
    throw new Error(`frame size mismatch: ${packed.length} != ${rb}*${h}`);
  }
  const out: string[] = [`ATKIMG ${w} ${h} ${rb}`];
  for (let row = 0; row < h; row++) {
    let line = '';
    const base = row * rb;
    for (let i = 0; i < rb; i++) {
      const b = packed[base + i];
      line += HEX[(b >> 4) & 0xf] + HEX[b & 0xf];
    }
    out.push(line);
  }
  out.push('ATKEND');
  return out.join('\r\n') + '\r\n';
}

export function encodeError(message: string): string {
  // keep it one clean line; the Plus shows it verbatim in the title bar
  const safe = message.replace(/[\r\n]+/g, ' ').slice(0, 120);
  return `ATKERR ${safe}\r\n`;
}
