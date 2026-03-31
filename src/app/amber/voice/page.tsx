'use client'

import { useEffect, useRef, useState } from 'react'

const CITRUS_HUES = [
  { h: 5, s: 80 },    // blood orange
  { h: 25, s: 85 },   // tangerine
  { h: 47, s: 90 },   // mango
  { h: 82, s: 70 },   // lime
  { h: 348, s: 75 },  // grapefruit
]

const BG = '#1A1A2E'
const BG_FADE = 'rgba(26, 26, 46, 0.06)'

interface CharParticle {
  ch: string; homeX: number; homeY: number
  x: number; y: number; vx: number; vy: number
  size: number; hue: number; sat: number
  rotation: number; rotVel: number
}

interface Word { text: string; chars: CharParticle[]; born: number }
interface Drip { x: number; y: number; vy: number; alpha: number; size: number; hue: number; sat: number; life: number }

export default function VoicePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [recording, setRecording] = useState(false)
  const [hasText, setHasText] = useState(false)
  const stateRef = useRef({
    words: [] as Word[],
    drips: [] as Drip[],
    allText: '',
    isRecording: false,
    t: 0,
    cursorX: 40,
    cursorY: 60,
    citrusIdx: 0,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr

    const s = stateRef.current
    const BASE_SIZE = 16
    const CHAR_W = BASE_SIZE * 0.55
    const LINE_H = BASE_SIZE * 1.6

    function resize() {
      W = window.innerWidth; H = window.innerHeight
      canvas!.width = W * dpr; canvas!.height = H * dpr
    }

    function spawnWord(text: string) {
      const padding = 30
      const maxW = W - padding * 2
      if (s.cursorX + text.length * CHAR_W > maxW) { s.cursorX = padding; s.cursorY += LINE_H }
      if (s.cursorY > H - 160) { s.cursorY = 60; s.cursorX = padding }

      const citrus = CITRUS_HUES[s.citrusIdx % CITRUS_HUES.length]
      s.citrusIdx++
      const spawnX = W / 2 + (Math.random() - 0.5) * 100
      const spawnY = H * 0.6 + (Math.random() - 0.5) * 60

      const chars: CharParticle[] = []
      for (let i = 0; i < text.length; i++) {
        const angle = Math.random() * Math.PI * 2
        const dist = 30 + Math.random() * 80
        chars.push({
          ch: text[i], homeX: s.cursorX + i * CHAR_W, homeY: s.cursorY,
          x: spawnX + Math.cos(angle) * dist, y: spawnY + Math.sin(angle) * dist,
          vx: Math.cos(angle) * (1 + Math.random() * 2), vy: Math.sin(angle) * (1 + Math.random() * 2) - 1.5,
          size: BASE_SIZE + Math.random() * 4 - 2,
          hue: citrus.h + Math.random() * 20 - 10, sat: citrus.s + Math.random() * 10 - 5,
          rotation: (Math.random() - 0.5) * 0.4, rotVel: (Math.random() - 0.5) * 0.08,
        })
      }
      s.words.push({ text, chars, born: s.t })
      s.cursorX += (text.length + 1) * CHAR_W
    }

    function frame() {
      s.t += 0.016
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.fillStyle = BG_FADE
      ctx!.fillRect(0, 0, W, H)

      // Drips
      for (let i = s.drips.length - 1; i >= 0; i--) {
        const d = s.drips[i]
        d.y += d.vy; d.life -= 0.005; d.alpha *= 0.995
        if (d.life <= 0 || d.y > H) { s.drips.splice(i, 1); continue }
        ctx!.beginPath()
        ctx!.arc(d.x, d.y, d.size, 0, Math.PI * 2)
        ctx!.fillStyle = `hsla(${d.hue}, ${d.sat}%, 55%, ${d.alpha * d.life})`
        ctx!.fill()
      }

      // Words
      for (const word of s.words) {
        const age = s.t - word.born
        const settle = Math.min(1, age * 0.4)
        for (const c of word.chars) {
          const dx = c.homeX - c.x, dy = c.homeY - c.y
          c.vx += dx * 0.02 * settle; c.vy += dy * 0.02 * settle
          c.vx += Math.sin(c.y * 0.01 + s.t * 0.3) * 0.01 * (1 - settle * 0.8)
          c.vy += Math.cos(c.x * 0.01 + s.t * 0.2) * 0.008 * (1 - settle * 0.8)
          c.vx *= 0.92; c.vy *= 0.92; c.x += c.vx; c.y += c.vy
          c.rotation += c.rotVel * (1 - settle); c.rotVel *= 0.98

          const speed = Math.sqrt(c.vx * c.vx + c.vy * c.vy)
          if (speed > 0.8 && Math.random() < 0.04) {
            s.drips.push({ x: c.x, y: c.y, vy: 0.3 + Math.random() * 0.5, alpha: 0.4 + Math.random() * 0.3, size: 1 + Math.random() * 2, hue: c.hue, sat: c.sat, life: 1 })
          }

          const distFromHome = Math.sqrt(dx * dx + dy * dy)
          const brightness = 55 + settle * 15 + (1 - settle) * distFromHome * 0.2
          const sat = c.sat + (1 - settle) * 15
          const alpha = 0.35 + settle * 0.5

          ctx!.save()
          ctx!.translate(c.x, c.y)
          ctx!.rotate(c.rotation * (1 - settle * 0.9))
          ctx!.font = `300 ${c.size}px "Courier New", monospace`
          ctx!.textBaseline = 'top'
          ctx!.fillStyle = `hsla(${c.hue}, ${sat}%, ${brightness}%, ${alpha})`
          ctx!.fillText(c.ch, 0, 0)
          if (age < 2) {
            ctx!.fillStyle = `hsla(${c.hue}, ${sat}%, 70%, ${(1 - age / 2) * 0.2})`
            ctx!.font = `300 ${c.size + 2}px "Courier New", monospace`
            ctx!.fillText(c.ch, -1, -1)
          }
          ctx!.restore()
        }
      }

      if (s.isRecording) {
        const breathR = 3 + Math.sin(s.t * 4) * 1.5
        ctx!.beginPath()
        ctx!.arc(W / 2, H - 82, breathR, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(255,78,80,${0.3 + Math.sin(s.t * 3) * 0.15})`
        ctx!.fill()
      }

      requestAnimationFrame(frame)
    }

    // Speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    let recognition: any = null
    const finalWords: string[] = []

    if (SpeechRecognition) {
      recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            const text = e.results[i][0].transcript.trim()
            for (const w of text.split(/\s+/)) {
              if (w) { spawnWord(w); finalWords.push(w) }
            }
            s.allText = finalWords.join(' ')
            setHasText(true)
          }
        }
      }
      recognition.onend = () => { if (s.isRecording) recognition.start() }
      recognition.onerror = () => {}
    }

    // Expose controls
    ;(window as any).__voice = {
      toggleMic: () => {
        if (s.isRecording) {
          s.isRecording = false; recognition?.stop(); setRecording(false)
        } else {
          s.isRecording = true; recognition?.start(); setRecording(true)
        }
      },
      play: () => {
        if (!s.allText) return
        const u = new SpeechSynthesisUtterance(s.allText)
        u.rate = 0.85; u.pitch = 0.95
        const voices = speechSynthesis.getVoices()
        const v = voices.find((v: any) => v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Daniel'))
        if (v) u.voice = v
        speechSynthesis.speak(u)
      },
      clear: () => {
        s.allText = ''; s.words = []; s.drips = []; s.cursorX = 40; s.cursorY = 60; s.citrusIdx = 0
        finalWords.length = 0
        if (s.isRecording) { s.isRecording = false; recognition?.stop(); setRecording(false) }
        setHasText(false)
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx!.fillStyle = BG; ctx!.fillRect(0, 0, W, H)
      },
    }

    speechSynthesis.getVoices()
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices()

    window.addEventListener('resize', resize)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
    requestAnimationFrame(frame)

    return () => {
      window.removeEventListener('resize', resize)
      delete (window as any).__voice
    }
  }, [])

  return (
    <>
      <style>{`
        .voice-page { position: relative; width: 100vw; height: 100dvh; overflow: hidden; background: ${BG}; }
        .voice-page canvas { display: block; width: 100%; height: 100%; position: fixed; top: 0; left: 0; }
        .mic-ring {
          position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
          width: 68px; height: 68px; border-radius: 50%; z-index: 10; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          background: rgba(252,145,58,0.06); border: 1.5px solid rgba(252,145,58,0.2);
          transition: all 0.3s;
        }
        .mic-ring:active { transform: translateX(-50%) scale(0.95); }
        .mic-ring.recording { border-color: rgba(255,78,80,0.6); background: rgba(255,78,80,0.1); }
        .mic-ring.recording .mic-icon { stroke: rgba(255,78,80,0.8); }
        .mic-icon { stroke: rgba(252,145,58,0.5); transition: stroke 0.3s; }
        .pulse-ring {
          position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
          width: 68px; height: 68px; border-radius: 50%; z-index: 9;
          border: 1px solid rgba(255,78,80,0); pointer-events: none;
        }
        .recording ~ .pulse-ring { animation: ring-pulse 1.5s ease-out infinite; }
        @keyframes ring-pulse {
          0% { transform: translateX(-50%) scale(1); border-color: rgba(255,78,80,0.4); }
          100% { transform: translateX(-50%) scale(2.2); border-color: rgba(255,78,80,0); }
        }
        .voice-btn {
          position: fixed; z-index: 10; width: 44px; height: 44px; border-radius: 50%;
          cursor: pointer; border: none; display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .play-btn { bottom: 48px; right: 30px; background: rgba(252,145,58,0.06); }
        .play-btn:disabled { opacity: 0.2; cursor: default; }
        .play-btn svg { fill: rgba(252,145,58,0.35); }
        .clear-btn {
          bottom: 48px; left: 30px; background: rgba(252,145,58,0.04);
          color: rgba(255,248,231,0.25); font: 400 18px/1 "Courier New", monospace;
        }
        .hint {
          position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%);
          font: 300 12px/1 "Courier New", monospace; color: rgba(255,248,231,0.15);
          letter-spacing: 2px; z-index: 10; pointer-events: none; transition: opacity 0.5s;
        }
        .watermark {
          position: fixed; top: 16px; right: 20px; z-index: 10;
          font: 300 10px/1 "Courier New", monospace; color: rgba(212,165,116,0.15);
          letter-spacing: 1px; pointer-events: none;
        }
      `}</style>
      <div className="voice-page">
        <canvas ref={canvasRef} style={{ touchAction: 'none' }} />
        <div className="watermark">amber</div>
        <div className="hint" style={{ opacity: recording ? 0 : 1 }}>
          {recording ? 'listening' : 'speak'}
        </div>
        <div
          className={`mic-ring ${recording ? 'recording' : ''}`}
          onClick={() => (window as any).__voice?.toggleMic()}
        >
          <svg className="mic-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round">
            <rect x="9" y="1" width="6" height="12" rx="3"/>
            <path d="M5 10a7 7 0 0014 0"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <div className="pulse-ring" />
        <button
          className="voice-btn play-btn"
          disabled={!hasText}
          onClick={() => (window as any).__voice?.play()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21"/></svg>
        </button>
        <button
          className="voice-btn clear-btn"
          onClick={() => (window as any).__voice?.clear()}
        >
          ×
        </button>
      </div>
    </>
  )
}
