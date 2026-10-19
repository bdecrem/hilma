/* Live layer and native stand-ins, for the preview page only. Each manifest `live` kind is drawn
   here exactly as PeckLiveLayer.swift draws it (the Swift side is a port of these functions), plus
   simple stand-ins for what the app draws natively: road, stepping stones, gate, bridge, signs,
   chests, nodes and the critter sprites. Coordinates are the manifest's (dx, yb); the preview maps
   them back with X(dx) = CX + dx, Y(yb) = H - yb. */
(function () {
  'use strict';
  const L = window.L, K = window.K, W = window.WORLD, TAU = Math.PI * 2;
  const { ell, hl, jfill, jgrad } = K;
  const X = dx => W.CX + dx, Y = yb => W.H - yb;
  const P2 = a => ({ x: X(a[0]), y: Y(a[1]) });

  const LIVE = {};
  LIVE.river = (ctx, e, t) => {
    const pts = e.pts.map(P2);
    ctx.save(); ctx.lineCap = 'round'; L.pathPoly(ctx, pts);
    ctx.setLineDash([7, 23]); ctx.lineDashOffset = -t * 18; ctx.strokeStyle = 'rgba(235,252,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.setLineDash([3, 41]); ctx.lineDashOffset = -t * 18 + 13; ctx.translate(3, 3); ctx.strokeStyle = 'rgba(235,252,255,.5)'; ctx.lineWidth = 1.6; L.pathPoly(ctx, pts); ctx.stroke();
    ctx.restore();
  };
  LIVE.foam = (ctx, e, t) => {
    const k = 0.5 + 0.5 * Math.sin(t * 0.9);
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + k * 0.35})`; ctx.lineWidth = 1.4; ctx.beginPath();
    for (const a of e.pts) { const p = P2(a); ctx.lineTo(p.x, p.y - 4 - k * 4 + Math.sin(p.x / 20 + t) * 1.2); }
    ctx.stroke();
  };
  LIVE.campfire = (ctx, e, t) => {
    const x = X(e.dx), y = Y(e.yb), f = Math.sin(t * 11) * 0.5 + Math.sin(t * 7.3) * 0.5;
    const g = ctx.createRadialGradient(x, y - 4, 1, x, y - 4, 26); g.addColorStop(0, `rgba(255,200,90,${0.35 + f * 0.06})`); g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 4, 26, 0, TAU); ctx.fill();
    for (const [s, c, ph] of [[1, '#FF6A3D', 0], [0.72, '#FFB23A', 1.3], [0.42, '#FFF0A0', 2.1]]) {
      const h = (15 + Math.sin(t * 9 + ph) * 2.5) * s, w = 6.5 * s, sw = Math.sin(t * 6 + ph) * 1.6;
      ctx.beginPath(); ctx.moveTo(x - w, y - 1); ctx.quadraticCurveTo(x - w - 1, y - h * 0.5, x + sw, y - h); ctx.quadraticCurveTo(x + w + 1, y - h * 0.5, x + w, y - 1); ctx.closePath(); ctx.fillStyle = c; ctx.fill();
    }
    for (let k = 0; k < 3; k++) { const p = (t * 0.7 + k / 3) % 1; ell(ctx, x + Math.sin(p * 9 + k) * 5, y - 16 - p * 26, 1, 1, `rgba(255,190,80,${1 - p})`); }
  };
  LIVE.smoke = (ctx, e, t) => {
    const x0 = X(e.dx), y0 = Y(e.yb);
    for (let k = 0; k < 4; k++) {
      const p = (t * 0.22 + k / 4) % 1, x = x0 + Math.sin(p * 5 + k) * 4 + p * 16, y = y0 - p * 60, r = 3.5 + p * 7;
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - p)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  };
  LIVE.zz = (ctx, e, t) => {
    const x = X(e.dx), y = Y(e.yb), p = (t * 0.4) % 1;
    ctx.font = `600 ${6 + p * 3}px Fredoka, ui-rounded, sans-serif`; ctx.fillStyle = `rgba(255,255,255,${(1 - p) * 0.95})`; ctx.textAlign = 'center';
    ctx.fillText('z', x + p * 6, y - p * 14); ctx.font = '600 5px Fredoka, ui-rounded, sans-serif'; ctx.fillStyle = `rgba(255,255,255,${0.8 * Math.abs(Math.sin(t))})`; ctx.fillText('z', x + 6, y + 2);
  };
  LIVE.windmill = (ctx, e, t, spin = 0) => {
    const hx = X(e.dx), hy = Y(e.yb), a0 = t * 0.6 + spin;
    ctx.save(); ctx.translate(hx, hy);
    for (let k = 0; k < 4; k++) {
      ctx.save(); ctx.rotate(a0 + k * Math.PI / 2);
      ctx.fillStyle = 'rgba(40,30,60,.12)'; L.rrect(ctx, 3, -4 + 3, 42, 13, 3); ctx.fill();
      ctx.fillStyle = '#C98A52'; L.rrect(ctx, 0, -1.6, 44, 3.2, 1.6); ctx.fill();
      L.rrect(ctx, 9, -2, 35, 12, 3); ctx.fillStyle = k % 2 ? '#FFF4EA' : '#FFD6E6'; ctx.fill();
      ctx.strokeStyle = 'rgba(200,110,140,.55)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let q = 16; q < 44; q += 7) { ctx.moveTo(q, -2); ctx.lineTo(q, 10); } ctx.moveTo(9, 4); ctx.lineTo(44, 4); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); jfill(ctx, '#FFD43A', 0, 0, 5, 1); hl(ctx, -1.6, -1.6, 1.6, 0.9);
    ctx.restore();
  };
  LIVE.beam = (ctx, e, t) => {
    const lx = X(e.dx), ly = Y(e.yb), a = e.a + Math.sin(t * 0.35) * 0.9, Ln = e.L || 170;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, Ln); g.addColorStop(0, 'rgba(255,245,190,.35)'); g.addColorStop(1, 'rgba(255,245,190,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.arc(lx, ly, Ln, a - 0.13, a + 0.13); ctx.closePath(); ctx.fill();
    ctx.restore();
    ell(ctx, lx, ly, 4 + Math.sin(t * 2) * 0.6, 4 + Math.sin(t * 2) * 0.6, 'rgba(255,250,200,.9)');
  };
  LIVE.bobber = (ctx, e, t) => {
    const tip = P2(e.tip), bx = X(e.dx), by = Y(e.yb) + Math.sin(t * 2.2) * 1.2 + (Math.sin(t * 0.7) > 0.93 ? 2 : 0);
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.quadraticCurveTo(bx - 4, (tip.y + by) / 2 + 6, bx, by - 2); ctx.stroke();
    const r = (t * 0.6) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - r)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(bx, by + 1, 3 + r * 8, 1.4 + r * 3, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx, by - 1, 2.4, Math.PI, 0); ctx.fillStyle = '#FF4F86'; ctx.fill(); ctx.beginPath(); ctx.arc(bx, by - 1, 2.4, 0, Math.PI); ctx.fillStyle = '#fff'; ctx.fill();
  };
  LIVE.buoy = (ctx, e, t) => {
    const bx = X(e.dx), by = Y(e.yb), ph = e.ph || 0, c = e.c;
    const yy = by + Math.sin(t * 1.6 + ph) * 1.4, rot = Math.sin(t * 1.3 + ph) * 0.12;
    ell(ctx, bx + 3, by + 4, 9, 3.4, 'rgba(20,80,130,.25)');
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(bx, by + 2, 9, 3.4, 0, 0, TAU); ctx.stroke();
    ctx.save(); ctx.translate(bx, yy); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(-6, 1); ctx.quadraticCurveTo(-6, -12, 0, -13); ctx.quadraticCurveTo(6, -12, 6, 1); ctx.quadraticCurveTo(0, 4, -6, 1); jfill(ctx, c, -2, -8, 8, 0.9);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(-5.6, -6, 11.2, 2.6);
    hl(ctx, -2.6, -9.5, 1.6, 0.8);
    ctx.restore();
  };
  LIVE.spout = (ctx, e, t) => {
    const cyc = ((t + (e.ph || 0)) % 6) / 6, sx = X(e.dx), sy = Y(e.yb);
    if (cyc < 0.45) {
      const p = cyc / 0.45, h = Math.sin(p * Math.PI) * 26 * (e.s || 1);
      ctx.fillStyle = 'rgba(225,248,255,.9)';
      ctx.beginPath(); ctx.moveTo(sx - 2, sy); ctx.quadraticCurveTo(sx - 1, sy - h * 0.6, sx, sy - h); ctx.quadraticCurveTo(sx + 1, sy - h * 0.6, sx + 2, sy); ctx.fill();
      for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.42, r = h * 0.35 * Math.min(1, p * 2); ell(ctx, sx + Math.cos(a) * r, sy - h + Math.sin(a) * r * 0.6 + r * 0.6, 2.2, 2.2, `rgba(225,248,255,${0.85 * (1 - p * 0.6)})`); }
    }
  };
  LIVE.jelly = (ctx, e, t) => {
    const ph = e.ph || 0, c = e.c, pu = Math.sin(t * 1.8 + ph), x = X(e.dx) + Math.sin(t * 0.3 + ph) * 4, y = Y(e.yb) + pu * 2.5;
    ell(ctx, x + 3, y + 10, 8, 2.4, 'rgba(10,60,110,.25)');
    ctx.strokeStyle = L.rgba(c, 0.8); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x + k * 2.4, y); ctx.quadraticCurveTo(x + k * 2.6 + Math.sin(t * 2.4 + k + ph) * 2.2, y + 6, x + k * 2.2, y + 11 + pu); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(x, y, 8 - pu * 0.8, 6 + pu * 0.6, 0, Math.PI, TAU); ctx.quadraticCurveTo(x, y + 2.4, x - 8 + pu * 0.8, y); ctx.fillStyle = jgrad(ctx, c, x - 2, y - 3, 8); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    hl(ctx, x - 3, y - 3.4, 2.4, 1.1, -0.4, 0.85);
    ell(ctx, x - 2.4, y - 1, 0.9, 0.9, '#2A1F2B'); ell(ctx, x + 2.4, y - 1, 0.9, 0.9, '#2A1F2B');
  };
  LIVE.boat = (ctx, e, t) => {
    const x = X(e.dx) + Math.sin(t * 0.25 + (e.ph || 0)) * (e.drift ?? 6), y = Y(e.yb);
    const bob = Math.sin(t * 1.3) * 1.6, rot = Math.sin(t * 1.1) * 0.05;
    ell(ctx, x + 5, y + 6, 26, 6, 'rgba(20,80,130,.3)');
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y + 3, 27, 6, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 34, y + 4); ctx.quadraticCurveTo(x - 42, y + 2, x - 50, y + 5); ctx.stroke();
    ctx.save(); ctx.translate(x, y + bob); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(-24, -6); ctx.lineTo(24, -6); ctx.quadraticCurveTo(22, 5, 10, 6); ctx.lineTo(-12, 6); ctx.quadraticCurveTo(-22, 5, -24, -6); ctx.closePath(); jfill(ctx, e.hull || '#FF7FB0', -8, -4, 22, 1.2);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(-21, -4, 42, 2);
    ctx.fillStyle = '#C98A52'; ctx.fillRect(-1.2, -50, 2.4, 45);
    ctx.beginPath(); ctx.moveTo(2, -48); ctx.quadraticCurveTo(20, -30, 22, -9); ctx.lineTo(2, -9); ctx.closePath();
    const sg = ctx.createLinearGradient(2, -48, 22, -9); sg.addColorStop(0, '#FFFFFF'); sg.addColorStop(1, '#F1E3F0'); ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = 'rgba(160,110,150,.4)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#5EC6EC'; ctx.beginPath(); ctx.moveTo(2, -30); ctx.quadraticCurveTo(13, -26, 17, -18); ctx.lineTo(2, -18); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, -44); ctx.quadraticCurveTo(-14, -26, -16, -10); ctx.lineTo(-2, -10); ctx.closePath(); ctx.fillStyle = '#FFF6E6'; ctx.fill();
    const fw = Math.sin(t * 4) * 1.5; ctx.fillStyle = '#FFD43A'; ctx.beginPath(); ctx.moveTo(1, -50); ctx.lineTo(10, -48 + fw); ctx.lineTo(1, -45); ctx.fill();
    hl(ctx, -14, -2, 4, 1.2, 0, 0.7);
    ctx.restore();
  };
  LIVE.drops = (ctx, e, t) => {
    const x = X(e.dx), y = Y(e.yb), d = e.dir || -1;
    for (let k = 0; k < 4; k++) { const p = (t * 1.2 + k / 4) % 1; ell(ctx, x + d * p * 4, y + p * 12, 1, 1.5, `rgba(120,210,245,${1 - p})`); }
  };
  LIVE.butterfly = (ctx, e, t) => {
    const ph = e.ph || 0, a = t * 0.5 + ph, x = X(e.dx) + Math.sin(a) * 26 + Math.sin(a * 2.3) * 8, y = Y(e.yb) + Math.sin(a * 1.7) * 10, fl = Math.abs(Math.sin(t * 12 + ph));
    ell(ctx, x + 6, y + 18, 3, 1, 'rgba(40,25,70,.12)');
    ctx.fillStyle = e.c; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sd * 2.6 * fl, y - 1, 2.8 * fl + 0.4, 3.4, sd * 0.4, 0, TAU); ctx.fill(); }
    ell(ctx, x, y, 0.8, 2.4, '#4A2E4A');
  };
  LIVE.ripple = (ctx, e, t) => {
    const p = (t * 0.5) % 1, x = X(e.dx), y = Y(e.yb);
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - p)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + p * 6, y, 3 + p * 4, 1.5 + p * 1.5, 0, 0, TAU); ctx.stroke();
  };
  W.LIVE = LIVE;
  /* chapters can add their own kinds: W.LIVE.kind = (ctx, e, t) => … (and the Swift port) */
})();

/* Native stand-ins: the gate, the bridge and the stepping stones, as the app draws them. */
(function () {
  'use strict';
  const L = window.L, K = window.K, W = window.WORLD, TAU = Math.PI * 2;
  const { hl, jfill, contact, cast, rect } = K;
  /* candy-cane gate across the road at a chapter boundary (concept `gate`) */
  W.drawGate = function (ctx, gx, gy, text, board, ink) {
    const half = 25, ph = 46;
    const posts = [[gx - half, gy], [gx + half, gy + 4]];
    for (const [px, py] of posts) cast(ctx, px, py, rect(-3.5, -ph, 7, ph, 3), { a: 0.16 });
    const [a, b] = posts, mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - ph - 16;
    ctx.strokeStyle = 'rgba(48,30,80,.12)'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0] + 14, a[1] + 4); ctx.quadraticCurveTo(mx + 24, a[1] + 12, b[0] + 16, b[1] + 6); ctx.stroke();
    for (const [px, py] of posts) {
      contact(ctx, px, py + 1, 8, 3, 0.35);
      ctx.save(); ctx.beginPath(); L.rrect(ctx, px - 3.8, py - ph, 7.6, ph, 3.8); ctx.fillStyle = '#FFF4EA'; ctx.fill(); ctx.clip();
      ctx.fillStyle = '#FF4F86'; for (let k = -ph - 4; k < 4; k += 8) { ctx.beginPath(); ctx.moveTo(px - 4, py + k); ctx.lineTo(px + 4, py + k - 5); ctx.lineTo(px + 4, py + k - 1.5); ctx.lineTo(px - 4, py + k + 3.5); ctx.fill(); }
      ctx.fillStyle = 'rgba(80,20,50,.15)'; ctx.fillRect(px + 1, py - ph, 3, ph); ctx.restore();
    }
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(a[0], a[1] - ph + 2); ctx.quadraticCurveTo(mx, my - 8, b[0], b[1] - ph + 2); ctx.stroke();
    ctx.strokeStyle = '#FF4F86'; ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(a[0] - 1, a[1] - ph); ctx.quadraticCurveTo(mx, my - 11, b[0] - 1, b[1] - ph); ctx.stroke();
    ctx.restore();
    for (const [px, py] of posts) { ctx.beginPath(); ctx.arc(px, py - ph - 1, 5.4, 0, TAU); jfill(ctx, '#FFD43A', px, py - ph - 1, 5.4, 1); hl(ctx, px - 2, py - ph - 3, 1.8, 1, -0.5, 0.9); }
    ctx.font = '600 6.6px Fredoka, ui-rounded, system-ui, sans-serif';
    const w = ctx.measureText(text).width + 10, py = my + 4;
    ctx.fillStyle = 'rgba(40,30,60,.22)'; L.rrect(ctx, mx - w / 2 + 2, py - 5, w, 12, 5); ctx.fill();
    ctx.fillStyle = board; L.rrect(ctx, mx - w / 2 - 1.5, py - 8, w + 3, 14, 6); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; L.rrect(ctx, mx - w / 2, py - 6.5, w, 11, 5); ctx.fill();
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, mx, py - 0.8);
  };
  /* plank bridge with candy rails across the road (concept `drawBridge`) */
  W.drawBridge = function (ctx, x, y, ang) {
    const half = 24;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(20,60,90,.28)'; L.rrect(ctx, -half + 3, -14 + 6, half * 2, 30, 4); ctx.fill();
    for (let k = -half; k < half; k += 5.2) {
      ctx.fillStyle = (Math.round(k) % 2) ? '#D99A66' : '#E6AC78'; L.rrect(ctx, k, -15, 4.6, 30, 1.4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(k + 0.6, -14, 1, 28);
    }
    for (const sd of [-1, 1]) {
      ctx.fillStyle = 'rgba(40,30,60,.22)'; L.rrect(ctx, -half - 2 + 2, sd * 16 - 2 + 3, half * 2 + 4, 4, 2); ctx.fill();
      ctx.fillStyle = '#FFF4EA'; L.rrect(ctx, -half - 2, sd * 16 - 2, half * 2 + 4, 4, 2); ctx.fill();
      ctx.save(); ctx.beginPath(); L.rrect(ctx, -half - 2, sd * 16 - 2, half * 2 + 4, 4, 2); ctx.clip();
      ctx.fillStyle = '#FF6F9F'; for (let k = -half - 4; k < half + 4; k += 6) { ctx.beginPath(); ctx.moveTo(k, sd * 16 - 2); ctx.lineTo(k + 3, sd * 16 - 2); ctx.lineTo(k + 1, sd * 16 + 2); ctx.lineTo(k - 2, sd * 16 + 2); ctx.fill(); }
      ctx.restore();
      for (const k of [-half - 2, 0, half + 2]) { ctx.beginPath(); ctx.arc(k, sd * 16, 3.4, 0, TAU); jfill(ctx, '#FF9FC8', k, sd * 16, 3.4, 0.8); }
    }
    ctx.restore();
  };
  /* stepping stones across water (concept stepPiece), one deterministic sequence per segment */
  const SEQ = ['rock', 'lily', 'stone', 'rock', 'plank', 'lily', 'ring', 'rock', 'stone', 'lily', 'rock', 'plank', 'lily', 'stone', 'ring', 'rock', 'lily'];
  W.STONE_SEQ = SEQ;
  W.drawStones = function (ctx, i, pts, kind, t) {
    const R = L.rng(500 + i), a = { x: W.nx(i), y: W.ny(i) }, b = { x: W.nx(i + 1), y: W.ny(i + 1) };
    const seq = (W.STONE_SETS && W.STONE_SETS[kind]) || SEQ;
    let k = (i * 5) % seq.length;
    for (let j = 1; j < 9; j++) {
      const p = pts[Math.round(j / 9 * (pts.length - 1))];
      if (Math.hypot(p.x - a.x, p.y - a.y) < 44 || Math.hypot(p.x - b.x, p.y - b.y) < 44) continue;
      const q = pts[Math.min(pts.length - 1, Math.round(j / 9 * (pts.length - 1)) + 1)], ang = Math.atan2(q.y - p.y, q.x - p.x);
      const bob = t ? Math.sin(t * 2 + i * 7 + j) * 1.2 : 0, jit = (R() - 0.5) * 5;
      const piece = seq[k++ % seq.length];
      (W.STONE_DRAW && W.STONE_DRAW[piece] || ((c, pc, x, y, an, Rr) => K.stepPiece(c, pc, x, y, an, Rr)))(ctx, piece, p.x + jit * 0.3, p.y + bob, ang, R);
    }
  };
  /* the candy ribbon road (concept drawRoad), worn = behind you */
  W.drawRibbon = function (ctx, pts, style) {
    const s = Object.assign({ edge: '#EDBF98', base: '#FFF4E3', dash: '#FF9FC8', grass: 'rgba(60,90,40,.18)' }, style || {});
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(4, 6); L.pathPoly(ctx, pts); ctx.strokeStyle = 'rgba(50,40,80,.14)'; ctx.lineWidth = 34; ctx.stroke(); ctx.restore();
    L.pathPoly(ctx, pts); ctx.strokeStyle = s.grass; ctx.lineWidth = 31; ctx.stroke();
    ctx.strokeStyle = s.edge; ctx.lineWidth = 27; ctx.stroke();
    ctx.strokeStyle = s.base; ctx.lineWidth = 22; ctx.stroke();
    ctx.save(); ctx.translate(-2.5, -2); L.pathPoly(ctx, pts); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(2, 3); L.pathPoly(ctx, pts); ctx.strokeStyle = 'rgba(230,170,140,.25)'; ctx.lineWidth = 6; ctx.stroke(); ctx.restore();
    L.pathPoly(ctx, pts); ctx.setLineDash([9, 11]); ctx.strokeStyle = s.dash; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  };
})();
