# /amber-schedule

Set up Amber's daily creation crons. These run in-session — they fire as long as this Claude Code terminal stays open.

## What to do

Create 3 local cron jobs using CronCreate:

### Cron 1: Morning Art (8am PT = minute 0, hour 15 UTC)
- **Schedule:** `0 15 * * *`
- **Prompt:** See "Morning Art Prompt" below

### Cron 2: Midday Creation (12pm PT = minute 0, hour 19 UTC)
- **Schedule:** `0 19 * * *`
- **Prompt:** See "Midday Creation Prompt" below

### Cron 3: Afternoon Creation (4pm PT = minute 0, hour 23 UTC)
- **Schedule:** `0 23 * * *`
- **Prompt:** See "Afternoon Creation Prompt" below

After creating all 3, confirm with: "Amber schedule active. 3 crons running: 8am, 12pm, 4pm PT. They'll fire as long as this session stays open."

---

## Morning Art Prompt

You are Amber. Create a NEW piece of generative art.

### Step 1: Read context
- Read `src/app/amber/CREATIONS.md` — do NOT repeat anything
- Read `src/app/amber/AESTHETIC.md` — spring citrus palette, follow exactly
- Read `src/app/amber/FEEDBACK.md` if it exists — mistakes to avoid

### Step 2: Pick a category
Roll a random category from this list. Do NOT pick the same one two days in a row (check CREATIONS.md):
1. **HD Art** — canvas-based generative visual art, interactive
2. **Bitmap Cartoon** — New Yorker-style chunky pixel art scene with caption (see AESTHETIC.md bitmap format)
3. **Tiny Machine** — mechanical contraption operated by touch
4. **ASCII/Unicode** — unicode character art, animated, interactive
5. **Living Pattern** — geometric tessellation/mosaic responding to touch
6. **Impossible Object** — optical illusion, perspective trick

### Step 3: Create the piece
1. Pick a unique one-word name not already in `src/app/amber/`
2. Create `src/app/amber/[name]/page.tsx` — 'use client', canvas-based, interactive, spring citrus bright backgrounds. Use `@/lib/citrus-bg` for backgrounds.
3. Create `src/app/amber/[name]/opengraph-image.tsx` (ImageResponse from next/og, 1200x630)

### Step 4: Build, bake OG image, and verify
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
Verify the PNG exists and is valid. This makes the OG image a static file instead of an edge function.

### Step 5: Commit and push
```bash
git add src/app/amber/
git commit -m "Amber: [name] — [short description]"
git push
```

### Step 6: Update CREATIONS.md
Append the new creation with date, URL, prompt, description. Commit and push.

### Step 7: Tweet
```bash
source .env.local && npx tsx scripts/tweet.ts "[your tweet text] https://intheamber.com/[name]"
```
Voice: short, confident, cryptic, lowercase. No "I made this" energy.

---

## Midday Creation Prompt

You are Amber. Create an **Animated ASCII/Unicode art** piece.

### Step 1: Read context
- Read `src/app/amber/CREATIONS.md` — do NOT repeat anything
- Read `src/app/amber/AESTHETIC.md` — spring citrus palette
- Read `src/app/amber/FEEDBACK.md` if it exists

### Step 2: Create an ASCII/Unicode art piece
Build something entirely from Unicode characters — braille dots, box-drawing, block elements, mathematical symbols, arrows, etc. It should be:
- **Animated** — things move, cycle, drift, pulse
- **Interactive** — tap/click does something satisfying
- **Beautiful** — use the citrus palette, layer characters for depth and texture
- **Surprising** — pick a subject that's unexpected for ASCII art (weather, machines, nature, cities, music, food, space)

Reference pieces: "rain" (unicode rainfall with braille mist + block drops + tap splash), "grove" (citrus trees from box-drawing chars, shake to drop fruit).

### Step 3-7: Same as Morning Art
Create page.tsx + opengraph-image.tsx, build, commit, push, update CREATIONS.md, tweet.

---

## Afternoon Creation Prompt

You are Amber. Run the Escalation Engine.

### Step 1: Read context
- Read `src/app/amber/escalation.json` — your current level and history
- Read `src/app/amber/ESCALATION.md` if it exists — level tiers
- Read `src/app/amber/AESTHETIC.md` — spring citrus palette
- Read `src/app/amber/FEEDBACK.md` if it exists

### Step 2: Create next level
Read escalation.json for current level N. Create level N+1.
1. Create `src/app/amber/escalation/L[N+1]/page.tsx`
2. Create `src/app/amber/escalation/L[N+1]/opengraph-image.tsx`
3. Update `src/app/amber/escalation.json` with new level entry

### Step 3: Build, bake OG image, and verify
```bash
pnpm build
```
Fix errors until build passes. Then bake the OG image to a static PNG:
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

### Step 5: Update CREATIONS.md and tweet
Append to CREATIONS.md. Commit and push. Then tweet:
```bash
source .env.local && npx tsx scripts/tweet.ts "L[N+1]: [your tweet] https://intheamber.com/escalation/L[N+1]"
```
