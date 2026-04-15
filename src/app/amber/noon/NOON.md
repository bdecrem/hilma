# Amber's Noon — Pipeline

One artifact a day at noon. The weather + the world's headlines get filtered through Amber's hypersensitive artist persona, which produces a mood, a first-person reaction, and sensory keywords. Amber then sketches each keyword as a tiny 26×10 silhouette. A deterministic "attempts" sequence (first attempt always fails; last always lands) picks one keyword to be the winner. The page animates the emergence and displays the winner with Amber's paragraph + a meta-rail showing the inputs that led to the mood.

## The three-step daily bake

Each day runs three scripts in order. Each writes a JSON file under `public/amber-noon/`; the next script reads the previous one's output.

```
scripts/set-mood.ts          →  mood-YYYY-MM-DD.json
scripts/sketch-concepts.ts   →  concepts-YYYY-MM-DD.json
scripts/bake-noon.ts         →  YYYY-MM-DD.json   ← what the page loads
```

### 1. `scripts/set-mood.ts`

Reads nothing, writes `public/amber-noon/mood-YYYY-MM-DD.json`.

- Pulls **Palo Alto weather** from Open-Meteo (no key needed): conditions, temps, precip, wind, sunrise/sunset.
- One call to **Claude Sonnet 4.5 with the `web_search` tool**, system prompt = Amber's artist persona (hypersensitive, full emotional range, first-person, notices small things).
- Claude searches for 4–6 significant world headlines, then lets the weather + news hit her and returns:
  - `mood` — `name` (any emotion word, not just uneasy/melancholy), `reason` (~10-word phrase), `palette` (one of `night/hearth/ink/petrol/bruise/oxblood`), `accent` (one of `lime/sodium/uv`).
  - `reaction` — 2–4 first-person sentences. This becomes the on-screen paragraph.
  - `keywords` — 6–8 **drawable** sensory images. Prompt constrains these to things with clear silhouettes (a rag on a line, broken rays, tanker bow) rather than abstract feelings (clammy hands, queasy).
- Optionally carries `bgColor` / `tileColor` hex overrides if Amber picks custom colors for the day.

Run: `npx tsx scripts/set-mood.ts [YYYY-MM-DD]` (defaults to today).

### 2. `scripts/sketch-concepts.ts`

Reads `mood-YYYY-MM-DD.json`, writes `concepts-YYYY-MM-DD.json`.

- One call to Claude Sonnet 4.5 in the Amber persona, carrying today's mood + reason for context.
- Asks Amber to sketch each keyword as a 26×10 ASCII silhouette (`#` = filled, `.` = empty).
- Prompt includes `frantic light` (reference artifact in `public/amber-noon/archive/frantic-light.json`) as the in-prompt example of the target register: asymmetric, gestural, negative space > filled area.
- Returns a JSON array of `{ name, blurb, ascii }`. Each ASCII block is parsed into a `number[][]` grid (ROWS × COLS).

Run: `npx tsx scripts/sketch-concepts.ts [YYYY-MM-DD]`.

### 3. `scripts/bake-noon.ts`

Reads the mood + concepts files (if present), writes `YYYY-MM-DD.json`.

- Calls `generateRun(date, { mood, reaction, keywords, dailyConcepts })` in `src/app/amber/noon/generator.ts`.
- Builds a deterministic attempt sequence from a date-seeded PRNG:
  - first attempt always fails; each subsequent has 25% chance of success; max 6 attempts; if none succeed by #6, force success.
  - no two in-a-row the same concept.
- Each attempt carries the inline grid sketched for that keyword, so the page can render without any external lookup.
- `closingStatement` = Amber's first-person reaction + `I ended on <winner>.` (falls back to a template if no reaction).

Run: `npx tsx scripts/bake-noon.ts [YYYY-MM-DD] [optional-salt]`.

## Data files (per-day)

All under `public/amber-noon/`:

- `mood-YYYY-MM-DD.json` — mood + reaction + keywords + raw inputs (weather, headlines) + optional color overrides.
- `concepts-YYYY-MM-DD.json` — array of `{ name, blurb, grid }` — Amber's sketches for today's keywords.
- `YYYY-MM-DD.json` — the baked run the page actually loads. Contains mood, reaction, keywords, attempts (each with inline grid), winner, closingStatement, and optional `meta` block for the on-screen rail.
- `archive/` — reference artifacts preserved across days (e.g. `frantic-light.json` — the "this is what good looks like" example used in the sketch prompt).

## Routes

- `/amber/noon` — redirects to today's dated URL.
- `/amber/noon/YYYY-MM-DD` — the piece itself. Loads `public/amber-noon/{date}.json` client-side, animates the attempt sequence, ends on the winner with Amber's paragraph and the meta-rail (PALO ALTO · NEWS → MOOD).
- `/amber/noon/sketches` — developer/preview view of today's keywords + grids. Shows the mood header, Amber's reaction, and an SVG rendering of each sketched concept. Useful for sanity-checking the sketch pass before the bake.
- `/amber/noon/[date]/opengraph-image` — 1200×630 OG card for the day's piece. Source: `src/app/amber/noon/[date]/opengraph-image.tsx`. Currently renders a static version of the winner's grid in the day's `tileColor` on the day's `bgColor`, with the date, concept name, blurb, and wordmark. Honors per-day color overrides. **Today's version is a simplified preview, not a real representation of the animated artifact** — see Tomorrow list.

## Engine modules

- `src/app/amber/noon/generator.ts` — types (`NoonRun`, `Attempt`, `MoodInput`, `DailyConcept`) + `generateRun()`. Deterministic from the date seed; accepts keyword + daily-concept overrides or falls back to the static `CONCEPTS` library.
- `src/app/amber/noon/concepts.ts` — static 10-concept library (horizon, window, antenna, bird, key, ladder, wave, candle, tower, compass). Used as fallback when no daily concepts exist.
- `src/app/amber/noon/[date]/page.tsx` — client-side renderer. Reads the baked run, sets up the emergent canvas via `@/lib/nowwhat`, applies per-day tile tint via `setTileTint()`, plays the attempts, fades in the paragraph + meta-rail after the piece lands.
- `src/lib/nowwhat/renderer.ts` — shared engine. `setTileTint(rgb | null)` is the hook that lets the noon page recolor tiles without affecting other routes.

## Per-day color overrides

`mood.bgColor` and `mood.tileColor` (hex strings) are optional. When set, they override the palette/accent presets for the day:
- `bgColor` replaces the palette background (on canvas and in the OG image).
- `tileColor` tints the emergent tiles via `setTileTint()`, still modulated by brightness so shading works.

Accent tokens (`lime/sodium/uv`) still drive the label and accent dot color. Typical use: bias the field further from the default dark palette when the mood calls for it (e.g. queasy → acid olive `#5C6A1F` + hot sodium tiles `#FF4E17`).

## Tomorrow / to-do

Things hand-edited today that still need to be automated. Each is a small, contained change to one script + optionally the baked run schema.

### 1. Automate color picking in `set-mood.ts`
Amber currently returns `palette` + `accent` tokens (v3 presets), but the richer per-day hexes (`bgColor`, `tileColor`) were written by hand into today's mood JSON. The engine already honors them — we just need the prompt to produce them.

- Extend the `mood` JSON shape Amber returns to include optional `bgColor` and `tileColor` hex strings.
- In the prompt, give Amber license to pick vivid, non-default colors when the mood calls for it. Remind her: not every bad mood is dark; nauseated has bile green, excited has sodium orange, reverent has UV. Pair a bg and a tile color that clash or resonate deliberately.
- Keep the token fallback (`palette` + `accent`) for days she doesn't want to override.

### 2. Thread `meta` through `bake-noon.ts`
The on-screen rail (`PALO ALTO · NEWS → MOOD`) reads `run.meta.location`, `run.meta.weather`, `run.meta.news[]`. None of that is auto-populated yet — I hand-wrote short hooks into today's baked JSON.

- Have `set-mood.ts` also return a `newsHooks` array: 3 short hooks (2–4 words each) derived from the same headlines it already finds. Prompt should ask for things like "Iran blockade day 3" or "Orbán out" — not full headline sentences.
- Have `set-mood.ts` produce a short weather string like "overcast · 61°F" alongside the full weather snapshot.
- In `bake-noon.ts`, build the `meta` block from those fields and write it into the run JSON:
  ```ts
  run.meta = {
    location: 'Palo Alto',
    weather: mood.weatherShort,
    news: mood.newsHooks,
  }
  ```

### 3. Upgrade the OG image to represent the actual creation
The current OG card renders a static, symmetric grid of the winner's sketch — it looks nothing like what visitors see on the live page. Goal: make the OG feel like a snapshot of the real artifact.

- Match the live canvas's tile rendering: pattern fills (checker, stripe, dots), brightness variation, scanlines, the subtle cell-border highlight/shadow from `drawPixelBlock`.
- Sample the "won" phase: only target cells lit (in `tileColor`), non-target cells completely dark/recessed (no faint border grid across the whole card).
- Consider including Amber's closing-statement snippet underneath, or just the winner + blurb — but the *visual* should read like a frame grab, not a schematic.
- Keep the 1200×630 size, wordmark, and date.

### 4. Optional: per-day closing-statement coda
Today I hand-appended "The lid stays. Take that as today." to the end of the baked closing statement. Not clear this should be automated — it's per-day poetry and often the best version is written by hand. Leave manual for now; revisit if it becomes a pattern.

## Adding a day (quick reference)

```bash
npx tsx scripts/set-mood.ts          # weather + news → mood, reaction, keywords
npx tsx scripts/sketch-concepts.ts   # Amber sketches the keywords
npx tsx scripts/bake-noon.ts         # deterministic attempt sequence → final run
# then open: http://localhost:3000/amber/noon/YYYY-MM-DD
# preview sketches:  http://localhost:3000/amber/noon/sketches
```
