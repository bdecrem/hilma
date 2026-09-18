// Peck level-up transition: meadow (L10) -> Fern Hollow (L11). One tree, rendered from T.
// (Verbatim from the Claude Design project — the choreography source of truth
// for PeckRegionTransitionView.swift. CUES: Clear 0 / Walk 2.4 / Gate 5.6 /
// Settle 8.0, total 10s.)
const { useComposition, Shot, Captions, Easing, animate, clamp, CompositionStage } = window;

const MOTION = {
  glide: (o) => animate({ ...o, ease: Easing.easeInOutCubic }),
  pop: (o) => animate({ ...o, ease: Easing.easeOutBack }),
  fade: (o) => animate({ ...o, ease: Easing.easeOutCubic }),
};
const bell = (u) => (u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0);
const blinkAt = (T, t0) => { const u = (T - t0) / 0.13; return u > 0 && u < 1 ? 1 - 0.95 * Math.sin(u * Math.PI) : 1; };
const P = [[190, 1495], [240, 1360], [150, 1220], [230, 1060], [170, 930], [230, 800], [170, 700], [215, 640], [128, 596]];
// Dodo params per frame: walk s in [0,1] over Walk..Gate+0.5 (easeInOutSine),
// bounce = |sin(s*9PI)|, y -= bounce*13 + hopBell*26, stretch 0.94+0.11*bounce,
// sprout wiggle sin(ph-0.7)*9 while walking + boings at 1.5s and Gate+0.7,
// blinks at 0.6 / Settle+0.7 / Settle+0.95, pupil pop bell((T-1.0)/0.6)*0.35,
// wings 42*bell((T-1.15)/0.5) + walking 10+8*sin(2ph) + 42*bell((T-Gate-0.8)/0.6).
// Camera: translate world -camTop, camTop 800->0 over Walk+0.2 .. Gate+0.2 (easeInOutCubic).
// Clear scene at node 10 (140,1480): expanding ring (r 30->75, fade), 3 stars pop
// staggered 0.5/0.66/0.82 (easeOutBack), 10 confetti rects radiating with fall.
// Gate: banner pops (scale 0.6->1 easeOutBack, Gate+0.15..0.75), NEW REGION /
// Fern Hollow / Levels 11-20, sprout glyph; fades by Settle+0.85.
// Settle: node 11 pulse ring 0.55+0.25*sin(3.2t), START fades in Settle+0.2..0.7.
// Fireflies (5) fade in Walk+1.6..Gate, flicker sin(2.5T + i*1.7).
