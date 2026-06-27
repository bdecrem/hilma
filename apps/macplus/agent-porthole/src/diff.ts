/*
 * Dirty-region diff. Compare the new 1-bit framebuffer to the last one and
 * return only the changed bounding rectangle, so a keystroke or hover ships a
 * few hundred bytes instead of the whole screen. The X extent is byte-aligned
 * (multiples of 8) so the Plus can copy whole bytes into its screen buffer.
 */
export type Dirty =
  | { kind: 'full' }
  | { kind: 'none' }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rb: number; rect: Buffer };

export function dirtyRect(prev: Buffer | null, cur: Buffer, W: number, H: number, RB: number): Dirty {
  if (!prev || prev.length !== cur.length) return { kind: 'full' };
  let y0 = H, y1 = -1, c0 = RB, c1 = -1;
  for (let y = 0; y < H; y++) {
    const base = y * RB;
    let rowDiff = false;
    for (let c = 0; c < RB; c++) {
      if (prev[base + c] !== cur[base + c]) { rowDiff = true; if (c < c0) c0 = c; if (c > c1) c1 = c; }
    }
    if (rowDiff) { if (y < y0) y0 = y; y1 = y; }
  }
  if (y1 < 0) return { kind: 'none' };

  const rb = c1 - c0 + 1;
  const x = c0 * 8, w = rb * 8, y = y0, h = y1 - y0 + 1;
  if (w * h > W * H * 0.6) return { kind: 'full' };   /* mostly changed: just send it all */

  const rect = Buffer.alloc(rb * h);
  for (let r = 0; r < h; r++) {
    const src = (y0 + r) * RB + c0;
    cur.copy(rect, r * rb, src, src + rb);
  }
  return { kind: 'rect', x, y, w, h, rb, rect };
}
