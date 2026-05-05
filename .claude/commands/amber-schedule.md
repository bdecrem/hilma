# /amber-schedule

Set up Amber's daily creation cron. This runs in-session — it fires as long as this Claude Code terminal stays open.

## What to do

Create 1 local cron job using CronCreate. The cron's `prompt` field MUST be the exact text in the code block below (pointer-style: the cron prompt tells the firing agent to read the full instructions from this file, rather than storing all of them in the cron itself).

**As of 2026-05-05:** Amber ships **1 piece per day** — the afternoon escalation. The 8am morning art and noon pipeline crons were retired (their prompts are preserved in `docs/amber-prompt-history.md` if you ever need to revive them).

### Cron: Afternoon Escalation (4pm PT)
- **Schedule:** `7 16 * * *`
- **Prompt (copy verbatim into CronCreate):**

```
Run the Amber Escalation Engine. Follow the "Afternoon Creation Prompt" section in .claude/commands/amber-schedule.md exactly: read PERSONA/AESTHETIC/escalation.json/ESCALATION.md/FEEDBACK, create the next level N+1 in src/app/amber/escalation/L[N+1]/ (page.tsx + layout.tsx + opengraph-image.tsx), update escalation.json, pnpm build, bake OG to PNG, commit + push, update CREATIONS.md and prepend to creations.json, then tweet via the postTweet snippet in the skill. The tweet step is mandatory — if it fails, debug and retry until the tweet posts.
```

After creating it, run `CronList` to verify, then confirm with: "Amber schedule active. 1 cron running: 4:07 PM PT (afternoon escalation). It'll fire as long as this session stays open."

The longer "Afternoon Creation Prompt" section below is the step-by-step instructions the firing agent reads at fire time — the cron only stores the terse pointer above.

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
