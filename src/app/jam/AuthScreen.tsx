'use client'

import { useEffect, useRef, useState } from 'react'
import { api, type JamUser } from './api'
import Catalog from './Catalog'

// The signed-out jambot.to homepage: an essay-style landing in the manner of
// dodo.foo — a developer talking to developers — with six phone screenshots,
// the idea, what it does, the fine print, then the public catalog and the
// sign-in / create-account form. Signed-in visitors never see this (JamApp
// routes them straight to the library).
//
// "jam:seen" only decides whether the auth form opens automatically for a
// returning signed-out visitor; it never skips the page.

const GITHUB_URL = 'https://github.com/bdecrem/jambot'
const TESTFLIGHT_URL = 'https://testflight.apple.com/join/gDfvCAp1'
const SEEN_KEY = 'jam:seen'

// Six beats, each a real screen from the iPhone app (public/jam/scenes/*.webp,
// exported from the simulator at 840×1826).
const SCENES = [
  { id: 'studio', line: 'Say it like you’d say it to a producer.', sub: 'A chat that programs synths. Every tool call it makes shows up as a chip you can open.' },
  { id: 'faders', line: 'Then grab the fader.', sub: 'Tempo, swing, every voice’s level, decay, tune, cutoff — the same values the agent just set.' },
  { id: 'panels', line: 'Or the synth’s own panel.', sub: 'The JT-90, JB202, JT-30 and JT-10 front panels, knobs and all, wired to the same session.' },
  { id: 'seq', line: 'Or the step.', sub: 'A 16-step sequencer per instrument — hits, accents, notes, slides — one section at a time.' },
  { id: 'library', line: 'Every track is yours.', sub: 'Saved as it plays, chat and all. Duplicate it, rename it, publish it.' },
  { id: 'player', line: 'Remix anyone’s.', sub: 'Play anything in the public catalog without an account; remix it into your library with a fresh chat.' },
]

const SAY = [
  'techno at 128 with a 909 kick and offbeat hats',
  'add a deep sub bassline on the 202',
  'make the kick punchier and add swing',
  'save this as A, then give me a B part with 16th hats',
  'turn it into a 64-bar song with a breakdown at 33',
  'mute the lead, solo the acid',
]

export default function AuthScreen({ onSignedIn, hint }: { onSignedIn: (u: JamUser) => void; hint?: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [formOpen, setFormOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)

  // Read the pre-existing value once (into a ref, not state) before writing —
  // React's dev-mode double effect invoke would otherwise read back its own
  // write on the second pass and think every first-time visitor is returning.
  const seenBeforeRef = useRef<boolean | null>(null)
  useEffect(() => {
    try {
      if (seenBeforeRef.current === null) seenBeforeRef.current = localStorage.getItem(SEEN_KEY) === '1'
      if (seenBeforeRef.current || hint) setFormOpen(true)
      localStorage.setItem(SEEN_KEY, '1')
    } catch { /* noop */ }
  }, [hint])

  const openForm = (m: 'login' | 'signup') => {
    setMode(m)
    setFormOpen(true)
    setError('')
    // The form sits under the CTAs; bring it into view once it has rendered.
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30)
  }

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { user } = mode === 'login' ? await api.login(username, password) : await api.signup(username, password)
      onSignedIn(user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const form = (
    <form ref={formRef} id="auth" onSubmit={submit} className="jb-card jl-form flex flex-col gap-3 p-4">
      <div className="jb-row">
        <span className="jb-eyebrow">{mode === 'login' ? 'Sign in' : 'New account'}</span>
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }} className="jb-readout underline underline-offset-4">
          {mode === 'login' ? 'create an account' : 'I have an account'}
        </button>
      </div>
      {hint && <p className="rounded-xl bg-[#0f9f6e]/12 px-3 py-2 text-sm text-[#0a7a54]">{hint}</p>}
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="username"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="username"
        className="jb-field"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        className="jb-field"
      />
      {error && <p className="jb-note err">{error}</p>}
      <button type="submit" disabled={busy || !username || !password} className="jb-key jb-key--orange jb-key--wide mt-1">
        {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
    </form>
  )

  return (
    <div className="jb-screen">
      <div className="jl">
        <header className="jl-top">
          <a className="jl-brand" href="/" aria-label="Jambot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jam/mark-dark.png" alt="" width={30} height={30} />
            <span className="jb-wordmark jb-wordmark--bar">Jambot<span className="dot" /></span>
          </a>
          <nav className="jl-nav">
            <a href={GITHUB_URL} target="_blank" rel="noopener">GitHub</a>
            <button type="button" onClick={() => openForm('login')}>Sign in</button>
          </nav>
        </header>

        <h1 className="jl-h1">
          Jambot is an AI groovebox: talk to it the way you’d talk to a producer and it programs real synth engines — 909 drums, 303 acid, 101 leads — in your browser, on your phone and in your terminal.{' '}
          <em>Every parameter tweakable, every pattern yours.</em>
        </h1>

        {/* Scenes: 214px cards, three across at 720 (214×3 + 22×2 = 686), a snap row on phones. */}
        <div className="jl-scenes" aria-label="Screens from the iPhone app">
          {SCENES.map((s) => (
            <figure key={s.id} className="jl-scene">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/jam/scenes/${s.id}.webp`} alt={s.line} width={840} height={1826} loading="lazy" />
              <figcaption>
                <h3>{s.line}</h3>
                <p>{s.sub}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="jl-cta">
          <button type="button" onClick={() => scrollTo('listen')} className="jb-key jb-key--orange">Remix a track</button>
          <button type="button" onClick={() => openForm('signup')} className="jb-key jb-key--panel">Make a new track</button>
        </div>
        <p className="jl-tf">
          Free in the browser. For the iPhone and Mac app,{' '}
          <a href={TESTFLIGHT_URL} target="_blank" rel="noopener">request TestFlight access</a>.
        </p>

        {formOpen && <div className="mt-5">{form}</div>}

        <section className="jl-section">
          <div className="jl-label"><span className="jl-led" /><span className="jb-eyebrow">The idea</span></div>
          <p className="jl-p">
            Jambot started as a command-line program: Claude Code for grooves. You type “give me a four-on-the-floor kick with offbeat hats” and it programs real synth engines — a 909-style drum machine, a 303-style acid bass, a 101-style lead, a modular rack, a sample player — and drops a WAV in a folder you can drag into your DAW. No black-box AI slop: it isn’t generating audio, it’s turning knobs on synths, and the synths are the product.
          </p>
          <p className="jl-p">
            One rule makes the whole thing work: <strong>the agent is just a user.</strong> Every instrument and effect exposes its parameters through one addressable system — <code>jt90.kick.decay</code>, <code>jt30.bass.cutoff</code>, <code>fx.jt10.delay1.feedback</code> — and the model reads and writes exactly the values the faders, the panels and the step sequencer do. It has no private channel to the audio. When it does something you don’t like, the knob it turned is right there, and you turn it back.
          </p>
          <p className="jl-p">
            Then it left the terminal. The same JavaScript engine now runs inside your browser, and inside the iPhone and Mac app; the server does nothing but store your tracks and sign the model calls. A track is a JSON session — patterns, parameters, effects, arrangement, plus the chat that made it — so the web app, the phone app and the CLI all open the same file.
          </p>
          <p className="jl-p">
            It’s built for sketches: a loop that becomes eight bars, then a B section, then a 128-bar song with a breakdown, bounced to WAV and finished somewhere else. Five synths and a sampler, not a DAW. Things you can say to it:
          </p>
          <ul className="jl-say">
            {SAY.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </section>

        <section className="jl-section">
          <div className="jl-label"><span className="jl-led" /><span className="jb-eyebrow">What it does</span></div>
          <ul className="jl-feat">
            <li><strong>A chat that programs synths</strong> — describe the beat, the bass, the change you want; it calls the same tools you could (add_jt90, tweak, save_pattern, set_arrangement, render) and plays the result back in a few seconds. Every call is visible.</li>
            <li><strong>Faders</strong> — tempo, swing, length, then every instrument’s level and the parameters worth a slider. In song mode a fader writes through to every saved pattern, so what you hear is what gets saved.</li>
            <li><strong>Panels</strong> — the synths’ own front panels (JT-90, JB01, JB202, JT-30, JT-10, plus delay, reverb and sidechain), knobs and waveform switches bound to the live session. LEDs flash on each instrument’s hits.</li>
            <li><strong>A step sequencer</strong> — one instrument at a time, eight steps to a page on a phone: per-voice drum rows that cycle off → hit → accent, note rows with a step editor (octave, semitone, accent, slide) for the mono synths, 1/2/4-bar patterns, and a “loop this section” key so you edit a B part while hearing only the B part.</li>
            <li><strong>Song mode</strong> — save patterns as A, B, C per instrument, arrange sections up to 128 bars, mute and solo per instrument, automate a parameter across a section.</li>
            <li><strong>Publish and remix</strong> — put a track in the public catalog at jambot.to; anyone can play it, and anyone signed in can remix it: a full copy of the session in their own library with a fresh chat.</li>
            <li><strong>Bounce</strong> — WAV or MP3 from the browser, WAV or AAC from the phone, straight to Files or your DAW.</li>
            <li><strong>The iPhone and Mac app</strong> — the same engine in a native shell: it renders in its own process so the screen never freezes, keeps playing with the phone locked, remembers your tracks’ last render so they open instantly, and comes in dark and light. On TestFlight.</li>
            <li><strong>The CLI</strong> — where it started. <code>node jambot.js</code>, your own Anthropic key, WAVs and MIDI in <code>~/Documents/Jambot</code>. Open source.</li>
            <li><strong>What it doesn’t do well yet</strong> — every change re-renders the loop offline, so on a phone a fader move takes a second or two to hear; there is no live input, no recording, no MIDI in the apps. It is a sketchpad with an opinion, and it is v0.x.</li>
          </ul>
          <p className="jl-more"><a href={GITHUB_URL} target="_blank" rel="noopener">More in the repo →</a></p>
        </section>

        <section className="jl-section">
          <div className="jl-label"><span className="jl-led" /><span className="jb-eyebrow">The fine print</span></div>
          <p className="jl-p jb-muted">
            It’s a v0.x — a sketchpad, not a product. The web app is free to try; the iPhone and Mac app is on TestFlight; the CLI is open source. Tracks you publish are public, tracks you don’t are yours alone.
          </p>
          <p className="jl-tf">
            <a href={TESTFLIGHT_URL} target="_blank" rel="noopener">Request TestFlight access</a> · <a href={GITHUB_URL} target="_blank" rel="noopener">Jambot on GitHub</a>
          </p>
        </section>

        <section id="listen" className="jl-section">
          <div className="jl-label"><span className="jl-led" /><span className="jb-eyebrow">Listen, then remix</span></div>
          <p className="jl-p jb-muted">Pick a track, press play, hit Remix. You’ll be asked for an account and the copy opens in your library.</p>
          <Catalog title="Catalog" emptyText="Nothing published yet." />
        </section>

        {!formOpen && (
          <section className="jl-section">
            <div className="jl-label"><span className="jl-led" /><span className="jb-eyebrow">Start</span></div>
            <div className="jl-cta">
              <button type="button" onClick={() => openForm('signup')} className="jb-key jb-key--orange">Make a new track</button>
              <button type="button" onClick={() => openForm('login')} className="jb-key jb-key--panel">Sign in</button>
            </div>
          </section>
        )}

        <footer className="jl-foot">
          <span className="jb-readout">Made by Bart Decrem · jambot.to</span>
        </footer>
      </div>
    </div>
  )
}
