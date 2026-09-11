#!/usr/bin/env node
/*
 * Smart-mode triage: a cheap model decides whether the bot should take a turn.
 *
 * Why: under `groupPolicy: smart` the stock gateway spawns the full Claude Code
 * agent (repo, tools, session, the pinned model) on EVERY message in the
 * channel, and the agent itself answers [PASS] when the message is not for it.
 * Two humans chatting cost an agent run per line. This puts a gate in front of
 * that: when a message does not @mention the bot, one headless no-tools call
 * to `groupChat.triageModel` (Sonnet) reads the recent conversation and answers
 * RESPOND or PASS. Only RESPOND reaches the agent. Direct @mentions, DMs and
 * replies to the bot never go through the gate.
 *
 * The gate sees the humans' recent lines (the gateway's in-memory group history,
 * now timestamped) merged with the bot's own recent replies (from
 * .golem/history/<channel>.jsonl), so "follow-up to what the bot just did" is
 * decidable. Rules come from `groupChat.triageRules` in golem.yaml, with a
 * default below. A gate failure logs an error and stays silent — it never
 * falls open into an agent run.
 *
 * Config (golem.yaml → groupChat): triageModel, triageRules (optional),
 * triageTimeoutSeconds (default 45).
 *
 * Idempotent. Re-run after every `npm i -g golembot` (setup-mini.sh does it).
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2]
  || '/opt/homebrew/lib/node_modules/golembot/dist/gateway.js';
const MARKER = 'golembot-smart-triage-patch';

if (!existsSync(FILE)) { console.error(`not found: ${FILE}`); process.exit(1); }
let src = readFileSync(FILE, 'utf8');
if (src.includes(MARKER)) { console.log('already patched'); process.exit(0); }

function replaceOnce(anchor, replacement, what) {
  const i = src.indexOf(anchor);
  if (i < 0) { console.error(`${what}: anchor not found`); process.exit(2); }
  if (src.indexOf(anchor, i + 1) >= 0) { console.error(`${what}: anchor not unique`); process.exit(2); }
  src = src.slice(0, i) + replacement + src.slice(i + anchor.length);
}

// 1. Imports.
replaceOnce(
  `import { DEFAULT_TIMEOUT_SECONDS, loadConfig, scanSkills, } from './workspace.js';`,
  `import { DEFAULT_TIMEOUT_SECONDS, loadConfig, scanSkills, } from './workspace.js';
// ${MARKER}
import { homedir as triageHomedir } from 'node:os';
import { readHistory as triageReadHistory } from './session.js';
import { prependPathEntries as triagePrependPath, resolveCliBinary as triageResolveCli, spawnCommand as triageSpawn } from './engines/shared.js';`,
  'imports',
);

// 2. Timestamp the in-memory group history so bot replies can be interleaved.
replaceOnce(
  `            hist.push({ senderName: msg.senderName ?? msg.senderId, text: userText, isBot: isBotSender });`,
  `            hist.push({ senderName: msg.senderName ?? msg.senderId, text: userText, isBot: isBotSender, ts: Date.now() /* ${MARKER} */ });`,
  'history push',
);

// 3. The gate, right after injectPass is decided and before the agent prompt is built.
replaceOnce(
  `        injectPass = gc.groupPolicy === 'smart' && !mentioned;`,
  `        injectPass = gc.groupPolicy === 'smart' && !mentioned;
        // ${MARKER}: not addressed to us — ask the cheap model whether to take a turn.
        if (injectPass && config.groupChat?.triageModel) {
            const verdict = await triageMessage({
                dir, config, gc, groupKey, hist,
                senderName: msg.senderName ?? msg.senderId, userText, verbose, channelType,
            });
            if (verdict !== 'respond')
                return;
        }`,
  'gate',
);

// 4. The triage function itself.
replaceOnce(
  `// ── Gateway startup ──`,
  `// ${MARKER} ────────────────────────────────────────────────────────────────
const TRIAGE_DEFAULT_RULES = [
  'RESPOND when the newest message is an instruction, request or question aimed at the bot, even without an @mention.',
  'RESPOND when it follows up on something the bot just said or did (the bot\\'s recent replies are shown as [bot:...]).',
  'RESPOND when someone asks for something the bot could build, fix, look up or explain and nobody else is being asked.',
  'PASS when people are talking to each other, thinking out loud, or discussing something the bot has no part in.',
  'PASS on bare acknowledgements, reactions and small talk that ask for nothing.',
  'When in doubt and the bot spoke within the last few messages, RESPOND.',
].join('\\n');
function triageClip(s, n) {
    const t = String(s ?? '').replace(/\\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
}
export async function triageMessage({ dir, config, gc, groupKey, hist, senderName, userText, verbose, channelType }) {
    const tc = config.groupChat ?? {};
    const model = tc.triageModel;
    const started = Date.now();
    try {
        const replies = (await triageReadHistory(dir, groupKey, 80))
            .filter((e) => e.role === 'assistant' && typeof e.content === 'string' && e.content.trim() && e.content.trim() !== '[PASS]')
            .slice(-6)
            .map((e) => ({ ts: Date.parse(e.ts) || 0, senderName: config.name, text: e.content, isBot: true }));
        const humans = hist.slice(0, -1).map((m) => ({ ts: m.ts ?? 0, senderName: m.senderName, text: m.text, isBot: m.isBot }));
        const lines = [...humans, ...replies].sort((a, b) => a.ts - b.ts).slice(-(gc.historyLimit ?? 20));
        const transcript = lines
            .map((m) => \`\${m.isBot ? \`[bot:\${m.senderName}]\` : \`[\${m.senderName}]\`} \${triageClip(m.text, 400)}\`)
            .join('\\n');
        const system = \`You are the attention filter for \${config.name}, a bot that lives in a shared chat channel and does real work when asked (writing code, building pages, answering questions). \` +
            \`You see the recent conversation and the newest message. The newest message did NOT @mention the bot. Decide whether the bot should take a turn now.\\n\\n\` +
            \`Rules:\\n\${typeof tc.triageRules === 'string' && tc.triageRules.trim() ? tc.triageRules.trim() : TRIAGE_DEFAULT_RULES}\\n\\n\` +
            'Answer with exactly one word: RESPOND or PASS.';
        const prompt = \`Recent conversation (oldest first):\\n\${transcript || '(nothing yet)'}\\n\\n\` +
            \`Newest message, from \${senderName}:\\n\${triageClip(userText, 1500)}\\n\\n\` +
            \`Should \${config.name} take a turn? RESPOND or PASS.\`;
        const bin = triageResolveCli('claude', join(triageHomedir(), '.local', 'bin', 'claude'));
        if (!bin)
            throw new Error('claude CLI not found');
        const env = {
            ...process.env,
            PATH: triagePrependPath(process.env.PATH, [join(triageHomedir(), '.local', 'bin')]),
        };
        if (config.oauthToken) {
            env.CLAUDE_CODE_OAUTH_TOKEN = config.oauthToken;
            delete env.ANTHROPIC_API_KEY;
        }
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE_ENTRYPOINT;
        const args = [
            '-p', prompt, '--model', model, '--tools', '', '--system-prompt', system,
            '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '',
            '--no-session-persistence', '--output-format', 'json',
        ];
        const timeoutMs = Math.max(5, tc.triageTimeoutSeconds ?? 45) * 1000;
        const out = await new Promise((resolvePromise, rejectPromise) => {
            const child = triageSpawn(bin, args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            const killer = setTimeout(() => { try { child.kill(); } catch { } rejectPromise(new Error(\`timed out after \${timeoutMs / 1000}s\`)); }, timeoutMs);
            child.stdout.on('data', (d) => { stdout += d; });
            child.stderr.on('data', (d) => { stderr += d; });
            child.on('error', (e) => { clearTimeout(killer); rejectPromise(e); });
            child.on('close', (code) => {
                clearTimeout(killer);
                if (code !== 0)
                    rejectPromise(new Error(\`claude exited \${code}: \${(stderr || stdout).trim().slice(0, 200)}\`));
                else
                    resolvePromise(stdout);
            });
        });
        const json = JSON.parse(out.slice(out.indexOf('{')));
        if (json.is_error)
            throw new Error(String(json.result ?? 'triage call failed').slice(0, 200));
        const answer = String(json.result ?? '').trim();
        const verdict = /\\bRESPOND\\b/i.test(answer) && !/\\bPASS\\b/i.test(answer) ? 'respond'
            : /\\bPASS\\b/i.test(answer) ? 'pass' : 'unclear';
        const inTok = (json.usage?.input_tokens ?? 0) + (json.usage?.cache_read_input_tokens ?? 0) + (json.usage?.cache_creation_input_tokens ?? 0);
        log(verbose, \`[\${channelType}] triage \${verdict}\${verdict === 'unclear' ? \` ("\${answer.slice(0, 40)}")\` : ''} · \${model} · \${Date.now() - started}ms · \${inTok} in · "\${triageClip(userText, 60)}"\`);
        return verdict === 'respond' ? 'respond' : 'pass';
    }
    catch (e) {
        console.error(\`[\${channelType}] triage failed after \${Date.now() - started}ms, staying silent: \${e instanceof Error ? e.message : String(e)}\`);
        return 'pass';
    }
}
// ── Gateway startup ──`,
  'triage function',
);

if (!existsSync(FILE + '.orig')) copyFileSync(FILE, FILE + '.orig');
writeFileSync(FILE, src);
console.log('patched ' + FILE);
