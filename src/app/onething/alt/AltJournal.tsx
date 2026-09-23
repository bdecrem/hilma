'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './alt.css';

/* The margins experiment, take three: a firm two-column page, and the
 * drawings are the only thing allowed to be loose.
 *
 * The rules run the full width of the page. The words keep to the writing
 * column on the left (they never reach under a drawing); the right column
 * is the margin, and every doodle sits there in the same slot — top-aligned
 * with its entry's first line, centred in the slot — on the ruled paper.
 * Two things make the slots read as one hand and not as stamps: every
 * doodle is cropped to its ink (the model's 340×170 canvas has a lot of air,
 * in different places) and drawn with the same pen (non-scaling strokes, and
 * a small drawing is never blown up past PEN_SCALE), and each tilts ±2° by
 * the day's parity. No other randomness.
 *
 * The grid: 28px rules. A row is 6 + content + 22; a drawn row is at least
 * the slot plus one rule (slot heights are whole rules: 5 on desktop, 4 on a
 * phone), so consecutive drawings never touch. Days with nothing kept
 * collapse into one quiet two-rule gap. */

type Entry = { id: string; day: string; text: string; doodle?: string | null; doodle_alt?: string | null };
type Me = { user: { name?: string | null } | null; today?: string; entries?: Entry[] };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/// Never draw a doodle larger than this many CSS px per canvas unit (the
/// canvas is 340 wide, so 0.8 is "a little under full size").
const PEN_SCALE = 0.8;
const PAD = 10;

function lines(text: string): string[] {
  return text.split('\n').map((t) => t.trim()).filter(Boolean);
}
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The drawing in its slot: after mount, the viewBox is set to the ink's
 * bounds (padded), widened to whatever keeps the scale at or under
 * PEN_SCALE, so big drawings fit and small ones stay small, all centred. */
function Fig({ svg, alt }: { svg: string; alt?: string | null }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let b: DOMRect;
      try { b = el.getBBox(); } catch { return; }
      if (!b.width || !b.height) return;
      const slot = el.getBoundingClientRect();
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
    <div className="alt-fig">
      <svg ref={ref} className="alt-doodle" viewBox="0 0 340 170" role="img" aria-label={alt || 'a doodle'} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

type Row = { kind: 'kept'; day: string; n: number; entry: Entry } | { kind: 'gap'; from: number; to: number };

export default function AltJournal() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch('/api/onething/me', { cache: 'no-store' }).then((r) => r.json()).then(setMe).catch(() => setMe({ user: null }));
  }, []);

  if (!me) return <main className="ot-page alt"><p className="alt-note">…</p></main>;
  if (!me.user || !me.today) return <main className="ot-page alt"><p className="alt-note">Sign in on <a href="/onething">the page</a> first.</p></main>;

  const today = me.today;
  const byDay = new Map((me.entries ?? []).map((e) => [e.day, e]));
  const [y, m] = today.split('-').map(Number);
  // This month so far, newest first; runs of empty days fold into one gap.
  const first = `${today.slice(0, 8)}01`;
  const rows: Row[] = [];
  for (let d = today; d >= first; d = addDays(d, -1)) {
    const n = Number(d.slice(8));
    const e = byDay.get(d);
    if (e) { rows.push({ kind: 'kept', day: d, n, entry: e }); continue; }
    const last = rows[rows.length - 1];
    if (last && last.kind === 'gap') last.to = n;
    else rows.push({ kind: 'gap', from: n, to: n });
  }

  return (
    <main className="ot-page alt">
      <header className="alt-head">
        <a className="ot-wordmark" href="/onething">onething<span>.</span>ink</a>
        <span className="ot-month-tag">{MONTHS[m - 1].toUpperCase()} {y}</span>
      </header>
      <div className="alt-sheet">
        <ol className="alt-lines" aria-label={`${MONTHS[m - 1]} ${y}`}>
          {rows.map((r) => {
            if (r.kind === 'gap') {
              return (
                <li key={`gap-${r.from}`} className="alt-row gap">
                  <span className="alt-dayno faint">{r.from === r.to ? r.from : `${r.from}–${r.to}`}</span>
                </li>
              );
            }
            const { entry: e, n, day } = r;
            return (
              <li key={day} className={`alt-row${e.doodle ? ' drawn' : ''}${day === today ? ' today' : ''}`} style={{ ['--tilt' as string]: `${n % 2 ? -2 : 2}deg` }}>
                <span className="alt-dayno">{n}</span>
                <div className="alt-text">
                  {lines(e.text).map((t, i) => <p key={i} className="t">{t}</p>)}
                </div>
                {e.doodle && <Fig svg={e.doodle} alt={e.doodle_alt} />}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="alt-note">an experiment · <a href="/onething">back to the page</a></p>
    </main>
  );
}
