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
    shortDesc: 'native ios client for openclaw',
    fullDesc: 'point at your openclaw server and go. no accounts, no tracking, no data collection.',
    status: 'wip',
  },
  {
    name: 'jambot',
    url: 'https://github.com/bdecrem/jambot',
    shortDesc: 'cli for music production',
    fullDesc: 'claude code for music. outputs midi, wav, stems. not a "make me a song" button. includes web synths.',
    status: 'wip',
  },
  {
    name: 'das kollektiv',
    url: 'https://daskollektiv.rip',
    shortDesc: 'agents on weird hardware',
    fullDesc: 'openclaw experiments on pwnagotchi, e-ink, pico, and whatever else is lying around.',
    status: 'wip',
  },
  {
    name: 'amber',
    url: 'https://intheamber.com',
    shortDesc: 'ai sidekick, no guardrails',
    fullDesc: 'posts art on twitter. has access to my email. trades stocks with friends. mood shifts with the moon.',
    status: 'active',
  },
  {
    name: 'mutabl',
    url: 'https://mutabl.co',
    shortDesc: 'apps that evolve',
    fullDesc: 'ask your todo list for a new feature, it builds it. source is yours.',
    status: 'respinning',
  },
  {
    name: 'shipshot',
    url: 'https://shipshot.io',
    shortDesc: 'daily startup idea generator',
    fullDesc: 'market analysis included. usefulness tbd.',
    status: 'respinning',
  },
  {
    name: 'airplane coder',
    url: 'https://github.com/bdecrem/airplanecoder',
    shortDesc: 'offline coding tui',
    fullDesc: 'like claude code but works without internet. runs local qwen models. rust, v0.1.',
    status: 'neglected',
  },
  {
    name: 'kochi.to',
    url: 'https://kochi.to',
    shortDesc: 'ai over sms',
    fullDesc: 'daily reports, research papers, chat companion. also an iphone podcast app.',
    status: 'neglected',
    artifacts: [{ label: 'iphone app', url: 'https://apps.apple.com/us/app/kochi-podcast-player/id6752669410' }],
  },
  {
    name: 'pixelpit',
    url: 'https://pixelpit.gg',
    shortDesc: 'ai game studio',
    fullDesc: 'agents build one arcade game per day. currently in deep hibernation, dreaming of high scores.',
    status: 'neglected',
  },
  {
    name: 'tax yolo',
    url: 'https://github.com/bdecrem/tax-yolo',
    shortDesc: 'ai tax advisor',
    fullDesc: 'claude code skill + web app to help you file your taxes. caveat emptor.',
    status: 'neglected',
  },
  {
    name: 'ctrl shift',
    url: 'https://ctrlshift.so',
    shortDesc: 'long horizon lab',
    fullDesc: 'backing founders, researchers, students building for impact that won\'t show in next quarter\'s metrics.',
    status: 'retired',
  },
  {
    name: 'tokentank',
    url: 'https://kochi.to/token-tank',
    shortDesc: 'ai incubator for ais',
    fullDesc: 'gave 5 ai agents $500 to build businesses. one registered a domain. they held a meeting.',
    status: 'retired',
  },
  {
    name: 'webtoys',
    url: 'https://webtoys.ai',
    shortDesc: 'vibecoding over sms',
    fullDesc: 'text a prompt, get a deployed web page. might still work.',
    status: 'retired',
  },
  {
    name: 'advisorsfoundry',
    url: 'https://advisorsfoundry.ai',
    shortDesc: 'the first experiment',
    fullDesc: 'chatbot that grew into something. discord bots, easter eggs, sms. held together by inertia.',
    status: 'retired',
  },
]

// Light mode
const lightTheme = {
  bg: 'from-orange-50/40 via-white to-rose-50/30',
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
  blob1: 'from-violet-200/20 to-fuchsia-200/20',
  blob2: 'from-amber-200/20 to-orange-200/15',
  blob3: 'from-emerald-200/15 to-teal-200/15',
  statusConfig: {
    active: { label: 'live', color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-400' },
    wip: { label: 'building', color: 'text-violet-600', bg: 'bg-violet-50', dot: 'bg-violet-400' },
    respinning: { label: 'rethinking', color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-400' },
    neglected: { label: 'napping', color: 'text-slate-400', bg: 'bg-slate-50', dot: 'bg-slate-300' },
    retired: { label: 'archived', color: 'text-stone-400', bg: 'bg-stone-50', dot: 'bg-stone-300' },
  },
  accent: {
    active: 'from-emerald-300 via-teal-300 to-cyan-300',
    wip: 'from-violet-300 via-purple-300 to-fuchsia-300',
    respinning: 'from-amber-300 via-orange-300 to-yellow-300',
    neglected: 'from-stone-200 via-stone-300 to-stone-200',
    retired: 'from-stone-200 via-stone-300 to-stone-200',
  },
}

// Dark mode
const darkTheme = {
  bg: 'from-stone-950 via-stone-900 to-stone-950',
  card: 'bg-stone-800/50 hover:bg-stone-800/70 border-stone-700/40 hover:border-stone-600/60 hover:shadow-stone-900/60',
  cardExpanded: 'shadow-stone-900/60 bg-stone-800/70',
  title: 'text-stone-100',
  subtitle: 'text-stone-500',
  name: 'text-stone-200',
  shortDesc: 'text-stone-400',
  fullDesc: 'text-stone-400',
  link: 'text-stone-400 hover:text-stone-200',
  linkDecor: 'decoration-stone-600 hover:decoration-stone-400',
  artifactLink: 'text-stone-500 hover:text-stone-300 decoration-stone-600',
  plus: 'text-stone-600',
  footer: 'text-stone-600 border-stone-800',
  footerHint: 'text-stone-700',
  blob1: 'from-violet-500/8 to-fuchsia-500/8',
  blob2: 'from-amber-500/6 to-orange-500/5',
  blob3: 'from-emerald-500/5 to-teal-500/5',
  statusConfig: {
    active: { label: 'live', color: 'text-emerald-400', bg: 'bg-emerald-950/50', dot: 'bg-emerald-500' },
    wip: { label: 'building', color: 'text-violet-400', bg: 'bg-violet-950/50', dot: 'bg-violet-500' },
    respinning: { label: 'rethinking', color: 'text-amber-400', bg: 'bg-amber-950/50', dot: 'bg-amber-500' },
    neglected: { label: 'napping', color: 'text-stone-500', bg: 'bg-stone-800/50', dot: 'bg-stone-600' },
    retired: { label: 'archived', color: 'text-stone-600', bg: 'bg-stone-800/40', dot: 'bg-stone-700' },
  },
  accent: {
    active: 'from-emerald-500/60 via-teal-500/60 to-cyan-500/60',
    wip: 'from-violet-500/60 via-purple-500/60 to-fuchsia-500/60',
    respinning: 'from-amber-500/60 via-orange-500/60 to-yellow-500/60',
    neglected: 'from-stone-600 via-stone-500 to-stone-600',
    retired: 'from-stone-600 via-stone-500 to-stone-600',
  },
}

type Theme = typeof lightTheme

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

// ============================================================
// EASTER EGG: Accelerometer marble light + tilt-to-dark-mode
//
// iOS Safari requires requestPermission() from a direct click.
// Android Chrome just works. Desktop falls back to mouse.
// ============================================================
function useGyroMarble() {
  const [marble, setMarble] = useState({ x: 0.5, y: 0.3 })
  const [hue, setHue] = useState(0)
  const [dark, setDark] = useState(false)
  const [needsPermission, setNeedsPermission] = useState(false)

  const smoothX = useRef(0.5)
  const smoothY = useRef(0.3)
  const smoothHue = useRef(0)
  const betaRef = useRef(60)
  const gammaRef = useRef(0)
  const frameId = useRef(0)
  const listening = useRef(false)
  const darkLocked = useRef(false)

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return

    const gamma = e.gamma  // left-right: -90 to 90
    const beta = e.beta    // front-back: -180 to 180
    betaRef.current = beta
    gammaRef.current = gamma

    // Map tilt to 0-1 marble position
    const rawX = 0.5 + (gamma / 90)
    const rawY = 0.5 + ((beta - 60) / 120)

    smoothX.current += (Math.max(0, Math.min(1, rawX)) - smoothX.current) * 0.08
    smoothY.current += (Math.max(0, Math.min(1, rawY)) - smoothY.current) * 0.08

    // Hue from angle of displacement
    const dx = smoothX.current - 0.5
    const dy = smoothY.current - 0.5
    const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 180
    smoothHue.current += (angle - smoothHue.current) * 0.05
  }, [])

  const startListening = useCallback(() => {
    if (listening.current) return
    listening.current = true
    window.addEventListener('deviceorientation', handleOrientation)
  }, [handleOrientation])

  // Request permission (called from user gesture on iOS)
  const requestGyroPermission = useCallback(async () => {
    try {
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
      if (typeof DOE.requestPermission === 'function') {
        const result = await DOE.requestPermission()
        if (result === 'granted') {
          startListening()
          setNeedsPermission(false)
          return true
        }
      }
    } catch {
      // Permission denied or error
    }
    return false
  }, [startListening])

  // On mount: check if we need iOS permission or can just listen
  useEffect(() => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof DOE.requestPermission === 'function') {
      // iOS — need user gesture to request. Show nothing, wait for first tap.
      setNeedsPermission(true)
    } else if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      // Android / other — just start
      startListening()
    }
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [handleOrientation, startListening])

  // On iOS: request permission on first user tap anywhere
  useEffect(() => {
    if (!needsPermission) return
    const handler = () => {
      requestGyroPermission()
    }
    // Use click — iOS requires it from a user gesture
    window.addEventListener('click', handler, { once: true })
    return () => window.removeEventListener('click', handler)
  }, [needsPermission, requestGyroPermission])

  // Animation loop — push smoothed values into React state at 60fps
  useEffect(() => {
    const tick = () => {
      setMarble({ x: smoothX.current, y: smoothY.current })
      setHue(smoothHue.current)

      // Dark mode: tilt phone forward (screen facing down/away)
      // Portrait upright: beta ≈ 60-90
      // Tilted forward ~30deg past upright: beta > 120
      // Use beta (not gamma) for forward tilt
      const beta = betaRef.current
      if (!darkLocked.current && beta > 120) {
        // Lock into dark mode
        darkLocked.current = true
        setDark(true)
      }
      // To exit: tilt back to clearly upright (beta < 70)
      if (darkLocked.current && beta < 70) {
        darkLocked.current = false
        setDark(false)
      }
      frameId.current = requestAnimationFrame(tick)
    }
    frameId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId.current)
  }, [])

  // Desktop fallback: mouse drives the marble
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      smoothX.current += (e.clientX / window.innerWidth - smoothX.current) * 0.05
      smoothY.current += (e.clientY / window.innerHeight - smoothY.current) * 0.05
      const dx = smoothX.current - 0.5
      const dy = smoothY.current - 0.5
      smoothHue.current = Math.atan2(dy, dx) * (180 / Math.PI) + 180
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  return { marble, hue, dark }
}

// ============================================================
// EASTER EGG 2: Type "vibe" (keyboard) OR double-tap header
// ============================================================
function useSecretWord(word: string, onActivate: () => void) {
  const progress = useRef(0)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === word[progress.current]) {
        progress.current++
        if (progress.current === word.length) {
          progress.current = 0
          onActivate()
        }
      } else if (e.key === word[0]) {
        progress.current = 1
      } else {
        progress.current = 0
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [word, onActivate])
}

export default function Projects() {
  const [mounted, setMounted] = useState(false)
  const [vibeMode, setVibeMode] = useState(false)
  const [footerClicks, setFooterClicks] = useState(0)
  const [gravityMode, setGravityMode] = useState(false)

  // Accelerometer marble
  const { marble, hue, dark } = useGyroMarble()

  const toggleVibe = useCallback(() => setVibeMode(v => !v), [])
  useSecretWord('vibe', toggleVibe)
  const lastTap = useRef(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  const theme = dark ? darkTheme : lightTheme

  // Marble gradient colors — subtle, shifts with tilt angle
  const h1 = Math.round(hue) % 360
  const h2 = (h1 + 60) % 360
  const marbleOpacity = dark ? 0.06 : 0.09

  return (
    <div className={`min-h-screen bg-gradient-to-b ${theme.bg} transition-colors duration-700`}>
      {/* Marble light overlay — follows tilt/mouse */}
      <div
        className="fixed inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse 60% 50% at ${marble.x * 100}% ${marble.y * 100}%, hsla(${h1}, 70%, 70%, ${marbleOpacity}), hsla(${h2}, 60%, 65%, ${marbleOpacity * 0.4}), transparent 70%)`,
        }}
      />

      {/* Soft decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br ${theme.blob1} rounded-full blur-3xl transition-colors duration-700`} />
        <div className={`absolute top-1/3 -left-40 w-80 h-80 bg-gradient-to-br ${theme.blob2} rounded-full blur-3xl transition-colors duration-700`} />
        <div className={`absolute bottom-20 right-20 w-72 h-72 bg-gradient-to-br ${theme.blob3} rounded-full blur-3xl transition-colors duration-700`} />
      </div>

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
          <h1
            className={`text-3xl sm:text-4xl font-bold tracking-tight cursor-default transition-colors duration-700 ${theme.title}`}
            onClick={() => {
              const now = Date.now()
              if (now - lastTap.current < 400) {
                toggleVibe()
              }
              lastTap.current = now
            }}
          >
            things i&apos;m building
          </h1>
          <p className={`mt-3 text-sm sm:text-base leading-relaxed max-w-lg transition-colors duration-700 ${theme.subtitle}`}>
            9 months of &quot;what if we tried this.&quot; some of it runs in production. some of it is held together by optimism.
          </p>
        </div>

        {/* Projects */}
        <div className="space-y-3">
          {projects.map((project, i) => (
            <ProjectCard key={project.name} project={project} index={i} vibeMode={vibeMode} theme={theme} />
          ))}
        </div>

        {/* Footer — Easter egg: click 5 times for zero gravity */}
        <div
          className={`mt-16 pt-8 border-t text-center transition-colors duration-700 ${theme.footer}`}
          style={{
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.6s ease 0.8s',
          }}
        >
          <p
            className={`text-xs tracking-wide cursor-default select-none transition-colors duration-700 ${theme.footer}`}
            onClick={() => {
              const next = footerClicks + 1
              setFooterClicks(next)
              if (next >= 5) {
                setGravityMode(g => !g)
                setFooterClicks(0)
              }
            }}
          >
            {gravityMode
              ? 'everything is fine. this is fine.'
              : 'built with next.js, tailwind, and questionable amounts of caffeine'}
          </p>
          {footerClicks > 0 && footerClicks < 5 && (
            <p className={`text-[10px] mt-1 transition-colors duration-700 ${theme.footerHint}`}>
              {'?'.repeat(footerClicks)}
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          25% { transform: rotate(-1.5deg) translateY(-3px); }
          75% { transform: rotate(1.5deg) translateY(-3px); }
        }
        ${gravityMode ? `
        .group {
          animation: floatUp 8s ease-in-out infinite !important;
        }
        .group:nth-child(odd) {
          animation-delay: -3s !important;
          animation-duration: 7s !important;
        }
        .group:nth-child(3n) {
          animation-delay: -5s !important;
          animation-duration: 9s !important;
        }
        @keyframes floatUp {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          33% { transform: translateY(-20px) rotate(1deg); }
          66% { transform: translateY(-8px) rotate(-0.5deg); }
        }
        ` : ''}
      `}</style>
    </div>
  )
}
