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

## The phone door, for the iPhone's "On the Ola machine" (2026-11-17)

`phone-door.mjs`, the third process of the same job, on the Tailscale address only, port 4312
(`OLA_BART_PHONE_PORT`): the iPhone app signed in with an Ola name and password works with this
opencode directly, Mac off. It needs `Authorization: Bearer <Ola device key>`, asks the front desk
(`https://app.ola.cx/api/device/me`, kept a minute) whose key it is, admits only the handles in
`OLA_BART_PHONE_HANDLES` (default `bart`; 403 for anyone else), forwards only the routes the apps use
and adds `OPENCODE_PASSWORD` itself. Eight wrong keys from one address in a minute: a minute's wait.
`status` probes it (401 without a key). Why this and not the public address: `../apple/README.md`,
"Where Ola works, on the phone".

## Web search (2026-11-17)

opencode's own web search tool has no provider in this setup: it waits about a minute and ends
"Web search cancelled" (Bart's news-site run, 2026-11-17: four searches, all cancelled, after he had
answered yes). It is turned off (`websearch` deny), and so is opencode's page fetch (`webfetch`
deny: it works, but the open model reached for it instead of searching, a search engine's results
page or a guessed address). The agent has Ola's own commands instead, the same files as the
customers' sealed image: `ola-search`, `ola-fetch`, `ola-lookup` (with `ola-db` and what they need),
copied from `workspace/` into `~/.ola-bart/bin/web` and first on the server's PATH; they reach the
gateway on `127.0.0.1:4180` with the `bart` caller token, and `ola-fetch` saves into
`~/ola-bart/sources/`. The standing instruction says, in two lines, to use them (the same words as
OlaKit's `AgentNotes.web`). Bart is asked with the web app's words ("Ola wants to search the web
for: …", Yes, this once / Yes, for the rest of this session / No).

The gateway lets the `bart` caller through with a standing grant in `~/.ola/gateway-web-hosts`
(`ola-bart.sh web`, also run by `install`; removed by `uninstall`): Bart answers every web question
himself, in his apps. The gateway reads that file from the commit that added it on; until the
staging gateway runs it, `ola-bart.sh web` and `install` end with "web check: NOT granted", and
ola-search says the search was not approved. `ola-bart.sh status` shows the grant.

The check (`apple/OlaKit`, `OLA_WEB_CHECK=1 swift run olakit-selftest`, both modes, see
apple/README.md) asks the agent to search the web for the Ola test phrase and tell one result.

## Ola's skills, and looking at pages (2026-11-17)

`install` (and `files`, which writes only the skills, the commands and the config, for a check)
copies `apps/activist-ai/skills` into `~/.ola-bart/skills` with `skills/install.py`: read-only, the
image's path rewritten to this one. The config names that folder and allows exactly those skills
(every other skill denied by name in `policies` and `permissions`); `OPENCODE_DISABLE_CLAUDE_CODE`
keeps Claude Code's skills out. Before this the skill tool was off here, because the model was loading
unrelated skills installed for other tools. The designer skills look at pages with `ola-page` (the
image's, driving Playwright's Chromium headless shell for this account, or Google Chrome; `run.sh`
sets `OLA_PAGE_CHROMIUM`) and `ola-see` (the `see` model, through the gateway with the bart token,
like `ola-lookup`; the gateway must have `see` in `GATEWAY_MODELS`).

Check, with a scratch state folder and any gateway that serves `general` and `see`:

```bash
OLA_BART_STATE=/tmp/ob/state OLA_BART_PROJECT=/tmp/ob/project bart/ola-bart.sh files
node bart/skills-check.mjs --opencode $PWD/node_modules/.bin/opencode --state /tmp/ob/state --project /tmp/ob/project \
     --gateway 127.0.0.1:<port> --token-file <file> --model-check
```

## What the agent may do

Later rules win. Everything is allowed, except:

- **Asks Bart first:** every shell command, every file edit or new file (`edit`; a write asks as
  `edit` in opencode 2), web fetches and searches. The apps show these as approvals.
- **Refused:** anything outside `~/ola-bart` through the agent's own file tools
  (`external_directory`), and any shell command naming what serves real people on this machine:
  `GAMI`, the Almanac, `hilma-*` checkouts, `ola-staging`, `~/.ola`, the front desk's data,
  BlueBubbles, `launchctl`, `container`, `tunn3l`, `sudo`, venture.

Bart's Mac app answers the "asks first" commands and edits itself when its Permissions setting is
"Lots of permissions" (the default; `../apple/README.md`, "Permissions"), so this config is left as
it is; web commands still ask. The phone alone still asks.

These are the agent's defaults, not a wall. A shell command Bart approves runs as `admin` and can
reach anything that account can; the deny patterns only match the command's text.
