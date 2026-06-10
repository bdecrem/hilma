/*
 * frame.ts — the TKM wire format (agent -> Plus). Must match talk_rx.inc.
 *
 *   TKMSTS <msg>                      status line
 *   TKMUTT <nWords> <moodCode>        an utterance begins
 *   T <speech-bubble text>            (once; long text split across + lines)
 *   + <more bubble text>
 *   W <phonemes> | <displayWord>      one per spoken word, in order
 *   TKMEND
 *   TKMERR <msg>
 */

import type { Utterance } from './compose.ts';

const MAXLINE = 200;

function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 32 && c < 127 ? ch : c === 9 ? ' ' : '';
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function status(msg: string): string {
  return `TKMSTS ${fold(msg).slice(0, MAXLINE)}\r\n`;
}
export function errorLine(msg: string): string {
  return `TKMERR ${fold(msg).slice(0, MAXLINE)}\r\n`;
}

function splitText(prefix: string, text: string): string[] {
  const words = fold(text).split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= MAXLINE - 2) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.map((l, i) => `${i === 0 ? prefix : '+'} ${l}\r\n`);
}

export function encodeUtterance(u: Utterance): string {
  const out: string[] = [`TKMUTT ${u.words.length} ${u.moodCode}\r\n`];
  out.push(...splitText('T', u.text));
  for (const w of u.words) {
    const ph = fold(w.phonemes).slice(0, 60);
    const disp = fold(w.display).slice(0, 40) || '~';
    out.push(`W ${ph} | ${disp}\r\n`);
  }
  out.push('TKMEND\r\n');
  return out.join('');
}
