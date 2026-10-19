/* Chapter 5 — Starlight Garden (levels 41–50). Night falls above Marshmallow Clouds: a garden of
   floating islands under a deep indigo sky. Four islands carry the trail (41–42, 43–45, 46–48,
   49–50) and the road leaps the gaps between them on glowing plank bridges (baked; the native
   ribbon is drawn on top). Satellite islets drift in the sky gaps. Landmarks: the moon bakery
   (a crescent-moon house) by 42, the stargazer's dome by 44, the lantern night market at the rest
   stop (45, Peck or Perish), the firefly pond by 47, the sleepy owl tree and bat roost by 48, the
   well of wishes on its own islet by 49, glowing mushroom rings, star lamps. The last island thins
   out into open star field at the top, where the sky deepens to near-black for Candy Cosmos.

   Light: the moon, top-left. Lit grass is cool blue-teal, faces turn violet away from the light,
   every window, lamp and lantern is warm and carries a put.glow for the night pass.
   Live kinds defined here (ported by hand to PeckLiveLayer.swift): firefly, shootingstar,
   lantern, twinkle. */
(function () {
  'use strict';
  const L = window.L, K = window.K, W = window.WORLD, TAU = Math.PI * 2;
  const { ell, hl, jfill, jgrad, cast, contact, rect, tuft, gumTree } = K;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  /* ---------- islands ---------- */
  const HF = [2, 3, 5, 9], HA = [0.035, 0.03, 0.018, 0.008];
  function isle(cx, cy, rx, ry, rot, R, o = {}) {
    return Object.assign({ cx, cy, rx, ry, rot, p: HF.map(() => R() * TAU), cliff: 22, hang: 0 }, o);
  }
  const fR = (I, th) => { let f = 1; for (let k = 0; k < 4; k++) f += HA[k] * (I.amp ?? 1) * Math.sin(HF[k] * th + I.p[k]); return f; };
  function outline(I, n = 140) {
    if (I._pts && I._pts.length === n) return I._pts;
    const c = Math.cos(I.rot), s = Math.sin(I.rot), pts = [];
    for (let k = 0; k < n; k++) {
      const th = k / n * TAU, f = fR(I, th), lx = I.rx * f * Math.cos(th), ly = I.ry * f * Math.sin(th);
      pts.push({ x: I.cx + lx * c - ly * s, y: I.cy + lx * s + ly * c });
    }
    for (let k = 0; k < n; k++) { const a = pts[(k + n - 1) % n], b = pts[(k + 1) % n], dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1; pts[k].nx = dy / m; pts[k].ny = -dx / m; }
    return (I._pts = pts);
  }
  /* 0 at the outline, <1 inside (a normalised radius over the harmonic edge) */
  function rIn(I, x, y) {
    const c = Math.cos(I.rot), s = Math.sin(I.rot), dx = x - I.cx, dy = y - I.cy;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c, th = Math.atan2(ly / I.ry, lx / I.rx);
    return Math.hypot(lx / I.rx, ly / I.ry) / fR(I, th < 0 ? th + TAU : th);
  }
  const edgeDist = (I, x, y) => { let b = 1e9; for (const p of outline(I)) b = Math.min(b, Math.hypot(p.x - x, p.y - y)); return b; };

  function geom(B) {
    if (B._g) return B._g;
    const g = {}, R = B.rng(3), X = B.mx, sg = B.odd ? -1 : 1;
    const y = j => B.node(j).y;
    g.y = y;
    g.topY = W.yBound(B.k + 1);
    const gp = W.roadAtY(g.topY, B.i1, B.i1 + 1);
    g.gate = { x: gp.x, y: gp.y, tx: gp.tx, ty: gp.ty };
    // the four trail islands, painted top to bottom (D, C, B, A)
    g.D = isle(X(228), y(9) + 52, 112, 162, -0.5 * sg, R, { cliff: 20 });
    g.C = isle(X(262), y(6), 152, 214, 0.5 * sg, R, { cliff: 24 });
    g.Bi = isle(X(270), y(3) + 2, 166, 196, 0, R, { cliff: 24 });
    g.A = isle(X(236), y(0) + 112, 214, 312, 0, R, { cliff: 0 });
    g.isles = [g.D, g.C, g.Bi, g.A];
    // satellite islets in the sky gaps (behind the big ones): the wishing well's, and scenery
    g.wellIsle = isle(X(140), y(8) + 44, 50, 26, 0, R, { cliff: 14, hang: 46, amp: 0.6 });
    g.sats = [
      g.wellIsle,
      g.marketIsle = isle(X(372), y(4) - 74, 80, 32, 0, R, { cliff: 18, hang: 58, amp: 0.5 }),
      isle(X(420), y(9) + 30, 30, 15, 0, R, { cliff: 10, hang: 30, amp: 0.6, deco: 'shroom' }),
      isle(X(92), y(4) - 70, 26, 13, 0, R, { cliff: 9, hang: 26, amp: 0.5, deco: 'tree' }),
      isle(X(96), y(7) + 40, 22, 11, 0, R, { cliff: 8, hang: 22, amp: 0.5, deco: 'lamp' }),
      isle(X(440), y(1) - 70, 24, 12, 0, R, { cliff: 9, hang: 24, amp: 0.5, deco: 'flowers' }),
    ];
    g.insideAny = (x, y, k = 1) => g.isles.some(I => rIn(I, x, y) < k);
    // landmarks (screen layout of band 4; X mirrors on an odd band)
    g.bakery = { x: X(350), y: y(1) + 44 };
    g.chest42 = { x: X(116), y: y(1) + 30 };
    g.shrooms = { x: X(150), y: y(0) - 6 };
    g.regionSign = { x: X(348), y: y(2) + 14 };
    g.dome = { x: X(160), y: y(3) + 14 };
    g.market = { x: X(372), y: y(4) - 74 };
    g.stalls = [{ x: X(334), y: y(4) - 84, a: '#E77FB8' }, { x: X(374), y: y(4) - 90, a: '#7FC8F0' }, { x: X(414), y: y(4) - 82, a: '#FFC24A' }];
    g.poles = [{ x: X(310), y: y(4) - 66 }, { x: X(434), y: y(4) - 62 }];
    g.restSign = { x: X(326), y: y(4) + 34 };
    g.chest46 = { x: X(272), y: y(5) + 20 };
    g.pond = { x: X(372), y: y(6) + 48 };
    g.owl = { x: X(166), y: y(6) - 26, m: sg };
    g.well = { x: X(142), y: y(8) + 40 };
    g.beds = [{ x: X(312), y: y(9) + 4, n: 5 }, { x: X(126), y: y(9) + 76, n: 4 }, { x: X(332), y: y(9) + 38, n: 4 }];
    g.lamps = [{ x: X(312), y: y(0) - 10 }, { x: X(224), y: y(3) - 30 }, { x: X(302), y: y(5) - 8 }, { x: X(196), y: y(8) - 34 }];
    // the lantern string across the plaza: a sagging curve between the pole tops
    const p0 = { x: g.poles[0].x, y: g.poles[0].y - 46 }, p1 = { x: g.poles[1].x, y: g.poles[1].y - 46 };
    g.string = u => { const c = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 + 22 }; return { x: (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * c.x + u * u * p1.x, y: (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * c.y + u * u * p1.y }; };
    g.lanterns = [0.16, 0.34, 0.52, 0.7, 0.86].map((u, k) => Object.assign(g.string(u), { c: ['#FF8A5C', '#FFC24A', '#FF6F9F', '#FFC24A', '#FF8A5C'][k], ph: k * 1.3 }));
    // bridges: the stretches of road that leave every island
    g.bridges = [];
    { let run = [];
      const pts = W.road.pts.filter(p => p.y < y(0) && p.y > g.topY - 10);
      for (const p of pts) { if (!g.insideAny(p.x, p.y, 0.985)) run.push(p); else if (run.length) { g.bridges.push(run); run = []; } }
      if (run.length) g.bridges.push(run);
      g.bridges = g.bridges.filter(r => r.length > 1).map(r => { const d0 = r[0].d - 14, d1 = r[r.length - 1].d + 14, out = []; for (let d = d0; d <= d1; d += 3) out.push(W.road.at(d)); return out; });
    }
    return (B._g = g);
  }

  /* ---------- sky ---------- */
  function sky(ctx, B, g) {
    const DW = W.DW, R = B.rng(41);
    const yT = B.top - 240, yF = B.top + 10, yB = B.bottom + 320;
    const fade = yy => { const u = clamp((yy - yT) / (yF - yT)); return u * u * (3 - 2 * u); };
    const gr = ctx.createLinearGradient(0, yT, 0, yB);
    const st = [[0, '#0E0B2A'], [0.1, '#0E0B2A'], [0.16, '#14103A'], [0.42, '#221B58'], [0.7, '#30276E'], [0.88, '#4A3C92'], [1, '#6A55B0']];
    for (const [o, c] of st) gr.addColorStop(o, c);
    ctx.save();
    ctx.fillStyle = gr; ctx.fillRect(-20, yF, DW + 40, yB - yF);
    // fade in above, so the cosmos' own sky shows through the seam
    const gf = ctx.createLinearGradient(0, yT, 0, yF); for (let k = 0; k <= 8; k++) { const u = k / 8; gf.addColorStop(u, `rgba(14,11,42,${(u * u * (3 - 2 * u)).toFixed(3)})`); }
    ctx.fillStyle = gf; ctx.fillRect(-20, yT, DW + 40, yF - yT);
    // a dusk glow low in the band (the clouds are below) and a cool moon glow on the upper left
    let rg = ctx.createRadialGradient(DW * 0.3, B.bottom + 40, 20, DW * 0.3, B.bottom + 40, 520);
    rg.addColorStop(0, 'rgba(240,150,210,.22)'); rg.addColorStop(1, 'rgba(240,150,210,0)'); ctx.fillStyle = rg; ctx.fillRect(-20, B.bottom - 520, DW + 40, 900);
    // the milky way: a soft meandering band of light and star dust
    const mw = yy => W.CX + 170 * Math.sin((yy - B.top) / 380 + 0.8) - 40;
    ctx.globalCompositeOperation = 'lighter';
    for (let yy = yT; yy < yB; yy += 22) {
      const x = mw(yy) + (R() - 0.5) * 60, r = 50 + R() * 70, f = fade(yy);
      rg = ctx.createRadialGradient(x, yy, 4, x, yy, r);
      const c = R() < 0.5 ? [150, 120, 255] : R() < 0.6 ? [255, 150, 220] : [120, 190, 255];
      rg.addColorStop(0, `rgba(${c},${0.07 * f})`); rg.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, yy, r, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 900; i++) { const yy = yT + R() * (yB - yT), x = mw(yy) + (R() + R() + R() - 1.5) * 70; ell(ctx, x, yy, 0.55, 0.55, `rgba(235,230,255,${(0.25 + R() * 0.45) * fade(yy)})`); }
    // stars: dust, points, a few with halos and four-point sparkles
    for (let i = 0; i < 1100; i++) {
      const x = R() * DW, yy = yT + R() * (yB - yT), f = fade(yy), q = R();
      if (q < 0.8) ell(ctx, x, yy, 0.5 + R() * 0.5, 0.5 + R() * 0.5, `rgba(240,236,255,${(0.35 + R() * 0.5) * f})`);
      else if (q < 0.96) { ell(ctx, x, yy, 1.1, 1.1, `rgba(255,250,235,${0.85 * f})`); ell(ctx, x, yy, 2.6, 2.6, `rgba(200,190,255,${0.15 * f})`); }
      else sparkle(ctx, x, yy, 3 + R() * 3, ['#FFF6D8', '#D8E4FF', '#FFE0F2'][i % 3], 0.85 * f);
    }
    // distant islets: hazy silhouettes far below the garden, a lit window or two
    for (const [x, yy, rx] of [[70, g.y(2) - 60, 34], [470, g.y(3) + 40, 26], [60, g.y(6) + 10, 30], [480, g.y(7) - 70, 36], [470, g.y(0) - 140, 22], [80, g.y(9) - 40, 24]]) {
      const xx = B.mx(x);
      ctx.fillStyle = 'rgba(40,32,100,.55)';
      ctx.beginPath(); ctx.ellipse(xx, yy, rx, rx * 0.32, 0, Math.PI, TAU); ctx.lineTo(xx + rx * 0.5, yy + rx * 0.3); ctx.lineTo(xx, yy + rx * 0.9); ctx.lineTo(xx - rx * 0.45, yy + rx * 0.35); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(170,170,255,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(xx, yy, rx, rx * 0.32, 0, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
      ctx.fillStyle = 'rgba(60,52,130,.6)'; ctx.beginPath(); ctx.arc(xx - rx * 0.2, yy - rx * 0.35, rx * 0.32, 0, TAU); ctx.fill();
      ell(ctx, xx - rx * 0.1, yy - rx * 0.32, 1.1, 1.1, 'rgba(255,214,120,.9)');
      ell(ctx, xx - rx * 0.1, yy - rx * 0.32, 4, 4, 'rgba(255,200,110,.18)');
    }
    ctx.restore();
  }
  function sparkle(ctx, x, y, r, c, a) {
    ctx.save(); ctx.globalAlpha = a;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6); rg.addColorStop(0, L.rgba(c, 0.5)); rg.addColorStop(1, L.rgba(c, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
    ctx.restore();
  }

  /* ---------- an island: cliff, hanging rock, grass lip, lit top, rim ---------- */
  const GRASS = { D: '#41579C', C: '#336996', Bi: '#2C7392', A: '#277A8C', sat: '#3F5FA2' };
  function lowerArc(pts) {
    let iL = 0, iR = 0; pts.forEach((p, k) => { if (p.x < pts[iL].x) iL = k; if (p.x > pts[iR].x) iR = k; });
    const walk = (a, b, dir) => { const o = []; for (let k = a; ; k = (k + dir + pts.length) % pts.length) { o.push(pts[k]); if (k === b) break; } return o; };
    const A1 = walk(iR, iL, 1), A2 = walk(iR, iL, -1);
    const avg = a => a.reduce((s, p) => s + p.y, 0) / a.length;
    return avg(A1) > avg(A2) ? { lower: A1, upper: walk(iL, iR, 1) } : { lower: A2, upper: walk(iL, iR, -1) };
  }
  function drawIsle(ctx, I, base, R, B) {
    const pts = outline(I), { lower, upper } = lowerArc(pts), D = I.cliff;
    let x0 = 1e9, x1 = -1e9, yMax = -1e9; for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); yMax = Math.max(yMax, p.y); }
    const cliffFill = () => { const cg = ctx.createLinearGradient(x0, 0, x1, 0); cg.addColorStop(0, '#7565BE'); cg.addColorStop(0.35, '#4E419A'); cg.addColorStop(1, '#251D5E'); return cg; };
    if (D > 0) {
      // the hanging rock under a small islet: a lumpy cone to a point
      if (I.hang) {
        const ax = I.cx + I.rx * 0.12, ay = yMax + D + I.hang;
        ctx.beginPath(); lower.forEach((p, k) => k ? ctx.lineTo(p.x, p.y + D) : ctx.moveTo(p.x, p.y + D));
        const l = lower[lower.length - 1], r0 = lower[0];
        ctx.quadraticCurveTo(l.x + 6, ay - I.hang * 0.4, ax, ay);
        ctx.quadraticCurveTo(r0.x - 4, ay - I.hang * 0.5, r0.x, r0.y + D);
        ctx.closePath(); ctx.fillStyle = cliffFill(); ctx.fill();
        ctx.strokeStyle = 'rgba(20,12,60,.3)'; ctx.lineWidth = 0.9; ctx.beginPath();
        for (let k = 1; k < 4; k++) { const u = k / 4; ctx.moveTo(l.x + (ax - l.x) * u + 4, l.y + D + (ay - l.y - D) * u); ctx.quadraticCurveTo(I.cx, l.y + D + (ay - l.y - D) * u + 6, r0.x + (ax - r0.x) * u - 4, r0.y + D + (ay - r0.y - D) * u); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(190,180,255,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(l.x + 1, l.y + D); ctx.quadraticCurveTo(l.x + 6, ay - I.hang * 0.4, ax, ay); ctx.stroke();
      }
      // the cliff band under the front edge (outline swept down by D)
      ctx.beginPath(); lower.forEach((p, k) => k ? ctx.lineTo(p.x, p.y + D) : ctx.moveTo(p.x, p.y + D)); for (const p of upper) ctx.lineTo(p.x, p.y); ctx.closePath();
      ctx.fillStyle = cliffFill(); ctx.fill();
      ctx.save(); ctx.clip();
      for (const [u, c, w] of [[0.38, 'rgba(20,12,60,.28)', 1], [0.68, 'rgba(20,12,60,.22)', 1], [0.2, 'rgba(180,170,255,.18)', 1.2]]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); lower.forEach((p, k) => k ? ctx.lineTo(p.x, p.y + D * u + Math.sin(p.x / 9) * 1.2) : ctx.moveTo(p.x, p.y + D * u)); ctx.stroke(); }
      // cool backlight along the bottom edge of the cliff
      ctx.strokeStyle = 'rgba(150,130,255,.45)'; ctx.lineWidth = 1.4; ctx.beginPath(); lower.forEach((p, k) => k ? ctx.lineTo(p.x, p.y + D - 0.8) : ctx.moveTo(p.x, p.y + D - 0.8)); ctx.stroke();
      ctx.restore();
      // roots dangling off the cliff, a few with glowing tips (clear of the road)
      for (let k = 2; k < lower.length - 2; k += 3) {
        const p = lower[k]; if (R() < 0.45 || W.distToRoad(p.x, p.y + D) < 40) continue;
        const len = 6 + R() * (I.hang ? 10 : 22), sw = (R() - 0.5) * 8;
        ctx.strokeStyle = '#3A2E78'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y + D - 2); ctx.quadraticCurveTo(p.x + sw, p.y + D + len * 0.5, p.x + sw * 0.4, p.y + D + len); ctx.stroke();
        if (R() < 0.35) { const tx = p.x + sw * 0.4, ty = p.y + D + len; glowDot(ctx, tx, ty + 1.5, 1.5, R() < 0.5 ? '#8FF3FF' : '#FF9FE0', 7); }
      }
    }
    // the grass lip: soft scallops hanging over the cliff top
    if (D > 0) for (let k = 0; k < lower.length; k += 2) { const p = lower[k]; ell(ctx, p.x, p.y + 1, 4.5, 3.4, L.shade(base, -0.28)); }
    // the lit top
    ctx.save();
    ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    let yMin = 1e9; for (const p of pts) yMin = Math.min(yMin, p.y);
    const tg = ctx.createLinearGradient(x0, yMin, x1, yMax);
    tg.addColorStop(0, L.mix(L.shade(base, 0.34), '#BFE6FF', 0.15)); tg.addColorStop(0.3, base); tg.addColorStop(0.7, L.mix(base, '#3A2C86', 0.42)); tg.addColorStop(1, L.mix(base, '#231A60', 0.62));
    ctx.fillStyle = tg; ctx.fill(); ctx.clip();
    // terraces: valley shade above each crest, a moonlit face just under it
    for (const cr of I.crests || []) {
      const fn = x => cr.y0 + cr.sl * (x - I.cx) + cr.a * Math.sin(x * cr.f + cr.p);
      const line = (dy = 0) => { ctx.beginPath(); for (let x = x0 - 10; x <= x1 + 10; x += 6) x === x0 - 10 ? ctx.moveTo(x, fn(x) + dy) : ctx.lineTo(x, fn(x) + dy); };
      for (const [w, a] of [[64, 0.06], [40, 0.07], [22, 0.09], [9, 0.12]]) { line(-w * 0.32); ctx.strokeStyle = `rgba(14,10,52,${a})`; ctx.lineWidth = w; ctx.stroke(); }
      line(); ctx.lineTo(x1 + 10, fn(x1 + 10) + 60); ctx.lineTo(x0 - 10, fn(x0 - 10) + 60); ctx.closePath();
      const fg2 = ctx.createLinearGradient(0, fn(I.cx), 0, fn(I.cx) + 54); fg2.addColorStop(0, L.rgba(L.shade(base, 0.22), 0.9)); fg2.addColorStop(1, L.rgba(base, 0));
      ctx.fillStyle = fg2; ctx.fill();
      const rim = ctx.createLinearGradient(x0, 0, x1, 0); rim.addColorStop(0, 'rgba(205,222,255,.7)'); rim.addColorStop(1, 'rgba(205,222,255,.2)');
      line(1.2); ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.stroke();
    }
    // moonlight mass upper-left, violet shade mass lower-right
    let rg = ctx.createRadialGradient(I.cx - I.rx * 0.45, I.cy - I.ry * 0.4, 10, I.cx - I.rx * 0.45, I.cy - I.ry * 0.4, Math.max(I.rx, I.ry));
    rg.addColorStop(0, 'rgba(190,215,255,.16)'); rg.addColorStop(1, 'rgba(190,215,255,0)'); ctx.fillStyle = rg; ctx.fillRect(x0 - 50, yMin - 50, x1 - x0 + 100, yMax - yMin + 100);
    rg = ctx.createRadialGradient(I.cx + I.rx * 0.55, I.cy + I.ry * 0.5, 10, I.cx + I.rx * 0.55, I.cy + I.ry * 0.5, Math.max(I.rx, I.ry) * 0.9);
    rg.addColorStop(0, 'rgba(20,12,60,.26)'); rg.addColorStop(1, 'rgba(20,12,60,0)'); ctx.fillStyle = rg; ctx.fillRect(x0 - 50, yMin - 50, x1 - x0 + 100, yMax - yMin + 100);
    ctx.restore();
    // rim light where the edge faces the moon, a violet backlight where it faces away
    ctx.lineCap = 'round';
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[(k + 1) % pts.length], d = -(p.nx * -0.55 + p.ny * -0.83);
      const lit = clamp(-(p.nx * 0.55 + p.ny * 0.83));
      if (lit > 0.05) { ctx.strokeStyle = `rgba(210,228,255,${0.85 * lit})`; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(p.x + 1.2 * 0.55, p.y + 1.2 * 0.83); ctx.lineTo(q.x + 1.2 * 0.55, q.y + 1.2 * 0.83); ctx.stroke(); }
      else if (d > 0.3) { ctx.strokeStyle = `rgba(160,130,255,${0.35 * d})`; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    }
  }
  function glowDot(ctx, x, y, r, c, halo = 8, a = 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(x, y, 0, x, y, halo); rg.addColorStop(0, L.rgba(c, 0.55 * a)); rg.addColorStop(1, L.rgba(c, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, halo, 0, TAU); ctx.fill(); ctx.restore();
    ell(ctx, x, y, r, r, c); ell(ctx, x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.4, 'rgba(255,255,255,.85)');
  }
  function pool(ctx, x, y, r, c, a = 0.3, sq = 0.55) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.scale(1, sq);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r); rg.addColorStop(0, L.rgba(c, a)); rg.addColorStop(1, L.rgba(c, 0));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore();
  }

  /* ---------- ground ---------- */
  function ground(ctx, B) {
    const g = geom(B), DW = W.DW, R = B.rng(21), y = g.y;
    sky(ctx, B, g);
    // terraces on the big islands, between the nodes, interlocking with the trail
    g.A.crests = [{ y0: y(0) - 60, sl: 0.22, a: 10, f: 0.02, p: 1 }, { y0: y(0) + 120, sl: -0.25, a: 12, f: 0.017, p: 3 }];
    g.Bi.crests = [{ y0: y(2) - 68, sl: -0.28, a: 10, f: 0.019, p: 2 }, { y0: y(3) - 72, sl: 0.3, a: 9, f: 0.021, p: 5 }];
    g.C.crests = [{ y0: y(5) - 62, sl: 0.26, a: 10, f: 0.018, p: 4 }, { y0: y(6) - 74, sl: -0.3, a: 9, f: 0.02, p: 0.5 }];
    g.D.crests = [{ y0: y(8) - 66, sl: 0.28, a: 8, f: 0.022, p: 2.4 }];
    for (const s of g.sats) drawIsle(ctx, s, GRASS.sat, R, B);
    drawIsle(ctx, g.D, GRASS.D, R, B); drawIsle(ctx, g.C, GRASS.C, R, B); drawIsle(ctx, g.Bi, GRASS.Bi, R, B); drawIsle(ctx, g.A, GRASS.A, R, B);
    // tonal noise over the island tops
    {
      const noise = L.makeNoise(17 + B.k), sx = 4, nw = Math.ceil(DW / sx), y0 = Math.floor(B.top - 140), nh = Math.ceil((B.bottom + 320 - y0) / sx);
      const oc = document.createElement('canvas'); oc.width = nw; oc.height = nh; const o2 = oc.getContext('2d'), im = o2.createImageData(nw, nh), d = im.data;
      for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
        const x = i * sx, yy = y0 + j * sx, v = noise.fbm(x / 110, yy / 110, 3) * 2.2 + noise.n2(x / 18, yy / 18) * 0.5, kk = (j * nw + i) * 4;
        if (v > 0) { d[kk] = 170; d[kk + 1] = 200; d[kk + 2] = 255; d[kk + 3] = Math.min(255, v * 90); } else { d[kk] = 16; d[kk + 1] = 10; d[kk + 2] = 56; d[kk + 3] = Math.min(255, -v * 110); }
      }
      o2.putImageData(im, 0, 0);
      ctx.save(); ctx.beginPath(); for (const I of g.isles) outline(I).forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.clip();
      ctx.globalAlpha = 0.35; ctx.drawImage(oc, 0, y0, nw * sx, nh * sx); ctx.restore();
    }
    // side trails from the road to the landmarks
    const spur = (p, bend = 0) => {
      const r = W.roadAtY(p.y, B.i0, B.i1 + 1); if (!r) return;
      const sp = L.catmull([{ x: r.x, y: r.y }, { x: (r.x + p.x) / 2, y: (r.y + p.y) / 2 + bend }, { x: p.x, y: p.y }], 10);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; L.pathPoly(ctx, sp.pts);
      ctx.strokeStyle = 'rgba(14,10,50,.3)'; ctx.lineWidth = 13; ctx.stroke();
      ctx.strokeStyle = '#6F66B4'; ctx.lineWidth = 10; ctx.stroke();
      ctx.strokeStyle = '#9C93D6'; ctx.lineWidth = 7; ctx.stroke();
      ctx.translate(-1, -1); L.pathPoly(ctx, sp.pts); ctx.strokeStyle = 'rgba(220,225,255,.35)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      for (let q = 0; q < sp.pts.length; q += 3) { const pp = sp.pts[q]; ell(ctx, pp.x + (R() - 0.5) * 4, pp.y + (R() - 0.5) * 3, 1.3, 0.8, 'rgba(60,50,130,.5)'); }
    };
    spur({ x: g.bakery.x - 22, y: g.bakery.y + 6 }, 6);
    spur({ x: g.dome.x + 8, y: g.dome.y + 6 }, -4);
        spur({ x: g.pond.x - 40, y: g.pond.y - 6 }, -4);
    spur({ x: g.owl.x + 18, y: g.owl.y + 6 }, 6);
    // the market plaza: a round of lilac flagstones
    { const m = g.market; ctx.save(); ctx.translate(m.x, m.y + 2); ctx.scale(1, 0.36); ctx.scale(0.9, 0.9);
      const pg = ctx.createRadialGradient(-20, -20, 6, 0, 0, 78); pg.addColorStop(0, '#9A90D8'); pg.addColorStop(1, '#6A5FB0');
      ctx.fillStyle = 'rgba(14,10,50,.3)'; ctx.beginPath(); ctx.arc(4, 8, 76, 0, TAU); ctx.fill();
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, 74, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,100,.35)'; ctx.lineWidth = 1.6; for (const r of [26, 50]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
      ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.lineTo(Math.cos(a) * 74, Math.sin(a) * 74); } ctx.stroke();
      ctx.strokeStyle = 'rgba(220,225,255,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 73, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
      ctx.restore(); }
    pond(ctx, g.pond.x, g.pond.y, B.rng(9));
    // bridges over the gaps
    for (const run of g.bridges) bridge(ctx, run);
    // grass tufts, glowing flowers and moss lights, clear of the trail and the landmarks
    const keep = [[g.bakery.x, g.bakery.y - 20, 56], [g.chest42.x, g.chest42.y - 6, 22], [g.shrooms.x, g.shrooms.y, 30], [g.regionSign.x, g.regionSign.y - 6, 22], [g.dome.x, g.dome.y - 20, 46],
      [g.market.x, g.market.y, 84], [g.chest46.x, g.chest46.y - 6, 22], [g.pond.x, g.pond.y, 60], [g.owl.x, g.owl.y - 20, 50], ...g.lamps.map(l => [l.x, l.y, 12]), ...g.beds.map(b => [b.x, b.y - 4, 30])];
    const free = (x, yy) => keep.every(([a, b, r]) => (x - a) ** 2 + ((yy - b) * 1.4) ** 2 > r * r);
    const onLand = (x, yy, k = 0.94) => g.isles.some(I => rIn(I, x, yy) < k);
    for (let i = 0; i < 800; i++) {
      const x = R() * DW, yy = B.top - 120 + R() * (B.bottom + 200 - B.top);
      if (!onLand(x, yy) || !free(x, yy)) continue;
      const dr = W.distToRoad(x, yy); if (dr < 22 || (dr < 46 && R() < 0.6)) continue;
      tuft(ctx, x, yy, 0.8 + R() * 0.6, 'rgba(18,40,86,.5)', 'rgba(180,215,255,.55)');
    }
    for (let i = 0; i < 1200; i++) { const x = R() * DW, yy = B.top - 120 + R() * (B.bottom + 200 - B.top); if (!onLand(x, yy) || W.distToRoad(x, yy) < 20) continue; ell(ctx, x, yy, 1.1, 0.6, R() < 0.5 ? 'rgba(14,20,60,.3)' : 'rgba(180,210,255,.22)'); }
    const FL = ['#8FF3FF', '#FF9FE0', '#FFE38A', '#C9A8FF'];
    for (let i = 0; i < 46; i++) {
      const x = R() * DW, yy = B.top - 100 + R() * (B.bottom + 140 - B.top);
      if (!onLand(x, yy, 0.88) || !free(x, yy) || W.distToRoad(x, yy) < 42) continue;
      const c = FL[i % 4], n = 3 + Math.floor(R() * 5);
      for (let q = 0; q < n; q++) { const fx = x + (R() - 0.5) * 26, fy = yy + (R() - 0.5) * 10; if (W.distToRoad(fx, fy) < 36) continue; glowFlower(ctx, fx, fy, c, R); }
    }
    // warm light falling on the ground from windows, lamps and lanterns
    pool(ctx, g.bakery.x - 4, g.bakery.y + 6, 70, '#FFB85A', 0.22);
    pool(ctx, g.dome.x, g.dome.y + 4, 46, '#FFB85A', 0.2);
    pool(ctx, g.market.x, g.market.y - 4, 84, '#FFB060', 0.26, 0.42);
    pool(ctx, g.well.x, g.well.y + 2, 46, '#7FEFFF', 0.22);
    pool(ctx, g.shrooms.x, g.shrooms.y + 2, 40, '#8FF3FF', 0.22);
    for (const l of g.lamps) pool(ctx, l.x, l.y + 2, 34, '#FFD27A', 0.22);
  }
  function glowFlower(ctx, x, y, c, R) {
    ctx.strokeStyle = 'rgba(40,70,110,.8)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.quadraticCurveTo(x - 1, y + 2, x, y); ctx.stroke();
    glowDot(ctx, x, y, 1.4, c, 6, 0.8);
  }
  function pond(ctx, x, y, R) {
    const rx = 48, ry = 22;
    ctx.save();
    ell(ctx, x + 3, y + 4, rx + 8, ry + 6, 'rgba(14,10,50,.3)');
    // rim of moonlit stones
    for (let k = 0; k < 26; k++) { const a = k / 26 * TAU, sx = x + Math.cos(a) * (rx + 3), sy = y + Math.sin(a) * (ry + 3); ctx.beginPath(); ctx.ellipse(sx, sy, 5 + R() * 2, 3.4, a, 0, TAU); ctx.fillStyle = jgrad(ctx, '#8E86C8', sx - 1, sy - 1, 5); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    const wg = ctx.createLinearGradient(0, y - ry, 0, y + ry); wg.addColorStop(0, '#0E1236'); wg.addColorStop(0.6, '#1A2A64'); wg.addColorStop(1, '#2A4A86');
    ctx.fillStyle = wg; ctx.fill(); ctx.clip();
    // the sky in the water: stars, the moon's streak
    for (let k = 0; k < 40; k++) ell(ctx, x + (R() - 0.5) * rx * 2, y + (R() - 0.5) * ry * 2, 0.6 + R() * 0.5, 0.5, `rgba(240,236,255,${0.4 + R() * 0.5})`);
    const mg = ctx.createLinearGradient(x - 20, 0, x - 4, 0); mg.addColorStop(0, 'rgba(255,245,200,0)'); mg.addColorStop(0.5, 'rgba(255,245,200,.45)'); mg.addColorStop(1, 'rgba(255,245,200,0)');
    ctx.fillStyle = mg; for (let k = 0; k < 5; k++) ctx.fillRect(x - 20 + Math.sin(k) * 3, y - ry + 4 + k * 8, 16 - k * 2, 2.2);
    ctx.strokeStyle = 'rgba(200,220,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y - 1, rx - 3, ry - 3, 0, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
    ctx.restore();
    // lily pads with glowing blooms
    for (const [dx, dy, r, c] of [[18, 6, 7, '#FF9FE0'], [30, -4, 5, null], [-30, 8, 6, '#8FF3FF'], [8, -10, 5, null]]) {
      ctx.save(); ctx.translate(x + dx, y + dy); ctx.scale(1, 0.55);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, 0.3, TAU - 0.3); ctx.closePath(); ctx.fillStyle = jgrad(ctx, '#2E7E7A', -1, -1, r); ctx.fill(); ctx.restore();
      if (c) glowDot(ctx, x + dx, y + dy - 1.5, 1.8, c, 10);
    }
    // cattails on the back edge
    for (const dx of [-38, -32, -26, 34, 40]) {
      const bx = x + dx, by = y - ry + 6 + Math.abs(dx) * 0.05;
      ctx.strokeStyle = '#2F6A70'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 1, by - 8, bx + (dx > 0 ? 1 : -1), by - 18); ctx.stroke();
      ell(ctx, bx + (dx > 0 ? 1 : -1), by - 18, 1.6, 3.6, '#7A4E70');
    }
  }
  function bridge(ctx, run) {
    const n = run.length, nrm = p => ({ x: -p.ty, y: p.tx });
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // a soft gold underglow and the plank edge
    ctx.globalCompositeOperation = 'lighter'; L.pathPoly(ctx, run); ctx.strokeStyle = 'rgba(255,200,110,.10)'; ctx.lineWidth = 64; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(2, 6); L.pathPoly(ctx, run); ctx.strokeStyle = 'rgba(10,6,40,.4)'; ctx.lineWidth = 42; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(0, 4); L.pathPoly(ctx, run); ctx.strokeStyle = '#3B2E80'; ctx.lineWidth = 42; ctx.lineCap = 'butt'; ctx.stroke(); ctx.restore();
    for (let k = 0; k < n; k += 2) {
      const p = run[k], a = Math.atan2(p.ty, p.tx);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      ctx.fillStyle = (k / 2) % 2 ? '#CDB6F6' : '#BBA0EE'; L.rrect(ctx, -2.3, -21, 4.6, 42, 1.4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-1.8, -20, 1, 40);
      ctx.fillStyle = 'rgba(255,214,120,.55)'; ctx.fillRect(1.6, -20, 0.8, 40);
      ctx.restore();
    }
    // rope rails with posts and star lamps at both ends
    for (const sd of [-1, 1]) {
      const rail = run.map(p => { const q = nrm(p); return { x: p.x + q.x * 22 * sd, y: p.y + q.y * 22 * sd }; });
      const sag = rail.map((p, k) => ({ x: p.x, y: p.y + Math.sin(k / (n - 1) * Math.PI) * 5 - 8 }));
      ctx.strokeStyle = 'rgba(10,6,40,.3)'; ctx.lineWidth = 1.6; ctx.beginPath(); sag.forEach((p, k) => k ? ctx.lineTo(p.x + 2, p.y + 10) : ctx.moveTo(p.x + 2, p.y + 10)); ctx.stroke();
      ctx.strokeStyle = '#E9D8A6'; ctx.lineWidth = 1.3; ctx.beginPath(); sag.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      for (const k of [0, n - 1]) {
        const p = rail[k];
        ctx.fillStyle = 'rgba(10,6,40,.3)'; ctx.fillRect(p.x + 1, p.y - 1, 4, 4);
        ctx.fillStyle = '#5A4BA8'; L.rrect(ctx, p.x - 2, p.y - 12, 4, 13, 1.6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(p.x - 1.4, p.y - 11, 1, 11);
        glowDot(ctx, p.x, p.y - 14, 2.6, '#FFD86A', 14);
      }
    }
    ctx.restore();
  }

  /* ---------- landmarks ---------- */
  function crescentPath(c, ax, ay, Ro, bx, by, ri) {
    // the outer circle minus the inner one: outer arc away from the cut, inner arc back through it
    const d = Math.hypot(bx - ax, by - ay), a = (Ro * Ro - ri * ri + d * d) / (2 * d), al = Math.acos(clamp(a / Ro, -1, 1)), ph = Math.atan2(by - ay, bx - ax);
    const S = { x: ax + Ro * Math.cos(ph + al), y: ay + Ro * Math.sin(ph + al) }, E = { x: ax + Ro * Math.cos(ph - al), y: ay + Ro * Math.sin(ph - al) };
    c.beginPath(); c.arc(ax, ay, Ro, ph + al, ph - al + TAU, false);
    const e = Math.atan2(E.y - by, E.x - bx), s = Math.atan2(S.y - by, S.x - bx);
    c.arc(bx, by, ri, e, s, true); c.closePath();
  }
  function moonBakery(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    const path = c => crescentPath(c, 0, -42, 40, 17, -55, 31);
    cast(ctx, 0, 0, path, { a: 0.22 });
    contact(ctx, 0, 0, 34, 7, 0.4);
    // a step and plinth
    ctx.fillStyle = '#4B3F92'; L.rrect(ctx, -30, -6, 52, 8, 4); ctx.fill();
    ctx.fillStyle = 'rgba(220,225,255,.35)'; ctx.fillRect(-27, -5.4, 46, 1.2);
    path(ctx); jfill(ctx, '#F4DA8C', -16, -56, 44, 1.3);
    ctx.save(); path(ctx); ctx.clip();
    const sh = ctx.createRadialGradient(18, -6, 4, 18, -6, 40); sh.addColorStop(0, 'rgba(120,70,40,.35)'); sh.addColorStop(1, 'rgba(120,70,40,0)'); ctx.fillStyle = sh; ctx.fillRect(-40, -90, 80, 90);
    for (const [cx, cy, r] of [[-30, -48, 4], [-20, -26, 3], [-8, -70, 2.6], [-34, -30, 2]]) { ell(ctx, cx + 0.6, cy + 0.6, r, r * 0.8, 'rgba(200,150,70,.35)'); ell(ctx, cx, cy, r * 0.8, r * 0.6, 'rgba(255,240,190,.4)'); }
    ctx.restore();
    // the inner edge catches a little light
    ctx.strokeStyle = 'rgba(255,250,220,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(17, -55, 31.6, Math.PI * 0.62, Math.PI * 0.98); ctx.stroke();
    hl(ctx, -22, -66, 7, 2.6, -0.9, 0.7);
    // round windows, warm
    for (const [wx, wy, r] of [[-27, -38, 5.6], [-20, -62, 4.4]]) {
      ell(ctx, wx, wy, r + 1.6, r + 1.6, '#B98A3A');
      const wg = ctx.createRadialGradient(wx - 1, wy - 1, 0.5, wx, wy, r); wg.addColorStop(0, '#FFF2C0'); wg.addColorStop(1, '#FFB24A');
      ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(wx, wy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(150,90,40,.7)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(wx - r, wy); ctx.lineTo(wx + r, wy); ctx.moveTo(wx, wy - r); ctx.lineTo(wx, wy + r); ctx.stroke();
    }
    // the door, ajar with warm light
    ctx.beginPath(); ctx.moveTo(-17, -6); ctx.lineTo(-17, -18); ctx.arc(-11, -18, 6, Math.PI, 0); ctx.lineTo(-5, -6); ctx.closePath(); ctx.fillStyle = '#FFC864'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-17, -6); ctx.lineTo(-17, -18); ctx.arc(-11, -18, 6, Math.PI, Math.PI * 1.5); ctx.lineTo(-12, -6); ctx.closePath(); ctx.fillStyle = '#7A3E8A'; ctx.fill();
    ell(ctx, -13.4, -12, 0.8, 0.8, '#FFD43A');
    ctx.strokeStyle = '#3B2E80'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-19, -27); ctx.lineTo(-25, -27); ctx.stroke();
    // the chimney on the top horn
    ctx.save(); ctx.translate(-14, -78); ctx.rotate(-0.25);
    ctx.fillStyle = '#C0608A'; L.rrect(ctx, -3.5, -9, 7, 11, 1.5); ctx.fill(); ctx.fillStyle = '#E58AB0'; L.rrect(ctx, -4.5, -10, 9, 3, 1.2); ctx.fill();
    ctx.restore();
    // a star hanging from the upper tip
    ctx.strokeStyle = 'rgba(255,240,200,.7)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(30, -76); ctx.lineTo(30, -62); ctx.stroke();
    L.star(ctx, 30, -59, 4, '#FFD43A', '#D9A000');
    // the bread counter in front of the lower horn: striped awning, loaves, a warm lamp
    ctx.fillStyle = 'rgba(10,6,40,.25)'; L.rrect(ctx, 12, -14, 34, 16, 3); ctx.fill();
    for (const px of [12, 42]) { ctx.fillStyle = '#6B4F9A'; ctx.fillRect(px, -34, 2.2, 22); }
    L.rrect(ctx, 9, -16, 38, 15, 3); jfill(ctx, '#8B5FC4', 16, -14, 20, 1);
    ctx.fillStyle = '#F0DDBE'; L.rrect(ctx, 7, -18, 42, 4, 2); ctx.fill();
    for (const [lx, c] of [[15, '#D9904A'], [23, '#E2A35A'], [31, '#C97F3A'], [39, '#E2A35A']]) { ell(ctx, lx, -20, 3.6, 2.4, c); ctx.strokeStyle = 'rgba(255,235,190,.8)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(lx - 1.6, -21); ctx.lineTo(lx - 0.4, -19.4); ctx.moveTo(lx + 0.2, -21.4); ctx.lineTo(lx + 1.4, -19.8); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(7, -40, 42, 9); ctx.clip();
    for (let k = 0; k < 7; k++) { ctx.fillStyle = k % 2 ? '#F4E4D2' : '#D96FA8'; ctx.fillRect(7 + k * 6, -40, 6, 9); } ctx.restore();
    for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(10 + k * 6, -31, 3, 0, Math.PI); ctx.fillStyle = k % 2 ? '#F4E4D2' : '#D96FA8'; ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(7, -40, 42, 1.4);
    ctx.restore();
  }
  function telescopeDome(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-24, -32, 48, 32); c.ellipse(0, -32, 27, 25, 0, Math.PI, TAU); }, { a: 0.2 });
    contact(ctx, 0, 0, 30, 6, 0.38);
    L.rrect(ctx, -24, -34, 48, 34, 5); jfill(ctx, '#7F72CC', -10, -24, 30, 1.1);
    ctx.fillStyle = 'rgba(30,20,80,.28)'; ctx.fillRect(10, -33, 13, 32);
    ctx.fillStyle = '#5A4EA8'; ctx.fillRect(-24, -36, 48, 4);
    // door and portholes
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-6, -12); ctx.arc(0, -12, 6, Math.PI, 0); ctx.lineTo(6, 0); ctx.closePath(); ctx.fillStyle = '#FFC864'; ctx.fill();
    ctx.strokeStyle = '#4A3F90'; ctx.lineWidth = 1.2; ctx.stroke();
    for (const wx of [-15, 15]) { ell(ctx, wx, -18, 4, 4, '#4A3F90'); ell(ctx, wx, -18, 2.8, 2.8, '#FFD68A'); }
    // the dome
    ctx.beginPath(); ctx.ellipse(0, -34, 27, 25, 0, Math.PI, TAU); ctx.closePath(); jfill(ctx, '#C6CEF2', -9, -48, 26, 1.1);
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, -34, 27, 25, 0, Math.PI, TAU); ctx.closePath(); ctx.clip();
    ctx.translate(0, -34); ctx.rotate(-0.55); ctx.fillStyle = '#231C5A'; ctx.fillRect(-4.5, -30, 9, 30); ctx.restore();
    for (const [sx, sy] of [[-16, -42], [12, -48], [18, -38], [-6, -54]]) L.star(ctx, sx, sy, 2.2, '#FFD43A', '#D9A000');
    hl(ctx, -14, -50, 6, 2.4, -0.7, 0.7);
    // the telescope, brass, looking up into the stars
    ctx.save(); ctx.translate(-2, -44); ctx.rotate(-2.2);
    L.rrect(ctx, -3, -3.4, 34, 6.8, 3); jfill(ctx, '#E2A94A', 6, -2, 16, 1);
    L.rrect(ctx, 26, -4.6, 8, 9.2, 2); jfill(ctx, '#C98A30', 28, -2, 6, 0.8);
    ctx.fillStyle = '#9FE8FF'; ctx.beginPath(); ctx.ellipse(34, 0, 1.4, 4, 0, 0, TAU); ctx.fill();
    hl(ctx, 12, -2, 8, 1, 0, 0.6);
    ctx.restore();
    // a star finial
    L.star(ctx, 0, -61, 3.2, '#FFD43A', '#D9A000');
    ctx.restore();
  }
  function stall(ctx, x, y, a) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, rect(-18, -40, 36, 40, 3), { a: 0.18 });
    contact(ctx, 0, 0, 22, 5, 0.35);
    for (const px of [-16, 14]) { ctx.fillStyle = '#5E4892'; ctx.fillRect(px, -38, 2.4, 38); }
    pool(ctx, 0, -18, 22, '#FFB060', 0.3, 0.8);
    L.rrect(ctx, -18, -15, 36, 15, 3); jfill(ctx, '#7E58BC', -8, -12, 20, 1);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(-15, -9, 30, 1.2);
    ctx.fillStyle = '#F0DDBE'; L.rrect(ctx, -20, -17, 40, 4, 2); ctx.fill();
    // goods: glowing jars and candy
    for (const [gx, c] of [[-12, '#FFD86A'], [-4, '#8FF3FF'], [4, '#FF9FE0'], [12, '#FFD86A']]) {
      ctx.fillStyle = L.rgba(c, 0.9); L.rrect(ctx, gx - 2.6, -24, 5.2, 7, 1.6); ctx.fill();
      ctx.fillStyle = '#E9D8C0'; ctx.fillRect(gx - 2.4, -25, 4.8, 1.6);
      ell(ctx, gx - 1, -21.5, 0.8, 1.6, 'rgba(255,255,255,.8)');
    }
    // the awning
    ctx.save(); ctx.beginPath(); ctx.rect(-21, -46, 42, 10); ctx.clip();
    for (let k = 0; k < 7; k++) { ctx.fillStyle = k % 2 ? '#F4E4D2' : a; ctx.fillRect(-21 + k * 6, -46, 6, 10); } ctx.restore();
    for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(-18 + k * 6, -36, 3, 0, Math.PI); ctx.fillStyle = k % 2 ? '#F4E4D2' : a; ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(-21, -46, 42, 1.4);
    ctx.fillStyle = 'rgba(20,10,60,.2)'; ctx.fillRect(9, -46, 12, 10);
    ctx.restore();
  }
  function marketPoles(ctx, g) {
    for (const p of g.poles) {
      cast(ctx, p.x, p.y, rect(-1.6, -48, 3.2, 48, 1), { a: 0.16 });
      contact(ctx, p.x, p.y, 6, 2, 0.35);
      ctx.fillStyle = '#5A4BA8'; L.rrect(ctx, p.x - 1.8, p.y - 48, 3.6, 48, 1.6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(p.x - 1.2, p.y - 47, 1, 46);
      L.star(ctx, p.x, p.y - 50, 3.4, '#FFD43A', '#D9A000');
    }
    ctx.strokeStyle = 'rgba(255,236,190,.8)'; ctx.lineWidth = 0.9; ctx.beginPath();
    for (let k = 0; k <= 30; k++) { const p = g.string(k / 30); k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke();
    // tiny fairy bulbs between the lanterns
    for (let k = 1; k < 20; k++) { if (k % 4 === 0) continue; const p = g.string(k / 20); glowDot(ctx, p.x, p.y + 1, 0.9, ['#FFE38A', '#FF9FE0', '#8FF3FF'][k % 3], 5); }
  }
  function owlTree(ctx, x, y, m, R) {
    ctx.save(); ctx.translate(x, y); ctx.scale(m, 1);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-9, -60, 18, 60); c.arc(0, -84, 34, 0, TAU); }, { a: 0.2 });
    contact(ctx, 0, 0, 22, 6, 0.4);
    // roots and trunk
    const tg = ctx.createLinearGradient(-10, 0, 10, 0); tg.addColorStop(0, '#8A6CA6'); tg.addColorStop(1, '#4A3462');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-16, 1); ctx.quadraticCurveTo(-9, -2, -8, -14); ctx.quadraticCurveTo(-6, -40, -9, -62); ctx.lineTo(9, -62); ctx.quadraticCurveTo(6, -40, 8, -14); ctx.quadraticCurveTo(10, -2, 17, 1); ctx.quadraticCurveTo(4, -2, 0, 1); ctx.quadraticCurveTo(-5, -2, -16, 1); ctx.fill();
    ctx.strokeStyle = 'rgba(30,18,60,.35)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-3, -6); ctx.quadraticCurveTo(-4, -26, -2, -44); ctx.moveTo(4, -10); ctx.quadraticCurveTo(3, -24, 5, -36); ctx.stroke();
    // the roost branch, reaching away from the trail, bats hanging under it
    ctx.strokeStyle = '#5E4478'; ctx.lineWidth = 4.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4, -50); ctx.quadraticCurveTo(-24, -54, -46, -46); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,190,255,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-6, -52); ctx.quadraticCurveTo(-24, -56, -44, -48.5); ctx.stroke();
    for (const [bx, by] of [[-24, -51], [-36, -49]]) {
      ctx.save(); ctx.translate(bx, by);
      ctx.strokeStyle = '#2B2050'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(-1, 2); ctx.moveTo(1, -1); ctx.lineTo(1, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(-5, 4, -4, 10); ctx.quadraticCurveTo(0, 13, 4, 10); ctx.quadraticCurveTo(5, 4, 0, 2); jfill(ctx, '#6A55B0', -1, 5, 6, 0.7);
      ctx.beginPath(); ctx.moveTo(-2.4, 11); ctx.lineTo(-3.2, 14); ctx.lineTo(-1, 11.8); ctx.moveTo(2.4, 11); ctx.lineTo(3.2, 14); ctx.lineTo(1, 11.8); ctx.fillStyle = '#6A55B0'; ctx.fill();
      ctx.strokeStyle = '#1E1438'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(-1.4, 8.4, 0.8, Math.PI, 0, true); ctx.arc(1.4, 8.4, 0.8, Math.PI, 0, true); ctx.stroke();
      ctx.restore();
    }
    // the hollow with the sleeping owl
    ctx.beginPath(); ctx.ellipse(0, -30, 6.4, 8.4, 0, 0, TAU); ctx.fillStyle = '#1E1438'; ctx.fill();
    ctx.strokeStyle = '#A88CC0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, -30, 6.6, 8.6, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -27.5, 4.8, 5.6, 0, 0, TAU); jfill(ctx, '#C8A27A', -1, -29, 5, 0.6);
    ell(ctx, 0, -28.6, 3.6, 2.8, '#EBD3B0');
    ctx.beginPath(); ctx.moveTo(-3.8, -32); ctx.lineTo(-3, -35.2); ctx.lineTo(-1.4, -32.6); ctx.moveTo(3.8, -32); ctx.lineTo(3, -35.2); ctx.lineTo(1.4, -32.6); ctx.fillStyle = '#A8825A'; ctx.fill();
    ctx.strokeStyle = '#4A3040'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(-1.6, -29.4, 1, 0.2, Math.PI - 0.2); ctx.moveTo(2.6, -29.4); ctx.arc(1.6, -29.4, 1, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.7, -28); ctx.lineTo(0.7, -28); ctx.lineTo(0, -26.6); ctx.fillStyle = '#F2A23A'; ctx.fill();
    // canopy
    const lobes = [[-20, -76, 19], [20, -78, 19], [0, -96, 22], [-6, -70, 18], [12, -66, 15], [-26, -90, 14], [24, -94, 14]];
    ctx.beginPath(); for (const [lx, ly, r] of lobes) { ctx.moveTo(lx + r, ly); ctx.arc(lx, ly, r, 0, TAU); }
    ctx.fillStyle = jgrad(ctx, '#3E5E9E', -10, -90, 40); ctx.fill();
    ctx.fillStyle = 'rgba(20,12,60,.3)'; ctx.beginPath(); ctx.ellipse(4, -62, 26, 8, 0, 0, Math.PI); ctx.fill();
    for (const [lx, ly, r] of lobes) hl(ctx, lx - r * 0.4, ly - r * 0.5, r * 0.32, r * 0.13, -0.6, 0.35);
    hl(ctx, -14, -104, 7, 2.6, -0.6, 0.55);
    // glowing starfruit
    for (let k = 0; k < 7; k++) { const fx = -24 + R() * 48, fy = -100 + R() * 34; glowDot(ctx, fx, fy, 1.6, '#FFE38A', 7); }
    ctx.restore();
  }
  function wishWell(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-18, -14, 36, 14); c.moveTo(-22, -44); c.lineTo(0, -60); c.lineTo(22, -44); c.closePath(); }, { a: 0.2 });
    contact(ctx, 0, 1, 22, 6, 0.4);
    ctx.beginPath(); ctx.moveTo(-18, -14); ctx.lineTo(-18, 0); ctx.ellipse(0, 0, 18, 7, 0, Math.PI, 0, true); ctx.lineTo(18, -14); ctx.ellipse(0, -14, 18, 7, 0, 0, Math.PI, false); ctx.closePath();
    const sg = ctx.createLinearGradient(-18, 0, 18, 0); sg.addColorStop(0, '#B4ABDF'); sg.addColorStop(0.55, '#857BC0'); sg.addColorStop(1, '#4E4594'); ctx.fillStyle = sg; ctx.fill();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(40,30,100,.4)'; ctx.lineWidth = 0.8;
    for (const ry of [-9, -4]) { ctx.beginPath(); ctx.ellipse(0, ry, 18, 7, 0, 0, Math.PI); ctx.stroke(); }
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 5.5 + (k % 2) * 2, -9 + Math.abs(k) * 0.2 + 7 - Math.abs(k) * 0.9); ctx.lineTo(k * 5.5 + (k % 2) * 2, -4 + 7 - Math.abs(k) * 0.9); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, -14, 18, 7, 0, 0, TAU); ctx.fillStyle = '#C4BCEB'; ctx.fill();
    const wg = ctx.createRadialGradient(-2, -15, 1, 0, -14, 13); wg.addColorStop(0, '#E8FEFF'); wg.addColorStop(0.5, '#8FF3FF'); wg.addColorStop(1, '#2B8FB0');
    ctx.beginPath(); ctx.ellipse(0, -14, 13, 4.6, 0, 0, TAU); ctx.fillStyle = wg; ctx.fill();
    for (const [cx, cy] of [[-5, -14], [4, -13], [1, -15.5]]) ell(ctx, cx, cy, 1.3, 0.7, '#FFD43A');
    // posts, crank, rope and bucket, roof
    for (const px of [-15, 13]) { ctx.fillStyle = '#6B4F9A'; L.rrect(ctx, px, -46, 3, 34, 1.2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(px + 0.5, -45, 0.8, 32); }
    ctx.fillStyle = '#A88CC0'; ctx.fillRect(-15, -37, 31, 2);
    ctx.strokeStyle = '#E9D8A6'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(4, -36); ctx.lineTo(4, -27); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.6, -27); ctx.lineTo(7.4, -27); ctx.lineTo(6.6, -22); ctx.lineTo(1.4, -22); ctx.closePath(); jfill(ctx, '#E2A94A', 3, -25, 4, 0.6);
    ctx.beginPath(); ctx.moveTo(-23, -43); ctx.lineTo(0, -60); ctx.lineTo(23, -43); ctx.quadraticCurveTo(0, -46, -23, -43); jfill(ctx, '#5546B0', -6, -52, 18, 1);
    ctx.strokeStyle = 'rgba(200,190,255,.4)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let k = 1; k < 4; k++) { ctx.moveTo(-23 + k * 4.4, -43 - k * 3.6); ctx.lineTo(23 - k * 4.4, -43 - k * 3.6); } ctx.stroke();
    ctx.strokeStyle = 'rgba(220,230,255,.75)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-22, -43.6); ctx.lineTo(-1, -59); ctx.stroke();
    L.star(ctx, 0, -62, 3, '#FFD43A', '#D9A000');
    ctx.restore();
  }
  function glowShroom(ctx, x, y, s, cap) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(0, -8, 0, 0, -8, 16); rg.addColorStop(0, L.rgba(cap, 0.35)); rg.addColorStop(1, L.rgba(cap, 0)); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, -8, 16, 0, TAU); ctx.fill(); ctx.restore();
    contact(ctx, 0, 0, 6, 2, 0.35);
    ctx.fillStyle = '#E4DEFF'; L.rrect(ctx, -2, -8, 4, 8, 1.8); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -8, 7, 6, 0, Math.PI, TAU); ctx.quadraticCurveTo(0, -6, -7, -8); jfill(ctx, cap, -2, -11, 7, 0.7);
    for (const [dx, dy] of [[-3, -10], [2, -12], [3.6, -9]]) ell(ctx, dx, dy, 0.9, 0.7, 'rgba(255,255,255,.9)');
    ctx.restore();
  }
  function starLamp(ctx, x, y) {
    cast(ctx, x, y, rect(-1.4, -30, 2.8, 30, 1), { a: 0.16 });
    contact(ctx, x, y, 6, 2, 0.35);
    ctx.fillStyle = '#4B3F8F'; L.rrect(ctx, x - 1.6, y - 30, 3.2, 30, 1.4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x - 1, y - 29, 0.9, 28);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const rg = ctx.createRadialGradient(x, y - 34, 0, x, y - 34, 18); rg.addColorStop(0, 'rgba(255,220,120,.45)'); rg.addColorStop(1, 'rgba(255,220,120,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y - 34, 18, 0, TAU); ctx.fill(); ctx.restore();
    L.star(ctx, x, y - 34, 5, '#FFE27A', '#D9A000');
    ell(ctx, x - 1.4, y - 35.5, 1.4, 0.8, 'rgba(255,255,255,.85)');
  }
  /* a raised garden bed of star-flowers: the garden's crop, each bloom a little glowing star */
  function starBed(ctx, x, y, n, R) {
    const w = n * 9 + 8;
    cast(ctx, x, y, rect(-w / 2, -7, w, 7, 3), { a: 0.18 });
    contact(ctx, x, y + 1, w * 0.6, 4, 0.35);
    L.rrect(ctx, x - w / 2, y - 8, w, 9, 3); jfill(ctx, '#6B4F9A', x - w / 4, y - 6, w / 2, 0.9);
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x - w / 2 + 3, y - 7, w - 6, 1.2);
    ell(ctx, x, y - 8, w / 2 - 2, 2.6, '#3A2860');
    for (let k = 0; k < n; k++) {
      const fx = x - w / 2 + 8 + k * 9 + (R() - 0.5) * 2, h = 9 + R() * 6, c = ['#FFE27A', '#FFF2B0', '#FFD0EA', '#BFF6FF'][k % 4];
      ctx.strokeStyle = '#3E8A7E'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx, y - 8); ctx.quadraticCurveTo(fx - 1.5, y - 8 - h * 0.5, fx, y - 8 - h); ctx.stroke();
      ell(ctx, fx + 2.4, y - 10 - h * 0.4, 2.2, 1, '#4FA88E', -0.5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const rg = ctx.createRadialGradient(fx, y - 9 - h, 0, fx, y - 9 - h, 9); rg.addColorStop(0, L.rgba(c, 0.5)); rg.addColorStop(1, L.rgba(c, 0)); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(fx, y - 9 - h, 9, 0, TAU); ctx.fill(); ctx.restore();
      L.star(ctx, fx, y - 9 - h, 3.2, c, L.shade(c, -0.35));
    }
  }
  function nightTree(ctx, x, y, s, R, fruit = '#FFE38A') {
    gumTree(ctx, x, y, s, '#3D66A4', null, R);
    for (let k = 0; k < 4; k++) glowDot(ctx, x + (-11 + R() * 22) * s, y + (-44 + R() * 16) * s, 1.4 * s, fruit, 6 * s);
  }

  function props(B, add, ctx) {
    const g = geom(B), R = B.rng(77), y = g.y;
    add(g.bakery.y, () => { ctx.save(); ctx.translate(g.bakery.x, g.bakery.y); ctx.scale(1.2, 1.2); moonBakery(ctx, 0, 0); ctx.restore(); });
    add(g.dome.y, () => telescopeDome(ctx, g.dome.x, g.dome.y));
    for (const s of g.stalls) add(s.y, () => stall(ctx, s.x, s.y, s.a));
    add(g.poles[1].y + 1, () => marketPoles(ctx, g));
    add(g.owl.y, () => owlTree(ctx, g.owl.x, g.owl.y, g.owl.m, B.rng(5)));
    add(g.well.y, () => wishWell(ctx, g.well.x, g.well.y));
    for (const l of g.lamps) add(l.y, () => starLamp(ctx, l.x, l.y));
    for (const b of g.beds) add(b.y, () => starBed(ctx, b.x, b.y, b.n, B.rng(60 + b.n)));
    // the glowing mushroom ring by 41 (the mushroom critter stands in it)
    for (const [dx, dy, s, c] of [[-24, -6, 0.9, '#8FF3FF'], [-12, -16, 0.7, '#FF9FE0'], [14, -14, 0.8, '#8FF3FF'], [26, -2, 1.0, '#C9A8FF'], [-26, 10, 0.75, '#FF9FE0'], [20, 14, 0.7, '#8FF3FF']])
      add(g.shrooms.y + dy, () => glowShroom(ctx, g.shrooms.x + dx, g.shrooms.y + dy, s, c));
    // trees on the far sides, sparse
    for (const [j, dx, dy, s] of [[0, 150, -40, 1.0], [0, 120, -6, 0.8], [2, -150, 40, 0.9], [3, 120, 60, 0.85], [5, 150, -60, 1.0], [6, 120, -84, 0.95], [6, 150, -50, 0.8], [7, 64, 44, 0.85], [7, 90, 76, 0.7], [9, -70, -30, 0.8], [9, 60, -60, 0.75]]) {
      const p = B.at(j, B.odd ? -dx : dx, dy);
      if (!g.insideAny(p.x, p.y, 0.86) || W.distToRoad(p.x, p.y) < 50) continue;
      add(p.y, () => nightTree(ctx, p.x, p.y, s, R));
    }
    // satellite islet decorations
    for (const s of g.sats) {
      if (s.deco === 'shroom') { add(s.cy, () => { glowShroom(ctx, s.cx - 8, s.cy, 1.1, '#FF9FE0'); glowShroom(ctx, s.cx + 7, s.cy + 2, 0.8, '#8FF3FF'); }); }
      else if (s.deco === 'tree') add(s.cy, () => nightTree(ctx, s.cx, s.cy + 2, 0.7, R, '#FF9FE0'));
      else if (s.deco === 'lamp') add(s.cy, () => starLamp(ctx, s.cx, s.cy + 2));
      else if (s.deco === 'flowers') add(s.cy, () => { for (let k = 0; k < 6; k++) glowFlower(ctx, s.cx + (k - 2.5) * 6, s.cy + Math.sin(k * 2) * 3, ['#8FF3FF', '#FFE38A', '#FF9FE0'][k % 3], R); });
    }
  }

  /* ---------- foreground framing ---------- */
  function fg(B, put) {
    const n = j => B.node(j).y;
    const items = [[1, n(0) + 60, 'bush', 40, '#1E3460'], [-1, n(2) + 50, 'branch', 1.0, '#22386A'], [-1, n(5) + 60, 'bush', 34, '#1E3460'], [1, n(7) + 10, 'branch', 0.95, '#22386A'], [-1, n(9) - 40, 'bush', 32, '#1E3460']];
    for (const [side, y, kind, s, c] of items) put({ side, y, kind, s, c });
  }

  /* ---------- manifest ---------- */
  function manifest(B, put) {
    const g = geom(B), y = g.y, X = B.mx;
    // live: fireflies over the pond and round the owl tree, lanterns, smoke, sleepy owl, wishes, sky
    put.live('firefly', { x: g.pond.x - 4, y: g.pond.y - 22, rx: 52, ry: 20, n: 6, ph: 0 });
    put.live('firefly', { x: g.owl.x + 10 * g.owl.m, y: g.owl.y - 70, rx: 44, ry: 26, n: 5, ph: 2.1 });
    put.live('firefly', { x: g.shrooms.x + 10, y: g.shrooms.y - 26, rx: 36, ry: 14, n: 3, ph: 4.2 });
    for (const l of g.lanterns) put.live('lantern', { x: l.x, y: l.y, c: l.c, ph: l.ph, s: 1 });
    const BS = 1.2, bp = (dx, dy) => ({ x: g.bakery.x + dx * BS, y: g.bakery.y + dy * BS });
    put.live('lantern', Object.assign(bp(-25, -27), { c: '#FFC24A', ph: 0.7, s: 0.9 }));
    put.live('smoke', bp(-17, -90));
    put.live('zz', { x: g.owl.x + 8 * g.owl.m, y: g.owl.y - 38 });
    put.live('twinkle', { pts: [{ x: g.well.x - 10, y: g.well.y - 70 }, { x: g.well.x + 14, y: g.well.y - 78 }, { x: g.well.x + 2, y: g.well.y - 92 }], r: 3.6, ph: 0 });
    put.live('twinkle', { pts: [[X(70), y(9) - 30], [X(460), y(8) + 50], [X(90), y(6) + 70], [X(452), y(5) - 70], [X(84), y(3) - 120], [X(458), y(2) + 50], [X(76), y(1) - 60], [X(300), y(9) - 150], [X(120), y(9) - 170]].map(([x, yy]) => ({ x, y: yy })), r: 4.2, ph: 1.3 });
    put.live('shootingstar', { x: X(420), y: y(9) - 150, a: Math.PI * (B.odd ? 0.2 : 0.8), L: 150, per: 13, ph: 0 });
    put.live('shootingstar', { x: X(110), y: y(5) - 40, a: Math.PI * (B.odd ? 0.8 : 0.2), L: 110, per: 19, ph: 7 });
    // night glows: windows, doors, lamps, lanterns, the well, the mushrooms, the bridge lamps
    const bk = g.bakery;
    put.glow(Object.assign(bp(-27, -38), { r: 20, c: '#FFC66A' }));
    put.glow(Object.assign(bp(-20, -62), { r: 16, c: '#FFC66A' }));
    put.glow(Object.assign(bp(-11, -14), { r: 24, c: '#FFB54A' }));
    put.glow(Object.assign(bp(28, -22), { r: 28, c: '#FFC66A' }));
    put.glow({ x: g.dome.x, y: g.dome.y - 10, r: 20, c: '#FFB54A' });
    put.glow({ x: g.dome.x - 15, y: g.dome.y - 18, r: 10, c: '#FFD68A' });
    put.glow({ x: g.dome.x + 15, y: g.dome.y - 18, r: 10, c: '#FFD68A' });
    for (const s of g.stalls) put.glow({ x: s.x, y: s.y - 20, r: 24, c: '#FFB060' });
    for (const l of g.lanterns) put.glow({ x: l.x, y: l.y + 10, r: 22, c: l.c });
    put.glow(Object.assign(bp(-25, -17), { r: 18, c: '#FFC24A' }));
    put.glow(Object.assign(bp(30, -59), { r: 12, c: '#FFE08A' }));
    for (const l of g.lamps) put.glow({ x: l.x, y: l.y - 34, r: 26, c: '#FFE08A' });
    for (const s of g.sats) if (s.deco === 'lamp') put.glow({ x: s.cx, y: s.cy - 32, r: 22, c: '#FFE08A' });
    for (const p of g.poles) put.glow({ x: p.x, y: p.y - 50, r: 14, c: '#FFE08A' });
    put.glow({ x: g.well.x, y: g.well.y - 14, r: 30, c: '#7FEFFF' });
    put.glow({ x: g.shrooms.x, y: g.shrooms.y - 8, r: 40, c: '#8FF3FF' });
    for (const run of g.bridges) for (const k of [0, run.length - 1]) for (const sd of [-1, 1]) { const p = run[k]; put.glow({ x: p.x - p.ty * 22 * sd, y: p.y + p.tx * 22 * sd - 14, r: 16, c: '#FFD86A' }); }
    put.glow({ x: g.owl.x, y: g.owl.y - 85, r: 22, c: '#FFE38A' });
    // critters with jobs: the baker's cat dozes by the counter, the hamster minds the telescope,
    // the blob keeps the middle stall, the bat roosts on the owl tree, the sprite guards the wishes,
    // the mushroom lives in its ring
    put.critter({ kind: 'cat', x: bk.x - 50, y: bk.y + 6, size: 30 });
    put.critter({ kind: 'hamster', x: g.dome.x + 34 * (B.odd ? -1 : 1), y: g.dome.y + 4, size: 30 });
    put.critter({ kind: 'blob', x: g.stalls[1].x, y: g.stalls[1].y - 18, size: 28 });
    put.critter({ kind: 'bat', x: g.owl.x - 52 * g.owl.m, y: g.owl.y - 46, size: 28, float: true });
    put.critter({ kind: 'sprite', x: g.well.x + 30, y: g.well.y - 40, size: 30, float: true });
    put.critter({ kind: 'mushroom', x: g.shrooms.x, y: g.shrooms.y + 2, size: 36 });
    put.chest(B.i0 + 2, { x: g.chest42.x, y: g.chest42.y });
    put.chest(B.i0 + 6, { x: g.chest46.x, y: g.chest46.y });
    put.sign({ role: 'region', level: B.i0 + 3, x: g.regionSign.x, y: g.regionSign.y });
    put.sign({ role: 'rest', level: B.i0 + 5, x: g.restSign.x, y: g.restSign.y });
    put.gate({ x: g.gate.x, y: g.gate.y + 4, angle: +Math.atan2(g.gate.ty, g.gate.tx).toFixed(3), to: B.k + 1 });
  }

  /* ---------- live kinds (ported in PeckLiveLayer.swift) ---------- */
  /* firefly: n lights wandering on slow Lissajous loops inside an rx × ry box around (dx, yb),
     each pulsing on its own phase. */
  W.LIVE.firefly = (ctx, e, t) => {
    const x0 = W.CX + e.dx, y0 = W.H - e.yb, ph = e.ph || 0;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < (e.n || 5); k++) {
      const a = t * 0.3 + ph + k * 2.39;
      const x = x0 + e.rx * Math.sin(a + k * 1.7) * Math.cos(a * 0.37 + k);
      const y = y0 + e.ry * Math.sin(a * 1.3 + k * 2.3) - 3 * Math.sin(t * 0.9 + k);
      const p = 0.5 + 0.5 * Math.sin(t * 1.5 + k * 1.9 + ph);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 8); g.addColorStop(0, `rgba(255,240,140,${0.45 * p})`); g.addColorStop(1, 'rgba(255,240,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,252,210,${0.35 + 0.65 * p})`; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
  /* shootingstar: once every `per` seconds (offset `ph`), a streak glides L units from (dx, yb)
     along angle `a` over 2.4 s, its tail growing and fading with sin(πu); invisible otherwise. */
  W.LIVE.shootingstar = (ctx, e, t) => {
    const u = ((t + (e.ph || 0)) % e.per) / 2.4; if (u >= 1) return;
    const x0 = W.CX + e.dx, y0 = W.H - e.yb, ca = Math.cos(e.a), sa = Math.sin(e.a), e2 = 1 - (1 - u) * (1 - u);
    const hx = x0 + ca * e.L * e2, hy = y0 + sa * e.L * e2, tl = 46 * Math.sin(Math.PI * u), al = Math.sin(Math.PI * u);
    const g = ctx.createLinearGradient(hx - ca * tl, hy - sa * tl, hx, hy); g.addColorStop(0, 'rgba(255,250,230,0)'); g.addColorStop(1, `rgba(255,250,230,${0.85 * al})`);
    ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx - ca * tl, hy - sa * tl); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6); hg.addColorStop(0, `rgba(255,250,230,${0.8 * al})`); hg.addColorStop(1, 'rgba(255,250,230,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, TAU); ctx.fill();
    ctx.restore();
  };
  /* lantern: a paper lantern hanging from (dx, yb), swinging ±0.1 rad at 1.1 rad/s; colour c,
     scale s. Draws its own small halo. */
  W.LIVE.lantern = (ctx, e, t) => {
    const x = W.CX + e.dx, y = W.H - e.yb, s = e.s || 1, a = 0.1 * Math.sin(t * 1.1 + (e.ph || 0));
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    ctx.strokeStyle = 'rgba(255,236,190,.8)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 4); ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(0, 10, 0, 0, 10, 15); hg.addColorStop(0, L.rgba(e.c, 0.45)); hg.addColorStop(1, L.rgba(e.c, 0));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 10, 15, 0, TAU); ctx.fill(); ctx.restore();
    const bg = ctx.createRadialGradient(-1.4, 8.6, 0.5, 0, 10, 6.5); bg.addColorStop(0, '#FFF6D0'); bg.addColorStop(0.55, e.c); bg.addColorStop(1, L.shade(e.c, -0.3));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 10, 5, 6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = L.rgba(L.shade(e.c, -0.45), 0.5); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(0, 10, 2.2, 6, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#3B2E80'; ctx.fillRect(-2.4, 3.4, 4.8, 1.8); ctx.fillRect(-2.4, 15, 4.8, 1.6);
    ctx.restore();
  };
  /* twinkle: a set of stars (pts) that swell and fade gently, each on its own phase. r = size. */
  W.LIVE.twinkle = (ctx, e, t) => {
    ctx.save();
    e.pts.forEach((pt, k) => {
      const x = W.CX + pt[0], y = W.H - pt[1], p = 0.5 + 0.5 * Math.sin(t * 1.1 + k * 2.1 + (e.ph || 0)), r = e.r * (0.55 + 0.45 * p);
      ctx.globalAlpha = 0.35 + 0.6 * p;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8); g.addColorStop(0, 'rgba(255,246,210,.5)'); g.addColorStop(1, 'rgba(255,246,210,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFF8E0'; ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
    });
    ctx.restore();
  };

  W.chapter({
    id: 'stars', name: 'STARLIGHT GARDEN', title: 'Starlight Garden', road: 'ribbon',
    roadStyle: { edge: '#7A62C9', base: '#F2EDFF', dash: '#FFD43A', grass: 'rgba(10,6,40,.28)' },
    node: ['#FFF8D0', '#FFD43A', '#D9A000'], gateBanner: ['TO CANDY COSMOS', '#2A2160', '#FFD43A'],
    sign: { board: '#3A2E80', plate: '#FFF6D8', ink: '#3A2E80' },
    edgeColor: '#2A2160', finaleSky: ['#1D1840', '#3A2E80', '#7A62C9'], night: true,
    geom, ground, props, fg, manifest,
    /* the top of the garden: the last island's back edge where it exists, open sky (B.top) elsewhere */
    topEdge: B => { const g = geom(B), pts = outline(g.D); return x => { let best = B.top; for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) { const yy = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x); if (yy < best) best = yy; } } return best; }; },
    _debug: { rIn, edgeDist, outline },
  });
})();
