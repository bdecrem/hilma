# Now What? — Alive Experiment

## What is this

An experiment in emergent generative art with AI evaluation. Built on top of the "Now What?" split-flap pixel art display.

The system generates shapes from noise, lets them emerge on a 26x10 pixel grid using the same physics engine as the original landing page, then runs a two-pass AI evaluation to decide if the shape is worth keeping.

## Architecture

```
Procedural generators → Simulation engine → AI Judge (2-pass) → Winner pool
```

### Pages

| URL | What |
|-----|------|
| `/nowwhat` | Original landing page — 42 curated shapes, standalone art piece |
| `/nowwhat/alive` | Agentic version — emergent shapes + AI judgment loop |
| `/nowwhat/judge` | Dashboard — review all AI-evaluated candidates with their verdicts |

### Engine (`src/lib/nowwhat/`)

Extracted from the original page into reusable modules:

- **`shapes.ts`** — 42 curated shapes, grid helpers (`mk`, `emb`, `personAt`, `petAt`)
- **`cells.ts`** — Cell state machine (fill, brightness, flipping, locking, energy, agitation, probing)
- **`simulation.ts`** — Phase engine: cycling → searching → evaluating → cascade/entropy → won/failing
- **`renderer.ts`** — Canvas drawing (pixel blocks, split-flaps, scanlines, CRT aesthetic)
- **`generators.ts`** — 15 procedural recipes (circles, people, arches, trees, hearts, constellations, spirals, waves, buildings) combined with union/intersect/mirror/translate

### AI Judge (`src/app/api/nowwhat/judge/`)

Two-pass evaluation:

1. **Haiku** (fast screen, ~$0.0004/call) — "Is this a recognizable shape?" Accepts ~30-40%
2. **Sonnet** (curator, ~$0.003/call) — "Does this actually fit our themes? Is it compositionally good?" Accepts ~40-60% of Haiku's picks

Cost: ~$0.10-0.12/hour to run continuously.

### Winner Pool (`data/nowwhat-winners.json`)

Flat JSON file. Each winner has:
- `name` / `reason` — from Haiku
- `humanApproved` — Sonnet's verdict (true/false)
- `sonnetReason` — Sonnet's specific critique
- `grid` — the 26x10 pixel grid

The alive page replays approved winners 50% of the time, searches for new shapes the other 50%.

## Theme

"Now what?" — what do humans do after AGI? The shapes should evoke art, science, community, connection, nature, building a better future.

## Status

- Procedural generation works but produces mostly abstract blobs
- Haiku is generous (accepts most things)
- Sonnet is a good critic (0 approvals so far — correctly rejecting weak shapes)
- No feedback loop yet — generators don't learn from rejections
- The visual engine (tiles, flaps, speeds, CRT aesthetic) is identical to the original

## What's next

- Improve generators to produce cleaner, more recognizable forms
- Add feedback: weight recipes that produce Sonnet-approved shapes higher
- Possibly let the AI suggest new shape parameters based on what it's seen
- Once quality is high enough, merge the agentic loop back into the main landing page
