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

- **Web pages / creations:** the right home in this repo (Vercel: hilma-nine.vercel.app and its domains), or the sibling project the work belongs to (daskollektiv.rip for DK tracks, intheamber.com for Amber). When Bart asks for "a link I can click", the answer is a link on our hosting, never an artifact.
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
- **Deploy:** Vercel (project: `hilma`, URL: hilma-nine.vercel.app)

## Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint
vercel --prod     # Deploy to production
python3           # Use python3 (not python) for all Python scripts
```

## Apps

Hilma hosts several apps. Some are standalone in `apps/`, some are Next.js routes on Vercel, and Tunn3l has its own repo.

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
| **Dodo (iOS)** | `apps/feynd/` | Xcode (manual TestFlight) | Native iPhone client for F2 (app name **Dodo**; folder/bundle keep the old Feynd identifiers), talks to the same `/api/f2/*` backend |
| **Loci (iOS)** | `apps/loci/` | Xcode (XcodeGen, same workflow as Feynd) | v3 learning app — spaced-repetition memory layer (`/api/f3/*`, `src/lib/f3/`) on F2 accounts/topics: idea cards, conversational recall grading, primer questions. Includes voice mode (Peri engine via `/api/f4/walk`): global voice walk from Today, per-topic voice from any row, transcripts merge back into topic chat |
| **Peri (iOS)** | `apps/peri/` | Xcode (XcodeGen, same workflow as Feynd) | Voice-only walking tutor — OpenAI Realtime over WebRTC (`/api/f4/walk/*`, `src/lib/f4/`). Peri speaks first, quizzes the Loci card deck conversationally, records reviews via server-authed tools. Harness: `scripts/test-walk-realtime.mjs` |
| **Dodo voice bridge** | `apps/dodo-voice-bridge/` | Railway, project + service `dodo-voice-bridge` (`railway up` from the folder; `https://dodo-voice-bridge-production.up.railway.app`) since 2026-09-21 | The WebSocket server ElevenLabs Speech Engine connects to for Dodo's ElevenLabs + Claude voice engine; forwards each turn to `/api/f2/eleven/turn`. See "Dodo voice, second engine" below and the folder's README |
| **MacPlus** | `apps/macplus/` | Retro68 → BlueSCSI SD card (manual) | Native classic-Mac (System 6, 68000) apps for Bart's real Macintosh Plus. See `apps/macplus/CLAUDE.md` |
| **Polly (iOS)** | `apps/polly/` | Xcode (XcodeGen, same workflow as Feynd) | Language-learning app cloned from Dodo (2026-09-17), diverging: pick a language, linear chapters, cards, Peck, voice, iMessage streaks. Agentic Learning Mode (2026-09-18): a voice level check, a planned path, lessons Polly writes as their own topic kind. Direction 2b (2026-09-20): no topic screen has a chat window; typing is the line under every voice button and opens one no-modes text chat, and a typed chat is the same object as a spoken one (`docs/polly-infinity-2b.md`). Plan: `docs/polly-plan.md`. See `apps/polly/CLAUDE.md` |
| **Tap Tap Dodo (iOS)** | `apps/taptapdodo/` | Xcode (XcodeGen, same workflow as Feynd) | Three-lane rhythm game starring a dodo — SpriteKit + AVAudioEngine synthesis, zero audio files, seeded procedural charts, 5 synth-genre sets. See `apps/taptapdodo/CLAUDE.md` |
| **GolemBot** (Strays / Bang) | `apps/golembot/` | Mac mini `admin@171.66.240.175`, launchd `com.golembot.strays` | **Discord → Claude Code.** @mention **Strays** in the kochitolabs server (`#straykids`, `#bangbang`) and an agent on the mini builds, verifies, commits, pushes and replies with a link. It works in its own checkout `~/hilma-bot`. This folder is config + runbook; the bridge is the open-source [golembot](https://github.com/0xranx/golembot). **Read [`apps/golembot/CLAUDE.md`](apps/golembot/CLAUDE.md) before touching it** |
| **Onething** | `src/app/onething/` + `src/app/api/onething/` + `src/lib/onething/` + `apps/onething/schema/` | Vercel (onething.ink) | One sentence a day over iMessage, with a streak and a small paper-journal page. Built by Strays from Discord 2026-09-12. See "Onething" below |
| **Hello Strays** | `src/app/hello-strays/` | Vercel (`/hello-strays`) | One-screen "hello from Strays" card: what the bot is, the date it was built (a fixed string, not a live date), a link to bartin16.xyz. Warm-paper palette, own layout + OG image. First page built by Strays from the Discord live-test channel, 2026-09-13 |
| **Openlab** | `apps/openlab/` + `src/app/openlab/` | Vercel (`/openlab`) + Mac mini (Ollama behind `com.openlab.proxy` and tunn3l `openlab-mini`) | Open-source AI explorations, 2026-09 to 2027-03: local models on the Stanford mini (`qwen3.5:9b` via Ollama), constitution-as-prompt baseline, evals, corpus, fine-tuning. Frame, hardware notes and dated log in `apps/openlab/README.md`; each exploration is a numbered folder with its own README and `out/`. `/openlab` is a chat with the mini's model under the constitution; wiring in the README's "The chat page" |
| **Jam (web)** | `src/app/jam/` + `public/jam/` | Vercel (`/jam`) | Mobile chat UI for Jambot: the whole groovebox (session, tools, agent loop, rendering) runs in the browser from a committed bundle; the server only signs LLM calls. See "Jam" below |
| **Rock Paper Anything** | `src/app/rpa/` + `src/app/api/rpa/` + `src/lib/rpa/` + `apps/rpa/schema/` | Vercel (`/rpa`) | Showcase game for Jev, TypeSafe's System One model: things march on your gate, you type anything, and one Jev call judges the phrase against every enemy on screen at once; the probability is the damage. See "Rock Paper Anything" below |
| **Code-drawn videos** (Strangers, Peck or Perish trailer) | `apps/strangers/` + `apps/peck-trailer/` | Rendered MP4 → `~/Desktop/<project>/` | Beat-synced vertical music edits drawn frame by frame on canvas (halftone, manga speed lines, RGB split, slammed type), rendered with Playwright + ffmpeg in about a minute. **The method is `apps/strangers/PROCESS.md`**: reference analysis, beat/lyric measurement, storyboard, characters, art style, render, checks. See "Making a video" below |
| **Dodo anime** | `public/dodo/anime.html` + `src/app/dodo/anime/route.ts` + `scripts/dodo-anime/` | Vercel (dodo.foo/anime) | Art piece, 2026-09-23: Dodo and the Peck map redrawn as a four-episode summer anime (paddies, cedar wood at magic hour, night festival, Mauritius at dawn), a scroll-driven stamp rally, and a studio model sheet. One self-contained HTML file; the route proxies it. `node scripts/dodo-anime/shots.mjs <dir> [url] [w] [h]` walks the trail and screenshots it; `og.mjs` rebuilds `public/dodo/anime-og.png` |
| **Token Surfers (iOS + Mac)** | `apps/tokensurfers/` + `src/app/api/surf/llm/` + `src/lib/surf/` | Xcode (XcodeGen; Catalyst for Mac); web at tokensurfers.app + brainrot.surf (Vercel, → `/surf`) | Brainrot vibe-coding app from `misc/3.MP4` (2026-09-23): Splat builds apps while you play Token Surfers underneath. Since 2026-09-24 the agent is **Claude Code run headless on the Mac mini** (`apps/tokensurfers/agent/`, Agent SDK, a workspace + git repo + session per app, deployed to Vercel, mid-build notes via a PostToolUse hook, ⚡ now = `interrupt()`, a long-poll feed through tunn3l `surf-mini`); the original on-phone four-tool loop (one-file HTML apps) stays behind a Home toggle — a real runner since 2026-09-24 (chunk-authored track, ride-able ramp trains, roof coins, game over, chiptune loop, the surfer = Splat with legs, scarf, antenna and a `>_` backpack) with a **global leaderboard** (`surf_scores`, `/api/surf/scores`), solo play from Home, **accounts + a gallery** (`surf_users`/`surf_apps`/`surf_upvotes`, `/api/surf/auth/*`, `/api/surf/apps*`; publish from the Studio, upvote and remix in the app or on the web at `/surf`, `/surf/gallery`, `/surf/a/<slug>`; landing page at `/surf`). Tokens become coins, tool calls become terminal trains, bugs crawl onto the track. The server route owns the prompt and tools and streams SSE through. See `apps/tokensurfers/CLAUDE.md` |
| **Socratic** | `src/app/socratic/` + `src/lib/socratic/` | Vercel (`/socratic`) | Socratic law-tutor prototype for the Daniel Chen / Kathy Zeiler study: one Torts module, three study arms (plain assistant / Socratic / Socratic + coach agent), an observer agent grading every student turn, a key-gated researcher view. See "Socratic" below |

### Making a video — the code-drawn edit method (2026-09-23)

When Bart asks for a video, edit, trailer or "something that goes hard" to a song, use this method. The full recipe is `apps/strangers/PROCESS.md`; the two finished examples are `apps/strangers/` ("Strangers", Volt ⚡ vs Boo 👻, to "Speed is Life") and `apps/peck-trailer/` (the Peck or Perish trailer starring Dodo, to INTERWORLD's METAMORPHOSIS). Start a new one by copying `apps/peck-trailer/` (scene.js, index.html, render.mjs) and replacing the cast, palette, `BEATS`/`HITS` and shot list.

- Look at a reference video with ffmpeg contact sheets (`fps=1,tile=4x3`) and scene-cut times (`select='gt(scene,0.25)'`).
- Get music with `yt-dlp` (brew) and cut 30 s with ffmpeg. Measure beats, hits and loudness with librosa in a scratch venv, and get lyric word times from OpenAI `whisper-1` with word timestamps. Big moments land on hits, and something changes on every beat.
- `scene.js` exposes a stateless `renderAt(t)`: seeded randomness per frame, 1080×1920, shots as `[start, end, draw]`, and a post pass for RGB split, slices, invert, flash, grain and vignette. `node render.mjs --stills … --sheet …` gives a contact sheet; `node render.mjs` renders the MP4.
- Check stills sheets before the full render, then 4 fps sheets from the MP4.
- Deliver the CRF-20 master (~90 MB) to `~/Desktop/<project>/`, plus a 6.5 Mbps copy (~25 MB) through SendUserFile, whose limit is 30 MB. Audio isn't committed (each README has the download command).
- Palette: Bart called teal + hot pink "AI slop". The approved palette is indie riso: vermillion `#ff4b1f`, ultramarine `#3d3bff`, sunflower `#ffc31f`, lime `#b6f23a` on cream `#f7efdf` and ink `#16121c`. Keep one loud full-bleed colour, and never put a character on a background of its own colour.

### Jam — Jambot in the browser

`/jam` is a phone-first chat with the Jambot agent (`../vibeceo/jambot`). Say "techno beat at 128", hear it loop seconds later, open **Controls** for sliders (tempo, swing, bars, per-voice level/decay/tune, filter params, effect mix), **Save** as MP3 or WAV.

How it's wired:
- `public/jam/jambot-web.js` is an esbuild bundle of `../vibeceo/jambot` (core + tools + synth engines + JT90 sample WAVs + library.json), built by `pnpm jam:build` (`scripts/jam/build-jambot.mjs`). **It is committed** because Vercel builds hilma alone and can't see `../vibeceo`. After any jambot change that the web app should pick up: commit in vibeceo, run `pnpm jam:build` here, commit the new bundle. The bundle banner and `public/jam/jambot-web.meta.json` carry the jambot commit hash. The build refuses to run when that commit isn't in the local vibeceo checkout's history (`JAM_BUILD_FORCE=1` overrides), so a stale checkout can't roll jambot.to back. As of 2026-09-25 the live bundle's jambot@80486c216 (with `mills_minimal` and the library exemplars) is not on GitHub: push it from the machine that has it, then rebuild. That is also when the `phase_locked_techno` library profile (vibeceo d9d5eaaac) reaches the web agent.
- Node-only modules are replaced by shims in `scripts/jam/shims/` (fs is a read-only virtual file system of the JSON/WAV files jambot reads). Tool modules that need a real file system or sox (jbs/sampler, analyze, render-to-file, project tools) are excluded; `render` is re-registered to return an AudioBuffer.
- The agent loop is `core/agent.js` in jambot — the same loop the CLI runs. The browser passes an `llm` function that POSTs to `/api/jam/llm`, which adds the API key and forwards one Messages call. `JAM_MODEL` overrides the model (default `claude-opus-5`).
- Accounts + tracks: `src/lib/jam/auth.ts` (username/password, bcrypt, HMAC cookie `jam_session` signed with `JAM_SESSION_SECRET`), tables `jam_users` / `jam_tracks` (`apps/jam/schema/`, applied with `supabase db query --linked -f`). Routes: `/api/jam/auth/{signup,login,logout,me}`, `/api/jam/tracks` (list/create), `/api/jam/tracks/[id]` (get/save/delete). The LLM route requires the cookie. Bart's account is `bart`.
- Client: `JamApp.tsx` (shell: auth → library → studio, remembers the last open track in localStorage), `AuthScreen.tsx`, `Library.tsx`, `Studio.tsx` (the chat/transport/controls). A track stores the serialized session, the Anthropic message history and the visible feed; Studio autosaves 800 ms after any change and flushes on back / page hide, so reopening a track resumes the conversation and the sound exactly.
- Playback: `audio.ts` loops the exact bar length and hot-swaps re-renders at the same phase, so slider changes don't restart the groove. Slider changes go through the `tweak` tool and are reported to the agent as a `[controls] …` note on the next message.

Song mode caveat: with an arrangement set, renders use the params captured inside each saved pattern, so a live `tweak` changes nothing audible. The sliders write through to every saved pattern (Studio snapshots the live node and its automation, runs load_pattern → tweak → save_pattern per saved pattern, then restores the live state and re-applies the tweak, so unsaved live edits survive; write-through waits while the agent is busy) and the `tweak` tool result says so for the agent. `node scripts/jam/controls-sweep.mjs` (run from `../vibeceo/jambot`) moves every slider the Controls sheet exposes from min to max in loop and song mode and fails any control that doesn't change the audio — run it after touching instruments, params, song-tools, or controls.ts.

Domain: jambot.to (Namecheap DNS → Vercel A 216.150.1.1 / www CNAME, host rewrites in next.config.ts).

Landing mode (2026-09-06, rewritten the same day): a signed-out visitor to `/jam` sees an essay landing modelled on dodo.foo (built into `AuthScreen.tsx`, styles under `.jl-*` in jam.css). It is DARK by default: the landing adds `jb--dark` to the `.jb` layout wrapper while mounted (night tokens in jam.css, same values as the native app's Theme.swift; keys invert to light-key/ink-label) and sets theme-color to #1b1d20; the app itself stays on the putty panel. Masthead is the plain JAMBOT wordmark with its raised LED (Bart rejected both the icon-beside-wordmark and an icon-as-J lockup); the monogram stays the app icon and favicon only. The six phone screens live in a gallery card (`Gallery()` in AuthScreen.tsx, `.jl-gallery`): one phone per slide (scroll-snap, dots, 5 s auto-advance until touched), 200px wide on phones / 240px beside the caption on wide screens, on a lighter panel-2 surface — not a strip of large phones, which read as cramped. Statement: "Jambot is Claude Code for grooves: …" with the orange line "Every parameter tweakable, every pattern yours."; no credits footer; six phone screenshots from the native app (`public/jam/scenes/*.webp`, 840×1826, exported from `apps/jamnative/.shots/final-*` with Pillow — re-export after UI changes), CTAs "Remix a track" (scrolls to the catalog) / "Make a new track" (opens the create-account form) with a text link to the TestFlight public beta (https://testflight.apple.com/join/gDfvCAp1), then The idea / What it does / The fine print in a developer-to-developer voice adapted from the jambot README, the public `Catalog` under "Listen, then remix", and the sign-in/signup form (auto-opens for returning signed-out visitors via `jam:seen`, and whenever a `?remix=` hint is present). Logo sources: `misc/jambotlogos/` (`jambot-monogram-{light,dark}.png` 1024², `jambot-icons.zip` with matching SVGs) — the monogram (ink tile / putty "J" / orange dot) is the app icon and site mark, the grid stays a UI-only motif. Exported assets live in `public/jam/`: `mark-dark.png`/`.svg` (256², dark tile, used in the masthead and inlined as base64 in `mark-dark-b64.ts` for the edge-runtime `opengraph-image.tsx`) and the site's `favicon.ico`/`icon-192.png`/`icon-512.png`/`apple-touch-icon.png` (from the light monogram, wired via `layout.tsx`'s `metadata.icons`).

Design system (2026-09-05, "desk instrument"): tokens and component classes live in `src/app/jam/jam.css`, scoped under `.jb` (set by `layout.tsx`, which also loads the fonts: Barlow Condensed for panel labels/wordmark, Instrument Sans for reading, JetBrains Mono for readouts). Putty enamel panel, ink rubber keys (`.jb-key`, variants `--orange`/`--ghost`/`--panel`/`--sm`/`--xs`/`--square`), cobalt fader caps (`.jb-fader`), 909-orange LEDs (`.jb-led`). The signature is the 16-step LED strip (`LedStrip.tsx`, data from `src/lib/jam/strip.ts` → `strip` on track/catalog responses, kick/snare/hats, mono gates as fallback) shown on every card and lit by the playhead in the transport. Wordmark is "JAMBOT" plus a raised orange LED, never a period (reads as a domain otherwise). Keep new UI on these classes; don't reintroduce dark-theme Tailwind colors.

Two control UIs, toggled in the sheet header (Sliders / Synth panels, remembered per device). The panels (`src/app/jam/alt/`) are the instruments' own web UIs (kochi.to/jb202, /jt30, /jt10, /jt90, /jb01) minus sequencers, bound to the session through the same `onParam` path: `Knob.tsx` renders `.knob` with each skin's class names, `panels.tsx` holds the per-synth markup plus delay/reverb panels, `skins.css` is generated by `node scripts/jam/build-skins.mjs` (scoped copies of `../vibeceo/web/public/<synth>/ui/<synth>/styles.css`, committed) and `fx-skin.css` is hand-written. After a synth UI restyle in vibeceo, rerun the skins build.

Sequencer (2026-09-05, Controls → **Seq**): `src/app/jam/seq/` — `model.ts` (pure pattern maths: canonical voice lists, sharps-only notes, drum step cycle off→hit→accent, resize/clear, never mutates input), `Sequencer.tsx`, `seq.css`. Phone-portrait first: instrument pulldown (native select), 8 steps per page with ‹ › and swipe (16 per page ≥ 700px), overview strip of the whole pattern with the visible window and playhead, drum rows per voice, mono synths as one note row plus a step editor (−OCT/−1/+1/+OCT, ACC, SLIDE, OFF), LENGTH 1·2·4 bars, two-tap CLEAR. Loop mode edits the live node; song mode edits `session.patterns[id][name].pattern` for the picked section (and mirrors into the live node when it is the loaded pattern). Every edit → refreshDesc + 300 ms render + autosave + a coalesced `[controls]` note (`seq:<inst>:<pattern>`). Song mode has a **Loop section** key: Studio renders only that section (`renderScope`, an `Object.create(session)` view with a one-section arrangement) and goes back to the whole song on Done. Dev hooks in non-production builds: `window.__jamSession`, `window.__jamNotes`.

Playhead LEDs (2026-09-05, late): `hitsAt()` in `seq/model.ts` resolves, for the current 16th step, which instruments and voices are sounding (live pattern in loop mode, the section's saved pattern in song mode, honouring section audition); Studio memoizes it per step and passes `hits` down. Panels header LEDs (`.jam-panel-led.hit`), JT-90 `.voice-panel-led.hit` and JB01 `.jam-voice-led.hit` flash on hits; effect headers follow their target (voice targets only on that voice). The Seq section pill under the playhead gets `.playing` (+ `.beat` on beats) with an LED in its corner.

Mute / solo: `src/app/jam/MuteSolo.tsx` renders the M and S keys on every instrument group in Faders and in each Panels header bar (the keys sit beside the head button, never inside it). They call `mute_track` / `solo_track({ exclusive: false })` (solos stack from the UI; the agent's default solo stays exclusive) and read state from `describeSession().tracks` / `anySolo`, which the agent also sees as a `Mix:` line in its context. Silenced instruments (muted, or another one soloed) dim their group / header. In the engine a silenced instrument is not rendered at all — it reaches neither the master nor any send bus it is routed to (fixed 2026-09-06: a muted lead kept playing through its reverb send), and the render message lists them (`silent: jt10 (muted)`). Regression test: `tests/test-effects.js` in jambot.

Render cache: `src/app/jam/renderCache.ts` keeps the last whole-track render per track in IndexedDB (`jam-renders`, 16-bit PCM planar, six most recent tracks) keyed by SHA-256 of the serialized session + `JAMBOT_BUILD`; Studio plays it on open when the key matches and writes it 1.5 s after any whole-track render (section auditions are never cached). A changed session or a new engine bundle misses the cache and re-renders.

Panels (same day): `alt/panels.tsx` is an accordion (one synth open at a time, remembered in `jam:panelsOpen`), with `alt/panels-mobile.css` re-flowing each skin for a phone-width sheet (`jam-panels--narrow` below 700px via ResizeObserver; original grids above). Knobs ≥ 44px, floating readout while dragging, double-tap resets to the descriptor default.

Verifying, headless: `scripts/jam/pw-harness.mjs` (local `playwright` package, iPhone viewport, signs in as the throwaway `jamtest` / `jamtest1` and opens a track by title). Never drive Bart's account from local dev — same production database. `scripts/jam/controls-sweep.mjs` (run from `../vibeceo/jambot`) still guards every slider; 118 controls, the 8 listed non-failures are expected.

Songs from scripts: `scripts/jam/songs/techno-128.mjs` grows Bart's "techno beat at 128" (`techno-128-base.json`, his serialized session) into the 128-bar "Techno 128 — song sketch" using only tool calls; `scripts/jam/songs/minimal-130.mjs` (2026-09-07) builds "Minimal 130" — 64 bars of Mills-school minimal techno at 130 in A minor from the same base (his kit, one-note sub, A/B stabs, seven JT10 notes; rimshot lattice through a 16th delay, one dark open hat, a five-note JT30 answer in the second peak only, a ghost bar at 32, changes only on 8-bar boundaries) with per-section taste checks (onsets/bar, high band, low band, silence). The genre was chosen after a review of every library entry against the engine's strengths and Bart's own kept/rejected moves: minimal techno is where the data, the engine and his taste agree (dub techno's chord stab needs polyphony the engine lacks; house genres need keys). Bart called Minimal 130 (without the JT-10 line) "the first truly good taste track"; `minimal-131.mjs` is the second one (80 bars, 131, tresillo sub, a 303 straight-8th pulse whose filter sweep is the tune). `minimal-132-dub.mjs` (2026-09-25) is the third, crossed with Basic Channel dub: 96 bars at 125 in G minor, every patch verbatim from 131, techno-128's proven dotted-8th ping-pong + hall moved onto the 202 stabs, which play sparse throws the echo carries (a ghost bar, then seven bars where the echo is the song); imported into `bart`'s library. The genre is encoded as `mills_minimal` in `../vibeceo/jambot/library.json` (tier deep, in the tweak tool's own units, with the arrangement blueprints, rules and both scripts as exemplars); "minimal techno" / "mills school" / "stripped techno" resolve to it, and `buildLibraryContext` now emits an entry's `arrangement`, `rules` and `exemplars`. Rebuild the bundle (`pnpm jam:build`) after library changes so the web and native agents see them; outputs (WAV, metrics, `track.json`) land in `scripts/jam/songs/out/` (gitignored). `scripts/jam/song-metrics.mjs <wav> <bpm> "<bars,...>"` is the listening proxy (RMS/peak/crest/low-high band/onsets per section). `scripts/jam/import-track.mjs <track.json> <username>` inserts a built track into a library as a new row.

LLM route budget: `/api/jam/llm` only accepts Jambot agent calls (system prompt must contain "You are Jambot", tools non-empty) and meters tokens per user per UTC day in `jam_usage` (`apps/jam/schema/003_jam_usage.sql`, applied 2026-09-05); `JAM_DAILY_TOKENS` (default 3,000,000) → 429 when spent; admins (`jam_users.is_admin`) are exempt, their usage is still recorded. Upstream key/credit failures come back as 502 with an in-chat note, never a sign-out. `src/app/jam/history.ts` repairs saved chat histories (orphaned tool_use blocks) on load and before every send.

Library actions: the "…" on a track offers Duplicate (`POST /api/jam/tracks/[id]/duplicate`, full copy) and Delete. Publishing (`apps/jam/schema/002_jam_publish.sql`: `published_at`, `slug`, `remix_of`): the studio header has Publish/Unpublish and Share; a published track is listed in the catalog (`GET /api/jam/public`, shown on the signed-out homepage and under the library) and playable by anyone at `/jam/t/<slug>` (jambot.to/t/<slug>; `src/app/jam/t/[slug]/`, server `generateMetadata` for the share title, and `opengraph-image.tsx` there renders a per-track card with its own LED pattern; Satori needs `display: flex` on any element with two children, so keep interpolated strings in one template literal). Remix (`POST /api/jam/public/<slug>/remix`) copies the session into the signed-in user's library as "<title> remix" with a fresh chat; a signed-out visitor is sent to `/jam?remix=<slug>` and the copy happens right after sign-in. Unpublish keeps the slug so republishing restores the same link.

Taste (2026-09-06, v1 = explicit signals only): two signals, both per user. (1) Turn votes — every finished agent turn gets the quiet ChatGPT-style icon row under its last message (thin thumbs in ink-3, filled in ink when on, a small ×2/×3 count; web `VoteRow` in `Studio.tsx` + `.jb-vote-row`, native `StudioView.voteRow` with `hand.thumbsup` symbols — Bart rejected a louder key row under the composer); taps cycle one, two, three thumbs, then off, one vote per turn keyed by the id of the user message that started it, stored in `jam_votes` (`apps/jam/schema/005_jam_votes.sql`: score -3..3, the prompt, the tools the agent ran, its reply, a state snapshot, `source` for v2's implicit signals) through `POST /api/jam/votes`. (2) Star rating of the whole creation, 1–5, from the track's "…" menu (web row of stars, native "Rate" submenu; shown on the card), `jam_tracks.rating` via `PUT /api/jam/tracks/:id { rating }` (schema 006). Learning happens in the prompt, not in a model: `src/lib/jam/taste.ts` — `/api/jam/llm` appends "What this listener likes" to the system prompt with the user's last 5 votes verbatim (from the first vote on) plus, once they have 5 signals (votes + rated tracks) and again every 5 new ones, a ≤120-word note written by `claude-sonnet-5` (`JAM_TASTE_MODEL`) into `jam_users.taste_note`. `GET /api/jam/votes?track=` returns the votes, the taste and the exact recent lines the agent sees. v2 (same day, no new UI): implicit signals. `/api/jam/llm` reads `x-jam-track` (both clients send it) and, after the response, runs `mineCorrection` on the call that starts a user turn — Haiku 4.5 (`JAM_MINER_MODEL`) judges the new message against the previous turn (its tool calls + reply) as `correction` (−1..−3, reason + targets), `praise`, `new` or `unclear`; a `[controls] …` edit that reverses the agent's move counts as a correction. A bounce (`POST /api/jam/signals { kind: 'bounce' }`, from the web export and the native BounceSheet) and a publish (recorded in the publish route) are +2/+3 whole-track signals. Every signal keeps the turn's tool calls with inputs (`jam_votes.calls`, schema 007). `startingPoints()` takes the final `tweak`/`tweak_multi` values from the tracks rated 4–5, bounced or published (median per path, producer units) and the prompt block lists them as "Starting points". `scripts`: `node /tmp/…/taste-v2.mjs`-style checks live in the session notes; Playwright harness on `jamtest` for the UI.

Rollback + starred (2026-09-07): after every agent turn the Studio posts a snapshot (serialized session + agent history + feed) to `POST /api/jam/tracks/:id/snapshots` (`jam_snapshots`, schema 008; the server keeps the five most recent per track). The quiet row under each of the five most recent finished turns — the last one included, where ↺ means "back to right after this turn", i.e. undo whatever was done by hand since — gets a ↺ (web `RewindIcon` in `Studio.tsx`, native `arrow.uturn.backward`); a track whose last turn has no snapshot (older than the feature, or imported by script) gets one as it opens, so ↺ is always there; a tap turns the row into "Back to here? Later turns and edits are dropped. [Roll back] [Keep]" (inline, no alert — Catalyst-safe). Confirming fetches the snapshot, restores session/messages/feed, re-renders, saves, and `POST …/rollback` drops the newer snapshots and records each dropped turn as a `rollback` taste signal (−2). Controls → Revert (2026-09-07): opening Controls snapshots the serialized session in memory; any fader, knob, M/S, Seq or track edit marks it dirty and a ghost "Revert" key appears next to Done (web `ControlsSheet` `dirty`/`onRevert`, native `JBSheetHeader(secondaryLabel:onSecondary:)` + `StudioModel.revertControls`), which reloads the baseline, re-renders, saves and drops the pending `[controls]` notes; Done keeps. Starred = favourite: ☆/★ above the "…" key on a library card (web `.jb-star`, native `LibraryModel.star`), the card gets an orange edge and sorts first, `PUT /api/jam/tracks/:id { starred }` sets `starred_at` and records a `star` signal (+3) — distinct from the 1–5 rating in the "…" menu. Verified on `jamtest` with two real agent turns.

Secret commands (2026-09-07): typed into the composer, never sent to the agent. `jambot max` (admins only) puts the open track's session on the newest Fable at extra-high effort — the client sets a per-Studio flag, sends `x-jam-max: 1` on every LLM call (web `Studio.tsx` `maxModeRef`, native `JamAPI.maxMode`), and `/api/jam/llm` switches to `JAM_MAX_MODEL` (default `claude-fable-5-1`) with `output_config.effort: 'xhigh'` only when the caller is an admin; the header readout shows "· max"; `jambot max off` returns to the standard model; the flag dies with the Studio (reopen = normal). Non-admins typing it just get a normal agent turn. Starter prompts on an empty track lead with the Mills-school minimal techno line (web `SUGGESTIONS`, native `StudioView.starters`), which resolves to the `mills_minimal` entry.

Admins (2026-09-06): `jam_users.is_admin` (`apps/jam/schema/004_jam_admin.sql`; Bart is the only admin — grant or revoke with `node scripts/jam/set-admin.mjs <username> on|off`). `getJamUser()` returns `admin`, the auth responses carry it, and an admin's catalog cards (web `Catalog.tsx` with `admin`, native `CatalogView(admin:)`) get the same "…" menu the library puts on own tracks: Rename (inline input on the web, an alert with a text field natively) and Delete, via `PATCH` / `DELETE /api/jam/public/<slug>` (403 for everyone else; delete removes the owner's track outright). Verify with the throwaway `jamtest` flipped on temporarily and its own published copy — never on other people's catalog entries — then flip it back off. `scripts/jam/dump-track.mjs <user> "<title>" <dir>` dumps track rows for headless replay.

Multiple instances: the agent can `add_instrument({ type: 'jb202' })` for a second JB202 (id `jb202-2`); the Controls sheet groups them as "JB202 bass · jb202-2", sliders and song-mode write-through key on the id, tracks persist the instance list. Verified with the jamtest account (two JB202s + delay on the second).

Verifying: drive it in Playwright at 390×844 against `pnpm dev` — sign in, New track, send a prompt, confirm tool chips + auto-play, open Controls and move a slider, Export → MP3 (Playwright captures the download; `afinfo` it), back to the library, reopen the track and confirm it resumes. Replay a saved track's tool calls headlessly in Node (`select messages from jam_tracks`) when a render goes wrong — that is how the JB202 waveform bug was found.

### Rock Paper Anything — the Jev showcase (2026-09-20)

`/rpa`. Enemies (a campfire, a bureaucrat, Monday morning, loneliness) descend on a gate; the player types any phrase and presses Enter; the phrase hits every enemy on screen, each in proportion to how strongly Jev thinks it beats that enemy. A weapon works once per run. Waves climb from household nuisances to forces and feelings, every fourth wave ends in a boss that adds a rule ("only kitchen things hurt it"). No accounts.

- **Jev** (`typesafe.ai`, `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $TYPESAFE_API_KEY`, body `{ model, state, questions }` — `model` is required, the DEV guide's curl omits it). Not a generative model: it answers typed questions (`noul` yes/no probability, `choice`, `score`) about a JSON state, all questions in one call in parallel, ~150 ms, $0.042 per million input tokens, output free. Its docs' warnings hold: it reads literally, cannot count or do arithmetic, and is no judge of jokes. `TYPESAFE_API_KEY` is in `.env.local` and on Vercel (Production + Preview, added 2026-09-20 with `vercel env add`). The model is pinned (`jev-1.13.0` in `judge.ts`) because the damage curve is tuned to its probabilities.
- **One shot = one call** (`src/lib/rpa/judge.ts`): state is `{ attack: phrase }`; per enemy TWO nouls, "would defeat, stop, or neutralize X" and "someone struggling with X would be glad to have it", combined with max in code. One wording alone is too literal (a storm shelter "defeats" a hurricane at 0.36 but "helps against" it at 0.81); `scripts/rpa/wording-lab.ts` scored six wordings on 160 real counters and 160 unrelated pairs and this pair separated best (0.71 vs 0.24). Riding along in the same call: three gates — `real` (names something; refuses "I win", gibberish), `vague` (refuses "the thing that beats it", "its weakness"), `overkill` (refuses nukes, God, black holes; ceiling 0.35 because "a nuclear bomb" only scores ~0.5) — plus an `element` choice that colours the projectile and a `wit` score (bonus above 1.5; plain answers sit near 1.3). A boss adds its condition as one more noul and takes min(beats, condition).
- **Every number is code** (`src/lib/rpa/rules.ts`): damage = linear from p 0.35 → 0 to p 0.80 → 100; hit points by tier (100/100/110/120, boss 200); `wavePlan(n)`; `phraseKey` for the no-repeats rule; `refusal()` for the gates.
- **Enemies** (`src/lib/rpa/enemies.ts`): ~80 authored entries in four tiers plus five bosses, each with `answers` that are never shown. `npx tsx scripts/rpa/solvable-check.ts` (env loaded; ~200 calls, one cent) fires every answer at the live model inside a crowd, fails any enemy whose best answer deals under 50 or any boss its answers cannot kill, then checks the gates against honest phrases, cheats and superweapons. Run it after touching enemies, question wording or the curve. Things that read well and failed: witty counters (a can opener vs a knight 0.14, three goats vs a troll 0.25) and bosses whose rule excludes every honest counter (a dragon only kitchen things hurt).
- **Route** `POST /api/rpa/judge { phrase, enemies: [catalog ids] }`: the server writes the questions from ids, so it is not an open proxy to Jev; phrase ≤ 40 chars, ≤ 16 enemies. Global daily cap in `rpa_usage` (`apps/rpa/schema/001_rpa_usage.sql`, applied 2026-09-20; `RPA_DAILY_CALLS`, default 20,000 ≈ $1) read at most every 30 s per instance and written with `after()`, so a shot never waits on the database.
- **Client** (`src/app/rpa/Game.tsx`, `rpa.css` under `.rpa`, `sfx.ts`): state in one ref, a re-render per animation frame, DOM tags (no canvas). Aim while typing: a 300 ms pause fetches the verdict and each enemy shows the damage it would take; pressing Enter on a fresh preview that covers everyone on screen fires with no second call. The ticker under the HUD shows the last call's question count, Jev latency and cost and the run's total; game over prints the receipt. The root follows `visualViewport` so a phone keyboard never covers the dock. Look: two-colour risograph (paper #f2e8d5, ink, fluorescent red #ff4a1c, blue #2347c5), Bowlby One / DM Mono / Fraunces italic for what the player types. OG card is static: `scripts/rpa/og.html` → `npx tsx scripts/rpa/og.ts` → `public/rpa/og.png`.
- **Verify:** `npx tsx scripts/rpa/pw-play.ts <shots-dir> [url] [--waves n] [--lose]` — a bot in a phone viewport reads enemies off the DOM, types authored answers slowly enough for the aim preview, and must clear n waves, see all four refusals ("too vague", "no superweapons", "not a thing", "already used") and raise no page errors; `--lose` lets the gate fall and checks the game-over receipt. Default URL is `localhost:3217`.

### Onething — one sentence a day

`onething.ink`. Every user gets a question by iMessage at 10am in their own zone, answers with one sentence, and keeps a streak; a reminder goes at 10pm if the day has no entry (never within four hours of the question itself). Levels (Seed → Old Growth, `levels.ts`) are earned on cumulative points, so a broken streak never demotes anyone. The web page is a small paper journal: sign in by phone + code, httpOnly cookie `onething_session` that `/api/onething/me` re-issues on every visit; the vercel host redirects all page paths to onething.ink so there is one cookie origin (API routes stay on both, the cron calls them).

How it is wired:
- **Storage:** the `onething_*` tables in the F2 Supabase project (`apps/onething/schema/001-003`, applied by hand with `supabase db query --linked -f` BEFORE the deploy that needs them — 002 added `tz`, 003 `prompted_at`; the inserts fail loudly without the column).
- **iMessage:** outbound through Dodo's BlueBubbles sender (`src/lib/f2/bluebubbles.ts`); inbound arrives on the shared iMessage webhook, whose dispatcher asks `src/lib/onething/inbound.ts` first (see "iMessage — one inbox, three apps" below). Texting "onething" joins; a text starting "Onething:" is force-saved as a thought; the webhook claims the message guid before the echo check, and the echo ledger looks back three days, because the mini sends as Bart's own Apple ID and BlueBubbles re-delivers our own texts when they are read (one came back as a "thought" on 2026-09-13).
- **The tick:** `vercel.json` cron hits `/api/onething/tick` at :05 every hour. `dueFor()` in `core.ts` is pure and decides per user, in the user's zone, whether it is question time, reminder time, or nothing — extend its test (LA / Brussels / Tokyo, 18 instants, in the fix commit `fcc6441a`) whenever the timing rules change. `findEntry` looks a day up directly; never use "latest row" for "that day's row".
- **The texts** (morning question, evening reminder, the line back after an entry) live in `src/lib/onething/copy.json`, one picked at random per send; the question and the reminder open with `MARK` (🌱, `core.ts`, 2026-09-22) so they read as Onething's in a shared inbox, and `looksLikeOurs()` strips it; `looksLikeOurs()` matches inbound text against that file so our own echoes are never saved as thoughts. Add lines there, never inline, and run `npx tsx scripts/onething/copy-check.ts` after editing it. Kept lines never refer to yesterday or earlier entries (random pick, so "one more than yesterday" reads as a claim about the record — Bart hit this 2026-09-16). The site link goes on the kept reply only on a milestone day (`bonus > 0`) or a level-up (`Recorded.leveledUp`), with the `milestone` / `levelUp` tails from copy.json; the daily reply is link-free so iMessage doesn't turn it into a preview card.
- **Phone numbers** (2026-09-19): `normalizePhone(raw, hint?)` in `core.ts` reads whatever people type. Spaces, dashes, dots and brackets are noise; `+44 7911 123456`, `44 7911 …`, `0044 …`, `011 44 …` and `+44 (0)7911 …` are one number (the iPhone phone keypad hides "+" behind the +*# key). A national number (`07911 123456`, `0475 12 34 56`) is placed by a hint and kept only if `libphonenumber-js` says it is a valid number there: the sign-in form sends the browser's zone and `navigator.language`, a buddy invite uses the inviter's own number. A US number typed abroad stays a US number (invalid in the hinted country → falls through to the ten-digit rule); handles from iMessage carry their plus and pass through unvalidated, as before. With no hint that fits, a leading zero is refused with a message asking for the country code, and the code step shows the number as it was read, so a wrong guess is visible. The library is imported as `/core` + `/max/metadata` because its `/max` entry breaks under tsx. Bart's sister (+44) could not sign in before this: every attempt was a 400 and no code row was ever written. Checks: `npx tsx scripts/onething/phone-check.ts` (pure, 54 formats) and `node scripts/onething/pw-signin.mjs <shots-dir>` (the form in mobile WebKit as a British phone; national formats locally, fictional `+44 7700 900xxx` on production).
- **New sign-ups** text and email Bart (`notify.ts`; never throws).
- **Doodles** (2026-09-23): every entry gets a margin doodle drawn by Opus 5.5 at low effort (`src/lib/onething/doodle.ts`, schema 005: `doodle` = sanitized SVG element markup for a 340×170 viewBox, `doodle_alt`, `doodle_word`, `doodled_at`). `recordEntry` / `editEntryLine` call `scheduleDoodle` (next's `after()`; outside a request it draws inline), so a new sentence, an added thought or an edit redraws the day; `/api/onething/me` schedules up to four missing ones per visit, and the page polls `me` a few times after a save until today's drawing is in. Structured output (`output_config.format`), the three example doodles from Bart's September page in the system prompt, the last three days' sentences + alts so it doesn't repeat itself. Words: `wordAllowed()` opens only when nothing worded sits in the previous three days, and the day's instruction differs (none at all / a word or two is welcome), so a worded doodle lands every four days at most — in a redo of eight days it used two. The sanitizer keeps path/circle/ellipse/rect/line/polyline/polygon/g (+ `<text>` on allowed days) and the classes `r`/`thin`/`f`/`fr`. **A setting** (schema 006, `onething_users.doodles`, default on; Settings → The page): off means `doodleEntry` returns null without drawing and the page hides the drawings and drops the margin (`.ot-lines.plain`); `PUT /api/onething/me { doodles }`. Checks: `npx tsx scripts/onething/doodle-check.ts` (sanitizer + gate), `doodle-off-check.ts` (the setting, on the throwaway Ada), `doodle-backfill.ts [--redo] [--user id]` (real calls, ~5 s each; the 40 entries of 2026-09-23 were backfilled). One draw of 41 failed transiently ("nothing drawable came back") and passed on retry; the error logs what came back.
- **The ruled page** (2026-09-23, the doodles' layout — chosen over doodles under each sentence and over two looser takes Bart called messy): `.ot-lines` draws 28px rules the full width with the red double margin; the words keep left of `--margin`; every doodle sits in one slot in the margin (desktop 200×140 = five rules, phone 132×112 = four), top-aligned with its entry's first line, ±2° by row parity and nothing else random. `Doodle.tsx` crops each drawing to its ink after mount (`getBBox` → viewBox, never scaled past `PEN_SCALE` 0.8 px per canvas unit, so small drawings stay small) and strokes are `vector-effect: non-scaling-stroke` (one pen at every scale). A row is 6 + content + 22 and `useRuledRows()` (ResizeObserver) tops each row's bottom padding up to the next rule, so the composer, an edit box or a wrapped nudge never push the rows below off the lines; the composer's textarea has no rules of its own any more (the page's show through). "kept!" waits in the margin slot until the drawing arrives. Missed days are one rule each. The streak "i" panel lists **replay** links for every milestone (3 · 7 · 14 · 30 · 60 · 100 · 365; reached ones in ink): a tap plays the payoff scene at the points that day actually had (the entry whose streak equals the milestone) or, unreached, as a run of that length would (`pointsAfterRun` in levels.ts). Checks: `node scripts/onething/pw-page-shot.mjs <dir> [--desktop]` against a dev server on 3218 with `ONETHING_DEV_AS` (page, every row a whole number of rules, the seven replay links, a replay opening and closing the scene, the toggle), `pw-toggle-check.mjs <png>` (off → API + page, then on).
- **Milestone payoff** (2026-09-22): on a day the streak reaches 3, 7, 14, 30, 60, 100 or 365 (`MILESTONES`), the journal page plays a full-screen scene once per browser (`localStorage` key `onething:payoff:<day>:<streak>`, written as it opens): Bart's "grow a year" canvas sketch, ported to `src/app/onething/grow-scene.ts` (draws only; deterministic trees, meadow, butterflies, petals) and driven by `Payoff.tsx` — the seed cracks and the plant grows from day 1 to the person's real level and progress (`growthFor(points)` = level index + fraction to the next), the counter runs the days, petals burst on arrival, the foot says "Day 7." and what it was worth. Tap plants a flower, swipe makes wind, Escape or the button closes it; a "replay" link sits on the streak line that day. It also plays right after a milestone sentence is saved on the site. The kept text already carries the site link on milestone days, so the iMessage tap lands on it. Preview any milestone at `/onething/grow?streak=30` (unlisted, simulated points). Check: `set -a; source ./.env.local; set +a; npx tsx scripts/onething/payoff-user.ts` makes a throwaway user with a seven-day streak ending today (`cleanup` removes it), then `OT_OUT=<dir> OT_USER=<id> node scripts/onething/pw-payoff.mjs` against a local dev server drives the preview at day 7 and 365 and the real trigger, replay and no-replay-on-reload.
- **Demo account** (2026-09-18): type **(555) 555-0101** into the sign-in form. Every Onething text leaves through `sendText` in `src/lib/onething/send.ts`; for the demo number (`DEMO_PHONES`) it goes to Bart's own phone as an iMessage marked `[demo]` instead — the sign-in code and the welcome — so the account signs in like a real one without a second iMessage number. It gets NO daily texts: `tick()` in `flow.ts` skips demo phones (2026-09-20, Bart was getting the 10am question and 10pm reminder on his own phone every day). `looksLikeOurs()` strips the `[demo]` prefix, so echoes of those texts are never saved as thoughts on Bart's real account; replies Bart types in that chat still belong to his real account (write the demo account's sentences on the site). No sign-up note is sent for it. It needs the mini like every other send. Email was the first choice, but SendGrid answers "Maximum credits exceeded" (the sign-up emails fail the same way).
- **Buddy streaks + names** (2026-09-14, `buddies.ts`, schema 004 applied): a pair counts a day when both wrote, a miss by either resets it to zero, every 7 days it holds both get 25 points (paid once per day mark via `last_bonus_day`, bumped onto each person's latest entry). Personal streaks and points are never touched. As many buddies as you like, one `onething_buddies` row per pair, `pairStreak()` recomputed from entry days every time (the row's `streak`/`best` are a copy, kept so a reset can be noticed). Invite from settings by phone or iCloud email (either kind of handle lives in the `phone` column); the invitee replies YES by text (or accepts on the site), the pair starts with the acceptor's tomorrow, the inviter gets one line. Ending is silent to the other person. No extra texts: the buddy state rides inside the "kept" reply (tails), the evening reminder ("Sam's in for today…") and the morning question (one reset line). A name is what buddies see instead of the number: asked ONCE by text when someone accepts over iMessage (`name_asked_at`), the reply sets it if it reads as a name within 24 h (`nameReplyFor` in `flow.ts`), or set in settings. `flow.ts` holds the tick, welcome and inbound handler (moved out of core.ts). Checks: `npx tsx scripts/onething/buddy-check.ts` (pure logic + echo guard) and `scripts/onething/buddy-db-check.ts` (two throwaway users on the real tables, cleaned up).

The six fixes of 2026-09-13 were all behaviour bugs in one-line-from-a-phone features: every user on Pacific time, a reminder an hour after a late sign-up's question, a React component declared inside the page component (remounted per keystroke), the webhook echo, "latest row" for "today", and cookies split across two hosts. Each would have been caught by a written spec or a focused test — which is what the Strays persona now requires (see `apps/golembot/CLAUDE.md`, "Reliability").

### iMessage — one inbox, three apps (2026-09-18)

BlueBubbles on the Mac mini posts every new message to one webhook
(`/api/f2/clients/imessage/webhook`; `/api/polly/clients/imessage/webhook` is
an alias of it, same dedup table). The mini is a dumb pipe — BlueBubbles in,
the `imsghttp` send agent out (`F2_IMESSAGE_SEND_URL`, tunnel `imsg-mini`) —
because the tables that say who a handle belongs to live on Vercel. The
webhook authenticates, drops from-me echoes (both apps' outbound ledgers),
claims the guid, then `dispatchInbound` in `src/lib/imessage/dispatch.ts`
decides: Onething claims first (its own rules); then the handle's pairings —
Dodo only or Polly only goes straight there, unpaired is dropped; paired to
both → a `polly …` / `dodo …` prefix wins (the same words that address each
app's agent), else the app that handled this handle's last message — or sent it
its daily card (`rememberRoute`, `src/lib/imessage/routes.ts`) — within
six hours keeps it (`imessage_routes`, schema f2/049), else one Haiku call
(`IMESSAGE_CLASSIFIER_MODEL`) says language-learning or not, default Dodo.
Check: the decision table in the 2026-09-18 session ran on two throwaway
users sharing a handle (prefix, sticky, expired sticky, classifier, unpaired).

Pairing codes (`/api/{f2,polly}/imessage/start`) send synchronously and
return 502 with "the iMessage server is unreachable" when the mini's tunnels
are down; the code stays stored so a retry reuses it. When every `*-mini`
tunnel answers "No tunnel found", the mini is off the network (2026-09-18:
its CASBS gateway reported host unreachable) — a person in the room has to
look at it; nothing here can fix that.

### Socratic — the Zeiler-method tutor (2026-09-14)

`/socratic` is the prototype for the study Daniel Chen is putting together with Kathy Zeiler (BU Law, Torts, ~230 students a class): in three months, an artifact plus a randomized comparison of students using a plain LLM vs Socratic LLM variants, probably run through oTree. Source material is in `misc/daniel-chen/`: Bart's meeting notes, the verbatim transcript of Zeiler teaching negligent entrustment, and the "Student Prompt" study script Daniel had Claude build from it (a paste-into-Claude markdown: doctrine, the employer-as-entruster hypothetical, her nine method moves, a four-step protocol, an 11-question bank with model answers, four mastery criteria). One module so far.

- **Content:** `src/lib/socratic/modules/negligent-entrustment.ts` holds the script's six sections as fields (generated from the txt/docx in `misc/daniel-chen`; edit the TS directly for tweaks) and `negligent-entrustment-transcript.ts` the class dialogue verbatim. `modules/index.ts` is the registry.
- **Arms** (`arms.ts`, chosen per session): **A Assistant** explains and answers directly (the control); **B Socratic** runs the script — overview → "ready?" → questioning with the moves (commit, "a list of facts is never an argument", scaffold only when stuck, flip, line-drawing, sympathetic group, name the skill, hold the duty/causation boundary, recap) → mastery check; **C Socratic + coach** is B plus the observer's verdict appended to each student message as a `<coach>` block the tutor is told to follow. System prompts are built in `prompts.ts`, one per arm + module, cached (`cache_control`). Arm C demonstrably steers: after "Ready." the coach said `commit` and the tutor demanded a position, where B's tutor asked for the holding first.
- **Tutor** (`tutor.ts`): `claude-opus-5` (`SOC_TUTOR_MODEL`), effort `medium` (`SOC_TUTOR_EFFORT`), structured output `{ reply, phase, move, student_answer, mastery }`; `reply` is first in the schema so `partial.ts` can decode it out of the half-written JSON and stream it. The conversation is rebuilt from `soc_turns` on every call (assistant turns re-serialized as their JSON). Overview ≈ 13 s, replies 3–8 s; the 15k-token prompt is served from cache after the first turn.
- **More topics** (2026-09-15): a module is topic-specific sections (`framing`, `hypotheticalTitle`, `doctrine`, `hypothetical`, `protocol`, `questionBank`, `masteryCriteria`, optional `transcript`) plus the shared Zeiler `method` and `tone`; `prompts.ts` reads everything topic-specific from the module (the transcript appendix is omitted when `transcript` is empty). `npx tsx scripts/socratic/new-module.ts --id <slug> --topic "…" [--course "Torts · Duty"] [--source file …] [--transcript file]` has Opus draft the topic sections from the sources (txt/md/docx; without any it drafts from memory and says so), writes `modules/<id>.ts` with the reviewer notes at the top and registers it in `modules/index.ts`; it runs through the same backend switch as the tutor. Review the file before students see it. The start page shows a topic picker once there is more than one module (`?module=<id>` preselects); `pw-check.mjs` takes `SOC_MODULE` and `SOC_SCRIPT` to drive a non-default one. Second module: `premises-liability` (Carter v. Kinney / Heins v. Webster County, drafted from model knowledge, unreviewed — its notes list what to check).
- **Create a new topic from the web** (2026-09-15): `/socratic/new` (linked from the start page) explains what fits the method (a settled rule plus an open question; not mechanisms or facts), has an example that fills the form, takes a topic, a course line and optional sources (pasted text or .txt/.md/.docx uploads), then `POST /api/socratic/modules` runs the same draft as the CLI (`src/lib/socratic/draft.ts`, shared: schema, system prompt, the docx reader, `moduleFromDraft`) and stores the result as a `soc_modules` row (`apps/socratic/schema/002_soc_modules.sql`, applied with `supabase db query --linked -f` — `scripts/db` is SELECT-only). The registry (`modules/index.ts`) merges the checked-in `FILE_MODULES` with the rows; `getModule` / `listModules` are async. Drafts take 4–7 minutes; the page shows a progress bar and the reviewer notes, then "Start a session". Creation is open when `SOC_BACKEND=claude-code` (local) and needs `?key=SOC_ADMIN_KEY` otherwise (`maxDuration` 300 on the route — on Vercel a slow draft can still time out). `scripts/socratic/pw-new-topic.mjs <shots-dir>` drives it headlessly; verified with the French-Terror example and a full arm-B session on the stored module.
- **Two builds** (2026-09-15): the public deployment (Vercel, API credit) serves only the study's Torts topic — no picker, no create link, `/socratic/new` locked, other module ids rejected — and its start page ends with a quiet footer pointing at the full build (`SOC_FULL_URL`, default bart-imac.tunn3l.sh/socratic). `allModules()` in `modules/index.ts` is the switch: true on the Claude Code backend or with `SOC_ALL_MODULES=1`. The full build (every module + generator) is this iMac's dev server on port 3000 behind the `bart-imac` tunnel; keep `pnpm dev -p 3000` running while people are using it.
- **Local backend on the Max subscription** (`claude-code.ts`, 2026-09-15): `SOC_BACKEND=claude-code` in `.env.local` (set on the iMac M4) runs the tutor and the observer through the `claude` CLI on this machine — its OAuth login, no API credit — instead of the SDK in `anthropic.ts`. One `claude -p` per call: `--tools ""`, `--setting-sources ""`, `--strict-mcp-config`, a custom `--system-prompt`, `--json-schema` for the structured output (the CLI implements it as a StructuredOutput tool call, so `partial.ts` decodes the `input_json_delta` stream instead of text deltas), `ANTHROPIC_API_KEY` stripped from the child env (the CLI would otherwise bill the key). The tutor's conversation is a Claude Code session named by the socratic session id (`--session-id` on the first call, `--resume` after; cwd `~/Library/Caches/socratic-claude-code`, so no CLAUDE.md is picked up); the observer's calls use `--no-session-persistence`. `usage.cost_usd` on the turn is the CLI's list-price estimate. Local only: the login is personal and Vercel has no CLI. Verified with `SOC_URL=http://localhost:3002 node scripts/socratic/pw-check.mjs C`.
- **Observer** (`observer.ts`): `claude-sonnet-5` (`SOC_OBSERVER_MODEL`), low effort, reads every student message in every arm against the method: `answer_type` (list_of_facts, bare_conclusion, hedge, argument, counter_argument, line_drawing, sympathetic_group, element_conflation, doctrinal_error, stuck, …), `quality` 0–3, `doctrinal_error`, `recommended_move`, one-line `rationale`. That is the per-turn measurement; only arm C shows it to the tutor. In A/B an observer failure is logged on the turn (`meta.observer_error`) and the session goes on; in C it fails the turn.
- **Storage:** `apps/socratic/schema/001_socratic.sql` (applied 2026-09-14) → `soc_sessions` (participant, arm, module, phase, mastery flags, ended_at) and `soc_turns` (role, content, the hidden opening turn, `meta` = tutor self-report or observer verdict, `coach`, usage, latency, model). No accounts: `/socratic?pid=<code>&arm=<A|B|C>` is the link a study platform would send students to; the start page remembers the code per browser and lists recent sessions to resume.
- **Routes:** `POST /api/socratic/sessions`; `GET|PATCH /api/socratic/sessions/:id` (student-facing turns carry no verdicts or coach notes; PATCH `{ ended: true }`); `POST …/:id/turn` streams SSE — `student` → `delta`… → `done | error`; an empty body opens the session (the tutor speaks first) or retries after a failed tutor turn. Client in `src/app/socratic/` (`Start.tsx`, `s/[id]/Session.tsx`, `api.ts`, `socratic.css` scoped under `.soc`).
- **Researcher view:** `/socratic/sessions?key=$SOC_ADMIN_KEY` (all sessions: arm, phase, student messages, mastery n/4) and `/socratic/sessions/:id?key=` (metrics — messages, mastery, mean reasoning quality, first real argument, lists of facts vs corrections, latency — then the transcript with a verdict chip under each student message, the move/phase chip under each tutor reply, and the coach note in a `<details>`). The key is in `.env.local` and Vercel (Production + Preview).
- **Auth:** `src/lib/socratic/anthropic.ts`. Locally the app runs on OAuth, not an API key: `SOC_PROFILE=default` in `.env.local` names an `ant auth login` profile (`brew install anthropics/tap/ant`; the login opens the Console in the browser and stores the token under `~/.config/anthropic/`, which the SDK refreshes itself). With a profile set the SDK ignores `ANTHROPIC_API_KEY` on purpose, so hilma's stale key can't shadow it. Production has no profile on disk and uses Vercel's `ANTHROPIC_API_KEY`. Needs `@anthropic-ai/sdk` ≥ 0.125 (bumped 2026-09-15). Billing lands on whichever org the login picked (Kochito Labs) — OAuth is a credential, not a way around credits.
- **Verify:** `node scripts/socratic/pw-check.mjs [A|B|C]` against `npx next dev --turbopack -p 3100` (phone viewport; begins a session, waits for the overview, sends "Ready." then a classic list-of-facts answer and expects the correction, reloads to confirm resume, prints the session id). Then check the rows: `./scripts/db "select idx, role, meta from soc_turns where session_id='…' order by idx"`. Sample sessions `pw-a` / `pw-b` / `pw-c` are kept in the table as examples.
- **Open questions for the study** (not in the folder): only one topic; no outcome measure or pre/post test yet; whether the tutor lives inside oTree or oTree only randomizes and links out. The tutor also knows the real Vince v. Wilson beyond the module (arm A cited the 1989 Vermont decision's facts correctly) — fidelity to the module isn't enforced.

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

### Dodo voice (GPT-Live) — the non-default engine since 2026-09-21

ElevenLabs + Claude (next section) is the default in Dodo and Polly; GPT-Live is the other choice in Profile → Voice → Voice engine. Dodo's voice surfaces — Talk to Dodo (global / topic), spoken flash rounds, the Final Review, the Second Chance and the recert refresher — run on **OpenAI GPT-Live (`gpt-live-1`)** since 2026-09-11 (they were on Realtime `gpt-realtime-2.1` before). Code: `src/lib/f2/live.ts` (prompts + session config + the OpenAI call), `src/app/api/f2/live/session/**` (start = SDP exchange, finish = transcript), `src/lib/f2/realtime.ts` (voice-session rows, prefs, the voice catalog — shared), `apps/feynd/Feynd/LiveVoiceClient.swift` (the screens in `VoiceSessionView.swift` / `FlashVoiceView.swift` are unchanged), `apps/f2/schema/007_f2_voice_sessions.sql`. Reference: [`docs/f2-gpt-live-reference.md`](docs/f2-gpt-live-reference.md).

How it is shaped: the live model owns the conversation (full duplex — it listens while speaking and handles interruptions itself; there is no turn loop, no commits, no `response.create`) and gets a short prompt with the script, a ≤24K-char excerpt of the material and a delegation policy; a **Responses backend** (`gpt-5.6-luna`, env `OPENAI_LIVE_BACKEND_MODEL`) gets the FULL material in its own prompt and the live model delegates to it for details and fact checks. No function tools on the client. The phone's WebRTC SDP offer goes through our server to `POST /v1/live/sessions` — there are no ephemeral client secrets for Live. Transcripts arrive as timestamped fragments per speaker; the client groups them into turns for the graders.

Verify with `npx tsx scripts/test-live-dodo.ts [mode] [--nudge] [--answer "…"]` (headless: the exact server session over WebSocket, answers with macOS `say`, prints transcripts + delegations) and the simulator drill `-VoiceLiveTest 1` (see `apps/feynd/CLAUDE.md`). The legacy `/api/f2/realtime/session` + `/tool` routes stay only for Dodo builds older than 0.2 (106). **Peri (`src/lib/f4`) and Loci still use Realtime** — `docs/f2-realtime-api-reference.md` covers those.

### Dodo voice, ElevenLabs + Claude — built 2026-09-20, the default since 2026-09-21

A per-device setting and **the default** (`VoiceEngine.fallback`; a device that never touched the picker gets it): Profile → Voice → **Voice engine: ElevenLabs + Claude / GPT-Live** (`VoiceEngine` in `apps/feynd/Feynd/DodoVoiceClient.swift`, UserDefaults `voiceEngine`). The voice stack therefore depends on the Mac mini's bridge being up. Same five voice surfaces, same screens, hold-to-talk, finish route and graders. Reference: [`docs/f2-eleven-voice-reference.md`](docs/f2-eleven-voice-reference.md); setting it up on another machine, moving the bridge, the Vercel vars and a what-broke table: [`docs/f2-eleven-voice-setup.md`](docs/f2-eleven-voice-setup.md).

**ElevenLabs Speech Engine** owns the audio (speech-to-text, turn-taking, barge-in, the voice — Jessica on `eleven_v3_conversational`); **Claude Opus 5.5** writes every turn. Speech Engine is bring-your-own-LLM and it connects *to us* over a WebSocket, which Vercel cannot host, so `apps/dodo-voice-bridge` (a small Node process on Railway) takes each transcribed turn and POSTs it to `/api/f2/eleven/turn`, where Claude streams plain text back to be spoken. The bridge is a dumb pipe, like the iMessage agent: prompts, tables and the Anthropic key stay on Vercel. Code: `src/lib/f2/eleven.ts` (token mint, the turn), `src/lib/f2/voice-start.ts` (mode gates + script, shared by BOTH engines — change a gate there, not in a route), `src/lib/f2/live.ts` (`engine: 'eleven'` swaps the persona for a text-to-speech one, gives Claude the whole material instead of an excerpt, and drops the delegation policy), `apps/feynd/Feynd/ElevenVoiceClient.swift` (ElevenLabs' Swift SDK, which rides on LiveKit — its WebRTC build has prefixed symbols and links next to ours).

It is a cascade, not full duplex: no backchannels, and ≈ 2 s from the end of the user's turn to Dodo's first sound (Claude's first token is about half of it; thinking runs adaptive at low effort because Opus 5.5 cannot switch it off — 1.4–1.6 s to first text headless, 2026-09-22). Barge-in stops Dodo in about a second and the transcript keeps what was actually spoken. Dodo speaks first in scripted modes because the client sends a `[begin]` text message the server swaps for the opening instruction.

Two engines on ElevenLabs because an engine has one `ws_url`: "Dodo (dev)" → bridge `/ws/dev` → `localhost:3100`; "Dodo" → `/ws/prod` → `feynd.cc`. `ELEVEN_SPEECH_ENGINE_ID` is the dev one in `.env.local` and the prod one on Vercel; `DODO_BRIDGE_SECRET` and `ELEVENLABS_API_KEY` must be on Vercel too. The bridge runs on **Railway** since 2026-09-21 (project and service `dodo-voice-bridge`, `https://dodo-voice-bridge-production.up.railway.app`, a permanent hostname the four engines were pointed at once; ship a change with `railway up --ci --service dodo-voice-bridge` from the folder). It spent its first day on Bart's MacBook Air and an afternoon on the Mac mini behind Cloudflare quick tunnels; the mini's launchd job is uninstalled, the Air's is not — its old `run.sh` re-points all four engines at the Air if it restarts while the Air is awake (see the bridge README). A dev machine's `run.sh` now re-points only the two dev engines. If Dodo says "Voice failed" on this engine, `railway logs` from `apps/dodo-voice-bridge` first. tunn3l's HTTP mode does not pass WebSocket upgrades, hence Cloudflare for dev machines.

Verify with `npx tsx scripts/test-eleven-dodo.ts [mode] [--interrupt]` (headless: real route, spoken answers through ElevenLabs' speech-to-text, a barge-in) and the simulator drill with `-voiceEngine eleven` added (see `apps/feynd/CLAUDE.md`). In the simulator run it with `-voiceHoldToTalk 1`: the sim listens through the Mac's real microphone, and room noise (or the Mac's own speakers) keeps interrupting a hands-free session until nothing gets said.

**Polly has the same engine, also the default, for every voice mode** (2026-09-21; phase 1 on 09-20 was conversations only): the clean-up walk's "next card" and the level check's silence nudge are text messages from the app (`ELEVEN_CUE_PREFIX` = `[app] `, which `turnMessages()` hands Claude as a note from the app and clients keep out of the transcript). Same switch in its Profile → Voice, `apps/polly/Polly/ElevenVoiceClient.swift`, `/api/polly/eleven/{session,turn}`, its own two engines on the bridge (`/ws/polly-prod`, `/ws/polly-dev`, a multilingual voice). See `apps/polly/CLAUDE.md`.

### Peck or Perish — the rest-stop minigame (2026-09-23)

Clearing a Peck rest stop (5, 15, 25, …; `PeckMilestone.isRest`) for the first time opens a whack-a-mole minigame once its results cover closes; a cleared rest stop's signpost ("▶ Peck or Perish") replays it. Rats, pigs and monkeys off the Dutch ships run at the dodo's one egg on Mauritius in 1598; each bite raises P(extinct), and at 100% the score is the year the dodo went extinct (history: 1662). Look: a 1600s naturalist engraving printed in riso inks (paper, black hatching, pink / marigold / teal multiplied slightly off register), Ultra + IM Fell English fonts bundled in `Feynd/Fonts/`, synthesized marimba sound.

- **Native** (`apps/feynd/Feynd/PeckGame*.swift`): Engine = rules only, Art = SwiftUI Canvas drawing on a fixed 400 × 720 logical canvas, Audio = one AVAudioSourceNode with the sequencer in the render callback (ambient session; never switches a live `.playAndRecord`), View = scaling + input + board calls. iPhone scales to fit, iPad caps at 1.4×, Catalyst holds 1.15× (shrinks only when the window is too short). The printed background is rendered once per scale with ImageRenderer; per-frame caches live in a reference type because a Canvas closure never sees @State values set after the first body.
- **Board**: `f2_peck_game_scores` (schema 053, applied), `src/lib/f2/peck-game.ts`, `GET|POST /api/f2/peck-game/<level>` (POST `{ year }`, 403 unless the player has cleared that level). Handles are the username's part before "@" (guests: "guest 1a2b"). Check: `npx tsx scripts/f2-peck-game-check.ts` (env loaded; writes and removes rows for the two test accounts at level 995).
- **Tuning**: the numbers came from a bot on the web prototype (`public/peck-or-perish/`, local only, not committed): a casual player dies around 1670, a sharp one around 1700, rounds run 70 to 110 seconds.

### Dodo global chat — one conversation across all of a user's topics (2026-09-20)

**Hold the + on the Topics screen** → a pill, "Ask across all topics" → a full-screen chat (`apps/feynd/Feynd/GlobalChatView.swift`) with a composer and a mic; typed and spoken turns are one thread (`f2_global_chats`, a global voice session's transcript is appended when it ends), and chips under an answer name the topics it drew on. Reference: [`docs/f2-global-chat.md`](docs/f2-global-chat.md).

The knowledge behind it (`src/lib/f2/knowledge.ts`, schema 051) is two layers, because a big library is millions of characters: a **digest card per topic** (Sonnet 5, rewritten when the material's hash changes) — all of them, with the learner's standing on each, are the map in every global prompt — and the **material chunked + embedded** (OpenAI `text-embedding-3-small`, pgvector) and searched per turn, vector + full text, ALWAYS inside that one user's rows, with a similarity floor so an off-library question finds nothing. `runGlobalTurn` (`src/lib/f2/global-chat.ts`) retrieves for the question first, then runs Claude with the map, the passages and a `search_material` tool; the typed chat uses it on Sonnet 5, global VOICE on the ElevenLabs engine uses the same function on Opus 5.5. On GPT-Live, global voice only gets the map (compact in the live prompt, full in the backend) — no passage search. Material writers schedule a re-index (`knowledge-hooks.ts`); opening the chat and a nightly cron (`/api/f2/knowledge/backfill`) catch up what they miss. Check: `npx tsx scripts/f2-global-chat-check.ts` (guests — and every guest sign-up texts Bart, so run it sparingly).

### Feynd iOS — voice-tutor archive

`apps/feynd/` was originally a voice-tutor app (OpenAI Realtime + Opus, "Frontier AI 2026" course). On 2026-05-23 it was repurposed as the F2 iOS client. The original is preserved two ways:
- Git tag `feynd-voice-archive-v1` (full pre-repurpose tree)
- Folder `apps/feynd-voice-archive/` (verbatim snapshot; see its `ARCHIVE.md`)

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
**Sonnet 5 `claude-sonnet-5`**, **Haiku 4.5 `claude-haiku-4-5`**. When a new
generation ships, move everything in one pass (code defaults, this file,
`.env.local`, Vercel env) — don't leave a tier split across generations.

- **Defaults live in code, not in env.** `.env.local` and Vercel should carry
  a `*_MODEL` override only to deviate on purpose; a pinned env var is how a
  stale model survives a migration. As of 2026-09-19 `.env.local` has none.
- **Dodo and Polly** go through a registry: `src/lib/f2/llm.ts` /
  `src/lib/polly/llm.ts` (`MODELS`, `DEFAULT_MODEL` = `sonnet-5`). Retired keys
  that old app builds or env vars still send (`sonnet-4-6`, `opus-4-8`,
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
- Not covered by the 2026-09-19 pass (retired one-offs, left as they were):
  `scripts/` Amber/noon/moltbook scripts, `apps/macplus/agent-*`,
  `apps/design-agent`. Move them if they come back to life.

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

