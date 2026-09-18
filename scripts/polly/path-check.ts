// Agentic Learning Mode, backend end to end, on a throwaway guest user:
// a canned level-check transcript → placeLearner (level, path, lesson 1) →
// the lesson's two decks → the three steps → lesson 2 is written from how
// lesson 1 went. Prints what was made; deletes the user afterwards.
//   set -a; . .env.local; set +a; npx tsx scripts/polly/path-check.ts [beginner|some] [--keep]
import { pollySupabase } from '../../src/lib/polly/supabase'
import { createGuestUser } from '../../src/lib/polly/auth'
import { setActiveLanguage } from '../../src/lib/polly/language'
import { getThreadById } from '../../src/lib/polly/threads'
import { ensureLessonDeck, listFlashCards, pickSetCards } from '../../src/lib/polly/flash'
import { ensureCurrentLesson, markLessonStep, pathView, placeLearner } from '../../src/lib/polly/path'

const who = process.argv[2] === 'beginner' ? 'beginner' : 'some'
const keep = process.argv.includes('--keep')
let failures = 0
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++ }

const TRANSCRIPTS = {
  beginner: [
    { role: 'assistant', text: 'Ciao!' },
    { role: 'assistant', text: "Hi there! You can answer in Italian if you know some, or just say hello in English and I'll take it from there." },
    { role: 'user', text: "Hi. I don't really know any Italian yet." },
    { role: 'assistant', text: 'No problem at all. Have you learned any Italian before?' },
    { role: 'user', text: 'No, never. I know ciao and grazie and pizza, that is about it.' },
    { role: 'assistant', text: 'Good start. Why do you want to learn it?' },
    { role: 'user', text: "We're going to Rome and Florence in the spring, and I'd love to order food and chat with people a little. I like cooking and I like wine." },
    { role: 'assistant', text: "Lovely. I have what I need, I'm building your first lesson now. Tap End. Ciao!" },
  ],
  some: [
    { role: 'assistant', text: 'Ciao!' },
    { role: 'user', text: 'Ciao! Come stai?' },
    { role: 'assistant', text: 'Bene, grazie! E tu, come ti chiami?' },
    { role: 'user', text: 'Mi chiamo Sam. Io sto bene.' },
    { role: 'assistant', text: 'Piacere, Sam. Dove abiti, e che lavoro fai?' },
    { role: 'user', text: 'Abito a San Francisco. Io lavoro... sono un designer. Mi piace il mio lavoro.' },
    { role: 'assistant', text: 'Che bello. Che cosa hai fatto ieri?' },
    { role: 'user', text: 'Ieri io... vado al ristorante con amici. Mangio la pasta. Uh, sorry, I do not know the past.' },
    { role: 'assistant', text: 'Nessun problema. E il prossimo fine settimana, che cosa farai?' },
    { role: 'user', text: 'Um... weekend... I go to the mountains, in montagna, for hiking. I do not know how to say it.' },
    { role: 'assistant', text: 'Va benissimo. Ti piace la montagna?' },
    { role: 'user', text: 'Sì, mi piace molto la montagna e anche il mare.' },
    { role: 'assistant', text: "Perfect. I have what I need and I'm building your first lesson now. Tap End. Ciao ciao!" },
  ],
}

async function main() {
  const sb = pollySupabase()
  const guest = await createGuestUser({ username: `pathcheck${Date.now() % 100000}` })
  if (!('id' in guest)) throw new Error(`guest create failed: ${JSON.stringify(guest)}`)
  const userId = guest.id
  console.log(`user ${guest.username} ${userId} (${who})`)
  try {
    await setActiveLanguage(userId, 'it')
    const { data: vs, error } = await sb.from('polly_voice_sessions')
      .insert({ user_id: userId, mode: 'placement', transcript: TRANSCRIPTS[who], ended_at: new Date().toISOString() })
      .select('id').single()
    if (error || !vs) throw new Error(`voice session insert failed: ${error?.message}`)

    let t = Date.now()
    const placed = await placeLearner({ userId, userName: guest.username, voiceSessionId: vs.id })
    console.log(`placeLearner ${((Date.now() - t) / 1000).toFixed(1)}s`)
    if (!placed.ok) throw new Error(placed.error)
    const v = placed.view
    console.log(`\nLEVEL ${v.level}\n  can: ${v.placement?.can_do}\n  shaky: ${v.placement?.shaky}\n  likes: ${v.placement?.interests.join(', ')}`)
    for (const l of v.lessons) console.log(`  ${l.position}. [${l.state}] ${l.title} — ${l.scene} — ${l.grammar}`)
    check(who === 'beginner' ? v.level === 'A0' : ['A1', 'A2'].includes(v.level ?? ''), `level fits the learner (${v.level})`)
    check(v.lessons.length === 5, 'five lessons on the path')
    check(v.lessons[0].state === 'current' && v.lessons[1].state === 'locked', 'lesson 1 current, lesson 2 locked')

    const lesson1 = (await getThreadById(userId, placed.lesson_thread_id))!
    const p = lesson1.lesson!
    console.log(`\nLESSON 1: ${lesson1.topic}\n  scene: ${p.scene}`)
    for (const d of p.dialogue ?? []) console.log(`    ${d.speaker}: ${d.line}   (${d.english})`)
    console.log(`  words: ${p.key_words.map((w) => `${w.term} = ${w.meaning}`).join(' · ')}`)
    console.log(`  expressions: ${p.phrases.map((w) => w.term).join(' · ')}`)
    console.log(`  grammar: ${p.grammar_point}\n    ${p.grammar_explained}\n  closing: ${p.closing_question}`)
    check(lesson1.kind === 'lesson' && lesson1.path_position === 1, 'lesson 1 is a lesson topic at position 1')
    check((p.dialogue?.length ?? 0) >= 6 && p.key_words.length >= 6, 'conversation and words are there')

    t = Date.now()
    const made = await ensureLessonDeck(lesson1)
    console.log(`\ndeck ${made} cards in ${((Date.now() - t) / 1000).toFixed(1)}s`)
    const cards = await listFlashCards(userId, lesson1.id)
    const words = cards.filter((c) => c.lesson_step === 'words')
    const grammar = cards.filter((c) => c.lesson_step === 'grammar')
    for (const c of [...words.slice(0, 4), ...grammar.slice(0, 4)]) console.log(`  [${c.lesson_step}] ${c.question} → ${c.answer}  (${c.distractors.join(' / ')})`)
    check(words.length >= 8 && grammar.length >= 6, `words deck ${words.length}, grammar deck ${grammar.length}`)
    const gSet = await pickSetCards(userId, lesson1.id, { lessonStep: 'grammar' })
    const wSet = await pickSetCards(userId, lesson1.id, { lessonStep: 'words' })
    check(gSet.length > 0 && gSet.every((c) => c.lesson_step === 'grammar'), 'a grammar set is only grammar cards')
    check(wSet.length > 0 && wSet.every((c) => c.lesson_step !== 'grammar'), 'a words set has no grammar cards')

    // Steps: two of three leave the lesson open; the third finishes it.
    let fresh = (await getThreadById(userId, lesson1.id))!
    check(!(await markLessonStep(fresh, 'talk')).finished, 'talk alone does not finish the lesson')
    fresh = (await getThreadById(userId, lesson1.id))!
    check(!(await markLessonStep(fresh, 'words')).finished, 'talk + words does not finish it')
    fresh = (await getThreadById(userId, lesson1.id))!
    check((await markLessonStep(fresh, 'grammar')).finished, 'the third step finishes it')
    fresh = (await getThreadById(userId, lesson1.id))!
    check(!(await markLessonStep(fresh, 'grammar')).finished, 'finishing happens once')
    let view = (await pathView(userId))!
    check(view.lessons[0].state === 'done' && view.lessons[1].state === 'writing' && view.lessons[2].state === 'locked',
          'path: 1 done, 2 being written, 3 locked')

    // A couple of missed cards, so the next lesson has something to pick up.
    await sb.from('polly_flash_cards').update({ lapses: 1 }).in('id', words.slice(0, 2).map((c) => c.id))
    t = Date.now()
    const [a, b] = await Promise.all([ensureCurrentLesson(userId, guest.username), ensureCurrentLesson(userId, guest.username)])
    console.log(`\nlesson 2 written in ${((Date.now() - t) / 1000).toFixed(1)}s`)
    check([a, b].filter(Boolean).length === 1, 'two triggers at once write the lesson once')
    const lesson2 = (a ?? b)!
    console.log(`LESSON 2: ${lesson2.topic}\n  scene: ${lesson2.lesson?.scene}\n  grammar: ${lesson2.lesson?.grammar_point}`)
    for (const d of lesson2.lesson?.dialogue ?? []) console.log(`    ${d.speaker}: ${d.line}   (${d.english})`)
    view = (await pathView(userId))!
    check(view.lessons[1].state === 'current' && view.lessons[1].thread_id === lesson2.id, 'path: lesson 2 is current')
    const { count } = await sb.from('polly_threads').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'lesson')
    check(count === 2, `two lesson topics exist (${count})`)
    const cards2 = await listFlashCards(userId, lesson2.id)
    check(cards2.some((c) => c.lesson_step === 'grammar') && cards2.some((c) => c.lesson_step === 'words'), `lesson 2 came with its decks (${cards2.length} cards)`)
  } finally {
    if (keep) console.log(`kept user ${userId}`)
    else {
      await sb.from('polly_users').delete().eq('id', userId)
      console.log('cleaned up')
    }
  }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed')
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
