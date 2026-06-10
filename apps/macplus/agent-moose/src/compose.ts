/*
 * compose.ts — Claude writes one in-character utterance and transcribes it to
 * MacinTalk phonemes, then we shape it into the TKM wire frame.
 */

import Anthropic from '@anthropic-ai/sdk';
import { systemPrompt, MOOD_CODE, type Mood } from './persona.ts';

const MODEL = process.env.MOOSE_MODEL || 'claude-opus-4-8';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export interface Utterance {
  mood: Mood;
  moodCode: number;
  text: string;                         // the speech-bubble line
  words: { display: string; phonemes: string }[];
}

const ASCII: Record<string, string> = { '’': "'", '‘': "'", '“': '"', '”': '"', '—': '-', '–': '-', '…': '...' };
function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    if (ch in ASCII) out += ASCII[ch];
    else { const c = ch.codePointAt(0)!; out += c >= 32 && c < 127 ? ch : c === 9 ? ' ' : ''; }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Pair spoken words with phoneme-words; tolerate small count mismatches. */
function pairWords(say: string, ph: string): { display: string; phonemes: string }[] {
  const spoken = fold(say).split(' ').filter(Boolean);
  const phon = ph.split('/').map((p) => p.trim()).filter(Boolean);
  const out: { display: string; phonemes: string }[] = [];
  if (phon.length === spoken.length) {
    for (let i = 0; i < spoken.length; i++) out.push({ display: spoken[i], phonemes: phon[i] });
    return out;
  }
  // mismatch: distribute spoken words across available phoneme chunks evenly
  const n = Math.max(1, phon.length);
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * spoken.length) / n);
    const b = Math.floor(((i + 1) * spoken.length) / n);
    out.push({ display: spoken.slice(a, b).join(' ') || spoken[a] || '', phonemes: phon[i] });
  }
  return out.filter((w) => w.display);
}

function parse(text: string): Utterance {
  const moodM = text.match(/^MOOD:\s*(\w+)/im);
  const sayM = text.match(/^SAY:\s*(.+)$/im);
  const phM = text.match(/^PH:\s*(.+)$/im);
  if (!sayM || !phM) throw new Error('model reply missing SAY or PH');
  let mood = (moodM?.[1]?.toLowerCase() ?? 'neutral') as Mood;
  if (!(mood in MOOD_CODE)) mood = 'neutral';
  const say = fold(sayM[1]);
  const words = pairWords(say, phM[1]);
  if (words.length === 0) throw new Error('no words');
  return { mood, moodCode: MOOD_CODE[mood], text: say, words };
}

export async function compose(task: string, onTick?: (s: number) => void): Promise<Utterance> {
  const started = Date.now();
  const hb = onTick ? setInterval(() => onTick(Math.round((Date.now() - started) / 1000)), 10_000) : null;
  try {
    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: systemPrompt(),
      messages: [{ role: 'user', content: task }],
    });
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parse(text);
  } finally {
    if (hb) clearInterval(hb);
  }
}
