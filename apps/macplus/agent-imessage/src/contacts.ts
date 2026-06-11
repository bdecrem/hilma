/*
 * contacts.ts - resolve an iMessage handle (phone/email) to a contact name.
 *
 * Names live in the macOS Contacts store (AddressBook-v22.abcddb), not chat.db.
 * We read it the same way as chat.db (sqlite3 -readonly) and build a normalized
 * handle -> name map once, lazily, on first lookup.
 *
 * The mini's own Contacts is usually near-empty, so by default we point at an
 * exported address book placed outside the repo (it's PII — never committed):
 *   ~/.imessage-contacts/AddressBook-v22.abcddb   (override: IMSG_CONTACTS_DB)
 * If the DB is missing/unreadable, resolveHandle() simply returns null and the
 * caller falls back to the raw handle — the feature degrades quietly.
 *
 * Phone matching is the only subtlety: chat.db stores "+15551234567" while
 * Contacts may store "(555) 123-4567", so we key on the last 10 digits.
 */

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const CONTACTS_DB =
  process.env.IMSG_CONTACTS_DB ||
  path.join(os.homedir(), '.imessage-contacts', 'AddressBook-v22.abcddb');

let phoneMap: Map<string, string> | null = null;
let emailMap: Map<string, string> | null = null;

/** last 10 digits — the cross-format phone key (handles +1, formatting, etc.) */
function phoneKey(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}

function query(sql: string): any[] {
  try {
    const out = execFileSync('/usr/bin/sqlite3', ['-readonly', '-json', CONTACTS_DB, sql], {
      maxBuffer: 128 * 1024 * 1024,
    });
    const s = out.toString('utf8').trim();
    return s ? JSON.parse(s) : [];
  } catch {
    return []; // missing DB / no permission -> empty maps -> graceful no-op
  }
}

function load(): void {
  if (phoneMap) return;
  phoneMap = new Map();
  emailMap = new Map();

  const recs = query(
    `SELECT Z_PK pk, COALESCE(ZFIRSTNAME,'') f, COALESCE(ZLASTNAME,'') l,
            COALESCE(ZORGANIZATION,'') o, COALESCE(ZNICKNAME,'') n
     FROM ZABCDRECORD;`,
  );
  const nameByPk = new Map<number, string>();
  for (const r of recs) {
    let nm = `${r.f} ${r.l}`.trim();
    if (!nm) nm = String(r.o).trim();
    if (!nm) nm = String(r.n).trim();
    if (nm) nameByPk.set(r.pk, nm);
  }

  for (const p of query(`SELECT ZOWNER owner, ZFULLNUMBER num FROM ZABCDPHONENUMBER WHERE ZFULLNUMBER IS NOT NULL;`)) {
    const nm = nameByPk.get(p.owner);
    if (!nm) continue;
    const k = phoneKey(String(p.num));
    if (k && !phoneMap.has(k)) phoneMap.set(k, nm);
  }
  for (const e of query(`SELECT ZOWNER owner, ZADDRESS addr FROM ZABCDEMAILADDRESS WHERE ZADDRESS IS NOT NULL;`)) {
    const nm = nameByPk.get(e.owner);
    if (!nm) continue;
    const k = String(e.addr).toLowerCase();
    if (k && !emailMap.has(k)) emailMap.set(k, nm);
  }
}

/** Contact name for a handle, or null if unknown. */
export function resolveHandle(handle: string): string | null {
  load();
  if (!handle) return null;
  if (handle.includes('@')) return emailMap!.get(handle.toLowerCase()) ?? null;
  const k = phoneKey(handle);
  if (!k) return null;
  return phoneMap!.get(k) ?? null;
}

/** For diagnostics/selftest: how many handles we can resolve. */
export function contactsStats(): { phones: number; emails: number } {
  load();
  return { phones: phoneMap!.size, emails: emailMap!.size };
}
