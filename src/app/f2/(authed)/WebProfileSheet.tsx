'use client'

import { useEffect, useRef, useState } from 'react'
import { useFeyndTheme, type FeyndThemeMode } from './FeyndThemeProvider'

type Progress = {
  level: number
  starred_topic_count: number
  total_stars: number
  mastered_topic_count: number
  current_level_at: number
  next_level_at: number
  to_next_level: number
}

/// Italic flavor word — keep in lockstep with `levelTitle()` in
/// `src/lib/f2/progress.ts` and `feyndLevelTitle()` in `Models.swift`.
function levelTitle(level: number): string {
  if (level <= 0) return 'Newcomer'
  if (level === 1) return 'Beginner'
  if (level === 2) return 'Curious'
  if (level === 3) return 'Student'
  if (level === 4) return 'Apprentice'
  if (level === 5) return 'Scholar'
  if (level === 6) return 'Adept'
  if (level === 7) return 'Practitioner'
  if (level === 8) return 'Expert'
  if (level === 9) return 'Master'
  return 'Sage'
}

/// Profile sheet — slide-up modal port of the iOS ProfileSheet.
/// Light + dark are inherited automatically via the theme tokens.
export default function WebProfileSheet({
  open,
  onClose,
  username,
  avatarUrl,
  progress,
  onAvatarChange,
  onLogout,
}: {
  open: boolean
  onClose: () => void
  username: string
  avatarUrl: string | null
  progress: Progress | null
  onAvatarChange: (url: string | null) => void
  onLogout: () => void
}) {
  const { mode, setMode } = useFeyndTheme()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // iMessage pairing state.
  const [imessageHandles, setImessageHandles] = useState<string[]>([])
  const [imessageMode, setImessageMode] = useState<'idle' | 'enterHandle' | 'enterCode'>('idle')
  const [imessageHandle, setImessageHandle] = useState('')
  const [imessageCode, setImessageCode] = useState('')
  const [imessageBusy, setImessageBusy] = useState(false)
  const [imessageError, setImessageError] = useState<string | null>(null)

  // Load existing paired handles whenever the sheet opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/f2/imessage/handles', { cache: 'no-store' })
        if (!res.ok) return
        const j = (await res.json()) as { handles: string[] }
        if (!cancelled) setImessageHandles(j.handles ?? [])
      } catch { /* leave empty */ }
    })()
    return () => { cancelled = true }
  }, [open])

  async function imessageStart() {
    if (!imessageHandle.trim() || imessageBusy) return
    setImessageBusy(true)
    setImessageError(null)
    const res = await fetch('/api/f2/imessage/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: imessageHandle.trim() }),
    })
    setImessageBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setImessageError(j.error ?? "Couldn't send the code.")
      return
    }
    const j = (await res.json()) as { handle: string }
    setImessageHandle(j.handle)
    setImessageMode('enterCode')
  }

  async function imessageConfirm() {
    if (imessageCode.length !== 6 || imessageBusy) return
    setImessageBusy(true)
    setImessageError(null)
    const res = await fetch('/api/f2/imessage/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: imessageHandle, code: imessageCode }),
    })
    setImessageBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setImessageError(j.error ?? "Code didn't match.")
      return
    }
    const j = (await res.json()) as { handle: string }
    setImessageHandles(prev => prev.includes(j.handle) ? prev : [...prev, j.handle])
    setImessageMode('idle')
    setImessageHandle('')
    setImessageCode('')
  }

  async function imessageRemove(handle: string) {
    const prev = imessageHandles
    setImessageHandles(prev.filter(h => h !== handle))
    const res = await fetch('/api/f2/imessage/handles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    })
    if (!res.ok) setImessageHandles(prev)
  }

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 1024 * 1024) {
      setUploadError('Image is over 1 MB. Pick a smaller one.')
      return
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setUploadError('Only JPG or PNG accepted.')
      return
    }
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/f2/avatar', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? `upload failed (${res.status})`)
      }
      const { avatar_url } = (await res.json()) as { avatar_url: string }
      onAvatarChange(avatar_url)
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function removeAvatar() {
    setUploading(true)
    setUploadError(null)
    try {
      const res = await fetch('/api/f2/avatar', { method: 'DELETE' })
      if (!res.ok) throw new Error('Remove failed.')
      onAvatarChange(null)
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Remove failed.')
    } finally {
      setUploading(false)
    }
  }

  if (!open) return null

  const p = progress
  const totalStars = p?.total_stars ?? 0
  const level = p?.level ?? 0
  const nextAt = p?.next_level_at ?? 1
  const span = Math.max(1, (p?.next_level_at ?? 1) - (p?.current_level_at ?? 0))
  const earned = Math.max(0, totalStars - (p?.current_level_at ?? 0))
  const fill = Math.min(1, earned / span)
  const toNext = p?.to_next_level ?? 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Profile and settings"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'feyndSheetFade 0.18s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '92dvh',
          background: 'var(--feynd-bg-raised)',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'feyndSheetSlide 0.22s ease-out',
        }}
      >
        {/* drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <div style={{
            width: 38, height: 4, borderRadius: 2,
            background: 'var(--feynd-surface-3)',
          }} />
        </div>

        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px 4px',
        }}>
          <div style={{ width: 36 }} />
          <div style={{
            fontSize: 16, fontWeight: 600, color: 'var(--feynd-text)',
            letterSpacing: -0.2,
          }}>Profile</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--feynd-surface-2)',
              border: '1px solid var(--feynd-border)',
              color: 'var(--feynd-text-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* HERO */}
          <div style={{ padding: '14px 22px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Avatar
                username={username}
                avatarUrl={avatarUrl}
                uploading={uploading}
                onPick={() => fileRef.current?.click()}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 22, fontWeight: 700, color: 'var(--feynd-text)',
                  letterSpacing: -0.5, lineHeight: 1.1,
                }}>{username}</div>
                <div style={{
                  marginTop: 4, fontSize: 13, color: 'var(--feynd-text-2)',
                  letterSpacing: -0.1,
                }}>
                  Level{' '}
                  <span style={{ color: 'var(--feynd-text)', fontWeight: 600 }}>{level}</span>
                  <span style={{ color: 'var(--feynd-text-3)' }}> · </span>
                  <span style={{ fontStyle: 'italic' }}>{levelTitle(level)}</span>
                </div>
              </div>
            </div>

            {/* progress */}
            <div style={{ marginTop: 18 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'baseline', marginBottom: 8,
                fontSize: 12, color: 'var(--feynd-text-2)', letterSpacing: -0.1,
              }}>
                <span>
                  <span style={{ color: 'var(--feynd-text)', fontWeight: 600 }}>{totalStars}</span>
                  <span style={{ color: 'var(--feynd-text-3)' }}> / {nextAt} stars</span>
                </span>
                <span style={{ color: 'var(--feynd-text-3)' }}>
                  {toNext > 0 ? (
                    <>
                      <span style={{ color: 'var(--feynd-coral)', fontWeight: 600 }}>
                        {toNext} more
                      </span>{' '}
                      to Level {level + 1}
                    </>
                  ) : 'Max'}
                </span>
              </div>
              <div style={{
                height: 8, borderRadius: 999,
                background: 'var(--feynd-surface-2)',
                overflow: 'hidden', position: 'relative',
              }}>
                <div style={{
                  height: '100%', width: `${fill * 100}%`,
                  background: 'linear-gradient(90deg, var(--feynd-coral) 0%, #f0a78c 100%)',
                  borderRadius: 999,
                  boxShadow: '0 0 12px var(--feynd-coral-soft)',
                }} />
              </div>
            </div>

            {/* stats */}
            <div style={{
              marginTop: 18,
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
            }}>
              <StatChip value={`${totalStars}`} label="stars" icon={
                <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--feynd-gold)" aria-hidden>
                  <path d="M12 2.5l2.94 6.45 7.06.66-5.34 4.78L18.2 21.5 12 17.77 5.8 21.5l1.54-7.11L2 9.61l7.06-.66L12 2.5z" />
                </svg>
              }/>
              <StatChip value={`${p?.mastered_topic_count ?? 0}`} label="mastered" icon={
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                  <circle cx="6" cy="6" r="4.6" stroke="var(--feynd-coral)" strokeWidth="1.4" fill="none" />
                  <circle cx="6" cy="6" r="2" fill="var(--feynd-coral)" />
                </svg>
              }/>
              <StatChip value={`${p?.starred_topic_count ?? 0}`} label="topics" icon={
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                  <rect x="1.5" y="2.5" width="9" height="1.6" rx="0.6" fill="var(--feynd-text-2)" />
                  <rect x="1.5" y="5.2" width="9" height="1.6" rx="0.6" fill="var(--feynd-text-2)" />
                  <rect x="1.5" y="7.9" width="6" height="1.6" rx="0.6" fill="var(--feynd-text-2)" />
                </svg>
              }/>
            </div>
          </div>

          {/* SECTIONS */}
          <div style={{ padding: '0 16px 44px' }}>
            <Section label="Appearance">
              <ThemeSegmented mode={mode} onChange={setMode} />
            </Section>

            <Section label="iMessage">
              <Card>
                {imessageHandles.length === 0 && imessageMode === 'idle' && (
                  <Row
                    label="Add iMessage"
                    labelColor="var(--feynd-coral)"
                    onClick={() => setImessageMode('enterHandle')}
                  />
                )}
                {imessageHandles.map((h, i) => (
                  <div key={h}>
                    <Row label={h} onClick={() => imessageRemove(h)} />
                    {(i < imessageHandles.length - 1 || imessageMode === 'idle') && <Divider />}
                  </div>
                ))}
                {imessageHandles.length > 0 && imessageMode === 'idle' && (
                  <Row
                    label="Add another"
                    labelColor="var(--feynd-coral)"
                    onClick={() => setImessageMode('enterHandle')}
                  />
                )}
                {imessageMode === 'enterHandle' && (
                  <ImessagePairingInline
                    title="Your iPhone number or iCloud email"
                    hint="We'll send a 6-digit code via iMessage. Enter it on the next step."
                    placeholder="+15551234567 or you@icloud.com"
                    value={imessageHandle}
                    onChange={setImessageHandle}
                    primaryLabel={imessageBusy ? 'Sending…' : 'Send code'}
                    primaryDisabled={imessageBusy || !imessageHandle.trim()}
                    onPrimary={imessageStart}
                    onCancel={() => {
                      setImessageMode('idle')
                      setImessageHandle('')
                      setImessageError(null)
                    }}
                    error={imessageError}
                  />
                )}
                {imessageMode === 'enterCode' && (
                  <ImessagePairingInline
                    title="Enter the 6-digit code"
                    hint={`Sent to ${imessageHandle}. Code expires in 10 minutes.`}
                    placeholder="123456"
                    value={imessageCode}
                    onChange={setImessageCode}
                    primaryLabel={imessageBusy ? 'Verifying…' : 'Confirm'}
                    primaryDisabled={imessageBusy || imessageCode.length !== 6}
                    onPrimary={imessageConfirm}
                    onCancel={() => {
                      setImessageMode('idle')
                      setImessageHandle('')
                      setImessageCode('')
                      setImessageError(null)
                    }}
                    error={imessageError}
                  />
                )}
              </Card>
            </Section>

            <Section label="Account">
              <Card>
                <Row label="Signed in as" detail={username} />
                <Divider />
                <Row
                  label="Sign out"
                  labelColor="#FF6B5B"
                  onClick={onLogout}
                />
                {avatarUrl ? (
                  <>
                    <Divider />
                    <Row
                      label="Remove profile photo"
                      labelColor="var(--feynd-text-2)"
                      onClick={removeAvatar}
                    />
                  </>
                ) : null}
              </Card>
            </Section>

            <Section label="About">
              <Card>
                <Row label="App" detail="Feynd" />
                <Divider />
                <Row label="Version" detail="1.0 (web)" />
              </Card>
            </Section>

            {uploadError ? (
              <div style={{
                marginTop: 12, padding: '10px 12px',
                background: 'rgba(255, 107, 91, 0.12)',
                border: '1px solid rgba(255, 107, 91, 0.4)',
                color: '#FF6B5B',
                borderRadius: 10, fontSize: 13,
              }}>{uploadError}</div>
            ) : null}
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFile}
          style={{ display: 'none' }}
        />

        <style jsx>{`
          @keyframes feyndSheetFade {
            from { opacity: 0; } to { opacity: 1; }
          }
          @keyframes feyndSheetSlide {
            from { transform: translateY(40px); opacity: 0; }
            to   { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Avatar({
  username, avatarUrl, uploading, onPick,
}: {
  username: string
  avatarUrl: string | null
  uploading: boolean
  onPick: () => void
}) {
  const size = 78
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt="Avatar"
          width={size} height={size}
          style={{
            width: size, height: size, borderRadius: '50%',
            border: '2px solid var(--feynd-bg-raised)',
            objectFit: 'cover',
            boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
          }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 25%, #F5A08A 0%, #ED8264 55%, #B85A3F 100%)',
          border: '2px solid var(--feynd-bg-raised)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, fontWeight: 600, color: '#fff',
          letterSpacing: -0.4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}>{(username[0] || '?').toUpperCase()}</div>
      )}

      <button
        type="button"
        onClick={onPick}
        aria-label="Change profile photo"
        style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--feynd-surface-2)',
          border: '2px solid var(--feynd-bg-raised)',
          color: 'var(--feynd-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        }}
      >
        {uploading ? (
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            border: '2px solid var(--feynd-text-2)',
            borderTopColor: 'transparent',
            animation: 'feyndSpin 0.9s linear infinite',
          }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 8h3l2-2h6l2 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
            <circle cx="12" cy="13" r="3.4" stroke="currentColor" strokeWidth="1.7"/>
          </svg>
        )}
      </button>

      <style jsx>{`
        @keyframes feyndSpin {
          from { transform: rotate(0); } to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function StatChip({
  value, label, icon,
}: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--feynd-surface)',
      border: '1px solid var(--feynd-border)',
      borderRadius: 12,
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon}
        <span style={{
          fontSize: 18, fontWeight: 700,
          color: 'var(--feynd-text)', letterSpacing: -0.4, lineHeight: 1,
        }}>{value}</span>
      </div>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: 0.2,
        color: 'var(--feynd-text-3)', textTransform: 'uppercase',
      }}>{label}</div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        padding: '0 4px 8px',
        fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
        color: 'var(--feynd-text-3)', textTransform: 'uppercase',
      }}>{label}</div>
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--feynd-surface)',
      border: '1px solid var(--feynd-border)',
      borderRadius: 14, overflow: 'hidden',
    }}>{children}</div>
  )
}

function Divider() {
  return (
    <div style={{
      height: 1, background: 'var(--feynd-border-soft)',
    }} />
  )
}

function Row({
  label, detail, labelColor, onClick,
}: {
  label: string
  detail?: string
  labelColor?: string
  onClick?: () => void
}) {
  const interactive = onClick !== undefined && detail === undefined
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={onClick === undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%',
        padding: '13px 14px',
        background: 'transparent', border: 'none',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        fontSize: 15, letterSpacing: -0.2,
      }}
    >
      <span style={{
        flex: 1,
        color: labelColor ?? 'var(--feynd-text)',
      }}>{label}</span>
      {detail ? (
        <span style={{ color: 'var(--feynd-text-2)' }}>{detail}</span>
      ) : null}
      {interactive ? (
        <svg width="7" height="12" viewBox="0 0 8 14" fill="none" aria-hidden>
          <path d="M1 1l6 6-6 6" stroke="var(--feynd-text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : null}
    </button>
  )
}

function ImessagePairingInline({
  title, hint, placeholder, value, onChange,
  primaryLabel, primaryDisabled, onPrimary, onCancel, error,
}: {
  title: string
  hint: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  primaryLabel: string
  primaryDisabled: boolean
  onPrimary: () => void
  onCancel: () => void
  error: string | null
}) {
  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--feynd-text)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--feynd-text-2)' }}>{hint}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: '12px 14px',
          background: 'var(--feynd-bg-raised)',
          border: '1px solid var(--feynd-border)',
          borderRadius: 10,
          color: 'var(--feynd-text)',
          fontSize: 15,
          outline: 'none',
        }}
      />
      {error ? (
        <div style={{ color: '#FF6B5B', fontSize: 13 }}>{error}</div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 0, padding: '10px 14px',
            background: 'transparent',
            color: 'var(--feynd-text-2)',
            border: '1px solid var(--feynd-border)',
            borderRadius: 10, fontSize: 14, fontWeight: 500,
            cursor: 'pointer',
          }}
        >Cancel</button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled}
          style={{
            flex: 1, padding: '10px 14px',
            background: primaryDisabled ? 'var(--feynd-surface-2)' : 'var(--feynd-coral)',
            color: primaryDisabled ? 'var(--feynd-text-3)' : '#1A0E08',
            border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 600,
            cursor: primaryDisabled ? 'default' : 'pointer',
          }}
        >{primaryLabel}</button>
      </div>
    </div>
  )
}

function ThemeSegmented({
  mode, onChange,
}: {
  mode: FeyndThemeMode
  onChange: (m: FeyndThemeMode) => void
}) {
  const opts: FeyndThemeMode[] = ['system', 'light', 'dark']
  return (
    <div style={{
      display: 'flex', padding: 4,
      background: 'var(--feynd-surface)',
      border: '1px solid var(--feynd-border)',
      borderRadius: 12,
    }}>
      {opts.map(o => {
        const active = o === mode
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            style={{
              flex: 1,
              padding: '9px 10px',
              border: 'none',
              background: active ? 'var(--feynd-surface-3)' : 'transparent',
              color: active ? 'var(--feynd-text)' : 'var(--feynd-text-2)',
              fontSize: 14,
              fontWeight: active ? 600 : 500,
              letterSpacing: -0.1,
              borderRadius: 8,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >{o}</button>
        )
      })}
    </div>
  )
}
