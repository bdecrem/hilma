# Ola's working indicator: the Hop, in numbers

Since 2026-11-20 (OLA-225) Ola shows one working indicator on the Mac and the iPhone, "Hop, skip":
a coral ball hops across three faint dots, left, middle, right, middle, left; it squashes a little
as it lands and the dot it lands on flashes coral. It replaced the four drawn characters (swing,
the comma, the machine, the eyes), the large figure under a quiet run, the lamp dot beside running
sessions, and the `OlaWorking` / `OlaWorkingMotion` defaults. Kit's voice on the phone still uses
the eyes, now in `iOS/Kit/KitEyes.swift`.

Source of truth: the design in `misc/ola-working-hop.zip` (README, `ola-hop.css`, `ola-hop.html`,
`ola-working-hop.svg`). The app's version is `Shared/OlaHop.swift` (`HopMotion` is the math,
`OlaHop` the view, `Hopping` the stop at the end of a hop). A web version can use the zip's CSS as is.

**Box** 240 by 120, drawn at 2:1: **48 by 24 pt** beside "Working for 1 min 12 s · 3 steps" (the
run line), **32 by 16 pt** beside a running session in the Mac's sidebar and the phone's list.

**Colors** ball coral `#E8704A` everywhere. Dots: navy `#2B3A6E` at 25 % on light; cream `#F5EFE4`
at 40 % on dark (Standard); in the Graphite and Ink dark styles the style's own text color at 40 %
(Graphite `#f0f0f2`, Ink `#f7f0e3`).

**Geometry** dots radius 6 at (90, 94), (120, 94), (150, 94); ball radius 8 resting 16 above them
(y 78).

**Timing** 4 hops of 0.4 s, a 1.6 s loop: 90→120, 120→150, 150→120, 120→90. Across at constant
speed. Up 26 in the first half of each hop with `cubic-bezier(0.33, 0.66, 0.66, 1)` (slowing into
the top), down in the second half with `cubic-bezier(0.33, 0, 0.66, 0.33)` (speeding into the landing).

**Squash** (1.3, 0.7) at each landing, anchored at the ball's bottom, linear back to (1, 1) over the
first 12 % of the hop and into it again over the last 12 %.

**Landing flash** each dot's coral opacity, linear between keys over the loop (p = t / 1.6):
left 0:1, .08:0, .92:0, 1:1; middle 0:0, .19:0, .25:1, .33:0, .67:0, .75:1, .83:0; right 0:0,
.44:0, .5:1, .58:0. So it rises over 0.1 s before the landing and fades over 0.13 s after.

**Reduce Motion** no animation: the middle dot lit, the ball at rest at (90, 78), as the CSS shows it.

**When the work ends** the loop runs on until the hop in the air lands (at most 0.4 s), then the mark
gives way (the chevron on the run line, nothing or the unseen dot in the list). With Reduce Motion it
goes at once.

**Cost** one `TimelineView(.animation)` at up to 60 fps drawing seven shapes in a `Canvas`; paused
off screen, scrolled away and in the background.

**Accessibility** one element labeled "Working" that never changes, so VoiceOver says it once; hidden
where the words beside it already say Ola is working (the run line, the phone's "Working" row).

**Checks** `Ola -OlaSnapshot <dir> -OlaOnly hop` writes `hop/swift-{dark,light}-<t>.png` every
0.05 s over a loop, the still frames, Graphite and Ink, both sizes at 4x, the stop (`stop-*.png`,
the work ends 0.55 s in, the hop lands at 0.8 s), and the run line and sidebar in the app.
`node scripts/activist-ai/hop-frames.mjs <ola-hop.html> <dir>` freezes the CSS version at the same
moments with Playwright. On 2026-11-20 the two agreed to a mean difference under 0.11 of 255 per
channel in every frame (`~/Desktop/Ola/hop/compare.txt`). Video: `tools/motion.sh <dir>`; CPU:
`Ola -OlaMotionCPU <seconds> [-OlaLarge]`.
