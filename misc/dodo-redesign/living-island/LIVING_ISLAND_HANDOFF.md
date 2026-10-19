# Living Island: implementation handoff for the Peck map

Read this before you touch `FlashTabView.swift` / `PeckTrail.swift` / `PeckJelly.swift`.
Follow `apps/feynd/CLAUDE.md` for build, install and TestFlight. Done means it runs and looks right
on device or in the simulator, not `BUILD SUCCEEDED`.

## What we're building

Concept E, "Living Island": the Peck map keeps its jelly-candy material, trail, nodes, traveler and chrome,
and gains (1) real depth (shaded diagonal hills, contact and cast shadows, a parallax foreground frame),
(2) a landmark every couple of levels with critters doing things, and (3) sparse ambient motion.

## What's in this bundle (put it at `misc/dodo-redesign/living-island/`)

| File | What it is |
|---|---|
| `E-living.html` | The approved art page. Open it in Safari; tap "notes". `#full` renders the whole slice without chrome. |
| `src/core.js` | Shared harness: camera, layer cache, parallax, the 14-level test trail, default nodes, helpers. Not to be ported as-is. |
| `src/concept-E-living.js` | The art. Every drawing function you port lives here. |
| `ref/E-full.png`, `E-phone.png`, `E-mid.png` | Reference renders (whole slice @1x, levels 1–6 and the shore @2x on a 390×844 phone). |

The art page follows the same method as `dodo-jelly-map.html`: it draws the world in Canvas 2D in
390-wide world units, and the native map is a port of its drawing maths. Port function by function
(Canvas 2D → SwiftUI `GraphicsContext` / `Path`), keeping names so the two stay diffable.

## The one thing to get right: don't port coordinates

The concept is painted for a **14-level test trail of its own** (`buildWorld()` in core.js: 142 units
between levels, x = 195 + 92·sin(0.98·i + 0.35)). Every landmark, hill crest, river point, island and
foreground piece in `concept-E-living.js` is an **absolute world coordinate** on that test trail.
The app has 30 levels and its own geometry in `PeckTrail.swift`.

So: port the drawing functions (`cottage`, `tent`, `windmillBody`, `gumTree`, `cast`, `contact`, …) and
**re-place everything with an anchor system** driven by the app's real node positions:

```swift
struct Landmark {
  let kind: LandmarkKind      // .cottage, .garden, .orchard, .campsite, …
  let level: Int              // anchor node (1-based)
  let offset: CGVector        // from the node centre, in world units, for a trail swinging RIGHT
  let keepOut: CGFloat        // radius kept free of tufts/flowers/other props
  let flipsWithTrail: Bool    // mirror offset.dx when the trail at this level sits left of centre
}
```

Placement rules:
1. Calm corridor: nothing but the road and the node's own shadow within **30 units** of the road under a node; grass tufts thin out within 46.
2. A landmark goes on the side of the trail with more horizontal room. If the anchor node's x is left of 195, mirror `offset.dx` (and the drawing, if it has a door or sign that must face the trail).
3. Keep-outs: landmark footprints suppress tufts, flowers and clover (see the `keep` list in `drawGround2`).
4. Nothing interactive may sit under the floating chrome when its own level is centred on screen.
5. All random scatter uses a seeded RNG at cache-build time (the brief's rule: frames are pure functions of time, no randomness at draw time). Port `rng()` from core.js (mulberry32) so scatter matches the page.

### Anchor table, levels 1–14 (measured from the concept; offsets for the concept's trail)

Use these as the starting `offset`s, then tune against the real trail. "dx < 0" = left of the node.

| Landmark | Level | dx, dy | Notes |
|---|---|---|---|
| Dodo's cottage + chimney, cat napping on roof | 1 | −145, +10 | Round door faces the trail. Side trail to the road. |
| Nest with egg | 1 | −85, +28 | Between cottage and road. |
| Mushroom family (3) | 1 | −197, +67 | Bottom-left corner; may crop at the screen edge. |
| "Gumdrop Meadow" sign | 1 | +99, +64 | Opposite side from the cottage. |
| Carrot-candy garden | 1–2 | −119, −128 from L1 | Fenced bed. Bunny + watering can at L2 (−98, +33). |
| Gumdrop orchard (6 trees, ladder, basket) | 3–4 | −81, +139 from L4 | |
| Chest (+ spilled coins) | 3 | −53, +46 | Existing chest behaviour unchanged. |
| Campsite: tent, campfire, log seats, bat | 5 | tent +198, −16; fire +124, +28 | Rest stop: this is where the Peck or Perish sign lives. |
| "Peck or Perish" sign | 5 | +110, −28 | Existing rest-stop sign, restyled as `woodSign`. |
| Beehive on a stand + bee loop | 6–7 | +122, +142 from L7 | |
| Windmill (turning sails) | 6 | −66, −112 | Sails must clear the road corridor at full swing. |
| Grove with hedge edge, side path, clearing (stump + bunny) | 7 | +160, −7 | |
| River + plank bridge with candy rails | between 8 and 9 | road crossing | River flows from the left edge, under the bridge, turns north and widens into the lagoon beside the lighthouse. |
| Lighthouse (sweeping beam) | 10 | +86, −89 | Beside the gate. |
| Candy-cane gate "To Jelly Lagoon" | 10→11 | existing gate point | Keep the existing region-gate logic; restyle only. |
| Pier + hamster fishing (bobbing float) | 11 | −92, +83 | |
| "Jelly Lagoon" sign on an islet | 11 | −80, −24 | |
| Sand island under every lagoon node | 11+ | node centre, +6 | Already exists in the app; restyle with shallows ring + caustics. |
| Palm-lollipop island, rock islet, far island | 11, 14 | see `ISLES` | |
| Whale (spouts every 6 s), octo, sailboat, buoys, jellyfish pair, dock + rowboat | 12–14 | see `G` in `setup()` | |

## Layer stack (bottom to top)

| # | Layer | Content | Cached? | Parallax |
|---|---|---|---|---|
| 1 | Ground | sand base, hill bands (diagonal crests, lit/shaded faces, valley AO), knolls, tonal noise, side trails, river, beach, lagoon water, islands, road + bridge | yes | 1.0 |
| 2 | Landmarks | every static prop, sorted by y (painter's order), each with `contact()` + `cast()` shadows | yes | 1.0 |
| 3 | Live back | river flow, campfire, windmill sails, lighthouse beam, bobber, buoys, octo, whale spout, jellyfish, boat, watering-can drops | no, per frame | 1.0 |
| 4 | Nodes + traveler + critter sprites | existing code. Node gets one extra soft cast shadow (see `drawNode` override). | as today | 1.0 |
| 5 | Live front | chimney smoke, cat "zz", bee loop, butterflies | no | 1.0 |
| 6 | Foreground frame | dark leafy branches, bushes, two cropped trunks at the screen edges; lily pads over the lagoon | yes | **1.12** |
| 7 | Vignette | screen-space radial, `rgba(60,40,90,.16)` at the edge | trivial | screen |

### Caching (this is the part that can go wrong)

A full-height cached layer for 30 levels at 3× is ~1170 × 15,000 px ≈ 70 MB **per layer**. Don't do that.

- Render layers 1, 2 and 6 into **horizontal tiles** (e.g. 1024 px tall at device scale) with `ImageRenderer` or `UIGraphicsImageRenderer`, built lazily for the viewport ± 1 screen, kept in a small LRU (≈ 6–8 tiles per layer).
- Each tile draws the whole layer's code clipped and translated to its band, so seams are impossible as long as drawing is deterministic.
- Invalidate on width change, display scale change, and color scheme change (dark filter, below). Not on scroll.
- Build tiles off the main thread; show the previous tile or the flat band color until ready. First visible tiles must be ready before the map appears (the art page builds the whole slice in ≈ 420 ms at 2× in a browser; budget ≤ 150 ms for the first screen on an A15).
- The minigames already pre-render per scale. Reuse that helper if it fits.

### Parallax

The foreground frame scrolls at 1.12× the world: `fgOffsetY = scrollY * 1.12`, and its tile set is
`H_fg = viewportH + (worldH − viewportH) * 1.12` tall (`env.toLayer()` in core.js does this mapping for
authoring). Pieces are placed in world y, then mapped with `y' = (y − vh/2) * 1.12 + vh/2`.

## Shadows and light (port exactly)

- One light from the top-left. Shadow ink `rgba(48,30,80,a)`; contact shadows `rgba(40,25,70,a)`.
- `cast()` = the prop's silhouette path under the shear `transform(1, 0, −0.45, −0.4, 0, 0)` drawn 3× with ±1 px jitter at ~0.07 alpha each (a cheap soft shadow). Pass the same path you fill the prop with.
- `contact()` = a squashed radial gradient at the prop's feet.
- Node cast shadow: ellipse at (+9, +17), radii 21×8, rotation 0.35, alpha 0.14, drawn before the stock node.

## Ground recipe

- Hill bands: one crest function per band, `y0 + slope·(x − 195) + a·sin(x·f + p) + 4·sin(0.051x + 2p)`, slopes alternating about ±0.3 so crests interlock with the road. Fill each band with a gradient along its slope normal (sunlit face just under the crest → base color → cooler `#4F9A86` mix lower down), a warm radial light mass upper-left and a cool shade mass lower-right, valley AO strokes above the next crest, and a 2.4 px rim light on the crest.
- **Generalize:** crests are generated per region band from the node list so that **no crest passes within 30 units of a node**; colors step from light (`#BFE6A2`) near the shore to deeper (`#8BC86F`) at level 1.
- Tonal noise: a low-res (4 units per pixel) fbm image scaled up at 40 % alpha. Generate once per tile.
- Tufts: ~1,000 for the meadow, 55 % clustered along crests, 45 % ringing landmarks.

## Critters: use the real sprites

The concept draws simplified code critters. In the app, use the existing sprites
(`Assets.xcassets/Jelly/<kind>` + `<kind>-squish`) so tap-to-squish, the sound and "Make this my avatar"
keep working. The props around them (watering can, fishing rod and float, campfire logs, stump) are new
code-drawn art from the concept.

Two poses don't exist yet: the **napping cat** (eyes closed, curled) and the **fishing hamster** (side-on,
holding a rod). Add them to `scripts/dodo-jelly/sprites.mjs` / `jelly-critters.html` as new frames, or
place the standard sprite and draw the rod and "zz" around it. The second is fine for v1.

## Ambient motion

The brief says the map is still until touched and nothing loops at the user. Living Island deliberately
adds **slow, sparse, ambient** motion. These rules keep it on the right side of that line:

- Drive it with `TimelineView(.animation(minimumInterval: 1/30))`. 30 fps is plenty for this.
- Cull: only draw elements whose anchor is within the viewport ± 80 units (the page's `inView`).
- Pause entirely when Reduce Motion is on (render t = 0, which the page also supports), in Low Power Mode, and when the map isn't the visible tab.
- No large element moves faster than the windmill sails (0.6 rad/s), and nothing flashes. Budget **< 1 ms per frame** for layers 3 + 5 on device.

| Element | Motion | Period |
|---|---|---|
| River | highlight dashes flowing along the river path | dash offset 18 u/s |
| Shore foam | breathing foam line | slow sine |
| Campfire | 3 flame tongues flicker, ember glow | 9 rad/s sine |
| Chimney smoke | 4 puffs rising and fading | ~4.5 s |
| Windmill | sails turn | 0.6 rad/s |
| Lighthouse | narrow additive cone swings ±0.9 rad over the water; lamp pulses | ~18 s swing |
| Fishing float | bob + expanding ripple ring | ~1.7 s |
| Buoys, octo, boat | bob ± 2–6 units | 4–25 s |
| Whale | spout | every 6 s |
| Jellyfish pair | drift and pulse | slow |
| Watering can | 4 drops falling | ~0.8 s |
| Bee | figure-loop between hive and flowers | ~6 s |
| Butterflies | 6, wandering near flower patches | slow |
| Cat | "z" rising over the roof | ~2.5 s |

## Dark mode

Keep today's approach (a blue night filter over the scenery; stones, critters and traveler keep their day
colors). One addition makes the night version worth seeing: **emissive things are exempt from the
filter** and glow: lighthouse lamp + beam, campfire, the cottage and windmill windows. Draw them
in a small "emissive" pass after the filtered layers.

## Interactions (v1 keeps today's; these are v2)

v1: no change to node, chest, critter, traveler or header behaviour.
v2 ideas, all touch-triggered, all one-shot, all jelly-squash + a sound from the jelly set:
tap the windmill → sails spin up and settle; tap the campfire → sparks + crackle; tap the lighthouse → beam
flash; tap the whale → spout; tap the boat → it bobs and tilts.

## Levels 15–30 are not designed yet

The concept covers levels 1–14. **Don't invent the rest in Swift.** Extend the art page first (same harness,
more levels), get it approved, then port. The direction for that page:

- **Jelly Lagoon 15–20.** Rest stop 15 is Deep Dive: a diving platform on an island with a bubble-helmet rack. Add a coral reef visible through the shallows, a lagoon village on stilts, a jelly-whale family. Gate at 20: a rope bridge or ferry dock up to the peaks.
- **Sprinkle Peaks 21–30.** Frosted foothills to snow. Landmarks: a cable-car station, a sledding run, an ice-cream cave, a hot-cocoa hut at rest stop 25 (Peck or Perish), a mountain observatory. Grape nodes. Cold-light palette (lavender sky, pink-tinted snow) with the same shadow rules.
- **Sugar Castle** above 30 stays a destination: approach path, banners, the locked door.

## Things to check in the existing code

- `PeckRegionTransitionView.swift`: if it renders the world through the same map view, the crossing gets the new art for free; if it draws its own scenery, it needs the same layers or a snapshot of them.
- `-ExportPeckWorld`: extend it to export the new layers so you can diff against `ref/E-full.png`.
- The road, gate and lagoon stones already exist. Restyle them; don't fork their geometry.

## Acceptance

1. `-ExportPeckWorld` render of levels 1–14 is recognisably the same picture as `ref/E-full.png`: same landmarks at the same levels, same light, same depth. Exact positions differ because the trail differs.
2. On device (iPhone, iOS 17+): scrolling the whole map holds 60 fps (120 on ProMotion), with no visible tile pop-in at normal scroll speed and no hitches when tiles build.
3. Memory for the map tab stays under ~150 MB with all tiles live.
4. Numerals, stars, START ribbon and signs read at a glance on every level; nothing important hides under the chrome.
5. Reduce Motion: no movement. Dark mode: night filter plus glowing emissives.
6. Light and dark screenshots of levels 1–6, the shore, and the lagoon to Bart before merging.

## Suggested order of work

1. Tiled layer cache + parallax foreground, ground layer only (hills, shadows, tonal noise, road restyle) across all 30 levels. Ship-able on its own.
2. Meadow landmarks 1–10 with the anchor system + critter sprites.
3. Shore, gate, lighthouse, pier, lagoon 11–14.
4. Ambient motion + dark-mode emissives.
5. Art page for 15–30 → approval → port.
