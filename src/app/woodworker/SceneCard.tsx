'use client'
// A story scene: Cyriel in a pose, one line, a few panels. Tap Next (or press
// Enter or the right arrow) to go on; Skip or Escape closes it.
import { useState } from 'react'
import type { Scene } from './lib/story'
import Cyriel from './boards/Cyriel'

export default function SceneCard({ scene, title, done, onDone }: { scene: Scene; title: string; done: string; onDone(): void }) {
  const [i, setI] = useState(0)
  const p = scene.panels[i]
  const last = i === scene.panels.length - 1
  const next = () => (last ? onDone() : setI(i + 1))
  return (
    <div
      className="scene"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDone()
        if (e.key === 'ArrowRight') next()
        e.stopPropagation()
      }}
    >
      <div className="scene-card" key={i}>
        {scene.chapter && i === 0 ? <div className="chapter">{scene.chapter}</div> : <div className="chapter quiet">{title}</div>}
        <div className="scene-art">
          <Cyriel pose={p.pose} krul={p.krul} />
        </div>
        <p className="say">{p.say}</p>
        <div className="row">
          <button type="button" className="skip" onClick={onDone}>Skip</button>
          <span className="dots" aria-hidden>
            {scene.panels.map((_, k) => (
              <i key={k} className={k === i ? 'at' : ''} />
            ))}
          </span>
          <button type="button" className="primary" autoFocus onClick={next}>
            {last ? done : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
