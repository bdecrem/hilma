// Peck or Perish — a 30-second trailer drawn frame by frame in code.
// The dodo, the egg and the invaders keep the game's geometry
// (public/peck-or-perish/index.html) but are re-inked for the trailer:
// heavy outlines, flat riso colour, halftone dots instead of hatching.
// window.renderAt(t) paints the frame at t seconds onto #c.
(function () {
  const W = 1080, H = 1920, FPS = 30, TAU = Math.PI * 2;
  const C = {
    // indie riso set: vermillion is the loud one, the dodo is ultramarine, lime is the spark
    ink: '#16121c', paper: '#f7efdf', pink: '#ff4b1f', teal: '#3d3bff', mari: '#ffc31f',
    night: '#100d18', grey: '#b9b2a2', leaf: '#b6f23a', rat: '#cfc8bb', lime: '#b6f23a', pig: '#ff8fb0',
  };
  const ANTON = '"Anton", Impact, sans-serif';
  const MONO = '"VT323", monospace';
  const ULTRA = '"Ultra", Georgia, serif';
  const FELL = '"IM Fell English", Georgia, serif';
  const FELLSC = '"IM Fell English SC", Georgia, serif';

  // INTERWORLD — METAMORPHOSIS, 0:07 → 0:37, measured with librosa: 172 BPM,
  // drop at 4.0 s, the break 14.7 → 25.3 s, second drop 25.3 s.
  const BEATS = [1.3, 1.65, 1.97, 2.32, 2.67, 3.02, 3.37, 3.69, 4.02, 4.37, 4.71, 5.06, 5.41, 5.76,
    6.08, 6.43, 6.78, 7.13, 7.45, 7.8, 8.15, 8.5, 8.85, 9.17, 9.52, 9.87, 10.22, 10.54, 10.89, 11.24,
    11.59, 11.91, 12.26, 12.61, 12.96, 13.28, 13.63, 13.98, 14.33, 14.68, 15.02, 15.35, 15.7, 16.04,
    16.37, 16.72, 17.07, 17.41, 17.76, 18.11, 18.44, 18.78, 19.13, 19.46, 19.81, 20.15, 20.5, 20.83,
    21.18, 21.52, 21.87, 22.22, 22.55, 22.89, 23.24, 23.59, 23.92, 24.26, 24.61, 24.94, 25.29, 25.63,
    25.98, 26.33, 26.66, 27.0, 27.35, 27.7, 28.03, 28.37, 28.72, 29.07, 29.4, 29.7];
  const HITS = [[4.0, 1], [4.71, 0.6], [5.41, 0.6], [5.74, 0.5], [6.08, 0.6], [6.78, 0.6], [7.45, 0.7],
    [8.15, 0.8], [8.48, 0.8], [8.82, 0.9], [9.17, 0.5], [9.52, 0.5], [9.87, 0.5], [10.22, 0.5], [10.54, 0.5],
    [10.89, 0.5], [11.24, 0.6], [11.91, 0.5], [12.26, 0.5], [12.59, 0.5], [12.93, 0.5], [13.28, 0.6],
    [13.63, 0.6], [13.96, 0.7], [14.35, 1], [18.11, 0.35], [19.46, 0.5], [20.83, 0.35], [23.92, 0.5],
    [24.26, 0.9], [25.29, 1], [25.98, 0.7], [26.66, 0.7], [27.35, 0.9], [29.05, 0.6], [29.4, 0.7]];

  // ---------- small maths ----------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const eo3 = (k) => 1 - Math.pow(1 - clamp(k), 3);
  const ei3 = (k) => Math.pow(clamp(k), 3);
  const eoBack = (k) => { k = clamp(k); const c = 1.8; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const fr = (t) => Math.floor(t * FPS + 1e-6);
  function hitEnv(t, decay = 13) {
    let v = 0;
    for (const [h, s] of HITS) if (h <= t + 1e-6) v = Math.max(v, s * Math.exp(-(t - h) * decay));
    return v;
  }
  function beatEnv(t, decay = 9) {
    let v = 0;
    for (const b of BEATS) if (b <= t + 1e-6) v = Math.max(v, Math.exp(-(t - b) * decay));
    return v;
  }
  function beatIdx(t) { let i = -1; for (let k = 0; k < BEATS.length; k++) if (BEATS[k] <= t + 1e-6) i = k; return i; }

  // ---------- canvases + textures ----------
  function mk(w = W, h = H) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const out = document.getElementById('c');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  const buf = mk(), bctx = buf.getContext('2d');
  const tmp = mk(), tctx = tmp.getContext('2d');
  const tmp2 = mk(), t2ctx = tmp2.getContext('2d');

  let PAT = null, HV = null, GRAIN = null, VIG = null;
  function dotTile(color, size, r) {
    const c = mk(size, size), x = c.getContext('2d');
    x.fillStyle = color; x.beginPath(); x.arc(size / 2, size / 2, r, 0, 7); x.fill();
    return c;
  }
  function halftone(color, spacing, rMax, cx, cy, reach, power) {
    const c = mk(), x = c.getContext('2d');
    x.fillStyle = color;
    let row = 0;
    for (let yy = 0; yy < H + spacing; yy += spacing, row++) {
      for (let xx = row % 2 ? spacing / 2 : 0; xx < W + spacing; xx += spacing) {
        const r = rMax * Math.pow(clamp(Math.hypot(xx - cx, yy - cy) / reach), power);
        if (r > 0.5) { x.beginPath(); x.arc(xx, yy, r, 0, 7); x.fill(); }
      }
    }
    return c;
  }
  function init() {
    if (PAT) return;
    // shading dots per fill colour: a darker ink of the same hue
    PAT = {
      [C.teal]: bctx.createPattern(dotTile('#1d1a99', 12, 3.4), 'repeat'),
      [C.paper]: bctx.createPattern(dotTile('#a39a88', 12, 3.4), 'repeat'),
      [C.pink]: bctx.createPattern(dotTile('#b02a06', 12, 3.4), 'repeat'),
      [C.mari]: bctx.createPattern(dotTile('#b07800', 12, 3.4), 'repeat'),
      [C.grey]: bctx.createPattern(dotTile('#6f695e', 12, 3.4), 'repeat'),
      [C.rat]: bctx.createPattern(dotTile('#6d665b', 12, 3.4), 'repeat'),
      [C.leaf]: bctx.createPattern(dotTile('#5f8f10', 12, 3.4), 'repeat'),
      [C.pig]: bctx.createPattern(dotTile('#c2506f', 12, 3.4), 'repeat'),
      '#d8cfbd': bctx.createPattern(dotTile('#8a8374', 12, 3.4), 'repeat'),
    };
    HV = {
      ink: halftone(C.ink, 18, 8.5, 540, 900, 1150, 2.2),
      paper: halftone(C.paper, 18, 7, 540, 900, 1150, 1.8),
    };
    GRAIN = [0, 1, 2, 3].map((i) => {
      const c = mk(540, 960), x = c.getContext('2d');
      const d = x.createImageData(540, 960), r = rng(99 + i);
      for (let k = 0; k < d.data.length; k += 4) {
        const v = r() * 255;
        d.data[k] = d.data[k + 1] = d.data[k + 2] = v; d.data[k + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      return c;
    });
    VIG = mk();
    const v = VIG.getContext('2d');
    const g = v.createRadialGradient(540, 960, 500, 540, 960, 1250);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    v.fillStyle = g; v.fillRect(0, 0, W, H);
  }

  // ---------- drawing primitives ----------
  function bg(ctx, color) { ctx.fillStyle = color; ctx.fillRect(-300, -300, W + 600, H + 600); }
  function field(ctx, which, alpha = 1) { ctx.save(); ctx.globalAlpha *= alpha; ctx.drawImage(HV[which], 0, 0); ctx.restore(); }
  function glowAt(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function word(ctx, text, x, y, o = {}) {
    const { size = 200, font = ANTON, fill = C.ink, stroke = null, lw = 0, align = 'center', base = 'middle',
      rot = 0, sx = 1, sy = 1, alpha = 1, track = 0, maxW = 0, slamAt = null, t = 0, style = '', shadow = null } = o;
    let s = size;
    ctx.save();
    ctx.font = `${style} ${s}px ${font}`;
    ctx.letterSpacing = track + 'px';
    if (maxW) {
      const w = ctx.measureText(text).width;
      if (w * sx > maxW) { s = (s * maxW) / (w * sx); ctx.font = `${style} ${s}px ${font}`; }
    }
    let k = 1;
    if (slamAt != null) {
      const lt = t - slamAt;
      if (lt < 0) { ctx.restore(); return; }
      k = 1 + 0.6 * Math.pow(1 - clamp(lt / 0.12), 2);
    }
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx * k, sy * k);
    ctx.globalAlpha *= alpha;
    ctx.textAlign = align; ctx.textBaseline = base;
    if (shadow) { ctx.fillStyle = shadow; ctx.fillText(text, s * 0.035, s * 0.035); }
    if (fill) { ctx.fillStyle = fill; ctx.fillText(text, 0, 0); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(text, 0, 0); }
    ctx.restore();
  }
  function typeOn(ctx, text, x, y, t, t0, o = {}) {
    if (t < t0) return;
    const n = Math.min(text.length, Math.floor((t - t0) * 28));
    const shown = text.slice(0, n), s = o.size || 60, align = o.align || 'left';
    word(ctx, shown, x, y, { font: MONO, ...o, align });
    if (fr(t) % 16 < 9) {
      ctx.save();
      ctx.font = `${s}px ${MONO}`;
      ctx.letterSpacing = (o.track || 0) + 'px';
      const w = ctx.measureText(shown).width, full = ctx.measureText(text).width;
      const x0 = align === 'center' ? x - full / 2 : x;
      ctx.fillStyle = o.fill || C.paper;
      ctx.fillRect(x0 + w + 6, y - s * 0.36, s * 0.42, s * 0.72);
      ctx.restore();
    }
  }
  function radial(ctx, cx, cy, o = {}) {
    const { n = 110, color = C.ink, seed = 1, inner = 300, jit = 0.45, width = 0.016, len = 2600, alpha = 1 } = o;
    const r = rng(seed);
    ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, w = width * (0.25 + r() * 1.5), r0 = inner * (1 + (r() - 0.35) * jit * 2);
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a - w) * len, cy + Math.sin(a - w) * len);
      ctx.lineTo(cx + Math.cos(a + w) * len, cy + Math.sin(a + w) * len);
      ctx.closePath();
    }
    ctx.fill(); ctx.restore();
  }
  function streaks(ctx, ang, o = {}) {
    const { n = 30, color = C.paper, seed = 1, t = 0, speed = 3000, alpha = 1, thick = [3, 24], len = [200, 1200], dir = 1 } = o;
    const r = rng(seed);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(ang); ctx.fillStyle = color; ctx.globalAlpha *= alpha;
    const span = 3400;
    for (let i = 0; i < n; i++) {
      const y = (r() - 0.5) * 2600, th = thick[0] + r() * (thick[1] - thick[0]);
      const l = len[0] + r() * (len[1] - len[0]), sp = speed * (0.6 + r() * 0.8), x0 = r() * span;
      let x = ((x0 + t * sp) % span) - span / 2;
      if (dir < 0) x = -x;
      ctx.beginPath(); ctx.roundRect(x - l / 2, y - th / 2, l, th, th / 2); ctx.fill();
    }
    ctx.restore();
  }
  function starburst(ctx, cx, cy, rIn, rOut, n, rot, color, seed = 0) {
    const r = rng(seed);
    ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * TAU, rad = i % 2 ? rIn : rOut * (0.7 + r() * 0.5);
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  }
  function motes(ctx, t, seed, n, color) {
    const r = rng(seed);
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = (r() * W + Math.sin(t * 0.5 + i) * 30), y = ((r() * H) - t * (8 + r() * 20) + H * 3) % H, s = 1.5 + r() * 3;
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    }
  }
  function stampText(ctx, text, x, y, size, rot, lt, color = C.pink) {
    if (lt < 0) return;
    const k = 1 + 0.9 * Math.pow(1 - clamp(lt / 0.1), 2);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(k, k);
    ctx.font = `${size}px ${ULTRA}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink; ctx.fillText(text, size * 0.05, size * 0.05);
    ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // ---------- the cast, from the game's geometry ----------
  const P2 = (d) => new Path2D(d);
  const E2 = (cx, cy, rx, ry) => { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, 0, 0, TAU); return p; };
  const RR = (x, y, w, h, r) => { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; };
  const LW = 1.4; // outlines heavier than the game's engraving
  function shadeP(ctx, p, d, color) {
    const pat = PAT[color];
    if (!pat || !d) return;
    ctx.save(); ctx.clip(p);
    const q = new Path2D(); q.rect(-3000, -3000, 6000, 6000);
    q.addPath(p, new DOMMatrix([1, 0, 0, 1, -d, -d]));
    pat.setTransform(ctx.getTransform().inverse());
    ctx.fillStyle = pat; ctx.fill(q, 'evenodd');
    ctx.restore();
  }
  function part(ctx, p, fill, lw, d = 0) {
    ctx.fillStyle = fill; ctx.fill(p);
    shadeP(ctx, p, d, fill);
    if (lw) { ctx.lineWidth = lw * LW; ctx.strokeStyle = C.ink; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(p); }
  }
  function inkLine(ctx, pts, w, color = C.ink) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < pts.length; i += 4) { ctx.moveTo(pts[i], pts[i + 1]); ctx.lineTo(pts[i + 2], pts[i + 3]); }
    ctx.stroke(); ctx.restore();
  }
  const dot = (ctx, x, y, r, c = C.ink) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };

  const DODO = {
    feet: [RR(-9, 44, 6, 12, 3), RR(-13, 53, 12, 5, 2.5), RR(3, 44, 6, 12, 3), RR(1, 53, 12, 5, 2.5)],
    body: E2(0, 32, 20, 16), belly: E2(0, 35, 12, 10), wingL: RR(-30, 24, 14, 11, 5.5), wingR: RR(16, 24, 14, 11, 5.5),
    stem: P2('M-0.9 -26 C-1.1 -28.6 -0.4 -30.3 2.2 -32 C2.8 -30.7 2.2 -28.6 1.3 -26 Z'),
    leafL: P2('M0.9 -30.9 C-3.9 -36.5 -11.3 -37.4 -16.1 -34.4 C-13.9 -28.7 -5.7 -27.4 0.9 -30.9 Z'),
    leafR: P2('M1.7 -32.2 C3.9 -37.8 10.9 -39.6 16.1 -37.8 C15.2 -32.2 8.3 -29.2 1.7 -32.2 Z'),
    head: E2(0, 0, 26, 26),
    face: P2('M-20 4 C-20 -7 -15 -13 -6.5 -12 Q0 -7.5 6.5 -12 C15 -13 20 -7 20 4 C20 16 11 24 0 24 C-11 24 -20 16 -20 4 Z'),
    cheekL: E2(-15.6, 8.4, 5.4, 3.6), cheekR: E2(15.6, 8.4, 5.4, 3.6), beak: E2(0, 6.3, 6.8, 5), eye: E2(0, 0, 5.5, 5.5),
    crown: P2('M-7 -24.5 q-1.4 -2.6 -0.4 -4.6 M-3.2 -25.6 q-0.6 -2.6 0.6 -4.4 M-10.6 -22.6 q-1.8 -2 -1.4 -4.2'),
  };
  // Origin at the feet. Height ≈ 96 units (sprout tip to toes).
  function drawDodo(ctx, x, y, s, o = {}) {
    const { angry = true, roll = 0, sx = 1, sy = 1, wing = 0, look = 0, blink = 1, glow = 0, spec = false, shadow = true, alpha = 1 } = o;
    const teal = spec ? C.grey : C.teal, mari = spec ? '#d8cfbd' : C.mari, leaf = spec ? C.grey : C.leaf;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= alpha;
    if (shadow) { ctx.save(); ctx.scale(s, s); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill(E2(0, 1, 26, 4.8)); ctx.restore(); }
    ctx.rotate(roll); ctx.scale(s * sx, s * sy); ctx.translate(0, -58);
    if (glow > 0 && !spec) {
      ctx.save(); ctx.shadowColor = `rgba(61,59,255,${clamp(glow * 0.9)})`; ctx.shadowBlur = Math.min(170, 16 * s * glow);
      ctx.fillStyle = teal; ctx.fill(DODO.head); ctx.fill(DODO.body); ctx.restore();
    }
    for (const f of DODO.feet) part(ctx, f, mari, 1.5);
    part(ctx, DODO.body, teal, 2.1, 5);
    part(ctx, DODO.belly, spec ? '#d8cfbd' : C.paper, 1);
    const wa = (wing * Math.PI) / 180;
    ctx.save(); ctx.translate(-23, 29); ctx.rotate((20 * Math.PI) / 180 + wa); ctx.translate(23, -29); part(ctx, DODO.wingL, teal, 1.8, 3); ctx.restore();
    ctx.save(); ctx.translate(23, 29); ctx.rotate((-20 * Math.PI) / 180 - wa); ctx.translate(-23, -29); part(ctx, DODO.wingR, teal, 1.8, 3); ctx.restore();
    for (const p of [DODO.stem, DODO.leafL, DODO.leafR]) part(ctx, p, leaf, 1.3, 1.5);
    part(ctx, DODO.head, teal, 2.1, 6);
    ctx.lineWidth = 1.3 * LW; ctx.strokeStyle = C.ink; ctx.stroke(DODO.crown);
    part(ctx, DODO.face, spec ? '#e4dccb' : C.paper, 1.5);
    if (!spec) {
      ctx.save(); ctx.globalAlpha *= 0.6; ctx.fillStyle = C.pig; ctx.fill(DODO.cheekL); ctx.fill(DODO.cheekR); ctx.restore();
    }
    const mad = angry && !spec;
    for (const sd of [-1, 1]) {
      ctx.save();
      if (mad) { const cl = new Path2D(); cl.moveTo(sd * 22, -10.3); cl.lineTo(sd * 1, -3.3); cl.lineTo(sd * 1, 12); cl.lineTo(sd * 22, 12); cl.closePath(); ctx.clip(cl); }
      ctx.translate(sd * 9.4 + look, -2); ctx.scale(1, Math.max(0.05, blink));
      if (!spec) { ctx.fillStyle = C.ink; ctx.fill(DODO.eye); dot(ctx, -sd * 1.8, -1.6, 2, C.paper); dot(ctx, sd * 1.9, 2.3, 0.9, C.paper); }
      else { part(ctx, DODO.eye, C.paper, 1.2); dot(ctx, 0, 0, 1.7); }
      ctx.restore();
    }
    if (mad) inkLine(ctx, [-16.5, -9.6, -3.8, -5, 16.5, -9.6, 3.8, -5], 3.4);
    part(ctx, DODO.beak, mari, 1.5, 1.8);
    dot(ctx, -2.6, 5, 1); dot(ctx, 2.6, 5, 1);
    ctx.restore();
  }

  const EGGP = P2('M0 -24 C12 -24 18 -7 18 4 C18 15 10 21 0 21 C-10 21 -18 15 -18 4 C-18 -7 -12 -24 0 -24 Z');
  const SPECK = (() => { const r = rng(5), a = []; for (let i = 0; i < 15; i++) a.push([(r() - 0.5) * 26, (r() - 0.5) * 34 - 3, 0.8 + r() * 1.9]); return a; })();
  const CRACKS = [P2('M-4 -23 L-1 -15 L-6 -9 L-2 -3'), P2('M17 -2 L9 1 L12 7 L5 10 L7 16'), P2('M-17 6 L-10 5 L-12 12 L-5 13 L-3 20')];
  function drawEgg(ctx, x, y, s, o = {}) {
    const { cracks = 0, glow = 0, shake = 0 } = o;
    ctx.save(); ctx.translate(x + shake, y); ctx.scale(s, s); ctx.rotate(shake * 0.004);
    if (glow) { ctx.save(); ctx.shadowColor = `rgba(247,239,223,${glow})`; ctx.shadowBlur = Math.min(150, 12 * s * glow); ctx.fillStyle = C.paper; ctx.fill(EGGP); ctx.restore(); }
    ctx.fillStyle = C.paper; ctx.fill(EGGP);
    ctx.save(); ctx.clip(EGGP); for (const sp of SPECK) { ctx.fillStyle = C.teal; ctx.fill(E2(sp[0], sp[1], sp[2], sp[2] * 0.8)); } ctx.restore();
    shadeP(ctx, EGGP, 4, C.paper);
    ctx.lineWidth = 2.1 * LW; ctx.strokeStyle = C.ink; ctx.stroke(EGGP);
    ctx.lineWidth = 1.6 * LW; for (let i = 0; i < cracks; i++) ctx.stroke(CRACKS[i]);
    ctx.restore();
  }

  const RAT = { body: E2(0, -10, 17, 10), head: P2('M8 -17 Q22 -18 31 -8 Q22 -2 8 -4 Z'), ear: E2(12, -18, 5, 5.5) };
  function drawRat(ctx, x, y, s, o = {}) {
    const { dir = 1, t = 0, run = true, ko = false, rot = 0, sil = false, silColor = C.ink } = o;
    ctx.save(); ctx.translate(x, y - (run ? Math.abs(Math.sin(t * 18)) * 2 * s : 0));
    if (ko) { ctx.translate(0, -10 * s); ctx.rotate(rot); ctx.translate(0, 10 * s); }
    ctx.scale(dir * s, s);
    const w = Math.sin(t * 14) * 3, tail = P2(`M-15 -8 C-28 ${-12 + w} -32 ${2 - w} -46 ${-6 + w}`);
    ctx.lineCap = 'round'; ctx.strokeStyle = sil ? silColor : C.ink; ctx.lineWidth = 3.6; ctx.stroke(tail);
    if (!sil) { ctx.strokeStyle = C.pig; ctx.lineWidth = 1.6; ctx.stroke(tail); }
    const s1 = run ? Math.sin(t * 26) * 4 : 0;
    inkLine(ctx, [-9, -4, -9 + s1, 1, 9, -4, 9 - s1, 1], 2.6, sil ? silColor : C.ink);
    if (sil) {
      ctx.fillStyle = silColor; ctx.fill(RAT.body); ctx.fill(RAT.head); ctx.fill(RAT.ear);
      dot(ctx, 21, -12, 2.2, C.pink);
    } else {
      part(ctx, RAT.body, C.rat, 2, 5); part(ctx, RAT.head, C.rat, 2, 3); part(ctx, RAT.ear, C.pig, 1.6);
      if (ko) inkLine(ctx, [19, -14, 23, -10, 19, -10, 23, -14], 1.6);
      else { dot(ctx, 21, -12, 2.1); dot(ctx, 21.6, -12.6, 0.6, C.pig); inkLine(ctx, [17, -16.2, 24.5, -14], 1.8); }
      part(ctx, E2(31, -8, 2.3, 2.3), C.pig, 1);
      inkLine(ctx, [27, -8, 38, -12, 27, -7, 39, -8, 27, -6, 37, -3], 0.8);
    }
    ctx.restore();
  }
  const PIG = { body: E2(0, -21, 27, 17), head: E2(22, -27, 12.5, 12), snout: E2(34, -24, 5, 6.5), ear: P2('M14 -35 L18 -47 L26 -36 Z') };
  function drawPig(ctx, x, y, s, o = {}) {
    const { dir = 1, t = 0, run = true, ko = false, rot = 0 } = o;
    ctx.save(); ctx.translate(x, y - (run ? Math.abs(Math.sin(t * 14)) * 2 * s : 0));
    if (ko) { ctx.translate(0, -20 * s); ctx.rotate(rot); ctx.translate(0, 20 * s); }
    ctx.scale(dir * s, s);
    const sw = run ? Math.sin(t * 16) * 3.5 : 0;
    inkLine(ctx, [-15, -8, -15 + sw, 0, 13, -8, 13 - sw, 0], 5);
    ctx.lineWidth = 1.8 * LW; ctx.strokeStyle = C.ink; ctx.stroke(P2('M-26 -27 c-6 -3 -8 -9 -3 -10 c5 -1 3 6 -2 4'));
    part(ctx, PIG.body, C.pig, 2.2, 6);
    inkLine(ctx, [-7, -8, -7 - sw, 0, 19, -8, 19 + sw, 0], 5);
    part(ctx, PIG.ear, C.pig, 1.6); part(ctx, PIG.head, C.pig, 2.2, 4); part(ctx, PIG.snout, '#ffb8cb', 1.8);
    ctx.fillStyle = C.ink; ctx.fill(E2(33, -26.5, 1.1, 1.8)); ctx.fill(E2(33.5, -21.5, 1.1, 1.8));
    if (ko) inkLine(ctx, [23, -32, 27, -28, 23, -28, 27, -32], 1.8);
    else { dot(ctx, 25, -30, 2.1); inkLine(ctx, [20.5, -35, 29, -32.5], 2.2); }
    inkLine(ctx, [26, -18.5, 30.5, -17.5], 1.4);
    ctx.restore();
  }
  const MAC = { body: E2(0, -18, 13, 15), head: E2(4, -39, 12, 11.5), earL: E2(-8, -41, 4.2, 4.8), earR: E2(15.5, -42, 3.8, 4.4),
    face: P2('M5 -48 C11 -49 15 -44 15 -38 C15 -32 11 -29 7 -30 C3 -31 0 -34 1 -39 C1 -44 2 -47 5 -48 Z') };
  function drawMonkey(ctx, x, y, s, o = {}) {
    const { dir = 1, air = true, ko = false, rot = 0 } = o;
    ctx.save(); ctx.translate(x, y); if (ko) { ctx.translate(0, -24 * s); ctx.rotate(rot); ctx.translate(0, 24 * s); }
    ctx.scale(dir * s, s);
    ctx.lineCap = 'round'; ctx.strokeStyle = C.ink; ctx.lineWidth = 4.2; ctx.stroke(P2('M-10 -12 C-26 -12 -30 -32 -19 -40'));
    const limb = (pts) => { inkLine(ctx, pts, 4.6); inkLine(ctx, pts, 2, C.mari); };
    limb(air ? [-6, -6, -13, -3, 6, -6, 13, -3] : [-6, -6, -8, 0, 6, -6, 8, 0]);
    part(ctx, MAC.body, C.mari, 2, 5);
    limb(air ? [-7, -27, -15, -45, 7, -27, 17, -45] : [-8, -25, -12, -8, 8, -25, 13, -8]);
    part(ctx, MAC.earL, C.mari, 2); part(ctx, MAC.earR, C.mari, 2); part(ctx, MAC.head, C.mari, 2, 4);
    part(ctx, MAC.face, '#f7c7b0', 1.4);
    if (ko) { inkLine(ctx, [5, -41.5, 8, -38.5, 5, -38.5, 8, -41.5, 10.3, -41.5, 13.3, -38.5, 10.3, -38.5, 13.3, -41.5], 1.4); }
    else { dot(ctx, 6.5, -40, 1.8); dot(ctx, 11.8, -40, 1.8); inkLine(ctx, [3.5, -44.5, 8.5, -42.5, 14.5, -44.5, 10, -42.5], 1.8); }
    ctx.fillStyle = C.ink; ctx.fill(E2(10, -33, 2.2, 2.7));
    ctx.restore();
  }
  function drawShip(ctx, x, y, s, t, sil = false) {
    ctx.save(); ctx.translate(x, y + Math.sin(t * 1.6) * 1.5 * s); ctx.rotate(Math.sin(t * 1.2) * 0.025); ctx.scale(s, s);
    const fillc = (c) => (sil ? C.ink : c);
    for (const [mx, top] of [[-18, -54], [0, -64], [16, -50]]) inkLine(ctx, [mx, -10, mx, top], 1.8);
    for (const [mx, w, y0, h] of [[-18, 9, -50, 15], [-18, 8, -32, 15], [0, 11, -60, 17], [0, 10, -40, 19], [16, 8, -46, 13], [16, 7, -30, 13]]) {
      const sail = P2(`M${mx - w} ${y0} Q${mx} ${y0 - 3} ${mx + w} ${y0} L${mx + w} ${y0 + h} Q${mx} ${y0 + h + 4} ${mx - w} ${y0 + h} Z`);
      part(ctx, sail, fillc(C.paper), 1.3, 2.5);
    }
    const fw = Math.sin(t * 5) * 1.5;
    [[0, C.mari], [1, C.paper], [2, C.teal]].forEach(([i, c]) => { ctx.fillStyle = sil ? C.pink : c; ctx.fill(P2(`M0 ${-64 + i * 3} L14 ${-64 + i * 3 + fw} L14 ${-61 + i * 3 + fw} L0 ${-61 + i * 3} Z`)); });
    const hull = P2('M-40 -10 L22 -10 L24 -22 L42 -22 L40 -10 L34 2 Q0 7 -32 2 Z');
    part(ctx, hull, fillc(C.mari), 1.7, 3);
    inkLine(ctx, [-36, -5, 38, -5], 1.2, sil ? C.pink : C.ink);
    for (let i = 0; i < 4; i++) dot(ctx, -24 + i * 12, -2, 1.4, sil ? C.pink : C.ink);
    ctx.restore();
  }
  function drawCrate(ctx, x, y, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    const cr = RR(-17, -14, 34, 28, 2);
    part(ctx, cr, C.mari, 2, 4); inkLine(ctx, [-17, -6, 17, -6, -17, 6, 17, 6], 1.2);
    ctx.font = `10px ${ULTRA}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.ink; ctx.fillText('VOC', 0, 0.5);
    ctx.restore();
  }
  function swarm(ctx, t, o = {}) {
    const { n = 40, seed = 3, y0 = 1400, y1 = 1900, speed = 500, dir = 1, s = [2, 4], sil = true, silColor = C.ink } = o;
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const sc = s[0] + r() * (s[1] - s[0]), sp = speed * (0.7 + r() * 0.6), x0 = r() * 1800, y = y0 + r() * (y1 - y0);
      let x = ((x0 + t * sp) % 1800) - 360;
      if (dir < 0) x = W - x;
      drawRat(ctx, x, y, sc, { dir, t: t + i, sil, silColor });
    }
  }
  function bellJar(ctx, cx, bottom, w, h, alpha = 0.55) {
    ctx.save(); ctx.strokeStyle = `rgba(247,239,223,${alpha})`; ctx.lineWidth = 6;
    const p = new Path2D(); p.moveTo(cx - w / 2, bottom); p.lineTo(cx - w / 2, bottom - h + w / 2); p.arc(cx, bottom - h + w / 2, w / 2, Math.PI, 0); p.lineTo(cx + w / 2, bottom);
    ctx.fillStyle = 'rgba(126,200,210,0.05)'; ctx.fill(p); ctx.stroke(p);
    ctx.lineWidth = 10; ctx.strokeStyle = `rgba(247,239,223,${alpha * 0.5})`;
    ctx.beginPath(); ctx.arc(cx, bottom - h + w / 2, w / 2 - 40, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w / 2 + 40, bottom - h + w / 2 + 40); ctx.lineTo(cx - w / 2 + 40, bottom - 120); ctx.stroke();
    ctx.restore();
  }
  function plinth(ctx, cx, top, s, year = '1662') {
    ctx.save(); ctx.translate(cx, top); ctx.scale(s, s);
    part(ctx, RR(-62, 0, 124, 42, 2), '#d8cfbd', 2, 4);
    inkLine(ctx, [-66, 0, 66, 0], 3);
    part(ctx, RR(-48, 9, 96, 24, 1.5), C.paper, 1);
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `italic 11px ${FELL}`; ctx.fillText('Raphus cucullatus', 0, 20);
    ctx.font = `10px ${FELLSC}`; ctx.fillText(`1598 – ${year}`, 0, 30);
    ctx.restore();
  }
  function thermo(ctx, cx, top, bottom, P, flash) {
    const r = 70, tw = 44, by = bottom - r;
    const glass = new Path2D();
    glass.moveTo(cx - tw / 2, by - r * 0.7); glass.lineTo(cx - tw / 2, top + tw / 2); glass.arc(cx, top + tw / 2, tw / 2, Math.PI, 0);
    glass.lineTo(cx + tw / 2, by - r * 0.7); glass.arc(cx, by, r, -Math.PI / 2 + 0.33, -Math.PI / 2 - 0.33 + TAU); glass.closePath();
    ctx.fillStyle = C.paper; ctx.fill(glass);
    const h = (clamp(P, 0, 100) / 100) * (by - top - tw);
    ctx.save(); ctx.clip(glass);
    ctx.fillStyle = flash ? '#ff9a7a' : C.pink;
    ctx.fillRect(cx - tw / 2 + 8, by - h, tw - 16, h); ctx.beginPath(); ctx.arc(cx, by, r - 10, 0, TAU); ctx.fill();
    ctx.restore();
    shadeP(ctx, glass, 8, C.paper);
    ctx.lineWidth = 8; ctx.strokeStyle = C.ink; ctx.stroke(glass);
    for (let i = 1; i < 5; i++) { const y = by - r * 0.7 - ((by - r * 0.7 - top - tw) * i) / 5; inkLine(ctx, [cx - tw / 2, y, cx - tw / 2 - 26, y], 5); }
  }

  // ---------- the shots ----------
  function sea(ctx, t, sunY, sunR) {
    bg(ctx, C.night);
    glowAt(ctx, 540, sunY, sunR * 2.2, 'rgba(255,75,31,0.28)');
    // halftone sun: pink dots, bigger toward the bottom
    ctx.save(); ctx.beginPath(); ctx.arc(540, sunY, sunR, 0, TAU); ctx.clip();
    ctx.fillStyle = C.pink; ctx.fillRect(540 - sunR, sunY - sunR, sunR * 2, sunR * 2);
    ctx.fillStyle = C.night;
    for (let y = sunY - sunR; y < sunY + sunR; y += 26) { const k = (y - (sunY - sunR)) / (2 * sunR); if (k > 0.45) ctx.fillRect(540 - sunR, y, sunR * 2, (k - 0.45) * 26); }
    ctx.restore();
    ctx.fillStyle = C.night; ctx.fillRect(-300, sunY + sunR * 0.42, W + 600, H);
    ctx.fillStyle = 'rgba(255,75,31,0.35)';
    const r = rng(8);
    for (let i = 0; i < 26; i++) { const y = sunY + sunR * 0.45 + i * 22 + r() * 8, w = (380 - i * 11) * (0.6 + r() * 0.6), x = 540 + Math.sin(t * 1.5 + i) * 20; if (w > 0) ctx.fillRect(x - w / 2, y, w, 4); }
    inkLine(ctx, [-100, sunY + sunR * 0.42, W + 100, sunY + sunR * 0.42], 3, 'rgba(247,239,223,0.5)');
  }

  function introSea(ctx, t, lt, fx) {
    const z = 1 + t * 0.02;
    ctx.save(); ctx.translate(540, 960); ctx.scale(z, z); ctx.translate(-540, -960);
    sea(ctx, t, 1000, 300);
    if (t > 0.6) drawShip(ctx, lerp(1300, 820, eo3((t - 0.6) / 2)), 1122, 1.6, t, true);
    ctx.restore();
    typeOn(ctx, 'MAURITIUS, 1598.', 540, 1560, t, 0.15, { size: 84, fill: C.paper, align: 'center', track: 4 });
  }
  function introShip(ctx, t, lt, fx) {
    const z = 1 + lt * 0.05;
    ctx.save(); ctx.translate(540, 960); ctx.scale(z, z); ctx.translate(-540, -960);
    sea(ctx, t, 760, 520);
    drawShip(ctx, 560 - lt * 40, 1100, 8.5, t, true);
    ctx.restore();
    typeOn(ctx, 'THE SHIPS HAVE LANDED.', 540, 1560, t, 1.4, { size: 76, fill: C.paper, align: 'center', track: 2 });
  }
  function introEgg(ctx, t, lt, fx) {
    bg(ctx, '#08070a');
    const z = 1 + lt * 0.12;
    ctx.save(); ctx.translate(540, 1000); ctx.scale(z, z); ctx.translate(-540, -1000);
    glowAt(ctx, 540, 1000, 700, 'rgba(247,239,223,0.18)');
    ctx.fillStyle = 'rgba(247,239,223,0.06)'; ctx.beginPath(); ctx.moveTo(420, -100); ctx.lineTo(660, -100); ctx.lineTo(900, 1250); ctx.lineTo(180, 1250); ctx.closePath(); ctx.fill();
    // nest
    const r = rng(44);
    ctx.strokeStyle = '#6f5a3a'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 70; i++) { const a = r() * TAU, x = 540 + Math.cos(a) * (230 + r() * 40), y = 1170 + Math.sin(a) * (60 + r() * 20), l = 50 + r() * 70, b = a + Math.PI / 2 + (r() - 0.5); ctx.moveTo(x - Math.cos(b) * l / 2, y - Math.sin(b) * l / 2); ctx.lineTo(x + Math.cos(b) * l / 2, y + Math.sin(b) * l / 2); }
    ctx.stroke();
    drawEgg(ctx, 540, 1050, 7.5, { glow: 0.5 });
    ctx.restore();
    typeOn(ctx, 'YOU HAVE ONE EGG.', 540, 1560, t, 2.75, { size: 84, fill: C.paper, align: 'center', track: 4 });
  }
  function introEye(ctx, t, lt, fx) {
    bg(ctx, C.lime); field(ctx, 'ink', 0.4);
    const open = eo3((t - 3.78) / 0.12);
    drawDodo(ctx, 540, 2660, 30, { blink: open, glow: 0, shadow: false });
    fx.chroma = 6 + ei3(lt / 0.28) * 16;
  }

  function theyBrought(ctx, t, lt, fx) {
    bg(ctx, C.ink); field(ctx, 'paper', 0.08);
    radial(ctx, 540, 700, { n: 90, color: 'rgba(255,75,31,0.8)', seed: fr(t) >> 1, inner: 520, width: 0.01 });
    swarm(ctx, t, { n: 46, seed: 3, y0: 900, y1: 1900, speed: 900, s: [3, 5.5], silColor: '#5d5563' });
    word(ctx, 'THEY BROUGHT', 540, 420, { size: 250, fill: C.paper, maxW: 1000, slamAt: 4.0, t, rot: -0.05 });
  }
  function rats(ctx, t, lt, fx) {
    bg(ctx, C.pink); field(ctx, 'ink', 0.8);
    radial(ctx, 560, 1000, { n: 120, color: C.ink, seed: fr(t) >> 1, inner: 520, width: 0.012 });
    drawRat(ctx, 520, 1260, 16 * (1 + 0.08 * Math.exp(-lt * 10)), { dir: -1, t, run: false });
    word(ctx, 'RATS.', 540, 420, { size: 460, fill: C.ink, maxW: 1000, slamAt: 4.71, t, rot: -0.04 });
  }
  function pigs(ctx, t, lt, fx) {
    bg(ctx, C.paper); field(ctx, 'ink', 0.35);
    streaks(ctx, 0, { n: 40, color: C.ink, seed: 12, t, speed: 3800, thick: [3, 22], dir: -1 });
    drawPig(ctx, lerp(900, 380, eo3(lt / 0.4)), 1350, 11, { dir: -1, t });
    for (let i = 0; i < 6; i++) { const r = rng(i + 7); dot(ctx, 700 + r() * 300 + lt * 200, 1330 + r() * 40, 18 + r() * 30, 'rgba(22,18,28,0.25)'); }
    word(ctx, 'PIGS.', 540, 440, { size: 460, fill: C.pink, maxW: 1000, slamAt: 5.41, t, rot: 0.04, shadow: C.ink });
  }
  function monkeys(ctx, t, lt, fx) {
    bg(ctx, C.teal); field(ctx, 'ink', 0.6);
    streaks(ctx, -0.9, { n: 30, color: C.paper, seed: 14, t, speed: 3000, thick: [3, 16], alpha: 0.8 });
    const k = eo3(lt / 0.5);
    drawMonkey(ctx, lerp(1100, 560, k), lerp(600, 1250, k), 13, { dir: -1, air: true });
    word(ctx, 'MONKEYS.', 540, 420, { size: 330, fill: C.paper, maxW: 1000, slamAt: 6.08, t, rot: -0.04, shadow: C.ink });
  }
  function wantEgg(ctx, t, lt, fx) {
    const k = eo3(lt / 0.62);
    bg(ctx, C.paper);
    starburst(ctx, 540, 1100, 240, 1500, 22, t * 0.3, C.ink, 5);
    drawEgg(ctx, 540, 1150, 6, { glow: 0 });
    drawRat(ctx, lerp(-200, 260, k), 1500, 7, { dir: 1, t });
    drawPig(ctx, lerp(1300, 850, k), 1560, 5.5, { dir: -1, t });
    drawMonkey(ctx, lerp(1200, 800, k), lerp(200, 760, k), 6, { dir: -1 });
    word(ctx, 'THEY WANT', 540, 330, { size: 280, fill: C.ink, maxW: 1000, slamAt: 6.78, t, rot: 0.03, shadow: C.pink });
  }
  function theEgg(ctx, t, lt, fx) {
    bg(ctx, C.pink); field(ctx, 'ink', 0.8);
    radial(ctx, 540, 1080, { n: 110, color: C.ink, seed: fr(t) >> 1, inner: 560, width: 0.012 });
    drawEgg(ctx, 540, 1180, 17, { cracks: lt > 0.12 ? (lt > 0.35 ? 3 : 2) : 1, shake: Math.sin(t * 70) * 10 });
    word(ctx, 'THE EGG.', 540, 330, { size: 330, fill: C.ink, maxW: 1000, slamAt: 7.45, t, rot: -0.03 });
  }
  function oneDodo(ctx, t, lt, fx) {
    bg(ctx, C.ink); field(ctx, 'paper', 0.1);
    radial(ctx, 540, 900, { n: 120, color: C.lime, seed: fr(t) >> 1, inner: 520, width: 0.011 });
    const stage = t < 8.48 ? 0 : t < 8.82 ? 1 : 2;
    const s = [9, 14, 26][stage], y = [1500, 1850, 2640][stage];
    drawDodo(ctx, 540, y, s * (1 + 0.06 * Math.exp(-(t - [8.15, 8.48, 8.82][stage]) * 10)), { glow: 1.2, wing: stage === 0 ? -20 : 0 });
    if (stage < 2) word(ctx, 'ONE DODO.', 540, 300, { size: 300, fill: C.paper, maxW: 1000, slamAt: 8.15, t });
  }

  const PECKS = [9.17, 9.52, 9.87, 10.22, 10.54, 10.89];
  const PECK_FOES = ['rat', 'pig', 'rat', 'monkey', 'rat', 'pig'];
  const PECK_BG = [C.ink, C.paper, C.pink, C.lime, C.ink, C.paper];
  const PECK_LINES = ['Not today, rodent.', 'Go back to the ship, pig.', 'Flightless, not helpless.', 'Tree privileges revoked.', 'Rat, returned to sender.', 'That pig had a plan.'];
  function peckMontage(ctx, t, lt, fx) {
    let i = 0; for (let k = 0; k < PECKS.length; k++) if (t >= PECKS[k]) i = k;
    const u = t - PECKS[i], bgc = PECK_BG[i], dark = bgc === C.ink;
    bg(ctx, bgc); field(ctx, dark ? 'paper' : 'ink', dark ? 0.1 : 0.45);
    radial(ctx, 700, 1150, { n: 80, color: dark ? C.paper : C.ink, seed: fr(t) >> 1, inner: 480, width: 0.009, alpha: 0.7 });
    const side = i % 2 ? -1 : 1; // the dodo stands on the other side and strikes toward the foe
    const hitAt = 0.11, kL = u < hitAt ? u / hitAt : Math.max(0, 1 - (u - hitAt) / 0.22);
    // anchor offsets put each foe's head at the dodo's beak when the peck lands
    const foe = PECK_FOES[i], F = { rat: [350, 1330, 8], pig: [355, 1420, 6.5], monkey: [214, 1536, 7.5] }[foe];
    const fx0 = 540 + side * F[0], fy0 = F[1];
    const fly = Math.max(0, u - hitAt), ko = u >= hitAt;
    const fxp = fx0 + side * (hitAt - Math.min(u, hitAt)) * 900 + side * fly * 900, fyp = fy0 - fly * 1100 + fly * fly * 2200, rot = side * fly * 11;
    drawDodo(ctx, 540 - side * 220 + side * kL * 140, 1650, 7, { roll: side * kL * 0.5, sx: 1 + kL * 0.1, sy: 1 - kL * 0.08, wing: kL * 40, glow: dark ? 0.8 : 0 });
    if (foe === 'rat') drawRat(ctx, fxp, fyp, F[2], { dir: -side, t, ko, rot, run: !ko });
    else if (foe === 'pig') drawPig(ctx, fxp, fyp, F[2], { dir: -side, t, ko, rot, run: !ko });
    else drawMonkey(ctx, fxp, fyp, F[2], { dir: -side, ko, rot, air: true });
    if (ko) {
      const bx = 540 - side * 90, by = 1180;
      stampText(ctx, 'PECK!', 540, 820, 170, side * -0.1, u - hitAt, C.pink);
      const r = rng(i * 31);
      for (let k = 0; k < 14; k++) { const a = r() * TAU, d = fly * (600 + r() * 900); dot(ctx, bx + Math.cos(a) * d, by + Math.sin(a) * d, 10 + r() * 14, k % 3 ? C.paper : C.pink); }
    }
    word(ctx, `×${i + 1}`, 980, 190, { font: MONO, size: 150, fill: dark ? C.paper : C.ink, align: 'right' });
    word(ctx, PECK_LINES[i], 540, 1830, { font: FELL, style: 'italic', size: 72, fill: dark ? C.paper : C.ink });
    fx.chroma = 5;
  }
  function stripes(ctx, t, lt, fx) {
    const scene = (inv) => {
      bg(ctx, inv ? C.ink : C.paper);
      drawDodo(ctx, 540, 2500, 26, { glow: 0, shadow: false, spec: inv, look: Math.sin(t * 9) * 3 });
    };
    scene(false);
    const n = 7, bw = W / n, off = (lt * 420) % (bw * 2);
    for (let i = -2; i < n + 2; i++) {
      if ((i & 1) === 0) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(i * bw + off - bw, -300, bw, H + 600); ctx.clip();
      ctx.translate(0, Math.sin(t * 9 + i) * 70); scene(true); ctx.restore();
    }
    fx.chroma = 7;
  }
  function meter(ctx, t, lt, fx) {
    const k = clamp(lt / 2.44);
    bg(ctx, '#15121a'); field(ctx, 'paper', 0.12);
    const bi = beatIdx(t), flash = beatEnv(t, 14) > 0.5;
    if (flash) { ctx.fillStyle = 'rgba(255,75,31,0.18)'; ctx.fillRect(-300, -300, W + 600, H + 600); }
    radial(ctx, 700, 1250, { n: 90, color: 'rgba(247,239,223,0.5)', seed: fr(t) >> 1, inner: 480 - k * 120, width: 0.008 });
    const P = 30 + 67 * Math.pow(k, 1.2) + Math.sin(t * 40) * k * 1.5;
    swarm(ctx, t, { n: 28, seed: 9, y0: 1500, y1: 1850, speed: 700, s: [3, 4.5], dir: 1, silColor: '#5d5563' });
    swarm(ctx, t + 3, { n: 28, seed: 10, y0: 1500, y1: 1850, speed: 700, s: [3, 4.5], dir: -1, silColor: '#5d5563' });
    drawEgg(ctx, 700, 1500, 5, { cracks: P > 82 ? 3 : P > 58 ? 2 : 1, shake: P > 75 ? Math.sin(t * 60) * 8 : 0 });
    const peckK = 1 - clamp((t - BEATS[bi]) / 0.15);
    drawDodo(ctx, 700 + (bi % 2 ? 1 : -1) * 170, 1520, 6.5, { roll: (bi % 2 ? 1 : -1) * peckK * 0.45, glow: 0.8, wing: peckK * 40 });
    thermo(ctx, 180, 300, 1500, P, flash);
    word(ctx, 'P(EXTINCT)', 640, 250, { font: MONO, size: 90, fill: C.paper, track: 6 });
    word(ctx, `${Math.round(clamp(P, 0, 99))}%`, 640, 440, { font: MONO, size: 260, fill: C.pink });
    word(ctx, `YEAR ${1598 + Math.floor(63 * k)}`, 640, 650, { font: MONO, size: 110, fill: C.paper, track: 4 });
    fx.chroma = 4 + k * 12;
    if (hitEnv(t, 20) > 0.35) fx.slices = 0.4;
  }
  function boat(ctx, t, lt, fx) {
    sea(ctx, t, 900, 460);
    drawShip(ctx, 540, 1180, 9 * (1 + 0.1 * Math.exp(-lt * 8)), t, true);
    for (let i = 0; i < 5; i++) { const r = rng(i + 70); glowAt(ctx, 300 + r() * 500, 560 - lt * 300 - r() * 200, 160, 'rgba(247,239,223,0.2)'); }
    fx.chroma = 9; fx.slices = 0.25;
  }

  function museum(ctx, t, lt, fx) {
    bg(ctx, '#0b0a0e');
    // wide, then a cut in close on the specimen halfway through the line
    const close = t >= 16.37, z = close ? 2.1 + (t - 16.37) * 0.04 : 1 + lt * 0.025, cy = close ? 1020 : 1100;
    const flick = fr(t) % 53 < 2 ? 0.35 : 1;
    ctx.save(); ctx.translate(540, cy); ctx.scale(z, z); ctx.translate(-540, cy === 1020 ? -1020 : -1100);
    ctx.fillStyle = `rgba(247,239,223,${0.07 * flick})`; ctx.beginPath(); ctx.moveTo(430, -100); ctx.lineTo(650, -100); ctx.lineTo(980, 1500); ctx.lineTo(100, 1500); ctx.closePath(); ctx.fill();
    glowAt(ctx, 540, 1150, 650, 'rgba(247,239,223,0.12)');
    drawDodo(ctx, 540, 1400, 6.6, { spec: true, shadow: true });
    plinth(ctx, 540, 1400, 4.4);
    bellJar(ctx, 540, 1400, 640, 830);
    ctx.restore();
    motes(ctx, t, 4, 50, 'rgba(247,239,223,0.35)');
    typeOn(ctx, 'THE LAST DODO', 540, 260, t, 15.0, { size: 80, fill: C.paper, align: 'center', track: 4 });
    typeOn(ctx, 'WAS SEEN IN 1662.', 540, 350, t, 15.9, { size: 80, fill: C.paper, align: 'center', track: 4 });
    fx.grain = 0.1;
  }
  function history(ctx, t, lt, fx) {
    bg(ctx, '#0b0a0e');
    const z = 1.02 + lt * 0.02;
    ctx.save(); ctx.translate(540, 1150); ctx.scale(z, z); ctx.translate(-540, -1150);
    glowAt(ctx, 540, 1150, 900, 'rgba(247,239,223,0.14)');
    plinth(ctx, 540, 900, 10);
    ctx.restore();
    word(ctx, 'HISTORY SAYS', 540, 380, { size: 200, fill: C.paper, maxW: 980, slamAt: 18.11, t });
    word(ctx, 'YOU LOSE.', 540, 1650, { size: 300, fill: C.pink, maxW: 980, slamAt: 19.46, t });
    if (t > 19.46) stampText(ctx, 'EXTINCT', 540, 1180, 170, -0.16, t - 19.46, C.pink);
    motes(ctx, t, 5, 40, 'rgba(247,239,223,0.3)');
  }
  function unless(ctx, t, lt, fx) {
    bg(ctx, '#0b0a0e');
    const z = 1 + lt * 0.05;
    const eyeX = 540 - 9.4 * 22, eyeY = 2200 + (-58 - 2) * 22;
    ctx.save(); ctx.translate(540, 1000); ctx.scale(z, z); ctx.translate(-540, -1000);
    glowAt(ctx, 540, 1000, 900, 'rgba(247,239,223,0.12)');
    const blinkK = t > 21.52 && t < 21.87 ? Math.abs((t - 21.7) / 0.17) : 1;
    drawDodo(ctx, 540, 2200, 22, { spec: true, shadow: false, blink: blinkK });
    const live = t > 21.7 ? eo3((t - 21.7) / 1.4) : 0;
    if (live > 0) {
      ctx.save(); ctx.beginPath(); ctx.arc(eyeX, eyeY, 20 + live * 1500, 0, TAU); ctx.clip();
      bg(ctx, '#0b0a0e'); glowAt(ctx, 540, 1000, 900, 'rgba(61,59,255,0.25)');
      drawDodo(ctx, 540, 2200, 22, { shadow: false, blink: blinkK, glow: live });
      ctx.restore();
    }
    ctx.restore();
    word(ctx, 'UNLESS.', 540, 300, { size: 240, fill: C.paper, slamAt: 20.83, t });
    fx.chroma = live * 8;
  }
  function shatter(ctx, t, lt, fx) {
    bg(ctx, '#0b0a0e');
    const zk = ei3((t - 24.6) / 0.7), z = 1 + zk * 2.2;
    ctx.save(); ctx.translate(540, 900); ctx.scale(z, z); ctx.translate(-540, -900);
    glowAt(ctx, 540, 1100, 800, 'rgba(61,59,255,0.3)');
    if (t > 24.26) radial(ctx, 540, 1000, { n: 110, color: 'rgba(182,242,58,0.8)', seed: fr(t) >> 1, inner: 520, width: 0.01 });
    const b = beatEnv(t, 10);
    drawDodo(ctx, 540, 1400, 6.6 * (1 + b * 0.04), { glow: 1 + b, wing: t > 24.26 ? 30 : 0 });
    plinth(ctx, 540, 1400, 4.4);
    if (t < 24.26) {
      bellJar(ctx, 540, 1400, 640, 830, 0.6);
      const cracks = Math.floor(clamp((t - 23.24) / 1.0) * 6) + 1;
      ctx.strokeStyle = 'rgba(247,239,223,0.85)'; ctx.lineWidth = 4;
      for (let c = 0; c < cracks; c++) {
        const r = rng(c + 90); let x = 540 + (r() - 0.5) * 500, y = 700 + r() * 500; ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 140; y += (r() - 0.3) * 120; ctx.lineTo(x, y); } ctx.stroke();
      }
    } else {
      const u = t - 24.26, r = rng(55);
      ctx.fillStyle = 'rgba(210,235,240,0.55)'; ctx.strokeStyle = 'rgba(247,239,223,0.9)'; ctx.lineWidth = 3;
      for (let k = 0; k < 40; k++) {
        const a = r() * TAU, sp = 700 + r() * 1400, x = 540 + Math.cos(a) * (120 + sp * u), y = 1000 + Math.sin(a) * (120 + sp * u) + u * u * 900, sz = 30 + r() * 60, rot = r() * 6 + u * (r() - 0.5) * 20;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.6, sz * 0.5); ctx.lineTo(-sz * 0.5, sz * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
    word(ctx, 'BEAT HISTORY.', 540, 330, { size: 250, fill: C.pink, maxW: 1000, slamAt: 23.92, t, shadow: C.ink });
    if (t > 24.26 && t < 24.36) fx.flash = 0.6;
    fx.flash = Math.max(fx.flash, clamp((t - 25.05) / 0.22) * 0.95);
    fx.chroma = 4 + zk * 18;
  }

  function finalPeck(ctx, t, lt, fx) {
    bg(ctx, C.pink); field(ctx, 'ink', 0.85);
    radial(ctx, 540, 1100, { n: 130, color: C.ink, seed: fr(t) >> 1, inner: 500, width: 0.012 });
    const kL = Math.max(0, 1 - lt / 0.3);
    drawDodo(ctx, 540, 1700, 11, { roll: -kL * 0.4, sx: 1 + kL * 0.1, sy: 1 - kL * 0.08, wing: 30 + kL * 30 });
    word(ctx, 'PECK', 540, 420, { size: 460, font: ULTRA, fill: C.ink, maxW: 930, slamAt: 25.29, t, rot: -0.04 });
  }
  function finalOr(ctx, t, lt, fx) {
    bg(ctx, C.ink); field(ctx, 'paper', 0.1);
    radial(ctx, 540, 1150, { n: 100, color: C.lime, seed: fr(t) >> 1, inner: 520, width: 0.011 });
    drawEgg(ctx, 540, 1250, 11, { glow: 0.6 });
    word(ctx, 'OR', 540, 400, { size: 460, font: ULTRA, fill: C.paper, slamAt: 25.98, t, rot: 0.04 });
  }
  function finalPerish(ctx, t, lt, fx) {
    bg(ctx, C.paper); field(ctx, 'ink', 0.5);
    swarm(ctx, t, { n: 50, seed: 21, y0: 800, y1: 1900, speed: 1100, s: [4, 7], dir: -1 });
    word(ctx, 'PERISH', 540, 420, { size: 300, font: ULTRA, fill: C.pink, maxW: 1020, slamAt: 26.66, t, rot: -0.04, shadow: C.ink });
  }
  function titleCard(ctx, t, lt, fx) {
    bg(ctx, C.ink); field(ctx, 'paper', 0.1);
    radial(ctx, 540, 1150, { n: 110, color: 'rgba(255,75,31,0.55)', seed: fr(t) >> 1, inner: 560, width: 0.009 });
    swarm(ctx, t, { n: 16, seed: 31, y0: 1500, y1: 1580, speed: 350, s: [2.5, 3.5], dir: 1, silColor: '#5d5563' });
    swarm(ctx, t, { n: 16, seed: 32, y0: 1500, y1: 1580, speed: 350, s: [2.5, 3.5], dir: -1, silColor: '#5d5563' });
    const b = beatEnv(t, 10);
    drawDodo(ctx, 540, 1470, 7.2 * (1 + b * 0.03), { glow: 1.2, wing: b * 25 });
    drawEgg(ctx, 300, 1450, 3.4);
    word(ctx, 'PECK', 540, 290, { size: 280, font: ULTRA, fill: C.paper, slamAt: 27.35, t, shadow: C.pink });
    word(ctx, 'OR', 540, 450, { size: 130, font: ULTRA, fill: C.lime, slamAt: 27.52, t });
    word(ctx, 'PERISH', 540, 600, { size: 240, font: ULTRA, fill: C.paper, maxW: 1000, slamAt: 27.7, t, shadow: C.pink });
    if (t > 28.03) word(ctx, 'How long can you last?', 540, 1680, { font: FELL, style: 'italic', size: 82, fill: C.paper, slamAt: 28.03, t });
    if (t > 28.72) {
      const q = t < 29.4 ? String(1600 + Math.floor(rng(fr(t))() * 99)) : '????';
      word(ctx, `1598 → ${q}`, 540, 1780, { font: MONO, size: 96, fill: C.pink, track: 4 });
    }
    if (t > 29.07) word(ctx, 'AT EVERY REST STOP IN DODO', 540, 1870, { font: MONO, size: 54, fill: 'rgba(247,239,223,0.8)', track: 6 });
    if ((t >= 29.05 && t < 29.12) || (t >= 29.4 && t < 29.47)) fx.invert = true;
  }

  const SHOTS = [
    [0, 1.35, introSea], [1.35, 2.7, introShip], [2.7, 3.72, introEgg], [3.72, 4.0, introEye],
    [4.0, 4.71, theyBrought], [4.71, 5.41, rats], [5.41, 6.08, pigs], [6.08, 6.78, monkeys],
    [6.78, 7.45, wantEgg], [7.45, 8.15, theEgg], [8.15, 9.17, oneDodo], [9.17, 11.24, peckMontage],
    [11.24, 11.91, stripes], [11.91, 14.35, meter], [14.35, 14.7, boat], [14.7, 18.11, museum],
    [18.11, 20.83, history], [20.83, 23.24, unless], [23.24, 25.29, shatter], [25.29, 25.98, finalPeck],
    [25.98, 26.66, finalOr], [26.66, 27.35, finalPerish], [27.35, 30.01, titleCard],
  ].map(([a, b, draw]) => ({ a, b, draw }));

  // ---------- post ----------
  function chroma(o, src, amt) {
    o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
    for (const [col, d] of [['#f00', amt], ['#0f0', 0], ['#00f', -amt]]) {
      tctx.globalCompositeOperation = 'source-over'; tctx.drawImage(src, 0, 0);
      tctx.globalCompositeOperation = 'multiply'; tctx.fillStyle = col; tctx.fillRect(0, 0, W, H);
      o.globalCompositeOperation = 'lighter';
      const k = d === 0 ? 1 : 1 + Math.abs(d) / 400, w = W * k, h = H * k;
      o.drawImage(tmp, (W - w) / 2 + d / 2, (H - h) / 2, w, h);
    }
    o.globalCompositeOperation = 'source-over';
    tctx.globalCompositeOperation = 'source-over';
  }
  function slice(o, t, amt) {
    t2ctx.drawImage(out, 0, 0);
    const r = rng(fr(t) * 13 + 5), n = 3 + Math.floor(amt * 8);
    for (let i = 0; i < n; i++) {
      const y = r() * H, h = 20 + r() * 220 * amt, dx = (r() - 0.5) * 280 * amt;
      o.drawImage(tmp2, 0, y, W, h, dx, y, W, h);
    }
  }
  function post(t, fx) {
    const o = octx;
    o.save(); o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    if (fx.chroma > 1.5) chroma(o, buf, fx.chroma); else o.drawImage(buf, 0, 0);
    if (fx.slices > 0) slice(o, t, fx.slices);
    if (fx.invert) { o.globalCompositeOperation = 'difference'; o.fillStyle = '#fff'; o.fillRect(0, 0, W, H); o.globalCompositeOperation = 'source-over'; }
    if (fx.flash > 0.01) { o.fillStyle = `rgba(255,250,240,${clamp(fx.flash)})`; o.fillRect(0, 0, W, H); }
    o.globalAlpha = fx.grain; o.drawImage(GRAIN[fr(t) % 4], 0, 0, W, H);
    o.globalAlpha = 1; o.drawImage(VIG, 0, 0);
    const r = rng(fr(t) * 3 + 1);
    o.fillStyle = 'rgba(247,239,223,0.16)';
    for (let i = 0; i < 2; i++) if (r() < 0.5) o.fillRect(r() * W, 0, 1.5, H);
    if (t > 29.85) { o.fillStyle = '#000'; o.fillRect(0, 0, W, H); }
    o.restore();
  }

  function renderAt(t) {
    init();
    const shot = SHOTS.find((s) => t >= s.a && t < s.b) || SHOTS[SHOTS.length - 1];
    const lt = t - shot.a;
    const fx = { chroma: 0, slices: 0, invert: false, flash: 0, grain: 0.07 };
    const ctx = bctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
    const h = hitEnv(t), r = rng(fr(t) * 7 + 3), sh = h * 34, punch = 1 + h * 0.06;
    ctx.translate(W / 2 + (r() - 0.5) * sh, H / 2 + (r() - 0.5) * sh); ctx.scale(punch, punch); ctx.translate(-W / 2, -H / 2);
    shot.draw(ctx, t, lt, fx);
    ctx.restore();
    fx.chroma += h * 14;
    fx.flash = Math.max(fx.flash, h * 0.4);
    post(t, fx);
  }

  window.renderAt = renderAt;
  window.DURATION = 30;
  window.FPS = FPS;
})();
