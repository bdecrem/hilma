// Buddy streaks. A pair counts a day when both wrote; a miss by either resets
// the pair to zero; every BONUS_EVERY days it holds, both get BONUS_POINTS.
// Personal streaks and points are never touched by any of this. As many
// buddies as you like — each pair is one onething_buddies row.
//
// The pair streak is never stored as truth: it is recomputed from the two
// people's entry days (pairStreak, pure) every time it matters, and the row
// keeps a copy only so "reset to zero" can be noticed and `best` remembered.

import { f2Supabase } from '@/lib/f2/supabase'
import { sendText } from './send'
import {
  addDays, buddyCopy, displayName, findUserById, findUserByPhone, joinNames, listEntries, localDay, tzFor,
  SITE_URL, type User,
} from './core'
import { avatarUrlFor } from './avatar'

export const BONUS_EVERY = 7
export const BONUS_POINTS = 25
export const INVITE_TTL_DAYS = 7
/// A name reply counts only this long after the question was asked.
export const NAME_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

export type Buddy = {
  id: string
  inviter_id: string
  invitee_handle: string
  invitee_id: string | null
  status: 'pending' | 'active' | 'ended'
  created_at: string
  accepted_at: string | null
  start_day: string | null
  ended_at: string | null
  ended_by: string | null
  streak: number
  best: number
  last_bonus_day: string | null
}

// ---------- pure ----------

/// The pair's streak as of `today`, from the days each person has an entry.
/// Alive if both kept today, or both kept yesterday (today is still open),
/// counting back over consecutive days on or after `startDay`.
export function pairStreak(a: Set<string>, b: Set<string>, startDay: string, today: string): { streak: number; bothToday: boolean } {
  const both = (d: string) => a.has(d) && b.has(d) && d >= startDay
  const bothToday = both(today)
  let day = bothToday ? today : addDays(today, -1)
  if (!both(day)) return { streak: 0, bothToday }
  let n = 0
  while (both(day)) {
    n++
    day = addDays(day, -1)
  }
  return { streak: n, bothToday }
}

/// Days until the next bonus at this streak (7 at 0, 1 at 6, 7 again at 7).
export function nextBonusIn(streak: number): number {
  return BONUS_EVERY - (streak % BONUS_EVERY)
}

/// Whether a reply to "what should your buddies call you?" is a name and not
/// a sentence: short, one to three words, letters only, no full stop.
export function looksLikeName(text: string): boolean {
  const t = text.trim()
  if (t.length === 0 || t.length > 24) return false
  if (/[.!?,;:]$/.test(t)) return false
  const words = t.split(/\s+/)
  if (words.length > 3) return false
  return /^[\p{L}][\p{L}\p{M}'’.\- ]*$/u.test(t)
}

export function cleanName(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '')
}

/// The lines under "Kept." for the people you share a streak with.
export function keptTail(inNames: string[], outNames: string[]): string[] {
  if (inNames.length === 0 && outNames.length === 0) return []
  if (outNames.length === 0) {
    return [inNames.length === 1 ? buddyCopy('inOne', { name: inNames[0] }) : buddyCopy('inMany', { names: joinNames(inNames) })]
  }
  if (inNames.length === 0) {
    return [outNames.length === 1 ? buddyCopy('outOne', { name: outNames[0] }) : buddyCopy('outMany', { names: joinNames(outNames) })]
  }
  return [buddyCopy('mixed', { in: joinNames(inNames), out: joinNames(outNames) })]
}

export function isYes(text: string): boolean {
  return /^\s*(yes|yes please|yep|yeah|sure|ok|okay)\b/i.test(text)
}

// ---------- rows ----------

function notExpired(b: Buddy, now: Date): boolean {
  return new Date(b.created_at).getTime() > now.getTime() - INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
}

/// Every pending or active row this person is on, either side.
export async function buddiesFor(userId: string): Promise<Buddy[]> {
  const { data, error } = await f2Supabase()
    .from('onething_buddies')
    .select('*')
    .or(`inviter_id.eq.${userId},invitee_id.eq.${userId}`)
    .in('status', ['pending', 'active'])
    .order('created_at')
  if (error) throw new Error(`onething: buddies load failed: ${error.message}`)
  return (data ?? []) as Buddy[]
}

/// Invites waiting on this handle, newest first, expired ones left out.
export async function pendingInvitesFor(handle: string, now = new Date()): Promise<Buddy[]> {
  const { data, error } = await f2Supabase()
    .from('onething_buddies')
    .select('*')
    .eq('invitee_handle', handle)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`onething: invites load failed: ${error.message}`)
  return ((data ?? []) as Buddy[]).filter((b) => notExpired(b, now))
}

export async function findBuddy(id: string): Promise<Buddy | null> {
  const { data } = await f2Supabase().from('onething_buddies').select('*').eq('id', id).maybeSingle()
  return (data as Buddy) ?? null
}

/// The person on the other side of a row from `meId` (null while pending to a stranger).
export async function otherUser(b: Buddy, meId: string): Promise<User | null> {
  const otherId = b.inviter_id === meId ? b.invitee_id : b.inviter_id
  if (otherId) return findUserById(otherId)
  return b.inviter_id === meId ? findUserByPhone(b.invitee_handle) : null
}

export async function activePairsFor(user: User, day: string): Promise<Array<{ row: Buddy; other: User }>> {
  const out: Array<{ row: Buddy; other: User }> = []
  for (const row of await buddiesFor(user.id)) {
    if (row.status !== 'active' || !row.start_day || row.start_day > day) continue
    const other = await otherUser(row, user.id)
    if (other) out.push({ row, other })
  }
  return out
}

/// Send an invite. `handle` is a phone or iCloud email as typed in settings.
export async function invite(inviter: User, handle: string, now = new Date()): Promise<Buddy> {
  if (handle === inviter.phone) throw new Error('That is your own number.')
  const mine = await buddiesFor(inviter.id)
  for (const b of mine) {
    const other = await otherUser(b, inviter.id)
    const otherHandle = other?.phone ?? b.invitee_handle
    if (otherHandle === handle) {
      if (b.status === 'active') throw new Error('You are already buddies.')
      if (b.status === 'pending' && notExpired(b, now)) throw new Error('An invite is already out to them.')
    }
  }
  const { data, error } = await f2Supabase()
    .from('onething_buddies')
    .insert({ inviter_id: inviter.id, invitee_handle: handle, status: 'pending' })
    .select('*')
    .single()
  if (error) throw new Error(`onething: invite failed: ${error.message}`)
  await sendText({ addresses: [handle], text: `${buddyCopy('invite', { name: displayName(inviter) })}\n${SITE_URL}` })
  return data as Buddy
}

/// Accept: the pair goes active and starts with tomorrow's sentence (the
/// acceptor's tomorrow). Texts the inviter one line. Returns the inviter.
export async function accept(b: Buddy, invitee: User, now = new Date()): Promise<User | null> {
  const start_day = addDays(localDay(now, tzFor(invitee)), 1)
  const { error } = await f2Supabase()
    .from('onething_buddies')
    .update({ invitee_id: invitee.id, status: 'active', accepted_at: now.toISOString(), start_day })
    .eq('id', b.id)
    .eq('status', 'pending')
  if (error) throw new Error(`onething: accept failed: ${error.message}`)
  const inviter = await findUserById(b.inviter_id)
  if (inviter) {
    await sendText({ addresses: [inviter.phone], text: `${buddyCopy('acceptedInviter', { name: displayName(invitee) })}\n${SITE_URL}` })
  }
  return inviter
}

/// End (or cancel, while pending). Silent to the other person — they see it
/// on the site the next time they look. Nothing already earned is touched.
export async function end(b: Buddy, byUserId: string, now = new Date()): Promise<void> {
  const { error } = await f2Supabase()
    .from('onething_buddies')
    .update({ status: 'ended', ended_at: now.toISOString(), ended_by: byUserId })
    .eq('id', b.id)
  if (error) throw new Error(`onething: end failed: ${error.message}`)
}

async function entryDays(userId: string): Promise<Set<string>> {
  return new Set((await listEntries(userId, 400)).map((e) => e.day))
}

async function addPoints(userId: string, points: number): Promise<void> {
  const latest = (await listEntries(userId, 1))[0]
  if (!latest) return
  const { error } = await f2Supabase().from('onething_entries').update({ points: latest.points + points }).eq('id', latest.id)
  if (error) throw new Error(`onething: bonus failed: ${error.message}`)
}

async function storeStreak(row: Buddy, streak: number, extra: Partial<Buddy> = {}): Promise<void> {
  const best = Math.max(row.best, streak)
  if (streak === row.streak && best === row.best && Object.keys(extra).length === 0) return
  await f2Supabase().from('onething_buddies').update({ streak, best, ...extra }).eq('id', row.id)
}

/// After `user` kept a NEW day: recompute every pair, pay any 7-day bonus
/// once, and return the lines that go under "Kept." (who is in, who is not,
/// any bonus). Appends and edits never come here — they add no day.
export async function afterKept(user: User, day: string): Promise<string[]> {
  const pairs = await activePairsFor(user, day)
  if (pairs.length === 0) return []
  const mine = await entryDays(user.id)
  const inNames: string[] = []
  const outNames: string[] = []
  const bonus: string[] = []
  for (const { row, other } of pairs) {
    const theirs = await entryDays(other.id)
    const r = pairStreak(mine, theirs, row.start_day!, day)
    const name = displayName(other)
    if (r.bothToday) inNames.push(name)
    else outNames.push(name)
    const paying = r.bothToday && r.streak > 0 && r.streak % BONUS_EVERY === 0 && row.last_bonus_day !== day
    await storeStreak(row, r.streak, paying ? { last_bonus_day: day } : {})
    if (paying) {
      await addPoints(user.id, BONUS_POINTS)
      await addPoints(other.id, BONUS_POINTS)
      bonus.push(buddyCopy('bonus', { n: r.streak, name, points: BONUS_POINTS }))
    }
  }
  return [...bonus, ...keptTail(inNames, outNames)]
}

/// Names of active buddies who already have today's sentence in (for the reminder).
export async function buddiesInToday(user: User, today: string): Promise<string[]> {
  const names: string[] = []
  for (const { other } of await activePairsFor(user, today)) {
    const theirs = await entryDays(other.id)
    if (theirs.has(today)) names.push(displayName(other))
  }
  return names
}

/// At the morning question: any pair whose stored streak was alive and is
/// now zero gets one line, once; the stored copy follows the truth.
export async function resetLines(user: User, today: string): Promise<string[]> {
  const pairs = await activePairsFor(user, today)
  if (pairs.length === 0) return []
  const mine = await entryDays(user.id)
  const lines: string[] = []
  for (const { row, other } of pairs) {
    const theirs = await entryDays(other.id)
    const r = pairStreak(mine, theirs, row.start_day!, today)
    if (row.streak > 0 && r.streak === 0) lines.push(buddyCopy('reset', { name: displayName(other) }))
    await storeStreak(row, r.streak)
  }
  return lines
}

export type BuddyView = {
  id: string
  name: string
  /// their profile picture, if they set one
  avatar: string | null
  streak: number
  best: number
  inToday: boolean
  nextBonusIn: number
  startsTomorrow: boolean
}
export type InviteView = { id: string; name: string; since: string }

/// What the site shows: active pairs, invites I sent, invites waiting on me.
export async function buddyViews(user: User, today: string): Promise<{ buddies: BuddyView[]; sent: InviteView[]; received: InviteView[] }> {
  const buddies: BuddyView[] = []
  const sent: InviteView[] = []
  const now = new Date()
  const mine = await entryDays(user.id)
  for (const row of await buddiesFor(user.id)) {
    const other = await otherUser(row, user.id)
    if (row.status === 'pending') {
      if (row.inviter_id === user.id && notExpired(row, now)) {
        sent.push({ id: row.id, name: other ? displayName(other) : row.invitee_handle, since: row.created_at })
      }
      continue
    }
    if (!other || !row.start_day) continue
    const [theirs, avatar] = await Promise.all([entryDays(other.id), avatarUrlFor(other.id)])
    const r = pairStreak(mine, theirs, row.start_day, today)
    buddies.push({
      id: row.id, name: displayName(other), avatar, streak: r.streak, best: Math.max(row.best, r.streak),
      inToday: theirs.has(today), nextBonusIn: nextBonusIn(r.streak), startsTomorrow: row.start_day > today,
    })
  }
  const received: InviteView[] = []
  for (const row of await pendingInvitesFor(user.phone, now)) {
    const from = await findUserById(row.inviter_id)
    received.push({ id: row.id, name: from ? displayName(from) : 'Someone', since: row.created_at })
  }
  return { buddies, sent, received }
}
