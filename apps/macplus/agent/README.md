# claude-plus — Claude Code for the Macintosh Plus (MVP)

A Claude Code–style coding agent rendered for a VT100 over a slow link. Runs on the Mac mini;
the Plus talks to it via the RetroWiFi-SI → `socat` connection. Built on the Claude Agent SDK
(the engine behind Claude Code) with a thin **Teletype** layer that owns all the Mac Plus limits.

See `../AGENT-PLAN.md` for the full design and roadmap.

## Files
- `src/teletype.ts` — the Plus layer: ASCII-ify, markdown→plain, wrap-to-`cols`, CRLF, line input.
- `src/main.ts` — the loop: Claude Agent SDK (`claude_code` preset + Plus rules), streaming render,
  slash commands, a **PreToolUse hook** permission gate, and a tiny `.env.local` loader.
- `src/f2.ts` — the **F2 knowledge tools** (see below): read-only in-process MCP tools over Bart's
  F2 datastore on Supabase.
- `start-listener.sh` — launches the mini listener on port 2324 with creds loaded from `.env.local`.

## Knowledge librarian (F2 + docsrepo)
Besides being a coding agent, Macinclaude answers "what was that doc/article about" from two sources:
- **F2 datastore** (Supabase `f2_threads` — Bart's saved web pages, videos, pasted notes, chats, with
  their content, extra sources, and quotes). Exposed as three read-only in-process MCP tools:
  `mcp__f2__list_topics`, `mcp__f2__search`, `mcp__f2__get_topic` (defined in `src/f2.ts`). Needs
  `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (full read; the store is single-user today, so no per-user
  scoping). These auto-run like the other read-only tools.
- **docsrepo** (`/Users/admin/Documents/code/docsrepo` by default; `--docs <dir>` to override) — markdown
  research docs, searched with Grep/Glob/Read. Wired in via the SDK `additionalDirectories` option.

The agent reads/searches these on the fast machine and **summarizes** for the Plus (never pastes a whole
doc/topic). Creds come from the cwd's `.env.local` — `main.ts` loads it at startup, so a bare `socat`
launch works without injecting env. The model itself runs off the `claude` CLI's OAuth login.

## Run it locally (test from any Mac terminal)
```bash
cd apps/macplus/agent
npm install
ANTHROPIC_API_KEY=sk-... ./node_modules/.bin/tsx src/main.ts --cwd /path/to/hilma --cols 80
```
Flags: `--cwd <dir>` (working directory / corpus; its `.env.local` is auto-loaded for the F2 keys),
`--docs <dir>` (the docsrepo knowledge root, default `/Users/admin/Documents/code/docsrepo`),
`--model <id>` (default `claude-sonnet-4-6`, picks the starting `/model` entry), `--cols <n>` (wrap width, default 80).
In-session: `/help /quit /clear /cols N /cwd /model`.

`/model` lists the model/effort picks and `/model N` switches to one — Sonnet 4.6,
Opus 4.8 (medium/high), Fable 5 (medium/high). Effort can't be changed on a live
SDK session (only `model` has a runtime setter), so a switch rebuilds the query
under the new model/effort and `resume`s the prior `session_id`, keeping the
conversation. Opus 4.8 and Fable 5 each expose medium + high as separate picks
(sidestepping a dedicated effort UI); Sonnet is a single entry at the SDK default.

## Deployed location / run it on the mini (as of 2026-06-11)
Source of truth lives here in the repo (`apps/macplus/agent/`). On the **Mac mini** it runs from the
**deploy clone** `~/hilma-deploy` as LaunchAgent **`sh.macplus.code`** on port 2324 (2323 stays the
plain login shell). **There is no rsync and no `~/claude-plus` copy anymore.** To deploy: push to
`main`, then run `bash ~/hilma-deploy/apps/macplus/backend/update.sh` on the mini — code-only changes
need no restart (socat forks a fresh `tsx` per connection; the next dial-in runs the new code).
Logs: `~/Library/Logs/macplus-code.{out,err}.log`. Model auth is the `claude` CLI's OAuth login (or
`ANTHROPIC_API_KEY`); the F2 Supabase keys come from `~/.macplus-backend.env`, sourced by the runner.
**Canonical ops doc — fleet table, secrets, TCC grants, recovery: [`../BACKEND.md`](../BACKEND.md).**
(Old gotchas that still apply: run `tsx` directly, never `npx` — its spinner garbles the VT100; keep
child stderr server-side; cooked `pty` is deliberate for this interactive agent.)

## Permission model — DANGEROUSLY SKIP (auto-approve everything)
This agent **never prompts for approval**. Every tool — Read, Grep, Edit, Write, Bash, git, all of
it — runs automatically (the `--dangerously-skip-permissions` equivalent). The always-allow
`PreToolUse` hook is the primary mechanism (it fires first in the SDK eval order); `permissionMode:
'bypassPermissions'` backs it up; `settingSources: []` keeps the host's `~/.claude` rules out of it.
- **Implication:** the agent can write files, run shell, and `git push` (→ Vercel deploy) on its own.
  The system prompt still tells it to *propose* a push and wait, but nothing technically blocks it.
- There used to be a `[y/N/a]` gate (read-only auto-ran, writes/bash asked); it was removed on
  Bart's request. To restore it, bring back the asking `preToolUse` and set `permissionMode: 'default'`.

## Gotchas (learned the hard way)
- **`tsx` directly, never `npx tsx`** — npx's loading spinner emits ANSI that garbles the terminal.
- **Keep child stderr off the link** — the SDK/Node can print progress; route it to the server, not the Plus.
- **`settingSources: []`** — otherwise the SDK loads the host user's Claude Code allow-rules and
  every tool auto-runs (permission gate never fires).
- **Permission gating = PreToolUse hook, not `canUseTool`** — `canUseTool` is only a last-resort
  fallback in the SDK's eval order (Hooks → Deny → Mode → Allow → canUseTool) and often never fires.
- **Env doesn't reliably reach the socat EXEC child** — the README once said to inject `ANTHROPIC_API_KEY`
  via the listener env, but in practice the model runs off the `claude` CLI's OAuth login and the F2 keys
  weren't propagating. Fix: `main.ts` loads `--cwd`'s `.env.local` at startup. Don't rely on socat/launchd
  env for the F2 keys.
- **F2 in-process MCP tools use `alwaysLoad: true`** so they stay in the prompt instead of being deferred
  behind tool-search (which the small/terse Plus context could otherwise miss).
