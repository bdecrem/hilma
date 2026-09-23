'use client';

import { useLayoutEffect, useRef } from 'react';

/* The day's doodle, in the margin slot. The model draws on a 340×170 canvas
 * with air in different places, so after mount the viewBox is set to the
 * ink's bounds (padded), widened to whatever keeps the scale at or under
 * PEN_SCALE: big drawings fit the slot, small ones stay small, all centred.
 * Strokes are non-scaling (CSS), so every drawing is the same pen. */

/// Never draw a doodle larger than this many CSS px per canvas unit (the
/// canvas is 340 wide, so 0.8 is "a little under full size").
const PEN_SCALE = 0.8;
const PAD = 10;

export default function Doodle({ svg, alt }: { svg: string; alt?: string | null }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let b: DOMRect;
      try { b = el.getBBox(); } catch { return; }
      if (!b.width || !b.height) return;
      const slot = el.getBoundingClientRect();
      if (!slot.width || !slot.height) return;
      const w = Math.max(b.width + PAD * 2, slot.width / PEN_SCALE);
      const h = Math.max(b.height + PAD * 2, slot.height / PEN_SCALE);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      el.setAttribute('viewBox', `${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [svg]);
  return (
    <div className="ot-fig">
      <svg ref={ref} className="ot-doodle" viewBox="0 0 340 170" role="img" aria-label={alt || 'a doodle'} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
