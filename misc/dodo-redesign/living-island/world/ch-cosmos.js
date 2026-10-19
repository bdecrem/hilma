/* Chapter 6 — Candy Cosmos (levels 51–60, then 61–80, which the app loops forever: band 8 = band 6,
   band 9 = band 7, …). A deep blue-violet starfield with nebula wisps and distant ringed planets; the
   trail hops across floating candy asteroids (frosted tops, craters, rock undersides with candy strata),
   one under every level stone, on space stepping pieces (asteroid chunks and star candies).
   Landmarks: a ringed planetoid with a flag, a rocket on its pad, a dish station, a moon rover with
   tracks, a UFO over a landing ring, Deep Dive's nebula dive (55, 75, 95 …) and the space diner of
   Peck or Perish (65, 85 …).

   The loop. Everything of bands 6 and 7 is seeded by eqOf(k) = 6 + k % 2, never by k or position.
   The sky (ground) is ONE periodic function of y with period PER = yBound(6) − yBound(8) = 2840,
   phase-locked to yBound(8): every element is generated once in phase space and drawn at all its
   copies, and each band paints only its own stretch (clipped), so any band boundary is seamless and
   band 6's stretch continues straight into band 7's top. Islands and landmarks are props (never cut
   by a later chapter's ground); those of bands 6–7 stay ≥ 60 inside their band, and band 6's props are
   also drawn shifted up by PER above band 7's top, so the art above level 80 is band 8 already. */
(function () {
  'use strict';
  const L = window.L, K = window.K, W = window.WORLD, TAU = Math.PI * 2;
  const { ell, hl, jfill, jgrad, cast, contact } = K;

  const Y0 = W.yBound(8), PER = W.yBound(6) - W.yBound(8);
  const eqOf = k => (k >= 6 ? 6 + (k % 2) : k);
  const rngOf = (k, seed) => L.rng(70000 + 1000 * eqOf(k) + seed);
  const SKY = '#1A1442';
  const FROST = ['#FFB8D6', '#B8F0DC', '#D9C8FF', '#FFE9A8', '#FFC9B0', '#BFE3FF'];
  const ROCK = ['#8C70DC', '#7C6AD4', '#9474D6'];

  /* ---------- the sky: one periodic field ---------- */
  let FIELD = null;
  function field() {
    if (FIELD) return FIELD;
    const R = L.rng(60606), F = { tones: [], neb: [], wisps: [], lanes: [], stars: [], glows: [], glints: [], far: [], planets: [] };
    // decisions are made on a copy of the phase that sits on real trail (bands 4–5 have the same zigzag)
    const dr = (x, u) => W.distToRoad(x, Y0 + PER + u);
    for (let i = 0; i < 10; i++) F.tones.push({ x: (i % 2 ? 360 : 160) + (R() - 0.5) * 200, u: (i + R() * 0.7) / 10 * PER, r: 230 + R() * 150, c: i % 3 === 1 ? '#0F0C2A' : '#2C2276', a: 0.6 });
    const NC = ['#FF6FA8', '#3FD6C8', '#8A5CF0', '#FF9FD8', '#5B8CFF', '#3FD6C8'];
    for (let i = 0; i < 18; i++) {
      const side = (i + Math.floor(i / 3)) % 2 ? 1 : -1;
      F.neb.push({ x: 260 + side * (110 + R() * 170), u: (i + R()) / 18 * PER, rx: 80 + R() * 110, ry: 40 + R() * 60, rot: (R() - 0.5) * 1.4, c: NC[i % NC.length], a: 0.12 + R() * 0.1 });
    }
    for (let i = 0; i < 9; i++) {
      const u = (i + R()) / 9 * PER, side = i % 2 ? 1 : -1;
      F.wisps.push({ x: 260 + side * (60 + R() * 150), u, len: 170 + R() * 170, ang: side * (0.35 + R() * 0.5) + (R() - 0.5) * 0.3, bend: (R() - 0.5) * 90, c: ['#FF7FB8', '#5FE0D4', '#A884FF'][i % 3] });
    }
    for (let i = 0; i < 5; i++) F.lanes.push({ x: 60 + R() * 400, u: (i + R()) / 5 * PER, len: 200 + R() * 160, ang: (R() - 0.5) * 1.6, bend: (R() - 0.5) * 70 });
    const SC = ['#FFFFFF', '#FFE6F4', '#DDF6FF', '#FFF4D6', '#FFFFFF'];
    for (let i = 0; i < 1100; i++) { const x = -10 + R() * 540, u = R() * PER, r = 0.35 + R() ** 3 * 1.05; let a = 0.3 + R() * 0.6; if (dr(x, u) < 30) a *= 0.55; F.stars.push({ x, u, r, a, c: SC[i % 5] }); }
    for (let i = 0; i < 80; i++) { const x = R() * 520, u = R() * PER; F.glows.push({ x, u, r: 2.4 + R() * 4.5, c: ['#FFD6EC', '#C8F4FF', '#FFF0C8', '#E2D4FF'][i % 4], a: dr(x, u) < 40 ? 0.25 : 0.55 }); }
    for (let i = 0; i < 400 && F.glints.length < 26; i++) {
      const x = 75 + R() * 370, u = R() * PER;
      if (dr(x, u) < 52 || F.glints.some(g => Math.hypot(g.x - x, g.u - u) < 90)) continue;
      F.glints.push({ x, u, r: 3 + R() * 2.8, c: ['#FFFFFF', '#FFE2F2', '#D8F8FF', '#FFF2C4'][F.glints.length % 4], ph: R() * TAU });
    }
    for (let i = 0; i < 200 && F.far.length < 7; i++) {
      const x = 40 + R() * 440, u = R() * PER;
      if (dr(x, u) < 70 || F.far.some(g => Math.abs(g.u - u) < 260)) continue;
      F.far.push({ x, u, rx: 9 + R() * 9, c: FROST[Math.floor(R() * FROST.length)], seed: Math.floor(R() * 1e6) });
    }
    // three distant planets at the screen edges (phase positions chosen to sit clear of the landmarks)
    F.planets.push({ x: 58, u: 1250, r: 50, c: '#9C86F0', ring: '#FFD9A8', tilt: -0.32, moon: [96, -50, 7] });
    F.planets.push({ x: 474, u: 2660, r: 36, c: '#FF8FBE', ring: null, tilt: 0, moon: [-50, 30, 6] });
    F.planets.push({ x: 470, u: 650, r: 28, c: '#6FD8CC', ring: '#FFF0F8', tilt: 0.28, moon: null });
    return (FIELD = F);
  }

  function soft(ctx, x, y, rx, ry, rot, c, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, L.rgba(c, a)); g.addColorStop(0.45, L.rgba(c, a * 0.5)); g.addColorStop(1, L.rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
  }
  function wispPath(ctx, x, y, w) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(w.ang);
    ctx.beginPath(); ctx.moveTo(-w.len / 2, 0); ctx.bezierCurveTo(-w.len / 6, -w.bend, w.len / 6, w.bend, w.len / 2, w.bend * 0.2);
  }
  function glint(ctx, x, y, r, c, a) {
    ctx.fillStyle = L.rgba(c, a); ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y); ctx.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r);
    ctx.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y); ctx.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r); ctx.fill();
  }
  function planet(ctx, p, x, y) {
    const r = p.r;
    const ring = front => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.tilt); ctx.lineCap = 'round';
      const a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.8, r * 0.42, 0, a0, a1); ctx.strokeStyle = L.rgba(p.ring, 0.55); ctx.lineWidth = r * 0.2; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.62, r * 0.36, 0, a0, a1); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = r * 0.05; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.98, r * 0.47, 0, a0, a1); ctx.strokeStyle = L.rgba(p.ring, 0.25); ctx.lineWidth = r * 0.06; ctx.stroke();
      ctx.restore();
    };
    soft(ctx, x, y, r * 2.1, r * 2.1, 0, p.c, 0.16);
    if (p.ring) ring(false);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = L.mix(p.c, SKY, 0.35); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    ctx.fillStyle = jgrad(ctx, L.mix(p.c, SKY, 0.25), x, y, r); ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    for (let k = -3; k <= 3; k++) { ctx.fillStyle = L.rgba(k % 2 ? L.shade(p.c, 0.35) : L.shade(p.c, -0.25), 0.22); ctx.beginPath(); ctx.ellipse(x, y + k * r * 0.3, r * 1.3, r * 0.07 + (k % 2 ? 0 : r * 0.03), p.tilt * 0.5, 0, TAU); ctx.fill(); }
    const tg = ctx.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.5, x - r * 0.2, y - r * 0.25, r * 1.55);
    tg.addColorStop(0, 'rgba(14,10,40,0)'); tg.addColorStop(1, 'rgba(14,10,40,.78)'); ctx.fillStyle = tg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
    ctx.strokeStyle = L.rgba(L.shade(p.c, 0.5), 0.5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r - 0.8, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
    hl(ctx, x - r * 0.42, y - r * 0.48, r * 0.2, r * 0.08, -0.6, 0.4);
    if (p.ring) ring(true);
    if (p.moon) { const [mx, my, mr] = p.moon; ctx.beginPath(); ctx.arc(x + mx, y + my, mr, 0, TAU); ctx.fillStyle = jgrad(ctx, '#C9C0E8', x + mx, y + my, mr); ctx.fill(); ell(ctx, x + mx + mr * 0.25, y + my + mr * 0.2, mr * 0.3, mr * 0.22, 'rgba(60,50,110,.35)'); }
  }
  /* a tiny far-off candy island, hazed by distance */
  function farIsle(ctx, f, x, y) {
    const rx = f.rx, ry = rx * 0.5, R = L.rng(f.seed);
    soft(ctx, x, y + ry, rx * 2.4, rx * 1.6, 0, '#FF9FD8', 0.09);
    ctx.beginPath(); ctx.moveTo(x - rx, y);
    for (let k = 1; k < 8; k++) { const t = k / 8; ctx.lineTo(x + (t * 2 - 1) * rx * (1 - 0.6 * Math.sin(Math.PI * t) ** 2), y + Math.sin(Math.PI * t) * rx * (0.9 + R() * 0.5)); }
    ctx.lineTo(x + rx, y); ctx.closePath(); ctx.fillStyle = L.mix("#6A56B8", SKY, 0.35); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = L.mix(f.c, SKY, 0.3); ctx.fill();
    ctx.strokeStyle = L.rgba(L.mix(f.c, '#FFFFFF', 0.4), 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, rx - 1, ry - 1, 0, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
  }

  function sky(ctx, ya, yb) {
    const F = field();
    ctx.fillStyle = SKY; ctx.fillRect(-20, ya, W.DW + 40, yb - ya);
    const each = (u, r, fn) => { for (let n = -1; n <= 2; n++) { const y = Y0 + u + n * PER; if (y + r >= ya && y - r <= yb) fn(y); } };
    for (const t of F.tones) each(t.u, t.r, y => soft(ctx, t.x, y, t.r, t.r * 0.8, 0, t.c, t.a));
    for (const l of F.lanes) each(l.u, l.len, y => { ctx.lineCap = 'round'; for (const [w, a] of [[70, 0.1], [36, 0.12], [14, 0.1]]) { wispPath(ctx, l.x, y, l); ctx.strokeStyle = `rgba(8,6,26,${a})`; ctx.lineWidth = w; ctx.stroke(); ctx.restore(); } });
    for (const n of F.neb) each(n.u, n.rx, y => { soft(ctx, n.x, y, n.rx, n.ry, n.rot, n.c, n.a); soft(ctx, n.x + n.rx * 0.25, y - n.ry * 0.2, n.rx * 0.5, n.ry * 0.45, n.rot, L.shade(n.c, 0.3), n.a * 0.8); });
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const w of F.wisps) each(w.u, w.len, y => {
      for (const [lw, a] of [[44, 0.03], [26, 0.045], [13, 0.06], [5, 0.08], [1.3, 0.22]]) { wispPath(ctx, w.x, y, w); ctx.strokeStyle = L.rgba(w.c, a); ctx.lineWidth = lw; ctx.stroke(); ctx.restore(); }
    });
    ctx.restore();
    for (const p of F.planets) each(p.u, p.r * 2.2, y => planet(ctx, p, p.x, y));
    for (const f of F.far) each(f.u, f.rx * 2.5, y => farIsle(ctx, f, f.x, y));
    for (const s of F.stars) each(s.u, 2, y => { ctx.fillStyle = L.rgba(s.c, s.a); ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, TAU); ctx.fill(); });
    for (const s of F.glows) each(s.u, s.r * 2, y => { soft(ctx, s.x, y, s.r * 2, s.r * 2, 0, s.c, s.a * 0.6); ell(ctx, s.x, y, 0.9, 0.9, L.rgba('#FFFFFF', s.a + 0.3)); });
    for (const s of F.glints) each(s.u, s.r * 3, y => { soft(ctx, s.x, y, s.r * 2.4, s.r * 2.4, 0, s.c, 0.28); glint(ctx, s.x, y, s.r, s.c, 0.75); ell(ctx, s.x, y, 1.1, 1.1, '#FFFFFF'); });
  }

  /* ---------- floating candy asteroids ---------- */
  function makeIsle(x, y, rx, ry, R, o = {}) {
    const n = 12, prof = []; for (let k = 0; k <= n; k++) prof.push(0.72 + R() * 0.5 + (k % 3 === 1 ? 0.15 : 0));
    const craters = [], cn = o.node ? 3 : 2 + Math.floor(R() * 2);
    for (let q = 0; q < cn; q++) { const a = (o.node ? [3.75, 0.55, 2.55][q] : R() * TAU) + (R() - 0.5) * 0.4; craters.push({ a, rr: o.node ? 0.8 : 0.45 + R() * 0.4, s: o.node ? 4 + R() * 2.5 : 3 + R() * 4 }); }
    const drips = []; for (let a = 0.3 + R() * 0.25; a < Math.PI - 0.2; a += 0.45 + R() * 0.4) drips.push({ a, L: 2 + R() * (ry * 0.22), w: 4 + R() * 2.5 });
    const pits = []; for (let q = 0; q < 3; q++) pits.push({ t: 0.2 + R() * 0.6, f: 0.3 + R() * 0.45, s: 2 + R() * 2.6 });
    const crumbs = []; for (let q = 0; q < (o.node ? 2 : 3); q++) crumbs.push({ dx: (R() - 0.5) * rx * 0.9, dy: 10 + R() * 16, r: 1.8 + R() * 2.8 });
    const sprinkles = []; for (let q = 0; q < (o.node ? 7 : 5); q++) { const a = R() * TAU, rr = (o.node ? 0.78 : 0.3) + R() * (o.node ? 0.15 : 0.6); sprinkles.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, rot: R() * TAU, c: ['#FF4F86', '#FFD43A', '#5EC6EC', '#FFFFFF', '#8A5CF0'][q % 5] }); }
    return { x, y, rx, ry, depth: o.depth || ry * 1.9, prof, tip: (R() - 0.5) * 0.5, frost: o.frost || FROST[Math.floor(R() * FROST.length)], rock: o.rock || ROCK[Math.floor(R() * ROCK.length)],
      craters, drips, pits, crumbs, sprinkles: o.plain ? [] : sprinkles, halo: o.halo || (R() < 0.5 ? '#FF8FD0' : '#7FE6E0'), node: !!o.node };
  }
  function undersidePts(s) {
    const pts = [], n = s.prof.length - 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n, sn = Math.sin(Math.PI * t);
      pts.push([s.x + (t * 2 - 1) * s.rx * (1 - 0.5 * sn * sn) + s.tip * s.rx * sn * sn, s.y + s.ry * 0.25 * sn + sn ** 1.25 * s.depth * s.prof[k]]);
    }
    return pts;
  }
  function drawIsle(ctx, s) {
    const { x, y, rx, ry } = s;
    // glow of the island's little gravity well, and its orbit of dust
    soft(ctx, x, y + s.depth * 0.25, rx + 46, ry + s.depth * 0.6 + 22, 0, s.halo, 0.2);
    ctx.save(); ctx.strokeStyle = 'rgba(255,236,250,.38)'; ctx.lineWidth = 1.2; ctx.setLineDash([2.5, 7]); ctx.beginPath(); ctx.ellipse(x, y + 4, rx + 13, ry + 9, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    // crumbs drifting under the tip
    for (const c of s.crumbs) { const cx = x + c.dx + s.tip * rx * 0.5, cy = y + s.depth + c.dy; ctx.beginPath(); ctx.ellipse(cx, cy, c.r, c.r * 0.8, 0.4, 0, TAU); jfill(ctx, s.rock, cx, cy, c.r, 0.6); hl(ctx, cx - c.r * 0.35, cy - c.r * 0.35, c.r * 0.35, c.r * 0.18, -0.5, 0.6); }
    // rock underside: lit on the left, candy strata, pits
    const pts = undersidePts(s);
    const path = () => { ctx.beginPath(); ctx.moveTo(x - rx, y); for (const [px, py] of pts) ctx.lineTo(px, py); ctx.lineTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI, true); ctx.closePath(); };
    path();
    const rg = ctx.createLinearGradient(x - rx, y, x + rx * 0.7, y + s.depth);
    rg.addColorStop(0, L.shade(s.rock, 0.4)); rg.addColorStop(0.4, s.rock); rg.addColorStop(1, L.shade(s.rock, -0.42));
    ctx.fillStyle = rg; ctx.fill();
    ctx.save(); path(); ctx.clip();
    for (const [f, c, w] of [[0.42, '#FFD6EC', 3.2], [0.7, '#FFF0C8', 2.4]]) {
      ctx.beginPath(); pts.forEach(([px, py], k) => { const yy = y + (py - y) * f + 2; k ? ctx.lineTo(px, yy) : ctx.moveTo(px - 4, yy); });
      ctx.strokeStyle = L.rgba(c, 0.38); ctx.lineWidth = w; ctx.stroke();
      ctx.translate(0, w * 0.7); ctx.strokeStyle = 'rgba(30,16,70,.22)'; ctx.lineWidth = 1; ctx.stroke(); ctx.translate(0, -w * 0.7);
    }
    for (const p of s.pits) { const k = Math.round(p.t * (pts.length - 1)), px = pts[k][0], py = y + (pts[k][1] - y) * p.f + 4; ell(ctx, px, py, p.s, p.s * 0.7, 'rgba(20,10,50,.35)'); ell(ctx, px + p.s * 0.3, py + p.s * 0.25, p.s * 0.6, p.s * 0.35, L.rgba(L.shade(s.rock, 0.35), 0.5)); }
    const sg = ctx.createRadialGradient(x + rx * 0.5, y + s.depth * 0.6, 2, x + rx * 0.5, y + s.depth * 0.6, rx * 1.1);
    sg.addColorStop(0, 'rgba(16,8,44,.35)'); sg.addColorStop(1, 'rgba(16,8,44,0)'); ctx.fillStyle = sg; ctx.fillRect(x - rx, y, rx * 2, s.depth * 1.6);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,225,250,.7)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x - rx + 1, y + 2); for (const [px, py] of pts.slice(1, 6)) ctx.lineTo(px + 1.2, py - 0.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,230,255,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); for (const [px, py] of pts.slice(8)) ctx.lineTo(px - 1, py - 0.6); ctx.lineTo(x + rx - 1, y + 2); ctx.stroke();
    // the frosted top: a thick lip with drips, then the lit surface
    const f = s.frost;
    ctx.beginPath(); ctx.ellipse(x, y + 4, rx, ry, 0, 0, TAU); ctx.fillStyle = L.shade(f, -0.2); ctx.fill();
    ctx.fillStyle = L.shade(f, -0.12);
    for (const d of s.drips) { const px = x + Math.cos(d.a) * rx * 0.97, py = y + Math.sin(d.a) * ry + 2; ctx.beginPath(); ctx.moveTo(px - d.w / 2, py - 2); ctx.lineTo(px - d.w / 2, py + d.L); ctx.arc(px, py + d.L, d.w / 2, Math.PI, 0, true); ctx.lineTo(px + d.w / 2, py - 2); ctx.closePath(); ctx.fill(); hl(ctx, px - d.w * 0.15, py + d.L * 0.6, d.w * 0.14, d.L * 0.25 + 0.6, 0, 0.45); ctx.fillStyle = L.shade(f, -0.12); }
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    const tg = ctx.createLinearGradient(x - rx, y - ry, x + rx * 0.5, y + ry); tg.addColorStop(0, L.shade(f, 0.55)); tg.addColorStop(0.55, f); tg.addColorStop(1, L.shade(f, -0.1));
    ctx.fillStyle = tg; ctx.fill();
    for (const c of s.craters) {
      const cx = x + Math.cos(c.a) * rx * c.rr, cy = y + Math.sin(c.a) * ry * c.rr, r = c.s;
      ell(ctx, cx, cy, r, r * 0.55, L.rgba(L.shade(f, -0.3), 0.8));
      ell(ctx, cx + r * 0.2, cy + r * 0.12, r * 0.72, r * 0.36, L.rgba(L.shade(f, 0.2), 0.9));
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(cx, cy + 0.6, r, r * 0.55, 0, 0.2, Math.PI - 0.2); ctx.stroke();
    }
    for (const p of s.sprinkles) { ctx.save(); ctx.translate(x + p.x * rx, y + p.y * ry); ctx.rotate(p.rot); ctx.fillStyle = p.c; L.rrect(ctx, -2, -0.7, 4, 1.4, 0.7); ctx.fill(); ctx.restore(); }
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(x - 1, y - 0.8, rx - 2, ry - 2, 0, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
  }
  /* a small loose asteroid with a frosting cap */
  function rocklet(ctx, x, y, r, seed, frost) {
    const R = L.rng(seed), n = 8, rs = []; for (let k = 0; k < n; k++) rs.push(0.8 + R() * 0.35);
    soft(ctx, x, y, r * 2.4, r * 2, 0, '#FF9FD8', 0.1);
    const pth = (dy, sx, sy) => { ctx.beginPath(); for (let k = 0; k <= n; k++) { const a = k / n * TAU; ctx.lineTo(x + Math.cos(a) * r * rs[k % n] * sx, y + dy + Math.sin(a) * r * rs[k % n] * sy); } ctx.closePath(); };
    pth(0, 1, 0.9); jfill(ctx, '#7A62C8', x - r * 0.3, y - r * 0.3, r * 1.2, 0.8);
    ell(ctx, x + r * 0.3, y + r * 0.25, r * 0.22, r * 0.15, 'rgba(20,10,50,.4)');
    ctx.save(); pth(0, 1, 0.9); ctx.clip(); ctx.beginPath(); ctx.ellipse(x - r * 0.1, y - r * 0.55, r * 0.95, r * 0.5, -0.15, 0, TAU); ctx.fillStyle = jgrad(ctx, frost, x - r * 0.3, y - r * 0.7, r); ctx.fill(); ctx.restore();
    hl(ctx, x - r * 0.35, y - r * 0.55, r * 0.3, r * 0.12, -0.3, 0.8);
  }
  const castOn = (ctx, s, x, y, fn, o) => { ctx.save(); ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, TAU); ctx.clip(); cast(ctx, x, y, fn, o); ctx.restore(); };

  /* ---------- landmarks ---------- */
  function rocketPad(ctx, s, x, y, m) {
    const gx = x + m * 26;
    castOn(ctx, s, x, y, c => { c.beginPath(); c.moveTo(-9, 0); c.lineTo(-9, -44); c.quadraticCurveTo(-9, -62, 0, -72); c.quadraticCurveTo(9, -62, 9, -44); c.lineTo(9, 0); c.closePath(); }, { a: 0.2 });
    castOn(ctx, s, gx, y - 2, c => { c.beginPath(); c.rect(-5, -60, 10, 60); }, { a: 0.16 });
    contact(ctx, x, y + 1, 26, 8, 0.3);
    // pad: a candy disc with a hazard rim
    ctx.beginPath(); ctx.ellipse(x, y + 2.5, 22, 7, 0, 0, TAU); ctx.fillStyle = '#8F80C0'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y, 22, 7, 0, 0, TAU); jfill(ctx, '#ECE6FF', x - 6, y - 2, 20, 0.9);
    ctx.save(); ctx.strokeStyle = '#FF6FA8'; ctx.lineWidth = 2.2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(x, y, 18.5, 5.6, 0, 0, TAU); ctx.stroke(); ctx.restore();
    ell(ctx, x, y, 10, 3, 'rgba(60,40,110,.25)');
    // gantry: two candy-cane posts, braces, an arm to the rocket
    const ph = 60;
    for (const sx of [-4, 4]) { const px = gx + sx; ctx.fillStyle = '#FFF4EA'; L.rrect(ctx, px - 1.6, y - ph, 3.2, ph, 1.4); ctx.fill(); ctx.save(); L.rrect(ctx, px - 1.6, y - ph, 3.2, ph, 1.4); ctx.clip(); ctx.fillStyle = '#FF4F86'; for (let k = -ph; k < 4; k += 7) ctx.fillRect(px - 2, y + k, 5, 3); ctx.restore(); }
    ctx.strokeStyle = 'rgba(255,200,225,.8)'; ctx.lineWidth = 0.9; ctx.beginPath(); for (let k = 0; k < 6; k++) { const yy = y - 4 - k * 9; ctx.moveTo(gx - 4, yy); ctx.lineTo(gx + 4, yy - 9); } ctx.stroke();
    ctx.fillStyle = '#B9A6F0'; L.rrect(ctx, Math.min(gx, x + m * 8), y - 50, Math.abs(gx - x) - 8, 3, 1.2); ctx.fill();
    L.rrect(ctx, gx - 7, y - ph - 3, 14, 4, 1.6); jfill(ctx, '#B9A6F0', gx - 3, y - ph - 2, 8, 0.7);
    ctx.beginPath(); ctx.arc(gx, y - ph - 6, 2.4, 0, TAU); jfill(ctx, '#FF4F86', gx, y - ph - 6, 2.4, 0.6);
    // the rocket
    ctx.save(); ctx.translate(x, y - 3);
    ctx.strokeStyle = '#8F80C0'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(-12, 0); ctx.moveTo(7, -9); ctx.lineTo(12, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(5, -6); ctx.lineTo(6.5, -1); ctx.lineTo(-6.5, -1); ctx.closePath(); jfill(ctx, '#9A8CC4', -2, -4, 6, 0.6);
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 8.5, -24); ctx.quadraticCurveTo(sx * 19, -18, sx * 17, -4); ctx.lineTo(sx * 8.5, -9); ctx.closePath(); jfill(ctx, '#FF6FA8', sx * 11 - 2, -16, 9, 0.9); }
    const body = () => { ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-9, -44); ctx.quadraticCurveTo(-9, -62, 0, -72); ctx.quadraticCurveTo(9, -62, 9, -44); ctx.lineTo(9, -6); ctx.quadraticCurveTo(0, -3.5, -9, -6); ctx.closePath(); };
    body(); const bg = ctx.createLinearGradient(-9, 0, 9, 0); bg.addColorStop(0, '#FFFFFF'); bg.addColorStop(0.45, '#FFF2F8'); bg.addColorStop(1, '#C9B4DC'); ctx.fillStyle = bg; ctx.fill();
    ctx.save(); body(); ctx.clip();
    const ng = ctx.createLinearGradient(-9, 0, 9, 0); ng.addColorStop(0, '#FFB3D1'); ng.addColorStop(0.45, '#FF6FA8'); ng.addColorStop(1, '#C23F78');
    ctx.fillStyle = ng; ctx.fillRect(-10, -74, 20, 22); ctx.fillRect(-10, -27, 20, 4.5); ctx.fillRect(-10, -12, 20, 7);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(-6, -50, 1.8, 40);
    ctx.restore();
    body(); ctx.strokeStyle = 'rgba(120,60,110,.45)'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1.6, -22); ctx.lineTo(1.6, -22); ctx.lineTo(1.6, -5); ctx.lineTo(-1.6, -5); ctx.closePath(); jfill(ctx, '#FF4F86', -0.5, -14, 6, 0.6);
    ctx.beginPath(); ctx.arc(0, -39, 5.2, 0, TAU); ctx.fillStyle = '#B9A6F0'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -39, 3.8, 0, TAU); const pg = ctx.createRadialGradient(-1.2, -40.5, 0.4, 0, -39, 4); pg.addColorStop(0, '#FFF6C8'); pg.addColorStop(1, '#FFC24A'); ctx.fillStyle = pg; ctx.fill();
    hl(ctx, -1.4, -40.6, 1.3, 0.7, -0.5, 0.9);
    hl(ctx, -4.5, -64, 1.6, 4, 0.35, 0.7);
    ctx.restore();
  }
  function station(ctx, s, x, y, m) {
    const mx = x + m * 18;
    castOn(ctx, s, x, y, c => { c.beginPath(); L.rrect(c, -24, -24, 48, 24, 10); c.rect(m * 18 - 1.5, -54, 3, 30); }, { a: 0.18 });
    contact(ctx, x, y + 1, 30, 7, 0.3);
    // solar wing on the far side
    const wx = x - m * 40;
    ctx.strokeStyle = '#A99BD0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - m * 22, y - 14); ctx.lineTo(wx, y - 18); ctx.stroke();
    ctx.save(); ctx.translate(wx, y - 22); ctx.rotate(-0.12 * m);
    L.rrect(ctx, -10, -9, 20, 18, 2); jfill(ctx, '#5B7CF0', -4, -5, 14, 0.8);
    ctx.strokeStyle = 'rgba(220,235,255,.65)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let k = -6; k <= 6; k += 4) { ctx.moveTo(k, -9); ctx.lineTo(k, 9); } ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
    hl(ctx, -5, -6, 3, 1, -0.3, 0.6);
    ctx.restore();
    // module
    L.rrect(ctx, x - 24, y - 24, 48, 24, 10); jfill(ctx, '#F1EBFF', x - 12, y - 18, 26, 1);
    ctx.fillStyle = 'rgba(160,140,210,.35)'; ctx.fillRect(x - 24, y - 9, 48, 2);
    for (const k of [-1, 0, 1]) { const wx2 = x - m * 4 + k * 9; ctx.beginPath(); ctx.arc(wx2, y - 15, 3, 0, TAU); ctx.fillStyle = '#B9A6F0'; ctx.fill(); ctx.beginPath(); ctx.arc(wx2, y - 15, 2.2, 0, TAU); ctx.fillStyle = '#FFE08A'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x + m * 16, y - 7, 4.5, Math.PI, 0); ctx.lineTo(x + m * 16 + 4.5, y - 1); ctx.lineTo(x + m * 16 - 4.5, y - 1); ctx.closePath(); ctx.fillStyle = '#8A5CF0'; ctx.fill();
    // glass dome
    ctx.beginPath(); ctx.arc(x - m * 6, y - 24, 12, Math.PI, 0); ctx.closePath();
    const dg = ctx.createRadialGradient(x - m * 6 - 4, y - 31, 1, x - m * 6, y - 24, 13); dg.addColorStop(0, 'rgba(255,255,255,.95)'); dg.addColorStop(0.5, 'rgba(170,240,245,.7)'); dg.addColorStop(1, 'rgba(90,190,220,.85)'); ctx.fillStyle = dg; ctx.fill();
    ctx.strokeStyle = 'rgba(70,150,190,.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    ell(ctx, x - m * 6, y - 26, 3, 3, 'rgba(255,111,168,.7)'); hl(ctx, x - m * 6 - 5, y - 30, 2.4, 1.2, -0.6, 0.9);
    // mast for the dish (the dish itself is live)
    ctx.fillStyle = '#FFF4EA'; L.rrect(ctx, mx - 1.6, y - 52, 3.2, 30, 1.4); ctx.fill();
    ctx.save(); L.rrect(ctx, mx - 1.6, y - 52, 3.2, 30, 1.4); ctx.clip(); ctx.fillStyle = '#5EC6EC'; for (let k = -54; k < -20; k += 6) ctx.fillRect(mx - 2, y + k, 5, 2.6); ctx.restore();
    hl(ctx, x - 14, y - 20, 6, 1.6, 0, 0.6);
  }
  function rover(ctx, s, x, y, m, R) {
    // tracks across the frosting, from the island's edge to the wheels
    ctx.save(); ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx - 2, s.ry - 2, 0, 0, TAU); ctx.clip();
    for (const off of [-4, 4]) {
      ctx.strokeStyle = L.rgba(L.shade(s.frost, -0.35), 0.55); ctx.lineWidth = 2.2; ctx.setLineDash([2, 2.2]); ctx.beginPath();
      ctx.moveTo(x - m * 14, y + off * 0.5); ctx.quadraticCurveTo(x - m * 40, y + 10 + off, x - m * 30, s.y + s.ry + 4 + off); ctx.stroke();
      ctx.moveTo(0, 0);
    }
    ctx.setLineDash([]); ctx.restore();
    castOn(ctx, s, x, y, c => { c.beginPath(); c.rect(-17, -26, 34, 26); c.rect(m * 9 - 1, -38, 2, 12); }, { a: 0.18 });
    contact(ctx, x, y + 1, 22, 5, 0.32);
    // body + deck
    L.rrect(ctx, x - 16, y - 19, 32, 11, 4); jfill(ctx, '#5EC6EC', x - 6, y - 16, 16, 1);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(x - 13, y - 13, 26, 1.6);
    L.rrect(ctx, x - 13, y - 24, 19, 5, 1.6); jfill(ctx, '#3E5BD0', x - 6, y - 23, 9, 0.6);
    ctx.strokeStyle = 'rgba(200,220,255,.6)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let k = -9; k < 6; k += 4) { ctx.moveTo(x + k, y - 24); ctx.lineTo(x + k, y - 19); } ctx.stroke();
    // camera mast + head
    const hx = x + m * 10;
    ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(hx, y - 19); ctx.lineTo(hx, y - 33); ctx.stroke();
    L.rrect(ctx, hx - 5, y - 39, 10, 6, 2); jfill(ctx, '#FFD43A', hx - 2, y - 37, 6, 0.7);
    ctx.beginPath(); ctx.arc(hx + m * 3, y - 36, 1.7, 0, TAU); ctx.fillStyle = '#2A1F2B'; ctx.fill(); ell(ctx, hx + m * 3 - 0.5, y - 36.6, 0.5, 0.5, '#fff');
    ctx.strokeStyle = '#B9A6F0'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x - m * 10, y - 24); ctx.lineTo(x - m * 13, y - 36); ctx.stroke(); ctx.beginPath(); ctx.arc(x - m * 13, y - 37, 1.6, 0, TAU); jfill(ctx, '#FF4F86', x - m * 13, y - 37, 1.6, 0);
    // wheels
    for (const wx of [-11, 0, 11]) { ctx.beginPath(); ctx.arc(x + wx, y - 4.5, 4.8, 0, TAU); jfill(ctx, '#5A4A86', x + wx - 1, y - 6, 5, 0.8); ctx.beginPath(); ctx.arc(x + wx, y - 4.5, 1.7, 0, TAU); ctx.fillStyle = '#FFD43A'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x + m * 16, y - 14, 1.8, 0, TAU); ctx.fillStyle = '#FFF6C8'; ctx.fill();
    hl(ctx, x - 9, y - 17, 4, 1.1, 0, 0.7);
  }
  function landingRing(ctx, s, x, y) {
    ctx.save(); ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, TAU); ctx.clip();
    for (const [f, a] of [[0.62, 0.5], [0.36, 0.4]]) { ctx.strokeStyle = L.rgba(L.shade(s.frost, -0.3), a); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, s.rx * f, s.ry * f, 0, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = L.rgba(L.shade(s.frost, -0.3), 0.4); ctx.lineWidth = 1.4; ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; ctx.moveTo(x + Math.cos(a) * s.rx * 0.36, y + Math.sin(a) * s.ry * 0.36); ctx.lineTo(x + Math.cos(a) * s.rx * 0.62, y + Math.sin(a) * s.ry * 0.62); } ctx.stroke();
    ctx.restore();
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, lx = x + Math.cos(a) * s.rx * 0.78, ly = y + Math.sin(a) * s.ry * 0.78; ctx.beginPath(); ctx.arc(lx, ly - 1, 1.8, 0, TAU); jfill(ctx, '#FFD43A', lx, ly - 1, 1.8, 0.5); }
  }
  function planetoid(ctx, p) {
    const { x, y, r, c, ring } = p;
    soft(ctx, x, y, r * 2.2, r * 2.2, 0, c, 0.22);
    const rr = front => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.22); ctx.lineCap = 'butt';
      const a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.75, r * 0.46, 0, a0, a1); ctx.strokeStyle = front ? '#FFF4EA' : '#D9C8E8'; ctx.lineWidth = 6; ctx.stroke();
      ctx.setLineDash([5, 5]); ctx.strokeStyle = front ? ring : L.shade(ring, -0.3); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.75 + 3, r * 0.46 + 2.4, 0, a0, a1); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.restore();
    };
    rr(false);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); jfill(ctx, c, x, y, r, 1.2);
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    ctx.lineWidth = r * 0.22; ctx.strokeStyle = 'rgba(255,255,255,.28)';
    for (const k of [-0.5, 0.15, 0.75]) { ctx.beginPath(); ctx.arc(x - r * 1.2, y + r * k * 1.4 - r * 0.8, r * 1.5, -0.2, 0.9); ctx.stroke(); }
    for (const [dx, dy, cr] of [[0.35, 0.25, 0.18], [-0.3, 0.45, 0.12], [0.5, -0.25, 0.1]]) { ell(ctx, x + dx * r, y + dy * r, cr * r, cr * r * 0.8, L.rgba(L.shade(c, -0.35), 0.6)); ell(ctx, x + dx * r + cr * r * 0.2, y + dy * r + cr * r * 0.2, cr * r * 0.6, cr * r * 0.45, L.rgba(L.shade(c, 0.25), 0.7)); }
    const tg = ctx.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.7, x - r * 0.2, y - r * 0.2, r * 1.6); tg.addColorStop(0, 'rgba(30,14,70,0)'); tg.addColorStop(1, 'rgba(30,14,70,.5)'); ctx.fillStyle = tg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
    hl(ctx, x - r * 0.42, y - r * 0.5, r * 0.28, r * 0.12, -0.6, 0.85);
    rr(true);
    // the flag someone planted at the top, and a little round door
    const fx = x + r * 0.22, fy = y - r * 0.975;
    ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(fx, fy + 1); ctx.lineTo(fx, fy - 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx, fy - 20); ctx.quadraticCurveTo(fx + 7, fy - 19, fx + 12, fy - 16); ctx.quadraticCurveTo(fx + 7, fy - 14, fx, fy - 13); ctx.closePath(); jfill(ctx, '#FFD43A', fx + 4, fy - 17, 7, 0.7);
    L.star(ctx, fx + 5, fy - 16.5, 2, '#FF6FA8');
    ctx.beginPath(); ctx.arc(x - r * 0.15, y + r * 0.62, 4.4, Math.PI, 0); ctx.lineTo(x - r * 0.15 + 4.4, y + r * 0.62 + 4); ctx.lineTo(x - r * 0.15 - 4.4, y + r * 0.62 + 4); ctx.closePath(); ctx.fillStyle = '#8A1F4E'; ctx.fill();
    ell(ctx, x - r * 0.15 + 2, y + r * 0.62 + 1, 0.8, 0.8, '#FFD43A');
  }
  function nebulaPool(ctx, x, y) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    soft(ctx, x, y, 66, 34, -0.2, '#FF6FA8', 0.5); soft(ctx, x + 12, y + 6, 48, 24, 0.3, '#3FD6C8', 0.45); soft(ctx, x - 8, y - 4, 30, 15, 0, '#E6D4FF', 0.55);
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let q = 0; q <= 30; q++) { const a = q / 30 * 4.2 + k * 2.1, rr = 4 + q * 1.5; ctx.lineTo(x + Math.cos(a) * rr * 1.5, y + Math.sin(a) * rr * 0.75); } ctx.strokeStyle = ['rgba(255,190,225,.35)', 'rgba(150,255,240,.3)', 'rgba(220,200,255,.3)'][k]; ctx.lineWidth = 2.4; ctx.stroke(); }
    ctx.restore();
    const R = L.rng(Math.round(x * 13 + y));
    for (let k = 0; k < 14; k++) { const a = R() * TAU, rr = Math.sqrt(R()); ell(ctx, x + Math.cos(a) * 54 * rr, y + Math.sin(a) * 26 * rr, 0.9, 0.9, 'rgba(255,255,255,.85)'); }
  }
  function diveTower(ctx, s, x, y, m) {
    castOn(ctx, s, x, y, c => { c.beginPath(); c.rect(-12, -58, 24, 58); }, { a: 0.18 });
    contact(ctx, x, y + 1, 20, 5, 0.3);
    ctx.save(); ctx.translate(x, y);
    for (const sx of [-10, 7]) { ctx.fillStyle = '#FFF4EA'; L.rrect(ctx, sx, -56, 3.4, 56, 1.6); ctx.fill(); ctx.save(); L.rrect(ctx, sx, -56, 3.4, 56, 1.6); ctx.clip(); ctx.fillStyle = '#3FD6C8'; for (let k = -60; k < 4; k += 7) ctx.fillRect(sx - 1, k, 6, 3); ctx.restore(); }
    for (let k = 0; k < 4; k++) { ctx.fillStyle = '#B9A6F0'; L.rrect(ctx, -9, -12 - k * 12, 18, 2.4, 1); ctx.fill(); }
    L.rrect(ctx, -14, -60, 28, 6, 2); jfill(ctx, '#FF6FA8', -6, -60, 14, 0.9);
    // the board reaches out over the nebula
    ctx.save(); ctx.scale(m, 1);
    L.rrect(ctx, -40, -61, 30, 3.6, 1.8); ctx.fillStyle = '#FFE9A8'; ctx.fill(); ctx.strokeStyle = 'rgba(160,110,60,.45)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.restore();
    // a lamp on a curl of candy
    ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(m * 12, -60); ctx.quadraticCurveTo(m * 12, -76, m * 4, -76); ctx.stroke();
    ctx.beginPath(); ctx.arc(m * 4, -73, 3.4, 0, TAU); jfill(ctx, '#FFE08A', m * 4, -73, 3.4, 0.6);
    hl(ctx, -8, -58, 3, 1, 0, 0.7);
    ctx.restore();
  }
  function helmetRack(ctx, s, x, y) {
    castOn(ctx, s, x, y, c => { c.beginPath(); c.rect(-21, -30, 42, 30); }, { a: 0.14 });
    contact(ctx, x, y + 1, 22, 4, 0.28);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#B9A6F0'; ctx.fillRect(-20, -14, 2.4, 14); ctx.fillRect(18, -14, 2.4, 14); L.rrect(ctx, -21, -16, 43, 3.2, 1.4); ctx.fill();
    for (const [hx, c] of [[-12, '#FF6FA8'], [0, '#FFD43A'], [12, '#3FD6C8']]) {
      ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(hx + 3, -27); ctx.lineTo(hx + 5, -33); ctx.stroke(); ctx.beginPath(); ctx.arc(hx + 5, -33.5, 1.4, 0, TAU); ctx.fillStyle = c; ctx.fill();
      ctx.beginPath(); ctx.arc(hx, -22, 6.4, 0, TAU);
      const g = ctx.createRadialGradient(hx - 2, -25, 0.5, hx, -22, 7); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.6, 'rgba(210,225,255,.55)'); g.addColorStop(1, 'rgba(150,170,240,.8)');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(90,100,190,.6)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = c; L.rrect(ctx, hx - 5, -17.5, 10, 2.8, 1.2); ctx.fill();
      hl(ctx, hx - 2.4, -25, 1.8, 1, -0.5, 0.95);
    }
    ctx.restore();
  }
  function diner(ctx, s, x, y, m) {
    castOn(ctx, s, x, y, c => { c.beginPath(); L.rrect(c, -32, -32, 64, 32, 12); c.rect(-m * 22 - 1, -58, 2, 30); }, { a: 0.18 });
    contact(ctx, x, y + 1, 36, 7, 0.32);
    // a candy trailer diner: chrome-pink capsule, mint belt, a row of warm windows, a striped awning
    const body = () => L.rrect(ctx, x - 32, y - 30, 64, 27, 12);
    body(); const bg = ctx.createLinearGradient(0, y - 30, 0, y - 3); bg.addColorStop(0, '#FFF2F8'); bg.addColorStop(0.5, '#FFC2DC'); bg.addColorStop(1, '#E76FA2'); ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(138,31,78,.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); body(); ctx.clip(); ctx.fillStyle = '#7FE0C8'; ctx.fillRect(x - 33, y - 12, 66, 4); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x - 33, y - 12, 66, 1); ctx.restore();
    for (let k = 0; k < 4; k++) { const wx = x - m * 20 + m * k * 10 - 3.5; L.rrect(ctx, wx, y - 24, 7, 8, 2.4); ctx.fillStyle = '#8A1F4E'; ctx.fill(); L.rrect(ctx, wx + 0.8, y - 23.2, 5.4, 6.4, 2); ctx.fillStyle = '#FFE08A'; ctx.fill(); }
    // awning over the windows
    const ax0 = Math.min(x - m * 24, x + m * 14), ax1 = Math.max(x - m * 24, x + m * 14);
    for (let q = ax0, n = 0; q < ax1; q += 5, n++) { ctx.beginPath(); ctx.moveTo(q, y - 28); ctx.lineTo(q + 5, y - 28); ctx.lineTo(q + 5, y - 25); ctx.arc(q + 2.5, y - 25, 2.5, 0, Math.PI); ctx.closePath(); ctx.fillStyle = n % 2 ? '#FFFFFF' : '#FF4F86'; ctx.fill(); }
    // door at the trail end
    const dx = x + m * 24; L.rrect(ctx, dx - 4, y - 21, 8, 17, 3); ctx.fillStyle = '#8A1F4E'; ctx.fill(); L.rrect(ctx, dx - 2.6, y - 19, 5.2, 6, 2); ctx.fillStyle = '#FFE08A'; ctx.fill();
    hl(ctx, x - 18, y - 27, 9, 1.4, -0.05, 0.75);
    // the rooftop star on a pole (its glow is native)
    const sx = x - m * 22;
    ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx, y - 29); ctx.lineTo(sx, y - 46); ctx.stroke();
    L.star(ctx, sx, y - 52, 9, '#FFD43A', '#FF6FA8'); hl(ctx, sx - 2.5, y - 55, 2, 1, -0.5, 0.8);
    // two stools out front
    for (const k of [0, 1]) { const tx = x - m * 6 + m * k * 12, ty = y + 9; contact(ctx, tx, ty + 0.5, 5, 1.6, 0.3); ctx.fillStyle = '#B9A6F0'; ctx.fillRect(tx - 0.8, ty - 6, 1.6, 6); ctx.beginPath(); ctx.ellipse(tx, ty - 6.5, 4, 1.8, 0, 0, TAU); jfill(ctx, '#FF6FA8', tx - 1, ty - 7, 4, 0.5); }
  }
  function lampPost(ctx, s, x, y) {
    castOn(ctx, s, x, y, c => { c.beginPath(); c.rect(-1.5, -26, 3, 26); }, { a: 0.16 });
    contact(ctx, x, y + 1, 6, 2, 0.3);
    ctx.fillStyle = '#FFF4EA'; L.rrect(ctx, x - 1.5, y - 26, 3, 26, 1.2); ctx.fill();
    ctx.save(); L.rrect(ctx, x - 1.5, y - 26, 3, 26, 1.2); ctx.clip(); ctx.fillStyle = '#FF6FA8'; for (let k = -28; k < 2; k += 5) ctx.fillRect(x - 2, y + k, 4, 2.2); ctx.restore();
    ctx.beginPath(); ctx.arc(x, y - 29, 4, 0, TAU); jfill(ctx, '#FFE08A', x, y - 29, 4, 0.6); hl(ctx, x - 1.3, y - 30.5, 1.2, 0.7, -0.5, 0.9);
  }

  /* ---------- layout, per band (bands 6 and 7 seeded by parity only) ---------- */
  function geom(B) {
    if (B._cg) return B._cg;
    const e = eqOf(B.k), R = rngOf(B.k, 1), g = { e, isles: [], rocks: [] };
    const isle = (p, rx, ry, o = {}) => { const s = makeIsle(p.x, p.y, rx, ry, R, o); s.m = p.m; g.isles.push(s); return s; };
    g.nodeIsles = B.nodes.map((n, j) => isle({ x: n.x, y: n.y + 10, m: n.m }, 46, 26, { node: true, depth: 38, frost: FROST[(j * 2 + e) % FROST.length] }));
    const A = (j, dx, dy) => B.A(j, dx, dy);
    if (e === 5) {
      g.planet = Object.assign(A(0, 126, -40), { r: 25, c: '#B994FF', ring: '#FF6FA8' });
      g.chest1 = isle(A(1, 96, 30), 26, 15, { depth: 22, plain: true });
      g.sign = isle(A(2, 104, 40), 30, 17, { depth: 26 });
      g.rocket = isle(A(3, 142, 30), 48, 26);
      g.dive = isle(A(4, -122, -26), 56, 28);
      g.chest5 = isle(A(5, 92, 24), 26, 15, { depth: 22, plain: true });
      g.station = isle(A(6, 136, 46), 54, 27);
      g.rover = isle(A(7, 150, -6), 50, 27);
      g.ufo = isle(A(8, -136, -10), 40, 22);
      g.beacon = isle(A(9, 128, 34), 22, 13, { depth: 22 });
      g.comet = [A(2, -150, -96), A(1, -40, 46)];
    } else if (e === 6) {
      g.station = isle(A(0, 130, -34), 52, 26);
      g.chest1 = isle(A(1, 96, 30), 26, 15, { depth: 22, plain: true });
      g.sign = isle(A(2, 104, 40), 30, 17, { depth: 26 });
      g.planet = Object.assign(A(3, 150, 20), { r: 24, c: '#7FE0C8', ring: '#FFD43A' });
      g.diner = isle(A(4, -112, -34), 62, 32);
      g.chest5 = isle(A(5, 92, 24), 26, 15, { depth: 22, plain: true });
      g.rocket = isle(A(6, 136, 42), 48, 26);
      g.ufo = isle(A(7, 150, -6), 40, 22);
      g.rover = isle(A(8, -136, -10), 50, 27);
      g.comet = [A(5, -150, -60), A(4, -30, 60)];
    } else {
      g.rover = isle(A(0, 126, -34), 50, 27);
      g.chest1 = isle(A(1, 96, 30), 26, 15, { depth: 22, plain: true });
      g.sign = isle(A(2, 104, 40), 30, 17, { depth: 26 });
      g.station = isle(A(3, 146, 26), 52, 26);
      g.dive = isle(A(4, -122, -26), 56, 28);
      g.chest5 = isle(A(5, 92, 24), 26, 15, { depth: 22, plain: true });
      g.planet = Object.assign(A(6, 134, 40), { r: 25, c: '#FF9FC8', ring: '#3FD6C8' });
      g.rocket = isle(A(7, 150, -2), 48, 26);
      g.ufo = isle(A(8, -136, -10), 40, 22);
      g.comet = [A(6, -150, -70), A(5, -40, 50)];
    }
    // loose asteroids in the open sky, clear of the trail, the islands and (for the loop) the band edges
    const lo = B.top + (e >= 6 ? 70 : 20), hi = B.bottom - (e >= 6 ? 70 : 40);
    for (let i = 0; i < 300 && g.rocks.length < 6; i++) {
      const x = 70 + R() * 380, y = lo + R() * (hi - lo), r = 4 + R() * 7;
      if (W.distToRoad(x, y) < 50 || W.nodeDist(x, y) < 70) continue;
      if (g.isles.some(s => Math.abs(x - s.x) < s.rx + 26 && y > s.y - s.ry - 60 && y < s.y + s.depth + 30)) continue;
      if (g.planet && Math.hypot(x - g.planet.x, y - g.planet.y) < 80) continue;
      if (g.rocks.some(q => Math.hypot(q.x - x, q.y - y) < 70)) continue;
      g.rocks.push({ x, y, r, seed: Math.floor(R() * 1e6), frost: FROST[Math.floor(R() * FROST.length)] });
    }
    // the gate where the trail leaves the band (segPts works past the last rendered level, for band 7)
    const yb = W.yBound(B.k + 1), sp = W.segPts(B.i1, 80);
    let best = sp[0]; for (const p of sp) if (Math.abs(p.y - yb) < Math.abs(best.y - yb)) best = p;
    const q = sp[Math.min(sp.length - 1, sp.indexOf(best) + 1)];
    g.gate = { x: best.x, y: best.y, ang: Math.atan2(q.y - best.y, q.x - best.x) };
    return (B._cg = g);
  }

  /* every prop of a band, offset by dy (band 6 is drawn again one period up, above level 80) */
  function bandProps(B, add, ctx, dy) {
    const g = geom(B), m = s => s.m;
    const at = (y, fn) => add(y + dy, () => { ctx.translate(0, dy); fn(); });
    for (const s of g.isles) at(s.y - s.ry - 3, () => drawIsle(ctx, s));
    for (const r of g.rocks) at(r.y, () => rocklet(ctx, r.x, r.y, r.r, r.seed, r.frost));
    if (g.planet) at(g.planet.y + g.planet.r, () => planetoid(ctx, g.planet));
    if (g.rocket) { const s = g.rocket; at(s.y + 2, () => rocketPad(ctx, s, s.x - m(s) * 6, s.y + 2, m(s))); }
    if (g.station) { const s = g.station; at(s.y + 2, () => station(ctx, s, s.x, s.y + 2, m(s))); }
    if (g.rover) { const s = g.rover; at(s.y + 4, () => rover(ctx, s, s.x + m(s) * 6, s.y + 4, m(s))); }
    if (g.ufo) { const s = g.ufo; at(s.y - s.ry, () => landingRing(ctx, s, s.x, s.y)); }
    if (g.dive) {
      const s = g.dive;
      at(s.y - s.ry - 4, () => nebulaPool(ctx, s.x - m(s) * 22, s.y + 74));
      at(s.y - 4, () => diveTower(ctx, s, s.x - m(s) * 24, s.y - 4, m(s)));
      at(s.y + 10, () => helmetRack(ctx, s, s.x + m(s) * 6, s.y + 14));
    }
    if (g.diner) { const s = g.diner; at(s.y + 2, () => diner(ctx, s, s.x - m(s) * 16, s.y + 2, m(s))); }
    if (g.beacon) { const s = g.beacon; at(s.y, () => lampPost(ctx, s, s.x, s.y)); }
  }
  function props(B, add, ctx) {
    bandProps(B, add, ctx, 0);
    if (B.k === 7) bandProps(W.BANDS[6], add, ctx, -PER);
  }

  /* ---------- ground: the sky, clipped to this band's own stretch ---------- */
  function ground(ctx, B) {
    const ya = B.k === 7 ? B.top - 700 : B.top, yb = B.k === 5 ? B.bottom + 300 : B.bottom;
    ctx.save(); ctx.beginPath(); ctx.rect(-20, ya, W.DW + 40, yb - ya); ctx.clip();
    sky(ctx, ya, yb);
    ctx.restore();
  }

  /* ---------- foreground: big candy asteroids drifting past the screen edges ---------- */
  function fg(B, put) {
    const n = j => B.node(j).y, e = eqOf(B.k);
    const chunk = (o, x, y, R, side) => {
      const cx = x + (side < 0 ? 16 : -16), r = 26 + R() * 10, k = 9, rs = []; for (let q = 0; q < k; q++) rs.push(0.8 + R() * 0.35);
      const pth = dy => { o.beginPath(); for (let q = 0; q <= k; q++) { const a = q / k * TAU; o.lineTo(cx + Math.cos(a) * r * rs[q % k], y + dy + Math.sin(a) * r * rs[q % k] * 0.85); } o.closePath(); };
      pth(0); o.fillStyle = jgrad(o, '#4A3A8A', cx - r * 0.3, y - r * 0.3, r * 1.3); o.fill();
      o.save(); pth(0); o.clip(); o.beginPath(); o.ellipse(cx - 4, y - r * 0.6, r * 0.95, r * 0.45, -0.1, 0, TAU); o.fillStyle = jgrad(o, side < 0 ? '#E58AB4' : '#8FCFC2', cx - r * 0.3, y - r * 0.8, r); o.fill();
      ell(o, cx + r * 0.2, y + r * 0.2, r * 0.18, r * 0.12, 'rgba(10,6,30,.45)'); ell(o, cx - r * 0.3, y + r * 0.35, r * 0.12, r * 0.08, 'rgba(10,6,30,.4)'); o.restore();
      hl(o, cx - r * 0.4, y - r * 0.6, r * 0.25, r * 0.08, -0.2, 0.5);
      const px = cx + (side < 0 ? r + 10 : -r - 10), py = y + r * 0.7; o.beginPath(); o.arc(px, py, 5, 0, TAU); o.fillStyle = jgrad(o, '#5A4A9A', px - 1, py - 1, 6); o.fill();
    };
    const spots = e === 5 ? [[-1, n(1) + 40], [1, n(3) - 30], [-1, n(6) + 20], [1, n(8) + 30]]
      : e === 6 ? [[1, n(1) + 30], [-1, n(4) + 60], [1, n(7) + 10]] : [[-1, n(2) + 20], [1, n(5) + 40], [-1, n(8) - 10]];
    for (const [side, y] of spots) put({ side, y, draw: chunk });
  }

  /* ---------- manifest ---------- */
  function manifest(B, put) {
    const g = geom(B), m = s => s.m, F = field();
    // twinkles on the brightest glints of this band's stretch (same phase → same stars in the loop)
    for (const s of F.glints) for (let n = -1; n <= 2; n++) { const y = Y0 + s.u + n * PER; if (y > B.top + 20 && y < B.bottom - 20) put.live('glimmer', { x: s.x, y, r: +s.r.toFixed(2), ph: +s.ph.toFixed(2), c: s.c }); }
    put.live('comet', { x: g.comet[0].x, y: g.comet[0].y, to: { x: g.comet[1].x, y: g.comet[1].y }, per: 34, ph: g.e * 7 });
    if (g.station) { const s = g.station; put.live('dish', { x: s.x + m(s) * 18, y: s.y + 2 - 55, s: 1, ph: g.e }); put.glow({ x: s.x - m(s) * 4, y: s.y - 13, r: 22, c: '#FFE08A' }); put.glow({ x: s.x - m(s) * 6, y: s.y - 26, r: 16, c: '#9BE8F0' }); }
    if (g.ufo) { const s = g.ufo; put.live('ufo', { x: s.x, y: s.y - 52, h: 52 }); }
    if (g.rocket) { const s = g.rocket, rx = s.x - m(s) * 6; put.glow({ x: rx, y: s.y - 40, r: 14, c: '#FFD27A' }); put.glow({ x: rx + m(s) * 26, y: s.y - 64, r: 10, c: '#FF6FA8' }); put.glow({ x: rx, y: s.y - 2, r: 20, c: '#FF9FD8' }); }
    if (g.rover) { const s = g.rover; put.glow({ x: s.x + m(s) * 22, y: s.y - 10, r: 14, c: '#FFF6C8' }); }
    if (g.diner) { const s = g.diner; put.glow({ x: s.x - m(s) * 21, y: s.y - 18, r: 34, c: '#FFD27A' }); put.glow({ x: s.x - m(s) * 38, y: s.y - 50, r: 22, c: '#FFE45A' }); }
    if (g.dive) { const s = g.dive; put.glow({ x: s.x - m(s) * 20, y: s.y - 77, r: 14, c: '#FFE08A' }); put.glow({ x: s.x - m(s) * 22, y: s.y + 74, r: 50, c: '#FF8FD0' }); }
    if (g.beacon) { const s = g.beacon; put.glow({ x: s.x, y: s.y - 29, r: 16, c: '#FFE08A' }); }
    // critters, with jobs
    if (g.planet) put.critter({ kind: g.e === 6 ? 'blob' : 'dodo', x: g.planet.x - g.planet.r * 0.2, y: g.planet.y - g.planet.r + 1, size: 32 });   // planted the flag
    if (g.rocket) { const s = g.rocket; put.critter({ kind: 'dragon', x: s.x + m(s) * 24, y: s.y + 12, size: 38 }); }           // fires up the engines
    if (g.station) { const s = g.station; put.critter({ kind: 'bat', x: s.x + m(s) * 18, y: s.y - 70, size: 28, path: 'loop', rx: 26, ry: 8 }); }  // circles the dish
    if (g.ufo) { const s = g.ufo; put.critter({ kind: 'sprite', x: s.x + m(s) * 34, y: s.y - 30, size: 30, float: true }); }      // waves the saucer in
    if (g.dive) { const s = g.dive; put.critter({ kind: 'octo', x: s.x - m(s) * 30, y: s.y + 82, size: 30, float: true }); }        // swims in the nebula
    if (g.rover && g.e !== 6) { const s = g.rover; put.critter({ kind: 'blob', x: s.x - m(s) * 22, y: s.y + 14, size: 30 }); }       // the rover's mechanic
    if (g.diner) { const s = g.diner; put.critter({ kind: 'blob', x: s.x - m(s) * 46, y: s.y + 14, size: 28 }); put.critter({ kind: 'dodo', x: s.x + m(s) * 8, y: s.y + 20, size: 28 }); }  // the cook, a customer
    put.chest(B.i0 + 2, { x: g.chest1.x, y: g.chest1.y - 2 });
    put.chest(B.i0 + 6, { x: g.chest5.x, y: g.chest5.y - 2 });
    put.sign({ role: 'region', level: B.i0 + 3, x: g.sign.x, y: g.sign.y - 2 });
    const rest = g.dive || g.diner; put.sign({ role: 'rest', level: B.i0 + 5, x: rest.x + m(rest) * (g.dive ? 36 : 48), y: rest.y + (g.dive ? -4 : 22) });
    put.gate({ x: g.gate.x, y: g.gate.y + 4, angle: +g.gate.ang.toFixed(3), to: B.k + 1 });
  }

  /* ---------- live kinds (ported to PeckLiveLayer.swift by hand) ---------- */
  const PX = e => W.CX + e.dx, PY = e => W.H - e.yb;
  /* glimmer: a four-point star breathing slowly (1.1 rad/s), additive */
  W.LIVE.glimmer = (ctx, e, t) => {
    const x = PX(e), y = PY(e), k = 0.5 + 0.5 * Math.sin(t * 1.1 + (e.ph || 0)), r = e.r * (1 + 0.6 * k);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2); g.addColorStop(0, L.rgba(e.c, 0.35 * k)); g.addColorStop(1, L.rgba(e.c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
    glint(ctx, x, y, r, e.c, 0.3 + 0.6 * k);
    ctx.restore();
  };
  /* comet: crosses from (dx, yb) to `to` over 60% of a `per`-second cycle, fading in and out */
  W.LIVE.comet = (ctx, e, t) => {
    const p = ((t + (e.ph || 0)) % e.per) / e.per; if (p > 0.6) return;
    const q = p / 0.6, a = Math.sin(Math.PI * q), x0 = PX(e), y0 = PY(e), x1 = W.CX + e.to[0], y1 = W.H - e.to[1];
    const x = x0 + (x1 - x0) * q, y = y0 + (y1 - y0) * q, dl = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / dl, uy = (y1 - y0) / dl, Ln = 46;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createLinearGradient(x, y, x - ux * Ln, y - uy * Ln); tg.addColorStop(0, `rgba(255,214,240,${0.75 * a})`); tg.addColorStop(1, 'rgba(255,214,240,0)');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(x - uy * 3.2, y + ux * 3.2); ctx.lineTo(x - ux * Ln, y - uy * Ln); ctx.lineTo(x + uy * 3.2, y - ux * 3.2); ctx.closePath(); ctx.fill();
    const t2 = ctx.createLinearGradient(x, y, x - ux * Ln * 0.6, y - uy * Ln * 0.6); t2.addColorStop(0, `rgba(140,255,240,${0.5 * a})`); t2.addColorStop(1, 'rgba(140,255,240,0)');
    ctx.fillStyle = t2; ctx.beginPath(); ctx.moveTo(x - uy * 1.6, y + ux * 1.6); ctx.lineTo(x - ux * Ln * 0.6 + uy * 4, y - uy * Ln * 0.6 - ux * 4); ctx.lineTo(x + uy * 1.6, y - ux * 1.6); ctx.closePath(); ctx.fill();
    const hg = ctx.createRadialGradient(x, y, 0, x, y, 9); hg.addColorStop(0, `rgba(255,250,235,${0.8 * a})`); hg.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  };
  /* dish: a radar dish on its mast, sweeping side to side (±0.55 rad, 0.3 rad/s) */
  W.LIVE.dish = (ctx, e, t) => {
    const x = PX(e), y = PY(e), s = e.s || 1, rot = -0.45 + Math.sin(t * 0.3 + (e.ph || 0)) * 0.55;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#B9A6F0'; ctx.fillRect(-1.6, 0, 3.2, 5);
    ctx.rotate(rot);
    ctx.beginPath(); ctx.ellipse(0, 1.5, 14, 6, 0, 0, Math.PI); ctx.lineTo(-14, 1.5); ctx.fillStyle = '#9A8CC4'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 5.4, 0, 0, TAU); jfill(ctx, '#F1EBFF', -5, -2, 14, 0.9);
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 3.2, 0, 0, TAU); ctx.fillStyle = 'rgba(160,140,210,.45)'; ctx.fill();
    ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(0, -12); ctx.lineTo(6, -1); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -12.5, 2.2, 0, TAU); jfill(ctx, '#FF6FA8', 0, -12.5, 2.2, 0.5);
    ctx.restore();
  };
  /* ufo: a saucer hovering (±3, 1.1 rad/s) over a landing ring, its beam breathing; rim lights chase slowly */
  W.LIVE.ufo = (ctx, e, t) => {
    const x = PX(e), y0 = PY(e), y = y0 + Math.sin(t * 1.1) * 3, h = e.h || 50, tilt = Math.sin(t * 0.6) * 0.05, ba = 0.2 + 0.06 * Math.sin(t * 1.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const bg = ctx.createLinearGradient(0, y + 4, 0, y0 + h); bg.addColorStop(0, `rgba(170,255,235,${ba + 0.1})`); bg.addColorStop(1, `rgba(170,255,235,${ba * 0.4})`);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(x - 6, y + 4); ctx.lineTo(x + 6, y + 4); ctx.lineTo(x + 18, y0 + h); ctx.lineTo(x - 18, y0 + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(170,255,235,${ba})`; ctx.beginPath(); ctx.ellipse(x, y0 + h, 19, 5.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 9, 0, Math.PI, TAU); const dg = ctx.createRadialGradient(-3, -6, 0.5, 0, -3, 10); dg.addColorStop(0, 'rgba(255,255,255,.95)'); dg.addColorStop(0.5, 'rgba(160,240,235,.75)'); dg.addColorStop(1, 'rgba(70,170,190,.9)'); ctx.fillStyle = dg; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 1.5, 21, 6.5, 0, 0, TAU); jfill(ctx, '#C9B4FF', -6, -1, 20, 1);
    ctx.beginPath(); ctx.ellipse(0, 0.5, 21, 3, 0, 0, TAU); ctx.fillStyle = '#FF8FC0'; ctx.fill();
    for (let k = 0; k < 5; k++) { const lx = -14 + k * 7, a = 0.55 + 0.45 * Math.sin(t * 1.6 - k * 1.2); ctx.beginPath(); ctx.arc(lx, 0.8, 1.5, 0, TAU); ctx.fillStyle = `rgba(255,236,140,${a})`; ctx.fill(); }
    hl(ctx, -10, -2, 5, 1.2, -0.1, 0.7); hl(ctx, -3.5, -6, 2.2, 1.1, -0.6, 0.9);
    ctx.restore();
  };

  /* ---------- stepping pieces for the road through space (native) ---------- */
  W.STONE_DRAW = Object.assign(W.STONE_DRAW || {}, {
    /* chunk: a small asteroid with a frosting cap, floating over a faint pink orbit ring */
    chunk(ctx, kind, x, y, ang, R) {
      const n = 7, rs = []; for (let k = 0; k < n; k++) rs.push(0.82 + R() * 0.3);
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(255,200,240,.38)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(0, 3, 13, 6.5, 0, 0, TAU); ctx.stroke();
      const pth = (dy, sy) => { ctx.beginPath(); for (let k = 0; k <= n; k++) { const a = k / n * TAU; ctx.lineTo(Math.cos(a) * rs[k % n] * 10.5, Math.sin(a) * rs[k % n] * sy + dy); } ctx.closePath(); };
      pth(3, 6.4); ctx.fillStyle = '#4A3890'; ctx.fill();
      pth(0, 6.4); jfill(ctx, '#9E86E0', -2, -1, 11, 0.8);
      ctx.beginPath(); ctx.ellipse(-1, -1.4, 6.4, 3.2, 0, 0, TAU); jfill(ctx, '#FFB8D6', -2.5, -2.5, 6, 0);
      ell(ctx, 4.5, 1.6, 1.6, 0.9, 'rgba(40,20,90,.45)');
      hl(ctx, -3.5, -2.6, 2.4, 0.9, -0.2, 0.85);
      ctx.restore();
    },
    /* star: a yellow star candy lying flat, with its thickness showing */
    star(ctx, kind, x, y, ang, R) {
      const rot = (R() - 0.5) * 0.8, path = dy => { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = rot - Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 4.6 : 10.5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.62 + dy); } ctx.closePath(); };
      ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,230,160,.35)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(0, 3, 13, 6.5, 0, 0, TAU); ctx.stroke();
      path(2.4); ctx.fillStyle = '#D9901A'; ctx.fill();
      path(0); jfill(ctx, '#FFD43A', -2, -1.5, 10, 0.8);
      hl(ctx, -2.5, -2, 2.6, 1, -0.2, 0.85);
      ctx.restore();
    },
  });
  /* ten pieces, so the sequence (indexed by level × 5) repeats every two levels and loops cleanly */
  W.STONE_SETS = Object.assign(W.STONE_SETS || {}, { stones_cosmos: ['chunk', 'star', 'chunk', 'chunk', 'star', 'chunk', 'star', 'chunk', 'chunk', 'star'] });

  W.chapter({
    id: 'cosmos', name: 'CANDY COSMOS', title: 'Candy Cosmos', road: 'stones_cosmos',
    node: ['#FFE0EC', '#FF6FA8', '#D93A78'], gateBanner: ['FURTHER OUT', '#FF6FA8', '#8A1F4E'],
    sign: { board: '#FF6FA8', plate: '#FFF0F6', ink: '#8A1F4E' },
    edgeColor: '#1D1840', finaleSky: ['#120F2E', '#1D1840', '#3A2E80'], night: true,
    geom, ground, props, fg, manifest, topEdge: B => () => W.yBound(B.k + 1),
  });
})();
