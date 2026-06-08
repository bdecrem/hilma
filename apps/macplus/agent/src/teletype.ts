/*
 * Teletype — THE Mac Plus layer.
 *
 * Everything that knows about the Plus's limits lives here and nowhere else:
 *   - 9600 baud  -> append-only, never redraw; keep it terse
 *   - ~80x24 mono -> hard-wrap to `cols`, no color
 *   - VT100      -> CRLF line endings, ASCII only (no smart quotes / emoji / box-drawing)
 *
 * The rest of the program hands this layer normal text/markdown; it renders a
 * clean ASCII stream a 1986 terminal can display.
 */
import * as readline from 'node:readline';

/* ---- Unicode -> ASCII transliteration (the common offenders) ---- */
const UNICODE_MAP: [RegExp, string][] = [
  [/[‘’‚‛]/g, "'"],   // smart single quotes
  [/[“”„‟]/g, '"'],   // smart double quotes
  [/[–—―]/g, '-'],          // en/em dash
  [/…/g, '...'],                       // ellipsis
  [/[•·●▪◦‣]/g, '-'], // bullets
  [/→/g, '->'], [/←/g, '<-'],    // arrows
  [/[✓✔]/g, '[x]'],               // checkmarks
  [/[   ]/g, ' '],           // non-breaking spaces
];

/* Apply backspace (0x08) and DEL (0x7F) destructively: the model sometimes
 * emits them to self-correct, but a dumb VT100/ZTerm prints them as literal
 * ^H instead of erasing. Resolve them here so the line goes out already
 * corrected. (Within a chunk; cross-chunk corrections are rare and harmless.) */
function applyBackspaces(s: string): string {
  if (s.indexOf('\x08') < 0 && s.indexOf('\x7f') < 0) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\x08' || c === '\x7f') out = out.slice(0, -1);
    else out += c;
  }
  return out;
}

export function toAscii(s: string): string {
  let r = s;
  for (const [re, rep] of UNICODE_MAP) r = r.replace(re, rep);
  r = applyBackspaces(r);                               // erase, don't print ^H
  r = r.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');        // strip ANSI escapes
  r = r.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');     // anything left non-ASCII -> '?'
  return r;
}

/* ---- Markdown -> plain text (Claude speaks markdown; the Plus does not) ---- */
export function mdToPlain(s: string): string {
  const out: string[] = [];
  let inFence = false;
  for (let line of s.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; } // drop fence markers
    if (inFence) { out.push('    ' + line); continue; }                // indent code blocks
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);                  // headings -> UPPERCASE
    if (h) { out.push(h[2].toUpperCase()); continue; }
    line = line.replace(/^(\s*)[-*+]\s+/, '$1- ');                     // bullets -> "- "
    line = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1'); // bold
    line = line.replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, '$1$2');  // italic *x*
    line = line.replace(/`([^`]+)`/g, '$1');                           // inline code
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');        // links -> text (url)
    out.push(line);
  }
  return out.join('\n');
}

/* ---- Word-wrap to a column width, preserving indent and blank lines ---- */
export function wrap(s: string, cols: number): string {
  const outLines: string[] = [];
  for (const para of s.split('\n')) {
    if (para.length <= cols) { outLines.push(para); continue; }
    const indent = para.match(/^\s*/)?.[0] ?? '';
    const words = para.slice(indent.length).split(/\s+/);
    let cur = indent;
    for (let w of words) {
      while (indent.length + w.length > cols) {        // hard-break over-long words/URLs
        const room = cols - (cur.length > indent.length ? cur.length + 1 : cur.length);
        if (cur.length > indent.length) { outLines.push(cur); cur = indent; }
        outLines.push(indent + w.slice(0, cols - indent.length));
        w = w.slice(cols - indent.length);
      }
      if (cur.length === indent.length) cur += w;
      else if (cur.length + 1 + w.length <= cols) cur += ' ' + w;
      else { outLines.push(cur); cur = indent + w; }
    }
    outLines.push(cur);
  }
  return outLines.join('\n');
}

export class Teletype {
  cols: number;
  private crlf: boolean;
  private rl: readline.Interface;

  constructor(opts: { cols: number; crlf?: boolean }) {
    this.cols = opts.cols;
    this.crlf = opts.crlf ?? true;
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  }

  private emit(s: string): void {
    process.stdout.write(this.crlf ? s.replace(/\r?\n/g, '\r\n') : s);
  }

  /** Render normal text/markdown as wrapped ASCII. */
  text(s: string): void {
    this.emit(toAscii(wrap(mdToPlain(s), this.cols)));
  }

  /** A single already-short line (ASCII-ified, wrapped) plus newline. */
  line(s = ''): void {
    this.emit(toAscii(wrap(s, this.cols)) + '\n');
  }

  /** A tool-activity line, Claude-Code style. */
  tool(title: string): void {
    this.line('* ' + title);
  }

  /** Prompt for a line of input. */
  ask(prompt: string): Promise<string> {
    return new Promise((res) => this.rl.question(this.crlf ? prompt : prompt, (a) => res(a)));
  }

  /** VT100 clear screen + home (bypasses ASCII strip — these are control codes). */
  clear(): void {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  close(): void {
    this.rl.close();
  }
}
