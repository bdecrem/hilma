# Setting up Dodo's ElevenLabs + Claude voice engine

For picking this work up on another machine, moving the bridge, or rebuilding it from nothing. How it works is in [`f2-eleven-voice-reference.md`](f2-eleven-voice-reference.md); this file is only the setup. Written 2026-09-20, the day it first ran in production.

## What has to exist

| # | Piece | Where | State on 2026-09-20 |
|---|---|---|---|
| 1 | ElevenLabs account + API key | elevenlabs.io → Developers → API Keys | Starter plan; key in `.env.local`, Vercel and the bridge's env file |
| 2 | Four Speech Engines: "Dodo", "Dodo (dev)", "Polly", "Polly (dev)" | ElevenLabs (created by `engines.mjs`) | Dodo `seng_4101m2zmzxjhfzztr0yry2y1hmyn` (prod) / `seng_0201m2zkd3xbey28ey55e7v86hjp` (dev); Polly `seng_3101m2zv3xxrey3ssf3s19mq7pkb` (prod) / `seng_4601m2zv3xmwf7k9zwk5dsd9f1na` (dev) |
| 3 | The voice bridge, publicly reachable over `wss://` | Railway | project + service `dodo-voice-bridge`, `https://dodo-voice-bridge-production.up.railway.app`, since the evening of 2026-09-21 (a day on the MacBook Air and an afternoon on the Mac mini before that; the mini's launchd job is stopped, the Air's is not — see the bridge README) |
| 4 | Four env vars on Vercel (Production): the three below + `POLLY_ELEVEN_SPEECH_ENGINE_ID` (Polly's prod engine) | `vercel env` | set |
| 5 | `f2_voice_sessions.system_prompt` column | Supabase | applied (`apps/f2/schema/050_f2_eleven_voice.sql`) |
| 6 | Dodo build 0.2 (110) or later | the phone | installed on Bart's iPhone |

Nothing else: the routes deploy with the repo, and Anthropic/Supabase keys are the ones the rest of Dodo already uses.

## A new development machine

You only need this to **run the voice engine locally** (the harness, the simulator drill). Using the engine from a phone against production needs nothing on your machine.

1. **`.env.local`** needs, besides the usual Dodo keys (`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `F2_SESSION_SECRET`):
   ```
   ELEVENLABS_API_KEY=…                      # same key as Vercel's
   DODO_BRIDGE_SECRET=…                      # must equal the bridge's — see "Secrets" below
   ELEVEN_SPEECH_ENGINE_ID=seng_0201m2zkd3xbey28ey55e7v86hjp   # the DEV engine
   ```
2. **The dev engine's turns must reach YOUR dev server.** A bridge forwards `/ws/dev` to `http://localhost:3100` *on the machine it runs on* — on Railway that is nothing. So run a bridge on your machine: `bash apps/dodo-voice-bridge/run.sh` starts one behind a Cloudflare quick tunnel and re-points **only the two dev engines** at it (the production engines stay on Railway).
3. `npx next dev --turbopack -p 3100`, then `npx tsx scripts/test-eleven-dodo.ts topic` — expect six PASS lines and a spoken exchange in the log.
4. iOS: `brew install xcodegen`, `cd apps/feynd && xcodegen generate`. If the first Xcode build sits at 0 % CPU on "Resolve Package Graph", seed LiveKit's binaries by hand — `apps/feynd/CLAUDE.md` has the recipe. The simulator drill takes `-voiceEngine eleven` (and `Secrets.swift` on `.dev` = `http://localhost:3100`).

### Do not run `vercel link --yes` in this repo

It **overwrites `.env.local`** with the project's handful of *development* variables — no prompt, no backup. It destroyed the MacBook Air's file on 2026-09-20. Most of Dodo's secrets are marked *sensitive* on Vercel, so `vercel env pull` returns them **blank** and they cannot be recovered that way. If you need the CLI linked: copy `.env.local` aside first, run `vercel link`, copy it back. (`vercel env add/ls` and `vercel redeploy` work once linked and never touch the file.)

## The bridge (piece 3)

`apps/dodo-voice-bridge` — a Node WebSocket server. ElevenLabs connects **to it**, so it lives somewhere always on with a permanent `wss://` hostname: **Railway** since the evening of 2026-09-21 (project and service `dodo-voice-bridge`, `https://dodo-voice-bridge-production.up.railway.app`). The folder's README has the day-to-day commands (`railway up`, `railway logs`, the variables); the Railway CLI on the iMac M1 is linked to it. To rebuild it from nothing:

1. `railway login`, then from `apps/dodo-voice-bridge`: `railway init -n dodo-voice-bridge` and `railway add --service dodo-voice-bridge --variables ELEVENLABS_API_KEY=… --variables DODO_BRIDGE_SECRET=… --variables 'DODO_BRIDGE_BACKENDS={"prod":"https://feynd.cc","dev":"http://localhost:3100","polly-prod":"https://hilma-nine.vercel.app/api/polly/eleven/turn","polly-dev":"http://localhost:3100/api/polly/eleven/turn"}' --variables PORT=3901` (the two secrets: the same values as Vercel — `vercel env pull <scratch file> --environment production`).
2. `railway up --ci --service dodo-voice-bridge` (uploads the folder; `railway.json` gives the start command, the `/health` check and the restart policy), then `railway domain --service dodo-voice-bridge --port 3901`.
3. `curl <domain>/health` answers `{"ok":true,…}`, and a WebSocket upgrade to `<domain>/ws/prod` without a token is refused with 401 (not 404: curl needs `--http1.1` for that check).
4. `node engines.mjs <domain>` points all four engines at it. Then the production check under "Proving it works".

A dev machine runs `bash apps/dodo-voice-bridge/run.sh`: bridge on :3901 → Cloudflare quick tunnel → `engines.mjs <tunnel> dev`, which re-points **only the two dev engines** at the tunnel (the hostname changes every start). It never touches the production engines, so any number of dev bridges can come and go. `install.sh` makes that a launchd job on a Mac that has to stand in for Railway; it is how the bridge ran on the MacBook Air (2026-09-20) and the Mac mini (2026-09-21, uninstalled the same evening). **The Air's job was never uninstalled** and its copy of `run.sh` predates the `dev` filter: if it restarts while the Air is awake it re-points all four engines at the Air. `bash apps/dodo-voice-bridge/install.sh uninstall` there; `node engines.mjs https://dodo-voice-bridge-production.up.railway.app` puts the engines back.

## The engines (piece 2)

`node apps/dodo-voice-bridge/engines.mjs https://<bridge host>` creates or updates all four, by name — voice (Dodo: Jessica, `cgSgspJ2msm6clMCkdW9`; Polly: Alice, `Xb7hH8MSUJpSbSDYk0k2`, multilingual), voice model (`eleven_v3_conversational`; `DODO_ELEVEN_TTS_MODEL=eleven_flash_v2` is ≈ 0.5 s quicker and flatter; English engines refuse `…_v2_5`), a 30 s turn timeout, a one-hour conversation cap, and the rule that forwards the conversation's `dodo_voice_session` variable to the bridge as the `x-dodo-voice-session` header. `run.sh` calls it for you. If the engines are ever deleted it recreates them with **new ids** — then update `ELEVEN_SPEECH_ENGINE_ID` in `.env.local` (dev id) and on Vercel (prod id) from the script's output.

## Vercel (piece 4)

```bash
printf '%s' "$ELEVENLABS_API_KEY" | vercel env add ELEVENLABS_API_KEY production
printf '%s' "$DODO_BRIDGE_SECRET" | vercel env add DODO_BRIDGE_SECRET production
printf '%s' "seng_4101m2zmzxjhfzztr0yry2y1hmyn" | vercel env add ELEVEN_SPEECH_ENGINE_ID production   # the PROD engine
vercel redeploy "$(vercel ls --prod | grep -o 'https://[a-z0-9.-]*vercel\.app' | head -1)" --target production
```
Env vars only reach a **new** deployment — until the redeploy finishes the app shows `ELEVEN_SPEECH_ENGINE_ID is not set`. To change a value: `vercel env rm NAME production`, add again, redeploy.

## Secrets

- `DODO_BRIDGE_SECRET` is ours (`openssl rand -hex 24`). Three copies must match: Vercel, the bridge's `~/.dodo-voice-bridge.env`, and any `.env.local` used for local runs. The canonical copy you can read back is the bridge host's env file (Vercel's is write-only once sensitive). To rotate: new value in all three, `install.sh` on the bridge host, redeploy.
- `ELEVENLABS_API_KEY`: the bridge uses it to verify the JWT ElevenLabs signs every connection with (HS256, secret = SHA-256 of the key), so the bridge and the engines' owner must be the same key's account. After rotating the key: update Vercel + the bridge env file + `.env.local`, `install.sh`, redeploy.

## Proving it works

```bash
# local: dev engine, local dev server, bridge routing /ws/dev to it
npx tsx scripts/test-eleven-dodo.ts final_review --interrupt

# production: prod engine, feynd.cc, a throwaway guest account (delete the f2_users row it prints afterwards)
ELEVEN_SPEECH_ENGINE_ID=seng_4101m2zmzxjhfzztr0yry2y1hmyn \
  npx tsx scripts/test-eleven-dodo.ts global --base https://feynd.cc --guest
```
Six PASS lines each. The bridge log shows the turns as `[dev]` or `[prod]` with time to first text (≈ 0.8 s on Vercel, 1–1.6 s locally). On the phone: Profile → Voice → Voice engine → ElevenLabs + Claude, then any voice surface.

## When it breaks

| Symptom | Look at |
|---|---|
| "Voice failed" right away, `… is not set` | Vercel env vars missing, or no redeploy since they were added |
| Connects, Dodo never speaks | the bridge: `railway logs --service dodo-voice-bridge` from `apps/dodo-voice-bridge` (and `curl https://dodo-voice-bridge-production.up.railway.app/health`); or an old copy of `run.sh` on the MacBook Air re-pointed the engines — `node engines.mjs https://dodo-voice-bridge-production.up.railway.app` |
| Bridge log: `upgrade refused: signature mismatch` | the bridge's `ELEVENLABS_API_KEY` is not the key that owns the engines |
| Bridge log: `backend 401` | `DODO_BRIDGE_SECRET` differs between the bridge and the backend |
| Bridge log: `backend 404 voice session not found` | the engine is pointed at the wrong backend (dev engine ↔ prod, or the reverse), or the `dodo_voice_session` header rule is missing — rerun `engines.mjs` |
| Dodo says "Sorry, I lost my connection for a moment" | a turn failed on the backend (Anthropic error, timeout) — Vercel logs, `[f2/eleven] turn failed` |
| `engines.mjs` → 400 "English Agents must use turbo or flash v2" | a `…_v2_5` voice model; use `eleven_v3_conversational`, `eleven_flash_v2` or `eleven_turbo_v2` |
| Session dies mid-monologue; ElevenLabs' conversation record (`GET /v1/convai/conversations/<id>`) says `Speech Engine generation failed` / `Failed to send message to Speech Engine`, the bridge logged nothing | the WebSocket between ElevenLabs and the bridge was dropped while idle — a long user turn carries no traffic in either direction. The bridge pings every 20 s since 2026-09-22 (`KEEPALIVE_MS` in `server.mjs`); if it recurs, `railway logs` now prints the close code |
| Session dies right after a long answer; the conversation record says `Speech Engine generation failed` with `LLM Cascade Error`, and the bridge log shows `turn N interrupted after 400x ms` two or three times | Claude's first words came later than the engine's `cascade_timeout_seconds` (default 4 s; a four-minute Final Review answer takes 3.5–4 s plus the hop through Vercel). ElevenLabs re-sends the turn at each timeout and gives up after the third. Fixed 2026-09-23: the engines run at 15 s (the API's maximum, set in `engines.mjs`) and the bridge keeps the reply in flight across re-sends (log: `re-sent after … ms, keeping the reply in flight`). Reproduce with `apps/dodo-voice-bridge/drill-slow-turn.mjs` |
| Second voice session in a row fails at once: "Failed to toggle microphone: Audio Engine Error(Audio engine returned error code: -3001)" (LiveKit `kAudioEnginePlayoutStartError`) | ElevenLabs' SDK leaves LiveKit's engine warm (`recordingAlwaysPrepared`, `.playAndRecord`) after a conversation and never releases it; anything that then sets another category (`FlashSFX` set `.ambient` for the grade-reveal sound) breaks the engine. Since 2026-09-22 `ElevenVoiceClient.end()` calls `AudioManager.shared.setRecordingAlwaysPreparedMode(false)` and `FlashSFX` leaves a `.playAndRecord` session alone (Dodo and Polly) |
