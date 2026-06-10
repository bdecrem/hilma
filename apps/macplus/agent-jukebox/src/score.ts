/*
 * score.ts — the score model and the JBX wire format.
 *
 * Claude composes in a readable score format (note names + beats); this module
 * validates it, converts to MIDI numbers + Mac ticks (60/s), and emits the
 * frame the Plus parses (jukebox/jukebox_rx.inc).
 */

export interface ScoreNote { midi: number; startTick: number; durTicks: number }
export interface ScoreLyric { startTick: number; endTick: number; text: string }
export interface Score {
  title: string;
  bpm: number;
  ticksPerBeat: number;
  totalTicks: number;
  notes: ScoreNote[];
  lyrics: ScoreLyric[];
}

export const MAX_NOTES = 800;
export const MAX_LYRICS = 64;

const NOTE_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" / "F#3" / "Bb5" -> MIDI number (C4 = 60). */
export function nameToMidi(name: string): number {
  const m = name.trim().match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!m) throw new Error(`bad note name "${name}"`);
  let v = NOTE_BASE[m[1].toUpperCase()];
  if (m[2] === '#') v++;
  if (m[2] === 'b') v--;
  const octave = parseInt(m[3], 10);
  const midi = v + (octave + 1) * 12;
  if (midi < 24 || midi > 96) throw new Error(`note ${name} out of range`);
  return midi;
}

function fold(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFKD')) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c < 127) out += ch;
    else if ("’‘".includes(ch)) out += "'";
    else if ('“”'.includes(ch)) out += '"';
    else if (ch === '—' || ch === '–') out += '-';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Parse Claude's composition text:
 *   TITLE: <title>
 *   BPM: <40..200>
 *   N <pitch|R> <beats>          sequential melody (R = rest)
 *   L <startBeat> <endBeat> <lyric line text>
 */
export function parseComposition(text: string): Score {
  let title = '';
  let bpm = 0;
  const seq: { midi: number; beats: number }[] = [];
  const lyr: { a: number; b: number; t: string }[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^TITLE:\s*(.+)$/i))) { title = fold(m[1]).slice(0, 60); continue; }
    if ((m = line.match(/^BPM:\s*(\d+)/i))) { bpm = parseInt(m[1], 10); continue; }
    if ((m = line.match(/^N\s+(\S+)\s+([\d.]+)\s*$/))) {
      const beats = parseFloat(m[2]);
      if (!(beats > 0 && beats <= 16)) throw new Error(`bad beats in: ${line}`);
      const midi = /^R$/i.test(m[1]) ? 0 : nameToMidi(m[1]);
      seq.push({ midi, beats });
      continue;
    }
    if ((m = line.match(/^L\s+([\d.]+)\s+([\d.]+)\s+(.+)$/))) {
      const a = parseFloat(m[1]), b = parseFloat(m[2]);
      if (!(a >= 0 && b > a)) throw new Error(`bad lyric timing in: ${line}`);
      lyr.push({ a, b, t: fold(m[3]).slice(0, 70) });
      continue;
    }
    /* tolerate stray prose lines outside the score */
  }

  if (!title) title = 'untitled';
  if (!(bpm >= 40 && bpm <= 200)) throw new Error('missing or silly BPM');
  if (seq.length < 8) throw new Error('melody too short');
  if (seq.length > MAX_NOTES) seq.length = MAX_NOTES;
  if (lyr.length > MAX_LYRICS) lyr.length = MAX_LYRICS;

  const tpb = Math.round(3600 / bpm);              /* ticks per beat */
  const notes: ScoreNote[] = [];
  let beatPos = 0;
  for (const n of seq) {
    const startTick = Math.round(beatPos * tpb);
    const durTicks = Math.max(1, Math.round(n.beats * tpb));
    if (n.midi > 0) notes.push({ midi: n.midi, startTick, durTicks });
    beatPos += n.beats;
  }
  if (notes.length < 8) throw new Error('melody is all rests');
  const totalTicks = Math.round(beatPos * tpb) + 30;

  const lyrics: ScoreLyric[] = lyr
    .map((l) => ({
      startTick: Math.round(l.a * tpb),
      endTick: Math.min(Math.round(l.b * tpb), totalTicks),
      text: l.t,
    }))
    .filter((l) => l.endTick > l.startTick)
    .sort((a, b) => a.startTick - b.startTick);

  return { title, bpm, ticksPerBeat: tpb, totalTicks, notes, lyrics };
}

/* ---- wire encoding (must match jukebox_rx.inc) ---- */

export function status(msg: string): string {
  return `JBXSTS ${fold(msg).slice(0, 180)}\r\n`;
}
export function errorLine(msg: string): string {
  return `JBXERR ${fold(msg).slice(0, 180)}\r\n`;
}

export function encodeScore(s: Score): string {
  const out: string[] = [
    `JBXSON ${s.notes.length} ${s.lyrics.length} ${s.totalTicks} ${s.ticksPerBeat}\r\n`,
    `T ${s.title}\r\n`,
  ];
  for (const n of s.notes) out.push(`N ${n.midi} ${n.startTick} ${n.durTicks}\r\n`);
  for (const l of s.lyrics) out.push(`L ${l.startTick} ${l.endTick} ${l.text}\r\n`);
  out.push('JBXEND\r\n');
  return out.join('');
}
