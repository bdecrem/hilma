# Polly — the pedagogy, and three ways to make it better (2026-09-19)

Notes from a read of `apps/polly/CLAUDE.md`, `apps/polly/QUALITY.md`,
`docs/polly-plan.md` and the headers of `src/lib/polly/{flash,infinity,live,daily-card}.ts`.
The Swift screens were not read for this. Set aside to digest later; nothing
here is decided.

## How Polly teaches

Polly treats speaking as the core activity and spaced recall as the thing that
makes it stick.

- **Finding the level.** A voice level check gets a notch harder each turn
  until the learner stumbles twice. It places them between A0 and C1, and
  Polly plans a five-lesson path from that.
- **Lessons.** Polly writes each lesson as a scene. The learner works it three
  ways: Talk (a role-play where Polly plays the other person), Words, and
  Grammar drills that use only the lesson's vocabulary. The next lesson is
  written from how the last one went, using the missed cards and the Talk
  transcript.
- **Real material.** Guest lessons (podcast episodes) and immersion topics get
  the same treatment. Polly extracts the teacher's key words, the story and
  the closing question once. Cards, chat and voice then all push the learner
  to use those words: gap fills, retelling the story, formal versus informal.
- **Infinity Chat.** The learner talks messily with no corrections during the
  conversation. Afterwards a clean-up picks only the five things most worth
  fixing and turns them into say-it phrases and drills.
- **Retention.** Cards run on SM-2 spaced repetition, and a card counts as
  mastered at a 21-day interval plus a streak. Peck, the daily iMessage card
  and streaks bring people back. Grading holds target-language answers to
  correctness in that language, so a wrong form fails even when the idea is
  right.

## Three ways to make it better educationally

### 1. Give Polly a memory of the learner's errors

`QUALITY.md` lists this as open: a recurring mistake "is fixed fresh each time."

- Keep a per-profile record of shaky points such as *essere/andare*
  auxiliaries or a particular preposition. Feed it from Infinity fixes, failed
  cards and Talk transcripts.
- Read it everywhere content is made. Clean-up curation would prefer repeat
  offenders. The next lesson's dialogue would plant them. Voice prompts would
  know what to listen for.
- Probably the highest leverage of the three, because it would make the
  separate features behave like one tutor.

### 2. Add listening and pronunciation

Almost everything is either output (talking) or text recall (cards). The
clean-up reads a transcript and never the audio, so pronunciation is
invisible. A speech-to-text error can also look like a learner's error.

- Audio-first cards: hear the line and type or say it, a dictation variant of
  the gap card.
- Shadowing on the say-it phrases, scored from the audio.
- A listen-first mode on lesson dialogues and immersion material, before the
  text appears.
- Comprehension is half of fluency, and right now only the voice chats touch it.

### 3. Advance on evidence instead of completion, and bring old material back

- Today a Talk step counts after three or more spoken turns, and Words and
  Grammar count once the cards have been played. A learner can finish a lesson
  without being able to do what it taught.
- End each lesson with a short unassisted "can you do it" voice task, graded
  against the lesson's targets with Polly giving no help. A miss would shape
  the next lesson instead of only being noted.
- Have each new lesson's dialogue deliberately reuse words and grammar from
  earlier lessons.
- Nudge the level up or down from ongoing performance. Today the level only
  changes on a manual retake of the level check.
