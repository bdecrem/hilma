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

## Adding a day (quick reference)

```bash
npx tsx scripts/set-mood.ts                     # weather + news/reddit → mood, reaction, keywords
npx tsx scripts/sketch-concepts.ts              # Amber sketches 8 keywords at 52×20
SKETCH_MODEL=claude-opus-4-7 npx tsx scripts/sketch-concepts.ts   # Opus for richer sketches
npx tsx scripts/bake-noon-bio.ts                # bio-engine session → final run
# then open: http://localhost:3000/amber/noon/YYYY-MM-DD
# preview sketches:  http://localhost:3000/amber/noon/sketches
```

Don't forget to add the day to `src/app/amber/creations.json` so it surfaces on the amber homepage.
