'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { Machine } from './lib/machine'
import { decodePress, defaultPress } from './lib/model'
import { renderSheet, pulledTime, type Fonts } from './lib/paper'
import type { Sheet } from './lib/press'

const pad3 = (n: number) => String(n).padStart(3, '0')
const coarse = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

// Phones get the share sheet (Save Image / Save to Files); desktops get a download.
async function deliver(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type })
  if (coarse() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export default function Drum({ code }: { code: string | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const machineRef = useRef<Machine | null>(null)
  const [tray, setTray] = useState<{ open: boolean; focus?: number }>({ open: false })
  const [, bump] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    let cancelled = false
    const cs = getComputedStyle(rootRef.current!)
    const fam = (v: string, fallback: string) => cs.getPropertyValue(v).trim() || fallback
    const fonts: Fonts = {
      display: fam('--drum-display', 'sans-serif'),
      mono: fam('--drum-mono', 'monospace'),
      serif: fam('--drum-serif', 'serif'),
    }
    const insets = () => {
      const p = getComputedStyle(probeRef.current!)
      return { top: parseFloat(p.paddingTop) || 0, bottom: parseFloat(p.paddingBottom) || 0 }
    }
    Promise.all([
      document.fonts.load(`20px ${fonts.display}`),
      document.fonts.load(`20px ${fonts.mono}`),
      document.fonts.load(`italic 20px ${fonts.serif}`),
    ])
      .catch(() => {})
      .then(() => {
        if (cancelled) return
        const m = new Machine(
          canvasRef.current!,
          decodePress(code) ?? defaultPress(),
          fonts,
          { onTray: (no) => setTray({ open: true, focus: no }), onChange: bump },
          insets(),
        )
        machineRef.current = m
        if (process.env.NODE_ENV !== 'production') (window as unknown as { __drum: Machine }).__drum = m
        bump()
      })
    const onResize = () => machineRef.current?.resize(insets())
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
      machineRef.current?.dispose()
      machineRef.current = null
    }
  }, [code])

  return (
    <div ref={rootRef} className="drum-root">
      <div ref={probeRef} className="drum-probe" />
      <canvas ref={canvasRef} className="drum-press" aria-label="DRUM, a four-color stencil duplicator that plays" />
      {tray.open && machineRef.current && (
        <Tray machine={machineRef.current} focus={tray.focus} onClose={() => setTray({ open: false })} />
      )}
    </div>
  )
}

function Tray({ machine, focus, onClose }: { machine: Machine; focus?: number; onClose: () => void }) {
  const press = machine.press
  const sheets = [...press.sheets].reverse()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-no="${focus}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest' })
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [focus, onClose])

  const prints = sheets.filter((s) => s.kind === 'print').length
  const audio = press.audio

  const savePrint = async (s: Sheet) => {
    setBusy(`print${s.no}`)
    setNote('Pulling a full-size print…')
    await new Promise((r) => setTimeout(r, 30))
    const c = renderSheet(s, 1800, press.fonts)
    c.toBlob(async (b) => {
      if (b) await deliver(b, s.kind === 'manual' ? 'drum-instructions.png' : `drum-${pad3(s.no)}.png`)
      setBusy(null)
      setNote('')
    }, 'image/png')
  }

  const saveSound = async (s: Sheet) => {
    const wav = audio && s.t0 !== null && s.t1 !== null ? audio.wav(s.t0, s.t1) : null
    if (!wav) return setNote('That sound is gone. The tape keeps the last fifty seconds.')
    await deliver(wav, `drum-${pad3(s.no)}.wav`)
  }

  const shareMaster = async (s: Sheet) => {
    const url = `${location.origin}/drum?s=${s.master}`
    if (coarse() && navigator.share) {
      try {
        await navigator.share({ url, title: `DRUM No. ${pad3(s.no)}` })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setNote('Link copied. Whoever opens it gets this master on their drums.')
    } catch {
      setNote(url)
    }
  }

  return (
    <div className="drum-tray" role="dialog" aria-label="Output tray">
      <header>
        <h2>TRAY</h2>
        <span>
          {prints} {prints === 1 ? 'sheet' : 'sheets'}, newest first
        </span>
        <button className="close" onClick={onClose}>
          back
        </button>
      </header>
      <div className="strip" ref={stripRef}>
        {sheets.map((s) => {
          const has = !!audio && s.kind === 'print' && s.t0 !== null && s.t1 !== null && audio.hasAudio(s.t0, s.t1)
          const secs = s.t0 !== null && s.t1 !== null ? (s.t1 - s.t0).toFixed(1) : ''
          return (
            <figure key={s.no} data-no={s.no}>
              {s.url ? <img src={s.url} alt={s.kind === 'manual' ? 'Operating instructions' : `Sheet ${s.no}`} /> : <img alt="" />}
              <figcaption>
                {s.kind === 'manual' ? (
                  <>
                    <b>Instructions</b>came with the press
                  </>
                ) : (
                  <>
                    <b>No. {pad3(s.no)}</b>
                    {s.chord} · {s.rpm} rpm · {pulledTime(s.pulledAt)}
                    {s.partial ? ' · pulled early' : ''}
                    {s.skew ? ' · misfed' : ''}
                  </>
                )}
              </figcaption>
              <div className="row">
                <button disabled={busy !== null} onClick={() => savePrint(s)}>
                  Save print
                </button>
                {s.kind === 'print' && (
                  <>
                    <button disabled={!has} onClick={() => saveSound(s)} title={has ? '' : 'The tape keeps the last fifty seconds'}>
                      {has ? `Save sound · ${secs}s` : 'Sound faded'}
                    </button>
                    <button onClick={() => shareMaster(s)}>Share master</button>
                  </>
                )}
              </div>
            </figure>
          )
        })}
      </div>
      <div className="note">{note}</div>
    </div>
  )
}
