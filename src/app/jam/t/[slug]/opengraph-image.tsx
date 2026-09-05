import { ImageResponse } from 'next/og'
import { jamDb } from '@/lib/jam/db'
import { stripFromSession } from '@/lib/jam/strip'

// Share card for a published track: its title, who made it, tempo, and its
// own 16-step pattern on the enamel panel.
// Math: 16 cells × 56px + 15 gaps × 12px = 1076px; margin (1200 − 1076) / 2 = 62px.

export const alt = 'A Jambot track'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamic = 'force-dynamic'

const CELL = 56
const GAP = 12
const ROW_H = [40, 28, 20]
const ROW_COLOR = ['#ff4f1f', '#2c5bff', '#14161a']

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let title = 'Jambot'
  let by = ''
  let bpm = 0
  let bars = 0
  let bits = ['0'.repeat(16), '0'.repeat(16), '0'.repeat(16)]
  if (/^[a-z0-9]{4,16}$/.test(slug)) {
    try {
      const { data } = await jamDb()
        .from('jam_tracks')
        .select('title, bpm, bars, session, remix_of, jam_users(username)')
        .eq('slug', slug)
        .not('published_at', 'is', null)
        .maybeSingle()
      if (data) {
        const u = data.jam_users as unknown as { username: string } | { username: string }[] | null
        by = (Array.isArray(u) ? u[0]?.username : u?.username) ?? ''
        title = String(data.title || 'Untitled')
        bpm = data.bpm
        bars = data.bars
        const s = stripFromSession(data.session)
        if (s) bits = [s.k, s.s, s.h]
      }
    } catch { /* fall through to the plain card */ }
  }

  const titleSize = title.length > 22 ? 84 : title.length > 14 ? 108 : 132

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#dcdfd8',
          color: '#14161a',
          padding: '52px 62px 56px',
          fontFamily: 'Arial Narrow, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 24, letterSpacing: 5, color: '#6b6f78', textTransform: 'uppercase' }}>
            <span>Jambot</span>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: '#ff4f1f', boxShadow: '0 0 10px #ff4f1f' }} />
            <span>{by ? `${by} · ${bpm} BPM · ${bars} ${bars === 1 ? 'bar' : 'bars'}` : 'a groovebox you talk to'}</span>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              letterSpacing: 2,
              lineHeight: 1,
              textTransform: 'uppercase',
              marginTop: 14,
              maxWidth: 1076,
              overflow: 'hidden',
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
          {bits.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: GAP }}>
              {Array.from({ length: 16 }, (_, i) => {
                const on = row[i] === '1'
                return (
                  <div
                    key={i}
                    style={{
                      width: CELL,
                      height: ROW_H[r],
                      borderRadius: 8,
                      background: on ? ROW_COLOR[r] : '#b7bbb2',
                      opacity: on ? 1 : 0.55,
                      boxShadow: on && r === 0 ? `0 0 28px ${ROW_COLOR[r]}99` : 'none',
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 26, color: '#3a3d44' }}>
          <div>Play it, then remix it with the groovebox.</div>
          <div style={{ fontFamily: 'Courier New, monospace', fontSize: 26 }}>{`jambot.to/t/${slug}`}</div>
        </div>
      </div>
    ),
    { ...size },
  )
}
