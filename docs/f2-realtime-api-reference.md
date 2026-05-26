# F2 Realtime Voice API Reference

Last updated: 2026-05-26

This document is for code agents working on Feynd/F2 voice features. It describes the OpenAI Realtime API surface used by this repo, the F2 backend wrapper around it, and the iOS client event flow.

## Current Implementation

The current branch implements native iPhone voice mode with:

- F2 backend endpoint: `POST /api/f2/realtime/session`
- F2 backend tool endpoint: `POST /api/f2/realtime/tool`
- F2 backend persistence endpoint: `PATCH /api/f2/realtime/session/:id`
- OpenAI endpoint: `POST https://api.openai.com/v1/realtime/client_secrets`
- OpenAI realtime transport: WebRTC through `POST https://api.openai.com/v1/realtime/calls`
- iOS WebRTC package: `stasel/WebRTC` `147.0.0` (`WebRTC-M147.xcframework`)
- Default model: `gpt-realtime-2`
- Default voice: `marin`
- Default input transcription model: `gpt-realtime-whisper`
- Default reasoning effort: `low`

Important: OpenAI recommends WebRTC for browser/mobile realtime clients. Feynd now follows that path: audio is carried as WebRTC media tracks and Realtime events/tools use the `oai-events` data channel. The prior WebSocket plus base64 PCM playback path has been removed from the iPhone client.

## Official OpenAI Docs To Recheck

Realtime schema has changed before. Before changing the voice feature, re-open these official docs:

- Realtime overview: `https://developers.openai.com/api/docs/guides/realtime`
- Realtime WebSocket guide: `https://developers.openai.com/api/docs/guides/realtime-websocket`
- Realtime WebRTC guide: `https://developers.openai.com/api/docs/guides/realtime-webrtc`
- Realtime conversations and function calling: `https://developers.openai.com/api/docs/guides/realtime-conversations`
- Realtime server controls and sideband: `https://developers.openai.com/api/docs/guides/realtime-server-controls`
- Realtime API reference: `https://developers.openai.com/api/reference/resources/realtime`
- Realtime client secrets reference: `https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets`

Documentation facts this implementation depends on:

- Client secrets are short-lived ephemeral keys intended for client environments, so iOS never receives the standard `OPENAI_API_KEY`.
- `POST /v1/realtime/client_secrets` accepts a `session` object containing the Realtime session config.
- Mobile WebRTC clients send an SDP offer to `POST /v1/realtime/calls`, authenticated with the ephemeral client secret, then apply OpenAI's SDP answer.
- Under WebRTC, microphone and assistant audio are media tracks; JSON Realtime events are sent and received over a data channel.
- Realtime sessions can emit audio plus transcript when output modality is audio.
- Realtime voices include `marin` and `cedar`; OpenAI currently recommends those for quality.
- `voice` generally must be set before model audio output begins.
- Function call outputs are sent back as `conversation.item.create` items with `type: "function_call_output"`, followed by `response.create`.
- Server sideband is available as a future architecture, but it requires a durable server connection and should not be hosted in Vercel serverless functions.

## Backend Environment

Production needs these variables:

```bash
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_REALTIME_VOICE=marin
OPENAI_REALTIME_REASONING_EFFORT=low
OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-realtime-whisper
```

Only `OPENAI_API_KEY` is strictly required by code. The others have defaults in `src/lib/f2/realtime.ts`, but they should be configured in production so model, voice, and reasoning effort can be changed without rebuilding the iOS app.

## Files

Backend:

- `src/lib/f2/realtime.ts`
- `src/app/api/f2/realtime/session/route.ts`
- `src/app/api/f2/realtime/tool/route.ts`
- `src/app/api/f2/realtime/session/[id]/route.ts`
- `apps/f2/schema/007_f2_voice_sessions.sql`

iOS:

- `apps/feynd/Feynd/RealtimeVoiceClient.swift`
- `apps/feynd/Feynd/VoiceSessionView.swift`
- `apps/feynd/Feynd/F2API.swift`
- `apps/feynd/Feynd/ChatView.swift`
- `apps/feynd/Feynd/TopicDetailView.swift`
- `apps/feynd/Feynd/Secrets.swift`
- `apps/feynd/Feynd/Info.plist`

## Session Startup Flow

1. User taps the voice button in Feynd.
2. iOS asks the F2 backend for a Realtime session.
3. F2 authenticates the request using the existing `f2_session` cookie.
4. F2 builds a user-scoped Realtime prompt and declares narrow tools.
5. F2 calls OpenAI `POST /v1/realtime/client_secrets` with the standard API key.
6. OpenAI returns an ephemeral `client_secret.value`, expiration, and session metadata.
7. F2 creates a row in `f2_voice_sessions`.
8. F2 returns the ephemeral secret and voice session id to iOS.
9. iOS creates a WebRTC peer connection, local microphone audio track, and `oai-events` data channel.
10. iOS POSTs its SDP offer directly to OpenAI's `/v1/realtime/calls` endpoint using the ephemeral secret and installs the SDP answer.
11. WebRTC transports microphone and assistant audio; the iOS app does not encode or play raw audio deltas.
12. If OpenAI requests a tool call over `oai-events`, iOS calls the F2 tool endpoint with its authenticated cookie and sends the result back over the data channel.
13. On stop, iOS saves the transcript and summary through the F2 persistence endpoint.

## F2 Session Endpoint

Endpoint:

```http
POST /api/f2/realtime/session
Content-Type: application/json
Cookie: f2_session=...
```

Request body:

```json
{
  "mode": "global",
  "thread_id": null
}
```

For topic-scoped voice:

```json
{
  "mode": "topic",
  "thread_id": "uuid-or-thread-id"
}
```

Validation:

- `mode` must be `global` or `topic`.
- `thread_id` is required for `topic`.
- Topic lookup must use the authenticated user's id.
- If the topic is not owned by the authenticated user, return 404.

Response body:

```json
{
  "client_secret": {
    "value": "ek_...",
    "expires_at": 1770000000
  },
  "openai_session_id": "sess_...",
  "voice_session": {
    "id": "f2_voice_sessions uuid",
    "mode": "topic",
    "thread_id": "thread uuid"
  },
  "realtime": {
    "model": "gpt-realtime-2",
    "voice": "marin",
    "calls_url": "https://api.openai.com/v1/realtime/calls",
    "data_channel": "oai-events"
  }
}
```

The current iOS client uses `calls_url` for its SDP exchange and `data_channel` for Realtime JSON events.

## OpenAI Client Secret Request

The backend calls:

```http
POST https://api.openai.com/v1/realtime/client_secrets
Authorization: Bearer <OPENAI_API_KEY>
Content-Type: application/json
```

Current request body from `src/lib/f2/realtime.ts`:

```json
{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-2",
    "instructions": "...generated F2 instructions...",
    "output_modalities": ["audio"],
    "audio": {
      "input": {
        "turn_detection": {
          "type": "semantic_vad"
        },
        "transcription": {
          "model": "gpt-realtime-whisper",
          "language": "en"
        }
      },
      "output": {
        "voice": "marin"
      }
    },
    "reasoning": {
      "effort": "low"
    },
    "tool_choice": "auto",
    "tools": [
      {
        "type": "function",
        "name": "get_topic_context",
        "description": "Fetch source-grounded context for the current F2 topic. Use before making specific claims about saved topic content.",
        "parameters": {
          "type": "object",
          "properties": {
            "thread_id": {
              "type": "string",
              "description": "The F2 thread id for the topic being discussed."
            },
            "query": {
              "type": "string",
              "description": "The user question or phrase to retrieve relevant context for."
            }
          },
          "required": ["thread_id", "query"],
          "additionalProperties": false
        }
      }
    ]
  }
}
```

Do not send top-level `type`, `model`, or `audio` to `/v1/realtime/client_secrets`. In the current API shape, the Realtime session config belongs under `session`.

## Prompt Construction

Prompt construction lives in `buildRealtimeInstructions` in `src/lib/f2/realtime.ts`.

There are two modes:

- `topic`: includes thread id, title, URL, quiz count, last quiz time, recent messages, and a bounded source excerpt.
- `global`: gives the model F2 identity and tells it to ask Bart to open a topic for source-grounded discussion when it lacks enough context.

Hard constraint: do not dump all F2 data into the Realtime prompt. Use narrow retrieval/tool calls. Topic mode includes at most a bounded excerpt, and `get_topic_context` returns at most a bounded context window.

## iOS WebRTC Connection

Current connection code is in `RealtimeVoiceClient.connectWebRTC`. The native dependency is declared in `apps/feynd/project.yml` and resolved through Swift Package Manager.

The handshake follows OpenAI's documented WebRTC client flow:

1. Create an `RTCPeerConnection`.
2. Add a local WebRTC audio track sourced from the device microphone.
3. Create the ordered `oai-events` `RTCDataChannel`.
4. Create and install the SDP offer locally.
5. Send that SDP as `application/sdp` to the backend-returned `calls_url`:

```http
POST https://api.openai.com/v1/realtime/calls
Authorization: Bearer <client_secret.value>
Content-Type: application/sdp
```

6. Install OpenAI's SDP response as the remote description.

The iOS app must use the ephemeral `client_secret.value`, never the standard OpenAI API key. The F2 backend is not in the media path.

## Audio Routing And Media

Feynd configures `AVAudioSession` before creating the connection:

- category: `.playAndRecord`
- mode: `.voiceChat`
- options: `.defaultToSpeaker`, `.allowBluetoothHFP`

This keeps voice-processing behavior and Bluetooth headset input/output routing enabled. The client logs route changes, sample rate, I/O buffer duration, and output latency with the `F2_REALTIME_AUDIO_ROUTE` prefix for device debugging. Once connected, it also samples WebRTC inbound-audio and selected-candidate statistics every 10 seconds under `F2_REALTIME_STATS`, including packet loss, jitter, concealed samples, jitter-buffer counters, and round-trip time.

WebRTC owns audio capture, encoding, jitter handling, packet-loss recovery, and remote playback. The app no longer:

- installs an `AVAudioEngine` microphone tap;
- sends `input_audio_buffer.append` base64 PCM events;
- receives or queues `response.audio.delta` audio payloads;
- creates an `AVAudioPlayer` per delta.

`semantic_vad` remains configured server-side, so turns and response generation do not require manual audio-buffer commits in the iOS client.

## Event Data Channel

Non-media Realtime events flow through the `oai-events` data channel as UTF-8 JSON. `RealtimeVoiceClient` currently handles:

- `response.created` and `response.done` for UI status;
- `conversation.item.input_audio_transcription.completed`;
- `response.audio_transcript.done` and `response.output_audio_transcript.done`;
- `response.function_call_arguments.done` and function-call `response.output_item.done`;
- `error`.

Function output still uses `conversation.item.create` with `type: "function_call_output"` followed by `response.create`; only the transport changed from WebSocket frames to data-channel messages.

## Transcripts

Input transcription is enabled in the session config:

```json
{
  "audio": {
    "input": {
      "transcription": {
        "model": "gpt-realtime-whisper",
        "language": "en"
      }
    }
  }
}
```

The iOS client currently listens for:

- `conversation.item.input_audio_transcription.completed`
- `response.audio_transcript.done`
- `response.output_audio_transcript.done`

User transcript event shape:

```json
{
  "type": "conversation.item.input_audio_transcription.completed",
  "transcript": "..."
}
```

Assistant transcript event shape:

```json
{
  "type": "response.audio_transcript.done",
  "transcript": "..."
}
```

The client stores transcript turns locally during the session:

```json
[
  {
    "role": "user",
    "text": "...",
    "created_at": "2026-05-23T23:44:00Z"
  },
  {
    "role": "assistant",
    "text": "...",
    "created_at": "2026-05-23T23:44:10Z"
  }
]
```

On stop, the client sends this transcript to the backend persistence endpoint.

## Tool Calling

Current tool declaration:

```json
{
  "type": "function",
  "name": "get_topic_context",
  "description": "Fetch source-grounded context for the current F2 topic. Use before making specific claims about saved topic content.",
  "parameters": {
    "type": "object",
    "properties": {
      "thread_id": { "type": "string" },
      "query": { "type": "string" }
    },
    "required": ["thread_id", "query"],
    "additionalProperties": false
  }
}
```

The iOS client watches for both:

- `response.function_call_arguments.done`
- `response.output_item.done` with `item.type == "function_call"`

Function call event shape handled by iOS:

```json
{
  "type": "response.function_call_arguments.done",
  "call_id": "call_...",
  "name": "get_topic_context",
  "arguments": "{\"thread_id\":\"...\",\"query\":\"...\"}"
}
```

Alternative item-done shape handled by iOS:

```json
{
  "type": "response.output_item.done",
  "item": {
    "type": "function_call",
    "call_id": "call_...",
    "name": "get_topic_context",
    "arguments": "{\"thread_id\":\"...\",\"query\":\"...\"}"
  }
}
```

The iOS client de-duplicates by `call_id` because both event styles may appear in some flows.

## F2 Tool Endpoint

Endpoint:

```http
POST /api/f2/realtime/tool
Content-Type: application/json
Cookie: f2_session=...
```

Request:

```json
{
  "name": "get_topic_context",
  "arguments": {
    "thread_id": "thread uuid",
    "query": "what did this article say about..."
  }
}
```

Response:

```json
{
  "result": {
    "thread_id": "thread uuid",
    "topic": "Topic title",
    "url": "https://example.com/source",
    "quiz_count": 0,
    "last_quizzed_at": null,
    "recent_messages": [],
    "context": "bounded source-grounded excerpt..."
  }
}
```

Security rule: all tool handlers must derive `user_id` from the authenticated F2 session. Never accept `user_id` from the model, the iOS app, or tool arguments. Every database lookup must include `user_id`. Never trust `thread_id` by itself.

Current backend enforcement:

- `POST /api/f2/realtime/tool` calls `getSessionUser()`.
- `getTopicContext` calls `getThreadById(userId, threadId)`.
- If the thread is not visible for that user, the tool returns 404.

## Sending Tool Output Back To OpenAI

After iOS receives the backend tool response, it sends:

```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "function_call_output",
    "call_id": "call_...",
    "output": "{\"result\":{\"thread_id\":\"...\",\"context\":\"...\"}}"
  }
}
```

Then it asks the model to continue:

```json
{
  "type": "response.create"
}
```

The `output` field is a string. The current client serializes the whole backend JSON response into that string.

## Session Finish Endpoint

Endpoint:

```http
PATCH /api/f2/realtime/session/:id
Content-Type: application/json
Cookie: f2_session=...
```

Request:

```json
{
  "transcript": [
    {
      "role": "user",
      "text": "What is this topic about?",
      "created_at": "2026-05-23T23:44:00Z"
    }
  ],
  "summary": "Voice session with 8 transcribed turns.",
  "usage": null
}
```

The backend updates `f2_voice_sessions` only where both:

- `id == :id`
- `user_id == authenticated user id`

## Database

Migration:

```text
apps/f2/schema/007_f2_voice_sessions.sql
```

Table:

```sql
f2_voice_sessions (
  id uuid primary key,
  user_id uuid not null references f2_users(id),
  thread_id uuid null references f2_threads(id),
  mode text not null,
  realtime_session_id text null,
  realtime_model text null,
  realtime_voice text null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  transcript jsonb null,
  summary text null,
  usage jsonb null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)
```

The transcript JSON is the canonical session record. Do not add a normal per-turn `record_voice_turn` model tool unless the architecture changes; it duplicates the session transcript and lets the model influence persistence too much.

## iOS Environment Switching

`apps/feynd/Feynd/Secrets.swift` controls backend routing:

```swift
enum Environment {
    case dev
    case production
}

static let environment: Environment = .dev
static let devURL = URL(string: "https://bart-imac.tunn3l.sh")!
```

For production builds, set:

```swift
static let environment: Environment = .production
```

The production backend URL is `https://feynd.cc`.

If a device still gets HTML 404 responses from Vercel, check whether the installed app was built with `.production` while testing branch-only routes, or whether production has not been deployed with the Realtime API routes.

## Error Handling

The app should show concise errors, not raw HTML. `F2API.errorMessage(from:response:)` attempts to:

- return JSON `error` messages when present;
- replace HTML 404 pages with "The F2 voice endpoint is not available on this server.";
- truncate plain text errors.

If the voice UI shows raw `<!DOCTYPE html>`, error handling has regressed or the installed app predates the error-message cleanup.

## Production Backend Requirements

Vercel:

- Deploy the API route files above.
- Configure `OPENAI_API_KEY`.
- Configure optional `OPENAI_REALTIME_*` variables.
- Keep routes on `runtime = 'nodejs'`.

Supabase:

- Apply `apps/f2/schema/007_f2_voice_sessions.sql`.
- Confirm row-level security policies match existing F2 user access expectations.

OpenAI:

- The standard API key stays server-side only.
- iOS receives only ephemeral client secrets.

## Implemented WebRTC Boundary

OpenAI recommends WebRTC for mobile/client voice, and the iPhone app now uses it. The backend contract has not changed:

1. `POST /api/f2/realtime/session` remains responsible for authentication, session configuration, persistence setup, and minting the ephemeral client secret.
2. iOS performs the SDP exchange directly with OpenAI and carries audio only over the WebRTC media connection.
3. The `oai-events` data channel carries the same JSON event and function-call messages used by the Realtime API.
4. `POST /api/f2/realtime/tool` and transcript persistence remain authenticated F2 backend operations.

The old raw WebSocket/manual PCM player is not a supported iOS fallback. Reintroducing it would also reintroduce the playback discontinuities that motivated this transport change.

## Sideband Upgrade Path

OpenAI's server-side controls docs describe a sideband connection where both the user client and application server connect to the same Realtime session. That would let the backend handle tool calls directly and keep tool orchestration out of iOS.

Do not implement sideband inside Vercel serverless functions. Vercel serverless functions are not the right place to hold persistent Realtime WebSocket connections. Use a durable service such as Fly.io, Render, a long-running Node process, or another runtime designed for long-lived sockets.

Sideband is worth considering when:

- voice becomes core product surface;
- tool catalog expands beyond `get_topic_context`;
- auditability and server-owned tool execution become more important than MVP speed;
- cross-device or web/iOS voice behavior needs to be identical.

## Testing Checklist

Backend:

```bash
npx tsc --noEmit
npm run build
curl -i http://localhost:3000/api/f2/realtime/session
```

Authenticated session smoke test:

```bash
tmp_cookie=$(mktemp /tmp/f2-voice-cookies.XXXXXX)
curl -sS -c "$tmp_cookie" \
  -H 'content-type: application/json' \
  -d '{"username":"bart","password":"<password>"}' \
  http://localhost:3000/api/f2/auth/login

curl -sS -b "$tmp_cookie" \
  -H 'content-type: application/json' \
  -d '{"mode":"global"}' \
  http://localhost:3000/api/f2/realtime/session

rm -f "$tmp_cookie"
```

Do not paste real secrets or full ephemeral keys into logs or PR comments.

iOS:

```bash
xcodegen generate
xcodebuild \
  -project apps/feynd/Feynd.xcodeproj \
  -scheme Feynd \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/Feynd-RT2-DerivedData \
  build
```

Device test:

- Confirm app is built with the intended `Secrets.environment`.
- Confirm `NSMicrophoneUsageDescription` exists.
- Confirm mic permission prompt appears.
- Confirm voice session creates through the selected backend.
- Confirm OpenAI WebRTC connection and `oai-events` data channel open.
- With AirPods connected, confirm the `F2_REALTIME_AUDIO_ROUTE` log reports a Bluetooth headset route.
- Confirm speaking generates transcript events.
- Confirm `get_topic_context` works in topic mode.
- Confirm stopping the session writes `f2_voice_sessions.ended_at` and `transcript`.

## Common Failure Modes

Raw HTML 404 in the app:

- The app is pointed at a backend without the Realtime routes.
- The installed app was not rebuilt after `Secrets.swift` changed.
- A Vercel deployment does not include the branch routes yet.

401 from F2 backend:

- The app does not have a valid `f2_session` cookie for that backend host.
- Dev/prod host changed, so cookies from the other host do not apply.

OpenAI 400 from `client_secrets`:

- The request body shape is wrong.
- Session config was sent at the top level instead of under `session`.
- A model, voice, transcription model, or config field is not available for the account/API version.

OpenAI SDP exchange failure:

- The client secret expired before the app POSTed its SDP offer to `calls_url`.
- The call endpoint or token contract changed; check the official WebRTC guide before altering the app protocol.
- The native WebRTC offer did not advertise a compatible audio media track.

No audio output:

- OpenAI event names changed.
- PCM format assumptions changed.
- `AVAudioSession` is not active or routed incorrectly.
- The WAV-per-delta MVP playback is too fragile; use a continuous queue.

Tool calls loop or duplicate:

- Ensure tool call ids are de-duplicated.
- Ensure `function_call_output` includes the exact `call_id`.
- Ensure `response.create` is sent after tool output.

Wrong user's data:

- This is a security bug. Check every tool path derives `user_id` from `getSessionUser()` and passes it into every DB query.
