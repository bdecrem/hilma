'use client'

/// Shared themed atoms for login + signup: input field and primary CTA.
/// Matches the iOS FeyndAuthField / FeyndAuthShell styling.

export function AuthField({
  type = 'text',
  autoComplete,
  placeholder,
  value,
  onChange,
}: {
  type?: 'text' | 'email' | 'password'
  autoComplete?: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type={type}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '14px 16px',
        background: 'var(--feynd-bg-raised)',
        border: '1px solid var(--feynd-border)',
        borderRadius: 12,
        color: 'var(--feynd-text)',
        fontSize: 16,
        outline: 'none',
      }}
    />
  )
}

export function AuthCTA({
  label,
  disabled,
  busy,
  onClick,
}: {
  label: string
  disabled: boolean
  busy: boolean
  onClick?: () => void
  /* `onClick` is optional — when omitted the button is just type=submit. */
}) {
  const interactive = !disabled && !busy
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        marginTop: 8,
        padding: '14px 16px',
        background: interactive ? 'var(--feynd-coral)' : 'var(--feynd-surface-2)',
        color: interactive ? '#1A0E08' : 'var(--feynd-text-3)',
        border: 'none',
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 600,
        cursor: interactive ? 'pointer' : 'default',
      }}
    >
      {busy ? '…' : label}
    </button>
  )
}

export function AuthError({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p style={{ fontSize: 13, color: '#FF6B5B', marginTop: 4 }}>{text}</p>
  )
}
