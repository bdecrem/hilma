// Overclock videos — the engine the three acts share.
//
// A frame is a pure function of time: renderAt(t) reads the act's score
// (score/<act>.js: arrangement, sweep, stem envelopes, every kick/hat/acid
// note) and the act's shot list, and draws one 1920×1080 greyscale frame.
// Every random choice is seeded by the frame or by the onset it belongs to,
// so any frame renders alone and the same way twice.
//
// Pipeline per frame:
//   work canvas 960×540  ← the still (zoom, pan, kick-lit or acid-lit), a flash still,
//                          the act's `under` layer (traces, grids, rings)
//   pixel stage           ← mode (photo · dither · raster · threshold · edges · posterize),
//                          glitches (smear, datamosh blocks, heat shimmer, interlace), invert
//   output 1920×1080      ← upscaled (nearest for 1-bit modes), the act's `over` layer and text,
//                          then slices, ghosting, scanlines, grain, vignette, flash and fades
(() => {
  const W = 1920, H = 1080, w = 960, h = 540;
  const mk = (a, b) => { const c = document.createElement('canvas'); c.width = a; c.height = b; return c; };
  const out = document.getElementById('c'); out.width = W; out.height = H;
  const o = out.getContext('2d');
  const work = mk(w, h), g = work.getContext('2d', { willReadFrequently: true });
  const snap = mk(W, H), sx = snap.getContext('2d');
  const L = new Uint8ClampedArray(w * h), L2 = new Uint8ClampedArray(w * h);

  // --- seeded randomness ----------------------------------------------------
  const hash = (...xs) => { let a = 2166136261; for (const x of xs) { a ^= Math.floor(x * 1000) | 0; a = Math.imul(a, 16777619); } return a >>> 0; };
  const rng = (...xs) => { let s = hash(...xs) || 1; return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const r1 = (...xs) => rng(...xs)();

  // --- textures, built once ---------------------------------------------------
  const BAYER = (() => { // 8×8 ordered-dither thresholds, 0..255
    const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
    return Uint8Array.from(m.flat(), (v) => Math.round((v + 0.5) * 4));
  })();
  const GRAIN = Array.from({ length: 6 }, (_, k) => { // 640×360 noise, drawn ×3: coarse, projector-like
    const c = mk(640, 360), x = c.getContext('2d'), id = x.createImageData(640, 360), r = rng(77, k);
    for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 120; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0); return c;
  });
  const SCAN = (() => { const c = mk(W, H), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#9a9a9a'; for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1); return c; })();
  const VIG = (() => { const c = mk(W, H), x = c.getContext('2d'); const gr = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.85)'); x.fillStyle = gr; x.fillRect(0, 0, W, H); return c; })();

  // --- score ------------------------------------------------------------------
  let S, ACT, BAR, BEAT, STEP, KICKS = [], HATS = [], ACID = [], STILLS = {}, GAIN = {};
  const sectionAt = (bar) => { let s = S.sections[0]; for (const x of S.sections) if (x.bar <= bar + 1e-9) s = x; return s; };
  const pAt = (barF) => {
    const K = S.pKeys;
    if (barF <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) { const [b1, v1] = K[i], [b0, v0] = K[i - 1]; if (barF <= b1) return v0 + ((v1 - v0) * (barF - b0)) / (b1 - b0); }
    return K[K.length - 1][1];
  };
  function buildOnsets() {
    KICKS = []; HATS = []; ACID = [];
    const on = new Set(ACT.acid.onsets), acc = new Set(ACT.acid.accents);
    for (let i = 0; i < S.stepCount; i++) {
      const sec = sectionAt(i / 16), t = i * STEP, k = i % 16;
      if (sec.kick && k % 4 === 0 && S.steps.kick[i] > 0.6) KICKS.push({ t, i, n: KICKS.length });
      if (sec.hats && k % 4 === 2 && S.steps.hats[i] > 0.6) HATS.push({ t, i, n: HATS.length });
      if (sec.acid && on.has(k) && S.steps.acid[i] > 0.12) ACID.push({ t, i, n: ACID.length, accent: acc.has(k), v: S.steps.acid[i] });
    }
  }
  const last = (arr, t) => { let lo = 0, hi = arr.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= t + 1e-6) { r = arr[m]; lo = m + 1; } else hi = m - 1; } return r; };

  /** Everything a shot or layer needs to know about the music at time t. */
  function frameCtx(t) {
    const fi = Math.min(S.frameCount - 1, Math.max(0, Math.round(t * S.fps)));
    const bar = t / BAR;
    const lk = last(KICKS, t), lh = last(HATS, t), la = last(ACID, t);
    const lacc = (() => { for (let a = la; a; a = ACID[a.n - 1]) { if (a.accent) return a; if (t - a.t > BAR) break; } return null; })();
    const since = (x) => (x ? t - x.t : 1e9);
    return {
      t, fi, bar, beat: t / BEAT, step: Math.floor(t / STEP), p: pAt(bar), sec: sectionAt(bar),
      kick: lk, hat: lh, acidNote: la, accent: lacc,
      kickEnv: Math.exp(-since(lk) / 0.11), hatEnv: Math.exp(-since(lh) / 0.045),
      acidEnv: la ? Math.exp(-since(la) / 0.09) * (0.55 + 0.45 * (la.v || 0)) : 0,
      accEnv: Math.exp(-since(lacc) / 0.1),
      onKick: since(lk) < 1 / S.fps, onAccent: since(lacc) < 1 / S.fps,
      mix: S.frames.mix[fi], kickLvl: S.frames.kick[fi], hats: S.frames.hats[fi], acid: S.frames.acid[fi], acidHi: S.frames.acidHi[fi], drone: S.frames.drone[fi],
      rnd: (...xs) => r1(fi, ...xs),
    };
  }

  // --- shots ------------------------------------------------------------------
  const ONEBIT = new Set(['dither', 'threshold', 'raster', 'edges']);
  const UNIT = { beat: 1, half: 2, bar: 4, '2bar': 8, '4bar': 16, '2beat': 2 };
  function shotAt(bar) {
    let i = 0; for (let k = 0; k < ACT.shots.length; k++) if (ACT.shots[k].at <= bar + 1e-9) i = k;
    const s = ACT.shots[i], end = ACT.shots[i + 1]?.at ?? 128;
    return { ...s, index: i, end, u: Math.min(1, Math.max(0, (bar - s.at) / (end - s.at))), lt: bar - s.at };
  }
  /** The still on screen for this shot: a single one, or a montage stepping on beats/bars. */
  function baseStill(shot, f) {
    if (!shot.montage) return shot.still;
    const m = shot.montage, unit = UNIT[m.every || 'beat'] * BEAT;
    const n = Math.floor(((f.bar - shot.at) * BAR + 1e-6) / unit);
    return m.random ? m.list[Math.floor(r1(shot.index, n, 9) * m.list.length)] : m.list[n % m.list.length];
  }
  /** A still flashed over the base on a kick, accent, hat or beat, for a frame or two. */
  function flashStill(shot, f) {
    const fl = shot.flash; if (!fl) return null;
    const src = { kick: KICKS, accent: ACID.filter((a) => a.accent), acid: ACID, hat: HATS }[fl.on || 'kick'];
    const on = fl.on === 'beat' ? { t: Math.floor(f.beat) * BEAT, n: Math.floor(f.beat) } : last(src, f.t);
    if (!on || on.t < shot.at * BAR) return null;
    const prob = typeof fl.prob === 'function' ? fl.prob(f) : (fl.prob ?? 0.25);
    if (r1(shot.index, on.n, 1) >= prob) return null;
    if (f.t - on.t >= (fl.frames ?? 2) / S.fps) return null;
    return { name: fl.list[Math.floor(r1(shot.index, on.n, 2) * fl.list.length)], mode: fl.mode, invert: fl.invert };
  }
  /** Brightness of the base still: lit by the kick like a strobe-lit room, by the acid voice, or steady. */
  function lightLevel(shot, f) {
    const L = shot.light || 'kick', floor = Math.max(shot.floor ?? 0.18, ACT.minFloor ?? 0), top = shot.level ?? 1;
    let b;
    if (L === 'kick' && f.sec.kick) b = floor + (top - floor) * Math.pow(f.kickEnv, 0.6);
    else if (L === 'acid' || (L === 'kick' && f.sec.acid)) b = floor + (top - floor) * Math.min(1, f.acid * 0.9 + f.accEnv * 0.5);
    else b = top * (0.92 + 0.08 * Math.sin(f.t * 1.7));
    if (shot.ramp) b *= shot.ramp[0] + (shot.ramp[1] - shot.ramp[0]) * shot.u;
    return Math.max(0, Math.min(1.6, b));
  }
  function drawStill(name, { zoom = 1, panX = 0, panY = 0, alpha = 1, contrast = 1.25 }) {
    const img = STILLS[name]; if (!img) throw new Error(`no still "${name}" in ${ACT.id}`);
    const s = (w / img.width) * zoom, dw = img.width * s, dh = img.height * s;
    const dx = (w - dw) / 2 + panX * (dw - w) / 2, dy = (h - dh) / 2 + panY * (dh - h) / 2;
    const b = alpha * (GAIN[name] || 1); // auto-levels: night photographs come up to a readable white
    g.globalAlpha = Math.min(1, b); g.filter = `contrast(${contrast})${b > 1 ? ` brightness(${b})` : ''}`;
    g.drawImage(img, dx, dy, dw, dh);
    g.filter = 'none'; g.globalAlpha = 1;
  }
  const lerp = (a, b, u) => a + (b - a) * u;
  const ease = (u) => u * u * (3 - 2 * u);

  // --- pixel stage ----------------------------------------------------------------
  function pixelStage(mode, fx, f, seed) {
    const id = g.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = d[j];
    if (fx.shimmer > 0) { // heat haze: rows slide sideways on a travelling sine
      L2.set(L);
      for (let y = 0; y < h; y++) {
        const s = Math.round(fx.shimmer * Math.sin(y * 0.045 + f.t * 9) * (0.55 + 0.45 * Math.sin(y * 0.011 - f.t * 3.1)));
        if (!s) continue;
        const row = y * w;
        for (let x = 0; x < w; x++) { const sx2 = Math.min(w - 1, Math.max(0, x + s)); L[row + x] = L2[row + sx2]; }
      }
    }
    if (fx.blocks > 0) { // datamosh: macroblocks lifted from somewhere nearby
      L2.set(L); const r = rng(seed, 31), n = Math.round(fx.blocks * 60), B = 24;
      for (let k = 0; k < n; k++) {
        const bx = Math.floor(r() * (w / B)) * B, by = Math.floor(r() * (h / B)) * B;
        const ox = Math.round((r() - 0.5) * 140), oy = Math.round((r() - 0.5) * 50);
        for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
          const tx = bx + x, ty = by + y, fx2 = Math.min(w - 1, Math.max(0, tx + ox)), fy = Math.min(h - 1, Math.max(0, ty + oy));
          if (ty < h && tx < w) L[ty * w + tx] = L2[fy * w + fx2];
        }
      }
    }
    if (fx.smear > 0) { // rows smeared out from a break point, the pixel-sort look
      const r = rng(seed, 47), n = Math.round(fx.smear * 9);
      for (let k = 0; k < n; k++) {
        const y0 = Math.floor(r() * h), bh = 2 + Math.floor(r() * 26), x0 = Math.floor(r() * w * 0.8), dir = r() < 0.5 ? 1 : -1;
        for (let y = y0; y < Math.min(h, y0 + bh); y++) {
          const row = y * w, v = L[row + x0];
          if (dir > 0) for (let x = x0; x < w; x++) L[row + x] = v; else for (let x = x0; x >= 0; x--) L[row + x] = v;
        }
      }
    }
    if (fx.interlace > 0) { const s = Math.round(fx.interlace * 18); L2.set(L); for (let y = 1; y < h; y += 2) { const row = y * w; for (let x = 0; x < w; x++) L[row + x] = L2[row + Math.min(w - 1, x + s)]; } }

    if (mode === 'dither') {
      const bias = fx.bias || 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; L[i] = L[i] + bias > BAYER[((y & 7) << 3) | (x & 7)] ? 255 : 0; }
    } else if (mode === 'threshold') {
      const th = fx.threshold ?? 110;
      for (let i = 0; i < L.length; i++) L[i] = L[i] > th ? 255 : 0;
    } else if (mode === 'raster') { // horizontal line screen: lines thicken with brightness
      const P = 5;
      for (let y = 0; y < h; y++) { const dist = Math.abs(((y % P) + 0.5) - P / 2) / (P / 2) * 255; const row = y * w; for (let x = 0; x < w; x++) L[row + x] = L[row + x] * 1.15 > dist ? 235 : 0; }
    } else if (mode === 'edges') {
      L2.set(L);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = -L2[i - w - 1] - 2 * L2[i - 1] - L2[i + w - 1] + L2[i - w + 1] + 2 * L2[i + 1] + L2[i + w + 1];
        const gy = -L2[i - w - 1] - 2 * L2[i - w] - L2[i - w + 1] + L2[i + w - 1] + 2 * L2[i + w] + L2[i + w + 1];
        L[i] = Math.min(255, (Math.abs(gx) + Math.abs(gy)) * 0.9);
      }
    } else if (mode === 'posterize') {
      for (let i = 0; i < L.length; i++) L[i] = Math.round(L[i] / 85) * 85;
    }
    if ((fx.gain ?? 1) < 0.999) { const k = Math.max(0, fx.gain); for (let i = 0; i < L.length; i++) L[i] = L[i] * k; }
    if (fx.invert) for (let i = 0; i < L.length; i++) L[i] = 255 - L[i];
    for (let i = 0, j = 0; i < L.length; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = L[i]; d[j + 3] = 255; }
    g.putImageData(id, 0, 0);
  }

  // --- text -----------------------------------------------------------------------
  const FONTS = { mono: '"JetBrains Mono", monospace', big: '"Big Shoulders Display", sans-serif' };
  function drawText(x, txt, f) {
    const from = txt.from * BAR, to = (txt.to ?? txt.from + 2) * BAR;
    if (f.t < from || f.t >= to) return;
    const lt = f.t - from, rem = to - f.t;
    let str = txt.str;
    if (txt.type === 'type' || txt.type === undefined) str = str.slice(0, Math.floor(lt / 0.045));
    if (txt.blink === 'hat' && f.hatEnv < 0.25) return;
    if (txt.blink === 'beat' && Math.floor(f.beat) % 2) return;
    const size = txt.size || 22, font = txt.font || 'mono';
    let a = Math.min(1, rem / 0.25) * (txt.alpha ?? 1);
    let scale = 1;
    if (txt.type === 'slam') { scale = 1 + 0.45 * Math.exp(-lt / 0.06); a *= Math.min(1, lt / 0.02); }
    x.save();
    x.globalAlpha = a; x.fillStyle = txt.color || '#e8e8e8';
    x.font = `${font === 'big' ? '800 ' : '500 '}${size}px ${FONTS[font]}`;
    x.textAlign = txt.align || 'left'; x.textBaseline = 'middle';
    if ('letterSpacing' in x) x.letterSpacing = `${txt.track ?? (font === 'mono' ? 0.18 : 0.02) * size}px`;
    x.translate(txt.x * W, txt.y * H); x.scale(scale, scale);
    x.fillText(str, 0, 0);
    x.restore();
  }

  // --- the frame --------------------------------------------------------------------
  function renderAt(t) {
    const f = frameCtx(t), shot = shotAt(f.bar);
    f.shot = shot;
    const fx = { slices: 0, smear: 0, blocks: 0, ghost: 0, shimmer: 0, interlace: 0, invert: !!shot.invert, flash: 0, black: 0, bias: 0, ...(ACT.glitch ? ACT.glitch(f, shot) : {}) };
    // Default glitch: the shot's amount, triggered by accents and kicks.
    const gl = (typeof shot.glitch === 'function' ? shot.glitch(f) : shot.glitch) || 0;
    if (gl > 0) {
      fx.slices = Math.max(fx.slices, gl * (0.75 * f.accEnv + 0.35 * f.kickEnv));
      fx.smear = Math.max(fx.smear, f.onAccent || f.accEnv > 0.6 ? gl * 0.9 : 0);
      fx.blocks = Math.max(fx.blocks, f.accEnv > 0.5 && f.rnd(3) < gl ? gl : 0);
      fx.ghost = Math.max(fx.ghost, gl * 0.6 * f.kickEnv);
      fx.interlace = Math.max(fx.interlace, gl > 0.5 && f.rnd(4) < gl * 0.3 ? 1 : 0);
    }

    // 1. base + flash on the work canvas
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const name = baseStill(shot, f);
    const zoom = shot.zoom ? lerp(shot.zoom[0], shot.zoom[1], shot.easeZoom === false ? shot.u : ease(shot.u)) : 1;
    const panX = shot.pan ? lerp(shot.pan[0], shot.pan[1], shot.u) : 0, panY = shot.panY ? lerp(shot.panY[0], shot.panY[1], shot.u) : 0;
    let mode = shot.mode || 'photo';
    if (shot.modes) { const n = Math.floor(((f.bar - shot.at) * BAR + 1e-6) / (UNIT[shot.modes.every || 'beat'] * BEAT)); mode = shot.modes.list[n % shot.modes.list.length]; }
    // 1-bit modes threshold the picture at full brightness and dim the result,
    // so the dots stay on screen between kicks and flare on them.
    const light = lightLevel(shot, f), oneBit = ONEBIT.has(mode);
    if (oneBit) fx.gain = Math.min(1, light);
    if (name) drawStill(name, { zoom, panX, panY, alpha: oneBit ? Math.max(1, light) : light, contrast: shot.contrast ?? 1.25 });
    const fl = flashStill(shot, f);
    if (fl) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); drawStill(fl.name, { zoom: 1.05, alpha: 1.15, contrast: 1.6 }); if (fl.mode) mode = fl.mode; if (fl.invert) fx.invert = !fx.invert; fx.gain = 1; }
    if (ACT.under) ACT.under(g, f, shot, { drawStill, w, h, lerp, ease, rng, r1, BAR, BEAT, STEP, KICKS, HATS, ACID, pAt, sectionAt });

    // 2. pixel stage
    const needsPixels = mode !== 'photo' || fx.shimmer > 0 || fx.blocks > 0 || fx.smear > 0 || fx.interlace > 0 || fx.invert || (fx.gain ?? 1) < 0.999;
    if (needsPixels) pixelStage(mode, fx, f, f.fi);

    // 3. up to 1080p, then the crisp layers
    o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
    o.imageSmoothingEnabled = !['dither', 'threshold', 'raster'].includes(mode);
    o.drawImage(work, 0, 0, W, H);
    if (ACT.over) ACT.over(o, f, shot, { W, H, lerp, ease, rng, r1, BAR, BEAT, STEP, FONTS, KICKS, HATS, ACID, pAt, sectionAt, text: (txt) => drawText(o, { from: 0, to: 1e6, type: 'static', ...txt }, f) });
    if (ACT.timecode !== false) { // projection timecode, top right
      const fr = f.fi % S.fps, sec = Math.floor(f.t) % 60, min = Math.floor(f.t / 60);
      drawText(o, { from: 0, to: 1e6, type: 'static', str: `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(fr).padStart(2, '0')}`, x: 0.955, y: 0.075, size: 16, align: 'right', alpha: 0.55 }, f);
    }
    for (const txt of ACT.text || []) drawText(o, txt, f);

    // 4. post
    if (fx.slices > 0.02 || fx.ghost > 0.02) { sx.globalCompositeOperation = 'copy'; sx.drawImage(out, 0, 0); }
    if (fx.slices > 0.02) {
      const r = rng(f.fi, 13), n = 2 + Math.round(fx.slices * 10);
      for (let k = 0; k < n; k++) { const y = Math.floor(r() * H), bh = 6 + Math.floor(r() * 90), dx = Math.round((r() - 0.5) * 260 * fx.slices); o.drawImage(snap, 0, y, W, bh, dx, y, W, bh); }
    }
    if (fx.ghost > 0.02) { o.globalCompositeOperation = 'lighter'; o.globalAlpha = Math.min(0.5, fx.ghost); o.drawImage(snap, 18 + 30 * fx.ghost, 0); o.globalAlpha = 1; }
    o.globalCompositeOperation = 'multiply'; o.drawImage(SCAN, 0, 0);
    o.globalCompositeOperation = 'overlay'; o.globalAlpha = ACT.grain ?? 0.22; o.drawImage(GRAIN[Math.floor(f.fi / 2) % GRAIN.length], 0, 0, W, H);
    o.globalAlpha = 1; o.globalCompositeOperation = 'source-over'; o.drawImage(VIG, 0, 0);
    if (fx.flash > 0) { o.fillStyle = `rgba(255,255,255,${Math.min(1, fx.flash)})`; o.fillRect(0, 0, W, H); }
    // Fade from black at the top of the track and to black at its end (the act decides when).
    const fadeIn = ACT.fadeIn ?? 0.5, fadeOut = ACT.fadeOut || [S.duration - 4, S.duration - 0.5];
    const black = Math.max(fx.black, 1 - Math.min(1, t / fadeIn), Math.min(1, Math.max(0, (t - fadeOut[0]) / (fadeOut[1] - fadeOut[0]))));
    if (black > 0) { o.fillStyle = `rgba(0,0,0,${black})`; o.fillRect(0, 0, W, H); }
  }

  // --- boot ---------------------------------------------------------------------------
  window.defineAct = (act) => { ACT = act; };
  window.bootAct = async () => {
    S = window.SCORE; BAR = 60 / S.bpm * 4; BEAT = BAR / 4; STEP = BAR / 16;
    buildOnsets();
    await Promise.all(Object.entries(ACT.stills).map(([name, file]) => new Promise((res, rej) => {
      const img = new Image(); img.onload = () => {
        STILLS[name] = img;
        // Gain so the brightest 2% of the picture reaches ~225 (never down, at most ×2.4; an act can pin one).
        const c = mk(160, 90), x = c.getContext('2d'); x.drawImage(img, 0, 0, 160, 90);
        const d = x.getImageData(0, 0, 160, 90).data, v = [];
        for (let i = 0; i < d.length; i += 4) v.push(d[i]);
        v.sort((a, b) => a - b);
        GAIN[name] = ACT.gain?.[name] ?? Math.min(2.4, Math.max(1, 225 / Math.max(1, v[Math.floor(v.length * 0.98)])));
        res();
      }; img.onerror = () => rej(new Error(`still ${file}`)); img.src = `stills/${ACT.id}/${file}.jpg`;
    })));
    window.DURATION = S.duration; window.FPS = S.fps; window.renderAt = renderAt;
    window.GAINS = GAIN;
    window.ONSETS = { kicks: KICKS.length, hats: HATS.length, acid: ACID.length, accents: ACID.filter((a) => a.accent).length };
  };
})();
