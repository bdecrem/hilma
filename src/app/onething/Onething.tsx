'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MILESTONES, pointsAfterRun, pointsForEntry, type Level } from '@/lib/onething/levels';
import { EXAMPLES } from '@/lib/onething/examples';
import Plant from './Plant';
import Payoff from './Payoff';
import Doodle from './Doodle';
import { fitJpeg, squareJpeg } from './picture';
import { plainText, splitLinks } from '@/lib/onething/links';

/* onething, the tear-off calendar (2026-10-16; before it, the jelly journal of
 * 2026-10-02). Today is the top sheet of a day-by-day desk pad: a giant date,
 * Sundays in red and Saturdays in blue, the question and the sentence printed
 * under it. The days already lived are torn-off sheets on the wall below. Flat
 * paper and ink, no gloss: warm wall, cream sheets, black ink, one red. The ink
 * drop is still the character, drawn flat in ink. Styles: tearoff.css (.oj-*),
 * plus onething.css for the doodles, the plant and the payoff scene.
 * Every behaviour is the jelly journal's; only the look changed. */

type Entry = { id: string; day: string; text: string; streak: number; points: number; doodle?: string | null; doodle_alt?: string | null; doodle_register?: string | null; photo?: string | null; photo_w?: number | null; photo_h?: number | null };
type Board = { points: number; streak: number; best: number; doneToday: boolean; level: Level; next: Level | null; index: number };
type BuddyView = { id: string; name: string; avatar: string | null; streak: number; best: number; inToday: boolean; nextBonusIn: number; startsTomorrow: boolean };
type InviteView = { id: string; name: string; since: string };
type Person = { phone: string; since: string; tz?: string; name?: string | null; avatar?: string | null; doodles?: boolean };
/** What the jokers in hand can save right now (src/lib/onething/jokers.ts, `Rescue`). */
type Rescue = {
  days: string[]; from: { day: string; streak: number };
  after: Array<{ id: string; day: string; was: number; becomes: number; points: number }>;
  cost: number; now: number; deals: number; held: number; left: number; until: string; latest: string;
};
type Jokers = { held: number; max: number; every: number; reach: number; nextIn: number | null };
type Me = {
  user: Person | null;
  today?: string; board?: Board; entries?: Entry[]; levels?: Level[];
  buddies?: BuddyView[]; sent?: InviteView[]; received?: InviteView[]; bonus?: { every: number; points: number };
  jokers?: Jokers; saves?: string[]; rescue?: Rescue | null;
};
type Drawn = { svg: string; alt: string; word: string | null; whimsy?: boolean; register?: string };

/// The question over the composer, one picked per visit.
const QUESTIONS = [
  'So?',
  'Anything good?',
  "How'd it go?",
  'Today, quick.',
  "What's new?",
  'Tell me something.',
  'Any news?',
  'One thing, quick.',
  'Best bit?',
  'Well?',
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/// onething's six day colours (the 1st is violet, the 2nd orange, …). The tear-off
/// page prints in ink and red, so a day's colour only names it (data-j); 'ash' is a
/// sleeping drop.
const COLORS = ['violet', 'orange', 'sky', 'yellow', 'pink', 'lime'] as const;
type Color = (typeof COLORS)[number] | 'ash';
/// The drop that hosts a day sits on a colour that isn't its own: violet, the brand ink, unless the day is violet.
const hostOf = (c: Color): Color => (c === 'violet' ? 'yellow' : 'violet');
/// The wall the pad hangs on; the browser bar takes it.
const WALL = '#e9e3d8';
/// Sundays print in red and Saturdays in blue, as on a Japanese tear-off calendar.
function tone(day: string): '' | 'sun' | 'sat' {
  const [y, m, d] = parts(day);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 'sun' : w === 6 ? 'sat' : '';
}
/// A ragged top edge for a sheet torn off the pad, the same for a day every time.
function torn(day: string): string {
  let s = parts(day).reduce((a, n) => a * 31 + n, 7) % 233280;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const pts: string[] = [];
  for (let i = 0; i <= 20; i++) pts.push(`${i * 5}% ${(1 + rnd() * 6).toFixed(1)}px`);
  return `polygon(${pts.join(', ')}, 100% 100%, 0% 100%)`;
}

// ---------- days ----------
function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number);
  return [y, m, d];
}
function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function monthBack(y: number, m: number, n: number): [number, number] {
  const i = y * 12 + (m - 1) - n;
  return [Math.floor(i / 12), (i % 12) + 1];
}
function fmt(day: string, o: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' }).replace(/\bSept\b/, 'Sep');
}
const longDay = (day: string) => fmt(day, { weekday: 'long', day: 'numeric', month: 'long' }); // "Friday 2 October"
const weekday = (day: string) => fmt(day, { weekday: 'short' }); // "Thu"
const dayMonth = (day: string) => fmt(day, { day: 'numeric', month: 'short' }); // "30 Sep"
const monthYear = (day: string) => fmt(day, { month: 'long', year: 'numeric' }).toUpperCase(); // "OCTOBER 2026"
const weekdayLong = (day: string) => fmt(day, { weekday: 'long' }).toUpperCase(); // "FRIDAY"
const colorOf = (day: string): Color => COLORS[(parts(day)[2] - 1) % COLORS.length];
function lines(text: string): string[] {
  return text.split('\n').map((t) => t.trim()).filter(Boolean);
}
function sizeFor(text: string): 'xl' | 'l' | 'm' {
  const n = text.length;
  return n <= 70 ? 'xl' : n <= 150 ? 'l' : 'm';
}
function initials(name: string | null | undefined, phone: string): string {
  const n = (name ?? '').trim();
  if (n) return n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return phone.replace(/\D/g, '').slice(-2) || '·';
}
function todayMilestone(me: Me | null): { day: string; streak: number; bonus: number; points: number } | null {
  if (!me?.user || !me.today || !me.board?.doneToday) return null;
  const e = me.entries?.find((x) => x.day === me.today);
  const bonus = e ? MILESTONES[e.streak] : undefined;
  return e && bonus ? { day: e.day, streak: e.streak, bonus, points: e.points } : null;
}
function daysToNext(b: Board): number | null {
  if (!b.next) return null;
  let s = b.streak, p = b.points;
  for (let d = 1; d <= 400; d++) {
    s += 1;
    const { base, bonus } = pointsForEntry(s);
    p += base + bonus;
    if (p >= b.next.min) return b.doneToday ? d : d - 1;
  }
  return null;
}

type Cell = { day: string; entry?: Entry; missed: boolean; saved?: boolean; from?: string; count?: number };
function monthCells(y: number, m: number, today: string, since: string, byDay: Map<string, Entry>, saves: Set<string>): Cell[] {
  const [ty, tm, td] = parts(today);
  const last = y === ty && m === tm ? td - 1 : daysInMonth(y, m);
  const sinceDay = since.slice(0, 10);
  const cells: Cell[] = [];
  for (let d = last; d >= 1; d--) {
    const day = ymd(y, m, d);
    const entry = byDay.get(day);
    if (entry) cells.push({ day, entry, missed: false });
    else if (saves.has(day)) cells.push({ day, missed: false, saved: true });
    else if (day >= sinceDay) {
      const prev = cells[cells.length - 1];
      if (prev?.missed) { prev.from = day; prev.count = (prev.count ?? 1) + 1; }
      else cells.push({ day, missed: true, count: 1 });
    }
  }
  return cells;
}

// ---------- the splash ----------

const SPLASH = ['#151515', '#d63a20', '#151515', '#2552c4'];

/** A splash of ink from a point on the screen: flat drops in black, red and blue, falling. */
function splash(x: number, y: number, n = 40) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'oj-splash';
  document.body.appendChild(layer);
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const size = 6 + Math.random() * 10;
    s.style.width = s.style.height = `${size}px`;
    s.style.background = SPLASH[i % SPLASH.length];
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    layer.appendChild(s);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const v = 110 + Math.random() * 210;
    const dx = Math.cos(a) * v, dy = Math.sin(a) * v;
    s.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.8}px), calc(-50% + ${dy * 0.8}px)) scale(1)`, opacity: 1, offset: 0.4 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 280}px)) scale(.7, 1.2)`, opacity: 0 },
    ], { duration: 1000 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
  }
  setTimeout(() => layer.remove(), 1700);
}

/** The ink drop, flat in ink: onething's character. A tap squishes it (> < eyes) and splashes.
 * `mood` asleep closes its eyes (a missed day). */
function Ink({ color, size, className = '', mood = 'happy', onTap, label, delay = 0, still }: {
  color: Color; size: number; className?: string; mood?: 'happy' | 'asleep'; onTap?: () => void; label?: string; delay?: number; still?: boolean;
}) {
  const [squish, setSquish] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const body = color === 'ash' ? '#d3cbbb' : '#151515';
  function poke(e: React.PointerEvent) {
    e.stopPropagation();
    setSquish(true);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setSquish(false), 440);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    splash(r.left + r.width / 2, r.top + r.height * 0.45, Math.round(10 + size / 8));
  }
  const ink = color === 'ash' ? '#7d7668' : '#fffdf7'; // the face, on the drop
  const eyes = squish ? (
    <g fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M34 64 L42 70 L34 76" /><path d="M66 64 L58 70 L66 76" />
    </g>
  ) : mood === 'asleep' ? (
    <g fill="none" stroke={ink} strokeWidth="3.4" strokeLinecap="round">
      <path d="M34 71 Q40 76 46 71" /><path d="M54 71 Q60 76 66 71" />
    </g>
  ) : (
    <g className="oj-eyes">
      <ellipse cx="40" cy="70" rx="5" ry="5.6" fill={ink} /><ellipse cx="60" cy="70" rx="5" ry="5.6" fill={ink} />
    </g>
  );
  const mouth = squish
    ? <ellipse cx="50" cy="83" rx="4.4" ry="5" fill="#d63a20" />
    : mood === 'asleep'
      ? <path d="M47 83 Q50 85 53 83" fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
      : <path d="M45 80 Q50 85.5 55 80" fill="none" stroke={ink} strokeWidth="2.8" strokeLinecap="round" />;
  return (
    <span
      className={`oj-ink${squish ? ' squish' : ''}${still ? ' still' : ''} ${className}`}
      style={{ ['--s' as string]: `${size}px`, animationDelay: `${delay}s` }}
      onPointerDown={poke}
      onClick={onTap}
      role={label ? 'button' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 100 112" width={size} height={size * 1.12}>
        <path d="M50 3 C63 29 89 46 89 71 A39 37 0 0 1 11 71 C11 46 37 29 50 3 Z" fill={body} />
        {eyes}
        {mouth}
        {color !== 'ash' && <><ellipse cx="29" cy="80" rx="6" ry="3.4" fill="#d63a20" /><ellipse cx="71" cy="80" rx="6" ry="3.4" fill="#d63a20" /></>}
      </svg>
    </span>
  );
}

/** The doodle filters (Doodle.tsx boils through these) and the plant's hatching. */
function Defs() {
  return (
    <svg className="ot-defs" aria-hidden>
      <defs>
        <pattern id="ot-hatch-green" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-38)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#4f9a63" strokeWidth="3" strokeLinecap="round" />
        </pattern>
        <pattern id="ot-hatch-green-light" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(38)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#9ccc9c" strokeWidth="3" strokeLinecap="round" />
        </pattern>
        <pattern id="ot-hatch-wood" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(60)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#e7c9a2" strokeWidth="2.6" strokeLinecap="round" />
        </pattern>
        {[3, 11, 29].map((seed, i) => (
          <filter key={seed} id={`ot-boil-${i}`} filterUnits="userSpaceOnUse" x="-200" y="-200" width="740" height="570">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

function Avatar({ person, size = 40 }: { person: { name?: string | null; phone: string; avatar?: string | null }; size?: number }) {
  return (
    <span className="oj-avatar" style={{ ['--s' as string]: `${size}px` }}>
      {person.avatar ? <img src={person.avatar} alt="" /> : initials(person.name, person.phone)}
    </span>
  );
}

/** The top of the flood: the wordmark, the streak, and the picture, which opens
 * a small menu (the other screen, sign out). */
function Top({ me, streak, view, onView, onSignout }: { me: Person; streak: number; view: 'journal' | 'settings'; onView: (v: 'journal' | 'settings') => void; onSignout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="oj-top">
      <a className="oj-wordmark" href="/onething">onething<i>.</i></a>
      <div className="oj-top-right" ref={ref}>
        <span className="oj-streak" aria-label={`${streak}-day streak`} title={`${streak}-day streak`}><b>{streak}</b> day streak</span>
        <button type="button" className="oj-me" aria-label="menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Avatar person={me} size={42} />
        </button>
        {open && (
          <ul className="oj-menu" role="menu">
            <li><button type="button" role="menuitem" onClick={() => { setOpen(false); onView(view === 'journal' ? 'settings' : 'journal'); }}>{view === 'journal' ? 'Settings' : 'Your page'}</button></li>
            <li><button type="button" role="menuitem" className="quiet" onClick={() => { setOpen(false); onSignout(); }}>Sign out</button></li>
          </ul>
        )}
      </div>
    </div>
  );
}

/** Picking, opening and the state of a day's picture (one per day). */
type PhotoProps = { busy: boolean; err: string; onPick: (day: string) => void; onOpen: (day: string) => void };
type ThoughtsProps = {
  day: string; text: string;
  editing: { day: string; index: number } | null; editText: string; busy: boolean; err: string;
  onEditText: (t: string) => void; onStart: (day: string, index: number, current: string) => void;
  onSave: () => void; onCancel: () => void;
};
function Thoughts({ day, text, editing, editText, busy, err, onEditText, onStart, onSave, onCancel }: ThoughtsProps) {
  const all = lines(text);
  return (
    <ol className="oj-thoughts">
      {all.map((t, i) => (
        <li key={i} className="oj-thought">
          {editing && editing.day === day && editing.index === i ? (
            <form onSubmit={(e) => { e.preventDefault(); onSave(); }}>
              <textarea className="oj-ta" value={editText} maxLength={600} onChange={(e) => onEditText(e.target.value)} rows={3} autoFocus aria-label="edit this thought" />
              <div className="oj-acts">
                <button className="oj-btn" type="submit" disabled={busy || editText.trim().length === 1}>{busy ? 'Saving…' : 'Save'}</button>
                <button type="button" className="oj-text-btn" onClick={onCancel}>Cancel</button>
              </div>
              {all.length > 1 && <p className="oj-note">Leave it empty to remove this one.</p>}
              {err && <p className="oj-err">{err}</p>}
            </form>
          ) : (
            <p className="t">
              <Rich text={t} />
              <button type="button" className="oj-edit" onClick={() => onStart(day, i, t)} aria-label={`edit thought ${i + 1}`}>edit</button>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A sentence with its links: a URL shows as its bare domain, underlined in the
 *  day's ink, no preview card — the sentence stays the entry. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        'href' in part
          ? <span key={i}><a className="oj-link" href={part.href} target="_blank" rel="noopener noreferrer">{part.label}</a>{part.tail}</span>
          : <span key={i}>{part.text}</span>,
      )}
    </>
  );
}

/** The day's picture, a small snapshot taped to the card under the sentence.
 *  Fixed small; a tap shows it big. Never above the sentence, never full bleed. */
function Snapshot({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const w = entry.photo_w || 4, h = entry.photo_h || 3;
  // tall pictures are cropped to 3:4 by the card, wide ones to 16:9 — the print stays a small rectangle
  const ratio = Math.min(16 / 9, Math.max(3 / 4, w / h));
  return (
    <button type="button" className="oj-snap" style={{ ['--ratio' as string]: ratio }} onClick={onOpen} aria-label="the day's picture, bigger">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={entry.photo ?? ''} alt="" loading="lazy" />
    </button>
  );
}

/** A paperclip, for the "add a picture" pill. */
function Clip() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 6.5l-6 6a2.1 2.1 0 0 0 3 3l6.5-6.5a4.2 4.2 0 0 0-6-6L4.6 9.4" />
    </svg>
  );
}

/** The picture, big, in a sheet: the day, the sentence under it, and the way to take it off. */
function PhotoSheet({ entry, busy, err, onRemove, onClose }: { entry: Entry; busy: boolean; err: string; onRemove: () => void; onClose: () => void }) {
  const c = colorOf(entry.day);
  const [sure, setSure] = useState(false);
  return (
    <Sheet label={`picture from ${longDay(entry.day)}`} onClose={onClose}>
      <article className="oj-card oj-photo" data-j={c}>
        <div className="oj-card-top">
          <span className="oj-chip">{longDay(entry.day)}</span>
          <button type="button" className="oj-x" aria-label="close" onClick={onClose}>×</button>
        </div>
        <div className="oj-photo-print">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.photo ?? ''} alt={`picture from ${longDay(entry.day)}`} />
        </div>
        <p className="oj-photo-cap"><Rich text={lines(entry.text)[0] ?? ''} /></p>
        <div className="oj-acts">
          {sure
            ? <>
                <button type="button" className="oj-btn" disabled={busy} onClick={onRemove}>{busy ? 'Removing…' : 'Take it off'}</button>
                <button type="button" className="oj-text-btn" onClick={() => setSure(false)}>Keep it</button>
              </>
            : <button type="button" className="oj-text-btn quiet-on" onClick={() => setSure(true)}>Remove this picture</button>}
        </div>
        {err && <p className="oj-err">{err}</p>}
      </article>
    </Sheet>
  );
}

function Drawing({ label = 'drawing…' }: { label?: string }) {
  return (
    <div className="ot-drawing" role="status">
      <svg viewBox="0 0 80 60" aria-hidden>
        <path className="scribble" d="M8 44 C18 20 26 50 36 30 S52 14 60 36 S70 46 74 24" />
        <g className="pencil"><path d="M0 0 L18 -18 L24 -12 L6 6 Z" /><path d="M0 0 L6 6 L-3 9 Z" className="tip" /></g>
      </svg>
      <span>{label}</span>
    </div>
  );
}

/** The doodle in its white blob, and every thought of the day. */
function DayBody({ day, entry, drawn, thoughts, onPhoto }: { day: string; entry: Entry; drawn: boolean; thoughts: Omit<ThoughtsProps, 'day' | 'text'>; onPhoto: (day: string) => void }) {
  return (
    <>
      {drawn && (
        <div className="oj-blob">
          {entry.doodle ? <Doodle svg={entry.doodle} alt={entry.doodle_alt} pen={1.4} boil={entry.doodle_register === 'heavy' ? 'off' : 'on'} /> : <Drawing />}
        </div>
      )}
      <div className={`oj-said ${sizeFor(plainText(entry.text))}`}><Thoughts day={day} text={entry.text} {...thoughts} /></div>
      {entry.photo && <Snapshot entry={entry} onOpen={() => onPhoto(day)} />}
    </>
  );
}

/** A day on the month's wall: a sheet torn off the pad. */
function Tile({ cell, drawn, i, onOpen, onSave }: { cell: Cell; drawn: boolean; i: number; onOpen: () => void; onSave?: () => void }) {
  if (cell.saved) {
    return (
      <div className="oj-tile saved" style={{ ['--tilt' as string]: `${i % 2 ? 0.8 : -0.8}deg`, clipPath: torn(cell.day) }}>
        <span className="oj-tile-date"><b>{parts(cell.day)[2]}</b>{weekday(cell.day)}</span>
        <span className="oj-tile-card"><Joker w={54} /></span>
        <span className="oj-tile-miss">A joker covered it.</span>
      </div>
    );
  }
  if (cell.missed) {
    const n = cell.count ?? 1;
    const said = <span className="oj-tile-miss"><b>{cell.from ? `${parts(cell.from)[2]}–${dayMonth(cell.day)}` : dayMonth(cell.day)}</b>{n > 1 ? `${n} days off.` : 'A day off.'} The ink slept in.</span>;
    // a gap the jokers in hand can still cover opens the save
    if (onSave) {
      return (
        <button type="button" className="oj-tile missed savable" style={{ clipPath: torn(cell.day) }} onClick={onSave}>
          <Ink color="ash" mood="asleep" size={34} still />
          {said}
          <span className="oj-tile-save">A joker saves it&nbsp;→</span>
        </button>
      );
    }
    return (
      <div className="oj-tile missed" style={{ clipPath: torn(cell.day) }}>
        <Ink color="ash" mood="asleep" size={34} still />
        {said}
      </div>
    );
  }
  const e = cell.entry!;
  const all = lines(e.text);
  return (
    <button type="button" className={`oj-tile ${tone(cell.day)}`} data-j={colorOf(cell.day)} style={{ ['--tilt' as string]: `${i % 2 ? 0.8 : -0.8}deg`, clipPath: torn(cell.day) }} onClick={onOpen} aria-label={`${longDay(cell.day)}: ${plainText(all[0])}${e.photo ? ' (with a picture)' : ''}`}>
      <span className="oj-tile-date"><b>{parts(cell.day)[2]}</b>{weekday(cell.day)}</span>
      {e.photo && (
        <span className="oj-tile-peek" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.photo} alt="" loading="lazy" />
        </span>
      )}
      {drawn && (
        <span className="oj-tile-blob">
          {e.doodle ? <Doodle svg={e.doodle} alt={e.doodle_alt} pen={0.75} boil={e.doodle_register === 'heavy' ? 'off' : 'hover'} /> : <span className="oj-wait">…</span>}
        </span>
      )}
      <span className="oj-tile-text">{plainText(all[0])}</span>
      {all.length > 1 && <span className="oj-tile-more">+{all.length - 1} more</span>}
    </button>
  );
}

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="oj-sheet" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="oj-sheet-in">{children}</div>
    </div>
  );
}

/** A past day, opened from the wall: a jelly card in its colour, its drop on top. */
function DaySheet({ entry, drawn, thoughts, photo, onClose, onRedraw }: { entry: Entry; drawn: boolean; thoughts: Omit<ThoughtsProps, 'day' | 'text'>; photo: PhotoProps; onClose: () => void; onRedraw: () => void }) {
  const c = colorOf(entry.day);
  return (
    <Sheet label={longDay(entry.day)} onClose={onClose}>
      <article className="oj-card" data-j={c}>
        <div className="oj-card-top">
          <span className="oj-chip">{longDay(entry.day)}</span>
          <button type="button" className="oj-x" aria-label="close" onClick={onClose}>×</button>
        </div>
        <div className={`oj-card-num ${tone(entry.day)}`}>{parts(entry.day)[2]}<Ink color={hostOf(c)} size={48} className="oj-card-host" /></div>
        <DayBody day={entry.day} entry={entry} drawn={drawn} thoughts={thoughts} onPhoto={photo.onOpen} />
        <div className="oj-acts">
          {drawn && entry.doodle && <button type="button" className="oj-pill" onClick={onRedraw}><Redo />Redraw</button>}
          <button type="button" className="oj-pill" disabled={photo.busy} onClick={() => photo.onPick(entry.day)}><Clip />{entry.photo ? 'Another picture' : 'Add a picture'}</button>
        </div>
        {photo.err && <p className="oj-err">{photo.err}</p>}
      </article>
    </Sheet>
  );
}

function Redraw({ entry, onKept, onClose }: { entry: Entry; onKept: () => void; onClose: () => void }) {
  const [takes, setTakes] = useState<Drawn[] | null>(null);
  const [pick, setPick] = useState(0);
  const [state, setState] = useState<'drawing' | 'ready' | 'saving'>('drawing');
  const [err, setErr] = useState('');
  const draw = useCallback(async () => {
    setState('drawing'); setErr(''); setTakes(null);
    try {
      const r = await fetch('/api/onething/redraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: entry.id }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? 'The pen slipped. Try again.'); setState('ready'); return; }
      setTakes(j.options as Drawn[]); setPick(Math.min(1, (j.options as Drawn[]).length - 1)); setState('ready');
    } catch { setErr('Network error. Try again.'); setState('ready'); }
  }, [entry.id]);
  useEffect(() => { draw(); }, [draw]);
  async function keep(e: React.MouseEvent) {
    if (!takes?.[pick]) return;
    const r0 = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setState('saving'); setErr('');
    try {
      const r = await fetch('/api/onething/redraw', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: entry.id, svg: takes[pick].svg, alt: takes[pick].alt, whimsy: takes[pick].whimsy === true, register: takes[pick].register }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? 'Could not keep that one.'); setState('ready'); return; }
      splash(r0.left + r0.width / 2, r0.top);
      onKept();
    } catch { setErr('Network error. Try again.'); setState('ready'); }
  }
  const n = takes?.length ?? 3;
  return (
    <Sheet label="redraw the doodle" onClose={onClose}>
      <section className="oj-card oj-redraw" data-j={colorOf(entry.day)}>
        <div className="oj-card-top">
          <span className="oj-chip">{longDay(entry.day)}</span>
          <button type="button" className="oj-x" aria-label="close" onClick={onClose}>×</button>
        </div>
        <h2 className="oj-redraw-h">{state === 'drawing' ? 'Drawing three…' : takes ? `${n === 3 ? 'Three' : n} takes. Pick one.` : 'Redraw'}</h2>
        <p className="oj-sub">{state === 'drawing' ? 'about ten seconds' : 'tap one, then keep it'}</p>
        <div className="oj-takes" role="radiogroup" aria-label="three takes">
          {state === 'drawing' || !takes
            ? [0, 1, 2].map((i) => <div key={i} className="oj-take"><div className="oj-blob">{state === 'drawing' ? <Drawing label="" /> : null}</div></div>)
            : takes.map((t, i) => (
                <button key={i} type="button" role="radio" aria-checked={pick === i} className={`oj-take${pick === i ? ' on' : ''}`} onClick={() => setPick(i)} aria-label={t.alt}>
                  <div className="oj-blob"><Doodle svg={t.svg} alt={t.alt} pen={0.9} boil={pick === i && t.register !== 'heavy' ? 'on' : 'off'} /></div>
                </button>
              ))}
        </div>
        <p className="oj-redraw-sentence">{lines(entry.text)[0]}</p>
        {err && <p className="oj-err">{err}</p>}
        <div className="oj-acts">
          <button type="button" className="oj-btn big" disabled={state !== 'ready' || !takes} onClick={keep}>{state === 'saving' ? 'Keeping…' : 'Keep this one'}</button>
          <button type="button" className="oj-btn ghost" disabled={state !== 'ready'} onClick={draw}>Three more</button>
        </div>
        <p className="oj-redraw-foot"><button type="button" className="oj-text-btn" onClick={onClose}>Keep the old one</button></p>
      </section>
    </Sheet>
  );
}

function Redo() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16 3.5v3.6h-3.6" />
    </svg>
  );
}

// ---------- jokers ----------

const DROP = 'M50 3 C63 29 89 46 89 71 A39 37 0 0 1 11 71 C11 46 37 29 50 3 Z';
const WORD = ['No', 'One', 'Two', 'Three'];
const word = (n: number) => (WORD[n] ?? String(n)).toLowerCase();

function shift(day: string, n: number): string {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function ordinal(day: string): string {
  const n = parts(day)[2];
  return `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}
/// A missed day as people say it: yesterday, a weekday this week, or the date (a week back has today's weekday).
function sayDay(day: string, today: string): string {
  if (day === shift(today, -1)) return 'Yesterday';
  return day > shift(today, -7) ? fmt(day, { weekday: 'long' }) : `${fmt(day, { weekday: 'long' })} the ${ordinal(day)}`;
}
/// How long the offer stands: tonight, tomorrow, or a weekday (never more than six days ahead).
function sayUntil(until: string, today: string): string {
  return until <= today ? 'tonight' : until === shift(today, 1) ? 'tomorrow' : fmt(until, { weekday: 'long' });
}

/** A joker: a playing card whose suit is the ink drop, and in the middle the drop
 *  itself in a jester's cap (two red points and an ink one, a bell on each). */
function Joker({ w = 46, className = '', style }: { w?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`oj-joker ${className}`} style={{ ['--w' as string]: `${w}px`, ...style }} aria-hidden>
      <svg viewBox="0 0 100 140" width={w} height={w * 1.4}>
        <rect x="2.5" y="2.5" width="95" height="135" rx="10" fill="#fffdf7" stroke="#151515" strokeWidth="3" />
        {[0, 180].map((turn) => (
          <g key={turn} transform={`rotate(${turn} 50 70)`}>
            <text x="11" y="30" fill="#151515" style={{ font: '900 24px var(--sans)' }}>J</text>
            <path d={DROP} fill="#d63a20" transform="translate(11.5 35) scale(.12)" />
          </g>
        ))}
        <g transform="translate(27 62) scale(.46)">
          <path d={DROP} fill="#151515" />
          <ellipse cx="40" cy="70" rx="5" ry="5.6" fill="#fffdf7" /><ellipse cx="60" cy="70" rx="5" ry="5.6" fill="#fffdf7" />
          <path d="M43 81 Q50 89 57 81" fill="none" stroke="#fffdf7" strokeWidth="3.4" strokeLinecap="round" />
          <ellipse cx="29" cy="80" rx="6" ry="3.4" fill="#d63a20" /><ellipse cx="71" cy="80" rx="6" ry="3.4" fill="#d63a20" />
        </g>
        <path d="M41 79 C33 73 27 65 24 55 C33 58 43 65 50 75 Z" fill="#d63a20" />
        <path d="M59 79 C67 73 73 65 76 55 C67 58 57 65 50 75 Z" fill="#d63a20" />
        <path d="M44 76 C45 66 47 55 50 44 C53 55 55 66 56 76 Z" fill="#151515" />
        <path d="M39 82 Q50 74 61 82 L60.5 86 Q50 79 39.5 86 Z" fill="#fffdf7" stroke="#151515" strokeWidth="2" strokeLinejoin="round" />
        {[[24, 55], [76, 55], [50, 43]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4.2" fill="#fffdf7" stroke="#151515" strokeWidth="2.2" />)}
      </svg>
    </span>
  );
}

/** The fan of up to three cards: held ones face up, the rest an empty outline. */
function Fan({ held, max, w, dealt = false, up = 0, refs }: { held: number; max: number; w: number; dealt?: boolean; up?: number; refs?: React.MutableRefObject<(HTMLSpanElement | null)[]> }) {
  return (
    <>
      {Array.from({ length: max }, (_, i) => {
        const r = { ['--r' as string]: `${(i - (max - 1) / 2) * 8}deg` };
        if (i >= held) return <span key={`slot-${i}`} className="oj-joker-slot" style={{ ...r, ['--w' as string]: `${w}px` }} />;
        const cls = `${dealt && i === held - 1 ? 'dealt' : ''}${i >= held - up ? ' up' : ''}`;
        return (
          <span key={`card-${i}`} ref={(el) => { if (refs) refs.current[i] = el; }} className="oj-card-slot" style={r}>
            <Joker w={w} className={cls} />
          </span>
        );
      })}
    </>
  );
}

/** Under the level: the hand, how jokers work, and when the next one comes. A tap
 *  makes the cards jig; while a streak can still be saved, a link opens the save. */
function Hand({ jokers, dealt, rescue, onSave }: { jokers: Jokers; dealt: boolean; rescue: Rescue | null; onSave: () => void }) {
  const [jig, setJig] = useState(false);
  const { held, max, nextIn } = jokers;
  return (
    <div className="oj-jokers">
      <div className={`oj-hand${jig ? ' jig' : ''}`} role="img" aria-label={`${held} of ${max} jokers in hand`} onClick={() => { setJig(true); setTimeout(() => setJig(false), 700); }}>
        <Fan held={held} max={max} w={40} dealt={dealt} />
      </div>
      <div className="oj-jokers-text">
        <b>{held === 0 ? 'No jokers yet' : `${WORD[held]} ${held === 1 ? 'joker' : 'jokers'} in hand`}</b>
        <span>A joker covers a day you miss. {nextIn === null ? 'Your hand is full.' : `The next one comes in ${nextIn} ${nextIn === 1 ? 'day' : 'days'}.`}</span>
        {rescue && <button type="button" className="oj-text-btn oj-jokers-save" onClick={onSave}>Save your {rescue.from.streak}-day streak</button>}
      </div>
    </div>
  );
}

/** The note taped to the wall above the pad while a broken streak can still be saved. */
function Slip({ rescue, today, onOpen }: { rescue: Rescue; today: string; onOpen: () => void }) {
  return (
    <button type="button" className="oj-slip" onClick={onOpen}>
      <Joker w={34} />
      <span className="oj-slip-text">
        <b>Your {rescue.from.streak}-day streak is asleep.</b>
        {rescue.cost === 1 ? 'A joker' : `${WORD[rescue.cost]} jokers`} can still wake it, until {sayUntil(rescue.until, today)}.
      </span>
      <span className="oj-slip-go">Save it</span>
    </button>
  );
}

/** The days around the save, as small sheets: kept runs (with the streak at their
 *  end) and the missed days the jokers go into. */
type Seg = { kind: 'kept'; first: string; last: string; was: number; becomes: number } | { kind: 'gap'; day: string; i: number };
function segments(r: Rescue): Seg[] {
  const segs: Seg[] = [{ kind: 'kept', first: r.from.day, last: r.from.day, was: r.from.streak, becomes: r.from.streak }];
  const items = [...r.days.map((day, i) => ({ day, gap: i, a: null })), ...r.after.map((a) => ({ day: a.day, gap: -1, a }))].sort((x, y) => (x.day < y.day ? -1 : 1));
  let open = false; // the last kept run takes the next kept day
  for (const it of items) {
    if (!it.a) { segs.push({ kind: 'gap', day: it.day, i: it.gap }); open = false; continue; }
    const last = segs[segs.length - 1];
    if (open && last.kind === 'kept') Object.assign(last, { last: it.day, was: it.a.was, becomes: it.a.becomes });
    else { segs.push({ kind: 'kept', first: it.day, last: it.day, was: it.a.was, becomes: it.a.becomes }); open = true; }
  }
  return segs;
}

/** The save. The streak that broke sits greyed, its drop asleep; the missed days
 *  are empty sheets in a strip; the cards to play are lifted out of the hand.
 *  Playing flies each card into its gap, the drop wakes, the number climbs to
 *  the streak as it now stands, and the wall underneath reloads. */
function RescueSheet({ r, today, onSaved, onStale, onClose }: { r: Rescue; today: string; onSaved: () => void; onStale: () => void; onClose: () => void }) {
  const [state, setState] = useState<'offer' | 'busy' | 'flying' | 'saved'>('offer');
  const [err, setErr] = useState('');
  const [shown, setShown] = useState(r.from.streak);
  const cards = useRef<(HTMLSpanElement | null)[]>([]);
  const slots = useRef<(HTMLSpanElement | null)[]>([]);
  const segs = segments(r);
  const saved = state === 'saved';
  const tenth = r.after.find((a) => a.becomes % 10 === 0 && a.was % 10 !== 0)?.becomes;

  // the number climbs from the streak that broke to the streak as it now stands
  useEffect(() => {
    if (!saved || r.now === r.from.streak) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setShown(Math.round(r.from.streak + (r.now - r.from.streak) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [saved, r.now, r.from.streak]);

  async function play() {
    setState('busy'); setErr('');
    try {
      const res = await fetch('/api/onething/joker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: r.days }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? 'The joker would not play. Try again.'); setState('offer');
        if (res.status === 409) onStale();
        return;
      }
    } catch { setErr('Network error. Try again.'); setState('offer'); return; }
    setState('flying');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await Promise.all(r.days.map((_, i) => {
      const card = cards.current[r.held - r.cost + i];
      const slot = slots.current[i];
      if (still || !card || !slot) return null;
      const a = card.getBoundingClientRect(), b = slot.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const s = (b.width * 0.78) / a.width;
      const from = getComputedStyle(card).transform;
      return card.animate([
        { transform: from === 'none' ? 'none' : from },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 80}px) rotate(-16deg) scale(1.1)`, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) rotate(-5deg) scale(${s})` },
      ], { duration: 700, delay: i * 180, easing: 'cubic-bezier(.35,.7,.3,1)', fill: 'forwards' }).finished;
    }));
    setState('saved');
    for (const el of slots.current) {
      if (!el) continue;
      const b = el.getBoundingClientRect();
      splash(b.left + b.width / 2, b.top + b.height / 2, 22);
    }
    onSaved();
  }

  const one = r.cost === 1;
  const slipped = one ? `${sayDay(r.days[0], today)} slipped by.` : `${WORD[r.cost]} days slipped by.`;
  return (
    <Sheet label="save the streak" onClose={onClose}>
      <section className={`oj-card oj-rescue${saved ? ' is-saved' : ''}`}>
        <div className="oj-card-top">
          <span className="oj-chip">{saved ? 'Saved' : 'Save the streak'}</span>
          <button type="button" className="oj-x" aria-label="close" onClick={onClose}>×</button>
        </div>
        <div className={`oj-rescue-num${saved ? '' : ' asleep'}`} aria-live="polite">
          <span>{shown}</span>
          <Ink color="violet" size={46} mood={saved ? 'happy' : 'asleep'} still={!saved} className={`oj-rescue-ink${saved ? ' oj-wake' : ''}`} />
        </div>
        <p className="oj-rescue-k">day streak</p>
        <h2 className="oj-rescue-h">{saved ? 'Saved.' : slipped}</h2>
        <p className="oj-p oj-rescue-p">
          {saved
            ? <>{r.after.length ? `Day ${r.now}, and counting.` : `${r.now} days, still going. Today makes ${r.now + 1}.`}{tenth ? ` Day ${tenth} dealt you a fresh joker on the way.` : ''}</>
            : <>Your {r.from.streak}-day streak broke there. {one ? 'A joker covers it' : `${WORD[r.cost]} jokers cover them`}, and it {r.after.length ? `carries on at ${r.now}` : `holds: today makes ${r.now + 1}`}.</>}
        </p>

        <div className="oj-strip" aria-label="the days around the gap">
          {segs.map((g) => g.kind === 'gap' ? (
            <span key={g.day} ref={(el) => { slots.current[g.i] = el; }} className={`oj-strip-gap${saved ? ' filled' : ''}`}>
              <small>{weekday(g.day)} {parts(g.day)[2]}</small>
              {saved ? <Joker w={32} className="landed" /> : <Ink color="ash" mood="asleep" size={26} still />}
              <small>{saved ? 'covered' : 'missed'}</small>
            </span>
          ) : (
            <span key={g.first} className="oj-strip-sheet">
              <small>{g.first === g.last ? `${weekday(g.first)} ${parts(g.first)[2]}` : `${parts(g.first)[2]}–${parts(g.last)[2]}`}</small>
              <b className={saved && g.becomes !== g.was ? 'up' : ''}>{saved ? g.becomes : g.was}</b>
              <small>{(saved ? g.becomes : g.was) === 1 ? 'day' : 'days'}</small>
            </span>
          ))}
        </div>

        <div className="oj-rescue-hand">
          {saved
            ? <Fan key="after" held={r.left} max={3} w={52} dealt={r.deals > 0} />
            : <Fan key="before" held={r.held} max={3} w={52} up={r.cost} refs={cards} />}
        </div>

        {saved ? (
          <div className="oj-acts">
            <button type="button" className="oj-btn big" onClick={onClose}>Back to your page</button>
          </div>
        ) : (
          <>
            <div className="oj-acts">
              <button type="button" className="oj-btn big oj-play" disabled={state !== 'offer'} onClick={play}>
                {state === 'offer' ? (one ? 'Play the joker' : `Play ${word(r.cost)} jokers`) : 'Playing…'}
              </button>
            </div>
            <p className="oj-note">You hold {word(r.held)}. This stays open until {sayUntil(r.until, today)}. <button type="button" className="oj-text-btn quiet" onClick={onClose}>Not now</button></p>
          </>
        )}
        {err && <p className="oj-err">{err}</p>}
      </section>
    </Sheet>
  );
}

/// "76 pages left in 2026": the days after today on this year's pad.
function pagesLeft(today: string): string {
  const [y, m, d] = parts(today);
  const n = Math.round((Date.UTC(y, 11, 31) - Date.UTC(y, m - 1, d)) / 86400000);
  return n === 0 ? `the last page of ${y}` : `${n} ${n === 1 ? 'page' : 'pages'} left in ${y}`;
}

function prettyPhone(p: string): string {
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}

/** The browser bar takes the wall's colour, so the page runs right up under it. */
function useFlood(c: Color | null) {
  useEffect(() => {
    if (!c) return;
    const v = WALL;
    let tag = document.querySelector('meta[name="theme-color"]');
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name', 'theme-color'); document.head.appendChild(tag); }
    tag.setAttribute('content', v);
    document.documentElement.style.setProperty('--oj-top', v);
  }, [c]);
}

function Foot({ tz }: { tz?: string }) {
  return (
    <footer className="oj-foot">
      {tz !== undefined && <p>Texts come at ten in the morning, and at ten at night if the day is still empty{tz ? ` (${tz.replace(/_/g, ' ')} time)` : ''}. Reply to either, or start any text with <code>1:</code>.</p>}
      <p>made with care by <a href="https://www.decremental.com" target="_blank" rel="noopener">Bart</a></p>
    </footer>
  );
}

// ---------- the landing page ----------

/** Three sample days for the landing page, from the real September examples. */
const SAMPLES = [{ ex: 1, day: '2026-09-30' }, { ex: 0, day: '2026-09-29' }, { ex: 2, day: '2026-09-28' }];

function SampleSheet({ i, className = '', onEnd }: { i: number; className?: string; onEnd?: () => void }) {
  const s = SAMPLES[i % SAMPLES.length];
  const e = EXAMPLES[s.ex];
  return (
    <div className={`oj-today oj-sample ${tone(s.day)} ${className}`} onAnimationEnd={(ev) => { if (ev.target === ev.currentTarget) onEnd?.(); }}>
      <div className="oj-sheet-top"><span>{monthYear(s.day)}</span><span className="wd">{weekdayLong(s.day)}</span></div>
      <div className="oj-num"><span>{parts(s.day)[2]}</span></div>
      <div className="oj-blob"><Doodle svg={e.svg} alt={e.alt} pen={1.2} /></div>
      <p className="oj-sample-text">{e.sentence}</p>
    </div>
  );
}

/** The landing's pad: a tap tears the top sheet off and shows the day before. */
function SamplePad() {
  const [i, setI] = useState(0);
  const [tearing, setTearing] = useState(false);
  const tear = () => { if (!tearing) setTearing(true); };
  return (
    <div
      className="oj-pad sample" role="button" tabIndex={0} aria-label="Tear off this page to see another day"
      onClick={tear} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tear(); } }}
    >
      <span className="oj-binding" aria-hidden><i /><i /></span>
      <div className="oj-sheets" aria-hidden>
        <SampleSheet i={i + 1} className="under" />
        <SampleSheet key={i} i={i} className={tearing ? 'tearing' : ''} onEnd={() => { setTearing(false); setI((x) => x + 1); }} />
      </div>
      <span className="oj-stack" aria-hidden />
    </div>
  );
}

function Landing(props: {
  phone: string; code: string; stage: 'phone' | 'code'; busy: boolean; err: string;
  setPhone: (s: string) => void; setCode: (s: string) => void; start: () => void; verify: () => void; back: () => void;
}) {
  const { phone, code, stage, busy, err } = props;
  useFlood('violet');
  const toStart = () => document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return (
    <>
      <header className="oj-hero land" data-j="violet">
        <div className="oj-wrap">
          <div className="oj-top">
            <h1 className="oj-wordmark">onething<i>.</i></h1>
            <button type="button" className="oj-text-btn" onClick={toStart}>Sign in</button>
          </div>
          <SamplePad />
          <p className="oj-left">tap the page to tear back a day</p>
          <h2 className="oj-q big">One sentence a day. A doodle for every one.</h2>
          <p className="oj-lede">A one-sentence-a-day journal that lives in your texts.</p>
          <div className="oj-acts">
            <button type="button" className="oj-btn big" data-j="yellow" onClick={toStart}>Start your year</button>
          </div>
        </div>
      </header>

      <main className="oj-page land">
        <section className="oj-card oj-start" data-j="violet" id="start">
          <h2 className="oj-redraw-h">Start your year.</h2>
          {stage === 'phone' ? (
            <form className="oj-form" onSubmit={(e) => { e.preventDefault(); props.start(); }}>
              <input className="oj-in" inputMode="tel" autoComplete="tel" placeholder="Phone number" aria-label="Phone number" value={phone} onChange={(e) => props.setPhone(e.target.value)} />
              <button className="oj-btn" data-j="yellow" disabled={busy} type="submit">{busy ? 'Sending…' : 'Text me a code'}</button>
            </form>
          ) : (
            <form className="oj-form" onSubmit={(e) => { e.preventDefault(); props.verify(); }}>
              <input className="oj-in code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code" value={code} onChange={(e) => props.setCode(e.target.value)} autoFocus />
              <button className="oj-btn" data-j="yellow" disabled={busy} type="submit">{busy ? 'Checking…' : 'Sign in'}</button>
            </form>
          )}
          {stage === 'code' && <p className="oj-note">We texted a code to {phone}. <button type="button" className="oj-text-btn" onClick={props.back}>Wrong number?</button></p>}
          {err && <p className="oj-err">{err}</p>}
          <p className="oj-note">iMessage only. No password, nothing to install.</p>
        </section>

        <Foot />
      </main>
    </>
  );
}

// ---------- the page ----------

export default function Onething() {
  const [me, setMe] = useState<Me | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [question] = useState(() => QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ day: string; index: number } | null>(null);
  const [editText, setEditText] = useState('');
  const [view, setView] = useState<'journal' | 'settings'>('journal');
  const [monthsBack, setMonthsBack] = useState<number | null>(null); // null: this month, or last month while this one is still empty
  const [details, setDetails] = useState(false); // the numbers behind the level, on request
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [you, setYou] = useState<{ err: string; note: string }>({ err: '', note: '' });
  const [inviteTo, setInviteTo] = useState('');
  const [ending, setEnding] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [payoff, setPayoff] = useState<{ streak: number; bonus: number; points: number } | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null); // a past day, opened from the wall
  const [redraw, setRedraw] = useState<string | null>(null); // the day whose doodle is being redrawn
  const [photoOpen, setPhotoOpen] = useState<string | null>(null); // the day whose picture is shown big
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  const photoDay = useRef<string>(''); // the day the file picker was opened for
  const [rescueOpen, setRescueOpen] = useState<Rescue | null>(null); // the save, as offered when it opened
  const [dealt, setDealt] = useState(false); // today dealt a joker: the newest card deals itself in, once

  const load = useCallback(async () => {
    const r = await fetch('/api/onething/me', { cache: 'no-store' });
    const m = (await r.json()) as Me;
    setMe(m);
    return m;
  }, []);
  useEffect(() => { load(); }, [load]);
  // A milestone day (streak 3, 7, 14, 30, 60, 100, 365) plays the payoff scene once per
  // browser: on the visit the kept text links to, or right after the sentence is saved
  // here. The key is written as it opens, so a reload doesn't play it twice. A save in
  // progress goes first; a save that lands today on a milestone plays it after.
  useEffect(() => {
    const m = todayMilestone(me);
    if (!m || rescueOpen) return;
    const key = `onething:payoff:${m.day}:${m.streak}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { return; }
    setPayoff(m);
  }, [me, rescueOpen]);
  // A streak the jokers in hand can still save opens the save once per offer per browser;
  // after that the note above the pad and the hand keep it one tap away.
  useEffect(() => {
    const r = me?.rescue;
    if (!r) return;
    const key = `onething:rescue:${r.days.join(',')}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { return; }
    setRescueOpen(r);
  }, [me]);
  // The day a tenth sentence deals a joker, the new card deals itself into the hand once.
  useEffect(() => {
    const t = me?.entries?.find((e) => e.day === me.today);
    if (!t || t.streak % 10 !== 0 || !me?.jokers?.held) return;
    const key = `onething:dealt:${t.day}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { return; }
    setDealt(true);
  }, [me]);
  useFlood(me?.user && me.today ? colorOf(me.today) : null);

  async function post(url: string, body: unknown) {
    setBusy(true); setErr('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? 'Something went wrong.'); return null; }
      return j;
    } catch { setErr('Network error. Try again.'); return null; }
    finally { setBusy(false); }
  }
  async function start() {
    const j = await post('/api/onething/auth/start', { phone, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: navigator.language }); // zone + language place a number typed without its country code
    if (j) { if (j.phone) setPhone(j.phone); setStage('code'); } // show the number as we read it, country code included
  }
  async function verify() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // the 10am / 10pm texts follow this clock
    if (await post('/api/onething/auth/verify', { phone, code, tz })) { setCode(''); setStage('phone'); await load(); }
  }
  async function save() {
    const r0 = keepRef.current?.getBoundingClientRect();
    if (await post('/api/onething/entry', { text })) {
      if (r0) splash(r0.left + r0.width / 2, r0.top + r0.height / 2, 56);
      setText(''); setAdding(false); await load(); awaitDoodle();
    }
  }
  /// The drawing lands a few seconds after the sentence: look again, a few times, until today has one.
  function awaitDoodle() {
    let tries = 0;
    const tick = async () => {
      const r = await fetch('/api/onething/me', { cache: 'no-store' });
      const m = (await r.json()) as Me;
      setMe(m);
      const t = m.entries?.find((e) => e.day === m.today);
      if (m.user?.doodles === false || t?.doodle || ++tries >= 8) return;
      setTimeout(tick, 4000);
    };
    setTimeout(tick, 5000);
  }
  async function setDoodles(on: boolean) {
    setMe((m) => (m && m.user ? { ...m, user: { ...m.user, doodles: on } } : m)); // flip at once; the save follows
    setBusy(true); setYou({ err: '', note: '' });
    try {
      const r = await fetch('/api/onething/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doodles: on }) });
      if (!r.ok) setYou({ err: 'Could not save that.', note: '' });
      await load(); // the server's word either way: a failed save flips the box back
    } catch { setYou({ err: 'Network error. Try again.', note: '' }); await load(); }
    finally { setBusy(false); }
  }
  /// Play a milestone's scene again: at the points the day actually had, or as a run of that length would.
  function replay(streak: number) {
    const at = (me?.entries ?? []).find((e) => e.streak === streak);
    setPayoff({ streak, bonus: MILESTONES[streak] ?? 0, points: at ? at.points : pointsAfterRun(streak) });
  }
  async function saveEdit() {
    if (!editing) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/onething/entry', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editing, text: editText }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? 'Something went wrong.'); return; }
      setEditing(null); setEditText('');
      await load(); awaitDoodle();
    } catch { setErr('Network error. Try again.'); }
    finally { setBusy(false); }
  }
  function startEdit(day: string, index: number, current: string) { setEditing({ day, index }); setEditText(current); setErr(''); }
  /// A picture for a day: scaled down here, posted as JPEG, one per day (a new one replaces it).
  function pickPhoto(day: string) {
    photoDay.current = day; setPhotoErr('');
    if (photoRef.current) { photoRef.current.value = ''; photoRef.current.click(); }
  }
  async function addPhoto(f: File | undefined) {
    const day = photoDay.current;
    if (!f || !day) return;
    setPhotoBusy(true); setPhotoErr('');
    try {
      const blob = await fitJpeg(f);
      const form = new FormData();
      form.set('day', day);
      form.set('file', blob, 'picture.jpg');
      const r = await fetch('/api/onething/photo', { method: 'POST', body: form });
      const j = await r.json();
      if (!r.ok) { setPhotoErr(j.error ?? 'Could not save that picture.'); return; }
      await load();
    } catch (e) { setPhotoErr((e as Error).message || 'Could not read that picture.'); }
    finally { setPhotoBusy(false); }
  }
  async function removePhoto(day: string) {
    setPhotoBusy(true); setPhotoErr('');
    try {
      const r = await fetch(`/api/onething/photo?day=${day}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) { setPhotoErr(j.error ?? 'Could not remove that picture.'); return; }
      setPhotoOpen(null);
      await load();
    } catch { setPhotoErr('Network error. Try again.'); }
    finally { setPhotoBusy(false); }
  }
  async function saveName() {
    setBusy(true); setYou({ err: '', note: '' });
    try {
      const r = await fetch('/api/onething/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nameDraft ?? '' }) });
      if (!r.ok) { setYou({ err: 'Could not save that.', note: '' }); return; }
      await load(); setNameDraft(null); setYou({ err: '', note: 'Saved.' });
    } catch { setYou({ err: 'Network error. Try again.', note: '' }); }
    finally { setBusy(false); }
  }
  async function pickPicture(f: File | undefined) {
    if (!f) return;
    setBusy(true); setYou({ err: '', note: '' });
    try {
      const blob = await squareJpeg(f);
      const fd = new FormData();
      fd.append('file', blob, 'picture.jpg');
      const r = await fetch('/api/onething/avatar', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) { setYou({ err: j.error ?? 'Could not save that picture.', note: '' }); return; }
      await load(); setYou({ err: '', note: 'Picture saved.' });
    } catch (e) { setYou({ err: (e as Error).message || 'Could not read that picture.', note: '' }); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  async function removePicture() {
    setBusy(true); setYou({ err: '', note: '' });
    try {
      const r = await fetch('/api/onething/avatar', { method: 'DELETE' });
      if (!r.ok) { setYou({ err: 'Could not remove that picture.', note: '' }); return; }
      await load(); setYou({ err: '', note: 'Picture removed.' });
    } catch { setYou({ err: 'Network error. Try again.', note: '' }); }
    finally { setBusy(false); }
  }
  async function buddy(body: Record<string, string>) {
    setNote('');
    const j = await post('/api/onething/buddies', body);
    if (j) { setInviteTo(''); setEnding(null); await load(); }
    return j;
  }
  async function signout() {
    await fetch('/api/onething/auth/signout', { method: 'POST' });
    setMe({ user: null }); setView('journal'); setErr(''); setNote('');
  }
  function go(v: 'journal' | 'settings') { setView(v); setErr(''); setNote(''); setYou({ err: '', note: '' }); setEnding(null); setOpenDay(null); window.scrollTo(0, 0); }

  if (me === null) {
    return <div className="oj"><header className="oj-hero" data-j="violet"><div className="oj-wrap"><div className="oj-top"><span className="oj-wordmark">onething<i>.</i></span></div></div></header></div>;
  }

  if (!me.user) {
    return (
      <div className="oj">
        <Defs />
        <Landing
          phone={phone} code={code} stage={stage} busy={busy} err={err}
          setPhone={setPhone} setCode={setCode} start={start} verify={verify}
          back={() => { setStage('phone'); setErr(''); }}
        />
      </div>
    );
  }

  const b = me.board!;
  const milestone = todayMilestone(me);
  const thoughtProps = {
    editing, editText, busy, err,
    onEditText: setEditText, onStart: startEdit, onSave: saveEdit,
    onCancel: () => { setEditing(null); setErr(''); },
  };
  const photoProps: PhotoProps = { busy: photoBusy, err: photoErr, onPick: pickPhoto, onOpen: (d) => { setPhotoErr(''); setPhotoOpen(d); } };
  const entries = me.entries ?? [];
  const today = me.today ?? '';
  const tc = colorOf(today);
  const buddies = me.buddies ?? [];
  const sent = me.sent ?? [];
  const received = me.received ?? [];
  const bonus = me.bonus ?? { every: 7, points: 25 };
  const together = (x: BuddyView) => x.startsTomorrow
    ? 'starts tomorrow'
    : x.streak === 0 ? 'no days together yet' : `${x.streak} ${x.streak === 1 ? 'day' : 'days'} together`;
  const bestNext = (x: BuddyView) => x.startsTomorrow ? '' : `${x.best > x.streak ? `best ${x.best} · ` : ''}next bonus in ${x.nextBonusIn} ${x.nextBonusIn === 1 ? 'day' : 'days'}`;

  if (view === 'settings') {
    return (
      <div className="oj">
        <Defs />
        <header className="oj-hero short" data-j={tc}>
            <div className="oj-wrap">
            <Top me={me.user} streak={b.streak} view={view} onView={go} onSignout={signout} />
            <div className="oj-settings-head">
              <p className="oj-date"><button type="button" className="oj-text-btn" onClick={() => go('journal')}>← Back to your page</button></p>
              <h1 className="oj-q">Settings</h1>
            </div>
          </div>
        </header>
        <main className="oj-page">
          <section className="oj-panel" aria-label="you">
            <h2>You</h2>
            <p className="oj-p">What buddies see instead of your number.</p>
            <div className="oj-you">
              <Avatar person={me.user} size={76} />
              <div className="oj-you-acts">
                <label className="oj-pill small" style={{ cursor: busy ? 'default' : 'pointer' }}>
                  {busy ? 'Saving…' : me.user.avatar ? 'Change picture' : 'Add a picture'}
                  <input ref={fileRef} type="file" accept="image/*" hidden disabled={busy} onChange={(e) => pickPicture(e.target.files?.[0])} aria-label="profile picture" />
                </label>
                {me.user.avatar && <button type="button" className="oj-text-btn quiet" disabled={busy} onClick={removePicture}>Remove</button>}
                <p className="oj-note">A square works best. It is cropped and shrunk before it leaves your phone.</p>
              </div>
            </div>
            <form className="oj-form" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
              <input className="oj-in" placeholder={prettyPhone(me.user.phone)} aria-label="Your name" maxLength={24} value={nameDraft ?? me.user.name ?? ''} onChange={(e) => setNameDraft(e.target.value)} />
              <button className="oj-btn" type="submit" disabled={busy || nameDraft === null}>{busy ? 'Saving…' : 'Save'}</button>
            </form>
            {you.err && <p className="oj-err">{you.err}</p>}
            {you.note && <p className="oj-note">{you.note}</p>}
          </section>

          <section className="oj-panel" aria-label="the page">
            <h2>Your page</h2>
            <label className="oj-toggle">
              <input type="checkbox" checked={me.user.doodles !== false} disabled={busy} onChange={(e) => setDoodles(e.target.checked)} />
              <i aria-hidden />
              <span><b>Doodles.</b> Opus draws a small doodle for every day, from what you wrote.</span>
            </label>
          </section>

          <section className="oj-panel" aria-label="buddies">
            <h2>Buddies</h2>
            <p className="oj-p">Pick anyone. A buddy streak counts a day when you both wrote, a miss by either one resets it, and every {bonus.every} days it holds you both get {bonus.points} points. Your own streak and points are never touched.</p>

            {received.length > 0 && (
              <ul className="oj-buddy-list" aria-label="invites waiting on you">
                {received.map((i) => (
                  <li key={i.id} className="oj-buddy">
                    <span className="who">{i.name} invited you.</span>
                    <span className="acts">
                      <button type="button" className="oj-text-btn" onClick={() => buddy({ action: 'accept', id: i.id })} disabled={busy}>Say yes</button>
                      <button type="button" className="oj-text-btn quiet" onClick={() => buddy({ action: 'cancel', id: i.id })} disabled={busy}>Not now</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {(buddies.length > 0 || sent.length > 0) && (
              <ul className="oj-buddy-list" aria-label="your buddies">
                {buddies.map((x) => (
                  <li key={x.id} className={`oj-buddy${ending === x.id ? ' ending' : ''}`}>
                    <Avatar person={{ name: x.name, phone: x.name, avatar: x.avatar }} size={40} />
                    <span className="who">{x.name}<small>{together(x)}{bestNext(x) ? ` · ${bestNext(x)}` : ''}</small></span>
                    <span className="acts">
                      {ending === x.id ? (
                        <>
                          <span className="oj-note" style={{ margin: 0 }}>Sure?</span>
                          <button type="button" className="oj-text-btn" onClick={() => buddy({ action: 'end', id: x.id })} disabled={busy}>End it</button>
                          <button type="button" className="oj-text-btn quiet" onClick={() => setEnding(null)}>Keep going</button>
                        </>
                      ) : (
                        <button type="button" className="oj-text-btn quiet" onClick={() => setEnding(x.id)}>End</button>
                      )}
                    </span>
                  </li>
                ))}
                {sent.map((i) => (
                  <li key={i.id} className="oj-buddy">
                    <span className="who">{i.name}<small>invited {longDay(i.since.slice(0, 10))} · waiting for a yes</small></span>
                    <span className="acts"><button type="button" className="oj-text-btn quiet" onClick={() => buddy({ action: 'cancel', id: i.id })} disabled={busy}>Cancel</button></span>
                  </li>
                ))}
              </ul>
            )}

            <form className="oj-form" onSubmit={(e) => { e.preventDefault(); buddy({ action: 'invite', to: inviteTo }); }}>
              <input className="oj-in" inputMode="email" autoComplete="off" placeholder="Phone or iCloud email" aria-label="Phone number or iCloud email" value={inviteTo} onChange={(e) => setInviteTo(e.target.value)} />
              <button className="oj-btn" type="submit" disabled={busy || inviteTo.trim().length < 5}>{busy ? 'Sending…' : 'Invite'}</button>
            </form>
            <p className="oj-note">They get one text from us. Nothing changes until they say yes.</p>
            {err && <p className="oj-err">{err}</p>}
            {note && <p className="oj-note">{note}</p>}
          </section>

          <Foot />
        </main>
      </div>
    );
  }

  // ----- the journal -----
  const [ty, tm] = parts(today);
  const [sy, sm] = parts(me.user.since.slice(0, 10));
  const oldest = (ty * 12 + tm) - (sy * 12 + sm); // months back to the account's first month
  const byDay = new Map(entries.map((e) => [e.day, e]));
  const saves = new Set(me.saves ?? []);
  const rescue = me.rescue ?? null;
  const jokers = me.jokers;
  // On the 1st (or any day before this month has a past day) the wall opens on last month.
  const auto = oldest > 0 && monthCells(ty, tm, today, me.user.since, byDay, saves).length === 0 ? 1 : 0;
  const back = Math.min(monthsBack ?? auto, Math.max(0, oldest));
  const [vy, vm] = monthBack(ty, tm, back);
  const cells = monthCells(vy, vm, today, me.user.since, byDay, saves);
  const savable = (c: Cell) => !!rescue && c.missed && rescue.days.some((d) => d >= (c.from ?? c.day) && d <= c.day);
  const todayEntry = byDay.get(today);
  const drawn = me.user.doodles !== false;
  const composing = !todayEntry || adding;
  const span = b.next ? b.next.min - b.level.min : 1;
  const progress = b.next ? Math.min(1, (b.points - b.level.min) / span) : 1;
  const perDay = pointsForEntry(b.streak + 1).base;
  const toNext = daysToNext(b);
  const opened = openDay ? byDay.get(openDay) : undefined;
  const redrawing = redraw ? byDay.get(redraw) : undefined;
  const photoShown = photoOpen ? byDay.get(photoOpen) : undefined;
  const nextLine = !b.next ? 'The top. Nothing left to grow into.'
    : toNext === 0 ? `${b.next.name} with today's sentence`
    : toNext !== null ? `${toNext} ${toNext === 1 ? 'day' : 'days'} to ${b.next.name}` : `${b.next.name} at ${b.next.min} pts`;
  const closeDay = () => { setOpenDay(null); setEditing(null); setErr(''); };
  const openFrom = (d: string) => { setOpenDay(d); setEditing(null); setErr(''); };

  return (
    <div className="oj">
    <Defs />
    {payoff && <Payoff streak={payoff.streak} bonus={payoff.bonus} points={payoff.points} onClose={() => setPayoff(null)} />}
    {opened && !redraw && !photoShown && <DaySheet entry={opened} drawn={drawn} thoughts={thoughtProps} photo={photoProps} onClose={closeDay} onRedraw={() => setRedraw(opened.day)} />}
    {redrawing && <Redraw entry={redrawing} onClose={() => setRedraw(null)} onKept={async () => { setRedraw(null); await load(); }} />}
    {photoShown?.photo && <PhotoSheet entry={photoShown} busy={photoBusy} err={photoErr} onRemove={() => removePhoto(photoShown.day)} onClose={() => setPhotoOpen(null)} />}
    {rescueOpen && (
      <RescueSheet
        key={rescueOpen.days.join()} r={rescueOpen} today={today}
        onSaved={() => { load(); }}
        onStale={async () => { const m = await load(); setRescueOpen(m.rescue ?? null); }}
        onClose={() => setRescueOpen(null)}
      />
    )}
    <input ref={photoRef} type="file" accept="image/*" hidden aria-hidden tabIndex={-1} onChange={(e) => addPhoto(e.target.files?.[0])} />

    {/* today: the top sheet of the pad */}
    <header className="oj-hero" data-j={tc}>
      <div className="oj-wrap">
        <Top me={me.user} streak={b.streak} view={view} onView={go} onSignout={signout} />
        {rescue && <Slip rescue={rescue} today={today} onOpen={() => setRescueOpen(rescue)} />}
        <div className="oj-pad">
        <span className="oj-binding" aria-hidden><i /><i /></span>
        <div className={`oj-today ${tone(today)}`}>
          <div className="oj-sheet-top"><span>{monthYear(today)}</span><span className="wd">{weekdayLong(today)}</span></div>
          <div className="oj-num">
            <span aria-label={longDay(today)}>{parts(today)[2]}</span>
            <Ink color={hostOf(tc)} size={46} className={`oj-host${composing && text.trim().length >= 2 && !busy ? ' eager' : ''}`} />
          </div>
          {todayEntry && <DayBody day={today} entry={todayEntry} drawn={drawn} thoughts={thoughtProps} onPhoto={photoProps.onOpen} />}
          {composing ? (
            <form className="oj-compose" onSubmit={(e) => { e.preventDefault(); save(); }}>
              {!todayEntry && <h1 className="oj-q">{question}</h1>}
              <textarea className="oj-ta" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder={todayEntry ? 'One more thing.' : 'One sentence.'} rows={3} aria-label="today's sentence" autoFocus={adding} />
              <div className="oj-acts">
                <button ref={keepRef} className="oj-btn big" data-j={hostOf(tc)} disabled={busy || text.trim().length < 2} type="submit">{busy ? 'Saving…' : 'OK'}</button>
                {adding && <button type="button" className="oj-text-btn" onClick={() => { setAdding(false); setText(''); setErr(''); }}>Cancel</button>}
              </div>
              {err && !editing && <p className="oj-err">{err}</p>}
            </form>
          ) : (
            <div className="oj-acts">
              <button type="button" className="oj-pill" onClick={() => { setAdding(true); setErr(''); }}>+ Another thought</button>
              <button type="button" className="oj-pill" disabled={photoBusy} onClick={() => pickPhoto(today)}><Clip />{photoBusy ? 'Keeping…' : todayEntry?.photo ? 'Another picture' : 'Add a picture'}</button>
              {drawn && todayEntry?.doodle && <button type="button" className="oj-pill" onClick={() => setRedraw(today)}><Redo />Redraw</button>}
              {milestone && <button type="button" className="oj-pill oj-replay" onClick={() => setPayoff(milestone)}>Replay day {milestone.streak}</button>}
            </div>
          )}
          {photoErr && !photoOpen && !opened && <p className="oj-err">{photoErr}</p>}
        </div>
        <span className="oj-stack" aria-hidden />
        </div>
        <p className="oj-left">{pagesLeft(today)}</p>
      </div>
    </header>

    <main className="oj-page">
      <section className="oj-level" aria-label="level, streak and points">
        <div className="oj-level-row">
          <div className="oj-pot"><Plant level={b.index} size={80} /></div>
          <div className="oj-level-text">
            <h2 className="oj-stage">{b.level.name}</h2>
            <p className="oj-pts"><b>{b.points.toLocaleString('en-US')}</b> points{b.streak === 0 ? ' · write today to start a streak' : ''}</p>
          </div>
          <button type="button" className="oj-info" aria-label="the numbers" aria-expanded={details} aria-controls="oj-details" onClick={() => setDetails((d) => !d)}>{details ? '×' : 'i'}</button>
        </div>
        <div className="oj-tube" style={{ ['--w' as string]: `${Math.max(progress * 100, 9)}%` }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={b.next ? `progress to ${b.next.name}` : 'progress'}>
          <i />
          <Ink color="violet" size={24} className="oj-rider" />
        </div>
        <p className="oj-tube-k">{nextLine}</p>
        {jokers && <Hand jokers={jokers} dealt={dealt} rescue={rescue} onSave={() => rescue && setRescueOpen(rescue)} />}
        {details && (
          <div className="oj-details" id="oj-details">
            <p><b>+{perDay}</b> for tomorrow&apos;s sentence{b.best > b.streak ? ` · best streak ${b.best}` : ''}</p>
            <div className="oj-dots" aria-label="replay a milestone">
              {Object.keys(MILESTONES).map(Number).map((m) => (
                <button key={m} type="button" className={`oj-dot${b.best >= m ? ' on' : ''}`} title={b.best >= m ? `replay day ${m}` : `day ${m}, not yet`} onClick={() => replay(m)}>{m}</button>
              ))}
            </div>
            {buddies.length > 0 && (
              <ul className="oj-buddies" aria-label="buddy streaks">
                {buddies.map((x) => (
                  <li key={x.id}>
                    <Avatar person={{ name: x.name, phone: x.name, avatar: x.avatar }} size={26} />
                    <span><b>{x.name}</b> · {together(x)}{x.startsTomorrow ? '' : ` · +${bonus.points} in ${x.nextBonusIn} ${x.nextBonusIn === 1 ? 'day' : 'days'} · ${x.inToday ? 'wrote today ✓' : 'still to come'}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="oj-month" aria-label={`${MONTHS[vm - 1]} ${vy}`}>
        <div className="oj-month-head">
          <h2>{MONTHS[vm - 1]} <span>{vy}</span></h2>
          <div className="oj-month-nav">
            <button type="button" className="oj-round" disabled={back >= oldest} aria-label="previous month" onClick={() => setMonthsBack(back + 1)}>‹</button>
            <button type="button" className="oj-round" disabled={back <= 0} aria-label="next month" onClick={() => setMonthsBack(back - 1)}>›</button>
          </div>
        </div>

        {cells.length === 0 ? (
          <p className="oj-empty">{back === 0 ? `The rest of ${MONTHS[vm - 1]} fills in here, a drop a day.` : 'Nothing kept this month.'}</p>
        ) : (
          <div className="oj-wall">
            {cells.map((c, i) => <Tile key={c.day} cell={c} i={i} drawn={drawn} onOpen={() => openFrom(c.day)} onSave={savable(c) ? () => setRescueOpen(rescue) : undefined} />)}
          </div>
        )}
      </section>

      <Foot tz={me.user.tz ?? ''} />
    </main>
    </div>
  );
}
