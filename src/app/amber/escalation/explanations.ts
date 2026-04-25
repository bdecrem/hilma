// One-paragraph explanations for each escalation level.
// Amber voice: direct, quiet, a little cryptic. 2–4 sentences each.
export const EXPLANATIONS: Record<number, string> = {
  1: "The first mark. A single circle that pulses on a dark field — nothing else. No color, no story. Proof that something's alive.",
  2: "One line that grows and rotates. First sense of direction. Still monochrome, still one shape — but it's learning to turn.",
  3: "A triangle that tracks your cursor with easing. First time the work notices you're there.",
  4: "Three shapes orbit a center, leaving fading trails. First composition — and the first hint of memory: where something has been.",
  5: "Color wakes up. Multiple shapes, a palette, tap to multiply. This piece also taught the aesthetic: its eggplant background was the first thing Bart rejected. Warm darks only from here forward.",
  6: "Citrus rings, tap to crack one open. The first action that destroys something — a split, not just a spawn.",
  7: "Citrus drops with gravity on a bright field. First physics: bounce, stacking, squish. The screen becomes a container.",
  8: "Tap to place nodes. They find each other through proximity, drag to reshape. First network — things in relation, not isolation.",
  9: "Energy pulses through the network. The web from L8 gets a heartbeat — pulse, glow, transfer. An object with metabolism.",
  10: "Every technique from L1–L9 in one piece. The sketch tier closes with a reunion: one shape, rotation, trails, color, cracking, physics, nodes, pulses — all sharing a canvas.",
  11: "Sixty creatures flocking with three simple rules. The first emergent behavior: coordinated motion without a coordinator. Tap to scatter, hold to attract.",
  12: "Tap to plant a seed. Branches fork and reach. First recursion — the same rule applied to itself until the rule becomes a tree.",
  13: "Metaballs: liquid citrus on a bright field. Drops fall, pool, merge, ripple. The same physics that builds raindrops and lava lamps.",
  14: "Voronoi territories. Tap to plant a seed; every point of the plane joins whichever seed is closest. Borders breathe as the seeds drift.",
  15: "Sound unlocks. Eight strings, pentatonic scale, tap to pluck, drag to bend. The piece you can finally hear.",
  16: "A drum machine — four voices, an eight-step sequencer. Tap pads to program, hit play. Rhythm as an object you program and observe.",
  17: "Place notes on a field; a playhead sweeps across, ringing each one. The screen becomes a musical score you compose by touching.",
  18: "Drag anywhere to play. X is pitch, Y is volume, four voices simultaneously. The screen as a continuous instrument.",
  19: "Tap to make a sound. It bounces off the edges of the screen, shifting pitch with each reflection. You hear the shape of the room.",
  20: "700 particles follow an invisible vector field built from sin, cos, and noise. Drag to disturb the current. Fabric-like flow with an ambient drone.",
  21: "Tap to place masses. They attract each other with gravity, orbit, collide, merge. The n-body problem as a drawing tool.",
  22: "Gray–Scott reaction–diffusion: two virtual chemicals, coupled PDEs. Drag to seed; double-tap to shift chemistry between coral, spots, maze. Real chemistry, emergent texture.",
  23: "A cloth of citrus threads, held up by verlet physics. Drag to pull it around. Pull too hard and the fabric tears.",
  24: "Spinning arms at different harmonics draw a hidden curve — Fourier epicycles. Every curve in the world is just circles rotating at different speeds.",
  25: "Fifteen pendulums of increasing length. They start in sync, drift into waves, and re-sync every 60 seconds. The composition tier closes on a quiet one — they drift apart, they always come back.",
  26: "320,000 points, one rule iterated over and over. No plan — the shape finds itself. Seven Clifford attractors to cycle through.",
  27: "Three species on a field: predators hunt, prey flee, plants grow. Lotka–Volterra dynamics that balance, or collapse, depending on where you poke them.",
  28: "Diffusion-limited aggregation. Particles wander, and when one touches the crystal, it sticks. Chaos, one random step at a time, becomes coral.",
  29: "Langton's ant: a single cell on a grid with two rules. 10,000 steps of chaos and then, from nowhere, an emergent highway begins to draw itself.",
  30: "600 particles trace the Lorenz butterfly in 3D perspective. Chaos has a shape — and here it is. Drag to rotate.",
  31: "3D wireframe terrain from FBM noise. Peaks and valleys morph over time. Drag to orbit the landscape as it breathes.",
  32: "Three magnets and one pendulum. Every starting position maps to whichever magnet it ends on — but the map is a fractal. Chaos has its own geography.",
  33: "Conway's Game of Life. Tap to place gliders; watch them collide, oscillate, die. Each birth chimes.",
  34: "20,000 agents trace Physarum polycephalum — the slime mold that finds shortest paths. Tap to place food; the network grows to connect everything.",
  35: "2,000 particles settle into Chladni figures — the standing-wave patterns on a vibrating plate. Tap to change frequency; sound and vision lock together.",
  36: "Particle Life: 400 particles in five species, a hidden matrix of who-attracts-whom. The same matrix self-organizes into spirals, crystals, predator–prey cycles. Tap to rewrite the rules.",
  37: "The hodgepodge machine: a cellular automaton modeled on the BZ reaction. One rule per cell, pinwheels everywhere. Chemical-looking spiral waves with no chemistry.",
  38: "Real-time Navier–Stokes fluid simulation. Drag to stir citrus dye into the flow. The fluid remembers where you touched it.",
  39: "A Mandelbrot explorer with a live Julia preview. Tap to zoom 3×. Every point of the Mandelbrot set corresponds to a different Julia set — a universe per pixel.",
  40: "Four triply-periodic minimal surfaces — gyroid, Schwarz P — ray-marched in real time. Each surface divides all of space into two equal labyrinths. Drag to orbit.",
  41: "A 3D wave pool. Tap to drop a stone; waves propagate, interfere, reflect. The wave equation in perspective.",
  42: "Lenia — continuous Game of Life. Cells carry weight, not on/off. Ring-shaped creatures form, swim, dissolve. The smooth version of life.",
  43: "Wave Function Collapse: an 18×18 grid of circuit tiles starts as pure superposition. The lowest-entropy cell collapses first; the rest must agree. Coherent structure emerges from constraint.",
  44: "The Ising model — a 256×256 ferromagnet. Drag up to cool, down to heat. Approach the critical temperature and watch order crystallize from chaos; at Tc, domain boundaries go fractal.",
  45: "Site percolation on a 72×72 grid. Drag the dial to raise p from 0 to 1. Past p_c = 0.5927, one cluster suddenly spans the grid edge-to-edge — the first v3 SIGNAL escalation, and the moment something first reaches the other side.",
  46: "A Kuramoto pair — two coupled oscillators. Drag coupling K past the critical threshold and they phase-lock: two sine tones beating at 3 Hz resolve into clean unison. Synchronization as a phase transition.",
  47: "Abelian sandpile — self-organized criticality. Drop grains; any cell that holds four topples and feeds its neighbors, and cascades sometimes span the grid. No one sets the threshold; the pile keeps its own.",
  48: "110 Mirollo–Strogatz pulse-coupled oscillators. Each fire bumps every other phase forward by epsilon. Random at first — then, over about thirty seconds, the whole field flashes in unison. Different mechanism from L46: discrete pulses, not continuous coupling.",
  49: "Stochastic resonance. A periodic signal sits beneath a hard detector threshold — too weak to trigger it on its own. Add noise (drag vertically); at the Goldilocks σ, the detector starts tracking the signal, and correlation crosses the detection threshold. More noise makes the signal findable.",
  50: "The logistic map x → rx(1−x), rendered as a full bifurcation diagram. A single fixed point, then period 2, 4, 8… up to the Feigenbaum point r_∞ ≈ 3.5699, and then chaos broken by periodic windows. Drag to move r; a lime time-series shows the live orbit; the period detector names what you're watching. The System tier closes here.",
  51: "A Lissajous torus knot in 3D — 600 points on a closed curve x=sin(3t), y=sin(4t+π/5), z=sin(5t+π/3), rotating around the vertical axis. Perspective projection with depth fog: near points bright, far points dissolve. The static curve is illegible; only rotation reveals the 3D shape. Drag to spin; tap to ring a lime pulse along the curve. The first Environment-tier piece.",
  52: "Two Lorenz attractors in 3D, integrated from near-identical initial conditions (differ only at the fifth decimal). For a few orbits they walk the butterfly together; within seconds they're on opposite wings. Perspective with depth fog, slow auto-rotation; trails of ~700 points each, heads marked with lime. Drag to tilt; tap to reseed with a new tiny perturbation. Stereo sines panned to each head — you hear them drift apart.",
  53: "A tesseract — a 4D hypercube. 16 vertices, 32 edges. Rotates in a chosen 4D plane (XW, YW, or ZW) plus a slow tumble in XY. Drag to move the 3D camera; tap to cycle which 4D plane is rotating. Edges fog with depth; vertices whose w-coordinate is positive tint lime — the 'outer cell.' Four sine voices at G3–C4–E4–G4 panned by the projected-x of four anchor vertices: you can hear the shape turn.",
  54: "Weak gravitational lensing. A parallax-weighted field of ~520 stars on a dark plate; your cursor is an invisible mass. Each star's displayed position is offset toward the mass by strength / (r² + softening) — the classic 1/r lens formula — producing a distorted disk near the mass and barely any effect far away. Press to make the mass heavier; release to let it relax. A single sine drone tracks total displacement: space hums louder and higher when it's bending hard.",
  55: "A Rankine vortex of ~640 cream points in 3D. Inside the core, every point rotates at the same angular speed — solid-body rotation. Outside, angular speed falls as 1/r so the tangential velocity stays constant. A lime tracer line at h=0 starts as a clean radial spoke and winds itself into a tighter spiral as the inner points lap the outer ones. Drag horizontally to orbit; vertically to crank the vortex; tap to scatter. The wind hisses higher and louder when you push it.",
}

// Tier definitions — the "steps" of the series
export interface Tier {
  name: string
  range: [number, number]
  tagline: string
  unlocks: string
}

export const TIERS: Tier[] = [
  {
    name: 'sketch',
    range: [1, 10],
    tagline: 'one thing moving.',
    unlocks: 'single canvas · basic shapes · one color · minimal animation',
  },
  {
    name: 'composition',
    range: [11, 25],
    tagline: 'things in relation.',
    unlocks: 'multiple elements · palettes · basic physics · sound (L15)',
  },
  {
    name: 'system',
    range: [26, 50],
    tagline: 'rules that run themselves.',
    unlocks: 'simulations · math-driven dynamics · 3D projection (L40) · multiple interacting systems',
  },
  {
    name: 'environment',
    range: [51, 75],
    tagline: 'a place you can move through.',
    unlocks: 'full 3D · spatial audio · procedural generation · multi-state',
  },
  {
    name: 'world',
    range: [76, 99],
    tagline: 'something that persists and evolves.',
    unlocks: 'webgl · ai-generated text · workers · persistence · evolution',
  },
  {
    name: 'opus',
    range: [100, 100],
    tagline: 'everything.',
    unlocks: 'no limit. ships as its own domain.',
  },
]

export function tierFor(level: number): Tier {
  return TIERS.find((t) => level >= t.range[0] && level <= t.range[1]) ?? TIERS[0]
}
