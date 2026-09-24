# Dodo voice on ElevenLabs + Claude — reference

Last updated: 2026-09-20 (the day it was built). Setup on another machine, the bridge, Vercel and troubleshooting: [`f2-eleven-voice-setup.md`](f2-eleven-voice-setup.md).

Dodo's default voice engine since 2026-09-21 (`VoiceEngine.fallback`; GPT-Live, `docs/f2-gpt-live-reference.md`, is the other choice). It is a per-device setting — Profile → Voice → **Voice engine: GPT-Live / ElevenLabs + Claude** (`VoiceEngine` in `DodoVoiceClient.swift`, UserDefaults key `voiceEngine`, read when a session starts). Every voice surface honours it: Talk to Dodo (global / topic), spoken flash rounds, the Final Review, the Second Chance and the recert refresher. Same screens, same hold-to-talk and mute, same finish route, same graders.

## The shape of a session

**ElevenLabs Speech Engine** owns the audio: speech-to-text (`scribe_realtime`), turn-taking (`turn_v3`), barge-in, and the voice (Jessica on `eleven_v3_conversational`). **Claude Opus 5.5** owns the words. Speech Engine is ElevenLabs' bring-your-own-LLM product: for each user turn it sends the running transcript to OUR WebSocket server and speaks whatever text comes back.

```
phone ⇄ ElevenLabs (WebRTC, their Swift SDK)
            │  one WebSocket per conversation, ElevenLabs is the CLIENT
            ▼
   apps/dodo-voice-bridge   (a Node process; Vercel cannot host a WebSocket server)
            │  POST /api/f2/eleven/turn  { voice_session_id, transcript }   x-bridge-secret
            ▼
   Vercel: Claude Opus 5.5, streamed plain text  →  bridge  →  ElevenLabs speaks it
```

It is a cascade, not a full-duplex model: there are no backchannels while the user talks, and a turn costs Claude's time-to-first-token plus the voice's. Measured 2026-09-20 on a topic session: first text 1.0–1.6 s (thinking off), first audio ≈ 2.0–2.4 s after the user stops (`eleven_flash_v2` is ≈ 0.5 s quicker and flatter). Barge-in stops Dodo in about a second. ElevenLabs waits `cascade_timeout_seconds` (15 s on our engines, the maximum; the default 4 s killed long Final Review answers on 2026-09-23) for the first words of a reply, re-sends the turn after each wait and fails the conversation after the third; the bridge keeps the reply in flight across those re-sends. After a long spoken answer Claude's first words take 3.5–4 s (about 12 minutes of talking: 5.4–8.3 s). After ten minutes of one unbroken user turn (Dodo listening the whole time) the phone plays the ding once, buzzes and shows "10 minutes in", a nudge to wrap up (`startTurnClock` in `ElevenVoiceClient.swift`; `-voiceLongTurnWarnSeconds N` shortens it in the simulator). Re-measured 2026-09-22 on Opus 5.5 (thinking cannot be switched off there): first text 1.4–1.6 s at low effort, headless, one-line tutor prompt.

| Piece | Path |
|---|---|
| Prompts (shared with GPT-Live, `engine: 'eleven'`) | `src/lib/f2/live.ts` |
| Mode gates + script per mode, both engines | `src/lib/f2/voice-start.ts` (`resolveVoiceStart`) |
| Token mint, the session row, a Claude turn | `src/lib/f2/eleven.ts` |
| Start a session | `src/app/api/f2/eleven/session/route.ts` |
| One spoken turn (bridge only) | `src/app/api/f2/eleven/turn/route.ts` |
| Finish (transcript, usage) | `PATCH /api/f2/live/session/:id` — the same route as GPT-Live |
| The bridge, the engines, launchd | `apps/dodo-voice-bridge/` (`README.md` there) |
| iOS client | `apps/feynd/Feynd/ElevenVoiceClient.swift`, protocol + factory in `DodoVoiceClient.swift` |
| Headless conversation harness | `scripts/test-eleven-dodo.ts` |
| Schema | `apps/f2/schema/050_f2_eleven_voice.sql` (`f2_voice_sessions.system_prompt`) |

## What differs from the GPT-Live prompt

`engine: 'eleven'` on the builders in `live.ts`:
- **Persona** (`ELEVEN_PERSONA`): Claude never hears audio. It is told that everything it writes is spoken, to write only the words to be said (no markdown, lists, stage directions; numbers as spoken), that what it reads is a transcript with mis-hearings, and that an earlier turn of its own ending mid-sentence means the user cut in.
- **The whole material**, up to 120,000 chars, where GPT-Live gets a 24,000-char excerpt. Claude's context holds it, so there is **no backend model and no delegation policy**.
- Everything else — the scripts per mode, study focus, weaknesses, the user's delivery style, the hold-to-talk note — is the same text.

## Connection flow

1. `POST /api/f2/eleven/session` `{ mode, thread_id, card_ids, hold_to_talk }` → gates + prompt (`resolveVoiceStart`), a `f2_voice_sessions` row (`realtime_model` = `claude-opus-5-5`, `realtime_voice` = `elevenlabs`, the prompt in `system_prompt`), a WebRTC conversation token (`GET /v1/convai/conversation/token?agent_id=<engine id>`). Response:
   ```json
   { "voice_session": { "id", "mode", "thread_id" },
     "eleven": { "conversation_token", "model", "hold_to_talk",
                 "dynamic_variables": { "dodo_voice_session": "<voice session id>" },
                 "kickoff": "[begin]" | null } }
   ```
2. The phone starts the conversation with the token and the dynamic variables. The engine is configured to forward `dodo_voice_session` to the bridge as the `x-dodo-voice-session` header — that is how a turn finds its prompt. (The conversation id is also stored on the row, in `realtime_session_id`, on the first turn.)
3. **Dodo speaks first** in the scripted modes because the client sends `kickoff` as a text message once the agent is ready; `turnMessages()` swaps it for the opening instruction and clients keep it out of the transcript. Talk to Dodo waits for the user.
4. Each turn: ElevenLabs → bridge `user_transcript` (full history + `event_id`) → `/api/f2/eleven/turn` → Claude stream → `agent_response` chunks. A newer `user_transcript` means the user cut in: the bridge aborts the request in flight, and ElevenLabs sends the client an `agent_response_correction` with what was actually spoken — the iOS client keeps that in the transcript.
5. End: `endConversation()`, then the same `PATCH /api/f2/live/session/:id` with `[{ role, text, created_at }]`.

## The Claude call (`streamElevenTurn`)

`claude-opus-5-5` (`F2_ELEVEN_MODEL`), `max_tokens` 2048, **adaptive thinking at low effort** — Opus 5.5 rejects `disabled` with a 400 (moved 2026-09-22; measured headless on a one-line tutor prompt, its first text came at 1.4–1.6 s against 0.9–2.1 s for Opus 5 with thinking off; `F2_ELEVEN_THINKING=disabled` is honoured only for a `F2_ELEVEN_MODEL` that accepts it, such as `claude-opus-5`), effort `low` (`F2_ELEVEN_EFFORT`). The system prompt is one cached block (it never changes within a session) and the conversation is cached behind it; the turn log line (`[f2/eleven] turn …`) carries `cache_read_input_tokens`, `first_text_ms`, `total_ms`. The persona still carries the "no internal XML tags" line from the thinking-off days. No tools.

## Env

| Var | Where | What |
|---|---|---|
| `ELEVENLABS_API_KEY` | `.env.local`, Vercel, bridge | token mint; the bridge verifies ElevenLabs' JWT with it |
| `ELEVEN_SPEECH_ENGINE_ID` | `.env.local` = the **dev** engine, Vercel = the **prod** engine | which engine a backend mints tokens for |
| `DODO_BRIDGE_SECRET` | `.env.local`, Vercel, bridge | `x-bridge-secret` on `/api/f2/eleven/turn` |
| `F2_ELEVEN_MODEL` / `F2_ELEVEN_THINKING` / `F2_ELEVEN_EFFORT` | optional | deviate from the defaults on purpose |

Two engines because an engine has ONE `ws_url`: "Dodo (dev)" → `/ws/dev` → `http://localhost:3100`, "Dodo" → `/ws/prod` → `https://feynd.cc`. One bridge process serves both paths.

## Verifying

- **Server + bridge + ElevenLabs, headless:** `npx tsx scripts/test-eleven-dodo.ts [mode] [threadId] [--base URL] [--answer "…"]… [--text] [--interrupt]` — signs in as the test account, starts a session through the route, talks to ElevenLabs over its WebSocket transport, answers out loud with macOS `say` (so speech-to-text and turn-taking are in the loop), and finishes through the PATCH. `--interrupt` barges into Dodo's second reply. Needs the bridge running (`bash apps/dodo-voice-bridge/run.sh`) and, for the default base, `npx next dev --turbopack -p 3100`.
- **Production, headless:** `ELEVEN_SPEECH_ENGINE_ID=<prod engine id> npx tsx scripts/test-eleven-dodo.ts global --base https://feynd.cc --guest` — a throwaway guest account (delete its `f2_users` row afterwards). Passed 2026-09-20, first text ≈ 0.8 s.
- **iOS, simulator:** the same drill as GPT-Live with the engine switched: add `-voiceEngine eleven` to the `-OpenTopic <id> -OpenVoice 1 -VoiceLiveTest 1` launch (or `-OpenFinalReview 1`). Lines are tagged `F2_ELEVEN_*`; the drill's own lines stay `F2_LIVE_TEST`.

## Official docs

- Speech Engine quickstart: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-engine
- Upstream WebSocket protocol (what the bridge speaks): https://elevenlabs.io/docs/api-reference/speech-engine/speech-engine-upstream
- Create / update an engine: https://elevenlabs.io/docs/api-reference/speech-engine/create
- Swift SDK: https://github.com/elevenlabs/elevenlabs-swift-sdk

Append `.md` to a docs URL for the markdown version.
