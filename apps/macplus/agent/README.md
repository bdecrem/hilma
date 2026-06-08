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
`--model <id>` (default `claude-sonnet-4-6`), `--cols <n>` (wrap width, default 80).
In-session: `/help /quit /clear /cols N /cwd /model`.

## Deployed location (as of 2026-06-03)
Source of truth lives here in the repo (`apps/macplus/agent/`). The running copy is on the **Mac mini**
at `~/claude-plus/` (`admin@192.168.7.50`), put there by rsync + `npm install`. To re-deploy after editing:
```bash
rsync -az --exclude node_modules ~/Documents/coding2025/hilma/apps/macplus/agent/ admin@192.168.7.50:claude-plus/
ssh admin@192.168.7.50 'cd claude-plus && /opt/homebrew/bin/npm install'
```
It runs on **port 2324**, started automatically by a launchd daemon (see "Run it on the mini" below);
the prod login shell stays on 2323.

## Run it on the mini (what the Plus dials into)
**A launchd daemon already owns port 2324 and starts the agent automatically** — `RunAtLoad` +
`KeepAlive`, so it comes up on boot and respawns if it dies (2323 stays the plain login shell). You
normally start nothing by hand: deploy new code (above) and the next connection picks it up, since
socat forks a fresh `tsx` per connection. The pieces:
- `/Library/LaunchDaemons/sh.claude-plus.terminal.plist` — the daemon (label `sh.claude-plus.terminal`,
  user `admin`). Logs: `~/Library/Logs/claude-plus.{out,err}.log`.
- `/usr/local/bin/claude-plus-listener.sh` — what it execs: sources `/etc/claude-plus.env`
  (`ANTHROPIC_API_KEY`), then `socat TCP-LISTEN:2324,reuseaddr,fork EXEC:'tsx … --cwd <hilma>'`.
- The F2 Supabase keys are NOT in `/etc/claude-plus.env`; `main.ts` loads them from `--cwd`'s
  `.env.local` at startup, so the daemon serves the knowledge tools with no extra config.

Manage it (needs sudo):
```bash
sudo launchctl print     system/sh.claude-plus.terminal                                # status / pid / last exit
sudo launchctl kickstart -k system/sh.claude-plus.terminal                             # restart now (e.g. after a deploy)
sudo launchctl bootout   system/sh.claude-plus.terminal                                # stop + unload
sudo launchctl bootstrap system /Library/LaunchDaemons/sh.claude-plus.terminal.plist   # load it
```
A code-only deploy (new `src/*.ts`) needs no restart — the next connection runs it. Only changes to
`claude-plus-listener.sh` or `/etc/claude-plus.env` need a `kickstart`. socat runs `tsx` directly (NOT
`npx`, whose spinner garbles the VT100) and keeps child stderr server-side so SDK/Node noise never
reaches the Plus; `pty` gives the line editing the Plus expects. The model authenticates via the
`claude` CLI's OAuth login, so `ANTHROPIC_API_KEY` is effectively optional.

**Manual fallback** (debug only — first `sudo launchctl bootout` the daemon so it doesn't fight for the
port): `nohup setsid ~/claude-plus/start-listener.sh > /tmp/clp-listener.log 2>&1 & disown` — the same
socat command with the creds loaded from `.env.local`. Stop it with `pkill -f 'TCP-LISTEN:2324'`.

## Permission model
- Read-only tools (Read, Grep, Glob, WebSearch/Fetch, TodoWrite) and the F2 knowledge tools
  (`mcp__f2__*`) auto-run.
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
- **Env doesn't reliably reach the socat EXEC child** — the README once said to inject `ANTHROPIC_API_KEY`
  via the listener env, but in practice the model runs off the `claude` CLI's OAuth login and the F2 keys
  weren't propagating. Fix: `main.ts` loads `--cwd`'s `.env.local` at startup. Don't rely on socat/launchd
  env for the F2 keys.
- **F2 in-process MCP tools use `alwaysLoad: true`** so they stay in the prompt instead of being deferred
  behind tool-search (which the small/terse Plus context could otherwise miss).
