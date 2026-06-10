#!/usr/bin/env -S npx tsx
/*
 * selftest.ts - exercise the agent without the Plus and without texting anyone.
 *
 *   npm run selftest
 *
 * Reads real conversations + a real thread from chat.db, runs them through the
 * frame encoder, and asserts the wire output is well-formed. The send path is
 * checked in DRY_RUN (no message actually leaves the Mac).
 */

import { getConversations, getMessages, decodeAttributedBody } from './chatdb.ts';
import { encodeList, encodeConversation, asciiFold } from './protocol.ts';
import { sendIMessage } from './applescript.ts';

let failures = 0;
function ok(cond: boolean, msg: string): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
}

// 1. asciiFold
ok(asciiFold('“quoted” — dash') === '"quoted" - dash', 'asciiFold maps smart punctuation');
ok(asciiFold('line1\nline2') === 'line1 line2', 'asciiFold flattens newlines');

// 2. attributedBody decoder against a hand-built minimal blob
{
  const text = 'hello world';
  const head = Buffer.from('xxxxNSString+', 'latin1');
  const lenByte = Buffer.from([text.length]); // short string -> single length byte
  const blob = Buffer.concat([head, lenByte, Buffer.from(text, 'utf8')]);
  ok(decodeAttributedBody(blob.toString('hex')) === text, 'decodeAttributedBody (short string)');
}

// 3. real conversation list -> frame
const convs = getConversations(20);
ok(convs.length > 0, `read ${convs.length} conversations from chat.db`);
const listFrame = encodeList(convs);
ok(listFrame.startsWith('IMLIST\r\n') && listFrame.endsWith('IMEND\r\n'), 'list frame is bracketed by IMLIST/IMEND');
ok(/\nC 0 \d+ .+\r\n/.test(listFrame), 'list frame has a well-formed C row');
ok(!/[^\x00-\x7f]/.test(listFrame), 'list frame is pure ASCII');

// 4. real thread -> frame
if (convs.length) {
  const msgs = getMessages(convs[0].rowid, 40);
  ok(true, `read ${msgs.length} messages from "${convs[0].name}"`);
  const conv = encodeConversation(0, convs[0].name, msgs);
  ok(conv.startsWith('IMCONV 0 '), 'conversation frame starts with IMCONV');
  ok(conv.includes('IMEND\r\n'), 'conversation frame ends with IMEND');
  ok(!/[^\x00-\x7f]/.test(conv), 'conversation frame is pure ASCII');
  // every payload line is within the 180-char cap
  const longest = conv.split('\r\n').reduce((a, l) => Math.max(a, l.length), 0);
  ok(longest <= 180, `longest line ${longest} <= 180`);
  // direction markers present and valid
  ok(conv.split('\r\n').filter((l) => l.startsWith('M ')).every((l) => l[2] === '>' || l[2] === '<'),
     'every M line has a valid direction marker');
}

// 5. send path in dry-run (no real iMessage)
process.env.IMSG_DRY_RUN = '1';
let threw = false;
try { sendIMessage('iMessage;-;+10000000000', 'selftest dry run'); } catch { threw = true; }
ok(!threw, 'dry-run send path does not throw');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good');
process.exit(failures ? 1 : 0);
