#!/usr/bin/env node
/*
 * Let smart-mode replies stream instead of being held to the end of the turn.
 *
 * Why: when the agent was not @mentioned, the gateway sets injectPass (the
 * "reply [PASS] if you have nothing to add" instruction) and then forces
 * buffered delivery, so a [PASS] can never leak out a token at a time. The cost
 * is that NOTHING reaches the channel until the whole turn finishes — a four
 * minute build shows as four minutes of "Strays is typing", with the agent's
 * own "on it" line arriving at the end, after the work it announced.
 *
 * This replaces the blunt force-buffer with a gate in sendChunk: hold outbound
 * text only while it could still turn out to BE the sentinel (six characters),
 * then release everything held and stream normally. A real reply clears the gate
 * on its first few characters; a [PASS] never gets out.
 *
 * Idempotent. Re-run after every `npm i -g golembot` (setup-mini.sh does it).
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2]
  || '/opt/homebrew/lib/node_modules/golembot/dist/gateway.js';
const MARKER = 'golembot-smart-stream-patch';

if (!existsSync(FILE)) { console.error(`not found: ${FILE}`); process.exit(1); }
let src = readFileSync(FILE, 'utf8');
if (src.includes(MARKER)) { console.log('already patched'); process.exit(0); }

// 1. Stop forcing buffered mode when injectPass is set.
const OLD_MODE = `    const effectiveMode = injectPass ? 'buffered' : streamingConfig.mode;`;
const NEW_MODE = `    // ${MARKER}: was \`injectPass ? 'buffered' : ...\`, which hid every smart-mode
    // reply until the turn ended. The sentinel is now held by the gate in
    // sendChunk instead, so these replies can stream like any other.
    const effectiveMode = streamingConfig.mode;`;
if (!src.includes(OLD_MODE)) { console.error('effectiveMode anchor not found'); process.exit(2); }
src = src.replace(OLD_MODE, NEW_MODE);

// 2. Declare the gate alongside sendChunk. Armed only when a [PASS] is possible.
const OLD_DECL = `    // Pre-declare so processMedia can reference sendChunk for error notices.
    let sendChunk;`;
const NEW_DECL = `    // Pre-declare so processMedia can reference sendChunk for error notices.
    let sendChunk;
    // ${MARKER}: holds outbound text while it could still be the [PASS]/[SKIP]
    // sentinel. Only armed when the agent was told it may pass.
    const sentinelHold = { armed: !!injectPass, buf: '' };`;
if (!src.includes(OLD_DECL)) { console.error('sendChunk declaration anchor not found'); process.exit(2); }
src = src.replace(OLD_DECL, NEW_DECL);

// 3. The gate itself, replacing the exact-match-only sentinel block in sendChunk.
const OLD_GATE = `        // Final safety net: never send [PASS]/[SKIP] sentinel values to IM
        const sentinel = body.trim();
        if (sentinel === '[PASS]' || sentinel === '[SKIP]') {
            log(verbose, \`[\${channelType}] sendChunk blocked sentinel: \${sentinel}\`);
            return;
        }`;
const NEW_GATE = `        // Final safety net: never send [PASS]/[SKIP] sentinel values to IM
        const sentinel = body.trim();
        if (sentinel === '[PASS]' || sentinel === '[SKIP]') {
            log(verbose, \`[\${channelType}] sendChunk blocked sentinel: \${sentinel}\`);
            return;
        }
        // ${MARKER}: a streamed reply can arrive in pieces, so an exact match on
        // one chunk is not enough — "[PASS" and "]" would slip through. While the
        // text so far is still a prefix of a sentinel, hold it; once it cannot be
        // one, release everything held and carry on streaming.
        if (sentinelHold.armed) {
            sentinelHold.buf += body;
            const held = sentinelHold.buf.trim();
            if (held.length < 6 && ('[PASS]'.startsWith(held) || '[SKIP]'.startsWith(held))) {
                return;   // still ambiguous — wait for more
            }
            sentinelHold.armed = false;
            const all = sentinelHold.buf;
            sentinelHold.buf = '';
            if (held === '[PASS]' || held === '[SKIP]') {
                log(verbose, \`[\${channelType}] sendChunk blocked streamed sentinel: \${held}\`);
                return;
            }
            if (all !== body) {
                await sendChunk(all);   // gate is disarmed, so this cannot recurse again
                return;
            }
        }`;
if (!src.includes(OLD_GATE)) { console.error('sendChunk sentinel anchor not found'); process.exit(2); }
src = src.replace(OLD_GATE, NEW_GATE);

if (!existsSync(FILE + '.orig')) copyFileSync(FILE, FILE + '.orig');
writeFileSync(FILE, src);
console.log('patched ' + FILE);
