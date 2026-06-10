/*
 * frame.ts — the FND wire format (agent -> Plus). Must match foundry_rx.inc.
 *
 *   FNDSTS <message>\r\n          transient build-log line
 *   FNDBIN <totalLen> <cksum>\r\n delivery begins (MacBinary file follows)
 *   <hex lines, 128 bytes = 256 uppercase hex chars per line>\r\n
 *   FNDEND\r\n                    delivery complete
 *   FNDERR <message>\r\n          build failed (no file follows)
 *
 * cksum = sum of all file bytes mod 65536 (the Plus verifies before keeping
 * the file). Hex (not raw) so bytes survive the modem's telnet layer and the
 * 68000 parser stays trivial — same reasoning as the Atkinson image frames.
 */

const ASCII_FOLD: Record<string, string> = {
  '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '--', '…': '...',
};

export function toAscii(s: string): string {
  let out = '';
  for (const ch of s) {
    if (ch in ASCII_FOLD) { out += ASCII_FOLD[ch]; continue; }
    const c = ch.codePointAt(0)!;
    out += c >= 32 && c < 127 ? ch : c === 9 ? ' ' : '';
  }
  return out;
}

export function status(msg: string): string {
  return `FNDSTS ${toAscii(msg).slice(0, 200)}\r\n`;
}

export function errorLine(msg: string): string {
  return `FNDERR ${toAscii(msg).slice(0, 200)}\r\n`;
}

export function checksum16(buf: Buffer): number {
  let sum = 0;
  for (const b of buf) sum = (sum + b) & 0xffff;
  return sum;
}

/** Encode a MacBinary file as a complete FNDBIN..FNDEND frame. */
export function encodeBin(bin: Buffer): string {
  const lines: string[] = [`FNDBIN ${bin.length} ${checksum16(bin)}\r\n`];
  for (let off = 0; off < bin.length; off += 128) {
    lines.push(bin.subarray(off, off + 128).toString('hex').toUpperCase() + '\r\n');
  }
  lines.push('FNDEND\r\n');
  return lines.join('');
}
