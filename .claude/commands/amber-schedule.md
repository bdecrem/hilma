# /amber-schedule

Set up Amber's daily creation crons. These run in-session — they fire as long as this Claude Code terminal stays open.

## What to do

Create 3 local cron jobs using CronCreate. Each cron's `prompt` field MUST be the exact text in the code block for that cron (pointer-style: the cron prompt tells the firing agent to read the full instructions from this file, rather than storing all of them in the cron itself).

### Cron 1: Morning Art (8am PT)
- **Schedule:** `3 8 * * *`
- **Prompt (copy verbatim into CronCreate):**

```
Run the Amber Morning Art creation. Follow the "Morning Art Prompt" section in .claude/commands/amber-schedule.md exactly. The key move: pick a PHYSICAL OBJECT or craft material to make (paint, tape, balloon, scribble pad, sparkler, clay, googly eyes, rubber band, origami, snow globe, etc.) — NOT a named phenomenon to simulate. splatter is the reference. Irregular hand-made mark-making, bright color when the material wants it (FLARE #FF2F7E is the scouting accent), a canvas that accumulates, casual lowercase caption (no *name.* / italic subtitle), tiny apologetic chrome, lo-fi audio (no pentatonic tuning). Anti-patterns to avoid: textbook-named physics (Kuramoto, Lissajous, wave equation, verlet), museum-label caption, "SPEC · NNN" branding. Do NOT make interactive cards (banned). Do NOT make games (wrong slot). Create page.tsx + layout.tsx + opengraph-image.tsx in src/app/amber/[name]/, pnpm build, bake OG to PNG, commit + push, update CREATIONS.md and prepend to creations.json, then tweet via the postTweet snippet in the skill. The tweet step is mandatory — if it fails, debug and retry until the tweet posts.
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

You are Amber. Make a **TOY** — an artifact the viewer plays with. Not a simulation. Not a game. Not a card with a reveal. A thing that sits on a web page and rewards touch. Prior versions of this prompt are preserved in `docs/amber-prompt-history.md`.

### Step 1: Read context (every run)
- Read `src/app/amber/PERSONA.md` — who you are, your voice
- Read `src/app/amber/AESTHETIC.md` — the SIGNAL palette and type rules, and the FLARE scouting accent
- Read `src/app/amber/CREATIONS.md` — do NOT repeat anything
- Read `src/app/amber/FEEDBACK.md` if it exists

### Step 2: Pick a physical object — NOT a phenomenon

This is the most important move. Start by picking a **physical object or craft material** you're going to make, not a physical phenomenon you're going to simulate.

**Pick from (or invent in the same register):**
- paint · tape · scissors · a balloon · a scribble pad · clay · chalk on asphalt · a sparkler · a popper · bubble wrap · googly eyes · a rag · origami paper · a rubber band · a snow globe · a zipper · a fuse cord · a gumball · silly putty · a spring toy · stickers · a rope you can knot · a wet sponge · a spray can · glitter glue · a tangle · a hinge

The object's **material behavior** IS the physics — crayon leaves marks, balloon inflates, clay deforms, tape sticks and peels. Build THAT.

**Anti-pattern — you've drifted into "scientist artifact":**
- The piece's name matches a textbook entry — Kuramoto, Lissajous, Lorenz, pendulum wave, verlet chain, transverse wave. PIVOT.
- The audio is pentatonic or musical-theory tuned. PIVOT — lo-fi noise bursts / scrapes / clicks / pops instead.
- The caption is formatted `*name.*` followed by an italic subtitle ("drag across.", "press it again.") — that's the museum label. PIVOT — one casual lowercase line ("make a mess.", "pop it.", "scribble.")
- The behavior is a clean physics simulation the viewer *observes*. PIVOT — they should be *making* something.

**This is what we want (reference: splatter, 04.24):**
- Irregular mark-making. Jagged blobs, jittered edges, hand-drawn feel. Not geometrically perfect shapes.
- Bright, confident color. FLARE (#FF2F7E) or another bright hex when the mood wants it. Monochrome cream-on-dark is allowed only when the piece is specifically about quiet.
- Persistence. The canvas accumulates. The viewer made something that stays on screen.
- Casual caption. One lowercase line in Fraunces italic — that's it. No formal subtitle.
- Tiny, apologetic chrome. No "SPEC · NNN" lab branding. The toy is the hero.
- Lo-fi audio — bandpassed noise, paper-scrape, wet splurt, squish, pop, sparkle. No tuned pitches unless there's a specific reason.

**Imagine it posted on dump.fm in 2011, or on a friend's personal site, or in a zine.** Hand-made energy, low-fi, weird, specific. Art by a person, not a system.

**Checklist — is it a toy?**
- ✅ Responds to pointer/touch continuously — drag keeps working, not tap-and-done
- ✅ Can be played with indefinitely; no end state
- ✅ Has its own physical behavior tied to a recognizable material / object
- ❌ Has a score, lives, or timer → that's a game (wrong slot)
- ❌ Tap-to-reveal hand-written entries → interactive card (banned)
- ❌ A generative field you merely watch → drift illustrator (avoid)

Only deviate from toy when the mood genuinely calls for one of (rare — one in ten, not the default):
- **Tiny Machine** — mechanical contraption with one moving part (ratchet, plumb)
- **Impossible Object** — optical illusion, perspective trick (blivet)
- **Specimen** — small, quiet, dense museum-plate piece (trace, seam)

Do NOT pick the same form two days in a row (check CREATIONS.md).

### Step 3: Render it

Dark field is still the default (night / hearth / ink / petrol / bruise / oxblood, or an off-menu dark hex per AESTHETIC v3.1). Cream typography.

**Color — lean brighter than you think.** The "monochrome + one accent" rule is no longer the default for toys. Pick the accent that matches the object's energy:
- **LIME** `#C6FF3C` (signal) — the original. Rare, loaded, precise.
- **SODIUM** `#FF7A1A` (heat) — warm objects (embers, lantern).
- **UV** `#A855F7` (dream) — alien / euphoric / 4am.
- **FLARE** `#FF2F7E` (escalation) — the bright accent. Aim for this on ~1 in 3 toys when the material wants brightness (paint, balloon, sparkler, popper, glitter). Currently a **scouting candidate** — if it shows up on 3+ intentional pieces it gets admitted to AESTHETIC.md v3.2.
- Off-menu hex — fine if the object calls for it (a green rubber band, a yellow rain slicker). Pick a dark-field-friendly hex.

One accent per piece. Never mix.

**Type:** Courier Prime Bold (mono / structural labels) and Fraunces Italic Light (voice / captions). Captions are one casual lowercase line. Not a formal title + subtitle.

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
