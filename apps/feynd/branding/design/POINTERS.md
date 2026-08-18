# Peck world + mascot design sources

Claude Design project "# Dodo App Logo Concepts"
(claude.ai/design/p/24e0db26-c902-42e7-b7b8-db5697b591dc), fetched 2026-08-18:

- `Peck Landscapes.dc.html` — three region maps (SVG + SMIL ambience):
  Sunrise Meadow (L1–10, dawn), Fern Hollow (L11–20, sunset), Starfall
  Summit (L21–30, night). Shared symbol defs: #trav dodo, #flag, star
  variants, locks, trees #tr1/#tr2/#pine, clouds, grass, flowers, #bun bunny.
- `Peck Level-Up.dc.html` + `peck-levelup-scene.jsx` (saved here) — the
  region transition choreography: Clear (2.4s) / Walk (3.2s) / Gate (2.4s) /
  Settle (2s). Same choreography for 20→21 with region swaps.
- `dodo-traveler.svg`, `animations-v3.jsx` (engine), `support.js` (runtime)
  remain in the Claude Design project; fetch via the DesignSync tool.
- `mascot-animation-spec.md` (saved here) — the animation bible for the
  lively dodo: groups, squash-and-stretch, idle loop, reactions, rules.

Swift ports: AnimatedDodo.swift (mascot), FlashTabView.swift (region
scenery), PeckRegionTransitionView.swift (the transition).
