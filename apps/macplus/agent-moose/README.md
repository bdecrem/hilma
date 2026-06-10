# Talking Plus agent (mini side)

The server half of **The Talking Plus**. A sardonic 1-bit character on the Mac
Plus speaks aloud via MacinTalk; this agent has Claude write his lines (deadpan,
"awake since 1986") from real data and transcribe them to MacinTalk phonemes.

```
Mac Plus ──serial──> RetroWiFi SI ──WiFi/TCP──> Mac mini :2329 ── moose-agent
```

## Commands (Plus → agent)
- `WAKE` — a greeting with attitude; uses `~/.talking-plus/briefing.json` (a
  calendar/inbox feed you populate from your own tools) if present.
- `NEWS` — he gossips about today's real Hacker News (public API, no creds).
- `SAY <topic>` — he riffs on whatever you type.

## Wire protocol (must match `talkingplus/talk_rx.inc`)
```
agent -> Plus:  TKMSTS <status>
                TKMUTT <nWords> <moodCode>      0 neutral 1 grumpy 2 excited 3 sly 4 sleepy
                T <speech-bubble text>          (+ continuation lines)
                W <phonemes> | <displayWord>    one per spoken word, in order
                TKMEND   |  TKMERR <msg>
```
Claude does English→MacinTalk phonemes (better than the 1985 Reader rules and
needs no extra driver resources); the Plus speaks each word via `PBWriteSync` to
the `.SPEECH` driver and flaps its mouth + highlights the word in time.

## Files
- `src/persona.ts` — the character + the MacinTalk phoneme alphabet.
- `src/feeds.ts` — Hacker News fetch + optional briefing file.
- `src/compose.ts` — Claude → line + per-word phonemes + mood.
- `src/frame.ts` — the TKM wire format.
- `src/main.ts` — `node:net` server (`--listen 2329`) / stdin loop, paced output.
- `src/selftest.ts` — frame units + live HN + live compose; writes `talkingplus/test_utterance.h`.

## Run
```bash
npm install
MOOSE_SKIP_LIVE=1 npx tsx src/selftest.ts     # offline frame units + live HN
npx tsx src/selftest.ts                        # + live in-character compose
npx tsx src/main.ts --listen 2329
```
Env: `ANTHROPIC_API_KEY` (or repo `.env.local`), `MOOSE_MODEL`, `TALKING_PLUS_BRIEFING`.

## The MacinTalk file (Plus side)
The app speaks through Apple's 1986 **MacinTalk** driver, which is **not
redistributed here** (copyright). Put the freely-available MacinTalk file on the
Plus's disk next to the app; the app `OpenResFile`s it and `OpenDriver(".SPEECH")`.
Without it, the character mimes silently (mouth-flap + word highlight).
