'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LEVELS, pointsForEntry, type Level } from '@/lib/onething/levels';
import Plant from './Plant';
import copy from '@/lib/onething/copy.json';
import { squareJpeg } from './picture';

type Entry = { id: string; day: string; text: string; streak: number; points: number };
type Board = { points: number; streak: number; best: number; doneToday: boolean; level: Level; next: Level | null; index: number };
type BuddyView = { id: string; name: string; avatar: string | null; streak: number; best: number; inToday: boolean; nextBonusIn: number; startsTomorrow: boolean };
type InviteView = { id: string; name: string; since: string };
type Person = { phone: string; since: string; tz?: string; name?: string | null; avatar?: string | null };
type Me = {
  user: Person | null;
  today?: string; board?: Board; entries?: Entry[]; levels?: Level[];
  buddies?: BuddyView[]; sent?: InviteView[]; received?: InviteView[]; bonus?: { every: number; points: number };
};

const NUDGES = [
  'Something small that worked.',
  'Something you noticed that nobody else did.',
  'The best ten minutes.',
  'A thing you changed your mind about.',
  'Who you talked to, and one line they said.',
  'A thing you finished. Or started.',
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
function shortDay(day: string): string {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function lines(text: string): string[] {
  return text.split('\n').map((t) => t.trim()).filter(Boolean);
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
/// Tally marks, five to a group.
function tally(n: number): string {
  const out: string[] = [];
  for (let k = n; k > 0; k -= 5) out.push('|'.repeat(Math.min(5, k)));
  return out.join(' ');
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

type Row = { day: string; n: number; entry?: Entry; kind: 'today' | 'kept' | 'missed' };
/// The month's page, newest day first: today (open or kept), kept days, and
/// missed days since the account began — a leaf drooped.
function monthRows(y: number, m: number, today: string, since: string, byDay: Map<string, Entry>): Row[] {
  const [ty, tm, td] = parts(today);
  const last = y === ty && m === tm ? td : daysInMonth(y, m);
  const sinceDay = since.slice(0, 10);
  const rows: Row[] = [];
  for (let d = last; d >= 1; d--) {
    const day = ymd(y, m, d);
    const entry = byDay.get(day);
    if (day === today) rows.push({ day, n: d, entry, kind: 'today' });
    else if (entry) rows.push({ day, n: d, entry, kind: 'kept' });
    else if (day >= sinceDay) rows.push({ day, n: d, kind: 'missed' });
  }
  return rows;
}

// ---------- small pieces ----------

/** Coloured-pencil hatching the plant's leaves fill with (referenced from CSS). */
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
      </defs>
    </svg>
  );
}

function Wordmark({ h1 }: { h1?: boolean }) {
  const inner = <>onething<span>.ink</span></>;
  return h1 ? <h1 className="ot-wordmark">{inner}</h1> : <a className="ot-wordmark" href="/onething">{inner}</a>;
}

/** The circle: their picture, or initials on a scrap of tape. */
function Avatar({ person, size = 28 }: { person: { name?: string | null; phone: string; avatar?: string | null }; size?: number }) {
  return (
    <span className="ot-avatar" style={{ ['--s' as string]: `${size}px` }} aria-hidden={!person.avatar}>
      {person.avatar ? <img src={person.avatar} alt="" /> : initials(person.name, person.phone)}
    </span>
  );
}

function Gear() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" />
      <circle cx="10" cy="10" r="5.6" strokeDasharray="2.2 2.6" />
    </svg>
  );
}

/** Signed-in masthead: wordmark left; the picture and a gear on the right.
 * The gear opens a small menu: the other screen, and sign out. */
function Mast({ me, view, onView, onSignout }: { me: Person; view: 'journal' | 'settings'; onView: (v: 'journal' | 'settings') => void; onSignout: () => void }) {
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
    <header className="ot-mast">
      <Wordmark />
      <div className="ot-who" ref={ref}>
        <Avatar person={me} size={32} />
        <button type="button" className="ot-gear" aria-label="menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Gear />
        </button>
        {open && (
          <ul className="ot-menu" role="menu">
            <li><button type="button" role="menuitem" onClick={() => { setOpen(false); onView(view === 'journal' ? 'settings' : 'journal'); }}>{view === 'journal' ? 'settings' : 'the page'}</button></li>
            <li><button type="button" role="menuitem" className="red" onClick={() => { setOpen(false); onSignout(); }}>sign out</button></li>
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
              <textarea className="ot-ta small" value={editText} maxLength={600} onChange={(e) => onEditText(e.target.value)} rows={2} autoFocus aria-label="edit this thought" />
              <div className="ot-acts">
                <button className="ot-btn" type="submit" disabled={busy || editText.trim().length === 1}>{busy ? 'Saving…' : 'Save'}</button>
                <button type="button" className="ot-link quiet" onClick={onCancel}>cancel</button>
                {all.length > 1 && <span className="ot-note" style={{ margin: 0 }}>leave it empty to remove this one.</span>}
              </div>
              {err && <p className="ot-err">{err}</p>}
            </form>
          ) : (
            <>
              <p className="t">{t}</p>
              <button type="button" className="ot-link edit" onClick={() => onStart(day, i, t)} aria-label={`edit thought ${i + 1}`}>edit</button>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The demo exchange on the landing page: what the texts actually look like. */
function Peek() {
  return (
    <div className="ot-lines peek" aria-label="an example exchange">
      <div className="ot-row sys">{copy.morning[0]}</div>
      <div className="ot-row hand">
        <div className="ot-row-head"><span>The fog gave way to sun just as we sat down outside with coffee.</span><span className="ot-stamp">kept!</span></div>
      </div>
      <div className="ot-row sys">{copy.kept[0].replace('{n}', '4')}</div>
    </div>
  );
}

/** The seven stages, left to right, growing. Every other label steps back on a phone. */
function Stages({ levels }: { levels: Level[] }) {
  return (
    <div className="ot-stages" aria-label="levels">
      {levels.map((l, i) => (
        <div key={l.name} className={`ot-stage-item${i % 2 === 1 ? ' quiet' : ''}`} style={{ ['--grow' as string]: 1 + i * 0.22, ['--max' as string]: `${44 + i * 7}px` }}>
          <Plant level={i} size={44 + i * 7} />
          <span className="n">{l.name.replace(' ', ' ')}</span>
          <span className="p">{i === 0 ? 'day 1' : `${l.min} pts`}</span>
        </div>
      ))}
    </div>
  );
}

function Foot({ tz, bare }: { tz?: string; bare?: boolean }) {
  return (
    <footer className={`ot-foot${bare ? ' bare' : ''}`}>
      {tz !== undefined && <p>Texts come at ten, morning and night{tz ? ` (${tz.replace(/_/g, ' ')} time)` : ''}. Reply to either, or start any text with <code>1:</code>.</p>}
      <p className="ot-sign">made with care by <a href="https://www.decremental.com" target="_blank" rel="noopener">Bart</a></p>
    </footer>
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
  const [monthsBack, setMonthsBack] = useState(0);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [you, setYou] = useState<{ err: string; note: string }>({ err: '', note: '' });
  const [inviteTo, setInviteTo] = useState('');
  const [ending, setEnding] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/onething/me', { cache: 'no-store' });
    setMe((await r.json()) as Me);
  }, []);
  useEffect(() => { load(); }, [load]);

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
  async function start() { if (await post('/api/onething/auth/start', { phone })) setStage('code'); }
  async function verify() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // the 10am / 10pm texts follow this clock
    if (await post('/api/onething/auth/verify', { phone, code, tz })) { setCode(''); setStage('phone'); await load(); }
  }
  async function save() { if (await post('/api/onething/entry', { text })) { setText(''); setAdding(false); await load(); } }
  async function saveEdit() {
    if (!editing) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/onething/entry', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editing, text: editText }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? 'Something went wrong.'); return; }
      setEditing(null); setEditText('');
      await load();
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
  function go(v: 'journal' | 'settings') { setView(v); setErr(''); setNote(''); setYou({ err: '', note: '' }); setEnding(null); }

  if (me === null) {
    return <><Defs /><main className="ot-page"><header className="ot-mast landing"><Wordmark h1 /></header></main></>;
  }

  if (!me.user) {
    return (
      <>
      <Defs />
      <main className="ot-page">
        <header className="ot-mast landing">
          <Wordmark h1 />
          <div className="ot-tagline">one observation a day, by text</div>
        </header>
        <h2 className="ot-h1">Every day at ten, a text asks what happened.</h2>
        <p className="ot-lede">You answer in one sentence. By December, you have a year.</p>
        <Peek />

        <section className="ot-box">
          <span className="ot-tape" aria-hidden />
          <h2>Start your year.</h2>
          {stage === 'phone' ? (
            <form className="ot-form" onSubmit={(e) => { e.preventDefault(); start(); }}>
              <input className="ot-in" inputMode="tel" autoComplete="tel" placeholder="Phone number" aria-label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button className="ot-btn" disabled={busy} type="submit">{busy ? 'Sending…' : 'Text me a code'}</button>
            </form>
          ) : (
            <form className="ot-form" onSubmit={(e) => { e.preventDefault(); verify(); }}>
              <input className="ot-in code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              <button className="ot-btn" disabled={busy} type="submit">{busy ? 'Checking…' : 'Sign in'}</button>
            </form>
          )}
          {stage === 'code' && <p className="ot-note">We texted a code to {phone}. <button className="ot-link" onClick={() => { setStage('phone'); setErr(''); }}>Wrong number?</button></p>}
          {err && <p className="ot-err">{err}</p>}
          <p className="ot-note">iMessage only. No password, nothing to install.</p>
        </section>

        <p className="ot-caption">Streaks earn points. Points grow a plant.</p>
        <p className="ot-pitch">Bring a buddy — every day you both write, you both earn extra. You never see their words, only that they showed up.</p>
        <Stages levels={LEVELS} />
        <Foot bare />
      </main>
      </>
    );
  }

  const b = me.board!;
  const levels = me.levels ?? LEVELS;
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
        <Mast me={me.user} view={view} onView={go} onSignout={signout} />
        <p className="ot-back"><button className="ot-link" onClick={() => go('journal')}>← back to the page</button></p>

        <section className="ot-section" aria-label="you">
          <h2>You</h2>
          <p className="ot-sys">What buddies see instead of your number.</p>
          <div className="ot-you">
            <Avatar person={me.user} size={72} />
            <div className="ot-you-acts">
              <label className="ot-link" style={{ cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Saving…' : me.user.avatar ? 'change picture' : 'add a picture'}
                <input ref={fileRef} type="file" accept="image/*" hidden disabled={busy} onChange={(e) => pickPicture(e.target.files?.[0])} aria-label="profile picture" />
              </label>
              {me.user.avatar && <button type="button" className="ot-link quiet" disabled={busy} onClick={removePicture}>remove</button>}
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

        <div className="ot-hr" />

        <section className="ot-section" aria-label="buddies">
          <h2>Buddies</h2>
          <p className="ot-sys">Pick anyone. A buddy streak counts a day when you both wrote, a miss by either one resets it, and every {bonus.every} days it holds you both get {bonus.points} points. Your own streak and points are never touched.</p>

          {received.length > 0 && (
            <ul className="ot-buddies" aria-label="invites waiting on you">
              {received.map((i) => (
                <li key={i.id} className="ot-buddy">
                  <span className="who">{i.name} invited you.</span>
                  <span className="acts">
                    <button className="ot-link" onClick={() => buddy({ action: 'accept', id: i.id })} disabled={busy}>say yes</button>
                    <button className="ot-link quiet" onClick={() => buddy({ action: 'cancel', id: i.id })} disabled={busy}>not now</button>
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
                        <button className="ot-link" onClick={() => buddy({ action: 'end', id: x.id })} disabled={busy}>end it</button>
                        <button className="ot-link quiet" onClick={() => setEnding(null)}>keep going</button>
                      </>
                    ) : (
                      <button className="ot-link quiet" onClick={() => setEnding(x.id)}>end</button>
                    )}
                  </span>
                </li>
              ))}
              {sent.map((i) => (
                <li key={i.id} className="ot-buddy">
                  <span className="who">{i.name}<small>invited {shortDay(i.since.slice(0, 10))} · waiting for a yes</small></span>
                  <span className="acts"><button className="ot-link quiet" onClick={() => buddy({ action: 'cancel', id: i.id })} disabled={busy}>cancel</button></span>
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
  const back = Math.min(monthsBack, Math.max(0, oldest));
  const [vy, vm] = monthBack(ty, tm, back);
  const byDay = new Map(entries.map((e) => [e.day, e]));
  const rows = monthRows(vy, vm, today, me.user.since, byDay);
  const kept = rows.filter((r) => r.entry).length;
  const elapsed = rows.length;
  const span = b.next ? b.next.min - b.level.min : 1;
  const progress = b.next ? Math.min(1, (b.points - b.level.min) / span) : 1;
  const perDay = pointsForEntry(b.streak + 1).base;
  const toNext = daysToNext(b);
  const streakWord = b.streak === 0 ? 'no streak yet' : `${b.streak}-day streak`;

  return (
    <>
    <Defs />
    <main className="ot-page">
      <Mast me={me.user} view={view} onView={go} onSignout={signout} />

      <section className="ot-garden" aria-label="level, streak and points">
        <div className="ot-frame"><Plant level={b.index} size={64} /></div>
        <div className="ot-garden-text">
          <div className="ot-garden-top">
            <h2 className="ot-stage">{b.level.name}</h2>
            <span className="ot-month-tag">{MONTHS[tm - 1].toUpperCase()} {ty}</span>
          </div>
          <div className="ot-stats">
            <b>{b.points} pts</b> · {streakWord}{b.best > b.streak ? ` · best ${b.best}` : ''} · +{perDay} a day
          </div>
          <div>
            <div className="ot-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={b.next ? `progress to ${b.next.name}` : 'progress'}>
              <i className={progress >= 1 ? 'full' : ''} style={{ ['--w' as string]: `${progress * 100}%` }} />
            </div>
            <div className="ot-ruler" aria-hidden>
              {levels.map((l, i) => <span key={l.name} className={i === b.index ? 'now' : ''} />)}
            </div>
            <div className="ot-ruler-k">
              <span><b>{b.level.name.toUpperCase()}</b>{b.next ? ` · ${b.next.name.toUpperCase()} ${toNext === 0 ? 'TODAY' : toNext !== null ? `IN ${toNext} ${toNext === 1 ? 'DAY' : 'DAYS'}` : `AT ${b.next.min} PTS`}` : ' · THE TOP'}</span>
              {b.next && <span>{levels[levels.length - 1].name.toUpperCase()}</span>}
            </div>
          </div>
        </div>
      </section>
      {buddies.length > 0 && (
        <div className="ot-buddy-tags" aria-label="buddy streaks">
          {buddies.map((x) => (
            <span className="ot-buddy-tag" key={x.id}>
              <b>{x.name}</b> · {together(x)}{x.startsTomorrow ? '' : ` · +${bonus.points} in ${x.nextBonusIn} ${x.nextBonusIn === 1 ? 'day' : 'days'} · ${x.inToday ? 'wrote today ✓' : 'still to come'}`}
            </span>
          ))}
        </div>
      )}

      <div className="ot-hr" />

      <ol className="ot-lines" aria-label={`${MONTHS[vm - 1]} ${vy}`}>
        {rows.map((r) => {
          if (r.kind === 'missed') {
            return <li key={r.day} className="ot-row missed"><span className="ot-dayno faint">{r.n}</span><span className="ot-droop">— A LEAF DROOPED —</span></li>;
          }
          if (r.kind === 'kept') {
            return (
              <li key={r.day} className="ot-row">
                <span className="ot-dayno">{r.n}</span>
                <Thoughts day={r.day} text={r.entry!.text} {...thoughtProps} />
              </li>
            );
          }
          // today: kept, or still open
          const open = !r.entry || adding;
          return (
            <li key={r.day} className="ot-row today">
              <span className="ot-dayno now">{r.n}</span>
              {r.entry && (
                <div className="ot-row-head">
                  <Thoughts day={r.day} text={r.entry.text} {...thoughtProps} />
                  <span className="ot-stamp">kept!</span>
                </div>
              )}
              {open ? (
                <form onSubmit={(e) => { e.preventDefault(); save(); }}>
                  <p className="ot-q">{r.entry ? 'One more thing?' : 'One thing that happened today?'}</p>
                  <textarea className="ot-ta" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder="One sentence." rows={3} aria-label="today's sentence" />
                  <div className="ot-acts">
                    <button className="ot-btn" disabled={busy || text.trim().length < 2} type="submit">{busy ? 'Keeping…' : 'Keep it'}</button>
                    <span className="ot-nudge">{NUDGES[nudge]}<button type="button" className="ot-link" onClick={() => setNudge((n) => (n + 1) % NUDGES.length)}>another</button></span>
                    {adding && <button type="button" className="ot-link quiet" onClick={() => { setAdding(false); setText(''); setErr(''); }}>cancel</button>}
                  </div>
                  {err && !editing && <p className="ot-err">{err}</p>}
                </form>
              ) : (
                <p className="ot-plus"><button type="button" className="ot-link" onClick={() => { setAdding(true); setErr(''); }}>+ add another thought</button></p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="ot-tally">
        <span>{back === 0 ? 'THIS MONTH' : `${MONTHS[vm - 1].toUpperCase()} ${vy}`} <span className="marks">{tally(kept)}</span> {kept} / {elapsed}</span>
        <span className="nav">
          {back < oldest && <button type="button" className="ot-link" onClick={() => setMonthsBack(back + 1)}>← {MONTHS[monthBack(vy, vm, 1)[1] - 1].toUpperCase()}</button>}
          {back > 0 && <button type="button" className="ot-link" onClick={() => setMonthsBack(back - 1)}>{MONTHS[monthBack(vy, vm, -1)[1] - 1].toUpperCase()} →</button>}
        </span>
      </div>

      <Foot tz={me.user.tz ?? ''} />
    </main>
    </>
  );
}
