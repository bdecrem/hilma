'use client'

import { useEffect, useRef } from 'react'

type Thing = { x: number; y: number; vx?: number; vy?: number; r: number; a: number; spin?: number; pulse?: number; kind?: string; fuse?: number }
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }
type Star = { x: number; y: number; z: number; tw: number }

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

export default function SockCatPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scoreRef = useRef<HTMLSpanElement>(null)
  const streakRef = useRef<HTMLSpanElement>(null)
  const livesRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const hintRef = useRef<HTMLParagraphElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  const soundRef = useRef<HTMLButtonElement>(null)
  const pauseRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const scoreEl = scoreRef.current
    const streakEl = streakRef.current
    const livesEl = livesRef.current
    const card = cardRef.current
    const title = titleRef.current
    const text = textRef.current
    const hint = hintRef.current
    const startBtn = startRef.current
    const soundBtn = soundRef.current
    const pauseBtn = pauseRef.current
    if (!canvas || !ctx || !scoreEl || !streakEl || !livesEl || !card || !title || !text || !hint || !startBtn || !soundBtn || !pauseBtn) return

    let W = 0
    let H = 0
    let DPR = 1
    let running = false
    let paused = false
    let last = 0
    let shake = 0
    let audioCtx: AudioContext | undefined
    let master: GainNode | undefined
    let musicGain: GainNode | undefined
    let soundOn = true
    let nextBeat = 0
    let beat = 0
    let score = 0
    let combo = 1
    let comboTimer = 0
    let lives = 3
    let invuln = 0
    let t = 0
    let pointer = { down: false, x: 0, y: 0 }
    const rand = (a: number, b: number) => a + Math.random() * (b - a)
    const TAU = Math.PI * 2
    const cat = { x: 0, y: 0, vx: 0, vy: 0, r: 20 }
    let treats: Thing[] = []
    let socks: Thing[] = []
    let bombs: Thing[] = []
    let sparks: Spark[] = []
    let stars: Star[] = []

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2.25)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.floor(W * DPR)
      canvas.height = Math.floor(H * DPR)
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      if (!cat.x) {
        cat.x = W / 2
        cat.y = H * 0.62
      }
      stars = Array.from({ length: 95 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: rand(0.25, 1), tw: rand(0, TAU) }))
    }

    const updateHud = () => {
      scoreEl.textContent = String(score)
      streakEl.textContent = `x${combo}`
      livesEl.textContent = '❤'.repeat(lives) + '♡'.repeat(3 - lives)
    }

    const spawnTreat = (): Thing => ({ x: rand(35, W - 35), y: rand(92, H - 45), r: rand(10, 15), a: rand(0, TAU), pulse: rand(0, TAU), kind: Math.random() < 0.14 ? 'fish' : 'treat' })
    const spawnSock = (): Thing => {
      const edge = Math.floor(rand(0, 4))
      const speed = rand(38, 82)
      const s: Thing = { x: rand(0, W), y: rand(0, H), vx: rand(-speed, speed), vy: rand(-speed, speed), r: rand(18, 29), a: rand(0, TAU), spin: rand(-2.6, 2.6), kind: Math.random() < 0.5 ? 'stripe' : 'plain' }
      if (edge === 0) { s.x = -40; s.vx = Math.abs(s.vx || 0) + speed }
      if (edge === 1) { s.x = W + 40; s.vx = -Math.abs(s.vx || 0) - speed }
      if (edge === 2) { s.y = -40; s.vy = Math.abs(s.vy || 0) + speed }
      if (edge === 3) { s.y = H + 40; s.vy = -Math.abs(s.vy || 0) - speed }
      return s
    }
    const spawnBomb = (): Thing => {
      const edge = Math.floor(rand(0, 4))
      const speed = rand(56, 108) + Math.min(score, 80) * 0.45
      const b: Thing = { x: rand(0, W), y: rand(0, H), vx: rand(-speed, speed), vy: rand(-speed, speed), r: rand(17, 23), a: rand(0, TAU), spin: rand(-4, 4), fuse: rand(0, TAU) }
      if (edge === 0) { b.x = -45; b.vx = Math.abs(b.vx || 0) + speed }
      if (edge === 1) { b.x = W + 45; b.vx = -Math.abs(b.vx || 0) - speed }
      if (edge === 2) { b.y = -45; b.vy = Math.abs(b.vy || 0) + speed }
      if (edge === 3) { b.y = H + 45; b.vy = -Math.abs(b.vy || 0) - speed }
      return b
    }

    const burst = (x: number, y: number, color: string, count = 14) => {
      for (let i = 0; i < count; i++) sparks.push({ x, y, vx: rand(-190, 190), vy: rand(-190, 190), life: rand(0.28, 0.7), color, r: rand(2, 5) })
    }

    const initAudio = () => {
      if (audioCtx) return
      audioCtx = new (window.AudioContext || window.webkitAudioContext!)()
      master = audioCtx.createGain(); master.gain.value = 0.38; master.connect(audioCtx.destination)
      musicGain = audioCtx.createGain(); musicGain.valueOf(); musicGain.gain.value = 0.28; musicGain.connect(master)
    }
    const tone = (freq: number, dur = 0.12, type: OscillatorType = 'sine', vol = 0.2, dest = master, slide = 1) => {
      if (!soundOn || !audioCtx || !dest) return
      const now = audioCtx.currentTime
      const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, now)
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + dur)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(vol, now + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
      osc.connect(gain); gain.connect(dest); osc.start(now); osc.stop(now + dur + 0.02)
    }
    const noise = (dur = 0.12, vol = 0.16) => {
      if (!soundOn || !audioCtx || !master) return
      const now = audioCtx.currentTime
      const len = Math.floor(audioCtx.sampleRate * dur)
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
      const src = audioCtx.createBufferSource(); src.buffer = buf
      const gain = audioCtx.createGain(); gain.gain.setValueAtTime(vol, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
      src.connect(gain); gain.connect(master); src.start(now)
    }
    const sfx = (name: string) => {
      if (name === 'treat') { tone(520 + combo * 45, 0.09, 'triangle', 0.18, master, 1.8); tone(1040 + combo * 60, 0.06, 'sine', 0.08, master, 1.2) }
      if (name === 'fish') { tone(740, 0.18, 'sine', 0.16, master, 1.7); tone(1110, 0.22, 'triangle', 0.1, master, 0.72) }
      if (name === 'sock') { tone(430 + combo * 35, 0.08, 'triangle', 0.16, master, 1.55); noise(0.045, 0.04) }
      if (name === 'bomb') { tone(90, 0.33, 'square', 0.22, master, 0.35); noise(0.22, 0.22) }
      if (name === 'start') { tone(330, 0.08, 'triangle', 0.12); window.setTimeout(() => tone(495, 0.08, 'triangle', 0.12), 70); window.setTimeout(() => tone(660, 0.13, 'triangle', 0.16), 140) }
      if (name === 'over') { tone(220, 0.18, 'sawtooth', 0.12, master, 0.7); window.setTimeout(() => tone(110, 0.32, 'sawtooth', 0.16, master, 0.5), 130) }
    }
    const musicStep = () => {
      if (!running || paused || !soundOn || !audioCtx || !musicGain) return
      const now = audioCtx.currentTime
      if (now < nextBeat) return
      const melody = [392, 493.88, 587.33, 493.88, 659.25, 587.33, 493.88, 392, 349.23, 440, 523.25, 659.25, 587.33, 523.25, 440, 392]
      const fast = combo >= 5
      const b = beat % 16
      if (b % 4 === 0) tone([98, 130.81, 87.31, 146.83][Math.floor(b / 4)], 0.18, 'square', 0.1, musicGain, 0.98)
      tone(melody[(beat + (fast ? 4 : 0)) % melody.length], fast ? 0.105 : 0.13, 'triangle', fast ? 0.1 : 0.08, musicGain, 1.005)
      if (b === 0 || b === 8) tone(55, 0.055, 'sine', 0.14, musicGain, 0.45)
      if (b === 4 || b === 12) noise(0.035, 0.035)
      nextBeat = now + (fast ? 0.135 : 0.18)
      beat++
    }

    const rounded = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r)
    }
    const drawCat = (x: number, y: number, ang: number) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang)
      const zoom = combo >= 5
      ctx.shadowColor = zoom ? '#ffef6f' : '#ff7adf'; ctx.shadowBlur = zoom ? 28 : 14
      ctx.fillStyle = zoom ? '#fff174' : '#ffb56f'
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 17, 0, 0, TAU); ctx.fill()
      ctx.fillStyle = zoom ? '#ffe150' : '#ff8f45'
      ctx.beginPath(); ctx.moveTo(-13, -10); ctx.lineTo(-23, -27); ctx.lineTo(-3, -15); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(13, -10); ctx.lineTo(23, -27); ctx.lineTo(3, -15); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#261106'; ctx.beginPath(); ctx.arc(-7, -2, 2.6, 0, TAU); ctx.arc(7, -2, 2.6, 0, TAU); ctx.fill()
      ctx.strokeStyle = '#261106'; ctx.lineWidth = 2.1; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, 5); ctx.moveTo(-7, 5); ctx.quadraticCurveTo(0, 10, 7, 5); ctx.stroke()
      ctx.strokeStyle = zoom ? '#fff' : '#ffd1a8'; ctx.lineWidth = 4.5
      ctx.beginPath(); ctx.arc(-20, 5, 13, 1.1, 4.4); ctx.stroke()
      ctx.restore()
    }
    const drawTreat = (s: Thing) => {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.scale(s.kind === 'fish' ? 1.18 : 1, s.kind === 'fish' ? 1.18 : 1)
      ctx.shadowColor = s.kind === 'fish' ? '#74f0ff' : '#ffef6f'; ctx.shadowBlur = 18
      ctx.fillStyle = s.kind === 'fish' ? '#9ff7ff' : '#fff085'
      if (s.kind === 'fish') {
        ctx.beginPath(); ctx.ellipse(0, 0, 16, 8, 0, 0, TAU); ctx.fill()
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(27, -9); ctx.lineTo(27, 9); ctx.closePath(); ctx.fill()
      } else {
        rounded(-12, -9, 24, 18, 7); ctx.fill()
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(-4, -2, 2, 0, TAU); ctx.arc(5, 3, 2, 0, TAU); ctx.fill()
      }
      ctx.restore()
    }
    const drawSock = (s: Thing) => {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a)
      ctx.fillStyle = s.kind === 'stripe' ? '#d8c7ff' : '#b7f7ff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 12
      rounded(-11, -20, 22, 31, 8); ctx.fill()
      ctx.fillStyle = s.kind === 'stripe' ? '#8b5cf6' : '#47bdd1'; rounded(-11, 5, 31, 16, 8); ctx.fill()
      ctx.strokeStyle = '#ff6bd6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, -8); ctx.stroke()
      ctx.restore()
    }
    const drawBomb = (b: Thing) => {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a)
      const blink = 0.45 + 0.55 * Math.sin(t * 10 + (b.fuse || 0))
      ctx.shadowColor = '#ff304f'; ctx.shadowBlur = 18 + blink * 16
      ctx.fillStyle = '#1b1524'; ctx.beginPath(); ctx.arc(0, 4, b.r, 0, TAU); ctx.fill()
      ctx.strokeStyle = '#ff304f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 4, b.r - 4, 0, TAU); ctx.stroke()
      ctx.strokeStyle = '#d8c7ff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(8, -12); ctx.quadraticCurveTo(15, -24, 27, -17); ctx.stroke()
      ctx.fillStyle = blink > 0.55 ? '#ffef6f' : '#ff6bd6'; ctx.beginPath(); ctx.arc(29, -16, 5 + blink * 3, 0, TAU); ctx.fill()
      ctx.restore()
    }

    const loseLife = () => {
      if (invuln > 0 || !running) return
      lives -= 1; combo = 1; comboTimer = 0; invuln = 1.6; shake = 0.75; updateHud()
      burst(cat.x, cat.y, '#ff304f', 42); cat.vx += rand(-360, 360); cat.vy += rand(-360, 360); sfx('bomb')
      navigator.vibrate?.([70, 40, 90])
      if (lives <= 0) gameOver()
    }
    const gameOver = () => {
      running = false; pointer.down = false; sfx('over')
      title.textContent = 'CAT BONKED'
      text.textContent = `Final haul: ${score}. The cat has been gently removed from the laundry dimension.`
      hint.innerHTML = 'Tap START POUNCING for revenge zoomies.'
      card.classList.add('show')
    }
    const reset = () => {
      score = 0; combo = 1; comboTimer = 0; lives = 3; invuln = 1.2; t = 0; shake = 0
      Object.assign(cat, { x: W / 2, y: H * 0.62, vx: 0, vy: -80, r: 20 })
      treats = Array.from({ length: 7 }, spawnTreat)
      socks = Array.from({ length: 4 }, spawnSock)
      bombs = Array.from({ length: 1 }, spawnBomb)
      sparks = []; updateHud()
    }
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.save()
      if (shake) ctx.translate(rand(-8, 8) * shake * 3, rand(-8, 8) * shake * 3)
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#17091f'); g.addColorStop(1, '#070510'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      for (const st of stars) { const tw = 0.5 + 0.5 * Math.sin(t * 2 + st.tw); ctx.fillStyle = `rgba(255,255,255,${0.18 + tw * 0.42})`; ctx.beginPath(); ctx.arc((st.x + t * 12 * st.z) % W, st.y, st.z * 1.8, 0, TAU); ctx.fill() }
      ctx.strokeStyle = 'rgba(116,240,255,.12)'; ctx.lineWidth = 1
      for (let r = 80; r < Math.max(W, H); r += 90) { ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, TAU); ctx.stroke() }
      treats.forEach(drawTreat); socks.forEach(drawSock); bombs.forEach(drawBomb)
      for (const p of sparks) { ctx.globalAlpha = Math.max(0, p.life / 0.7); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1 }
      if (pointer.down) { ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cat.x, cat.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke() }
      if (invuln <= 0 || Math.floor(t * 14) % 2 === 0) drawCat(cat.x, cat.y, Math.atan2(cat.vy, cat.vx))
      ctx.restore()
    }
    const step = (now: number) => {
      requestAnimationFrame(step)
      const dt = Math.min((now - last) / 1000 || 0, 0.033); last = now
      if (!running || paused) return draw()
      t += dt; comboTimer -= dt; invuln = Math.max(0, invuln - dt); if (comboTimer <= 0) combo = 1
      const cx = W / 2, cy = H / 2
      cat.vx += (cx - cat.x) * 0.18 * dt; cat.vy += (cy - cat.y) * 0.18 * dt
      if (pointer.down) { cat.vx += (pointer.x - cat.x) * 5.2 * dt; cat.vy += (pointer.y - cat.y) * 5.2 * dt }
      cat.vx *= 0.992; cat.vy *= 0.992; cat.x += cat.vx * dt; cat.y += cat.vy * dt
      if (cat.x < 20 || cat.x > W - 20) cat.vx *= -0.9
      if (cat.y < 70 || cat.y > H - 20) cat.vy *= -0.9
      cat.x = Math.max(20, Math.min(W - 20, cat.x)); cat.y = Math.max(70, Math.min(H - 20, cat.y))
      const collect = (item: Thing, points: number, color: string, sfxName: string) => {
        score += combo * points; combo = Math.min(9, combo + 1); comboTimer = 2.1
        cat.vx += (cat.x - item.x) * 2.5; cat.vy += (cat.y - item.y) * 2.5
        burst(item.x, item.y, color, points > 1 ? 28 : 16); sfx(sfxName); updateHud()
      }
      treats.forEach((s, i) => { s.a += dt * 1.8; s.pulse = (s.pulse || 0) + dt * 5; if (Math.hypot(cat.x - s.x, cat.y - s.y) < cat.r + s.r + 10) { collect(s, s.kind === 'fish' ? 3 : 1, s.kind === 'fish' ? '#74f0ff' : '#ffef6f', s.kind === 'fish' ? 'fish' : 'treat'); treats[i] = spawnTreat(); if (score % 39 === 0 && bombs.length < 3) bombs.push(spawnBomb()) } })
      socks.forEach((s, i) => { s.x += (s.vx || 0) * dt; s.y += (s.vy || 0) * dt; s.a += (s.spin || 0) * dt; if (s.x < -70 || s.x > W + 70 || s.y < -70 || s.y > H + 70) socks[i] = spawnSock(); if (Math.hypot(cat.x - s.x, cat.y - s.y) < cat.r + s.r - 2) { collect(s, 2, '#d8c7ff', 'sock'); socks[i] = spawnSock(); if (score % 11 === 0) socks.push(spawnSock()) } })
      bombs.forEach((b, i) => { b.x += (b.vx || 0) * dt; b.y += (b.vy || 0) * dt; b.a += (b.spin || 0) * dt; b.fuse = (b.fuse || 0) + dt * 8; if (b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80) bombs[i] = spawnBomb(); if (Math.hypot(cat.x - b.x, cat.y - b.y) < cat.r + b.r - 3) { bombs[i] = spawnBomb(); loseLife() } })
      sparks = sparks.filter(p => (p.life -= dt) > 0).map(p => (p.x += p.vx * dt, p.y += p.vy * dt, p.vx *= 0.97, p.vy *= 0.97, p))
      musicStep(); shake = Math.max(0, shake - dt); draw()
    }
    const point = (e: PointerEvent | TouchEvent) => {
      const p = 'touches' in e ? e.touches[0] : e
      return { x: p.clientX, y: p.clientY }
    }
    const start = () => {
      initAudio(); audioCtx?.resume?.(); sfx('start'); nextBeat = 0; beat = 0
      title.textContent = 'SOCK CAT'
      text.textContent = 'You are a tiny laundry goblin. Drag anywhere to slingshot around the room.'
      hint.innerHTML = 'Catch socks and glowing treats. Avoid blinking bombs. You get <b>three lives</b>.'
      reset(); running = true; paused = false; card.classList.remove('show'); pauseBtn.textContent = 'Ⅱ'
    }
    const down = (e: PointerEvent | TouchEvent) => { e.preventDefault(); initAudio(); audioCtx?.resume?.(); pointer = { down: true, ...point(e) }; if (!running) start() }
    const move = (e: PointerEvent | TouchEvent) => { if (!pointer.down) return; e.preventDefault(); Object.assign(pointer, point(e)) }
    const up = () => { pointer.down = false }

    window.addEventListener('resize', resize); resize(); updateHud(); requestAnimationFrame(step); draw()
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('touchstart', down, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', up)
    startBtn.onclick = start
    soundBtn.onclick = () => { initAudio(); soundOn = !soundOn; soundBtn.classList.toggle('muted', !soundOn); soundBtn.textContent = soundOn ? '♪' : '×'; if (soundOn) { audioCtx?.resume?.(); sfx('treat') } }
    pauseBtn.onclick = () => { if (!running) return; paused = !paused; pauseBtn.textContent = paused ? '▶' : 'Ⅱ'; if (paused) { title.textContent = 'PAUSED'; text.textContent = 'The cat is pretending to be calm.'; hint.innerHTML = 'Tap START POUNCING to restart, or press ▶ to continue.'; card.classList.add('show') } else { audioCtx?.resume?.(); card.classList.remove('show') } }
    return () => { window.removeEventListener('resize', resize); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('touchstart', down); canvas.removeEventListener('touchmove', move); canvas.removeEventListener('touchend', up) }
  }, [])

  return (
    <main className="sockCatShell">
      <canvas ref={canvasRef} aria-label="Sock Cat game canvas" />
      <section className="sockCatHud">
        <div><span ref={scoreRef}>0</span><small>HAUL</small></div>
        <div><span ref={streakRef}>x1</span><small>ZOOM</small></div>
        <div><span ref={livesRef} className="lives">❤❤❤</span><small>LIVES</small></div>
        <button ref={soundRef} aria-label="Toggle sound">♪</button>
        <button ref={pauseRef} aria-label="Pause game">Ⅱ</button>
      </section>
      <section ref={cardRef} className="sockCatCard show">
        <h1 ref={titleRef}>SOCK CAT</h1>
        <p ref={textRef}>You are a tiny laundry goblin. Drag anywhere to slingshot around the room.</p>
        <p ref={hintRef} className="hint">Catch socks and glowing treats. Avoid blinking bombs. You get <b>three lives</b>.</p>
        <button ref={startRef}>START POUNCING</button>
      </section>
      <style>{`
        html, body { margin:0; width:100%; height:100%; overflow:hidden; background:#100719; color:#fff7ff; font-family: ui-rounded, "SF Pro Rounded", system-ui, -apple-system, sans-serif; touch-action:none; -webkit-user-select:none; user-select:none; }
        .sockCatShell { position:fixed; inset:0; padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); background:radial-gradient(circle at 30% 20%, rgba(255,118,76,.28), transparent 34%), radial-gradient(circle at 80% 70%, rgba(64,211,255,.23), transparent 32%), linear-gradient(180deg,#17091f 0%,#070510 100%); }
        canvas { width:100%; height:100%; display:block; }
        .sockCatHud { position:fixed; z-index:2; top:calc(12px + env(safe-area-inset-top)); left:calc(12px + env(safe-area-inset-left)); right:calc(12px + env(safe-area-inset-right)); display:flex; gap:10px; align-items:center; pointer-events:none; }
        .sockCatHud div, .sockCatHud button { border:1px solid rgba(255,255,255,.16); background:rgba(9,5,18,.48); backdrop-filter:blur(14px); border-radius:18px; box-shadow:0 12px 40px rgba(0,0,0,.25); }
        .sockCatHud div { min-width:78px; padding:9px 12px 8px; }
        .sockCatHud span { display:block; font-weight:900; font-size:22px; line-height:20px; }
        .lives { color:#ff4d6d; letter-spacing:-.05em; }
        .sockCatHud small { display:block; opacity:.58; font-size:10px; letter-spacing:.12em; margin-top:4px; }
        .sockCatHud button { color:white; font-size:22px; width:48px; height:48px; pointer-events:auto; appearance:none; font:inherit; font-weight:900; }
        .sockCatHud button:first-of-type { margin-left:auto; }
        .sockCatHud button.muted { opacity:.45; }
        .sockCatCard { position:fixed; z-index:4; left:50%; top:50%; width:min(440px, calc(100% - 40px)); transform:translate(-50%,-50%) scale(.96); opacity:0; pointer-events:none; transition:.22s ease; padding:28px 26px; border-radius:30px; background:linear-gradient(180deg, rgba(42,18,64,.86), rgba(10,7,21,.86)); border:1px solid rgba(255,255,255,.18); box-shadow:0 30px 80px rgba(0,0,0,.5); backdrop-filter:blur(24px); text-align:center; }
        .sockCatCard.show { transform:translate(-50%,-50%) scale(1); opacity:1; pointer-events:auto; }
        .sockCatCard h1 { margin:0 0 8px; font-size:clamp(42px,13vw,68px); letter-spacing:-.06em; line-height:.9; }
        .sockCatCard p { margin:10px 0; color:rgba(255,255,255,.78); font-size:16px; line-height:1.35; }
        .sockCatCard .hint { color:rgba(255,255,255,.64); }
        .sockCatCard button { appearance:none; border:0; font:inherit; font-weight:900; margin-top:14px; width:100%; padding:16px 18px; border-radius:20px; color:#210725; background:linear-gradient(135deg,#ffef6f,#ff8f45 45%,#74f0ff); box-shadow:0 14px 30px rgba(255,102,215,.25); }
      `}</style>
    </main>
  )
}
