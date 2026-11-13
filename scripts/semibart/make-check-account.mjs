// The check-only account the headless checks sign in with, so they never touch a real fellow's
// passcode (the osai e2e pattern). An admin named "check" that owns no study, with a long random
// passcode kept in .env.local (SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS) and the ops vault.
// Idempotent: reuses the passcode already in .env.local, and only (re)writes the account's hash.
// Usage: node scripts/semibart/make-check-account.mjs
import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

const ENV = '.env.local', VAULT = `${os.homedir()}/.config/ops/vault.env`;
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const get = (text, k) => (text.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.replace(/^"|"$/g, '');
const env = read(ENV);
let pass = get(env, 'SEMIBART_CHECK_PASS');
if (!pass) {
  pass = randomBytes(18).toString('hex');
  fs.appendFileSync(ENV, `\nSEMIBART_CHECK_NAME=check\nSEMIBART_CHECK_PASS=${pass}\n`);
  if (!get(read(VAULT), 'SEMIBART_CHECK_PASS')) fs.appendFileSync(VAULT, `SEMIBART_CHECK_PASS=${pass}\n`);
  console.log('new check passcode written to .env.local and the vault');
}
const salt = randomBytes(16);
const passcode_hash = `scrypt$${salt.toString('hex')}$${scryptSync(pass, salt, 32).toString('hex')}`;
const db = createClient(get(env, 'SUPABASE_URL'), get(env, 'SUPABASE_SERVICE_KEY'), { auth: { persistSession: false } });
const { error } = await db.from('semibart_users').upsert({
  character: 'check', login: 'check', aliases: [], name: 'Check Account (headless checks)', study: '0', role: 'admin',
  passcode_hash, passcode_set_at: new Date().toISOString(), failed_attempts: 0, locked_until: null
}, { onConflict: 'character' });
if (error) { console.error(error.message); process.exit(1); }
console.log('check account ready: sign in as "check" with SEMIBART_CHECK_PASS');
