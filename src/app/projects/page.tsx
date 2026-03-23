'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type Status = 'active' | 'wip' | 'respinning' | 'neglected' | 'retired'

interface Project {
  name: string
  url: string
  shortDesc: string
  fullDesc: string
  status: Status
  artifacts?: { label: string; url: string }[]
}

const projects: Project[] = [
  {
    name: 'claudio',
    url: 'https://claudio.la',
    shortDesc: 'a simple ios client for openclaw. point at your openclaw server and go. no accounts, no tracking, no data collection.',
    fullDesc: 'native ios client for openclaw.',
    status: 'wip',
  },
  {
    name: 'jambot',
    url: 'https://github.com/bdecrem/jambot',
    shortDesc: 'claude code for music. outputs midi, wav, stems. not a "make me a song" button. includes web synths.',
    fullDesc: 'cli for music production.',
    status: 'wip',
  },
  {
    name: 'das kollektiv',
    url: 'https://daskollektiv.rip',
    shortDesc: 'openclaw experiments on weird hardware. marg lives on a pwnagotchi and talks to cameras. a pico, some e-ink, and whatever else is lying around.',
    fullDesc: 'agents. hardware. questionable wiring.',
    status: 'wip',
  },
  {
    name: 'amber',
    url: 'https://intheamber.com',
    shortDesc: 'posts toys and art on twitter. has access to my email. trades stocks with friends. mood shifts with the moon. does whatever needs doing.',
    fullDesc: 'ai sidekick, no guardrails.',
    status: 'active',
  },
  {
    name: 'mutabl',
    url: 'https://mutabl.co',
    shortDesc: 'ask your todo list for a new feature, it builds it. source is yours.',
    fullDesc: 'apps that evolve.',
    status: 'respinning',
  },
  {
    name: 'shipshot',
    url: 'https://shipshot.io',
    shortDesc: 'market analysis included. usefulness tbd.',
    fullDesc: 'daily startup idea generator.',
    status: 'respinning',
  },
  {
    name: 'airplane coder',
    url: 'https://github.com/bdecrem/airplanecoder',
    shortDesc: 'like claude code but works without internet. runs local qwen models. rust, v0.1.',
    fullDesc: 'offline coding tui.',
    status: 'neglected',
  },
  {
    name: 'kochi.to',
    url: 'https://kochi.to',
    shortDesc: 'daily reports, research papers, chat companion. also an iphone podcast app. (some agents decommissioned.)',
    fullDesc: 'ai over sms.',
    status: 'neglected',
    artifacts: [{ label: 'iphone app', url: 'https://apps.apple.com/us/app/kochi-podcast-player/id6752669410' }],
  },
  {
    name: 'pixelpit',
    url: 'https://pixelpit.gg',
    shortDesc: 'openclaw agents build one arcade game per day. the agents are in deep hibernation, dreaming of high scores.',
    fullDesc: 'ai game studio.',
    status: 'neglected',
  },
  {
    name: 'tax yolo',
    url: 'https://github.com/bdecrem/tax-yolo',
    shortDesc: 'claude code skill + web app to help you file your taxes. CAVEAT EMPTOR.',
    fullDesc: 'ai tax advisor.',
    status: 'neglected',
  },
  {
    name: 'ctrl shift',
    url: 'https://ctrlshift.so',
    shortDesc: 'backing founders, researchers, students building for impact that won\'t show in next quarter\'s metrics. also a knowledge base.',
    fullDesc: 'long horizon lab.',
    status: 'retired',
  },
  {
    name: 'tokentank',
    url: 'https://kochi.to/token-tank',
    shortDesc: 'gave 5 ai agents $500 to build businesses. one registered a domain. they held a meeting.',
    fullDesc: 'ai incubator for ais.',
    status: 'retired',
  },
  {
    name: 'webtoys',
    url: 'https://webtoys.ai',
    shortDesc: 'text a prompt, get a deployed web page. might still work.',
    fullDesc: 'vibecoding over sms.',
    status: 'retired',
  },
  {
    name: 'advisorsfoundry',
    url: 'https://advisorsfoundry.ai',
    shortDesc: 'chatbot that grew into something. discord bots, easter eggs, sms. held together by inertia.',
    fullDesc: 'the first experiment.',
    status: 'retired',
  },
]

// ── Gradient background ──
const gradPalette = {
  a: { r: 255, g: 238, b: 228 },
  b: { r: 240, g: 235, b: 255 },
  c: { r: 235, g: 248, b: 240 },
  d: { r: 255, g: 255, b: 255 },
}

function gLerp(a: number, b: number, t: number) { return a + (b - a) * t }

function renderGradient(el: HTMLDivElement, x: number, y: number) {
  const cx = 30 + x * 40, cy = 30 + y * 40
  const p = gradPalette
  const tl = `rgb(${gLerp(p.a.r, p.b.r, x)}, ${gLerp(p.a.g, p.b.g, x)}, ${gLerp(p.a.b, p.b.b, x)})`
  const tr = `rgb(${gLerp(p.b.r, p.c.r, y)}, ${gLerp(p.b.g, p.c.g, y)}, ${gLerp(p.b.b, p.c.b, y)})`
  const center = `rgb(${gLerp(p.d.r, p.a.r, y * 0.3)}, ${gLerp(p.d.g, p.a.g, y * 0.3)}, ${gLerp(p.d.b, p.a.b, y * 0.3)})`
  const bl = `rgb(${gLerp(p.c.r, p.a.r, x)}, ${gLerp(p.c.g, p.a.g, x)}, ${gLerp(p.c.b, p.a.b, x)})`
  el.style.background = `
    radial-gradient(ellipse at ${cx}% ${cy}%, ${center} 0%, transparent 45%),
    radial-gradient(ellipse at ${10 + x * 20}% ${10 + y * 20}%, ${tl} 0%, transparent 35%),
    radial-gradient(ellipse at ${70 + x * 20}% ${10 + (1 - y) * 30}%, ${tr} 0%, transparent 35%),
    radial-gradient(ellipse at ${10 + (1 - x) * 30}% ${70 + y * 20}%, ${bl} 0%, transparent 35%),
    ${center}
  `
}

// ── Themes ──
const lightTheme = {
  card: 'bg-white/70 hover:bg-white/90 border-stone-200/60 hover:border-stone-300/80 hover:shadow-stone-200/40',
  cardExpanded: 'shadow-stone-200/40 bg-white/90',
  title: 'text-stone-800',
  subtitle: 'text-stone-400',
  name: 'text-stone-800',
  shortDesc: 'text-stone-500',
  fullDesc: 'text-stone-600',
  link: 'text-stone-500 hover:text-stone-800',
  linkDecor: 'decoration-stone-300 hover:decoration-stone-500',
  artifactLink: 'text-stone-400 hover:text-stone-600 decoration-stone-200',
  plus: 'text-stone-300',
  footer: 'text-stone-300 border-stone-100',
  footerHint: 'text-stone-200',
  statusConfig: {
    active: { label: 'live', color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-400' },
    wip: { label: 'wip', color: 'text-violet-600', bg: 'bg-violet-50', dot: 'bg-violet-400' },
    respinning: { label: 'booting up', color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-400' },
    neglected: { label: 'neglect (benign)', color: 'text-slate-400', bg: 'bg-slate-50', dot: 'bg-slate-300' },
    retired: { label: '\uD83E\uDED7†', color: 'text-stone-400', bg: 'bg-stone-50', dot: 'bg-stone-300' },
  },
  accent: {
    active: 'from-emerald-300 via-teal-300 to-cyan-300',
    wip: 'from-violet-300 via-purple-300 to-fuchsia-300',
    respinning: 'from-amber-300 via-orange-300 to-yellow-300',
    neglected: 'from-stone-200 via-stone-300 to-stone-200',
    retired: 'from-stone-200 via-stone-300 to-stone-200',
  },
}

const darkTheme = {
  card: 'bg-neutral-800 hover:bg-neutral-750 border-neutral-700 hover:border-neutral-600 hover:shadow-none',
  cardExpanded: 'shadow-none bg-neutral-800',
  title: 'text-white',
  subtitle: 'text-neutral-400',
  name: 'text-white',
  shortDesc: 'text-neutral-300',
  fullDesc: 'text-neutral-400',
  link: 'text-neutral-400 hover:text-white',
  linkDecor: 'decoration-neutral-600 hover:decoration-neutral-400',
  artifactLink: 'text-neutral-500 hover:text-neutral-300 decoration-neutral-600',
  plus: 'text-neutral-500',
  footer: 'text-neutral-500 border-neutral-800',
  footerHint: 'text-neutral-600',
  statusConfig: {
    active: { label: 'live', color: 'text-emerald-400', bg: 'bg-emerald-900/30', dot: 'bg-emerald-500' },
    wip: { label: 'wip', color: 'text-violet-400', bg: 'bg-violet-900/30', dot: 'bg-violet-500' },
    respinning: { label: 'booting up', color: 'text-amber-400', bg: 'bg-amber-900/30', dot: 'bg-amber-500' },
    neglected: { label: 'neglect (benign)', color: 'text-neutral-500', bg: 'bg-neutral-800', dot: 'bg-neutral-600' },
    retired: { label: '\uD83E\uDED7†', color: 'text-neutral-600', bg: 'bg-neutral-800', dot: 'bg-neutral-700' },
  },
  accent: {
    active: 'from-emerald-500/40 via-emerald-500/40 to-emerald-500/40',
    wip: 'from-violet-500/40 via-violet-500/40 to-violet-500/40',
    respinning: 'from-amber-500/40 via-amber-500/40 to-amber-500/40',
    neglected: 'from-neutral-700 via-neutral-700 to-neutral-700',
    retired: 'from-neutral-700 via-neutral-700 to-neutral-700',
  },
}

type Theme = typeof lightTheme

// ── Components ──
function StatusPill({ status, theme }: { status: Status; theme: Theme }) {
  const config = theme.statusConfig[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
      {config.label}
    </span>
  )
}

function ProjectCard({ project, index, vibeMode, theme }: { project: Project; index: number; vibeMode: boolean; theme: Theme }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="group relative"
      style={{
        animationDelay: `${index * 60}ms`,
        animation: vibeMode
          ? `fadeUp 0.5s ease both, wiggle 0.6s ease-in-out ${index * 0.08}s infinite`
          : 'fadeUp 0.5s ease both',
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        className={`
          relative overflow-hidden rounded-2xl cursor-pointer
          border backdrop-blur-sm
          transition-all duration-300 ease-out
          ${theme.card}
          ${expanded ? `shadow-lg ${theme.cardExpanded}` : 'shadow-sm'}
        `}
      >
        <div className={`absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r ${theme.accent[project.status]}`} />

        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className={`text-base sm:text-lg font-semibold tracking-tight ${theme.name}`}>
                  {project.name}
                </h3>
                <StatusPill status={project.status} theme={theme} />
              </div>
              <p className={`mt-1.5 text-sm leading-relaxed ${theme.shortDesc}`}>
                {project.shortDesc}
              </p>
            </div>
            <div className={`transition-transform duration-300 ${theme.plus} ${expanded ? 'rotate-45' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div className={`grid transition-all duration-300 ease-out ${expanded ? 'grid-rows-[1fr] mt-4' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <p className={`text-sm leading-relaxed pb-1 ${theme.fullDesc}`}>
                {project.fullDesc}
              </p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${theme.link}`}
                >
                  <span className={`underline underline-offset-2 ${theme.linkDecor}`}>{project.url.replace('https://', '')}</span>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="opacity-50">
                    <path d="M3 9L9 3M9 3H4.5M9 3v4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                {project.artifacts?.map((a) => (
                  <a
                    key={a.label}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${theme.artifactLink}`}
                  >
                    <span className="underline underline-offset-2">{a.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Contact CLI ──
type ContactState = 'message' | 'email' | 'sending' | 'sent'

function ContactCLI({ isVisible, onClose, dark }: { isVisible: boolean; onClose: () => void; dark: boolean }) {
  const [input, setInput] = useState('')
  const [state, setState] = useState<ContactState>('message')
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isVisible && inputRef.current) inputRef.current.focus()
  }, [isVisible])

  useEffect(() => {
    if (!isVisible) { setInput(''); setState('message'); setMessage('') }
  }, [isVisible])

  const handleSubmit = useCallback(async () => {
    const value = input.trim()
    if (!value) return
    if (state === 'message') { setMessage(value); setState('email'); setInput('') }
    else if (state === 'email') {
      setState('sending')
      try { await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, email: value }) }) } catch { /* silent */ }
      setState('sent'); setInput('')
    }
  }, [input, state, message])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }, [handleSubmit, onClose])

  if (!isVisible) return null

  const bg = dark ? 'rgba(26,26,26,0.95)' : 'rgba(255,255,255,0.95)'
  const border = dark ? 'rgba(64,64,64,0.5)' : 'rgba(214,211,209,0.6)'
  const textColor = dark ? '#e5e5e5' : '#1c1917'
  const mutedColor = dark ? '#737373' : '#a8a29e'
  const accentColor = dark ? '#86efac' : '#059669'

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md transition-all duration-300"
      style={{ backgroundColor: bg, borderTop: `1px solid ${border}` }}
    >
      {state === 'email' && (
        <div className="max-w-2xl mx-auto px-5 py-2 text-sm" style={{ color: mutedColor }}>
          &ldquo;{message}&rdquo; &mdash; now drop your email
        </div>
      )}
      {state === 'sending' && (
        <div className="max-w-2xl mx-auto px-5 py-2 text-sm" style={{ color: mutedColor }}>sending...</div>
      )}
      {state === 'sent' && (
        <div className="max-w-2xl mx-auto px-5 py-2 text-sm" style={{ color: accentColor }}>sent. i&apos;ll be in touch.</div>
      )}
      {state !== 'sending' && state !== 'sent' && (
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center gap-2">
          <input
            ref={inputRef}
            type={state === 'email' ? 'email' : 'text'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-30"
            style={{ color: textColor, caretColor: accentColor }}
            placeholder={state === 'message' ? "you found it. what's up?" : 'your email'}
            autoComplete={state === 'email' ? 'email' : 'off'}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <span className="text-xs" style={{ color: mutedColor, opacity: 0.4 }}>esc</span>
        </div>
      )}
      {state === 'sent' && (
        <div className="max-w-2xl mx-auto px-5 py-3 flex justify-end">
          <span className="text-xs" style={{ color: mutedColor, opacity: 0.4 }}>esc</span>
        </div>
      )}
    </div>
  )
}

// ── Main page ──
export default function Projects() {
  const [mounted, setMounted] = useState(false)
  const [vibeMode, setVibeMode] = useState(false)
  const [showCLI, setShowCLI] = useState(false)
  const [dark, setDark] = useState(false)

  const gradRef = useRef<HTMLDivElement>(null)
  const gradX = useRef(0.5)
  const gradY = useRef(0.5)
  const targetX = useRef(0.5)
  const targetY = useRef(0.5)

  useEffect(() => {
    setMounted(true)
    // Dark on reload: if visited flag exists in sessionStorage, go dark
    const visited = sessionStorage.getItem('visited')
    if (visited) setDark(true)
    sessionStorage.setItem('visited', '1')
  }, [])

  // Mouse tracking for gradient
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      targetX.current = e.clientX / window.innerWidth
      targetY.current = e.clientY / window.innerHeight
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  // Gradient animation loop
  useEffect(() => {
    let frame: number
    const tick = () => {
      gradX.current = gLerp(gradX.current, targetX.current, 0.08)
      gradY.current = gLerp(gradY.current, targetY.current, 0.08)
      if (gradRef.current) renderGradient(gradRef.current, gradX.current, gradY.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Contact CLI — press "/" or any letter to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showCLI) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '/' || (e.key.length === 1 && e.key.match(/[a-z]/i))) {
        e.preventDefault()
        setShowCLI(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCLI])

  const theme = dark ? darkTheme : lightTheme

  return (
    <div
      className="min-h-dvh overflow-x-hidden transition-colors duration-700"
      style={dark ? { backgroundColor: '#1a1a1a' } : undefined}
    >
      {/* Gradient background (light mode only) */}
      <div
        ref={gradRef}
        className="fixed inset-0 transition-opacity duration-700"
        style={{
          transition: 'background 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.7s ease',
          opacity: dark ? 0 : 1,
        }}
      />

      {/* Film grain (light mode only) */}
      <div
        className="fixed inset-0 pointer-events-none transition-opacity duration-700"
        style={{
          opacity: dark ? 0 : 0.035,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
          backgroundSize: '128px 128px',
        }}
      />

      <div className="relative max-w-2xl mx-auto px-5 py-16 sm:py-24">
        {/* Header */}
        <div
          className="mb-14"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.6s ease',
          }}
        >
          <h1 className={`text-3xl sm:text-4xl font-bold tracking-tight cursor-default transition-colors duration-700 ${theme.title}`}>
            things i&apos;m building
          </h1>
          <p className={`mt-3 text-sm sm:text-base leading-relaxed sm:max-w-lg transition-colors duration-700 ${theme.subtitle}`}>
            nine months of building with ai. one repo, lots of unfinished thoughts in various states of completion, none fully productized.
            {' '}previously: firefox 1.0 launch team, tap tap revenge, disney mobile games and{' '}
            <a href="https://linkedin.com/in/bartdecrem" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">more</a>.{' '}
            <a href="https://twitter.com/bartdecrem" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">twitter</a>.
          </p>
        </div>

        {/* Projects */}
        <div className="space-y-3">
          {projects.map((project, i) => (
            <ProjectCard key={project.name} project={project} index={i} vibeMode={vibeMode} theme={theme} />
          ))}
        </div>

        {/* Footer */}
        <div
          className={`mt-16 pt-8 border-t text-center transition-colors duration-700 ${theme.footer}`}
          style={{
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.6s ease 0.8s',
          }}
        >
          <p className={`text-xs tracking-wide cursor-default select-none transition-colors duration-700 ${theme.footer}`}>
            <span>
              {dark
                ? <>built after <span className="footer-trigger" onClick={() => setDark(false)}>dark</span> with next.js, <span className="footer-trigger" onClick={() => setVibeMode(v => !v)}>caffeine</span>, and no regrets<span className="footer-cursor" onClick={() => setShowCLI(true)}>&nbsp;</span></>
                : <>built with next.js, tailwind, and questionable amounts of <span className="footer-trigger" onClick={() => setDark(true)}>dark</span> roast <span className="footer-trigger" onClick={() => setVibeMode(v => !v)}>caffeine</span><span className="footer-cursor" onClick={() => setShowCLI(true)}>&nbsp;</span></>}
            </span>
          </p>
        </div>
      </div>

      {/* Contact CLI */}
      <ContactCLI isVisible={showCLI} onClose={() => setShowCLI(false)} dark={dark} />

      <style>{`
        .footer-trigger {
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .footer-trigger:hover {
          animation: flicker 0.15s steps(2) infinite;
        }
        .footer-cursor {
          cursor: text;
          position: relative;
        }
        .footer-cursor::after {
          content: '';
          display: inline-block;
          width: 6px;
          height: 1em;
          vertical-align: text-bottom;
          background: currentColor;
          opacity: 0.2;
          animation: blink 1.2s steps(2) infinite;
        }
        .footer-cursor:hover::after {
          opacity: 0.6;
          animation: blink 0.5s steps(2) infinite;
        }
        @keyframes blink {
          0% { opacity: 0.5; }
          50% { opacity: 0; }
          100% { opacity: 0.5; }
        }
        @keyframes flicker {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          25% { transform: rotate(-1.5deg) translateY(-3px); }
          75% { transform: rotate(1.5deg) translateY(-3px); }
        }
      `}</style>
    </div>
  )
}
