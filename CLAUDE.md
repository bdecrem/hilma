# Hilma

## Do the work yourself — no lazy shortcuts

When a step is doable with the tools available, do it — don't punt it to Bart and don't offer to do it instead of just doing it.

- **Verification is my job, not Bart's.** "Verify behavior" means I drive it. I have a browser (Playwright + Chrome MCP), a shell, DB access, and the iOS simulator. If checking the fix means loading a page, logging in, querying the database, or launching the app, I do that myself and report what I observed. Asking Bart to "load the page and tell me what you see" or "let me know if it works" is the lazy punt to avoid.
- **Don't stop at "it compiles."** A passing `pnpm build` / `xcodebuild` is necessary, not sufficient. Exercise the actual feature before saying it's done (see the F2 "spec first, then verify behavior" gates below).
- **Don't offer when you can act.** Replace "want me to verify?" / "you could check X" with the verified result. The only things worth asking before doing are genuinely gated actions (push to prod, destructive ops, sending messages, mutating Bart's real data) — those still need an explicit go-ahead.
- **If a step is truly blocked, say so plainly** — name the blocker (no credentials, endpoint down, tool not connected) instead of quietly handing the work back.

State all of this plainly; this is a standing expectation, not a one-off.

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
| **Decremental** | `src/app/projects/` | Vercel (decremental.com) | Projects page |
| **Writer** | `src/app/writer/` | Vercel | Writing tool |
| **Amber** | `src/app/amber/` | Vercel | Generative art + daily creations (~25 pieces) |
| **F2 (web)** | `src/app/f2/` | Vercel (feynd.cc) | Learning app — chat + topics + paste, user-scoped |
| **F2 (iOS)** | `apps/feynd/` | Xcode (manual TestFlight) | Native iPhone client for F2, talks to the same `/api/f2/*` backend |
| **Loci (iOS)** | `apps/loci/` | Xcode (XcodeGen, same workflow as Feynd) | v3 learning app — spaced-repetition memory layer (`/api/f3/*`, `src/lib/f3/`) on F2 accounts/topics: idea cards, conversational recall grading, primer questions. Includes voice mode (Peri engine via `/api/f4/walk`): global voice walk from Today, per-topic voice from any row, transcripts merge back into topic chat |
| **Peri (iOS)** | `apps/peri/` | Xcode (XcodeGen, same workflow as Feynd) | Voice-only walking tutor — OpenAI Realtime over WebRTC (`/api/f4/walk/*`, `src/lib/f4/`). Peri speaks first, quizzes the Loci card deck conversationally, records reviews via server-authed tools. Harness: `scripts/test-walk-realtime.mjs` |
| **MacPlus** | `apps/macplus/` | Retro68 → BlueSCSI SD card (manual) | Native classic-Mac (System 6, 68000) apps for Bart's real Macintosh Plus. See `apps/macplus/CLAUDE.md` |

### Building an F2 feature — spec first, then verify behavior

F2 features have repeatedly shipped across a string of patch commits because the design was wrong from the start, or because "the build passed" was mistaken for "the feature works." `pnpm build` and `xcodebuild` only prove the code compiles — they say nothing about whether the feature behaves correctly. Two gates close that gap. Both apply to any change that touches a user-facing flow (chat routing, quizzes, stars, topics, auth, voice).

**Gate 1 — spec the behavior before writing code.** Write a short bullet list (4-8 lines) describing exactly what the user will experience step by step, and confirm it with Bart before editing. This is cheap and catches the most expensive class of bug: building the wrong thing correctly. The reflection-quiz rebuild (one question, one reply, one star) only got un-stuck once the behavior was written down first.

**Gate 2 — drive the real flow before declaring done.** Compilation is necessary, not sufficient. Exercise the actual feature end to end:
- **Web:** run it through the browser against local or feynd.cc (Playwright MCP is fine) — log in, perform the flow, confirm the observable result and that nothing regressed.
- **iOS:** the simulator launch + screenshot loop already documented below (boot, install, launch, `simctl io screenshot`), driving the actual screen the change affects.
- **Backend state machines** (quiz/star transitions in `src/lib/f2/`) are largely pure code — the LLM only generates text, the state changes are deterministic. Prefer a focused test (mock Supabase + Anthropic) asserting the transitions over a manual click-through; it catches regressions every run.

If you genuinely can't drive the flow (no test account, endpoint down), say so plainly rather than reporting success.

### Feynd iOS — where the code lives

**Native iPhone client for F2 lives in `apps/feynd/`.** SwiftUI + XcodeGen (`project.yml` is the source of truth, `.xcodeproj` is generated). Bundle ID `com.bartdecrem.Feynd`, Team ID `274T5WCVD2`, deployment target iOS 17.

Key files (`apps/feynd/Feynd/`):
- `FeyndApp.swift` — `@main` entry. Owns the `Session` and routes to `LoginView` vs `MainTabsView`.
- `MainTabsView.swift` — the three tabs: Chat / Topics / Paste.
- `ChatView.swift`, `TopicsView.swift`, `TopicDetailView.swift`, `PasteView.swift`, `LoginView.swift` — one screen per file.
- `F2API.swift` — HTTP client. Uses `URLSession` + `HTTPCookieStorage.shared` so the `f2_session` cookie persists across launches.
- `Session.swift` — `@Observable` auth state (loading / signedOut / signedIn).
- `Models.swift` — `F2User`, `F2Topic`, `F2Message`, `F2Thread`.
- `Secrets.swift` (gitignored, see `Secrets.swift.example`) — backend URL (defaults to `https://feynd.cc`).
- `Assets.xcassets/AppIcon.appiconset/` — app icon (same set since the original voice app).

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

### Feynd voice (Realtime)

Voice mode runs through OpenAI Realtime. Code lives in `src/lib/f2/realtime.ts`, `src/app/api/f2/realtime/**`, `apps/feynd/Feynd/RealtimeVoiceClient.swift`, `apps/feynd/Feynd/VoiceSessionView.swift`, and `apps/f2/schema/007_f2_voice_sessions.sql`. Two reference docs:

- [`docs/f2-realtime-api-reference.md`](docs/f2-realtime-api-reference.md) — the API surface this repo uses (OpenAI endpoints, event names, F2 wrapper, iOS event flow), plus a list of official OpenAI docs to recheck since the Realtime schema has shifted.
- [`docs/f2-realtime-voice-proposal.md`](docs/f2-realtime-voice-proposal.md) — strategy doc with architectural rationale (WebRTC vs WebSocket, client-mediated vs sideband tools, retrieval, phasing). Note: shipped code is Phase 1 with WebSocket; the WebRTC recommendation is a future step.

Voice is reachable from the Voice button in `TopicDetailView`. The backend mints an ephemeral OpenAI client secret per session and stores transcripts in `f2_voice_sessions`. Tool calls derive `user_id` from the session cookie, never from model args.

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

**NEVER push without Bart explicitly asking.** Pushing triggers a live Vercel deploy — that's a production action, not a routine one. Commit when asked to commit; push ONLY when asked to push. "Commit and push" is two actions; "commit" is one. If Bart says "commit," commit and stop. If Bart says "push," then push. Treat every push as needing its own explicit go-ahead, even if you just finished committing on his request.

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
- `TOGETHER_API_KEY` — Together.ai API for model fine-tuning and inference
- `TWITTER_*` — Twitter API credentials
- `DISCORD_*` — Discord bot credentials
- `SENDGRID_API_KEY` — SendGrid email API

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

## Amber Daily Creations

Amber ships **1 creation per day** from @intheamber: the afternoon escalation (4pm PT). The morning art (8am) and noon pipeline (12pm) crons were retired on 2026-05-05 — their prompts are preserved in `docs/amber-prompt-history.md` if you ever need to revive either.

### How the daily post actually runs — READ THIS BEFORE TOUCHING SCHEDULING

**The daily post runs LOCALLY via `CronCreate` — session-only cron in the active Claude Code REPL on this machine.** It fires in this session, runs against this working directory, and tweets using the real `.env.local` credentials. When the REPL exits (terminal closed, reboot, crash), it dies and must be re-created.

**The previous `RemoteTrigger` (cloud CCR) setup was abandoned** because the remote agent sometimes ran out of turns before completing Step 11 (tweet), shipping the art without the tweet. All prior remote triggers (`amber-8am-hd-art`, `amber-10am-escalation`, `amber-test-*`, `amber-debug-test`) have been **disabled** at https://claude.ai/code/scheduled. Do not re-enable them.

**The production session cron** (as of 2026-05-05 — single daily):
| cron | time (PT) | what it fires |
|------|-----------|---------------|
| `7 16 * * *` | 4:07 PM  | Afternoon Escalation — next `src/app/amber/escalation/L[N+1]/` + tweet |

It fires in this session. I (the running Claude) execute the prompt directly: read persona/aesthetic files, build the piece, `pnpm build`, commit + push, update CREATIONS.md + creations.json, then tweet via the postTweet snippet in `.claude/commands/amber-schedule.md`. The tweet step is mandatory — if it fails, debug and retry.

### Managing the session cron

- `CronList` — see scheduled jobs and IDs
- `CronDelete <id>` — cancel one
- `CronCreate` — re-create (prompt text below)

**Caveats — read these:**
- **7-day auto-expiry.** Recurring session crons fire one last time on day 7 and self-delete. Re-create weekly.
- **REPL must be alive and idle.** Closed terminal, reboot, or `/clear` kills it. If I'm mid-task at 4:07, the job waits until I'm idle.
- **Only fires in the session that created it.** A new `claude` session has no knowledge of crons created in a previous one.

### When you start a new Claude Code session — re-create the cron

**Easy path:** run the `/amber-schedule` skill. It creates the cron with the exact prompt text embedded in `.claude/commands/amber-schedule.md`. Verify with `CronList` afterward — you should see one job at 4:07 PM PT.

**Manual path (fallback):** at session start, call `CronList`. If the job is missing, re-create it manually with exactly this prompt (copy/paste — the prompt text is the contract, don't paraphrase):

**Afternoon Escalation — `7 16 * * *`:**
```
Run the Amber Escalation Engine. Follow the "Afternoon Creation Prompt" section in .claude/commands/amber-schedule.md exactly: read PERSONA/AESTHETIC/escalation.json/ESCALATION.md/FEEDBACK, create the next level N+1 in src/app/amber/escalation/L[N+1]/ (page.tsx + layout.tsx + opengraph-image.tsx), update escalation.json, pnpm build, bake OG to PNG, commit + push, update CREATIONS.md and prepend to creations.json, then tweet via the postTweet snippet in the skill. The tweet step is mandatory — if it fails, debug and retry until the tweet posts.
```

Without this re-creation step at session start, nothing will post. The cron content matches `.claude/commands/amber-schedule.md` — keep both files in sync.

### When you update the persona or aesthetic — update the cron prompt

The files I read at fire time (`src/app/amber/PERSONA.md`, `src/app/amber/AESTHETIC.md`, `src/app/amber/CREATIONS.md`, etc.) are read from disk live, so content changes pick up automatically. But the cron prompt's own descriptors (palette names, aesthetic keywords) do NOT — when the aesthetic shifts meaningfully, delete and re-create the cron with an updated prompt, and update `.claude/commands/amber-schedule.md` AND this file's prompt block above to match.

### When you tweak a cron prompt — sync all four surfaces in the same commit

Whenever you change a live cron's prompt (via `CronDelete` + `CronCreate`, or by adjusting a pointer/instruction), you MUST in the same turn also update every place that prompt is canonicalized, so a session starting tomorrow sees identical text in all four surfaces. The four surfaces are:

1. **The live cron** (via `CronDelete` + `CronCreate`)
2. **`.claude/commands/amber-schedule.md`** — both the `### Cron` pointer block AND the long "Afternoon Creation Prompt" section if its content changed
3. **`CLAUDE.md`** — the prompt block under "When you start a new Claude Code session — re-create the cron"
4. **`docs/amber-prompt-history.md`** — if you materially replaced a long prompt section (not just a typo), preserve the prior version there BEFORE overwriting, with the date it was retired and the reason

All four land in one commit. Never ship a change that only updates the live cron but leaves the skill or CLAUDE.md stale — tomorrow's session won't know.

### Other creation rules

- **When Bart asks you to "commit and push" an Amber creation, ask before registering or tweeting.** Bart commissions Amber pieces mid-conversation (wiggle, squish, splatter). When he says "commit and push," by default that means only the piece itself (`src/app/amber/[name]/` files). Two follow-on actions are NOT implied and must be asked about explicitly per piece:
  1. **Add to the intheamber.com index** — prepending to `src/app/amber/creations.json` and appending to `src/app/amber/CREATIONS.md`. This is what makes the piece appear on the `/amber` index page.
  2. **Tweet it** — via the postTweet snippet in `.claude/commands/amber-schedule.md`, account `intheamber`.
  
  After the first commit lands, ask: *"also register on intheamber.com / also tweet?"* and wait for a yes/no per action. This applies ONLY to commissions; the scheduled-cron flows (8am / noon / 4pm) already include registration + tweet as part of their prompts and should run without asking.
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

