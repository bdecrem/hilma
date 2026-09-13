#!/usr/bin/env node
/*
 * Fresh session per job.
 *
 * Why: stock golembot keeps ONE Claude Code session per channel and resumes it
 * for sessionTtlDays (30). On 2026-09-13 the straykids session was 339 turns
 * and 11.6 MB, and every call carried ~465k tokens of unrelated earlier jobs —
 * it never compacts, because Fable's 1M window is never full. Every onething
 * job ran on top of that, and a four-command question cost $9.97. An
 * interactive Claude Code session gets cleared between tasks; this is that.
 *
 * Rule (both optional, golem.yaml top level):
 *   freshSessionAfterMinutes — start a new session when the conversation's last
 *                              turn is older than this (a new job, not a follow-up)
 *   freshSessionAfterTokens  — or when the resumed transcript's last call used
 *                              more than this many input tokens (read from
 *                              ~/.claude/projects/<workspace>/<session>.jsonl)
 * The new session's prompt gets a [System: …] note saying it is fresh and why,
 * that the recent channel lines in the prompt + the repo are its context, and
 * where the previous transcript is (to tail, not to read). The stock "read
 * your history file to restore context" hint is suppressed in that case — it
 * would send the agent into an 11 MB file. `/reset` still forces a fresh
 * session by hand; the group history the gateway shows is untouched.
 *
 * Patches dist/workspace.js (keys), dist/session.js (helpers, exported so the
 * harness can test the rule) and dist/index.js (the decision).
 * Idempotent. Re-run after every `npm i -g golembot` (setup-mini.sh does it).
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] || '/opt/homebrew/lib/node_modules/golembot/dist';
const MARKER = 'golembot-fresh-session-patch';

function patchFile(name, fn) {
  const file = join(DIST, name);
  if (!existsSync(file)) { console.error(`not found: ${file}`); process.exit(1); }
  let src = readFileSync(file, 'utf8');
  if (src.includes(MARKER)) { console.log(`${name}: already patched`); return; }
  const replaceOnce = (anchor, replacement, what) => {
    const i = src.indexOf(anchor);
    if (i < 0) { console.error(`${name} ${what}: anchor not found`); process.exit(2); }
    if (src.indexOf(anchor, i + 1) >= 0) { console.error(`${name} ${what}: anchor not unique`); process.exit(2); }
    src = src.slice(0, i) + replacement + src.slice(i + anchor.length);
  };
  fn(replaceOnce);
  if (!existsSync(file + '.orig')) copyFileSync(file, file + '.orig');
  writeFileSync(file, src);
  console.log('patched ' + file);
}

// ── workspace.js: read the keys ─────────────────────────────────────────────
patchFile('workspace.js', (replaceOnce) => {
  replaceOnce(
    `    if (typeof doc.systemPrompt === 'string')
        config.systemPrompt = doc.systemPrompt;`,
    `    if (typeof doc.systemPrompt === 'string')
        config.systemPrompt = doc.systemPrompt;
    // ${MARKER}
    if (typeof doc.freshSessionAfterMinutes === 'number')
        config.freshSessionAfterMinutes = doc.freshSessionAfterMinutes;
    if (typeof doc.freshSessionAfterTokens === 'number')
        config.freshSessionAfterTokens = doc.freshSessionAfterTokens;`,
    'config keys',
  );
});

// ── session.js: the helpers ─────────────────────────────────────────────────
patchFile('session.js', (replaceOnce) => {
  replaceOnce(
    `export async function saveSession(dir, sessionId, key, engineType) {`,
    `// ${MARKER} ──────────────────────────────────────────────────────────────
/** The stored entry (id + lastUsed) for a session key, or undefined. */
export async function loadSessionEntry(dir, key, engineType) {
    const store = await readStore(dir);
    const entry = store[key || DEFAULT_KEY];
    if (!entry || !entry.engineSessionId)
        return undefined;
    if (engineType && entry.engineType && entry.engineType !== engineType)
        return undefined;
    return entry;
}
/** Claude Code's transcript for a session: ~/.claude/projects/<workspace-encoded>/<id>.jsonl */
export function transcriptPath(workspace, sessionId, projectsDir) {
    const base = projectsDir || join(process.env.HOME || '', '.claude', 'projects');
    return join(base, workspace.replace(/[^A-Za-z0-9]/g, '-'), \`\${sessionId}.jsonl\`);
}
/** Input tokens the transcript's last API call carried (input + cache), or undefined if unknown. */
export function transcriptTokens(workspace, sessionId, projectsDir) {
    try {
        const path = transcriptPath(workspace, sessionId, projectsDir);
        const { openSync, fstatSync, readSync, closeSync } = require('node:fs');
        const fd = openSync(path, 'r');
        try {
            const size = fstatSync(fd).size;
            const len = Math.min(size, 256 * 1024);
            const buf = Buffer.alloc(len);
            readSync(fd, buf, 0, len, size - len);
            const tail = buf.toString('utf8');
            const re = /"input_tokens":(\\d+),"cache_creation_input_tokens":(\\d+),"cache_read_input_tokens":(\\d+)/g;
            let m, last;
            while ((m = re.exec(tail)) !== null)
                last = m;
            if (!last)
                return undefined;
            return Number(last[1]) + Number(last[2]) + Number(last[3]);
        }
        finally {
            closeSync(fd);
        }
    }
    catch {
        return undefined;
    }
}
/** Should the next turn start a fresh session instead of resuming \`entry\`? */
export function sessionRotation(entry, tokens, config, now = Date.now()) {
    if (!entry)
        return { rotate: false };
    const minutes = config.freshSessionAfterMinutes;
    const maxTokens = config.freshSessionAfterTokens;
    if (minutes && entry.lastUsed && now - entry.lastUsed > minutes * 60_000) {
        const idleMin = Math.round((now - entry.lastUsed) / 60_000);
        const idle = idleMin >= 120 ? \`\${Math.floor(idleMin / 60)}h\${String(idleMin % 60).padStart(2, '0')}m\` : \`\${idleMin} min\`;
        return { rotate: true, reason: \`the previous turn was \${idle} ago (limit \${minutes} min)\` };
    }
    if (maxTokens && tokens !== undefined && tokens > maxTokens) {
        return { rotate: true, reason: \`the previous session's context had reached ~\${Math.round(tokens / 1000)}k tokens (limit \${Math.round(maxTokens / 1000)}k)\` };
    }
    return { rotate: false };
}
export async function saveSession(dir, sessionId, key, engineType) {`,
    'helpers',
  );
  // session.js is ESM; give the helper a require() for the sync fs calls.
  replaceOnce(
    `import { join } from 'node:path';`,
    `import { join } from 'node:path';
import { createRequire } from 'node:module'; // ${MARKER}
const require = createRequire(import.meta.url);`,
    'require shim',
  );
});

// ── index.js: the decision ──────────────────────────────────────────────────
patchFile('index.js', (replaceOnce) => {
  replaceOnce(
    `import { appendHistory, clearSession, getHistoryPath, loadSession, pruneExpiredSessions, resetConversation, saveSession, } from './session.js';`,
    `import { appendHistory, clearSession, getHistoryPath, loadSession, pruneExpiredSessions, resetConversation, saveSession, loadSessionEntry, transcriptTokens, transcriptPath, sessionRotation, } from './session.js'; // ${MARKER}`,
    'imports',
  );
  replaceOnce(
    `        const sessionId = await loadSession(dir, sessionKey, engineType);`,
    `        let sessionId = await loadSession(dir, sessionKey, engineType);
        // ${MARKER}: a new job gets a new session; see the patch header for the rule.
        let freshNote = '';
        if (sessionId && !isRetry && (config.freshSessionAfterMinutes || config.freshSessionAfterTokens)) {
            const entry = await loadSessionEntry(dir, sessionKey, engineType);
            // (config.workdir is the repo-workdir patch: transcripts live under the CLI's cwd)
            const tokens = transcriptTokens(config.workdir || dir, sessionId);
            const rot = sessionRotation(entry, tokens, config);
            if (rot.rotate) {
                console.error(\`[assistant] fresh session for \${sessionKey || 'default'}: \${rot.reason} (was \${sessionId}, ~\${tokens === undefined ? '?' : Math.round(tokens / 1000)}k tokens)\`);
                yield { type: 'warning', message: \`Fresh session: \${rot.reason}.\` };
                await clearSession(dir, sessionKey);
                freshNote =
                    \`[System: This is a fresh session — \${rot.reason}. Nothing from earlier sessions is in your memory: \` +
                        \`the recent channel lines in this prompt, the repo (git log, CLAUDE.md) and its docs are your context. \` +
                        \`If the request continues earlier work you cannot reconstruct from those, the previous session's transcript is at \` +
                        \`\${transcriptPath(config.workdir || dir, sessionId)} — tail it for what you need, do not read it whole.]\`;
                sessionId = undefined;
            }
        }`,
    'decision',
  );
  replaceOnce(
    `        let finalMessage = message;
        if (!sessionId) {
            const hPath = getHistoryPath(dir, sessionKey);`,
    `        let finalMessage = message;
        // ${MARKER}: no session to resume but a history file exists (a /reset, a cleared
        // store, a pruned session) — brief it the same way, never "read your history file"
        // (2026-09-13: that sent the agent into the 11 MB channel history on "Hi").
        if (!freshNote && !sessionId && existsSync(getHistoryPath(dir, sessionKey))) {
            freshNote =
                \`[System: This is a fresh session — there is no stored session to resume. Nothing from earlier sessions is in your memory: \` +
                    \`the recent channel lines in this prompt, the repo (git log, CLAUDE.md) and its docs are your context. \` +
                    \`Do not read the channel history file; if the request continues earlier work, git log and the docs are where to look.]\`;
        }
        if (freshNote) {
            // ${MARKER}: our own briefing instead of "read your history file".
            finalMessage = \`\${freshNote}\\n\\n\${message}\`;
        }
        else if (!sessionId) {
            const hPath = getHistoryPath(dir, sessionKey);`,
    'briefing',
  );
});
