# Dodo Launch "Hatch": port notes

Source of truth: `dodo-launch.html`. Everything below refers to functions in its `<script>`.
Target: `LaunchSplashView` (AnimatedDodo.swift) drawing into one SwiftUI `Canvas` inside a `TimelineView(.animation)`, plus new `JellySynth` voices (FlashSFX.swift).

## 1. Architecture

- **One cue list drives picture and sound.** `CUES` is an array of `{ t, id, beat, voice, ...params }`. Visual code reads beat times only via `B[id]`, so moving a cue moves both the sound and the animation. Port it as `static let cues: [LaunchCue]` and build `B` as a `[String: Double]` dictionary (or an enum keyed by id).
- **Frames are pure functions of time.** `drawFrame(ctx, t, {night, reduce, skipAt})` has no state. Seeded RNG (`rng(seed)`, mulberry32) runs once in `LAYOUT` to place stars, flowers, tufts, pebbles, egg speckles, sparkles and caustics. Port `LAYOUT` as a `static let` built with the same mulberry32 so the layout matches the web page exactly.
- **Logical stage** is 390 × 844 pt. Scale the canvas uniformly to the view width (`size.width / 390`). The island group goes through `ISL_M` (scale 1.265 about its waterline centre, placed at y 368) and the wordmark through `WM_M` (scale 1.1, baseline at y 578), so the island + wordmark group is centred on 47 % of the screen height with a 15 pt gap between water and letters. During the exit everything also goes through the zoom matrix `Z` (anchor `FACE_Y`).

## 2. Timeline (seconds)

| t | id | picture | sound (voice) |
|---|----|---------|---------------|
| 0.00 | pad | exactly the static launch screen (icon ground gradient only) | pad: Fsus2 (F4 G4 C5) swelling, ducked to ~45 % under the prop pops (0.30-0.95), lowpass 900→2100 Hz, quiet F3 sine bonus |
| 0.02 | island | island rises from +190 pt with spring (ω 13, ζ .45), fades in over 0.14 s, shallows grow | bloop 300→184→500 Hz + 2nd harmonic |
| 0.03 | swish | | swish (bandpassed noise 300→1300 Hz) |
| 0.30 | land | jelly squash + two ripple rings (0.30, 0.44) | blub |
| 0.35 / 0.47 / 0.59 / 0.71 | tree1 / tree2 / windmill / lighthouse | prop pops: spring (ω 21, ζ .33) on scaleY, anchored at base; windmill sails spin up | pluck F4 / G4 / A4 / C5 |
| 0.83 (+.04, +.08) | mushrooms | three mushrooms pop | pluck D5 F5 G5 (40 ms apart) |
| 1.00 / 1.20 / 1.40 | wobble1-3 | egg rocks about its base (A .11 / .19 / .28 rad, 5 Hz, decay 7.5), small hop | tick 760 / 700 / 640 Hz, gain rising |
| 1.07 / 1.27 / 1.46 | crack1-3 | crack polylines draw on over 70 ms | crackle (3 / 4 / 6 micro-bursts) |
| 1.46-1.55 | | egg swells 6 % | |
| 1.55 | hatch | egg swaps for two shell halves (split along crack3) flying on arcs, spinning, landing at (-58, 26) and (66, 26); dodo pops from 45 % scale, hop 64 pt, apex 1.70, surprised eyes + "o" mouth, wing flaps; flash + ring + 14 sparkles | hatch: plop 900→280 Hz + triangle thock 460→230 Hz + wet noise + 8 bubbles (52 Hz thump as a headphone bonus); pad changes to F4 A4 C5 D5 |
| 1.58 | sparkle | | bells C5 F5 A5 C6 D6 F6, 45 ms apart |
| 1.85 | dodoLand | land squash (sy .70, spring), > < eyes + "o" for 0.32 s, tuft boing | squish |
| 1.92 / 2.05 / 2.18 / 2.31 | l1-l4 | letters of "dodo" fall 78 pt in 0.24 s and land with squash (sy .70, 3.6 Hz settle) | boing F4 / A4 / C5 / F5 |
| 2.38 / 2.52 | blink1-2 | double blink | none |
| 2.51-3.01 | bee | bee loop-de-loop right to left above the dodo (`BEE_DUR` 0.5 s); pupils track it | buzz 340 Hz triangles (panned R→L) |
| 2.42-2.92 | beam | lighthouse beam sweeps -1.0 → -2.75 rad | shimmer |
| 2.75 | hop | anticipation 60 ms, 34 pt hop, lands 3.05; tuft spins once (sway ±.42 rad, width × |cos φ|); blush ×1.9 over 0.2 s | boing C5 bending up to F5 |
| 3.05 | exit | zoom ×2.7 toward the dodo's face (easeInCubic), paper overlay from 12 % of the exit | bloom F4 A4 C5 F5 A5 (+ quiet F3) + chime F5, C6 + hop-landing knock |
| 3.40 | end | solid paper (#F8F2F8 day, #17131D night): hand off to the app | master fades from 3.50; silent by ~3.7 s |

## 3. Draw functions to add (Swift `GraphicsContext` extensions)

All are paths, gradients and ellipses; no images, no blur filters.

- `drawJellyDodo(pose:)`: **replace the body path** with the fitted silhouette in `DODO` (superellipse a 39.52, top 35.94, bottom 41.97, n 2.32, and six bumps `[angle, amp, sigma]`: tuft, brow nub, two wings, two feet). It matches dodo-sky-idle.png to 0.19 units RMS; the current core.js-style bumps were 4 units off. Sample 360 points; the tuft sigma is narrow. Shading: radial base gradient (#F2FCFF, #DCF6FF, #5EC6EC, #3FA3D3, #2689BD), inner glow at (1, 25), top-left bloom, then a "fresnel" rim drawn as 7 clipped strokes (14 → 1.5 pt) with a top-left-light to bottom-right-cool gradient, rim line .6 pt rgba(8,75,120,.5). Speculars are world-fixed (they follow the squash position but never deform). Face numbers are in `dodoFace`: eyes r 4.75 at (±14, -9), blush (±22.8, 3.4), shield beak from (±8, -.4) to tip (0, 13), nostril (0, 10.6) r 2.5, squint chevrons stroke 1.85, mouth ellipse (0, 16.6).
- Pose fields the launch needs beyond today's pose: `lift`, `eyePop`, `mouth` (size), `lookX/lookY`, `tuftDA`, `tuftAmp`, `tuftW` (spin foreshortening), `wing` (flap), `blush` multiplier, `g` (emergence scale).
- Island: `drawWater` (shallows radial, caustic cells, foam ring, ripples), `drawIslandBody` (jelly side wall, sand rim, grass, tufts, flowers). Props come straight from the Living Island page: `gumTree`, `windmillBody` + `sails`, `lighthouse`, `mushroom`, `drawBee`, plus new `nestBack`/`nestFront` (the map nest at 2×, split so the dodo sits inside) and `eggSurface`/`crackLine`/`drawShellHalf`.
- Wordmark: per-letter `fillText` with gradients. In Swift, get each glyph's `Path` from CoreText (`CTFontCreatePathForGlyph`, Fredoka SemiBold 92) and fill it with the same layers: depth copy offset +4.5 pt in #1C6E9E, a 3 pt rim stroke **under** the fill (hides Fredoka's overlapping contours), vertical sky gradient, bottom glow, and radial gloss spots (two on "d", one on "o"). Letter advances +2.5 pt tracking.
- Night: the grass uses its own blue-green gradient (#9EF0CC → #62D0AE → #3FA79A) with a lilac light mass and lilac tuft highlights. Draw island + props into `drawLayer`, tint with `.sourceAtop` rgba(34,24,90,.36), then add the recorded lights (windows, lamp, beam) with `.plusLighter`, then draw nest, egg/dodo, shells and bee untinted. The dodo, egg and wordmark keep day colors at night (same rule as the map).

## 4. Synth: voices for JellySynth

Master bus: highpass 140 Hz → 2 × lowpass 3.4 kHz → compressor (-20 dB, 2.5:1, knee 10, 5 ms / 180 ms) → makeup 0.8 → limiter (-5 dB, 20:1, 1 ms / 80 ms) → out gain (fades from `SCORE_LEN - 0.22` with τ 70 ms). Reverb: stereo convolver, 1.4 s seeded noise impulse decaying τ 0.30 s, one-pole lowpass 2.6 kHz, 12 ms pre-delay, return 0.22; each voice has a send amount.

Voices (all sines/triangles with pitch bends, or lowpassed/bandpassed seeded noise): `pluck`, `boing`, `bloop`, `swish`, `blub`, `tick`, `crackle`, `hatch`, `bells`, `squish`, `buzz`, `shimmer`, `pad`, `bloom`. Each is a short function in `V`; envelopes are `env(t0, attack, peak, tau)` = linear attack then exponential decay (`setTargetAtTime`), which maps 1:1 to an AVAudioEngine source node rendering `peak * exp(-(t - t0 - a)/tau)`. Noise is seeded (`rng(99)`), so a Swift port renders the same sound.

**Voiced for the iPhone speaker.** Every voice keeps its body between ~300 Hz and 2 kHz (plucks F4-G5 with a 300→640 Hz prop boing, letters F4-F5, bloop and blub an octave up with a 2nd harmonic, squish 560→320 Hz, bee at 340 Hz, bloom F4-A5). Low end exists only as quiet bonus layers (pad F3, bloom F3, hatch thump) above the 140 Hz master high-pass. Plucks decay τ 0.13 s (partials 0.055 / 0.035 s).

Measured (OfflineAudioContext, 48 kHz, `out/launch.wav`): peak -1.6 dBFS, RMS -15.5 dBFS over 0-3.4 s; loudest 100 ms windows are the bloom (3.1 s, -10 dBFS) and the hatch (1.6 s, -12 dBFS); under -35 dBFS by 3.6 s; energy above 3 kHz 0.0001 %. Phone-speaker simulation (HP 300 Hz 4th order, LP 8 kHz): RMS -16.2 dBFS, only 0.8 dB lost; every event's peak stands 4.7-23 dB over the bed just before it (`out/spectrogram-phone.png`, `qa/audio.py`).

## 5. Skip and Reduce Motion

- **Tap anywhere** (only before 3.05): record `skipAt = t`. The scene keeps running, the exit (zoom + paper) plays over 0.32 s from `skipAt`. Audio: fade the running chain's out gain (τ 30 ms) and immediately schedule the `exit` cue alone with `SCORE_LEN.skip` (0.62 s).
- **Reduce Motion** uses `R_CUES` and a crossfade: scene shown in its rest pose (`REST_T` = 2.66, still: no sails, twinkle or breathing; bee, beam, shells-in-flight and hops off) fades in over 0.4 s, wordmark fades in 0.70-1.10, paper crossfades 2.10-2.45. Its score is a soft pad, a two-note pluck, a three-bell figure and the bloom (peak -2.9 dBFS).

## 6. Hand-off and audio session

Play the synth only when the ambient session allows it (silent switch respected, mixes with other audio). The app fades in under solid paper at 3.40 s, so there is no seam: the splash's last frame is the app background color.

---

# Dodo Launch Quiet (`dodo-launch-quiet.html`)

The restrained cut: about 80 % less game-like. One subject (the dodo). The whole Peck reference is one level stone and one short candy-ribbon trail. Same architecture as Hatch: one cue list (`CUES`, `R_CUES`), frames as pure functions of time, seeded `LAYOUT`, the same `drawJellyDodo` (fitted silhouette), egg kit and synth engine. Built from Hatch by `qa/quiet_parts.py`, so kit or dodo fixes to Hatch carry over on a rebuild.

## Timeline (seconds)

| t | id | picture | sound |
|---|----|---------|-------|
| 0.00 | pad | the icon ground gradient only (night: dusk) | very soft pad F4 C5 → F4 A4 C5 (+ quiet F3), lowpass 800→1500 Hz |
| 0.10-0.45 | stoneIn / stone | peach jelly level stone (the map's meadow node `#FF9F4A`, same node material, no numeral) eases in 16 pt (spring ω 13, ζ .62) with one soft squash; egg sits on it | 0.30 muted pluck F4 |
| 0.55 / 0.82 | rock1 / rock2 | egg rocks gently about its base (.07 / .10 rad, 2.4 Hz, decay 6) | two quiet woody ticks (700 / 640 Hz) |
| 0.90 | crack | one hairline crack draws on over 0.12 s | none |
| 1.05 | hatch | top shell lifts 34 pt, tilts and fades (0.32 s); bottom shell melts (0.28 s); three tiny glints; dodo rises from 55 % scale with one stretch (sy 1.12) and one soft settle; idle eyes, no squish, no "o" | gentle plop (760→320 Hz) + triangle knock |
| 1.08 | interval | | warm interval C5 then F5 (80 ms apart) |
| 1.20-1.80 | word | wordmark "dodo", Fredoka SemiBold 60 pt, flat brand ink (#2D2537 / #F3EBF6), fades in while rising 8 pt as one unit | none |
| 1.25-1.78 | trail | candy-ribbon trail (cream #FFF4E3, edge #F3C9A4, pink #FF9FC8 dashes, soft shadow) draws in one easeInOut stroke from behind the stone, up and to the right | none |
| 1.45-1.75 | | pupils glance toward the star | |
| 1.62 | blink | one slow blink | none |
| 1.50-1.80 | star | faint second stone (34 % size, 55 % opacity) fades in; lemon star (r 6) pops once (spring ω 18, ζ .5) | one soft chime A5 |
| 1.95 | nod | 5 pt hop with a tiny tuft lag, no spin | none |
| 2.20-2.60 | exit | scale 1 → 1.06 about (195, 360), paper from 10 % of the exit | pad fades; master fade from 2.23 s |

## Layout

Stone top centre (195, 414), puck rx 44 / ry 15 / thickness 13. Egg ×1.32 on the stone, dodo ×1.3 with feet on the stone. Stone + dodo are centred on 44 % of the height. Wordmark baseline is 560, 74 pt below the stone. Trail: cubic Bézier (228, 424) → (304, 446) → (292, 326) → (350, 302). Second stone at (352, 300), star at (352, 278). Night shows 9 faint static stars, a lavender glow and no moon. Nothing loops: no breathing, twinkle or ambient motion.

## Draw functions (beyond Hatch)

`drawStonePuck` (side wall + top ellipse in the node material, contact + cast shadow), `drawTrail` (partial polyline by arc length; four strokes + dash), `drawStone2AndStar`, and a flat `drawWordmark` (one `Text` in Fredoka SemiBold, opacity + 8 pt offset). Shell halves reuse `drawShellHalf` with opacity only.

## Synth

New voices: `muted` (sine + soft partials τ 0.09 s, felt noise, lowpass 1.3 kHz), `plop`, `interval` (sine + triangle, τ 0.34 s, reverb send .5) and `chime` (bell partials 1 / 2 / 2.76, all under 2.5 kHz). It reuses `tick` and `pad`. The master chain is the same as Hatch (HP 140 Hz, LP 3.4 kHz, comp -20 dB 2.5:1, limiter), with makeup 0.98, limiter -5.5 dB, reverb return 0.24 and `SCORE_LEN` 2.45 s.

Measured (`out/launch-quiet.wav`): peak -4.3 dBFS, average -19.1 dBFS over 0-2.3 s, -36 dBFS at 2.3 s and -51 dBFS at 2.4 s. Energy is 27 % under 500 Hz and 73 % at 500 Hz-2 kHz, with nothing above 3 kHz. The phone-speaker simulation averages -19.5 dBFS; every event peaks 9 to 39 dB over the bed before it. Onsets land 7-19 ms after their cues.

## Skip and Reduce Motion

Tap before 2.20: a 0.3 s exit from that moment; the running chain fades (τ 30 ms), with no extra sound. Reduce Motion shows the rest pose at `REST_T` 1.93 (dodo hatched, trail drawn, star lit, no shells). The scene fades in over 0-0.4 s, the wordmark fades in at 0.55-0.95, and the scene crossfades to paper at 1.70-2.05. Its score is a pad, one muted pluck and one chime (peak -7.1 dBFS).

---

# Dodo Wake Up (`dodo-launch-wake.html`)

Character acting on the Quiet layout: the same level stone (the only Peck reference), dodo ×1.3, flat ink wordmark. 2.9 s to the app. The page is built by `qa/wake_parts.py` from the Hatch kit (dodo, synth engine, review page) plus the Quiet stone and voices, so fixes in either carry over on a rebuild.

## Additions to the shared dodo (optional pose fields, no effect when absent)

- `eyes: [left, right]`: per-eye openness, 0 closed (the gentle downward curve) to 1 open. It feeds the existing blink path, so a half-open eye is the eye squashed vertically.
- `rim`, `rimCol`: a rim light along the top-left edge, clipped to the body: two strokes, 7 pt and 2.5 pt, fading toward the centre. Warm `255,222,170` for sunrise, cool `205,215,255` for the moon.
- Wake only: the mouth moves down with its size (`16.6 + max(0, m - 1) × 1.7`) so the big yawn "o" never covers the beak tip.

## Timeline (seconds)

| t | id | picture | sound |
|---|----|---------|-------|
| 0.00 | pad | pre-dawn ground (#EAD7D2 → #E5B6A9, the icon peach dimmed and cooled); sleeping dodo fades in over 0.25 s, dimmed (source-atop rgba(52,40,104,.20)) | pad F4 C5 swelling linearly to 1.6 s, then F4 A4 C5 D5 (+ quiet F3) |
| 0.05 / 0.47 | breath1/2 | two slow breaths (sy +3 %); tuft drooped left (-0.55 rad, wider); slight sleepy lean | filtered-noise breaths (650→950→600 Hz), peaking with the inhale |
| 0.15-0.80 | z | one Fredoka "z" (26 pt) rises 54 pt, drifts right, grows, fades | 0.78 blip 900→1215 Hz |
| 0.80-1.60 | light | day: sunrise bloom grows from the top-left, ground warms to #FFECD6 → #FFC9A6, dimming lifts, warm rim on the bird. Night: dusk stays, moonlit rim brightens 0.3 → 0.8 | (pad swell) |
| 0.88-1.10 | peek | right eye opens to 55 %, squints to 30 %, shuts | tink G5 |
| 1.15-1.32 | open | both eyes open slowly | softer tink C5 |
| 1.34 / 1.42 | blink1/2 | sleepy double blink; pupils drift up-left toward the light (until 2.1-2.3) | none |
| 1.45-1.95 | yawn | stretch to sy 1.12, wing nubs lift, > < eyes (1.53-1.88), "o" mouth opens to 2.3× and closes, then release with one soft settle | the yawn: triangle + sine glide 380→640→300 Hz over 0.46 s, vibrato 6 Hz growing to ±14 Hz, breathy bandpassed noise, filter 700→1700→650 Hz |
| 1.88 | tuft | tuft springs upright (droop → 0 in 80 ms) with a damped wobble | boing C5 |
| 1.97-2.21 | shake | happy fluff-shake: ±3 pt x, ±0.035 rad roll, wing flutter, decaying over 240 ms | wobble: 560→620 Hz sine with 22 Hz tremolo + noise |
| 2.15-2.55 | word | wordmark fades in, rising 8 pt as one unit | 2.48 two-note chime C6, F5 |
| 2.21 | awake | looks at the viewer; cheeks brighten ×1.8 | none |
| 2.55-2.90 | exit | scale ≤1.06 toward the face, fade to paper | pad fades; master fade from 2.63 s |

Hand-off: Wake Up's frame 0 is the dimmed pre-dawn ground, not the plain icon gradient. Set the static launch screen to the same two pre-dawn colors, or accept a one-frame dim at start-up.

## Synth

New voices: `breath`, `blip`, `tink`, `yawn`, `wobble` and `chime2` (bell partials 1 / 2 / 2.76, under 2.5 kHz). It also uses `pad` and `boing`. The master chain matches Hatch except: compressor threshold -14 dB (looser, to keep the ticks and tinks crisp), makeup 1.5, limiter -3.5 dB, reverb return 0.24, `SCORE_LEN` 2.85 s.

Measured (`out/launch-wake.wav`): peak -4.6 dBFS, average -18.2 dBFS over 0-2.6 s. Energy is 31 % under 500 Hz and 68 % at 500 Hz-2 kHz, with nothing above 3 kHz. The phone-speaker simulation averages -18.3 dBFS; events stand 6-30 dB over the bed. Onsets land within ±35 ms of their cues; the breaths and the yawn swell later by design.

## Skip and Reduce Motion

Tap before 2.55: a 0.3 s exit from that moment and the score fades. Reduce Motion: the stone stays put while the sleeping pose (t 0.3) crossfades to the awake pose (t 2.42) over 0.60-1.00 as the light warms. The wordmark fades in at 0.95-1.35, then the scene crossfades to paper at 1.90-2.25. Its score is a pad, one breath, a tink and the two-note chime (peak -5.2 dBFS, average -19.4 dBFS).
