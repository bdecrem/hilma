import { ImageResponse } from 'next/og'
import { STEPS } from './steps'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// The page's own look: warm paper, ink, one ultramarine rail with the fourteen steps on it.
export default function OgImage() {
  const done = STEPS.filter((s) => s.status === 'done').length
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f7efdf',
          padding: '64px 72px 56px',
          fontFamily: 'system-ui, sans-serif',
          color: '#16121c',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: '0.14em', color: '#3d3bff', fontWeight: 600 }}>SMALLGPT</div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: 86, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
            Building a GPT,
          </div>
          <div style={{ display: 'flex', fontSize: 86, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>one step at a time.</div>
          <div style={{ display: 'flex', marginTop: 26, fontSize: 30, color: '#5a5261' }}>
            Tokenizer → backprop → attention → pretraining → SFT → DPO → RLVR
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {STEPS.map((s) => (
            <div
              key={s.n}
              style={{
                display: 'flex',
                width: 52,
                height: 52,
                borderRadius: 26,
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 600,
                background: s.status === 'done' ? '#3d3bff' : '#f7efdf',
                border: `3px solid ${s.status === 'done' ? '#3d3bff' : s.status === 'next' ? '#ff4b1f' : '#d9cdb4'}`,
                color: s.status === 'done' ? '#fff' : s.status === 'next' ? '#ff4b1f' : '#9a9198',
              }}
            >
              {s.n}
            </div>
          ))}
          <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 24, color: '#5a5261', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {done} of {STEPS.length} done
          </div>
        </div>
      </div>
    ),
    size
  )
}
