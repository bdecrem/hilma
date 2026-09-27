# Legacy services — what was shut down, where it lived, how to bring it back

Shutdown pass of **2026-09-26** (Bart's list). Everything here was running or scheduled
somewhere before that day and is now off. Code stays in the repos; only the running
pieces were stopped. Revival steps are at the end of each entry.

Inventory that drove this: the live-app review of the same day (hilma + vibeceo), which
probed every domain, Railway service, Vercel project, Mac mini launchd job and App Store
Connect app.

## Shut down

### 1. OpenClawGotchi (Pi Zero, E-Ink Tamagotchi) — NOT REACHED
- **What:** `vibeceo/pico/` — OpenClaw agent on a Raspberry Pi Zero (`openclawgotchi.local`,
  was `192.168.7.150`; `pi` user, password in `pico/CLAUDE.md`).
- **State:** the Pi did not answer mDNS, ping or ARP from the iMac on 192.168.7.x on
  2026-09-26. It is either powered off already or on another network. Nothing could be
  stopped remotely.
- **To finish:** when it is found, `sshpass -p '…' ssh pi@openclawgotchi.local`, then
  `sudo systemctl disable --now <the openclaw unit>` and `sudo poweroff`. Or pull the plug.

### 2. OpenClaw gateway on the iMac M1 (this machine)
- **What:** `ai.openclaw.gateway` (`openclaw gateway --port 18789`), served on the internet as
  `kochi.tunn3l.sh` ("OpenClaw Control"), kept awake by `ai.kochi.caffeinate`, with the
  tunnels `sh.tunn3l.tunnel.kochi` (→18789) and `sh.tunn3l.tunnel` (`bluebubbles-kochi` →1234).
- **Done:** all four LaunchAgents booted out; plists moved to `~/Library/LaunchAgents/disabled/`.
  `kochi.tunn3l.sh` now answers "No tunnel found".
- **Revive:** move the plists back and `launchctl bootstrap gui/$(id -u) <plist>`.

### 3. Ollama + Openlab proxy on the Mac mini
- **What:** `sh.brew.ollama` (Ollama on :11434, `qwen3.5:9b`), `com.openlab.proxy` (:11440), and
  the `sh.tunn3l.openlab-mini` tunnel that `/openlab` on Vercel talks to.
- **Done:** all three booted out on the mini; plists in `~/Library/LaunchAgents/disabled/`.
  Also on the iMac: `com.ollama.ollama` was already not running (left as is).
- **Side effect:** `hilma-nine.vercel.app/openlab` (passcode-gated) can no longer reach a model;
  the page is still deployed. `src/app/api/writer/route.ts` and `scripts/amber-tweet.ts` also
  pointed at a local Ollama and were already dormant.
- **Revive:** move the plists back on the mini, bootstrap them, check `openlab-mini.tunn3l.sh`
  answers 401 (gated) instead of "No tunnel found". Wiring is in `apps/openlab/README.md`.

### 4. OpenClaw gateway on the Mac mini
- **What:** `ai.openclaw.gateway` on the mini (:18789 / :18791).
- **Done:** booted out; plist in `~/Library/LaunchAgents/disabled/` on the mini.

### 5. Claudio (chat rooms for humans + agents)
- **What:** Railway project `claudio.la` (services `claudio` = claudio.la / www.claudio.la and
  `claudio-server`), local `vibeceo/claudio-proxy/` (port 18790, never a launchd job), planning
  docs in `vibeceo/claudio/`, the iOS app "Claudio: Openclaw text & voice"
  (`com.kochito.claudio`, App Store review REJECTED, last TestFlight build expired).
- **Done:** the Railway project was **deleted** (`projectDelete`), so claudio.la no longer
  serves. The domain itself still points at Railway (Namecheap); nothing was changed there.
  The App Store Connect record was left alone (nothing runs there).
- **Revive:** `railway init` a new project from `vibeceo/claudio*` sources and re-add the domain.

### 6. Token Tank (the incubator's auto-tweets)
- **What:** three LaunchAgents on the iMac M1 — `com.tokentank.auto-tweet`,
  `com.tokentank.goodmorning`, `com.tokentank.morning-tweet` — running
  `vibeceo/incubator/scripts/auto-tweet.ts` on a schedule. They had been failing every run
  (exit 78, the fresh OS install lost their env). The daily job inside the SMS bot
  (`registerTokenTankDailyJob`) was already commented out; the `TT` SMS command and the
  `webtoys.ai/token-tank` blog pages are static/on-demand and were left in place.
- **Done:** booted out; plists in `~/Library/LaunchAgents/disabled/`.
- **Revive:** `vibeceo/incubator/scripts/setup-auto-tweet.sh`.

### 7. RivalAlert
- **What:** `vibeceo/web/app/rivalalert` (+ `api/rivalalert/trial`), `sms-bot/agents/rivalalert`,
  `incubator/i1/rivalalert` monitoring. Domain rivalalert.ai already 404s.
- **State:** nothing was running: the daily job was disabled in `sms-bot/lib/sms/bot.ts` on
  2026-03-30 and no cron or launchd job references it. The page at `webtoys.ai/rivalalert` is
  static and stays (it is content, not a service).
- **Revive:** uncomment `registerRivalAlertDailyJob()` in `sms-bot/lib/sms/bot.ts`.

### 8. Home Whisperer
- **What:** the standalone Vercel project `whisperer` (whisperer.haus) synced from
  `vibeceo/web/app/whisperer` by `.github/workflows/sync-whisperer.yml`; Pi camera scripts in
  `vibeceo/pico/whisperer/`.
- **Done:** Vercel project **deleted** (`vercel project rm whisperer`, the domain is now
  unassigned) and the sync workflow removed from vibeceo (commit `754adabaa`). The page still
  renders inside the main web app at `webtoys.ai/whisperer` (static content).
- **Revive:** `vercel` from a checkout of the whisperer page and re-add the domain; restore
  the workflow from git history.

### 9. Crash Course episode generators ("Generate AI Papers Daily Episode")
- **What:** two GitHub Actions cron workflows in `bdecrem/crashapp` — **Generate AI Papers
  Daily Episode** (13:00 UTC daily) and **Generate Academic Drama Episode** (00:15 UTC daily) —
  each POSTing to `crashapp-production.up.railway.app/api/generate-ai-papers-episode`.
- **State:** both had failed on every run for months (376 runs): the Railway service they call
  (`CRASH` project, service `crashapp`, listen.crashcourse.cc) has had a FAILED deployment
  since 2025-10-15, so the endpoint is dead.
- **Done:** both workflows **disabled** (`gh workflow disable`). The Railway projects `CRASH`
  and `Crash Course` were left as they are (nothing running in `CRASH`; `Crash Course` has two
  SUCCESS services from 2025-09 that back the App Store app "Crash Course", 1.1 ready for sale).
- **Revive:** `gh workflow enable "Generate AI Papers Daily Episode" -R bdecrem/crashapp` after
  the Railway backend builds again.

## Still running, noticed on the way, not touched

- Railway `surprising-ambition` → `simapt` (simapt-production.up.railway.app, 2026-03) + a Postgres.
- Railway `ideal-bravery` → `bomfireio` (bomfire.io, 2025-12).
- Railway `Crash Course` → `crash_course` + `crash` (2025-09), App Store backend.
- Old Vercel projects: ctrlshift.so, tiny.surf, kochitolabs.com, advisorsfoundry pages,
  alexirwellness.com, myveo.ai, porto, unhinged, relay, crash-course-ten (all v0-era, 7+ months idle).
- On the iMac M1: a hand-started `tunn3l http 3000 --subdomain onething` (502, nothing on
  :3000) and `sh.tunn3l.tunnel.ssh` (not running, exit 1).
- Bang (the second GolemBot) is not running anywhere that could be found.

## The Railway builds for vibeceo have been failing

Found while checking whether pushes reach production (2026-09-26):
- `kochi.to` project, service **smsbot**: last SUCCESS **2026-05-21**; 35 failed builds since.
  `npm run build` fails on `lib/gmail-client.ts` type errors (googleapis / google-auth-library
  version mismatch on the build image).
- `kochi.to` project, service **www.kochi.to** (webtoys.ai, shipshot.io, mutabl.co …):
  last SUCCESS **2026-09-06**; fails since with `Module not found: Can't resolve
  '@/components/ui/button'` / `'@/lib/supabase'` etc. (files are tracked in git; the Docker
  build at `/app` does not see them) plus a font error in `app/pixelpit/whack`.
- The sites keep serving the last good deployment, so nothing looks broken from outside, but
  **no vibeceo push since those dates has reached production**, including the 2026-09-26
  model migration.
- **Fixed 2026-09-27.** smsbot: `sms-bot/.dockerignore` excluded `package-lock.json` and the
  Dockerfile ran a fresh `npm install`, which nested a second google-auth-library under
  googleapis-common; now the lockfile ships and the build runs `npm ci` (vibeceo `d6ca3c7c7`,
  deployed SUCCESS 15:21 UTC). www.kochi.to: the module-not-found failure hit one build only
  (2026-09-25, `d9d5eaaac`); the next two (`85589ee78`, `d6ca3c7c7`) built with no change, so it
  looks transient. The PressStart2P font error is a warning (that `.woff2` is base64 text).
- Still failing, not touched: service **websocket** (root `web/`, `npm run start:ws`) has never
  deployed in its 20 listed attempts: it builds, then fails the `/api/health` healthcheck that the
  shared `/railway.toml` gives every service (the WebSocket server has no HTTP route).

## Model migration of the same day (services that stayed up)

Every Sonnet call → `claude-sonnet-5`, every Opus call → `claude-opus-5-5`, with the request
shape fixed at each site (no sampling params, thinking handling, text block found by type, no
prefill, no forced tool_choice on Opus 5.5). Haiku and Fable calls were left alone. Details in
the commits of 2026-09-26 in hilma and vibeceo; see also the "Claude models" section of the
root `CLAUDE.md`.

Two things had to move with it:
- **Claude Code on the Mac mini** was 2.1.269, which returns `400 … does not support this model;
  version 2.1.280 or newer is required` for Opus 5.5. Updated to 2.1.283 (`npm i -g
  @anthropic-ai/claude-code@latest`). Strays (GolemBot) now falls back to Opus 5.5
  (`~/golembot/strays/golem.yaml`, backup `golem.yaml.bak-2026-09-26`).
- **The Macinclaude Code agent** (`apps/macplus/agent`) pins the Agent SDK; it was bumped so
  its bundled CLI knows the model, and the Mac Plus agents were redeployed with
  `bash ~/hilma-deploy/apps/macplus/backend/update.sh`.
