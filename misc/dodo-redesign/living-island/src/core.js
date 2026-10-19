/* Peck map core — shared by every concept.
   World: 390 units wide, vertical scroll. Level 1 at the bottom.
   A concept supplies cached layers (with optional parallax), live animation hooks,
   optional node/dodo overrides, and notes. The core owns camera, geometry, chrome. */
(function () {
  'use strict';
  const W = 390, TAU = Math.PI * 2;

  /* ---------- randomness & noise ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeNoise(seed) {
    const r = rng(seed), perm = new Uint8Array(512), p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const grad = (h, x, y) => { const g = h & 7; const u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); };
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    function n2(x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y), A = perm[X] + Y, B = perm[X + 1] + Y;
      const l = (a, b, t) => a + t * (b - a);
      return l(l(grad(perm[A], x, y), grad(perm[B], x - 1, y), u), l(grad(perm[A + 1], x, y - 1), grad(perm[B + 1], x - 1, y - 1), u), v) * 0.35;
    }
    function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); f *= 2; a *= 0.5; } return s; }
    return { n2, fbm };
  }

  /* ---------- color ---------- */
  function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgbHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  function shade(c, t) { return t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#1a0f24', -t); }
  function rgba(c, a) { const A = hexRgb(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }

  /* ---------- geometry ---------- */
  function catmull(pts, steps) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    out.push(pts[pts.length - 1]);
    let L = 0; out[0].d = 0;
    for (let i = 1; i < out.length; i++) { L += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y); out[i].d = L; }
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1; out[i].tx = dx / m; out[i].ty = dy / m;
    }
    return { pts: out, length: L, at(d) { d = Math.max(0, Math.min(L, d)); let lo = 0, hi = out.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (out[m].d < d) lo = m; else hi = m; } const a = out[lo], b = out[hi], t = (d - a.d) / ((b.d - a.d) || 1); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: a.tx, ty: a.ty }; } };
  }
  function pathPoly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  /* distance from point to road, cheap */
  function distToRoad(road, x, y) { let best = 1e9; const p = road.pts; for (let i = 0; i < p.length; i += 2) { const d = (p[i].x - x) ** 2 + (p[i].y - y) ** 2; if (d < best) best = d; } return Math.sqrt(best); }

  /* ---------- jelly primitives ---------- */
  function jellyBall(ctx, x, y, r, color, o = {}) {
    if (o.shadow !== false) {
      ctx.save(); ctx.fillStyle = o.shadowColor || 'rgba(45,20,60,.22)';
      ctx.beginPath(); ctx.ellipse(x + (o.shadowDx || 0), y + r * 0.9, r * 0.95, r * 0.3, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.08, x, y, r * 1.05);
    g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    const ig = ctx.createRadialGradient(x, y + r * 0.6, 0, x, y + r * 0.6, r * 0.7);
    ig.addColorStop(0, rgba(shade(color, 0.45), 0.55)); ig.addColorStop(1, rgba(shade(color, 0.45), 0));
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.06); ctx.strokeStyle = rgba(shade(color, -0.55), 0.5); ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
    ctx.save(); ctx.translate(x - r * 0.38, y - r * 0.48); ctx.rotate(-0.55);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.26, r * 0.13, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x + r * 0.42, y + r * 0.3, r * 0.06, 0, TAU); ctx.fill();
  }
  function star(ctx, x, y, r, fill, stroke) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.lineJoin = 'round'; ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = r * 0.22; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  /* superellipse dodo with gaussian bumps — the drawJellyDodo recipe */
  function dodoPath(ctx, sq = 1) {
    const n = 2.4, e = 2 / n, a = 39, top = 36, bot = 42;
    const bumps = [[-1.62, 13, 0.16], [-2.05, 5, 0.22], [-0.05, 7, 0.2], [Math.PI + 0.05, 7, 0.2], [1.2, 5, 0.12], [1.94, 5, 0.12]];
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120 * TAU, c = Math.cos(t), s = Math.sin(t);
      let x = a * Math.sign(c) * Math.abs(c) ** e, y = (s < 0 ? top : bot) * Math.sign(s) * Math.abs(s) ** e;
      let add = 0; for (const [ang, amp, w] of bumps) { let d = Math.atan2(Math.sin(t - ang), Math.cos(t - ang)); add += amp * Math.exp(-(d * d) / (2 * w * w)); }
      const m = Math.hypot(x, y) || 1; x += x / m * add; y += y / m * add;
      x *= 1 / Math.sqrt(sq); y = (y - bot) * sq + bot;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function drawDodo(ctx, x, y, s, o = {}) {
    // (x, y) = feet anchor. Body is ~80 units tall at s=1.
    const base = o.color || '#5EC6EC', sq = o.squash || 1, blink = o.blink || 0;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.translate(0, -42);
    if (o.shadow !== false) { ctx.fillStyle = 'rgba(40,20,70,.22)'; ctx.beginPath(); ctx.ellipse(0, 44, 34 / Math.sqrt(sq), 8, 0, 0, TAU); ctx.fill(); }
    ctx.rotate(o.roll || 0);
    dodoPath(ctx, sq);
    const g = ctx.createRadialGradient(-14, -22, 4, 0, 4, 58);
    g.addColorStop(0, shade(base, 0.75)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.4));
    ctx.fillStyle = g; ctx.fill();
    const ig = ctx.createRadialGradient(0, 26, 0, 0, 26, 30); ig.addColorStop(0, rgba(shade(base, 0.6), 0.55)); ig.addColorStop(1, rgba(shade(base, 0.6), 0));
    ctx.fillStyle = ig; ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(shade(base, -0.6), 0.5); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(-20, -22, 7, 4, -0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(26, 18, 2.2, 5, -0.3, 0, TAU); ctx.fill();
    // blush
    ctx.fillStyle = 'rgba(255,120,170,.38)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 23, 4, 6, 3.4, 0, 0, TAU); ctx.fill(); }
    // eyes
    for (const sx of [-1, 1]) {
      ctx.save(); ctx.translate(sx * 14, -9);
      if (blink > 0.5) { ctx.strokeStyle = '#2A1F2B'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(0, 2.5, 4, 0); ctx.stroke(); }
      else {
        ctx.fillStyle = '#2A1F2B'; ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 4.6 * (1 - blink), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-1.4, -1.6, 1.6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(1.5, 1.4, 0.7, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    // beak
    const bg = ctx.createLinearGradient(0, 0, 0, 20); bg.addColorStop(0, '#FFD56C'); bg.addColorStop(1, '#F3962A');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-9, 1); ctx.quadraticCurveTo(0, -3, 9, 1); ctx.quadraticCurveTo(7, 12, 0, 19); ctx.quadraticCurveTo(-7, 12, -9, 1); ctx.fill();
    ctx.fillStyle = '#E0742A'; ctx.beginPath(); ctx.ellipse(0, 13, 2.6, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-3.5, 3, 2.6, 1.2, -0.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* simple jelly critters — enough to populate scenes */
  function jellyBlob(ctx, w, h, color) {
    ctx.beginPath(); ctx.moveTo(-w, h * 0.2);
    ctx.bezierCurveTo(-w, -h * 1.1, w, -h * 1.1, w, h * 0.2); ctx.bezierCurveTo(w, h * 0.9, -w, h * 0.9, -w, h * 0.2); ctx.closePath();
    const g = ctx.createRadialGradient(-w * 0.35, -h * 0.5, 1, 0, 0, w * 1.3);
    g.addColorStop(0, shade(color, 0.6)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.35));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(shade(color, -0.6), 0.45); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(-w * 0.45, -h * 0.45, w * 0.22, h * 0.1, -0.5, 0, TAU); ctx.fill();
  }
  function face(ctx, sx, y, r = 2.6, mouth = true) {
    ctx.fillStyle = '#2A1F2B'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * sx, y, r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#fff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * sx - r * 0.3, y - r * 0.35, r * 0.35, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,110,160,.4)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * (sx + r * 2.2), y + r * 1.6, r * 1.3, r * 0.7, 0, 0, TAU); ctx.fill(); }
    if (mouth) { ctx.strokeStyle = '#2A1F2B'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, y + r * 0.9, r * 0.7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  }
  function drawCritter(ctx, kind, x, y, s = 1, o = {}) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (o.flip ? -1 : 1), s * (o.squash || 1));
    if (o.shadow !== false) { ctx.fillStyle = 'rgba(40,20,70,.2)'; ctx.beginPath(); ctx.ellipse(0, 1, 15, 4, 0, 0, TAU); ctx.fill(); }
    ctx.translate(0, -14);
    switch (kind) {
      case 'bunny': {
        for (const sx of [-1, 1]) { ctx.save(); ctx.translate(sx * 6, -12); ctx.rotate(sx * 0.12); jellyBlob(ctx, 3.6, 11, '#FF9FC8'); ctx.restore(); }
        jellyBlob(ctx, 12, 13, '#FF9FC8'); face(ctx, 5, -1); break;
      }
      case 'bee': {
        ctx.fillStyle = 'rgba(220,240,255,.75)'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 8, -14, 6, 9, sx * 0.5, 0, TAU); ctx.fill(); }
        jellyBlob(ctx, 12, 13, '#FFD43A');
        ctx.fillStyle = 'rgba(60,35,25,.85)'; ctx.fillRect(-11.5, 1, 23, 3.4); ctx.fillRect(-10, 6.5, 20, 3);
        face(ctx, 4.5, -4); ctx.strokeStyle = '#2A1F2B'; ctx.lineWidth = 1.2; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 3, -12); ctx.quadraticCurveTo(sx * 5, -20, sx * 7, -21); ctx.stroke(); ctx.beginPath(); ctx.arc(sx * 7, -21, 1.6, 0, TAU); ctx.fillStyle = '#2A1F2B'; ctx.fill(); }
        break;
      }
      case 'mushroom': {
        ctx.save(); ctx.translate(0, 5); jellyBlob(ctx, 9, 8, '#FFE9D6'); ctx.restore();
        ctx.save(); ctx.translate(0, -6); ctx.beginPath(); ctx.moveTo(-15, 2); ctx.bezierCurveTo(-15, -16, 15, -16, 15, 2); ctx.quadraticCurveTo(0, 6, -15, 2);
        const g = ctx.createRadialGradient(-5, -8, 1, 0, -2, 18); g.addColorStop(0, '#FF8A8A'); g.addColorStop(0.6, '#FF2B36'); g.addColorStop(1, '#B3121D'); ctx.fillStyle = g; ctx.fill();
        ctx.fillStyle = '#FFF4F0'; [[-7, -5, 2.6], [3, -9, 2.2], [9, -2, 1.8], [-1, -1, 1.5]].forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(a, b, r, 0, TAU); ctx.fill(); });
        ctx.restore(); face(ctx, 3.6, 5, 2); break;
      }
      case 'octo': {
        jellyBlob(ctx, 13, 12, '#FF2B36'); face(ctx, 5, -1, 3); break;
      }
      case 'cat': {
        for (const sx of [-1, 1]) { ctx.fillStyle = '#7FD9BC'; ctx.beginPath(); ctx.moveTo(sx * 4, -9); ctx.lineTo(sx * 12, -16); ctx.lineTo(sx * 12, -5); ctx.fill(); }
        jellyBlob(ctx, 13, 12, '#91E9CC'); face(ctx, 5, -1); break;
      }
      case 'hamster': {
        for (const sx of [-1, 1]) { ctx.fillStyle = '#F2A0A0'; ctx.beginPath(); ctx.arc(sx * 8, -9, 3.5, 0, TAU); ctx.fill(); }
        jellyBlob(ctx, 13, 11, '#F4C27A'); ctx.fillStyle = 'rgba(255,245,230,.8)'; ctx.beginPath(); ctx.ellipse(0, 5, 8, 4, 0, 0, TAU); ctx.fill(); face(ctx, 5, -2); break;
      }
      case 'bat': {
        ctx.fillStyle = '#8A5CE0'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 9, -4); ctx.quadraticCurveTo(sx * 24, -14, sx * 26, 2); ctx.quadraticCurveTo(sx * 20, -2, sx * 17, 4); ctx.quadraticCurveTo(sx * 13, 0, sx * 10, 5); ctx.fill(); }
        jellyBlob(ctx, 11, 11, '#A77BF2'); face(ctx, 4.5, -1); break;
      }
      default: jellyBlob(ctx, 12, 11, o.color || '#FFAA82'); face(ctx, 5, -1);
    }
    ctx.restore();
  }

  /* candy props */
  function candyTree(ctx, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(40,20,70,.18)'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 3.5, 0, 0, TAU); ctx.fill();
    const sg = ctx.createLinearGradient(-2, 0, 2, 0); sg.addColorStop(0, '#E9C9A6'); sg.addColorStop(1, '#C9946A');
    ctx.fillStyle = sg; ctx.fillRect(-1.8, -26, 3.6, 26);
    jellyBall(ctx, 0, -34, 13, color, { shadow: false }); ctx.restore();
  }
  function lollipop(ctx, x, y, s, a, b) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(40,20,70,.16)'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#FFF8F2'; ctx.fillRect(-1.5, -30, 3, 30);
    ctx.save(); ctx.translate(0, -40);
    ctx.fillStyle = a; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.strokeStyle = b; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.beginPath();
    for (let t = 0; t < 14; t += 0.2) { const r = t * 0.8; ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r); } ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(-5, -6, 4, 2, -0.6, 0, TAU); ctx.fill();
    ctx.restore(); ctx.restore();
  }
  function sign(ctx, x, y, text, o = {}) {
    ctx.save(); ctx.translate(x, y);
    ctx.font = `600 ${o.size || 8.5}px Fredoka, ui-rounded, system-ui, sans-serif`;
    const tw = ctx.measureText(text.toUpperCase()).width, w = tw + 18, h = 17;
    ctx.fillStyle = 'rgba(40,20,70,.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = o.post || '#A9724A'; ctx.fillRect(-2, -26, 4, 26);
    ctx.fillStyle = o.board || '#B9845A'; rrect(ctx, -w / 2 - 2, -40, w + 4, h + 4, 5); ctx.fill();
    ctx.fillStyle = o.plate || '#FFF4E2'; rrect(ctx, -w / 2, -38, w, h, 4); ctx.fill();
    ctx.fillStyle = o.ink || '#6B3E2A'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text.toUpperCase(), 0, -29.2);
    ctx.restore();
  }
  function chest(ctx, x, y, s = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(40,20,70,.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 4, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(0, -24, 0, 0); g.addColorStop(0, '#FFC2DD'); g.addColorStop(1, '#F56FA8');
    ctx.fillStyle = g; rrect(ctx, -14, -16, 28, 16, 4); ctx.fill();
    ctx.fillStyle = '#FF9FC8'; ctx.beginPath(); ctx.moveTo(-14, -14); ctx.quadraticCurveTo(0, -30, 14, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFD43A'; ctx.fillRect(-14, -15, 28, 4); ctx.fillRect(-2.5, -15, 5, 15);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(-6, -21, 5, 2, -0.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function candyRoad(ctx, road, o = {}) {
    const w = o.width || 22;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    pathPoly(ctx, road.pts);
    ctx.strokeStyle = o.shadow || 'rgba(60,30,60,.16)'; ctx.lineWidth = w + 8; ctx.save(); ctx.translate(0, 4); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = o.edge || '#F3C9A4'; ctx.lineWidth = w + 5; ctx.stroke();
    ctx.strokeStyle = o.base || '#FFF4E3'; ctx.lineWidth = w; ctx.stroke();
    ctx.setLineDash([9, 11]); ctx.strokeStyle = o.dash || '#FF9FC8'; ctx.lineWidth = o.dashW || 4; ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  /* ---------- default node ---------- */
  const NODE_COLORS = { meadow: '#FF9F4A', lagoon: '#4FC0EA' };
  function defaultNode(ctx, n, env, t) {
    const r = 23, c = n.state === 'locked' ? '#BDB6C9' : (NODE_COLORS[n.region] || '#FFAA82');
    const bounce = n.bounce ? Math.sin(Math.min(1, n.bounce) * Math.PI) * 0.12 : 0;
    ctx.save(); ctx.translate(n.x, n.y); ctx.scale(1 + bounce, 1 - bounce * 0.7);
    if (n.state === 'current') {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.strokeStyle = rgba('#FFD43A', 0.35 + pulse * 0.3); ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#FFD43A'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, TAU); ctx.stroke();
    }
    jellyBall(ctx, 0, 0, r, c, { shadowColor: env.nodeShadow || 'rgba(45,20,60,.25)' });
    if (n.state === 'locked') {
      ctx.strokeStyle = '#6E6680'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, -3, 5.5, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#6E6680'; rrect(ctx, -8, -3, 16, 12, 3); ctx.fill(); ctx.fillStyle = '#BDB6C9'; ctx.fillRect(-1, 1, 2, 4);
    } else {
      ctx.font = '600 21px Fredoka, ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(n.level, 0, 1.5);
      ctx.fillStyle = shade(c, -0.72); ctx.fillText(n.level, 0, 0.5);
    }
    ctx.restore();
    if (n.state === 'cleared') {
      for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k - 1) * 0.55; star(ctx, n.x + Math.cos(a) * 33, n.y + Math.sin(a) * 33 + 2, k === 1 ? 6.5 : 5.5, k < n.stars ? '#FFD43A' : 'rgba(255,255,255,.75)', k < n.stars ? '#E0A100' : 'rgba(160,140,170,.6)'); }
    }
    if (n.state === 'current') {
      ctx.font = '600 8px Fredoka, ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2D2537'; rrect(ctx, n.x - 20, n.y + 27, 40, 13, 6.5); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText('START', n.x, n.y + 33.8);
    }
  }

  /* ---------- world ---------- */
  function buildWorld() {
    const N = 14, SP = 142, BOT = 200, TOPM = 250;
    const worldH = BOT + (N - 1) * SP + TOPM;
    const R = rng(7), nodes = [];
    for (let i = 0; i < N; i++) {
      const x = 195 + 92 * Math.sin(i * 0.98 + 0.35);
      const y = worldH - BOT - i * SP + (R() - 0.5) * 16;
      nodes.push({ i, level: i + 1, x, y, region: i < 10 ? 'meadow' : 'lagoon', state: i < 5 ? 'cleared' : i === 5 ? 'current' : 'locked', stars: [3, 2, 3, 3, 1][i] || 0 });
    }
    const tail = { x: nodes[0].x - 40, y: worldH + 30 };
    const head = { x: nodes[N - 1].x + 40, y: nodes[N - 1].y - 200 };
    const road = catmull([tail, ...nodes, head], 18);
    const shoreY = (nodes[9].y + nodes[10].y) / 2;
    // the road point closest to the shore line = gate
    let gate = road.pts[0]; for (const p of road.pts) if (Math.abs(p.y - shoreY) < Math.abs(gate.y - shoreY)) gate = p;
    return { W, worldH, N, nodes, road, shoreY, gate: { x: gate.x, y: gate.y, tx: gate.tx, ty: gate.ty },
      meadow: { top: shoreY, bottom: worldH }, lagoon: { top: 0, bottom: shoreY },
      props: { chestBy: 2, restStop: 4, regionSignBy: 0, lagoonSignBy: 10 } };
  }

  /* ---------- chrome ---------- */
  const CSS = `
  :root{--paper:#F8F2F8;--ink:#2D2537;--ink2:#6A5F73;--pill:rgba(255,252,255,.78);--pillLine:rgba(120,90,140,.18);--lemon:#FFD43A;--sky:#2689BD;--sheet:#FFFCFF;--frame:#E9DFEE}
  html,body{background:var(--frame);color:var(--ink)}
  body{margin:0;font:14px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
  .col{position:relative;width:min(100%,430px);margin:0 auto;background:var(--paper)}
  .stage{position:sticky;top:0;display:block;width:100%}
  .stage canvas{display:block;width:100%;touch-action:pan-y}
  .hud{position:fixed;left:50%;transform:translateX(-50%);width:min(100%,430px);pointer-events:none;z-index:5}
  .hud.top{top:0;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 0;box-sizing:border-box}
  .hud.bot{bottom:0;padding:0 12px calc(env(safe-area-inset-bottom,0px) + 14px);box-sizing:border-box;display:flex;justify-content:center}
  .row{display:flex;gap:6px;align-items:center}
  .pill{pointer-events:auto;display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 10px;border-radius:15px;background:var(--pill);border:1px solid var(--pillLine);backdrop-filter:blur(10px) saturate(1.4);-webkit-backdrop-filter:blur(10px) saturate(1.4);font:600 12px/1 Fredoka,ui-rounded,system-ui,sans-serif;color:var(--ink);box-shadow:0 2px 8px rgba(60,30,80,.1)}
  .av{width:34px;height:34px;border-radius:50%;padding:0;justify-content:center;background:linear-gradient(160deg,#DCF6FF,#5EC6EC);border:2px solid #fff}
  .sp{flex:1}
  .tag{margin-top:8px;display:flex;justify-content:center}
  .tag .pill{height:26px;font-size:11px;letter-spacing:.02em;cursor:pointer}
  .tag .pill b{color:var(--sky);font-weight:600}
  .switch{pointer-events:auto;display:flex;gap:2px;padding:3px;border-radius:20px;background:rgba(45,37,55,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .switch span{font:600 12px/1 Fredoka,ui-rounded,system-ui,sans-serif;color:rgba(255,255,255,.7);padding:10px 16px;border-radius:17px}
  .switch span.on{background:rgba(255,255,255,.95);color:var(--ink)}
  .sheet{position:fixed;inset:auto 0 0 0;margin:0 auto;width:min(100%,430px);box-sizing:border-box;max-height:72%;overflow:auto;background:var(--sheet);border-radius:22px 22px 0 0;box-shadow:0 -10px 40px rgba(40,20,60,.25);padding:10px max(20px,env(safe-area-inset-left,0px)) calc(env(safe-area-inset-bottom,0px) + 24px) max(20px,env(safe-area-inset-right,0px));z-index:9;transform:translateY(105%);transition:transform .32s cubic-bezier(.34,1.3,.64,1)}
  .sheet.open{transform:none}
  .grab{width:38px;height:5px;border-radius:3px;background:#E1D6E6;margin:0 auto 12px}
  .sheet h2{font:600 22px/1.15 Fredoka,ui-rounded,system-ui,sans-serif;margin:0 0 4px;text-wrap:balance}
  .sheet .kicker{font:600 11px/1 Fredoka,ui-rounded,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--sky);margin:0 0 8px}
  .sheet .thesis{color:var(--ink2);margin:0 0 14px;font-size:15px}
  .sheet dl{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0 0 14px;font-size:13px}
  .sheet dt{font:600 11px/1.6 Fredoka,ui-rounded,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}
  .sheet dd{margin:0}
  .sheet ul{margin:0;padding-left:18px;display:grid;gap:6px;font-size:14px}
  .sheet .close{position:absolute;right:14px;top:12px;width:30px;height:30px;border-radius:50%;border:0;background:#F1E8F5;color:var(--ink);font-size:16px;cursor:pointer}
  .side{display:none}
  @media (min-width:980px){
    .side{display:block;position:fixed;top:40px;left:calc(50% + 215px + 36px);width:min(340px,calc(50% - 215px - 60px));max-height:calc(100vh - 80px);overflow:auto}
    .side h2{font:600 26px/1.1 Fredoka,ui-rounded,system-ui,sans-serif;margin:0 0 6px}
    .side .kicker{font:600 11px/1 Fredoka,ui-rounded,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--sky);margin:0 0 10px}
    .side .thesis{color:var(--ink2);font-size:15px;margin:0 0 16px}
    .side dl{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0 0 16px;font-size:13px}
    .side dt{font:600 11px/1.6 Fredoka,ui-rounded,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}
    .side dd{margin:0}.side ul{margin:0;padding-left:18px;display:grid;gap:6px}
    .col{box-shadow:0 0 0 1px rgba(80,50,100,.08),0 20px 60px rgba(60,30,80,.12)}
  }
  body.full .hud,body.full .sheet,body.full .side{display:none!important}
  @media (prefers-reduced-motion:reduce){.sheet{transition:none}}
  `;
  const flame = '<svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 0C7 3 11 5 11 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3C5 6 4 3 6 0z" fill="#FF8A3D"/><path d="M6 6c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 .6-2 1.2-2.4C4.5 9.6 5.2 10 6 10 6 8.6 5.4 7.6 6 6z" fill="#FFD43A"/></svg>';
  const bolt = '<svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><path d="M6 0L0 8h4l-1 6 7-9H6l1-5z" fill="#E0A100"/></svg>';

  function notesHTML(C) {
    const dl = (C.facts || []).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    const li = (C.notes || []).map(n => `<li>${n}</li>`).join('');
    return `<p class="kicker">Concept ${C.letter} · ${C.pipeline}</p><h2>${C.name}</h2><p class="thesis">${C.thesis}</p><dl>${dl}</dl><ul>${li}</ul>`;
  }

  /* ---------- mount ---------- */
  async function mount(C) {
    const style = document.createElement('style'); style.textContent = CSS + (C.css || ''); document.head.appendChild(style);
    const full = location.hash === '#full';
    if (full) document.body.classList.add('full');
    try { await Promise.race([document.fonts.load('600 20px Fredoka'), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}

    const world = buildWorld();
    const env = Object.assign({}, world, {
      rng, noise: makeNoise(C.seed || 11), mix, shade, rgba, hexRgb, catmull, pathPoly, rrect, distToRoad,
      jellyBall, star, drawDodo, dodoPath, drawCritter, candyTree, lollipop, sign, chest, candyRoad, defaultNode, TAU
    });
    if (C.setup) C.setup(env);

    document.body.innerHTML = `
      <div class="col" id="col"><div id="track"><div class="stage" id="stage"><canvas id="cv" aria-label="${C.name}: Peck adventure map, levels 1 to 14" role="img"></canvas></div></div></div>
      <div class="hud top"><div class="row"><span class="pill av"><svg width="18" height="18" viewBox="0 0 18 18"><circle cx="6.5" cy="8" r="1.7" fill="#2A1F2B"/><circle cx="11.5" cy="8" r="1.7" fill="#2A1F2B"/><path d="M7 10.5h4l-2 4z" fill="#F3962A"/></svg></span><span class="pill">${flame}12 <span style="color:#E0A100">×3</span></span><span class="sp"></span><span class="pill">${bolt}2,860</span></div>
        <div class="tag"><button class="pill" id="tagBtn" type="button" style="border:1px solid var(--pillLine)"><b>${C.letter}</b>&nbsp;${C.name} · notes</button></div></div>
      <div class="hud bot"><div class="switch"><span>Topics</span><span class="on">Peck</span></div></div>
      <aside class="sheet" id="sheet" aria-label="Concept notes"><div class="grab"></div><button class="close" id="closeBtn" type="button" aria-label="Close notes">×</button>${notesHTML(C)}</aside>
      <aside class="side">${notesHTML(C)}</aside>`;
    const sheet = document.getElementById('sheet');
    document.getElementById('tagBtn').onclick = () => sheet.classList.toggle('open');
    document.getElementById('closeBtn').onclick = () => sheet.classList.remove('open');

    const cv = document.getElementById('cv'), ctx = cv.getContext('2d'), track = document.getElementById('track'), stage = document.getElementById('stage');
    let scale = 1, dpr = 1, vhW = 0, layers = [], cssW = 0, cssH = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function buildLayers() {
      cssW = document.getElementById('col').clientWidth;
      scale = cssW / W; dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssH = full ? world.worldH * scale : window.innerHeight;
      vhW = cssH / scale;
      track.style.height = (world.worldH * scale) + 'px';
      stage.style.height = cssH + 'px';
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); cv.style.height = cssH + 'px';
      layers = [];
      const all = [...(C.layers || []).map(l => ({ ...l, front: false })), ...(C.foreground || []).map(l => ({ ...l, front: true }))];
      for (const L of all) {
        const f = full ? 1 : (L.parallax ?? 1);
        const HL = vhW + (world.worldH - vhW) * f;
        const oc = document.createElement('canvas'); oc.width = Math.round(cssW * dpr); oc.height = Math.round(HL * scale * dpr);
        const c2 = oc.getContext('2d'); c2.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
        const lenv = Object.assign({}, env, { H: HL, f, vhW, toLayer: y => (y - vhW / 2) * f + vhW / 2, scale: scale * dpr });
        try { L.draw(c2, lenv); } catch (e) { console.error('layer', L.name, e); }
        layers.push({ cv: oc, f, front: L.front });
      }
    }

    const t0 = performance.now(); let needs = true;
    const state = { dodoHop: 0, taps: [] };
    function frame(now) {
      const t = reduce ? 0 : (now - t0) / 1000;
      const maxS = Math.max(0, world.worldH - vhW);
      const s = full ? 0 : Math.max(0, Math.min(maxS, window.scrollY / scale));
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = C.bg || '#F8F2F8'; ctx.fillRect(0, 0, cv.width, cv.height);
      for (const L of layers) if (!L.front) ctx.drawImage(L.cv, 0, Math.round(-s * L.f * scale * dpr));
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, -s * scale * dpr);
      const view = { top: s - 60, bottom: s + vhW + 60, t, s, vhW };
      if (C.animateBack) C.animateBack(ctx, env, t, view);
      const cur = world.nodes.find(n => n.state === 'current');
      for (const n of world.nodes) {
        if (n.y < view.top || n.y > view.bottom) continue;
        if (n.bounce) { n.bounce += 1 / 20; if (n.bounce > 1) n.bounce = 0; }
        (C.drawNode || defaultNode)(ctx, n, env, t);
      }
      // the traveler
      const hop = state.dodoHop ? Math.sin(Math.min(1, state.dodoHop) * Math.PI) : 0;
      if (state.dodoHop) { state.dodoHop += 1 / 36; if (state.dodoHop > 1) state.dodoHop = 0; }
      const breathe = 1 + Math.sin(t * 2.4) * 0.025;
      const blink = (t % 4.3) > 4.18 ? 1 : 0;
      (C.drawTraveler || ((c, x, y, o) => drawDodo(c, x, y, 0.5, o)))(ctx, cur.x, cur.y - 14 - hop * 26, { squash: breathe * (1 - hop * 0.08), blink, t });
      if (C.animateFront) C.animateFront(ctx, env, t, view);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const L of layers) if (L.front) ctx.drawImage(L.cv, 0, Math.round(-s * L.f * scale * dpr));
      if (C.overlay) { ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0); C.overlay(ctx, env, t, view); }
      if (!full && (!reduce || needs)) requestAnimationFrame(frame);
      needs = false;
    }
    cv.addEventListener('click', e => {
      const r = cv.getBoundingClientRect(); const s = full ? 0 : window.scrollY / scale;
      const wx = (e.clientX - r.left) / scale, wy = (e.clientY - r.top) / scale + (full ? 0 : Math.max(0, Math.min(world.worldH - vhW, s)));
      const cur = world.nodes.find(n => n.state === 'current');
      if (Math.hypot(wx - cur.x, wy - (cur.y - 30)) < 26) { state.dodoHop = 0.001; }
      else for (const n of world.nodes) if (Math.hypot(wx - n.x, wy - n.y) < 28) n.bounce = 0.001;
      if (C.onTap) C.onTap(wx, wy, env);
      if (reduce) requestAnimationFrame(frame);
    });
    buildLayers();
    if (!full) window.scrollTo(0, document.documentElement.scrollHeight);
    requestAnimationFrame(frame);
    if (full) { setTimeout(() => requestAnimationFrame(frame), 50); }
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4; buildLayers(); if (atBottom) window.scrollTo(0, document.documentElement.scrollHeight); needs = true; requestAnimationFrame(frame); }, 150); });
    if (reduce) window.addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true });
    window.__peckReady = true;
  }

  window.Peck = { mount, W, rng, makeNoise, mix, shade, rgba };
})();
