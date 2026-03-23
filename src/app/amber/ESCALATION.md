# Amber Escalation Engine

## Concept
Amber creates visual art that escalates in complexity with every round. Level 1 is a stick figure. Level 100 is an opus. Each creation builds on everything before it.

## Current State
See `escalation.json` for live data.

## Levels & Unlocks

| Range | Tier | Code Budget | Techniques Available |
|-------|------|-------------|---------------------|
| 1-10 | Sketch | 50-100 lines | Single canvas, basic shapes, one color, minimal animation |
| 11-25 | Composition | 100-250 lines | Multiple elements, color palettes, basic physics, click interaction |
| 26-50 | System | 250-500 lines | Simulations, math-driven, Web Audio (sound unlocks at L15), multiple interacting systems |
| 51-75 | Environment | 500-1000 lines | 3D projection, spatial audio, procedural generation, multi-state |
| 76-99 | World | 1000+ lines | WebGL, AI-generated text (writing model), workers, persistence, evolution |
| 100 | Opus | No limit | Everything combined. Ships as its own domain. |

## Escalation Rules

Each level inherits all techniques from previous levels. New techniques unlock but aren't required — use what serves the concept.

### Scoring
- **(no response from Bart)** → +1 level, continue trajectory
- **"not so good"** → level stays, adjust approach, log what was wrong
- **"kill this"** → -2 levels, completely new direction, log what to avoid
- **"🔥" / "amazing" / strong positive** → +3 levels, double down on what worked

### Constraints Scale With Level
- **Colors:** L1 = monochrome, L5 = 2 colors, L10 = palette, L25+ = unlimited
- **Interaction:** L1 = none, L5 = click, L15 = drag, L30 = multi-touch, L50+ = device sensors
- **Sound:** Unlocks at L15, required from L30
- **3D:** Unlocks at L30, perspective projection at L40, WebGL at L60
- **AI text (writing model):** Unlocks at L60
- **Multi-page/scene:** Unlocks at L75

### What Escalates
1. **Systems count** — L1: 1 thing moving. L50: 5 systems interacting.
2. **Code volume** — naturally grows with complexity
3. **Visual density** — more elements, more layers, more depth
4. **Interaction depth** — from "look" to "touch" to "explore" to "inhabit"
5. **Conceptual ambition** — from "a line" to "a world"

## Tweet Format
Every escalation tweet includes the level: `L1:`, `L23:`, etc. Followers watch the progression.
