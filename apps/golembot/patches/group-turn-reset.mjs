#!/usr/bin/env node
/*
 * Patch the installed golembot gateway so a human message resets the per-group
 * maxTurns counter.
 *
 * Why: `groupChat.maxTurns` is a loop valve — after N bot replies in one group
 * the gateway skips every further message there. Stock golembot only resets the
 * counter after GROUP_TURN_RESET_MS (1 h) of *total* silence in the group, and
 * every human message refreshes that clock. In an active channel the reset
 * therefore never comes: after ten jobs the bot goes deaf, the only trace is a
 * verbose-log line ("maxTurns (10) reached … skipping"), and from Discord it
 * looks like the bot died. This hit Strays repeatedly (2026-09-12).
 *
 * Fix: a message from a non-bot sender clears the counter before the valve is
 * checked. maxTurns then means "consecutive bot-triggered replies with no human
 * in between", which is the runaway bot-to-bot loop the valve exists to stop.
 * The idle-timeout reset is kept as-is. (The Discord adapter drops other bots'
 * messages at the door, so in Discord the valve now never fires; it still
 * guards adapters that deliver bot messages with senderType 'bot'.)
 *
 * Idempotent: exits 0 with "already patched" if the marker is present. Re-run
 * after every `npm i -g golembot` (setup-mini.sh does it).
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2]
  || '/opt/homebrew/lib/node_modules/golembot/dist/gateway.js';
const MARKER = 'golembot-group-turn-reset-patch';

if (!existsSync(FILE)) { console.error(`not found: ${FILE}`); process.exit(1); }
let src = readFileSync(FILE, 'utf8');
if (src.includes(MARKER)) { console.log('already patched'); process.exit(0); }

const OLD = `        const lastActivity = groupLastActivity.get(groupKey) ?? 0;
        if (Date.now() - lastActivity > GROUP_TURN_RESET_MS) {
            groupTurnCounters.delete(groupKey);
        }
        groupLastActivity.set(groupKey, Date.now());`;

const NEW = `        const lastActivity = groupLastActivity.get(groupKey) ?? 0;
        if (Date.now() - lastActivity > GROUP_TURN_RESET_MS) {
            groupTurnCounters.delete(groupKey);
        }
        // ${MARKER}: a human speaking resets the valve. maxTurns now caps
        // consecutive bot-triggered replies, not replies per busy hour.
        if (msg.senderType !== 'bot' && groupTurnCounters.has(groupKey)) {
            groupTurnCounters.delete(groupKey);
        }
        groupLastActivity.set(groupKey, Date.now());`;

if (!src.includes(OLD)) {
  console.error('anchor not found — the gateway changed; re-read dist/gateway.js');
  process.exit(2);
}
src = src.replace(OLD, NEW);

if (!existsSync(FILE + '.orig')) copyFileSync(FILE, FILE + '.orig');
writeFileSync(FILE, src);
console.log('patched ' + FILE);
