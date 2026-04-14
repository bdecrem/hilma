'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const TIMES = [
  '6:14am', '7:23am', '8:02am', '9:47am', '10:28am', '11:08am',
  '1:32pm', '2:14pm', '3:19pm', '3:47pm', '4:51pm', '5:36pm',
  '6:28pm', '7:42pm', '8:11pm', '9:16pm', '10:33pm', '11:57pm',
]
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const LOCATIONS = [
  'your kitchen', 'your car', 'your hallway', 'your bathroom',
  'an elevator', 'a parking lot', 'a cvs', 'a diner',
  'the grocery store', 'the laundromat', 'a stairwell', 'a bodega',
  'the bus', 'a coffee shop', 'a waiting room',
]
const MOMENTS = [
  'stood holding a mug that had gone cold',
  'watched a bird on a wire for longer than you meant to',
  'refilled your water bottle without thinking',
  'ate a dumpling and forgot to take a photo of it',
  'waited for someone to finish their sentence',
  'noticed the light was different than yesterday',
  'picked up a penny and put it back down',
  'smelled something that reminded you of something else',
  'got a text and did not answer it',
  'closed a tab you had open for weeks',
  'heard a song you had not thought about in years',
  'held the door open for someone who did not thank you',
  'made a pretty okay sandwich',
  'saw a stranger\u2019s tote bag and wanted one',
  'couldn\u2019t remember what day it was for three seconds',
  'walked past a dog and smiled at it',
  'paid full attention to one sip of coffee',
  'noticed your own hands for no reason',
  'realized you had been humming',
  'caught yourself in a window and did not look away',
]
const FEELINGS = [
  'thought about nothing for six seconds',
  'felt fine, which is sometimes enough',
  'were glad about it in a small way',
  'decided you were happy enough',
  'were neither here nor there',
  'forgot you were a person for a minute',
  'did not reach for your phone',
  'let it be a small thing',
  'were briefly unreachable',
  'did not post about it',
  'did not need anything',
  'felt like the weather',
]

interface Cert {
  time: string
  day: string
  location: string
  moment: string
  feeling: string
  serial: string
}

function newCert(): Cert {
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
  const num = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return {
    time: pick(TIMES),
    day: pick(DAYS),
    location: pick(LOCATIONS),
    moment: pick(MOMENTS),
    feeling: pick(FEELINGS),
    serial: `AUTH-2026-${num}`,
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = t
    }
  }
  if (cur) lines.push(cur)
  return lines
}

export default function Authentic() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const certRef = useRef<Cert>(newCert())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('authentic')

    const INK = '#2A2218'
    const PAPER = '#F5EBD7'
    const STAMP = '#FF4E50'

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1); grad.addColorStop(1, bg2)
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)

      // Paper dimensions — fills most of screen with margin
      const margin = Math.min(28, W * 0.05)
      const pW = Math.min(W - margin * 2, 560)
      const pH = Math.min(H - margin * 2 - 30, pW * 1.35)
      const pX = (W - pW) / 2
      const pY = (H - pH) / 2 - 6

      // Paper shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(pX + 6, pY + 8, pW, pH)
      // Paper
      ctx.fillStyle = PAPER
      ctx.fillRect(pX, pY, pW, pH)

      // Subtle paper texture — scattered specks
      ctx.fillStyle = 'rgba(166, 120, 60, 0.06)'
      for (let i = 0; i < 80; i++) {
        const x = pX + Math.random() * pW
        const y = pY + Math.random() * pH
        ctx.fillRect(x, y, 1 + Math.random() * 2, 1)
      }

      // Border: double line
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.strokeRect(pX + 14, pY + 14, pW - 28, pH - 28)
      ctx.lineWidth = 0.5
      ctx.strokeRect(pX + 20, pY + 20, pW - 40, pH - 40)

      // Corner flourishes — small crosses
      ctx.fillStyle = INK
      const flourishes: [number, number][] = [
        [pX + 14, pY + 14],
        [pX + pW - 14, pY + 14],
        [pX + 14, pY + pH - 14],
        [pX + pW - 14, pY + pH - 14],
      ]
      flourishes.forEach(([fx, fy]) => {
        ctx.fillRect(fx - 3, fy - 0.5, 7, 1)
        ctx.fillRect(fx - 0.5, fy - 3, 1, 7)
      })

      // Title
      ctx.fillStyle = INK
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const titleSize = Math.max(13, pW * 0.038)
      ctx.font = `bold ${titleSize}px Georgia, "Times New Roman", serif`
      const letterSp = pW * 0.012
      // Draw title with letter-spacing manually
      const title = 'CERTIFICATE OF AUTHENTICITY'
      ctx.font = `bold ${titleSize}px Georgia, serif`
      ctx.fillText(title, pX + pW / 2, pY + pH * 0.08)

      // Subtitle
      const subSize = Math.max(10, pW * 0.024)
      ctx.font = `italic ${subSize}px Georgia, serif`
      ctx.fillStyle = 'rgba(42,34,24,0.6)'
      ctx.fillText('bureau of ordinary moments', pX + pW / 2, pY + pH * 0.08 + titleSize + 8)

      // Top divider
      const divY1 = pY + pH * 0.22
      ctx.strokeStyle = INK
      ctx.lineWidth = 0.7
      ctx.beginPath()
      ctx.moveTo(pX + pW * 0.15, divY1)
      ctx.lineTo(pX + pW / 2 - 8, divY1)
      ctx.moveTo(pX + pW / 2 + 8, divY1)
      ctx.lineTo(pX + pW - pW * 0.15, divY1)
      ctx.stroke()
      // Diamond ornament
      ctx.fillStyle = INK
      const dSize = 4
      ctx.beginPath()
      ctx.moveTo(pX + pW / 2, divY1 - dSize)
      ctx.lineTo(pX + pW / 2 + dSize, divY1)
      ctx.lineTo(pX + pW / 2, divY1 + dSize)
      ctx.lineTo(pX + pW / 2 - dSize, divY1)
      ctx.closePath()
      ctx.fill()

      // "this certifies that"
      const preSize = Math.max(10, pW * 0.023)
      ctx.font = `italic ${preSize}px Georgia, serif`
      ctx.fillStyle = 'rgba(42,34,24,0.7)'
      ctx.fillText('this certifies that', pX + pW / 2, divY1 + 22)

      // The moment
      const cert = certRef.current
      const momentText = `at ${cert.time} on a ${cert.day}, you ${cert.moment} in ${cert.location} and ${cert.feeling}.`
      const bodySize = Math.max(13, pW * 0.036)
      ctx.font = `${bodySize}px Georgia, serif`
      ctx.fillStyle = INK
      const lines = wrap(ctx, momentText, pW - pW * 0.18)
      const lineH = bodySize * 1.35
      const bodyStartY = divY1 + 22 + preSize + 18
      lines.forEach((line, i) => {
        ctx.fillText(line, pX + pW / 2, bodyStartY + i * lineH)
      })

      // Bottom divider
      const divY2 = bodyStartY + lines.length * lineH + 24
      ctx.strokeStyle = INK
      ctx.lineWidth = 0.7
      ctx.beginPath()
      ctx.moveTo(pX + pW * 0.15, divY2)
      ctx.lineTo(pX + pW / 2 - 8, divY2)
      ctx.moveTo(pX + pW / 2 + 8, divY2)
      ctx.lineTo(pX + pW - pW * 0.15, divY2)
      ctx.stroke()
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.moveTo(pX + pW / 2, divY2 - dSize)
      ctx.lineTo(pX + pW / 2 + dSize, divY2)
      ctx.lineTo(pX + pW / 2, divY2 + dSize)
      ctx.lineTo(pX + pW / 2 - dSize, divY2)
      ctx.closePath()
      ctx.fill()

      // Closing lines
      const closeSize = Math.max(10, pW * 0.023)
      ctx.font = `italic ${closeSize}px Georgia, serif`
      ctx.fillStyle = 'rgba(42,34,24,0.8)'
      ctx.fillText('this moment was authentic.', pX + pW / 2, divY2 + 22)
      ctx.fillText('it happened. it counted.', pX + pW / 2, divY2 + 22 + closeSize + 6)

      // Seal — circular stamp
      const sealR = Math.max(32, pW * 0.09)
      const sealX = pX + pW * 0.22
      const sealY = pY + pH - pH * 0.14
      ctx.save()
      ctx.translate(sealX, sealY)
      ctx.rotate(-0.12)
      ctx.globalAlpha = 0.88
      ctx.fillStyle = STAMP
      ctx.beginPath()
      ctx.arc(0, 0, sealR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = PAPER
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(0, 0, sealR - 7, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = PAPER
      ctx.font = `bold ${sealR * 0.22}px Georgia, serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('CERTIFIED', 0, -sealR * 0.2)
      ctx.font = `bold ${sealR * 0.38}px Georgia, serif`
      ctx.fillText('\u2605', 0, sealR * 0.2)
      ctx.globalAlpha = 1
      ctx.restore()

      // Signature
      const sigSize = Math.max(11, pW * 0.025)
      ctx.font = `italic ${sigSize}px Georgia, serif`
      ctx.fillStyle = INK
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText('\u2014 bureau of', pX + pW * 0.40, sealY - 4)
      ctx.fillText('  ordinary moments', pX + pW * 0.40, sealY + sigSize + 2)

      // Serial number
      const serialSize = Math.max(8, pW * 0.018)
      ctx.font = `${serialSize}px ui-monospace, Menlo, monospace`
      ctx.fillStyle = 'rgba(42,34,24,0.55)'
      ctx.textAlign = 'center'
      ctx.fillText(cert.serial, pX + pW / 2, pY + pH - 26)

      // Hint
      ctx.font = `11px ui-monospace, Menlo, monospace`
      ctx.fillStyle = 'rgba(42,34,24,0.45)'
      ctx.textAlign = 'center'
      ctx.fillText('tap to certify another moment', W / 2, H - 18)
    }

    function handleTap() {
      certRef.current = newCert()
      draw()
    }

    canvas.addEventListener('click', handleTap)
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      handleTap()
    }, { passive: false })

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
      draw()
    }
    window.addEventListener('resize', onResize)

    draw()

    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0,
      width: '100%', height: '100dvh',
      cursor: 'pointer', touchAction: 'none',
    }} />
  )
}
