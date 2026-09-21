// Prompt-level check of the scripted Polly voice modes on the ElevenLabs
// engine (Claude writes the turns): the level check, the clean-up walk and a
// flash round, each driven by a scripted transcript shaped exactly like the
// one the voice bridge sends — the kickoff, learner turns, and the app's text
// cues (ELEVEN_CUE_PREFIX). No audio, no database: it proves the prompts, the
// cue handling in turnMessages() and Claude's replies. The audio path is
// scripts/polly/test-eleven-polly.ts.
//
//   npx tsx scripts/polly/test-eleven-modes.ts
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

type Msg = { role: 'user' | 'agent'; content: string }

async function main() {
  const { ELEVEN_CUE_PREFIX, ELEVEN_KICKOFF, streamElevenTurn, turnMessages } = await import('../../src/lib/f2/eleven')
  const live = await import('../../src/lib/polly/live')
  const { withOpening, elevenPlacementNudge } = await import('../../src/lib/polly/eleven')

  const user = 'bart'
  let failures = 0
  const check = (label: string, ok: boolean, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures++
  }

  async function say(prompt: string, transcript: Msg[]): Promise<string> {
    let out = ''
    for await (const t of streamElevenTurn({ systemPrompt: prompt, messages: turnMessages(transcript, null) })) out += t
    transcript.push({ role: 'agent', content: out })
    return out.trim()
  }
  const prompt = (instructions: string, mode: Parameters<typeof live.liveOpeningInstruction>[0], opts?: Parameters<typeof live.liveOpeningInstruction>[2]) =>
    withOpening(live.toElevenInstructions(instructions, user), live.liveOpeningInstruction(mode, user, opts))

  // --- The level check --------------------------------------------------
  {
    const p = prompt(live.buildLivePlacementInstructions({ userName: user, language: 'it' }), 'placement', { language: 'it' })
    check('placement prompt has no backend talk', !/backend|Delegation policy|by ear/i.test(p))
    const t: Msg[] = [{ role: 'user', content: ELEVEN_KICKOFF }]
    const hello = await say(p, t)
    console.log('  polly:', hello)
    check('placement opens with the greeting alone', hello.replace(/\s/g, '') === 'Ciao!', hello)
    t.push({ role: 'user', content: elevenPlacementNudge(user, 'it').cue })
    const nudge = await say(p, t)
    console.log('  polly:', nudge)
    check('nudge re-greets and offers English', /ciao/i.test(nudge) && /english/i.test(nudge), nudge.slice(0, 80))
    t.push({ role: 'user', content: 'Ciao! Sto bene, grazie. Mi chiamo Bart.' })
    const next = await say(p, t)
    console.log('  polly:', next)
    check('carries on in Italian', /[?]/.test(next) && !/english/i.test(next))
  }

  // --- The clean-up walk ------------------------------------------------
  {
    const fixes = [
      { said: 'Io sono andato a il mercato', fixed: 'Sono andato al mercato', kind: 'grammar', note: 'a + il becomes al', say_it: 'Sono andato al mercato' },
      { said: 'Ho comprato mele rosso', fixed: 'Ho comprato mele rosse', kind: 'agreement', note: 'the colour matches the apples', say_it: 'Ho comprato mele rosse' },
    ]
    const p = prompt(live.buildLiveCleanupInstructions({ userName: user, language: 'it', fixes }), 'cleanup')
    check('cleanup prompt has no backend talk', !/backend/i.test(p))
    const t: Msg[] = [{ role: 'user', content: ELEVEN_KICKOFF }]
    const one = await say(p, t)
    console.log('  polly:', one)
    check('starts with number 1 only', /al mercato/i.test(one) && !/rosse/i.test(one))
    t.push({ role: 'user', content: 'Sono andato al mercato.' })
    const react = await say(p, t)
    console.log('  polly:', react)
    check('reacts and waits (does not start number 2)', !/rosse/i.test(react))
    t.push({ role: 'user', content: `${ELEVEN_CUE_PREFIX}The learner is ready for the next one. Now move to number 2 and address ONLY it.` })
    const two = await say(p, t)
    console.log('  polly:', two)
    check('the app cue moves her to number 2', /rosse/i.test(two) && !/note from the app/i.test(two))
    t.push({ role: 'user', content: 'Ho comprato mele rosse.' })
    await say(p, t)
    t.push({ role: 'user', content: `${ELEVEN_CUE_PREFIX}That was the last one — they're all done. Tell them they did great, and ask if they'd like to run the whole conversation again, cleanly.` })
    const done = await say(p, t)
    console.log('  polly:', done)
    check('wraps up and offers another run', /[?]/.test(done))
  }

  // --- A flash round ----------------------------------------------------
  {
    const cards = [
      { question: 'How do you say "good morning" in Italian?', answer: 'Buongiorno' },
      { question: 'What does "grazie" mean?', answer: 'Thank you' },
    ]
    const p = prompt(live.buildLiveFlashInstructions({ userName: user, topicLabel: 'Italian greetings', cards }), 'flash')
    check('flash prompt has no backend talk', !/backend|Delegation policy/i.test(p))
    const t: Msg[] = [{ role: 'user', content: ELEVEN_KICKOFF }]
    const q1 = await say(p, t)
    console.log('  polly:', q1)
    check('asks question 1 and keeps the answer back', /good morning/i.test(q1) && !/buongiorno/i.test(q1))
    t.push({ role: 'user', content: 'Buongiorno.' })
    const q2 = await say(p, t)
    console.log('  polly:', q2)
    check('marks it and asks question 2', /grazie/i.test(q2))
    t.push({ role: 'user', content: 'It means please.' })
    const end = await say(p, t)
    console.log('  polly:', end)
    check('corrects the miss and ends the round', /thank you/i.test(end))
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
