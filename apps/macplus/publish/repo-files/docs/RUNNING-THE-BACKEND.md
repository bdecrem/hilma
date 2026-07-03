# Running the backend (the "brains")

Every app has a Mac-side **agent** — a small Node/TypeScript server that does the
work the Plus can't: fetch and simplify web pages, run the language model,
generate images, read a database, and so on. You run the agents on any modern
Mac on the same LAN as your vintage Mac. The Plus apps connect to that Mac's IP.

## One agent per app, one TCP port each

Each agent listens on its own port so they can run side by side:

| Port | Agent (`agent-*/`) | Serves |
|------|--------------------|--------|
| 2324 | `agent/` (Macinclaude) | the Claude coding companion |
| 2325 | `agent-atkinson/` | prompt → image → 1-bit dither |
| 2326 | `agent-surf/` | reader-mode web browser |
| 2327 | `agent-foundry/` | describe → compile → deliver an app |
| 2328 | `agent-imessage/` | messages *(personal integration)* |
| 2329 | `agent-rsh/` | instant shell (raw TCP → pty) |
| 2330 | `agent-mux/` | serial multiplexer (for the serial-modem path) |
| 2331 | `agent-diag/` | diagnostics log sink |
| 2332 | `agent-quote/` | quote of the day |
| 2333 | `agent-bridge/` | over-the-air app delivery |
| 2334 | `agent-screen/` | screen-grab helper |
| 2335 | `agent-netspeed/` | link speed test |
| 2336 | `agent-porthole/` | bitmap viewer feed |
| 2222 | `agent-pssh/` | SSH-2 server for the Plus's `ssh` client |

## Running one

```bash
cd agent-surf
npm install
npm start          # or: npx tsx src/main.ts --listen 2326
```

Most agents that need API keys (the language model, image generation) read them
from environment variables — check each agent's `README.md` and `src/`. Set them
in your shell or an `.env` before starting.

## Keeping them running

For a hobby setup, launching each agent in a terminal (or `tmux`) is fine. To
have them start at boot and restart on crash, wrap each in a macOS **LaunchAgent**
(`~/Library/LaunchAgents/*.plist` with `RunAtLoad` + `KeepAlive`). The `backend/`
folder has reference scripts (`run-service.sh`, `install-agents.sh`) you can
adapt — they assume the repo lives at `~/macinclaude`; change the paths to match
where you cloned it.

Some agents need a logged-in GUI session and extra permissions — e.g. the
iMessage agent needs Full Disk Access + Automation to read Messages, and any
screen-grab needs Screen Recording. Grant those in **System Settings ▸ Privacy
& Security** to the process running the agent.

## The Bridge outbox

`agent-bridge` (port 2333) watches an **outbox** folder. Drop a built `AppName.bin`
there and, when the Plus's Bridge app connects, it streams the app over and
installs it in place. Point the agent at your outbox folder (see its README);
the default in the reference scripts is `~/bridge-outbox/`.

## Pointing the apps at this Mac

The agents don't need to know the Plus's address — the Plus dials *them*. So on
the Plus side, set this Mac's LAN IP as the server (in each app's **Settings**
dialog, or the `#define` before building — see [`../config.example`](../config.example)).
