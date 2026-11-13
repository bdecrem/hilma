// The demo account for showing the game (ola.cx/semibart/demo.html): "demobart", an admin with no study
// of its own, who walks as Bart with spiky hair and a pink T-shirt (DEMO_LOOK in index.html).
// The passcode is given on the command line, never kept in the repo. Idempotent: rewrites the hash.
// Usage: node scripts/semibart/make-demo-account.mjs <passcode>
import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';

const pass = process.argv[2];
if (!pass) { console.error('usage: make-demo-account.mjs <passcode>'); process.exit(1); }
const env = fs.readFileSync('.env.local', 'utf8'), get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.replace(/^"|"$/g, '');
const salt = randomBytes(16);
const passcode_hash = `scrypt$${salt.toString('hex')}$${scryptSync(pass, salt, 32).toString('hex')}`;
const db = createClient(get('SUPABASE_URL'), get('SUPABASE_SERVICE_KEY'), { auth: { persistSession: false } });
const { error } = await db.from('semibart_users').upsert({
  character: 'demobart', login: 'demobart', aliases: [], name: 'Demo Bart', study: '0', role: 'admin',
  passcode_hash, passcode_set_at: new Date().toISOString(), failed_attempts: 0, locked_until: null,
}, { onConflict: 'character' });
if (error) { console.error(error.message); process.exit(1); }
console.log('demo account ready: sign in as "demobart"');
