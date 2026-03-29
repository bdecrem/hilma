'use client'

import { useEffect, useRef } from 'react'

const ITEMS: [string, string][] = [
  ['1x sunrise (complimentary)', '$0.00'],
  ['3x existential thoughts', '$4.72'],
  ['47x breaths you noticed', 'FREE'],
  ['1x forgetting why you walked\n   into the kitchen', '$2.15'],
  ['1x déjà vu', '$1.11'],
  ['1x déjà vu', '$1.11'],
  ['∞ tabs open (never closing)', '$9.99/mo'],
  ['1x staring at the fridge\n   hoping new food appeared', '$0.50'],
  ['1x song stuck in head\n   (royalty fee)', '$3.40'],
  ['2x checking phone for no reason', '$0.00*'],
  ['    *billed to your attention\n     span separately', ''],
  ['1x brief moment of clarity\n   (immediately lost)', '$7.77'],
  ['1x pretending to read\n   the terms & conditions', '$0.01'],
  ['14x micro-judgments of\n   strangers (non-refundable)', '$6.20'],
  ['1x lying about being "fine"', '$2.00'],
  ['1x being genuinely fine\n   (rare, limited edition)', '$44.99'],
  ['1x wondering if your pet\n   actually likes you', '$1.85'],
  ['5x deep breaths that fixed\n   absolutely nothing', '$0.00'],
  ['1x almost sending that text', '$0.00'],
  ['1x sending that text', '$12.50'],
  ['1x gravity (all day)', 'INCL.'],
  ['1x consciousness\n   (non-optional)', '$∞.∞∞'],
  ['1x sunset (see sunrise)', '$0.00'],
  ['1x dreams (content varies;\n   no refunds)', '$5.55'],
  ['1x waking up at 3am\n   thinking about 2009', '$3.33'],
  ['1x time (passing)', 'VOID'],
  ['1x nostalgia for something\n   that never happened', '$8.08'],
  ['1x typing a long reply\n   then deleting it all', '$0.00'],
  ['1x successfully parallel\n   parking on first try', '-$10.00'],
  ['1x forgetting someone\'s\n   name mid-conversation', '$4.00'],
  ['1x remembering their name\n   2 hours later in bed', '$0.00'],
  ['1x the specific sadness of\n   a half-eaten sandwich', '$1.25'],
  ['1x pretending your phone\n   died to avoid a call', '$3.00'],
  ['1x the void', 'N/A'],
  ['1x looking at the void', '$6.66'],
  ['1x the void looking back', 'PENDING'],
]

const HEADER = [
  '================================',
  '      THE UNIVERSE, INC.        ',
  '   "everything, all the time"   ',
  '================================',
  '  DATE: TODAY    TIME: NOW      ',
  '  CUSTOMER: YOU                 ',
  '  CASHIER: ENTROPY              ',
  '--------------------------------',
]

const FOOTER_LINES = [
  '--------------------------------',
  '  SUBTOTAL:          $SEE ABOVE ',
  '  TAX (existence):        42%   ',
  '  TOTAL:             IT DEPENDS ',
  '',
  '  PAYMENT: AUTOMATIC            ',
  '  (deducted from your lifespan) ',
  '',
  '================================',
  '  THANK YOU FOR EXISTING        ',
  '     (no receipt = no proof)    ',
  '================================',
  '',
  '     questions? complaints?     ',
  '        shout into void         ',
  '    avg response time: ∞ days   ',
  '',
]

export default function ReceiptPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W
    canvas.height = H

    // Receipt state
    const CHAR_H = Math.max(16, Math.min(22, W * 0.025))
    const CHAR_W = CHAR_H * 0.6
    const RECEIPT_W = CHAR_W * 36
    const MARGIN_X = (W - RECEIPT_W) / 2
    const PAD = CHAR_W * 2

    // All lines to print
    const allTextLines: string[] = []
    for (const h of HEADER) allTextLines.push(h)
    allTextLines.push('')

    // Shuffle items
    const shuffled = [...ITEMS].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, 18 + Math.floor(Math.random() * 8))

    for (const [desc, price] of selected) {
      const descLines = desc.split('\n')
      const firstLine = descLines[0]
      if (price) {
        // Right-align price
        const dots = Math.max(1, 32 - firstLine.length - price.length)
        allTextLines.push(firstLine + '.'.repeat(dots) + price)
      } else {
        allTextLines.push(firstLine)
      }
      for (let i = 1; i < descLines.length; i++) {
        allTextLines.push(descLines[i])
      }
    }

    allTextLines.push('')
    for (const f of FOOTER_LINES) allTextLines.push(f)

    // Printing state
    let printedChars = 0
    let totalChars = 0
    for (const line of allTextLines) totalChars += line.length + 1 // +1 for newline
    let printSpeed = 6 // chars per frame
    let scrollY = 0
    let tapping = false
    let tapBoost = 0

    function getLineAndChar(charIdx: number): [number, number] {
      let remaining = charIdx
      for (let i = 0; i < allTextLines.length; i++) {
        if (remaining <= allTextLines[i].length) return [i, remaining]
        remaining -= allTextLines[i].length + 1
      }
      return [allTextLines.length - 1, allTextLines[allTextLines.length - 1].length]
    }

    // Thermal noise texture (pre-generate)
    const noiseCanvas = document.createElement('canvas')
    noiseCanvas.width = Math.ceil(RECEIPT_W + PAD * 2)
    noiseCanvas.height = 4000
    const noiseCtx = noiseCanvas.getContext('2d')!
    const noiseData = noiseCtx.createImageData(noiseCanvas.width, noiseCanvas.height)
    for (let i = 0; i < noiseData.data.length; i += 4) {
      const v = 235 + Math.random() * 20
      noiseData.data[i] = v
      noiseData.data[i + 1] = v - 5
      noiseData.data[i + 2] = v - 10
      noiseData.data[i + 3] = 255
    }
    noiseCtx.putImageData(noiseData, 0, 0)

    function onDown() { tapping = true; tapBoost = 40 }
    function onUp() { tapping = false; tapBoost = Math.max(tapBoost, 0) }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)

    let raf: number
    function animate() {
      // Advance printing
      const speed = printSpeed + (tapping ? tapBoost : 0)
      if (tapBoost > 0 && !tapping) tapBoost *= 0.95
      printedChars = Math.min(printedChars + speed, totalChars)

      const [currentLine] = getLineAndChar(printedChars)

      // Calculate content height and auto-scroll
      const contentH = (currentLine + 2) * CHAR_H * 1.3
      const visibleH = H - 80
      if (contentH > visibleH) {
        const targetScroll = contentH - visibleH
        scrollY += (targetScroll - scrollY) * 0.08
      }

      // Background — warm peachy
      ctx!.fillStyle = '#FFE8D6'
      ctx!.fillRect(0, 0, W, H)

      // Receipt paper shadow
      ctx!.save()
      ctx!.shadowColor = 'rgba(0,0,0,0.15)'
      ctx!.shadowBlur = 20
      ctx!.shadowOffsetX = 4
      ctx!.shadowOffsetY = 4
      ctx!.fillStyle = '#FAF3EB'
      const paperTop = 30 - scrollY
      const paperH = contentH + 60
      ctx!.fillRect(MARGIN_X - PAD, paperTop, RECEIPT_W + PAD * 2, paperH)
      ctx!.restore()

      // Thermal noise overlay on paper
      ctx!.save()
      ctx!.globalAlpha = 0.3
      ctx!.drawImage(noiseCanvas, 0, 0, noiseCanvas.width, Math.min(noiseCanvas.height, paperH),
        MARGIN_X - PAD, paperTop, RECEIPT_W + PAD * 2, Math.min(noiseCanvas.height, paperH))
      ctx!.restore()

      // Torn top edge
      ctx!.save()
      ctx!.beginPath()
      ctx!.moveTo(MARGIN_X - PAD, paperTop)
      for (let x = MARGIN_X - PAD; x < MARGIN_X + RECEIPT_W + PAD; x += 4) {
        ctx!.lineTo(x, paperTop + Math.random() * 3 - 1)
      }
      ctx!.lineTo(MARGIN_X + RECEIPT_W + PAD, paperTop - 5)
      ctx!.lineTo(MARGIN_X - PAD, paperTop - 5)
      ctx!.closePath()
      ctx!.fillStyle = '#FFE8D6'
      ctx!.fill()
      ctx!.restore()

      // Print text
      ctx!.save()
      ctx!.font = `${CHAR_H}px "Courier New", Courier, monospace`
      ctx!.textBaseline = 'top'

      let charCount = 0
      for (let i = 0; i < allTextLines.length; i++) {
        const line = allTextLines[i]
        const lineY = 50 + i * CHAR_H * 1.3 - scrollY

        if (lineY > H + CHAR_H) break
        if (lineY < -CHAR_H * 2) {
          charCount += line.length + 1
          continue
        }

        for (let j = 0; j < line.length; j++) {
          if (charCount >= printedChars) break
          const ch = line[j]

          // Thermal print effect — slight random fade
          const fade = 0.7 + Math.random() * 0.3
          const gray = Math.floor(40 * fade)
          ctx!.fillStyle = `rgb(${gray},${gray - 5},${gray + 5})`

          // Slight position jitter for thermal look
          const jx = (Math.random() - 0.5) * 0.5
          const jy = (Math.random() - 0.5) * 0.3

          ctx!.fillText(ch, MARGIN_X + j * CHAR_W + jx, lineY + jy)
          charCount++
        }
        charCount++ // newline
        if (charCount >= printedChars) break
      }

      // Printing cursor blink
      if (printedChars < totalChars) {
        const [curLine, curChar] = getLineAndChar(printedChars)
        const curY = 50 + curLine * CHAR_H * 1.3 - scrollY
        const curX = MARGIN_X + curChar * CHAR_W
        if (Math.floor(Date.now() / 300) % 2 === 0) {
          ctx!.fillStyle = '#333'
          ctx!.fillRect(curX, curY, CHAR_W, CHAR_H)
        }
      }

      ctx!.restore()

      // Tap hint
      if (printedChars < totalChars * 0.3) {
        ctx!.save()
        ctx!.globalAlpha = 0.25 + Math.sin(Date.now() / 600) * 0.1
        ctx!.fillStyle = '#78716c'
        ctx!.font = `${Math.max(13, W * 0.016)}px system-ui, sans-serif`
        ctx!.textAlign = 'center'
        ctx!.fillText('tap to rush the printer', W / 2, H - 30)
        ctx!.restore()
      }

      raf = requestAnimationFrame(animate)
    }

    animate()

    function onResize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W
      canvas!.height = H
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      canvas!.removeEventListener('pointerdown', onDown)
      canvas!.removeEventListener('pointerup', onUp)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100dvh',
        touchAction: 'none',
        cursor: 'pointer',
      }}
    />
  )
}
