#!/usr/bin/env node
/*
 * Model fallback: when the pinned model is out of plan usage, re-run the turn
 * on `fallbackModel` and stay there for a while.
 *
 * Why: the bot is pinned to Fable, which has its own weekly bucket on the Max
 * plan. When that bucket is spent the CLI answers every call with "You're out
 * of usage credits…" (or a usage-limit error), and the bot answers every
 * mention with that line until the weekly reset — it looks broken. With this
 * patch the assistant notices that failure, switches to `fallbackModel`
 * (Opus, which draws on the all-models bucket) for `fallbackHoldMinutes`
 * (default 360), replays the same turn, and the gateway drops the failed
 * attempt so the channel only sees the real reply.
 *
 * Config (golem.yaml, top level): fallbackModel, fallbackHoldMinutes.
 * Patches dist/index.js (the switch) and dist/gateway.js (drop the failed
 * attempt's text/error when the switch marker arrives) and dist/workspace.js
 * (read the two keys from golem.yaml).
 *
 * Idempotent. Re-run after every `npm i -g golembot` (setup-mini.sh does it).
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DIST = process.argv[2] || '/opt/homebrew/lib/node_modules/golembot/dist';
const MARKER = 'golembot-model-fallback-patch';
const SWITCH_MSG = 'Switching to fallback model';

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
    if (typeof doc.fallbackModel === 'string')
        config.fallbackModel = doc.fallbackModel;
    if (typeof doc.fallbackHoldMinutes === 'number')
        config.fallbackHoldMinutes = doc.fallbackHoldMinutes;`,
    'config keys',
  );
});

// ── index.js: the switch ────────────────────────────────────────────────────
patchFile('index.js', (replaceOnce) => {
  replaceOnce(
    `    async function* doChat(message, sessionKey, isRetry, controller, images, files) {`,
    `    // ${MARKER}: while Date.now() < fallbackUntil every turn runs on config.fallbackModel.
    let fallbackUntil = 0;
    const LIMIT_ERROR_RE = /out of usage credits|usage credits|usage limit|rate limit|hit your .*limit|limit reached|out of extra usage/i;
    const LIMIT_REPLY_RE = /out of usage credits|\\/usage-credits|usage limit reached|hit your .*(weekly|usage) limit/i;
    const isModelLimitFailure = (gotError, errorMessage, fullReply) => gotError
        ? LIMIT_ERROR_RE.test(errorMessage)
        : fullReply.trim().length < 400 && LIMIT_REPLY_RE.test(fullReply);
    async function* doChat(message, sessionKey, isRetry, controller, images, files) {`,
    'state',
  );
  replaceOnce(
    `        // Model priority: per-engine provider override > modelOverride > provider.model > config.model
        const model = provider?.models?.[engineType] || modelOverride || provider?.model || config.model;`,
    `        // Model priority: per-engine provider override > modelOverride > provider.model > config.model
        // ${MARKER}: a spent primary model is replaced by fallbackModel until fallbackUntil.
        const fallbackActive = !!config.fallbackModel && Date.now() < fallbackUntil;
        const model = fallbackActive
            ? config.fallbackModel
            : (provider?.models?.[engineType] || modelOverride || provider?.model || config.model);`,
    'model resolution',
  );
  replaceOnce(
    `        // Write assistant turn to history (even partial on timeout)
        await appendHistory(dir, {`,
    `        // ${MARKER}: the model itself is unavailable (plan bucket spent) — switch and replay
        // this turn before anything from the failed attempt is recorded.
        if (config.fallbackModel && !fallbackActive && model !== config.fallbackModel && !controller.signal.aborted
            && isModelLimitFailure(gotError, errorMessage, fullReply)) {
            const holdMin = config.fallbackHoldMinutes ?? 360;
            fallbackUntil = Date.now() + holdMin * 60_000;
            const why = (gotError ? errorMessage : fullReply).trim().replace(/\\s+/g, ' ').slice(0, 160);
            console.error(\`[assistant] model \${model} unavailable ("\${why}") — ${SWITCH_MSG} \${config.fallbackModel} for \${holdMin} min\`);
            yield { type: 'warning', message: \`${SWITCH_MSG} \${config.fallbackModel} (\${model} is out of plan usage; back in \${holdMin} min).\` };
            yield* doChat(message, sessionKey, true, controller, images, files);
            return;
        }
        // Write assistant turn to history (even partial on timeout)
        await appendHistory(dir, {`,
    'switch',
  );
});

// ── gateway.js: forget the failed attempt when the switch marker arrives ────
patchFile('gateway.js', (replaceOnce) => {
  // Streaming branch: it has a `buffer`; buffered branch does not. Both share
  // the same warning handler text, so patch each with its surrounding context.
  replaceOnce(
    `                else if (event.type === 'warning') {
                    log(verbose, \`[\${channelType}] warning: \${event.message}\`);
                }
                else if (event.type === 'error') {
                    hasError = true;
                    lastErrorMessage = event.message;
                    console.error(\`[\${channelType}] Engine error: \${event.message}\`);
                }
                else if (event.type === 'completion') {
                    costUsd = event.costUsd;
                    durationMs = event.durationMs;
                    if (event.status === 'completed') {
                        if (!fullReply.trim()) {
                            fullReply = event.finalText;
                            buffer = event.finalText;
                        }
                    }`,
    `                else if (event.type === 'warning') {
                    log(verbose, \`[\${channelType}] warning: \${event.message}\`);
                    // ${MARKER}: the assistant is replaying this turn on another model;
                    // drop whatever the failed attempt produced.
                    if (event.message.startsWith('${SWITCH_MSG}')) {
                        hasError = false;
                        lastErrorMessage = '';
                        fullReply = '';
                        buffer = '';
                    }
                }
                else if (event.type === 'error') {
                    hasError = true;
                    lastErrorMessage = event.message;
                    console.error(\`[\${channelType}] Engine error: \${event.message}\`);
                }
                else if (event.type === 'completion') {
                    costUsd = event.costUsd;
                    durationMs = event.durationMs;
                    if (event.status === 'completed') {
                        if (!fullReply.trim()) {
                            fullReply = event.finalText;
                            buffer = event.finalText;
                        }
                    }`,
    'streaming warning',
  );
  replaceOnce(
    `                else if (event.type === 'warning') {
                    log(verbose, \`[\${channelType}] warning: \${event.message}\`);
                }
                else if (event.type === 'error') {
                    hasError = true;
                    lastErrorMessage = event.message;
                    console.error(\`[\${channelType}] Engine error: \${event.message}\`);
                }
                else if (event.type === 'completion') {
                    costUsd = event.costUsd;
                    durationMs = event.durationMs;
                    if (event.status === 'completed') {
                        if (!fullReply.trim())
                            fullReply = event.finalText;
                    }`,
    `                else if (event.type === 'warning') {
                    log(verbose, \`[\${channelType}] warning: \${event.message}\`);
                    // ${MARKER}: see the streaming branch above.
                    if (event.message.startsWith('${SWITCH_MSG}')) {
                        hasError = false;
                        lastErrorMessage = '';
                        fullReply = '';
                    }
                }
                else if (event.type === 'error') {
                    hasError = true;
                    lastErrorMessage = event.message;
                    console.error(\`[\${channelType}] Engine error: \${event.message}\`);
                }
                else if (event.type === 'completion') {
                    costUsd = event.costUsd;
                    durationMs = event.durationMs;
                    if (event.status === 'completed') {
                        if (!fullReply.trim())
                            fullReply = event.finalText;
                    }`,
    'buffered warning',
  );
});
