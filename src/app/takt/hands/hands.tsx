'use client';

import { useEffect, useRef, useState } from 'react';

// Six hand concepts for Takt's scale lessons. Every hand lives in the same 240 × 200 box as the
// app's HandView (right hand from above, thumb on the left), with five addressable fingers and a
// thumb group that rotates about its base: `down` fills a finger `signal`, `next` outlines it
// `cue`, `tuck` folds the thumb in under the palm. So the lesson's highlights and motion work on
// all of them unchanged.

export type Pose = { down: number | null; next: number | null; tuck: boolean; lit?: number[] };

export const C = {
  ground: '#0d0d0d',
  panel: '#171717',
  line: '#3a3a3a',
  ink: '#ede9e0',
  muted: '#8a8a8a',
  signal: '#ff5a1f',
  cue: '#8fb3ff',
};

// Finger geometry by number (1 thumb … 5 pinky): center x, top y, width. Fingers end at y = 132.
const F: Record<number, { x: number; top: number; w: number }> = {
  1: { x: 86, top: 72, w: 40 }, // thumb: a 92-long capsule whose base sits at (86, 164)
  2: { x: 92, top: 22, w: 38 },
  3: { x: 134, top: 6, w: 38 },
  4: { x: 175, top: 20, w: 36 },
  5: { x: 212, top: 52, w: 32 },
};
const BOTTOM = 132;
const THUMB_BASE = { x: 86, y: 164 };
const THUMB_LEN = 92;

function tone(f: number, p: Pose): 'on' | 'cue' | 'rest' {
  if (p.down === f || p.lit?.includes(f)) return 'on';
  if (p.next === f) return 'cue';
  return 'rest';
}

function thumbStyle(p: Pose): React.CSSProperties {
  return {
    transform: `rotate(${p.tuck ? 58 : -42}deg)`,
    transformOrigin: `${THUMB_BASE.x}px ${THUMB_BASE.y}px`,
    transformBox: 'view-box',
    transition: 'transform 420ms cubic-bezier(.3,1.4,.5,1)',
  };
}

function Number({ f, x, y, p, size = 14 }: { f: number; x: number; y: number; p: Pose; size?: number }) {
  const t = tone(f, p);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      fontWeight={700}
      fontSize={size}
      fill={t === 'on' ? C.ground : t === 'cue' ? C.cue : C.muted}
      style={{ pointerEvents: 'none' }}
    >
      {f}
    </text>
  );
}

// Thumb contents are drawn pointing straight up from the base, then the group rotates.
function thumbRect() {
  return { x: THUMB_BASE.x - F[1].w / 2, y: THUMB_BASE.y - THUMB_LEN, w: F[1].w, h: THUMB_LEN };
}

/* 1 · Linie — a clean, hand-drawn line hand. One confident stroke, a little wobble. */
export function LinieHand({ p }: { p: Pose }) {
  const wob = (i: number, k: number) => ((i * 7 + k * 3) % 5) - 2; // deterministic ±2
  const fingerPath = (x: number, top: number, w: number, i: number) => {
    const l = x - w / 2, r = x + w / 2, tipR = w / 2;
    return [
      `M ${l + wob(i, 1) * 0.4} ${BOTTOM + 6}`,
      `C ${l - 1} ${BOTTOM - 30 + wob(i, 2)}, ${l + wob(i, 3) * 0.5} ${top + tipR + 12}, ${l + 1} ${top + tipR}`,
      `C ${l + 1} ${top - 2}, ${r - 1} ${top - 2 + wob(i, 4) * 0.5}, ${r - 1} ${top + tipR}`,
      `C ${r + wob(i, 5) * 0.5} ${top + tipR + 14}, ${r + 1} ${BOTTOM - 28}, ${r + wob(i, 6) * 0.4} ${BOTTOM + 6}`,
    ].join(' ');
  };
  const stroke = (t: ReturnType<typeof tone>) => (t === 'on' ? C.signal : t === 'cue' ? C.cue : C.ink);
  const fill = (t: ReturnType<typeof tone>) => (t === 'on' ? C.signal : t === 'cue' ? 'rgba(143,179,255,.12)' : 'none');
  const tr = thumbRect();
  const tt = tone(1, p);
  return (
    <svg viewBox="0 0 240 200" width="100%" style={{ display: 'block' }}>
      <g style={thumbStyle(p)}>
        <path
          d={fingerPath(tr.x + tr.w / 2, tr.y, tr.w, 9).replace(/BOTTOM/g, '')}
          transform={`translate(0 ${THUMB_BASE.y - BOTTOM})`}
          fill={fill(tt)}
          stroke={p.tuck ? C.muted : stroke(tt)}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeDasharray={p.tuck ? '5 4' : undefined}
        />
        <g transform={`translate(0 ${THUMB_BASE.y - BOTTOM})`}>
          <Number f={1} x={tr.x + tr.w / 2} y={tr.y + 22} p={p} />
        </g>
      </g>
      {/* palm: a loose rounded shape, open at the wrist */}
      <path
        d="M 74 118 C 72 150, 70 182, 86 198 L 206 198 C 222 182, 222 150, 218 118 C 170 110, 120 110, 74 118 Z"
        fill={C.ground}
        stroke={C.ink}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      {[2, 3, 4, 5].map((f) => {
        const g = F[f], t = tone(f, p);
        return (
          <g key={f} transform={`rotate(${(f - 3) * 3.5} ${g.x} ${BOTTOM})`}>
            <path d={fingerPath(g.x, g.top, g.w, f)} fill={fill(t)} stroke={stroke(t)} strokeWidth={2.2} strokeLinejoin="round" />
            {/* a knuckle crease */}
            <path d={`M ${g.x - 9} ${g.top + 46} q 9 4 18 0`} fill="none" stroke={t === 'on' ? C.ground : C.line} strokeWidth={1.6} />
            <Number f={f} x={g.x} y={g.top + 24} p={p} />
          </g>
        );
      })}
    </svg>
  );
}

/* 2 · Automat — a robot hand: three segments a finger, joints, a plate with screws and a vent. */
export function AutomatHand({ p }: { p: Pose }) {
  const seg = (x: number, top: number, w: number, t: ReturnType<typeof tone>, key: string, thumb = false) => {
    const len = (thumb ? THUMB_BASE.y : BOTTOM) - top;
    const parts = thumb ? [0.5, 0.5] : [0.3, 0.3, 0.4];
    const fill = t === 'on' ? C.signal : C.panel;
    const stroke = t === 'on' ? C.signal : t === 'cue' ? C.cue : C.line;
    let y = top;
    return parts.map((share, i) => {
      const h = len * share - 3;
      const el = (
        <g key={`${key}-${i}`}>
          <rect x={x - w / 2 + (i === 0 ? 3 : 0)} y={y} width={w - (i === 0 ? 6 : 0)} height={h} rx={i === 0 ? 10 : 5} fill={fill} stroke={stroke} strokeWidth={t === 'cue' ? 2 : 1.5} />
          {i < parts.length - 1 && <circle cx={x} cy={y + h + 1.5} r={3.2} fill={t === 'on' ? C.ground : C.line} />}
          {i === 0 && <circle cx={x} cy={y + 8} r={2.2} fill={t === 'on' ? C.ground : C.muted} />}
        </g>
      );
      y += h + 3;
      return el;
    });
  };
  const tr = thumbRect();
  const tt = tone(1, p);
  return (
    <svg viewBox="0 0 240 200" width="100%" style={{ display: 'block' }}>
      <g style={thumbStyle(p)} opacity={p.tuck ? 0.45 : 1}>
        {seg(tr.x + tr.w / 2, tr.y, tr.w, tt, 't', true)}
        <Number f={1} x={tr.x + tr.w / 2} y={tr.y + 30} p={p} />
      </g>
      {/* plate */}
      <rect x={72} y={112} width={148} height={88} rx={12} fill={C.panel} stroke={C.line} strokeWidth={1.5} />
      {[
        [84, 124], [208, 124], [84, 188], [208, 188],
      ].map(([x, y], i) => (
        <g key={i} stroke={C.muted} strokeWidth={1.2}>
          <circle cx={x} cy={y} r={4} fill={C.ground} />
          <path d={`M ${x - 2.5} ${y - 2.5} l 5 5 M ${x + 2.5} ${y - 2.5} l -5 5`} />
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={116} y={140 + i * 8} width={60} height={3} rx={1.5} fill={C.line} />
      ))}
      {[2, 3, 4, 5].map((f) => {
        const g = F[f], t = tone(f, p);
        return (
          <g key={f} transform={`rotate(${(f - 3) * 3.5} ${g.x} ${BOTTOM})`}>
            {seg(g.x, g.top, g.w, t, `f${f}`)}
            <Number f={f} x={g.x} y={g.top + 26} p={p} size={13} />
          </g>
        );
      })}
    </svg>
  );
}

/* 3 · Greif — a griffin's claw: tapered, ridged, each finger ending in a talon. */
export function GreifHand({ p }: { p: Pose }) {
  const claw = (x: number, top: number, w: number, t: ReturnType<typeof tone>, bottom = BOTTOM) => {
    const l = x - w / 2, r = x + w / 2;
    const fill = t === 'on' ? C.signal : C.panel;
    const stroke = t === 'on' ? C.signal : t === 'cue' ? C.cue : C.ink;
    // body tapers to a point that hooks left (toward the thumb side) at the tip.
    const d = [
      `M ${l} ${bottom + 4}`,
      `C ${l - 2} ${bottom - 40}, ${x - 8} ${top + 36}, ${x - 10} ${top + 14}`,
      `C ${x - 14} ${top + 4}, ${x - 12} ${top - 6}, ${x - 16} ${top - 10}`, // talon tip
      `C ${x - 2} ${top - 4}, ${x + 8} ${top + 8}, ${x + 10} ${top + 24}`,
      `C ${x + 12} ${top + 50}, ${r + 2} ${bottom - 40}, ${r} ${bottom + 4} Z`,
    ].join(' ');
    return (
      <>
        <path d={d} fill={fill} stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
        {/* ridges */}
        {[0.42, 0.56, 0.7].map((k, i) => {
          const y = top + (bottom - top) * k;
          const hw = (w / 2) * (0.55 + k * 0.45);
          return <path key={i} d={`M ${x - hw} ${y} q ${hw} -6 ${hw * 2} 0`} fill="none" stroke={t === 'on' ? C.ground : C.line} strokeWidth={1.4} />;
        })}
        {/* knuckle spur */}
        <circle cx={x} cy={bottom - 6} r={4.5} fill={t === 'on' ? C.ground : C.line} />
      </>
    );
  };
  const tr = thumbRect();
  const tt = tone(1, p);
  return (
    <svg viewBox="0 0 240 200" width="100%" style={{ display: 'block' }}>
      <g style={thumbStyle(p)} opacity={p.tuck ? 0.45 : 1}>
        {claw(tr.x + tr.w / 2, tr.y + 8, tr.w, tt, THUMB_BASE.y)}
        <Number f={1} x={tr.x + tr.w / 2 - 2} y={tr.y + 44} p={p} />
      </g>
      {/* scaled pad */}
      <path d="M 78 122 C 70 150, 70 184, 92 200 L 200 200 C 224 184, 224 150, 214 122 C 170 108, 122 108, 78 122 Z" fill={C.panel} stroke={C.ink} strokeWidth={2} strokeLinejoin="round" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3].map((col) => (
          <path
            key={`${row}-${col}`}
            d={`M ${92 + col * 30 + (row % 2) * 15} ${136 + row * 18} q 11 -8 22 0`}
            fill="none"
            stroke={C.line}
            strokeWidth={1.3}
          />
        )),
      )}
      {[2, 3, 4, 5].map((f) => {
        const g = F[f], t = tone(f, p);
        return (
          <g key={f} transform={`rotate(${(f - 3) * 3.5} ${g.x} ${BOTTOM})`}>
            {claw(g.x, g.top, g.w, t)}
            <Number f={f} x={g.x} y={g.top + 40} p={p} size={13} />
          </g>
        );
      })}
    </svg>
  );
}

/* 4 · Schaltplan — the hand as a circuit: traces for fingers, pads at the tips, a chip in the palm. */
export function SchaltplanHand({ p }: { p: Pose }) {
  const trace = (x: number, top: number, t: ReturnType<typeof tone>, bottom = BOTTOM) => {
    const stroke = t === 'on' ? C.signal : t === 'cue' ? C.cue : C.muted;
    return (
      <g filter={t === 'on' ? 'url(#glow)' : undefined}>
        <line x1={x} y1={bottom} x2={x} y2={top + 10} stroke={stroke} strokeWidth={t === 'rest' ? 6 : 8} strokeLinecap="round" strokeDasharray={t === 'cue' ? '6 5' : undefined} />
        <rect x={x - 9} y={top - 2} width={18} height={18} transform={`rotate(45 ${x} ${top + 7})`} fill={t === 'on' ? C.signal : C.panel} stroke={stroke} strokeWidth={2} />
        <circle cx={x} cy={bottom} r={6} fill={C.ground} stroke={stroke} strokeWidth={2.5} />
        <circle cx={x} cy={(top + bottom) / 2} r={3} fill={t === 'on' ? C.ground : stroke} />
      </g>
    );
  };
  const tr = thumbRect();
  const tt = tone(1, p);
  return (
    <svg viewBox="0 0 240 200" width="100%" style={{ display: 'block' }}>
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor={C.signal} floodOpacity="0.8" />
        </filter>
      </defs>
      <g style={thumbStyle(p)} opacity={p.tuck ? 0.5 : 1}>
        {trace(tr.x + tr.w / 2, tr.y + 4, tt, THUMB_BASE.y)}
        <Number f={1} x={tr.x + tr.w / 2 + 16} y={tr.y + 40} p={p} />
      </g>
      {/* board + chip */}
      <rect x={72} y={112} width={148} height={88} rx={4} fill="none" stroke={C.line} strokeWidth={1.5} strokeDasharray="3 3" />
      <rect x={118} y={136} width={56} height={40} rx={3} fill={C.panel} stroke={C.ink} strokeWidth={1.5} />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} stroke={C.muted} strokeWidth={2}>
          <line x1={124 + i * 11} y1={128} x2={124 + i * 11} y2={136} />
          <line x1={124 + i * 11} y1={176} x2={124 + i * 11} y2={184} />
        </g>
      ))}
      <text x={146} y={159} textAnchor="middle" dominantBaseline="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize={9} fill={C.muted} letterSpacing={1}>
        TAKT
      </text>
      {/* bus from the chip to each finger node */}
      {[2, 3, 4, 5].map((f) => (
        <path key={f} d={`M ${F[f].x} ${BOTTOM} V 124 H 146 V 136`} fill="none" stroke={C.line} strokeWidth={1.5} />
      ))}
      {[2, 3, 4, 5].map((f) => {
        const g = F[f], t = tone(f, p);
        return (
          <g key={f}>
            {trace(g.x, g.top, t)}
            <Number f={f} x={g.x + 15} y={g.top + 34} p={p} size={12} />
          </g>
        );
      })}
    </svg>
  );
}

/* 5 · Bauhaus — circle, bar, half-circle. The hand as a composition. */
export function BauhausHand({ p }: { p: Pose }) {
  const bar = (x: number, top: number, w: number, t: ReturnType<typeof tone>, bottom = BOTTOM) => {
    const fill = t === 'on' ? C.signal : C.panel;
    const stroke = t === 'on' ? C.signal : t === 'cue' ? C.cue : C.ink;
    return (
      <>
        <rect x={x - w / 2} y={top + w / 2} width={w} height={bottom - top - w / 2} fill={fill} stroke={stroke} strokeWidth={2} />
        <path d={`M ${x - w / 2} ${top + w / 2} a ${w / 2} ${w / 2} 0 0 1 ${w} 0 Z`} fill={t === 'on' ? C.ground : t === 'cue' ? C.cue : C.ink} />
      </>
    );
  };
  const tr = thumbRect();
  const tt = tone(1, p);
  return (
    <svg viewBox="0 0 240 200" width="100%" style={{ display: 'block' }}>
      <g style={thumbStyle(p)} opacity={p.tuck ? 0.45 : 1}>
        {bar(tr.x + tr.w / 2, tr.y, tr.w, tt, THUMB_BASE.y)}
        <Number f={1} x={tr.x + tr.w / 2} y={tr.y + 56} p={p} />
      </g>
      <circle cx={146} cy={158} r={46} fill={C.panel} stroke={C.ink} strokeWidth={2} />
      <circle cx={146} cy={158} r={6} fill={C.ink} />
      {[2, 3, 4, 5].map((f) => {
        const g = F[f], t = tone(f, p);
        return (
          <g key={f}>
            {bar(g.x, g.top, g.w, t)}
            <Number f={f} x={g.x} y={g.top + g.w / 2 + 28} p={p} size={13} />
          </g>
        );
      })}
    </svg>
  );
}

/* 6 · Skizze — a normal hand: one outline, no seams, the lesson's marks drawn over it. */
const SK = { heel: [73, 177], web: [72, 139], base: { x: 64, y: 157 }, len: 80, w: 30, out: -35.5, in: 58 };

function skRot(x: number, y: number, cx: number, cy: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180, dx = x - cx, dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

function skFinger(f: number) {
  const g = F[f], lean = (f - 3) * 3.5, bottom = BOTTOM + 2;
  const wob = (k: number) => ((f * 7 + k * 3) % 5) * 0.5 - 1;
  const r = (x: number, y: number) => skRot(x, y, g.x, BOTTOM, lean);
  const l = g.x - g.w / 2, rr = g.x + g.w / 2, tipY = g.top + g.w / 2;
  return {
    lean, r,
    leftBottom: r(l + 2, bottom), leftC1: r(l + wob(1), bottom - 34), leftC2: r(l + wob(2), tipY + 14), leftTop: r(l + 1, tipY),
    tipC1: r(l + 1, g.top - 2 + wob(3)), tipC2: r(rr - 1, g.top - 2 + wob(4)), rightTop: r(rr - 1, tipY),
    rightC1: r(rr + wob(5), tipY + 14), rightC2: r(rr, bottom - 34), rightBottom: r(rr - 2, bottom),
  };
}

// The whole hand as one closed line; `t` 0 = thumb out, 1 = folded onto the palm's edge.
function skSilhouette(t: number) {
  const mix = (a: [number, number], b: [number, number]) => `${a[0] + (b[0] - a[0]) * t} ${a[1] + (b[1] - a[1]) * t}`;
  const P = (p: [number, number]) => `${p[0]} ${p[1]}`;
  const parts = [
    `M 86 198 C 80 194, 76 184, ${P(SK.heel as [number, number])}`,
    `C ${mix([46, 180], [70, 172])}, ${mix([18, 126], [67, 168])}, ${mix([7, 106], [68, 162])}`,
    `C ${mix([1, 96], [66, 158])}, ${mix([29, 76], [68, 153])}, ${mix([36, 86], [69, 150])}`,
    `C ${mix([44, 96], [70, 147])}, ${mix([62, 118], [71, 143])}, ${P(SK.web as [number, number])}`,
  ];
  let prev: [number, number] | null = null;
  for (const f of [2, 3, 4, 5]) {
    const g = skFinger(f);
    parts.push(prev ? `Q ${(prev[0] + g.leftBottom[0]) / 2} ${g.leftBottom[1] + 7}, ${P(g.leftBottom)}` : `Q 71 136, ${P(g.leftBottom)}`);
    parts.push(`C ${P(g.leftC1)}, ${P(g.leftC2)}, ${P(g.leftTop)}`);
    parts.push(`C ${P(g.tipC1)}, ${P(g.tipC2)}, ${P(g.rightTop)}`);
    parts.push(`C ${P(g.rightC1)}, ${P(g.rightC2)}, ${P(g.rightBottom)}`);
    prev = g.rightBottom;
  }
  parts.push('C 228 150, 226 186, 206 198');
  return parts.join(' ');
}

export function SkizzeHand({ p }: { p: Pose }) {
  // The fold eases toward the pose (a small spring on requestAnimationFrame).
  const [fold, setFold] = useState(p.tuck ? 1 : 0);
  const foldRef = useRef(fold);
  useEffect(() => {
    const target = p.tuck ? 1 : 0;
    let raf = 0;
    const step = () => {
      const next = foldRef.current + (target - foldRef.current) * 0.16;
      foldRef.current = Math.abs(target - next) < 0.004 ? target : next;
      setFold(foldRef.current);
      if (foldRef.current !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [p.tuck]);

  const d = skSilhouette(fold);
  const angle = p.tuck ? SK.in : SK.out;
  const tt = tone(1, p);
  const ghostStroke = tt === 'cue' ? C.cue : C.muted;
  const arc: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = ((SK.out + (SK.in - SK.out) * (i / 24)) * Math.PI) / 180, r = SK.len - 6;
    arc.push(`${SK.base.x + r * Math.sin(a)} ${SK.base.y - r * Math.cos(a)}`);
  }
  const aEnd = ((SK.in * Math.PI) / 180), r = SK.len - 6;
  const ex = SK.base.x + r * Math.sin(aEnd), ey = SK.base.y - r * Math.cos(aEnd);
  const ux = Math.cos(aEnd), uy = Math.sin(aEnd); // the tangent at the end
  return (
    <svg viewBox="0 0 240 200" width="100%" style={{ display: 'block' }}>
      <path d={d} fill={C.panel} stroke={C.ink} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {/* nails and knuckles, in pencil */}
      {[2, 3, 4, 5].map((f) => {
        const g = skFinger(f), fg = F[f];
        const pt = (x: number, y: number) => g.r(x, y).join(' ');
        return (
          <path
            key={f}
            d={`M ${pt(fg.x - 6, fg.top + 21)} C ${pt(fg.x - 7, fg.top + 8)}, ${pt(fg.x + 7, fg.top + 8)}, ${pt(fg.x + 6, fg.top + 21)} M ${pt(fg.x - 5, 143)} Q ${pt(fg.x, 139)}, ${pt(fg.x + 5, 143)}`}
            fill="none"
            stroke={C.line}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        );
      })}
      {/* the marks: a marker over the finger that's down, a dotted outline around the next */}
      {[2, 3, 4, 5].map((f) => {
        const g = F[f], t = tone(f, p), w = g.w - 8, len = BOTTOM - g.top - 8, y = BOTTOM - 4 - len;
        return (
          <g key={f} transform={`rotate(${(f - 3) * 3.5} ${g.x} ${BOTTOM - 4})`}>
            <rect x={g.x - w / 2} y={y} width={w} height={len} rx={w / 2}
              fill={t === 'on' ? C.signal : t === 'cue' ? 'rgba(143,179,255,.08)' : 'none'} fillOpacity={t === 'on' ? 0.92 : 1}
              stroke={t === 'cue' ? C.cue : 'none'} strokeWidth={2} strokeDasharray="3 4" />
            <Number f={f} x={g.x} y={y + 36} p={p} />
          </g>
        );
      })}
      <g style={{ ...thumbStyle(p), transform: `rotate(${angle}deg)`, transformOrigin: `${SK.base.x}px ${SK.base.y}px` }}>
        <rect x={SK.base.x - SK.w / 2} y={SK.base.y - SK.len} width={SK.w} height={SK.len} rx={SK.w / 2}
          fill={!p.tuck && tt === 'on' ? C.signal : !p.tuck && tt === 'cue' ? 'rgba(143,179,255,.08)' : 'none'} fillOpacity={0.92}
          stroke={p.tuck ? ghostStroke : tt === 'cue' ? C.cue : 'none'} strokeWidth={2} strokeDasharray="3 4" />
        <text x={SK.base.x} y={SK.base.y - SK.len + 30} textAnchor="middle" dominantBaseline="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontWeight={700} fontSize={14}
          fill={tt === 'on' && !p.tuck ? C.ground : tt === 'cue' ? C.cue : C.muted} transform={`rotate(${-angle} ${SK.base.x} ${SK.base.y - SK.len + 30})`}>
          1
        </text>
      </g>
      {p.tuck && (
        <path
          d={`M ${arc.join(' L ')} M ${ex - 7 * ux + 4 * uy} ${ey - 7 * uy - 4 * ux} L ${ex} ${ey} L ${ex - 7 * ux - 4 * uy} ${ey - 7 * uy + 4 * ux}`}
          fill="none" stroke={ghostStroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 4" />
      )}
    </svg>
  );
}

export const HANDS = [
  {
    key: 'linie',
    name: 'Linie',
    tag: 'The clean hand-drawn hand',
    blurb:
      'One line, a little wobble, a knuckle crease. Reads as a person, not a diagram. The default: warm, adult, quiet enough to sit under a lesson for an hour.',
    unlock: 'Ships with the app.',
    Hand: LinieHand,
  },
  {
    key: 'skizze',
    name: 'Skizze',
    tag: 'A normal hand, sketched',
    blurb:
      'The whole hand in one line, the way you would sketch it on a napkin: no seam where a finger meets the palm, a nail at each tip, a knuckle under each finger. The lesson writes on top of it like a teacher with a marker: the finger that is down is highlighted, the next one is a dotted outline, and when the thumb goes under, it folds away and a dotted ghost shows where it travels.',
    unlock: 'Ships with the app.',
    Hand: SkizzeHand,
  },
  {
    key: 'automat',
    name: 'Automat',
    tag: 'The robot hand',
    blurb:
      'Three segments a finger, pin joints, a fingertip sensor, a plate with four screws and a vent. Kraftwerk at the piano. The segments light one by one, so the highlight reads even at pinky size.',
    unlock: 'Unlock: the first module at 90 bpm.',
    Hand: AutomatHand,
  },
  {
    key: 'greif',
    name: 'Greif',
    tag: 'The griffin’s claw',
    blurb:
      'Tapered, ridged, every finger ending in a talon that hooks toward the thumb. Scales on the pad. The one you earn: a little menacing, very Berlin, still five numbered fingers.',
    unlock: 'Unlock: a 30-day streak.',
    Hand: GreifHand,
  },
  {
    key: 'schaltplan',
    name: 'Schaltplan',
    tag: 'The circuit hand',
    blurb:
      'Fingers as traces, pads at the tips, a chip in the palm with the bus running to each node. The finger that is down lights with a glow, the next one is a dashed trace: the signal path of a scale.',
    unlock: 'Unlock: the Scales module.',
    Hand: SchaltplanHand,
  },
  {
    key: 'bauhaus',
    name: 'Bauhaus',
    tag: 'Circle, bar, half-circle',
    blurb:
      'The hand as a composition: a circle for the palm, bars for the fingers, a cap on each. Dessau 1926. The most abstract of the five, and the one that looks best printed on a poster.',
    unlock: 'Unlock: the Ear Training module.',
    Hand: BauhausHand,
  },
];
