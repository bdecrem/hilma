# GolemBot — Discord-driven agents ("Strays" and "Bang")

Bart talks to a Claude Code agent from Discord. He @mentions the bot in a
kochitolabs channel, the agent does the work on a real machine — writes code,
runs the build, commits, pushes — and replies with a link.

That bridge is **GolemBot**, an open-source project:
**https://github.com/0xranx/golembot** (npm `golembot`, "Any Agent × Any
Provider × Anywhere"). We did not write it. This folder holds *our
configuration and ops*, the same way `apps/macplus` holds source + runbook but
not the Retro68 toolchain.

## Status — 2026-09-09

**Live on the Mac mini.** `com.golembot.strays` runs under launchd on
`admin@171.66.240.175` (pc-casbs-175 at Stanford), Discord shows `connected`,
and the agent was verified end to end through `POST /chat`. The migration off
the home iMac is done.

**The home iMac keeps the code as a cold backup.** `~/Documents/coding2025/bang/`
is untouched; only the launchd job was stopped and its plist parked in
`~/Library/LaunchAgents/disabled/`. Rolling back is moving that file back and
bootstrapping it — but stop the mini job first, see the two-gateways warning
below. The second bot, **Bang** (port 3001, `#bangbang`), was never migrated and
still runs at home.

### Open items

1. **~~Swap API-key auth for the subscription OAuth token.~~ Done 2026-09-10.**
   `~/.golembot.env` now carries `CLAUDE_CODE_OAUTH_TOKEN` (from
   `/opt/homebrew/bin/claude setup-token`, run on the mini) and no
   `ANTHROPIC_API_KEY` — the API key had to *go*, not just be joined, because the
   CLI resolves `ANTHROPIC_API_KEY` first and would have kept billing the API.
   **Rotate this token too**: it was pasted into a Claude transcript. Re-run
   `setup-token` on the mini and rewrite the one line in `~/.golembot.env`.

2. **Rotate the Discord bot token.** During the cutover the token was read back
   from `/api/status`, which returns it in plaintext, so it ended up in a Claude
   transcript. Reset it in the Developer Portal and run
   `bash apps/golembot/set-token.sh strays`.

3. **~~No `model` is pinned.~~ Done 2026-09-11 — `model: claude-fable-5-1`
   with `fallbackModel: claude-opus-5`.** Fable is covered by the Max plan but
   has its *own* weekly bucket (`/usage` shows "Current week (Fable)" next to the
   all-models bar); when that bucket empties before the weekly reset the CLI
   answers every call with "You're out of usage credits. Run /usage-credits to
   keep using Fable 5." (usage credits are the optional pay-as-you-go overflow,
   off on this account). `patches/model-fallback.mjs` catches that and replays
   the turn on Opus — see "Triage gate + model fallback" below.

## Triage gate + model fallback (2026-09-11)

Stock `groupPolicy: smart` spawns the full Claude Code agent on *every* message
in the channel and lets the agent answer `[PASS]` — an Opus/Fable run per line
of two humans chatting. Two dist patches change that:

- **`patches/smart-triage.mjs`** (gateway.js). A message that does not @mention
  the bot first goes to `groupChat.triageModel` (Sonnet): one headless
  `claude -p --tools "" --system-prompt … --setting-sources "" --strict-mcp-config`
  call, ~1k input tokens, ~2 s, on the same OAuth token. It sees the humans'
  recent lines (the gateway's in-memory group history, now timestamped) merged
  with the bot's own last replies (from `.golem/history/<channel>.jsonl`) and
  answers RESPOND or PASS; only RESPOND reaches the agent. @mentions, replies to
  the bot and DMs skip the gate. Rules are `groupChat.triageRules` in
  `golem.yaml`. A gate failure logs `triage failed … staying silent` and does
  NOT fall open into an agent run. Every decision logs one line:
  `[discord] triage respond · claude-sonnet-5 · 2126ms · 898 in · "…"`.
- **`patches/model-fallback.mjs`** (index.js + gateway.js + workspace.js). When
  the pinned model fails with an out-of-usage / limit message (as an error event
  or as a short reply text), the assistant switches to `fallbackModel` for
  `fallbackHoldMinutes` (360), replays the same turn, and the gateway drops the
  failed attempt's text so the channel only sees the real reply. Log line:
  `[assistant] model claude-fable-5-1 unavailable ("…") — Switching to fallback model claude-opus-5 for 360 min`.

- **`patches/group-turn-reset.mjs`** (gateway.js, 2026-09-12). `groupChat.maxTurns`
  is a loop valve: after N bot replies in a group the gateway skips every further
  message there. Stock golembot only resets the counter after an hour of *total*
  silence in the group, and every human message refreshes that clock, so in a busy
  channel it never reset — after ten jobs Strays went deaf with nothing but a
  verbose-log line (`maxTurns (10) reached … skipping`) to show for it. The patch
  makes any non-bot message clear the counter, so maxTurns now caps *consecutive
  bot-triggered replies*, which is the bot-to-bot runaway the valve exists for.
  (Discord's adapter drops other bots' messages at the door anyway.) Regression
  test: `patches/test/turn-reset-harness.mjs` drives `handleMessage()` with a
  stubbed assistant — stock answers 2/4 human messages at maxTurns 2, patched 4/4,
  and both still cap a run of bot-sent messages at 2.

All three are applied by `setup-mini.sh` after every install (same mechanism as the
role-mention patch), all are idempotent, and all abort loudly if a golembot
upgrade moved their anchors — then read the new `dist/` and re-anchor. Verified
2026-09-11 against a local copy of golembot 0.49.2: `triage-harness.mjs` (six
conversation shapes against real Sonnet, 6/6) and `fallback-harness.mjs`
(stubbed engine, both failure shapes) — the harnesses live in the session
scratchpad, recreate from the patch comments if needed. Check the patches
survived: `ssh admin@171.66.240.175 'grep -c golembot-smart-triage-patch /opt/homebrew/lib/node_modules/golembot/dist/gateway.js; grep -c golembot-model-fallback-patch /opt/homebrew/lib/node_modules/golembot/dist/index.js'`.

## The two bots

| Bot | Discord | Gateway port | Purpose |
|-----|---------|--------------|---------|
| **Strays** | kochitolabs, `#straykids` (and other channels) | 3002 | The build-and-ship agent. Works in the hilma checkout. |
| **Bang** | kochitolabs, `#bangbang` | 3001 | Second gateway, still on the home iMac. Not migrated. |

`#bangbang` and `#straykids` are channel names, not bot names — the bot that
answers in both is the app **Strays**.

## How it works

```
Discord (kochitolabs)
  └─ golembot gateway  (node, one process per bot, KeepAlive under launchd)
       ├─ discord.js gateway connection  ← the bot token
       ├─ HTTP API + dashboard on 127.0.0.1:<port>  (/health, /api/status, /chat)
       └─ spawns `claude` (Claude Code CLI, --dangerously-skip-permissions)
            └─ does the work in a real repo checkout, replies through the gateway

Engine auth is separate from Discord auth, and the failure looks nothing like a
Discord problem: the gateway connects fine and the bot answers every message with
`API Error: 401 OAuth access token has expired`. Fix that on the machine, not in
`golem.yaml`.
```

- **One config file, `golem.yaml`**, in the bot's *assistant directory*. The
  gateway is started with `golembot gateway -d <that dir>`, and that directory
  is also the agent's working directory.
- **Secrets are `${ENV_VAR}` references.** The token is never in `golem.yaml`.
- **Runtime state** (`.golem/` — per-channel history as
  `.golem/history/discord:<channel-id>.jsonl`, plus sessions) lives in the
  assistant directory and is deliberately *not* in git.
- **`skills/`** — a directory of `SKILL.md` files is the bot's capability list.
  We ship none yet; the stock `general` and `im-adapter` skills apply.

## Where it runs

**Strays runs on the Mac mini** (`admin@171.66.240.175`, pc-casbs-175 at
Stanford) as of 2026-09-09 — the same box as the macplus agents, BlueBubbles and
the tunn3l tunnels. That is the right home: it is always on, on wired power, and
already the host for unattended services.

| Thing | Path on the mini |
|-------|------------------|
| Assistant directory | `~/golembot/strays/` (`golem.yaml`, `.golem/`) |
| Secrets | `~/.golembot.env`, chmod 600 — `DISCORD_BOT_TOKEN` and (for now) `ANTHROPIC_API_KEY` |
| launchd job | `~/Library/LaunchAgents/com.golembot.strays.plist` |
| Log | `~/Library/Logs/golembot/strays.log` |
| Repo the agent works in | `~/hilma-bot` (its own clone, deps installed, `gh` supplies push credentials) |
| Preview URL | `bart-mini.tunn3l.sh` |

**The home iMac (`iMac.local`, user `bartdecrem`) keeps the original as a cold
backup.** Its code stays at `~/Documents/coding2025/bang/` (gateways
`collabs/strays` and `control`), but `com.golembot.strays` is disabled there so
two gateways never hold the same bot token at once. `com.golembot.bang` is
untouched and still running.

## Operating it

Everything is driven from this folder, from the iMac M1 or anywhere with ssh to
the mini.

```bash
bash apps/golembot/cutover.sh                # ONE-TIME move: stop iMac, token, start mini
bash apps/golembot/setup-mini.sh strays      # install/refresh config + launchd, restart
bash apps/golembot/set-token.sh strays       # rotate DISCORD_BOT_TOKEN (hidden prompt)
```

`cutover.sh` is the migration itself, and the order inside it is the point: it
stops the iMac gateway *before* starting the mini one, because two gateways
holding the same token both answer and every reply arrives twice. `set-token.sh`
deliberately will not first-start a job for the same reason — it only restarts
one that is already loaded.

To change the bot's behaviour, edit `bots/strays/golem.yaml` here, commit, then
run `setup-mini.sh strays`. That file is the source of truth; the copy on the
mini is a deployment artifact.

Checks:

```bash
ssh admin@171.66.240.175 'launchctl list | grep golembot'
ssh admin@171.66.240.175 'curl -s http://127.0.0.1:3002/health; echo'
ssh admin@171.66.240.175 'curl -s http://127.0.0.1:3002/api/status'
ssh admin@171.66.240.175 'tail -40 ~/Library/Logs/golembot/strays.log'
ssh admin@171.66.240.175 'cat ~/.golembot/fleet/*.json'      # what the fleet registry sees
```

Stop / start:

```bash
ssh admin@171.66.240.175 'launchctl bootout gui/501/com.golembot.strays'
ssh admin@171.66.240.175 'launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.golembot.strays.plist'
```

## Config reference (the subset we use)

`golem.yaml` keys, from the installed package's type definitions
(`/opt/homebrew/lib/node_modules/golembot/dist/workspace.d.ts` — read that file
for the full list, it is more current than the README):

| Key | What it does |
|-----|--------------|
| `name` / `engine` / `model` | Identity, `claude-code`, and the model |
| `skipPermissions` | Runs Claude Code with `--dangerously-skip-permissions` |
| `channels.discord.botToken` | `${DISCORD_BOT_TOKEN}` |
| `channels.discord.botName` | **Must equal `name`**, or @mentions in guild channels are not detected |
| `gateway.port` / `host` | HTTP API + dashboard, bound to 127.0.0.1 |
| `groupChat.groupPolicy` | `mention-only` (default) / `smart` / `always` |
| `groupChat.triageModel` / `triageRules` / `triageTimeoutSeconds` | **Ours** (smart-triage patch): the cheap gate in front of smart mode |
| `fallbackModel` / `fallbackHoldMinutes` | **Ours** (model-fallback patch): where to go when `model` is out of plan usage |
| `streaming.mode` | `buffered` or `streaming` (we stream, so long jobs show progress) |
| `timeout` | Agent invocation timeout in seconds, default 600 |
| `autoContinue` | Gateway re-invokes the agent when it emits `[CONTINUE]` |
| `persona` / `systemPrompt` | Identity and standing instructions |
| `permissions` | `allowedPaths` / `deniedPaths` / `allowedCommands` / `deniedCommands` |
| `tasks` | Scheduled tasks (unused so far) |
| `mcp` | MCP servers passed to the engine (unused so far) |

## Things that bit us

- **The bot token is only in `golem.yaml`.** On the iMac that file sits under
  `~/Documents`, which macOS privacy protection hides from an ssh session
  entirely — `cat` returns "Operation not permitted", so the token could not be
  read remotely. Migration therefore needs the token from the Discord Developer
  Portal (Reset Token) rather than a copy. The mini does not have this
  restriction; its sshd can read `~/Documents`.
- **`botName` must match `name`.** Otherwise the gateway silently ignores
  @mentions in servers and only answers DMs.
- **Two gateways must never share one token.** Discord allows the connection but
  both instances answer, so replies double up. Disable the old job before
  starting the new one.
- **`~/.golembot/fleet/*.json`** is written by every running gateway and is
  *outside* Documents, so it is readable even when the config is not. It gives
  name, port, pid, engine, model, version and assistant directory.
- **The gateway crash-loops with `KeepAlive` if the token is missing.**
  `setup-mini.sh` refuses to start a bot whose token is unset for that reason.
- **`discord.js` is a peer dependency and its absence is nearly silent.** The
  gateway starts, prints its banner, serves `/health`, and reports
  `Channels (0 connected)` with `Discord — Discord adapter requires discord.js`
  buried in the list. Health checks pass while the bot is deaf. `setup-mini.sh`
  installs it alongside `golembot`; a dry run on a fresh mini is what caught it.
- **A launchd `ProgramArguments` string is XML**, so `&&` in the command makes
  the plist unparseable and the job silently never loads. Use `;` with `set -e`.
  `plutil -lint <plist>` catches it.
- **Pasting a token twice is silent.** A double-paste into a hidden prompt
  stored 144 characters, and Discord answered only `An invalid token was
  provided.` A Discord bot token is ~72 chars — check the length before
  suspecting anything else. `cutover.sh` now reports the length it wrote.
- **Discord's picker resolves "@Strays" to the bot's ROLE, not the bot.** When a
  bot joins, Discord auto-creates a managed role with the same name (here
  `strays`, id `1532809294850818151`). Typing `@strays` autocompletes to that
  role, so the message carries `<@&roleId>` and never the bot's own
  `<@userId>` token — the stock adapter sets `mentioned=false`, and under
  `groupPolicy: mention-only` the gateway is silent with nothing in the log.
  Pasting the raw `<@1532808338402709645>` works, which makes it look like a
  flaky bot rather than a mention-parsing bug. Fixed by
  `patches/discord-role-mention.mjs`, which teaches the adapter that a role the
  bot holds counts as a mention (and strips the token from the text).
  `setup-mini.sh` re-applies it after every install, because upgrading golembot
  overwrites `dist/`. To check it survived:
  `ssh admin@171.66.240.175 'grep -c golembot-role-mention-patch /opt/homebrew/lib/node_modules/golembot/dist/channels/discord.js'`
- **The bot goes deaf after ten jobs in a busy channel.** `/health`, `/api/status`
  and Discord all say connected, the log shows `maxTurns (10) reached for group …,
  skipping` after each ignored message, and nothing else. That is the group loop
  valve with its silence-only reset; fixed by `patches/group-turn-reset.mjs` (see
  "Triage gate + model fallback"). Before the patch the only cure was a restart or
  an hour with nobody typing in the channel.
- **A gateway can sit "connected" for a day and receive nothing.** The fleet
  registry, `/health` and `/api/status` all report `connected` from cached
  state, so the only real liveness signal is the log's mtime. If it has not
  moved since the last known message, `launchctl kickstart -k` it.
- **`/api/status` returns the bot token in plaintext.** It is bound to
  127.0.0.1, but anything that reads it (a debugging session, a log paste)
  burns the token. Treat that endpoint as a secret.
- **The mini's Claude Code must be new enough for the pinned model.** Fable 5.1
  needs 2.1.251+; with 2.1.220 the bot answered every mention with `API Error:
  400 Claude Code 2.1.220 does not support this model`. The triage gate (Sonnet)
  kept working, so the log showed `triage respond` followed by the engine error.
  `setup-mini.sh` now upgrades the CLI (an npm global on the mini) when it is
  older than that.
- **The bot gets its own checkout, `~/hilma-bot`.** The mini's other two copies
  are not safe for it: `~/Documents/code/hilma` was 396 commits behind with
  uncommitted macplus edits, and `~/hilma-deploy` is the macplus services' deploy
  clone. Pushing works because `gh` is authenticated as bdecrem with `repo`
  scope and is wired in as the git credential helper.
