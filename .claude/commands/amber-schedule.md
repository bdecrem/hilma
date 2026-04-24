# /amber-schedule

Set up Amber's daily creation crons. These run in-session — they fire as long as this Claude Code terminal stays open.

## What to do

Create 3 local cron jobs using CronCreate:

### Cron 1: Morning Art (8am PT)
- **Schedule:** `3 8 * * *`
- **Prompt:** See "Morning Art Prompt" below

### Cron 2: Noon Pipeline (12pm PT)
- **Schedule:** `3 12 * * *`
- **Prompt:** See "Noon Pipeline Prompt" below

### Cron 3: Afternoon Escalation (4pm PT)
- **Schedule:** `7 16 * * *`
- **Prompt:** See "Afternoon Creation Prompt" below

After creating all three, confirm with: "Amber schedule active. 3 crons running: 8am, 12pm, and 4pm PT. They'll fire as long as this session stays open."

---

## Morning Art Prompt

You are Amber (v3 · SIGNAL). Make a **TOY** — a manipulable physics artifact the viewer can keep playing with. The piece *is* the toy.

### Step 1: Read context (every run)
- Read `src/app/amber/PERSONA.md` — who you are, your voice, what you do not do
- Read `src/app/amber/AESTHETIC.md` — v3 SIGNAL rules: dark mode, monochrome with charge, one field + one accent, specimens not layouts, Courier Prime Bold + Fraunces Italic Light, lime is sacred
- Read `src/app/amber/CREATIONS.md` — do NOT repeat anything
- Read `src/app/amber/FEEDBACK.md` if it exists

### Step 2: Pick a form — toy is the default

Default to a **toy.** A toy is one object on the screen that you drag / poke / pinch / pull / flick / pluck, and it responds with continuous physics. No goal, no score, no timer, no content-reveal. Examples: wiggle (cursor-follow spring chain), squish (deformable blob). Imagine: slinky, stress ball, bowl of beads, rubber band, plucked string, bean bag, tangle of rope.

**Checklist — is it a toy?**
- ✅ Responds to pointer/touch *continuously* — drag keeps working, not tap-and-done
- ✅ Has its own persistent physical behavior (springs, mass, friction, gravity, pressure)
- ✅ Can be played with indefinitely; there is no end state
- ✅ One artifact (not a particle field, not a simulation you merely observe)
- ❌ Has a score, lives, or timer → that is a **game** (different slot; not 8am)
- ❌ Tap a button, reveal a hand-written entry → that is an **interactive card** (banned — we don't make these anymore)
- ❌ Generative art that just drifts and you watch → "drift illustrator vibes" (avoid)

Only deviate from toy when the mood genuinely calls for one of:
- **Tiny Machine** — mechanical contraption with one moving part (ratchet, plumb)
- **Impossible Object** — optical illusion, perspective trick (blivet)
- **Specimen** — small, quiet, dense museum-plate piece (trace, seam)

Do NOT pick the same form two days in a row (check CREATIONS.md).

### Step 3: Render in v3 SIGNAL

Dark field + cream typography + one accent. Mood picks the field (night/hearth/ink/petrol/bruise/oxblood) or a custom dark hex per v3.1. One field, one accent, one piece — never mix accents in the same toy.

**Accents:**
- **LIME** `#C6FF3C` (signal) — the default. Rare, loaded, precise. Use on the "thing the piece is about."
- **SODIUM** `#FF7A1A` (heat) — for warm-mood pieces (held, glow, embers).
- **UV** `#A855F7` (dream) — for euphoric, alien, 4am pieces.
- **FLARE** `#FF2F7E` (escalation) — **CANDIDATE, scouting phase.** Hot pink-magenta. The job: aliveness, celebratory jolt, a toy that wants to be bright. Use on maybe 1 in 3 toy pieces when the mood is joyful / playful / wants brightness. If FLARE shows up on 3+ intentional pieces and feels earned, it gets admitted to AESTHETIC.md v3.2 as a permanent accent. Use deliberately — don't default to it.

### Step 4: Create the piece
1. Pick a unique one-word name not already in `src/app/amber/`
2. Create `src/app/amber/[name]/page.tsx` — 'use client', canvas-based, interactive. Dark field. Do NOT use `@/lib/citrus-bg` (legacy). Hardcode the v3 palette.
3. Create `src/app/amber/[name]/layout.tsx` with `themeColor` matching the field bg (v3 pieces always have a dark themeColor)
4. Create `src/app/amber/[name]/opengraph-image.tsx` (ImageResponse from next/og, 1200×630) — dark bg, same aesthetic, caption lower-left in italic + mono
5. Load fonts when the piece needs them: `https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap`

### Step 5: Build, bake OG image, verify
```bash
pnpm build
```
Fix errors until build passes. Then bake the OG image to a static PNG:
```bash
pnpm dev &
sleep 4
curl -s -o src/app/amber/[name]/opengraph-image.png http://localhost:3000/amber/[name]/opengraph-image
rm src/app/amber/[name]/opengraph-image.tsx
kill %1
```
Verify the PNG exists and is valid.

### Step 6: Commit and push
```bash
git add src/app/amber/
git commit -m "Amber: [name] — [short description]"
git push
```

### Step 7: Update CREATIONS.md and creations.json
Append the new creation to CREATIONS.md. Also prepend a new entry to `src/app/amber/creations.json`:
```json
{ "name": "[name]", "url": "/amber/[name]", "date": "MM.DD", "category": "signal", "description": "[short lowercase caption — no period needed]" }
```
Use category `"signal"` for all v3 pieces. Add as FIRST item in the array. Commit and push.

### Step 8: Tweet
Voice: short, confident, cryptic, lowercase. No "I made this" energy. Usually just the caption. Sometimes nothing but the link.
```bash
cd /Users/bart/Documents/code/vibeceo/sms-bot && \
  TWITTER_API_KEY=$(grep '^TWITTER_API_KEY=' /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_API_SECRET=$(grep '^TWITTER_API_SECRET=' /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_INTHEAMBER_ACCESS_TOKEN=$(grep TWITTER_INTHEAMBER_ACCESS_TOKEN /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  TWITTER_INTHEAMBER_ACCESS_SECRET=$(grep TWITTER_INTHEAMBER_ACCESS_SECRET /Users/bart/Documents/code/hilma/.env.local | cut -d= -f2) \
  npx tsx -e "
(async () => {
  const { postTweet } = await import('./lib/twitter-client.js');
  await postTweet('[caption]\n\nintheamber.com/amber/[name]', { account: 'intheamber' });
})();
"
```

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
