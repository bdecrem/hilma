/* Chapter 3 — Sprinkle Peaks (levels 21–30). Frosted foothills climbing to snow, in cold light
   (lavender shadows, pink-tinted snow, the meadow's top-left sun and shadow rules):
   a pink-pebble beach above the lagoon's far shore (the ferry lands there, the gate stands at 20/21),
   candy-pine foothills with lollipops (21–23) and the region sign at 23, the ice-cream cave in a
   cliff by 24 (the panda serves, the bat lives inside), the hot-cocoa hut at the rest stop (25, Peck
   or Perish; the dragon warms the pot), the cable car from its valley station by 26 up to the summit,
   the sledding run on the snowfield by 27–29 (the penguin waits its turn), and the observatory on the
   summit plateau by 29–30, whose soft snow lip hangs over a sea of clouds (the gate to Marshmallow
   Clouds stands on it). */
(function () {
  'use strict';
  const L = window.L, K = window.K, W = window.WORLD, TAU = Math.PI * 2;
  const { ell, hl, jfill, jgrad, cast, contact, rect, tuft } = K;

  /* ---------- palette ---------- */
  const INK = 'rgba(48,30,80,';            // shadow ink (the kit's)
  const COOL = '#8C7CC6';                  // lavender the lower faces cool toward
  const SNOW = '#FFF3F8', SNOW_SH = '#E3D3F0', SNOW_DEEP = '#C9B6E6';
  const SPRINK = ['#FF6F9F', '#FFD43A', '#5EC6EC', '#91E9CC', '#B994FF', '#FF9F4A', '#FFFFFF'];

  function wig(x) { return Math.sin(x / 43 + 2.1) * 4 + Math.sin(x / 14 + 0.7) * 1.4; }
  function geom(B) {
    if (B._g) return B._g;
    const g = {};
    const n = j => B.node(j);
    // the summit lip (top edge) and the gate on the road where it crosses
    g.lipY = B.top;
    const gp = W.roadAtY(g.lipY, B.i1, B.i1 + 1);
    g.gate = { x: gp.x, y: gp.y, tx: gp.tx, ty: gp.ty };
    const s = n(9).m;
    g.topEdge = x => g.lipY + (g.gate.x - x) * 0.11 * s + wig(x) - wig(g.gate.x);
    // the shore below: the lagoon's top edge
    const below = W.chapterOf(B.k - 1), BB = W.BANDS[B.k - 1];
    g.shore = below && below.topEdge ? below.topEdge(BB) : (() => B.bottom);
    g.sandTop = x => g.shore(x) - 30 - Math.sin(x / 23 + 1) * 4 - Math.sin(x / 9) * 1.5;
    // hill crests: one about every two levels, slopes alternating so they interlock with the trail.
    // Colours climb from frosted sage (21) through lavender frost (24–25) to pink-white snow (29–30).
    const spec = [
      [0, -44, -0.26, '#B8D2B4', 12, 0.017, 3.1],
      [2, 50, 0.28, '#C4CFCB', 14, 0.015, 5.0],
      [3, -60, -0.28, '#CEC3EA', 12, 0.018, 1.2],
      [5, 56, 0.30, '#E6CFEE', 15, 0.016, 4.1],
      [7, -56, -0.30, '#F3D8EA', 13, 0.014, 2.3],
      [8, -60, 0.24, '#FAE3EF', 12, 0.017, 0.5],
    ];
    g.hills = spec.map(([j, dy, sl, c, a, f, p]) => ({ y0: n(j).y + dy, sl: sl * (B.odd ? -1 : 1), a, f, p, c, snow: j >= 3 }));
    g.crest = (h, x) => h.y0 + h.sl * (x - W.CX) + h.a * Math.sin(x * h.f + h.p) + 4 * Math.sin(x * 0.051 + h.p * 2);
    g.plateau = '#FCEAF3';
    // where the snow begins (frosted grass below, snow above)
    g.snowY = n(3).y + 40;

    // landmarks (band 2 is authored in screen terms; the trail is C, L, C, R, C, L, C, R, C, L)
    g.beach = { x: 404, y: g.shore(404) - 14 };
    g.pines21 = [[380, n(0).y + 6, 1.0], [430, n(0).y - 24, 0.85], [96, n(0).y - 30, 0.95], [120, n(0).y + 8, 0.75]];
    g.grove = { x: 372, y: n(1).y - 4 };                     // candy pines + lollipops on the right of 22
    g.chest22 = B.at(1, 82, -26);
    g.sign23 = B.at(2, 104, 40);
    g.cave = { x: 152, y: n(3).y + 32 };                      // the ice-cream cliff, left of 24
    g.hut = { x: 134, y: n(4).y + 50 };                       // the cocoa hut at 25, lower left
    g.pot = { x: g.hut.x + 60, y: g.hut.y + 12 };
    g.rest = { x: 196, y: n(4).y - 2 };
    g.chest26 = B.at(5, 84, 18);
    g.base = { x: 388, y: n(5).y + 8 };                       // cable-car valley station, right of 26
    g.top = { x: 414, y: n(9).y + 34 };                       // summit station, right of 30
    g.obs = { x: 318, y: n(9).y - 6 };                        // observatory on the plateau
    g.pylons = [{ x: 400, y: n(6).y + 10 }, { x: 408, y: n(7).y - 50 }];
    g.run = [{ x: 118, y: n(8).y + 34 }, { x: 136, y: n(8).y + 84 }, { x: 150, y: n(7).y - 18 }, { x: 160, y: n(7).y + 40 }, { x: 186, y: n(6).y - 78 }];
    g.crags = [{ x: 64, y: n(5).y - 40, s: 1.0 }, { x: 452, y: n(3).y + 10, s: 0.9 }, { x: 60, y: n(9).y - 18, s: 0.8 }, { x: 456, y: n(7).y + 40, s: 0.75 }];
    g.snowman = { x: 336, y: n(6).y + 52 };
    return (B._g = g);
  }

  /* the cable: attachment points (station wheel, pylon tops, summit wheel) — baked line, live cars */
  function cablePts(g) {
    // the bull wheels: station(…, s, …, wheelDy) puts the wheel at (18.5 s, -wheelDy s)
    const H1 = 42, HP = 54, H2 = 44 * 0.82;
    const a = { x: g.base.x + 18.5, y: g.base.y - H1, h: H1 }, z = { x: g.top.x + 18.5 * 0.82, y: g.top.y - H2, h: H2 };
    const ps = g.pylons.map(p => ({ x: p.x, y: p.y - HP, h: HP }));
    return [a, ...ps, z];
  }
  /* the sledding run, densified */
  function runPts(g) { return L.catmull(g.run, 10).pts; }

  /* ---------- ground ---------- */
  function ground(ctx, B) {
    const g = geom(B), DW = W.DW, R = B.rng(21);
    const bottom = B.bottom + 300;
    const poly = (fn, dy = 0) => { const Q = []; for (let x = -10; x <= DW + 10; x += 6) Q.push([x, fn(x) + dy]); return Q; };
    const line = Q => { ctx.beginPath(); Q.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };

    cloudSea(ctx, B, g, R);

    // the plateau (lip down), then each hill band from the top down, then the beach
    const bands = [{ fn: g.topEdge, c: g.plateau, sl: 0, lip: true }, ...g.hills.slice().reverse().map(h => ({ fn: x => g.crest(h, x), c: h.c, sl: h.sl }))];
    bands.forEach((h, i) => {
      const pts = poly(h.fn), nxt = bands[i + 1];
      if (i > 0) {
        // valley shade above this crest, on the band behind it
        ctx.save(); ctx.lineJoin = 'round';
        for (const [w, a] of [[70, 0.07], [44, 0.08], [24, 0.10], [10, 0.14]]) { line(poly(h.fn, -w * 0.32)); ctx.strokeStyle = `rgba(92,70,150,${a})`; ctx.lineWidth = w; ctx.stroke(); }
        ctx.restore();
      }
      line(pts); ctx.lineTo(DW + 10, bottom); ctx.lineTo(-10, bottom); ctx.closePath();
      ctx.save();
      const y0 = h.fn(W.CX), T = nxt ? Math.max(120, nxt.fn(W.CX) - y0) : 200, nl = Math.hypot(h.sl, 1), nxv = -h.sl / nl, nyv = 1 / nl;
      const gr = ctx.createLinearGradient(W.CX, y0, W.CX + nxv * T, y0 + nyv * T);
      gr.addColorStop(0, L.shade(h.c, 0.5)); gr.addColorStop(0.1, L.shade(h.c, 0.22)); gr.addColorStop(0.42, h.c); gr.addColorStop(1, L.mix(h.c, COOL, 0.4));
      ctx.fillStyle = gr; ctx.fill(); ctx.clip();
      // warm-white light mass upper left, lavender shade mass lower right
      const lx = 80 + (i * 53) % 110, ly = h.fn(lx) + T * 0.3;
      let rg = ctx.createRadialGradient(lx, ly, 10, lx, ly, 200); rg.addColorStop(0, 'rgba(255,246,250,.34)'); rg.addColorStop(1, 'rgba(255,246,250,0)');
      ctx.fillStyle = rg; ctx.fillRect(lx - 210, ly - 210, 420, 420);
      const sx = DW - 60 - (i * 37) % 100, sy = h.fn(sx) + T * 0.85;
      rg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 180); rg.addColorStop(0, 'rgba(96,74,160,.18)'); rg.addColorStop(1, 'rgba(96,74,160,0)');
      ctx.fillStyle = rg; ctx.fillRect(sx - 190, sy - 190, 380, 380);
      ctx.restore();
      if (!h.lip) {
        const rim = ctx.createLinearGradient(0, 0, DW, 0); rim.addColorStop(0, 'rgba(255,255,255,.95)'); rim.addColorStop(1, 'rgba(255,250,255,.45)');
        ctx.strokeStyle = rim; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; line(poly(h.fn, 1.4)); ctx.stroke();
        ctx.strokeStyle = 'rgba(110,86,170,.2)'; ctx.lineWidth = 1; line(pts); ctx.stroke();
      }
    });
    snowLip(ctx, B, g, R);

    // knolls under the big landmarks
    for (const [p, rx, ry, c] of [[g.cave, 110, 40, '#E2DAEE'], [g.hut, 96, 40, '#E9DCF0'], [g.base, 78, 34, '#F2E4F2'], [g.obs, 100, 42, '#FFF1F7'], [g.top, 60, 26, '#FFF1F7'], [g.grove, 100, 46, '#C9D9C4']]) {
      const x = p.x, y = p.y + 10;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
      const sg = ctx.createRadialGradient(rx * 0.12, rx * 0.22, rx * 0.4, rx * 0.12, rx * 0.22, rx * 1.05);
      sg.addColorStop(0, 'rgba(90,66,150,.14)'); sg.addColorStop(1, 'rgba(90,66,150,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(rx * 0.12, rx * 0.22, rx * 1.05, 0, TAU); ctx.fill();
      const gg = ctx.createRadialGradient(-rx * 0.3, -rx * 0.45, rx * 0.1, 0, 0, rx);
      gg.addColorStop(0, L.rgba(L.shade(c, 0.5), 1)); gg.addColorStop(0.55, L.rgba(c, 0.9)); gg.addColorStop(0.85, L.rgba(c, 0.5)); gg.addColorStop(1, L.rgba(c, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, rx * 0.8, ry * 0.8, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    }

    // broad tonal noise (frost light and lavender shade), low-res and scaled up
    {
      const noise = L.makeNoise(17 + B.k);
      const sx = 4, nw = Math.ceil(DW / sx), y0 = Math.floor(B.top - 40), nh = Math.ceil((B.bottom + 20 - y0) / sx);
      const oc = document.createElement('canvas'); oc.width = nw; oc.height = nh; const oc2 = oc.getContext('2d');
      const im = oc2.createImageData(nw, nh), d = im.data;
      for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
        const x = i * sx, y = y0 + j * sx, v = noise.fbm(x / 110, y / 110, 3) * 2.2 + noise.n2(x / 18, y / 18) * 0.5, kk = (j * nw + i) * 4;
        if (v > 0) { d[kk] = 255; d[kk + 1] = 248; d[kk + 2] = 252; d[kk + 3] = Math.min(255, v * 140); }
        else { d[kk] = 110; d[kk + 1] = 86; d[kk + 2] = 170; d[kk + 3] = Math.min(255, -v * 90); }
      }
      oc2.putImageData(im, 0, 0);
      ctx.save(); ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 8) ctx.lineTo(x, g.topEdge(x) + 6); for (let x = DW + 10; x >= -10; x -= 8) ctx.lineTo(x, g.sandTop(x)); ctx.closePath(); ctx.clip();
      ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 0.36; ctx.drawImage(oc, 0, y0, nw * sx, nh * sx); ctx.restore();
    }

    sledRun(ctx, B, g, R);

    // side trails from the road to the landmarks: packed snow
    const spur = (p, bend = 0, snow = true) => {
      const r = W.roadAtY(p.y, B.i0, B.i1 + 1); if (!r) return;
      const mx = (r.x + p.x) / 2, my = (r.y + p.y) / 2 + bend;
      const sp = L.catmull([{ x: r.x, y: r.y }, { x: mx, y: my }, { x: p.x, y: p.y }], 10);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; L.pathPoly(ctx, sp.pts);
      ctx.strokeStyle = 'rgba(100,80,160,.16)'; ctx.lineWidth = 13; ctx.stroke();
      ctx.strokeStyle = snow ? '#E4D4EE' : '#DCD3D8'; ctx.lineWidth = 10; ctx.stroke();
      ctx.strokeStyle = snow ? '#FFF8FC' : '#F6EEF0'; ctx.lineWidth = 7; ctx.stroke();
      ctx.restore();
      for (let q = 0; q < sp.pts.length; q += 3) { const pp = sp.pts[q]; ell(ctx, pp.x + (R() - 0.5) * 4, pp.y + (R() - 0.5) * 3, 1.3, 0.8, 'rgba(150,120,190,.35)'); }
    };
    spur({ x: g.cave.x + 20, y: g.cave.y + 8 }, 6, false);
    spur({ x: g.hut.x + 26, y: g.hut.y + 8 }, 4);
    spur({ x: g.base.x - 26, y: g.base.y + 8 }, -4);
    spur({ x: g.obs.x - 6, y: g.obs.y + 8 }, 4);
    spur({ x: g.run[g.run.length - 1].x + 4, y: g.run[g.run.length - 1].y + 14 }, 2);

    // beach: pink sand from the lagoon's shore up to the foothills
    beach(ctx, B, g, R);

    // texture: frosted tufts in the foothills, sprinkles + sparkles on the snow
    const keep = [[g.cave.x, g.cave.y - 26, 80], [g.hut.x, g.hut.y - 20, 56], [g.pot.x, g.pot.y, 24], [g.base.x, g.base.y - 20, 50], [g.obs.x, g.obs.y - 30, 56], [g.top.x, g.top.y - 16, 34],
      [g.grove.x, g.grove.y - 20, 70], [g.sign23.x, g.sign23.y - 16, 30], [g.chest22.x, g.chest22.y, 20], [g.chest26.x, g.chest26.y, 20], [g.snowman.x, g.snowman.y - 10, 18]];
    const free = (x, y) => keep.every(([a, b, r]) => (x - a) ** 2 + (y - b) ** 2 > r * r);
    const run = runPts(g);
    const nearRun = (x, y) => run.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < 24 * 24);
    for (let i = 0; i < 1300; i++) {
      let x, y;
      if (R() < 0.6) { const h = g.hills[Math.floor(R() * g.hills.length)]; x = R() * DW; y = g.crest(h, x) + 2 + R() * R() * 26; }
      else { x = R() * DW; y = B.top + R() * (B.bottom - B.top); }
      if (y < g.topEdge(x) + 14 || y > g.sandTop(x) - 4) continue;
      const dr = W.distToRoad(x, y); if (dr < 22 || (dr < 46 && R() < 0.6) || !free(x, y) || nearRun(x, y)) continue;
      if (y > g.snowY + (R() - 0.5) * 60) {
        tuft(ctx, x, y, 0.8 + R() * 0.5, y > B.node(1).y ? 'rgba(84,130,96,.62)' : 'rgba(110,130,140,.55)', 'rgba(255,255,255,.9)');
      } else if (R() < 0.3) {
        // a sprinkle lying in the snow
        ctx.save(); ctx.translate(x, y); ctx.rotate(R() * Math.PI); ctx.fillStyle = SPRINK[Math.floor(R() * SPRINK.length)];
        L.rrect(ctx, -2.2, -0.75, 4.4, 1.5, 0.75); ctx.fill(); ctx.restore();
      } else {
        // a little drift: shadowed lump with a lit top
        const r = 2 + R() * 3; ell(ctx, x + 1, y + 0.8, r * 1.3, r * 0.45, 'rgba(120,96,180,.18)'); ell(ctx, x, y - 0.4, r, r * 0.4, 'rgba(255,255,255,.75)');
      }
    }
    for (let i = 0; i < 900; i++) {
      const x = R() * DW, y = B.top + R() * (B.bottom - B.top);
      if (y < g.topEdge(x) + 10 || y > g.sandTop(x) - 4 || W.distToRoad(x, y) < 20) continue;
      ell(ctx, x, y, 1.1, 0.6, y > g.snowY ? (R() < 0.5 ? 'rgba(80,120,90,.2)' : 'rgba(255,255,255,.45)') : (R() < 0.6 ? 'rgba(255,255,255,.7)' : 'rgba(150,120,200,.22)'));
    }
  }

  /* a soft cloud fade just beyond the summit lip; the chapter above paints the sea of clouds itself */
  function cloudSea(ctx, B, g, R) {
    const DW = W.DW, y0 = B.top - 90, y1 = B.top + 50;
    ctx.save();
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, 'rgba(246,234,252,0)'); gr.addColorStop(0.6, 'rgba(244,232,252,.75)'); gr.addColorStop(1, '#EEE0FA');
    ctx.fillStyle = gr; ctx.fillRect(-20, y0, DW + 40, y1 - y0);
    ctx.restore();
  }

  /* the soft snow lip: a scalloped cornice, a lavender drop below it onto the clouds, a lit rim */
  function snowLip(ctx, B, g, R) {
    const DW = W.DW, e = g.topEdge;
    ctx.save();
    // shadow the plateau throws onto the clouds just beyond it
    ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, e(x) - 2); for (let x = DW + 10; x >= -10; x -= 5) ctx.lineTo(x, e(x) - 26 - Math.sin(x / 19) * 4);
    ctx.closePath(); const sg = ctx.createLinearGradient(0, B.top - 30, 0, B.top); sg.addColorStop(0, 'rgba(140,110,200,0)'); sg.addColorStop(1, 'rgba(140,110,200,.32)'); ctx.fillStyle = sg; ctx.fill();
    // cornice scallops along the edge
    for (let x = -14; x < DW + 20; x += 13 + R() * 6) {
      const r = 7 + R() * 5, y = e(x) + 1;
      ell(ctx, x + 2, y + 3, r, r * 0.55, 'rgba(160,130,210,.35)');
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, TAU);
      const cg = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.5, x, y, r * 1.1); cg.addColorStop(0, '#FFFFFF'); cg.addColorStop(0.6, '#FFF3F9'); cg.addColorStop(1, '#E6D4F2');
      ctx.fillStyle = cg; ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, e(x) - 3); ctx.stroke();
    // a few wisps drifting over the lip
    for (const [x, dy, w] of [[70, -14, 46], [250, -22, 38], [470, -10, 52]]) {
      const y = e(x) + dy, wg = ctx.createRadialGradient(x, y, 2, x, y, w);
      wg.addColorStop(0, 'rgba(255,255,255,.7)'); wg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.32); ctx.translate(-x, -y); ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(x, y, w, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  function beach(ctx, B, g, R) {
    const DW = W.DW, top = g.sandTop, sh = g.shore;
    ctx.save();
    // sand body, with a soft frosted-grass edge above it
    ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, top(x) - 3); ctx.lineTo(DW + 10, B.bottom + 300); ctx.lineTo(-10, B.bottom + 300); ctx.closePath();
    ctx.fillStyle = 'rgba(90,110,100,.16)'; ctx.fill();
    ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, top(x)); ctx.lineTo(DW + 10, B.bottom + 300); ctx.lineTo(-10, B.bottom + 300); ctx.closePath();
    const sg = ctx.createLinearGradient(0, B.bottom - 50, 0, B.bottom + 10); sg.addColorStop(0, '#FBE6E6'); sg.addColorStop(1, '#F2CDD3'); ctx.fillStyle = sg; ctx.fill();
    // wet band at the water
    ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 6) ctx.lineTo(x, sh(x) - 9); for (let x = DW + 10; x >= -10; x -= 6) ctx.lineTo(x, sh(x) + 2); ctx.closePath();
    ctx.fillStyle = '#E7B9C3'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,245,250,.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 6) ctx.lineTo(x, sh(x) - 9.5); ctx.stroke();
    // lit rim where the grass starts
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.4; ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, top(x) + 1.2); ctx.stroke();
    ctx.restore();
    // pebbles and shells
    for (let i = 0; i < 110; i++) {
      const x = R() * DW, y = top(x) + 5 + R() * Math.max(2, sh(x) - top(x) - 16);
      if (W.distToRoad(x, y) < 20) continue;
      const r = 1 + R() * 1.8, c = ['#D9C6E8', '#FFFFFF', '#F7B9CF', '#C8B4DA', '#FFE3C2'][i % 5];
      ell(ctx, x + 0.8, y + 0.8, r * 1.2, r * 0.6, 'rgba(110,70,120,.2)'); ell(ctx, x, y, r * 1.2, r * 0.75, c); if (r > 2) hl(ctx, x - r * 0.4, y - r * 0.3, r * 0.4, r * 0.2, 0, 0.8);
    }
  }

  /* the sledding run: a groomed channel with banked sides, poles and a marshmallow stop at the foot */
  function sledRun(ctx, B, g, R) {
    const pts = runPts(g);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(3, 4); L.pathPoly(ctx, pts); ctx.strokeStyle = 'rgba(100,76,170,.16)'; ctx.lineWidth = 26; ctx.stroke(); ctx.restore();
    L.pathPoly(ctx, pts); ctx.strokeStyle = '#E9DAF2'; ctx.lineWidth = 24; ctx.stroke();
    ctx.strokeStyle = '#D7C4EC'; ctx.lineWidth = 17; ctx.stroke();
    ctx.strokeStyle = '#F7F0FC'; ctx.lineWidth = 13; ctx.stroke();
    ctx.save(); ctx.translate(-2, -2); L.pathPoly(ctx, pts); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.6; ctx.stroke(); ctx.restore();
    // two runner grooves
    for (const o of [-3, 3]) { ctx.beginPath(); pts.forEach((p, k) => { const q = pts[Math.min(pts.length - 1, k + 1)], a = Math.atan2(q.y - p.y, q.x - p.x); const x = p.x - Math.sin(a) * o, y = p.y + Math.cos(a) * o; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = 'rgba(160,130,210,.35)'; ctx.lineWidth = 0.9; ctx.stroke(); }
    ctx.restore();
  }

  /* ---------- landmark drawers ---------- */
  /* candy pine: stacked gumdrop tiers, each frosted, on a little stick */
  function candyPine(ctx, x, y, s, c, R) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const tierPath = (c2, w, top, bot) => { c2.moveTo(-w, bot); c2.quadraticCurveTo(-w * 0.55, top + (bot - top) * 0.25, 0, top); c2.quadraticCurveTo(w * 0.55, top + (bot - top) * 0.25, w, bot); c2.quadraticCurveTo(0, bot + 5, -w, bot); };
    const tiers = [[17, -30, -6], [13.5, -44, -22], [10, -57, -36]];
    cast(ctx, 0, 0, c2 => { c2.beginPath(); c2.rect(-2.2, -8, 4.4, 8); for (const [w, t, b] of tiers) tierPath(c2, w, t, b); }, { a: 0.17 });
    contact(ctx, 0, 0, 13, 4, 0.3);
    const tg = ctx.createLinearGradient(-3, 0, 3, 0); tg.addColorStop(0, '#E7B488'); tg.addColorStop(1, '#A86C45');
    ctx.fillStyle = tg; ctx.fillRect(-2.4, -9, 4.8, 9);
    for (const [w, t, b] of tiers) {
      ctx.beginPath(); tierPath(ctx, w, t, b); jfill(ctx, c, -w * 0.3, (t + b) / 2 - 2, w, 1);
      // frosting cap with drips
      ctx.beginPath(); ctx.moveTo(-w * 0.62, t + (b - t) * 0.48);
      ctx.quadraticCurveTo(-w * 0.4, t + 1, 0, t - 1); ctx.quadraticCurveTo(w * 0.4, t + 1, w * 0.62, t + (b - t) * 0.48);
      const dn = 4; for (let k = dn; k >= 0; k--) { const u = k / dn, xx = -w * 0.62 + u * w * 1.24, yy = t + (b - t) * (0.48 - Math.abs(u - 0.5) * 0.2) + (k % 2 ? 3 + R() * 2 : 0); ctx.lineTo(xx, yy); }
      ctx.closePath(); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = 'rgba(170,140,210,.45)'; ctx.lineWidth = 0.7; ctx.stroke();
      hl(ctx, -w * 0.3, t + (b - t) * 0.2, w * 0.16, 1.2, -0.6, 0.85);
      for (let k = 0; k < 3; k++) { ctx.save(); ctx.translate(-w * 0.5 + R() * w, t + (b - t) * (0.62 + R() * 0.25)); ctx.rotate(R() * 3); ctx.fillStyle = SPRINK[Math.floor(R() * 6)]; L.rrect(ctx, -1.6, -0.6, 3.2, 1.2, 0.6); ctx.fill(); ctx.restore(); }
    }
    // gumdrop at the tip
    ctx.beginPath(); ctx.moveTo(-3.4, -56); ctx.quadraticCurveTo(-3.4, -62.5, 0, -62.5); ctx.quadraticCurveTo(3.4, -62.5, 3.4, -56); ctx.closePath(); jfill(ctx, '#FF6F9F', -1, -59, 4, 0.7);
    ctx.restore();
  }
  function lolly(ctx, x, y, s, a, b) {
    cast(ctx, x, y, c2 => { c2.beginPath(); c2.rect(-1.5 * s, -30 * s, 3 * s, 30 * s); c2.arc(0, -40 * s, 12 * s, 0, TAU); }, { a: 0.15 });
    contact(ctx, x, y, 9 * s, 3 * s, 0.28);
    L.lollipop(ctx, x, y, s, a, b);
    // a cap of snow on the candy
    ctx.save(); ctx.translate(x, y - 40 * s); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.quadraticCurveTo(-6, -13.5, 0, -13); ctx.quadraticCurveTo(7, -13, 10.5, -5); ctx.quadraticCurveTo(7, -7, 4, -5); ctx.quadraticCurveTo(0, -8, -3, -5); ctx.quadraticCurveTo(-7, -8, -10, -6); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.restore();
  }
  /* a pink-white rock crag at a screen edge: lit left faces, lavender right faces, a snow cap */
  function crag(ctx, x, y, s, R) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const peak = [[-46, 0], [-34, -30], [-18, -52], [-6, -86], [8, -60], [20, -70], [36, -32], [48, 0]];
    cast(ctx, 0, 0, c2 => { c2.beginPath(); peak.forEach(([a, b], k) => k ? c2.lineTo(a, b) : c2.moveTo(a, b)); c2.closePath(); }, { a: 0.2, len: 0.55 });
    contact(ctx, 0, 1, 52, 9, 0.3);
    ctx.beginPath(); peak.forEach(([a, b], k) => k ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.closePath();
    ctx.fillStyle = '#B8A2D8'; ctx.fill();
    // lit faces (left of each ridge)
    ctx.fillStyle = '#E6DAF4';
    for (const f of [[[-46, 0], [-34, -30], [-18, -52], [-6, -86], [-10, 0]], [[8, -60], [20, -70], [16, 0], [6, 0]]]) { ctx.beginPath(); f.forEach(([a, b], k) => k ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.closePath(); ctx.fill(); }
    // snow caps
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.moveTo(-20, -50); ctx.lineTo(-6, -86); ctx.lineTo(5, -64); ctx.lineTo(0, -58); ctx.lineTo(-5, -64); ctx.lineTo(-10, -55); ctx.lineTo(-15, -60); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12, -64); ctx.lineTo(20, -70); ctx.lineTo(27, -54); ctx.lineTo(22, -57); ctx.lineTo(18, -52); ctx.lineTo(14, -58); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,150,.35)'; ctx.lineWidth = 1; ctx.beginPath(); peak.forEach(([a, b], k) => k ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke();
    // snow drift at the foot
    ctx.beginPath(); ctx.moveTo(-52, 2); ctx.quadraticCurveTo(-30, -14, -6, -6); ctx.quadraticCurveTo(20, -14, 54, 2); ctx.quadraticCurveTo(0, 8, -52, 2); jfill(ctx, '#FFF5FA', -16, -6, 40, 0.8);
    ctx.restore();
  }
  function snowman(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c2 => { c2.beginPath(); c2.arc(0, -8, 9, 0, TAU); c2.arc(0, -22, 6.5, 0, TAU); }, { a: 0.16 });
    contact(ctx, 0, 1, 12, 3.6, 0.3);
    ctx.beginPath(); ctx.arc(0, -8, 9, 0, TAU); jfill(ctx, '#FFF8FC', -3, -11, 10, 0.8);
    ctx.beginPath(); ctx.arc(0, -21.5, 6.5, 0, TAU); jfill(ctx, '#FFF8FC', -2, -24, 7, 0.8);
    ctx.fillStyle = '#FF4F86'; L.rrect(ctx, -6, -16.4, 12, 2.6, 1.2); ctx.fill(); ctx.fillRect(2.4, -15, 2.4, 6);
    ell(ctx, -2.2, -22.5, 0.9, 0.9, '#2A1F2B'); ell(ctx, 2.2, -22.5, 0.9, 0.9, '#2A1F2B');
    ctx.fillStyle = '#FF9F4A'; ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(6, -20); ctx.lineTo(0, -19.4); ctx.fill();
    ell(ctx, 0, -27.5, 5, 1.4, '#8A5CE0'); L.rrect(ctx, -3.4, -33, 6.8, 6, 1.4); ctx.fillStyle = '#8A5CE0'; ctx.fill();
    for (const k of [-6, -10]) ell(ctx, 0, k, 0.9, 0.9, '#FFD43A');
    // candy-cane arm
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(8, -10); ctx.lineTo(16, -20); ctx.arc(18, -20, 2, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = '#FF4F86'; ctx.setLineDash([1.6, 1.6]); ctx.stroke(); ctx.setLineDash([]);
    hl(ctx, -4, -12, 2.6, 1.2, -0.5, 0.8);
    ctx.restore();
  }
  /* the ice-cream cave: a lavender cliff with a dark arched mouth, scoops piled on top dripping over */
  function iceCreamCave(ctx, x, y, R) {
    ctx.save(); ctx.translate(x, y);
    const outline = c2 => { c2.beginPath(); c2.moveTo(-70, 0); c2.lineTo(-66, -34); c2.quadraticCurveTo(-58, -62, -30, -66); c2.lineTo(26, -70); c2.quadraticCurveTo(62, -64, 68, -30); c2.lineTo(72, 0); c2.closePath(); };
    cast(ctx, 0, 0, c2 => { outline(c2); c2.arc(-24, -78, 20, 0, TAU); c2.arc(6, -84, 22, 0, TAU); c2.arc(32, -74, 18, 0, TAU); }, { a: 0.2, len: 0.5 });
    contact(ctx, 0, 2, 80, 12, 0.3);
    // the cliff body: front face lit on the left, lavender on the right
    outline(ctx);
    const fg = ctx.createLinearGradient(-70, 0, 72, 0); fg.addColorStop(0, '#E2D6F2'); fg.addColorStop(0.45, '#C9B6E6'); fg.addColorStop(1, '#9E86CC'); ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,140,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
    // rock strata
    ctx.save(); outline(ctx); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2; for (const yy of [-48, -30, -14]) { ctx.beginPath(); ctx.moveTo(-72, yy + 3); ctx.quadraticCurveTo(0, yy - 4, 74, yy + 2); ctx.stroke(); }
    ctx.fillStyle = 'rgba(80,50,140,.12)'; ctx.fillRect(34, -80, 50, 90);
    ctx.restore();
    // the snowy top of the cliff
    ctx.beginPath(); ctx.moveTo(-66, -34); ctx.quadraticCurveTo(-58, -62, -30, -66); ctx.lineTo(26, -70); ctx.quadraticCurveTo(62, -64, 68, -30);
    ctx.quadraticCurveTo(58, -40, 50, -36); ctx.quadraticCurveTo(40, -46, 30, -44); ctx.quadraticCurveTo(10, -52, -10, -46); ctx.quadraticCurveTo(-30, -52, -44, -42); ctx.quadraticCurveTo(-56, -44, -66, -34);
    ctx.closePath(); jfill(ctx, '#FFF6FA', -20, -60, 60, 0.8);
    // the cave mouth
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.quadraticCurveTo(-28, -42, 0, -44); ctx.quadraticCurveTo(28, -42, 26, 0); ctx.closePath();
    const mg = ctx.createRadialGradient(0, -8, 2, 0, -14, 40); mg.addColorStop(0, '#7A4FA8'); mg.addColorStop(0.6, '#4A2E6E'); mg.addColorStop(1, '#2E1B46'); ctx.fillStyle = mg; ctx.fill();
    // tubs of ice cream glinting inside
    for (const [tx, c] of [[-12, '#FF9FC8'], [0, '#91E9CC'], [12, '#FFE9A8']]) { L.rrect(ctx, tx - 4.5, -10, 9, 7, 1.6); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(); ell(ctx, tx, -10.5, 4.2, 2.2, c); }
    ctx.fillStyle = 'rgba(255,190,230,.25)'; ctx.beginPath(); ctx.ellipse(0, -2, 22, 5, 0, 0, TAU); ctx.fill();
    // arch rim + icicles
    ctx.strokeStyle = '#F4ECFB'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.quadraticCurveTo(-28, -42, 0, -44); ctx.quadraticCurveTo(28, -42, 26, 0); ctx.stroke();
    for (let k = 0; k < 9; k++) { const u = k / 8, ax = -22 + u * 44, ay = -40 + Math.abs(u - 0.5) * 2 * 26 * (Math.abs(u - 0.5) > 0.3 ? 1 : 0.4) + (Math.abs(u - 0.5) < 0.3 ? -2 : 0); const len = 4 + (k % 3) * 2.5; ctx.beginPath(); ctx.moveTo(ax - 1.6, ay); ctx.lineTo(ax, ay + len); ctx.lineTo(ax + 1.6, ay); ctx.closePath(); ctx.fillStyle = 'rgba(225,245,255,.95)'; ctx.fill(); }
    // scoops on top: strawberry, mint, vanilla, with drips running down the cliff
    for (const [sx, sy, r, c] of [[-24, -66, 18, '#FF9FC8'], [32, -64, 16, '#91E9CC'], [6, -76, 20, '#FFF1C8']]) {
      ctx.beginPath(); ctx.arc(sx, sy, r, Math.PI * 0.95, Math.PI * 2.05);
      for (let q = 0; q <= 6; q++) { const u = q / 6, xx = sx + r * Math.cos(Math.PI * 0.05 - u * Math.PI * 1.1) * 1.02, yy = sy + 4 + (q % 2 ? 5 : 0); ctx.lineTo(xx, yy); }
      ctx.closePath(); jfill(ctx, c, sx - r * 0.3, sy - r * 0.4, r, 1);
      hl(ctx, sx - r * 0.4, sy - r * 0.5, r * 0.3, r * 0.13, -0.5, 0.8);
    }
    for (const [dx, len, c] of [[-36, 18, '#FF9FC8'], [-14, 12, '#FF9FC8'], [44, 16, '#91E9CC'], [-4, 22, '#FFF1C8'], [14, 10, '#FFF1C8']]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(dx - 3, -56); ctx.lineTo(dx - 2.4, -56 + len); ctx.arc(dx, -56 + len, 2.4, Math.PI, 0, true); ctx.lineTo(dx + 3, -56); ctx.closePath(); ctx.fill();
      ell(ctx, dx - 0.8, -54 + len * 0.5, 0.6, len * 0.25, 'rgba(255,255,255,.6)');
    }
    // a cherry and sprinkles on the top scoop
    ctx.beginPath(); ctx.arc(6, -98, 4.4, 0, TAU); jfill(ctx, '#FF2B5E', 5, -99, 4.4, 0.8); hl(ctx, 4.4, -99.6, 1.4, 0.8);
    ctx.strokeStyle = '#4FA65A'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6, -102); ctx.quadraticCurveTo(8, -108, 12, -109); ctx.stroke();
    for (let k = 0; k < 14; k++) { ctx.save(); ctx.translate(-30 + R() * 72, -84 + R() * 16); ctx.rotate(R() * 3); ctx.fillStyle = SPRINK[k % 6]; L.rrect(ctx, -1.6, -0.6, 3.2, 1.2, 0.6); ctx.fill(); ctx.restore(); }
    ctx.restore();
    // a giant wafer cone stuck in the snow beside the mouth (the shop's sign, no words)
    const cx = x + 52, cy = y + 6;
    cast(ctx, cx, cy, c2 => { c2.beginPath(); c2.moveTo(-7, -30); c2.lineTo(7, -30); c2.lineTo(0, 0); c2.closePath(); c2.arc(0, -34, 9, 0, TAU); }, { a: 0.16 });
    contact(ctx, cx, cy, 8, 2.6, 0.3);
    ctx.save(); ctx.translate(cx, cy);
    ctx.beginPath(); ctx.moveTo(-8, -30); ctx.lineTo(8, -30); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = '#E6AC78'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(150,90,50,.55)'; ctx.lineWidth = 0.8; for (let k = -20; k < 20; k += 4) { ctx.beginPath(); ctx.moveTo(k, -32); ctx.lineTo(k + 12, 0); ctx.moveTo(k + 12, -32); ctx.lineTo(k, 0); ctx.stroke(); } ctx.fillStyle = 'rgba(120,70,40,.18)'; ctx.fillRect(1, -32, 10, 34); ctx.restore();
    ctx.beginPath(); ctx.arc(0, -33, 9.5, Math.PI * 0.95, Math.PI * 2.05); ctx.quadraticCurveTo(5, -28, 0, -30); ctx.quadraticCurveTo(-5, -28, -9.5, -31); ctx.closePath(); jfill(ctx, '#B994FF', -3, -36, 9, 0.8);
    hl(ctx, -3.4, -37.5, 2.8, 1.2, -0.5, 0.85);
    ctx.restore();
  }
  /* the hot-cocoa hut: a gingerbread chalet with an icing-snow roof, a mug on the gable, a cocoa pot outside */
  function cocoaHut(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c2 => { c2.beginPath(); c2.moveTo(-34, 0); c2.lineTo(-40, -40); c2.lineTo(0, -80); c2.lineTo(40, -40); c2.lineTo(34, 0); c2.closePath(); c2.rect(-26, -86, 10, 40); }, { a: 0.18 });
    contact(ctx, 0, 2, 46, 9, 0.32);
    // gingerbread walls
    L.rrect(ctx, -32, -44, 64, 45, 6); jfill(ctx, '#C98A52', -8, -26, 42, 1.2);
    ctx.save(); L.rrect(ctx, -32, -44, 64, 45, 6); ctx.clip();
    ctx.fillStyle = 'rgba(90,40,20,.16)'; ctx.fillRect(10, -46, 30, 50);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 2.4]); ctx.beginPath(); ctx.moveTo(-32, -6); ctx.lineTo(32, -6); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // chimney
    L.rrect(ctx, -26, -86, 10, 34, 2.4); jfill(ctx, '#B994FF', -23, -76, 12, 1);
    L.rrect(ctx, -28, -89, 14, 5, 2.4); jfill(ctx, '#D3BEFF', -23, -88, 8, 0.8);
    ell(ctx, -21, -89, 6, 2.2, '#FFFFFF');
    // icing-snow roof with drips
    ctx.beginPath(); ctx.moveTo(-42, -38); ctx.lineTo(0, -78); ctx.lineTo(42, -38);
    const drips = [[42, -38], [34, -31], [26, -38], [17, -29], [8, -38], [-2, -30], [-12, -38], [-22, -30], [-32, -38], [-42, -38]];
    for (let k = 1; k < drips.length; k++) { const [ax, ay] = drips[k - 1], [bx, by] = drips[k]; ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 5, bx, by); }
    ctx.closePath(); ctx.lineJoin = 'round'; jfill(ctx, '#FFF8FC', -12, -62, 46, 1.2);
    ctx.fillStyle = 'rgba(150,120,210,.25)'; ctx.beginPath(); ctx.moveTo(0, -78); ctx.lineTo(42, -38); ctx.lineTo(26, -38); ctx.closePath(); ctx.fill();
    hl(ctx, -16, -60, 8, 2.4, -0.75, 0.8);
    for (const [sx, sy, c] of [[-12, -52, '#FF6F9F'], [4, -64, '#5EC6EC'], [16, -50, '#FFD43A'], [-24, -44, '#91E9CC'], [-2, -46, '#B994FF']]) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(sx * 0.13); ctx.fillStyle = c; L.rrect(ctx, -2.2, -0.8, 4.4, 1.6, 0.8); ctx.fill(); ctx.restore(); }
    // the mug on the gable (round sign board, no words)
    ctx.beginPath(); ctx.arc(0, -50, 8.5, 0, TAU); ctx.fillStyle = '#FFF4E6'; ctx.fill(); ctx.strokeStyle = '#A86C45'; ctx.lineWidth = 1.4; ctx.stroke();
    L.rrect(ctx, -4.4, -54, 8, 8, 1.6); ctx.fillStyle = '#FF6F9F'; ctx.fill(); ctx.strokeStyle = '#FF6F9F'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(4, -50, 2.4, -1.4, 1.4); ctx.stroke();
    ell(ctx, -0.4, -54, 4, 1.2, '#7A4A2A'); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1.6, -56); ctx.quadraticCurveTo(-3, -58, -1, -60); ctx.moveTo(1.4, -56); ctx.quadraticCurveTo(0, -58, 2, -60); ctx.stroke();
    // door and window
    ctx.beginPath(); ctx.arc(-12, -17, 8, Math.PI, 0); ctx.lineTo(-4, 0); ctx.lineTo(-20, 0); ctx.closePath();
    const dg = ctx.createLinearGradient(-20, -24, -4, 0); dg.addColorStop(0, '#D8577F'); dg.addColorStop(1, '#9C2F57'); ctx.fillStyle = dg; ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 1.6]); ctx.beginPath(); ctx.arc(-12, -17, 9.4, Math.PI, 0); ctx.stroke(); ctx.setLineDash([]);
    ell(ctx, -7.5, -10, 1.2, 1.2, '#FFD43A');
    L.rrect(ctx, 6, -30, 18, 14, 3); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    L.rrect(ctx, 8, -28, 14, 10, 2); const wg = ctx.createLinearGradient(8, -28, 22, -18); wg.addColorStop(0, '#FFF6C8'); wg.addColorStop(1, '#FFC66A'); ctx.fillStyle = wg; ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(15, -28); ctx.lineTo(15, -18); ctx.stroke();
    // counter with mugs under the window
    L.rrect(ctx, 4, -15, 22, 4, 1.6); ctx.fillStyle = '#A86C45'; ctx.fill();
    for (const mx of [8, 14, 20]) { L.rrect(ctx, mx - 2, -20, 4, 5, 1); ctx.fillStyle = mx === 14 ? '#5EC6EC' : '#FF9FC8'; ctx.fill(); ell(ctx, mx, -20.5, 2.4, 1.6, '#FFFFFF'); }
    ell(ctx, -12, 1.5, 11, 2.6, '#F7EEF8');
    ctx.restore();
  }
  function cocoaPot(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    contact(ctx, 0, 2, 18, 5, 0.32);
    // stone ring
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ell(ctx, Math.cos(a) * 12, Math.sin(a) * 4.6 + 1, 3.2, 2.2, k % 2 ? '#D9D0E6' : '#EDE6F4'); hl(ctx, Math.cos(a) * 12 - 1, Math.sin(a) * 4.6, 1.1, 0.6, 0, 0.9); }
    // tripod
    ctx.strokeStyle = '#8E5B3A'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-12, 2); ctx.lineTo(0, -28); ctx.lineTo(12, 2); ctx.moveTo(0, -28); ctx.lineTo(2, 4); ctx.stroke();
    ctx.strokeStyle = '#5A3A3A'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(0, -19); ctx.stroke();
    // the pot
    ctx.beginPath(); ctx.moveTo(-9, -18); ctx.quadraticCurveTo(-11, -4, 0, -4); ctx.quadraticCurveTo(11, -4, 9, -18); ctx.closePath(); jfill(ctx, '#6E4FB0', -3, -13, 10, 1);
    ell(ctx, 0, -18, 9, 2.6, '#7A4A2A'); ell(ctx, -1, -18.4, 6, 1.4, '#9C6440');
    ell(ctx, -2.5, -18.6, 2.2, 0.9, '#FFFFFF'); ell(ctx, 2.6, -18, 1.6, 0.7, '#FFE9F2');
    hl(ctx, -5, -13, 1.6, 2.6, 0.3, 0.6);
    ctx.restore();
  }
  /* cable-car station: a chalet on a deck with the bull wheel facing up the line */
  function station(ctx, x, y, s, roof, wheelDy) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    cast(ctx, 0, 0, c2 => { c2.beginPath(); c2.moveTo(-30, 0); c2.lineTo(-32, -34); c2.lineTo(-6, -58); c2.lineTo(26, -34); c2.lineTo(26, 0); c2.closePath(); c2.rect(4, -50, 12, 50); }, { a: 0.18 });
    contact(ctx, 0, 2, 40, 8, 0.32);
    // deck
    L.rrect(ctx, -34, -6, 70, 8, 2); ctx.fillStyle = '#D99A66'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-32, -5, 66, 1);
    // building
    L.rrect(ctx, -28, -34, 40, 30, 4); jfill(ctx, '#FFF4EA', -14, -22, 26, 1);
    ctx.fillStyle = 'rgba(120,80,150,.14)'; ctx.fillRect(2, -34, 10, 30);
    for (const wx of [-22, -12]) { L.rrect(ctx, wx, -26, 7, 8, 1.6); ctx.fillStyle = '#FFE08A'; ctx.fill(); ctx.strokeStyle = '#B994FF'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(4, -12, 5, Math.PI, 0); ctx.lineTo(9, -4); ctx.lineTo(-1, -4); ctx.closePath(); ctx.fillStyle = '#8A5CE0'; ctx.fill();
    // roof with snow
    ctx.beginPath(); ctx.moveTo(-34, -32); ctx.lineTo(-8, -56); ctx.lineTo(18, -32); ctx.quadraticCurveTo(-8, -28, -34, -32); jfill(ctx, roof, -16, -44, 24, 1.1);
    ctx.beginPath(); ctx.moveTo(-28, -36); ctx.lineTo(-8, -56); ctx.lineTo(10, -38); ctx.quadraticCurveTo(4, -40, 0, -36); ctx.quadraticCurveTo(-8, -40, -14, -36); ctx.quadraticCurveTo(-22, -40, -28, -36); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    hl(ctx, -18, -44, 4, 1.4, -0.75, 0.75);
    // the wheel housing: a candy-striped post up to the bull wheel
    ctx.save(); L.rrect(ctx, 16, -wheelDy, 5, wheelDy, 2); ctx.fillStyle = '#FFF4EA'; ctx.fill(); ctx.clip(); ctx.fillStyle = '#FF4F86'; for (let k = -wheelDy; k < 0; k += 7) { ctx.beginPath(); ctx.moveTo(15, k); ctx.lineTo(22, k - 4); ctx.lineTo(22, k - 1); ctx.lineTo(15, k + 3); ctx.fill(); } ctx.restore();
    ctx.beginPath(); ctx.ellipse(18.5, -wheelDy, 9, 4, 0, 0, TAU); ctx.strokeStyle = '#6E4FB0'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(18.5, -wheelDy, 3, 1.4, 0, 0, TAU); ctx.fillStyle = '#FFD43A'; ctx.fill();
    ctx.restore();
  }
  function pylon(ctx, x, y, h) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c2 => { c2.beginPath(); c2.moveTo(-5, 0); c2.lineTo(-2, -h); c2.lineTo(2, -h); c2.lineTo(5, 0); c2.closePath(); c2.rect(-9, -h - 2, 18, 3); }, { a: 0.17 });
    contact(ctx, 0, 1, 10, 3, 0.3);
    ctx.beginPath(); ctx.moveTo(-4.5, 0); ctx.lineTo(-1.8, -h); ctx.lineTo(1.8, -h); ctx.lineTo(4.5, 0); ctx.closePath(); ctx.fillStyle = '#FFF4EA'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#8A5CE0'; for (let k = -h; k < 0; k += 9) { ctx.beginPath(); ctx.moveTo(-6, k); ctx.lineTo(6, k - 4); ctx.lineTo(6, k); ctx.lineTo(-6, k + 4); ctx.fill(); } ctx.fillStyle = 'rgba(70,40,120,.18)'; ctx.fillRect(0.5, -h, 6, h); ctx.restore();
    L.rrect(ctx, -9, -h - 2, 18, 3, 1.4); ctx.fillStyle = '#6E4FB0'; ctx.fill();
    for (const sx of [-7, 7]) ell(ctx, sx, -h - 1, 1.4, 1.4, '#FFD43A');
    ctx.restore();
  }
  /* the observatory: a round tower under a pink dome, its slit open and the telescope out */
  function observatory(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c2 => { c2.beginPath(); c2.moveTo(-26, 0); c2.lineTo(-26, -44); c2.arc(0, -44, 28, Math.PI, 0); c2.lineTo(26, 0); c2.closePath(); }, { a: 0.2, len: 0.55 });
    contact(ctx, 0, 2, 40, 8, 0.32);
    // steps + base drum
    ell(ctx, 0, 0, 32, 7, '#E6D8F2'); ell(ctx, 0, -1.5, 30, 6, '#F8F0FC');
    ctx.beginPath(); ctx.moveTo(-25, -2); ctx.lineTo(-25, -44); ctx.lineTo(25, -44); ctx.lineTo(25, -2); ctx.ellipse(0, -2, 25, 5.5, 0, 0, Math.PI); ctx.closePath();
    const bg = ctx.createLinearGradient(-25, 0, 25, 0); bg.addColorStop(0, '#FFFFFF'); bg.addColorStop(0.5, '#F2E8FA'); bg.addColorStop(1, '#C9B6E6'); ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,150,.35)'; ctx.lineWidth = 1; ctx.stroke();
    // stone courses
    ctx.strokeStyle = 'rgba(150,120,200,.35)'; ctx.lineWidth = 0.8; for (const yy of [-14, -26, -38]) { ctx.beginPath(); ctx.ellipse(0, yy, 25, 5, 0, 0.05, Math.PI - 0.05); ctx.stroke(); }
    // door + round windows
    ctx.beginPath(); ctx.arc(-6, -12, 6, Math.PI, 0); ctx.lineTo(0, 1); ctx.lineTo(-12, 1); ctx.closePath(); ctx.fillStyle = '#6E4FB0'; ctx.fill();
    ell(ctx, -1.5, -7, 0.9, 0.9, '#FFD43A');
    for (const [wx, wy] of [[12, -24], [-16, -30]]) { ctx.beginPath(); ctx.arc(wx, wy, 3.6, 0, TAU); ctx.fillStyle = '#FFE08A'; ctx.fill(); ctx.strokeStyle = '#B994FF'; ctx.lineWidth = 1.2; ctx.stroke(); }
    // balcony ring
    ctx.beginPath(); ctx.ellipse(0, -44, 29, 6.5, 0, 0, TAU); ctx.fillStyle = '#B994FF'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -45.5, 28, 5.5, 0, 0, TAU); ctx.fillStyle = '#E2D4F6'; ctx.fill();
    // dome
    ctx.beginPath(); ctx.moveTo(-25, -46); ctx.bezierCurveTo(-25, -80, 25, -80, 25, -46); ctx.quadraticCurveTo(0, -42, -25, -46); jfill(ctx, '#FF9FC8', -8, -66, 28, 1.2);
    // the open slit and the telescope
    ctx.save(); ctx.beginPath(); ctx.moveTo(-25, -46); ctx.bezierCurveTo(-25, -80, 25, -80, 25, -46); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-3, -45); ctx.lineTo(-5, -74); ctx.lineTo(5, -74); ctx.lineTo(3, -45); ctx.closePath(); ctx.fillStyle = '#3B2766'; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(1, -60); ctx.rotate(-0.55);
    L.rrect(ctx, -3, -24, 6, 26, 2); jfill(ctx, '#FFF4EA', -1, -12, 8, 0.9);
    L.rrect(ctx, -4, -27, 8, 5, 1.6); ctx.fillStyle = '#FFD43A'; ctx.fill(); ctx.strokeStyle = 'rgba(160,110,20,.5)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.restore();
    // dome ribs + highlight + finial star
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 0.9; for (const k of [-16, 16]) { ctx.beginPath(); ctx.moveTo(k * 1.4, -46); ctx.quadraticCurveTo(k * 0.9, -70, 0, -72); ctx.stroke(); }
    hl(ctx, -13, -64, 5, 2.4, -0.8, 0.8);
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(-25, -46); ctx.bezierCurveTo(-25, -58, -20, -64, -12, -68); ctx.quadraticCurveTo(-16, -60, -18, -52); ctx.quadraticCurveTo(-22, -48, -25, -46); ctx.fill();
    L.star(ctx, 0, -78, 4.2, '#FFD43A', '#E0A100');
    ctx.restore();
  }

  /* ---------- props ---------- */
  function props(B, add, ctx) {
    const g = geom(B), R = B.rng(77);
    const PINE = ['#4DBE9A', '#5CC7A8', '#45B08C', '#6AD0B0'];
    // beach: lollipops and a pine pair by the ferry landing
    add(g.beach.y, () => { lolly(ctx, g.beach.x, g.beach.y, 0.8, '#FF7FB0', '#FFFFFF'); lolly(ctx, g.beach.x + 22, g.beach.y + 8, 0.62, '#B994FF', '#FFF4EA'); });
    for (const [x, y, s] of g.pines21) add(y, () => candyPine(ctx, x, y, s, PINE[Math.floor(R() * PINE.length)], R));
    // the grove right of 22: candy pines and lollipops
    const gr = [[-30, -40, 1.05], [46, -36, 1.1], [-46, 4, 0.85], [56, 12, 0.95], [22, 40, 0.8]];
    for (const [dx, dy, s] of gr) { const x = g.grove.x + dx, y = g.grove.y + dy; add(y, () => candyPine(ctx, x, y, s, PINE[Math.floor(R() * PINE.length)], R)); }
    add(g.grove.y + 2, () => { lolly(ctx, g.grove.x - 8, g.grove.y + 2, 0.75, '#FFD43A', '#FF6F9F'); lolly(ctx, g.grove.x + 16, g.grove.y + 14, 0.6, '#5EC6EC', '#FFFFFF'); });
    // the ice-cream cave and the cocoa hut
    add(g.cave.y, () => iceCreamCave(ctx, g.cave.x, g.cave.y, B.rng(9)));
    add(g.hut.y, () => cocoaHut(ctx, g.hut.x, g.hut.y));
    add(g.pot.y, () => cocoaPot(ctx, g.pot.x, g.pot.y));
    add(g.hut.y - 10, () => candyPine(ctx, g.hut.x - 52, g.hut.y - 18, 0.9, '#5CC7A8', R));
    // marshmallow stools by the pot
    add(g.pot.y + 14, () => { for (const [dx, dy] of [[-18, 14], [20, 10]]) { const x = g.pot.x + dx, y = g.pot.y + dy; contact(ctx, x + 1, y + 1, 8, 2.6, 0.3); L.rrect(ctx, x - 6, y - 8, 12, 9, 3); jfill(ctx, '#FFF8FC', x - 2, y - 5, 8, 0.8); ell(ctx, x, y - 8, 6, 2, '#FFFFFF'); } });
    // the cable car: stations and pylons; the cable itself is drawn above everything
    add(g.base.y, () => station(ctx, g.base.x, g.base.y, 1, '#8A5CE0', 42));
    add(g.top.y, () => station(ctx, g.top.x, g.top.y, 0.82, '#FF7FB0', 44));
    for (const p of g.pylons) add(p.y, () => pylon(ctx, p.x, p.y, 54));
    { const P = cablePts(g); for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; add(Math.max(a.y + a.h, b.y + b.h) + 2, () => cable(ctx, [a, b])); } }
    // the observatory on the summit
    add(g.obs.y, () => observatory(ctx, g.obs.x, g.obs.y));
    // the sledding run: poles along it, a marshmallow stop at the foot, a sled waiting at the top
    const run = runPts(g);
    for (let k = 8; k < run.length - 4; k += 9) { const p = run[k], q = run[k + 1], a = Math.atan2(q.y - p.y, q.x - p.x); for (const sd of [-1, 1]) { const x = p.x - Math.sin(a) * 16 * sd, y = p.y + Math.cos(a) * 16 * sd; if (W.distToRoad(x, y) < 30) continue; add(y, () => flagPole(ctx, x, y, sd > 0 ? '#FF4F86' : '#8A5CE0')); } }
    { const p = run[run.length - 1], x = p.x + 10, y = p.y + 14; add(y, () => { for (const [dx, dy] of [[-8, 0], [6, -2], [-1, -8]]) { contact(ctx, x + dx + 1, y + dy + 1, 8, 2.4, 0.28); L.rrect(ctx, x + dx - 6, y + dy - 8, 12, 9, 3); jfill(ctx, '#FFF8FC', x + dx - 2, y + dy - 5, 8, 0.8); ell(ctx, x + dx, y + dy - 8, 6, 2, '#FFFFFF'); } }); }
    { const p = run[0]; add(p.y - 6, () => sledProp(ctx, p.x - 16, p.y - 10)); }
    // crags at the edges, the snowman, scattered pines and lollipops
    for (const c of g.crags) add(c.y, () => crag(ctx, c.x, c.y, c.s, R));
    add(g.snowman.y, () => snowman(ctx, g.snowman.x, g.snowman.y));
    const scatter = [[2, -150, 70, 'pine', 0.85], [2, -130, 100, 'lolly', 0.7], [3, 110, -60, 'pine', 0.8], [4, 150, -40, 'pine', 0.95], [4, 190, -10, 'pine', 0.75], [5, -86, -40, 'pine', 0.8],
      [6, 150, -20, 'pine', 0.85], [6, -130, -40, 'pine', 0.8], [7, 70, -40, 'lolly', 0.7], [8, 100, 40, 'pine', 0.8], [9, -40, -40, 'pine', 0.7], [1, -70, 50, 'lolly', 0.65], [0, 130, 30, 'lolly', 0.7]];
    for (const [j, dx, dy, kind, s] of scatter) {
      const p = B.at(j, dx, dy);
      add(p.y, () => kind === 'pine' ? candyPine(ctx, p.x, p.y, s, PINE[Math.floor(R() * PINE.length)], R) : lolly(ctx, p.x, p.y, s, ['#FF7FB0', '#FFD43A', '#B994FF', '#5EC6EC'][Math.floor(R() * 4)], '#FFFFFF'));
    }
  }
  function flagPole(ctx, x, y, c) {
    cast(ctx, x, y, c2 => { c2.beginPath(); c2.rect(-0.8, -16, 1.6, 16); }, { a: 0.14 });
    contact(ctx, x, y, 3.4, 1.2, 0.3);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x - 0.8, y - 16, 1.6, 16);
    ctx.fillStyle = c; ctx.fillRect(x - 0.8, y - 12, 1.6, 2.4); ctx.fillRect(x - 0.8, y - 6, 1.6, 2.4);
    ctx.beginPath(); ctx.moveTo(x + 0.8, y - 16); ctx.lineTo(x + 7, y - 13.6); ctx.lineTo(x + 0.8, y - 11); ctx.fillStyle = c; ctx.fill();
  }
  function sledProp(ctx, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.5);
    contact(ctx, 0, 3, 12, 3.4, 0.3);
    drawSled(ctx, '#3FA6D6');
    ctx.restore();
  }
  /* the sled, drawn at the origin pointing +x (shared by the prop and the live kind) */
  function drawSled(ctx, c) {
    ctx.strokeStyle = '#8A5CE0'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (const o of [-3.4, 3.4]) { ctx.beginPath(); ctx.moveTo(-9, o); ctx.lineTo(7, o); ctx.quadraticCurveTo(11, o, 10, o - 3); ctx.stroke(); }
    L.rrect(ctx, -8, -4.6, 15, 9.2, 2.6); jfill(ctx, c, -3, -2, 9, 0.8);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(-6, -3.6, 11, 1.2);
  }
  /* the cable: shadow on the snow, then the line itself through every attachment point */
  function cable(ctx, P) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const seg = (pts, f) => { ctx.beginPath(); for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; for (let k = 0; k <= 12; k++) { const u = k / 12, p = f(a, b, u); i + k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } } };
    // shadow: ground point under the line, pushed down-right by its height
    seg(P, (a, b, u) => { const h = a.h + (b.h - a.h) * u - Math.sin(u * Math.PI) * 12; return { x: a.x + (b.x - a.x) * u + 0.45 * h, y: a.y + a.h + (b.y + b.h - a.y - a.h) * u + 0.4 * h }; });
    ctx.strokeStyle = 'rgba(48,30,80,.12)'; ctx.lineWidth = 2; ctx.stroke();
    seg(P, cablePoint); ctx.strokeStyle = '#4A3478'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.translate(2.4, 0); seg(P, cablePoint); ctx.strokeStyle = 'rgba(74,52,120,.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  /* the cable's curve between two attachment points: a straight span with a 12-unit sag */
  function cablePoint(a, b, u) { return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * 12 }; }

  /* ---------- foreground: frosted pine boughs and snowy bushes ---------- */
  function fg(B, put) {
    const n = j => B.node(j).y;
    const bough = (o, x, y, R, side) => {
      const dir = side < 0 ? 1 : -1, len = 74;
      o.save(); o.lineCap = 'round';
      const ex = x + dir * len, ey = y + 10, cx = x + dir * len * 0.5, cy = y - 14;
      o.strokeStyle = '#5A3A2E'; o.lineWidth = 5; o.beginPath(); o.moveTo(x - dir * 10, y + 4); o.quadraticCurveTo(cx, cy, ex, ey); o.stroke();
      for (let k = 0; k < 18; k++) {
        const t = 0.15 + k / 18 * 0.88, px = (1 - t) * (1 - t) * (x - dir * 10) + 2 * (1 - t) * t * cx + t * t * ex, py = (1 - t) * (1 - t) * (y + 4) + 2 * (1 - t) * t * cy + t * t * ey;
        for (const up of [-1, 1]) {
          const a = (dir > 0 ? 0.25 : Math.PI - 0.25) + up * (0.9 + R() * 0.3) * (dir > 0 ? 1 : -1), Ln = 13 + R() * 5;
          o.strokeStyle = up < 0 ? '#3E9A80' : '#2F7E68'; o.lineWidth = 3.4; o.beginPath(); o.moveTo(px, py); o.lineTo(px + Math.cos(a) * Ln, py + Math.sin(a) * Ln); o.stroke();
        }
      }
      // snow along the top of the bough
      for (let k = 0; k < 9; k++) { const t = 0.2 + k / 9 * 0.8, px = (1 - t) * (1 - t) * (x - dir * 10) + 2 * (1 - t) * t * cx + t * t * ex, py = (1 - t) * (1 - t) * (y + 4) + 2 * (1 - t) * t * cy + t * t * ey; ell(o, px, py - 7, 8 + R() * 4, 3.6, '#FFFFFF'); ell(o, px + 1, py - 5.6, 7, 1.6, 'rgba(180,150,220,.5)'); }
      o.restore();
    };
    const snowBush = (o, x, y, R, side) => {
      const dir = side < 0 ? 1 : -1, s = 34;
      const lobes = [[0, 0, s], [dir * s * 0.75, s * 0.35, s * 0.62], [dir * s * 0.25, -s * 0.62, s * 0.66], [-dir * s * 0.3, s * 0.55, s * 0.7]];
      for (const [dx, dy, r] of lobes) { o.beginPath(); o.arc(x + dx, y + dy, r, 0, TAU); const gg = o.createRadialGradient(x + dx - r * 0.4, y + dy - r * 0.5, r * 0.1, x + dx, y + dy, r * 1.05); gg.addColorStop(0, '#5CC7A8'); gg.addColorStop(0.55, '#3E9A80'); gg.addColorStop(1, '#276A58'); o.fillStyle = gg; o.fill(); }
      for (const [dx, dy, r] of lobes) { o.beginPath(); o.ellipse(x + dx - r * 0.2, y + dy - r * 0.62, r * 0.55, r * 0.22, -0.2, 0, TAU); o.fillStyle = '#FFFFFF'; o.fill(); o.beginPath(); o.ellipse(x + dx - r * 0.2, y + dy - r * 0.5, r * 0.5, r * 0.1, -0.2, 0, Math.PI); o.fillStyle = 'rgba(180,150,220,.45)'; o.fill(); }
      for (let k = 0; k < 5; k++) { const a = R() * TAU, r = R() * s * 0.6; o.save(); o.translate(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.4 - s * 0.4); o.rotate(R() * 3); o.fillStyle = SPRINK[k % 6]; L.rrect(o, -2.4, -0.9, 4.8, 1.8, 0.9); o.fill(); o.restore(); }
    };
    for (const [side, y, draw] of [[-1, n(0) + 10, snowBush], [-1, n(2) + 40, bough], [-1, n(1) + 40, snowBush], [1, n(2) - 20, bough], [1, n(9) + 70, snowBush]]) put({ side, y, draw });
  }

  /* ---------- manifest ---------- */
  function manifest(B, put) {
    const g = geom(B);
    const P = cablePts(g), lp = [];
    for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < 8; k++) lp.push(cablePoint(P[i], P[i + 1], k / 8));
    lp.push({ x: P[P.length - 1].x, y: P[P.length - 1].y });
    put.live('cablecar', { x: P[0].x, y: P[0].y, pts: lp, ph: 0, c: '#FF7FB0' });
    put.live('cablecar', { x: P[0].x, y: P[0].y, pts: lp, ph: 0.5, c: '#5EC6EC' });
    put.live('sled', { x: g.run[0].x, y: g.run[0].y, pts: runPts(g).filter((p, k) => k % 2 === 0), ph: 0 });
    put.live('smoke', { x: g.hut.x - 21, y: g.hut.y - 90 });
    put.live('campfire', { x: g.pot.x, y: g.pot.y + 2 });
    put.live('steam', { x: g.pot.x, y: g.pot.y - 20 });
    put.live('pennant', { x: g.obs.x + 26, y: g.obs.y - 66, c: '#FFD43A' });
    put.live('pennant', { x: g.base.x - 8, y: g.base.y - 60, c: '#FF7FB0' });
    // night glows: hut window + fire, station windows, observatory windows
    put.glow({ x: g.hut.x + 15, y: g.hut.y - 23, r: 22, c: '#FFC66A' });
    put.glow({ x: g.pot.x, y: g.pot.y - 4, r: 40, c: '#FFB54A' });
    put.glow({ x: g.base.x - 15, y: g.base.y - 22, r: 18, c: '#FFE08A' });
    put.glow({ x: g.top.x - 12, y: g.top.y - 18, r: 14, c: '#FFE08A' });
    put.glow({ x: g.obs.x + 12, y: g.obs.y - 24, r: 14, c: '#FFE08A' });
    put.glow({ x: g.obs.x - 16, y: g.obs.y - 30, r: 14, c: '#FFE08A' });
    put.glow({ x: g.cave.x, y: g.cave.y - 10, r: 26, c: '#FFB3E0' });
    // critters: the dragon warms the cocoa, the panda keeps the ice-cream cave, the bat lives in it,
    // the penguin waits its turn at the top of the sled run, a cloud drifts over the observatory
    put.critter({ kind: 'dragon', x: g.pot.x + 22, y: g.pot.y + 4, size: 38 });
    put.critter({ kind: 'panda', x: g.cave.x + 30, y: g.cave.y + 14, size: 36 });
    put.critter({ kind: 'bat', x: g.cave.x - 2, y: g.cave.y - 8, size: 26 });
    put.critter({ kind: 'penguin', x: g.run[0].x + 16, y: g.run[0].y - 2, size: 34 });
    put.critter({ kind: 'cloud', x: g.obs.x + 60, y: g.obs.y - 74, size: 34, float: true });
    put.chest(B.i0 + 2, { x: g.chest22.x, y: g.chest22.y });
    put.chest(B.i0 + 6, { x: g.chest26.x, y: g.chest26.y });
    put.sign({ role: 'region', level: B.i0 + 3, x: g.sign23.x, y: g.sign23.y });
    put.sign({ role: 'rest', level: B.i0 + 5, x: g.rest.x, y: g.rest.y });
    put.gate({ x: g.gate.x, y: g.gate.y + 6, angle: +Math.atan2(g.gate.ty, g.gate.tx).toFixed(3), to: B.k + 1 });
  }

  /* ---------- chapter live kinds (ported in PeckLiveLayer.swift) ---------- */
  const X = dx => W.CX + dx, Y = yb => W.H - yb;
  /* cablecar: { pts: [[dx, yb]…] cable polyline, ph 0..1, c } — a cabin rides the cable up and back,
     40 s round trip, easing into each station; hangs 14 below the line. */
  W.LIVE.cablecar = (ctx, e, t) => {
    const pts = e.pts.map(a => ({ x: X(a[0]), y: Y(a[1]) }));
    const cyc = ((t / 40 + (e.ph || 0)) % 1), tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2, u = tri * tri * (3 - 2 * tri);
    let tot = 0; const d = [0]; for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); d.push(tot); }
    const want = u * tot; let i = 1; while (i < pts.length - 1 && d[i] < want) i++;
    const a = pts[i - 1], b = pts[i], f = (want - d[i - 1]) / ((d[i] - d[i - 1]) || 1), x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
    const sw = Math.sin(t * 1.4 + (e.ph || 0) * 9) * 0.05;
    ell(ctx, x + 22, y + 52, 10, 3.4, 'rgba(48,30,80,.12)');
    ctx.save(); ctx.translate(x, y); ctx.rotate(sw);
    ctx.strokeStyle = '#4A3478'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fillStyle = '#4A3478'; ctx.fill();
    L.rrect(ctx, -9, 6, 18, 15, 4); jfill(ctx, e.c || '#FF7FB0', -3, 10, 12, 1);
    L.rrect(ctx, -6.5, 9, 13, 6, 1.6); ctx.fillStyle = '#DDF6FF'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, 15); ctx.stroke();
    L.rrect(ctx, -10, 4.6, 20, 3, 1.4); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    hl(ctx, -5, 17.5, 2.4, 0.9, 0, 0.7);
    ctx.restore();
  };
  /* sled: { pts: [[dx, yb]…] run polyline top to bottom, ph } — every 9 s a sled appears at the top,
     slides down (ease-in, 3.2 s), coasts to a stop and fades; hidden the rest of the cycle. */
  W.LIVE.sled = (ctx, e, t) => {
    const pts = e.pts.map(a => ({ x: X(a[0]), y: Y(a[1]) }));
    const c = (t / 9 + (e.ph || 0)) % 1, T = c * 9;
    if (T > 5) return;
    const alpha = T < 0.4 ? T / 0.4 : T > 4.4 ? Math.max(0, (5 - T) / 0.6) : 1;
    const s = T < 0.4 ? 0 : T < 3.6 ? ((T - 0.4) / 3.2) ** 1.6 * 0.96 : 0.96 + (1 - (1 - Math.min(1, (T - 3.6) / 0.8)) ** 2) * 0.04;
    let tot = 0; const d = [0]; for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); d.push(tot); }
    const want = s * tot; let i = 1; while (i < pts.length - 1 && d[i] < want) i++;
    const a = pts[i - 1], b = pts[i], f = (want - d[i - 1]) / ((d[i] - d[i - 1]) || 1), x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.save(); ctx.globalAlpha = alpha;
    // powder kicked up behind while it is moving fast
    const sp = T > 0.4 && T < 4 ? Math.min(1, (T - 0.4) / 1.5) : 0;
    for (let k = 1; k <= 3; k++) ell(ctx, x - Math.cos(ang) * (8 + k * 6), y - Math.sin(ang) * (8 + k * 6) - k, 2 + k * 1.2, 1.4 + k * 0.6, `rgba(255,255,255,${0.7 * sp * (1 - k / 4)})`);
    ell(ctx, x + 3, y + 5, 11, 3, 'rgba(48,30,80,.16)');
    ctx.translate(x, y); ctx.rotate(ang);
    drawSled(ctx, '#FF4F86');
    // rider: a little mint jelly in a scarf
    ctx.rotate(-ang);
    ctx.beginPath(); ctx.ellipse(0, -6, 5.4, 5, 0, 0, TAU); ctx.fillStyle = jgrad(ctx, '#91E9CC', -1.6, -8, 6); ctx.fill();
    ctx.fillStyle = '#FFD43A'; L.rrect(ctx, -5, -3.4, 10, 2.2, 1); ctx.fill();
    ell(ctx, -1.8, -7, 0.7, 0.7, '#2A1F2B'); ell(ctx, 1.8, -7, 0.7, 0.7, '#2A1F2B');
    hl(ctx, -2.2, -9.2, 1.6, 0.8, -0.4, 0.85);
    ctx.restore();
  };
  /* steam: { } — three soft wisps rising from a pot, 3 s each */
  W.LIVE.steam = (ctx, e, t) => {
    const x0 = X(e.dx), y0 = Y(e.yb);
    for (let k = 0; k < 3; k++) {
      const p = (t / 3 + k / 3) % 1, x = x0 + Math.sin(p * 6 + k * 2) * 3, y = y0 - p * 22;
      ctx.strokeStyle = `rgba(255,255,255,${0.75 * Math.sin(p * Math.PI)})`; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 2, y + 4); ctx.quadraticCurveTo(x + 3, y, x - 1, y - 4); ctx.stroke();
    }
  };
  /* pennant: { c } — a small triangular flag on a pole top (x, y), its tip waving slowly */
  W.LIVE.pennant = (ctx, e, t) => {
    const x = X(e.dx), y = Y(e.yb), w = Math.sin(t * 2.2 + e.dx) * 1.6;
    ctx.strokeStyle = '#8E5B3A'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x, y - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.quadraticCurveTo(x + 6, y - 1 + w, x + 11, y + 1 + w); ctx.quadraticCurveTo(x + 6, y + 2 + w * 0.5, x, y + 4); ctx.closePath(); ctx.fillStyle = e.c; ctx.fill();
  };

  W.chapter({
    id: 'peaks', name: 'SPRINKLE PEAKS', title: 'Sprinkle Peaks', road: 'ribbon',
    roadStyle: { edge: '#E3C9F2', base: '#FFF8FD', dash: '#B994FF', grass: 'rgba(90,60,140,.16)' },
    node: ['#F3E8FF', '#B994FF', '#7A4FD6'], gateBanner: ['TO MARSHMALLOW CLOUDS', '#FF7FB0', '#B23A6E'],
    sign: { board: '#8A5CE0', plate: '#F6F0FF', ink: '#5A34A8' },
    edgeColor: '#E9DDF7', finaleSky: ['#E8D6FF', '#F6E4FF', '#FFE9F2'], night: false,
    geom, ground, props, fg, manifest, topEdge: B => geom(B).topEdge,
  });
})();
