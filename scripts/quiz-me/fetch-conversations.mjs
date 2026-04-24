#!/usr/bin/env node
// Opens claude.ai in Playwright with a persistent profile.
// First run: you log in (browser window appears). Subsequent runs: session reused.
// Fetches every conversation's full message tree via claude.ai's internal API.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
// Keep the Playwright profile OUTSIDE the project tree — it contains unix sockets
// that crash Turbopack when it scans the workspace for source files.
const PROFILE_DIR = path.join(process.env.HOME, 'Library', 'Application Support', 'hilma-quiz-me', 'playwright-profile');
const OUT = path.join(DATA_DIR, 'conversations.json');

const HEADLESS = process.env.HEADLESS === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const SESSION_KEY = process.env.CLAUDE_SESSION_KEY || '';

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(PROFILE_DIR, { recursive: true });

const useToken = !!SESSION_KEY;
console.log(`→ launching chromium (headless=${HEADLESS || useToken}, auth=${useToken ? 'token' : 'interactive'})`);
const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: useToken ? true : HEADLESS,
  viewport: { width: 1200, height: 900 },
  args: ['--disable-blink-features=AutomationControlled', '--window-position=100,80'],
});

if (useToken) {
  await ctx.addCookies([{
    name: 'sessionKey',
    value: SESSION_KEY,
    domain: '.claude.ai',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }]);
  console.log('→ injected sessionKey cookie');
}

const page = ctx.pages()[0] ?? await ctx.newPage();

await page.goto('https://claude.ai/', { waitUntil: 'domcontentloaded' });
if (!useToken) await page.bringToFront();

// Force the Chromium window to the front via macOS osascript.
try {
  await pexec(`osascript -e 'tell application "Chromium" to activate' 2>/dev/null || osascript -e 'tell application "Playwright" to activate' 2>/dev/null || true`);
} catch {}

if (!useToken) {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  ACTION REQUIRED: a Chromium window just opened at claude.ai.    ');
  console.log('  Please LOG IN there (Google SSO is fastest).                    ');
  console.log('  This script will continue automatically once you are signed in.');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('');
}

// Poll /api/organizations until it returns a valid JSON array (i.e. user is authenticated).
console.log('→ please log in to claude.ai in the browser window that opened.');
console.log('  (waiting up to 5 min — this script will auto-continue once you are signed in)');

// Audible alert so the user actually notices the browser window.
try {
  await pexec(`say "Claude Code needs you to sign in to claude dot ay eye" 2>/dev/null &`);
} catch {}

const DEADLINE = Date.now() + 60 * 60 * 1000; // 1 hour, effectively wait-forever
let orgs = null;
let lastLogged = 0;
let lastAlert = Date.now();
while (Date.now() < DEADLINE) {
  if (Date.now() - lastLogged > 15000) {
    console.log(`  ... still waiting for login`);
    lastLogged = Date.now();
  }
  // Re-alert + re-focus every 60s.
  if (Date.now() - lastAlert > 60000) {
    try {
      await pexec(`osascript -e 'tell application "Chromium" to activate' 2>/dev/null || true`);
      await pexec(`say "Sign in to claude dot ay eye" 2>/dev/null &`);
    } catch {}
    lastAlert = Date.now();
  }
  const result = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/organizations', {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || !ct.includes('json')) return { ok: false, status: r.status, ct };
      const body = await r.json();
      return { ok: true, body };
    } catch (e) { return { ok: false, error: String(e) }; }
  });
  if (result.ok && Array.isArray(result.body) && result.body.length > 0) {
    orgs = result.body;
    break;
  }
  await new Promise(r => setTimeout(r, 3000));
}
if (!orgs) {
  console.error('✗ login timed out. aborting.');
  await ctx.close();
  process.exit(1);
}
console.log('→ logged in. orgs:', orgs.map(o => o.name || o.uuid));

const allConversations = [];

for (const org of orgs) {
  const orgId = org.uuid;
  console.log(`\n→ fetching list for org "${org.name || orgId}"`);

  let list;
  try {
    list = await page.evaluate(async (orgId) => {
      const r = await fetch(`/api/organizations/${orgId}/chat_conversations`, {
        credentials: 'include',
        headers: { 'accept': 'application/json' },
      });
      if (!r.ok) throw new Error(`list failed: ${r.status}`);
      return r.json();
    }, orgId);
  } catch (e) {
    // Don't crash the whole run on one inaccessible org — save what we have.
    console.warn(`  ⚠ skipping "${org.name || orgId}": ${e.message}`);
    continue;
  }

  console.log(`  found ${list.length} conversations`);

  const toFetch = list.slice(0, LIMIT);
  let done = 0;
  for (const conv of toFetch) {
    try {
      const full = await page.evaluate(async ({ orgId, uuid }) => {
        const r = await fetch(
          `/api/organizations/${orgId}/chat_conversations/${uuid}?tree=True&rendering_mode=messages`,
          { credentials: 'include', headers: { 'accept': 'application/json' } },
        );
        if (!r.ok) throw new Error(`conv ${uuid} failed: ${r.status}`);
        return r.json();
      }, { orgId, uuid: conv.uuid });
      allConversations.push({ orgId, orgName: org.name, ...full });
      done++;
      if (done % 10 === 0 || done === toFetch.length) {
        console.log(`  fetched ${done}/${toFetch.length}`);
      }
      await new Promise(r => setTimeout(r, 120)); // gentle
    } catch (e) {
      console.warn(`  skipped ${conv.uuid}: ${e.message}`);
    }
  }
}

await fs.writeFile(OUT, JSON.stringify(allConversations, null, 2));
console.log(`\n✓ saved ${allConversations.length} conversations → ${OUT}`);

await ctx.close();
