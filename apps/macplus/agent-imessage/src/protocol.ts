/*
 * protocol.ts - the line-tagged frames the agent emits to the Plus, riding
 * inside a single MUX channel (the bytes here are the channel payload). The
 * Plus parser is im_rx.inc, shared verbatim with the host test rxtest.c.
 *
 * Agent -> Plus:
 *   IMSTS <text>\r\n              status line (window title)
 *   IMERR <text>\r\n             error (Plus beeps)
 *   IMLIST\r\n                    begin conversation list
 *     C <idx> <unread> <name>\r\n   one conversation (idx = stable for OPEN/SEND)
 *   IMEND\r\n
 *   IMCONV <idx> <name>\r\n      begin a thread (replaces the Plus's thread view)
 *     M <dir> <text>\r\n            one message; dir '>' = from me, '<' = incoming
 *     + <text>\r\n                  continuation of the previous M (long messages)
 *   IMEND\r\n
 *   IMSENT <idx>\r\n             a SEND was accepted
 *
 * Plus -> agent (handled in main.ts):
 *   LIST  /  OPEN <idx>  /  SEND <idx> <text>
 *
 * Everything is ASCII (the modem's telnet layer mangles high bytes) and lines
 * are capped so the Plus's small line buffer never overflows.
 */

import type { Conversation, Message } from './chatdb.ts';

const MAXLINE = 180;

/* Fold to printable 7-bit ASCII: map the common typographic Unicode, drop the
 * rest. Newlines/CRs become spaces so one message stays one logical line set. */
export function asciiFold(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 9) { out += ' '; continue; }
    if (c === 10 || c === 13) { out += ' '; continue; }
    if (c >= 32 && c < 127) { out += ch; continue; }
    switch (c) {
      case 0x2018: case 0x2019: case 0x201b: out += "'"; break;
      case 0x201c: case 0x201d: out += '"'; break;
      case 0x2013: case 0x2014: out += '-'; break;
      case 0x2026: out += '...'; break;
      case 0x00a0: out += ' '; break;
      default: break; // emoji & co. dropped — the Plus has no glyphs for them
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function name1(s: string): string {
  // a conversation/thread name shares its line with following fields, but it's
  // always the line tail, so spaces are fine — just fold and cap.
  return asciiFold(s).slice(0, 60) || 'unknown';
}

/** A message as an `M <dir> ...` line plus `+ ...` continuations. */
function encodeMessage(m: Message): string {
  const dir = m.fromMe ? '>' : '<';
  let body = asciiFold(m.text);
  if (!body) body = '[no text]';
  // first chunk after "M <dir> " (8 chars of prefix budget)
  let out = '';
  let first = true;
  while (body.length) {
    const room = MAXLINE - (first ? 8 : 2);
    let take = Math.min(room, body.length);
    if (take < body.length) {
      // back up to a space so words stay whole
      const sp = body.lastIndexOf(' ', take);
      if (sp > room / 2) take = sp;
    }
    const chunk = body.slice(0, take).trimEnd();
    out += first ? `M ${dir} ${chunk}\r\n` : `+ ${chunk}\r\n`;
    body = body.slice(take).trimStart();
    first = false;
  }
  if (first) out = `M ${dir} \r\n`; // empty body guard
  return out;
}

export function encodeStatus(s: string): string { return `IMSTS ${asciiFold(s).slice(0, MAXLINE)}\r\n`; }
export function encodeError(s: string): string { return `IMERR ${asciiFold(s).slice(0, MAXLINE)}\r\n`; }
export function encodeSent(idx: number): string { return `IMSENT ${idx | 0}\r\n`; }

export function encodeList(convs: Conversation[]): string {
  let out = 'IMLIST\r\n';
  convs.forEach((c, i) => { out += `C ${i} ${c.unread | 0} ${name1(c.name)}\r\n`; });
  out += 'IMEND\r\n';
  return out;
}

export function encodeConversation(idx: number, name: string, msgs: Message[]): string {
  let out = `IMCONV ${idx | 0} ${name1(name)}\r\n`;
  for (const m of msgs) out += encodeMessage(m);
  out += 'IMEND\r\n';
  return out;
}
