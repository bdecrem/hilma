/* Chapter 4 — Marshmallow Clouds (levels 31–40). The trail leaves the snowy summit of the peaks and
   walks across a kingdom built on cloud tops: stacked cloud plateaus (lit cream tops, peach and
   lavender walls, lilac valley shade where one plateau tucks behind the next), with pockets where a
   pastel sky shows far below (tiny islands, birds). Balloon port at 31–32 (chest 32), the region
   sign at 33, kite hill at 34, the Deep Dive cloud pool at 35, the marshmallow cottage and its bee
   garden at 36 (chest 36), a rainbow bridge over the one gap the road crosses (37–38), the wind-chime
   tower at 38, the cloud-sheep pasture at 39, and sunset lamps at 40 where the clouds blush pink and
   lilac and end in a lip under the Starlight Garden (the gate). */
(function () {
  'use strict';
  const L = window.L, K = window.K, W = window.WORLD, TAU = Math.PI * 2;
  const { ell, hl, jfill, jgrad, cast, contact, rect } = K;

  const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const puffUp = (x, lam, h, ph) => -h * Math.abs(Math.sin(Math.PI * x / lam + ph));     // rounded bumps up, cusps down
  const puffDn = (x, lam, h, ph) => h * Math.abs(Math.sin(Math.PI * x / lam + ph));      // rounded bulges down
  function wig(x) { return Math.sin(x / 43 + 0.9) * 4 + Math.sin(x / 17 + 2.2) * 1.5; }

  /* colours by height in the band: u = 0 at the peaks, 1 at the lip (blush starts past the middle) */
  function cols(u) {
    const t = sstep(0.45, 1, u), m = (a, b) => L.mix(a, b, t);
    return { lit: m('#FFFFFF', '#FFF3F8'), base: m('#FFF2E6', '#FFD9EA'), deep: m('#D9CCF2', '#D4B8EC'), wallTop: m('#FFCDB6', '#F6A9C8'), wallBot: m('#B5A2EA', '#A086DC'), rim: m('#FFFFFF', '#FFF0F7') };
  }

  function geom(B) {
    if (B._g) return B._g;
    const g = {};
    const n = j => B.node(j), mid = j => B.node(j).y - W.P / 2;   // between node j and j+1
    const sg = B.odd ? -1 : 1;
    g.u = y => Math.max(0, Math.min(1, (B.bottom - y) / (B.bottom - B.top)));
    // the lip at the top: the gate stands where the road crosses it
    g.lipY = B.top;
    const gp = W.roadAtY(g.lipY, B.i1, B.i1 + 1);
    g.gate = { x: gp.x, y: gp.y, tx: gp.tx, ty: gp.ty };
    const lipRaw = x => g.lipY + wig(x) + puffUp(x, 38, 6, 0.4);
    g.topEdge = x => lipRaw(x) - lipRaw(g.gate.x) + g.lipY;
    // landmark spots (canonical anchors)
    g.port = B.A(1, 132, 6);
    g.chest32 = B.A(1, 66, 40);
    g.sign = B.A(2, 104, 30);
    g.kite = B.A(3, 128, 10);
    g.pool = B.A(4, -122, -52);
    g.restSign = { x: g.pool.x + g.pool.m * 60, y: g.pool.y + 36 };
    g.cottage = B.A(5, 140, 8);
    g.garden = { x: g.cottage.x - g.cottage.m * 64, y: g.cottage.y + 30 };
    g.chest36 = B.A(5, 64, 44);
    g.tower = B.A(7, 128, 20);
    g.pasture = B.A(8, -112, -6);
    g.lamps = B.A(9, 112, 24);
    g.welcome = B.A(0, -150, 30);
    g.keep = [[g.port, 90], [g.chest32, 30], [g.sign, 40], [g.kite, 70], [g.pool, 90], [g.cottage, 80], [g.garden, 40], [g.chest36, 30], [g.tower, 60], [g.pasture, 90], [g.lamps, 60], [g.welcome, 60]];
    // plateaus, top to bottom (paint order); crest = back edge, front = where the top face ends
    const crest = (y0, sl, ph, a = 7) => x => y0 + sl * (x - W.CX) + a * Math.sin(x * 0.018 + ph) + 3 * Math.sin(x * 0.051 + ph * 2) + puffUp(x, 34 + (ph * 7) % 14, 5, ph);
    g.plates = [
      { crest: g.topEdge },
      { crest: crest(mid(7), 0.2 * sg, 1.3) },
      { crest: crest(mid(6) + 40, 0, 4.0, 5), rainbow: true },
      { crest: crest(mid(4), -0.2 * sg, 2.4) },
      { crest: crest(mid(2), 0.2 * sg, 5.1) },
      { crest: crest(mid(0), -0.2 * sg, 0.7) },
    ];
    // sky pockets: the front of plateau k rises where nothing important stands, so the sky shows
    // between its wall and the next crest. Depth from the road, the nodes and the landmarks.
    const X0 = -20, X1 = W.DW + 20, STEP = 4;
    for (let k = 0; k < g.plates.length; k++) {
      const P = g.plates[k], nxt = g.plates[k + 1];
      if (!nxt) { P.front = () => B.bottom + 330; P.wallH = () => 0; continue; }
      if (nxt.rainbow) {
        P.front = x => nxt.crest(x) - 84 + puffDn(x, 30, 5, 1.1);
      } else {
        const raw = [];
        for (let x = X0; x <= X1; x += STEP) {
          const y = nxt.crest(x) - 30;
          let f = sstep(44, 96, Math.min(W.distToRoad(x, y), W.nodeDist(x, y) - 10));
          for (const [p, r] of g.keep) f *= sstep(r * 0.8, r + 40, Math.hypot(p.x - x, (p.y - y) * 1.2));
          raw.push(f);
        }
        const sm = raw.map((v, i) => { let s = 0, c = 0; for (let q = -6; q <= 6; q++) { const w = raw[i + q]; if (w != null) { s += w; c++; } } return s / c; });
        const D = 138;
        P.gapAt = x => { const i = Math.max(0, Math.min(sm.length - 1, (x - X0) / STEP)), i0 = Math.floor(i), t = i - i0; return (sm[i0] * (1 - t) + (sm[Math.min(sm.length - 1, i0 + 1)] * t)); };
        P.front = x => nxt.crest(x) + 26 - D * P.gapAt(x) + puffDn(x, 30, 5, k);
      }
      P.wallH = x => 30 + 5 * Math.sin(x * 0.07 + k);
    }
    // the rainbow bridge: where the road crosses the gap above the rainbow plateau
    const rb = g.plates[1], top = rb.front, bot = g.plates[2].crest;
    const cr = W.roadAtY((B.node(6).y + B.node(7).y) / 2 - 2, B.i0 + 6, B.i0 + 7);
    g.bridge = { x: cr.x, y: (top(cr.x) + bot(cr.x)) / 2 - 2, ang: Math.atan2(cr.ty, cr.tx) };
    return (B._g = g);
  }

  /* which plateau's top face is visible at (x, y), or -1 over the sky */
  function surface(g, x, y) {
    for (let k = g.plates.length - 1; k >= 0; k--) {
      const P = g.plates[k];
      if (y >= P.crest(x) + 2) return y <= P.front(x) - 4 ? k : -1;
    }
    return -1;
  }

  /* ---------- ground ---------- */
  function ground(ctx, B) {
    const g = geom(B), DW = W.DW, R = B.rng(31);
    const yT = B.top - 200, yB = B.bottom + 330;
    const poly = (fn, dy = 0) => { const Q = []; for (let x = -20; x <= DW + 20; x += 4) Q.push([x, fn(x) + dy]); return Q; };
    const line = Q => { ctx.beginPath(); Q.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };
    // everything lives below the lip
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-20, yB); for (const [x, y] of poly(g.topEdge)) ctx.lineTo(x, y); ctx.lineTo(DW + 20, yB); ctx.closePath(); ctx.clip();
    // the sky far below: pale blue at the peaks, lilac, then sunset under the lip
    const sk = ctx.createLinearGradient(0, B.bottom, 0, B.top);
    sk.addColorStop(0, '#BFE4F8'); sk.addColorStop(0.45, '#CFD6F6'); sk.addColorStop(0.75, '#E9CDF0'); sk.addColorStop(1, '#FFC4D6');
    ctx.fillStyle = sk; ctx.fillRect(-20, yT, DW + 40, yB - yT);
    // the sea of clouds below, islands and birds, in every pocket
    for (let k = 0; k < g.plates.length - 1; k++) skyPocket(ctx, B, g, k, R);
    // plateaus, back to front
    g.plates.forEach((P, k) => {
      const yc = P.crest(W.CX), c = cols(g.u(yc));
      // valley shade on the plateau behind, just above this crest
      if (k > 0) {
        ctx.save(); ctx.lineJoin = 'round';
        for (const [w, a] of [[80, 0.06], [50, 0.08], [26, 0.1], [10, 0.13]]) { line(poly(P.crest, -w * 0.3)); ctx.strokeStyle = `rgba(120,86,170,${a})`; ctx.lineWidth = w; ctx.stroke(); }
        ctx.restore();
      }
      // the wall: peach under the lit lip, lavender into the shade, puffs hanging off the bottom
      if (P.wallH(W.CX) > 0) {
        const fr = poly(P.front), wb = fr.map(([x, y]) => [x, y + P.wallH(x)]);
        ctx.beginPath(); fr.forEach(([x, y], i) => i ? ctx.lineTo(x, y - 6) : ctx.moveTo(x, y - 6));
        for (let i = wb.length - 1; i >= 0; i--) ctx.lineTo(wb[i][0], wb[i][1]);
        ctx.closePath();
        const wy = P.front(W.CX), wg = ctx.createLinearGradient(0, wy - 30, 0, wy + 60);
        wg.addColorStop(0, c.wallTop); wg.addColorStop(0.55, L.mix(c.wallTop, c.wallBot, 0.6)); wg.addColorStop(1, c.wallBot);
        ctx.fillStyle = wg; ctx.fill();
        // hanging puffs
        const PR = L.rng(300 + k);
        for (let x = -20; x <= DW + 20; x += 13 + PR() * 6) {
          const r = 9 + PR() * 7, y = P.front(x) + P.wallH(x) - r * 0.35;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
          const pg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.5, r * 0.1, x, y, r * 1.05);
          pg.addColorStop(0, L.mix(c.wallTop, c.wallBot, 0.35)); pg.addColorStop(1, c.wallBot); ctx.fillStyle = pg; ctx.fill();
          ctx.strokeStyle = 'rgba(255,230,240,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r - 1.5, Math.PI * 1.1, Math.PI * 1.55); ctx.stroke();
        }
        // soft bounce light along the bottom of the wall
        ctx.strokeStyle = 'rgba(255,214,232,.45)'; ctx.lineWidth = 1.4; line(wb.map(([x, y]) => [x, y + 5])); ctx.stroke();
      }
      // the top face
      const cp = poly(P.crest), fp = poly(P.front);
      ctx.beginPath(); cp.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      for (let i = fp.length - 1; i >= 0; i--) ctx.lineTo(fp[i][0], fp[i][1]);
      ctx.closePath();
      ctx.save();
      const sl = (P.crest(W.CX + 60) - P.crest(W.CX - 60)) / 120, nl = Math.hypot(sl, 1), nxv = -sl / nl, nyv = 1 / nl;
      const nxt = g.plates[k + 1], T = nxt ? Math.max(120, nxt.crest(W.CX) - yc) : 220;
      const gr = ctx.createLinearGradient(W.CX, yc, W.CX + nxv * T, yc + nyv * T);
      gr.addColorStop(0, c.lit); gr.addColorStop(0.12, L.mix(c.lit, c.base, 0.5)); gr.addColorStop(0.45, c.base); gr.addColorStop(1, L.mix(c.base, c.deep, 0.75));
      ctx.fillStyle = gr; ctx.fill(); ctx.clip();
      // warm light mass upper-left, cool shade lower-right
      const lx = 90 + (k * 53) % 110, ly = yc + T * 0.3;
      let rg = ctx.createRadialGradient(lx, ly, 10, lx, ly, 200); rg.addColorStop(0, 'rgba(255,250,232,.45)'); rg.addColorStop(1, 'rgba(255,250,232,0)');
      ctx.fillStyle = rg; ctx.fillRect(lx - 210, ly - 210, 420, 420);
      const sx = DW - 60 - (k * 37) % 100, sy = yc + T * 0.85;
      rg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 180); rg.addColorStop(0, 'rgba(140,110,200,.16)'); rg.addColorStop(1, 'rgba(140,110,200,0)');
      ctx.fillStyle = rg; ctx.fillRect(sx - 190, sy - 190, 380, 380);
      // the front lip catches a little shade where it rolls over
      ctx.strokeStyle = 'rgba(150,120,200,.16)'; ctx.lineWidth = 8; line(fp.map(([x, y]) => [x, y - 2])); ctx.stroke();
      ctx.restore();
      // the front lip's own rim, then the crest's rim light
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2; line(fp.map(([x, y]) => [x, y - 3])); ctx.stroke();
      ctx.strokeStyle = c.rim; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; line(poly(P.crest, 1.4)); ctx.stroke();
      ctx.strokeStyle = 'rgba(150,120,200,.22)'; ctx.lineWidth = 1; line(cp); ctx.stroke();
    });
    // knolls under the big landmarks (soft raised puffs of cloud)
    for (const [p, rx, ry] of [[g.port, 96, 40], [g.cottage, 92, 38], [g.pasture, 112, 44], [g.tower, 62, 26], [g.lamps, 66, 26]]) {
      const x = p.x, y = p.y + 8, c = cols(g.u(y));
      ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
      const sg = ctx.createRadialGradient(rx * 0.12, rx * 0.22, rx * 0.4, rx * 0.12, rx * 0.22, rx * 1.05);
      sg.addColorStop(0, 'rgba(120,90,170,.13)'); sg.addColorStop(1, 'rgba(120,90,170,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(rx * 0.12, rx * 0.22, rx * 1.05, 0, TAU); ctx.fill();
      const gg = ctx.createRadialGradient(-rx * 0.3, -rx * 0.45, rx * 0.1, 0, 0, rx);
      gg.addColorStop(0, L.rgba(c.lit, 1)); gg.addColorStop(0.55, L.rgba(c.base, 0.9)); gg.addColorStop(1, L.rgba(c.base, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, rx * 0.8, ry * 0.8, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    }
    // broad tonal noise on the cloud tops
    {
      const noise = L.makeNoise(41 + B.k);
      const sx = 4, nw = Math.ceil(DW / sx), y0 = Math.floor(B.top - 40), nh = Math.ceil((B.bottom + 40 - y0) / sx);
      const oc = document.createElement('canvas'); oc.width = nw; oc.height = nh; const o2 = oc.getContext('2d');
      const im = o2.createImageData(nw, nh), d = im.data;
      for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
        const x = i * sx, y = y0 + j * sx, v = noise.fbm(x / 120, y / 90, 3) * 2.2 + noise.n2(x / 22, y / 16) * 0.45, kk = (j * nw + i) * 4;
        if (v > 0) { d[kk] = 255; d[kk + 1] = 255; d[kk + 2] = 255; d[kk + 3] = Math.min(255, v * 150); }
        else { d[kk] = 150; d[kk + 1] = 120; d[kk + 2] = 205; d[kk + 3] = Math.min(255, -v * 90); }
      }
      o2.putImageData(im, 0, 0);
      ctx.save(); ctx.beginPath();
      g.plates.forEach((P, k) => {
        const nxt = g.plates[k + 1];
        ctx.moveTo(-20, P.crest(-20) + 3); for (let x = -20; x <= DW + 20; x += 8) ctx.lineTo(x, P.crest(x) + 3);
        for (let x = DW + 20; x >= -20; x -= 8) ctx.lineTo(x, Math.min(P.front(x), nxt ? nxt.crest(x) : 1e9) - 4); ctx.closePath();
      });
      ctx.clip(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 0.4; ctx.drawImage(oc, 0, y0, nw * sx, nh * sx); ctx.restore();
    }
    // side trails: soft marshmallow paths from the road to the landmarks
    const spur = (p, bend = 0) => {
      const r = W.roadAtY(p.y, B.i0, B.i1 + 1); if (!r) return;
      const mx = (r.x + p.x) / 2, my = (r.y + p.y) / 2 + bend;
      const sp = L.catmull([{ x: r.x, y: r.y }, { x: mx, y: my }, { x: p.x, y: p.y }], 10);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.save(); ctx.translate(2, 3); L.pathPoly(ctx, sp.pts); ctx.strokeStyle = 'rgba(130,100,180,.16)'; ctx.lineWidth = 13; ctx.stroke(); ctx.restore();
      L.pathPoly(ctx, sp.pts); ctx.strokeStyle = '#EADFF5'; ctx.lineWidth = 11; ctx.stroke();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 7.5; ctx.stroke();
      ctx.setLineDash([2, 9]); ctx.strokeStyle = 'rgba(127,224,200,.7)'; ctx.lineWidth = 2.4; ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    };
    spur({ x: g.port.x - g.port.m * 40, y: g.port.y + 10 }, 6);
    spur({ x: g.pool.x + g.pool.m * 44, y: g.pool.y + 16 }, -4);
    spur({ x: g.cottage.x - g.cottage.m * 14, y: g.cottage.y + 6 }, 6);
    spur({ x: g.tower.x - g.tower.m * 10, y: g.tower.y + 8 }, -4);
    spur({ x: g.kite.x - g.kite.m * 20, y: g.kite.y + 16 }, 4);
    // cloud curls (this chapter's tufts): dense along crests, ringing the landmarks, never on the road
    const curl = (x, y, s, u) => {
      const c = cols(u);
      ctx.beginPath(); ctx.arc(x + 1.2 * s, y + 1.4 * s, 4.2 * s, 0, Math.PI); ctx.fillStyle = 'rgba(140,110,200,.16)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x - 3 * s, y, 3 * s, 0, TAU); ctx.arc(x + 1 * s, y - 1.6 * s, 3.8 * s, 0, TAU); ctx.arc(x + 4.6 * s, y + 0.4 * s, 2.6 * s, 0, TAU);
      ctx.fillStyle = c.lit; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(x + 0.4 * s, y - 2 * s, 2.6 * s, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
    };
    const free = (x, y) => g.keep.every(([p, r]) => (x - p.x) ** 2 + (y - p.y + 10) ** 2 > (r * 0.62) ** 2);
    for (let i = 0; i < 900; i++) {
      let x, y;
      if (R() < 0.55) { const P = g.plates[1 + Math.floor(R() * (g.plates.length - 1))]; x = R() * DW; y = P.crest(x) + 4 + R() * R() * 30; }
      else { const [p, r] = g.keep[Math.floor(R() * g.keep.length)], an = R() * TAU, rr = r * (0.7 + R() * 0.4); x = p.x + Math.cos(an) * rr; y = p.y + Math.sin(an) * rr * 0.5; }
      if (y < B.top + 6 || y > B.bottom + 60) continue;
      const dr = W.distToRoad(x, y); if (dr < 24 || (dr < 46 && R() < 0.6) || W.nodeDist(x, y) < 44 || !free(x, y) || surface(g, x, y) < 0) continue;
      curl(x, y, 0.75 + R() * 0.55, g.u(y));
    }
    // sugar sparkles
    for (let i = 0; i < 160; i++) {
      const x = R() * DW, y = B.top + R() * (B.bottom - B.top + 60);
      if (surface(g, x, y) < 0 || W.distToRoad(x, y) < 22) continue;
      const s = 0.8 + R() * 1.2;
      ctx.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.95)' : 'rgba(255,214,236,.9)';
      ctx.beginPath(); ctx.moveTo(x, y - 2.4 * s); ctx.lineTo(x + 0.6 * s, y - 0.6 * s); ctx.lineTo(x + 2.4 * s, y); ctx.lineTo(x + 0.6 * s, y + 0.6 * s); ctx.lineTo(x, y + 2.4 * s); ctx.lineTo(x - 0.6 * s, y + 0.6 * s); ctx.lineTo(x - 2.4 * s, y); ctx.lineTo(x - 0.6 * s, y - 0.6 * s); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // the lip: a blush glow and a bright rolled edge where the clouds end under the garden
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,180,214,.55)'; ctx.lineWidth = 8; line(poly(g.topEdge, 5)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,246,251,.98)'; ctx.lineWidth = 3.2; line(poly(g.topEdge, 1.2)); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,160,235,.55)'; ctx.lineWidth = 1.2; line(poly(g.topEdge, -0.4)); ctx.stroke();
    ctx.restore();
  }

  /* the sky between plateau k's wall and plateau k+1's crest: a cloud sea far below, islands, birds */
  function skyPocket(ctx, B, g, k, R) {
    const P = g.plates[k], nxt = g.plates[k + 1];
    const spots = [];
    for (let x = 10; x <= W.DW - 10; x += 6) {
      const top = P.front(x) + P.wallH(x), bot = nxt.crest(x);
      if (bot - top > 26) spots.push({ x, top, bot });
    }
    if (!spots.length) return;
    // far cloud sea along the bottom of the pocket
    for (const s of spots) if (R() < 0.5) ell(ctx, s.x + (R() - 0.5) * 6, s.bot - 6 - R() * 6, 10 + R() * 12, 3 + R() * 2, 'rgba(255,255,255,.55)');
    // islands: tiny, hazy, far below
    let last = -999;
    for (const s of spots) {
      if (s.x - last < 70 || s.bot - s.top < 40 || R() < 0.55) continue;
      last = s.x;
      const x = s.x, y = s.top + (s.bot - s.top) * 0.62, r = 7 + R() * 7, haze = 0.35;
      const mixc = c => L.mix(c, '#D4D8F6', haze);
      ell(ctx, x, y + 1.5, r + 2, r * 0.42 + 1, 'rgba(255,255,255,.6)');
      ell(ctx, x, y, r, r * 0.42, mixc('#F2DDB0'));
      ell(ctx, x - 0.5, y - 1, r * 0.78, r * 0.3, mixc('#8CCB7A'));
      if (R() < 0.6) { const tx = x + (R() - 0.5) * r; ell(ctx, tx, y - 4, 2.2, 2.6, mixc('#5DAF6A')); ctx.fillStyle = mixc('#9C7A5A'); ctx.fillRect(tx - 0.4, y - 2.5, 0.8, 2); }
    }
    // a few baked birds, tiny
    ctx.strokeStyle = 'rgba(110,96,160,.45)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    for (const s of spots) {
      if (R() < 0.93) continue;
      const x = s.x, y = s.top + 6 + R() * (s.bot - s.top - 12), w = 2 + R() * 1.4;
      ctx.beginPath(); ctx.moveTo(x - w, y - w * 0.5); ctx.quadraticCurveTo(x - w * 0.4, y - w * 0.7, x, y); ctx.quadraticCurveTo(x + w * 0.4, y - w * 0.7, x + w, y - w * 0.5); ctx.stroke();
    }
  }

  /* ---------- landmark drawers ---------- */
  function balloonPort(ctx, x, y, m) {
    ctx.save(); ctx.translate(x, y);
    contact(ctx, 2, 3, 52, 15, 0.26);
    // the landing deck: a jelly-mint disc with a white rim and a dashed landing ring
    ell(ctx, 3, 4, 46, 15, 'rgba(110,80,160,.22)');
    ctx.beginPath(); ctx.ellipse(0, 2, 44, 14, 0, 0, TAU); ctx.fillStyle = '#3BAE93'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 44, 14, 0, 0, TAU); jfill(ctx, '#BFF3E3', -12, -4, 40, 1);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.ellipse(0, 0, 32, 9.5, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; L.rrect(ctx, -10, -2.2, 20, 4.4, 2); ctx.fill(); L.rrect(ctx, -2.2, -6, 4.4, 12, 2); ctx.fill();
    hl(ctx, -22, -6, 9, 2, -0.1, 0.6);
    // mooring posts on the deck edge (the balloons' tethers tie on here)
    for (const [px, py] of [[-30, -4], [26, 6]]) {
      cast(ctx, px, py, rect(-2, -18, 4, 18, 2), { a: 0.14 });
      ctx.save(); ctx.beginPath(); L.rrect(ctx, px - 2.2, py - 18, 4.4, 18, 2.2); ctx.fillStyle = '#FFF4EA'; ctx.fill(); ctx.clip();
      ctx.fillStyle = '#FF7FB0'; for (let k = -22; k < 4; k += 6) { ctx.beginPath(); ctx.moveTo(px - 3, py + k); ctx.lineTo(px + 3, py + k - 3); ctx.lineTo(px + 3, py + k - 1); ctx.lineTo(px - 3, py + k + 2); ctx.fill(); } ctx.restore();
      ctx.beginPath(); ctx.arc(px, py - 19, 2.6, 0, TAU); jfill(ctx, '#FFD43A', px, py - 19, 2.6, 0.6);
      ctx.strokeStyle = '#C98A52'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(px, py - 4, 4, 1.6, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    // the ticket booth beside the deck, toward the trail
    const bx = x - m * 52, by = y + 6;
    ctx.save(); ctx.translate(bx, by);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-11, -34, 22, 34); }, { a: 0.16 });
    contact(ctx, 0, 1, 16, 4.5, 0.3);
    L.rrect(ctx, -10, -24, 20, 24, 3); jfill(ctx, '#FFF4EA', -4, -16, 16, 1);
    L.rrect(ctx, -7, -20, 14, 8, 2); ctx.fillStyle = '#9BE3F5'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(-6, -19, 4, 1.4);
    L.rrect(ctx, -11, -12.5, 22, 3, 1.4); ctx.fillStyle = '#E6AC78'; ctx.fill();
    // striped awning + flag
    ctx.beginPath(); ctx.moveTo(-14, -24); ctx.lineTo(-10, -34); ctx.lineTo(10, -34); ctx.lineTo(14, -24); ctx.closePath(); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#7FE0C8'; for (let k = -14; k < 14; k += 7) { ctx.beginPath(); ctx.moveTo(k, -24); ctx.lineTo(k + 3.5, -24); ctx.lineTo(k * 0.7 + 2.5, -34); ctx.lineTo(k * 0.7, -34); ctx.fill(); } ctx.restore();
    for (let k = -14; k <= 14; k += 3.5) { ctx.beginPath(); ctx.arc(k, -24, 1.75, 0, Math.PI); ctx.fillStyle = (Math.round(k / 3.5) % 2) ? '#7FE0C8' : '#FFFFFF'; ctx.fill(); }
    ctx.strokeStyle = '#B9784A'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -44); ctx.stroke();
    ctx.fillStyle = '#FF7FB0'; ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(8, -42); ctx.lineTo(0, -40); ctx.fill();
    hl(ctx, -6, -21, 2.4, 1, -0.4, 0.7);
    ctx.restore();
    // sandbag ballast
    for (const [sx, sy] of [[x + m * 50, y + 10], [x + m * 58, y + 4]]) {
      contact(ctx, sx + 1, sy, 6, 2, 0.28);
      ctx.beginPath(); ctx.ellipse(sx, sy - 3, 5, 3.6, 0, 0, TAU); jfill(ctx, '#F2D9B0', sx - 1, sy - 4, 5, 0.7);
      ctx.fillStyle = '#C98A52'; ctx.fillRect(sx - 1, sy - 7, 2, 1.6);
    }
  }

  function signPostless() {}

  function knoll(ctx, x, y, w, h, c) {
    // a raised puff of cloud: three lobes, lit top-left, lilac at the foot
    contact(ctx, x + 4, y + 2, w * 0.95, h * 0.45, 0.22);
    const lobes = [[-w * 0.45, -h * 0.35, h * 0.62], [w * 0.4, -h * 0.3, h * 0.66], [0, -h * 0.6, h * 0.8]];
    ctx.beginPath(); ctx.ellipse(x, y - h * 0.18, w, h * 0.5, 0, 0, TAU); for (const [dx, dy, r] of lobes) { ctx.moveTo(x + dx + r, y + dy); ctx.ellipse(x + dx, y + dy, r * 1.25, r, 0, 0, TAU); }
    const g = ctx.createLinearGradient(x - w * 0.6, y - h * 1.4, x + w * 0.5, y + h * 0.3);
    g.addColorStop(0, c.lit); g.addColorStop(0.5, c.base); g.addColorStop(1, L.mix(c.deep, c.wallBot, 0.3)); ctx.fillStyle = g; ctx.fill();
    for (const [dx, dy, r] of lobes) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r * 1.25 - 1.5, r - 1.5, 0, Math.PI * 1.08, Math.PI * 1.55); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(140,110,200,.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y - h * 0.18, w, h * 0.5, 0, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  function kiteKnoll(ctx, x, y, c, R) {
    knoll(ctx, x, y, 44, 26, c);
    // a spool of string and a little flag stake on top
    ctx.save(); ctx.translate(x + 16, y - 20);
    ell(ctx, 1, 2, 5, 1.6, 'rgba(110,80,160,.25)');
    L.rrect(ctx, -3, -6, 6, 7, 1.5); ctx.fillStyle = '#E6AC78'; ctx.fill();
    ctx.fillStyle = '#FFF4EA'; ctx.fillRect(-3, -4.5, 6, 3.5);
    ctx.restore();
  }

  function pool(ctx, x, y, m, R) {
    const rx = 50, ry = 21;
    ctx.save(); ctx.translate(x, y);
    contact(ctx, 3, 6, rx + 20, ry + 8, 0.2);
    // tiled candy rim
    ctx.beginPath(); ctx.ellipse(0, 3, rx + 9, ry + 7, 0, 0, TAU); ctx.fillStyle = '#E3B9D6'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, rx + 9, ry + 7, 0, 0, TAU); jfill(ctx, '#FFF0F7', -14, -8, rx, 1);
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, rx + 9, ry + 7, 0, 0, TAU); ctx.ellipse(0, 0, rx + 1, ry + 1, 0, 0, TAU, true); ctx.clip();
    ctx.strokeStyle = 'rgba(214,150,190,.55)'; ctx.lineWidth = 0.8; for (let a = 0; a < TAU; a += TAU / 28) { ctx.beginPath(); ctx.moveTo(Math.cos(a) * (rx + 1), Math.sin(a) * (ry + 1)); ctx.lineTo(Math.cos(a) * (rx + 10), Math.sin(a) * (ry + 8)); ctx.stroke(); }
    ctx.restore();
    // water: deep at the far wall, bright toward us
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    const wg = ctx.createLinearGradient(0, -ry, 0, ry); wg.addColorStop(0, '#2A9AC8'); wg.addColorStop(0.35, '#3FB6D9'); wg.addColorStop(1, '#8AE6F0');
    ctx.fillStyle = wg; ctx.fill();
    ctx.save(); ctx.clip();
    // the inner wall in shade along the top, lit along the bottom
    ctx.beginPath(); ctx.ellipse(0, -ry + 3, rx * 1.02, ry * 0.42, 0, 0, TAU); ctx.fillStyle = 'rgba(30,70,140,.22)'; ctx.fill();
    // caustics
    const CR = L.rng(91);
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 0.8;
    for (let k = 0; k < 34; k++) { const cx = (CR() - 0.5) * rx * 1.8, cy = (CR() - 0.3) * ry * 1.4, r = 2.5 + CR() * 3; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.4, r * 0.6, CR(), 0, Math.PI * 1.4); ctx.stroke(); }
    // lane rope across
    ctx.setLineDash([3, 3]); ctx.strokeStyle = '#FF7FB0'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-rx, 4); ctx.quadraticCurveTo(0, 9, rx, 4); ctx.stroke();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineDashOffset = 3; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, rx - 1, ry - 1, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    // a swim ring floating
    ctx.save(); ctx.translate(-m * 14, 8); ctx.scale(1, 0.55);
    ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, TAU); ctx.arc(0, 0, 3.4, 0, TAU, true); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#FF7FB0'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 8, k / 4 * TAU, k / 4 * TAU + 0.8); ctx.fill(); } ctx.restore();
    ctx.restore();
    ctx.restore();
    // the diving tower at the far end, board out over the water
    const tx = x + m * (rx + 4), ty = y - 6;
    ctx.save(); ctx.translate(tx, ty);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-9, -50, 18, 50); }, { a: 0.16 });
    contact(ctx, 0, 1, 15, 4.5, 0.3);
    for (const sx of [-8, 5]) { ctx.fillStyle = '#FFF4EA'; L.rrect(ctx, sx, -48, 3.2, 48, 1.6); ctx.fill(); ctx.save(); L.rrect(ctx, sx, -48, 3.2, 48, 1.6); ctx.clip(); ctx.fillStyle = '#7FE0C8'; for (let k = -52; k < 4; k += 7) ctx.fillRect(sx - 1, k, 6, 3); ctx.restore(); }
    for (let k = 0; k < 3; k++) { ctx.fillStyle = '#E6AC78'; L.rrect(ctx, -7, -12 - k * 11, 14, 2.2, 1); ctx.fill(); }
    L.rrect(ctx, -11, -52, 22, 5, 2); jfill(ctx, '#FF9FC8', -4, -52, 11, 0.9);
    ctx.save(); ctx.scale(-m, 1);
    L.rrect(ctx, 6, -53, 34, 3.4, 1.7); ctx.fillStyle = '#FFE9A8'; ctx.fill(); ctx.strokeStyle = 'rgba(160,110,60,.45)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#B9784A'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(m * 9, -52); ctx.lineTo(m * 9, -66); ctx.stroke();
    ctx.fillStyle = '#7FE0C8'; ctx.beginPath(); ctx.moveTo(m * 9, -66); ctx.lineTo(m * 18, -63); ctx.lineTo(m * 9, -60); ctx.fill();
    hl(ctx, -6, -50, 3, 1, 0, 0.7);
    ctx.restore();
    // the board's shadow on the water
    ell(ctx, tx - m * 26, y - 4, 16, 2.4, 'rgba(20,60,110,.18)');
    // deck chair + striped umbrella on the near side, for the peach
    const cx = x - m * 30, cy = y + ry + 22;
    ctx.save(); ctx.translate(cx, cy);
    contact(ctx, 0, 1, 18, 4, 0.25);
    ctx.save(); ctx.rotate(-0.12 * m); L.rrect(ctx, -15, -4, 30, 7, 3); jfill(ctx, '#FFE08A', -4, -2, 14, 0.8);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; for (let k = -12; k < 14; k += 6) ctx.fillRect(k, -3, 2.4, 5); ctx.restore();
    ctx.restore();
    const ux = x - m * 62, uy = y + ry + 10;
    ctx.save(); ctx.translate(ux, uy);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-1, -34, 2, 34); c.ellipse(0, -34, 20, 8, 0, 0, TAU); }, { a: 0.14 });
    contact(ctx, 0, 1, 6, 2, 0.3);
    ctx.fillStyle = '#B9784A'; ctx.fillRect(-0.9, -34, 1.8, 34);
    ctx.beginPath(); ctx.moveTo(-20, -30); ctx.quadraticCurveTo(0, -48, 20, -30); ctx.quadraticCurveTo(0, -34, -20, -30); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#FF7FB0'; for (let k = -20; k < 20; k += 10) { ctx.beginPath(); ctx.moveTo(0, -42); ctx.lineTo(k, -28); ctx.lineTo(k + 5, -28); ctx.fill(); } ctx.restore();
    ctx.strokeStyle = 'rgba(160,60,110,.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-20, -30); ctx.quadraticCurveTo(0, -48, 20, -30); ctx.stroke();
    ctx.restore();
  }

  function cottage(ctx, x, y, m) {
    // a marshmallow cottage: a fat marshmallow drum, a toasted cap, a stacked marshmallow chimney
    ctx.save(); ctx.translate(x, y); ctx.scale(m, 1);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-30, -44, 60, 44); c.ellipse(0, -52, 36, 18, 0, 0, TAU); c.rect(10, -96, 16, 50); }, { a: 0.18 });
    contact(ctx, 0, 2, 44, 10, 0.3);
    // drum
    ctx.beginPath(); ctx.moveTo(-30, -40); ctx.lineTo(-30, -6); ctx.ellipse(0, -6, 30, 8, 0, Math.PI, 0, true); ctx.lineTo(30, -40); ctx.closePath();
    const dg = ctx.createLinearGradient(-30, 0, 30, 0); dg.addColorStop(0, '#FFFFFF'); dg.addColorStop(0.45, '#FFF3F6'); dg.addColorStop(1, '#E9CFE2'); ctx.fillStyle = dg; ctx.fill();
    ctx.strokeStyle = 'rgba(180,120,170,.4)'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,170,205,.22)'; ctx.beginPath(); ctx.ellipse(0, -6, 30, 8, 0, 0, Math.PI); ctx.lineTo(-30, -14); ctx.ellipse(0, -14, 30, 8, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
    // chimney: two small marshmallows
    for (const [cy, h] of [[-62, 14], [-76, 14]]) {
      ctx.beginPath(); ctx.moveTo(11, cy); ctx.lineTo(11, cy - h); ctx.ellipse(18, cy - h, 7, 2.6, 0, Math.PI, 0); ctx.lineTo(25, cy); ctx.ellipse(18, cy, 7, 2.6, 0, 0, Math.PI); ctx.closePath();
      const kg = ctx.createLinearGradient(11, 0, 25, 0); kg.addColorStop(0, '#FFFFFF'); kg.addColorStop(1, '#F1C6DA'); ctx.fillStyle = kg; ctx.fill(); ctx.strokeStyle = 'rgba(180,120,170,.4)'; ctx.lineWidth = 0.9; ctx.stroke();
    }
    ell(ctx, 18, -90, 7, 2.6, '#FFE6F0'); ell(ctx, 18, -90, 4, 1.4, '#9C7A8E');
    // toasted cap
    ctx.beginPath(); ctx.ellipse(0, -42, 36, 10, 0, 0, Math.PI); ctx.bezierCurveTo(-36, -66, -20, -76, 0, -76); ctx.bezierCurveTo(20, -76, 36, -66, 36, -42); ctx.closePath();
    const cg = ctx.createRadialGradient(-12, -66, 2, 0, -52, 44); cg.addColorStop(0, '#FFF0D2'); cg.addColorStop(0.45, '#F6C98A'); cg.addColorStop(1, '#C9844E'); ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = 'rgba(140,80,40,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -42, 36, 10, 0, 0, Math.PI); ctx.strokeStyle = '#FFF6EA'; ctx.lineWidth = 2.6; ctx.stroke();
    for (const [sx, sy, r] of [[14, -58, 4], [-6, -64, 3], [22, -48, 3.4], [4, -52, 2.4], [-20, -54, 2.6]]) ell(ctx, sx, sy, r, r * 0.6, 'rgba(150,80,40,.28)');
    hl(ctx, -16, -66, 9, 3.2, -0.5, 0.75);
    // door + window (the window glows at night)
    ctx.beginPath(); ctx.arc(-10, -18, 8, Math.PI, 0); ctx.lineTo(-2, -1); ctx.lineTo(-18, -1); ctx.closePath(); jfill(ctx, '#7FE0C8', -12, -16, 10, 1);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-10, -25); ctx.lineTo(-10, -1); ctx.stroke();
    ell(ctx, -5.5, -12, 1.2, 1.2, '#FFD43A');
    ctx.beginPath(); ctx.arc(14, -24, 7, 0, TAU); ctx.fillStyle = '#F2B9D2'; ctx.fill();
    ctx.beginPath(); ctx.arc(14, -24, 5.2, 0, TAU); const wg = ctx.createLinearGradient(9, -29, 19, -19); wg.addColorStop(0, '#FFF6C8'); wg.addColorStop(1, '#FFC66A'); ctx.fillStyle = wg; ctx.fill();
    ctx.strokeStyle = '#F2B9D2'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(9, -24); ctx.lineTo(19, -24); ctx.moveTo(14, -29); ctx.lineTo(14, -19); ctx.stroke();
    ell(ctx, -10, 1, 10, 2.6, '#F7EAF5');
    ctx.restore();
  }

  function lollipopFlower(ctx, x, y, s, c) {
    ctx.strokeStyle = '#7FD08A'; ctx.lineWidth = 1.1 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 9 * s); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - 11 * s, 3.2 * s, 0, TAU); jfill(ctx, c, x - 1, y - 12 * s, 3.2 * s, 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.7 * s; ctx.beginPath(); ctx.arc(x, y - 11 * s, 1.6 * s, 0, Math.PI * 1.4); ctx.stroke();
  }
  function flowerBed(ctx, x, y, R) {
    // a marshmallow-edged bed of lollipop flowers for the bee
    contact(ctx, x + 2, y + 3, 30, 8, 0.2);
    ctx.beginPath(); ctx.ellipse(x, y, 26, 9, 0, 0, TAU); ctx.fillStyle = '#E8B07E'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y - 1, 24, 7.5, 0, 0, TAU); ctx.fillStyle = '#C9855A'; ctx.fill();
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; ell(ctx, x + Math.cos(a) * 26, y + Math.sin(a) * 9, 3.2, 2.4, '#FFFFFF'); }
    const pts = []; for (let k = 0; k < 11; k++) pts.push([x + (R() - 0.5) * 38, y + (R() - 0.5) * 9]);
    pts.sort((a, b) => a[1] - b[1]);
    pts.forEach(([px, py], k) => lollipopFlower(ctx, px, py, 0.8 + R() * 0.35, ['#FF7FB0', '#FFD43A', '#B994FF', '#7FE0C8', '#FF9F4A'][k % 5]));
  }

  function tower(ctx, x, y, m) {
    // the wind-chime tower: a mint candy tower with a balcony, a lantern room and the weather vane on top
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c => { c.beginPath(); c.moveTo(-14, 0); c.lineTo(-10, -70); c.lineTo(10, -70); c.lineTo(14, 0); c.closePath(); c.rect(-11, -98, 22, 30); c.arc(0, -104, 12, 0, TAU); }, { a: 0.17, len: 0.55 });
    contact(ctx, 0, 1, 22, 6, 0.32);
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-12, -36, -10, -66); ctx.lineTo(10, -66); ctx.quadraticCurveTo(12, -36, 14, 0); ctx.closePath();
    const g = ctx.createLinearGradient(-14, 0, 14, 0); g.addColorStop(0, '#F4FFFB'); g.addColorStop(0.55, '#CFF6EA'); g.addColorStop(1, '#93D8C4'); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(242,201,222,.95)'; for (let k = -70; k < 10; k += 14) { ctx.beginPath(); ctx.moveTo(-16, k); ctx.lineTo(16, k - 8); ctx.lineTo(16, k - 3); ctx.lineTo(-16, k + 5); ctx.fill(); } ctx.fillStyle = 'rgba(40,90,90,.1)'; ctx.fillRect(4, -70, 14, 74); ctx.restore();
    ctx.strokeStyle = 'rgba(40,120,100,.35)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-12, -36, -10, -66); ctx.lineTo(10, -66); ctx.quadraticCurveTo(12, -36, 14, 0); ctx.stroke();
    // door
    ctx.beginPath(); ctx.arc(0, -8, 5, Math.PI, 0); ctx.lineTo(5, 0); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fillStyle = '#5B4BB8'; ctx.fill();
    // balcony ring
    ctx.beginPath(); ctx.ellipse(0, -66, 17, 5, 0, 0, TAU); jfill(ctx, '#FFFFFF', -6, -68, 16, 1);
    ctx.strokeStyle = '#3BAE93'; ctx.lineWidth = 1; for (let k = -15; k <= 15; k += 5) { ctx.beginPath(); ctx.moveTo(k, -66 + Math.abs(k) * 0.08 + 2); ctx.lineTo(k, -74 + Math.abs(k) * 0.08 + 2); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -72, 16, 4.4, 0, 0, Math.PI); ctx.stroke();
    // lantern room
    L.rrect(ctx, -9, -94, 18, 24, 4); jfill(ctx, '#F4FFFB', -4, -86, 14, 1);
    L.rrect(ctx, -6, -90, 12, 15, 3); const lg = ctx.createLinearGradient(0, -90, 0, -75); lg.addColorStop(0, '#FFF6C8'); lg.addColorStop(1, '#FFD27A'); ctx.fillStyle = lg; ctx.fill();
    ctx.strokeStyle = '#93D8C4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -90); ctx.lineTo(0, -75); ctx.stroke();
    // roof cone
    ctx.beginPath(); ctx.moveTo(-13, -93); ctx.quadraticCurveTo(-4, -100, 0, -116); ctx.quadraticCurveTo(4, -100, 13, -93); ctx.quadraticCurveTo(0, -89, -13, -93); jfill(ctx, '#B994FF', -4, -104, 12, 1);
    hl(ctx, -5, -102, 2.2, 4, 0.3, 0.6);
    ctx.fillStyle = '#B9784A'; ctx.fillRect(-0.7, -124, 1.4, 9);
    ell(ctx, 0, -116, 2.2, 2.2, '#FFD43A');
    // the chime arm out from the balcony
    ctx.strokeStyle = '#B9784A'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(m * 14, -68); ctx.lineTo(m * 26, -70); ctx.stroke();
    hl(ctx, -7, -54, 2, 8, 0, 0.45);
    ctx.restore();
  }

  function sheep(ctx, x, y, s, flip, R) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (flip ? -1 : 1), s);
    cast(ctx, 0, 0, c => { c.beginPath(); c.ellipse(0, -11, 13, 9, 0, 0, TAU); }, { a: 0.13 });
    contact(ctx, 0, 1, 14, 3.6, 0.28);
    ctx.fillStyle = '#5E4A80'; for (const lx of [-7, -3, 4, 8]) { L.rrect(ctx, lx - 1.3, -6, 2.6, 6.5, 1.2); ctx.fill(); }
    const puffs = [[-7, -11, 6], [0, -14, 7], [7, -11, 6], [-3, -8, 6], [4, -8, 6], [0, -10, 7]];
    ctx.beginPath(); for (const [px, py, r] of puffs) { ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, TAU); }
    ctx.fillStyle = jgrad(ctx, '#FFFFFF', -2, -12, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(150,120,200,.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    for (const [px, py, r] of puffs.slice(0, 3)) { ctx.strokeStyle = 'rgba(255,255,255,1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, r - 1.6, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke(); }
    // head
    ctx.beginPath(); ctx.ellipse(-12, -11, 4.6, 5.4, -0.3, 0, TAU); jfill(ctx, '#7A66A0', -13, -13, 5, 0.7);
    ctx.fillStyle = '#6A5690'; ctx.beginPath(); ctx.ellipse(-15.5, -14, 2.6, 1.2, -0.6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-9, -15.5, 2.6, 1.2, 0.5, 0, TAU); ctx.fill();
    ell(ctx, -11.5, -16, 3, 2, '#FFFFFF');
    ell(ctx, -13.6, -11.5, 0.8, 0.8, '#FFFFFF'); ell(ctx, -10.6, -11.8, 0.8, 0.8, '#FFFFFF');
    ell(ctx, -13.2, -8.6, 1.4, 0.8, 'rgba(255,150,190,.6)');
    ctx.restore();
  }

  function fence(ctx, x0, y0, x1, y1) {
    // a candy-stick fence along a gentle line
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 9);
    for (let k = 0; k <= n; k++) {
      const u = k / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
      ctx.fillStyle = 'rgba(110,80,160,.18)'; ctx.fillRect(x + 1.5, y - 1, 2.4, 3);
      ctx.fillStyle = '#FFF4EA'; L.rrect(ctx, x - 1.3, y - 13, 2.6, 13, 1.3); ctx.fill();
      ctx.fillStyle = '#7FE0C8'; ctx.fillRect(x - 1.3, y - 10, 2.6, 2); ctx.fillRect(x - 1.3, y - 5.5, 2.6, 2);
    }
    ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0 - 9); ctx.lineTo(x1, y1 - 9); ctx.stroke();
  }

  function lamp(ctx, x, y) {
    cast(ctx, x, y, rect(-1.5, -34, 3, 34, 1.5), { a: 0.15 });
    contact(ctx, x, y + 1, 7, 2.4, 0.3);
    ctx.save(); ctx.beginPath(); L.rrect(ctx, x - 1.8, y - 32, 3.6, 32, 1.8); ctx.fillStyle = '#FFF4EA'; ctx.fill(); ctx.clip();
    ctx.fillStyle = '#B994FF'; for (let k = -36; k < 4; k += 6) { ctx.beginPath(); ctx.moveTo(x - 3, y + k); ctx.lineTo(x + 3, y + k - 3); ctx.lineTo(x + 3, y + k - 1); ctx.lineTo(x - 3, y + k + 2); ctx.fill(); } ctx.restore();
    L.rrect(ctx, x - 4.5, y - 42, 9, 10, 3); const g = ctx.createLinearGradient(0, y - 42, 0, y - 32); g.addColorStop(0, '#FFF6C8'); g.addColorStop(1, '#FFC66A'); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#8A6AC8'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6, y - 41); ctx.quadraticCurveTo(x, y - 48, x + 6, y - 41); ctx.closePath(); jfill(ctx, '#B994FF', x - 1, y - 44, 5, 0.8);
  }
  function bench(ctx, x, y, m) {
    ctx.save(); ctx.translate(x, y); ctx.scale(m, 1);
    contact(ctx, 0, 2, 20, 4, 0.28);
    ctx.fillStyle = '#C98A52'; ctx.fillRect(-14, -6, 2.4, 7); ctx.fillRect(11.6, -6, 2.4, 7);
    L.rrect(ctx, -16, -9, 32, 4, 1.6); ctx.fillStyle = '#E6AC78'; ctx.fill();
    L.rrect(ctx, -16, -17, 32, 4, 1.6); ctx.fillStyle = '#F2C68E'; ctx.fill();
    ctx.fillStyle = '#C98A52'; ctx.fillRect(-13, -14, 2, 6); ctx.fillRect(11, -14, 2, 6);
    ctx.restore();
  }
  function welcomePuffs(ctx, x, y, c, R) {
    // little marshmallow toadstools where the snow gives way to cloud
    for (const [dx, dy, s] of [[0, 0, 1], [16, 8, 0.75], [-14, 10, 0.8], [6, 16, 0.6]]) {
      const px = x + dx, py = y + dy;
      contact(ctx, px + 1, py + 1, 8 * s, 2.5 * s, 0.26);
      ctx.fillStyle = '#F7EAF5'; L.rrect(ctx, px - 2.6 * s, py - 9 * s, 5.2 * s, 9 * s, 2 * s); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px, py - 9 * s, 9 * s, 6 * s, 0, Math.PI, TAU); ctx.quadraticCurveTo(px, py - 6 * s, px - 9 * s, py - 9 * s); jfill(ctx, ['#FFB3D1', '#B994FF', '#7FE0C8', '#FFD27A'][Math.floor(R() * 4)], px - 3 * s, py - 13 * s, 9 * s, 0.8);
      ell(ctx, px - 3 * s, py - 12 * s, 1.4 * s, 1 * s, 'rgba(255,255,255,.9)'); ell(ctx, px + 3 * s, py - 11 * s, 1 * s, 0.8 * s, 'rgba(255,255,255,.9)');
    }
  }

  /* ---------- props ---------- */
  function props(B, add, ctx) {
    const g = geom(B), R = B.rng(77), C = y => cols(g.u(y));
    add(g.port.y, () => balloonPort(ctx, g.port.x, g.port.y, g.port.m));
    add(g.kite.y, () => kiteKnoll(ctx, g.kite.x, g.kite.y, C(g.kite.y), R));
    add(g.pool.y, () => pool(ctx, g.pool.x, g.pool.y, g.pool.m, R));
    add(g.cottage.y, () => cottage(ctx, g.cottage.x, g.cottage.y, g.cottage.m));
    add(g.garden.y, () => flowerBed(ctx, g.garden.x, g.garden.y, R));
    add(g.tower.y, () => tower(ctx, g.tower.x, g.tower.y, g.tower.m));
    // the pasture: a fence along the back, sheep grazing, a knoll the cloud critter herds from
    const p = g.pasture, s = p.m;
    add(p.y - 34, () => fence(ctx, p.x - s * 70, p.y - 30, p.x + s * 40, p.y - 40));
    add(p.y - 6, () => knoll(ctx, p.x + s * 34, p.y - 6, 26, 15, C(p.y)));
    for (const [dx, dy, sc] of [[-50, -10, 0.95], [-10, -18, 0.85], [-34, 18, 1.05], [10, 22, 0.9], [56, 26, 0.8]]) add(p.y + dy, () => sheep(ctx, p.x + s * dx, p.y + dy, sc, (dx * s) > 0 !== (dy > 0), R));
    add(g.lamps.y, () => { lamp(ctx, g.lamps.x - g.lamps.m * 22, g.lamps.y + 6); lamp(ctx, g.lamps.x + g.lamps.m * 34, g.lamps.y - 4); });
    add(g.lamps.y + 2, () => bench(ctx, g.lamps.x + g.lamps.m * 6, g.lamps.y + 4, g.lamps.m));
    add(g.welcome.y, () => welcomePuffs(ctx, g.welcome.x, g.welcome.y, C(g.welcome.y), R));
    // small knolls scattered on the far sides
    for (const [j, dx, dy, w, h] of [[2, -150, 20, 30, 16], [6, 150, 30, 30, 16], [6, -160, 10, 26, 14], [9, -150, 40, 28, 15], [3, -150, -20, 24, 13]]) {
      const q = B.A(j, dx, dy); if (surface(g, q.x, q.y) < 0 || surface(g, q.x, q.y - h) < 0) continue;
      add(q.y, () => knoll(ctx, q.x, q.y, w, h, C(q.y)));
    }
  }

  /* ---------- foreground: big soft cloud puffs at the screen edges ---------- */
  function fg(B, put) {
    const n = j => B.node(j).y;
    const puff = (o, x, y, R, side) => {
      const dir = side < 0 ? 1 : -1, s = 19 + R() * 8;
      const lobes = [[0, 0, s], [dir * s * 0.8, s * 0.3, s * 0.62], [dir * s * 0.2, -s * 0.6, s * 0.7], [-dir * s * 0.2, s * 0.6, s * 0.75], [dir * s * 1.3, s * 0.75, s * 0.42]];
      o.save();
      for (const [dx, dy, r] of lobes) {
        o.beginPath(); o.arc(x + dx, y + dy, r, 0, TAU);
        const g = o.createRadialGradient(x + dx - r * 0.35, y + dy - r * 0.5, r * 0.1, x + dx, y + dy, r * 1.05);
        g.addColorStop(0, 'rgba(255,255,255,.97)'); g.addColorStop(0.6, 'rgba(255,244,250,.95)'); g.addColorStop(1, 'rgba(206,186,240,.92)'); o.fillStyle = g; o.fill();
      }
      for (const [dx, dy, r] of lobes) { o.strokeStyle = 'rgba(255,255,255,.95)'; o.lineWidth = 2; o.beginPath(); o.arc(x + dx, y + dy, r - 2.5, Math.PI * 1.08, Math.PI * 1.58); o.stroke(); }
      o.restore();
    };
    for (const [side, y] of [[1, n(0) + 30], [-1, n(3) + 70], [1, n(4) + 70], [-1, n(6) + 60], [1, n(7) + 50], [-1, n(9) + 80]]) put({ side, y, draw: puff });
  }

  /* ---------- manifest ---------- */
  function manifest(B, put) {
    const g = geom(B);
    // balloons tethered at the port, bobbing; one far balloon rising over the sky pocket
    const port = g.port, s = port.m;
    put.live('balloon', { x: port.x - s * 30, y: port.y - 44, anchor: { x: port.x - s * 30, y: port.y - 22 }, c1: '#FF7FB0', c2: '#FFF4EA', sz: 1.0, ph: 0, rise: 6 });
    put.live('balloon', { x: port.x + s * 26, y: port.y - 34, anchor: { x: port.x + s * 26, y: port.y - 12 }, c1: '#7FE0C8', c2: '#FFE08A', sz: 0.9, ph: 2.1, rise: 5 });
    { const q = B.A(2, -150, -50); put.live('balloon', { x: q.x, y: q.y, c1: '#B994FF', c2: '#FFF4EA', sz: 0.62, ph: 4, rise: 14 }); }
    // the bunny's kite, high up toward the trail-free sky
    put.live('kite', { x: g.kite.x + g.kite.m * 6, y: g.kite.y - 46, L: 92, a: -Math.PI / 2 + g.kite.m * 0.45, c1: '#FF7FB0', c2: '#FFD43A', ph: 0 });
    // the weather vane and chimes on the tower
    put.live('vane', { x: g.tower.x, y: g.tower.y - 121, chime: { x: g.tower.x + g.tower.m * 26, y: g.tower.y - 70 } });
    put.live('smoke', { x: g.cottage.x + g.cottage.m * 18, y: g.cottage.y - 92 });
    put.live('ripple', { x: g.pool.x + g.pool.m * 18, y: g.pool.y - 2 });
    put.live('ripple', { x: g.pool.x - g.pool.m * 14, y: g.pool.y + 9 });
    // birds over the sky pockets
    for (let k = 0; k < g.plates.length - 1; k++) {
      const P = g.plates[k], nxt = g.plates[k + 1];
      if (nxt.rainbow) continue;
      let best = null;
      for (let x = 70; x <= 450; x += 6) { const h = nxt.crest(x) - (P.front(x) + P.wallH(x)); if (h > 40 && (!best || h > best.h)) best = { x, h, y: (nxt.crest(x) + P.front(x) + P.wallH(x)) / 2 }; }
      if (best && k % 2 === 0) put.live('birds', { x: best.x, y: best.y, n: 3, rx: 16, ry: 4, ph: k });
    }
    { const b = g.bridge; put.live('birds', { x: b.x + 70, y: b.y + 4, n: 2, rx: 20, ry: 3, ph: 1.5 }); }
    put.bridge({ x: g.bridge.x, y: g.bridge.y, angle: +g.bridge.ang.toFixed(3), style: 'rainbow' });
    // night glows
    put.glow({ x: g.cottage.x + g.cottage.m * 14, y: g.cottage.y - 24, r: 20, c: '#FFC66A' });
    put.glow({ x: g.tower.x, y: g.tower.y - 82, r: 18, c: '#FFE08A' });
    put.glow({ x: g.lamps.x - g.lamps.m * 22, y: g.lamps.y - 31, r: 22, c: '#FFD27A' });
    put.glow({ x: g.lamps.x + g.lamps.m * 34, y: g.lamps.y - 41, r: 22, c: '#FFD27A' });
    put.glow({ x: g.port.x - g.port.m * 52, y: g.port.y - 8, r: 14, c: '#BFF3FF' });
    put.glow({ x: g.pool.x, y: g.pool.y, r: 40, c: '#7FE0F0' });
    // critters: the bunny flies the kite, the peach sunbathes by the pool, the bee works the
    // cottage flowers, the sprite rings the chimes, the cloud herds the sheep from its knoll
    put.critter({ kind: 'bunny', x: g.kite.x, y: g.kite.y - 22, size: 40 });
    put.critter({ kind: 'peach', x: g.pool.x - g.pool.m * 30, y: g.pool.y + 41, size: 34 });
    put.critter({ kind: 'bee', x: g.garden.x, y: g.garden.y - 30, size: 28, path: 'loop', rx: 34, ry: 12 });
    put.critter({ kind: 'sprite', x: g.tower.x + g.tower.m * 42, y: g.tower.y - 60, size: 32, float: true });
    put.critter({ kind: 'cloud', x: g.pasture.x + g.pasture.m * 34, y: g.pasture.y - 18, size: 38 });
    put.chest(B.i0 + 2, { x: g.chest32.x, y: g.chest32.y });
    put.chest(B.i0 + 6, { x: g.chest36.x, y: g.chest36.y });
    put.sign({ role: 'region', level: B.i0 + 3, x: g.sign.x, y: g.sign.y });
    put.sign({ role: 'rest', level: B.i0 + 5, x: g.restSign.x, y: g.restSign.y });
    put.gate({ x: g.gate.x, y: g.gate.y + 6, angle: +Math.atan2(g.gate.ty, g.gate.tx).toFixed(3), to: B.k + 1 });
  }

  /* ---------- chapter live kinds (ported to PeckLiveLayer.swift by hand) ---------- */
  /* balloon: a hot-air balloon bobbing up and down; tethered by a sagging rope when e.anchor is set.
     e: dx, yb = basket bottom at rest; anchor [dx, yb]?; c1, c2 = gore colours; sz scale; ph; rise = bob height */
  W.LIVE.balloon = (ctx, e, t) => {
    const s = e.sz || 1, ph = e.ph || 0;
    const x = W.CX + e.dx + Math.sin(t * 0.27 + ph) * 2.5, y = W.H - e.yb - (e.rise || 6) * (0.5 + 0.5 * Math.sin(t * 0.4 + ph));
    if (e.anchor) {
      const ax = W.CX + e.anchor[0], ay = W.H - e.anchor[1];
      ctx.strokeStyle = 'rgba(150,100,70,.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + ax) / 2 + 3, (y + ay) / 2 + 4, ax, ay); ctx.stroke();
      const lift = (y - ay); ell(ctx, ax + 10 * s, ay + 4, 12 * s, 3.2 * s, `rgba(110,80,160,${0.1 + 0.05 * Math.max(0, Math.min(1, -lift / 40))})`);
    }
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    // basket + ropes
    L.rrect(ctx, -5, -8, 10, 8, 2); ctx.fillStyle = '#D99A66'; ctx.fill();
    ctx.fillStyle = '#B9784A'; ctx.fillRect(-5, -5, 10, 1.2);
    ctx.strokeStyle = 'rgba(120,80,50,.8)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-4.5, -8); ctx.lineTo(-7, -17); ctx.moveTo(4.5, -8); ctx.lineTo(7, -17); ctx.stroke();
    // envelope: a teardrop with alternating gores
    const env = () => { ctx.beginPath(); ctx.moveTo(-7, -17); ctx.bezierCurveTo(-24, -26, -22, -58, 0, -58); ctx.bezierCurveTo(22, -58, 24, -26, 7, -17); ctx.closePath(); };
    env(); ctx.fillStyle = e.c2; ctx.fill();
    ctx.save(); env(); ctx.clip(); ctx.fillStyle = e.c1;
    for (const w of [-14, 0, 14]) { ctx.beginPath(); ctx.ellipse(w * 0.9, -37, 4.2, 22, 0, 0, TAU); ctx.fill(); }
    const sh = ctx.createLinearGradient(-20, 0, 22, 0); sh.addColorStop(0, 'rgba(255,255,255,.25)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(70,40,110,.25)');
    ctx.fillStyle = sh; ctx.fillRect(-24, -60, 48, 44);
    ctx.restore();
    env(); ctx.strokeStyle = 'rgba(90,60,120,.35)'; ctx.lineWidth = 0.9; ctx.stroke();
    L.rrect(ctx, -7.5, -19, 15, 3, 1.4); ctx.fillStyle = '#FFD43A'; ctx.fill();
    hl(ctx, -9, -47, 3.4, 6, 0.35, 0.6);
    ctx.restore();
  };
  /* kite: a diamond kite on a sagging string from the flyer's paws, swaying slowly, tail waving.
     e: dx, yb = the hand; L = string length; a = base angle (rad); c1, c2; ph */
  W.LIVE.kite = (ctx, e, t) => {
    const hx = W.CX + e.dx, hy = W.H - e.yb, ph = e.ph || 0;
    const a = e.a + Math.sin(t * 0.5 + ph) * 0.12, kx = hx + Math.cos(a) * e.L, ky = hy + Math.sin(a) * e.L + Math.sin(t * 1.1 + ph) * 2;
    ctx.fillStyle = 'rgba(110,80,160,.12)'; ctx.beginPath(); ctx.ellipse(kx + 16, ky + 70, 7, 3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + kx) / 2 + 10, (hy + ky) / 2 + 16, kx, ky + 7); ctx.stroke();
    // tail
    ctx.strokeStyle = 'rgba(120,90,160,.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(kx, ky + 9);
    const tail = []; for (let k = 1; k <= 5; k++) { const tx = kx + Math.sin(t * 2 + k * 0.8 + ph) * 3 * k * 0.5 + k * 1.5, ty = ky + 9 + k * 6; tail.push([tx, ty]); ctx.lineTo(tx, ty); }
    ctx.stroke();
    tail.forEach(([tx, ty], k) => { ctx.fillStyle = k % 2 ? e.c2 : e.c1; ctx.beginPath(); ctx.moveTo(tx - 2.6, ty - 1.4); ctx.lineTo(tx + 2.6, ty + 1.4); ctx.lineTo(tx + 2.6, ty - 1.4); ctx.lineTo(tx - 2.6, ty + 1.4); ctx.closePath(); ctx.fill(); });
    // body
    ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.sin(t * 0.8 + ph) * 0.15);
    const quad = (p) => { ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(p * 8, -1); ctx.lineTo(0, 9); ctx.closePath(); };
    quad(-1); ctx.fillStyle = e.c1; ctx.fill(); quad(1); ctx.fillStyle = e.c2; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, -1); ctx.lineTo(0, 9); ctx.lineTo(-8, -1); ctx.closePath(); ctx.strokeStyle = 'rgba(120,60,90,.45)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 9); ctx.moveTo(-8, -1); ctx.lineTo(8, -1); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.stroke();
    ctx.restore();
  };
  /* vane: the weather vane turning slowly about its post (foreshortened arrow) and wind chimes
     swinging on the tower's arm. e: dx, yb = vane pivot; chime [dx, yb] = the arm's tip */
  W.LIVE.vane = (ctx, e, t) => {
    const x = W.CX + e.dx, y = W.H - e.yb, a = t * 0.12 + Math.sin(t * 0.37) * 0.8, c = Math.cos(a), sn = Math.sin(a);
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';
    ctx.strokeStyle = '#8A6AC8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-12 * c, -3 * sn); ctx.lineTo(12 * c, 3 * sn); ctx.stroke();
    ctx.fillStyle = '#FFD43A'; ctx.beginPath(); ctx.moveTo(15 * c, 3.8 * sn); ctx.lineTo(9 * c, 2.2 * sn - 3); ctx.lineTo(9 * c, 2.2 * sn + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FF7FB0'; ctx.beginPath(); ctx.moveTo(-9 * c, -2.2 * sn); ctx.lineTo(-14 * c, -3.5 * sn - 4); ctx.lineTo(-14 * c, -3.5 * sn + 3); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (e.chime) {
      const cx = W.CX + e.chime[0], cy = W.H - e.chime[1];
      ctx.strokeStyle = 'rgba(150,110,80,.8)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.ellipse(cx, cy + 3, 6, 1.6, 0, 0, TAU); ctx.fillStyle = '#B994FF'; ctx.fill();
      ['#BFF3E3', '#FFD6E8', '#FFF4B0', '#CFC2FF'].forEach((col, k) => {
        const px = cx - 4.5 + k * 3, an = Math.sin(t * 1.3 + k * 0.9) * 0.12, h = 9 + (k % 2) * 3;
        const ex = px + Math.sin(an) * h, ey = cy + 4 + Math.cos(an) * h;
        ctx.strokeStyle = 'rgba(150,110,80,.7)'; ctx.beginPath(); ctx.moveTo(px, cy + 4); ctx.lineTo(px + Math.sin(an) * 3, cy + 7); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(px + Math.sin(an) * 3, cy + 7); ctx.lineTo(ex, ey); ctx.stroke(); ctx.lineWidth = 0.6;
      });
    }
  };
  /* birds: a few small birds gliding round a slow loop, wings flapping gently.
     e: dx, yb = loop centre; n; rx, ry; ph */
  W.LIVE.birds = (ctx, e, t) => {
    const x0 = W.CX + e.dx, y0 = W.H - e.yb, ph = e.ph || 0;
    ctx.strokeStyle = 'rgba(100,84,150,.7)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    for (let k = 0; k < (e.n || 3); k++) {
      const a = t * 0.18 + ph + k * 0.9, x = x0 + Math.cos(a) * e.rx + k * 5, y = y0 + Math.sin(a) * e.ry - k * 3, w = 3.2 - k * 0.4, f = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + k * 1.7));
      ctx.beginPath(); ctx.moveTo(x - w, y - w * f); ctx.quadraticCurveTo(x - w * 0.4, y - w * 0.6 * f, x, y); ctx.quadraticCurveTo(x + w * 0.4, y - w * 0.6 * f, x + w, y - w * f); ctx.stroke();
    }
  };

  /* ---------- the rainbow bridge (native; the app draws it on the road like drawBridge) ---------- */
  W.BRIDGES = Object.assign(W.BRIDGES || {}, {
    rainbow(ctx, x, y, ang) {
      const half = 40, w = 13, bands = ['#FF7FB0', '#FFB36B', '#FFE08A', '#8EE6A6', '#7FD2EF', '#B994FF'];
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      // its shadow falls far below, onto the next cloud: soft and offset
      ctx.fillStyle = 'rgba(110,80,160,.14)'; L.rrect(ctx, -half + 10, -w + 16, half * 2 - 6, w * 2, w); ctx.fill();
      // the deck: six bands running along the road, a slight arch shading at the ends
      const bw = (w * 2) / bands.length;
      bands.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(-half, -w + k * bw, half * 2, bw + 0.3); });
      ctx.save(); L.rrect(ctx, -half, -w, half * 2, w * 2, 3); ctx.clip();
      const sh = ctx.createLinearGradient(-half, 0, half, 0); sh.addColorStop(0, 'rgba(90,60,140,.18)'); sh.addColorStop(0.25, 'rgba(255,255,255,.12)'); sh.addColorStop(0.75, 'rgba(255,255,255,.12)'); sh.addColorStop(1, 'rgba(90,60,140,.18)');
      ctx.fillStyle = sh; ctx.fillRect(-half, -w, half * 2, w * 2);
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(-half, -w + 1, half * 2, 1.4);
      ctx.restore();
      // white rails with pastel knobs
      for (const sd of [-1, 1]) {
        ctx.fillStyle = 'rgba(90,60,140,.2)'; L.rrect(ctx, -half + 1, sd * (w + 2) - 1.6 + 2.5, half * 2, 3.2, 1.6); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; L.rrect(ctx, -half, sd * (w + 2) - 1.6, half * 2, 3.2, 1.6); ctx.fill();
        for (const k of [-half, -half / 2, 0, half / 2, half]) { ctx.beginPath(); ctx.arc(k, sd * (w + 2), 2.6, 0, TAU); jfill(ctx, '#FFE6F2', k, sd * (w + 2), 2.6, 0.7); }
      }
      // cloud puffs tucked under each end, where it lands on the plateaus
      for (const e of [-1, 1]) for (const [dx, dy, r] of [[0, -12, 7], [2, 0, 8.5], [0, 12, 7], [-5, -5, 5], [-5, 6, 5]]) {
        const px = e * (half + 2 - dx), py = dy;
        ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fillStyle = jgrad(ctx, '#FFFFFF', px - r * 0.3, py - r * 0.4, r); ctx.fill();
      }
      ctx.restore();
    },
  });

  W.chapter({
    id: 'clouds', name: 'MARSHMALLOW CLOUDS', title: 'Marshmallow Clouds', road: 'ribbon',
    roadStyle: { edge: '#F2C9DE', base: '#FFFFFF', dash: '#7FE0C8', grass: 'rgba(160,110,170,.16)' },
    node: ['#E6FFF6', '#7FE0C8', '#3BAE93'], gateBanner: ['TO STARLIGHT GARDEN', '#5B4BB8', '#3A2E80'],
    sign: { board: '#3BAE93', plate: '#F2FFFB', ink: '#1F7A64' },
    edgeColor: '#FFF0F6', finaleSky: ['#FFD6E8', '#FFE9F2', '#FFF6FA'], night: false,
    geom, ground, props, fg, manifest, topEdge: B => geom(B).topEdge,
  });
})();
