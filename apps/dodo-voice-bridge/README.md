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

Meant for the Mac mini (always on). On 2026-09-20 the mini answered ping and
its tunnels were up but refused SSH from the network the work was done on, so
it was installed on **Bart's MacBook Air** as a stand-in — which only serves
while that laptop is awake and online. Move it: `install.sh uninstall` on the
Air, then on the mini `brew install cloudflared`, pull the repo and run
`install.sh` (it needs `~/.dodo-voice-bridge.env` with the two secrets there,
since the mini's checkout has no `.env.local`).

## Checking it

`curl https://<tunnel>/health` → `{ ok, backends, sessions }`. The log has one
line per turn: `turn 3: first text 1185 ms, 385 chars, 2631 ms`. End to end:
`npx tsx scripts/test-eleven-dodo.ts` (see the reference doc).
