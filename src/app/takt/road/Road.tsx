'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import data from './data.json';

// takt.pizza/road: the landing page as the app's map. An opening screen (the keyboard playing
// a real track from the app), a ten-second trailer when you press play, then the road itself:
// 26 stops down the blues road or through Berlin's clubs, each venue's card opening as you
// reach it, and the track changing every few stops. The keyboard stays at the bottom of the
// screen and plays the notes of whatever is on.
//
// Everything here comes from the app: data.json, the clips in public/takt/audio and the photos
// in public/takt/venues are built by scripts/takt/landing-road.py from the app's own content.
// Colors are the app's tokens, as in road.css: keep the two in step.

type Vibe = 'blues' | 'electronic';
type Track = { title: string; style: string; key: string; tempo: number; beats: number; audio: string; notes: number[][] };
type Photo = { src: string; credit: string; source: string; note: string | null };
type Stop = { level: number; episode: number; opens: boolean; track: string; name?: string; town?: string; era?: string; tag?: string; photo?: Photo };
type World = { title: string; episodes: { title: string; kicker: string; years: string }[]; stops: Stop[] };

const TRACKS = data.tracks as unknown as Record<string, Track>;
const WORLDS = data.worlds as unknown as Record<Vibe, World>;
const OPENING = data.opening as Record<Vibe, string>;
const PRE = data.pre; // seconds of the record before a clip's first bar line

type Look = { ground: string; panel: string; line: string; ink: string; signal: string; cue: string; blackKey: string; clear: string };
const LOOK: Record<Vibe, Look> = {
  blues: { ground: '#F0E8D6', panel: '#E4D9C3', line: '#CBBEA4', ink: '#17120C', signal: '#C2540B', cue: '#2D4E96', blackKey: '#17120C', clear: 'rgba(240,232,214,0)' },
  electronic: { ground: '#0D0D0D', panel: '#181818', line: '#2A2A2A', ink: '#F2F0EB', signal: '#FF5A1F', cue: '#8FB3FF', blackKey: '#0D0D0D', clear: 'rgba(13,13,13,0)' },
};

const LINE: Record<Vibe, string> = {
  blues: 'Learn piano with the band already playing.',
  electronic: 'Learn piano with the kick already running.',
};
const HINT: Record<Vibe, string> = {
  blues: 'or scroll: 26 stops down the blues road',
  electronic: 'or scroll: 26 rooms, from UFO to Berghain',
};
const BETA = 'https://testflight.apple.com/join/sF4rp7DS';

// ---- the trailer: what is on screen at each beat of the opening track
type Step = { at: number; words: string[]; photo?: string; small?: string };
const TRAILER: Record<Vibe, Step[]> = {
  blues: [
    { at: 0, words: ['Learn', 'piano'] },
    { at: 4, words: ['with the', 'band'] },
    { at: 8, words: ['already', 'playing'] },
    { at: 12, words: ['Dockery Farms'], small: 'Mississippi · 1895', photo: '/takt/venues/blues-dockery.jpg' },
    { at: 14, words: ["Po' Monkey's"], small: 'Merigold · 1963', photo: '/takt/venues/blues-pomonkey.jpg' },
    { at: 16, words: ['Sun Studio'], small: 'Memphis · 1951', photo: '/takt/venues/blues-sun.jpg' },
    { at: 18, words: ['The blues', 'road'] },
  ],
  electronic: [
    { at: 0, words: ['Learn', 'piano'] },
    { at: 4, words: ['with the', 'kick'] },
    { at: 8, words: ['already', 'running'] },
    { at: 12, words: ['UFO'], small: 'Kreuzberg · 1988', photo: '/takt/venues/electronic-ufo.jpg' },
    { at: 14, words: ['Tresor'], small: 'Leipziger Straße · 1991', photo: '/takt/venues/electronic-tresor.jpg' },
    { at: 16, words: ['Berghain'], small: 'Friedrichshain · 2004', photo: '/takt/venues/electronic-berghain.jpg' },
    { at: 18, words: ['Berlin', 'nights'] },
  ],
};
const TRAILER_SCROLL = 18; // the beat the page starts down the road
const TRAILER_END = 22;

// ---- the keyboard: C2 to C6
const LO = 36;
const HI = 84;
const WHITES = 29;
const ZONE = 54; // on the road, this much of the fall shows above the keys
const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);
const whitesBelow = (n: number) => {
  let c = 0;
  for (let m = LO; m < n; m++) if (!isBlack(m)) c++;
  return c;
};
const fold = (n: number) => {
  while (n < LO) n += 12;
  while (n > HI) n -= 12;
  return n;
};

const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const mod = (x: number, m: number) => ((x % m) + m) % m;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const trackSeconds = (t: Track) => (t.beats * 60) / t.tempo;

// ---- the road's geometry, from the app's (Menu/MapScreen.swift RoadLayout): x scales with
// the width, y doesn't. A card here carries its tag line too, so the stops sit further apart.
const TOP = 220;
const EPISODE_GAP = 200;
const HERE_AT = 0.55; // the stop you're on sits this far down the screen

type Geo = { W: number; compact: boolean; cardW: number; photoH: number; step: number; height: number; pts: { x: number; y: number }[]; path: string };

function geometry(W: number, stops: Stop[]): Geo {
  const compact = W < 640;
  const cardW = compact ? Math.round(clamp((186 * W) / 390, 150, 230)) : 300;
  const photoH = Math.round((cardW * 104) / 186);
  const step = compact ? 188 : 240;
  const pts = stops.map((s) => ({ x: ((s.level % 2 === 1 ? 92 : 298) * W) / 390, y: TOP + (s.level - 1) * step + s.episode * EPISODE_GAP }));
  const height = pts[pts.length - 1].y + 250;
  // from the top of the road to the first stop, Catmull-Rom through the stops, then on down
  let d = `M${W / 2} ${TOP - 210}L${pts[0].x} ${pts[0].y}`;
  for (let q = 0; q < pts.length - 1; q++) {
    const p0 = pts[Math.max(q - 1, 0)];
    const p1 = pts[q];
    const p2 = pts[q + 1];
    const p3 = pts[Math.min(q + 2, pts.length - 1)];
    d += `C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  d += `L${W / 2} ${height}`;
  return { W, compact, cardW, photoH, step, height, pts, path: d };
}

// ---- the keyboard and the notes on their way to it
type View = { kbH: number; pps: number; mapTop: number; keepRight: number; keepBottom: number };

function drawKeys(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, vibe: Vibe, tr: Track, tl: number, v: View) {
  const L = LOOK[vibe];
  const elec = vibe === 'electronic';
  const hitY = H - v.kbH;
  const kw = W / WHITES;
  const spb = 60 / tr.tempo;
  const loop = tr.beats * spb;
  const span = hitY / v.pps;
  const fade = (x: number, y: number) => (x < v.keepRight ? smooth(v.keepBottom + 8, v.keepBottom + 64, y) : smooth(H * 0.02, H * 0.26, y));

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.clearRect(0, 0, W, H);

  const lit = new Float32Array(HI - LO + 1);
  const hits: { x: number; w: number; u: number; a: number }[] = [];
  const bars: { x: number; w: number; yT: number; yB: number; a: number }[] = [];
  for (const n of tr.notes) {
    const key = fold(n[1]);
    const a = n[3] === 0 ? 1 : 0.5; // the melody, and the chords under it
    const black = isBlack(key);
    const x = black ? whitesBelow(key) * kw : (whitesBelow(key) + 0.5) * kw;
    const nw = Math.max(4, kw * (black ? 0.4 : 0.56) * (n[3] === 0 ? 1 : 0.7));
    for (let w = -1; w <= 1; w++) {
      const on = n[0] * spb + w * loop;
      const off = on + Math.max(n[2] * spb - 0.03, 0.06);
      if (on > tl + span || off < tl - 0.6) continue;
      if (on <= tl && tl < off) lit[key - LO] = Math.max(lit[key - LO], a);
      const age = tl - on;
      if (age >= 0 && age < 0.55) hits.push({ x, w: nw, u: age / 0.55, a });
      const yB = hitY - (on - tl) * v.pps;
      const yT = Math.min(hitY - (off - tl) * v.pps, yB - (elec ? 5 : nw * 0.9));
      if (yT < hitY) bars.push({ x, w: nw, yT, yB, a });
    }
  }

  const paint = (faded: boolean) => {
    for (const b of bars) {
      ctx.globalAlpha = b.a * (faded ? fade(b.x, b.yB) : 1);
      ctx.fillStyle = L.cue;
      if (elec) {
        ctx.shadowColor = L.cue;
        ctx.shadowBlur = 14 * dpr;
        ctx.fillRect(b.x - b.w / 2, b.yT, b.w, b.yB - b.yT);
        ctx.shadowBlur = 0;
      } else {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(b.x - b.w / 2, b.yT, b.w, b.yB - b.yT, b.w / 2);
        else ctx.rect(b.x - b.w / 2, b.yT, b.w, b.yB - b.yT);
        ctx.fill();
      }
    }
    // a note lands: a ring of ink off the paper, a beam off the machine
    for (const h of hits) {
      if (elec) {
        const hh = Math.min(hitY * 0.36, 260);
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
  };

  // the opening screen's highway, as far down as the map has not yet come up over it
  const openTo = Math.min(v.mapTop, hitY);
  if (openTo > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, openTo);
    ctx.clip();
    if (elec) {
      ctx.fillStyle = L.line;
      ctx.globalAlpha = 0.45;
      for (let i = 1; i < WHITES; i++) ctx.fillRect(Math.round(i * kw), 0, 1, hitY);
    }
    // the grid rides down with the notes: bar lines on paper, every beat on the machine
    for (let k = Math.ceil(tl / spb); k * spb < tl + span; k++) {
      const bar = k % 4 === 0;
      if (!elec && !bar) continue;
      const y = hitY - (k * spb - tl) * v.pps;
      ctx.globalAlpha = bar ? 0.9 : 0.5;
      ctx.fillStyle = L.line;
      const x0 = y < v.keepBottom + 8 ? v.keepRight : 0; // not through the words
      if (x0 < W) ctx.fillRect(x0, Math.round(y) - 1, W - x0, bar && elec ? 2 : 1);
    }
    paint(true);
    ctx.restore();
  }

  // on the road: the last of the fall, over the map, fading in from clear
  if (v.mapTop < hitY) {
    const zt = Math.max(v.mapTop, hitY - ZONE);
    const g = ctx.createLinearGradient(0, hitY - ZONE, 0, hitY);
    g.addColorStop(0, L.clear);
    g.addColorStop(0.7, L.ground);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, zt, W, hitY - zt);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, zt, W, hitY - zt);
    ctx.clip();
    paint(false);
    ctx.restore();
  }

  // the keyboard
  ctx.globalAlpha = 1;
  ctx.fillStyle = L.panel;
  ctx.fillRect(0, hitY, W, v.kbH);
  ctx.fillStyle = L.signal;
  for (let m = LO; m <= HI; m++) {
    if (isBlack(m) || lit[m - LO] <= 0) continue;
    ctx.globalAlpha = lit[m - LO];
    ctx.fillRect(whitesBelow(m) * kw, hitY, kw, v.kbH);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = L.line;
  for (let i = 1; i < WHITES; i++) ctx.fillRect(Math.round(i * kw), hitY, 1, v.kbH);
  const bw = kw * 0.58;
  const bh = v.kbH * 0.6;
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
  const kick = elec ? Math.exp((-((tl / spb) % 1) * spb) / 0.09) : 0;
  const lh = 2 + 6 * kick;
  ctx.globalAlpha = 1;
  ctx.fillStyle = L.signal;
  ctx.fillRect(0, hitY - lh / 2, W, lh);
}

// ---- the sound: one clip looping from bar line to bar line, the next one fading in over it
type Deck = { id: string; src: AudioBufferSourceNode; gain: GainNode; t0: number };
type Engine = {
  ctx: AudioContext | null;
  master: GainNode | null;
  bytes: Map<string, Promise<ArrayBuffer>>;
  bufs: Map<string, Promise<AudioBuffer>>;
  deck: Deck | null;
  on: boolean;
  track: string;
  t0: number; // with no sound: the second (performance clock) the current track's loop began
  token: number;
};

type Sound = 'off' | 'loading' | 'on';

export default function Road() {
  const [vibe, setVibe] = useState<Vibe>('blues');
  const [W, setW] = useState(0);
  const [here, setHere] = useState(-1);
  const [reached, setReached] = useState(-1);
  const [past, setPast] = useState(false);
  const [sound, setSound] = useState<Sound>('off');
  const [step, setStep] = useState(-1);
  const [nowId, setNowId] = useState(OPENING.blues);

  const mainRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLElement>(null);
  const roadRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<SVGRectElement>(null);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const nowRef = useRef<HTMLButtonElement>(null);

  const vibeRef = useRef<Vibe>('blues');
  const hereRef = useRef(-1);
  const viewRef = useRef<View>({ kbH: 120, pps: 200, mapTop: 9999, keepRight: 0, keepBottom: 0 });
  const measureRef = useRef<() => void>(() => {});
  const trailerRef = useRef<{ when: number; spb: number; scrolled: boolean } | null>(null);
  const tweenRef = useRef<{ from: number; to: number; start: number; ms: number } | null>(null);
  const shiftRef = useRef(0);
  const eng = useRef<Engine>({ ctx: null, master: null, bytes: new Map(), bufs: new Map(), deck: null, on: false, track: OPENING.blues, t0: 0, token: 0 });

  const geos = useMemo(() => (W ? { blues: geometry(W, WORLDS.blues.stops), electronic: geometry(W, WORLDS.electronic.stops) } : null), [W]);
  const geosRef = useRef(geos);
  geosRef.current = geos;

  // ---- sound
  const bytes = useCallback((id: string) => {
    const e = eng.current;
    let p = e.bytes.get(id);
    if (!p) {
      p = fetch(TRACKS[id].audio).then((r) => {
        if (!r.ok) throw new Error(`${id}: ${r.status}`);
        return r.arrayBuffer();
      });
      p.catch(() => e.bytes.delete(id));
      e.bytes.set(id, p);
    }
    return p;
  }, []);

  const buffer = useCallback(
    (id: string) => {
      const e = eng.current;
      let p = e.bufs.get(id);
      if (!p) {
        p = bytes(id).then((b) => e.ctx!.decodeAudioData(b.slice(0)));
        p.catch(() => e.bufs.delete(id));
        e.bufs.set(id, p);
      }
      return p;
    },
    [bytes],
  );

  // where the current track's loop is, in seconds: the sound's own clock when it is on
  const phase = useCallback(() => {
    const e = eng.current;
    const len = trackSeconds(TRACKS[e.track]);
    if (e.ctx && e.deck && e.deck.id === e.track) return mod(e.ctx.currentTime - (e.ctx.outputLatency || 0) - e.deck.t0, len);
    return mod(performance.now() / 1000 - e.t0, len);
  }, []);

  const fadeOut = useCallback((deck: Deck | null, seconds: number) => {
    const ctx = eng.current.ctx;
    if (!deck || !ctx) return;
    const now = ctx.currentTime;
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
    deck.gain.gain.linearRampToValueAtTime(0, now + seconds);
    deck.src.stop(now + seconds + 0.05);
  }, []);

  // Start the current track's clip where the keyboard already is in it (or from its first bar),
  // over whatever was playing. Returns the moment its loop began, on the sound's clock.
  const startDeck = useCallback(
    async (fromTop: boolean) => {
      const e = eng.current;
      const id = e.track;
      const token = ++e.token;
      const buf = await buffer(id);
      const ctx = e.ctx;
      if (!ctx || token !== e.token || !e.on || e.track !== id) return null;
      const len = trackSeconds(TRACKS[id]);
      const when = ctx.currentTime + 0.06;
      const at = fromTop ? 0 : mod(performance.now() / 1000 + 0.06 - e.t0, len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = PRE;
      src.loopEnd = PRE + len;
      const gain = ctx.createGain();
      const rise = fromTop ? 0.02 : 0.5;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(1, when + rise);
      src.connect(gain).connect(e.master!);
      src.start(when, PRE + at);
      fadeOut(e.deck, 0.5);
      e.deck = { id, src, gain, t0: when - at };
      return when;
    },
    [buffer, fadeOut],
  );

  const setTrack = useCallback(
    (id: string) => {
      const e = eng.current;
      if (e.track === id) return;
      e.track = id;
      e.t0 = performance.now() / 1000;
      setNowId(id);
      if (e.on) startDeck(false).catch(() => {});
    },
    [startDeck],
  );

  const soundOn = useCallback(
    async (fromTop: boolean) => {
      const e = eng.current;
      if (!e.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        e.ctx = new AC();
        e.master = e.ctx.createGain();
        e.master.gain.value = 0.9;
        e.master.connect(e.ctx.destination);
        // an iPhone with its ringer off still plays this
        const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'playback';
      }
      e.on = true;
      setSound((s) => (s === 'on' ? s : 'loading'));
      try {
        await e.ctx.resume();
        const when = await startDeck(fromTop);
        if (e.on) setSound('on');
        return when;
      } catch {
        e.on = false;
        setSound('off');
        return null;
      }
    },
    [startDeck],
  );

  const soundOff = useCallback(() => {
    const e = eng.current;
    e.t0 = performance.now() / 1000 - phase(); // the keyboard carries on from where the sound was
    e.on = false;
    e.token++;
    fadeOut(e.deck, 0.2);
    e.deck = null;
    trailerRef.current = null;
    setStep(-1);
    setSound('off');
  }, [fadeOut, phase]);

  // ---- the trailer
  const stopTrailer = useCallback(() => {
    if (!trailerRef.current) return;
    trailerRef.current = null;
    tweenRef.current = null;
    setStep(-1);
  }, []);

  const play = useCallback(async () => {
    const e = eng.current;
    const id = OPENING[vibeRef.current];
    if (e.track !== id) {
      e.track = id;
      setNowId(id);
    }
    const when = await soundOn(true);
    if (when == null || !e.ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.scrollY > window.innerHeight * 0.4) return; // already down the road
    trailerRef.current = { when, spb: 60 / TRACKS[id].tempo, scrolled: false };
  }, [soundOn]);

  const toggleSound = useCallback(() => {
    if (eng.current.on) soundOff();
    else soundOn(false);
  }, [soundOff, soundOn]);

  // ---- the vibe
  const choose = useCallback(
    (v: Vibe) => {
      if (v === vibeRef.current) return;
      const g = geosRef.current;
      const h = hereRef.current;
      // the same level stays under your eye on the other road
      shiftRef.current = g && h >= 0 ? g[v].pts[h].y - g[vibeRef.current].pts[h].y : 0;
      stopTrailer();
      vibeRef.current = v;
      setVibe(v);
      setReached(h);
      try {
        localStorage.setItem('takt-vibe', v);
      } catch {}
    },
    [stopTrailer],
  );

  useEffect(() => {
    let v = new URLSearchParams(location.search).get('vibe');
    if (!v) {
      try {
        v = localStorage.getItem('takt-vibe');
      } catch {}
    }
    if (v === 'electronic') choose('electronic');
    else bytes(OPENING.blues).catch(() => {});
  }, [choose, bytes]);

  useLayoutEffect(() => {
    if (shiftRef.current) window.scrollBy(0, shiftRef.current);
    shiftRef.current = 0;
    measureRef.current();
  }, [vibe, geos]);

  // the browser's own chrome follows the vibe
  useEffect(() => {
    const ground = LOOK[vibe].ground;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ground);
    const before = document.body.style.background;
    document.body.style.background = ground;
    return () => {
      document.body.style.background = before;
    };
  }, [vibe]);

  // the pictures the trailer flashes, and the next track down the road, ahead of time
  useEffect(() => {
    for (const s of TRAILER[vibe]) if (s.photo) new Image().src = s.photo;
  }, [vibe]);
  useEffect(() => {
    const stops = WORLDS[vibe].stops;
    const next = stops.slice(Math.max(here, 0)).find((s) => s.track !== nowId);
    bytes(nowId).catch(() => {});
    if (next && here >= 0) bytes(next.track).catch(() => {});
    if (here < 0) bytes(stops[0].track).catch(() => {});
  }, [vibe, here, nowId, bytes]);

  // ---- the road's width
  useLayoutEffect(() => {
    const el = roadRef.current;
    if (!el) return;
    const read = () => setW(Math.round(el.clientWidth));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- scrolling, drawing, the beat
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cw = 0;
    let ch = 0;
    let dpr = 1;
    let raf = 0;

    const measure = () => {
      const H = window.innerHeight;
      const y = window.scrollY;
      const v = viewRef.current;
      const openKb = clamp(H * 0.2, 92, 190);
      const roadKb = clamp(H * 0.085, 46, 64);
      v.kbH = lerp(openKb, roadKb, smooth(0, 1, y / (H * 0.7)));
      v.pps = (H - openKb) / 3.4;
      v.mapTop = mapRef.current ? mapRef.current.getBoundingClientRect().top : 9999;
      let right = 0;
      let bottom = 0;
      for (const el of copyRef.current?.querySelectorAll('h1, .line, .go, .hint') ?? []) {
        const r = el.getBoundingClientRect();
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
      // on a phone the words span the screen: every lane waits for them
      v.keepRight = right > cw * 0.7 ? cw : right + 24;
      v.keepBottom = bottom;
      if (nowRef.current) nowRef.current.style.bottom = `${Math.round(v.kbH + 14)}px`;
      setPast(y > H * 0.82);

      const g = geosRef.current?.[vibeRef.current];
      const road = roadRef.current;
      if (!g || !road) return;
      const lineY = H * HERE_AT - road.getBoundingClientRect().top;
      let h = -1;
      if (lineY > g.pts[0].y - g.step * 0.6) {
        let best = Infinity;
        g.pts.forEach((p, i) => {
          const dy = Math.abs(p.y - lineY);
          if (dy < best) {
            best = dy;
            h = i;
          }
        });
      }
      clipRef.current?.setAttribute('height', String(Math.max(0, Math.min(lineY, g.pts[g.pts.length - 1].y))));
      if (h !== hereRef.current) {
        hereRef.current = h;
        setHere(h);
        setReached((r) => Math.max(r, h));
      }
      // the opening track plays until the trailer has gone down the road
      if (!(trailerRef.current && h < 0)) setTrack(h < 0 ? OPENING[vibeRef.current] : WORLDS[vibeRef.current].stops[h].track);
    };
    measureRef.current = measure;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = canvas.clientWidth;
      ch = canvas.clientHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      measure();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const e = eng.current;

      // the trailer's words change on the beat of the sound's own clock
      const tr = trailerRef.current;
      if (tr && e.ctx) {
        const beat = (e.ctx.currentTime - (e.ctx.outputLatency || 0) - tr.when) / tr.spb;
        const steps = TRAILER[vibeRef.current];
        let k = -1;
        for (let i = 0; i < steps.length; i++) if (beat >= steps[i].at) k = i;
        if (beat >= TRAILER_END) {
          trailerRef.current = null;
          k = -1;
        } else if (beat >= TRAILER_SCROLL && !tr.scrolled) {
          tr.scrolled = true;
          const g = geosRef.current?.[vibeRef.current];
          const road = roadRef.current;
          if (g && road) {
            const to = road.getBoundingClientRect().top + window.scrollY + g.pts[0].y - window.innerHeight * HERE_AT;
            tweenRef.current = { from: window.scrollY, to, start: now, ms: (TRAILER_END - TRAILER_SCROLL - 0.5) * tr.spb * 1000 };
          }
        }
        setStep(k);
      }
      const tw = tweenRef.current;
      if (tw) {
        const u = clamp((now - tw.start) / tw.ms);
        window.scrollTo(0, lerp(tw.from, tw.to, u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2));
        if (u >= 1) tweenRef.current = null;
      }

      const t = TRACKS[e.track];
      const tl = reduced && !e.on ? 6.2 : phase();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawKeys(ctx, cw, ch, dpr, vibeRef.current, t, tl, viewRef.current);

      // the stop you're on beats with the track
      if (pulseRef.current) {
        const b = mod((tl * t.tempo) / 60, 1);
        const k = reduced && !e.on ? 0 : Math.exp(-b * 3.2);
        pulseRef.current.style.transform = `scale(${1 + 0.42 * (1 - k)})`;
        pulseRef.current.style.opacity = String(0.85 * k);
      }
    };

    // a hand on the page takes it back from the trailer
    const hand = () => {
      if (trailerRef.current) stopTrailer();
      tweenRef.current = null;
    };
    const key = (ev: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End', 'Escape'].includes(ev.key)) hand();
    };
    const hidden = () => {
      const e = eng.current;
      if (!e.ctx) return;
      if (document.hidden) e.ctx.suspend();
      else if (e.on) e.ctx.resume();
    };

    resize();
    raf = requestAnimationFrame(frame);
    addEventListener('resize', resize);
    addEventListener('scroll', measure, { passive: true });
    addEventListener('wheel', hand, { passive: true });
    addEventListener('touchstart', hand, { passive: true });
    addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hidden);
    document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('scroll', measure);
      removeEventListener('wheel', hand);
      removeEventListener('touchstart', hand);
      removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden);
      measureRef.current = () => {};
    };
  }, [phase, setTrack, stopTrailer]);

  // the sound stops with the page
  useEffect(() => {
    const e = eng.current;
    return () => {
      e.on = false;
      e.ctx?.close().catch(() => {});
      e.ctx = null;
    };
  }, []);

  const goTo = useCallback((i: number) => {
    const g = geosRef.current?.[vibeRef.current];
    const road = roadRef.current;
    if (!g || !road) return;
    const to = road.getBoundingClientRect().top + window.scrollY + g.pts[i].y - window.innerHeight * HERE_AT;
    tweenRef.current = { from: window.scrollY, to, start: performance.now(), ms: 700 };
  }, []);

  const world = WORLDS[vibe];
  const geo = geos?.[vibe];
  const other: Vibe = vibe === 'blues' ? 'electronic' : 'blues';
  const now = TRACKS[nowId];
  const slam = step >= 0 ? TRAILER[vibe][step] : null;
  const credits = useMemo(() => world.stops.filter((s) => s.photo), [world]);

  return (
    <main className="takt-road" data-vibe={vibe} data-past={past} data-trailer={step >= 0} ref={mainRef}>
      <canvas ref={canvasRef} aria-hidden="true" />

      <header className="bar">
        <a className="mark" href="#top" onClick={(ev) => (ev.preventDefault(), window.scrollTo({ top: 0, behavior: 'smooth' }))}>
          Takt
        </a>
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
        <a className="beta" href={BETA} rel="noopener">
          Join the beta
        </a>
      </header>

      <section className="opening" id="top">
        <div className="copy" ref={copyRef}>
          <h1>Takt</h1>
          <p className="line">{LINE[vibe]}</p>
          <div className="go">
            <button type="button" className="play" onClick={play} disabled={sound === 'loading'}>
              <svg viewBox="0 0 12 14" aria-hidden="true">
                <path d="M0 0l12 7-12 7z" fill="currentColor" />
              </svg>
              Press play
            </button>
            <a href={BETA} rel="noopener">
              Join the beta
            </a>
            <span>Mac and iPhone</span>
          </div>
          <p className="hint">{HINT[vibe]} ↓</p>
        </div>
      </section>

      <div className="slam" aria-hidden="true">
        {slam && (
          <div className={`shot${slam.photo ? ' photo' : ''}`} key={`${vibe}-${step}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {slam.photo && <img src={slam.photo} alt="" />}
            <p className={slam.words.some((w) => w.length > 9) ? 'wide' : ''}>
              {slam.words.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </p>
            {slam.small && <small>{slam.small}</small>}
          </div>
        )}
      </div>

      <section className="map" ref={mapRef} aria-label={world.title}>
        <div className="road" ref={roadRef} style={geo ? { height: geo.height } : undefined}>
          {geo && (
            <>
              <svg width={geo.W} height={geo.height} viewBox={`0 0 ${geo.W} ${geo.height}`} aria-hidden="true">
                <defs>
                  <clipPath id="takt-road-behind">
                    <rect ref={clipRef} x="0" y="0" width={geo.W} height="0" />
                  </clipPath>
                </defs>
                <path d={geo.path} className="bed" />
                <path d={geo.path} className="top" />
                {vibe === 'electronic' ? (
                  <>
                    <path d={geo.path} className="rail" />
                    <path d={geo.path} className="rail-gap" />
                    <path d={geo.path} className="behind cable" clipPath="url(#takt-road-behind)" />
                  </>
                ) : (
                  <>
                    <path d={geo.path} className="ties" />
                    <path d={geo.path} className="behind dashes" clipPath="url(#takt-road-behind)" />
                  </>
                )}
              </svg>

              {world.stops
                .filter((s) => s.opens)
                .map((s) => {
                  const ep = world.episodes[s.episode];
                  return (
                    <div className="sign" key={`${vibe}-sign-${s.episode}`} style={{ top: geo.pts[s.level - 1].y - 196 }}>
                      <div>
                        <span>{ep.kicker}</span>
                        <strong>{ep.title}</strong>
                        <span>{ep.years}</span>
                      </div>
                    </div>
                  );
                })}

              {world.stops.map((s, i) => {
                const left = s.level % 2 === 1;
                const open = i <= reached;
                const style = { width: geo.cardW, top: geo.pts[i].y - 74, left: left ? geo.W - 14 - geo.cardW : 14 };
                if (!s.name)
                  return (
                    <div className="card empty" key={`${vibe}-card-${i}`} data-side={left ? 'right' : 'left'} data-here={i === here} style={{ ...style, height: geo.photoH + 58 }}>
                      <strong>Level {s.level}</strong>
                      <span>Venue to come</span>
                    </div>
                  );
                return (
                  <article className="card" key={`${vibe}-card-${i}`} data-side={left ? 'right' : 'left'} data-open={open} data-here={i === here} style={style} onClick={() => goTo(i)}>
                    <div className="photo" style={{ height: geo.photoH }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {s.photo && <img src={s.photo.src} alt={s.photo.note ?? `${s.name}`} loading="lazy" width={640} height={427} />}
                      <i className="wash" />
                      {i === here && <b>Tonight</b>}
                    </div>
                    <div className="txt">
                      <h3>{open ? s.name : '???'}</h3>
                      <p className="meta">
                        {s.era} · {s.town}
                      </p>
                      <p className="tag">{s.tag}</p>
                    </div>
                  </article>
                );
              })}

              {world.stops.map((s, i) => {
                const state = i < here ? 'done' : i === here ? 'here' : i === here + 1 ? 'next' : 'ahead';
                return (
                  <button
                    type="button"
                    className="stop"
                    key={`${vibe}-stop-${i}`}
                    data-state={state}
                    style={{ left: geo.pts[i].x, top: geo.pts[i].y }}
                    onClick={() => goTo(i)}
                    aria-label={`Level ${s.level}${s.name ? `, ${s.name}` : ''}`}
                  >
                    {state === 'here' && <span className="pulse" ref={pulseRef} />}
                    {s.level}
                  </button>
                );
              })}

            </>
          )}
        </div>
      </section>

      <section className="end">
        <h2>Every stop is a level.</h2>
        <p className="line">Clear it at the keyboard and the next room opens.</p>
        <div className="go">
          <a href={BETA} rel="noopener">
            Join the beta
          </a>
          <span>Mac and iPhone</span>
        </div>
        <p className="made">Every track on this page is from the app.</p>
        <details>
          <summary>Photo credits</summary>
          <ul>
            {credits.map((s) => (
              <li key={`${vibe}-${s.level}`}>
                {s.name}:{' '}
                <a href={s.photo!.source} rel="noopener">
                  {s.photo!.credit.replace(/^Photo: /, '')}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <button type="button" className="now" ref={nowRef} onClick={toggleSound} data-sound={sound} aria-label={sound === 'on' ? `Sound off. Playing ${now.title}` : `Sound on: ${now.title}`}>
        <svg viewBox="0 0 16 14" aria-hidden="true">
          <path d="M0 4.5h3.5L8 1v12L3.5 9.5H0z" fill="currentColor" />
          {sound === 'on' ? (
            <path d="M10.5 4a4 4 0 010 6M12.5 2a7 7 0 010 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path d="M10.5 4.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </svg>
        <strong>{now.title}</strong>
        <span>{sound === 'on' ? `${now.style} · ${now.key} · ${now.tempo}` : sound === 'loading' ? 'Loading' : 'Tap for sound'}</span>
      </button>
    </main>
  );
}
