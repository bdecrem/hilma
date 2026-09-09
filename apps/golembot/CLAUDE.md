# GolemBot — Discord-driven agents ("Strays" and "Bang")

Bart talks to a Claude Code agent from Discord. He @mentions the bot in a
kochitolabs channel, the agent does the work on a real machine — writes code,
runs the build, commits, pushes — and replies with a link.

That bridge is **GolemBot**, an open-source project:
**https://github.com/0xranx/golembot** (npm `golembot`, "Any Agent × Any
Provider × Anywhere"). We did not write it. This folder holds *our
configuration and ops*, the same way `apps/macplus` holds source + runbook but
not the Retro68 toolchain.

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
| Secrets | `~/.golembot.env`, chmod 600, `DISCORD_BOT_TOKEN=…` |
| launchd job | `~/Library/LaunchAgents/com.golembot.strays.plist` |
| Log | `~/Library/Logs/golembot/strays.log` |
| Repo the agent works in | `~/Documents/code/hilma` |
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
