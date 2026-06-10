/*
 * protocol.ts — the MUX framing that rides the single Plus<->mini connection.
 *
 * One byte stream carries many logical channels. Control lines are ASCII and
 * \r\n-terminated (telnet-safe); data frames are a header line then exactly N
 * raw payload bytes (the backend's own \r\n live inside the count). The 68k
 * parser is trivial: read a line, dispatch; for a data frame read N bytes.
 *
 *   MUXOPEN <chan> <service>\r\n     open a logical channel to a named service
 *   MUXCLOSE <chan>\r\n              close a channel
 *   MUX <chan> <nbytes>\r\n<bytes>   a data chunk on a channel (no trailing CRLF)
 *   MUXPING\r\n  /  MUXPONG\r\n       keepalive (either direction)
 *   MUXERR <chan> <message>\r\n      channel-level error from the mux
 *
 * Channels are small integers (0..63) chosen by the Plus side. Service names
 * map to backends in main.ts (e.g. "surf" -> 127.0.0.1:2326).
 */

export const MAX_CHAN = 63;

export interface MuxHandlers {
  onOpen(chan: number, service: string): void;
  onClose(chan: number): void;
  onData(chan: number, bytes: Buffer): void;
  onPing(): void;
  onPong(): void;
}

/** Streaming decoder: feed bytes, get framed callbacks. */
export class MuxDecoder {
  private buf = Buffer.alloc(0);
  // when inside a data frame, how many payload bytes remain + which channel
  private dataChan = -1;
  private dataLeft = 0;
  private dataParts: Buffer[] = [];

  constructor(private h: MuxHandlers) {}

  feed(chunk: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.dataChan >= 0) {
        // consuming a data payload
        if (this.buf.length === 0) return;
        const take = Math.min(this.dataLeft, this.buf.length);
        this.dataParts.push(this.buf.subarray(0, take));
        this.buf = this.buf.subarray(take);
        this.dataLeft -= take;
        if (this.dataLeft === 0) {
          const payload = Buffer.concat(this.dataParts);
          const chan = this.dataChan;
          this.dataChan = -1;
          this.dataParts = [];
          this.h.onData(chan, payload);
        }
        continue;
      }
      // looking for a control line
      const nl = this.buf.indexOf(0x0a);
      if (nl < 0) return;
      let line = this.buf.subarray(0, nl).toString('latin1');
      this.buf = this.buf.subarray(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.length === 0) continue;
      this.dispatch(line);
    }
  }

  private dispatch(line: string): void {
    const sp = line.indexOf(' ');
    const verb = sp < 0 ? line : line.slice(0, sp);
    const rest = sp < 0 ? '' : line.slice(sp + 1);
    switch (verb) {
      case 'MUXOPEN': {
        const m = rest.match(/^(\d+)\s+(\S+)/);
        if (m) this.h.onOpen(Number(m[1]), m[2]);
        return;
      }
      case 'MUXCLOSE': {
        const c = parseInt(rest, 10);
        if (Number.isFinite(c)) this.h.onClose(c);
        return;
      }
      case 'MUX': {
        const m = rest.match(/^(\d+)\s+(\d+)/);
        if (!m) return;
        this.dataChan = Number(m[1]);
        this.dataLeft = Number(m[2]);
        this.dataParts = [];
        if (this.dataLeft === 0) {
          this.dataChan = -1;
          this.h.onData(Number(m[1]), Buffer.alloc(0));
        }
        return;
      }
      case 'MUXPING': this.h.onPing(); return;
      case 'MUXPONG': this.h.onPong(); return;
      default: return; // tolerate noise/echoes between frames
    }
  }
}

export function frameData(chan: number, bytes: Buffer): Buffer {
  return Buffer.concat([Buffer.from(`MUX ${chan} ${bytes.length}\r\n`, 'latin1'), bytes]);
}
export function frameOpen(chan: number, service: string): Buffer {
  return Buffer.from(`MUXOPEN ${chan} ${service}\r\n`, 'latin1');
}
export function frameClose(chan: number): Buffer {
  return Buffer.from(`MUXCLOSE ${chan}\r\n`, 'latin1');
}
export function frameErr(chan: number, msg: string): Buffer {
  return Buffer.from(`MUXERR ${chan} ${msg.replace(/[\r\n]/g, ' ').slice(0, 120)}\r\n`, 'latin1');
}
export const FRAME_PING = Buffer.from('MUXPING\r\n', 'latin1');
export const FRAME_PONG = Buffer.from('MUXPONG\r\n', 'latin1');
