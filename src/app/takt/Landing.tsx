'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// The Takt landing page: a keyboard that plays itself, in the app's two vibes.
// Blues is a swung boogie in C on the app's paper; Electronic is a dub techno
// loop in G minor on its ink. The switch is the app's own (Design/Vibe.swift),
// and the new vibe falls down the highway like a note.
//
// Colors are the app's tokens, as in takt.css: keep the two in step.
// "cue" is a note on its way, "signal" is a note sounding now.
//
// ?vibe=electronic opens on that vibe; ?t=12.5 freezes the picture at that
// second (the OG card is a screenshot of ?t=).

type Vibe = 'blues' | 'electronic';

type Look = { ground: string; panel: string; line: string; ink: string; signal: string; cue: string; blackKey: string };

const LOOK: Record<Vibe, Look> = {
  blues: { ground: '#F0E8D6', panel: '#E4D9C3', line: '#CBBEA4', ink: '#17120C', signal: '#C2540B', cue: '#2D4E96', blackKey: '#17120C' },
  electronic: { ground: '#0D0D0D', panel: '#181818', line: '#2A2A2A', ink: '#F2F0EB', signal: '#FF5A1F', cue: '#8FB3FF', blackKey: '#0D0D0D' },
};

const LINE: Record<Vibe, string> = {
  blues: 'Learn piano with the band already playing.',
  electronic: 'Learn piano with the kick already running.',
};

const BETA = 'https://testflight.apple.com/join/sF4rp7DS';

// ---- the keyboard: C2 to C5, 22 white keys across the screen
const LO = 36;
const HI = 72;
const WHITES = 22;
const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);
const whitesBelow = (n: number) => {
  let c = 0;
  for (let m = LO; m < n; m++) if (!isBlack(m)) c++;
  return c;
};

// ---- the two loops. b and d in beats, n a MIDI note, a how loud (echoes are quieter)
type Note = { b: number; d: number; n: number; a: number };
type Song = { bpm: number; beats: number; swing: boolean; notes: Note[] };

function bluesSong(): Song {
  // Twelve bars in C. The left hand walks the boogie line in eighths, the right
  // hand answers with a shell on the late eighths and a lick in bars 4, 8 and 12.
  const notes: Note[] = [];
  const roots = [36, 36, 36, 36, 41, 41, 36, 36, 43, 41, 36, 43];
  const walk = [0, 4, 7, 9, 10, 9, 7, 4];
  const shells: Record<number, number[]> = { 36: [64, 70], 41: [63, 69], 43: [65, 71] };
  const licks: Record<number, [number, number, number][]> = {
    3: [[0.5, 67, 0.5], [1, 70, 0.5], [1.5, 72, 0.5], [2, 70, 0.5], [2.5, 67, 0.5], [3, 63, 0.5], [3.5, 64, 0.5]],
    7: [[0.5, 72, 0.5], [1, 70, 0.5], [1.5, 67, 0.5], [2, 66, 0.5], [2.5, 65, 0.5], [3, 63, 0.5], [3.5, 60, 0.5]],
    11: [[0.5, 71, 0.5], [1, 69, 0.5], [1.5, 67, 0.5], [2, 65, 0.5], [2.5, 62, 0.5], [3, 59, 1]],
  };
  roots.forEach((r, bar) => {
    const b0 = bar * 4;
    walk.forEach((s, i) => notes.push({ b: b0 + i * 0.5, d: 0.42, n: r + s, a: 1 }));
    const lick = licks[bar];
    if (lick) lick.forEach(([b, n, d]) => notes.push({ b: b0 + b, d, n, a: 1 }));
    else {
      const [x, y] = shells[r];
      notes.push({ b: b0 + 1.5, d: 1.0, n: x, a: 1 }, { b: b0 + 1.5, d: 1.0, n: y, a: 1 }, { b: b0 + 3.5, d: 0.5, n: x, a: 1 }, { b: b0 + 3.5, d: 0.5, n: y, a: 1 });
    }
  });
  return { bpm: 100, beats: 48, swing: true, notes };
}

function electronicSong(): Song {
  // Four bars of dub techno in G minor: a minor-ninth stab on the offbeat 16ths
  // with a dotted-eighth echo, the bass on every offbeat.
  const notes: Note[] = [];
  const chords = [[58, 62, 65, 69], [58, 62, 65, 69], [55, 58, 62, 65], [57, 60, 64, 67]];
  const bass = [43, 43, 39, 41];
  chords.forEach((ch, bar) => {
    const b0 = bar * 4;
    for (const s of [0.75, 1.5, 2.75]) {
      for (let k = 3; k >= 1; k--) ch.forEach((n) => notes.push({ b: b0 + s + 0.75 * k, d: 0.2, n, a: [0.5, 0.28, 0.14][k - 1] }));
      ch.forEach((n) => notes.push({ b: b0 + s, d: 0.2, n, a: 1 }));
    }
    for (let k = 0; k < 4; k++) notes.push({ b: b0 + k + 0.5, d: 0.4, n: bass[bar], a: 1 });
  });
  return { bpm: 124, beats: 16, swing: false, notes };
}

const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};

// seconds from the top of the loop for a beat position; the blues swings its eighths
function sec(s: Song, b: number) {
  const spb = 60 / s.bpm;
  if (!s.swing) return b * spb;
  const i = Math.floor(b);
  const f = b - i;
  return (i + (f < 0.5 ? f * 1.24 : 0.62 + (f - 0.5) * 0.76)) * spb;
}

// keep: the box the words sit in. Notes in the lanes under it only show once they are clear of it.
type Keep = { right: number; bottom: number };

function drawScene(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, vibe: Vibe, song: Song, t: number, keep: Keep) {
  const L = LOOK[vibe];
  const elec = vibe === 'electronic';
  const kbH = clamp(H * 0.2, 92, 190);
  const hitY = H - kbH;
  const kw = W / WHITES;
  const spb = 60 / song.bpm;
  const loop = song.beats * spb;
  const tl = ((t % loop) + loop) % loop;
  const span = 3.4; // seconds of music on screen
  const pps = hitY / span;
  const fade = (x: number, y: number) => (x < keep.right ? smooth(keep.bottom + 8, keep.bottom + 64, y) : smooth(H * 0.02, H * 0.26, y));

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = L.ground;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, hitY);
  ctx.clip();

  // the grid rides down with the notes: bar lines on paper, every beat on the machine
  if (elec) {
    ctx.fillStyle = L.line;
    ctx.globalAlpha = 0.45;
    for (let i = 1; i < WHITES; i++) ctx.fillRect(Math.round(i * kw), 0, 1, hitY);
  }
  for (let k = Math.ceil(tl / spb); k * spb < tl + span; k++) {
    const bar = k % 4 === 0;
    if (!elec && !bar) continue;
    const y = hitY - (k * spb - tl) * pps;
    ctx.globalAlpha = bar ? 0.9 : 0.5;
    ctx.fillStyle = L.line;
    const x0 = y < keep.bottom + 8 ? keep.right : 0; // not through the words
    if (x0 < W) ctx.fillRect(x0, Math.round(y) - 1, W - x0, bar && elec ? 2 : 1);
  }

  const lit = new Float32Array(HI - LO + 1);
  const hits: { x: number; w: number; u: number; a: number }[] = [];

  for (const n of song.notes) {
    for (let w = -1; w <= 1; w++) {
      const on = sec(song, n.b) + w * loop;
      const off = sec(song, n.b + n.d) + w * loop;
      if (on > tl + span || off < tl - 0.6) continue;
      const black = isBlack(n.n);
      const x = black ? whitesBelow(n.n) * kw : (whitesBelow(n.n) + 0.5) * kw;
      const nw = Math.max(5, kw * (black ? 0.4 : 0.56));
      if (on <= tl && tl < off) lit[n.n - LO] = Math.max(lit[n.n - LO], n.a);
      const age = tl - on;
      if (age >= 0 && age < 0.55) hits.push({ x, w: nw, u: age / 0.55, a: n.a });
      const yB = hitY - (on - tl) * pps;
      const yT = Math.min(hitY - (off - tl) * pps, yB - (elec ? 5 : nw * 0.9));
      if (yT >= hitY) continue;
      ctx.globalAlpha = n.a * fade(x, yB);
      ctx.fillStyle = L.cue;
      if (elec) {
        ctx.shadowColor = L.cue;
        ctx.shadowBlur = 14 * dpr;
        ctx.fillRect(x - nw / 2, yT, nw, yB - yT);
        ctx.shadowBlur = 0;
      } else {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - nw / 2, yT, nw, yB - yT, nw / 2);
        else ctx.rect(x - nw / 2, yT, nw, yB - yT);
        ctx.fill();
      }
    }
  }

  // a note lands: a ring of ink off the paper, a beam off the machine
  for (const h of hits) {
    if (elec) {
      const hh = hitY * 0.36;
      const g = ctx.createLinearGradient(0, hitY, 0, hitY - hh);
      g.addColorStop(0, L.signal);
      g.addColorStop(1, 'rgba(255,90,31,0)');
      ctx.globalAlpha = h.a * Math.pow(1 - h.u, 1.4) * 0.75;
      ctx.fillStyle = g;
      ctx.fillRect(h.x - h.w / 2, hitY - hh, h.w, hh);
    } else {
      const rx = h.w * (0.8 + 2.8 * Math.pow(h.u, 0.6));
      ctx.globalAlpha = h.a * Math.pow(1 - h.u, 1.6);
      ctx.strokeStyle = L.signal;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(h.x, hitY, rx, rx * 0.42, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();

  // the keyboard
  ctx.globalAlpha = 1;
  ctx.fillStyle = L.panel;
  ctx.fillRect(0, hitY, W, kbH);
  ctx.fillStyle = L.signal;
  for (let m = LO; m <= HI; m++) {
    if (isBlack(m) || lit[m - LO] <= 0) continue;
    ctx.globalAlpha = lit[m - LO];
    ctx.fillRect(whitesBelow(m) * kw, hitY, kw, kbH);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = L.line;
  for (let i = 1; i < WHITES; i++) ctx.fillRect(Math.round(i * kw), hitY, 1, kbH);
  const bw = kw * 0.58;
  const bh = kbH * 0.6;
  for (let m = LO; m <= HI; m++) {
    if (!isBlack(m)) continue;
    const x = whitesBelow(m) * kw - bw / 2;
    ctx.globalAlpha = 1;
    ctx.fillStyle = L.blackKey;
    ctx.fillRect(x, hitY, bw, bh);
    if (elec) {
      ctx.strokeStyle = L.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, hitY + 0.5, bw - 1, bh - 1);
    }
    if (lit[m - LO] > 0) {
      ctx.globalAlpha = lit[m - LO];
      ctx.fillStyle = L.signal;
      ctx.fillRect(x, hitY, bw, bh);
    }
  }

  // the hit line. On the machine the kick thickens it on every beat.
  const kick = elec ? Math.exp(-((tl / spb) % 1) * spb / 0.09) : 0;
  const lh = 2 + 6 * kick;
  ctx.globalAlpha = 1;
  ctx.fillStyle = L.signal;
  ctx.fillRect(0, hitY - lh / 2, W, lh);
}

export default function Landing() {
  const [vibe, setVibe] = useState<Vibe>('blues');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vibeRef = useRef<Vibe>('blues');
  const wipeRef = useRef<{ from: Vibe; start: number } | null>(null);
  const kickRef = useRef<() => void>(() => {});
  const frozenRef = useRef(false);
  const copyRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<Keep>({ right: 0, bottom: 0 });
  const measureRef = useRef<() => void>(() => {});

  const choose = useCallback((v: Vibe, wipe = true) => {
    if (v === vibeRef.current) return;
    if (wipe && !frozenRef.current) wipeRef.current = { from: vibeRef.current, start: performance.now() };
    vibeRef.current = v;
    setVibe(v);
    try {
      localStorage.setItem('takt-vibe', v);
    } catch {}
    kickRef.current();
  }, []);

  // the vibe to open on: the link's, else the one you left it on
  useEffect(() => {
    let v = new URLSearchParams(location.search).get('vibe');
    if (!v) {
      try {
        v = localStorage.getItem('takt-vibe');
      } catch {}
    }
    if (v === 'electronic') choose('electronic', false);
  }, [choose]);

  // the browser's own chrome follows the vibe
  useEffect(() => {
    const ground = LOOK[vibe].ground;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ground);
    const before = document.body.style.background;
    document.body.style.background = ground;
    measureRef.current(); // the line under the name changes size with the vibe
    return () => {
      document.body.style.background = before;
    };
  }, [vibe]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;
    const songs: Record<Vibe, Song> = { blues: bluesSong(), electronic: electronicSong() };
    const q = new URLSearchParams(location.search);
    const fixedT = q.has('t') ? parseFloat(q.get('t') || '0') : null;
    const frozen = fixedT !== null || matchMedia('(prefers-reduced-motion: reduce)').matches;
    frozenRef.current = frozen;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let raf = 0;

    const frame = (now: number) => {
      raf = 0;
      const t = frozen ? (fixedT ?? 6.2) : now / 1000;
      const to = vibeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wipe = wipeRef.current;
      const u = wipe ? (now - wipe.start) / 560 : 1;
      if (wipe && u < 1) {
        // the new vibe falls from the top like a note and lands on the keys
        drawScene(ctx, W, H, dpr, wipe.from, songs[wipe.from], t, keepRef.current);
        const wy = H * u * u;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, wy);
        ctx.clip();
        drawScene(ctx, W, H, dpr, to, songs[to], t, keepRef.current);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.fillStyle = LOOK[to].signal;
        ctx.fillRect(0, wy - 4, W, 4);
      } else {
        wipeRef.current = null;
        drawScene(ctx, W, H, dpr, to, songs[to], t, keepRef.current);
      }
      if (!frozen) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    kickRef.current = kick;

    const measure = () => {
      let right = 0;
      let bottom = 0;
      for (const el of copyRef.current?.querySelectorAll('h1, .line, .go') ?? []) {
        const r = el.getBoundingClientRect();
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
      // on a phone the words span the screen: every lane waits for them
      keepRef.current = { right: right > W * 0.7 ? W : right + 24, bottom };
      if (frozen) frame(performance.now());
      else kick();
    };
    measureRef.current = measure;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      measure();
    };
    resize();
    addEventListener('resize', resize);
    document.fonts?.ready.then(measure);
    return () => {
      removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      kickRef.current = () => {};
      measureRef.current = () => {};
    };
  }, []);

  const other: Vibe = vibe === 'blues' ? 'electronic' : 'blues';

  return (
    <main className="takt-lp" data-vibe={vibe}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="copy" ref={copyRef}>
        <h1>Takt</h1>
        <div className="vibe" role="group" aria-label="Vibe">
          <button type="button" className="name" aria-pressed={vibe === 'blues'} onClick={() => choose('blues')}>
            Blues
          </button>
          <button type="button" className="switch" role="switch" aria-checked={vibe === 'electronic'} aria-label="Electronic vibe" onClick={() => choose(other)}>
            <span className="knob" aria-hidden="true">
              {vibe === 'blues' ? (
                '♭'
              ) : (
                <svg viewBox="0 0 14 14" fill="currentColor">
                  <rect x="0.5" y="5" width="2" height="4" />
                  <rect x="3.5" y="2" width="2" height="10" />
                  <rect x="6.5" y="4" width="2" height="6" />
                  <rect x="9.5" y="0.5" width="2" height="13" />
                  <rect x="12.5" y="5.5" width="1.5" height="3" />
                </svg>
              )}
            </span>
          </button>
          <button type="button" className="name" aria-pressed={vibe === 'electronic'} onClick={() => choose('electronic')}>
            Electronic
          </button>
        </div>
        <p className="line">{LINE[vibe]}</p>
        <div className="go">
          <a href={BETA} rel="noopener">
            Join the beta
          </a>
          <span>Mac and iPhone</span>
        </div>
      </div>
    </main>
  );
}
