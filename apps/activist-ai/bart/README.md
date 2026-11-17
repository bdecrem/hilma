# Bart's opencode

The server half of Bart's own apps (`../apple/`): one `opencode serve` on the Ola machine, with
Bart's full privileges on it, no sealed VM. Both apps are its clients, so a session started on the
Mac is on the phone at once, and the Mac need not be on.

| What | Where |
|---|---|
| The project folder the agent works in | `~/ola-bart/` |
| opencode 2.3.0 (pinned by `../package-lock.json`), its config, sessions and caches | `~/.ola-bart/` (700) |
| The config (outside the project, so the agent cannot rewrite its own permissions) | `~/.ola-bart/config/opencode/opencode.jsonc`, written by the script |
| The password and the gateway token | `~/.ola/bart.env` (600), made on the machine, never printed |
| The job | launchd user agent `cx.ola.bart` (`~/Library/LaunchAgents/cx.ola.bart.plist`), KeepAlive |
| Its log | `~/Library/Logs/ola/bart.log` |
| The address | `http://100.95.51.98:4310`, the mini's **Tailscale address only**; Basic auth, user `opencode` |

## Install and run

From a copy of `apps/activist-ai` on the machine (it needs `package.json`, `package-lock.json` and
this folder), as the account that runs Ola:

```bash
bash apps/activist-ai/bart/ola-bart.sh install     # first time, or after a change; keeps the password
bash apps/activist-ai/bart/ola-bart.sh status      # job, listener, gateway token, 401 and 200 probes
bash apps/activist-ai/bart/ola-bart.sh stop        # unload the job (the server stops)
bash apps/activist-ai/bart/ola-bart.sh start       # load it again
bash apps/activist-ai/bart/ola-bart.sh restart
bash apps/activist-ai/bart/ola-bart.sh uninstall   # job and gateway token gone; folder, sessions and password kept
```

On the mini the copy lives at `~/.ola-bart/src/apps/activist-ai/` (copied with `scp`; not a git
checkout, so nothing else pulls into it).

## The password, for the apps' Keychain

Read it once, in your own terminal, and paste it into the app's connect sheet (it goes straight
into the Keychain there):

```bash
ssh admin@100.95.51.98 'bash ~/.ola-bart/src/apps/activist-ai/bart/ola-bart.sh password' | pbcopy
```

That puts it on the iMac's clipboard without showing it. On the phone, paste it from the Mac's
clipboard (Universal Clipboard), or type it. To make a new one: delete `~/.ola/bart.env`, run
`install` again (it also gives the gateway a new token), and enter the new password in both apps.

## The model

Through Ola's gateway on `127.0.0.1:4180`, as its own caller `bart` (a token beside the workspaces'
in `~/.ola/gateway-tokens`; the gateway reloads that file by itself, no restart). **Today the model
behind the gateway is a hosted stand-in (Together.ai), so use made-up data only** until the Mac
Studio serves the model. opencode's own free hosted models (opencode.ai) are switched off by a
policy in the config, so the conversation goes nowhere but the gateway.

**One thing to know:** `workspace/ws.mjs` rewrites the tokens file from the workspaces it knows
whenever a workspace is created, rotated or destroyed, and that drops `bart`. The apps then show the
model refusing. Put it back with `ola-bart.sh token` (it is also checked by `status`). The lasting fix is
a line in `ws.mjs` that keeps entries not named `ws-*`; that is staging's code, so it waits for a
deliberate change there.

## The model forwarder, for "On this Mac"

The Mac app can run the agent on the Mac itself (Settings, "Where Ola works"). Then only its model
requests come to the machine: `forward.mjs`, started by the same `cx.ola.bart` job beside opencode,
listens on the Tailscale address only, port 4311, and passes each connection byte for byte to the
gateway on `127.0.0.1:4180`, which stays on loopback. The gateway's token check is the gate: the Mac
uses the `bart` caller token, read once with

```bash
ssh admin@100.95.51.98 'bash ~/.ola-bart/src/apps/activist-ai/bart/ola-bart.sh model-token' | pbcopy
```

and pasted into the Mac app's Settings (it goes into the Keychain). If either process stops, the job
stops both and launchd starts the pair again. Proved from the iMac: `/v1/models` through port 4311 is
401 without the token and 200 with it.

## What the agent may do

Later rules win. Everything is allowed, except:

- **Asks Bart first:** every shell command, every file edit or new file (`edit`; a write asks as
  `edit` in opencode 2), web fetches and searches. The apps show these as approvals.
- **Refused:** anything outside `~/ola-bart` through the agent's own file tools
  (`external_directory`), and any shell command naming what serves real people on this machine:
  `GAMI`, the Almanac, `hilma-*` checkouts, `ola-staging`, `~/.ola`, the front desk's data,
  BlueBubbles, `launchctl`, `container`, `tunn3l`, `sudo`, venture.

These are the agent's defaults, not a wall. A shell command Bart approves runs as `admin` and can
reach anything that account can; the deny patterns only match the command's text.
