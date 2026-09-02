#!/usr/bin/env python3
"""Turn a DK visualizer page (dkNNN.html) into a deterministic render harness.

The page's own draw code is untouched; we only (1) stub the <audio> element so
`audio.currentTime` is set by the renderer, (2) route the movement weights and
the congregation clock through window.__wt / window.__m2t so a 30s cut can
compress the 14s morphs, (3) keep the red-clay lattice alive while invisible so
it can be pre-warmed, (4) expose frame() for frame-by-frame stepping, and
(5) make the title/credits legible for video.  Usage:

    python3 make-harness.py dk019.html harness.html
"""
import sys
src, dst = sys.argv[1], sys.argv[2]
h = open(src).read()
reps = [
 ("const audio = new Audio('dk019.m4a');",
  "const audio = { currentTime: 0, paused: true, preload: '', play(){ this.paused = false; }, addEventListener(){} };"),
 ("const [w1, w2, w3] = weights(t);", "const [w1, w2, w3] = weights(window.__wt ?? t);"),
 ("const m2t = Math.max(0, t - (T1 - MORPH / 2));", "const m2t = Math.max(0, window.__m2t ?? (t - (T1 - MORPH / 2)));"),
 ("if (w < 0.01) { if (latN !== -1) { lctx.clearRect(0, 0, W, H); lctx2.clearRect(0, 0, W, H); latN = -1; } return; }",
  "if (w < 0.01) { return; }  // render harness: keep the pre-warmed lattice alive while invisible"),
 ("function frame(now) {\n  requestAnimationFrame(frame);", "function frame(now) {"),
 ("requestAnimationFrame(frame);\n</script>",
  "window.__frame = frame; window.__setLast = (v) => { last = v; }; window.__reset = () => { ctx.setTransform(DPR,0,0,DPR,0,0); ctx.globalAlpha = 1; ctx.globalCompositeOperation='source-over'; ctx.fillStyle='#050505'; ctx.fillRect(0,0,W,H); rings.length=0; debris.length=0; bells.length=0; };\n</script>"),
 ("color: rgba(255,255,255,0.06); z-index: 10;", "color: rgba(255,255,255,0.30); z-index: 10;"),
 ("font-size: 7px; letter-spacing: 3px; color: rgba(255,255,255,0.05); z-index: 10;", "font-size: 13px; letter-spacing: 5px; color: rgba(255,255,255,0.30); z-index: 10;"),
 ("font-size: 8px; letter-spacing: 4px;", "font-size: 13px; letter-spacing: 6px;"),
 ('<div id="overlay"><button id="play-btn">▶</button></div>', '<div id="overlay" style="display:none"><button id="play-btn">▶</button></div>'),
]
for a, b in reps:
    assert h.count(a) == 1, ("pattern count != 1", a[:60], h.count(a))
    h = h.replace(a, b)
open(dst, 'w').write(h)
print("wrote", dst, len(h))
