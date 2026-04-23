# Hilma

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

Hilma hosts 6 apps. Two are standalone in `apps/`, three are Next.js routes on Vercel, and Tunn3l has its own repo.

| App | Path | Deploy | What it is |
|-----|------|--------|------------|
| **Tunn3l** | `../tunn3l/` (own repo: `bdecrem/tunn3l`) | DigitalOcean droplet (tunn3l.sh) | Tunnel service — moved to standalone repo |
| **Collab** | `apps/collab/` | — | Collaboration plugin |
| **MCP Dashboard** | `apps/mcp-dashboard/` + `src/app/apps/mcp-dashboard/` | Vercel | MCP server dashboard |
| **Decremental** | `src/app/projects/` | Vercel (decremental.com) | Projects page |
| **Writer** | `src/app/writer/` | Vercel | Writing tool |
| **Amber** | `src/app/amber/` | Vercel | Generative art + daily creations (~25 pieces) |

## Project structure — where things go

**Do NOT create files at the repo root.** Everything has a home:

| Folder | What goes here | Examples |
|--------|---------------|---------|
| `src/app/` | Next.js pages and routes (React, server-rendered) | `/amber/`, `/projects/`, `/writer/`, `/art-agent/` |
| `src/components/` | Shared React components | UI primitives used across pages |
| `src/lib/` | Shared utilities and helpers | `citrus-bg.ts` |
| `apps/` | Standalone apps with their own runtime (not Next.js) | `tunnel/`, `collab/`, `design-agent/` |
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

Amber ships **3 creations per day** from @intheamber: morning art (8am PT), noon pipeline (noon PT), and afternoon escalation (4pm PT).

### How the daily posts actually run — READ THIS BEFORE TOUCHING SCHEDULING

**The daily posts run LOCALLY via `CronCreate` — session-only cron in the active Claude Code REPL on this machine.** They fire in this session, run against this working directory, and tweet using the real `.env.local` credentials. When the REPL exits (terminal closed, reboot, crash), they die and must be re-created.

**The previous `RemoteTrigger` (cloud CCR) setup was abandoned** because the remote agent sometimes ran out of turns before completing Step 11 (tweet), shipping the art without the tweet. All prior remote triggers (`amber-8am-hd-art`, `amber-10am-escalation`, `amber-test-*`, `amber-debug-test`) have been **disabled** at https://claude.ai/code/scheduled. Do not re-enable them.

**The production session crons** (as of 2026-04-23, v4 — three daily):
| cron | time (PT) | what it fires |
|------|-----------|---------------|
| `3 8 * * *`  | 8:03 AM  | Morning Art — new `src/app/amber/[name]/` piece + tweet |
| `3 12 * * *` | 12:03 PM | Noon pipeline — `scripts/noon.ts` (set-mood → sketch-concepts → bake-noon-bio) + commit/push + tweet draft #1 |
| `7 16 * * *` | 4:07 PM  | Afternoon Escalation — next `src/app/amber/escalation/L[N+1]/` + tweet |

Each fires in this session. I (the running Claude) execute the prompt directly: read persona/aesthetic files, build the piece, `pnpm build`, commit + push, update CREATIONS.md + creations.json, then tweet via the postTweet snippet in `.claude/commands/amber-schedule.md`. The tweet step is mandatory — if it fails, debug and retry.

### Managing the session crons

- `CronList` — see scheduled jobs and IDs
- `CronDelete <id>` — cancel one
- `CronCreate` — re-create (prompt text below)

**Caveats — read these:**
- **7-day auto-expiry.** Recurring session crons fire one last time on day 7 and self-delete. Re-create weekly.
- **REPL must be alive and idle.** Closed terminal, reboot, or `/clear` kills them. If I'm mid-task at 8:03, the job waits until I'm idle.
- **Only fires in the session that created it.** A new `claude` session has no knowledge of crons created in a previous one.

### When you start a new Claude Code session — re-create the 3 crons

At session start, call `CronList`. If any of the three jobs are missing, re-create them with exactly these prompts (copy/paste — the prompt text is the contract, don't paraphrase):

**1. Morning Art — `3 8 * * *`:**
```
Run the Amber Morning Art creation. Follow the "Morning Art Prompt" section in .claude/commands/amber-schedule.md exactly: read PERSONA/AESTHETIC/CREATIONS/FEEDBACK, pick a non-repeated category, create page.tsx + layout.tsx + opengraph-image.tsx in src/app/amber/[name]/, pnpm build, bake OG to PNG, commit + push, update CREATIONS.md and prepend to creations.json, then tweet via the postTweet snippet in the skill. The tweet step is mandatory — if it fails, debug and retry until the tweet posts.
```

**2. Noon pipeline — `3 12 * * *`:**
```
Run the Amber Noon pipeline (fully automated). Do exactly this:

1. Run the one-command pipeline: `npx tsx scripts/noon.ts` — this chains set-mood → sketch-concepts → bake-noon-bio. It writes today's artifact to public/amber-noon/<date>.json, drops 3 tweet drafts into public/amber-noon/tweets-<date>.md, auto-prepends an entry to src/app/amber/creations.json, and Claude-authors the closing statement + prose explanation + bgColor/tileColor palette.

2. Commit and push. Stage public/amber-noon/<date>.json, mood-<date>.json, concepts-<date>.json, tweets-<date>.md, and src/app/amber/creations.json. Commit message: `Amber: Noon MM.DD (<mood> · <winner>)`. Run `git pull --rebase origin main && git push` to handle any intervening commits.

3. Post tweet draft #1 from public/amber-noon/tweets-<date>.md via the postTweet snippet in .claude/commands/amber-schedule.md (account: intheamber). URL is intheamber.com/noon/<date>. The tweet step is MANDATORY — if it fails, debug and retry until it posts. After success, make a follow-up empty commit logging the tweet ID and push it: `git commit --allow-empty -m "Amber: Noon MM.DD — tweet posted (<id>)" && git push`.
```

**3. Afternoon Escalation — `7 16 * * *`:**
```
Run the Amber Escalation Engine. Follow the "Afternoon Creation Prompt" section in .claude/commands/amber-schedule.md exactly: read PERSONA/AESTHETIC/escalation.json/ESCALATION.md/FEEDBACK, create the next level N+1 in src/app/amber/escalation/L[N+1]/ (page.tsx + layout.tsx + opengraph-image.tsx), update escalation.json, pnpm build, bake OG to PNG, commit + push, update CREATIONS.md and prepend to creations.json, then tweet via the postTweet snippet in the skill. The tweet step is mandatory — if it fails, debug and retry until the tweet posts.
```

Without this re-creation step at session start, nothing will post. The cron content matches `.claude/commands/amber-schedule.md` — keep both files in sync.

### When you update the persona or aesthetic — update the cron prompts

The files I read at fire time (`src/app/amber/PERSONA.md`, `src/app/amber/AESTHETIC.md`, `src/app/amber/CREATIONS.md`, etc.) are read from disk live, so content changes pick up automatically. But the cron prompt's own descriptors (palette names, aesthetic keywords) do NOT — when the aesthetic shifts meaningfully, delete and re-create the crons with updated prompts, and update `.claude/commands/amber-schedule.md` AND this file's prompt blocks above to match.

### Other creation rules

- **All Amber creation URLs use `intheamber.com`** — in tweets, CREATIONS.md, creations.json, and anywhere else. The domain routes to `/amber/` via host-based rewrites, so `intheamber.com/kaleid` serves `/amber/kaleid`. Never use `hilma-nine.vercel.app/amber/` in public-facing links.
- **Test canvas creations on iPhone.** Cap devicePixelRatio at 2 (`Math.min(window.devicePixelRatio || 1, 2)`) — DPR 3 canvases can be too large and cause performance issues or crashes on mobile.
- **Dark-background creations need their own themeColor.** If a creation uses a dark background (not the default peach), create a `layout.tsx` in the creation's folder that exports `viewport: { themeColor: '[bg color]' }`. Otherwise the Safari URL bar stays peach on a dark page.
- **Build passes ≠ piece works.** Before committing any Amber creation, open it in a browser (or use Playwright MCP) and verify the concept is visually evident. If the piece depends on a transition or threshold, check that the "moment" is dramatic enough to be noticed. Iterate before pushing. This rule has been broken repeatedly — stop breaking it.

## Sister repo: vibeceo8 (`../vibeceo8/`)

Hilma's big sibling. A monorepo that grew like a vine — 6+ months of experiments, tools, agents, and products. Hilma can reach into vibeceo8 to use its tools and reference its code. Read `../vibeceo8/PLATFORM-OVERVIEW.md` for the full map.

### Key projects in vibeceo8

| Project | Path | What it is |
|---------|------|------------|
| **Jambot** | `jambot/` | AI music production engine — synths (JB01, JB202, JT90, JT30, JT10), drum machines, renders WAV. Used by `/hallman` skill. Has `library.json` with genre/artist knowledge. |
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

## Sister repo: docsrepo (`../docsrepo/`)

Our knowledge base. Reference for documentation, notes, and institutional knowledge.

