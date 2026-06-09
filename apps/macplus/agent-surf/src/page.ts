/*
 * page.ts — turn Claude's (or our own) block text into a legal SRF frame.
 *
 * Input: lines of "T/H/P/Q/-/B" blocks plus "L <url> | <text>" link lines.
 * Output: { lines, links } where lines are wire-ready (numbered links, ASCII,
 * <=220 chars with "+" continuations, capped totals) and links maps the
 * assigned number -> absolute URL.
 */

export const MAX_LINE = 220;      // chars per wire line (Plus buffer is 256)
export const MAX_BLOCKS = 250;
export const MAX_LINKS = 30;
export const MAX_TEXT = 12_000;   // total chars of text per page

const ASCII_MAP: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"',
  '–': '-', '—': '--', '―': '--', '−': '-',
  '…': '...', ' ': ' ', '•': '*', '·': '*',
  '×': 'x', '÷': '/', '°': ' deg', '™': '(tm)',
  '©': '(c)', '®': '(r)', '€': 'EUR', '£': 'GBP',
  '¥': 'YEN',
};

/** Fold to plain 7-bit ASCII the Plus can draw. */
export function toAscii(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFKD')) {
    if (ch in ASCII_MAP) { out += ASCII_MAP[ch]; continue; }
    const c = ch.codePointAt(0)!;
    if (c === 9) { out += ' '; continue; }
    if (c >= 32 && c < 127) { out += ch; continue; }
    // NFKD leaves combining marks for accented letters — drop them.
    if (c >= 0x300 && c <= 0x36f) continue;
    // anything else non-ASCII: drop
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

/** Split text into a first line of <=max and continuation chunks of <=max. */
function splitChunks(text: string, max: number): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length === 0) cur = w;
    else if (cur.length + 1 + w.length <= max) cur += ' ' + w;
    else { chunks.push(cur); cur = w; }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export interface Frame {
  lines: string[];               // wire lines, no terminators
  links: Map<number, string>;    // n -> absolute URL
}

/**
 * Sanitize raw block text into a frame.
 * Accepts lines shaped like:
 *   T title / H heading / P para / Q quote / - bullet / B
 *   L <url> | <text>      (or "L <n> <text>" if already numbered upstream)
 * Unrecognized non-empty lines are treated as P blocks.
 */
export function buildFrame(raw: string, resolveUrl?: (u: string) => string): Frame {
  const lines: string[] = [];
  const links = new Map<number, string>();
  let nextLink = 1;
  let blocks = 0;
  let textTotal = 0;

  const push = (prefix: string, text: string) => {
    if (blocks >= MAX_BLOCKS || textTotal >= MAX_TEXT) return;
    const clean = toAscii(text);
    if (prefix !== 'B' && clean.length === 0) return;
    blocks++;
    if (prefix === 'B') { lines.push('B'); return; }
    textTotal += clean.length;
    const room = MAX_LINE - 2; // "X "
    const chunks = splitChunks(clean, room);
    lines.push(`${prefix} ${chunks[0] ?? ''}`);
    for (const c of chunks.slice(1)) lines.push(`+ ${c}`);
  };

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const m = line.match(/^([THPQB\-+L])(\s+(.*))?$/s);
    if (!m) { push('P', line); continue; }
    const tag = m[1];
    const rest = (m[3] ?? '').trim();

    if (tag === 'B') { push('B', ''); continue; }
    if (tag === '+') {
      // continuation from the model: glue onto the previous block by re-pushing
      // as its own chunk lines (acceptable: same style continuation)
      if (lines.length === 0) { push('P', rest); continue; }
      const clean = toAscii(rest);
      if (!clean) continue;
      textTotal += clean.length;
      for (const c of splitChunks(clean, MAX_LINE - 2)) lines.push(`+ ${c}`);
      continue;
    }
    if (tag === 'L') {
      if (links.size >= MAX_LINKS) continue;
      // "L <url> | <text>"  (preferred)  or  "L <url> <text>"
      let url = '', text = '';
      const bar = rest.indexOf('|');
      if (bar >= 0) {
        url = rest.slice(0, bar).trim();
        text = rest.slice(bar + 1).trim();
      } else {
        const sp = rest.indexOf(' ');
        if (sp < 0) { url = rest; text = rest; }
        else { url = rest.slice(0, sp).trim(); text = rest.slice(sp + 1).trim(); }
      }
      if (!/^https?:\/\//i.test(url)) {
        if (resolveUrl) url = resolveUrl(url);
        if (!/^https?:\/\//i.test(url)) continue;   // unusable link — drop
      }
      const n = nextLink++;
      links.set(n, url);
      const label = toAscii(text) || url.replace(/^https?:\/\//, '');
      blocks++;
      const chunks = splitChunks(label, MAX_LINE - 8);
      lines.push(`L ${n} ${chunks[0] ?? ''}`);
      for (const c of chunks.slice(1)) lines.push(`+ ${c}`);
      continue;
    }
    push(tag, rest);
  }

  return { lines, links };
}

/** Wire-encode a frame (everything between and including SRFPAG/SRFEND). */
export function encodeFrame(f: Frame): string {
  return 'SRFPAG\r\n' + f.lines.map((l) => l + '\r\n').join('') + 'SRFEND\r\n';
}

export function encodeError(msg: string): string {
  return `SRFERR ${toAscii(msg).slice(0, MAX_LINE)}\r\n`;
}

export function encodeStatus(msg: string): string {
  return `SRFSTS ${toAscii(msg).slice(0, MAX_LINE)}\r\n`;
}
