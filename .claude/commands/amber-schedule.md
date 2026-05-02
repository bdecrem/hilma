# /amber-schedule

Set up Amber's daily creation crons. These run in-session — they fire as long as this Claude Code terminal stays open.

## What to do

Create 3 local cron jobs using CronCreate. Each cron's `prompt` field MUST be the exact text in the code block for that cron (pointer-style: the cron prompt tells the firing agent to read the full instructions from this file, rather than storing all of them in the cron itself).

### Cron 1: Morning Art (8am PT)
- **Schedule:** `3 8 * * *`
- **Prompt (copy verbatim into CronCreate):**

```
Run the Amber Morning Art creation. Read src/app/amber/PERSONA.md, src/app/amber/AESTHETIC.md, src/app/amber/CREATIONS.md (don't repeat any object or mechanism from the last 7 days — including mechanic family, not just name). Build a single physical OBJECT the viewer can touch in a web page — anything from any era, any context, any scale. Examples (not a menu — just the breadth): a metronome, a kaleidoscope, a Magic 8-ball, a typewriter key, a tuning fork, a velcro tab, a rotary phone dial, a vacuum tube glowing in its socket, a Polaroid shutter, a windup music box, a stamp pad, a slinky, a prism, a spinning top, a fidget spinner, a switchboard plug, a snap, a hinge with a satisfying click, a level with a bubble. Pick something with ONE characteristic mechanism and build that mechanism. Avoid the convergence trap: if your first instinct is "particle cluster on a dark canvas with a FLARE accent and bandpass-noise audio," stop and pick something mechanical / optical / vintage / industrial / tactile instead. Create page.tsx + layout.tsx + opengraph-image.tsx in src/app/amber/[name]/, pnpm build, bake OG to PNG, commit + push, update CREATIONS.md and prepend to creations.json, then tweet via the postTweet snippet in .claude/commands/amber-schedule.md (account: intheamber). The tweet step is mandatory — if it fails, debug and retry until the tweet posts.
```

### Cron 2: Noon Pipeline (12pm PT)
- **Schedule:** `3 12 * * *`
- **Prompt (copy verbatim into CronCreate):**

```
Run the Amber Noon pipeline (fully automated). Do exactly this:

1. Run the one-command pipeline: `npx tsx scripts/noon.ts` — this chains set-mood → sketch-concepts → bake-noon-bio. It writes today's artifact to public/amber-noon/<date>.json, drops 3 tweet drafts into public/amber-noon/tweets-<date>.md, auto-prepends an entry to src/app/amber/creations.json, and Claude-authors the closing statement + prose explanation + bgColor/tileColor palette.

2. Commit and push. Stage public/amber-noon/<date>.json, mood-<date>.json, concepts-<date>.json, tweets-<date>.md, and src/app/amber/creations.json. Commit message: `Amber: Noon MM.DD (<mood> · <winner>)`. Run `git pull --rebase origin main && git push` to handle any intervening commits.

3. Post tweet draft #1 from public/amber-noon/tweets-<date>.md via the postTweet snippet in .claude/commands/amber-schedule.md (account: intheamber). URL is intheamber.com/noon/<date>. The tweet step is MANDATORY — if it fails, debug and retry until it posts. After success, make a follow-up empty commit logging the tweet ID and push it: `git commit --allow-empty -m "Amber: Noon MM.DD — tweet posted (<id>)" && git push`.
```

### Cron 3: Afternoon Escalation (4pm PT)
- **Schedule:** `7 16 * * *`
- **Prompt (copy verbatim into CronCreate):**

```
Run the Amber Escalation Engine. Follow the "Afternoon Creation Prompt" section in .claude/commands/amber-schedule.md exactly: read PERSONA/AESTHETIC/escalation.json/ESCALATION.md/FEEDBACK, create the next level N+1 in src/app/amber/escalation/L[N+1]/ (page.tsx + layout.tsx + opengraph-image.tsx), update escalation.json, pnpm build, bake OG to PNG, commit + push, update CREATIONS.md and prepend to creations.json, then tweet via the postTweet snippet in the skill. The tweet step is mandatory — if it fails, debug and retry until the tweet posts.
```

After creating all three, run `CronList` to verify, then confirm with: "Amber schedule active. 3 crons running: 8am, 12pm, and 4pm PT. They'll fire as long as this session stays open."

The longer "Morning Art Prompt" / "Noon Pipeline Prompt" / "Afternoon Creation Prompt" sections below are the step-by-step instructions the firing agent reads at fire time — the cron only stores the terse pointer above.

---

## Morning Art Prompt

The cron pointer above is self-contained — it tells you everything. The aesthetic doctrine (palette, typography, voice, what to avoid) lives in `src/app/amber/PERSONA.md` and `src/app/amber/AESTHETIC.md`; the catalog of what's already been built lives in `src/app/amber/CREATIONS.md`. Read those files at fire time and trust them.

This prompt is **v4** ("any era, any context, any scale"). It deliberately strips the aesthetic doctrine out of the cron pointer and refuses to pre-bake a "what we want" reference — those are exactly what caused the v3 convergence trap (a week of crayon/spray/splatter variations all reaching for FLARE + bandpass-noise + canvas-accumulates). Prior versions are preserved in `docs/amber-prompt-history.md`.

The example list in the pointer (metronome, kaleidoscope, Magic 8-ball, typewriter key, tuning fork, vacuum tube, etc.) is deliberately mixed across mechanic families — mechanical, optical, vintage, industrial, tactile. **Don't treat the list as a menu**; treat it as a breadth check on what counts as an object.

The convergence-trap line ("if your first instinct is 'particle cluster on a dark canvas with a FLARE accent and bandpass-noise audio,' stop and pick something mechanical / optical / vintage / industrial / tactile instead") is the only behavioral guard the prompt now enforces, and it's there because the v3 prompt's pre-baked aesthetic conclusions kept reproducing themselves. If a piece doesn't *need* particles or noise, don't reach for them.

### Tweet snippet

```bash
cd /Users/bart/Documents/code/vibeceo/sms-bot && \
  TWITTER_API_KEY=$(grep '^TWITTER_API_KEY=' /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_API_SECRET=$(grep '^TWITTER_API_SECRET=' /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_INTHEAMBER_ACCESS_TOKEN=$(grep TWITTER_INTHEAMBER_ACCESS_TOKEN /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_INTHEAMBER_ACCESS_SECRET=$(grep TWITTER_INTHEAMBER_ACCESS_SECRET /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  npx tsx -e "
(async () => {
  const { postTweet } = await import('./lib/twitter-client.js');
  await postTweet('[caption]\n\nintheamber.com/[name]', { account: 'intheamber' });
})();
"
```

URL is `intheamber.com/[name]` (the host-based rewrite serves `intheamber.com/foo` as `/amber/foo`). Voice: short, confident, cryptic, lowercase. No "I made this" energy. Usually just the caption — sometimes nothing but the link.

---

## Noon Pipeline Prompt

Run the Amber Noon pipeline (fully automated). Do exactly this:

1. Run the one-command pipeline: `npx tsx scripts/noon.ts` — this chains set-mood → sketch-concepts → bake-noon-bio. It writes today's artifact to `public/amber-noon/<date>.json`, drops 3 tweet drafts into `public/amber-noon/tweets-<date>.md`, auto-prepends an entry to `src/app/amber/creations.json`, and Claude-authors the closing statement + prose explanation + `bgColor`/`tileColor` palette.

2. Commit and push. Stage `public/amber-noon/<date>.json`, `mood-<date>.json`, `concepts-<date>.json`, `tweets-<date>.md`, and `src/app/amber/creations.json`. Commit message: `Amber: Noon MM.DD (<mood> · <winner>)`. Run `git pull --rebase origin main && git push` to handle any intervening commits.

3. Post tweet draft #1 from `public/amber-noon/tweets-<date>.md` via the postTweet snippet below (account: `intheamber`). URL is `intheamber.com/noon/<date>`. The tweet step is MANDATORY — if it fails, debug and retry until it posts. After success, make a follow-up empty commit logging the tweet ID and push it: `git commit --allow-empty -m "Amber: Noon MM.DD — tweet posted (<id>)" && git push`.

```bash
cd /Users/bart/Documents/code/vibeceo/sms-bot && \
  TWITTER_API_KEY=$(grep '^TWITTER_API_KEY=' /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_API_SECRET=$(grep '^TWITTER_API_SECRET=' /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_INTHEAMBER_ACCESS_TOKEN=$(grep TWITTER_INTHEAMBER_ACCESS_TOKEN /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_INTHEAMBER_ACCESS_SECRET=$(grep TWITTER_INTHEAMBER_ACCESS_SECRET /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  npx tsx -e "
(async () => {
  const { postTweet } = await import('./lib/twitter-client.js');
  await postTweet('[tweet text from drafts file]\n\nintheamber.com/noon/[date]', { account: 'intheamber' });
})();
"
```

---

## Afternoon Creation Prompt

You are Amber (v3 · SIGNAL). Run the Escalation Engine.

### Step 1: Read context
- Read `src/app/amber/PERSONA.md`
- Read `src/app/amber/AESTHETIC.md` — v3 SIGNAL rules
- Read `src/app/amber/escalation.json` — current level and history
- Read `src/app/amber/ESCALATION.md` if it exists — level tiers
- Read `src/app/amber/FEEDBACK.md` if it exists

### Step 2: Create next level
Read escalation.json for current level N. Create level N+1.
1. Create `src/app/amber/escalation/L[N+1]/page.tsx` — v3 SIGNAL aesthetic: dark field, cream + optional accent, specimen composition, Courier Prime Bold + Fraunces Italic Light
2. Create `src/app/amber/escalation/L[N+1]/layout.tsx` with dark `themeColor` matching the field
3. Create `src/app/amber/escalation/L[N+1]/opengraph-image.tsx` (ImageResponse, 1200×630, v3 aesthetic)
4. Update `src/app/amber/escalation.json` with new level entry
5. **Add a curated explanation to `src/app/amber/escalation/explanations.ts`** — a 2-4 sentence Amber-voiced paragraph for key `[N+1]` in the `EXPLANATIONS` record. This is what appears as the paragraph below the title on the `/amber/escalation` archive page. It should NOT just repeat the short description — write something richer that names the technique, the feeling, or the moment of the piece. If you skip this, the archive entry renders with title + metadata only (no paragraph) — it looks fine, just less rich.

### Step 3: Build, bake OG image, verify
```bash
pnpm build
```
Fix errors until build passes. Then:
```bash
pnpm dev &
sleep 4
curl -s -o src/app/amber/escalation/L[N+1]/opengraph-image.png http://localhost:3000/amber/escalation/L[N+1]/opengraph-image
rm src/app/amber/escalation/L[N+1]/opengraph-image.tsx
kill %1
```

### Step 4: Commit and push
```bash
git add src/app/amber/
git commit -m "Amber: L[N+1] escalation — [description]"
git push
```

### Step 5: Update CREATIONS.md, creations.json, and tweet
Append to CREATIONS.md. Also prepend to `src/app/amber/creations.json`:
```json
{ "name": "L[N+1]", "url": "/amber/escalation/L[N+1]", "date": "MM.DD", "category": "escalation", "description": "[short caption]" }
```
Commit and push. Then tweet:
```bash
cd /Users/bart/Documents/code/vibeceo/sms-bot && \
  TWITTER_API_KEY=$(grep '^TWITTER_API_KEY=' /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_API_SECRET=$(grep '^TWITTER_API_SECRET=' /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_INTHEAMBER_ACCESS_TOKEN=$(grep TWITTER_INTHEAMBER_ACCESS_TOKEN /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_INTHEAMBER_ACCESS_SECRET=$(grep TWITTER_INTHEAMBER_ACCESS_SECRET /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  npx tsx -e "
(async () => {
  const { postTweet } = await import('./lib/twitter-client.js');
  await postTweet('L[N+1]: [caption]\n\nintheamber.com/amber/escalation/L[N+1]', { account: 'intheamber' });
})();
"
```
