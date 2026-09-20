'use client'

// Rock Paper Anything — the whole game. State lives in one ref and the
// component re-renders once per animation frame; a dozen DOM tags is all there
// is to draw. Every judgment comes from /api/rpa/judge (one Jev call per shot
// or aim preview); every number — damage, hit points, speed, score — is
// computed here and in src/lib/rpa/rules.ts.

import { useCallback, useEffect, useRef, useState } from 'react'
import { BOSSES, ENEMIES, type Enemy } from '@/lib/rpa/enemies'
import {
  cleanPhrase,
  damageOn,
  killScore,
  MAX_ENEMIES,
  MAX_PHRASE,
  maxHp,
  phraseKey,
  refusal,
  USD_PER_TOKEN,
  wavePlan,
  type Element,
  type Verdict,
} from '@/lib/rpa/rules'
import { setMuted, sfx, unlock } from './sfx'

const TAG_H = 56
const BOSS_H = 82
const HEARTS = 4
const PREVIEW_DEBOUNCE = 300
const PREVIEW_FRESH = 2500

type Foe = {
  uid: number
  def: Enemy
  /** 0 = left edge … 1 = right edge. */
  x: number
  /** 0 = just spawned … 1 = at the gate. */
  travel: number
  tilt: number
  hp: number
  max: number
  /** Damage the phrase being typed would do. */
  preview: number
  hits: number
  lastDmg: number
  lastP: number
  lastNote: string
  deadAt: number | null
  killedBy: string
}

type Shot = { id: number; text: string; element: Element; x0: number; y0: number; dx: number; dy: number; at: number }
type Toast = { id: number; text: string; tone: 'good' | 'bad' | 'info'; at: number }
type BestShot = { phrase: string; total: number; hits: { name: string; p: number }[] }

type State = {
  phase: 'title' | 'playing' | 'over'
  wave: number
  foes: Foe[]
  queue: Enemy[]
  seen: Set<string>
  spawnIn: number
  lastX: number
  hearts: number
  score: number
  kills: number
  used: Set<string>
  bannerUntil: number
  banner: { title: string; sub: string }
  shakeUntil: number
  shots: Shot[]
  toasts: Toast[]
  best: BestShot | null
  stats: { calls: number; tokens: number; questions: number; jevMs: number[]; last: { questions: number; jevMs: number; rtt: number; tokens: number } | null }
  fieldH: number
  uid: number
}

const fresh = (): State => ({
  phase: 'title',
  wave: 0,
  foes: [],
  queue: [],
  seen: new Set(),
  spawnIn: 0,
  lastX: 0.5,
  hearts: HEARTS,
  score: 0,
  kills: 0,
  used: new Set(),
  bannerUntil: 0,
  banner: { title: '', sub: '' },
  shakeUntil: 0,
  shots: [],
  toasts: [],
  best: null,
  stats: { calls: 0, tokens: 0, questions: 0, jevMs: [], last: null },
  fieldH: 480,
  uid: 0,
})

const heightOf = (f: Foe) => (f.def.boss ? BOSS_H : TAG_H)
const alive = (s: State) => s.foes.filter((f) => f.deadAt === null)
const usd = (tokens: number) => `$${(tokens * USD_PER_TOKEN).toFixed(tokens * USD_PER_TOKEN < 0.001 ? 5 : 4)}`
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : 0)
const pTxt = (p: number) => p.toFixed(2).replace(/^0/, '')

const TIER_LINES: Record<number, string> = { 1: 'household nuisances', 2: 'creatures and characters', 3: 'modern life', 4: 'forces and feelings' }

function pickWave(s: State, n: number): Enemy[] {
  const plan = wavePlan(n)
  let pool = ENEMIES.filter((e) => plan.tiers.includes(e.tier) && !s.seen.has(e.id))
  if (pool.length < plan.count) {
    for (const e of ENEMIES) if (plan.tiers.includes(e.tier)) s.seen.delete(e.id)
    pool = ENEMIES.filter((e) => plan.tiers.includes(e.tier))
  }
  const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, plan.count)
  for (const e of picked) s.seen.add(e.id)
  if (plan.boss) picked.push(BOSSES[(n / 4 - 1) % BOSSES.length])
  return picked
}

export default function Game() {
  const g = useRef<State>(fresh())
  const [, setFrame] = useState(0)
  const [input, setInput] = useState('')
  const [inFlight, setInFlight] = useState(false)
  const [muted, setMutedState] = useState(false)
  const [record, setRecord] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const foeEls = useRef(new Map<number, HTMLDivElement>())
  const inputNow = useRef('')
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewSeq = useRef(0)
  const previewCache = useRef<{ phrase: string; ids: string[]; verdict: Verdict; at: number } | null>(null)

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const s = g.current
    s.toasts = [...s.toasts.slice(-2), { id: ++s.uid, text, tone, at: performance.now() }]
  }, [])

  // ── the loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const beginWave = (s: State, n: number, now: number) => {
      const plan = wavePlan(n)
      s.wave = n
      s.queue = pickWave(s, n)
      s.spawnIn = 0
      s.banner = { title: `Wave ${n}`, sub: plan.boss ? 'a boss closes this wave' : TIER_LINES[plan.tiers[plan.tiers.length - 1]] }
      s.bannerUntil = now + 1700
      if (n > 1) sfx.wave()
    }

    const step = (now: number) => {
      const s = g.current
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      if (s.phase === 'playing') {
        if (s.wave === 0) beginWave(s, 1, now)
        const plan = wavePlan(s.wave)
        const living = alive(s)

        if (now > s.bannerUntil && s.queue.length && living.length < MAX_ENEMIES) {
          s.spawnIn -= dt
          const next = s.queue[0]
          const h = next.boss ? BOSS_H : TAG_H
          // The lane under the top edge must be clear: tags never overlap.
          const clear = living.every((f) => f.travel * (s.fieldH - heightOf(f)) > h + 12)
          if (s.spawnIn <= 0 && clear) {
            s.queue.shift()
            let x = Math.random()
            if (Math.abs(x - s.lastX) < 0.3) x = (s.lastX + 0.5) % 1
            s.lastX = x
            const hp = maxHp(next)
            s.foes.push({
              uid: ++s.uid, def: next, x: next.boss ? 0.5 : x, travel: 0, tilt: (Math.random() - 0.5) * 4,
              hp, max: hp, preview: 0, hits: 0, lastDmg: 0, lastP: 0, lastNote: '', deadAt: null, killedBy: '',
            })
            s.spawnIn = Math.max(2.2, 5 - s.wave * 0.3)
          }
        }

        for (const f of living) {
          f.travel += dt / (plan.crossing * (f.def.boss ? 1.5 : 1))
          if (f.travel >= 1) {
            s.foes = s.foes.filter((x) => x !== f)
            s.hearts -= f.def.boss ? 2 : 1
            s.shakeUntil = now + 450
            sfx.breach()
            toast(`${f.def.name} got through`, 'bad')
          }
        }

        if (s.hearts <= 0) {
          s.hearts = 0
          s.phase = 'over'
          try {
            const prev = Number(localStorage.getItem('rpa:best') ?? 0) || 0
            if (s.score > prev) localStorage.setItem('rpa:best', String(s.score))
            setRecord(Math.max(prev, s.score))
          } catch {}
        } else if (!s.queue.length && s.foes.length === 0) {
          s.score += 100 * s.wave
          toast(`wave ${s.wave} held  +${100 * s.wave}`, 'good')
          beginWave(s, s.wave + 1, now)
        }
      }

      s.foes = s.foes.filter((f) => f.deadAt === null || now - f.deadAt < 750)
      s.shots = s.shots.filter((x) => now - x.at < 420)
      s.toasts = s.toasts.filter((x) => now - x.at < 1900)
      setFrame((n) => (n + 1) % 1_000_000)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [toast])

  // ── layout: follow the visual viewport so the phone keyboard never covers the dock ──
  useEffect(() => {
    const vv = window.visualViewport
    const root = rootRef.current
    if (!vv || !root) return
    const fit = () => {
      root.style.height = `${vv.height}px`
      root.style.transform = `translateY(${vv.offsetTop}px)`
    }
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => {
      vv.removeEventListener('resize', fit)
      vv.removeEventListener('scroll', fit)
    }
  }, [])

  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { g.current.fieldH = el.clientHeight })
    ro.observe(el)
    g.current.fieldH = el.clientHeight
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    try {
      setRecord(Number(localStorage.getItem('rpa:best') ?? 0) || 0)
      const m = localStorage.getItem('rpa:muted') === '1'
      setMutedState(m)
      setMuted(m)
    } catch {}
  }, [])

  // ── the judge ───────────────────────────────────────────────────────────
  const fetchVerdict = useCallback(async (phrase: string, ids: string[]): Promise<Verdict> => {
    const t0 = performance.now()
    const res = await fetch('/api/rpa/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrase, enemies: ids }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error ?? `judge failed (${res.status})`)
    const v = data as Verdict
    const st = g.current.stats
    st.calls += 1
    st.tokens += v.tokens
    st.questions += v.questions
    st.jevMs.push(v.jevMs)
    st.last = { questions: v.questions, jevMs: v.jevMs, rtt: Math.round(performance.now() - t0), tokens: v.tokens }
    return v
  }, [])

  const clearPreview = useCallback(() => {
    previewSeq.current++
    if (previewTimer.current) clearTimeout(previewTimer.current)
    for (const f of g.current.foes) f.preview = 0
  }, [])

  // Aim while typing: a pause of 300 ms asks Jev what this phrase would do,
  // and each enemy shows the damage it would take.
  const onInput = useCallback((raw: string) => {
    setInput(raw)
    inputNow.current = raw
    const s = g.current
    if (previewTimer.current) clearTimeout(previewTimer.current)
    const phrase = cleanPhrase(raw)
    if (s.phase !== 'playing' || phrase.length < 3 || s.used.has(phraseKey(phrase))) {
      clearPreview()
      return
    }
    const seq = ++previewSeq.current
    previewTimer.current = setTimeout(async () => {
      const ids = alive(s).map((f) => f.def.id)
      if (!ids.length) return
      try {
        const v = await fetchVerdict(phrase, ids)
        if (seq !== previewSeq.current) return
        previewCache.current = { phrase, ids, verdict: v, at: performance.now() }
        const blocked = refusal(v) !== null
        for (const f of alive(s)) f.preview = blocked ? 0 : damageOn(f.def, v.results[f.def.id])
      } catch {
        // A failed preview is only a missing hint; the shot itself reports errors.
      }
    }, PREVIEW_DEBOUNCE)
  }, [clearPreview, fetchVerdict])

  const launch = useCallback((phrase: string, v: Verdict) => {
    const s = g.current
    const now = performance.now()
    const why = refusal(v)
    if (why) {
      sfx.refuse()
      toast(why === 'not-a-thing' ? 'not a thing — name something' : why === 'too-vague' ? 'too vague — name the thing itself' : 'no superweapons at this gate', 'bad')
      return
    }
    s.used.add(phraseKey(phrase))
    sfx.fire()

    const field = fieldRef.current?.getBoundingClientRect()
    let total = 0
    const killed: Foe[] = []
    const hits: BestShot['hits'] = []
    for (const f of alive(s)) {
      const r = v.results[f.def.id]
      if (!r) continue // spawned after the call went out
      const dmg = Math.min(f.hp, damageOn(f.def, r))
      f.hits += 1
      f.lastP = r.p
      f.lastDmg = dmg
      f.lastNote = f.def.boss && (r.cond ?? 0) < 0.5 ? 'immune' : ''
      if (dmg <= 0) continue
      f.hp -= dmg
      total += dmg
      hits.push({ name: f.def.name, p: r.p })
      const el = foeEls.current.get(f.uid)?.getBoundingClientRect()
      if (field && el) {
        const x0 = field.width / 2
        const y0 = field.height + 16
        s.shots.push({ id: ++s.uid, text: phrase, element: v.element, x0, y0, dx: el.left + el.width / 2 - field.left - x0, dy: el.top + el.height / 2 - field.top - y0, at: now })
      }
      if (f.hp <= 0) {
        f.deadAt = now + 180 // the projectile lands first
        f.killedBy = phrase
        killed.push(f)
      }
    }

    if (total === 0) {
      sfx.miss()
      toast('no effect', 'info')
      return
    }
    sfx.hit(Math.min(100, total))
    const mult = Math.max(1, killed.length)
    const killPts = killed.reduce((sum, f) => sum + killScore(f.def), 0) * mult
    // Jev's wit score runs 0–2 and the plain answers sit near 1.3; only what clears 1.5 is paid.
    const witPts = v.wit >= 1.5 ? Math.round((v.wit - 1) * 100) : 0
    s.score += total + killPts + witPts
    s.kills += killed.length
    if (killed.length) sfx.kill()
    if (killed.length >= 2) toast(`${killed.length} in one shot  ×${mult}`, 'good')
    if (witPts) toast(`witty  +${witPts}`, 'good')
    if (!s.best || total > s.best.total) s.best = { phrase, total, hits: hits.sort((a, b) => b.p - a.p).slice(0, 3) }
  }, [toast])

  const fire = useCallback(async () => {
    const s = g.current
    if (s.phase !== 'playing' || inFlight) return
    const phrase = cleanPhrase(inputNow.current)
    if (phrase.length < 2) return
    if (s.used.has(phraseKey(phrase))) {
      sfx.refuse()
      toast('already used — every weapon works once', 'bad')
      return
    }
    const ids = alive(s).map((f) => f.def.id)
    if (!ids.length) return

    const reset = () => {
      clearPreview()
      setInput('')
      inputNow.current = ''
      inputRef.current?.focus()
    }

    // An aim preview of this exact phrase that already covers everyone on
    // screen is the verdict: the shot lands with no second call.
    const c = previewCache.current
    if (c && c.phrase === phrase && performance.now() - c.at < PREVIEW_FRESH && ids.every((id) => c.ids.includes(id))) {
      launch(phrase, c.verdict)
      reset()
      return
    }

    setInFlight(true)
    try {
      const v = await fetchVerdict(phrase, ids)
      launch(phrase, v)
      reset()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'the judge is unreachable', 'bad')
    } finally {
      setInFlight(false)
    }
  }, [clearPreview, fetchVerdict, inFlight, launch, toast])

  const start = useCallback(() => {
    unlock()
    const next = fresh()
    next.fieldH = g.current.fieldH
    next.phase = 'playing'
    g.current = next
    previewCache.current = null
    setInput('')
    inputNow.current = ''
    inputRef.current?.focus()
  }, [])

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      setMuted(!m)
      try { localStorage.setItem('rpa:muted', !m ? '1' : '0') } catch {}
      return !m
    })
  }, [])

  const share = useCallback(async () => {
    const s = g.current
    const best = s.best ? ` Best shot: “${s.best.phrase}” → ${s.best.hits.map((h) => h.name).join(', ')}.` : ''
    const text = `I held the gate for ${s.wave - 1} waves (${s.score} pts) in Rock Paper Anything.${best} ${location.origin}/rpa`
    try {
      await navigator.clipboard.writeText(text)
      toast('copied', 'good')
    } catch {
      toast('could not copy', 'bad')
    }
  }, [toast])

  // ── render ──────────────────────────────────────────────────────────────
  const s = g.current
  const now = typeof performance === 'undefined' ? 0 : performance.now()
  const st = s.stats
  const showBanner = s.phase === 'playing' && now < s.bannerUntil

  return (
    <div ref={rootRef} className={`rpa-root${now < s.shakeUntil ? ' rpa-shake' : ''}`}>
      <div className="rpa-col">
        <header className="rpa-hud">
          <div className="rpa-hud-cell">
            <span className="rpa-label">wave</span>
            <span className="rpa-num">{String(Math.max(1, s.wave)).padStart(2, '0')}</span>
          </div>
          <div className="rpa-hud-cell rpa-hud-score">
            <span className="rpa-label">score</span>
            <span className="rpa-num" data-testid="score">{s.score}</span>
          </div>
          <div className="rpa-hud-cell rpa-hud-right">
            <span className="rpa-hearts" aria-label={`${s.hearts} lives`}>
              {Array.from({ length: HEARTS }, (_, i) => <i key={i} className={i < s.hearts ? 'on' : ''} />)}
            </span>
            <button type="button" className="rpa-mute" onClick={toggleMute} aria-label={muted ? 'unmute' : 'mute'}>{muted ? 'sound off' : 'sound on'}</button>
          </div>
        </header>

        <div className="rpa-ticker" data-testid="ticker">
          {st.last
            ? <><span><b>jev</b>{st.last.questions} questions · {st.last.jevMs} ms · {usd(st.last.tokens)}</span><span className="rpa-ticker-run">run: {st.calls} · {usd(st.tokens)}</span></>
            : <span><b>jev</b>one call per shot, a question per enemy</span>}
        </div>

        <div ref={fieldRef} className="rpa-field">
          {s.foes.map((f) => {
            const h = heightOf(f)
            const y = f.travel * (s.fieldH - h)
            const dead = f.deadAt !== null && now >= f.deadAt
            const ghost = Math.min(f.preview, f.hp)
            return (
              <div
                key={f.uid}
                ref={(el) => { if (el) foeEls.current.set(f.uid, el); else foeEls.current.delete(f.uid) }}
                className={`rpa-foe${f.def.boss ? ' boss' : ''}${dead ? ' dead' : ''}${ghost > 0 ? ' aimed' : ''}${f.travel > 0.72 && !dead ? ' near' : ''}`}
                data-enemy-id={f.def.id}
                data-hp={f.hp}
                style={{ left: `${f.x * 100}%`, transform: `translate(${-f.x * 100}%, ${y}px)`, height: h }}
              >
                {/* The outer box is the position; the tag inside is free to shake and fall. */}
                <div className={`rpa-tag${f.lastDmg > 0 ? ` struck-${f.hits % 2}` : ''}`} style={{ ['--tilt' as string]: `${f.tilt}deg` }}>
                  <div className="rpa-foe-row">
                    <span className="rpa-glyph">{f.def.glyph}</span>
                    <span className="rpa-name">{f.def.name}</span>
                    {ghost > 0 && <span className="rpa-aim">−{ghost}</span>}
                  </div>
                  {f.def.boss && <div className="rpa-rule">boss · {f.def.boss.rule}</div>}
                  <div className="rpa-hp">
                    <i style={{ width: `${(Math.max(0, f.hp) / f.max) * 100}%` }} />
                    {ghost > 0 && <em style={{ left: `${((f.hp - ghost) / f.max) * 100}%`, width: `${(ghost / f.max) * 100}%` }} />}
                  </div>
                  {f.hits > 0 && (
                    <span key={f.hits} className={`rpa-float${f.lastDmg > 0 ? ' hit' : ''}`}>
                      {f.lastDmg > 0 ? <b>−{f.lastDmg}</b> : f.lastNote ? <b>{f.lastNote}</b> : null}
                      <small>p {pTxt(f.lastP)}</small>
                    </span>
                  )}
                  {dead && <span className="rpa-stamp">✕ {f.killedBy}</span>}
                </div>
              </div>
            )
          })}

          {s.shots.map((x) => (
            <span key={x.id} className={`rpa-shot el-${x.element}`} style={{ left: x.x0, top: x.y0, ['--dx' as string]: `${x.dx}px`, ['--dy' as string]: `${x.dy}px` }}>
              {x.text}
            </span>
          ))}

          {showBanner && (
            <div className="rpa-banner">
              <b>{s.banner.title}</b>
              <span>{s.banner.sub}</span>
            </div>
          )}

          <div className="rpa-toasts">
            {s.toasts.map((t) => <span key={t.id} className={`rpa-toast ${t.tone}`}>{t.text}</span>)}
          </div>
        </div>

        <div className="rpa-gate"><span>your gate</span></div>

        <form className="rpa-dock" onSubmit={(e) => { e.preventDefault(); void fire() }}>
          <input
            ref={inputRef}
            data-testid="phrase"
            value={input}
            onChange={(e) => onInput(e.target.value)}
            maxLength={MAX_PHRASE}
            placeholder={s.phase === 'playing' ? 'type anything, then enter' : ''}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="send"
            aria-label="your weapon"
          />
          <button type="submit" disabled={inFlight || s.phase !== 'playing'}>{inFlight ? '···' : 'fire'}</button>
        </form>
      </div>

      {s.phase === 'title' && (
        <div className="rpa-overlay">
          <div className="rpa-card">
            <h1 className="rpa-title"><span>Rock</span><span>Paper</span><span className="any">Anything</span></h1>
            <p className="rpa-lede">Things are coming for your gate. Type <em>anything</em>. If it beats them, it hurts them — and every weapon only works once.</p>
            <ul className="rpa-demo">
              <li><em>sunrise</em><span>darkness <b>.87</b> · a vampire <b>.73</b> · a glacier <b>.60</b></span></li>
              <li><em>a long nap</em><span>a hangover <b>.62</b> · a tantrum <b>.61</b> · Monday <b>.55</b></span></li>
              <li><em>I win</em><span>not a thing <b>.06</b></span></li>
            </ul>
            <button type="button" className="rpa-start" data-testid="start" onClick={start}>Start</button>
            {record > 0 && <p className="rpa-record">your best: {record}</p>}
            <p className="rpa-fine">
              The judge is <a href="https://typesafe.ai" target="_blank" rel="noreferrer">Jev</a>, TypeSafe’s System One model. It doesn’t write text; it answers typed questions with calibrated probabilities. One shot is one call: two questions per enemy on screen plus four about your phrase, all answered at once in about 150 ms for a few thousandths of a cent. The probability is the damage.
            </p>
          </div>
        </div>
      )}

      {s.phase === 'over' && (
        <div className="rpa-overlay">
          <div className="rpa-card" data-testid="over">
            <h2 className="rpa-over">The gate fell</h2>
            <div className="rpa-final">
              <div><span className="rpa-label">score</span><b>{s.score}</b></div>
              <div><span className="rpa-label">waves held</span><b>{s.wave - 1}</b></div>
              <div><span className="rpa-label">beaten</span><b>{s.kills}</b></div>
            </div>
            {s.best && (
              <p className="rpa-best">
                best shot: <em>{s.best.phrase}</em> → {s.best.hits.map((h, i) => <span key={i}>{i > 0 && ' · '}{h.name} <b>{pTxt(h.p)}</b></span>)}
              </p>
            )}
            <p className="rpa-receipt">
              Jev answered <b>{st.questions.toLocaleString()}</b> questions in <b>{st.calls}</b> calls, median <b>{median(st.jevMs)} ms</b>, for <b>{usd(st.tokens)}</b>.
            </p>
            <div className="rpa-actions">
              <button type="button" className="rpa-start" data-testid="again" onClick={start}>Again</button>
              <button type="button" className="rpa-ghost" onClick={share}>Copy result</button>
            </div>
            {record > 0 && <p className="rpa-record">your best: {record}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
