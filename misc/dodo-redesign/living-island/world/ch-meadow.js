/* Chapter 1 — Gumdrop Meadow (levels 1–10). The concept's meadow, re-anchored to the app's trail:
   cottage + nest + mushroom family at 1, carrot garden and the watering bunny at 2, gumdrop orchard
   between 3 and 4 with the chest at 3, campsite at the rest stop (5), beehive at 6, windmill at 7,
   the grove at 7, river and plank bridge between 8 and 9, lighthouse and gate at the shore (10). */
(function () {
  'use strict';
  const L = window.L, K = window.K, W = window.WORLD, TAU = Math.PI * 2;
  const { ell, hl, cast, contact, rect, jgrad, tuft, flowerPatch, gumTree } = K;

  /* ---------- shared shapes for this band ---------- */
  function wig(x) { return Math.sin(x / 41 + 0.6) * 5 + Math.sin(x / 15 + 2) * 1.6; }
  function geom(B) {
    if (B._g) return B._g;
    const g = {};
    g.shoreY = W.yBound(B.k + 1);
    const gp = W.roadAtY(g.shoreY, B.i1, B.i1 + 1);
    g.gate = { x: gp.x, y: gp.y, tx: gp.tx, ty: gp.ty, d: gp.d };
    // the shore climbs toward the river mouth and the lighthouse, on the free side of the last node
    const s = B.node(9).m;
    g.shoreAt = x => g.shoreY + (g.gate.x - x) * 0.25 * s + wig(x) - wig(g.gate.x);
    g.grassEdge = x => g.shoreAt(x) + 30 + Math.sin(x / 29 + 1) * 5 + Math.sin(x / 11) * 1.5;
    // hill crests, one about every two levels, slopes alternating so they interlock with the trail
    const spec = [[-1, 150, 0.15, '#8BC86F'], [0, -38, -0.28, '#95CF79'], [2, 40, 0.30, '#9ED582'], [4, 62, -0.30, '#A8DA8B'], [6, 58, 0.32, '#B3E096'], [8, 34, -0.30, '#BFE6A2']];
    g.hills = spec.map(([j, dy, sl, c], n) => ({ y0: (j < 0 ? B.node(0).y + P() : B.node(j).y) + dy - (j < 0 ? P() : 0), sl: sl * (B.odd ? -1 : 1), a: [10, 14, 15, 18, 14, 16][n], f: [0.02, 0.015, 0.019, 0.016, 0.014, 0.017][n], p: [3.0, 5.2, 1.3, 4.0, 2.1, 0.4][n], c }));
    g.crest = (h, x) => h.y0 + h.sl * (x - W.CX) + h.a * Math.sin(x * h.f + h.p) + 4 * Math.sin(x * 0.051 + h.p * 2);
    // landmark spots (canonical anchors; A() mirrors them with the trail)
    g.cottage = B.A(0, 128, 6);
    g.nest = B.A(0, 72, 30);
    g.shrooms = B.A(0, 196, 70);
    g.garden = B.A(1, 136, -12);
    g.bunny = { x: g.garden.x + g.garden.m * 74, y: g.garden.y + 26 };
    g.can = { x: g.bunny.x - g.garden.m * 18, y: g.bunny.y - 12 };
    g.orchard = B.A(3, 168, 64);
    g.chest3 = B.A(2, 74, 46);
    g.camp = B.A(4, 140, 54);            // tent; the fire sits between it and the trail
    g.fire = { x: g.camp.x - g.camp.m * 66, y: g.camp.y - 10 };
    g.hive = B.A(5, 132, 52);
    g.windmill = B.A(6, -150, -16);
    g.grove = B.A(6, 150, 44);
    g.lighthouse = B.A(9, 150, -64);
    g.pier = B.A(9, -112, -96);
    return (B._g = g);
  }
  const P = () => W.P;

  /* the river: in from the screen edge on the far side, under the bridge between 8 and 9,
     north along the free side of 9 and out into the lagoon beside the lighthouse */
  function riverPts(B, g) {
    const n6 = B.node(6), n7 = B.node(7), n8 = B.node(8), n9 = B.node(9);
    const s = n7.m;  // n7 sits on the right in band 0: the river enters on the left (+ room side)
    const cross = W.roadAtY((n7.y + n8.y) / 2, B.i0 + 7, B.i0 + 8);
    const X = x => W.CX + (x - W.CX) * s;  // author on band 0's layout, mirror with the trail
    const pts = [
      [X(-30), n7.y + 38], [X(60), n7.y + 18], [X(140), n7.y + 2], [X(215), n7.y - 26],
      [cross.x, cross.y], [X(372), n8.y + 22], [X(414), n8.y - 26], [X(426), n9.y + 70],
      [X(412), n9.y + 6], [X(424), n9.y - 50], [X(440), g.shoreAt(X(440)) + 4],
    ].map(([x, y]) => ({ x, y }));
    return L.catmull(pts, 12);
  }

  /* ---------- ground ---------- */
  function ground(ctx, B) {
    const g = geom(B), DW = W.DW, R = B.rng(21);
    const top = g.shoreY - 140, bottom = B.bottom;
    // sand under the meadow (the beach is what shows between the shore and the grass)
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-10, bottom); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, g.shoreAt(x) - 1); ctx.lineTo(DW + 10, bottom); ctx.closePath();
    ctx.fillStyle = '#F5E2BC'; ctx.fill();
    ctx.restore();
    const edges = [{ fn: g.grassEdge, c: '#C6EAAA', sl: -0.25 }, ...g.hills.slice().reverse().map(h => ({ fn: x => g.crest(h, x), c: h.c, sl: h.sl }))];
    const poly = (fn, dy = 0) => { const Q = []; for (let x = -10; x <= DW + 10; x += 6) Q.push([x, fn(x) + dy]); return Q; };
    const line = Q => { ctx.beginPath(); Q.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };
    edges.forEach((h, i) => {
      const pts = poly(h.fn), nxt = edges[i + 1];
      if (i > 0) {
        ctx.save(); ctx.lineJoin = 'round';
        for (const [w, a] of [[70, 0.05], [44, 0.06], [24, 0.08], [10, 0.12]]) { line(poly(h.fn, -w * 0.32)); ctx.strokeStyle = `rgba(28,72,84,${a})`; ctx.lineWidth = w; ctx.stroke(); }
        ctx.restore();
      }
      line(pts); ctx.lineTo(DW + 10, bottom + 10); ctx.lineTo(-10, bottom + 10); ctx.closePath();
      ctx.save();
      const y0 = h.fn(W.CX), T = nxt ? Math.max(120, nxt.fn(W.CX) - y0) : 200, nl = Math.hypot(h.sl, 1), nxv = -h.sl / nl, nyv = 1 / nl;
      const gr = ctx.createLinearGradient(W.CX, y0, W.CX + nxv * T, y0 + nyv * T);
      gr.addColorStop(0, L.shade(h.c, 0.34)); gr.addColorStop(0.1, L.shade(h.c, 0.16)); gr.addColorStop(0.42, h.c); gr.addColorStop(1, L.mix(h.c, '#4F9A86', 0.3));
      ctx.fillStyle = gr; ctx.fill(); ctx.clip();
      const lx = 90 + (i * 53) % 110, ly = h.fn(lx) + T * 0.3;
      let rg = ctx.createRadialGradient(lx, ly, 10, lx, ly, 200); rg.addColorStop(0, 'rgba(255,252,205,.30)'); rg.addColorStop(1, 'rgba(255,252,205,0)');
      ctx.fillStyle = rg; ctx.fillRect(lx - 210, ly - 210, 420, 420);
      const sx = DW - 60 - (i * 37) % 100, sy = h.fn(sx) + T * 0.85;
      rg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 180); rg.addColorStop(0, 'rgba(36,84,96,.20)'); rg.addColorStop(1, 'rgba(36,84,96,0)');
      ctx.fillStyle = rg; ctx.fillRect(sx - 190, sy - 190, 380, 380);
      ctx.restore();
      const rim = ctx.createLinearGradient(0, 0, DW, 0); rim.addColorStop(0, 'rgba(255,255,220,.85)'); rim.addColorStop(1, 'rgba(255,255,220,.35)');
      ctx.strokeStyle = rim; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; line(poly(h.fn, 1.4)); ctx.stroke();
      ctx.strokeStyle = i === 0 ? 'rgba(120,150,70,.35)' : 'rgba(50,100,60,.22)'; ctx.lineWidth = 1; line(pts); ctx.stroke();
    });
    // grove floor and knolls under the big landmarks
    { const gx = g.grove.x + g.grove.m * 30, gy = g.grove.y; ctx.save(); ctx.translate(gx, gy); ctx.scale(1, 1.15); const rg = ctx.createRadialGradient(0, 0, 10, 0, 0, 90); rg.addColorStop(0, 'rgba(40,96,60,.26)'); rg.addColorStop(0.7, 'rgba(40,96,60,.14)'); rg.addColorStop(1, 'rgba(40,96,60,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, 90, 0, TAU); ctx.fill(); ctx.restore(); }
    for (const [p, rx, ry, c] of [[g.windmill, 96, 44, '#B6E19A'], [g.cottage, 104, 42, '#A6DA8A'], [g.orchard, 130, 52, '#ABDC8E'], [g.hive, 84, 34, '#B8E29C']]) {
      const x = p.x, y = p.y + 10;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
      const sg = ctx.createRadialGradient(rx * 0.12, rx * 0.22, rx * 0.4, rx * 0.12, rx * 0.22, rx * 1.05);
      sg.addColorStop(0, 'rgba(50,100,40,.16)'); sg.addColorStop(1, 'rgba(50,100,40,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(rx * 0.12, rx * 0.22, rx * 1.05, 0, TAU); ctx.fill();
      const gg = ctx.createRadialGradient(-rx * 0.3, -rx * 0.45, rx * 0.1, 0, 0, rx);
      gg.addColorStop(0, L.rgba(L.shade(c, 0.32), 1)); gg.addColorStop(0.55, L.rgba(c, 0.95)); gg.addColorStop(0.85, L.rgba(c, 0.6)); gg.addColorStop(1, L.rgba(c, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,225,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, rx * 0.8, ry * 0.8, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    }
    // broad tonal noise, low-res and scaled up
    {
      const noise = L.makeNoise(11 + B.k);
      const sx = 4, nw = Math.ceil(DW / sx), y0 = Math.floor(g.shoreY - 120), nh = Math.ceil((bottom - y0) / sx);
      const oc = document.createElement('canvas'); oc.width = nw; oc.height = nh; const oc2 = oc.getContext('2d');
      const im = oc2.createImageData(nw, nh), d = im.data;
      for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
        const x = i * sx, y = y0 + j * sx, v = noise.fbm(x / 110, y / 110, 3) * 2.2 + noise.n2(x / 18, y / 18) * 0.5, kk = (j * nw + i) * 4;
        if (v > 0) { d[kk] = 255; d[kk + 1] = 250; d[kk + 2] = 190; d[kk + 3] = Math.min(255, v * 130); }
        else { d[kk] = 40; d[kk + 1] = 95; d[kk + 2] = 45; d[kk + 3] = Math.min(255, -v * 110); }
      }
      oc2.putImageData(im, 0, 0);
      ctx.save(); ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 8) ctx.lineTo(x, g.grassEdge(x) + 2); ctx.lineTo(DW + 10, bottom); ctx.lineTo(-10, bottom); ctx.closePath(); ctx.clip();
      ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 0.4; ctx.drawImage(oc, 0, y0, nw * sx, nh * sx); ctx.restore();
    }
    // side trails from the road to the landmarks
    const spur = (p, toward, bend = 0) => {
      const r = W.roadAtY(p.y + (toward || 0), B.i0, B.i1 + 1); if (!r) return;
      const mx = (r.x + p.x) / 2, my = (r.y + p.y) / 2 + bend;
      const sp = L.catmull([{ x: r.x, y: r.y }, { x: mx, y: my }, { x: p.x, y: p.y }], 10);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; L.pathPoly(ctx, sp.pts);
      ctx.strokeStyle = 'rgba(120,110,50,.18)'; ctx.lineWidth = 13; ctx.stroke();
      ctx.strokeStyle = '#E6CFA2'; ctx.lineWidth = 10; ctx.stroke();
      ctx.strokeStyle = '#F6E6C4'; ctx.lineWidth = 7; ctx.stroke();
      ctx.restore();
      for (let q = 0; q < sp.pts.length; q += 3) { const pp = sp.pts[q]; ell(ctx, pp.x + (R() - 0.5) * 4, pp.y + (R() - 0.5) * 3, 1.3, 0.8, 'rgba(190,150,100,.45)'); }
    };
    spur({ x: g.cottage.x - g.cottage.m * 2, y: g.cottage.y + 4 }, 0, 8);
    spur({ x: g.fire.x, y: g.fire.y + 14 }, 0, 6);
    spur({ x: g.hive.x - g.hive.m * 14, y: g.hive.y + 8 }, 0, -4);
    spur({ x: g.grove.x + g.grove.m * 20, y: g.grove.y + 4 }, 0, 4);
    spur({ x: g.windmill.x + g.windmill.m * 30, y: g.windmill.y + 6 }, 0, -6);
    spur({ x: g.chest3.x, y: g.chest3.y + 6 }, 0, 2);
    // beach details
    ctx.save(); ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 6) ctx.lineTo(x, g.shoreAt(x) + 9); for (let x = DW + 10; x >= -10; x -= 6) ctx.lineTo(x, g.shoreAt(x) - 2); ctx.closePath();
    ctx.fillStyle = '#E3C99A'; ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,248,230,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 6) ctx.lineTo(x, g.shoreAt(x) + 9.5); ctx.stroke();
    // foam where the lagoon meets the beach
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, g.shoreAt(x) - 1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([10, 7]); ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, g.shoreAt(x) - 7 - Math.sin(x / 17) * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    for (let i = 0; i < 90; i++) { const x = R() * DW, y = g.shoreAt(x) + 12 + R() * 16; if (W.distToRoad(x, y) < 20) continue; ell(ctx, x, y, 1 + R() * 1.3, 0.7 + R() * 0.6, ['#E8C9A0', '#FFFFFF', '#F7B9CF', '#D9B990'][i % 4]); }
    // grass tufts, clover and flowers: dense away from the trail, clear of landmark footprints
    const keep = [[g.cottage.x, g.cottage.y - 16, 58], [g.nest.x, g.nest.y, 22], [g.garden.x, g.garden.y, 64], [g.orchard.x, g.orchard.y - 30, 90], [g.chest3.x, g.chest3.y - 8, 24],
      [g.camp.x, g.camp.y - 10, 50], [g.fire.x, g.fire.y, 32], [g.hive.x, g.hive.y - 10, 30], [g.windmill.x, g.windmill.y - 20, 54], [g.grove.x + g.grove.m * 30, g.grove.y - 10, 80],
      [g.lighthouse.x, g.lighthouse.y - 20, 40], [g.shrooms.x, g.shrooms.y, 30]];
    const free = (x, y) => keep.every(([a, b, r]) => (x - a) ** 2 + (y - b) ** 2 > r * r);
    const river = riverPts(B, g);
    const nearRiver = (x, y) => { for (let q = 0; q < river.pts.length; q += 2) { const p = river.pts[q]; if ((p.x - x) ** 2 + (p.y - y) ** 2 < 26 * 26) return true; } return false; };
    for (let i = 0; i < 1400; i++) {
      let x, y;
      if (R() < 0.55) { const h = g.hills[Math.floor(R() * g.hills.length)]; x = R() * DW; y = g.crest(h, x) + 2 + R() * R() * 26; }
      else { const [a, b, r] = keep[Math.floor(R() * keep.length)], an = R() * TAU, rr = r * (0.9 + R() * 0.45); x = a + Math.cos(an) * rr; y = b + Math.sin(an) * rr * 0.55 + r * 0.2; }
      if (y < g.shoreAt(x) + 40 || y > bottom) continue;
      const dr = W.distToRoad(x, y); if (dr < 22 || (dr < 46 && R() < 0.6) || !free(x, y) || nearRiver(x, y)) continue;
      const base = y > B.node(1).y ? '#4E9A42' : y > B.node(5).y ? '#58A24A' : '#64AA54';
      tuft(ctx, x, y, 0.8 + R() * 0.6, L.rgba(base, 0.7), 'rgba(235,255,200,.8)');
    }
    for (let i = 0; i < 1300; i++) { const x = R() * DW, y = g.shoreY + 40 + R() * (bottom - g.shoreY); if (y < g.shoreAt(x) + 40 || W.distToRoad(x, y) < 20) continue; ell(ctx, x, y, 1.1, 0.6, R() < 0.5 ? 'rgba(70,130,60,.22)' : 'rgba(255,255,220,.35)'); }
    const F = ['#FF9FC8', '#FFFFFF', '#A77BF2', '#FFAA82', '#5EC6EC'];
    const patches = [[-110, 70, 40, 14, 18, 0], [180, 24, 34, 12, 14, 1], [-120, -30, 46, 18, 22, 3], [200, 30, 26, 16, 10, 5], [-110, 40, 50, 14, 18, 6],
      [-90, 60, 60, 16, 22, 7], [190, -20, 30, 12, 10, 2], [-140, -10, 34, 12, 12, 4], [-100, 40, 50, 14, 16, 9], [100, 60, 26, 10, 8, 8]];
    for (const [dx, dy, rx, ry, n, j] of patches) { const p = B.A(j, dx, dy); if (free(p.x, p.y) && W.distToRoad(p.x, p.y) > rx + 18) flowerPatch(ctx, R, p.x, p.y, rx, ry, n, F); }
    drawRiver(ctx, B, g, river, R);
  }

  function drawRiver(ctx, B, g, river, R) {
    const rp = river.pts, mouthY = g.shoreAt(rp[rp.length - 1].x);
    const flare = y => Math.max(0, (mouthY + 110 - y) / 110) ** 1.6 * 34;
    const bandPoly = (half, dx = 0, dy = 0) => { const Lf = [], Rt = []; for (const p of rp) { const w = half + flare(p.y) * (half / 16); Lf.push([p.x - p.ty * w + dx, p.y + p.tx * w + dy]); Rt.push([p.x + p.ty * w + dx, p.y - p.tx * w + dy]); }
      ctx.beginPath(); Lf.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); for (let k = Rt.length - 1; k >= 0; k--) ctx.lineTo(Rt[k][0], Rt[k][1]); ctx.closePath(); };
    bandPoly(17, 3, 4); ctx.fillStyle = 'rgba(40,80,50,.18)'; ctx.fill();
    bandPoly(16); ctx.fillStyle = '#D9C694'; ctx.fill();
    bandPoly(13.5); ctx.fillStyle = '#C7B07E'; ctx.fill();
    bandPoly(11.5); ctx.fillStyle = '#3FA6D6'; ctx.fill();
    bandPoly(8.5, 1.5, 1.5); ctx.fillStyle = '#64C3E8'; ctx.fill();
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.translate(-2, -2); L.pathPoly(ctx, rp.filter(p => p.y > mouthY + 40)); ctx.strokeStyle = 'rgba(190,240,255,.55)'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    const m = rp[rp.length - 1];
    ctx.save(); const gg = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, 60); gg.addColorStop(0, 'rgba(100,200,235,.8)'); gg.addColorStop(1, 'rgba(100,200,235,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(m.x, m.y, 60, 0, TAU); ctx.fill(); ctx.restore();
    for (let k = 4; k < rp.length - 6; k += 3) {
      const p = rp[k], nxv = -p.ty, nyv = p.tx;
      if (W.distToRoad(p.x, p.y) < 40 || p.y < mouthY + 40) continue;
      for (const sd of [-1, 1]) {
        if (R() < 0.45) continue;
        const x = p.x + nxv * sd * 17, y = p.y + nyv * sd * 17;
        if (R() < 0.5) { ell(ctx, x + 1, y + 1.5, 3.2, 1.6, 'rgba(40,60,80,.25)'); ell(ctx, x, y, 3, 2, '#E9DCEB'); hl(ctx, x - 1, y - 0.8, 1.2, 0.6, 0, 0.9); }
        else { ctx.strokeStyle = '#4FA65A'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath(); for (let q = -1; q <= 1; q++) { ctx.moveTo(x + q * 1.6, y); ctx.quadraticCurveTo(x + q * 2, y - 5, x + q * 3, y - 8 - R() * 3); } ctx.stroke(); ell(ctx, x + 1, y - 9, 1.2, 2.4, '#B9784A'); }
      }
    }
  }

  /* ---------- landmarks ---------- */
  function props(B, add, ctx) {
    const g = geom(B), R = B.rng(77);
    add(g.cottage.y, () => K.cottage(ctx, g.cottage.x, g.cottage.y));
    add(g.nest.y, () => K.nest(ctx, g.nest.x, g.nest.y));
    add(g.garden.y, () => K.garden(ctx, g.garden.x, g.garden.y, R));
    add(g.can.y, () => K.wateringCan(ctx, g.can.x, g.can.y));
    add(g.orchard.y - 40, () => K.orchard(ctx, R, g.orchard.x, g.orchard.y));
    add(g.orchard.y + 50, () => K.orchardFront(ctx, g.orchard.x, g.orchard.y));
    // the campsite: tent, fire ring, logs (the bat is a sprite)
    add(g.camp.y, () => { ctx.save(); ctx.translate(g.camp.x, g.camp.y); ctx.scale(1.18, 1.18); K.tent(ctx, 0, 0); ctx.restore(); });
    add(g.fire.y, () => K.campfireBase(ctx, g.fire.x, g.fire.y));
    add(g.hive.y, () => K.beehive(ctx, g.hive.x, g.hive.y));
    add(g.hive.y - 26, () => gumTree(ctx, g.hive.x + g.hive.m * 48, g.hive.y - 30, 0.9, '#7ED67C', ['#FFD43A'], R));
    add(g.windmill.y, () => K.windmillBody(ctx, g.windmill.x, g.windmill.y));
    // the grove: back row, the clearing with the stump, front row, hedge
    const gx = g.grove.x, gy = g.grove.y, s = g.grove.m;
    const trees = [[-20, -74, 0.85, '#8EDC86', ['#FF9F4A']], [16, -84, 1.05, '#7ED67C', ['#FF6F9F', '#FFD43A']], [54, -68, 1.15, '#86D980', null],
      [36, -26, 1.1, '#7ED67C', ['#A77BF2']], [62, -4, 0.95, '#8EDC86', ['#FF9F4A']], [-38, 38, 0.8, '#86D980', ['#FFD43A']], [2, 44, 1.0, '#7ED67C', ['#FF6F9F']], [44, 50, 1.12, '#86D980', null]];
    for (const [dx, dy, sc, c, f] of trees) add(gy + dy, () => gumTree(ctx, gx + s * dx, gy + dy, sc, c, f, R));
    add(gy - 4, () => { const x = gx, y = gy - 6;
      contact(ctx, x, y + 2, 11, 3.5, 0.3);
      ctx.beginPath(); ctx.ellipse(x, y, 8, 3.4, 0, 0, Math.PI); ctx.lineTo(x + 8, y - 6); ctx.ellipse(x, y - 6, 8, 3.4, 0, 0, Math.PI, true); ctx.closePath(); ctx.fillStyle = '#A86C45'; ctx.fill();
      ell(ctx, x, y - 6, 8, 3.4, '#F2C68E'); ctx.strokeStyle = '#C98A52'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(x, y - 6, 4.4, 1.8, 0, 0, TAU); ctx.stroke(); });
    add(gy + 62, () => { const HR = L.rng(31), lobes = [], x0 = s > 0 ? gx - 46 : gx - 76, x1 = x0 + 122;
      for (let x = x0; x < x1;) { const r = 6 + HR() * 7; lobes.push([x, gy + 62 + Math.sin(x * 0.07) * 4 - r * 0.4 + HR() * 3, r]); x += r * (0.9 + HR() * 0.5); }
      ctx.beginPath(); for (const [x, y, r] of lobes) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.rect(x0, gy + 56, 122, 8);
      contact(ctx, x0 + 61, gy + 66, 66, 6, 0.25);
      ctx.fillStyle = '#4FA45A'; ctx.fill();
      for (const [x, y, r] of lobes) { ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.2, r * 0.82, 0, TAU); ctx.fillStyle = jgrad(ctx, '#72C66C', x - r * 0.3, y - r * 0.4, r); ctx.fill(); }
      for (const [x, y, r] of lobes) hl(ctx, x - r * 0.4, y - r * 0.55, r * 0.28, r * 0.12, -0.5, 0.45);
      for (let k = 0; k < 7; k++) { const [x, y, r] = lobes[Math.floor(HR() * lobes.length)]; ell(ctx, x + (HR() - 0.5) * r, y + (HR() - 0.5) * r, 1.6, 1.6, ['#FF9FC8', '#FFFFFF', '#FFD43A'][k % 3]); }
    });
    // scattered trees on the far sides
    for (const [j, dx, dy, sc, c, f] of [[8, -150, 30, 1.15, '#86D980', ['#FF6F9F']], [8, -100, 60, 0.85, '#7ED67C', null], [9, -40, 80, 0.7, '#8EDC86', ['#FFD43A']], [7, 170, -40, 0.9, '#8EDC86', null], [3, -150, 70, 1.0, '#8EDC86', ['#A77BF2', '#FFD43A']], [2, -170, 20, 0.95, '#7ED67C', ['#FF9F4A']], [5, 200, -30, 1.05, '#86D980', ['#FF6F9F']]])
      { const p = B.A(j, dx, dy); add(p.y, () => gumTree(ctx, p.x, p.y, sc, c, f, R)); }
    add(g.lighthouse.y, () => K.lighthouse(ctx, g.lighthouse.x, g.lighthouse.y));
    // the pier off the beach, on the near side of the gate; the hamster is a sprite
    add(g.pier.y + 60, () => K.pier(ctx, g.pier.x, g.pier.y + 86, g.pier.y));
    add(g.pier.y + 4, () => K.hamsterFishing(ctx, g.pier.x + 2, g.pier.y + 4, { x: g.pier.x + 40, y: g.pier.y - 22 }));
  }

  /* ---------- foreground framing (screen-edge strips, parallax 1.12) ---------- */
  function fg(B, put) {
    const n = j => B.node(j).y;
    const items = [[-1, n(0) + 170, 'bush', 50, '#3F8A4C'], [1, n(0) + 140, 'branch', 1.15, '#3A8048'], [1, n(1) + 60, 'trunk', 1, '#3F8A4C'],
      [-1, n(2) + 50, 'branch', 1.1, '#3A8048'], [-1, n(3) + 30, 'bush', 38, '#44904E'], [1, n(4) + 50, 'branch', 1.05, '#3A8048'],
      [-1, n(5) + 80, 'trunk', 0.95, '#3F8A4C'], [1, n(6) + 0, 'bush', 36, '#3F8A4C'], [-1, n(7) + 30, 'branch', 1.05, '#3A8048'],
      [1, n(8) + 0, 'bush', 34, '#44904E'], [-1, n(9) + 50, 'bush', 30, '#44904E']];
    for (const [side, y, kind, s, c] of items) put({ side, y, kind, s, c });
  }

  /* ---------- manifest: live animation, critters, chests, signs, gate, bridge ---------- */
  function manifest(B, put) {
    const g = geom(B);
    const river = riverPts(B, g);
    put.live('river', { pts: river.pts.filter((p, k) => k % 2 === 0) });
    const shore = []; for (let x = -10; x <= W.DW + 10; x += 8) shore.push({ x, y: g.shoreAt(x) });
    put.live('foam', { pts: shore });
    put.live('campfire', { x: g.fire.x, y: g.fire.y });
    put.live('smoke', { x: g.cottage.x + 18, y: g.cottage.y - 102 });
    put.live('zz', { x: g.cottage.x - 14, y: g.cottage.y - 92 });
    put.live('windmill', { x: g.windmill.x, y: g.windmill.y - 72 });
    put.live('beam', { x: g.lighthouse.x, y: g.lighthouse.y - 69, a: -Math.PI / 2 + 0.5 * g.lighthouse.m * -1, L: 180 });
    put.live('bobber', { x: g.pier.x + 50, y: g.pier.y - 10, tip: { x: g.pier.x + 40, y: g.pier.y - 22 } });
    put.live('drops', { x: g.can.x - g.garden.m * 13, y: g.can.y - 4, dir: -g.garden.m });
    for (const [j, dx, dy, c, ph] of [[1, 180, 30, '#FF9FC8', 0], [5, -110, 20, '#A77BF2', 2], [6, 170, -60, '#FFD43A', 4], [0, -120, 60, '#FFFFFF', 1], [2, -140, 20, '#5EC6EC', 3], [8, -120, 50, '#FF9FC8', 5]]) {
      const p = B.A(j, dx, dy); put.live('butterfly', { x: p.x, y: p.y, c, ph });
    }
    const cross = W.roadAtY((B.node(7).y + B.node(8).y) / 2, B.i0 + 7, B.i0 + 8);
    put.bridge({ x: cross.x, y: cross.y, angle: +Math.atan2(cross.ty, cross.tx).toFixed(3), style: 'plank' });
    put.live('ripple', { x: cross.x + 28, y: cross.y - 2 });
    // night glows: windows, lamp, fire
    put.glow({ x: g.cottage.x + 16, y: g.cottage.y - 24, r: 22, c: '#FFC66A' });
    put.glow({ x: g.windmill.x, y: g.windmill.y - 40, r: 16, c: '#FFE08A' });
    put.glow({ x: g.lighthouse.x, y: g.lighthouse.y - 69, r: 40, c: '#FFF3B0' });
    put.glow({ x: g.fire.x, y: g.fire.y - 6, r: 46, c: '#FFB54A' });
    // critters (native sprites): the bunny waters the carrots, the hamster fishes, the bat warms up,
    // the bee loops between hive and flowers, the mushrooms by the cottage, a bunny in the clearing
    put.critter({ kind: 'bunny', x: g.bunny.x, y: g.bunny.y, size: 44 });
    put.critter({ kind: 'hamster', x: g.pier.x + 2, y: g.pier.y + 4, size: 34 });
    put.critter({ kind: 'bat', x: g.fire.x - g.camp.m * -30, y: g.fire.y + 8, size: 32 });
    put.critter({ kind: 'bee', x: g.hive.x - g.hive.m * 6, y: g.hive.y - 44, size: 30, path: 'loop', rx: 42, ry: 14 });
    put.critter({ kind: 'mushroom', x: g.shrooms.x, y: g.shrooms.y, size: 40 });
    put.critter({ kind: 'cat', x: g.grove.x + g.grove.m * 22, y: g.grove.y + 2, size: 30 });
    // chests sit beside levels 3 and 7; signs: the region name by level 1, the rest stop, the level 10 film
    put.chest(3, { x: g.chest3.x, y: g.chest3.y });
    const c7 = B.A(6, -70, 50); put.chest(7, { x: c7.x, y: c7.y });
    const name = B.A(0, -110, 66); put.sign({ role: 'region', level: 1, x: name.x, y: name.y });
    const rest = B.A(4, -96, -24); put.sign({ role: 'rest', level: 5, x: rest.x, y: rest.y });
    const film = B.A(9, 112, 20); put.sign({ role: 'film', level: 10, x: film.x, y: film.y });
    // the candy-cane gate on the road at the shore
    put.gate({ x: g.gate.x, y: g.gate.y + 8, angle: +Math.atan2(g.gate.ty, g.gate.tx).toFixed(3), to: 1 });
  }

  W.chapter({
    id: 'meadow', name: 'GUMDROP MEADOW', title: 'Gumdrop Meadow', road: 'ribbon',
    node: ['#FFE9BF', '#FFB347', '#E07F1C'], gateBanner: ['TO JELLY LAGOON', '#2D86B8', '#1E5E85'],
    edgeColor: '#9ED98C', finaleSky: ['#FFC9A6', '#FFD8C4', '#F4DCF6'],
    geom, ground, props, fg, manifest,
  });
})();
