# Dodo mascot animation spec (from Claude Design, 2026-08-18)

Prep — restructure the SVG first. Wrap parts in named groups so they can move independently: #body (everything), #sprout (the 3 leaves, split #leaf-l, #leaf-r, #stem), #face (eyes + beak + cheeks), #eye-l/#eye-r (pupil + highlight separately: #pupil-l etc.), #beak, #wing-l, #wing-r, #feet. Animate with CSS transforms only (no path morphing needed), and set transform-box: fill-box; transform-origin: per group — body: 50% 100% (ground), leaves: 50% 100% (stem base), wings: inner shoulder edge, eyes: center.

Principles. Squash-and-stretch, never rigid translation: any vertical move squashes on landing (scale(1.06, 0.94)) and stretches at apex (scale(0.96, 1.05)). Volume stays constant — if Y scales up, X scales down. Ease with cubic-bezier(.34,1.56,.64,1) (overshoot) for pops, ease-in-out for idle. Secondary motion lags primary by 60–100ms: body bounces → sprout wiggles a beat later → cheeks settle last.

Idle loop (always on, ~3.2s): body breathes scaleY 1→1.025→1; sprout leaves counter-sway ±4° offset from each other; blink every 3–5s (randomized): pupils scaleY 1→0.05→1 over 120ms, occasionally double-blink. Every ~8s a micro look-around: both pupils shift 2px left, hold, 2px right, back.

Reactions (one-shot, triggered by app events):

- Happy / correct answer: full-body hop — anticipate (squash 80ms), jump with stretch, land with squash + sprout boing (leaves overshoot ±14° and settle with 2 damped oscillations). Wings flap out twice. 600ms total.
- Excited / streak or 3 stars: eyes pop — pupils scale(1.35) with overshoot, cheeks brighten (opacity 0.6→0.9), sprout spins one full 360° wobble.
- Thinking / waiting: body tilts 3°, one pupil drifts up-left, sprout leaves droop −6° slowly.
- Wrong answer (keep it kind): quick horizontal shake ±3px (3 cycles, 240ms), sprout flops down, one slow blink — then back to idle. Never sad longer than 1s.
- Walking (map traveler): 2px vertical bob per step with alternating 2° body roll, feet as little alternating lifts, sprout trailing the bob by 80ms.

Rules: only transform/opacity (compositor-friendly), no filters; respect prefers-reduced-motion (idle breathing only); all reactions return to idle automatically; nothing loops faster than 300ms cycles except the blink itself.
