#!/usr/bin/env node
// Ola's whole fork of opencode: the logo, the window title and a few sentences in the terminal interface.
// Nothing about behavior. Run against a clean checkout of the tag in UPSTREAM:
//   node rebrand.mjs <checkout>            apply
//   node rebrand.mjs <checkout> --check    say what would change, write nothing
// Every edit names the exact text it replaces and how many times it must appear. If upstream moved or reworded
// one, this exits 1 with "patches no longer apply: <file>: <text>" so a new release is never rebranded by guess.
import fs from 'node:fs'; import path from 'node:path';
const [root, flag] = process.argv.slice(2);
if (!root) { console.error('usage: rebrand.mjs <opencode checkout> [--check]'); process.exit(2); }
const check = flag === '--check';

// The wordmark, in opencode's own block letters (in a line: _ is a shadowed cell, ^ a half block on shadow).
// logo.left is drawn muted and logo.right bold, side by side; Ola is one bold word, so left is empty.
const LOGO = `export const logo = {
  left: ["", "", "", ""],
  right: ["     ▄      ", "█▀▀█ █ ▀▀▀█", "█__█ █ █^^█", "▀▀▀▀ ▀ ▀▀▀▀"],
}

// The small mark (narrow terminals, the line printed when a conversation ends): the same word.
export const go = {
  left: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
  right: ["     ▄      ", "█▀▀█ █ ▀▀▀█", "█__█ █ █^^█", "▀▀▀▀ ▀ ▀▀▀▀"],
}
`;

const T = 'packages/tui/src/';
const edits = [
  // [file, exact text, replacement, times it must appear]
  [T + 'app.tsx', 'setTerminalTitle(renderer, "OpenCode")', 'setTerminalTitle(renderer, "Ola")', 2],
  [T + 'attention.ts', 'const DEFAULT_TITLE = "OpenCode"', 'const DEFAULT_TITLE = "Ola"', 1],
  [T + 'mini/runtime.lifecycle.ts', 'setTerminalTitle(renderer, "OpenCode")', 'setTerminalTitle(renderer, "Ola")', 1],
  [T + 'mini/footer.permission.tsx', 'Tell OpenCode what to do differently', 'Tell Ola what to do differently', 2],
  [T + 'routes/session/permission.tsx', 'Tell OpenCode what to do differently', 'Tell Ola what to do differently', 1],
  [T + 'mini/footer.prompt.tsx', 'description: "close OpenCode"', 'description: "close Ola"', 1],
  [T + 'component/terminal-pane.tsx', 'restart OpenCode"', 'restart Ola"', 1],
  [T + 'component/error-component.tsx', 'OpenCode crashed', 'Ola crashed', 1],
  // What is printed when a conversation ends: how to pick it up again, with the ola command.
  [T + 'util/presentation.ts', 'row("Continue", `opencode -s ${input.session.sessionID}`)', 'row("Continue", `ola -c`)', 1],
  [T + 'mini/splash.ts', 'const command = `opencode mini -s ${meta.session_id}`', 'const command = `ola -c`', 1],
  [T + 'component/error-component.tsx', '<text fg={colors.muted}>OpenCode {app.version}</text>', '<text fg={colors.muted}>Ola (opencode {app.version})</text>', 1],
];

const fail = (m) => { console.error('patches no longer apply: ' + m); process.exit(1); };
const count = (s, t) => s.split(t).length - 1;
const files = new Map();
const read = (f) => { if (!files.has(f)) { const p = path.join(root, f); if (!fs.existsSync(p)) fail(f + ': file is gone'); files.set(f, fs.readFileSync(p, 'utf8')); } return files.get(f); };

const logoFile = T + 'logo.ts';
const old = read(logoFile);
if (!old.includes('█▀▀█ █▀▀█ █▀▀█ █▀▀▄') || !/export const logo = \{/.test(old) || !/export const go = \{/.test(old) || count(old, 'export const') !== 2)
  fail(logoFile + ': the logo is not the one this was written for');
files.set(logoFile, LOGO);
for (const [f, from, to, n] of edits) {
  const s = read(f), have = count(s, from);
  if (have !== n) fail(`${f}: "${from}" appears ${have} time(s), expected ${n}`);
  files.set(f, s.split(from).join(to));
}
// The logo's two halves must stay the same height, as the component that draws them assumes.
if (!check) for (const [f, s] of files) fs.writeFileSync(path.join(root, f), s);
console.log(`${check ? 'would change' : 'changed'} ${files.size} files (${edits.reduce((a, e) => a + e[3], 0)} sentences, the logo)`);
