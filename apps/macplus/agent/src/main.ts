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
import { query } from '@anthropic-ai/claude-agent-sdk';
import { Teletype } from './teletype.ts';

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
  };
}
const cfg = parseArgs();
const tt = new Teletype({ cols: cfg.cols });

/* The Plus-tuning, appended to the real Claude Code system prompt. */
const PLUS_APPEND = `
You are running as "Claude Code for the Macintosh Plus": your output is shown on a 1986 Macintosh Plus acting as a VT100 terminal over a slow 9600-baud serial link. Follow these output rules strictly:
- Plain ASCII only. No emoji, no box-drawing, no smart quotes, no markdown tables, no ANSI color.
- Be terse and information-dense. The link is slow and the screen is ~80x24 mono. Prefer a few tight sentences to long explanations.
- NEVER paste large file contents or long command output back to the user. Inspect files with your tools (that runs on the fast machine) and then SUMMARIZE. If asked to show a file, show only the few relevant lines.
- Simple formatting only: short lines, "- " bullets. No headed sections unless essential.
You are still a full coding agent (read, edit, run commands, git) working in the current directory. The writing/notes use case is common but you are not limited to it. Be the same capable Claude Code, just terse and ASCII for a tiny, slow terminal.`;

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

/* ---------- permission gate (read-only auto-runs; writes/bash ask) ---------- */
const READONLY = new Set(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'TodoWrite', 'BashOutput', 'NotebookRead']);
const sessionAllow = new Set<string>();

function toolTitle(name: string, input: any): string {
  if (name === 'Bash') return `Bash: ${String(input?.command ?? '').slice(0, 60)}`;
  if (name === 'Read' || name === 'Edit' || name === 'Write' || name === 'NotebookEdit')
    return `${name} ${input?.file_path ?? input?.path ?? ''}`;
  if (name === 'Grep') return `Grep "${input?.pattern ?? ''}"`;
  if (name === 'Glob') return `Glob ${input?.pattern ?? ''}`;
  return name;
}

// Permission gate via a PreToolUse hook (fires FIRST in the SDK's eval order, and
// reliably — unlike canUseTool, which is only a last-resort fallback). Read-only
// tools auto-allow; writes/bash/etc. ask the user [y/N/a] over the link.
const allowOut = () => ({ hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'allow' as const } });
const denyOut = (reason: string) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const, permissionDecisionReason: reason } });

const preToolUse = async (input: any) => {
  if (input?.hook_event_name !== 'PreToolUse') return {};
  const name: string = input.tool_name;
  const ti = input.tool_input ?? {};
  if (process.env.CLP_DEBUG) process.stderr.write(`[preToolUse] ${name}\n`);
  if (READONLY.has(name) || sessionAllow.has(name)) return allowOut();
  const ans = (await tt.ask(`  Allow ${toolTitle(name, ti)}? [y/N/a] `)).trim().toLowerCase();
  if (ans === 'a' || ans === 'always') { sessionAllow.add(name); return allowOut(); }
  if (ans === 'y' || ans === 'yes') return allowOut();
  return denyOut('User declined this action.');
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
      tt.line('Type plain text to talk to Claude. Reads/searches auto-run; edits & bash ask [y/N/a].');
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
  tt.line(`  model:  ${cfg.model} @ ${cfg.cols} cols`);
  tt.line('');
  tt.line('  type a task.  /help for commands.  /quit to disconnect.');
  tt.line('');

  await promptUser();   // first turn (or /quit before we start)

  try {
    for await (const msg of query({
      prompt: prompts(),
      options: {
        cwd: cfg.cwd,
        model: cfg.model,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: PLUS_APPEND },
        // Isolation mode: ignore the host's ~/.claude allow-rules so OUR hook
        // is the sole permission authority (otherwise the user's settings auto-approve).
        settingSources: [],
        permissionMode: 'default',
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
