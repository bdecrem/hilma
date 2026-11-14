'use client'

import { useEffect } from 'react'

// Who is looking, without cookies: a random id kept in this browser, and where
// the visit came from (the utm_* parameters an ad or an email link carries).
// The first visit's origin is remembered, so a sign-up two pages later still
// counts for the ad that brought the visitor.
export type Origin = { sid: string; src: string; campaign?: string; term?: string }

export function origin(): Origin {
  const q = new URLSearchParams(window.location.search)
  let saved: Origin | null = null
  try {
    saved = JSON.parse(localStorage.getItem('kl') || 'null')
  } catch {}
  const fresh: Origin = {
    sid: saved?.sid || Math.random().toString(36).slice(2) + Date.now().toString(36),
    src: q.get('utm_source') || saved?.src || 'direct',
    campaign: q.get('utm_campaign') || saved?.campaign || undefined,
    term: q.get('utm_term') || saved?.term || undefined,
  }
  try {
    localStorage.setItem('kl', JSON.stringify(fresh))
  } catch {}
  return fresh
}

export function send(page: string, kind: 'view' | 'cta') {
  let ref = ''
  try {
    ref = document.referrer ? new URL(document.referrer).host : ''
  } catch {}
  fetch('/api/kochito/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page, kind, ref, ...origin() }),
    keepalive: true,
  }).catch(() => {})
}

export default function Track({ page }: { page: string }) {
  useEffect(() => send(page, 'view'), [page])
  return null
}
