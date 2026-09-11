# Dodo voice on GPT-Live — reference

Last updated: 2026-09-11 (the day Dodo moved from Realtime `gpt-realtime-2.1` to `gpt-live-1`).

For code agents working on Dodo's voice surfaces: Talk to Dodo (global / topic), spoken flash rounds, the Final Review, the Second Chance and the recert refresher. Peri's walks (`src/lib/f4`, `/api/f4/walk/*`) and Loci still run on the Realtime API — `docs/f2-realtime-api-reference.md` stays for those.

## Where the code lives

| Piece | Path |
|---|---|
| Session config, prompts, OpenAI call | `src/lib/f2/live.ts` |
| Voice-session rows, prefs, voice catalog | `src/lib/f2/realtime.ts` (shared; the Realtime-only bits are marked) |
| Start a session (SDP exchange) | `src/app/api/f2/live/session/route.ts` |
| Finish a session (transcript, usage) | `src/app/api/f2/live/session/[id]/route.ts` (re-exports the Realtime-era handler) |
| iOS client | `apps/feynd/Feynd/LiveVoiceClient.swift`, screens unchanged in `VoiceSessionView.swift` / `FlashVoiceView.swift` |
| Headless conversation harness | `scripts/test-live-dodo.ts` |
| Voice preview clips | `scripts/generate-voice-previews.mjs` |
| Legacy (Realtime) routes for old builds | `src/app/api/f2/realtime/session`, `src/app/api/f2/realtime/tool` — delete once builds before 0.2 (106) are gone |

## The shape of a session

GPT-Live is a **full-duplex** voice model: it listens while it speaks, handles interruptions itself, and **delegates** reasoning and lookups to a backend. Two prompts, two models:

1. **Live prompt** (`session.instructions`, ≤16,384 tokens) — personality, backchannel and interruption policies, the exam or round script, a ≤24,000-char excerpt of the topic material, and a *delegation policy* with the three labels the prompting guide asks for (`Backend tools`, `Delegate to the backend when`, `Do not delegate to the backend when`). `fitLiveInstructions` trims the excerpt if the whole thing would exceed ~52,000 chars.
2. **Backend prompt** (`delegation.responses.instructions`) — the FULL topic material (up to 120,000 chars; the API accepted 400K in a probe), a job description per mode, and "return the facts, ready to be spoken". Model `gpt-5.6-luna` (`OPENAI_LIVE_BACKEND_MODEL`), reasoning effort `low` (`OPENAI_LIVE_BACKEND_REASONING`).

No function tools. The Realtime-era `get_topic_context` tool and its client-side loop are gone: the backend already holds everything the tool used to page through.

Session config (`buildLiveSessionConfig`):

```json
{
  "model": "gpt-live-1",
  "instructions": "…live prompt…",
  "audio": { "output": { "voice": "marin" } },
  "delegation": { "type": "responses", "responses": { "model": "gpt-5.6-luna", "instructions": "…backend prompt…", "reasoning": { "effort": "low" } } },
  "store": false
}
```

WebRTC omits `audio.format` (the SDP negotiates it). The WebSocket harness adds `audio.format: { type: "audio/pcm", rate: 24000 }`.

Voices: all eight in `REALTIME_VOICES` (marin, cedar, ash, ballad, coral, echo, sage, shimmer) are accepted by `gpt-live-1` (probed 2026-09-11), so the picker and `/api/f2/voice-prefs` are unchanged. GPT-Live also offers quartz, ripple, vesper, willow, stone, gleam, meridian, bossa, tempo, beacon, delta, cinder if the catalog ever grows — regenerate the preview clips after any change.

## Connection flow (iOS, WebRTC)

There are **no ephemeral client secrets** for Live. The phone never calls OpenAI over HTTP.

1. `LiveVoiceClient.start()`: mic permission → audio session → peer connection (`gatherOnce`), mic track (disabled in hold-to-talk), data channel `oai-events` created *before* the offer → `createOffer` → `setLocalDescription` → wait for ICE gathering to complete (6 s cap).
2. `POST /api/f2/live/session` with `{ mode, thread_id, card_ids, hold_to_talk, sdp }`. The server builds both prompts, calls `POST https://api.openai.com/v1/live/sessions` with `{ session, transport: { type: "webrtc", sdp } }`, inserts the `f2_voice_sessions` row (`realtime_session_id` = the live session id, `realtime_model` = `gpt-live-1`), and returns:
   ```json
   { "voice_session": { "id", "mode", "thread_id" },
     "live": { "session_id", "model", "backend_model", "voice", "hold_to_talk", "sdp_answer", "data_channel": "oai-events", "opening_instruction": "…" | null } }
   ```
   Pass the SDP through untouched — trimming its final CRLF makes OpenAI answer `invalid_offer: failed to unmarshal SDP: EOF`.
3. The phone applies `sdp_answer` as the remote description and waits for `session.started` on the data channel. **Never send `session.start` on the data channel** — the HTTP request started the session.
4. On `session.started`: hold-to-talk sends `session.input_audio.mute`; scripted modes (flash, final_review, second_chance, recert) send `opening_instruction` as `session.instructions.append` (`delegation_id: null`) so Dodo speaks first. Talk to Dodo (global / topic) waits for the user, as before.
5. End: `session.close` → wait (≤4 s) for `session.closed` (final `usage.seconds`, `reason`) → close the peer connection → `PATCH /api/f2/live/session/:id` with the transcript, a summary and `{ seconds }`.

## Events the client handles

| Event | What the client does |
|---|---|
| `session.started` | phase `.connected`; mute (hold-to-talk); send the opening instruction |
| `session.output_transcript.delta` | append to the assistant's open turn; phase `.speaking` for 1.5 s after the last fragment |
| `session.input_transcript.delta` | append to the user's open turn |
| `session.delegation.created` | status "Thinking" until Dodo's next words |
| `response.event` | nested backend lifecycle; logged only (`F2_LIVE_BACKEND`) |
| `session.usage.updated` / `session.closed` | keep `usage.seconds`; `session.closed` resolves the graceful close |
| `error` | logged (`F2_LIVE_EVENT_ERROR`); fatal only before `session.started` |

Transcript grouping: fragments carry `start_ms` / `end_ms` on the session timeline. A fragment more than 2 s after the same speaker's previous one starts a new turn; speakers are tracked independently so a "mm-hmm" mid-answer doesn't split the other speaker. Turns are sorted by `start_ms` and uploaded as `[{ role, text, created_at }]` — the shape `judgeVoiceSet` / `judgeFinalReview` grade.

Client commands used: `session.instructions.append`, `session.input_audio.mute` / `unmute`, `session.close`. Nothing else — no `input_audio_buffer.*`, no `response.create` / `cancel`, no `conversation.item.*`, no `output_audio_buffer.clear`. Those are Realtime events and the Live API rejects them.

## Hold-to-talk and mute

- Hold-to-talk: the live prompt gets a note that the user is on a push-to-talk key. Press: disable Dodo's remote audio track (instant silence), enable the mic track, `session.input_audio.unmute`. Release: 300 ms grace, then disable the mic track and `session.input_audio.mute`; re-enable Dodo's audio; status "Thinking" until the next output fragment (8 s cap). The model itself stops when it hears the user — the local mute only removes the jitter-buffer tail.
- Hands-free Mute: mic track off + `session.input_audio.mute`; Unmute reverses both.

## Verifying

- **Server + prompts + delegation, headless:** `npx tsx scripts/test-live-dodo.ts [mode] [threadId] [--nudge] [--answer "…"]` — builds the exact session config for the test account, runs it over WebSocket, lets Dodo open (or nudges it), answers with macOS `say`, prints both transcripts, every delegation and the nested backend events, and PASS/FAIL lines. `--answer "…check this with your backend…"` is how to force a delegation.
- **iOS client, simulator:** `-OpenTopic <id> -OpenVoice 1 -VoiceLiveTest 1` (or `-OpenFinalReview 1`) with `-TestLoginUser newx-test@example.com -TestLoginPass $F2_TEST_PASS` (in `.env.local`), `Secrets.swift` on `.dev` → `http://localhost:3100`, `pnpm dev -p 3100`. Grant the mic first: `xcrun simctl privacy <udid> grant microphone com.bartdecrem.Feynd`. Read `F2_LIVE_TEST` lines from `log show --predicate 'composedMessage CONTAINS "F2_LIVE"'`. See `apps/feynd/CLAUDE.md` for what the drill can and cannot prove (the sim mic is silent).

## Official docs (re-read before changing the protocol)

- Getting started: https://developers.openai.com/api/docs/guides/live
- Prompting: https://developers.openai.com/api/docs/guides/live-prompting (also `misc/gptlive.rtf`)
- Delegation and tools: https://developers.openai.com/api/docs/guides/live-delegation
- Managing sessions (events, transcripts, close): https://developers.openai.com/api/docs/guides/live-conversations
- WebRTC: https://developers.openai.com/api/docs/guides/voice-webrtc?api=live
- WebSockets: https://developers.openai.com/api/docs/guides/voice-websockets?api=live
- Migration from Realtime: https://developers.openai.com/api/docs/guides/live-migration
- Model card: https://developers.openai.com/api/docs/models/gpt-live-1 (voice $0.05/min billed per second; backend billed separately; WebRTC creation pre-bills 15 s, credited back)

Append `.md` to any of these for the markdown version.
