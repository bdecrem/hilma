#!/usr/bin/env node
/*
 * Graceful timeout: say what was cut off, and tell the next turn about it.
 *
 * Why: when a run hits `timeout` the child is killed mid-work. Stock golembot
 * posts "Task timed out after 1200s." and forgets; the working tree keeps the
 * half-done edits, and the next turn — resumed or fresh — starts with no idea
 * a run was cut. Two real jobs died that way on 2026-09-13 ("Done?" → timed
 * out, twice) and the reply the channel saw was the partial text plus nothing.
 *
 * With this patch:
 *  - the channel notice says what it means (limit in minutes, pushed work is
 *    live, unpushed edits are still in the tree, say "continue"),
 *  - the assistant remembers the cut-off per session key and prefixes the next
 *    prompt in that conversation with a [System: …] note: check `git status`
 *    and `git log -3` first, say what state it is in, finish from there.
 *
 * Patches dist/gateway.js (the notice) and dist/index.js (the memory + note).
 * Idempotent. Re-run after every `npm i -g golembot` (setup-mini.sh does it).
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] || '/opt/homebrew/lib/node_modules/golembot/dist';
const MARKER = 'golembot-graceful-timeout-patch';

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

// ── gateway.js: the channel notice ──────────────────────────────────────────
patchFile('gateway.js', (replaceOnce) => {
  replaceOnce(
    `    if (/timed out/i.test(errorMessage)) {
        return {
            reply: hasPartialOutput
                ? \`Task timed out after \${timeoutSeconds}s. The partial reply above may be incomplete.\`
                : \`Task timed out after \${timeoutSeconds}s.\`,
            status: \`⚠️ Timed out (\${timeoutSeconds}s)\`,
        };
    }`,
    `    if (/timed out/i.test(errorMessage)) {
        // ${MARKER}: say what a cut-off means and how to resume.
        const minutes = Math.round(timeoutSeconds / 60);
        return {
            reply: \`Cut off by the \${minutes}-minute limit while still working. Whatever was pushed is live; \` +
                \`unpushed edits are still in the working tree. Say "continue" and I will pick it up from there.\`,
            status: \`⚠️ Cut off (\${minutes} min)\`,
        };
    }`,
    'timeout notice',
  );
});

// ── index.js: remember the cut-off, brief the next turn ─────────────────────
patchFile('index.js', (replaceOnce) => {
  replaceOnce(
    `    let fallbackUntil = 0;`,
    `    let fallbackUntil = 0;
    // ${MARKER}: sessionKey → { at, minutes, lastText } for runs killed by the time limit.
    const cutOffRuns = new Map();`,
    'state',
  );
  replaceOnce(
    `        // Save attached files to workspace temp dir so the agent can read them
        const filePaths = [];`,
    `        // ${MARKER}: the previous run in this conversation was cut off — brief this one.
        const cutOff = cutOffRuns.get(sessionKey || 'default');
        if (cutOff && !isRetry) {
            cutOffRuns.delete(sessionKey || 'default');
            const said = cutOff.lastText ? \` The last thing it said: "\${cutOff.lastText}".\` : '';
            finalMessage =
                \`[System: Your previous run in this conversation was cut off by the \${cutOff.minutes}-minute time limit at \${cutOff.at} while still working.\${said} \` +
                    \`Before anything else, check \\\`git status\\\` and \\\`git log -3\\\` in the repo, say in one line what state the work is in, and finish from there — do not start over.]\\n\\n\` +
                    finalMessage;
        }
        // Save attached files to workspace temp dir so the agent can read them
        const filePaths = [];`,
    'brief the next turn',
  );
  replaceOnce(
    `        // golembot-model-fallback-patch: the model itself is unavailable (plan bucket spent) — switch and replay`,
    `        // ${MARKER}: killed by the time limit (not by the user) — remember it for the next turn.
        if (controller.signal.aborted && controller.signal.reason !== 'user') {
            const minutes = Math.round(timeoutMs / 60000);
            cutOffRuns.set(sessionKey || 'default', {
                at: new Date().toISOString(),
                minutes,
                lastText: fullReply.trim().replace(/\\s+/g, ' ').slice(-200),
            });
            console.error(\`[assistant] run for \${sessionKey || 'default'} cut off by the \${minutes}-minute limit; the next turn is told to check the working tree first\`);
        }
        // golembot-model-fallback-patch: the model itself is unavailable (plan bucket spent) — switch and replay`,
    'remember the cut-off',
  );
});
