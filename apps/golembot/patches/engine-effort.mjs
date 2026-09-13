#!/usr/bin/env node
/*
 * Effort level: pass `effort` from golem.yaml to Claude Code as `--effort`.
 *
 * Why: stock golembot passes only `--model` to the CLI, so the bot runs at the
 * CLI's default effort while an interactive session on the same model runs at
 * whatever the person set (high here). Same model, less thinking per step.
 *
 * Config (golem.yaml, top level): effort: low | medium | high | xhigh | max.
 * Patches dist/workspace.js (read the key), dist/index.js (hand it to the
 * engine, and name it in the invoke debug line) and dist/engines/claude-code.js
 * (the flag).
 *
 * Idempotent. Re-run after every `npm i -g golembot` (setup-mini.sh does it).
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] || '/opt/homebrew/lib/node_modules/golembot/dist';
const MARKER = 'golembot-engine-effort-patch';

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

// ── workspace.js: read the key ──────────────────────────────────────────────
patchFile('workspace.js', (replaceOnce) => {
  replaceOnce(
    `    if (typeof doc.systemPrompt === 'string')
        config.systemPrompt = doc.systemPrompt;`,
    `    if (typeof doc.systemPrompt === 'string')
        config.systemPrompt = doc.systemPrompt;
    // ${MARKER}
    if (typeof doc.effort === 'string')
        config.effort = doc.effort;`,
    'config key',
  );
});

// ── index.js: hand it to the engine ─────────────────────────────────────────
patchFile('index.js', (replaceOnce) => {
  replaceOnce(
    `provider=\${!!provider} mcp=\${config.mcp ? Object.keys(config.mcp).length : 0} model=\${model ?? '(default)'}\``,
    `provider=\${!!provider} mcp=\${config.mcp ? Object.keys(config.mcp).length : 0} model=\${model ?? '(default)'} effort=\${config.effort ?? '(default)'}\``,
    'debug line',
  );
  replaceOnce(
    `                mcpConfig: config.mcp,
            })) {`,
    `                mcpConfig: config.mcp,
                effort: config.effort, // ${MARKER}
            })) {`,
    'invoke opts',
  );
});

// ── engines/claude-code.js: the flag ────────────────────────────────────────
patchFile('engines/claude-code.js', (replaceOnce) => {
  replaceOnce(
    `        if (opts.model && !opts.provider)
            args.push('--model', opts.model);`,
    `        if (opts.model && !opts.provider)
            args.push('--model', opts.model);
        // ${MARKER}: effort level from golem.yaml (low|medium|high|xhigh|max)
        if (opts.effort) {
            if (!/^(low|medium|high|xhigh|max)$/.test(opts.effort))
                throw new Error(\`effort must be one of low|medium|high|xhigh|max, got "\${opts.effort}"\`);
            args.push('--effort', opts.effort);
        }`,
    'effort flag',
  );
});
