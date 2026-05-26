'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/// Web counterparts to the iOS FeyndChrome atoms. Shared between Shell,
/// Topics, Chat, and Topic detail. Visual language matches iOS: warm-tinted
/// surfaces, coral accents, gold stars.

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------

export function StarRow({
  value,
  max = 3,
  size = 11,
}: {
  value: number
  max?: number
  size?: number
}) {
  return (
    <span className="inline-flex items-center gap-[2px]" aria-label={`${value} of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < value
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            style={{ color: filled ? 'var(--feynd-gold)' : 'var(--feynd-text-4)' }}
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={filled ? 0 : 1.8}
            aria-hidden
          >
            <path
              d="M12 2.5l2.94 6.45 7.06.66-5.34 4.78L18.2 21.5 12 17.77 5.8 21.5l1.54-7.11L2 9.61l7.06-.66L12 2.5z"
              strokeLinejoin="round"
            />
          </svg>
        )
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Profile badge (single ring + L chip docked below)
// ---------------------------------------------------------------------------

type Progress = {
  level: number
  starred_topic_count: number
  total_stars: number
  mastered_topic_count: number
  current_level_at: number
  next_level_at: number
  to_next_level: number
}

/// Avatar (uploaded photo or warm coral gradient) + thin ring (background
/// track + coral arc) + L chip docked below. The single-ring + arc combo is
/// the iOS fix for the "two visible circles" bug.
export function ProfileBadge({
  username,
  avatarUrl,
  progress,
  onClick,
}: {
  username: string
  avatarUrl?: string | null
  progress: Progress | null
  onClick?: () => void
}) {
  const level = progress?.level ?? 0
  const fraction = progress
    ? Math.max(
        0,
        Math.min(
          1,
          (progress.starred_topic_count - progress.current_level_at) /
            Math.max(1, progress.next_level_at - progress.current_level_at),
        ),
      )
    : 0

  // 42pt ring around a 38pt avatar; arc drawn on the same circle.
  const ring = 42
  const r = ring / 2 - 1
  const circ = 2 * Math.PI * r
  const dash = `${circ * fraction} ${circ}`

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex items-center justify-center cursor-pointer"
      style={{ width: ring, height: ring + 14 }}
      aria-label={`Level ${level}, ${progress?.starred_topic_count ?? 0} starred topics`}
    >
      <svg
        width={ring}
        height={ring}
        viewBox={`0 0 ${ring} ${ring}`}
        style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
      >
        <circle cx={ring / 2} cy={ring / 2} r={r} fill="none" stroke="var(--feynd-surface-2)" strokeWidth="1.5" />
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={r}
          fill="none"
          stroke="var(--feynd-coral)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      </svg>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          width={38}
          height={38}
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 38,
            height: 38,
            borderRadius: '50%',
            objectFit: 'cover',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.3)',
          }}
        />
      ) : (
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 25%, #F5A08A 0%, #ED8264 55%, #B85A3F 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: -0.2,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.3)',
            position: 'absolute',
            top: 2,
            left: 2,
          }}
        >
          {username[0]?.toUpperCase() ?? '?'}
        </span>
      )}
      <span
        className="text-[9.5px] font-bold tracking-[0.04em]"
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '1px 5px 1.5px',
          background: 'var(--feynd-surface-2)',
          border: '1px solid var(--feynd-border)',
          borderRadius: 6,
          color: 'var(--feynd-text)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        L{level}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Mini topic glyph (diagonal Feynman-style two-node mark on a tiny tile)
// ---------------------------------------------------------------------------

export function MiniTopicGlyph({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: 'var(--feynd-surface)',
        border: '1px solid var(--feynd-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 20 20" aria-hidden>
        <line x1="4" y1="14" x2="16" y2="6" stroke="var(--feynd-coral)" strokeWidth="1.2" />
        <circle cx="4" cy="14" r="2.2" fill="var(--feynd-coral)" />
        <circle cx="16" cy="6" r="2.2" fill="var(--feynd-coral)" />
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// F2 mini mark (used in chat bubbles + Chat-tab header on iOS)
// ---------------------------------------------------------------------------

export function F2MiniMark({ size = 22 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: 'var(--feynd-bg)',
        border: '1px solid var(--feynd-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 20 20" aria-hidden>
        <line x1="4" y1="10" x2="16" y2="10" stroke="var(--feynd-coral)" strokeWidth="1.2" />
        <circle cx="4" cy="10" r="2.2" fill="var(--feynd-coral)" />
        <circle cx="16" cy="10" r="2.2" fill="var(--feynd-coral)" />
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icon circle button — used for plus/back/ellipsis
// ---------------------------------------------------------------------------

export function IconCircleButton({
  children,
  ariaLabel,
  onClick,
  size = 36,
  href,
}: {
  children: React.ReactNode
  ariaLabel: string
  onClick?: () => void
  size?: number
  href?: string
}) {
  const inner = (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--feynd-surface)',
        border: '1px solid var(--feynd-border)',
        color: 'var(--feynd-text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </span>
  )
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} style={{ background: 'none', border: 'none', padding: 0 }}>
      {inner}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Tab pill (floating bottom Chat/Topics) — mobile only.
// Desktop gets inline tabs inside the header (handled in Shell).
// ---------------------------------------------------------------------------

export function TabPill({ active }: { active: 'chat' | 'topics' }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        padding: 4,
        background: 'var(--feynd-tabpill-bg)',
        backdropFilter: 'blur(18px) saturate(180%)',
        WebkitBackdropFilter: 'blur(18px) saturate(180%)',
        border: '1px solid var(--feynd-border)',
        borderRadius: 999,
        width: 240,
        boxShadow: 'var(--feynd-shadow-soft)',
        zIndex: 40,
      }}
      role="tablist"
    >
      <PillTab active={active === 'chat'} href="/f2" label="Chat" icon={<ChatIcon />} />
      <PillTab active={active === 'topics'} href="/f2/topics" label="Topics" icon={<TopicsIcon />} />
    </div>
  )
}

function PillTab({
  active,
  href,
  label,
  icon,
}: {
  active: boolean
  href: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      style={{
        flex: 1,
        height: 46,
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        background: active ? 'var(--feynd-surface-2)' : 'transparent',
        color: active ? 'var(--feynd-text)' : 'var(--feynd-text-2)',
        fontSize: 14,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      <span style={{ color: active ? 'var(--feynd-coral)' : 'var(--feynd-text-3)' }}>
        {icon}
      </span>
      {label}
    </Link>
  )
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8A2.5 2.5 0 0 1 17.5 17H10l-4 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5v-8z" />
    </svg>
  )
}

function TopicsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="5" width="18" height="3" rx="1.2" />
      <rect x="3" y="10.5" width="18" height="3" rx="1.2" />
      <rect x="3" y="16" width="13" height="3" rx="1.2" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Action chip (Quiz me / Talk to F2 / Key points)
// ---------------------------------------------------------------------------

export function ActionChip({
  label,
  icon,
  onClick,
  iconTint = 'var(--feynd-coral)',
}: {
  label: string
  icon: React.ReactNode
  onClick?: () => void
  iconTint?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 11,
        paddingRight: 14,
        paddingTop: 8,
        paddingBottom: 8,
        background: 'var(--feynd-surface)',
        border: '1px solid var(--feynd-border)',
        color: 'var(--feynd-text)',
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <span style={{ color: iconTint, display: 'inline-flex' }}>{icon}</span>
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Level-up celebration (overlay)
// ---------------------------------------------------------------------------

const PROGRESS_STORAGE = 'f2-last-seen-level'

export function useLevelWatcher(): {
  progress: Progress | null
  celebration: Progress | null
  dismiss: () => void
} {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [celebration, setCelebration] = useState<Progress | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await fetch('/api/f2/progress', { cache: 'no-store' })
        if (!res.ok) return
        const next = (await res.json()) as Progress
        if (!mounted) return
        setProgress(next)
        const seenRaw = localStorage.getItem(PROGRESS_STORAGE)
        const seen = seenRaw === null ? next.level : Number(seenRaw)
        if (next.level > seen) setCelebration(next)
        if (Number.isFinite(next.level)) {
          localStorage.setItem(PROGRESS_STORAGE, String(next.level))
        }
      } catch {
        // ignore
      }
    }
    load()
    const t = window.setInterval(load, 20_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') load()
    }
    // Allow other components (e.g. ChatView after a quiz completes) to ask
    // for an immediate refresh so the celebration fires without polling lag.
    const onManual = () => load()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('feynd-progress-refresh', onManual)
    return () => {
      mounted = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('feynd-progress-refresh', onManual)
    }
  }, [])

  return { progress, celebration, dismiss: () => setCelebration(null) }
}

export function LevelUpOverlay({
  progress,
  onDismiss,
}: {
  progress: Progress
  onDismiss: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Level ${progress.level} unlocked`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background:
          'radial-gradient(closest-side, var(--feynd-coral-soft), var(--feynd-bg) 70%), var(--feynd-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'feyndCelebrationIn 0.35s ease-out',
      }}
    >
      <style>{`
        @keyframes feyndCelebrationIn {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes feyndStarPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 420, padding: '0 32px', textAlign: 'center' }}>
        <StarBurst />
        <p
          style={{
            marginTop: 24,
            color: 'var(--feynd-coral)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 2.4,
          }}
        >
          LEVEL UP
        </p>
        <h2
          style={{
            marginTop: 4,
            fontSize: 52,
            fontWeight: 700,
            letterSpacing: -0.8,
            color: 'var(--feynd-text)',
          }}
        >
          Level {progress.level}
        </h2>
        <p style={{ marginTop: 8, color: 'var(--feynd-text-2)', fontSize: 16 }}>
          {progress.total_stars} total{' '}
          {progress.total_stars === 1 ? 'star' : 'stars'} earned
        </p>
        {progress.to_next_level > 0 && (
          <p style={{ marginTop: 8, color: 'var(--feynd-text-3)', fontSize: 13 }}>
            {progress.to_next_level} more{' '}
            {progress.to_next_level === 1 ? 'star' : 'stars'} to reach L{progress.level + 1}
          </p>
        )}
        <button
          type="button"
          onClick={onDismiss}
          style={{
            marginTop: 32,
            padding: '14px 28px',
            borderRadius: 999,
            background: 'var(--feynd-surface)',
            border: '1px solid var(--feynd-border)',
            color: 'var(--feynd-text)',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Keep going
        </button>
      </div>
    </div>
  )
}

function StarBurst() {
  return (
    <div style={{ position: 'relative', width: 240, height: 240 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i * 72 - 90) * (Math.PI / 180)
        const r = 92
        const x = Math.cos(angle) * r
        const y = Math.sin(angle) * r
        return (
          <svg
            key={i}
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="var(--feynd-gold)"
            aria-hidden
            style={{
              position: 'absolute',
              left: `calc(50% - 14px + ${x}px)`,
              top: `calc(50% - 14px + ${y}px)`,
              filter: 'drop-shadow(0 0 8px var(--feynd-coral-soft))',
            }}
          >
            <path d="M12 2.5l2.94 6.45 7.06.66-5.34 4.78L18.2 21.5 12 17.77 5.8 21.5l1.54-7.11L2 9.61l7.06-.66L12 2.5z" />
          </svg>
        )
      })}
      <svg
        width="120"
        height="120"
        viewBox="0 0 24 24"
        fill="var(--feynd-coral)"
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          filter: 'drop-shadow(0 6px 28px rgba(237,130,100,0.5))',
          animation: 'feyndStarPulse 1.6s ease-in-out infinite',
        }}
      >
        <path d="M12 2.5l2.94 6.45 7.06.66-5.34 4.78L18.2 21.5 12 17.77 5.8 21.5l1.54-7.11L2 9.61l7.06-.66L12 2.5z" />
      </svg>
    </div>
  )
}
