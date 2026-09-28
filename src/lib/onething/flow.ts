// The flows: the hourly tick, the welcome, and the inbound iMessage handler.
// core.ts holds the data and the copy; buddies.ts the buddy streaks; this file
// is where a text turns into an entry, a name, or a yes.

import { f2Supabase } from '@/lib/f2/supabase'
import { isDemoPhone, sendText } from './send'
import {
  GRACE_HOUR, addDays, buddyCopy, confirmText, dueFor, ensureUser, findEntry, findUserByPhone, listEntries,
  localDay, localHour, looksLikeOurs, normalizeHandle, promptText, recordEntry, reminderText, scoreboard,
  setUserName, tzFor, welcomeText, SITE_URL, type User,
} from './core'
import { NAME_REPLY_WINDOW_MS, accept, afterKept, buddiesInToday, cleanName, isYes, looksLikeName, pendingInvitesFor, resetLines } from './buddies'

// ---------- the hourly tick (Vercel cron) ----------

export async function tick(now = new Date()): Promise<{ prompted: string[]; reminded: string[]; failed: string[] }> {
  const sb = f2Supabase()
  const prompted: string[] = []
  const reminded: string[] = []
  const { data, error } = await sb.from('onething_users').select('*').order('created_at')
  if (error) throw new Error(`onething: tick load failed: ${error.message}`)
  const failed: string[] = []
  for (const user of (data ?? []) as User[]) {
    // The demo account gets no daily texts: they land on Bart's own phone, every
    // day. Its sign-in code and welcome still go out, so the account still works.
    if (isDemoPhone(user.phone)) continue
    // One number that cannot be reached (a test account, a dead line) must not
    // stop the loop: everyone after it still gets their text this hour, and the
    // failed one is retried next hour because its day markers stay unset.
    try {
      const due = dueFor(user, now)
      const today = localDay(now, tzFor(user))
      if (due === 'prompt') {
        // A buddy streak that broke yesterday is mentioned once, here, under the question.
        const resets = await resetLines(user, today)
        await sendText({ addresses: [user.phone], text: promptText(resets) })
        await sb.from('onething_users').update({ prompt_day: today, prompted_at: now.toISOString() }).eq('id', user.id)
        prompted.push(user.phone)
        continue
      }
      if (due === 'reminder') {
        const entries = await listEntries(user.id, 1)
        const board = scoreboard(entries, today)
        if (!board.doneToday) {
          const buddiesIn = await buddiesInToday(user, today)
          await sendText({ addresses: [user.phone], text: reminderText(board.streak, buddiesIn) })
          reminded.push(user.phone)
        }
        await sb.from('onething_users').update({ reminder_day: today }).eq('id', user.id)
      }
    } catch (e) {
      console.error(`[onething] tick failed for ${user.phone}:`, e)
      failed.push(user.phone)
    }
  }
  return { prompted, reminded, failed }
}

/// A brand-new account (web sign-in or the "onething" keyword): say hello and ask
/// today's question right away, so the loop starts now instead of at the next tick.
/// `chatGuid` replies in the thread the person wrote from; otherwise a new chat.
export async function welcomeNewUser(user: User, chatGuid?: string): Promise<void> {
  await sendText(chatGuid ? { chatGuid, text: welcomeText() } : { addresses: [user.phone], text: welcomeText() })
  const now = new Date()
  await f2Supabase().from('onething_users').update({ prompt_day: localDay(now, tzFor(user)), prompted_at: now.toISOString() }).eq('id', user.id)
}

/// Send today's question to one person right now (first-run / manual).
export async function promptNow(phone: string): Promise<User> {
  const user = await ensureUser(phone)
  const now = new Date()
  const today = localDay(now, tzFor(user))
  await sendText({ addresses: [phone], text: promptText() })
  await f2Supabase().from('onething_users').update({ prompt_day: today, prompted_at: now.toISOString() }).eq('id', user.id)
  return { ...user, prompt_day: today, prompted_at: now.toISOString() }
}

// ---------- inbound (called from Dodo's BlueBubbles webhook) ----------

const FORCE_PREFIX = /^(1|one|onething)\s*[:\-]\s*/i
// A number we have never heard from joins by texting "onething" (optionally with a
// first sentence after a colon). Plain "1:" from a stranger is left to Dodo.
const JOIN_PREFIX = /^(onething|one thing)\b\s*[:\-]?\s*/i

function handleFromChatGuid(chatGuid: string): string | null {
  // "iMessage;-;+16508989508" → "+16508989508"; "iMessage;-;sam@icloud.com" → the email
  return normalizeHandle(chatGuid.split(';').pop() ?? '')
}

/// A name is taken only right after we asked for it, only if it reads as a
/// name, and — when today's question is still open — only if it is too short
/// to be a sentence. Otherwise the text is a sentence and the name stays unset
/// (it can be set on the site); the question is never asked twice.
export function nameReplyFor(user: Pick<User, 'name' | 'name_asked_at'>, text: string, promptOpen: boolean, now = new Date()): string | null {
  if (user.name || !user.name_asked_at) return null
  if (now.getTime() - new Date(user.name_asked_at).getTime() > NAME_REPLY_WINDOW_MS) return null
  if (!looksLikeName(text)) return null
  if (promptOpen && text.trim().split(/\s+/).length > 2) return null
  return cleanName(text)
}

/// Mark that the name was asked (once, ever) and return the question line.
export async function askName(user: User, now = new Date()): Promise<string[]> {
  if (user.name || user.name_asked_at) return []
  await f2Supabase().from('onething_users').update({ name_asked_at: now.toISOString() }).eq('id', user.id)
  user.name_asked_at = now.toISOString()
  return [buddyCopy('nameAsk')]
}

/// Returns true when Onething claimed the message: the sender is an
/// Onething user AND (a prompt is outstanding OR the text starts "1:"), a
/// new number texting "onething" to join, a YES to a buddy invite, or the
/// name we asked for. Otherwise false, and Dodo handles it as before.
export async function handleInbound(args: {
  handle: string
  chatGuid: string
  text: string
}): Promise<boolean> {
  const phone = normalizeHandle(args.handle) ?? handleFromChatGuid(args.chatGuid)
  if (!phone) return false
  // Our own text coming back (see OWN_TEXT). Claim it and do nothing: it must
  // not become a thought — the sign-up note and the daily question both start
  // "Onething:", which is also the force prefix — and it must not fall through
  // to Dodo either, which would grade it as an answer in the same chat.
  if (looksLikeOurs(args.text)) {
    console.log(`[onething] ignoring our own text echoed from ${phone}: ${args.text.slice(0, 60)}`)
    return true
  }
  const now = new Date()
  let user = await findUserByPhone(phone)

  // A yes to a buddy invite — from a member or from a number we have never seen.
  if (isYes(args.text)) {
    const [invite] = await pendingInvitesFor(phone, now)
    if (invite) {
      const created = !user
      if (!user) user = await ensureUser(phone, 'imessage')
      const inviter = await accept(invite, user, now)
      const lines = [buddyCopy('accepted', { name: inviter ? (inviter.name?.trim() || inviter.phone) : 'your buddy' })]
      lines.push(...(await askName(user, now)))
      await sendText({ chatGuid: args.chatGuid, text: [...lines, SITE_URL].join('\n') })
      if (created) await welcomeNewUser(user, args.chatGuid)
      return true
    }
  }

  if (!user) {
    if (!JOIN_PREFIX.test(args.text)) return false
    const fresh = await ensureUser(phone, 'imessage')
    const first = args.text.replace(JOIN_PREFIX, '').trim()
    if (first.length < 2) {
      await welcomeNewUser(fresh, args.chatGuid)
      return true
    }
    const day = localDay(now, tzFor(fresh))
    const r = await recordEntry(fresh, day, first)
    await f2Supabase().from('onething_users').update({ prompt_day: day, prompted_at: now.toISOString() }).eq('id', fresh.id)
    await sendText({ chatGuid: args.chatGuid, text: `Welcome to Onething. ${confirmText(r)}` })
    return true
  }

  const tz = tzFor(user)
  const today = localDay(now, tz)
  const hour = localHour(now, tz)
  const forced = FORCE_PREFIX.test(args.text)

  // Which day is this sentence for? Today, unless it is the small hours and
  // yesterday's question is still unanswered.
  // (Look the day up directly: the latest row is not necessarily this day's,
  // which once let chat replies pile onto yesterday as extra thoughts.)
  let day = today
  if (hour < GRACE_HOUR && user.prompt_day === addDays(today, -1) && !(await findEntry(user.id, user.prompt_day))) {
    day = user.prompt_day
  }
  const pending = user.prompt_day === day && !(await findEntry(user.id, day))

  // The name we asked for, if this reads as one.
  const name = nameReplyFor(user, args.text, pending, now)
  if (name && !forced) {
    await setUserName(user, name)
    await sendText({ chatGuid: args.chatGuid, text: `${buddyCopy('nameSet', { name })}\n${SITE_URL}` })
    return true
  }

  if (!pending && !forced) return false

  const text = args.text.replace(FORCE_PREFIX, '').trim()
  if (text.length < 2) {
    await sendText({ chatGuid: args.chatGuid, text: 'One sentence, anything at all. What happened?' })
    return true
  }
  const r = await recordEntry(user, day, text)
  const tail = r.added || r.edited ? [] : await afterKept(user, day)
  await sendText({ chatGuid: args.chatGuid, text: confirmText(r, tail) })
  return true
}
