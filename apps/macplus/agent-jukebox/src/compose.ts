/*
 * compose.ts — Claude writes a song for the Mac Plus's square-wave voice.
 */

import Anthropic from '@anthropic-ai/sdk';
import { parseComposition, type Score } from './score.ts';

const MODEL = process.env.JUKEBOX_MODEL || 'claude-opus-4-8';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const SYSTEM = `You compose songs for a 1986 Macintosh Plus that sings them through its tiny mono speaker using a single square-wave voice (a chiptune beeper), while the lyrics display karaoke-style on its 1-bit screen with a bouncing ball. Your job: an original, catchy, SINGABLE monophonic melody with timed lyric lines.

THE INSTRUMENT:
- ONE voice, square wave, no chords, no percussion. Melody only.
- Range: C3 to C6. The sweet spot is G3-G5.
- The beeper has charm when melodies are rhythmically simple and tuneful — think nursery-rhyme clarity, video-game hooks, music-box phrasing. Stepwise motion with a few signature leaps. Repetition with small variation is GOOD: verses repeat melodic material.
- Use rests (R) between phrases so it can "breathe" — phrases of 2-4 bars separated by short rests.

THE SONG:
- 45-100 seconds total. Clear structure, e.g. intro (instrumental 2-4 bars), verse, chorus, verse 2 (same melody as verse), chorus, ending. The chorus melody should appear at least twice, identical.
- Write REAL lyrics that fit the requested vibe — clever, specific, funny or poignant as appropriate. Roughly one syllable per melody note in sung passages (this is karaoke; the ball bounces per beat).
- Each lyric line covers one melodic phrase, timed in beats from song start.

OUTPUT FORMAT — exactly these line types, nothing else, no markdown:
TITLE: <song title, max 50 chars>
BPM: <70-160>
N <pitch> <beats>     one per melody note, IN ORDER. pitch = C4, F#3, Bb4... or R for a rest. beats = 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4
L <startBeat> <endBeat> <lyric line text>    timed against the cumulative beat count of the N lines; max 60 chars of text

RULES OF ARITHMETIC (important): the N lines are sequential; note i starts where note i-1 ended. Track the running beat total carefully and time your L lines so each one covers exactly the notes being sung. Intro bars have no L lines. Total notes: 80-350.`;

export async function compose(
  vibe: string,
  onTick?: (sec: number) => void
): Promise<Score> {
  const started = Date.now();
  const heartbeat = onTick
    ? setInterval(() => onTick(Math.round((Date.now() - started) / 1000)), 15_000)
    : null;
  try {
    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Compose the song: ${vibe}` }],
    });
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parseComposition(text);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}
