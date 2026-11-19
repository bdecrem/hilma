import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { APP_HOST, sessionUser } from '@/lib/kochito/app-auth'
import { keyOk } from '@/lib/venture/interview'

// Every page of the board: only on app.kochitolabs.com (or a local dev server), only signed in.
// `base` is where the board's own pages live: "" on app.kochitolabs.com (next.config.ts rewrites
// /issues and /notes there), "/kochito/kit" elsewhere. `q` is the venture key for the voice pages
// on ola.cx, handed only to a signed-in reader.
export async function gate(): Promise<{ user: string | null; base: string; q: string }> {
  const host = ((await headers()).get('host') ?? '').replace(/:\d+$/, '')
  if (host !== APP_HOST && host !== 'localhost' && host !== '127.0.0.1') redirect(`https://${APP_HOST}/`)
  const user = await sessionUser()
  const base = host === APP_HOST ? '' : '/kochito/kit'
  if (!user) return { user, base, q: '' }
  const k = process.env.VENTURE_KEY
  // a dev server on a Mac whose .env.local has no Venture key: the board works, the voice links
  // simply carry no key. In production a missing or old key is still an error.
  if (!k && process.env.NODE_ENV !== 'production') return { user, base, q: '' }
  if (!keyOk(k)) throw new Error('VENTURE_KEY is not set, or is not the current key')
  return { user, base, q: `?k=${encodeURIComponent(k as string)}` }
}

export const FACE = '/kochito/kit/brain-1.svg' // Kit's face: number 9, chosen by Bart 2026-11-14
export const voices = (q: string) => [
  { href: `https://ola.cx/venture/memo${q}`, tag: 'voice notes', name: 'Leave a note', what: 'Say what you want done; I act within a minute or two.' },
  { href: `https://ola.cx/venture/talk${q}`, tag: 'conversation', name: 'Talk it through', what: 'No agenda; I answer out loud from my notes.' },
  { href: `https://ola.cx/venture/call/checkin${q}`, tag: 'interview', name: 'Answer my questions', what: 'The things only you can settle, about five minutes.' },
]
