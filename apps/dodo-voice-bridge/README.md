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
| `server.mjs` | the bridge: JWT check on upgrade, `init` / `user_transcript` / `ping` / `close`, abort on barge-in. A `user_transcript` with the same `event_id` and transcript as the turn in flight is ElevenLabs re-sending it (no words within the engine's `cascade_timeout_seconds`): the reply in flight is kept, or replayed if it already finished |
| `drill-slow-turn.mjs` | runs this folder's bridge behind a quick tunnel in front of a fake backend that waits `--delay` ms, on a throwaway engine with `--cascade` s, and checks the answer arrives. `CLOUDFLARED=<path> node drill-slow-turn.mjs --delay 25000 --cascade 15` (needs `npm ci` here once) |
| `engines.mjs` | creates / updates the Speech Engines (voice, turn-taking, `ws_url`, `cascade_timeout_seconds: 15`) — idempotent, by name |
| `railway.json` | the Railway service: start command, `/health` check, always restart |
| `run.sh` | a bridge on a dev machine: bridge + Cloudflare quick tunnel + `engines.mjs … dev` (the two dev engines only) |
| `install.sh`, `com.dodo.voicebridge.plist` | a launchd job for a Mac standing in for Railway (`KeepAlive`); not in use since 2026-09-21 |

## Where it runs — Railway (since 2026-09-21)

Railway project **`dodo-voice-bridge`**, service **`dodo-voice-bridge`**,
environment `production`, at **`https://dodo-voice-bridge-production.up.railway.app`**
(a permanent hostname, so the four engines are pointed at it once and stay
there). Railway builds this folder alone (Railpack: `npm install`, then
`node server.mjs` from `railway.json`, which also sets the `/health` check and
an always-restart policy) and passes WebSocket upgrades through its edge.

The service's variables: `ELEVENLABS_API_KEY` and `DODO_BRIDGE_SECRET` (the
same values as Vercel — pull them with
`vercel env pull <scratch file> --environment production`, never over
`.env.local`), `DODO_BRIDGE_BACKENDS` (the JSON below) and `PORT=3901` (the
domain's target port). The `dev` and `polly-dev` backends point at
`localhost:3100`, which on Railway is nothing — the dev engines are for a
bridge on a dev machine (next section).

Working with it, from this folder (the Railway CLI is linked here — on another
machine: `railway link --project dodo-voice-bridge --environment production`
then `railway service link dodo-voice-bridge`):

```bash
railway up --ci --service dodo-voice-bridge     # ship a change (uploads this folder, builds, deploys)
railway logs --service dodo-voice-bridge        # the live log (Ctrl-C to stop streaming)
railway variables --service dodo-voice-bridge   # the env
curl https://dodo-voice-bridge-production.up.railway.app/health
node engines.mjs https://dodo-voice-bridge-production.up.railway.app   # only if the engines ever stop pointing here
```

One process serves every engine by path: Dodo's `/ws/prod` → `https://feynd.cc`
and `/ws/dev` → `http://localhost:3100` (turn route `/api/f2/eleven/turn`), and
Polly's `/ws/polly-prod` → `https://hilma-nine.vercel.app/api/polly/eleven/turn`
and `/ws/polly-dev` → the same path on localhost (`DODO_BRIDGE_BACKENDS`
overrides; a bare origin means Dodo's route).

Before Railway the bridge lived a day on Bart's MacBook Air (2026-09-20) and an
afternoon on the Mac mini (2026-09-21, launchd `com.dodo.voicebridge` behind a
Cloudflare quick tunnel; stopped and uninstalled the same evening, the copy in
`~/dodo-voice-bridge-src` and `~/.dodo-voice-bridge.env` left in place). **The
Air's launchd job was never uninstalled** — its old `run.sh` re-points all
four engines at the Air's tunnel whenever it restarts while the Air is awake.
Run `bash apps/dodo-voice-bridge/install.sh uninstall` there, then
`node engines.mjs https://dodo-voice-bridge-production.up.railway.app` if the engines moved.

## Running it on a dev machine

```bash
bash apps/dodo-voice-bridge/run.sh          # foreground; Ctrl-C stops the bridge and the tunnel
```

Needs `node`, `cloudflared` (`brew install cloudflared`), and the two secrets
in `.env.local` (`ELEVENLABS_API_KEY` verifies the JWT ElevenLabs signs every
connection with; `DODO_BRIDGE_SECRET` must equal the backend's). It starts the
bridge on :3901, a Cloudflare quick tunnel in front of it, and re-points **only
the two dev engines** ("Dodo (dev)", "Polly (dev)") at the tunnel's hostname —
`engines.mjs <origin> dev`. The production engines stay on Railway; nothing on
a dev machine touches them. (`install.sh` turns the same thing into a launchd
job for a Mac that has to stand in for Railway.)

ElevenLabs needs a public `wss://` URL. tunn3l's HTTP mode does not pass
WebSocket upgrades (502, tried 2026-09-20), hence Cloudflare's quick tunnels for
dev machines: no account, a new hostname on every start, which is why `run.sh`
re-runs `engines.mjs` each time.

## Checking it

`curl https://dodo-voice-bridge-production.up.railway.app/health` → `{ ok, backends, sessions }`.
The log (`railway logs`) has one line per turn:
`[prod] turn 3: first text 1185 ms, 385 chars, 2631 ms`. End to end, against
production: `ELEVEN_SPEECH_ENGINE_ID=<prod engine> npx tsx scripts/test-eleven-dodo.ts global --base https://feynd.cc --guest`
(see the reference doc).
