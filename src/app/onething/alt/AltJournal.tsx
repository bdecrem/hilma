'use client';

import { useEffect, useState } from 'react';
import './alt.css';

/* The margins experiment, take two: literally in the margin. The lined
 * block is narrower than the page and the words run its full width; every
 * doodle sits in the blank margin to the right of the rules, its inner third
 * overlapping the lined edge the way a drawing spills off the writing area.
 * The tilt and a small vertical shove come from the day number, so the
 * column of drawings does not line up like stamps.
 *
 * The grid: 28px rules on the block. A row is 6 + n×28 + 22; a row with a
 * doodle is at least 4 rules tall so neighbouring drawings keep clear of
 * each other. The doodle is absolutely placed off the row's right edge and
 * takes no room in the flow. */

type Entry = { id: string; day: string; text: string; doodle?: string | null; doodle_alt?: string | null };
type Me = { user: { name?: string | null } | null; today?: string; entries?: Entry[] };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/// -5 … +5 degrees, spread so neighbours differ.
function tiltFor(dayNo: number): number {
  return ((dayNo * 7) % 11) - 5;
}
/// How far the drawing is shoved down from the row's first line: 0, 14 or 28px.
function shoveFor(dayNo: number): number {
  return (dayNo % 3) * 14;
}
/// One day in four the drawing is bigger.
function bigFor(dayNo: number): boolean {
  return dayNo % 4 === 1;
}

function lines(text: string): string[] {
  return text.split('\n').map((t) => t.trim()).filter(Boolean);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The drawing, placed off the row's right edge into the margin. */
function Fig({ svg, alt }: { svg: string; alt?: string | null }) {
  return (
    <div className="alt-fig">
      <svg className="alt-doodle" viewBox="0 0 340 170" role="img" aria-label={alt || 'a doodle'} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

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
  // This month so far, newest first, one row per day whether kept or not.
  const first = `${today.slice(0, 8)}01`;
  const days: string[] = [];
  for (let d = today; d >= first; d = addDays(d, -1)) days.push(d);

  return (
    <main className="ot-page alt">
      <header className="alt-head">
        <a className="ot-wordmark" href="/onething">onething<span>.</span>ink</a>
        <span className="ot-month-tag">{MONTHS[m - 1].toUpperCase()} {y} · MARGINS</span>
      </header>
      <div className="alt-sheet">
      <ol className="alt-lines" aria-label={`${MONTHS[m - 1]} ${y}`}>
        {days.map((day) => {
          const n = Number(day.slice(8));
          const e = byDay.get(day);
          if (!e) return <li key={day} className="alt-row empty"><span className="alt-dayno faint">{n}</span></li>;
          const ts = lines(e.text);
          return (
            <li key={day} className={`alt-row${e.doodle ? ' drawn' : ''}${bigFor(n) ? ' big' : ''}${day === today ? ' today' : ''}`} style={{ ['--tilt' as string]: `${tiltFor(n)}deg`, ['--shove' as string]: `${shoveFor(n)}px` }}>
              <span className="alt-dayno">{n}</span>
              <div className="alt-text">
                {ts.map((t, i) => <p key={i} className="t">{t}</p>)}
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
