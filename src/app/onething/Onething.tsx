'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Entry = { id: string; day: string; text: string; streak: number; points: number };
type Level = { name: string; min: number };
type Board = { points: number; streak: number; best: number; doneToday: boolean; level: Level; next: Level | null; index: number };
type Me = { user: { phone: string; since: string } | null; today?: string; board?: Board; entries?: Entry[] };

const NUDGES = [
  'Something you noticed that nobody else did.',
  'Something small that worked.',
  'The best ten minutes.',
  'A thing you changed your mind about.',
  'Who you talked to, and one line they said.',
  'A thing you finished. Or started.',
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function longDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
function prettyPhone(p: string): string {
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}

/** Twelve month blocks, each a 7-wide grid of days starting Monday. */
function Year({ year, today, have, sel, onPick, demo }: {
  year: number; today?: string; have: Set<string>; sel?: string | null; onPick?: (d: string) => void; demo?: boolean;
}) {
  return (
    <div className="ot-months" aria-label={`${year}`}>
      {MONTHS.map((name, mi) => {
        const first = new Date(Date.UTC(year, mi, 1));
        const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
        const count = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
        const cells: React.ReactNode[] = [];
        for (let i = 0; i < offset; i++) cells.push(<span key={`p${i}`} className="c pad" />);
        for (let d = 1; d <= count; d++) {
          const day = `${year}-${pad(mi + 1)}-${pad(d)}`;
          const on = have.has(day);
          const future = !!today && day > today;
          const cls = `c${on ? ' on' : ''}${day === today ? ' today' : ''}${day === sel ? ' sel' : ''}${future ? ' future' : ''}`;
          cells.push(
            on && onPick
              ? <button key={day} type="button" className={cls} aria-label={day} onClick={() => onPick(day)} />
              : <span key={day} className={cls} aria-hidden={demo} />
          );
        }
        return (
          <div className="ot-month" key={name}>
            <div className="m">{name}</div>
            <div className="ot-days">{cells}</div>
          </div>
        );
      })}
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
  const [sel, setSel] = useState<string | null>(null);
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
  async function save() { if (await post('/api/onething/entry', { text })) { setText(''); setSel(null); await load(); } }
  async function signout() { await fetch('/api/onething/auth/signout', { method: 'POST' }); setMe({ user: null }); }

  const demo = useMemo(() => {
    // A believable partial year for the signed-out page: most days filled, a few gaps.
    const s = new Set<string>();
    let x = 7;
    for (let m = 0; m < 9; m++) {
      const count = new Date(Date.UTC(2026, m + 1, 0)).getUTCDate();
      for (let d = 1; d <= count; d++) { x = (x * 48271) % 2147483647; if (x % 9 !== 0) s.add(`2026-${pad(m + 1)}-${pad(d)}`); }
    }
    return s;
  }, []);

  if (me === null) {
    return <main className="ot-main"><header className="ot-head"><h1 className="ot-logo"><b>1</b>thing</h1></header></main>;
  }

  if (!me.user) {
    return (
      <main className="ot-main">
        <header className="ot-head">
          <h1 className="ot-logo"><b>1</b>thing</h1>
          <span className="ot-small">one sentence a day, by text</span>
        </header>
        <h2 className="ot-h">Every day at ten, a text asks what happened. You answer in one sentence.</h2>
        <p className="ot-p">That is the whole thing. No app to open, no prompt to remember. The sentence goes into a cell for that day, and the year fills in.</p>
        <p className="ot-p">Miss a day and there is one reminder at ten that night. Answer and the streak grows.</p>
        {stage === 'phone' ? (
          <form className="ot-form" onSubmit={(e) => { e.preventDefault(); start(); }}>
            <input className="ot-in" inputMode="tel" autoComplete="tel" placeholder="Phone number" aria-label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className="ot-btn" disabled={busy} type="submit">{busy ? 'Sending' : 'Text me a code'}</button>
          </form>
        ) : (
          <form className="ot-form" onSubmit={(e) => { e.preventDefault(); verify(); }}>
            <input className="ot-in code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            <button className="ot-btn" disabled={busy} type="submit">{busy ? 'Checking' : 'Sign in'}</button>
          </form>
        )}
        {stage === 'code' && <p className="ot-note">Sent to {phone}. <button className="ot-btnlink" onClick={() => { setStage('phone'); setErr(''); }}>Wrong number?</button></p>}
        {err && <p className="ot-err">{err}</p>}
        <p className="ot-note">Works over iMessage. No password, no email, nothing to install.</p>
        <section className="ot-year" aria-hidden>
          <div className="ot-yearhead"><span>What a year looks like</span><span>one cell per day</span></div>
          <Year year={2026} have={demo} demo />
        </section>
      </main>
    );
  }

  const b = me.board!;
  const entries = me.entries ?? [];
  const today = me.today ?? '';
  const year = Number(today.slice(0, 4));
  const have = new Set(entries.map((e) => e.day));
  const byDay = new Map(entries.map((e) => [e.day, e]));
  const shown = sel ? byDay.get(sel) : (byDay.get(today) ?? entries[0]);
  const inYear = entries.filter((e) => e.day.startsWith(`${year}-`)).length;
  const span = b.next ? b.next.min - b.level.min : 1;
  const progress = b.next ? Math.min(1, (b.points - b.level.min) / span) : 1;

  return (
    <main className="ot-main">
      <header className="ot-head">
        <h1 className="ot-logo"><b>1</b>thing</h1>
        <span className="ot-small">{prettyPhone(me.user.phone)} · <button className="ot-btnlink" onClick={signout}>sign out</button></span>
      </header>

      <section className="ot-year">
        <div className="ot-yearhead"><span>{year}</span><span>{inYear} of 365</span></div>
        <Year year={year} today={today} have={have} sel={sel ?? shown?.day} onPick={setSel} />
        <div className="ot-read">
          {shown ? (
            <>
              <div className="d">{shown.day === today ? 'Today' : longDay(shown.day)} · day {shown.streak}</div>
              <p className="t">{shown.text}</p>
            </>
          ) : (
            <div className="d">Nothing kept yet. Today&rsquo;s cell is outlined.</div>
          )}
        </div>
      </section>

      <section className="ot-today">
        {b.doneToday ? (
          <>
            <p className="q">Today is kept.</p>
            <p className="ot-kept">{byDay.get(today)?.text}</p>
            <span className="ot-small">Next question tomorrow at ten. Reply to it, or type here.</span>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <p className="q">What&rsquo;s one thing that happened in the last 24 hours?</p>
            <textarea value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder="One sentence." rows={3} />
            <div className="row">
              <button className="ot-btn" disabled={busy || text.trim().length < 2} type="submit">{busy ? 'Saving' : 'Keep it'}</button>
              <span className="ot-nudge">{NUDGES[nudge]}<button type="button" onClick={() => setNudge((n) => (n + 1) % NUDGES.length)}>another</button></span>
            </div>
            {err && <p className="ot-err">{err}</p>}
          </form>
        )}
      </section>

      <section className="ot-stats" aria-label="streak and points">
        <div className="ot-stat"><div className="v">{b.streak}</div><div className="k">{b.streak === 1 ? 'day in a row' : 'days in a row'}{b.best > b.streak ? ` · best ${b.best}` : ''}</div></div>
        <div className="ot-stat"><div className="v">{b.points}</div><div className="k">points</div></div>
        <div className="ot-stat">
          <div className="v txt">{b.level.name}</div>
          <div className="k">{b.next ? `${b.next.min - b.points} to ${b.next.name}` : 'highest level'}</div>
          <div className="ot-bar"><i style={{ width: `${progress * 100}%` }} /></div>
        </div>
      </section>

      <footer className="ot-foot">
        Texts arrive at 10:05 in the morning and, if the day is still open, 10:05 at night, Pacific time.
        Reply to either, or start any text with <code>1:</code> to keep a sentence at any hour.
      </footer>
    </main>
  );
}
