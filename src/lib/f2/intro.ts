// The intro topic — "The Dodo", a mini topic seeded into every new account
// (guest or signed-up) so the whole app is tryable in two minutes: short
// source, book + audio summary, a 10-card deck, and one pebble.
//
// The template lives on the system account intro-template@feynd.cc; the
// audio file in storage is shared by every copy (the jsonb URL is copied
// verbatim, never the bytes). Rebuild the template through the normal app
// flows, then update the constant if the thread is ever recreated.

import { f2Supabase } from './supabase'

const TEMPLATE_THREAD_ID = '5a8bb79b-3559-4480-805b-1d4305543b7d'

const WELCOME_MESSAGE =
  "Welcome to Dodo! This little topic about the dodo itself is yours to play with — ask me anything about it, listen to the audio summary, run the flash cards, or peek at the saved quote under the ❝ button. When you're ready, add a real topic of your own: paste text, or send a link to an article or YouTube video."

/// Copy the template topic (thread + cards + pebble) into a user's account.
/// Best-effort: a failure logs and returns false but must never block
/// account creation.
export async function seedIntroTopic(userId: string): Promise<boolean> {
  try {
    const sb = f2Supabase()
    const { data: tmpl, error: tErr } = await sb
      .from('f2_threads')
      .select('topic, kind, content, book_summary, audio_summary')
      .eq('id', TEMPLATE_THREAD_ID)
      .maybeSingle()
    if (tErr || !tmpl) {
      console.error('[f2/intro] template thread missing:', tErr)
      return false
    }

    const now = new Date().toISOString()
    const { data: thread, error: thErr } = await sb
      .from('f2_threads')
      .insert({
        user_id: userId,
        // Legacy NOT NULL column from the SMS era; per-user value unused.
        handle: `intro-${userId}`,
        client: 'web',
        topic: tmpl.topic,
        kind: tmpl.kind,
        content: tmpl.content,
        book_summary: tmpl.book_summary,
        audio_summary: tmpl.audio_summary,
        messages: [{ role: 'assistant', text: WELCOME_MESSAGE, created_at: now }],
      })
      .select('id')
      .single()
    if (thErr || !thread) {
      console.error('[f2/intro] thread copy failed:', thErr)
      return false
    }

    const { data: cards, error: cErr } = await sb
      .from('f2_flash_cards')
      .select('question, answer, distractors, open_question')
      .eq('thread_id', TEMPLATE_THREAD_ID)
    if (cErr) console.error('[f2/intro] card read failed:', cErr)
    if (cards && cards.length > 0) {
      const { error: insErr } = await sb.from('f2_flash_cards').insert(
        cards.map((c) => ({
          user_id: userId,
          thread_id: thread.id,
          question: c.question,
          answer: c.answer,
          distractors: c.distractors,
          open_question: c.open_question,
        })),
      )
      if (insErr) console.error('[f2/intro] card copy failed:', insErr)
    }

    const { data: pebbles, error: pErr } = await sb
      .from('f2_artifacts')
      .select('kind, body, source')
      .eq('thread_id', TEMPLATE_THREAD_ID)
    if (pErr) console.error('[f2/intro] pebble read failed:', pErr)
    if (pebbles && pebbles.length > 0) {
      const { error: insErr } = await sb.from('f2_artifacts').insert(
        pebbles.map((q) => ({
          user_id: userId,
          thread_id: thread.id,
          kind: q.kind,
          body: q.body,
          source: q.source,
        })),
      )
      if (insErr) console.error('[f2/intro] pebble copy failed:', insErr)
    }

    return true
  } catch (e) {
    console.error('[f2/intro] seed failed:', e)
    return false
  }
}
