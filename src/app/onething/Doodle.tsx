'use client';

import { useLayoutEffect, useRef } from 'react';

/* A day's doodle. The model draws on a 340×170 canvas with air in different
 * places, so after mount the viewBox is set to the ink's bounds (padded),
 * widened to whatever keeps the scale at or under `pen` px per canvas unit:
 * big drawings fit the frame, small ones stay small, all centred. Strokes are
 * non-scaling (CSS), so every drawing is the same pen at a given size.
 *
 * The boil: the drawing is rendered three times, each copy through its own
 * turbulence filter (#ot-boil-0..2 in the page's <Defs>), and CSS shows one
 * copy at a time, five times a second — a hand-drawn line that never sits
 * still. `boil` = 'on' always, 'hover' only while its card is hovered or
 * focused, 'off' a still drawing (still wobbled, so it matches). */

const PAD = 10;
const FRAMES = [0, 1, 2];

export default function Doodle({ svg, alt, pen = 0.8, boil = 'on' }: { svg: string; alt?: string | null; pen?: number; boil?: 'on' | 'hover' | 'off' }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => {
      const svgs = Array.from(box.querySelectorAll('svg'));
      const first = svgs[0]?.querySelector('g');
      if (!first) return;
      let b: DOMRect;
      try { b = (first as SVGGElement).getBBox(); } catch { return; }
      if (!b.width && !b.height) return;
      const slot = box.getBoundingClientRect();
      if (!slot.width || !slot.height) return;
      const w = Math.max(b.width + PAD * 2, slot.width / pen);
      const h = Math.max(b.height + PAD * 2, slot.height / pen);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const vb = `${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
      for (const s of svgs) s.setAttribute('viewBox', vb);
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  }, [svg, pen]);
  return (
    <div ref={ref} className={`ot-boil ${boil}`} role="img" aria-label={alt || 'a doodle'}>
      {FRAMES.map((i) => (
        <svg key={i} className="ot-doodle" viewBox="0 0 340 170" aria-hidden>
          <g filter={`url(#ot-boil-${i})`} dangerouslySetInnerHTML={{ __html: svg }} />
        </svg>
      ))}
    </div>
  );
}
