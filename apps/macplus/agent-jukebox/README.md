# Jukebox agent (mini side)

The server half of **Macinclaude Jukebox**. The Plus sends `SONG <vibe>`; Claude
composes an original monophonic melody + timed lyrics, and the score streams
back as a compact `JBXSON` frame the Plus performs on its square-wave speaker
with karaoke lyrics and a bouncing ball.

```
Mac Plus ──serial──> RetroWiFi SI ──WiFi/TCP──> Mac mini :2328 ── jukebox-agent
```

## Wire protocol (must match `jukebox/jukebox_rx.inc`)
```
Plus -> agent:  SONG <vibe>\r
agent -> Plus:  JBXSTS <status>
                JBXSON <nNotes> <nLyrics> <totalTicks> <ticksPerBeat>
                T <title>
                N <midi> <startTick> <durTicks>      (one per note, sorted)
                L <startTick> <endTick> <lyric>       (one per lyric line)
                JBXEND   |  JBXERR <msg>
```
Ticks are Mac ticks (1/60 s). Notes as MIDI numbers; the Plus maps MIDI→freqCmd.

## Files
- `src/score.ts` — score model + note-name→MIDI + composition parser + wire encoding.
- `src/compose.ts` — Claude composes (system prompt tuned for a 1-voice beeper).
- `src/main.ts` — `node:net` server (`--listen 2328`) / stdin loop, paced output.
- `src/selftest.ts` — units + Daisy Bell fixture + live compose; writes `jukebox/test_song.h`.

## Run
```bash
npm install
JUKEBOX_SKIP_LIVE=1 npx tsx src/selftest.ts   # offline units + Daisy Bell
npx tsx src/selftest.ts                        # + a live composition
npx tsx src/main.ts --listen 2328
```
Env: `ANTHROPIC_API_KEY` (or repo `.env.local`), `JUKEBOX_MODEL`.

## Status
Built + host-tested; live compose verified. Emulator audio/visual drive-through
pending (see `apps/macplus/CLAUDE.md`). Mono square-wave today; wavetable
(4-voice) and printer-port serial-MIDI out are the planned upgrades.
