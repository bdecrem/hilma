'use client';

import { useCallback, useEffect, useState } from 'react';
import { LEVELS, type Level } from '@/lib/onething/levels';
import Plant from './Plant';

type Entry = { id: string; day: string; text: string; streak: number; points: number };
type Board = { points: number; streak: number; best: number; doneToday: boolean; level: Level; next: Level | null; index: number };
type Me = { user: { phone: string; since: string } | null; today?: string; board?: Board; entries?: Entry[]; levels?: Level[] };

const NUDGES = [
  'Something small that worked.',
  'Something you noticed that nobody else did.',
  'The best ten minutes.',
  'A thing you changed your mind about.',
  'Who you talked to, and one line they said.',
  'A thing you finished. Or started.',
];
function longDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function lines(text: string): string[] {
  return text.split('\n').map((t) => t.trim()).filter(Boolean);
}
function prettyPhone(p: string): string {
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}

function PencilMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <g fill="none" stroke="#35332f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 27 L9 17 L21 5 L27 11 L15 23 Z" />
        <path d="M21 5 L27 11 M6 27 L9 24" />
      </g>
      <path d="M9 17 L15 23 L12 25 L7 20 Z" fill="#f3c64b" />
    </svg>
  );
}

/** Spiral binding along the top edge, like a flip sketchbook. */
function Coil() {
  return (
    <svg className="ot-coil" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden>
      <defs>
        <pattern id="ot-coil" patternUnits="userSpaceOnUse" width="30" height="40">
          <ellipse cx="15" cy="21" rx="5.5" ry="4" fill="#e6e2d9" />
          <path d="M9 4 C 4 10, 4 30, 15 34 C 24 37, 27 22, 21 15" fill="none" stroke="#8f8b84" strokeWidth="2.2" strokeLinecap="round" />
        </pattern>
      </defs>
      <rect width="600" height="40" fill="url(#ot-coil)" />
    </svg>
  );
}

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
        <filter id="ot-wob" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <pattern id="ot-hy" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(38)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#f3c64b" strokeWidth="3.6" strokeLinecap="round" />
        </pattern>
        <pattern id="ot-hp" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-30)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#f0a3a0" strokeWidth="3" strokeLinecap="round" />
        </pattern>
        <pattern id="ot-hg" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(20)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#c9c6bf" strokeWidth="2.4" strokeLinecap="round" />
        </pattern>
      </defs>
    </svg>
  );
}

/** The pencil from the hello page, leaning in to say it. */
function Mascot() {
  return (
    <svg className="ot-mascot" viewBox="0 0 120 200" aria-hidden>
      <g filter="url(#ot-wob)" stroke="#35332f" strokeLinecap="round" strokeLinejoin="round" fill="none" transform="rotate(14 60 120)">
        <path d="M60 196 L 48 170 L 72 170 Z" fill="#35332f" strokeWidth="2.2" />
        <path d="M48 170 L 72 170 L 84 146 L 36 146 Z" fill="url(#ot-hatch-wood)" strokeWidth="2.4" />
        <rect x="36" y="16" width="48" height="130" rx="4" fill="url(#ot-hy)" strokeWidth="2.8" />
        <rect x="34" y="-8" width="52" height="24" rx="3" fill="url(#ot-hg)" strokeWidth="2.4" />
        <rect x="36" y="-30" width="48" height="24" rx="8" fill="url(#ot-hp)" strokeWidth="2.6" />
        <ellipse cx="50" cy="78" rx="3.2" ry="4.2" fill="#35332f" stroke="none" />
        <ellipse cx="71" cy="78" rx="3.2" ry="4.2" fill="#35332f" stroke="none" />
        <path d="M51 95 Q 60 104, 70 95" strokeWidth="2.6" />
        <circle cx="43" cy="89" r="4.5" fill="url(#ot-hp)" stroke="none" />
        <circle cx="78" cy="89" r="4.5" fill="url(#ot-hp)" stroke="none" />
        <path d="M84 62 C 100 54, 106 40, 100 26 M100 26 L 92 20 M100 26 L 108 20 M100 26 L 102 15" strokeWidth="2.8" />
        <path d="M36 70 C 22 78, 18 92, 24 104" strokeWidth="2.8" />
      </g>
    </svg>
  );
}

function Mast({ right, bare }: { right?: React.ReactNode; bare?: boolean }) {
  return (
    <header className="ot-mast">
      <div className="ot-brand">
        <h1 className="ot-wordmark"><PencilMark /><u>onething</u></h1>
        {!bare && <span className="ot-tagline">one sentence a day, by text</span>}
      </div>
      {right}
    </header>
  );
}

/** The demo thread on the signed-out page: what the texts actually look like. */
function Peek() {
  return (
    <div className="ot-chat" aria-label="an example exchange">
      <div className="ot-bubble them">Onething: what is one thing that happened in the last 24 hours? One sentence. Just reply here.<span className="t">10:05 AM</span></div>
      <div className="ot-bubble me">The fog gave way to sun just as we sat down outside with coffee.<span className="t">10:12 AM</span></div>
      <div className="ot-bubble them">Got it. Day 4 🔥 · +18 points (146 total) · Sprout.<span className="t">10:12 AM</span></div>
    </div>
  );
}

/** The seven levels, left to right. `index` marks the current one; -1 shows all of them lit. */
function Ladder({ index, levels }: { index: number; levels: Level[] }) {
  return (
    <div className="ot-ladder" aria-label="levels">
      {levels.map((l, i) => (
        <div key={l.name} className={`ot-rung${index < 0 ? ' all' : i < index ? ' done' : i === index ? ' now' : ''}`}>
          <Plant level={i} size={40} />
          <span>{l.name}</span>
        </div>
      ))}
    </div>
  );
}

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
  async function verify() { if (await post('/api/onething/auth/verify', { phone, code })) { setCode(''); setStage('phone'); await load(); } }
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
  async function signout() { await fetch('/api/onething/auth/signout', { method: 'POST' }); setMe({ user: null }); }

  if (me === null) {
    return <><Coil /><Defs /><main className="ot-main"><Mast /></main></>;
  }

  if (!me.user) {
    return (
      <>
      <Coil /><Defs />
      <main className="ot-main">
        <Mast />
        <section className="ot-hero">
          <Mascot />
          <div className="ot-hero-text">
            <h1 className="ot-h1">Every day at ten, a text asks what happened.</h1>
            <p className="ot-lede">You answer in one sentence. By December, you have a year.</p>
          </div>
        </section>
        <Peek />

        <section className="ot-card">
          <span className="ot-tape" aria-hidden />
          <h2>Start your year.</h2>
          {stage === 'phone' ? (
            <form className="ot-form" onSubmit={(e) => { e.preventDefault(); start(); }}>
              <input className="ot-in" inputMode="tel" autoComplete="tel" placeholder="Your phone number" aria-label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
        <Ladder index={-1} levels={LEVELS} />

        <footer className="ot-foot">
          <p className="ot-sign">made with care by <a href="https://www.decremental.com" target="_blank" rel="noopener">Bart</a></p>
        </footer>
      </main>
      </>
    );
  }

  const b = me.board!;
  const levels = me.levels ?? LEVELS;

  /** Every thought kept on a day, in order, each one editable in place. */
  const Thoughts = ({ day, text, big }: { day: string; text: string; big?: boolean }) => {
    const all = lines(text);
    return (
      <ol className={`ot-thoughts${big ? ' big' : ''}`}>
        {all.map((t, i) => (
          <li key={i} className="ot-thought">
            {editing && editing.day === day && editing.index === i ? (
              <form className="ot-editing" onSubmit={(e) => { e.preventDefault(); saveEdit(); }}>
                <textarea className="ot-ta small" value={editText} maxLength={600} onChange={(e) => setEditText(e.target.value)} rows={2} autoFocus aria-label="edit this thought" />
                <div className="ot-row">
                  <button className="ot-btn" type="submit" disabled={busy || editText.trim().length === 1}>{busy ? 'Saving…' : 'Save'}</button>
                  <button type="button" className="ot-link" onClick={() => { setEditing(null); setErr(''); }}>cancel</button>
                  {all.length > 1 && <span className="ot-note" style={{ margin: 0 }}>leave it empty to remove this one.</span>}
                </div>
                {err && <p className="ot-err">{err}</p>}
              </form>
            ) : (
              <>
                {all.length > 1 && <span className="n">{i + 1}.</span>}
                <p className="t">{t}</p>
                <button type="button" className="ot-link edit" onClick={() => startEdit(day, i, t)} aria-label={`edit thought ${i + 1}`}>edit</button>
              </>
            )}
          </li>
        ))}
      </ol>
    );
  };
  const entries = me.entries ?? [];
  const today = me.today ?? '';
  const todayEntry = entries.find((e) => e.day === today);
  const lately = entries.filter((e) => e.day !== today).slice(0, 5);
  const span = b.next ? b.next.min - b.level.min : 1;
  const progress = b.next ? Math.min(1, (b.points - b.level.min) / span) : 1;
  const streakLine = b.streak === 0
    ? 'no streak yet'
    : `${b.streak} ${b.streak === 1 ? 'day' : 'days'} in a row${b.best > b.streak ? ` · best ${b.best}` : ''}`;

  return (
    <>
    <Coil /><Defs />
    <main className="ot-main">
      <Mast bare right={<span className="ot-who">{prettyPhone(me.user.phone)} · <button className="ot-link" onClick={signout}>sign out</button></span>} />

      <div className="ot-ask">
      <Mascot />
      <section className="ot-card ot-today">
        <span className={`ot-tape${b.doneToday ? ' green' : ''}`} aria-hidden />
        <div className="ot-date">{longDay(today)}</div>
        {b.doneToday && !adding ? (
          <>
            <span className="ot-stamp">kept!</span>
            <Thoughts day={today} text={todayEntry?.text ?? ''} big />
            <p className="ot-more"><button type="button" className="ot-link" onClick={() => { setAdding(true); setErr(''); }}>add another thought</button></p>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <h2 className="ot-q">{b.doneToday ? 'One more thing?' : 'One thing that happened in the last 24 hours?'}</h2>
            <textarea className="ot-ta" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder="One sentence." rows={3} />
            <div className="ot-row">
              <button className="ot-btn" disabled={busy || text.trim().length < 2} type="submit">{busy ? 'Keeping…' : 'Keep it'}</button>
              <span className="ot-nudge">{NUDGES[nudge]}<button type="button" className="ot-link" onClick={() => setNudge((n) => (n + 1) % NUDGES.length)}>another</button></span>
              {adding && <button type="button" className="ot-link" onClick={() => { setAdding(false); setText(''); setErr(''); }}>cancel</button>}
            </div>
            {err && <p className="ot-err">{err}</p>}
          </form>
        )}
      </section>
      </div>

      <section className="ot-garden" aria-label="level, streak and points">
        <Plant level={b.index} size={120} />
        <div>
          <div className="ot-level">{b.level.name}<small>{streakLine}</small></div>
          <div className="ot-thread" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <i style={{ ['--w' as string]: `${progress * 100}%` }} />
          </div>
          <div className="ot-thread-k">{b.points} {b.points === 1 ? 'point' : 'points'}{b.next ? ` · ${b.next.min - b.points} to ${b.next.name}` : ''}</div>
        </div>
      </section>
      <Ladder index={b.index} levels={levels} />

      {lately.length > 0 && (
        <section className="ot-lately" aria-label="recent days">
          <h2>Lately</h2>
          {lately.map((e) => (
            <div className="ot-line" key={e.id}>
              <div className="d">{shortDay(e.day)}</div>
              <Thoughts day={e.day} text={e.text} />
            </div>
          ))}
        </section>
      )}

      <footer className="ot-foot">
        <p style={{ margin: 0 }}>Texts come at ten, morning and night, Pacific. Reply to either, or start any text with <code>1:</code>.</p>
        <p className="ot-sign">made with care by <a href="https://www.decremental.com" target="_blank" rel="noopener">Bart</a></p>
      </footer>
    </main>
    </>
  );
}
