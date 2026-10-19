# Writing a chapter for the Living Island world

The Peck map (Dodo's level trail) is drawn by this folder: `world.js` (geometry, layers, manifest),
`kit.js` (the concept's drawing kit), `live.js` (live animation + native stand-ins), one `ch-*.js`
per chapter of ten levels. Read `ch-meadow.js` and `ch-lagoon.js` first; they are the two finished
chapters and the quality bar. The approved art direction is `../E-living.html` and
`../LIVING_ISLAND_HANDOFF.md` (read the handoff's "Shadows and light", "Ground recipe" and
"Ambient motion" sections).

| Band | Levels | File | Chapter |
|---|---|---|---|
| 0 | 1–10 | ch-meadow.js | Gumdrop Meadow (done) |
| 1 | 11–20 | ch-lagoon.js | Jelly Lagoon (done) |
| 2 | 21–30 | ch-peaks.js | Sprinkle Peaks |
| 3 | 31–40 | ch-clouds.js | Marshmallow Clouds |
| 4 | 41–50 | ch-stars.js | Starlight Garden |
| 5–7 | 51–80, then forever | ch-cosmos.js | Candy Cosmos (bands 6 and 7 loop) |

## Coordinates

- World units = iPhone points. x across a 520-wide strip, centre `W.CX = 260`; y down from the top
  of the art (`W.H`). An iPhone shows x 65–455 (390 wide) up to 40–480 (440 wide). Keep everything
  that matters inside 70–450; the outer 40 on each side may crop.
- Node i (level i+1): `W.nx(i)`, `W.ny(i)`. The trail is a period-4 zigzag, amplitude 78, pitch 142:
  centre, left (182), centre, right (338), … Band k holds nodes 10k … 10k+9. Even bands start
  C, L, C, R, C, L, C, R, C, L; odd bands are the mirror (C, R, C, L, …).
- The app draws the level stones at about 58 pt across (stars above them, a START ribbon below the
  current one, the dodo standing on it ~70 pt tall). Keep a calm corridor: nothing but ground within
  34 of the road and 46 of a node centre. `W.distToRoad(x, y)` and `W.nodeDist(x, y)` help.
- Author placements with anchors: `B.A(j, dx, dy)` = node j of the band (0–9) plus dx toward that
  node's free side (mirrored automatically when the trail swings the other way) — side nodes have room
  on the far side; for centre nodes positive dx is lower-right/upper-left free quadrant with dy>0/dy<0
  when `m=+1` … simply render and look. `B.at(j, dx, dy)` is unmirrored. Every anchor returns `.m`
  (+1/−1) so a drawing can face the trail.
- `B.top` / `B.bottom` are the band's boundaries (half a pitch below its first node, and below the
  next band's first node). `B.rng(seed)` is a seeded mulberry32 — all randomness must come from it,
  at build time; frames are pure functions of time.

## The chapter object

```js
W.chapter({
  id, name /* SIGN CAPS */, title, road: 'ribbon' | 'stones', roadStyle /* ribbon colours, optional */,
  node: [light, base, dark]            // the level stones' jelly colours in this chapter
  gateBanner: [text, board, ink]       // the gate at this chapter's TOP, e.g. 'TO STARLIGHT GARDEN'
  sign: { board, plate, ink }          // optional colours for the region-name and rest signs
  edgeColor, finaleSky: [top, mid, bottom], night: false,
  ground(ctx, B), props(B, add, ctx), fg(B, put), manifest(B, put), topEdge: B => (x => y),
})
```

- **ground** (opaque, baked): terrain for the band. Chapters are painted top to bottom, so the chapter
  BELOW you paints over your bottom edge. Fill from about `B.top - 200` down to `B.bottom + 300`; the
  shape and decoration of the boundary at your TOP (beach, foam, cliff lip, cloud lip) are yours.
  Expose it as `topEdge` so the chapter above can put a beach right above it
  (`W.chapterOf(k-1).topEdge(W.BANDS[k-1])` gives the edge below you). The lagoon's `topEdge` is the
  shore of the peaks.
- **props** (baked over ground): landmarks, painter-sorted by the y you pass to `add(y, fn)`. Every
  prop gets `contact()` and `cast()` shadows from a top-left light. No text in baked art.
- **fg**: foreground framing at 1.12 parallax at the screen edges: `put({ side: -1|1, y, kind:
  'bush'|'branch'|'trunk', s, c })` or `put({ side, y, draw(ctx, x, y, R, side) })` where x is just
  outside the screen edge. Sparse: 5–7 per chapter.
- **manifest** (native, read by the app): `put.live(kind, {x, y, …})` for anything that moves,
  `put.glow({x, y, r, c})` for night emissives (windows, lamps, fires), `put.critter({ kind, x, y,
  size, float?, path?:'loop', rx, ry })`, `put.chest(level, {x, y})`, `put.sign({ role: 'region' |
  'rest', level, x, y })`, `put.gate({ x, y, angle, to: k+1 })` at the road crossing of your top
  boundary.

## What is native (do not bake)

Road and stepping stones, level stones, gates, bridges, signs (text), chests, critters, everything
that moves, night glows. The app has these critter sprites (tap to squish, hold to make your avatar):
`dodo, bunny, peach, cat, dragon, gummy, penguin, octo, panda, blob, hamster, bat, bee, cloud,
mushroom, sprite`. Use 4–6 per chapter, with jobs. A baked prop can be what the critter stands on.

Per chapter, the app needs exactly: chests at levels 10k+2 and 10k+6 (by a node, on firm ground),
one region sign (role 'region', level 10k+3, beside node j=2), one rest sign (role 'rest', level
10k+5, at the rest-stop landmark by node j=4; 25 and 45 are Peck or Perish, 35 and 55 are Deep
Dive), the gate at the top.

## Live kinds

Existing kinds (live.js and the lagoon): river, foam, campfire, smoke, zz, windmill, beam, bobber,
buoy, spout, jelly, boat, drops, butterfly, ripple, fish, bubbles, ferry. Reuse them freely.
New kinds: at most four per chapter, defined in your file as `W.LIVE.kind = (ctx, e, t) => …` with
`e.dx`, `e.yb` (map back with `x = W.CX + e.dx`, `y = W.H - e.yb`). They are ported to SwiftUI
Canvas by hand, so: paths, ellipses, arcs, rects, linear/radial gradients, alpha, `lighter`
compositing at most; no text, no filters, no images, no per-frame randomness. Slow and sparse:
nothing large faster than 0.6 rad/s, nothing flashes. Night chapters may twinkle gently.

## Checking your work

```
node scripts/peck-world/shot.mjs <out.png> "mode=full&from=19&to=32&count=34&current=26"
```
renders levels 19–32 at phone width with the native stand-ins (`&scale=2` for detail). Look at
every render. A finished chapter reads as a place someone lives at a glance, keeps the trail calm,
has the concept's depth (lit/shaded faces, valley shade, contact + cast shadows), and nothing important
crops at 390 wide. Also check the seam with the chapter below and above.

## Shipping a change

1. Edit the chapter, check it with `shot.mjs`.
2. `node scripts/peck-world/render.mjs` (writes `apps/feynd/Feynd/PeckWorld/`: tiles, fg sprites, manifest).
3. A new live kind, stone piece or bridge style needs its Swift twin: `PeckWorldDraw.swift` (shared kinds),
   `PeckWorldExtra.swift` (peaks, clouds), `PeckWorldExtra2.swift` (stars, cosmos). Put front kinds
   (things in the air) in `PWLive.layer`, light-makers in `PWLive.emissive`, poke reactions in `pokeable`.
4. Build and look in the simulator: `scripts/peck-world/sim-shots.sh <dir> <count> <current> <levels…> [dark]`.
