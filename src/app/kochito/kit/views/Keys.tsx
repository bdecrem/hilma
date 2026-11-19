'use client'
import { useEffect } from 'react'

// The tracker's keys: "/" puts the cursor in the search box, "c" opens New issue. Ignored while
// typing in a field, and with Cmd, Ctrl or Alt held.
export default function Keys({ newHref }: { newHref: string }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === '/') {
        const s = document.getElementById('bd-search') as HTMLInputElement | null
        if (s) (e.preventDefault(), s.focus(), s.select())
      } else if (e.key === 'c') {
        e.preventDefault()
        window.location.href = newHref
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [newHref])
  return null
}
