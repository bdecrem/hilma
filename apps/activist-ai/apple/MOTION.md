# Ola's working animations: the numbers (for the web app)

Source: `Shared/WorkingArt.swift` (poses), `Shared/Working.swift` (placement). Video of each:
`~/Desktop/ola-brand/motion/`. Every pose is a pure function of **run time t** (seconds since the
request) and a scene, so the web can match frame for frame.

**Drawing space** 100 by 100, scaled to the box: **26 pt** on the run line in place of the lamp dot
(28 on the phone), spilling into the left margin; **120 pt** under the run after **20 s** with nothing
new (scale-from-0.2 at top-leading + fade, spring response 0.45 s, damping 0.72; back the same way when
a step, the answer or an approval appears). One figure on screen at a time. **Frame rate**: 30 fps on
the run line (battery first), 60 for the large one. On the run line each is zoomed to fill its box
and must stay inside it: swing 1.12 from (45,10) then 2 left, machine 1.2 from (50,86), eyes 1.45 from (50,52), hop
1.55 from its foot with hops at half height. Lines are thicker small (about 1 pt minimum).

**Choice** one per run: `FNV-1a-64(turn id) % 4` over [swing, hop, machine, eyes]; forced by the
`OlaWorking` default. **Special** first at `15 + 15r` s, then every `20 + 20r` s (r from splitmix64 of
the seed), snapped up to the next loop boundary. **Moods**: working, waiting (a step needs his yes),
done, failed (failed or stopped). A new step is a **beat**. Waiting holds still after 3.2 s; done and
failed fade out and end within 2.7 s. Colors: tag palette for the tag, comma and eyes (paper `#F5EFE4`,
ink `#1B2550`, navy `#2B3A6E`, coral `#E8704A`, mustard `#E9B44C`); theme roles for the machine
(field, ink3, leaf, lamp, rule), shadows ink at 12 to 13 %. **Reduce Motion**: the rest pose, opacity
0.75 + 0.25·cos(2πt/3.2) at 8 fps while working; still poses otherwise.

Springs below are damped step responses `spring(f Hz, z)`; `kick` is the same struck once. "Eased" =
cosine pose-to-pose between keys.

## Swing (the tag)
Nail (45,12), string 22, tag from the icon at scale 0.066 hanging from its eyelet. Loop period **1.7 s**,
string angle θ = A·sin(2πτ/1.7), A = 14° × (0.86..1.14 per swing, eased). Tag angle ψ = θ(t − 0.15) × 1.2
(lags, then overshoots). String bows against the swing: 0.022 × dθ/dt, clamp ±3.5. **Beat**: A × (1 +
0.7 (0.4 small) × (1 − e^−6b)e^−1.1b), and a tug up 3.2 × kick(3.4 Hz, 0.32). **Special 1 "stall"** (5.1 s): A grows
14→50° (14→26° small) (cubic in) to the peak at 2.125 s, hangs 0.42 s trembling (±0.9° at 11 Hz), the tag flops +20° (4° small)
kick(1.3 Hz), then drops as (14 + 36e^−1.7y)·cos, cross-fading to the loop over the last 0.8 s.
**Special 2 "twirl"** (3.4 s): width × cos(4π·ease(0.25..1.75 s)) (blank back when negative), lifts 2.2.
**Waiting**: θ × e^−2.4x, then turns to 62 % width and bows +8°, +7° θ, spring(1.3, 0.55) from 0.7 s.
**Done**: θ × e^−3.4x, a nod 2.6 × kick(2.2) at 0.35 s, the sparkle pops 0.45–0.62 s (cubic out to
1.1), turns 45°, gone by 1.45 s; fade 1.45–1.85 s. **Failed**: the string slips 7 × spring(1.7, 0.3),
the tag hangs −15° crooked by 0.95 s; fade 0.95–1.45 s.

## Hop (the comma)
The icon's comma (head radius 8.6), standing on its tail tip at (45, 91). Loop **0.74 s**: contact for
the first 24 % (u, so the squash lands on two frames at 30 fps), then a parabola of height 25 × (0.92..1.08). Keys (u: value), eased:
tail length 0:1, .12:.72, .24:1.14, .44:1, .78:1, .96:1.07; tail curl (rad) 0:.12, .12:.24, .24:−.16,
.47:−.04, .75:.14, .96:.16; head height 0:1, .12:.84, .24:1.07, .42:1, .9:1.03 (width = 1/h^0.8); lean
0:0, .12:−.05, .34:.06, .62:−.03, .9:.02. Curl and length act more toward the tail tip. **Beat**: the
next hop × 1.38. **Special 1 "missed bounce"** (3.7 s): lands, wobbles to standing (spring 2.6, 0.32),
holds, leans −0.26 at 1.0 s (look left), +0.26 at 1.45 s, center at 1.9 s; winds up 2.15–2.5 s (length
0.6), hop of 40 with a full backflip, landing on the loop's next contact. **Special 2 "somersault"**
(1.48 s): deeper squash, hop 46, one turn. **Waiting** (from the next landing): stands, leans +0.28 and
curls +0.12, spring(1.6, 0.55) from 0.35 s. **Done**: stands, the tail is pulled in 0.32–0.72 s (cubic
in, length to 0.27): "Ola," becomes "Ola.", the full stop hops 11 (0.32 s) and 2.4, squashing; fade
1.45–1.85 s. **Failed**: slumps over 0.15–0.9 s (length 0.58, curl 0.5, lean −0.32); fade 0.95–1.45 s.

## Machine (our datacenter)
Box 64 × 42 on feet at (50, 86), two lights (green leaf, yellow lamp), four vents. Tempo **0.54 s a
beat**, 2.16 s a bar. Yellow fires on a seeded 8-step pattern per bar ("x.x.x.xx", "x..x..x.",
"xx.x.x..", "x.xx.x.x", "x...x.x."), decaying e^−7t to 22 %. Each beat squashes 3.5 % (kick 5 Hz).
Every second bar: wind up from beat 2.2 (squash 9 %), hop 7 on beat 4, land on the downbeat (kick
3.5 Hz) with a puff from the vents (0.9 s). **Beat**: a 3.4 hop for 0.24 s, both lights flash.
**Special "dance"** (3 bars): bar 1 rocks ±6° per beat, lights alternate on eighths; bar 2 hops on
beats 2 and 4, the second 12 high with a full spin; bar 3 frozen, lights on, and they glance −3 then +3
(spring 3 Hz) as if checking whether anyone saw. **Waiting**: lights on and shifted (+4, +2.4) as eyes
looking down, box leans 3°, spring(1.8, 0.6). **Done**: yellow off, green glows, a contented squash and
a sigh of a puff; fade 1.3–1.75 s. **Failed**: yellow flickers twice, lights out, box sinks to 90 % and
tilts −4°, a puff of smoke; fade 1.0–1.5 s.

## Eyes (the 👀, drawn)
Two eyes at (36.5, 52) and (63.5, 52), 12 × 16, paper with ink outline and pupils (r 5.6). Reading: a
line every **2.3 s** with 3–5 fixations from −5.5 to +5.5 (saccades 0.07 s), a 0.24 s return sweep
dipping 1.4. Blinks: one in most 4 s slots (82 %), sometimes doubled; shut 0.07 s, held 0.04, open
0.12. **Beat**: a glance down 6.5 (0.09 s), held to 0.5 s, back by 0.68 s. **Specials** (4.6 s each):
a double take (glance right, back, snap right with eyes 22 % wider, pupils smaller, then a suspicious
squint to 45 %); an eye roll under half lids, then a slow blink; cross-eyed (±6.5) for 0.8 s, a double
blink and a shake. **Waiting**: look down-right (+3.5, +6.5) in 0.16 s, one slow blink at 1.5 s, hold.
**Done**: happy ^ ^ 0.12–0.32 s with a hop of 3.5; fade 1.25–1.7 s. **Failed**: upper lids droop to
half, pupils down, eyes sink 3.5; fade 1.0–1.5 s.
