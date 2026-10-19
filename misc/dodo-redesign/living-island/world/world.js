/* Living Island — the world builder for the native Peck map.

   The concept page (../E-living.html) paints a 14-level test trail of its own. This builds the
   real thing: the app's trail (PeckGeometry in apps/feynd/Feynd/PeckTrail.swift — a period-4
   zigzag, pitch 142, amp 78, level 1 at the bottom), cut into chapters of ten levels, with every
   landmark anchored to a level node instead of an absolute coordinate.

   Coordinates: world units, x across a DW-wide strip centred on the trail (CX), y down from the
   top of the art. The app centres the strip on the screen and anchors it at the bottom, so the
   manifest stores x as dx from the centre and y as yb, the distance up from the art's bottom edge.

   Layers (rendered to tiles by render.mjs):
     ground   — terrain of every chapter, side trails, rivers, islands, baked road tail (opaque)
     props    — landmarks with contact + cast shadows, painter-sorted (baked over ground)
     fg       — foreground framing at 1.12 parallax, as two screen-edge strips (transparent)
   Everything that moves, depends on progress, or carries text is native and placed from the
   manifest: road, stones, gates, bridges, signs, chests, critters, live animation, night glows. */
(function () {
  'use strict';
  const L = window.L, K = window.K, TAU = Math.PI * 2;

  /* ---------- geometry: mirrors PeckGeometry ---------- */
  const DW = 520, CX = 260, P = 142, AMP = 78, BOT = 238, NODE_BOTTOM = 130, SPACER = 108;
  const CH = 10;                       // levels per chapter
  const NB = 8;                        // bands rendered: 6 chapters + a two-band cosmos loop
  const NMAX = NB * CH;
  const TOPX = 520;                    // art above the last rendered level
  const H = BOT + (NMAX - 1) * P + TOPX;
  const zig = i => [0, -1, 0, 1][((i % 4) + 4) % 4];
  const nx = i => CX + zig(i) * AMP;
  const ny = i => H - BOT - i * P;
  /* +1 when this node's free side is canonical: a side node on the left (room to the right),
     or a centre node whose trail heads up and to the right. Anchors are authored canonically. */
  const mOf = i => zig(i) ? -zig(i) : zig(i + 1);
  /* the boundary between chapter k-1 and k: half a pitch below the chapter's first node */
  const yBound = k => k <= 0 ? H + 400 : ny(k * CH) + P / 2;

  /* the road: two quads per segment through the midpoint, exactly as PeckGeometry.trail */
  function segPts(i, n = 26) {
    const a = { x: nx(i), y: ny(i) }, b = { x: nx(i + 1), y: ny(i + 1) };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const q = (p0, c, p1, t) => ({ x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x, y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y });
    const out = [];
    for (let k = 0; k < n; k++) { const u = k / n; out.push(u < 0.5 ? q(a, { x: a.x, y: mid.y + P * 0.18 }, mid, u * 2) : q(mid, { x: b.x, y: mid.y - P * 0.18 }, b, (u - 0.5) * 2)); }
    return out;
  }
  function buildRoad() {
    // the tail below level 1 runs off the bottom edge, curving the way the trail swings next
    const pts = [];
    const t0 = { x: nx(0), y: ny(0) };
    for (let k = 10; k > 0; k--) { const u = k / 10; pts.push({ x: t0.x + 30 * u * u, y: t0.y + (BOT + 40) * u }); }
    for (let i = 0; i < NMAX - 1; i++) pts.push(...segPts(i));
    pts.push({ x: nx(NMAX - 1), y: ny(NMAX - 1) });
    let d = 0; pts[0].d = 0;
    for (let k = 1; k < pts.length; k++) { d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); pts[k].d = d; }
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1; pts[k].tx = dx / m; pts[k].ty = dy / m;
    }
    return { pts, length: d, at(dd) { dd = Math.max(0, Math.min(d, dd)); let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].d < dd) lo = m; else hi = m; } const a = pts[lo], b = pts[hi], t = (dd - a.d) / ((b.d - a.d) || 1); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: a.tx, ty: a.ty, d: dd }; } };
  }
  const road = buildRoad();
  const distToRoad = (x, y) => { let best = 1e18; const p = road.pts; for (let i = 0; i < p.length; i++) { const d = (p[i].x - x) ** 2 + (p[i].y - y) ** 2; if (d < best) best = d; } return Math.sqrt(best); };
  /* the road point whose y is closest to yy, within the stretch of levels [i0, i1] */
  function roadAtY(yy, i0, i1) { let best = null; for (const p of road.pts) { if (p.y > ny(i0) + 2 || p.y < ny(i1) - 2) continue; if (!best || Math.abs(p.y - yy) < Math.abs(best.y - yy)) best = p; } return best; }
  const nodeDist = (x, y) => { let best = 1e9; for (let i = 0; i < NMAX; i++) best = Math.min(best, Math.hypot(nx(i) - x, ny(i) - y)); return best; };

  /* ---------- chapters ---------- */
  const CHAPTERS = [];   // registered by ch-*.js, bottom to top
  function chapter(def) { CHAPTERS.push(def); }
  const chapterOf = k => CHAPTERS[Math.min(k, CHAPTERS.length - 1)];

  /* band context handed to a chapter: its levels, anchors, edges, a seeded rng */
  function band(k) {
    const i0 = k * CH, i1 = i0 + CH - 1;
    const nodes = []; for (let i = i0; i <= i1; i++) nodes.push({ i, j: i - i0, level: i + 1, x: nx(i), y: ny(i), m: mOf(i) });
    const B = {
      k, i0, i1, nodes, odd: k % 2 === 1,
      top: yBound(k + 1), bottom: Math.min(H, yBound(k)),
      /* anchor: dx toward the node's free side (mirrored when the trail swings the other way) */
      A(j, dx, dy) { const i = i0 + j; return { x: nx(i) + mOf(i) * dx, y: ny(i) + dy, m: mOf(i) }; },
      /* the same, but dx is plain screen-right (for things that must not mirror) */
      at(j, dx, dy) { const i = i0 + j; return { x: nx(i) + dx, y: ny(i) + dy }; },
      node: j => ({ x: nx(i0 + j), y: ny(i0 + j), m: mOf(i0 + j) }),
      rng: seed => L.rng(1000 * (k + 1) + seed),
      /* x mirrored about the centre on odd bands — for drawings authored on band 0's layout */
      mx: x => (k % 2 ? 2 * CX - x : x),
      roadAtY: yy => roadAtY(yy, Math.max(0, i0 - 1), Math.min(NMAX - 1, i1 + 1)),
      gate: null,
    };
    return B;
  }
  const BANDS = []; for (let k = 0; k < NB; k++) BANDS.push(band(k));

  /* ---------- the manifest the app reads ---------- */
  const M = { live: [], glows: [], critters: [], chests: {}, signs: [], gates: [], bridges: [], regions: [] };
  const toApp = (x, y) => ({ dx: +(x - CX).toFixed(1), yb: +(H - y).toFixed(1) });
  function emit(kind, o) {
    const out = { kind };
    for (const [key, v] of Object.entries(o)) {
      if (key === 'x' || key === 'y') continue;
      if (Array.isArray(v) && v.length && typeof v[0] === 'object' && 'x' in v[0]) out[key] = v.map(p => { const a = toApp(p.x, p.y); return [a.dx, a.yb]; });
      else if (v && typeof v === 'object' && 'x' in v && 'y' in v) { const a = toApp(v.x, v.y); out[key] = [a.dx, a.yb]; }
      else out[key] = v;
    }
    if ('x' in o) Object.assign(out, toApp(o.x, o.y));
    return out;
  }

  /* ---------- layer drawing ---------- */
  /* chapters paint top-down so a lower chapter's edge (a beach, a cloud lip) overlaps the one above */
  function drawGround(ctx, y0, y1) {
    for (let k = NB - 1; k >= 0; k--) {
      const B = BANDS[k], C = chapterOf(k);
      if (B.top - 700 > y1 || B.bottom + 400 < y0) continue;
      ctx.save(); C.ground(ctx, B, { y0, y1 }); ctx.restore();
    }
  }
  function drawProps(ctx, y0, y1) {
    const list = [];
    for (let k = 0; k < NB; k++) { const B = BANDS[k], C = chapterOf(k); if (C.props) C.props(B, (y, f) => list.push([y, f]), ctx); }
    list.sort((a, b) => a[0] - b[0]);
    for (const [y, f] of list) { if (y < y0 - 260 || y > y1 + 260) continue; ctx.save(); f(); ctx.restore(); }
  }
  /* foreground strips: each item is { side: -1 | 1, y (world), draw(ctx, x, y) } in strip space where the
     strip is FGW wide and x = 0 is the screen edge (inner direction = +x for the left strip). */
  const FGW = 170, FGK = 1.12;
  function fgItems() {
    const out = [];
    for (let k = 0; k < NB; k++) { const B = BANDS[k], C = chapterOf(k); if (C.fg) C.fg(B, it => out.push(it)); }
    return out;
  }

  /* ---------- manifest ---------- */
  function buildManifest() {
    for (const key of Object.keys(M)) M[key] = Array.isArray(M[key]) ? [] : {};
    for (let k = 0; k < NB; k++) {
      const B = BANDS[k], C = chapterOf(k);
      const put = {
        live: (kind, o) => M.live.push(emit(kind, o)),
        glow: (o) => M.glows.push(emit('glow', o)),
        critter: (o) => M.critters.push(emit('critter', o)),
        chest: (level, o) => { M.chests[level] = emit('chest', o); },
        sign: (o) => M.signs.push(emit('sign', o)),
        gate: (o) => M.gates.push(emit('gate', o)),
        bridge: (o) => M.bridges.push(emit('bridge', o)),
      };
      if (C.manifest) C.manifest(B, put);
      M.regions.push({ band: k, id: C.id, name: C.name, title: C.title, road: C.road || 'ribbon', night: !!C.night,
        node: C.node, gate: C.gateBanner, sign: C.sign || null, finaleSky: C.finaleSky, edge: C.edgeColor, roadStyle: C.roadStyle || null });
    }
    return {
      version: 1, DW, CX, P, AMP, BOT, NODE_BOTTOM, SPACER, CH, NB, H, FGW, FGK,
      loopFrom: 6,   // bands >= 6 repeat bands 6 and 7
      ...M,
    };
  }

  window.WORLD = {
    DW, CX, P, AMP, BOT, NODE_BOTTOM, SPACER, CH, NB, NMAX, H, TOPX, FGW, FGK,
    zig, nx, ny, mOf, yBound, segPts, road, distToRoad, nodeDist, roadAtY,
    CHAPTERS, chapter, chapterOf, BANDS, band, drawGround, drawProps, fgItems, buildManifest, emit, toApp,
  };
})();
