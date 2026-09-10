#!/usr/bin/env node
/*
 * Patch the installed golembot Discord adapter to treat a mention of a role the
 * bot holds as a mention of the bot.
 *
 * Why: in Discord, typing "@Strays" autocompletes to whichever entry the picker
 * offers first. When a ROLE shares the bot's name, that is the role, and the
 * message body carries <@&roleId> — the bot's own <@userId> token never appears,
 * so the stock adapter sets mentioned=false and, under groupPolicy:mention-only,
 * the gateway stays silent. Pasting the raw <@userId> works, which is what makes
 * this look like an intermittent bot failure rather than a mention-parsing one.
 *
 * Idempotent: exits 0 with "already patched" if the marker is present. Re-run
 * after every `npm i -g golembot` (setup-mini.sh does it).
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2]
  || '/opt/homebrew/lib/node_modules/golembot/dist/channels/discord.js';
const MARKER = 'golembot-role-mention-patch';

if (!existsSync(FILE)) { console.error(`not found: ${FILE}`); process.exit(1); }
let src = readFileSync(FILE, 'utf8');
if (src.includes(MARKER)) { console.log('already patched'); process.exit(0); }

const OLD = `            const mentionPattern = new RegExp(\`<@!?\${botId}>\`);
            const mentioned = mentionPattern.test(message.content || '');`;

const NEW = `            const mentionPattern = new RegExp(\`<@!?\${botId}>\`);
            let mentioned = mentionPattern.test(message.content || '');
            // ${MARKER}: a role this bot holds counts as a mention of the bot.
            // Discord's picker turns "@Name" into <@&roleId> when a role shares the
            // bot's name, and that token is all the message carries.
            let roleHits = [];
            try {
                const me = message.guild?.members?.me;
                const guildId = message.guild?.id;
                for (const id of me?.roles?.cache?.keys() ?? []) {
                    if (id === guildId) continue;   // @everyone, never a real mention
                    if ((message.content || '').includes(\`<@&\${id}>\`)) roleHits.push(id);
                }
            } catch { /* no guild member cache: fall back to user-token detection */ }
            if (roleHits.length > 0) mentioned = true;`;

if (!src.includes(OLD)) {
  console.error('anchor not found — the adapter changed; re-read dist/channels/discord.js');
  process.exit(2);
}
src = src.replace(OLD, NEW);

// Strip the role tokens from the text too, the same way the user token is stripped,
// so the agent sees "hi" and not "<@&123> hi".
const OLD_TEXT = `            let text = (message.content || '').replace(new RegExp(\`<@!?\${botId}>\`, 'g'), botName ? \`@\${botName}\` : '').trim();`;
const NEW_TEXT = `            let text = (message.content || '').replace(new RegExp(\`<@!?\${botId}>\`, 'g'), botName ? \`@\${botName}\` : '');
            for (const id of roleHits) text = text.replace(new RegExp(\`<@&\${id}>\`, 'g'), botName ? \`@\${botName}\` : '');
            text = text.trim();`;
if (!src.includes(OLD_TEXT)) { console.error('text-normalization anchor not found'); process.exit(2); }
src = src.replace(OLD_TEXT, NEW_TEXT);

if (!existsSync(FILE + '.orig')) copyFileSync(FILE, FILE + '.orig');
writeFileSync(FILE, src);
console.log('patched ' + FILE);
