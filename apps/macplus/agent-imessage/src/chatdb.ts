/*
 * chatdb.ts - read the Mac's iMessage history out of ~/Library/Messages/chat.db.
 *
 * We shell out to the system sqlite3 in -readonly mode (no native deps, and we
 * never write to the live DB). The one wrinkle: on modern macOS ~40% of rows
 * have message.text = NULL and carry the body in `attributedBody`, an NSArchiver
 * "typedstream" blob. decodeAttributedBody() pulls the UTF-8 string out of it.
 *
 * Apple's message.date is nanoseconds since 2001-01-01 on recent macOS; we only
 * use it for ordering, so the exact epoch doesn't matter here.
 *
 * Reading chat.db requires the running process to have Full Disk Access (the
 * same permission the iMessage MCP plugin uses). As a LaunchDaemon it needs FDA
 * granted to that binary; in an interactive shell it inherits the terminal's.
 */

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { resolveHandle } from './contacts.ts';

const DB = process.env.IMSG_CHATDB || path.join(os.homedir(), 'Library/Messages/chat.db');

export interface Conversation {
  rowid: number;          // chat.ROWID — stable handle for OPEN/SEND
  guid: string;           // chat.guid e.g. "iMessage;-;+15551234567" — used to send
  name: string;           // display name (group) or handle (1:1)
  unread: number;
  lastDate: number;
}

export interface Message {
  rowid: number;
  fromMe: boolean;
  text: string;
}

function query(sql: string): any[] {
  const out = execFileSync('/usr/bin/sqlite3', ['-readonly', '-json', DB, sql], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const s = out.toString('utf8').trim();
  return s ? JSON.parse(s) : [];
}

/* Pull the message text out of an attributedBody typedstream blob (hex string).
 * Layout (see the on-disk sample): ...NSString...'+'<lenvarint><utf8 bytes>...
 * The length varint: a byte <0x80 is the length itself; 0x81 => next 2 bytes
 * little-endian; 0x82 => next 4 bytes little-endian. */
export function decodeAttributedBody(hex: string | null): string {
  if (!hex) return '';
  const buf = Buffer.from(hex, 'hex');
  const marker = buf.indexOf('NSString', 0, 'latin1');
  if (marker < 0) return '';
  let i = buf.indexOf(0x2b, marker); // '+'
  if (i < 0) return '';
  i++;
  if (i >= buf.length) return '';
  let len = buf[i++];
  if (len === 0x81) { len = buf.readUInt16LE(i); i += 2; }
  else if (len === 0x82) { len = buf.readUInt32LE(i); i += 4; }
  if (len <= 0 || i + len > buf.length) return '';
  return buf.subarray(i, i + len).toString('utf8');
}

function bodyOf(row: { text: string | null; body_hex: string | null }): string {
  if (row.text && row.text.length) return row.text;
  const d = decodeAttributedBody(row.body_hex);
  return d;
}

/** Recent conversations, most-recent first. */
export function getConversations(limit = 20): Conversation[] {
  const rows = query(`
    SELECT * FROM (
      SELECT c.ROWID AS rowid, c.guid AS guid, c.chat_identifier AS cid, c.display_name AS dname,
        (SELECT max(m.date) FROM message m
           JOIN chat_message_join j ON j.message_id = m.ROWID
          WHERE j.chat_id = c.ROWID) AS last_date,
        (SELECT count(*) FROM message m
           JOIN chat_message_join j ON j.message_id = m.ROWID
          WHERE j.chat_id = c.ROWID AND m.is_from_me = 0 AND m.is_read = 0) AS unread
      FROM chat c
    ) WHERE last_date IS NOT NULL
    ORDER BY last_date DESC
    LIMIT ${limit | 0};
  `);
  return rows.map((r) => ({
    rowid: r.rowid,
    guid: r.guid,
    name: resolveConvName(r),
    unread: r.unread || 0,
    lastDate: r.last_date || 0,
  }));
}

/** The handles participating in a chat (for naming unnamed group chats). */
function getParticipants(chatRowid: number): string[] {
  const rows = query(`
    SELECT h.id AS id
    FROM chat_handle_join chj
    JOIN handle h ON h.ROWID = chj.handle_id
    WHERE chj.chat_id = ${chatRowid | 0};
  `);
  return rows.map((r) => String(r.id)).filter(Boolean);
}

/** A short label for an unresolved handle (drop the country code noise). */
function shortHandle(h: string): string {
  if (h.includes('@')) return h;
  const d = h.replace(/\D/g, '');
  return d.length > 10 ? `+${d}` : h;
}

/* Pick the best display name for a conversation:
 *   1. an explicit group display_name
 *   2. one participant  -> that handle's contact name (or the raw handle)
 *   3. many participants -> their names, comma-joined (+N for the rest)
 * Driving off the participant list (not chat_identifier) means group chats with
 * an opaque hex GUID still resolve to people, not the GUID. */
function resolveConvName(r: { rowid: number; cid: string; dname: string | null }): string {
  const dname = (r.dname && String(r.dname).trim()) || '';
  if (dname) return dname;
  const handles = getParticipants(r.rowid);
  if (handles.length === 1) return resolveHandle(handles[0]) || shortHandle(handles[0]);
  if (handles.length > 1) {
    const names = handles.map((h) => resolveHandle(h) || shortHandle(h));
    const shown = names.slice(0, 3).join(', ');
    return names.length > 3 ? `${shown} +${names.length - 3}` : shown;
  }
  const cid = String(r.cid || '');
  return resolveHandle(cid) || cid || 'unknown';
}

/** Messages in a chat, oldest -> newest, last `limit`. */
export function getMessages(chatRowid: number, limit = 40): Message[] {
  const rows = query(`
    SELECT m.ROWID AS rowid, m.is_from_me AS fromme, m.text AS text, hex(m.attributedBody) AS body_hex
    FROM message m
    JOIN chat_message_join j ON j.message_id = m.ROWID
    WHERE j.chat_id = ${chatRowid | 0}
    ORDER BY m.date DESC
    LIMIT ${limit | 0};
  `);
  // The query grabs the most-recent `limit` (date DESC); reverse to chronological
  // (oldest -> newest) so the Plus renders the newest at the bottom, where it
  // auto-scrolls — matching iMessage. (Serving newest-first put the newest at the
  // top and scrolled to the oldest.)
  rows.reverse();
  const out: Message[] = [];
  for (const r of rows) {
    let body = bodyOf(r);
    if (!body) body = '[attachment]';
    out.push({ rowid: r.rowid, fromMe: !!r.fromme, text: body });
  }
  return out;
}

/** Highest message ROWID — the poll baseline. */
export function maxMessageRowid(): number {
  const r = query('SELECT max(ROWID) AS m FROM message;');
  return (r[0] && r[0].m) || 0;
}

/** Incoming (not-from-me) messages newer than a ROWID, with their chat. */
export function incomingSince(rowid: number): { rowid: number; chatRowid: number; text: string }[] {
  const rows = query(`
    SELECT m.ROWID AS rowid, j.chat_id AS chatid, m.text AS text, hex(m.attributedBody) AS body_hex
    FROM message m
    JOIN chat_message_join j ON j.message_id = m.ROWID
    WHERE m.ROWID > ${rowid | 0} AND m.is_from_me = 0
    ORDER BY m.ROWID ASC;
  `);
  return rows.map((r) => ({
    rowid: r.rowid,
    chatRowid: r.chatid,
    text: bodyOf(r) || '[attachment]',
  }));
}
