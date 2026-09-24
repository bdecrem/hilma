// Strangers — a 30-second vertical edit drawn frame by frame in code.
// Two strangers from the emoji keyboard: Volt (⚡) and Boo (👻).
// window.renderAt(t) paints the frame at t seconds (clip time) onto #c.
(function () {
  const W = 1080, H = 1920, FPS = 30;
  const C = {
    ink: '#0b0b0d', paper: '#ece6d6', volt: '#ffd60a', deep: '#c98a00',
    cyan: '#7ef6ff', pink: '#ff7a9a', night: '#0d0f14',
  };
  const ANTON = '"Anton", Impact, sans-serif';
  const MONO = '"VT323", monospace';
  const GROT = '"Space Grotesk", sans-serif';

  // Measured with librosa on the song from 0:58 to 1:28: 152 BPM, the drop at 3.76 s.
  const BEATS = [0.07, 0.51, 0.93, 1.35, 1.76, 2.18, 2.58, 2.97, 3.37, 3.76, 4.16, 4.55, 4.95, 5.36,
    5.78, 6.2, 6.64, 7.04, 7.38, 7.73, 8.13, 8.5, 8.89, 9.29, 9.68, 10.1, 10.45, 10.82, 11.19, 11.59,
    11.98, 12.38, 12.75, 13.17, 13.58, 13.98, 14.4, 14.84, 15.23, 15.63, 16.02, 16.42, 16.83, 17.25,
    17.67, 18.09, 18.53, 18.95, 19.37, 19.74, 20.15, 20.57, 20.94, 21.34, 21.73, 22.11, 22.45, 22.85,
    23.22, 23.59, 23.96, 24.33, 24.73, 25.12, 25.52, 25.94, 26.33, 26.75, 27.14, 27.52, 27.91, 28.31,
    28.7, 29.1, 29.49, 29.89];
  // Strong onsets (time, weight): these shake the camera and flash.
  const HITS = [[0.07, 1], [3.76, 1], [4.16, 0.6], [7.01, 0.7], [7.29, 0.7], [7.73, 0.8], [9.54, 1],
    [9.66, 0.8], [10.08, 0.8], [12.72, 0.9], [16.28, 0.6], [19.34, 1], [19.99, 1], [20.57, 1],
    [22.08, 0.8], [22.45, 0.8], [24.71, 0.8], [24.92, 0.8], [25.12, 0.9], [28.56, 1]];

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
  function beatIdx(t) {
    let i = -1;
    for (let k = 0; k < BEATS.length; k++) if (BEATS[k] <= t + 1e-6) i = k;
    return i;
  }
  const fmt = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

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
  // Halftone field: dots that grow with distance from a centre, like a printed vignette.
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
    PAT = {
      deep: bctx.createPattern(dotTile(C.deep, 13, 3.6), 'repeat'),
      grey: bctx.createPattern(dotTile('#aaa396', 13, 3.8), 'repeat'),
      dark: bctx.createPattern(dotTile('#2a2c33', 13, 4), 'repeat'),
      paper: bctx.createPattern(dotTile('rgba(236,230,214,0.5)', 13, 2.6), 'repeat'),
    };
    HV = {
      ink: halftone(C.ink, 18, 8.5, 540, 900, 1150, 2.2),
      paper: halftone(C.paper, 18, 7, 540, 900, 1150, 1.8),
      inkTight: halftone(C.ink, 14, 6.5, 540, 900, 900, 1.6),
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
      rot = 0, sx = 1, sy = 1, alpha = 1, track = 0, maxW = 0, slamAt = null, t = 0, weight = '' } = o;
    let s = size;
    ctx.save();
    ctx.font = `${weight} ${s}px ${font}`;
    ctx.letterSpacing = track + 'px';
    if (maxW) {
      const w = ctx.measureText(text).width;
      if (w * sx > maxW) { s = (s * maxW) / (w * sx); ctx.font = `${weight} ${s}px ${font}`; }
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
    if (fill) { ctx.fillStyle = fill; ctx.fillText(text, 0, 0); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(text, 0, 0); }
    ctx.restore();
  }
  function typeOn(ctx, text, x, y, t, t0, o = {}) {
    if (t < t0) return;
    const n = Math.min(text.length, Math.floor((t - t0) * 30));
    const shown = text.slice(0, n);
    word(ctx, shown, x, y, { font: MONO, align: 'left', ...o });
    if (fr(t) % 16 < 9) {
      ctx.save();
      ctx.font = `${o.size || 60}px ${MONO}`;
      ctx.letterSpacing = (o.track || 0) + 'px';
      const w = ctx.measureText(shown).width;
      ctx.fillStyle = o.fill || C.paper;
      const s = o.size || 60;
      ctx.fillRect(x + w + 6, y - s * 0.36, s * 0.42, s * 0.72);
      ctx.restore();
    }
  }

  function radial(ctx, cx, cy, o = {}) {
    const { n = 110, color = C.ink, seed = 1, inner = 300, jit = 0.45, width = 0.016, len = 2600, alpha = 1 } = o;
    const r = rng(seed);
    ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, w = width * (0.25 + r() * 1.5), r0 = inner * (1 + (r() - 0.35) * jit * 2);
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
  function rain(ctx, t, o = {}) {
    const { color = 'rgba(236,230,214,0.25)', n = 140, seed = 1, ang = 0.2, speed = 2600, len = [40, 120], lw = 2.5 } = o;
    const r = rng(seed), tn = Math.tan(ang);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x0 = r() * (W + 800) - 100, y0 = r() * (H + 400), sp = speed * (0.7 + r() * 0.6);
      const l = len[0] + r() * (len[1] - len[0]);
      const y = ((y0 + t * sp) % (H + 400)) - 200, x = x0 - (y + 200) * tn;
      ctx.moveTo(x, y); ctx.lineTo(x + tn * l, y - l);
    }
    ctx.stroke(); ctx.restore();
  }
  function lightning(ctx, x0, y0, x1, y1, seed, o = {}) {
    const { w = 16, core = '#fffdf4', glow = C.volt, branches = 3, jag = 80, alpha = 1 } = o;
    const r = rng(seed), n = 13;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    const pts = [[x0, y0]];
    for (let i = 1; i < n; i++) {
      const k = i / n, off = (r() - 0.5) * 2 * jag * Math.sin(Math.PI * k) + (r() - 0.5) * jag * 0.5;
      pts.push([x0 + dx * k + nx * off, y0 + dy * k + ny * off]);
    }
    pts.push([x1, y1]);
    const path = (P) => { ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    ctx.save(); ctx.globalAlpha *= alpha; ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
    ctx.shadowColor = glow; ctx.shadowBlur = 40; ctx.strokeStyle = glow; ctx.lineWidth = w; path(pts); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = core; ctx.lineWidth = w * 0.45; path(pts); ctx.stroke();
    for (let b = 0; b < branches; b++) {
      const i = 2 + Math.floor(r() * (n - 4)), [bx, by] = pts[i];
      const a = Math.atan2(dy, dx) + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), bl = L * (0.12 + r() * 0.18);
      const bp = [[bx, by]];
      for (let j = 1; j <= 5; j++) { const k = j / 5; bp.push([bx + Math.cos(a) * bl * k + (r() - 0.5) * 40, by + Math.sin(a) * bl * k + (r() - 0.5) * 40]); }
      ctx.strokeStyle = glow; ctx.lineWidth = w * 0.5; path(bp); ctx.stroke();
      ctx.strokeStyle = core; ctx.lineWidth = w * 0.22; path(bp); ctx.stroke();
    }
    ctx.restore();
  }
  function starburst(ctx, cx, cy, rIn, rOut, n, rot, color, seed = 0) {
    const r = rng(seed);
    ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * Math.PI * 2, rad = i % 2 ? rIn : rOut * (0.7 + r() * 0.5);
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  }
  function sparkle(ctx, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, rad = i % 2 ? s * 0.18 : s;
      i ? ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : ctx.moveTo(rad, 0);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // ---------- Volt, the ⚡ ----------
  const BOLT = [[-30, -170], [95, -170], [35, -40], [105, -40], [-50, 185], [-5, 25], [-85, 25]];
  function boltPath(ctx) { ctx.beginPath(); BOLT.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
  function drawVolt(ctx, x, y, s, o = {}) {
    const { face = 'angry', rot = 0, glow = 1, fill = C.volt, line = C.ink, look = 0, blink = 0, flip = false, shade = true, alpha = 1 } = o;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(flip ? -s : s, s); ctx.globalAlpha *= alpha;
    if (glow > 0) {
      ctx.save(); ctx.shadowColor = `rgba(255,214,10,${clamp(0.9 * glow)})`; ctx.shadowBlur = Math.min(160, 70 * glow * s);
      boltPath(ctx); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
    }
    boltPath(ctx); ctx.fillStyle = fill; ctx.fill();
    if (shade) {
      ctx.save(); boltPath(ctx); ctx.clip(); ctx.fillStyle = fill === C.volt ? PAT.deep : PAT.dark;
      ctx.beginPath(); ctx.ellipse(-80, 130, 95, 190, -0.4, 0, 7); ctx.fill(); ctx.restore();
    }
    boltPath(ctx); ctx.lineWidth = 13; ctx.lineJoin = 'round'; ctx.strokeStyle = line; ctx.stroke();
    if (face !== 'none') voltFace(ctx, face, look, blink, line, fill);
    ctx.restore();
  }
  function voltFace(ctx, face, look, blink, ink, fill) {
    const ex = [-20, 27], ey = -100;
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (face === 'grin') {
      ctx.lineWidth = 9;
      for (const x of ex) { ctx.beginPath(); ctx.arc(x, ey + 8, 13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-44, -68); ctx.lineTo(40, -74); ctx.quadraticCurveTo(10, -6, -44, -68); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fffdf4';
      ctx.beginPath(); ctx.moveTo(-36, -66); ctx.lineTo(33, -71); ctx.lineTo(30, -60); ctx.lineTo(-32, -56); ctx.closePath(); ctx.fill();
      return;
    }
    for (const x of ex) {
      const ry = (face === 'shock' ? 21 : 16) * (1 - blink);
      ctx.fillStyle = '#fffdf4'; ctx.beginPath(); ctx.ellipse(x, ey, 15, Math.max(1, ry), 0, 0, 7); ctx.fill();
      ctx.lineWidth = 5; ctx.stroke();
      if (blink < 0.6) { ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(x + look * 5, ey + 2, 7, Math.max(1, 9 * (1 - blink)), 0, 0, 7); ctx.fill(); }
    }
    ctx.lineWidth = 9;
    if (face === 'angry') {
      ctx.beginPath(); ctx.moveTo(-40, -130); ctx.lineTo(-6, -117); ctx.moveTo(14, -117); ctx.lineTo(46, -131); ctx.stroke();
      // zigzag mouth: a bolt's teeth
      ctx.lineWidth = 7; ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const x = -34 + i * 11, y = -62 + (i % 2 ? -8 : 6) - i * 0.8; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    } else if (face === 'shock') {
      ctx.beginPath(); ctx.arc(-20, -128, 16, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(27, -128, 16, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(-6, -58, 11, 15, 0, 0, 7); ctx.fill();
    } else {
      ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(-4, -78, 18, 0.3, Math.PI - 0.3); ctx.stroke();
    }
  }

  // ---------- Boo, the 👻 ----------
  function ghostPath(ctx, t, wob = 1) {
    ctx.beginPath();
    ctx.moveTo(-135, 150); ctx.lineTo(-135, -40);
    ctx.arc(0, -40, 135, Math.PI, 0);
    ctx.lineTo(135, 150);
    const n = 4, w = 270 / n;
    for (let i = 0; i < n; i++) {
      const x0 = 135 - i * w, x1 = x0 - w;
      const cy = 150 + 48 + Math.sin(t * 9 + i * 1.7) * 12 * wob;
      const ey = 150 + Math.sin(t * 9 + (i + 1) * 1.7) * 6 * wob;
      ctx.quadraticCurveTo((x0 + x1) / 2, cy, x1, ey);
    }
    ctx.closePath();
  }
  function drawGhost(ctx, x, y, s, o = {}) {
    const { face = 'hollow', rot = 0, glow = 0.6, t = 0, fill = C.paper, line = C.ink, arms = 'none', lean = 0, flip = false, alpha = 1, shade = true, look = 0 } = o;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(flip ? -s : s, s); ctx.globalAlpha *= alpha;
    if (lean) ctx.transform(1, 0, lean, 1, 0, 0);
    const armNub = (ax, ay, a) => { ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 44, 26, 0, 0, 7); ctx.restore(); };
    const arm = (ax, ay, a) => { armNub(ax, ay, a); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 12; ctx.strokeStyle = line; ctx.stroke(); };
    const sw = Math.sin(t * 16);
    if (arms === 'up') { arm(-150, -20, -0.9); arm(150, -20, 0.9); }
    if (arms === 'run') { arm(-140, 30 + sw * 20, -0.4 + sw * 0.5); arm(140, 30 - sw * 20, 0.4 - sw * 0.5); }
    if (arms === 'hold') { arm(-140, 40, -0.3); }
    if (glow > 0) {
      ctx.save(); ctx.shadowColor = `rgba(126,246,255,${clamp(0.8 * glow)})`; ctx.shadowBlur = Math.min(160, 70 * glow * s);
      ghostPath(ctx, t); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
    }
    ghostPath(ctx, t); ctx.fillStyle = fill; ctx.fill();
    if (shade) {
      ctx.save(); ghostPath(ctx, t); ctx.clip(); ctx.fillStyle = fill === C.paper ? PAT.grey : PAT.dark;
      ctx.beginPath(); ctx.ellipse(-165, 40, 105, 250, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 230, 200, 70, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    ghostPath(ctx, t); ctx.lineWidth = 13; ctx.lineJoin = 'round'; ctx.strokeStyle = line; ctx.stroke();
    if (arms === 'hold') arm(140, 20, 0.5);
    if (face !== 'none') ghostFace(ctx, face, line, fill, look);
    ctx.restore();
  }
  function ghostFace(ctx, face, ink, fill, look) {
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const eye = (x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); };
    if (face === 'hollow') {
      eye(-48 + look * 6, -55, 24, 36); eye(48 + look * 6, -55, 24, 36);
      eye(0, 25, 15, 21);
    } else if (face === 'scared') {
      eye(-48, -55, 28, 42); eye(48, -55, 28, 42);
      ctx.fillStyle = '#fffdf4'; eye(-44 + look * 8, -64, 8, 10); eye(52 + look * 8, -64, 8, 10);
      ctx.lineWidth = 8; ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const x = -36 + i * 12, y = 32 + (i % 2 ? -7 : 7); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    } else if (face === 'brave') {
      eye(-48, -48, 25, 30); eye(48, -48, 25, 30);
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.moveTo(-90, -100); ctx.lineTo(-10, -60); ctx.lineTo(-10, -100); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(90, -100); ctx.lineTo(10, -60); ctx.lineTo(10, -100); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(-86, -98); ctx.lineTo(-14, -64); ctx.moveTo(86, -98); ctx.lineTo(14, -64); ctx.stroke();
      ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(-28, 34); ctx.quadraticCurveTo(0, 24, 28, 34); ctx.stroke();
    } else if (face === 'smile') {
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(-48, -40, 22, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(48, -40, 22, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-58, 8); ctx.quadraticCurveTo(0, 12, 58, 8); ctx.quadraticCurveTo(0, 96, -58, 8); ctx.fill();
      ctx.fillStyle = C.pink; ctx.beginPath(); ctx.ellipse(0, 52, 26, 14, 0, 0, 7); ctx.fill();
    } else if (face === 'tongue') {
      eye(-48, -55, 24, 36);
      ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(30, -78); ctx.lineTo(66, -56); ctx.lineTo(30, -34); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 22, 44, 34, 0, 0, 7); ctx.fill();
      ctx.fillStyle = C.pink; ctx.beginPath(); ctx.roundRect(4, 26, 36, 58, 18); ctx.fill();
      ctx.lineWidth = 8; ctx.stroke();
    }
  }
  function ghostEyes(ctx, x, y, s, open, color = C.cyan, reflect = 0) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.shadowColor = color; ctx.shadowBlur = Math.min(120, 50 * s);
    ctx.fillStyle = color;
    for (const ex of [-48, 48]) { ctx.beginPath(); ctx.ellipse(ex, 0, 24, Math.max(1, 36 * open), 0, 0, 7); ctx.fill(); }
    ctx.shadowBlur = 0;
    if (reflect > 0 && open > 0.5) {
      for (const ex of [-48, 48]) {
        ctx.save(); ctx.translate(ex + 4, -2); ctx.scale(0.07, 0.07); ctx.globalAlpha = reflect;
        boltPath(ctx); ctx.fillStyle = C.volt; ctx.fill(); ctx.lineWidth = 14; ctx.strokeStyle = C.ink; ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---------- the shots ----------
  // Each shot: draw(ctx, t, lt, fx), where lt is time since the shot began and fx collects post effects.

  function introBolt(ctx, t, lt, fx) {
    bg(ctx, C.ink);
    const glow = Math.exp(-Math.max(0, t - 0.07) * 2.2);
    glowAt(ctx, 700, 250, 1200, `rgba(255,214,10,${0.32 * glow})`);
    rain(ctx, t, { color: 'rgba(236,230,214,0.2)', n: 110, seed: 4 });
    const on = t >= 0.07 && t < 0.45 && [1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1][fr(t - 0.07)];
    if (on) { lightning(ctx, 800, -80, 380, 1500, 11 + (fr(t) >> 1), { w: 24, jag: 110, branches: 4 }); fx.flash = Math.max(fx.flash, 0.2); }
    streaks(ctx, 0, { n: 26, color: C.paper, seed: 3, t, speed: 2400, alpha: 0.8, thick: [3, 16] });
    const k = eoBack((t - 0.18) / 0.5);
    if (t > 0.18) drawVolt(ctx, lerp(1500, 560, k), 800 + Math.sin(t * 3) * 14, 1.3, { face: 'angry', rot: -0.12, glow: 0.6 + glow, look: -0.6 });
    const ks = eo3((t - 0.45) / 0.35);
    ctx.save(); ctx.translate(lerp(-1400, 0, ks), 0); ctx.translate(540, 1390); ctx.rotate(-0.09);
    ctx.fillStyle = C.paper; ctx.fillRect(-760, -175, 1520, 350);
    ctx.fillStyle = PAT.grey; ctx.fillRect(-760, 95, 1520, 80);
    word(ctx, 'VOLT', -120, 12, { size: 320, fill: C.ink, sx: 1.2 });
    word(ctx, 'STRANGER NO.1', 250, -70, { font: MONO, size: 58, fill: C.ink, align: 'left' });
    word(ctx, 'ARRIVED 02:47', 250, -10, { font: MONO, size: 58, fill: C.deep, align: 'left' });
    ctx.restore();
    const dim = clamp((t - 1.2) / 0.6) * 0.7;
    if (dim > 0) { ctx.fillStyle = `rgba(11,11,13,${dim})`; ctx.fillRect(-300, -300, W + 600, H + 600); }
  }

  function introEyes(ctx, t, lt, fx) {
    bg(ctx, C.ink);
    rain(ctx, t, { color: 'rgba(236,230,214,0.16)', n: 120, seed: 8 });
    const push = 1 + ei3((t - 2.9) / 0.86) * 1.9;
    ctx.save(); ctx.translate(540, 820); ctx.scale(push, push);
    const body = 0.08 + 0.12 * eo3((t - 2.2) / 1.2);
    drawGhost(ctx, 0, 110, 2.0, { face: 'none', glow: 0, fill: '#15161b', line: `rgba(126,246,255,${body})`, t, shade: false });
    const open = eo3((t - 1.95) / 0.3) * (Math.abs(t - 2.95) < 0.07 ? 0.1 : 1);
    ghostEyes(ctx, 0, 0, 2.0, open, C.cyan, clamp((t - 3.3) / 0.3));
    ctx.restore();
    typeOn(ctx, 'STRANGER NO.2', 90, 1520, t, 2.3, { size: 64, fill: C.cyan });
    typeOn(ctx, 'BOO', 90, 1600, t, 2.75, { size: 64, fill: C.paper });
    if (t > 3.12) {
      const fl = [1, 0.3, 1, 1, 0.2, 1][fr(t) % 6];
      word(ctx, 'STRANGERS', 540, 1780, { size: 260, fill: null, stroke: `rgba(236,230,214,${0.6 * fl})`, lw: 3, maxW: 1000 });
    }
    fx.chroma = ei3((t - 3.15) / 0.6) * 22;
  }

  function dropBolt(ctx, t, lt, fx) {
    bg(ctx, C.volt); field(ctx, 'ink', 0.9);
    radial(ctx, 540, 820, { n: 120, color: C.ink, seed: fr(t) >> 1, inner: 470, width: 0.012 });
    drawVolt(ctx, 540, 830, 2.4 * (1 + 0.12 * Math.exp(-lt * 10)), { face: 'angry', glow: 0, rot: -0.06 + Math.sin(t * 22) * 0.02 });
    word(ctx, 'STRANGERS', 540, 1590, { size: 340, fill: C.ink, maxW: 1030, slamAt: 3.76, t, rot: -0.04 });
    fx.slices = lt < 0.1 ? 0.5 : 0;
  }

  function dropGhost(ctx, t, lt, fx) {
    bg(ctx, C.ink); field(ctx, 'paper', 0.12);
    radial(ctx, 540, 860, { n: 110, color: C.volt, seed: 40 + (fr(t) >> 1), inner: 480, width: 0.011 });
    drawGhost(ctx, 540, 900, 2.3 * (1 + 0.1 * Math.exp(-lt * 10)), { face: 'hollow', glow: 1.2, t, rot: 0.04 });
    word(ctx, 'STRANGERS', 540, 1650, { size: 340, fill: C.paper, maxW: 1030, slamAt: 4.16, t, rot: 0.04 });
  }

  function inThe(ctx, t, lt, fx) {
    bg(ctx, C.paper); field(ctx, 'ink', 0.35);
    streaks(ctx, -0.05, { n: 34, color: C.ink, seed: 9, t, speed: 3200, dir: -1, thick: [3, 20] });
    drawGhost(ctx, 470 + lt * 120, 980, 1.7, { face: 'scared', glow: 0, t, lean: -0.15, arms: 'up', look: -1 });
    word(ctx, 'IN', 250, 420, { size: 560, fill: C.ink, slamAt: 4.55, t, rot: -0.05 });
    word(ctx, 'THE', 790, 1540, { size: 400, fill: C.ink, slamAt: 5.26, t, rot: 0.05 });
    if (t >= 4.95 && t < 5.05) fx.slices = 0.6;
  }

  function night(ctx, t, lt, fx) {
    bg(ctx, C.night);
    rain(ctx, t, { color: 'rgba(126,246,255,0.22)', n: 150, seed: 12 });
    const z = 1 + lt * 0.12;
    ctx.save(); ctx.translate(540, 960); ctx.scale(z, z); ctx.translate(-540, -960);
    ghostEyes(ctx, 540, 930, 2.6, 1, C.cyan);
    word(ctx, 'NIGHT', 540, 980, { size: 900, fill: null, stroke: C.paper, lw: 7, rot: -Math.PI / 2, maxW: 1820, slamAt: 5.5, t });
    ctx.restore();
    fx.chroma = 6;
  }

  function nightEyes(ctx, t, lt, fx) {
    bg(ctx, '#050608');
    const z = 1 + lt * 0.25;
    ctx.save(); ctx.translate(540, 960); ctx.scale(z, z);
    drawGhost(ctx, 0, 330, 7, { face: 'none', glow: 0, fill: '#121318', line: '#1d1f26', t, shade: false });
    ghostEyes(ctx, 0, -55, 7, Math.abs(lt - 0.25) < 0.04 ? 0.15 : 1, C.cyan, 1);
    ctx.restore();
    rain(ctx, t, { color: 'rgba(236,230,214,0.2)', n: 90, seed: 13 });
    fx.chroma = 9;
  }

  function destiny(ctx, t, lt, fx) {
    const D = 2.7, k = clamp(lt / D), p = 0.5 * k + 0.5 * Math.pow(k, 4);
    const tn = Math.tan(-0.18), seamY = (x) => 960 - (x - 540) * tn * -1;
    const jolt = hitEnv(t, 18) * 40;
    const top = (fresh = true) => { if (fresh) ctx.beginPath(); ctx.moveTo(-300, -300); ctx.lineTo(W + 300, -300); ctx.lineTo(W + 300, seamY(W + 300) + jolt); ctx.lineTo(-300, seamY(-300) - jolt); ctx.closePath(); };
    const sp = 1800 + p * 6000;
    // top half: night, Boo drifting right
    bg(ctx, C.volt);
    ctx.save(); top(); ctx.clip();
    bg(ctx, C.ink); field(ctx, 'paper', 0.1);
    streaks(ctx, -0.18, { n: 30, color: C.paper, seed: 21, t: t * (1 + p * 3), speed: 1800, thick: [3, 14], alpha: 0.8 });
    drawGhost(ctx, lerp(-40, 430, p), 600 + Math.sin(t * 6) * 16, 1.35, { face: k < 0.75 ? 'hollow' : 'scared', glow: 0.9, t, lean: -0.2, look: 1 });
    ctx.restore();
    // bottom half: yellow, Volt coming left
    ctx.save(); ctx.beginPath(); ctx.rect(-300, -300, W + 600, H + 600); top(false); ctx.clip('evenodd');
    field(ctx, 'ink', 0.6);
    streaks(ctx, -0.18, { n: 30, color: C.ink, seed: 22, t: t * (1 + p * 3), speed: 1800, dir: -1, thick: [3, 14], alpha: 0.85 });
    drawVolt(ctx, lerp(1120, 660, p), 1370 + Math.sin(t * 7) * 14, 1.45, { face: k < 0.75 ? 'angry' : 'shock', glow: 0, flip: true, look: 1 });
    ctx.restore();
    // seam line
    ctx.strokeStyle = C.paper; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-300, seamY(-300) - jolt); ctx.lineTo(W + 300, seamY(W + 300) + jolt); ctx.stroke();
    // distance readout riding the seam
    const km = 9999 * Math.pow(1 - k, 3);
    const val = km >= 1 ? `${fmt(km, 2)} KM` : `${fmt(km * 1000, 1)} M`;
    ctx.save(); ctx.translate(540, 960); ctx.rotate(-0.18);
    ctx.fillStyle = C.ink; ctx.fillRect(-330, -95, 660, 190);
    ctx.strokeStyle = C.volt; ctx.lineWidth = 4; ctx.strokeRect(-330, -95, 660, 190);
    word(ctx, 'DISTANCE', -300, -52, { font: MONO, size: 54, fill: C.volt, align: 'left', track: 6 });
    const g = hitEnv(t, 20) > 0.3 ? (fr(t) % 2 ? '#?#' : '') : '';
    word(ctx, g || val, 0, 30, { font: MONO, size: 120, fill: C.paper });
    ctx.restore();
    // the words
    if (t < 7.74) word(ctx, 'DESTINY', 540, 250, { size: 300, fill: C.paper, maxW: 1000, slamAt: 6.76, t, rot: -0.18 });
    else if (t < 8.3) word(ctx, 'TO', 540, 1720, { size: 380, fill: C.ink, slamAt: 7.74, t, rot: -0.18 });
    else word(ctx, 'COLLIDE', 540, 250, { size: 320, fill: C.volt, maxW: 1020, slamAt: 8.3, t, rot: -0.18, sx: 1 + p * 0.1 });
    if (k > 0.72) radial(ctx, 540, 960, { n: 130, color: C.paper, seed: fr(t), inner: lerp(1000, 330, (k - 0.72) / 0.28), width: 0.008, alpha: 0.9 });
    if (hitEnv(t, 20) > 0.4) fx.slices = 0.5;
    fx.chroma += k * 8;
  }

  function collide(ctx, t, lt, fx) {
    const f = fr(t);
    if (t < 9.54) {
      // wind-up: pressed together, vibrating
      bg(ctx, C.ink);
      radial(ctx, 540, 960, { n: 150, color: C.paper, seed: f, inner: 380, width: 0.01 });
      const q = (t - 9.34) / 0.2, v = Math.sin(f * 2.3) * 10;
      drawVolt(ctx, 420 + q * 40 + v, 960, 1.6, { face: 'shock', glow: 0.8, flip: true, rot: 0.2 });
      drawGhost(ctx, 690 - q * 40 - v, 980, 1.45, { face: 'scared', glow: 0.8, t, rot: -0.15, look: -1 });
      fx.chroma = 12;
    } else if (t < 9.66) {
      bg(ctx, C.paper);
      starburst(ctx, 540, 960, 260, 1500, 22, t * 0.5, C.ink, 5);
      starburst(ctx, 540, 960, 150, 520, 14, -t, C.volt, 6);
      lightning(ctx, 540, 960, 80, 200, 31, { w: 18, glow: C.ink, core: C.paper });
      lightning(ctx, 540, 960, 1000, 1750, 32, { w: 18, glow: C.ink, core: C.paper });
      drawGhost(ctx, 620, 1000, 1.5, { face: 'scared', glow: 0, t, rot: -0.5 });
      drawVolt(ctx, 460, 930, 1.7, { face: 'shock', glow: 0, flip: true, rot: 0.6 });
      fx.chroma = 18;
    } else if (t < 10.08) {
      bg(ctx, C.paper);
      radial(ctx, 540, 960, { n: 140, color: C.ink, seed: f, inner: 300, width: 0.013 });
      const spin = (t - 9.66) * 5;
      ctx.save(); ctx.translate(540, 960); ctx.rotate(spin);
      drawGhost(ctx, 90, 30, 1.3, { face: 'scared', glow: 0, t, rot: 0.4 });
      drawVolt(ctx, -110, -10, 1.5, { face: 'angry', glow: 0, rot: -0.5 });
      ctx.restore();
      fx.invert = f % 4 < 2;
      fx.chroma = 14;
    } else {
      bg(ctx, C.ink);
      starburst(ctx, 540, 960, 200, 1300, 18, 0.2, C.paper, 7);
      const q = eo3((t - 10.08) / 0.22);
      drawVolt(ctx, lerp(460, 150, q), lerp(930, 420, q), 1.5, { face: 'angry', glow: 1, rot: -0.8 - q, flip: true });
      drawGhost(ctx, lerp(620, 900, q), lerp(1000, 1500, q), 1.35, { face: 'scared', glow: 1, t, rot: 0.6 + q });
      fx.chroma = 16; fx.slices = 0.4;
    }
  }

  function running(ctx, t, lt, fx) {
    const dark = beatIdx(t) % 2 === 0;
    const bgc = dark ? C.ink : C.paper, fg = dark ? C.paper : C.ink;
    bg(ctx, bgc); field(ctx, dark ? 'paper' : 'ink', dark ? 0.12 : 0.35);
    // Volt's light, hunting from the right
    ctx.save();
    const sway = Math.sin(t * 3) * 180;
    const g = ctx.createLinearGradient(1080, 700, 0, 700);
    g.addColorStop(0, 'rgba(255,214,10,0.75)'); g.addColorStop(1, 'rgba(255,214,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(1150, 640); ctx.lineTo(-200, 200 + sway); ctx.lineTo(-200, 1500 + sway); ctx.closePath(); ctx.fill();
    ctx.restore();
    drawVolt(ctx, 1010, 640, 0.75, { face: 'angry', glow: 1.4, flip: true });
    streaks(ctx, 0, { n: 40, color: fg, seed: 30, t, speed: 4200, thick: [3, 20], len: [300, 1400] });
    const bob = Math.abs(Math.sin(t * 13)) * -50;
    for (let i = 3; i >= 1; i--) drawGhost(ctx, 470 + i * 90, 1060 + bob, 1.5, { face: 'none', glow: 0, t, lean: 0.3, fill: fg, line: fg, alpha: 0.12 * (4 - i), shade: false });
    drawGhost(ctx, 470, 1060 + bob, 1.5, { face: 'scared', glow: dark ? 0.8 : 0, t, lean: 0.3, arms: 'run', look: 1 });
    word(ctx, 'RUNNING', 200, 960, { size: 330, fill: fg, rot: -Math.PI / 2, maxW: 1700, slamAt: 10.3, t });
    word(ctx, 'FROM THE', 690, 1700, { size: 210, fill: fg, slamAt: 10.62, t, rot: -0.04 });
    fx.chroma = 5;
  }

  function light(ctx, t, lt, fx) {
    bg(ctx, C.paper);
    glowAt(ctx, 1000, 700, 1500, 'rgba(255,214,10,0.9)');
    radial(ctx, 1040, 650, { n: 70, color: 'rgba(255,253,244,0.9)', seed: 50 + (fr(t) >> 2), inner: 60, width: 0.03 });
    drawGhost(ctx, 250 - lt * 180, 1250, 0.55, { face: 'none', glow: 0, t, lean: 0.3, fill: C.ink, line: C.ink, shade: false, arms: 'run' });
    const b = beatEnv(t, 12);
    word(ctx, 'LIGHT', 540, 960, { size: 700, fill: C.ink, maxW: 1040 * (1 + b * 0.05), slamAt: 11.74, t, sy: 1.25 });
    fx.flash = Math.max(fx.flash, Math.exp(-lt * 8) * 0.7);
    fx.chroma = 8 + b * 10;
  }

  function meter(ctx, t, lt, fx) {
    const k = clamp(lt / 1.26);
    bg(ctx, '#121215'); field(ctx, 'paper', 0.18);
    radial(ctx, 540, 1000, { n: 120, color: C.paper, seed: fr(t) >> 1, inner: 560 - k * 120, width: 0.009, alpha: 0.85 });
    for (let i = 0; i < 2 + Math.floor(k * 5); i++) {
      const r = rng(i * 17 + (fr(t) >> 2)), a = r() * Math.PI * 2;
      lightning(ctx, 540 + Math.cos(a) * 1300, 1000 + Math.sin(a) * 1300, 540 + Math.cos(a) * 450, 1000 + Math.sin(a) * 450, i * 7 + fr(t), { w: 5, branches: 1, jag: 50, glow: C.paper, core: '#fff' });
    }
    const b = beatEnv(t);
    drawVolt(ctx, 540, 1010, 2.0 * (1 + b * 0.07), { face: k < 0.55 ? 'angry' : 'shock', glow: 1 + k * 1.8, rot: Math.sin(t * 40) * 0.03 * k });
    ctx.fillStyle = 'rgba(11,11,13,0.88)'; ctx.fillRect(170, 110, 740, 310); ctx.strokeStyle = C.volt; ctx.lineWidth = 4; ctx.strokeRect(170, 110, 740, 310);
    word(ctx, 'KILOVOLTS', 540, 190, { font: MONO, size: 100, fill: C.paper, track: 10 });
    const v = 120 * Math.pow(1210000 / 120, Math.pow(k, 1.6));
    word(ctx, fmt(v), 540, 320, { font: MONO, size: 170, fill: C.volt });
    // gauge
    const cx = 540, cy = 1780, R = 280;
    ctx.save(); ctx.strokeStyle = C.paper; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, Math.PI * 2); ctx.stroke();
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (i / 20) * Math.PI, r0 = i % 5 ? R - 30 : R - 60;
      ctx.lineWidth = i % 5 ? 3 : 6; ctx.strokeStyle = i > 15 ? C.volt : C.paper;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    }
    const na = Math.PI + clamp(Math.pow(k, 1.3) + Math.sin(t * 50) * 0.03 * k, 0, 1.02) * Math.PI;
    ctx.strokeStyle = C.volt; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (R - 20), cy + Math.sin(na) * (R - 20)); ctx.stroke();
    ctx.restore();
    fx.chroma = 4 + k * 10;
  }

  function stripes(ctx, t, lt, fx) {
    const ghost = t >= 14.4;
    const scene = (inv) => {
      bg(ctx, inv ? C.ink : C.paper);
      if (ghost) drawGhost(ctx, 540, 1250, 4.6, { face: 'brave', glow: 0, t, fill: inv ? C.ink : C.paper, line: inv ? C.paper : C.ink, shade: !inv });
      else drawVolt(ctx, 560, 1400, 4.6, { face: 'angry', glow: 0, fill: inv ? C.ink : C.volt, line: inv ? C.volt : C.ink, shade: !inv });
    };
    scene(false);
    const n = 7, bw = W / n, off = (lt * 380) % (bw * 2);
    for (let i = -2; i < n + 2; i++) {
      if ((i & 1) === 0) continue;
      const x = i * bw + off - bw;
      ctx.save(); ctx.beginPath(); ctx.rect(x, -300, bw, H + 600); ctx.clip();
      ctx.translate(0, Math.sin(t * 9 + i) * 70);
      scene(true);
      ctx.restore();
    }
    fx.chroma = 7;
  }

  function glitchNet(ctx, t, lt, fx) {
    bg(ctx, C.ink);
    ctx.save(); ctx.translate(540, 960); ctx.rotate(-0.35);
    const r = rng(fr(t) >> 1);
    for (let i = -14; i < 14; i++) {
      const y = i * 110 + (lt * 900) % 110, th = 30 + r() * 50;
      ctx.fillStyle = r() < 0.15 ? C.volt : C.paper;
      ctx.fillRect(-1400 + r() * 300, y, 2800, th);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(11,11,13,0.9)'; ctx.lineWidth = 3; ctx.beginPath();
    const r2 = rng(77 + (fr(t) >> 1));
    for (let i = 0; i < 40; i++) { ctx.moveTo(r2() * W, r2() * H); ctx.lineTo(r2() * W, r2() * H); }
    ctx.stroke();
    fx.chroma = 12; fx.slices = 0.7;
    const out = clamp((t - 15.1) / 0.14);
    if (out > 0) { ctx.fillStyle = `rgba(7,8,10,${out})`; ctx.fillRect(-300, -300, W + 600, H + 600); }
  }

  function lost(ctx, t, lt, fx) {
    bg(ctx, '#07080a');
    const z = lerp(1.2, 1.0, eo3(lt / 3.1));
    ctx.save(); ctx.translate(540, 900); ctx.scale(z, z); ctx.translate(-540, -900);
    const r = rng(5);
    ctx.fillStyle = 'rgba(236,230,214,0.6)';
    for (let i = 0; i < 90; i++) { const x = (r() * W + t * (10 + r() * 30)) % W, y = r() * H, s = 1 + r() * 2.5; ctx.fillRect(x, y, s, s); }
    const cx = 540, cy = 900;
    ctx.strokeStyle = 'rgba(126,246,255,0.2)'; ctx.lineWidth = 2;
    for (let i = 1; i <= 6; i++) { ctx.beginPath(); ctx.arc(cx, cy, i * 125, 0, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - 800, cy); ctx.lineTo(cx + 800, cy); ctx.moveTo(cx, cy - 800); ctx.lineTo(cx, cy + 800); ctx.stroke();
    const cg = ctx.createConicGradient(t * 2.4, cx, cy);
    cg.addColorStop(0, 'rgba(126,246,255,0.32)'); cg.addColorStop(0.14, 'rgba(126,246,255,0)'); cg.addColorStop(1, 'rgba(126,246,255,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, 760, 0, 7); ctx.fill();
    if (t > 16.28) {
      const pr = (t - 16.28) * 1500, pa = clamp(1 - (t - 16.28) / 0.7);
      ctx.strokeStyle = `rgba(126,246,255,${pa})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 7); ctx.stroke();
    }
    const bi = beatIdx(t), bt = t - BEATS[bi];
    ctx.strokeStyle = `rgba(126,246,255,${0.5 * clamp(1 - bt / 0.4)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 60 + bt * 900, 0, 7); ctx.stroke();
    const s = lerp(0.6, 0.13, eo3((t - 16.9) / 1.3)) * (t > 16.28 ? 0.8 : 1) * (1 + beatEnv(t, 12) * 0.12);
    drawGhost(ctx, cx, cy, s, { face: 'scared', glow: 1, t, look: -1 });
    ctx.restore();
    const spread = 1 + lt * 0.12;
    ['L', 'O', 'S', 'T'].forEach((ch, i) => {
      word(ctx, ch, 540 + (i - 1.5) * 230 * spread, 1480 + Math.sin(t * 1.5 + i) * 20, { size: 420, fill: null, stroke: C.paper, lw: 3, alpha: lerp(1, 0.35, clamp(lt / 2.5)), slamAt: 15.24 + i * 0.06, t, rot: (i - 1.5) * 0.04 * lt });
    });
    if (fr(t) % 20 < 13) word(ctx, 'SIGNAL: LOST', 70, 150, { font: MONO, size: 66, fill: C.volt, align: 'left' });
    const rr = rng(fr(t) >> 2);
    word(ctx, `${(37 + rr()).toFixed(4)}°N  ${(122 + rr()).toFixed(4)}°W`, 70, 225, { font: MONO, size: 46, fill: 'rgba(236,230,214,0.7)', align: 'left' });
    word(ctx, `RANGE ${fmt(40 + Math.pow(lt, 3) * 900)} KM`, 1010, 150, { font: MONO, size: 46, fill: 'rgba(236,230,214,0.7)', align: 'right' });
    if (t > 17.2) word(ctx, 'FAR AWAY', 540, 1760, { font: GROT, weight: '700', size: 74, fill: C.paper, track: lerp(30, 70, clamp((t - 17.2) / 1.1)) });
    fx.chroma = 3;
    fx.grain = 0.1;
  }

  function nowhere(ctx, t, lt, fx) {
    bg(ctx, C.ink);
    const squeeze = (t > 19.34 ? 0.33 : 0) + (t > 19.99 ? 0.33 : 0);
    const rowH = 205;
    for (let i = 0; i < 10; i++) {
      const y = i * rowH + 20, dir = i % 2 ? 1 : -1;
      const x = ((t * 700 * dir + i * 260) % 1400) - 1400;
      const solid = i % 3 !== 1;
      word(ctx, 'NOWHERE NOWHERE NOWHERE NOWHERE', x, y + rowH / 2, { size: 200, align: 'left', fill: solid ? C.paper : null, stroke: solid ? null : C.paper, lw: 3, alpha: solid ? 0.9 : 0.8 });
    }
    const bw = lerp(640, 330, squeeze), bh = lerp(820, 440, squeeze);
    ctx.fillStyle = C.ink; ctx.fillRect(540 - bw / 2, 960 - bh / 2, bw, bh);
    ctx.strokeStyle = C.volt; ctx.lineWidth = 8; ctx.strokeRect(540 - bw / 2, 960 - bh / 2, bw, bh);
    const tremble = Math.sin(fr(t) * 2.1) * 6;
    drawGhost(ctx, 540 + tremble, 990, lerp(1.25, 0.72, squeeze), { face: 'scared', glow: 0.9, t, arms: 'up', look: Math.sin(t * 5) });
    const strikes = [[19.34, 160], [19.99, 920]];
    for (const [s, x] of strikes) {
      if (t >= s && t < s + 0.3) { lightning(ctx, x, -60, 540, 960 - bh / 2, Math.floor(s * 100) + (fr(t) >> 1), { w: 26, jag: 90, branches: 3 }); if (t < s + 0.07) fx.invert = true; }
    }
  }

  function escape(ctx, t, lt, fx) {
    bg(ctx, C.volt); field(ctx, 'ink', 0.8);
    radial(ctx, 540, 900, { n: 90, color: C.ink, seed: fr(t) >> 1, inner: 600, width: 0.01, alpha: 0.9 });
    if (t < 20.9) lightning(ctx, 540, -80, 540, 1200, 2057 + (fr(t) >> 1), { w: 34, jag: 120, glow: C.ink, core: C.paper, branches: 5 });
    const rise = eo3((t - 20.62) / 0.5);
    drawVolt(ctx, 600, lerp(2600, 1560, rise) + Math.sin(t * 4) * 12, 6.2 * (1 + lt * 0.06), { face: 'angry', glow: 0, look: -0.5 });
    word(ctx, 'ESCAPE', 540, 330, { size: 330, fill: C.ink, maxW: 1020, slamAt: 20.62, t });
    if (t > 20.8) {
      const w = eo3((t - 20.8) / 0.2) * 1040;
      ctx.fillStyle = C.ink; ctx.fillRect(20, 318, w, 40);
    }
    fx.slices = t < 20.75 ? 0.6 : 0.15;
    if (t < 20.64) fx.flash = Math.max(fx.flash, 0.6);
  }

  function brave(ctx, t, lt, fx) {
    bg(ctx, C.volt); field(ctx, 'ink', 0.85);
    radial(ctx, 540, 900, { n: 120, color: C.ink, seed: fr(t) >> 1, inner: 520, width: 0.011 });
    const z = t < 22.08 ? 1 : t < 22.45 ? 1.35 : 1.8;
    ctx.save(); ctx.translate(540, 820); ctx.scale(z, z); ctx.translate(-540, -820);
    drawGhost(ctx, 540, 920, 2.3, { face: 'brave', glow: 0, t, arms: 'up' });
    ctx.restore();
    word(ctx, 'BRAVE', 540, 1640, { size: 440, fill: C.ink, maxW: 1000, slamAt: 21.66, t, rot: -0.05 });
  }

  function faceoff(ctx, t, lt, fx) {
    // the seam is a zigzag, a bolt's edge
    const half = (fresh = true) => {
      if (fresh) ctx.beginPath();
      ctx.moveTo(-300, -300);
      for (let i = -2; i <= 12; i++) ctx.lineTo(540 + (i % 2 ? 70 : -70), i * 200);
      ctx.lineTo(-300, H + 300); ctx.closePath();
    };
    const z = 1 + lt * 0.06;
    ctx.save(); ctx.translate(540, 960); ctx.scale(z, z); ctx.translate(-540, -960);
    bg(ctx, C.volt); field(ctx, 'ink', 0.5);
    drawVolt(ctx, 830, 1060, 1.75, { face: 'angry', glow: 0, flip: true, look: 1 });
    ctx.save(); half(); ctx.clip();
    bg(ctx, C.ink); field(ctx, 'paper', 0.1);
    drawGhost(ctx, 250, 1080, 1.55, { face: 'brave', glow: 1, t });
    ctx.restore();
    ctx.strokeStyle = C.paper; ctx.lineWidth = 6; half(); ctx.stroke();
    ctx.restore();
    rain(ctx, t, { color: 'rgba(236,230,214,0.3)', n: 120, seed: 19 });
    const lines = [['IN THE', 22.88], ['NIGHT', 23.54]];
    lines.forEach(([s, at], i) => {
      if (t < at) return;
      const y = 290 + i * 190;
      ctx.save(); half(); ctx.clip(); word(ctx, s, 540, y, { size: 190, fill: C.paper, slamAt: at, t }); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(-300, -300, W + 600, H + 600); half(false); ctx.clip('evenodd'); word(ctx, s, 540, y, { size: 190, fill: C.ink, slamAt: at, t }); ctx.restore();
    });
  }

  function smiles(ctx, t, lt, fx) {
    if (t < 24.71) {
      bg(ctx, C.paper); field(ctx, 'ink', 0.4);
      radial(ctx, 540, 1000, { n: 80, color: C.ink, seed: fr(t) >> 1, inner: 560, width: 0.01, alpha: 0.8 });
      drawVolt(ctx, 540, 1060, 2.4, { face: 'grin', glow: 0, rot: Math.sin(t * 8) * 0.08 });
      word(ctx, 'AS WE', 540, 300, { size: 300, fill: C.ink, slamAt: 24.06, t });
    } else if (t < 24.92) {
      bg(ctx, C.ink); field(ctx, 'paper', 0.12);
      drawGhost(ctx, 540, 1000, 2.6, { face: 'tongue', glow: 1.2, t, rot: -0.08 });
    } else {
      bg(ctx, C.volt); field(ctx, 'ink', 0.8);
      radial(ctx, 540, 1000, { n: 120, color: C.ink, seed: fr(t), inner: 520, width: 0.012 });
      drawVolt(ctx, 540, 1100, 3.1, { face: 'grin', glow: 0, rot: 0.18 });
    }
  }

  function smileBoth(ctx, t, lt, fx) {
    bg(ctx, C.ink);
    starburst(ctx, 540, 930, 330, 1400, 16, t * 0.25, '#1d1e22', 3);
    starburst(ctx, 540, 930, 200, 700, 12, -t * 0.4, 'rgba(255,214,10,0.14)', 4);
    const b = beatEnv(t, 8), bob = -b * 40;
    drawGhost(ctx, 320, 960 + bob, 1.35, { face: 'smile', glow: 1, t, rot: -0.08 });
    drawVolt(ctx, 770, 940 - bob * 0.6, 1.45, { face: 'grin', glow: 1, rot: 0.1 });
    const r = rng(fr(t) >> 3);
    for (let i = 0; i < 7; i++) sparkle(ctx, 80 + r() * 920, 250 + r() * 1300, 20 + r() * 40, i % 2 ? C.volt : C.paper);
    word(ctx, 'SMILE', 540, 1650, { size: 440, fill: C.volt, maxW: 1000, slamAt: 25.28, t });
  }

  function together(ctx, t, lt, fx) {
    bg(ctx, C.night);
    const zk = ei3((t - 27.75) / 0.8), z = (1 + zk * 4) * (1 + beatEnv(t, 10) * 0.035);
    const lx = 700, ly = 900;
    ctx.save(); ctx.translate(lx, ly); ctx.scale(z, z); ctx.translate(-lx, -ly);
    const b = beatEnv(t, 7);
    glowAt(ctx, lx, ly, 900 + b * 120, 'rgba(255,214,10,0.38)');
    ctx.fillStyle = '#16181f'; ctx.fillRect(-300, 1390, W + 600, 900);
    ctx.save(); ctx.beginPath(); ctx.ellipse(lx - 100, 1395, 520, 60, 0, 0, 7); ctx.clip(); ctx.fillStyle = 'rgba(255,214,10,0.35)'; ctx.fillRect(-300, 1300, W + 600, 200); ctx.restore();
    const walk = Math.sin(t * 7.6) * 10;
    drawGhost(ctx, 470, 1130 + walk, 1.3, { face: 'smile', glow: 0.6, t, arms: 'hold', look: 1 });
    drawVolt(ctx, lx, ly + walk * 1.4, 0.55, { face: 'grin', glow: 1.5 + b, rot: Math.sin(t * 4) * 0.1 });
    ctx.restore();
    rain(ctx, t, { color: 'rgba(236,230,214,0.3)', n: 170, seed: 23 });
    typeOn(ctx, 'TWO STRANGERS', 80, 230, t, 26.5, { size: 76, fill: C.paper });
    typeOn(ctx, 'ONE NIGHT', 80, 320, t, 27.1, { size: 76, fill: C.volt });
    if (zk > 0) radial(ctx, 540, 960, { n: 130, color: C.paper, seed: fr(t), inner: lerp(1100, 300, zk), width: 0.008, alpha: zk });
    fx.chroma = zk * 18;
    fx.flash = Math.max(fx.flash, clamp((t - 28.36) / 0.2) * 0.9);
  }

  function title(ctx, t, lt, fx) {
    bg(ctx, C.ink); field(ctx, 'paper', 0.1);
    radial(ctx, 540, 960, { n: 100, color: 'rgba(255,214,10,0.5)', seed: fr(t) >> 1, inner: 620, width: 0.008 });
    word(ctx, 'STRANGERS', 540, 560, { size: 330, fill: C.paper, maxW: 1010, slamAt: 28.56, t });
    word(ctx, 'IN THE', 540, 790, { font: GROT, weight: '700', size: 120, fill: C.volt, track: 24, slamAt: 28.7, t });
    word(ctx, 'NIGHT', 540, 1090, { size: 400, fill: C.paper, maxW: 1010, slamAt: 29.1, t });
    const peek = eoBack((t - 28.75) / 0.4);
    drawGhost(ctx, 230, lerp(2300, 1700, peek), 1.4, { face: 'smile', glow: 1, t, rot: 0.18 });
    drawVolt(ctx, 870, lerp(2300, 1640, eoBack((t - 28.9) / 0.4)), 1.45, { face: 'grin', glow: 1, rot: -0.16 });
    if ((t >= 28.7 && t < 28.77) || (t >= 29.49 && t < 29.56)) fx.invert = true;
    if (t > 29.8) { ctx.fillStyle = C.ink; ctx.fillRect(-300, -300, W + 600, H + 600); }
  }

  const SHOTS = [
    [0, 1.8, introBolt], [1.8, 3.76, introEyes], [3.76, 4.16, dropBolt], [4.16, 4.55, dropGhost],
    [4.55, 5.5, inThe], [5.5, 6.2, night], [6.2, 6.64, nightEyes], [6.64, 9.34, destiny],
    [9.34, 10.3, collide], [10.3, 11.74, running], [11.74, 12.72, light], [12.72, 13.98, meter],
    [13.98, 14.84, stripes], [14.84, 15.24, glitchNet], [15.24, 18.34, lost], [18.34, 20.57, nowhere],
    [20.57, 21.66, escape], [21.66, 22.88, brave], [22.88, 24.06, faceoff], [24.06, 25.12, smiles],
    [25.12, 26.36, smileBoth], [26.36, 28.56, together], [28.56, 30.01, title],
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
    if (fx.flash > 0.01) { o.fillStyle = `rgba(255,250,235,${clamp(fx.flash)})`; o.fillRect(0, 0, W, H); }
    o.globalAlpha = fx.grain; o.drawImage(GRAIN[fr(t) % 4], 0, 0, W, H);
    o.globalAlpha = 1; o.drawImage(VIG, 0, 0);
    // a few film scratches
    const r = rng(fr(t) * 3 + 1);
    o.fillStyle = 'rgba(236,230,214,0.18)';
    for (let i = 0; i < 2; i++) if (r() < 0.5) o.fillRect(r() * W, 0, 1.5, H);
    o.globalCompositeOperation = 'difference';
    o.font = `28px ${GROT}`; o.fillStyle = 'rgba(150,150,150,0.8)'; o.textAlign = 'left'; o.textBaseline = 'alphabetic';
    o.fillText('drawn with code', 44, H - 50);
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
    fx.flash = Math.max(fx.flash, h * 0.45);
    post(t, fx);
  }

  window.renderAt = renderAt;
  window.DURATION = 30;
  window.FPS = FPS;
})();
