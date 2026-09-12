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
function prettyPhone(p: string): string {
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}

function LeafMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M12 14c-4.5 0-7.5-3.5-7.5-7.5C8.5 6.5 12 9.5 12 14z" fill="#4a7c59" />
      <path d="M12 11.5c4.5 0 7.5-3.5 7.5-7.5C15 4 12 7 12 11.5z" fill="#8fb996" />
    </svg>
  );
}

function Mast({ right, bare }: { right?: React.ReactNode; bare?: boolean }) {
  return (
    <header className="ot-mast">
      <div className="ot-brand">
        <h1 className="ot-wordmark"><LeafMark />onething</h1>
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
  async function save() { if (await post('/api/onething/entry', { text })) { setText(''); await load(); } }
  async function signout() { await fetch('/api/onething/auth/signout', { method: 'POST' }); setMe({ user: null }); }

  if (me === null) {
    return <main className="ot-main"><Mast /></main>;
  }

  if (!me.user) {
    return (
      <main className="ot-main">
        <Mast />
        <section className="ot-hero">
          <h1 className="ot-h1">Every day at ten, a text asks what happened.</h1>
          <p className="ot-lede">You answer in one sentence. By December, you have a year.</p>
          <Peek />
        </section>

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
    );
  }

  const b = me.board!;
  const levels = me.levels ?? LEVELS;
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
    <main className="ot-main">
      <Mast bare right={<span className="ot-who">{prettyPhone(me.user.phone)} · <button className="ot-link" onClick={signout}>sign out</button></span>} />

      <section className="ot-card ot-today">
        <span className={`ot-tape${b.doneToday ? ' green' : ''}`} aria-hidden />
        <div className="ot-date">{longDay(today)}</div>
        {b.doneToday ? (
          <>
            <span className="ot-stamp">✓ kept</span>
            <p className="ot-kept">{todayEntry?.text}</p>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <h2 className="ot-q">One thing that happened in the last 24 hours?</h2>
            <textarea className="ot-ta" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder="One sentence." rows={3} />
            <div className="ot-row">
              <button className="ot-btn" disabled={busy || text.trim().length < 2} type="submit">{busy ? 'Keeping…' : 'Keep it'}</button>
              <span className="ot-nudge">{NUDGES[nudge]}<button type="button" className="ot-link" onClick={() => setNudge((n) => (n + 1) % NUDGES.length)}>another</button></span>
            </div>
            {err && <p className="ot-err">{err}</p>}
          </form>
        )}
      </section>

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
              <p className="t">{e.text}</p>
            </div>
          ))}
        </section>
      )}

      <footer className="ot-foot">
        <p style={{ margin: 0 }}>Texts come at ten, morning and night, Pacific. Reply to either, or start any text with <code>1:</code>.</p>
        <p className="ot-sign">made with care by <a href="https://www.decremental.com" target="_blank" rel="noopener">Bart</a></p>
      </footer>
    </main>
  );
}
