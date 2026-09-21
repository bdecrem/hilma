# Dodo voice bridge

The WebSocket server ElevenLabs **Speech Engine** connects to for Dodo's
ElevenLabs + Claude voice engine. Full picture: `docs/f2-eleven-voice-reference.md`.

Speech Engine reverses the usual direction — ElevenLabs is the WebSocket
*client*, this process is the *server*, one connection per conversation — and
Vercel cannot host a WebSocket server, so this small Node process does. It is a
dumb pipe: for each user turn it POSTs the transcript to the F2 backend's
`/api/f2/eleven/turn` (which runs Claude) and forwards the streamed text back
to be spoken. Prompts, tables and the Anthropic key stay on Vercel.

| File | What |
|---|---|
| `server.mjs` | the bridge: JWT check on upgrade, `init` / `user_transcript` / `ping` / `close`, abort on barge-in |
| `engines.mjs` | creates / updates the two Speech Engines (voice, turn-taking, `ws_url`) — idempotent, by name |
| `run.sh` | bridge + Cloudflare quick tunnel + `engines.mjs` with the tunnel's hostname |
| `install.sh`, `com.dodo.voicebridge.plist` | the launchd job (`KeepAlive`) |

## Running it

```bash
bash apps/dodo-voice-bridge/run.sh          # foreground, from a dev machine
bash apps/dodo-voice-bridge/install.sh      # launchd job on this machine; re-run after code changes
tail -f ~/Library/Logs/dodo-voice-bridge.log
```

Needs `node`, `cloudflared` (`brew install cloudflared`), and two secrets:
`ELEVENLABS_API_KEY` (verifies the JWT ElevenLabs signs every connection with)
and `DODO_BRIDGE_SECRET` (must equal the backend's). `install.sh` copies the
code to `~/Library/Application Support/dodo-voice-bridge` and the secrets to
`~/.dodo-voice-bridge.env` because launchd jobs cannot read `~/Documents`.

One process serves every engine by path: Dodo's `/ws/prod` → `https://feynd.cc`
and `/ws/dev` → `http://localhost:3100` (turn route `/api/f2/eleven/turn`), and
Polly's `/ws/polly-prod` → `https://hilma-nine.vercel.app/api/polly/eleven/turn`
and `/ws/polly-dev` → the same path on localhost (`DODO_BRIDGE_BACKENDS`
overrides; a bare origin means Dodo's route). Run
**one** bridge at a time: each start re-points both engines at its own tunnel.

## Why a Cloudflare quick tunnel

ElevenLabs needs a public `wss://` URL. tunn3l's HTTP mode does not pass
WebSocket upgrades (502, tried 2026-09-20), and ngrok's token on the MacBook Air was
revoked. A quick tunnel needs no account; its hostname changes on every start,
which is why `run.sh` re-runs `engines.mjs` each time. A named Cloudflare
tunnel or WebSocket support in tunn3l would make the URL permanent.

## Where it runs

The **Mac mini** (`admin@171.66.240.175`, always on), since 2026-09-21. It ran
on Bart's MacBook Air for a day before that; the Air's launchd job is still
installed and must be removed (`install.sh uninstall` there) — if it restarts
while the Air is awake it re-points all four engines at the Air's tunnel.

The mini has no checkout of this folder: the files were copied to
`~/dodo-voice-bridge-src` and installed from there. To ship a change:
`scp apps/dodo-voice-bridge/* admin@171.66.240.175:dodo-voice-bridge-src/`
then `ssh admin@171.66.240.175 'bash ~/dodo-voice-bridge-src/install.sh'`.
`~/.dodo-voice-bridge.env` on the mini holds the two secrets (both can be read
back from Vercel with `vercel env pull <file> --environment production` — pull
to a scratch file, never over `.env.local`).

## Checking it

`curl https://<tunnel>/health` → `{ ok, backends, sessions }`. The log has one
line per turn: `turn 3: first text 1185 ms, 385 chars, 2631 ms`. End to end:
`npx tsx scripts/test-eleven-dodo.ts` (see the reference doc).
