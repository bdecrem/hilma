'use client';

import { useEffect, useRef, useState } from 'react';
import { LEVELS, type Level } from '@/lib/onething/levels';
import { createScene } from './grow-scene';

// The payoff for a streak milestone (day 3, 7, 14, 30, 60, 100, 365): the whole
// page becomes the garden. The seed cracks and the plant grows from day 1 to
// where the person actually is — their level, and how far along it they are —
// with the day counter running alongside. On arrival the branches shed petals,
// the stage name pops and the foot says what the day was worth. Then it is
// theirs to play with: a tap plants a flower, a swipe makes wind.

export type PayoffProps = { streak: number; bonus: number; points: number; onClose: () => void };

/// Growth for the scene: the level index plus the fraction of the way to the next.
export function growthFor(points: number): { p: number; level: Level } {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (points >= LEVELS[k].min) i = k;
  const level = LEVELS[i], next = LEVELS[i + 1];
  const frac = next ? Math.min(1, (points - level.min) / (next.min - level.min)) : 0;
  return { p: i + frac, level };
}

const NAMES = LEVELS.map((l) => l.name);

export default function Payoff({ streak, bonus, points, onClose }: PayoffProps) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [stage, setStage] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { p } = growthFor(points);
    const scene = createScene(cv, {
      reduceMotion: reduce,
      // the counter runs day 1 → day N in step with the growth, written straight to the node (60×/s is no place for a re-render)
      onProgress: (k) => { const el = daysRef.current; if (el) el.textContent = `day ${1 + Math.floor(k * (streak - 1))}`; },
      onArrive: () => { scene.burst(); setArrived(true); },
      onStage: setStage,
      onFirstTouch: () => setTouched(true),
    });
    let timer = 0;
    if (reduce) { scene.setP(p); setArrived(true); }
    else {
      // a beat on the seed first; then 2.8 s for a sprout, up to 7 s for old growth
      const seconds = Math.min(7, Math.max(2.8, 1.6 + p * 0.9));
      timer = window.setTimeout(() => scene.growTo(p, seconds), 700);
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(timer); scene.destroy(); removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [points, streak]);

  const { level } = growthFor(points);
  const what = streak === 365 ? 'A whole year' : `${streak} days in a row`;
  const worth = [what, bonus > 0 ? `${bonus.toLocaleString('en-US')} bonus points` : '', `${points.toLocaleString('en-US')} pts`, level.name].filter(Boolean).join(' · ');

  return (
    <div className="ot-payoff" role="dialog" aria-modal="true" aria-label={`Day ${streak}, a milestone`}>
      <header className="ot-payoff-head">
        <span className="ot-wordmark">onething<span>.ink</span></span>
        <span className="ot-month-tag">MILESTONE</span>
      </header>
      <div className="ot-payoff-stage">
        <canvas ref={cvRef} aria-label="Your plant, growing from seed to where it is today. Tap to plant a flower, swipe to make wind." />
        <div className="ot-payoff-hud">
          <div key={stage} className="ot-payoff-name pop">{NAMES[stage]}</div>
          <div className="ot-payoff-days" ref={daysRef}>{arrived ? `day ${streak}` : 'day 1'}</div>
        </div>
      </div>
      <div className={`ot-payoff-foot${arrived ? ' in' : ''}`}>
        <p className={`ot-payoff-hint${touched || !arrived ? ' gone' : ''}`} aria-hidden>tap to plant a flower · swipe to make wind</p>
        <p className="ot-payoff-line">Day {streak}.</p>
        <p className="ot-payoff-sub">{worth}</p>
        <button type="button" className="ot-btn" onClick={onClose}>Back to the page</button>
      </div>
    </div>
  );
}
