'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Mycelium — a Physarum (slime mould) toy.
 *
 * Tens of thousands of agents each sense the trail map ahead of them, steer
 * toward the strongest scent, move, and deposit. Trails diffuse and decay.
 * Out of that alone, transport networks grow. Drag to feed the colony;
 * double-tap to mutate it into a new species (new senses, new palette).
 */

type Species = {
  name: string;
  sensorAngle: number;
  sensorDist: number;
  turnAngle: number;
  step: number;
  deposit: number;
  decay: number;
  palette: string[];
};

const PALETTES: string[][] = [
  ['#05030a', '#3b0a2a', '#c2410c', '#fbbf24', '#fff7ed'], // ember
  ['#020617', '#0c2a4a', '#0891b2', '#a5f3fc', '#ffffff'], // abyss
  ['#030805', '#14532d', '#65a30d', '#d9f99d', '#ffffff'], // moss
  ['#0a0410', '#4a1d6b', '#c026d3', '#f9a8d4', '#fff1f2'], // orchid
  ['#000000', '#292524', '#a16207', '#fde047', '#ffffff'], // gold leaf
  ['#040404', '#1f2937', '#9ca3af', '#f3f4f6', '#ffffff'], // silverpoint
  ['#0b0205', '#7f1d1d', '#ef4444', '#fdba74', '#fff7ed'], // blood orange
  ['#02060b', '#1e3a8a', '#6366f1', '#c4b5fd', '#faf5ff'], // ultraviolet
];

const GENERA = [
  'Physarum', 'Fuligo', 'Stemonitis', 'Badhamia', 'Didymium', 'Lycogala',
  'Arcyria', 'Trichia', 'Comatricha', 'Lamproderma', 'Cribraria', 'Hemitrichia',
];
const SYL = [
  'au', 're', 'vi', 'ri', 'de', 'lu', 'mi', 'no', 'sa', 'cae', 'ru', 'le', 'ni',
  'gra', 'ro', 'se', 'fla', 'nox', 'ti', 'va', 'cel', 'la', 'um', 'bra', 'lyn', 'the',
];
const ENDINGS = ['um', 'a', 'is', 'ense', 'ata', 'ella', 'oides', 'issima'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function makeName(): string {
  const n = 2 + Math.floor(Math.random() * 2);
  let s = '';
  for (let i = 0; i < n; i++) s += pick(SYL);
  return `${pick(GENERA)} ${s}${pick(ENDINGS)}`;
}

function makeSpecies(prev?: Species): Species {
  const D = Math.PI / 180;
  let palette = pick(PALETTES);
  while (prev && palette === prev.palette) palette = pick(PALETTES);
  return {
    name: makeName(),
    sensorAngle: rand(18, 65) * D,
    sensorDist: rand(4, 20),
    turnAngle: rand(12, 55) * D,
    step: rand(0.7, 1.7),
    deposit: rand(0.04, 0.14),
    decay: rand(0.9, 0.975),
    palette,
  };
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildLut(palette: string[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  const stops = palette.map(hexToRgb);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(Math.floor(t), stops.length - 2);
    const f = t - k;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[k][c] * (1 - f) + stops[k + 1][c] * f;
  }
  return lut;
}

export default function Mycelium() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState('');
  const [hint, setHint] = useState(true);
  const [bare, setBare] = useState(false);
  const mutateRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.location.search.includes('bare')) setBare(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, N = 0;
    let trail = new Float32Array(0);
    let trail2 = new Float32Array(0);
    let ax = new Float32Array(0), ay = new Float32Array(0), aa = new Float32Array(0);
    let off: HTMLCanvasElement | null = null;
    let offCtx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;

    let species = makeSpecies();
    let lut = buildLut(species.palette);
    // Blend from the previous palette so a mutation washes over the colony.
    let lutFrom = lut;
    let lutT = 1;
    setName(species.name);

    const pointer = { x: -1, y: -1, down: false };
    let lastTap = 0;
    let raf = 0;
    let alive = true;

    const curve = new Uint8ClampedArray(1024);
    for (let i = 0; i < 1024; i++) curve[i] = Math.pow(i / 1023, 0.6) * 255;

    function seed() {
      const r0 = Math.min(W, H) * 0.28;
      for (let i = 0; i < N; i++) {
        const t = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * r0;
        ax[i] = W / 2 + Math.cos(t) * r;
        ay[i] = H / 2 + Math.sin(t) * r;
        aa[i] = Math.random() * Math.PI * 2;
      }
      trail.fill(0);
    }

    function resize() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(vw * dpr);
      canvas!.height = Math.floor(vh * dpr);
      canvas!.style.width = vw + 'px';
      canvas!.style.height = vh + 'px';
      const target = vw > 900 ? 220000 : 130000;
      const s = Math.sqrt(target / (vw * vh));
      W = Math.max(64, Math.floor(vw * s));
      H = Math.max(64, Math.floor(vh * s));
      trail = new Float32Array(W * H);
      trail2 = new Float32Array(W * H);
      off = document.createElement('canvas');
      off.width = W; off.height = H;
      offCtx = off.getContext('2d');
      img = offCtx!.createImageData(W, H);
      N = Math.min(32000, Math.floor(W * H * 0.11));
      ax = new Float32Array(N); ay = new Float32Array(N); aa = new Float32Array(N);
      seed();
    }

    function sample(x: number, y: number): number {
      let xi = x | 0, yi = y | 0;
      if (xi < 0) xi += W; else if (xi >= W) xi -= W;
      if (yi < 0) yi += H; else if (yi >= H) yi -= H;
      return trail[yi * W + xi];
    }

    function feed(cx: number, cy: number, r: number, amt: number) {
      const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(W - 1, (cx + r) | 0);
      const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(H - 1, (cy + r) | 0);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r * r) {
            const i = y * W + x;
            trail[i] = Math.min(1, trail[i] + amt);
          }
        }
      }
    }

    function step() {
      const { sensorAngle: SA, sensorDist: SD, turnAngle: TA, step: SP, deposit: DEP, decay } = species;
      if (pointer.down) feed(pointer.x, pointer.y, Math.max(3, Math.min(W, H) * 0.02), 0.9);

      for (let i = 0; i < N; i++) {
        let x = ax[i], y = ay[i], a = aa[i];
        const F = sample(x + Math.cos(a) * SD, y + Math.sin(a) * SD);
        const L = sample(x + Math.cos(a - SA) * SD, y + Math.sin(a - SA) * SD);
        const R = sample(x + Math.cos(a + SA) * SD, y + Math.sin(a + SA) * SD);
        if (F > L && F > R) {
          // stay the course
        } else if (F < L && F < R) {
          a += Math.random() < 0.5 ? -TA : TA;
        } else if (L > R) {
          a -= TA;
        } else if (R > L) {
          a += TA;
        }
        x += Math.cos(a) * SP;
        y += Math.sin(a) * SP;
        if (x < 0) x += W; else if (x >= W) x -= W;
        if (y < 0) y += H; else if (y >= H) y -= H;
        ax[i] = x; ay[i] = y; aa[i] = a;
        const idx = (y | 0) * W + (x | 0);
        const v = trail[idx] + DEP;
        trail[idx] = v > 1 ? 1 : v;
      }

      // 3x3 mean blur + decay, toroidal.
      const Wm = W - 1, Hm = H - 1;
      for (let y = 0; y < H; y++) {
        const yu = (y === 0 ? Hm : y - 1) * W;
        const yc = y * W;
        const yd = (y === Hm ? 0 : y + 1) * W;
        for (let x = 0; x < W; x++) {
          const xl = x === 0 ? Wm : x - 1;
          const xr = x === Wm ? 0 : x + 1;
          const s =
            trail[yu + xl] + trail[yu + x] + trail[yu + xr] +
            trail[yc + xl] + trail[yc + x] + trail[yc + xr] +
            trail[yd + xl] + trail[yd + x] + trail[yd + xr];
          trail2[yc + x] = (s / 9) * decay;
        }
      }
      const t = trail; trail = trail2; trail2 = t;
    }

    function render() {
      if (!img || !off || !offCtx) return;
      const d = img.data;
      const n = W * H;
      if (lutT < 1) lutT = Math.min(1, lutT + 0.02);
      const mix = lutT;
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        const v = trail[i];
        const c = curve[(v * 1023) | 0] * 3;
        if (mix >= 1) {
          d[p] = lut[c]; d[p + 1] = lut[c + 1]; d[p + 2] = lut[c + 2];
        } else {
          d[p] = lutFrom[c] * (1 - mix) + lut[c] * mix;
          d[p + 1] = lutFrom[c + 1] * (1 - mix) + lut[c + 1] * mix;
          d[p + 2] = lutFrom[c + 2] * (1 - mix) + lut[c + 2] * mix;
        }
        d[p + 3] = 255;
      }
      offCtx.putImageData(img, 0, 0);
      ctx!.imageSmoothingEnabled = true;
      ctx!.imageSmoothingQuality = 'high';
      ctx!.drawImage(off, 0, 0, canvas!.width, canvas!.height);
    }

    function loop() {
      if (!alive) return;
      step();
      render();
      raf = requestAnimationFrame(loop);
    }

    function mutate() {
      lutFrom = lut;
      lutT = 0;
      species = makeSpecies(species);
      lut = buildLut(species.palette);
      setName(species.name);
    }
    mutateRef.current = mutate;

    function toGrid(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * W;
      pointer.y = ((e.clientY - r.top) / r.height) * H;
    }
    function onDown(e: PointerEvent) {
      const now = performance.now();
      if (now - lastTap < 320) {
        lastTap = 0;
        pointer.down = false;
        mutate();
        return;
      }
      lastTap = now;
      toGrid(e);
      pointer.down = true;
      setHint(false);
      canvas!.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!pointer.down) return;
      toGrid(e);
    }
    function onUp() {
      pointer.down = false;
    }

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    const hintTimer = window.setTimeout(() => setHint(false), 9000);
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(hintTimer);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          display: 'block',
          touchAction: 'none',
          cursor: 'crosshair',
          background: '#05030a',
        }}
      />
      {!bare && (<>
      <div
        style={{
          position: 'fixed',
          left: 'calc(env(safe-area-inset-left) + 20px)',
          bottom: 'calc(env(safe-area-inset-bottom) + 18px)',
          pointerEvents: 'none',
          color: 'rgba(255,255,255,0.82)',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontSize: 'clamp(1rem, 2.6vw, 1.35rem)',
          letterSpacing: '0.01em',
          textShadow: '0 1px 12px rgba(0,0,0,0.8)',
        }}
      >
        {name}
      </div>
      <button
        type="button"
        onClick={() => mutateRef.current()}
        aria-label="New species"
        style={{
          position: 'fixed',
          right: 'calc(env(safe-area-inset-right) + 16px)',
          bottom: 'calc(env(safe-area-inset-bottom) + 14px)',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: 'rgba(255,255,255,0.85)',
          borderRadius: 999,
          padding: '8px 14px',
          fontSize: 13,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          cursor: 'pointer',
        }}
      >
        mutate
      </button>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top) + 22px)',
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
          color: 'rgba(255,255,255,0.6)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 13,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: hint ? 1 : 0,
          transition: 'opacity 1.4s ease',
        }}
      >
        drag to feed · double-tap to mutate
      </div>
      </>)}
    </>
  );
}
