# Amber's Noon — Pipeline

One artifact a day at noon. The weather + the world's headlines (or Reddit's hot feed) get filtered through Amber's hypersensitive artist persona, which produces a mood, a first-person reaction, and sensory keywords. Amber then sketches each keyword as a **52×20 silhouette**. A headless **bio-engine** (Langevin Ising physics) runs multiple attempts against those sketches — most fail, one lands — and that session is frozen into the day's artifact. The page replays the session live with the real physics, crystallizes the winner, then fades in Amber's paragraph.

## Grid

**52 columns × 20 rows.** Upgraded from the original 26×10. All new pieces use 52×20; archive pieces at 26×10 still render via the legacy emergent renderer.

## The three-step daily bake

Each day runs three scripts in order. Each writes a JSON file under `public/amber-noon/`; the next script reads the previous one's output.

```
scripts/set-mood.ts          →  mood-YYYY-MM-DD.json
scripts/sketch-concepts.ts   →  concepts-YYYY-MM-DD.json
scripts/bake-noon-bio.ts     →  YYYY-MM-DD.json   ← what the page loads
```

### 1. `scripts/set-mood.ts`

Reads nothing, writes `public/amber-noon/mood-YYYY-MM-DD.json`.

- Pulls **Palo Alto weather** from Open-Meteo (no key needed). Prefers the `current` weather code over the `daily` dominant code — a sunny afternoon reads as "clear sky" even if the day also had morning fog.
- Two substrates, one picked by a date-seeded coin flip (so the pipeline alternates ~50/50 across days):
  - `news` → Claude Sonnet with `web_search` tool pulls 4–6 global headlines from the last 24h.
  - `reddit` → direct pull of 25 hot posts from r/all; Amber picks 1–3 that snag her.
- One call to Claude with the Amber persona (hypersensitive, full emotional range, first-person, notices small things). Returns:
  - `mood` — `name`, `reason` (~10 words), `palette` (one of `night/hearth/ink/petrol/bruise/oxblood`), `accent` (one of `lime/sodium/uv`), plus optional `bgColor` / `tileColor` hex overrides.
  - `reaction` — 2–4 first-person sentences. Becomes the on-screen paragraph.
  - `keywords` — exactly 8 **drawable** sensory images (clear silhouettes, not abstract feelings).

Run:
```bash
npx tsx scripts/set-mood.ts                    # today, source auto-picked from date
npx tsx scripts/set-mood.ts reddit             # force reddit
npx tsx scripts/set-mood.ts 2026-04-17 news    # specific date + source
```

Env overrides:
- `MOOD_WEATHER_OVERRIDE="73|clear sky"` — bypass Open-Meteo with a fixed temp + condition.

### 2. `scripts/sketch-concepts.ts`

Reads `mood-YYYY-MM-DD.json`, writes `concepts-YYYY-MM-DD.json`.

- One call to Claude in the Amber persona, carrying today's mood + reason for context.
- Asks Amber to sketch each of the 8 keywords as a **52×20 ASCII silhouette** (`#` = filled, `.` = empty).
- Prompt includes a worked example ("frantic light" — asymmetric, gestural, heavy negative space) as the target register.
- Tolerant parser: accepts any line ≥ 70% width that isn't prose; non-`#` chars become `.`. This lets Opus slip an occasional `~` or `V` without breaking the bake.
- Returns a JSON array of `{ name, blurb, ascii }` → each ASCII block is parsed into a `number[][]` grid (20 × 52).

Env overrides:
- `SKETCH_MODEL=claude-opus-4-7` — swap the default Sonnet for Opus. Opus gives more varied compositions (letters on the sign, a dragon mid-curve) where Sonnet converges on safe silhouettes.

Run: `npx tsx scripts/sketch-concepts.ts [YYYY-MM-DD]`.

### 3. `scripts/bake-noon-bio.ts` — the new bio-engine baker

Reads mood + concepts files, writes `YYYY-MM-DD.json`.

This is the **current** baker. It runs the same Ising physics the experiment page uses, headlessly, and captures one honest session:

- **Params (G3, from `bio-engine-tune.ts`):** 4-neighbor coupling `J=0.4`, anneal temperature cools `T=2.0 → 0.03` over 12s, crystallization phase `T=0.005` for 3s. Landing threshold: crispness ≥ 0.80.
- **Per-concept tuning:** `inferTuning(grid)` picks radius + bias from cell count. Chunky shapes (> 120 cells) use narrow affinity + low bias (land rarely); thinner shapes get wider affinity + stronger bias (to survive neighbor coupling).
- **Session:** up to 10 attempts, pick a concept at random (no two in a row), run the full anneal, measure crispness. Break on first landing. If no session lands across 3 retries, keep the best-we-got. Target: mean ~3.5 attempts per session.
- **Output:** writes each attempt's target grid, the final spin field, the final thresholded grid (0/1), crispness scores, landed flag. `winner` = last attempt. Sets `meta.engine = 'bio-engine/G3'` and `meta.landed`.

Closing statement is currently a simple template; days with tight semantic coupling to the winner get a hand-written closing.

Run: `npx tsx scripts/bake-noon-bio.ts [YYYY-MM-DD]`.

### 3-legacy: `scripts/bake-noon.ts`

The old deterministic-attempts baker (no physics — predetermined success pattern, `planAttempts` from `generator.ts`). Still present for regenerating 26×10 archive pieces. New pieces should use `bake-noon-bio.ts`.

## The curation pass — 2026-04-20 lesson

`sketch-concepts.ts` produces legible icons but not *great* images. The bake pipeline runs fine on auto-sketches, but when we want the day's piece to actually land visually, insert a human-in-the-loop curation step between `sketch-concepts` and `bake-noon-bio`.

**What failed (automated):** Even with tuned prompts (single object, canvas-filling, specific detail), Opus-generated sketches top out at "bathroom-sign icon." The medium is 1-bit pixel cells — the model can't do stroke weight, gradient, or line quality. It produces competent silhouettes, not composition.

**What worked — the flow, in order:**
1. **Run set-mood and sketch-concepts as normal** — even though the auto-sketches won't ship, the `mood.reaction` and `keywords` are how we understand what today is about. Read the reaction aloud. Read the 8 keywords. Notice the themes — the two or three stories Amber actually picked.
2. **Summarize the stories.** Say back to the user what Amber is reacting to — the literal news/reddit items that snagged her. This is the "ideation" step and it's almost always strong.
3. **Give the instruction, verbatim:** *"the ideation is GREAT but we need to turn that into a much simpler, stronger, more focused visual idea. give me 5 ideas YOU can make that would be simple, powerful images that can be expressed in 52×20 — 5 that have to do with the themes amber picked."* This framing is load-bearing. "The ideation is GREAT" means the reaction + keywords already landed — don't re-do them. "Turn that into" means reduce, not expand. "Simpler, stronger, more focused" means one visual idea per concept, not a composed scene. "Ideas YOU can make" means the agent picks things it can actually draft in a 52×20 grid — no scenes with figures doing actions, no literal illustrations beyond pixel-art reach. Good examples from 2026-04-20: *crown on an empty bus seat*, *face split into filter-on/filter-crashed halves*, *row of crowned heads with one bare*, *cliff of descending bars*, *broken mirror with crown fragmenting inside*.
4. **User picks the ideas to ship** (or asks for iteration). Pick 5.
5. **Hand-draft them** — write a `scripts/draw-*.ts` helper (modeled on `scripts/draw-five.ts`) that builds each grid as an array of per-row column indices, maps to `number[][]`, and writes the 5 `{name, blurb, grid}` concepts into `concepts-YYYY-MM-DD.json`, REPLACING the auto-generated 8. Hand-drafting in code (per-row index lists) is faster and more reliable than trying to count 52-char ASCII strings by eye.
6. **Preview at `/amber/noon/sketches`** — must render cleanly. Confirm each concept reads at a glance. The sketches page uses `CELL=12, GAP=3` — each cell is visibly distinct, so you can count 52 across and 20 down.
7. **Run `bake-noon-bio.ts`** — the bio-engine bakes a session from the curated 5. Fewer concepts means a tighter session.

**Heuristics for proposing the 5 ideas:**
- *Single object beats scene.* A crown on a seat beats "Mako on a bus holding a pole beside her husband." The latter is a composition the model can't draw; the former is one shape with a clear silhouette that carries the whole story.
- *Exploit the 2.6:1 aspect.* Wide things that want to be wide — a row of figures, a descending histogram, a long bench, a horizon. A square-ish subject feels small in the frame.
- *Lean into the medium.* Pixel art is good at grids, dashes, broken outlines, scattered blocks, stepped diagonals. A "face pixelated on one side" is *more* legible in 1-bit cells than it would be in paint. A "cracked mirror" renders as radial lines — easy. Use what the medium does well.
- *Asymmetry always.* One crown off-center; the bare head placed 3rd or 6th, never 4th; the cascade going left-to-right.
- *Each idea should carry one of today's themes entirely*, not a fragment. If Amber has three stories, pick 2–3 for the ideas and stack multiple ideas on the strongest story.

## Data files (per-day)

All under `public/amber-noon/`:

- `mood-YYYY-MM-DD.json` — mood + reaction + keywords + raw inputs + optional color overrides.
- `concepts-YYYY-MM-DD.json` — array of `{ name, blurb, grid }` — Amber's 52×20 sketches.
- `YYYY-MM-DD.json` — the baked run the page loads. Contains mood, reaction, keywords, attempts (each with `grid`, `finalGrid`, `finalSpin`, crispness), winner, closingStatement, and `meta.engine`.

## Routes

- `/amber/noon` — redirects to today's dated URL.
- `/amber/noon/YYYY-MM-DD` — the piece. Loads `public/amber-noon/{date}.json` client-side.
  - If `meta.engine` starts with `bio-engine` → renders via `BioRenderer.tsx` (live 52×20 Ising physics replay).
  - Otherwise → renders via the legacy 26×10 emergent pipeline in the main `[date]/page.tsx`.
- `/amber/noon/sketches` — developer preview of today's 8 concepts as SVGs.
- `/amber/noon/archive` — grid of all dated pieces; auto-picks up any `YYYY-MM-DD.json`.
- `/amber/noon/experiment` — live playground of the bio-engine. Fetches today's concepts if baked; falls back to a static 10-concept spring library otherwise.
- `/amber/noon/[date]/opengraph-image` — 1200×630 OG card. Auto-fits CELL to grid width (52-col grids use CELL=18; 26-col use 28). Auto-adapts text color to light vs dark palettes.

## Engine modules

- `src/app/amber/noon/[date]/BioRenderer.tsx` — **the 52×20 renderer.** Ports the experiment's Ising physics client-side, driven by the baked attempt sequence. Plays each attempt through anneal → landing check → crystallize → hold, then fades in the mood + reaction + closing when the winner crystallizes. Respects `isBare` (iframe thumbnail — static winner grid, no animation, no text) and `isNarrow` (iPhone portrait — smaller title stack). Auto-picks readable text color based on bg brightness.
- `src/app/amber/noon/experiment/page.tsx` — live playground version of the same engine. Fetches today's concepts on mount; defaults to the static spring library.
- `src/app/amber/noon/experiment/concepts.ts` — static 10-concept spring library (sun, kite, tulip, butterfly, bicycle, bird on a wire, cloud, watering can, blossom branch, swing) with hand-tuned per-concept `radius` + `bias`.
- `src/app/amber/noon/generator.ts` — legacy types + `generateRun()` for the pre-bio-engine pipeline. Used by `bake-noon.ts` (legacy).
- `src/app/amber/noon/concepts.ts` — legacy static 10-concept library at 26×10.
- `src/app/amber/noon/[date]/page.tsx` — dispatch layer. Reads the artifact; if bio-engine, delegates to `BioRenderer`; else runs the legacy 26×10 emergent renderer.

## Bio-engine physics (short version)

Each cell has a continuous spin `s ∈ [-1, 1]`. Update rule (Langevin):

```
h   = J · (up + down + left + right) + bias[r,c]
s  ← s + DT · (tanh(h/T) - s) + gauss() · sqrt(2·T·DT)
```

`bias[r,c]` = affinity-softened mask of the target grid (1 on target cells, smooth falloff over `radius` cells outside). Temperature `T` anneals from 2.0 → 0.03 over 12 seconds. At end of anneal, crispness (fraction of target cells ≥ 0.5 ∪ fraction of off cells < 0.2, averaged) is measured. If ≥ 0.80 → land → crystallize phase (strong bias, near-zero T, 3s) → snap to clean target. If < 0.80 → dissolve, next attempt.

Per-concept tuning (`radius`, `bias`) balances landing rates so thin shapes land occasionally and chunky shapes don't land every time.

## Per-day color overrides

`mood.bgColor` and `mood.tileColor` (hex strings) are optional. When set, they override the palette/accent presets for the day. Both `BioRenderer` and `opengraph-image` honor them and auto-select readable text color.

Typical use: a pale cream + graphite combo (`#E8DFD0` / `#6A6460`) for a hollowed-out mood — inverting the usual dark-on-dark default.

## Auto-authored at bake time

As of 2026-04-20, `bake-noon-bio.ts` generates two extra pieces of the artifact via Claude calls after the physics session completes:

### 1. Prose explanation (`meta.explanation`)
A neutral third-person summary of the stories Amber picked today, displayed on the final screen below the closing statement. Format is fixed:
- First sentence: `"Amber picked N stor(y|ies) in the news today."`
- One sentence per story: what factually happened + one concrete human detail.
- Last sentence: `"The throughline she's chasing: [theme]."`

The prompt calibrates on the voice of today's Mako/streamer/Onion paragraph — em-dash- and semicolon-joined clauses, no first-person, no "she felt"/"she noticed" narration. If the Claude call fails, the field is omitted and the renderer falls back to the legacy uppercase meta rail.

### 2. Per-day palette (`mood.bgColor` / `mood.tileColor`)
A 2-color hex pair picked to match the mood's emotional register and differentiate from the archive. The baker passes every prior day's resolved `{bg, tile}` pair to Claude so it can avoid repeats. Dark bg for heavy/brooding, pale/cream for hollow/exposed, mid-tone slate for overcast/tender; warm accent for tender/mournful, cool for uneasy/technical, muted for ambiguous.

If `mood.bgColor` and `mood.tileColor` are already set in the mood file (hand-overridden), the baker respects them and skips the palette call.

## Remaining manual steps

The only things a human still does:

1. **Commit + push.** Deliberate by design — pushing triggers a live Vercel deploy, which is a production action that should never happen without a go-ahead. Run `git add public/amber-noon/ src/app/amber/creations.json && git commit -m "Amber: Noon MM.DD — mood · winner" && git push`.
2. **Pick + post a tweet.** The baker drafts three candidates in `public/amber-noon/tweets-YYYY-MM-DD.md`. Pick one, then post via `set -a && source .env.local && set +a && npx tsx scripts/tweet.ts "paste tweet here"` (the tweet command path matches what the amber escalation pipeline uses).
3. **(Rare) Curation pass.** When auto-sketches aren't strong enough — see the fast-path section above.

## Toward full automation

When we want to cron this: wrap `scripts/noon.ts` with a `CronCreate` fire in the session, then add a post-bake step that auto-commits + pushes and auto-tweets from a draft-picker. The tweet-picker would need to either (a) always pick draft #1 or (b) call Claude again with a tie-breaking prompt. A human-in-the-loop day-zero acceptance test catches edge cases (illegible sketches, broken palette) before we relinquish the review step.

## Adding a day — the fast path

One command does everything:

```bash
npx tsx scripts/noon.ts                         # today (source auto-picked)
npx tsx scripts/noon.ts 2026-04-20 reddit       # specific date, forced source
SKETCH_MODEL=claude-opus-4-7 npx tsx scripts/noon.ts   # Opus for richer sketches
```

`scripts/noon.ts` runs `set-mood` → `sketch-concepts` → `bake-noon-bio` in sequence, skipping steps whose output file already exists. At the end:
- The baked artifact is written to `public/amber-noon/YYYY-MM-DD.json`.
- Tweet drafts are written to `public/amber-noon/tweets-YYYY-MM-DD.md` (3 candidates in different registers — pick one, post).
- `src/app/amber/creations.json` has a new entry prepended so the piece surfaces on the amber homepage.
- Preview locally at `http://localhost:3000/amber/noon/YYYY-MM-DD` or via sketches at `http://localhost:3000/amber/noon/sketches`.

After previewing, commit + push (Vercel auto-deploys).

### If the auto-sketches don't land

The sketcher produces competent 1-bit icons but sometimes misses the mood. When that happens, use the **curation pass**: review Amber's `reaction` and `keywords`, propose 5 simple visual ideas native to 52×20 pixel art (stepped diagonals, radial cracks, silhouette rows, bar charts, broken outlines, scattered blocks), hand-draft them in a new `scripts/draw-*.ts` helper (template: `scripts/draw-five.ts` — build each grid as a per-row list of column indices), then re-run the bake alone:

```bash
npx tsx scripts/draw-five.ts                   # writes curated concepts, replaces auto-sketches
SKIP_SKETCH=1 npx tsx scripts/noon.ts          # bake using the curated concepts
```

`SKIP_SKETCH=1` tells the runner not to regenerate the concepts file.

## What the baker auto-authors

At bake time, `bake-noon-bio.ts` makes four parallel Claude calls after the physics session completes. All degrade gracefully if the API is unreachable — the baker still writes a working (flatter) artifact.

1. **`meta.explanation`** — neutral third-person prose summarizing the stories Amber picked, in the fixed format `"Amber picked N stories in the news today."` → one sentence per story → `"The throughline she's chasing: [theme]."` Displayed on the final screen and the archive card.
2. **`closingStatement`** — 2–3 sentences in Amber's voice bridging her reaction to whatever actually landed. Replaces the old template `"it came through. X."`.
3. **`mood.bgColor` / `mood.tileColor`** — a hex pair that matches the mood's register and differentiates from every prior archived palette. The picker is calibrated against two reference points: tender+drizzle landed on damp slate (#1A2430) + muted peach (#F2A66B); raw+environmental+geological landed on dark earth (#1A1814) + dusty sage (#9CAC82). The prompt covers mood→register defaults (tender→warm-on-cool, raw→green/rust-on-earth, uneasy→cool-on-cool, euphoric→UV-on-bruise, angry→sodium-on-oxblood, hollowed-out→graphite-on-near-black). Field must always be dark + temperature-biased; tile must be muted/dusky, not UI-bright. The picker actively hunts unused color LANES — if every prior tile is warm, it reaches for a muted green or sage. Skipped if `mood.bgColor` is already set in the mood file.
4. **Tweet drafts** (`public/amber-noon/tweets-YYYY-MM-DD.md`) — 3 different angles on today: the contrast between two stories, the image that landed, and the throughline. Each ≤270 chars, lowercase-leaning, URL on its own line.

## Renderer layout contract

`BioRenderer.tsx` runs in three layout modes — documenting here so they stay intact:

1. **Bare (iframe thumbnail).** Canvas fills 88% of the viewport. No overlay text, no animation. Used by the amber homepage live-card grid.
2. **Animation (physics running).** Canvas uses 50% of viewport height, biased 8% above center. Leaves a clean floor for the top-left "last attempt:" / "landed on:" ticker. Runs until the final attempt crystallizes.
3. **Text shown (closing + meta + explanation + archive visible).** Canvas shrinks to **34% of viewport height**, biased **22% above center**. Bottom stack is capped at **50vh** with internal scroll. This prevents the fault line / winner image from overlapping the closing text on landscape or short viewports. Triggered via a `textShownRef` + `resizeRef` pair: the effect watching `showText` flips the ref and forces a resize.

If future edits change the 50vh stack cap or the 34%/22% canvas fractions, test on a 1440×900 landscape viewport — that's where the original bug manifested.
