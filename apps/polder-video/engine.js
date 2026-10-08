// Polder — the frame engine. Grown from apps/overclock-video/engine.js, with
// archival FOOTAGE in place of generated stills and the dub mixer's moves drawn
// into the picture.
//
// A frame is a pure function of time: renderAt(t) reads the score
// (score/polder.js: sections, the chord opening `p`, stem envelopes, the riff)
// and the shot list, and draws one 1920×1080 greyscale frame. Every random
// choice is seeded by the frame or the onset it belongs to, so any frame
// renders alone and the same way twice. Footage frames are JPEG sequences
// (footage/<name>/0001.jpg …, FPS a second); prepare(t) loads what a frame
// needs before renderAt(t) draws it.
//
// What the music does to the picture:
//   kick      lights the footage like a slow strobe — gently, the floor stays high
//   stab      prints the frame again at every dotted-eighth echo of the dub delay,
//             fading with the feedback (0.58 a repeat), drifting sideways: you see the delay
//   sub riff  the waterline — a horizon that rides the bass note
//   bell      a ripple ring on the water
//   hats/rim  the delay lamps at the foot of the frame tick
//   drone     the breath of the vignette
//   p         the chord opening: contrast and the lamps' reach
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
  const BAYER = (() => {
    const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
    return Uint8Array.from(m.flat(), (v) => Math.round((v + 0.5) * 4));
  })();
  const GRAIN = Array.from({ length: 6 }, (_, k) => {
    const c = mk(640, 360), x = c.getContext('2d'), id = x.createImageData(640, 360), r = rng(77, k);
    for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 120; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0); return c;
  });
  const SCAN = (() => { const c = mk(W, H), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#b4b4b4'; for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1); return c; })();
  const VIG = (() => { const c = mk(W, H), x = c.getContext('2d'); const gr = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.85)'); x.fillStyle = gr; x.fillRect(0, 0, W, H); return c; })();

  // --- score ------------------------------------------------------------------
  let S, ACT, BAR, BEAT, STEP, DOT8, KICKS = [], HATS = [], STABS = [], BELLS = [], FOOT = {}, GAIN = {};
  const sectionAt = (bar) => { let s = S.sections[0]; for (const x of S.sections) if (x.bar <= bar + 1e-9) s = x; return s; };
  const pAt = (barF) => {
    const K = S.pKeys;
    if (barF <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) { const [b1, v1] = K[i], [b0, v0] = K[i - 1]; if (barF <= b1) return b1 === b0 ? v1 : v0 + ((v1 - v0) * (barF - b0)) / (b1 - b0); }
    return K[K.length - 1][1];
  };
  const NOTE = { G1: 0, A1: 0.12, C2: 0.42, D2: 0.58, E2: 0.75 }; // the riff's notes as heights
  /** The onsets come from the patterns the song script wrote, not from the stems — the delay smears those. */
  function buildOnsets() {
    KICKS = []; HATS = []; STABS = []; BELLS = [];
    for (let i = 0; i < S.stepCount; i++) {
      const bar = Math.floor(i / 16), sec = sectionAt(bar), t = i * STEP, k = i % 16, inSec = i - sec.bar * 16;
      if (sec.kick && k % 4 === 0) KICKS.push({ t, i, n: KICKS.length });
      if (sec.hats && k % 4 === 2) HATS.push({ t, i, n: HATS.length, rim: false });
      if (sec.rim && [7, 19, 29].includes(inSec % 32)) HATS.push({ t, i, n: HATS.length, rim: true });
      const stab = sec.stabs === 'SKANK' ? [2, 6, 10].includes(k) : sec.stabs === 'HALF' ? [2, 10].includes(k) : sec.stabs === 'THROW' ? k === 2 && (bar - sec.bar) % 2 === 0 : false;
      if (stab) STABS.push({ t, i, n: STABS.length, accent: k === 2, throw: sec.stabs === 'THROW' });
      if (sec.bell && [0, 26, 36].includes(inSec % 48)) BELLS.push({ t, i, n: BELLS.length, note: [0, 26, 36].indexOf(inSec % 48) });
    }
    HATS.sort((a, b) => a.t - b.t); HATS.forEach((x, n) => { x.n = n; });
  }
  const last = (arr, t) => { let lo = 0, hi = arr.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= t + 1e-6) { r = arr[m]; lo = m + 1; } else hi = m - 1; } return r; };
  const FEEDBACK = 0.58, ECHOES = 7;

  /** Everything a shot or layer needs to know about the music at time t. */
  function frameCtx(t) {
    const fi = Math.min(S.frameCount - 1, Math.max(0, Math.round(t * S.fps)));
    const bar = t / BAR, step = Math.floor(t / STEP);
    const sec = sectionAt(bar);
    const lk = last(KICKS, t), lh = last(HATS, t), ls = last(STABS, t), lb = last(BELLS, t);
    const since = (x) => (x ? t - x.t : 1e9);
    // The dub delay: every stab still sounding, with the echo it is on and how loud.
    const echoes = [];
    for (let n = ls ? ls.n : -1; n >= 0; n--) {
      const s = STABS[n], age = t - s.t;
      if (age > DOT8 * ECHOES) break;
      const k = Math.floor(age / DOT8), within = age - k * DOT8;
      echoes.push({ stab: s, k, within, level: Math.pow(FEEDBACK, k) * (s.accent ? 1 : 0.8) });
    }
    const subNote = sec.sub ? S.riff[(step - sec.bar * 16) % 32] : null;
    return {
      t, fi, bar, beat: t / BEAT, step, p: pAt(bar), sec,
      kick: lk, hat: lh, stab: ls, bell: lb, echoes, subNote, subHeight: subNote ? NOTE[subNote] ?? 0.2 : 0,
      kickEnv: Math.exp(-since(lk) / 0.14), hatEnv: Math.exp(-since(lh) / 0.05), stabEnv: Math.exp(-since(ls) / 0.12), bellEnv: Math.exp(-since(lb) / 0.6),
      onKick: since(lk) < 1 / S.fps, onStab: since(ls) < 1 / S.fps,
      mix: S.frames.mix[fi], kickLvl: S.frames.kick[fi], hats: S.frames.hats[fi], sub: S.frames.sub[fi], chord: S.frames.chord[fi], chordHi: S.frames.chordHi[fi], bellLvl: S.frames.bell[fi], drone: S.frames.drone[fi],
      rnd: (...xs) => r1(fi, ...xs),
    };
  }

  // --- footage ------------------------------------------------------------------
  const CACHE = new Map(), MAX_CACHE = 700;
  const key = (name, idx) => `${name}/${idx}`;
  function frameIndex(name, lt, shot) {
    const c = FOOT[name]; if (!c) throw new Error(`no footage "${name}"`);
    const speed = shot?.speed ?? ACT.speed ?? 0.75, offset = shot?.offset ?? 0;
    let f = Math.floor(offset * S.fps + lt * S.fps * speed);
    const n = c.frames;
    if (n <= 1) return 1;
    const loop = shot?.loop ?? ACT.loop ?? 'pingpong';
    if (loop === 'hold') f = Math.min(n - 1, f);
    else if (loop === 'loop') f %= n;
    else { const cycle = 2 * (n - 1); f %= cycle; if (f >= n) f = cycle - f; }
    return f + 1;
  }
  async function loadFrame(name, idx) {
    const k = key(name, idx);
    if (CACHE.has(k)) { const v = CACHE.get(k); CACHE.delete(k); CACHE.set(k, v); return v; }
    const res = await fetch(`footage/${name}/${String(idx).padStart(4, '0')}.jpg`);
    if (!res.ok) throw new Error(`footage ${k}: ${res.status}`);
    const bmp = await createImageBitmap(await res.blob());
    CACHE.set(k, bmp);
    if (CACHE.size > MAX_CACHE) { const first = CACHE.keys().next().value; CACHE.get(first).close?.(); CACHE.delete(first); }
    return bmp;
  }
  const getFrame = (name, idx) => { const v = CACHE.get(key(name, idx)); if (!v) throw new Error(`frame not prepared: ${name}/${idx}`); return v; };

  // --- shots ------------------------------------------------------------------
  const ONEBIT = new Set(['dither', 'threshold', 'raster', 'edges']);
  const UNIT = { beat: 1, half: 2, bar: 4, '2bar': 8, '4bar': 16 };
  function shotAt(bar) {
    let i = 0; for (let k = 0; k < ACT.shots.length; k++) if (ACT.shots[k].at <= bar + 1e-9) i = k;
    const s = ACT.shots[i], end = ACT.shots[i + 1]?.at ?? 128;
    return { ...s, index: i, end, u: Math.min(1, Math.max(0, (bar - s.at) / (end - s.at))), lt: (bar - s.at) * BAR };
  }
  /** The clip on screen for this shot: one, or a montage stepping on bars. */
  function baseClip(shot, f) {
    if (!shot.montage) return { name: shot.clip, lt: shot.lt };
    const m = shot.montage, unit = UNIT[m.every || 'bar'] * BEAT;
    const n = Math.floor((shot.lt + 1e-6) / unit);
    const name = m.random ? m.list[Math.floor(r1(shot.index, n, 9) * m.list.length)] : m.list[n % m.list.length];
    return { name, lt: shot.lt - n * unit + (m.continuous ? n * unit : 0) };
  }
  /** Brightness of the base picture: lit by the kick like a slow strobe, or steady. */
  function lightLevel(shot, f) {
    const L = shot.light || 'kick', floor = Math.max(shot.floor ?? 0.5, ACT.minFloor ?? 0), top = shot.level ?? 1;
    let b;
    if (L === 'kick' && f.sec.kick) b = floor + (top - floor) * Math.pow(f.kickEnv, 0.5);
    else if (L === 'stab') b = floor + (top - floor) * Math.min(1, 0.5 * f.chord + 0.6 * f.stabEnv);
    else b = top * (0.94 + 0.06 * Math.sin(f.t * 0.9));
    if (shot.ramp) b *= shot.ramp[0] + (shot.ramp[1] - shot.ramp[0]) * shot.u;
    return Math.max(0, Math.min(1.6, b));
  }
  function drawFrame(img, { zoom = 1, panX = 0, panY = 0, alpha = 1, contrast = 1.15, gain = 1, weave = 0 }) {
    const s = Math.max(w / img.width, h / img.height) * zoom, dw = img.width * s, dh = img.height * s; // cover the frame
    const dx = (w - dw) / 2 + panX * (dw - w) / 2 + weave, dy = (h - dh) / 2 + panY * (dh - h) / 2;
    const b = alpha * gain;
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
    if (fx.blocks > 0) {
      L2.set(L); const r = rng(seed, 31), n = Math.round(fx.blocks * 40), B = 24;
      for (let k = 0; k < n; k++) {
        const bx = Math.floor(r() * (w / B)) * B, by = Math.floor(r() * (h / B)) * B;
        const ox = Math.round((r() - 0.5) * 120), oy = Math.round((r() - 0.5) * 40);
        for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
          const tx = bx + x, ty = by + y, fx2 = Math.min(w - 1, Math.max(0, tx + ox)), fy = Math.min(h - 1, Math.max(0, ty + oy));
          if (ty < h && tx < w) L[ty * w + tx] = L2[fy * w + fx2];
        }
      }
    }
    if (fx.smear > 0) {
      const r = rng(seed, 47), n = Math.round(fx.smear * 7);
      for (let k = 0; k < n; k++) {
        const y0 = Math.floor(r() * h), bh = 2 + Math.floor(r() * 20), x0 = Math.floor(r() * w * 0.8), dir = r() < 0.5 ? 1 : -1;
        for (let y = y0; y < Math.min(h, y0 + bh); y++) {
          const row = y * w, v = L[row + x0];
          if (dir > 0) for (let x = x0; x < w; x++) L[row + x] = v; else for (let x = x0; x >= 0; x--) L[row + x] = v;
        }
      }
    }
    if (fx.interlace > 0) { const s = Math.round(fx.interlace * 14); L2.set(L); for (let y = 1; y < h; y += 2) { const row = y * w; for (let x = 0; x < w; x++) L[row + x] = L2[row + Math.min(w - 1, x + s)]; } }
    if (mode === 'dither') {
      const bias = fx.bias || 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; L[i] = L[i] + bias > BAYER[((y & 7) << 3) | (x & 7)] ? 255 : 0; }
    } else if (mode === 'threshold') {
      const th = fx.threshold ?? 110;
      for (let i = 0; i < L.length; i++) L[i] = L[i] > th ? 255 : 0;
    } else if (mode === 'raster') {
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

  // --- film damage: a scratch that wanders for a few frames, dust, gate weave -------
  function filmDamage(f, amount) {
    if (amount <= 0) return;
    const r = rng(Math.floor(f.fi / 6), 88);
    if (r() < amount * 0.5) { // a vertical scratch, slightly drifting
      const x = r() * w, drift = (f.rnd(89) - 0.5) * 3, bright = r() < 0.5;
      g.strokeStyle = bright ? `rgba(255,255,255,${0.25 + 0.4 * amount})` : `rgba(0,0,0,${0.4 + 0.4 * amount})`;
      g.lineWidth = 1 + r() * 1.5; g.beginPath(); g.moveTo(x + drift, 0); g.lineTo(x + drift + (r() - 0.5) * 4, h); g.stroke();
    }
    const d = rng(f.fi, 90), n = Math.round(amount * 6 * d());
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < n; k++) { const x = d() * w, y = d() * h, s = 1 + d() * 2.5; g.fillRect(x, y, s, s * (0.5 + d())); }
  }

  // --- text -----------------------------------------------------------------------
  const FONTS = { mono: '"JetBrains Mono", monospace', big: '"Big Shoulders Display", sans-serif' };
  function drawText(x, txt, f) {
    const from = txt.from * BAR, to = (txt.to ?? txt.from + 2) * BAR;
    if (f.t < from || f.t >= to) return;
    const lt = f.t - from, rem = to - f.t;
    let str = txt.str;
    if (txt.type === 'type' || txt.type === undefined) str = str.slice(0, Math.floor(lt / 0.06));
    const size = txt.size || 22, font = txt.font || 'mono';
    let a = Math.min(1, rem / 0.6, lt / (txt.fade ?? 0.02)) * (txt.alpha ?? 1);
    let scale = 1;
    if (txt.type === 'slam') { scale = 1 + 0.3 * Math.exp(-lt / 0.08); a *= Math.min(1, lt / 0.02); }
    x.save();
    x.globalAlpha = a; x.fillStyle = txt.color || '#e8e8e8';
    x.font = `${font === 'big' ? '800 ' : '500 '}${size}px ${FONTS[font]}`;
    x.textAlign = txt.align || 'left'; x.textBaseline = 'middle';
    if ('letterSpacing' in x) x.letterSpacing = `${txt.track ?? (font === 'mono' ? 0.18 : 0.02) * size}px`;
    x.translate(txt.x * W, txt.y * H); x.scale(scale, scale);
    x.fillText(str, 0, 0);
    x.restore();
  }

  // --- what a frame needs ------------------------------------------------------------
  function needs(t) {
    const f = frameCtx(t), shot = shotAt(f.bar), list = [];
    const base = baseClip(shot, f);
    list.push([base.name, frameIndex(base.name, base.lt, shot)]);
    // Dissolve from the previous shot.
    const prev = ACT.shots[shot.index - 1];
    if (prev && shot.dissolve && shot.lt < shot.dissolve * BAR) {
      const ps = { ...prev, index: shot.index - 1, lt: (f.bar - prev.at) * BAR, u: 1 };
      const pc = baseClip(ps, f); list.push([pc.name, frameIndex(pc.name, pc.lt, ps)]);
    }
    // The echo prints: the frame at each sounding stab's moment.
    for (const e of f.echoes) { if (e.k === 0 || e.within > ACT.echoWindow) continue; const sb = (e.stab.t) / BAR, s2 = shotAt(sb), c2 = baseClip(s2, { bar: sb }); list.push([c2.name, frameIndex(c2.name, c2.lt, s2)]); }
    return list;
  }
  async function prepare(t) { await Promise.all(needs(t).map(([n, i]) => loadFrame(n, i))); }

  // --- the frame --------------------------------------------------------------------
  function renderAt(t) {
    const f = frameCtx(t), shot = shotAt(f.bar);
    f.shot = shot;
    const fx = { slices: 0, smear: 0, blocks: 0, ghost: 0, interlace: 0, invert: !!shot.invert, flash: 0, black: 0, bias: 0, ...(ACT.glitch ? ACT.glitch(f, shot) : {}) };
    // Glitch: the shot's amount, on stabs (not kicks — this one breathes).
    const gl = (typeof shot.glitch === 'function' ? shot.glitch(f) : shot.glitch) || 0;
    if (gl > 0) {
      fx.slices = Math.max(fx.slices, gl * 0.8 * f.stabEnv * (f.stab?.accent ? 1 : 0.5));
      fx.smear = Math.max(fx.smear, f.onStab && f.stab.accent && f.rnd(2) < gl ? gl * 0.7 : 0);
      fx.blocks = Math.max(fx.blocks, f.stabEnv > 0.6 && f.rnd(3) < gl * 0.5 ? gl : 0);
      fx.interlace = Math.max(fx.interlace, gl > 0.5 && f.rnd(4) < gl * 0.2 ? 1 : 0);
    }

    // 1. the footage on the work canvas
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const base = baseClip(shot, f);
    const zoom = shot.zoom ? lerp(shot.zoom[0], shot.zoom[1], ease(shot.u)) : 1;
    const panX = shot.pan ? lerp(shot.pan[0], shot.pan[1], shot.u) : 0, panY = shot.panY ? lerp(shot.panY[0], shot.panY[1], shot.u) : 0;
    let mode = shot.mode || 'photo';
    if (shot.modes) { const n = Math.floor((shot.lt + 1e-6) / (UNIT[shot.modes.every || 'bar'] * BEAT)); mode = shot.modes.list[n % shot.modes.list.length]; }
    const light = lightLevel(shot, f), oneBit = ONEBIT.has(mode);
    if (oneBit) fx.gain = Math.min(1, light);
    const weave = (ACT.weave ?? 1.5) * (f.rnd(7) - 0.5) * 2;
    const contrast = (shot.contrast ?? 1.15) + 0.2 * f.p;
    const gain = GAIN[base.name] ?? 1;
    drawFrame(getFrame(base.name, frameIndex(base.name, base.lt, shot)), { zoom, panX, panY, alpha: oneBit ? Math.max(1, light) : light, contrast, gain, weave });
    const prev = ACT.shots[shot.index - 1];
    if (prev && shot.dissolve && shot.lt < shot.dissolve * BAR) { // the previous shot fades out over the new one
      const ps = { ...prev, index: shot.index - 1, lt: (f.bar - prev.at) * BAR, u: 1 };
      const pc = baseClip(ps, f);
      const pz = prev.zoom ? prev.zoom[1] : 1;
      drawFrame(getFrame(pc.name, frameIndex(pc.name, pc.lt, ps)), { zoom: pz, panX: prev.pan ? prev.pan[1] : 0, panY: prev.panY ? prev.panY[1] : 0, alpha: (1 - ease(shot.lt / (shot.dissolve * BAR))) * light, contrast: prev.contrast ?? 1.15, gain: GAIN[pc.name] ?? 1 });
    }
    // The dub delay, printed: the stab's frame again at each echo, shifted a little further each time.
    const prints = shot.prints ?? ACT.prints ?? 1;
    if (prints > 0) {
      g.globalCompositeOperation = 'screen';
      for (const e of f.echoes) {
        if (e.k === 0 || e.within > ACT.echoWindow) continue;
        const sb = e.stab.t / BAR, s2 = shotAt(sb), c2 = baseClip(s2, { bar: sb });
        const env = Math.exp(-e.within / 0.07);
        const a = Math.min(0.6, e.level * env * prints * (e.stab.throw ? 1.3 : 1));
        if (a < 0.015) continue;
        const dir = (hash(e.stab.n) & 1) ? 1 : -1;
        g.filter = `contrast(1.7) brightness(0.85)`; g.globalAlpha = a;
        const img = getFrame(c2.name, frameIndex(c2.name, c2.lt, s2));
        const s = Math.max(w / img.width, h / img.height) * (1 + 0.04 * e.k), dw = img.width * s, dh = img.height * s;
        g.drawImage(img, (w - dw) / 2 + dir * e.k * 16, (h - dh) / 2 - e.k * 3, dw, dh);
      }
      g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    filmDamage(f, shot.damage ?? ACT.damage ?? 0.3);
    if (ACT.under) ACT.under(g, f, shot, { w, h, lerp, ease, rng, r1, BAR, BEAT, STEP, DOT8, KICKS, HATS, STABS, BELLS, pAt, sectionAt });

    // 2. pixel stage
    const needsPixels = mode !== 'photo' || fx.blocks > 0 || fx.smear > 0 || fx.interlace > 0 || fx.invert || (fx.gain ?? 1) < 0.999;
    if (needsPixels) pixelStage(mode, fx, f, f.fi);

    // 3. up to 1080p, then the crisp layers
    o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
    o.imageSmoothingEnabled = !['dither', 'threshold', 'raster'].includes(mode);
    o.drawImage(work, 0, 0, W, H);
    if (ACT.over) ACT.over(o, f, shot, { W, H, lerp, ease, rng, r1, BAR, BEAT, STEP, DOT8, KICKS, HATS, STABS, BELLS, pAt, sectionAt, text: (txt) => drawText(o, { from: 0, to: 1e6, type: 'static', ...txt }, f) });
    if (ACT.timecode !== false) {
      const fr = f.fi % S.fps, sec = Math.floor(f.t) % 60, min = Math.floor(f.t / 60);
      drawText(o, { from: 0, to: 1e6, type: 'static', str: `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(fr).padStart(2, '0')}`, x: 0.955, y: 0.075, size: 16, align: 'right', alpha: 0.45 }, f);
    }
    for (const txt of ACT.text || []) drawText(o, txt, f);

    // 4. post
    if (fx.slices > 0.02 || fx.ghost > 0.02) { sx.globalCompositeOperation = 'copy'; sx.drawImage(out, 0, 0); }
    if (fx.slices > 0.02) {
      const r = rng(f.fi, 13), n = 1 + Math.round(fx.slices * 6);
      for (let k = 0; k < n; k++) { const y = Math.floor(r() * H), bh = 6 + Math.floor(r() * 70), dx = Math.round((r() - 0.5) * 160 * fx.slices); o.drawImage(snap, 0, y, W, bh, dx, y, W, bh); }
    }
    if (fx.ghost > 0.02) { o.globalCompositeOperation = 'lighter'; o.globalAlpha = Math.min(0.5, fx.ghost); o.drawImage(snap, 18 + 30 * fx.ghost, 0); o.globalAlpha = 1; }
    o.globalCompositeOperation = 'multiply'; o.globalAlpha = ACT.scan ?? 0.6; o.drawImage(SCAN, 0, 0); o.globalAlpha = 1;
    o.globalCompositeOperation = 'overlay'; o.globalAlpha = ACT.grain ?? 0.18; o.drawImage(GRAIN[Math.floor(f.fi / 2) % GRAIN.length], 0, 0, W, H);
    o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(f.t * 2 * Math.PI * 0.31)) * (0.5 + 0.5 * f.drone); o.drawImage(VIG, 0, 0); o.globalAlpha = 1; // the drone breathes in the vignette
    if (fx.flash > 0) { o.fillStyle = `rgba(255,255,255,${Math.min(1, fx.flash)})`; o.fillRect(0, 0, W, H); }
    const fadeIn = ACT.fadeIn ?? 0.5, fadeOut = ACT.fadeOut || [S.duration - 4, S.duration - 0.5];
    const black = Math.max(fx.black, 1 - Math.min(1, t / fadeIn), Math.min(1, Math.max(0, (t - fadeOut[0]) / (fadeOut[1] - fadeOut[0]))));
    if (black > 0) { o.fillStyle = `rgba(0,0,0,${black})`; o.fillRect(0, 0, W, H); }
  }

  // --- boot ---------------------------------------------------------------------------
  window.defineAct = (act) => { ACT = act; };
  window.bootAct = async () => {
    S = window.SCORE; BAR = 60 / S.bpm * 4; BEAT = BAR / 4; STEP = BAR / 16; DOT8 = STEP * 3;
    ACT.echoWindow = ACT.echoWindow ?? 0.16;
    buildOnsets();
    FOOT = await (await fetch('footage/manifest.json')).json();
    for (const name of new Set([...ACT.shots.flatMap((s) => s.clip ? [s.clip] : s.montage.list)])) {
      if (!FOOT[name]) throw new Error(`clip "${name}" is not in footage/manifest.json — run archive.mjs fetch`);
      // Gain so the brightest 2% of the first frame reaches ~225 (never down, at most ×2.2; the act can pin one).
      const img = await loadFrame(name, 1);
      const c = mk(160, 90), x = c.getContext('2d'); x.drawImage(img, 0, 0, 160, 90);
      const d = x.getImageData(0, 0, 160, 90).data, v = [];
      for (let i = 0; i < d.length; i += 4) v.push(d[i]);
      v.sort((a, b) => a - b);
      GAIN[name] = ACT.gain?.[name] ?? Math.min(2.2, Math.max(1, 225 / Math.max(1, v[Math.floor(v.length * 0.98)])));
    }
    window.DURATION = S.duration; window.FPS = S.fps; window.renderAt = renderAt; window.prepare = prepare;
    window.GAINS = GAIN;
    window.ONSETS = { kicks: KICKS.length, hats: HATS.length, stabs: STABS.length, bells: BELLS.length };
  };
})();
