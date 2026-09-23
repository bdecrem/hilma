'use client';

import { useEffect, useState } from 'react';
import './alt.css';

/* The margins experiment. One ruled page for the month; every kept day is
 * a few lines of handwriting, and its doodle is a pen drawing that landed
 * wherever there was room — in the right margin beside the words, out in the
 * gutter over the red rule, or sprawled under the sentence and across the
 * next line. Which of the three, and the tilt, come from the day number, so
 * the page looks the same every visit and no two neighbours pose alike.
 *
 * The grid: 28px rules. Every row is padding 6 + content + 22, and the
 * content is either n lines of 28px or a floated figure whose box is a whole
 * number of rules tall (112 = 4 rules beside the words, 140 = 5 rules under
 * them, minus the one rule it spills over), so rows stay on the grid whatever
 * the doodle does; the text wraps under a figure like ink around a sketch. */

type Entry = { id: string; day: string; text: string; doodle?: string | null; doodle_alt?: string | null };
type Me = { user: { name?: string | null } | null; today?: string; entries?: Entry[] };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Pose = 'margin' | 'gutter' | 'under';
function poseFor(dayNo: number, lines: number): Pose {
  if (dayNo % 5 === 0) return 'under';
  if (dayNo % 3 === 0 && lines <= 2) return 'gutter';
  return 'margin';
}
/// -5 … +5 degrees, spread so neighbours differ.
function tiltFor(dayNo: number): number {
  return ((dayNo * 7) % 11) - 5;
}

function lines(text: string): string[] {
  return text.split('\n').map((t) => t.trim()).filter(Boolean);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The drawing in a box that is a whole number of rules tall (the float keeps
 * the row on the grid); the svg inside is what tilts. */
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
      <ol className="alt-lines" aria-label={`${MONTHS[m - 1]} ${y}`}>
        {days.map((day) => {
          const n = Number(day.slice(8));
          const e = byDay.get(day);
          if (!e) return <li key={day} className="alt-row empty"><span className="alt-dayno faint">{n}</span></li>;
          const ts = lines(e.text);
          const pose = e.doodle ? poseFor(n, ts.length) : 'none';
          return (
            <li key={day} className={`alt-row pose-${pose}${day === today ? ' today' : ''}`} style={{ ['--tilt' as string]: `${tiltFor(n)}deg` }}>
              <span className={`alt-dayno${pose === 'gutter' ? ' ringed' : ''}`}>{n}</span>
              {e.doodle && pose !== 'under' && <Fig svg={e.doodle} alt={e.doodle_alt} />}
              <div className="alt-text">
                {ts.map((t, i) => <p key={i} className="t">{t}</p>)}
              </div>
              {e.doodle && pose === 'under' && <Fig svg={e.doodle} alt={e.doodle_alt} />}
            </li>
          );
        })}
      </ol>
      <p className="alt-note">an experiment · <a href="/onething">back to the page</a></p>
    </main>
  );
}
