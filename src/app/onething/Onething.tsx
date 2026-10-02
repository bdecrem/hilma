'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LEVELS, MILESTONES, pointsAfterRun, pointsForEntry, type Level } from '@/lib/onething/levels';
import { EXAMPLES } from '@/lib/onething/examples';
import Plant from './Plant';
import Payoff from './Payoff';
import Doodle from './Doodle';
import copy from '@/lib/onething/copy.json';
import { squareJpeg } from './picture';

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
/// Every day of the month has its colour, in this order: the 1st is violet, the 2nd orange, …
const COLORS = ['violet', 'orange', 'sky', 'yellow', 'pink', 'lime'] as const;
type Color = (typeof COLORS)[number];

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
/// `n` months before (y, m).
function monthBack(y: number, m: number, n: number): [number, number] {
  const i = y * 12 + (m - 1) - n;
  return [Math.floor(i / 12), (i % 12) + 1];
}
function fmt(day: string, o: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' }).replace('Sept', 'Sep');
}
const longDay = (day: string) => fmt(day, { weekday: 'short', day: 'numeric', month: 'short' }); // "Thu 1 Oct"
const cardDay = (day: string) => fmt(day, { day: 'numeric', month: 'short' }); // "30 Sep"
const colorOf = (day: string): Color => COLORS[(parts(day)[2] - 1) % COLORS.length];
function lines(text: string): string[] {
  return text.split('\n').map((t) => t.trim()).filter(Boolean);
}
/// Big words for a short day, smaller for a long one.
function sizeFor(text: string): 'xl' | 'l' | 'm' {
  const n = text.length;
  return n <= 70 ? 'xl' : n <= 150 ? 'l' : 'm';
}
function prettyPhone(p: string): string {
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}
/// What goes in the circle when there is no picture: initials, or the last two digits.
function initials(name: string | null | undefined, phone: string): string {
  const n = (name ?? '').trim();
  if (n) return n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return phone.replace(/\D/g, '').slice(-2) || '·';
}
/// Today's entry, if it landed on a streak milestone: what the payoff scene shows.
function todayMilestone(me: Me | null): { day: string; streak: number; bonus: number; points: number } | null {
  if (!me?.user || !me.today || !me.board?.doneToday) return null;
  const e = me.entries?.find((x) => x.day === me.today);
  const bonus = e ? MILESTONES[e.streak] : undefined;
  return e && bonus ? { day: e.day, streak: e.streak, bonus, points: e.points } : null;
}
/// Days until the next level at one sentence a day from here; 0 = with today's sentence.
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

type Cell = { day: string; entry?: Entry; missed: boolean; from?: string; count?: number };
/// The month's wall, newest first, today left out (it has the big card):
/// kept days, and missed days since the account began.
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
      // a run of missed days is one card: "14 – 22 Sep", not nine grey tiles
      const prev = cells[cells.length - 1];
      if (prev?.missed) { prev.from = day; prev.count = (prev.count ?? 1) + 1; }
      else cells.push({ day, missed: true, count: 1 });
    }
  }
  return cells;
}

// ---------- small pieces ----------

/** Pencil hatching for the plant's leaves, and the three turbulence filters
 * that make every doodle boil (Doodle.tsx). In user units of the doodle's
 * 340×170 canvas: a wobble of a couple of units, over strokes ~25 units long. */
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

/** The ink drop: onething's mark. */
function Drop({ size = 22, face }: { size?: number; face?: boolean }) {
  return (
    <svg className="ot-drop" viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`ot-drop-${size}`} cx="36%" cy="40%" r="70%">
          <stop offset="0" stopColor="#e8dbff" /><stop offset=".5" stopColor="#a77bf2" /><stop offset="1" stopColor="#5a2fb2" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="95" rx="24" ry="3.5" fill="#5a2fb2" opacity=".16" />
      <path d="M50 6 C60 28 82 44 82 64 A32 30 0 0 1 18 64 C18 44 40 28 50 6 Z" fill={`url(#ot-drop-${size})`} />
      <ellipse cx="36" cy="46" rx="6" ry="11" transform="rotate(30 36 46)" fill="#fff" opacity=".7" />
      {face && (
        <>
          <circle cx="40" cy="66" r="3.6" fill="#2a1650" /><circle cx="60" cy="66" r="3.6" fill="#2a1650" />
          <path d="M45 74 Q50 78 55 74" fill="none" stroke="#2a1650" strokeWidth="2.6" strokeLinecap="round" />
          <ellipse cx="32" cy="74" rx="5" ry="3" fill="#ff8fc4" opacity=".7" /><ellipse cx="68" cy="74" rx="5" ry="3" fill="#ff8fc4" opacity=".7" />
        </>
      )}
    </svg>
  );
}

function Wordmark({ h1 }: { h1?: boolean }) {
  const inner = <>onething<Drop size={20} /></>;
  return h1 ? <h1 className="ot-wordmark">{inner}</h1> : <a className="ot-wordmark" href="/onething">{inner}</a>;
}

function Flame() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
      <path d="M10 1.5c.6 3.2 4.8 5 4.8 9.6A4.8 4.8 0 0 1 5.2 11c0-2.2 1.1-3.4 2.2-4.4.1 1.6.8 2.6 1.7 2.9C8.8 6.6 9 4 10 1.5Z" fill="#ff6a1f" />
      <path d="M10 9.5c.4 1.4 2.2 2.2 2.2 4.2a2.2 2.2 0 0 1-4.4 0c0-1.1.6-1.7 1.1-2.2.1.6.4 1 .7 1.1-.1-1 .1-2 .4-3.1Z" fill="#ffd23f" />
    </svg>
  );
}

/** The circle: their picture, or initials. */
function Avatar({ person, size = 28 }: { person: { name?: string | null; phone: string; avatar?: string | null }; size?: number }) {
  return (
    <span className="ot-avatar" style={{ ['--s' as string]: `${size}px` }} aria-hidden={!person.avatar}>
      {person.avatar ? <img src={person.avatar} alt="" /> : initials(person.name, person.phone)}
    </span>
  );
}

/** Signed-in top bar: the wordmark, the streak, and the picture, which opens
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
    <header className="ot-top">
      <Wordmark />
      <div className="ot-top-right" ref={ref}>
        <span className="ot-streak-pill" aria-label={`${streak}-day streak`} title={`${streak}-day streak`}><Flame />{streak}</span>
        <button type="button" className="ot-me" aria-label="menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Avatar person={me} size={36} />
        </button>
        {open && (
          <ul className="ot-menu" role="menu">
            <li><button type="button" role="menuitem" onClick={() => { setOpen(false); onView(view === 'journal' ? 'settings' : 'journal'); }}>{view === 'journal' ? 'Settings' : 'Your page'}</button></li>
            <li><button type="button" role="menuitem" className="quiet" onClick={() => { setOpen(false); onSignout(); }}>Sign out</button></li>
          </ul>
        )}
      </div>
    </header>
  );
}

/** Every thought kept on a day, in order, each one editable in place.
 * A top-level component on purpose: defined inside Onething() it was a new
 * component type on every render, so React remounted the whole list — and the
 * edit textarea — on each keystroke (caret jumping to the end, keyboard flicker). */
type ThoughtsProps = {
  day: string; text: string;
  editing: { day: string; index: number } | null; editText: string; busy: boolean; err: string;
  onEditText: (t: string) => void; onStart: (day: string, index: number, current: string) => void;
  onSave: () => void; onCancel: () => void;
};
function Thoughts({ day, text, editing, editText, busy, err, onEditText, onStart, onSave, onCancel }: ThoughtsProps) {
  const all = lines(text);
  return (
    <ol className="ot-thoughts">
      {all.map((t, i) => (
        <li key={i} className="ot-thought">
          {editing && editing.day === day && editing.index === i ? (
            <form className="ot-editing" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
              <textarea className="ot-ta" value={editText} maxLength={600} onChange={(e) => onEditText(e.target.value)} rows={3} autoFocus aria-label="edit this thought" />
              <div className="ot-acts">
                <button className="ot-btn" type="submit" disabled={busy || editText.trim().length === 1}>{busy ? 'Saving…' : 'Save'}</button>
                <button type="button" className="ot-link" onClick={onCancel}>Cancel</button>
              </div>
              {all.length > 1 && <p className="ot-note">Leave it empty to remove this one.</p>}
              {err && <p className="ot-err">{err}</p>}
            </form>
          ) : (
            <p className="t">
              {t}
              <button type="button" className="ot-edit" onClick={() => onStart(day, i, t)} aria-label={`edit thought ${i + 1}`}>edit</button>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** A pencil scribbling: the drawing is on its way. */
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

/** One day, big: the doodle in its white blob, the date, every thought.
 * Today's card at the top of the page, and the sheet a past day opens into. */
function DayView({ day, entry, today, drawn, thoughts, onClose, children }: {
  day: string; entry?: Entry; today?: boolean; drawn: boolean;
  thoughts: Omit<ThoughtsProps, 'day' | 'text'>; onClose?: () => void; children?: React.ReactNode;
}) {
  const text = entry?.text ?? '';
  return (
    <article className={`ot-day${drawn ? '' : ' plain'}`} data-c={colorOf(day)} aria-label={today ? 'today' : longDay(day)}>
      <div className="ot-day-top">
        <span className="ot-chip">{today ? `Today · ${longDay(day)}` : longDay(day)}</span>
        {onClose && <button type="button" className="ot-x" aria-label="close" onClick={onClose}>×</button>}
      </div>
      {drawn && entry && (
        <figure className="ot-blob-wrap">
          <div className="ot-blob">
            {entry.doodle ? <Doodle svg={entry.doodle} alt={entry.doodle_alt} pen={1.4} /> : <Drawing />}
          </div>
          {entry.doodle && <figcaption className="ot-credit">drawn by Opus 5.5 · low effort</figcaption>}
        </figure>
      )}
      {entry && <div className={`ot-said ${sizeFor(text)}`}><Thoughts day={day} text={text} {...thoughts} /></div>}
      {children}
    </article>
  );
}

/** A day on the month's wall. A tap opens it. */
function DayCard({ cell, drawn, onOpen }: { cell: Cell; drawn: boolean; onOpen: () => void }) {
  if (cell.missed) {
    return (
      <div className="ot-card missed">
        <span className="ot-card-date">{cell.from ? `${parts(cell.from)[2]}–${cardDay(cell.day)}` : cardDay(cell.day)}</span>
        <span className="ot-card-miss">{(cell.count ?? 1) > 1 ? `${cell.count} days off` : 'a day off'}<br />a leaf drooped</span>
      </div>
    );
  }
  const e = cell.entry!;
  const all = lines(e.text);
  return (
    <button type="button" className={`ot-card${drawn ? '' : ' plain'}`} data-c={colorOf(cell.day)} onClick={onOpen} aria-label={`${longDay(cell.day)}: ${all[0]}`}>
      <span className="ot-card-date">{cardDay(cell.day)}</span>
      {drawn && (
        <span className="ot-card-blob">
          {e.doodle ? <Doodle svg={e.doodle} alt={e.doodle_alt} pen={0.75} boil="hover" /> : <span className="ot-card-wait">…</span>}
        </span>
      )}
      <span className="ot-card-text">{all[0]}</span>
      {all.length > 1 && <span className="ot-card-more">+{all.length - 1} more</span>}
    </button>
  );
}

/** A dialog over the page: Escape or the backdrop closes it, the page stops scrolling. */
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
    <div className="ot-sheet" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ot-sheet-in">{children}</div>
    </div>
  );
}

/** Redraw: Opus draws three new takes on the day; the person keeps one, or keeps the old one. */
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
  async function keep() {
    if (!takes?.[pick]) return;
    setState('saving'); setErr('');
    try {
      const r = await fetch('/api/onething/redraw', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: entry.id, svg: takes[pick].svg, alt: takes[pick].alt }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? 'Could not keep that one.'); setState('ready'); return; }
      onKept();
    } catch { setErr('Network error. Try again.'); setState('ready'); }
  }
  const n = takes?.length ?? 3;
  return (
    <Sheet label="redraw the doodle" onClose={onClose}>
      <section className="ot-redraw" data-c={colorOf(entry.day)}>
        <div className="ot-day-top">
          <span className="ot-chip">{longDay(entry.day)}</span>
          <button type="button" className="ot-x" aria-label="close" onClick={onClose}>×</button>
        </div>
        <h2 className="ot-redraw-h">{state === 'drawing' ? 'Opus is drawing three…' : takes ? `Opus drew ${n === 3 ? 'three' : n}. Pick one.` : 'Redraw'}</h2>
        <p className="ot-redraw-sub">{state === 'drawing' ? 'about ten seconds' : 'all on low effort, obviously'}</p>
        <div className="ot-takes" role="radiogroup" aria-label="three takes">
          {state === 'drawing' || !takes
            ? [0, 1, 2].map((i) => <div key={i} className="ot-take"><div className="ot-blob">{state === 'drawing' ? <Drawing label="" /> : null}</div></div>)
            : takes.map((t, i) => (
                <button key={i} type="button" role="radio" aria-checked={pick === i} className={`ot-take${pick === i ? ' on' : ''}`} onClick={() => setPick(i)} aria-label={t.alt}>
                  <div className="ot-blob"><Doodle svg={t.svg} alt={t.alt} pen={0.9} boil={pick === i ? 'on' : 'off'} /></div>
                </button>
              ))}
        </div>
        <p className="ot-redraw-sentence">{lines(entry.text)[0]}</p>
        {err && <p className="ot-err">{err}</p>}
        <div className="ot-redraw-acts">
          <button type="button" className="ot-btn big" disabled={state !== 'ready' || !takes} onClick={keep}>{state === 'saving' ? 'Keeping…' : 'Keep this one'}</button>
          <button type="button" className="ot-btn ghost" disabled={state !== 'ready'} onClick={draw}>Three more</button>
        </div>
        <p className="ot-redraw-foot"><button type="button" className="ot-link" onClick={onClose}>Keep the old one</button></p>
      </section>
    </Sheet>
  );
}

/** The seven stages, left to right, growing. Every other label steps back on a phone. */
function Stages({ levels }: { levels: Level[] }) {
  return (
    <div className="ot-stages" aria-label="levels">
      {levels.map((l, i) => (
        <div key={l.name} className={`ot-stage-item${i % 2 === 1 ? ' quiet' : ''}`} style={{ ['--grow' as string]: 1 + i * 0.22, ['--max' as string]: `${44 + i * 7}px` }}>
          <Plant level={i} size={44 + i * 7} />
          <span className="n">{l.name}</span>
          <span className="p">{i === 0 ? 'day 1' : `${l.min} pts`}</span>
        </div>
      ))}
    </div>
  );
}

function Foot({ tz }: { tz?: string }) {
  return (
    <footer className="ot-foot">
      {tz !== undefined && <p>Texts come at ten in the morning, and at ten at night if the day is still empty{tz ? ` (${tz.replace(/_/g, ' ')} time)` : ''}. Reply to either, or start any text with <code>1:</code>.</p>}
      <p className="ot-sign">made with care by <a href="https://www.decremental.com" target="_blank" rel="noopener">Bart</a></p>
    </footer>
  );
}

// ---------- the landing page ----------

/** A sample day card for the landing page, from one of the real examples. */
function SampleCard({ ex, date, c, tilt }: { ex: number; date: string; c: Color; tilt: number }) {
  const e = EXAMPLES[ex];
  return (
    <div className="ot-card sample" data-c={c} style={{ ['--tilt' as string]: `${tilt}deg` }} aria-hidden>
      <span className="ot-card-date">{date}</span>
      <span className="ot-card-blob"><Doodle svg={e.svg} alt={e.alt} pen={0.9} /></span>
      <span className="ot-card-text">{e.sentence}</span>
    </div>
  );
}

/** What the texts actually look like: the morning question, the answer, the line back. */
function Chat() {
  return (
    <div className="ot-chat" aria-label="an example exchange">
      <div className="ot-chat-head">
        <span className="ot-chat-face"><Drop size={34} face /></span>
        <div><b>onething</b><span>iMessage · 10:00</span></div>
      </div>
      <p className="ot-bubble in">{copy.morning[0]}</p>
      <p className="ot-bubble out">{EXAMPLES[0].sentence}</p>
      <p className="ot-bubble in">{copy.kept[0].replace('{n}', '12')}</p>
    </div>
  );
}

function Landing(props: {
  phone: string; code: string; stage: 'phone' | 'code'; busy: boolean; err: string;
  setPhone: (s: string) => void; setCode: (s: string) => void; start: () => void; verify: () => void; back: () => void;
}) {
  const { phone, code, stage, busy, err } = props;
  const toStart = () => document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return (
    <main className="ot-page land">
      <header className="ot-top">
        <Wordmark h1 />
        <button type="button" className="ot-btn small" onClick={toStart}>Sign in</button>
      </header>

      <section className="ot-hero" data-c="violet">
        <h2 className="ot-hero-h"><span>One sentence a day.</span> <span>A doodle for every one.</span></h2>
        <p className="ot-hero-lede">Every morning at ten, a text asks what happened. You answer in one sentence, Opus draws it, and by December you have a year.</p>
        <button type="button" className="ot-btn big light" onClick={toStart}>Start your year</button>
        <div className="ot-fan">
          <SampleCard ex={2} date="28 Sep" c="orange" tilt={-7} />
          <SampleCard ex={0} date="29 Sep" c="sky" tilt={1} />
          <SampleCard ex={1} date="30 Sep" c="yellow" tilt={8} />
        </div>
      </section>

      <section className="ot-how">
        <div className="ot-how-chat" data-c="yellow"><Chat /></div>
        <ol className="ot-steps">
          <li><b>At ten, a text.</b> One question about your day, by iMessage. Nothing to install.</li>
          <li><b>One sentence back.</b> Whatever comes to you. Small is fine. If the day is still empty at ten at night, one gentle reminder.</li>
          <li><b>It lands on your page.</b> Opus 5.5 doodles every day. Don&apos;t like the drawing? Ask for three more and pick one.</li>
        </ol>
      </section>

      <section className="ot-grow">
        <h2 className="ot-h2">Streaks grow a plant.</h2>
        <p className="ot-p">Every day you write earns points, more the longer the streak runs. Points grow a plant from a seed to old growth, and a missed day never takes them back.</p>
        <Stages levels={LEVELS} />
        <p className="ot-p small">Bring a buddy: every week you both keep it up, you both get bonus points. You never see their words, only that they showed up.</p>
      </section>

      <section className="ot-start" id="start">
        <Drop size={48} face />
        <h2 className="ot-h2">Start your year.</h2>
        {stage === 'phone' ? (
          <form className="ot-form" onSubmit={(e) => { e.preventDefault(); props.start(); }}>
            <input className="ot-in" inputMode="tel" autoComplete="tel" placeholder="Phone number" aria-label="Phone number" value={phone} onChange={(e) => props.setPhone(e.target.value)} />
            <button className="ot-btn" disabled={busy} type="submit">{busy ? 'Sending…' : 'Text me a code'}</button>
          </form>
        ) : (
          <form className="ot-form" onSubmit={(e) => { e.preventDefault(); props.verify(); }}>
            <input className="ot-in code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code" value={code} onChange={(e) => props.setCode(e.target.value)} autoFocus />
            <button className="ot-btn" disabled={busy} type="submit">{busy ? 'Checking…' : 'Sign in'}</button>
          </form>
        )}
        {stage === 'code' && <p className="ot-note">We texted a code to {phone}. <button className="ot-link" onClick={props.back}>Wrong number?</button></p>}
        {err && <p className="ot-err">{err}</p>}
        <p className="ot-note">iMessage only. No password, nothing to install.</p>
      </section>

      <Foot />
    </main>
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
  const [payoff, setPayoff] = useState<{ streak: number; bonus: number; points: number } | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null); // a past day, opened from the wall
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
  async function save() { if (await post('/api/onething/entry', { text })) { setText(''); setAdding(false); await load(); awaitDoodle(); } }
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
  function go(v: 'journal' | 'settings') { setView(v); setErr(''); setNote(''); setYou({ err: '', note: '' }); setEnding(null); setOpenDay(null); }

  if (me === null) {
    return <><Defs /><main className="ot-page"><header className="ot-top"><Wordmark h1 /></header></main></>;
  }

  if (!me.user) {
    return (
      <>
        <Defs />
        <Landing
          phone={phone} code={code} stage={stage} busy={busy} err={err}
          setPhone={setPhone} setCode={setCode} start={start} verify={verify}
          back={() => { setStage('phone'); setErr(''); }}
        />
      </>
    );
  }

  const b = me.board!;
  const levels = me.levels ?? LEVELS;
  const milestone = todayMilestone(me);
  const thoughtProps = {
    editing, editText, busy, err,
    onEditText: setEditText, onStart: startEdit, onSave: saveEdit,
    onCancel: () => { setEditing(null); setErr(''); },
  };
  const entries = me.entries ?? [];
  const today = me.today ?? '';
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
      <>
      <Defs />
      <main className="ot-page">
        <Top me={me.user} streak={b.streak} view={view} onView={go} onSignout={signout} />
        <p className="ot-back"><button className="ot-link" onClick={() => go('journal')}>← Back to your page</button></p>

        <section className="ot-panel" aria-label="you">
          <h2>You</h2>
          <p className="ot-p">What buddies see instead of your number.</p>
          <div className="ot-you">
            <Avatar person={me.user} size={72} />
            <div className="ot-you-acts">
              <label className="ot-link" style={{ cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Saving…' : me.user.avatar ? 'Change picture' : 'Add a picture'}
                <input ref={fileRef} type="file" accept="image/*" hidden disabled={busy} onChange={(e) => pickPicture(e.target.files?.[0])} aria-label="profile picture" />
              </label>
              {me.user.avatar && <button type="button" className="ot-link quiet" disabled={busy} onClick={removePicture}>Remove</button>}
              <p className="ot-note">A square works best. It is cropped and shrunk before it leaves your phone.</p>
            </div>
          </div>
          <form className="ot-form" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
            <input className="ot-in" placeholder={prettyPhone(me.user.phone)} aria-label="Your name" maxLength={24} value={nameDraft ?? me.user.name ?? ''} onChange={(e) => setNameDraft(e.target.value)} />
            <button className="ot-btn" type="submit" disabled={busy || nameDraft === null}>{busy ? 'Saving…' : 'Save'}</button>
          </form>
          {you.err && <p className="ot-err">{you.err}</p>}
          {you.note && <p className="ot-note">{you.note}</p>}
        </section>

        <section className="ot-panel" aria-label="the page">
          <h2>Your page</h2>
          <label className="ot-toggle">
            <input type="checkbox" checked={me.user.doodles !== false} disabled={busy} onChange={(e) => setDoodles(e.target.checked)} />
            <span><b>Doodles.</b> Opus draws a small doodle for every day, from what you wrote.</span>
          </label>
        </section>

        <section className="ot-panel" aria-label="buddies">
          <h2>Buddies</h2>
          <p className="ot-p">Pick anyone. A buddy streak counts a day when you both wrote, a miss by either one resets it, and every {bonus.every} days it holds you both get {bonus.points} points. Your own streak and points are never touched.</p>

          {received.length > 0 && (
            <ul className="ot-buddies" aria-label="invites waiting on you">
              {received.map((i) => (
                <li key={i.id} className="ot-buddy">
                  <span className="who">{i.name} invited you.</span>
                  <span className="acts">
                    <button className="ot-link" onClick={() => buddy({ action: 'accept', id: i.id })} disabled={busy}>Say yes</button>
                    <button className="ot-link quiet" onClick={() => buddy({ action: 'cancel', id: i.id })} disabled={busy}>Not now</button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {(buddies.length > 0 || sent.length > 0) && (
            <ul className="ot-buddies" aria-label="your buddies">
              {buddies.map((x) => (
                <li key={x.id} className={`ot-buddy${ending === x.id ? ' ending' : ''}`}>
                  <Avatar person={{ name: x.name, phone: x.name, avatar: x.avatar }} size={36} />
                  <span className="who">{x.name}<small>{together(x)}{bestNext(x) ? ` · ${bestNext(x)}` : ''}</small></span>
                  <span className="acts">
                    {ending === x.id ? (
                      <>
                        <span className="ot-note" style={{ margin: 0 }}>Sure?</span>
                        <button className="ot-link" onClick={() => buddy({ action: 'end', id: x.id })} disabled={busy}>End it</button>
                        <button className="ot-link quiet" onClick={() => setEnding(null)}>Keep going</button>
                      </>
                    ) : (
                      <button className="ot-link quiet" onClick={() => setEnding(x.id)}>End</button>
                    )}
                  </span>
                </li>
              ))}
              {sent.map((i) => (
                <li key={i.id} className="ot-buddy">
                  <span className="who">{i.name}<small>invited {longDay(i.since.slice(0, 10))} · waiting for a yes</small></span>
                  <span className="acts"><button className="ot-link quiet" onClick={() => buddy({ action: 'cancel', id: i.id })} disabled={busy}>Cancel</button></span>
                </li>
              ))}
            </ul>
          )}

          <form className="ot-form" onSubmit={(e) => { e.preventDefault(); buddy({ action: 'invite', to: inviteTo }); }}>
            <input className="ot-in" inputMode="email" autoComplete="off" placeholder="Phone or iCloud email" aria-label="Phone number or iCloud email" value={inviteTo} onChange={(e) => setInviteTo(e.target.value)} />
            <button className="ot-btn" type="submit" disabled={busy || inviteTo.trim().length < 5}>{busy ? 'Sending…' : 'Invite'}</button>
          </form>
          <p className="ot-note">They get one text from us. Nothing changes until they say yes.</p>
          {err && <p className="ot-err">{err}</p>}
          {note && <p className="ot-note">{note}</p>}
        </section>

        <Foot />
      </main>
      </>
    );
  }

  // ----- the page -----
  const [ty, tm] = parts(today);
  const [sy, sm] = parts(me.user.since.slice(0, 10));
  const oldest = (ty * 12 + tm) - (sy * 12 + sm); // months back to the account's first month
  const byDay = new Map(entries.map((e) => [e.day, e]));
  // On the 1st (or any day before this month has a past day) the wall opens on last month.
  const auto = oldest > 0 && monthCells(ty, tm, today, me.user.since, byDay).length === 0 ? 1 : 0;
  const back = Math.min(monthsBack ?? auto, Math.max(0, oldest));
  const [vy, vm] = monthBack(ty, tm, back);
  const cells = monthCells(vy, vm, today, me.user.since, byDay);
  const drawn = me.user.doodles !== false;
  const todayEntry = byDay.get(today);
  const composing = !todayEntry || adding;
  const span = b.next ? b.next.min - b.level.min : 1;
  const progress = b.next ? Math.min(1, (b.points - b.level.min) / span) : 1;
  const perDay = pointsForEntry(b.streak + 1).base;
  const toNext = daysToNext(b);
  const opened = openDay ? byDay.get(openDay) : undefined;
  const redrawing = redraw ? byDay.get(redraw) : undefined;
  const nextLine = !b.next ? 'The top. Nothing left to grow into.'
    : toNext === 0 ? 'with today\'s sentence'
    : toNext !== null ? `${toNext} ${toNext === 1 ? 'day' : 'days'} to go` : `at ${b.next.min} pts`;

  return (
    <>
    <Defs />
    {payoff && <Payoff streak={payoff.streak} bonus={payoff.bonus} points={payoff.points} onClose={() => setPayoff(null)} />}
    {opened && !redraw && (
      <Sheet label={longDay(opened.day)} onClose={() => { setOpenDay(null); setEditing(null); setErr(''); }}>
        <DayView day={opened.day} entry={opened} drawn={drawn} thoughts={thoughtProps} onClose={() => { setOpenDay(null); setEditing(null); setErr(''); }}>
          {drawn && opened.doodle && <div className="ot-day-acts"><button type="button" className="ot-pill" onClick={() => setRedraw(opened.day)}><Redo />Redraw</button></div>}
        </DayView>
      </Sheet>
    )}
    {redrawing && <Redraw entry={redrawing} onClose={() => setRedraw(null)} onKept={async () => { setRedraw(null); await load(); }} />}
    <main className="ot-page">
      <Top me={me.user} streak={b.streak} view={view} onView={go} onSignout={signout} />

      <DayView day={today} entry={todayEntry} today drawn={drawn} thoughts={thoughtProps}>
        {composing ? (
          <form className="ot-compose" onSubmit={(e) => { e.preventDefault(); save(); }}>
            {!todayEntry && <h2 className="ot-q">One thing that happened today?</h2>}
            <textarea className="ot-ta" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder={todayEntry ? 'One more thing.' : 'One sentence.'} rows={3} aria-label="today's sentence" autoFocus={adding} />
            <div className="ot-acts">
              <button className="ot-btn" disabled={busy || text.trim().length < 2} type="submit">{busy ? 'Keeping…' : 'Keep it'}</button>
              {adding
                ? <button type="button" className="ot-link" onClick={() => { setAdding(false); setText(''); setErr(''); }}>Cancel</button>
                : <span className="ot-nudge">{NUDGES[nudge]} <button type="button" className="ot-link" onClick={() => setNudge((n) => (n + 1) % NUDGES.length)}>another</button></span>}
            </div>
            {err && !editing && <p className="ot-err">{err}</p>}
            {drawn && !todayEntry && <p className="ot-promise">Opus doodles it a few seconds after you keep it.</p>}
          </form>
        ) : (
          <div className="ot-day-acts">
            <button type="button" className="ot-pill" onClick={() => { setAdding(true); setErr(''); }}>+ Another thought</button>
            {drawn && todayEntry?.doodle && <button type="button" className="ot-pill" onClick={() => setRedraw(today)}><Redo />Redraw</button>}
          </div>
        )}
      </DayView>

      <section className="ot-garden" aria-label="level, streak and points">
        <div className="ot-garden-plant"><Plant level={b.index} size={72} /></div>
        <div className="ot-garden-text">
          <div className="ot-garden-head">
            <h2 className="ot-stage">{b.level.name}</h2>
            <button type="button" className="ot-info" aria-label="the numbers" aria-expanded={details} aria-controls="ot-details" onClick={() => setDetails((d) => !d)}>i</button>
            {milestone && <button type="button" className="ot-link ot-replay" onClick={() => setPayoff(milestone)}>replay day {milestone.streak}</button>}
          </div>
          <p className="ot-garden-sub">{b.points.toLocaleString('en-US')} points{b.streak === 0 ? ' · write today to start a streak' : ''}</p>
          <div className="ot-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={b.next ? `progress to ${b.next.name}` : 'progress'}>
            <i style={{ ['--w' as string]: `${progress * 100}%` }} />
          </div>
          <div className="ot-bar-k"><span>{nextLine}</span>{b.next && <b>{b.next.name}</b>}</div>
        </div>
        {details && (
          <div className="ot-stats" id="ot-details">
            <p><b>{b.points} pts</b> · +{perDay} for tomorrow&apos;s sentence{b.best > b.streak ? ` · best streak ${b.best}` : ''}</p>
            <div className="ot-replays" aria-label="replay a milestone">
              <span>Milestones</span>
              {Object.keys(MILESTONES).map(Number).map((m) => (
                <button key={m} type="button" className={`ot-dot${b.best >= m ? ' on' : ''}`} title={b.best >= m ? `replay day ${m}` : `day ${m}, not yet`} onClick={() => replay(m)}>{m}</button>
              ))}
            </div>
            {buddies.length > 0 && (
              <ul className="ot-buddy-tags" aria-label="buddy streaks">
                {buddies.map((x) => (
                  <li className="ot-buddy-tag" key={x.id}>
                    <Avatar person={{ name: x.name, phone: x.name, avatar: x.avatar }} size={22} />
                    <span><b>{x.name}</b> · {together(x)}{x.startsTomorrow ? '' : ` · +${bonus.points} in ${x.nextBonusIn} ${x.nextBonusIn === 1 ? 'day' : 'days'} · ${x.inToday ? 'wrote today ✓' : 'still to come'}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="ot-month" aria-label={`${MONTHS[vm - 1]} ${vy}`}>
        <div className="ot-month-head">
          <h2>{MONTHS[vm - 1]} <span>{vy}</span></h2>
          <div className="ot-month-nav">
            <button type="button" className="ot-round" disabled={back >= oldest} aria-label="previous month" onClick={() => setMonthsBack(back + 1)}>‹</button>
            <button type="button" className="ot-round" disabled={back <= 0} aria-label="next month" onClick={() => setMonthsBack(back - 1)}>›</button>
          </div>
        </div>
        {cells.length === 0 ? (
          <p className="ot-empty">{back === 0 ? `The rest of ${MONTHS[vm - 1]} fills in here, one day at a time.` : 'Nothing kept this month.'}</p>
        ) : (
          <div className="ot-wall">
            {cells.map((c) => <DayCard key={c.day} cell={c} drawn={drawn} onOpen={() => { setOpenDay(c.day); setEditing(null); setErr(''); }} />)}
          </div>
        )}
      </section>

      <Foot tz={me.user.tz ?? ''} />
    </main>
    </>
  );
}

function Redo() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16 3.5v3.6h-3.6" />
    </svg>
  );
}
