'use client'

import { useEffect, useRef, useState } from 'react'

// The Plus's voice lives on the Mac mini (apps/macplus/agent-voice), exposed by tunn3l.
const VOICE = 'https://voice-mini.tunn3l.sh'

type Line = { id: string; text: string; at: number }
type VoiceState = { online: boolean; since: number | null; line: Line | null; error: string | null }

const DISKS = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i * 0.7) % 6,
  dur: 6 + ((i * 3) % 7),
  size: 28 + ((i * 11) % 30),
  hue: (i * 47) % 360,
}))

export default function PlusBuddy() {
  const [voice, setVoice] = useState<VoiceState | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [awake, setAwake] = useState(false)
  const [talking, setTalking] = useState(false)
  const [spins, setSpins] = useState(0)
  const heard = useRef<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let alive = true
    async function poll() {
      try {
        const r = await fetch(`${VOICE}/state`, { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        const s: VoiceState = await r.json()
        if (alive) { setVoice(s); setUnreachable(false) }
      } catch {
        if (alive) setUnreachable(true)
      }
    }
    poll()
    const t = setInterval(poll, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  function play(line: Line) {
    const a = audio.current ?? new Audio()
    audio.current = a
    heard.current = line.id
    a.src = `${VOICE}/audio/${line.id}`
    a.onplaying = () => setTalking(true)
    a.onended = a.onerror = a.onpause = () => setTalking(false)
    a.play().catch(() => setTalking(false))
  }

  // Speak each new line once, after the first tap has unlocked audio. Lines
  // older than two minutes are shown but not spoken.
  useEffect(() => {
    const line = voice?.line
    if (!awake || !line || heard.current === line.id) return
    if (Date.now() - line.at > 120000) { heard.current = line.id; return }
    play(line)
  }, [voice, awake])

  function poke() {
    // iOS unlocks audio only for an element played inside a tap, so the first
    // tap replays the latest line (whatever its age) on the element we reuse.
    if (!awake) {
      setAwake(true)
      if (voice?.line) play(voice.line)
    }
    setSpins((s) => s + 1)
  }

  const asleep = !unreachable && voice !== null && !voice.online
  const sad = unreachable
  const bubble = unreachable
    ? "Can't reach the mini. My voice box is unplugged."
    : !voice
      ? 'Booting...'
      : !awake
        ? 'Tap me to hear my voice!'
        : voice.line && (voice.online || Date.now() - voice.line.at < 600000)
          ? voice.line.text
          : 'zzz... the Plus is switched off.'

  return (
    <main className="pb-root">
      <style>{CSS}</style>
      <div className="pb-rays" />
      {DISKS.map((d, i) => (
        <div
          key={i}
          className="pb-disk"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.dur}s`,
            filter: `hue-rotate(${d.hue}deg)`,
          }}
        >
          <div className="pb-shutter" />
          <div className="pb-label" />
        </div>
      ))}

      <h1 className="pb-title">
        {'MACINTOSH PLUS'.split('').map((c, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.08}s` }}>
            {c === ' ' ? ' ' : c}
          </span>
        ))}
      </h1>

      <div className="pb-stage">
        <div className="pb-bubble" key={bubble}>
          {bubble}
        </div>
        <button
          className={`pb-mac${asleep ? ' pb-asleep' : ''}`}
          onClick={poke}
          aria-label="Poke the Mac"
          style={{ transform: `rotate(${spins * 360}deg)` }}
        >
          <svg viewBox="0 0 200 260" width="100%" height="100%">
            <g className="pb-arm-l">
              <path d="M22 130 Q-10 110 -6 70" stroke="#e8dcc0" strokeWidth="12" fill="none" strokeLinecap="round" />
              <circle cx="-6" cy="66" r="12" fill="#fff" stroke="#222" strokeWidth="3" />
            </g>
            <g className="pb-arm-r">
              <path d="M178 130 Q210 110 206 70" stroke="#e8dcc0" strokeWidth="12" fill="none" strokeLinecap="round" />
              <circle cx="206" cy="66" r="12" fill="#fff" stroke="#222" strokeWidth="3" />
            </g>
            <rect x="20" y="10" width="160" height="210" rx="14" fill="#efe6cf" stroke="#222" strokeWidth="4" />
            <rect x="34" y="24" width="132" height="106" rx="10" fill="#cfc4a6" />
            <rect x="44" y="32" width="112" height="90" rx="6" className="pb-screen" />
            {sad ? (
              <g stroke="#e8f0ff" strokeWidth="5" strokeLinecap="round" fill="none">
                <path d="M68 60 l12 12 M80 60 l-12 12 M120 60 l12 12 M132 60 l-12 12" />
                <path d="M78 104 Q100 88 122 104" />
              </g>
            ) : asleep ? (
              <g stroke="#e8f0ff" strokeWidth="5" strokeLinecap="round" fill="none">
                <path d="M68 66 Q76 72 84 66 M116 66 Q124 72 132 66" />
                <path d="M90 100 h20" />
                <text x="134" y="50" className="pb-zzz" fill="#e8f0ff" stroke="none" fontSize="16">z</text>
              </g>
            ) : (
              <g fill="#e8f0ff">
                <rect className="pb-eye" x="72" y="56" width="8" height="18" />
                <rect className="pb-eye" x="120" y="56" width="8" height="18" />
                <path d="M96 64 v20 h-6" stroke="#e8f0ff" strokeWidth="5" fill="none" />
                {talking ? (
                  <ellipse className="pb-talk" cx="100" cy="102" rx="16" ry="9" fill="#e8f0ff" />
                ) : (
                  <path d="M74 96 Q100 116 126 96" stroke="#e8f0ff" strokeWidth="5" fill="none" strokeLinecap="round" />
                )}
              </g>
            )}
            <circle cx="40" cy="190" r="6" className="pb-apple" />
            <rect x="100" y="168" width="60" height="8" rx="2" fill="#222" />
            <path d="M40 220 L30 246 H170 L160 220 Z" fill="#e2d7bb" stroke="#222" strokeWidth="4" />
            <g className="pb-leg-l"><rect x="52" y="244" width="22" height="12" rx="5" fill="#ff4fa3" stroke="#222" strokeWidth="3" /></g>
            <g className="pb-leg-r"><rect x="126" y="244" width="22" height="12" rx="5" fill="#ff4fa3" stroke="#222" strokeWidth="3" /></g>
          </svg>
        </button>
        <div className="pb-shadow" />
      </div>

      <p className="pb-foot">{asleep ? 'the Plus is off' : voice?.online ? 'the Plus is ON and talking' : '...'} &middot; voice: MacinTalk Fred</p>
    </main>
  )
}

const CSS = `
.pb-root{position:relative;min-height:100dvh;overflow:hidden;background:#1a0b2e;color:#fff;
  font-family:Chicago,"Geneva",ui-monospace,monospace;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.pb-rays{position:absolute;inset:-50%;background:repeating-conic-gradient(from 0deg,#2a1150 0 10deg,#1a0b2e 10deg 20deg);
  animation:pb-spin 30s linear infinite;opacity:.8}
.pb-title{position:relative;z-index:2;font-size:clamp(24px,6vw,72px);letter-spacing:.06em;margin:0 0 10px;text-align:center}
.pb-title span{display:inline-block;animation:pb-wave 1.4s ease-in-out infinite, pb-rainbow 3s linear infinite}
.pb-stage{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center}
.pb-mac{width:min(60vw,260px);aspect-ratio:200/260;background:none;border:0;padding:0 0 0 0;cursor:pointer;
  overflow:visible;transition:transform .8s cubic-bezier(.5,-0.5,.5,1.5);animation:pb-bounce .9s ease-in-out infinite}
.pb-mac svg{overflow:visible;animation:pb-wobble 1.8s ease-in-out infinite}
.pb-screen{fill:#1b2a6b;animation:pb-glow 2s ease-in-out infinite}
.pb-eye{transform-box:fill-box;transform-origin:center;animation:pb-blink 3.5s infinite}
.pb-apple{animation:pb-rainbowfill 2s linear infinite}
.pb-arm-l{transform-origin:22px 130px;animation:pb-waveL .5s ease-in-out infinite alternate}
.pb-arm-r{transform-origin:178px 130px;animation:pb-waveR .5s ease-in-out infinite alternate-reverse}
.pb-leg-l{animation:pb-step .45s ease-in-out infinite alternate}
.pb-leg-r{animation:pb-step .45s ease-in-out infinite alternate-reverse}
.pb-shadow{width:160px;height:18px;border-radius:50%;background:#000;opacity:.4;margin-top:6px;animation:pb-shadow .9s ease-in-out infinite}
.pb-bubble{background:#fff;color:#000;border:3px solid #000;border-radius:14px;padding:10px 16px;margin-bottom:18px;
  max-width:min(86vw,420px);text-align:center;font-size:clamp(14px,3.6vw,20px);box-shadow:6px 6px 0 #ff4fa3;
  position:relative;animation:pb-pop .35s cubic-bezier(.3,1.8,.6,1)}
.pb-bubble:after{content:"";position:absolute;left:50%;bottom:-14px;margin-left:-10px;border:10px solid transparent;border-top-color:#000;border-bottom:0}
.pb-disk{position:absolute;top:-80px;background:#2b6cff;border:2px solid #000;border-radius:3px;z-index:1;
  animation-name:pb-fall;animation-timing-function:linear;animation-iteration-count:infinite}
.pb-shutter{position:absolute;top:0;left:25%;width:50%;height:32%;background:#cfd6e0;border-bottom:2px solid #000}
.pb-label{position:absolute;bottom:8%;left:15%;width:70%;height:40%;background:#fff;border:1px solid #000}
.pb-asleep{animation:pb-sway 4s ease-in-out infinite}
.pb-asleep svg{animation:none}
.pb-asleep .pb-arm-l,.pb-asleep .pb-arm-r,.pb-asleep .pb-leg-l,.pb-asleep .pb-leg-r{animation:none}
.pb-talk{transform-box:fill-box;transform-origin:center;animation:pb-flap .14s ease-in-out infinite alternate}
.pb-zzz{animation:pb-zzz 2s ease-out infinite}
.pb-foot{position:relative;z-index:2;margin-top:24px;font-size:13px;opacity:.75;text-align:center}
@keyframes pb-spin{to{transform:rotate(360deg)}}
@keyframes pb-wave{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px) rotate(-6deg)}}
@keyframes pb-rainbow{0%{color:#61bb46}17%{color:#fdb827}33%{color:#f5821f}50%{color:#e03a3e}67%{color:#963d97}83%{color:#009ddc}100%{color:#61bb46}}
@keyframes pb-rainbowfill{0%{fill:#61bb46}17%{fill:#fdb827}33%{fill:#f5821f}50%{fill:#e03a3e}67%{fill:#963d97}83%{fill:#009ddc}100%{fill:#61bb46}}
@keyframes pb-bounce{0%,100%{translate:0 0;scale:1 1}45%{translate:0 -40px;scale:.96 1.05}90%{translate:0 0;scale:1.08 .92}}
@keyframes pb-wobble{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
@keyframes pb-glow{0%,100%{fill:#1b2a6b}50%{fill:#3a2bb0}}
@keyframes pb-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes pb-waveL{from{transform:rotate(10deg)}to{transform:rotate(-35deg)}}
@keyframes pb-waveR{from{transform:rotate(-10deg)}to{transform:rotate(35deg)}}
@keyframes pb-step{from{transform:translateY(0)}to{transform:translateY(-6px)}}
@keyframes pb-shadow{0%,100%{transform:scale(1);opacity:.45}45%{transform:scale(.6);opacity:.2}}
@keyframes pb-pop{from{transform:scale(.3) rotate(-8deg)}to{transform:scale(1)}}
@keyframes pb-fall{from{transform:translateY(0) rotate(0)}to{transform:translateY(calc(100dvh + 160px)) rotate(720deg)}}
@keyframes pb-sway{0%,100%{translate:0 0;rotate:-2deg}50%{translate:0 6px;rotate:2deg}}
@keyframes pb-flap{from{transform:scaleY(.25)}to{transform:scaleY(1.2)}}
@keyframes pb-zzz{from{transform:translate(0,0);opacity:1}to{transform:translate(14px,-22px);opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation-duration:20s!important}}
`
