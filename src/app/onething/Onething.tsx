'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MILESTONES, pointsAfterRun, pointsForEntry, type Level } from '@/lib/onething/levels';
import { EXAMPLES } from '@/lib/onething/examples';
import Plant from './Plant';
import Payoff from './Payoff';
import Doodle from './Doodle';
import { squareJpeg } from './picture';

/* onething, the jelly journal (2026-10-02). Drawn with the craft of the Dodo
 * redesign — glossy jelly, squash and stretch, a lot of colour — with
 * onething's own cast: the ink drop is the character, the six day colours are
 * the palette, today's colour floods the top of the page, and every kept day
 * is a drop of ink in the month's jar. Styles: journal.css (.oj-*), plus
 * onething.css for the doodles, the plant and the payoff scene. */

type Entry = { id: string; day: string; text: string; streak: number; points: number; doodle?: string | null; doodle_alt?: string | null };
type Board = { points: number; streak: number; best: number; doneToday: boolean; level: Level; next: Level | null; index: number };
type BuddyView = { id: string; name: string; avatar: string | null; streak: number; best: number; inToday: boolean; nextBonusIn: number; startsTomorrow: boolean };
type InviteView = { id: string; name: string; since: string };
type Person = { phone: string; since: string; tz?: string; name?: string | null; avatar?: string | null; doodles?: boolean };
type Me = {
  user: Person | null;
  today?: string; board?: Board; entries?: Entry[]; levels?: Level[];
  buddies?: BuddyView[]; sent?: InviteView[]; received?: InviteView[]; bonus?: { every: number; points: number };
};
type Drawn = { svg: string; alt: string; word: string | null };

const NUDGES = [
  'Something small that worked.',
  'Something you noticed that nobody else did.',
  'The best ten minutes.',
  'A thing you changed your mind about.',
  'Who you talked to, and one line they said.',
  'A thing you finished. Or started.',
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/// onething's six day colours (the 1st is violet, the 2nd orange, …), as jelly: light, base, deep.
const COLORS = ['violet', 'orange', 'sky', 'yellow', 'pink', 'lime'] as const;
type Color = (typeof COLORS)[number] | 'ash';
const INK: Record<Color, [string, string, string]> = {
  violet: ['#ddd0ff', '#7b4dff', '#4a1fc4'],
  orange: ['#ffd6b5', '#ff7a2f', '#cf4805'],
  sky: ['#cdeeff', '#33b6ff', '#0872b5'],
  yellow: ['#fff4bd', '#ffd23f', '#d39300'],
  pink: ['#ffd3e8', '#ff5fa8', '#c92170'],
  lime: ['#e6f9c8', '#93d94e', '#4a9419'],
  ash: ['#f4f0f7', '#cdc4d8', '#958aa6'],
};
/// The drop that hosts a day sits on a colour that isn't its own: violet, the brand ink, unless the day is violet.
const hostOf = (c: Color): Color => (c === 'violet' ? 'yellow' : 'violet');

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
/// A small seeded random: the jar's drops sit still between renders.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

type Cell = { day: string; entry?: Entry; missed: boolean; from?: string; count?: number };
function monthCells(y: number, m: number, today: string, since: string, byDay: Map<string, Entry>): Cell[] {
  const [ty, tm, td] = parts(today);
  const last = y === ty && m === tm ? td - 1 : daysInMonth(y, m);
  const sinceDay = since.slice(0, 10);
  const cells: Cell[] = [];
  for (let d = last; d >= 1; d--) {
    const day = ymd(y, m, d);
    const entry = byDay.get(day);
    if (entry) cells.push({ day, entry, missed: false });
    else if (day >= sinceDay) {
      const prev = cells[cells.length - 1];
      if (prev?.missed) { prev.from = day; prev.count = (prev.count ?? 1) + 1; }
      else cells.push({ day, missed: true, count: 1 });
    }
  }
  return cells;
}

// ---------- the splash ----------

/** A splash of jelly ink from a point on the screen: round drops in the six colours, falling. */
function splash(x: number, y: number, n = 40) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'oj-splash';
  document.body.appendChild(layer);
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const [l, b] = INK[COLORS[i % COLORS.length]];
    const size = 7 + Math.random() * 11;
    s.style.width = s.style.height = `${size}px`;
    s.style.background = `radial-gradient(circle at 35% 30%, ${l} 0 22%, ${b} 60%)`;
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

/** The ink drop, as jelly: onething's character. A tap squishes it (> < eyes) and splashes.
 * `mood` asleep closes its eyes (a missed day). */
function Ink({ color, size, className = '', mood = 'happy', onTap, label, delay = 0, still }: {
  color: Color; size: number; className?: string; mood?: 'happy' | 'asleep'; onTap?: () => void; label?: string; delay?: number; still?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const [squish, setSquish] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [l, b, d] = INK[color];
  function poke(e: React.PointerEvent) {
    e.stopPropagation();
    setSquish(true);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setSquish(false), 440);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    splash(r.left + r.width / 2, r.top + r.height * 0.45, Math.round(10 + size / 8));
  }
  const ink = '#2a1f2b';
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
      <circle cx="41.8" cy="67.8" r="1.9" fill="#fff" /><circle cx="61.8" cy="67.8" r="1.9" fill="#fff" />
    </g>
  );
  const mouth = squish
    ? <ellipse cx="50" cy="83" rx="4.4" ry="5" fill="#7a1f3d" />
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
        <defs>
          <radialGradient id={`g${id}`} cx="38%" cy="46%" r="70%">
            <stop offset="0" stopColor={l} /><stop offset=".52" stopColor={b} /><stop offset="1" stopColor={d} />
          </radialGradient>
          <radialGradient id={`h${id}`} cx="50%" cy="100%" r="60%">
            <stop offset="0" stopColor={l} stopOpacity=".75" /><stop offset="1" stopColor={l} stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M50 3 C63 29 89 46 89 71 A39 37 0 0 1 11 71 C11 46 37 29 50 3 Z" fill={`url(#g${id})`} stroke={d} strokeOpacity=".55" strokeWidth="2.4" />
        <ellipse cx="50" cy="96" rx="26" ry="10" fill={`url(#h${id})`} />
        <ellipse cx="33" cy="52" rx="7" ry="14.5" transform="rotate(28 33 52)" fill="#fff" opacity=".82" />
        <circle cx="27" cy="75" r="3" fill="#fff" opacity=".55" />
        {eyes}
        {mouth}
        <ellipse cx="29" cy="80" rx="6.5" ry="3.6" fill="#ff5a82" opacity=".38" /><ellipse cx="71" cy="80" rx="6.5" ry="3.6" fill="#ff5a82" opacity=".38" />
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

function Flame() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <path d="M10 1.5c.6 3.2 4.8 5 4.8 9.6A4.8 4.8 0 0 1 5.2 11c0-2.2 1.1-3.4 2.2-4.4.1 1.6.8 2.6 1.7 2.9C8.8 6.6 9 4 10 1.5Z" fill="#ff5a1f" />
      <path d="M10 9.5c.4 1.4 2.2 2.2 2.2 4.2a2.2 2.2 0 0 1-4.4 0c0-1.1.6-1.7 1.1-2.2.1.6.4 1 .7 1.1-.1-1 .1-2 .4-3.1Z" fill="#fff3a8" />
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
      <a className="oj-wordmark" href="/onething">onething</a>
      <div className="oj-top-right" ref={ref}>
        <span className="oj-streak" aria-label={`${streak}-day streak`} title={`${streak}-day streak`}><Flame />{streak}</span>
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
              {t}
              <button type="button" className="oj-edit" onClick={() => onStart(day, i, t)} aria-label={`edit thought ${i + 1}`}>edit</button>
            </p>
          )}
        </li>
      ))}
    </ol>
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
function DayBody({ day, entry, drawn, thoughts }: { day: string; entry: Entry; drawn: boolean; thoughts: Omit<ThoughtsProps, 'day' | 'text'> }) {
  return (
    <>
      {drawn && (
        <div className="oj-blob">
          {entry.doodle ? <Doodle svg={entry.doodle} alt={entry.doodle_alt} pen={1.4} /> : <Drawing />}
        </div>
      )}
      <div className={`oj-said ${sizeFor(entry.text)}`}><Thoughts day={day} text={entry.text} {...thoughts} /></div>
    </>
  );
}

/** A day on the month's wall: a jelly tile in the day's colour. */
function Tile({ cell, drawn, i, onOpen }: { cell: Cell; drawn: boolean; i: number; onOpen: () => void }) {
  if (cell.missed) {
    const n = cell.count ?? 1;
    return (
      <div className="oj-tile missed">
        <Ink color="ash" mood="asleep" size={46} still />
        <span className="oj-tile-miss"><b>{cell.from ? `${parts(cell.from)[2]}–${dayMonth(cell.day)}` : dayMonth(cell.day)}</b>{n > 1 ? `${n} days off.` : 'A day off.'} The ink slept in.</span>
      </div>
    );
  }
  const e = cell.entry!;
  const all = lines(e.text);
  return (
    <button type="button" className="oj-tile" data-j={colorOf(cell.day)} style={{ ['--tilt' as string]: `${i % 2 ? 0.8 : -0.8}deg` }} onClick={onOpen} aria-label={`${longDay(cell.day)}: ${all[0]}`}>
      <span className="oj-tile-date"><b>{parts(cell.day)[2]}</b>{weekday(cell.day)}</span>
      {drawn && (
        <span className="oj-tile-blob">
          {e.doodle ? <Doodle svg={e.doodle} alt={e.doodle_alt} pen={0.75} boil="hover" /> : <span className="oj-wait">…</span>}
        </span>
      )}
      <span className="oj-tile-text">{all[0]}</span>
      {all.length > 1 && <span className="oj-tile-more">+{all.length - 1} more</span>}
    </button>
  );
}

/** The month's jar: one drop of ink for every kept day, oldest at the bottom. A tap opens the day. */
function Jar({ days, onOpen }: { days: string[]; onOpen?: (day: string) => void }) {
  // Six to a row (five on odd rows, shifted half a drop), 37px apart, rows 33px apart:
  // a full row spans 14 + 5 × 37 + 46 = 245px of the 255px inside. The jar is sized for a
  // whole month, so it visibly fills: 31 drops are six rows, the top one at 10 + 5 × 33 = 175px,
  // its tip at 175 + 46 × 1.12 ≈ 227px, under a 240px glass.
  const PER = 6, DX = 37, DY = 33, SIZE = 46; // SIZE: the drop's width; it stands 1.12 × as tall
  const r = rng(days.length * 7919 + 13);
  const placed = [] as { day: string; x: number; y: number; rot: number }[];
  let row = 0, col = 0;
  for (const day of days) {
    const per = row % 2 ? PER - 1 : PER;
    placed.push({ day, x: 14 + col * DX + (row % 2 ? DX / 2 : 0) + (r() - 0.5) * 5, y: 10 + row * DY + (r() - 0.5) * 4, rot: (r() - 0.5) * 26 });
    if (++col >= per) { col = 0; row++; }
  }
  const h = 240;
  return (
    <div className="oj-jar" style={{ height: h + 26 }}>
      <span className="oj-jar-lid" />
      <div className="oj-jar-glass" style={{ height: h }}>
        {placed.map((p, i) => (
          <span key={p.day} className="oj-jar-drop" style={{ left: p.x, bottom: p.y, transform: `rotate(${p.rot}deg)`, zIndex: 100 - i }}>
            <Ink color={colorOf(p.day)} size={SIZE} delay={-(i % 6) * 0.5} label={onOpen ? `open ${longDay(p.day)}` : undefined} onTap={onOpen && (() => onOpen(p.day))} />
          </span>
        ))}
      </div>
    </div>
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

/** A past day, opened from the wall or the jar: a jelly card in its colour, its drop on top. */
function DaySheet({ entry, drawn, thoughts, onClose, onRedraw }: { entry: Entry; drawn: boolean; thoughts: Omit<ThoughtsProps, 'day' | 'text'>; onClose: () => void; onRedraw: () => void }) {
  const c = colorOf(entry.day);
  return (
    <Sheet label={longDay(entry.day)} onClose={onClose}>
      <article className="oj-card" data-j={c}>
        <Ink color={hostOf(c)} size={84} className="oj-card-host" />
        <div className="oj-card-top">
          <span className="oj-chip">{longDay(entry.day)}</span>
          <button type="button" className="oj-x" aria-label="close" onClick={onClose}>×</button>
        </div>
        <DayBody day={entry.day} entry={entry} drawn={drawn} thoughts={thoughts} />
        {drawn && entry.doodle && <div className="oj-acts"><button type="button" className="oj-pill" onClick={onRedraw}><Redo />Redraw</button></div>}
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
      const r = await fetch('/api/onething/redraw', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: entry.id, svg: takes[pick].svg, alt: takes[pick].alt }) });
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
                  <div className="oj-blob"><Doodle svg={t.svg} alt={t.alt} pen={0.9} boil={pick === i ? 'on' : 'off'} /></div>
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

/** Big soft jelly bubbles drifting up behind today: the day's colour, lighter. */
function Bubbles() {
  return (
    <div className="oj-bubbles" aria-hidden>
      {[[8, 30, 120, 0], [78, 12, 180, -4], [62, 70, 90, -9], [20, 85, 60, -2], [92, 60, 70, -6], [40, 6, 44, -11]].map(([x, y, s, d], i) => (
        <i key={i} style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}

function prettyPhone(p: string): string {
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}

/** The browser bar takes the flood's colour, so it runs right up under it. */
function useFlood(c: Color | null) {
  useEffect(() => {
    if (!c) return;
    const v = INK[c][1];
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

/** A sample day for the landing page, from one of the real September examples. */
function SampleTile({ ex, day, c, tilt }: { ex: number; day: string; c: Color; tilt: number }) {
  const e = EXAMPLES[ex];
  return (
    <div className="oj-tile sample" data-j={c} style={{ ['--tilt' as string]: `${tilt}deg` }} aria-hidden>
      <span className="oj-tile-date"><b>{day.split(' ')[0]}</b>{day.split(' ')[1]}</span>
      <span className="oj-tile-blob"><Doodle svg={e.svg} alt={e.alt} pen={0.9} /></span>
      <span className="oj-tile-text">{e.sentence}</span>
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
        <Bubbles />
        <div className="oj-wrap">
          <div className="oj-top">
            <h1 className="oj-wordmark">onething</h1>
            <button type="button" className="oj-pill small" onClick={toStart}>Sign in</button>
          </div>
          <div className="oj-today">
            <Ink color="yellow" size={128} className="oj-host" />
            <h2 className="oj-q big">One sentence a day. A doodle for every one.</h2>
            <p className="oj-lede">Every morning at ten, a text asks what happened. You answer in one sentence, Opus doodles it, and by December you have a year.</p>
            <div className="oj-acts">
              <button type="button" className="oj-btn big" data-j="yellow" onClick={toStart}>Start your year</button>
            </div>
          </div>
          <div className="oj-fan">
            <SampleTile ex={2} day="28 Mon" c="orange" tilt={-7} />
            <SampleTile ex={0} day="29 Tue" c="sky" tilt={2} />
            <SampleTile ex={1} day="30 Wed" c="lime" tilt={8} />
          </div>
        </div>
      </header>

      <main className="oj-page land">
        <section className="oj-card oj-start" data-j="violet" id="start">
          <Ink color="yellow" size={88} className="oj-card-host" />
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
  const [nudge, setNudge] = useState(0);
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
  const [openDay, setOpenDay] = useState<string | null>(null); // a past day, opened from the wall or the jar
  const [redraw, setRedraw] = useState<string | null>(null); // the day whose doodle is being redrawn

  const load = useCallback(async () => {
    const r = await fetch('/api/onething/me', { cache: 'no-store' });
    setMe((await r.json()) as Me);
  }, []);
  useEffect(() => { load(); }, [load]);
  // A milestone day (streak 3, 7, 14, 30, 60, 100, 365) plays the payoff scene once per
  // browser: on the visit the kept text links to, or right after the sentence is saved
  // here. The key is written as it opens, so a reload doesn't play it twice.
  useEffect(() => {
    const m = todayMilestone(me);
    if (!m) return;
    const key = `onething:payoff:${m.day}:${m.streak}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { return; }
    setPayoff(m);
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
    return <div className="oj"><header className="oj-hero" data-j="violet"><div className="oj-wrap"><div className="oj-top"><span className="oj-wordmark">onething</span></div></div></header></div>;
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
          <Bubbles />
          <div className="oj-wrap">
            <Top me={me.user} streak={b.streak} view={view} onView={go} onSignout={signout} />
            <div className="oj-today">
              <Ink color={hostOf(tc)} size={92} className="oj-host" />
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
  // On the 1st (or any day before this month has a past day) the wall opens on last month.
  const auto = oldest > 0 && monthCells(ty, tm, today, me.user.since, byDay).length === 0 ? 1 : 0;
  const back = Math.min(monthsBack ?? auto, Math.max(0, oldest));
  const [vy, vm] = monthBack(ty, tm, back);
  const cells = monthCells(vy, vm, today, me.user.since, byDay);
  const todayEntry = byDay.get(today);
  const jar = [...cells.filter((c) => !c.missed).map((c) => c.day), ...(back === 0 && todayEntry ? [today] : [])].sort();
  const drawn = me.user.doodles !== false;
  const composing = !todayEntry || adding;
  const span = b.next ? b.next.min - b.level.min : 1;
  const progress = b.next ? Math.min(1, (b.points - b.level.min) / span) : 1;
  const perDay = pointsForEntry(b.streak + 1).base;
  const toNext = daysToNext(b);
  const opened = openDay ? byDay.get(openDay) : undefined;
  const redrawing = redraw ? byDay.get(redraw) : undefined;
  const nextLine = !b.next ? 'The top. Nothing left to grow into.'
    : toNext === 0 ? `${b.next.name} with today's sentence`
    : toNext !== null ? `${toNext} ${toNext === 1 ? 'day' : 'days'} to ${b.next.name}` : `${b.next.name} at ${b.next.min} pts`;
  const closeDay = () => { setOpenDay(null); setEditing(null); setErr(''); };
  const openFrom = (d: string) => { setOpenDay(d); setEditing(null); setErr(''); };

  return (
    <div className="oj">
    <Defs />
    {payoff && <Payoff streak={payoff.streak} bonus={payoff.bonus} points={payoff.points} onClose={() => setPayoff(null)} />}
    {opened && !redraw && <DaySheet entry={opened} drawn={drawn} thoughts={thoughtProps} onClose={closeDay} onRedraw={() => setRedraw(opened.day)} />}
    {redrawing && <Redraw entry={redrawing} onClose={() => setRedraw(null)} onKept={async () => { setRedraw(null); await load(); }} />}

    {/* today: the whole top of the page in today's colour */}
    <header className="oj-hero" data-j={tc}>
      <Bubbles />
      <div className="oj-wrap">
        <Top me={me.user} streak={b.streak} view={view} onView={go} onSignout={signout} />
        <div className="oj-today">
          <Ink color={hostOf(tc)} size={118} className={`oj-host${composing && text.trim().length >= 2 && !busy ? ' eager' : ''}`} />
          <p className="oj-date">{longDay(today)}</p>
          {todayEntry && <DayBody day={today} entry={todayEntry} drawn={drawn} thoughts={thoughtProps} />}
          {composing ? (
            <form className="oj-compose" onSubmit={(e) => { e.preventDefault(); save(); }}>
              {!todayEntry && <h1 className="oj-q">One thing that happened today?</h1>}
              <textarea className="oj-ta" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder={todayEntry ? 'One more thing.' : 'One sentence.'} rows={3} aria-label="today's sentence" autoFocus={adding} />
              <div className="oj-acts">
                <button ref={keepRef} className="oj-btn big" data-j={hostOf(tc)} disabled={busy || text.trim().length < 2} type="submit">{busy ? 'Keeping…' : 'Keep it'}</button>
                {adding
                  ? <button type="button" className="oj-text-btn" onClick={() => { setAdding(false); setText(''); setErr(''); }}>Cancel</button>
                  : <button type="button" className="oj-nudge" onClick={() => setNudge((n) => (n + 1) % NUDGES.length)} title="another idea">{NUDGES[nudge]}<span aria-hidden>↻</span></button>}
              </div>
              {err && !editing && <p className="oj-err">{err}</p>}
            </form>
          ) : (
            <div className="oj-acts">
              <button type="button" className="oj-pill" onClick={() => { setAdding(true); setErr(''); }}>+ Another thought</button>
              {drawn && todayEntry?.doodle && <button type="button" className="oj-pill" onClick={() => setRedraw(today)}><Redo />Redraw</button>}
              {milestone && <button type="button" className="oj-pill oj-replay" onClick={() => setPayoff(milestone)}>Replay day {milestone.streak}</button>}
            </div>
          )}
        </div>
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
          <Ink color="violet" size={40} className="oj-rider" />
        </div>
        <p className="oj-tube-k">{nextLine}</p>
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

        {jar.length > 0 && (
          <div className="oj-jar-row">
            <Jar days={jar} onOpen={openFrom} />
            <div className="oj-jar-say">
              <p className="oj-jar-n">{jar.length}</p>
              <p className="oj-jar-l">{jar.length === 1 ? 'drop of ink' : 'drops of ink'} in {MONTHS[vm - 1]}</p>
              <p className="oj-jar-sub">Every day you keep is a drop in the jar. Poke one.</p>
            </div>
          </div>
        )}

        {cells.length === 0 ? (
          <p className="oj-empty">{back === 0 ? `The rest of ${MONTHS[vm - 1]} fills in here, a drop a day.` : 'Nothing kept this month.'}</p>
        ) : (
          <div className="oj-wall">
            {cells.map((c, i) => <Tile key={c.day} cell={c} i={i} drawn={drawn} onOpen={() => openFrom(c.day)} />)}
          </div>
        )}
      </section>

      <Foot tz={me.user.tz ?? ''} />
    </main>
    </div>
  );
}
