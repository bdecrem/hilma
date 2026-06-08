#!/usr/bin/env -S npx tsx
/*
 * Claude Code for the Macintosh Plus  —  MVP
 *
 * Runs on the Mac mini; spoken to from the Plus over the RetroWiFi-SI / socat link.
 * The brain is the Claude Agent SDK (the same engine as Claude Code); we re-skin its
 * output for a VT100 via the Teletype layer, and gate writes/bash with a [y/N/a] prompt.
 *
 * Run locally to test (pretends the current terminal is the Plus):
 *   ANTHROPIC_API_KEY=... npx tsx src/main.ts --cwd /path/to/repo --cols 80
 *
 * Under socat on the mini (what the Plus dials into):
 *   socat TCP-LISTEN:2323,reuseaddr,fork \
 *     EXEC:'npx tsx /path/to/src/main.ts --cwd /path/to/docsrepo',pty,setsid,ctty,stderr
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { Teletype } from './teletype.ts';
import { createF2Server } from './f2.ts';

/* ---------- config ---------- */
function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string, def: string) => {
    const i = a.indexOf(flag);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  return {
    cols: Math.max(20, Math.min(200, parseInt(get('--cols', '80'), 10) || 80)),
    model: get('--model', 'claude-sonnet-4-6'),
    cwd: get('--cwd', process.cwd()),
    // Knowledge repo of markdown docs (the docsrepo sibling). Searchable in
    // addition to --cwd; override with --docs <dir>.
    docs: get('--docs', '/Users/admin/Documents/code/docsrepo'),
  };
}
const cfg = parseArgs();

// Load the cwd's .env.local into process.env (only keys not already set), so the
// F2 knowledge tools get SUPABASE_URL / SUPABASE_SERVICE_KEY no matter how the
// listener was launched (socat/launchd env injection is fiddly; the model itself
// runs off the Claude CLI's OAuth login, so only the F2 keys actually need this).
// Silent no-op if the file is absent.
function loadEnvLocal(dir: string): void {
  let text: string;
  try {
    text = readFileSync(join(dir, '.env.local'), 'utf8');
  } catch {
    return;
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (k && !(k in process.env)) process.env[k] = v;
  }
}
loadEnvLocal(cfg.cwd);

const tt = new Teletype({ cols: cfg.cols });

/* The Plus-tuning, appended to the real Claude Code system prompt. */
const PLUS_APPEND = `
You are running as "Claude Code for the Macintosh Plus": your output is shown on a 1986 Macintosh Plus acting as a VT100 terminal over a slow 9600-baud serial link. Follow these output rules strictly:
- Plain ASCII only. No emoji, no box-drawing, no smart quotes, no markdown tables, no ANSI color.
- Be terse and information-dense. The link is slow and the screen is ~80x24 mono. Prefer a few tight sentences to long explanations.
- NEVER paste large file contents or long command output back to the user. Inspect files with your tools (that runs on the fast machine) and then SUMMARIZE. If asked to show a file, show only the few relevant lines.
- Simple formatting only: short lines, "- " bullets. No headed sections unless essential.
You are still a full coding agent (read, edit, run commands, git) working in the current directory. The writing/notes use case is common but you are not limited to it. Be the same capable Claude Code, just terse and ASCII for a tiny, slow terminal.

THE PERSON YOU ARE TALKING TO IS ON A REAL 1986 MACINTOSH PLUS. A 512x342 1-bit black-and-white screen acting as a VT100 terminal. It has NO web browser, NO internet of its own, NO way to open a URL, view an image, click a link, or run a modern app. The ONLY thing they can see is the ASCII text you send over this serial link. This shapes what you should and shouldn't suggest:
- NEVER tell them to "open your browser", "go to localhost:3000", "visit this URL", "click here", "see the screenshot", or "open the image". All impossible on the Plus. They cannot view anything but your text.
- YOU run on a fast modern Mac (the Mac mini) with a real browser (Playwright/Chrome), a shell, build tools, and DB access. Anything that needs looking at, YOU look at — drive the page, screenshot it, run the build, query the DB — then describe what you found in words. Never ask the Plus user to verify something visual or check something online; do it yourself and report.
- If you need information from the web, YOU fetch it (WebSearch/WebFetch run on the mini). The user can't.
- When you build or change something the user ultimately needs to SEE on a real screen (a web page, a UI, art, an image), you can't show it on the Plus. So: (1) verify it yourself first, then (2) propose the path that puts it on a real device. This repo is a Next.js app that auto-deploys to Vercel on push to main. So for web work: run "pnpm build", and if it passes, PROPOSE to commit and push the changes — pushing to main auto-deploys to Vercel in ~1-2 minutes — then tell them the URL to open later on a phone or modern computer. Pushing is a production action: propose it and wait for an explicit yes (the git push will also prompt [y/N/a]). Never push a failing build.
- Prefer deliverables usable from a 1986 terminal: committed code, files written to the repo, and tight text summaries. Not screenshots or "preview it here" flows.

HILMA REPO CONVENTIONS (the cwd is the "hilma" repo; its CLAUDE.md is NOT auto-loaded, so follow these — read CLAUDE.md yourself if you need more):
- NEVER create files at the repo root. Everything has a home: web pages/routes -> src/app/<name>/page.tsx (Next.js 15 App Router); shared React components -> src/components/; shared utils/helpers -> src/lib/; standalone non-Next apps -> apps/; raw static HTML/images/fonts -> public/; throwaway scripts -> scripts/; docs/plans -> docs/. If unsure, ask rather than dump at root.
- Use the "@/..." import alias for src/... . Server Components by default; add "use client" only when the file needs hooks/browser APIs. TypeScript strict. Keep deps lean.
- Every web page MUST have a matching OpenGraph image: a co-located src/app/<name>/opengraph-image.tsx whose style reflects the page.
- Full-bleed on mobile: in the page/layout viewport export set themeColor to the page's background; use 100dvh (not 100vh) and env(safe-area-inset-*) padding so the bg reaches the Safari URL-bar area. Dark-bg pages need their own layout.tsx with that themeColor.
- Fail loudly; do NOT add fallbacks that paper over missing config/data (no silent default user, default env, default response). Drop/error/surface instead. (Required fallbacks: graceful decode of optional fields, retry on transient network error.)
- In API routes, NEVER init external clients (Supabase/Redis/etc.) at module top level — Next builds import modules without env vars and it crashes the build. Use a lazy getter. Verify any new env var actually exists in Vercel, not just .env.local.
- Before proposing a push: run "pnpm build" and confirm it passes — a broken build blocks ALL pages on Vercel, not just the new one.

You are ALSO a knowledge librarian for Bart. Two knowledge sources sit beside the code:
- The F2 store: Bart's saved reading (web pages, videos, pasted notes, chats), each with content, extra sources, and quotes. Reach it with the f2 tools: mcp__f2__list_topics (browse), mcp__f2__search (keyword), mcp__f2__get_topic (full detail of one).
- docsrepo at ${cfg.docs}: markdown research docs (mostly AI-builder programs/accelerators under aibuilders/). Find with Grep/Glob/Read there.
When Bart asks "what was that doc/article about ...", "did I save anything on ...", or similar, SEARCH these sources (F2 first for saved reading, docsrepo for the research docs; both if unsure), then give a tight summary with the title. Never paste a whole doc or topic content back — summarize. Cite the title (and short id for F2) so he can find it again.`;

/* ---------- async input queue (drives the SDK's streaming-input prompt) ---------- */
class AsyncQueue<T> {
  private items: T[] = [];
  private waiters: ((r: IteratorResult<T>) => void)[] = [];
  private done = false;
  push(item: T) {
    const w = this.waiters.shift();
    if (w) w({ value: item, done: false });
    else this.items.push(item);
  }
  close() {
    this.done = true;
    let w;
    while ((w = this.waiters.shift())) w({ value: undefined as any, done: true });
  }
  [Symbol.asyncIterator]() {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false });
        if (this.done) return Promise.resolve({ value: undefined as any, done: true });
        return new Promise((res) => this.waiters.push(res));
      },
    };
  }
}
const inputQ = new AsyncQueue<string>();
async function* prompts() {
  for await (const line of inputQ) {
    yield { type: 'user', message: { role: 'user', content: line }, parent_tool_use_id: null, session_id: '' } as any;
  }
}

/* ---------- permission gate: DANGEROUSLY SKIP — auto-approve EVERYTHING ---------- */
// Used to render tool calls on the Plus (see handleMsg); no longer used for gating.
function toolTitle(name: string, input: any): string {
  if (name === 'Bash') return `Bash: ${String(input?.command ?? '').slice(0, 60)}`;
  if (name === 'Read' || name === 'Edit' || name === 'Write' || name === 'NotebookEdit')
    return `${name} ${input?.file_path ?? input?.path ?? ''}`;
  if (name === 'Grep') return `Grep "${input?.pattern ?? ''}"`;
  if (name === 'Glob') return `Glob ${input?.pattern ?? ''}`;
  return name;
}

// Bart asked for the --dangerously-skip-permissions equivalent: this agent
// auto-approves EVERY tool with no [y/N/a] prompt — reads, edits, Write, Bash,
// git, all of it. The PreToolUse hook fires first in the SDK's eval order and
// unconditionally allows; permissionMode is also 'bypassPermissions' (below) as
// belt-and-suspenders. The Plus user sees actions happen, never an approval.
// NOTE: the agent can now write files, run shell commands, and `git push`
// (the Vercel deploy path) entirely on its own. The system prompt still tells it
// to PROPOSE a push and wait — but nothing technically stops it anymore.
const allowOut = () => ({ hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const } });

const preToolUse = async (input: any) => {
  if (input?.hook_event_name !== 'PreToolUse') return {};
  if (process.env.CLP_DEBUG) process.stderr.write(`[preToolUse] ${input.tool_name} (auto-allow)\n`);
  return allowOut();
};

/* ---------- render the SDK message stream ---------- */
const seenText = new Set<string>();   // assistant message uuids already printed
const seenTools = new Set<string>();  // tool_use ids already printed
function handleMsg(msg: any): void {
  if (process.env.CLP_DEBUG) process.stderr.write(`[msg] ${msg.type}${msg.subtype ? '/' + msg.subtype : ''}\n`);
  if (msg.type === 'assistant') {
    const content = msg.message?.content ?? [];
    let text = '';
    for (const b of content) {
      if (b.type === 'text') text += b.text;
      else if (b.type === 'tool_use' && !seenTools.has(b.id)) {
        seenTools.add(b.id);
        tt.tool(toolTitle(b.name, b.input));
      }
    }
    if (text.trim() && !seenText.has(msg.uuid)) {
      seenText.add(msg.uuid);
      tt.text(text.replace(/\n+$/, '') + '\n');
    }
  } else if (msg.type === 'stream_error' || msg.error) {
    tt.line(`! error: ${msg.error?.message ?? msg.error ?? 'unknown'}`);
  }
  // result / system / progress events: nothing to show on the Plus
}

/* ---------- slash commands (handled locally, never sent to the model) ---------- */
function handleSlash(line: string): boolean {  // returns false => quit
  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  switch (cmd) {
    case 'help':
      tt.line('Commands: /help  /quit  /clear  /cols N  /cwd  /model');
      tt.line('Type plain text to talk to Claude. All tools run automatically (no approvals).');
      tt.line('Knowledge: ask "what did i say about X" - searches your F2 notes + docsrepo.');
      return true;
    case 'quit': case 'exit': tt.line('Goodbye.'); return false;
    case 'clear': tt.clear(); return true;
    case 'cols': {
      const n = parseInt(rest[0] ?? '', 10);
      if (n >= 20 && n <= 200) { tt.cols = n; tt.line(`cols = ${n}`); }
      else tt.line('usage: /cols 20..200');
      return true;
    }
    case 'cwd': tt.line(`cwd: ${cfg.cwd}`); return true;
    case 'model': tt.line(`model: ${cfg.model}`); return true;
    default: tt.line(`unknown command: /${cmd}  (try /help)`); return true;
  }
}

/* ---------- prompt the user, handling slash commands; closes queue on /quit ---------- */
async function promptUser(): Promise<void> {
  while (true) {
    const line = (await tt.ask('> ')).trim();
    if (line === '') continue;
    if (line.startsWith('/')) {
      if (!handleSlash(line)) { inputQ.close(); return; }
      continue;
    }
    inputQ.push(line);
    return;
  }
}

/* ---------- main ---------- */
async function main() {
  const banner = [
    '',
    '     .---------.',
    '    |  _______  |',
    '    |  | o o |  |          M A C I N C L A U D E',
    '    |  |  -  |  |          ~~~~~~~~~~~~~~~~~~~~~',
    '    |  | \\_/ |  |                p l u s',
    '    |  |_____|  |',
    '    | o  [===]  |          a coding companion',
    '    |___________|          for the 1986 mac,',
    '     \\_________/           over 9600 baud.',
    '',
  ];
  for (const ln of banner) tt.line(ln);
  tt.line(`  cwd:    ${cfg.cwd}`);
  tt.line(`  docs:   ${cfg.docs} + F2 store`);
  tt.line(`  model:  ${cfg.model} @ ${cfg.cols} cols`);
  tt.line('');
  tt.line('  type a task.  /help for commands.  /quit to disconnect.');
  tt.line('  ask "what did i say about X" to search your notes.');
  tt.line('');

  await promptUser();   // first turn (or /quit before we start)

  try {
    for await (const msg of query({
      prompt: prompts(),
      options: {
        cwd: cfg.cwd,
        model: cfg.model,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: PLUS_APPEND },
        // docsrepo: a second searchable root for the knowledge-librarian role.
        additionalDirectories: [cfg.docs],
        // F2 datastore: in-process, read-only knowledge tools (mcp__f2__*).
        mcpServers: { f2: createF2Server() },
        // Don't load the host's ~/.claude settings (kept for isolation).
        settingSources: [],
        // Dangerously skip permissions: never prompt for anything. The always-allow
        // PreToolUse hook is the primary mechanism (fires first); bypassPermissions
        // is the matching mode. See the gate comment above.
        permissionMode: 'bypassPermissions',
        hooks: { PreToolUse: [{ hooks: [preToolUse] }] },
      } as any,
    })) {
      handleMsg(msg);
      if (msg.type === 'result') {
        tt.line();
        await promptUser();   // next turn (or close the queue -> ends the stream)
      }
    }
  } catch (err: any) {
    tt.line(`! agent error: ${err?.message ?? String(err)}`);
  } finally {
    tt.close();
  }
}

main();
