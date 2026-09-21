# Setting up Dodo's ElevenLabs + Claude voice engine

For picking this work up on another machine, moving the bridge, or rebuilding it from nothing. How it works is in [`f2-eleven-voice-reference.md`](f2-eleven-voice-reference.md); this file is only the setup. Written 2026-09-20, the day it first ran in production.

## What has to exist

| # | Piece | Where | State on 2026-09-20 |
|---|---|---|---|
| 1 | ElevenLabs account + API key | elevenlabs.io → Developers → API Keys | Starter plan; key in `.env.local`, Vercel and the bridge's env file |
| 2 | Four Speech Engines: "Dodo", "Dodo (dev)", "Polly", "Polly (dev)" | ElevenLabs (created by `engines.mjs`) | Dodo `seng_4101m2zmzxjhfzztr0yry2y1hmyn` (prod) / `seng_0201m2zkd3xbey28ey55e7v86hjp` (dev); Polly `seng_3101m2zv3xxrey3ssf3s19mq7pkb` (prod) / `seng_4601m2zv3xmwf7k9zwk5dsd9f1na` (dev) |
| 3 | The voice bridge, publicly reachable over `wss://` | a Mac that stays on | launchd job on the Mac mini since 2026-09-21 (installed from `~/dodo-voice-bridge-src`, see the bridge README) |
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
2. **The dev engine's turns must reach YOUR dev server.** The bridge forwards `/ws/dev` to `http://localhost:3100` *on the machine the bridge runs on*. So either run the bridge on the same machine (`bash apps/dodo-voice-bridge/run.sh` — but see the warning in step 3 of "The bridge" about two bridges), or point the running bridge's `dev` backend at a tunnel to your dev server (`DODO_BRIDGE_BACKENDS` in its env file).
3. `npx next dev --turbopack -p 3100`, then `npx tsx scripts/test-eleven-dodo.ts topic` — expect six PASS lines and a spoken exchange in the log.
4. iOS: `brew install xcodegen`, `cd apps/feynd && xcodegen generate`. If the first Xcode build sits at 0 % CPU on "Resolve Package Graph", seed LiveKit's binaries by hand — `apps/feynd/CLAUDE.md` has the recipe. The simulator drill takes `-voiceEngine eleven` (and `Secrets.swift` on `.dev` = `http://localhost:3100`).

### Do not run `vercel link --yes` in this repo

It **overwrites `.env.local`** with the project's handful of *development* variables — no prompt, no backup. It destroyed the MacBook Air's file on 2026-09-20. Most of Dodo's secrets are marked *sensitive* on Vercel, so `vercel env pull` returns them **blank** and they cannot be recovered that way. If you need the CLI linked: copy `.env.local` aside first, run `vercel link`, copy it back. (`vercel env add/ls` and `vercel redeploy` work once linked and never touch the file.)

## The bridge (piece 3)

`apps/dodo-voice-bridge` — a Node WebSocket server plus a Cloudflare quick tunnel. ElevenLabs connects **to it**, so it must be on a machine that is awake and online whenever anyone uses the engine.

1. On the host: `brew install node cloudflared`, clone/pull the repo.
2. Secrets file (the installer makes it from `.env.local` if that exists; on the mini write it by hand):
   ```bash
   cat > ~/.dodo-voice-bridge.env <<'EOF'
   ELEVENLABS_API_KEY=…
   DODO_BRIDGE_SECRET=…
   EOF
   chmod 600 ~/.dodo-voice-bridge.env
   ```
3. `bash apps/dodo-voice-bridge/install.sh` — copies the bridge to `~/Library/Application Support/dodo-voice-bridge` (launchd cannot read `~/Documents`), loads `com.dodo.voicebridge`, which runs `run.sh`: bridge on :3901 → quick tunnel → `engines.mjs` re-points **both** engines at the new tunnel hostname.
   **Run exactly one bridge.** A second one (another machine, or a foreground `run.sh`) steals both engines' `ws_url` on start. Before installing on a new host: `bash apps/dodo-voice-bridge/install.sh uninstall` on the old one.
4. Check: `tail ~/Library/Logs/dodo-voice-bridge.log` ends with `bridge up at https://….trycloudflare.com`, and `curl <that>/health` answers.
5. Re-run `install.sh` after changing anything in the folder (the job runs the copy).

It moved to the Mac mini on 2026-09-21 (steps 2–4; node and cloudflared were already there). The MacBook Air that hosted it first was off at the time, so its job still needs `install.sh uninstall` the next time it is on.

The tunnel hostname changes on every restart; nothing else depends on it because `run.sh` updates the engines each time. A permanent URL needs a named Cloudflare tunnel (an account) or WebSocket support in tunn3l (its HTTP mode answers upgrades with 502).

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
| Connects, Dodo never speaks | the bridge: host asleep/offline, launchd job not running, or a second bridge took the engines. `tail ~/Library/Logs/dodo-voice-bridge.log` |
| Bridge log: `upgrade refused: signature mismatch` | the bridge's `ELEVENLABS_API_KEY` is not the key that owns the engines |
| Bridge log: `backend 401` | `DODO_BRIDGE_SECRET` differs between the bridge and the backend |
| Bridge log: `backend 404 voice session not found` | the engine is pointed at the wrong backend (dev engine ↔ prod, or the reverse), or the `dodo_voice_session` header rule is missing — rerun `engines.mjs` |
| Dodo says "Sorry, I lost my connection for a moment" | a turn failed on the backend (Anthropic error, timeout) — Vercel logs, `[f2/eleven] turn failed` |
| `engines.mjs` → 400 "English Agents must use turbo or flash v2" | a `…_v2_5` voice model; use `eleven_v3_conversational`, `eleven_flash_v2` or `eleven_turbo_v2` |
