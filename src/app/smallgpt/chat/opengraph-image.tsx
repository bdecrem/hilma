import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// The chat page's card: the smallgpt paper, one question and a real reply from the cranky model.
export default function OgImage() {
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
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: '0.14em', color: '#3d3bff', fontWeight: 600 }}>SMALLGPT · STEP 9</div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: 84, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
            Ask the 1985 hacker.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 36, fontWeight: 600 }}>Where can I get the source for GNU Emacs?</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontFamily: 'monospace' }}>
            <div style={{ display: 'flex', background: '#ff4b1f', color: '#f7efdf', fontSize: 20, padding: '4px 10px', borderRadius: 4 }}>CRANKY</div>
            <div style={{ display: 'flex' }}>It&apos;s available on prep.ai.mit.edu in pub/gnu.</div>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#5a5261' }}>A 92M-parameter GPT from 1980s Usenet, running in your browser · ola.cx/smallgpt/chat</div>
      </div>
    ),
    size,
  )
}
