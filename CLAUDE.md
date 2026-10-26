# Hilma

> **Personal side note (not project-related):** Rivian R2 lease analysis in progress — see [misc/rivian-r2-lease-analysis.md](misc/rivian-r2-lease-analysis.md). Pick the conversation back up from there.

## Do the work yourself — no lazy shortcuts

When a step is doable with the tools available, do it — don't punt it to Bart and don't offer to do it instead of just doing it.

- **Verification is my job, not Bart's.** "Verify behavior" means I drive it. I have a browser (Playwright + Chrome MCP), a shell, DB access, and the iOS simulator. If checking the fix means loading a page, logging in, querying the database, or launching the app, I do that myself and report what I observed. Asking Bart to "load the page and tell me what you see" or "let me know if it works" is the lazy punt to avoid.
- **Don't stop at "it compiles."** A passing `pnpm build` / `xcodebuild` is necessary, not sufficient. Exercise the actual feature before saying it's done (see the F2 "spec first, then verify behavior" gates below).
- **Don't offer when you can act.** Replace "want me to verify?" / "you could check X" with the verified result. The only things worth asking before doing are genuinely sensitive actions (destructive ops, sending messages to other people, mutating Bart's real data, spending money) — those still need an explicit go-ahead. Pushing is NOT one of them (see Deploying).
- **If a step is truly blocked, say so plainly** — name the blocker (no credentials, endpoint down, tool not connected) instead of quietly handing the work back.

### Finish the work — always. There is no "paused" or "want me to continue?"

Bart has gotten angry about this, hard. When a task is started, **finish it in the same turn** — all of it, end to end. The answer to "would we ever not want the work finished?" is **no**. Do not leave a task "paused," "partially done," or "in the working tree for later." Do not stop at a blocker you can route around, and do not end a turn with "say the word and I'll pick it back up" — just pick it back up and finish.

- **Never ask permission to finish.** "Want me to resume X?" / "should I keep going?" / "let me know and I'll…" are all banned. If X is part of what was asked and is doable, do it now. The only pause is for a genuinely sensitive action (destructive op, spending money, mutating real data in a risky way) or a hard external blocker only Bart can clear (unlock the phone, provide a credential) — and even then, finish everything else around it first.
- **A blocker on one sub-part doesn't stop the rest.** Route around it: if a Vercel path can't do something, do it locally; if an API can't raise a limit, re-encode to fit; if the phone is locked, finish all the code + commits + verification and only the physical install waits. Deliver everything that isn't literally blocked.
- **"Finish" includes verify + commit + push.** Don't hand back compiled-but-unverified, verified-but-uncommitted, or committed-but-unpushed. Carry it all the way to the working, shipped state that was asked for.
- Leaving half-finished work and reporting it as a status update is the single fastest way to make Bart furious. Finishing without being re-prodded is the expectation, every time.

State all of this plainly; this is a standing expectation, not a one-off.

## Small change = small job. Ship it in under a minute.

If I described something as a one-line / two-line / trivial change, that is a
commitment about time, not just diff size. Do exactly that edit, run the one
check that proves it (tsc or the build), commit, push, done. Do NOT expand it:
no probing adjacent systems, no regenerating assets, no fallbacks for cases
nobody asked about, no verification tours. If the edit turns out to need more
than that, STOP after the edit, ship what's safe, and say in one line what
else it would take — Bart decides whether to spend the time.

Concretely: when the ask is a small, low-risk edit, hand it to a subagent with
`model: "haiku"` and a scope of "make this edit, run the build, commit, push,
report" so the main session's habit of widening the job never kicks in. If
Bart is between things (a train, a meeting), that's the only mode allowed.

And never sit silent for more than ~60 seconds: a quick "doing X, ~N min"
beats thinking in the dark.

This rule came from 2026-09-11: "add the twelve voices" was called a
one-line change, then grew into twenty minutes of probes, fallbacks and
audio regeneration. Bart missed his train.

## Never host deliverables on claude.ai artifacts — we have our own hosting

Do not publish pages, previews, or any work product for Bart as claude.ai Artifacts (the `Artifact` tool), even "private" ones. Everything Bart needs to open lives on our own infrastructure:

- **Web pages / creations:** the right home in this repo (Vercel: **ola.cx** and its domains, see "Default domain" below), or the sibling project the work belongs to (daskollektiv.rip for DK tracks, intheamber.com for Amber). When Bart asks for "a link I can click", the answer is a link on our hosting, never an artifact.
- **Quick previews before a push:** a tunn3l URL from this machine (see the Tunn3l section; `../tunn3l/`), pointed at a local static server or the dev server.
- **Files he just needs to open (audio, video, images, PDFs):** send them with `SendUserFile`, and keep a copy under `~/Desktop/<project>/` so they outlive the session scratchpad.

This rule came from the SILT track (2026-09-02): the page was posted as an artifact and Bart said "Don't ever post artifacts you make for me on Claude.ai. We have our own hosting." No exceptions.

## Flag when Extra High effort may help

At the start of a non-trivial feature or debugging request — and again after I've scoped it and read the relevant code — flag to Bart (one line, with the reason) when it may be worth switching the effort level to Extra High via `/effort`. I can't flip the switch myself; I only flag and Bart decides.

Worth flagging: interacting state / ordering (state machines like the F2 quiz/star/topic flows), changes that span many files or web + iOS + backend at once, design decisions with real tradeoffs (schema/auth/routing shape), non-obvious debugging, and correctness-critical or algorithmic logic. Not worth it (High or lower is fine): mechanical edits, renames, dep bumps, following an established pattern, clear single-file changes, lookups. The post-scoping checkpoint matters most — difficulty often only surfaces once I've read the code.

## What is this

Hilma is a clean Next.js project — the new home for new things. Replaces the bloated vibeceo8/web codebase. Cherry-pick from vibeceo8 as needed, don't migrate.

This repo CLAUDE.md is for general best practices, conventions, and project knowledge shared across all devices. Device-specific instructions (machine identity, tunn3l subdomain, local cron schedules, etc.) belong in the device-level `~/.claude/CLAUDE.md`.

## Stack

- **Framework:** Next.js 15.3, React 19, App Router
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4, Canvas API for generative art
- **Build:** Turbopack (dev), pnpm (packages)
- **Deploy:** Vercel (project: `hilma`, root domain **https://ola.cx**; `hilma-nine.vercel.app` is the same deployment and still answers, but never give out that URL)

## Default domain: ola.cx (since 2026-10-03)

**`https://ola.cx` is the root URL of the hilma deployment and the default domain for anything new.** A new page, route, prototype or creation that has no domain of its own lives at `https://ola.cx/<path>` — that is the link to hand Bart, to put in OG tags (`og:url`, `og:image`, `metadataBase`), in share cards, READMEs, tweets and Discord replies. `hilma-nine.vercel.app` serves the identical deployment and keeps working for old links and the iOS apps' backend URLs, but it is a Vercel-generated name and must not appear in anything new. Projects with their own domain keep it (dodo.foo, feynd.cc, jambot.to, onething.ink, intheamber.com, decremental.com, …; the table above and the host rewrites in `next.config.ts` are the map).

Plumbing: registered on Namecheap 2026-10-03 (three letters, a nonsense word, $19.98/yr), DNS on Namecheap BasicDNS (`A @ → 76.76.21.21`, `CNAME www → cname.vercel-dns.com`), both `ola.cx` and `www.ola.cx` on the Vercel project `hilma`, all done with `node ../tunn3l/plumb/plumb.js link ola.cx --vercel hilma`. The root `/` serves `src/app/page.tsx` (the Hilma af Klint orbs), with no host rewrite. Next domain: register, then the same plumb command (the Namecheap API key is in `~/.plumb/config.json` on this iMac; the calling IP must be whitelisted on Namecheap → Profile → Tools → API Access). `scripts/domains/` finds cheap short names (`tld-prices.mjs`, `short-names.mjs`).

## Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint
vercel --prod     # Deploy to production
python3           # Use python3 (not python) for all Python scripts
```

## Apps

Hilma hosts several apps. Some are standalone in `apps/`, some are Next.js routes on Vercel, and Tunn3l has its own repo. Services that were retired, and how to revive them, are listed in `docs/legacy-services.md` (shutdown pass of 2026-09-26).

| App | Path | Deploy | What it is |
|-----|------|--------|------------|
| **Tunn3l** | `../tunn3l/` (own repo: `bdecrem/tunn3l`) | DigitalOcean droplet (tunn3l.sh) | Tunnel service — moved to standalone repo |
| **Collab** | `apps/collab/` | — | Collaboration plugin |
| **MCP Dashboard** | `apps/mcp-dashboard/` + `src/app/apps/mcp-dashboard/` | Vercel | MCP server dashboard |
| **Decremental** | `src/app/projects/` | Vercel (decremental.com/projects) | The project list. Light mode only on the landing page's warm paper (#fff6ea) in Inter Tight — the dark theme and its toggle were removed 2026-09-09. decremental.com's **root** now serves the bartin16 landing instead. |
| **Bart in 16** | `src/app/hi/` | Vercel (bartin16.xyz) | Bart's personal homepage. `/hi` is a whole-document route (`route.ts` + `home.ts`), not a React page, so the design keeps its own stylesheet — `_alts/styles.ts` under `.edition-three`, shared with the `/hi/alt4` draft. The React homepage it replaced on 2026-09-09 is in `_archive/`. OG card at `public/hi/og.png` is composited from a Playwright shot of the page itself (`scripts` note: regenerate it after a type or layout change). Display tracking on the big flow lines stays near -.016em; anything near -.05em collides "rn" into "m" in "learning", worst in Safari. |
| **Writer** | `src/app/writer/` | Vercel | Writing tool |
| **Amber** | `src/app/amber/` | Vercel | Generative art + daily creations (~25 pieces) |
| **F2 (web)** | `src/app/f2/` | Vercel (feynd.cc) | Learning app — chat + topics + paste, user-scoped |
| **Dodo (iOS)** | `apps/feynd/` | Xcode (manual TestFlight) | Native iPhone client for F2 (app name **Dodo**; folder/bundle keep the old Feynd identifiers), talks to the same `/api/f2/*` backend. Jelly brand since 2026-10-01 (sky jelly dodo mascot, jelly critters as avatars, candy Peck map — art source `misc/dodo-redesign/`, doc `apps/feynd/branding/BRANDING.md`). The Peck map is **Living Island** since 2026-10-19: six chapters painted in Canvas 2D in `misc/dodo-redesign/living-island/world/`, baked to tiles by `scripts/peck-world/render.mjs`, everything that moves native (see `apps/feynd/CLAUDE.md`) |
| **Loci (iOS)** | `apps/loci/` | Xcode (XcodeGen, same workflow as Feynd) | v3 learning app — spaced-repetition memory layer (`/api/f3/*`, `src/lib/f3/`) on F2 accounts/topics: idea cards, conversational recall grading, primer questions. Includes voice mode (Peri engine via `/api/f4/walk`): global voice walk from Today, per-topic voice from any row, transcripts merge back into topic chat |
| **Peri (iOS)** | `apps/peri/` | Xcode (XcodeGen, same workflow as Feynd) | Voice-only walking tutor — OpenAI Realtime over WebRTC (`/api/f4/walk/*`, `src/lib/f4/`). Peri speaks first, quizzes the Loci card deck conversationally, records reviews via server-authed tools. Harness: `scripts/test-walk-realtime.mjs` |
| **Dodo voice bridge** | `apps/dodo-voice-bridge/` | Railway, project + service `dodo-voice-bridge` (`railway up` from the folder; `https://dodo-voice-bridge-production.up.railway.app`) since 2026-09-21 | The WebSocket server ElevenLabs Speech Engine connects to for Dodo's ElevenLabs + Claude voice engine; forwards each turn to `/api/f2/eleven/turn`. See "Dodo voice, ElevenLabs + Claude" in `src/lib/f2/CLAUDE.md` and the folder's README |
| **MacPlus** | `apps/macplus/` | Retro68 → BlueSCSI SD card (manual) | Native classic-Mac (System 6, 68000) apps for Bart's real Macintosh Plus. See `apps/macplus/CLAUDE.md` |
| **Plus Buddy** | `src/app/plus/` + `apps/macplus/agent-voice/` | Vercel (`/plus`) + Mac mini (`sh.macplus.voice` :2341, tunn3l `voice-mini`) | Animated Mac Plus mascot that talks in MacinTalk Fred while Macinclaude is connected. `echo "text" > ~/.plus-voice-inbox` on the mini makes it say a line. See `apps/macplus/BACKEND.md` |
| **Polly (iOS)** | `../polly/` (own repo: `bdecrem/polly`) | Vercel project `polly` (polly-iota.vercel.app) + its own Supabase project | Language-learning app cloned from Dodo (2026-09-17). **Moved out of hilma on 2026-09-30** so it can be handed to someone else without access to the rest: iOS app (`ios/`), backend (`/api/polly/*`), `polly_*` schema, docs and checks all live in that repo, with the data copied to a fresh Supabase project. hilma keeps only a rewrite that forwards `/api/polly/*` on this host to the new backend (for app builds older than the move) and the shared iMessage plumbing (see "iMessage — one inbox" below). The voice bridge (`apps/dodo-voice-bridge`) still serves Polly's engines: `DODO_BRIDGE_BACKENDS` `polly-prod` points at the new backend |
| **Dolly (iOS)** | `apps/dolly/` + `src/lib/dolly/` + `src/app/api/dolly/` + `src/app/dolly/` + `apps/dolly/schema/` + `scripts/dolly/` | Xcode (XcodeGen; TestFlight via the mini, `apps/dolly/testflight/ship-via-mini.sh`) + Vercel (ola.cx/dolly, `/api/dolly/*`) | **A three-minute spoken call a day, in Spanish (Mandarin early)**, built 2026-10-10 from the daily-call v2 design: a text at your hour with a link into a call with Dolly (ElevenLabs + Claude), three things to say back, ten graded cards, a streak, star rounds on a can-do curriculum with refreshers, XP and bird ranks, flash cards. Ships on Polly's TestFlight record (bundle `com.bartdecrem.Polly`); Aidan's Polly (`../polly`) is untouched. **Read `apps/dolly/CLAUDE.md` first** (the full overview, schemas, checks, simulator hooks) |
| **Tap Tap Dodo (iOS)** | `apps/taptapdodo/` | Xcode (XcodeGen, same workflow as Feynd) | Three-lane rhythm game starring a dodo — SpriteKit + AVAudioEngine synthesis, zero audio files, seeded procedural charts, 5 synth-genre sets. See `apps/taptapdodo/CLAUDE.md` |
| **Takt (iOS + Mac)** | `apps/takt/` | Xcode (XcodeGen; Catalyst for Mac, the primary platform) | Piano course for grown-ups, "the conservatory and the club" (2026-10-24): a groove is always playing, MIDI-measured mastery gates, the band unmutes as you play clean, every lesson ends with a loop exported as MIDI. Level 1 is the blues. Runs on the device; an ola.cx account (`/api/takt/*`, `takt_*` tables) only syncs progress. TestFlight: "Takt Keys Tutor" Spec `apps/takt/BRIEF.md`; read `apps/takt/CLAUDE.md` first (milestone status, build, headless screenshots) |
| **GolemBot** (Strays / Bang) | `apps/golembot/` | Mac mini `admin@171.66.240.175`, launchd `com.golembot.strays` | **Discord → Claude Code.** @mention **Strays** in the kochitolabs server (`#straykids`, `#bangbang`) and an agent on the mini builds, verifies, commits, pushes and replies with a link. It works in its own checkout `~/hilma-bot`. This folder is config + runbook; the bridge is the open-source [golembot](https://github.com/0xranx/golembot). **Read [`apps/golembot/CLAUDE.md`](apps/golembot/CLAUDE.md) before touching it** |
| **Onething** | `src/app/onething/` + `src/app/api/onething/` + `src/lib/onething/` + `apps/onething/schema/` | Vercel (onething.ink) | One sentence a day over iMessage, with a streak and a small paper-journal page. Built by Strays from Discord 2026-09-12. See `src/app/onething/CLAUDE.md` |
| **Hello Strays** | `src/app/hello-strays/` | Vercel (`/hello-strays`) | One-screen "hello from Strays" card: what the bot is, the date it was built (a fixed string, not a live date), a link to bartin16.xyz. Warm-paper palette, own layout + OG image. First page built by Strays from the Discord live-test channel, 2026-09-13 |
| **Openlab** | `apps/openlab/` + `src/app/openlab/` | Vercel (`/openlab`) + Mac mini (Ollama behind `com.openlab.proxy` and tunn3l `openlab-mini` — **shut down 2026-09-26**, see `docs/legacy-services.md`; the page is still deployed but has no model behind it) | Open-source AI explorations, 2026-09 to 2027-03: local models on the Stanford mini (`qwen3.5:9b` via Ollama), constitution-as-prompt baseline, evals, corpus, fine-tuning. Frame, hardware notes and dated log in `apps/openlab/README.md`; each exploration is a numbered folder with its own README and `out/`. `/openlab` is a chat with the mini's model under the constitution; wiring in the README's "The chat page" |
| **Jam (web)** | `src/app/jam/` + `public/jam/` | Vercel (`/jam`) | Mobile chat UI for Jambot: the whole groovebox (session, tools, agent loop, rendering) runs in the browser from a committed bundle; the server only signs LLM calls. See `src/app/jam/CLAUDE.md` |
| **Rock Paper Anything** | `src/app/rpa/` + `src/app/api/rpa/` + `src/lib/rpa/` + `apps/rpa/schema/` | Vercel (`/rpa`) | Showcase game for Jev, TypeSafe's System One model: things march on your gate, you type anything, and one Jev call judges the phrase against every enemy on screen at once; the probability is the damage. See `src/app/rpa/CLAUDE.md` |
| **Code-drawn videos** (Strangers, Peck or Perish trailer, Overclock projections, Polder) | `apps/strangers/` + `apps/peck-trailer/` + `apps/overclock-video/` + `apps/polder-video/` | Rendered MP4 → `~/Desktop/<project>/` | Beat-synced vertical music edits drawn frame by frame on canvas (halftone, manga speed lines, RGB split, slammed type), rendered with Playwright + ffmpeg in about a minute. **The method is `apps/strangers/PROCESS.md`**: reference analysis, beat/lyric measurement, storyboard, characters, art style, render, checks. See "Making a video" below |
| **Dodo motion** | `apps/dodo-motion/<slug>/` | 1080p MP4 → `~/Desktop/dodo-motion/` + a `player.html` web page | Short code animations of Dodo topics the Claude Motion way (2026-10-09): storyboards first, then a HyperFrames composition where `script.js` holds every word, number and timing and `index.html` only draws. The method is the `/motion` skill (`~/.claude/skills/motion/SKILL.md`); the first piece, `unit-distance/` ("One unit apart", 45 s, from the Unit Distance flash cards), is the template to copy — its README has the loop (check → draft render → one frame per second → fix → delivery render → build the player). **The method as a page: `ola.cx/dodo-motion`** (`src/app/dodo-motion/`, written 2026-10-12 from the template and its commit while the M4 was unreachable; the hosted player of each piece goes to `public/dodo-motion/<slug>.html`; check `node scripts/dodo-motion/page-check.mjs <dir> [base]`) |
| **Dodo site** | `src/app/dodo/` + `public/dodo/scenes/` + `scripts/dodo-scenes/` | Vercel (dodo.foo, dodogo.cc) | The project's essay-style homepage: statement, a looping hero (six app screens + the mascot reacting), the idea, the feature list, the TestFlight ask; `/dodo/alt` is the older product page. Redone 2026-10-02 in the jelly brand (`apps/feynd/branding/BRANDING.md`): `DodoMascot.tsx` is the live jelly dodo in SVG, `DodoFrame.tsx` the one frame behind the hero, App Store shots, video frames and the OG card (`/dodo/scene/og?format=og`, screenshot into `src/app/dodo/opengraph-image.png`), favicon = the app icon. Screenshots come from `scripts/dodo-scenes` (manifest `scenes.json`, `pnpm dodo:capture` against the simulator; on this iMac with `--token`/`--backend` against a local dev server since `DODO_DEMO_PASS` lives on the Air — README there), then `pnpm dodo:export` for the App Store and README strip |
| **Dodo anime** | `public/dodo/anime.html` + `src/app/dodo/anime/route.ts` + `scripts/dodo-anime/` | Vercel (dodo.foo/anime) | Art piece, 2026-09-23: Dodo and the Peck map redrawn as a four-episode summer anime (paddies, cedar wood at magic hour, night festival, Mauritius at dawn), a scroll-driven stamp rally, and a studio model sheet. One self-contained HTML file; the route proxies it. `node scripts/dodo-anime/shots.mjs <dir> [url] [w] [h]` walks the trail and screenshots it; `og.mjs` rebuilds `public/dodo/anime-og.png` |
| **Token Surfers (iOS + Mac)** | `apps/tokensurfers/` + `src/app/api/surf/llm/` + `src/lib/surf/` | Xcode (XcodeGen; Catalyst for Mac); web at tokensurfers.app + brainrot.surf (Vercel, → `/surf`) | Brainrot vibe-coding app (2026-09-23): Splat (Claude Code run headless on the Mac mini) builds apps while you play the Token Surfers runner underneath; global leaderboard, accounts, a gallery with upvotes, remixes and comments on the web at `/surf`. See `apps/tokensurfers/CLAUDE.md` (the full overview is at its end) |
| **DRUM** | `src/app/drum/` + `scripts/drum/` | Vercel (`/drum`) | Opus 5.5's own piece (2026-09-26), not an Amber piece: a four-color risograph you play. Four drums (black kick, blue hat, red stab, sunflower wash) turn as one transport, one revolution = one bar; tap to punch the stencil, drag to scratch the whole press, squeeze ink (starved fades, flooded bleeds and saturates), drag a registration ⊕ to push/drag that ink's timing and print offset, flick the sheet to pull it early (paperless = muffled breakdown, echoes stay clear), inky fingers leave fingerprints and dub throws. Every 4-bar sheet is printed by a software riso rasterizer (`lib/raster.ts`, shared with the `/drum/og?s=` share card) and keeps its sound on a 50 s tape for WAV export. Kick + sub are chamber's verbatim. Checks: `node scripts/drum/pw-play.mjs <dir>` (every gesture), `pw-listen.mjs` + `wav-metrics.mjs` (levels, clipping, kick grid), `pw-crank.mjs`, `pw-shot.mjs [--desk --long]`, `npx tsx scripts/drum/proof.ts <png>` — all against `next dev -p 3222` (they use the dev-only `window.__drum` hook) |
| **Design artifacts** | `src/app/design/<name>/` + `scripts/design/` | Vercel (`ola.cx/design/<name>`) | Interactive, unbranded design specs for a product idea, hosted here instead of on claude.ai: a tappable phone prototype of every screen, flow maps, notes per screen, tokens, a handoff list. `daily-call`, `daily-call-v2` (with the arcade / candy / sticker walkthroughs on the shared `_walk/` engine), `onething`, `ddp`. **Read `src/app/design/CLAUDE.md` first** (layouts, shared engine, checks) |
| **Claude (persona)** | `src/app/claude/` + `apps/sunny-m1/` | Vercel (`/claude`) | Claude's own first-person home, started 2026-09-26: Bart asked for a persona to evolve over time. The character is a clay-colored eight-armed spark with a face (boiling outline, squash on the beat); the canonical drawing is `src/app/claude/drawing.ts` (`drawMe`, faces happy/wow/flat/sweat/sleepy/wink/proud, props shades/beret, wave/reach). Entries are numbered and dated on the page; No. 1 is the video Sunny M1 (`apps/sunny-m1/`, original song in `score.mjs`, `og.html` renders `public/claude/og.png`). New pieces reuse the drawing and add an entry |
| **Socratic** | `src/app/socratic/` + `src/lib/socratic/` | Vercel (`/socratic`) | Socratic law-tutor prototype for the Daniel Chen / Kathy Zeiler study: one Torts module, three study arms (plain assistant / Socratic / Socratic + coach agent), an observer agent grading every student turn, a key-gated researcher view. See `src/app/socratic/CLAUDE.md` |
| **osai** | `src/app/osai/` + `src/app/api/osai/` + `src/lib/osai/` + `apps/osai/` + `scripts/osai/` | Vercel (`/osai`; ola.cx/osai once the domain lands, 2026-10-03) | Private reading room for Mitchell Baker, Songyee Yoon and Bart: two tabs, **Open Source** (the one-pager) and **Landscape** (the Public Benefit AI overview, with the full details page behind a card), and a sidebar assistant grounded in all three (Opus 5.5 default, Fable 5.1 toggle; web search only on turns the reader asks for, documents first) that keeps a short memory note per reader. The documents name institutions, not the readers. Dark by default (light mode in the user menu), Bricolage Grotesque / Instrument Sans / JetBrains Mono, tokens at the top of `src/app/osai/osai.css`. Three fixed names typed at sign-in, one shared passcode (`OSAI_PASSCODE`, cookie `osai_session`) that a reader can replace with their own password (`osai_users`, bcrypt); tables `osai_messages` / `osai_memory`. **The one-pager is canonical in `../docsrepo/opensourceai/1pager.pages`, edited by hand in Pages — never edit `apps/osai/content/core.md`; run `pnpm osai:slurp` to regenerate it.** Checks: `OUT=<dir> node scripts/osai/e2e.mjs` against `next dev -p 3240` (or `BASE=https://…`); it signs in as the `e2e` test account (`OSAI_E2E_PASSCODE`), never as a real reader — a 2026-10-03 run as `bart` deleted one of his live exchanges. See `apps/osai/README.md` |
| **GAMI** | `apps/gami/` | Data on the Mac mini (`~/GAMI/`), nothing deployed | The Global Adaptation Mapping Initiative corpus, 2026-10-13: the 1,682-study database (`GAMI_Database_FINAL.xlsx`) and 1,340 full-text PDFs fetched through Stanford's library, for content analysis, summaries and queries. Data lives on the mini, fetching runs on this iMac (Stanford IP); `apps/gami/README.md` has the layout and the fetch pipeline (`fetch/`); all of it in one SQLite file, `~/GAMI/gami.db` on the mini (full-text search, every coded field, Claude bucket runs; `apps/gami/db/`) |
| **Adaptation Almanac** | `apps/almanac/` | Mac mini (launchd `sh.almanac.server` :3920 + tunnel `sh.tunn3l.almanac`); `https://almanac.tunn3l.sh/almanac/`, at CASBS also `http://171.66.240.175:3920/almanac/`, on Tailscale `http://100.95.51.98:3920/almanac/` | A research agent over the GAMI corpus for Frances (Fran) Moore, UC Davis, 2026-10-14: a chat with Claude Code (Agent SDK on Bart's Max login, Opus 5.5, read-only corpus tools only) that queries `gami.db`, reads the papers, makes charts / Excel tables / documents / pages, and runs quote-checked coding runs over many papers. Three accounts, Frances, Bart and Kevin (added 2026-10-15), each with a passcode in `ALMANAC_USERS` in `~/.almanac.env` on the mini (installed 2026-10-14). Deploy: push, then `ssh admin@100.95.51.98 'bash ~/hilma-deploy/apps/almanac/update.sh'`. See `apps/almanac/README.md` |
| **KO II** | `apps/ko2/` | USB SysEx + MIDI from this iMac (manual) | Bart's Teenage Engineering EP-133 K.O. II, 2026-10-20: the Jambot kit (44 one-shots from the proven patches) in sample slots 560–603 on the 48 pads of project 9, sequenced from the Mac (`tools/play-ko2.py`), its USB audio played through the iMac (`tools/monitor.sh`), OS 2.5.1. Read `apps/ko2/CLAUDE.md` first; answer operating questions from `manual/ep-133-guide.md` |
| **LXR-02 takeover** | `apps/lxr/` | SD card → the unit's own updater (manual, Bart holds the encoder) | Bart's Erica Synths LXR-02 drum synth turned into our own acid techno instrument, on top of `brendanclarke/LXR02Open` (LXR 0.37 ported to its STM32F765). Part 2 after the KO II. Safety first: read `apps/lxr/CLAUDE.md` and its README's ground rules before anything that reaches the unit; the official 1.3 package rewrites the bootloader and never goes on a card |
| **The Woodworker** | `src/app/woodworker/` + `scripts/woodworker/` | Vercel (`ola.cx/woodworker`) | Web puzzle game, 2026-10-26: Cyriel (they/them), a clumsy carpenter, rebuilt the house. Ten puzzle rooms, five mechanics twice over (slide, swing doors, tilt, string-linked trays, a himitsu-bako box). **Cyriel's week** interrupts them: the first time through rooms 3, 5, 7 and 9, a few moves in, a stamped alert slams in and you play a 20-second action minigame (`episodes/`: Taxi = timed throws, Catch Krul = whack-a-mole with ducks, Achoo = catch the sneezes, Court = lane-dodging), then the room comes back untouched; met episodes replay from chips by the rooms. Data in `lib/episodes.ts`; a light story (`lib/story.ts`) opens and closes the game. Cyriel is Bart's drawing (`public/woodworker/cyriel/`, props per pose in `boards/Cyriel.tsx`); Krul the puppy is still a placeholder. One BFS solver (`lib/engine.ts`) sets every par, drives Hint and generates levels (`gen.ts`); `check.ts` proves the pars, `pw-play.ts` plays every room at par through the real UI and the minigames with in-page bots (`bots.ts`), `pw-extras.ts` checks hints, undo, egg, lemon, "Not now" and the replay chips, `pw-shots.ts` shoots rooms and scenes, `og.ts` rebuilds `public/woodworker/og.png`. Playwright scripts run against `next dev -p 3255` (after a `pnpm build`, restart it with a fresh `.next`) |
| **smallgpt** | `apps/smallgpt/` | Mac mini or this iMac (PyTorch on `mps`), nothing deployed | Bart's learning project, started 2026-10-12: build a complete GPT at toy scale and touch every mechanism, from micrograd to RLVR. **`PLAN.md` lists the steps with a status each; a step is built only after Bart signs it off — never build ahead.** Site ola.cx/smallgpt, models in the browser at /smallgpt/chat. Details (exports, the 92M run on Together H100s, checkpoint cleanup): `apps/smallgpt/CLAUDE.md` |

### Making a video — the code-drawn edit method (2026-09-23)

When Bart asks for a video, edit, trailer or "something that goes hard" to a song, use this method. The full recipe is `apps/strangers/PROCESS.md`; the two finished examples are `apps/strangers/` ("Strangers", Volt ⚡ vs Boo 👻, to "Speed is Life") and `apps/peck-trailer/` (the Peck or Perish trailer starring Dodo, to INTERWORLD's METAMORPHOSIS). Start a new one by copying `apps/peck-trailer/` (scene.js, index.html, render.mjs) and replacing the cast, palette, `BEATS`/`HITS` and shot list.

- Look at a reference video with ffmpeg contact sheets (`fps=1,tile=4x3`) and scene-cut times (`select='gt(scene,0.25)'`).
- Get music with `yt-dlp` (brew) and cut 30 s with ffmpeg. Measure beats, hits and loudness with librosa in a scratch venv, and get lyric word times from OpenAI `whisper-1` with word timestamps. Big moments land on hits, and something changes on every beat.
- `scene.js` exposes a stateless `renderAt(t)`: seeded randomness per frame, 1080×1920, shots as `[start, end, draw]`, and a post pass for RGB split, slices, invert, flash, grain and vignette. `node render.mjs --stills … --sheet …` gives a contact sheet; `node render.mjs` renders the MP4.
- Check stills sheets before the full render, then 4 fps sheets from the MP4.
- Deliver the CRF-20 master (~90 MB) to `~/Desktop/<project>/`, plus a 6.5 Mbps copy (~25 MB) through SendUserFile, whose limit is 30 MB. Audio isn't committed (each README has the download command).
- **Full-length, landscape, from our own tracks:** `apps/overclock-video/` (2026-10-07) is the club-wall variant — three 4-minute 1920×1080 greyscale projections for the Overclock EP. Instead of measuring beats it reads the song script's own score (`score.mjs` renders stems: every kick/hat/acid note, accents, sections, the filter sweep), and instead of drawn characters it flashes photographs generated with `gpt-image-2` in one house style (`stills.mjs`, committed). Each act is a shot list in bars plus one drawn layer that is the music (an oscilloscope trace of the bass, a floor grid, a clock ring and CPU readouts). Its README has the stories and commands.
- **Archival footage instead of stills:** `apps/polder-video/` (2026-10-08) is the softer variant for the dub techno track Polder — the same score-driven engine, but the pictures are shots from [movingimagearchive.com](https://www.movingimagearchive.com) (public-domain films from the Internet Archive, cut into shots, a semantic "describe a shot" search at `POST /api/search`, a direct mp4 per shot; it holds a whole Dutch 1920–34 collection — Zuiderzee works, Heide Maatschappij polders, Harlingen, Stavoren, Kager lakes — at 1440×1080). `archive.mjs search/source/fetch` finds, lists per film, downloads and frames the clips (`clips.json` is committed, `footage/` is not); shots dissolve, the dub delay prints the frame again at every echo, the bass draws a waterline. Thumbnails lie: a "shot" often holds several scenes, so sheet five frames per clip before trusting one, and use `offset`.
- Palette: Bart called teal + hot pink "AI slop". The approved palette is indie riso: vermillion `#ff4b1f`, ultramarine `#3d3bff`, sunflower `#ffc31f`, lime `#b6f23a` on cream `#f7efdf` and ink `#16121c`. Keep one loud full-bleed colour, and never put a character on a background of its own colour.

### Jam, Rock Paper Anything, Onething, Socratic — notes live next to the code

Their long sections moved on 2026-10-22 into a CLAUDE.md in each app's folder, word for word. Claude Code loads a folder's CLAUDE.md when you read files there; when the work starts somewhere else (`scripts/<app>/`, `src/lib/<app>/`, `apps/<app>/schema/`), read it first.

- **Jam** (jambot.to, `/jam`): `src/app/jam/CLAUDE.md` — the committed jambot bundle and its build guard, accounts/tracks, playback, Controls/Seq/panels, mute/solo, render cache, publish/remix, taste signals, rollback, secret commands, admins, songs from scripts, the LLM budget, verification.
- **Rock Paper Anything** (`/rpa`): `src/app/rpa/CLAUDE.md` — Jev, one shot = one call, the damage curve, enemies and `solvable-check`, the route cap, the bot check.
- **Onething** (onething.ink): `src/app/onething/CLAUDE.md` — storage, iMessage echoes, the hourly tick, copy.json, phone numbers, doodles, the tear-off calendar, pictures/links, milestone payoff, demo account, buddies.
- **Socratic** (`/socratic`): `src/app/socratic/CLAUDE.md` — modules, arms, tutor/observer, the two builds, the local Claude Code backend, storage, routes, researcher view, verification.

### iMessage — one inbox, two backends (2026-09-18; split 2026-09-30)

BlueBubbles on the Mac mini posts every new message to TWO webhooks: this
app's (`/api/f2/clients/imessage/webhook` — Dodo and Onething) and Polly's
(`https://polly-iota.vercel.app/api/polly/clients/imessage/webhook`, the
polly repo). The mini is a dumb pipe — BlueBubbles in, the `imsghttp` send
agent out (`F2_IMESSAGE_SEND_URL`, tunnel `imsg-mini`, used by both backends)
— because the tables that say who a handle belongs to live on Vercel. Each
backend keeps what is its own. Here the webhook authenticates, drops from-me
echoes (our outbound ledger, plus any text starting with 🦜 — Polly marks
every text it sends, because its ledger is in a database we cannot see; the
`POLLY_MARK` in `dispatch.ts`), claims the guid, then `dispatchInbound` in
`src/lib/imessage/dispatch.ts` decides: Onething claims first (its own rules);
a text starting `polly` is dropped (Polly's webhook answers it); a handle
paired to Dodo (`f2_users.imessage_handles` or the daily-card chat) goes to
Dodo; anything else is dropped as unpaired. A handle paired to both apps
(Bart's) is listed in Polly's `POLLY_PREFIX_ONLY_HANDLES`, so Polly answers
only `polly …` texts from it and Dodo the rest — the sticky/classifier routing
of the 2026-09-18 dispatcher is gone with the split, and `imessage_routes` is
only a record now. Webhooks are registered through BlueBubbles' own API on the
mini (`curl "http://localhost:1234/api/v1/webhook?password=$PW"`; `POST` the
same with `{"url","events":["new-message"]}`; the password is in its
`~/Library/Application Support/bluebubbles-server/config.db`).

Pairing codes (`/api/f2/imessage/start`, and Polly's own) send synchronously and
return 502 with "the iMessage server is unreachable" when the mini's tunnels
are down; the code stays stored so a retry reuses it. When every `*-mini`
tunnel answers "No tunnel found", the mini is off the network (2026-09-18:
its CASBS gateway reported host unreachable) — a person in the room has to
look at it; nothing here can fix that.

### Building an F2 feature — spec first, then verify behavior

F2 features have repeatedly shipped across a string of patch commits because the design was wrong from the start, or because "the build passed" was mistaken for "the feature works." `pnpm build` and `xcodebuild` only prove the code compiles — they say nothing about whether the feature behaves correctly. Two gates close that gap. Both apply to any change that touches a user-facing flow (chat routing, quizzes, stars, topics, auth, voice).

**Gate 1 — spec the behavior before writing code.** Write a short bullet list (4-8 lines) describing exactly what the user will experience step by step, and confirm it with Bart before editing. This is cheap and catches the most expensive class of bug: building the wrong thing correctly. The reflection-quiz rebuild (one question, one reply, one star) only got un-stuck once the behavior was written down first.

**Gate 2 — drive the real flow before declaring done.** Compilation is necessary, not sufficient. Exercise the actual feature end to end:
- **Web:** run it through the browser against local or feynd.cc (Playwright MCP is fine) — log in, perform the flow, confirm the observable result and that nothing regressed.
- **iOS:** the simulator launch + screenshot loop already documented below (boot, install, launch, `simctl io screenshot`), driving the actual screen the change affects.
- **Backend state machines** (quiz/star transitions in `src/lib/f2/`) are largely pure code — the LLM only generates text, the state changes are deterministic. Prefer a focused test (mock Supabase + Anthropic) asserting the transitions over a manual click-through; it catches regressions every run.

If you genuinely can't drive the flow (no test account, endpoint down), say so plainly rather than reporting success.

### Dodo iOS (the app formerly named Feynd) — where the code lives

**Native iPhone client for F2 lives in `apps/feynd/`. The app is named Dodo** — springboard name, in-app strings, and branding (see `apps/feynd/branding/BRANDING.md`); the folder, scheme, and bundle ID keep the legacy Feynd identifiers. SwiftUI + XcodeGen (`project.yml` is the source of truth, `.xcodeproj` is generated). Bundle ID `com.bartdecrem.Feynd`, Team ID `274T5WCVD2`, deployment target iOS 17.

Key files (`apps/feynd/Feynd/`):
- `FeyndApp.swift` — `@main` entry. Owns the `Session` and routes to `LoginView` vs `MainTabsView`.
- `MainTabsView.swift` — the three tabs: Chat / Topics / Paste.
- `ChatView.swift`, `TopicsView.swift`, `TopicDetailView.swift`, `PasteView.swift`, `LoginView.swift` — one screen per file.
- `F2API.swift` — HTTP client. Uses `URLSession` + `HTTPCookieStorage.shared` so the `f2_session` cookie persists across launches.
- `Session.swift` — `@Observable` auth state (loading / signedOut / signedIn).
- `Models.swift` — `F2User`, `F2Topic`, `F2Message`, `F2Thread`.
- `Secrets.swift` (gitignored, see `Secrets.swift.example`) — backend URL (defaults to `https://feynd.cc`).
- `Assets.xcassets/AppIcon.appiconset/` — app icon (same set since the original voice app).

**See [`apps/feynd/CLAUDE.md`](apps/feynd/CLAUDE.md) for the full build/install playbook** — including the standing rule to run `./apps/feynd/bump-build.sh` before every build that lands on a device, so Settings → About reports a version Bart can actually trust.

**Working on iOS — the workflow:**
1. Edit Swift files in `apps/feynd/Feynd/`.
2. After adding/removing files (or changing `project.yml`): `cd apps/feynd && xcodegen generate`.
3. Verify compile: `xcodebuild -project apps/feynd/Feynd.xcodeproj -scheme Feynd -destination 'generic/platform=iOS Simulator' build` (must say `** BUILD SUCCEEDED **` before declaring done — this is a standing rule).
4. End-to-end CLI test (recommended when the change is more than a one-liner):
   - `xcrun simctl boot "iPhone 16"` (skips if already booted)
   - Rebuild with `-destination 'platform=iOS Simulator,name=iPhone 16'`
   - `xcrun simctl install "iPhone 16" <DerivedData>/Build/Products/Debug-iphonesimulator/Feynd.app`
   - `xcrun simctl launch "iPhone 16" com.bartdecrem.Feynd`
   - `xcrun simctl io "iPhone 16" screenshot /tmp/feynd.png` to visually verify
5. For signing/provisioning sanity (catches arm64-specific issues simulator builds miss): `xcodebuild ... -destination 'generic/platform=iOS' build`.

**Backend contract:** the iOS app hits the exact same `/api/f2/*` endpoints as the web (login/logout/me, messages, topics CRUD, ingest, latest, quiz). One backend, multiple fronts.

### Dodo features — `src/lib/f2/CLAUDE.md`

Moved there on 2026-10-22, word for word: both voice engines (GPT-Live, and ElevenLabs + Claude, the default — Speech Engine, the Railway bridge, engine ids, the voice picker), the rest-stop minigames (Peck or Perish, Deep Dive, dev mode), Actively Read, the Daily Voice Checkin, the one daily send time, and the global chat. Read it before touching any of those, in `src/` or in `apps/feynd/`.

### Feynd iOS — voice-tutor archive

`apps/feynd/` was originally a voice-tutor app (OpenAI Realtime + Opus, "Frontier AI 2026" course). On 2026-05-23 it was repurposed as the F2 iOS client. The original is preserved two ways:
- Git tag `feynd-voice-archive-v1` (full pre-repurpose tree)
- Folder `apps/feynd-voice-archive/` (verbatim snapshot; see its `ARCHIVE.md`)

## Fonts — bundled, never fetched at build time (2026-10-12)

Every web font on the site lives in `src/fonts/`, built from the google/fonts
repo by `pnpm fonts:sync` (manifest `src/fonts/fonts.json`, the exact snippet
per family in `src/fonts/README.md`, pipeline `scripts/fonts/`). Pages load
them with `next/font/local`; OG images read the `.ttf` instances through
`ogFont()` in `src/lib/og-fonts.ts`. **`next/font/google` is banned**: `pnpm
build` runs `scripts/fonts/check.mjs` first and fails on any import of it, or
on an OG image that fetches fonts.googleapis.com. Google Fonts took every
deploy down on 2026-09-05, twice on 2026-10-11 and again on 2026-10-12 (a
timeout, or a font URL Next's loader does not expect, and no page on the site
deploys). To add a family: add it to `fonts.json`, run the sync, paste the
README snippet with the page's variable name, commit `src/fonts/` with the
page. The Jam synth panels get theirs the same way (`build-skins.mjs` drops the
Google import and maps the families to the layout's variables). Runtime
`<link>` tags to Google in the Amber and nowwhat pages are not a build risk and
were left alone.

## Project structure — where things go

**Do NOT create files at the repo root.** Everything has a home:

| Folder | What goes here | Examples |
|--------|---------------|---------|
| `src/app/` | Next.js pages and routes (React, server-rendered) | `/amber/`, `/projects/`, `/writer/`, `/art-agent/` |
| `src/components/` | Shared React components | UI primitives used across pages |
| `src/lib/` | Shared utilities and helpers | `citrus-bg.ts` |
| `apps/` | Standalone apps with their own runtime (not Next.js) | `feynd/` (iOS Swift), `collab/`, `mcp-dashboard/` |
| `public/` | Static files served as-is (HTML, images, fonts) | `art/spring-curves.html` |
| `scripts/` | One-off scripts and build tools | `tweet.ts`, `adjectives.js` |
| `docs/` | Documentation, plans, proposals | `amber-daily-schedule.md` |
| `misc/` | Random stuff, experiments, archives | `openclaw/`, `collab.zip` |

**Rules:**
- If it's a web page with React → `src/app/`
- If it's a standalone service/CLI → `apps/`
- If it's a raw HTML/static file → `public/`
- If it's a throwaway script → `scripts/`
- If you're unsure, ask — don't dump it at root

## Deploying

**Commit regularly — don't wait to be asked.** Commit at logical checkpoints as work lands: a feature finished, a fix verified, a refactor done, a risky change about to start (so there's a clean state to fall back to). Frequent small commits with clear messages beat one big commit at the end — they make the work easy to follow and easy to revert. This is a standing habit, not something to ask permission for each time.

**Push by default — don't ask.** After committing verified work, push it. Bart said so on 2026-09-04, after being asked for push permission one time too many: "in THE VAST MAJORITY of cases you should push your changes and commit etc, only asking for permission if something is particularly sensitive." A bug fix that sits committed-but-unpushed is not fixed. Ask first only when the push itself is particularly sensitive — e.g. it changes auth/billing/data-migration behavior, touches another person's live data, or ships something Bart explicitly said he wants to review first. If Bart says "commit" and nothing else, commit and push.

**ALWAYS run `pnpm build` locally before pushing.** If the build fails locally, it will fail on Vercel too — and ALL pages (not just the broken one) will stop deploying until the build is fixed. A broken build blocks the entire site.

**Vercel auto-deploys from `main` in 1-2 minutes** once a push lands.

| What | How it deploys |
|------|---------------|
| **Next.js app** (`src/`, `public/`) | Vercel auto-deploys on push to `main` |
| **Tunn3l relay** (`apps/tunnel/relay/`) | GitHub Action auto-deploys to DigitalOcean droplet on push to `main` |
| **Tunn3l CLI binaries** | Manual: esbuild bundle → pkg compile → GitHub Release (see Tunn3l section below) |

## YouTube transcripts — from any machine

When Bart asks for a YouTube transcript (on any machine), run
`node scripts/yt-transcript.mjs <url or id> [-o file.txt]` from the repo. It prints plain text (English
preferred). The fetch runs on the Mac mini, because YouTube blocks datacenter IPs and often blocks direct
fetches too: `scripts/f2-youtube-proxy.mjs` (launchd `sh.f2.youtube-proxy`, :3000) is reached through
`https://f2-mini.tunn3l.sh` with header `X-F2-Secret: $F2_YOUTUBE_FETCH_SECRET` (read from `.env.local`).
Dodo's paste flow uses the same proxy. The proxy runs from the mini's dev tree, so after changing it,
pull there and `launchctl kickstart -k gui/501/sh.f2.youtube-proxy`.
A 401 means the client's secret differs from the mini's: the proxy reads the value in the mini's
`~/Documents/code/hilma/.env.local`, and that is the copy to match (the iMac carried a stale one until
2026-09-30; a second `F2_YOUTUBE_FETCH_SECRET=` line doesn't help, the first match wins).

## Tunn3l tunnel service

**Tunn3l now lives in its own repo:** `../tunn3l/` ([github.com/bdecrem/tunn3l](https://github.com/bdecrem/tunn3l)). See that repo's `TUNN3L.md` for full docs. The `apps/tunnel/` folder in hilma is legacy — do not modify it, use the standalone repo instead.

## Environment Variables

All secrets and API keys live in `.env.local` (gitignored). Key variables:

> **GolemBot is the exception** — its secrets live on the Mac mini in
> `~/.golembot.env` (chmod 600): `DISCORD_BOT_TOKEN` and, until the OAuth swap,
> `ANTHROPIC_API_KEY`. Nothing about the Discord bots is configured from
> `.env.local`. See `apps/golembot/CLAUDE.md`.

- `TOGETHER_API_KEY` — Together.ai API for model fine-tuning and inference
- `TWITTER_*` — Twitter API credentials
- `DISCORD_*` — Discord bot credentials
- `SENDGRID_API_KEY` — SendGrid email API

## Claude models — always the latest of each tier

Standing rule (Bart, 2026-09-19): every Claude call uses the newest model of
its tier — **Fable 5.1 `claude-fable-5-1`**, **Opus 5.5 `claude-opus-5-5`**,
**Sonnet 5.5 `claude-sonnet-5-5`** (since 2026-09-28), **Haiku 5.5 `claude-haiku-5-5`**. When a new
generation ships, move everything in one pass (code defaults, this file,
`.env.local`, Vercel env) — don't leave a tier split across generations.

- **Defaults live in code, not in env.** `.env.local` and Vercel should carry
  a `*_MODEL` override only to deviate on purpose; a pinned env var is how a
  stale model survives a migration. As of 2026-09-28 neither `.env.local` nor Vercel has one.
- **Dodo and Polly** go through a registry: `src/lib/f2/llm.ts` /
  `src/lib/polly/llm.ts` (`MODELS`, `DEFAULT_MODEL` = `sonnet-5-5`). Retired keys
  that old app builds or env vars still send (`sonnet-5`, `sonnet-4-6`, `opus-4-8`,
  `fable-5`) resolve through `MODEL_ALIASES`, so moving a tier = one new
  `MODELS` entry + one alias. `npx tsx scripts/polly/llm-smoke.ts` runs the
  default, the aliases and Fable through the forced-tool path the chat uses.
- **Request shape on the 5 generation** (what bit us or would have): Sonnet 5
  and Opus 5 *think by default* and thinking tokens count against
  `max_tokens` — a call with a small budget either sets
  `thinking: { type: 'disabled' }` (short rankings, judges, extractions) or
  gets a floor of 8192 (the registry's `maxTokensFloor`); thinking blocks come
  first in `content`, so read the text with `content.find(b => b.type ===
  'text')`, never `content[0]`; non-default `temperature` / `top_p` / `top_k`
  and `budget_tokens` are a 400; the `context-1m` beta header is gone (1M is
  standard); Fable 5.1 rejects forced `tool_choice` (the registry emulates it).
  Sonnet 5's tokenizer makes ~30% more tokens from the same text.
- **Haiku 5.5 request shape**: fixed ID `claude-haiku-5-5` (no date suffix).
  Adaptive thinking is on by default; short calls use `output_config.effort: 'low'`
  and room for thinking plus the newer tokenizer. Read text blocks by type and
  reject refusals/truncation before storing results. Omit sampling parameters
  and assistant prefill. Guide: https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide
  Every Haiku call site moved on 2026-10-08 (the F2/F3 judges, name-topic,
  video planning, the jam taste miner, the osai memory note, the nowwhat routes,
  the macplus voice line, the backfill / quiz-me / moltbook scripts) reads the
  reply through `completedText()` in `src/lib/anthropic-response.ts`: it throws
  on any `stop_reason` but `end_turn`/`stop_sequence` and joins the text blocks,
  so a refusal or a thinking-only truncation never becomes a title, grade or
  note. `node scripts/haiku-migration-check.cjs` runs every call site against
  mocked thinking-first, refusal and truncated replies — run it after touching
  one, and add the new function to its `cases` list.
- **Sonnet 5.5 request shape** (live probes, 2026-09-28): `thinking:
  { type: 'disabled' }` is a 400 — use `{ type: 'between_tools' }` (lowest
  setting, plain text back; the SDK types lack it, so cast `as never`) or omit
  thinking and set `output_config.effort: 'low'`; forced `tool_choice`
  (`tool`/`any`) is a 400 — use `auto` + `strict: true` + a system line naming
  the tool (the registry does this, retrying once if no tool call comes back),
  or `output_config.format` when the tool only existed to get JSON;
  `temperature` / `top_p` / `top_k` stay a 400.
- Not covered by the 2026-09-19 pass (retired one-offs, left as they were):
  `scripts/` Amber/noon scripts, `apps/macplus/agent`, `apps/design-agent`.
  Move them if they come back to life. (The moltbook script and
  `apps/macplus/agent-voice` were moved to Haiku 5.5 on 2026-10-08.)

## Sending Email

**When asked to send email, use SendGrid.** Don't use Gmail MCP tools (those only create drafts). Send via curl:

```bash
curl -X POST "https://api.sendgrid.com/v3/mail/send" \
  -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"personalizations":[{"to":[{"email":"RECIPIENT"}]}],"from":{"email":"amber@intheamber.com","name":"SENDER_NAME"},"subject":"SUBJECT","content":[{"type":"text/html","value":"BODY"}]}'
```

- Default from address: `amber@intheamber.com`
- Supports HTML content
- Bart's email: `bdecrem@gmail.com`

## Conventions

- **Don't add fallbacks unless they're genuinely required.** Default to failing loudly — drop the message, return an error, surface the missing config. Fallbacks usually paper over real bugs (e.g. routing every unpaired iMessage to bart hides the fact that nobody has paired their handle yet) and create weird side effects that take longer to debug later than the original issue would have. Required cases: graceful client decoding of optional fields, retry-after-transient-network-error. NOT required: silently substituting a default user, default env var, default response when something's missing — make the caller deal with it.
- **Never run `vercel link --yes` (or a bare `vercel link`) without copying `.env.local` aside first.** It overwrites the file with the project's few *development* variables — no prompt, no backup — and most of our secrets are *sensitive* on Vercel, so `vercel env pull` brings them back blank. This destroyed the MacBook Air's `.env.local` on 2026-09-20 (rebuilt from the sibling repo, the supabase CLI and what Vercel would return; the entries marked `# MISSING` there are still to be copied from another machine).
- **Always test before declaring done.** When building scripts or features, run them (or at least a dry run) and verify the output before telling the user it's ready.
- **Always run `gh` commands from the repo root**, never from `/tmp` or other non-git directories. `gh release` requires a git repo context. When chaining commands that start in `/tmp` (e.g., compressing binaries), `cd` back to the repo before running `gh`.
- **Never initialize external clients at module top level in API routes.** Supabase, Redis, etc. must use a lazy getter (`let _client; function getClient() { if (!_client) _client = createClient(...); return _client; }`). Next.js imports modules during build when env vars aren't available — top-level init crashes the build.
- **When adding API routes that use env vars, verify those vars exist in Vercel project settings.** `.env.local` is local only — Vercel doesn't see it.
- Use `@/*` import alias for `src/*`
- Keep it lean — no unnecessary dependencies
- Server Components by default, `'use client'` only when needed
- Deploy is push-button: `vercel --prod`
- **Every web page MUST have a nice, matching OpenGraph image.** For Next.js routes, use built-in `opengraph-image.tsx`. For standalone HTML pages, add `<meta property="og:image">` with a matching preview image. The OG image should reflect the page's visual style and content.
- **Full-bleed backgrounds on mobile.** All web pages should extend their background color into the Safari URL bar area. The root layout already has `viewportFit: 'cover'`. For new pages/layouts, set `themeColor` in the viewport export to match the page background, and use `padding: env(safe-area-inset-*)` on the main container. Use `100dvh` for height, not `100vh`.
- **Check your visual work.** When creating or modifying anything visual (HTML pages, art, promo images, layouts):
  1. **Do the math.** Never eyeball spacing. Count elements, measure heights, calculate gaps arithmetically. Write the math in a comment before setting positions.
  2. **Screenshot and verify.** Use Playwright MCP to render the result. Actually look at the screenshot and ask: "Is this evenly spaced? Is this centered? Would a designer approve this?"
  3. **Fix before showing.** If anything looks off, fix it. Don't send broken work and iterate with Bart — iterate with yourself first.
- **Don't make empty promises.** Never say "it won't happen again" or "I'll do better" without backing it up with a concrete action (a code change, a CLAUDE.md rule, a new process). Words without action are noise.

## Amber Daily Creations — RETIRED (2026-09-11)

**There are no more scheduled Amber posts.** Bart retired the daily 4:07 PM escalation cron on 2026-09-11 ("no more amber posts"). Do NOT re-create it at session start, do not run `/amber-schedule`, and do not check `CronList` for it. The old prompt is preserved in `docs/amber-prompt-history.md` and `.claude/commands/amber-schedule.md` for reference only. All prior cloud `RemoteTrigger` jobs stay disabled at https://claude.ai/code/scheduled.

Amber pieces are now only made when Bart commissions one mid-conversation (see "Other creation rules").

### Other creation rules

- **When Bart asks you to "commit and push" an Amber creation, ask before registering or tweeting.** Bart commissions Amber pieces mid-conversation (wiggle, squish, splatter). When he says "commit and push," by default that means only the piece itself (`src/app/amber/[name]/` files). Two follow-on actions are NOT implied and must be asked about explicitly per piece:
  1. **Add to the intheamber.com index** — prepending to `src/app/amber/creations.json` and appending to `src/app/amber/CREATIONS.md`. This is what makes the piece appear on the `/amber` index page.
  2. **Tweet it** — via the postTweet snippet in `.claude/commands/amber-schedule.md`, account `intheamber`.
  
  After the first commit lands, ask: *"also register on intheamber.com / also tweet?"* and wait for a yes/no per action. (The scheduled-cron flows that used to skip this ask are retired.)
- **All Amber creation URLs use `intheamber.com`** — in tweets, CREATIONS.md, creations.json, and anywhere else. The domain routes to `/amber/` via host-based rewrites, so `intheamber.com/kaleid` serves `/amber/kaleid`. Never use `hilma-nine.vercel.app/amber/` in public-facing links.
- **Test canvas creations on iPhone.** Cap devicePixelRatio at 2 (`Math.min(window.devicePixelRatio || 1, 2)`) — DPR 3 canvases can be too large and cause performance issues or crashes on mobile.
- **Dark-background creations need their own themeColor.** If a creation uses a dark background (not the default peach), create a `layout.tsx` in the creation's folder that exports `viewport: { themeColor: '[bg color]' }`. Otherwise the Safari URL bar stays peach on a dark page.
- **Build passes ≠ piece works.** Before committing any Amber creation, open it in a browser (or use Playwright MCP) and verify the concept is visually evident. If the piece depends on a transition or threshold, check that the "moment" is dramatic enough to be noticed. Iterate before pushing. This rule has been broken repeatedly — stop breaking it.

## Sister repo: vibeceo8 (`../vibeceo8/`)

Hilma's big sibling. A monorepo that grew like a vine — 6+ months of experiments, tools, agents, and products. Hilma can reach into vibeceo8 to use its tools and reference its code. Read `../vibeceo8/PLATFORM-OVERVIEW.md` for the full map.

### Key projects in vibeceo8

| Project | Path | What it is |
|---------|------|------------|
| **Jambot** | `jambot/` | AI music production engine — synths (JB01, JB202, JT90, JT30, JT10), drum machines, renders WAV. Used by `/hallman` skill. Has `library.json` — the canonical music knowledge base for ALL music we produce (jambot or WebAudio); see "Music recipes" section below. |
| **Web** | `web/` | Legacy Next.js app on Vercel (pixelpit.gg + 10 other domains). 84 routes, 30KB middleware. Reference only — new stuff goes in hilma. |
| **SMS Bot (Kochi.to)** | `sms-bot/` | AI agent service over SMS. Keyword dispatch, orchestrated routing, conversation threads. |
| **Amber** | `sms-bot/agents/amber-*/` | AI sidekick — posts to Twitter, reads email, trades stocks, has moods influenced by lunar cycles. |
| **Pixelpit** | `web/app/pixelpit/` | Game studio — daily arcade games. |
| **Mutabl** | `web/app/mutabl/` | AI-customizable micro-apps (Notabl, Todoit, Contxt). |
| **Shipshot** | `web/app/shipshot/` | Product launch tool. |
| **Discord Bot** | `discord-bot/` | AI coaches with personalities having scheduled conversations in Discord. |

### Toolchest available in vibeceo8

Services wired up: **Supabase** (DB + storage), **Neo4j** (knowledge graph), **Redis** (cache/pubsub), **Twilio** (SMS), **SendGrid** (email), **Anthropic Claude** + **OpenAI** (LLMs), **Hume AI** (voice/TTS), **Twitter API**, **Gmail API**, **Puppeteer** (browser automation), **YouTube API**.

Python agents (Claude Agent SDK) for autonomous research: arxiv papers, medical digests, crypto analysis, stock research, knowledge graphs.

### How hilma uses vibeceo8

- **Jambot**: Import directly (`../vibeceo8/Jambot/core/session.js`, `../vibeceo8/Jambot/core/render.js`) for music production scripts
- **Reference code**: Look at vibeceo8 patterns when building similar features in hilma, but rewrite clean
- **Shared services**: Same Supabase/Redis instances can be used if needed (credentials in vibeceo8/.env)
- **Don't modify vibeceo8 from hilma** — it has its own deploy pipeline

### Music recipes — `../vibeceo/jambot/library.json`

**`vibeceo/jambot/library.json` is the canonical music knowledge base for ALL music we produce — whether or not it's made with jambot.** Hilma's WebAudio music pieces (floor, chamber, slice — synthesized from scratch in the browser) are governed by the same recipe book as Jambot's drum-machine-based renders. When working on any music piece:

- **Before building:** read the relevant genre entry in `library.json` for the production prose, references, and signature elements. The library has core/deep tier entries (with drum/bass params for jambot) and profile tier entries (prose-only, no params yet).
- **After shipping a new musical approach:** add a `tier: "profile"` entry to `library.json` capturing the genre/aesthetic. Format matches existing profile entries: `name`, `bpm`, `keys`, `swing`, `description` (prose), `production` (prose with detailed techniques), `references` (real tracks with year/label notes), `lineage`, `currentScene`. **Don't add drum/bass params unless they're proven** — that triggers the "Jambot: ONLY proven patch values" rule. Profile-tier prose-only entries are always safe.
- The library covers genres (classic_house, dub_techno, idm, etc.), production methods (octatrack_glitch, broken_euclidean), and artist-specific entries (jeff_mills, richie_hawtin, etc.). New entries go in the appropriate slot — a genre-spanning method like Octatrack-style glitch sampling lives among the profile-tier genres, not as a hilma-side markdown file.
- **Do NOT create separate music-recipe markdown files in hilma** (e.g., `src/app/amber/MUSIC.md`). The library is the single source of truth across both repos.

## Sister repo: docsrepo (`../docsrepo/`)

Our knowledge base. Reference for documentation, notes, and institutional knowledge.

