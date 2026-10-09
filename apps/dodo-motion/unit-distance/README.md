# One unit apart — a 45-second code animation of the unit distance problem

Built 2026-10-09 the Claude Motion way (storyboard → code animation → draft
frames → MP4) with [HyperFrames](https://hyperframes.heygen.com) 0.8.143.
The facts are Bart's Dodo topic "Unit Distance problem" (25 flash cards).

- `script.js` — **every word, number and timing.** Scenes play back to back;
  each has a `duration` and its own text, numbers and `…At` offsets (seconds
  into the scene). "Slow down the second scene" = change `duration` of
  `circles`; "change this number" = edit the field. Nothing else needs to move.
- `index.html` — the drawing: DOM text with GSAP fades, geometry on a canvas
  driven by one clock tween, HyperFrames `data-start` / `data-duration`
  clips. Only touch it for a new kind of visual.
- `player.html` — a standalone web page that plays `index.html` in real time
  (no HyperFrames runtime needed): scale-to-fit, click to replay.
- `assets/` — the two fonts (Bricolage Grotesque, JetBrains Mono, latin
  subsets) and GSAP, local so a render never needs the network.

```bash
npx hyperframes check                                   # lint + runtime + layout
npx hyperframes render -q draft -w 4 -o renders/draft.mp4
ffmpeg -i renders/draft.mp4 -vf fps=1 frames/f%02d.png  # one frame per second
ffmpeg -i renders/draft.mp4 -vf "fps=1,scale=480:-1,tile=5x9" -frames:v 1 frames/sheet.png
npx hyperframes render -q delivery -w 4 -o renders/one-unit-apart.mp4   # 1080p30
```

`HYPERFRAMES_SKIP_SKILLS=1` in front of the commands stops the CLI from
checking its skills registry on every run. `renders/` and `frames/` are not
committed; the delivered MP4 lives in `~/Desktop/dodo-motion/`.
