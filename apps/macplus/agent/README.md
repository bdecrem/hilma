# claude-plus — Claude Code for the Macintosh Plus (MVP)

A Claude Code–style coding agent rendered for a VT100 over a slow link. Runs on the Mac mini;
the Plus talks to it via the RetroWiFi-SI → `socat` connection. Built on the Claude Agent SDK
(the engine behind Claude Code) with a thin **Teletype** layer that owns all the Mac Plus limits.

See `../AGENT-PLAN.md` for the full design and roadmap.

## Files
- `src/teletype.ts` — the Plus layer: ASCII-ify, markdown→plain, wrap-to-`cols`, CRLF, line input.
- `src/main.ts` — the loop: Claude Agent SDK (`claude_code` preset + Plus rules), streaming render,
  slash commands, and a **PreToolUse hook** permission gate.

## Run it locally (test from any Mac terminal)
```bash
cd apps/macplus/agent
npm install
ANTHROPIC_API_KEY=sk-... ./node_modules/.bin/tsx src/main.ts --cwd /path/to/docsrepo --cols 80
```
Flags: `--cwd <dir>` (working directory / corpus), `--model <id>` (default `claude-sonnet-4-6`),
`--cols <n>` (wrap width, default 80). In-session: `/help /quit /clear /cols N /cwd /model`.

## Run it on the mini (what the Plus dials into)
Replace the plain-shell listener with the agent. **Important:** run `tsx` directly (NOT `npx`, which
prints a spinner that corrupts the VT100), and do NOT route child stderr to the socket (keep SDK/Node
noise off the Plus):
```bash
ANTHROPIC_API_KEY=sk-... socat TCP-LISTEN:2323,reuseaddr,fork \
  EXEC:'/ABS/path/agent/node_modules/.bin/tsx /ABS/path/agent/src/main.ts --cwd /ABS/path/docsrepo --cols 80',pty,setsid,ctty
```
(`pty` gives the line editing + echo the Plus expects; omitting `stderr` from the EXEC opts keeps
stderr on the server side.) For a LaunchDaemon, set `ANTHROPIC_API_KEY` in its environment.

## Permission model
- Read-only tools (Read, Grep, Glob, WebSearch/Fetch, TodoWrite) auto-run.
- Write / Edit / Bash / etc. prompt `Allow <action>? [y/N/a]` over the link (`a` = allow that tool
  for the rest of the session). Enforced by a PreToolUse hook, with `settingSources: []` so the
  host's `~/.claude` allow-rules don't silently auto-approve.

## Gotchas (learned the hard way)
- **`tsx` directly, never `npx tsx`** — npx's loading spinner emits ANSI that garbles the terminal.
- **Keep child stderr off the link** — the SDK/Node can print progress; route it to the server, not the Plus.
- **`settingSources: []`** — otherwise the SDK loads the host user's Claude Code allow-rules and
  every tool auto-runs (permission gate never fires).
- **Permission gating = PreToolUse hook, not `canUseTool`** — `canUseTool` is only a last-resort
  fallback in the SDK's eval order (Hooks → Deny → Mode → Allow → canUseTool) and often never fires.
- Needs **`ANTHROPIC_API_KEY`** (the Agent SDK uses the API key, not the `claude` CLI's OAuth login).
