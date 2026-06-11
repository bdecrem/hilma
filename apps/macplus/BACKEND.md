# MacPlus backend services — how they run and how to update them

**Audience: any code agent (or human) working on MacPlus apps from any machine.**
This is the canonical operations doc for the mini-side half of every Plus app.
If you change an `agent-*` here, this file tells you how your change reaches the
running system. The Plus-side (68k C) build/ship pipeline is in `CLAUDE.md`.

## The system in one picture

```
 dev machine(s)                    GitHub                       Mac mini (192.168.7.50)
┌─────────────────┐   git push   ┌──────────────┐   git pull   ┌─────────────────────────────┐
│ your checkout of│ ───────────> │ bdecrem/hilma│ <─────────── │ deploy clone ~/hilma-deploy │
│ bdecrem/hilma   │              │    (main)    │              │  └─ apps/macplus/agent-*    │
└─────────────────┘              └──────────────┘              │     run by sh.macplus.*     │
                                                               │     LaunchAgents (gui/501)  │
                                                               └─────────────▲───────────────┘
                                                                  dialed by the Plus via the
                                                                  RetroWiFi SI / WiFi service
```

**Three rules:**
1. **GitHub is the only sync path.** Never rsync/scp/ssh-edit code onto the mini.
   There are no hand-deployed copies anymore (`~/claude-plus`, `~/surf-agent`,
   `~/agent-*` are retired).
2. **The mini runs services from its deploy clone** (`~/hilma-deploy`), which only
   ever `git pull`s — it is never edited in place, so "deployed" always equals
   "last pushed commit."
3. **One update verb:** `bash ~/hilma-deploy/apps/macplus/backend/update.sh`
   (run on the mini; no sudo). It pulls, refreshes node_modules, re-syncs
   secrets, restarts what needs restarting, and prints fleet status.

## The fleet

All services are **user LaunchAgents** (`~/Library/LaunchAgents/sh.macplus.<name>.plist`,
domain `gui/501`) — not root daemons — because iMessage needs admin's GUI session
(AppleScript Automation + Full Disk Access) and the mini auto-logs-in as admin, so
they still start at boot. Each plist is a thin shim that runs
`backend/run-service.sh <name>`; all real config lives in that script, in git.

| port | label                | what                                       | runtime model |
|------|----------------------|--------------------------------------------|---------------|
| 2323 | `sh.macplus.terminal`| login shell (zsh) — **root daemon, legacy, untouched** | socat, per-connection |
| 2324 | `sh.macplus.code`    | Macinclaude Code (Claude coding agent, VT100) | socat, per-connection |
| 2325 | `sh.macplus.paint`   | Macinclaude Paint (image → 1-bit dither)   | socat, per-connection |
| 2326 | `sh.macplus.surf`    | Macinclaude Surf (reader-mode browser)     | socat, per-connection (`raw,echo=0`) |
| 2327 | —                    | Macinclaude Foundry agent — **runs on the iMac** (`192.168.7.189:2327`); the mini now has the Retro68 toolchain, so moving it here is possible but not done | — |
| 2328 | `sh.macplus.imessage`| iMessage bridge (chat.db read, AppleScript send) | node:net, long-running |
| 2330 | `sh.macplus.mux`     | multiplexer — the WiFi service front door; routes named channels to the services above | node:net, long-running |
| 2331 | `sh.macplus.diag`    | diagnostic log sink                        | node:net, long-running |
| 2332 | `sh.macplus.quote`   | quote of the day                           | node:net, long-running |
| 2333 | `sh.macplus.bridge`  | OTA app delivery (watches `~/bridge-outbox`) | node:net, long-running |

Logs: `~/Library/Logs/macplus-<name>.{out,err}.log` on the mini.

## How to ship a backend change (from any machine)

1. Edit the `agent-*` source in **your own checkout**. Verify it (each agent has
   `npm run selftest` or equivalent — see its README).
2. Commit and **push to `main`**.
3. Deploy on the mini — any one of:
   - ask the Claude Code session running on the mini to "update the macplus backend";
   - or from the 2323 shell / ssh: `bash ~/hilma-deploy/apps/macplus/backend/update.sh`.
4. That's it. **Restart semantics are handled for you:**
   - socat services (code/paint/surf) fork a fresh process per connection — the
     next dial-in runs your code; live sessions are not dropped. No restart.
   - node:net long-runners (mux/imessage/diag/quote/bridge) are kickstarted by
     `update.sh`.
   - Changed `run-service.sh` behavior or plist shape? `bash backend/install-agents.sh <name>`
     re-writes + re-bootstraps (no sudo).

**Never** start services by hand (`socat ...` / `npm start` in a terminal). That
was the old way; hand-started processes die on reboot and shadow the managed ones.
If a service is down, check its err log, then `launchctl kickstart -k gui/501/sh.macplus.<name>`.

## Secrets

- Central file on the mini: **`~/.macplus-backend.env`** (chmod 600, never in git).
  `run-service.sh` sources it for every service. Holds `ANTHROPIC_API_KEY`
  (surf, code), `OPENAI_API_KEY` (paint), `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`
  (code's F2 knowledge tools), etc.
- Source of truth is the dev tree's `.env.local`; `update.sh` re-syncs the needed
  keys whenever that file is readable. Adding a new key for an agent: put it in
  `.env.local`, add the key name to the `grep -E` allowlist in `update.sh`, push,
  run update.
- Never bake secrets into plists or commit them. (The old Atkinson daemon baked
  the OpenAI key into a root plist — that pattern is retired.)

## Per-service notes & TCC (macOS privacy) grants

- **code (2324):** the agent *program* runs from the deploy clone; its *workspace*
  (`--cwd`) is the dev tree `~/Documents/code/hilma` — that's the repo the Plus
  user edits. `~/Documents` is TCC-protected: for the agent to read/edit the dev
  tree, the mini needs a one-time **Full Disk Access** grant for the responsible
  binary (System Settings → Privacy & Security → Full Disk Access). Model auth
  is the `claude` CLI's OAuth login or `ANTHROPIC_API_KEY`; F2 knowledge tools
  use the SUPABASE keys from the central env file.
- **paint (2325):** `ATK_PYTHON=/usr/bin/python3` is set by `run-service.sh`
  (only that python has Pillow). Needs `OPENAI_API_KEY`.
- **surf (2326):** plain Anthropic SDK — **requires** `ANTHROPIC_API_KEY` (no
  OAuth fallback). socat opts must stay `raw,echo=0` (cooked pty echoes commands
  back and duplicates frames).
- **imessage (2328):** reads `~/Library/Messages/chat.db` (needs **Full Disk
  Access** for the launchd context) and sends via `osascript` → Messages.app
  (first send triggers an **Automation** consent prompt on the mini's screen —
  click Allow once). `IMSG_DRY_RUN` must be **unset** for live sends.
- **mux (2330):** the route map (`SERVICES` in `agent-mux/src/main.ts`) is part
  of the code — adding a service = edit, push, update, kickstart (update.sh does
  the kickstart). It has a built-in `echo` service for bring-up tests.
- **bridge (2333):** drop a built `.bin` into `~/bridge-outbox/` on the mini and
  the Plus (running The Bridge) installs it — this is how new Plus apps ship
  without SD-card shuttling.

## Verifying from any LAN machine

```
nc 192.168.7.50 2324   # Macinclaude Code banner
nc 192.168.7.50 2326   # surf protocol agent (silent until a GO command)
nc 192.168.7.50 2330   # mux; it speaks the channel protocol (has internal "echo")
```
On the mini: `bash backend/update.sh` ends with a full fleet status table.

## First-time install (fresh mini) / disaster recovery

1. `git clone https://github.com/bdecrem/hilma ~/hilma-deploy`
2. `bash ~/hilma-deploy/apps/macplus/backend/update.sh` (installs node_modules; warns about secrets)
3. Create `~/.macplus-backend.env` (chmod 600) with the keys listed above.
4. `bash ~/hilma-deploy/apps/macplus/backend/install-agents.sh code paint surf mux imessage diag quote bridge`
5. Grant the TCC permissions (FDA for the dev tree + chat.db; Automation on first send).
6. The 2323 login shell is separate (root daemon `sh.macplus.terminal`) — see CLAUDE.md.

## History (why it is this way)

Until 2026-06-11 the backend was a mix of root LaunchDaemons (2324 from an
rsync'd `~/claude-plus` copy, 2325 from the dev working tree) and hand-started
processes that died on every reboot (2326/2328/2330–2333). The migration to a
single deploy clone + uniform LaunchAgents fixed: rsync drift, dirty-working-tree
deploys, reboot fragility, root daemons that couldn't get GUI-session TCC
grants, and secrets baked into root plists. The one-time migration script was
`backend/retire-system-daemons.sh` (the last sudo this system needed).
