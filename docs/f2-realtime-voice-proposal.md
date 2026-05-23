# F2 / Feynd Realtime Voice Proposal

Date: 2026-05-23

Audience: Claude Code agent responsible for the overall F2/Feynd architecture.

## Summary

Add a native voice conversation mode to the Feynd iPhone app using OpenAI Realtime over WebRTC, while keeping all F2 data access, topic retrieval, tool execution, and persistence behind the existing F2 backend.

The user experience should feel like talking to F2 about anything Bart has saved: URLs, pasted text, topic chats, quiz history, and future F2 sources. The technical design **must not** dump the whole database into a Realtime session. Use retrieval and server-side tools so the model pulls only the topic context it needs.

As of 2026-05-23, official OpenAI docs list `gpt-realtime-2` as the current reasoning model for realtime voice interactions. Do not hardcode that string in Swift. Keep the model and voice configurable from the backend environment.

## Concrete First PR

Build topic-scoped voice first. Do not start with global archive search.

1. Add `POST /api/f2/realtime/session`.
2. Backend authenticates the existing `f2_session` cookie.
3. Backend mints a Realtime client secret or proxies the SDP offer using OpenAI's documented WebRTC flow.
4. Add `VoiceSessionView.swift` and `RealtimeVoiceClient.swift` to `apps/feynd/Feynd/`.
5. Add a microphone button to `TopicDetailView.swift`.
6. Use `gpt-realtime-2` by backend config, not a Swift magic string.
7. Use only one Phase 1 tool: `get_topic_context`.
8. Persist one voice session transcript/summary in `f2_voice_sessions`.
9. Add `NSMicrophoneUsageDescription`.
10. Reuse the archived voice app's state machine and audio-session setup where possible.
11. Document manual test steps and actual OpenAI usage/cost from at least one test session.

Defer global voice, vector search, broad tool catalogs, and sideband control until topic voice works end to end.

## Current Codebase Context

Relevant paths:

- `apps/feynd/`: current SwiftUI iPhone app.
- `apps/feynd/Feynd/F2API.swift`: existing authenticated HTTP client.
- `apps/feynd/Feynd/ChatView.swift`: global text chat UI.
- `apps/feynd/Feynd/TopicDetailView.swift`: per-topic text chat and quiz UI.
- `apps/feynd/Feynd/TopicsView.swift`: topic list.
- `apps/feynd-voice-archive/`: archived voice-tutor app to mine for UI and audio plumbing.
- `apps/feynd-voice-archive/Feynd/RealtimeClient.swift`: old WebSocket Realtime client with useful `AVAudioSession`, capture, playback, transcript, and state-machine code.
- `apps/feynd-voice-archive/Feynd/VoiceSessionView.swift`: reusable voice-mode UI shell.
- `apps/feynd-voice-archive/Feynd/TTSPlayer.swift`: audio playback patterns.
- `apps/feynd-voice-archive/Feynd/Info.plist`: old `NSMicrophoneUsageDescription` string.
- `src/app/api/f2/*`: existing Next.js API routes.
- `src/lib/f2/agent.ts`: shared F2 message entrypoint for web/iMessage/iOS/SMS.
- `src/lib/f2/chat.ts`: current Claude-based text routing.
- `src/lib/f2/threads.ts`: Supabase access for `f2_threads`.
- `apps/f2/schema/*.sql`: F2 Supabase migrations.
- `apps/f2/CLAUDE.md`: required project context and operating rules.

Current F2 shape:

- Threads live in `f2_threads`.
- Threads can be URL-backed or topic-only.
- Thread data includes `user_id`, `client`, `handle`, `url`, `topic`, `content`, `messages`, `quiz_count`, and `last_quizzed_at`.
- The iPhone app already uses cookie-backed auth via the existing `f2_session` cookie.
- Text chat currently routes through `/api/f2/messages` and then `processMessage()`.

## OpenAI Realtime Grounding

This proposal is grounded in the official OpenAI docs as of 2026-05-23:

- Model page: `gpt-realtime-2` is described as OpenAI's most capable realtime voice model, with text/audio/image input, text/audio output, function calling, configurable reasoning effort, 128K context, and audio token pricing.
- WebRTC guide: OpenAI recommends WebRTC rather than WebSockets when connecting from a client such as a browser or mobile device.
- WebRTC guide: two connection patterns are documented:
  - Unified interface: backend sends SDP plus session config to `/v1/realtime/calls` using the standard API key and returns the SDP answer.
  - Ephemeral token: backend calls `/v1/realtime/client_secrets`, returns `client_secret.value`, and the client uses that ephemeral key when posting its SDP offer to `/v1/realtime/calls`.
- Client secrets API reference: Realtime client secrets are short-lived, are intended for client environments, and can carry a session configuration.
- Server-side controls guide: sideband connections let the user client and application server connect to the same Realtime session; the server connection can monitor the session, update instructions, and respond to tool calls.
- Realtime session schema: `tools`, `tool_choice`, and `reasoning` are part of the current session configuration. `reasoning` applies to reasoning-capable Realtime models such as `gpt-realtime-2`.

Implementation-time rule:

**Before coding against OpenAI, re-open the live OpenAI docs for Realtime WebRTC, client secrets, session config, model page, and server-side controls. Realtime schema has changed before; treat the docs as source of truth.**

## Product Goal

Add voice mode in two places:

1. Topic voice chat: talk about one selected topic with that topic as the default context.
2. Global voice chat: talk to F2 across the full learning archive.

The assistant should support:

- Natural back-and-forth voice conversation.
- Deep discussion of URL/paste content already stored in Supabase.
- Topic lookup across saved F2 content.
- Switching topics by voice.
- Quiz mode by voice.
- Durable transcript and summary persistence back into F2.

## Recommended Architecture

### High-Level Flow

1. User taps Voice in the iPhone app.
2. iPhone asks F2 backend to start a Realtime session.
3. Backend authenticates the existing `f2_session` cookie.
4. Backend creates or configures a Realtime session.
5. iPhone establishes a WebRTC audio connection.
6. Realtime model speaks directly with the user.
7. Model requests F2 context through tools.
8. Tool calls are fulfilled by authenticated F2 API routes, not by direct database access from the app.
9. At the end of the session, transcripts and a compact summary are saved back to F2.

### Backend Session Endpoint

Add:

```text
POST /api/f2/realtime/session
```

Request shape:

```json
{
  "mode": "global" | "topic",
  "thread_id": "optional uuid for topic mode"
}
```

Use the existing session cookie auth from `src/lib/f2/auth.ts`.

Recommended config source:

- `OPENAI_REALTIME_MODEL=gpt-realtime-2`
- `OPENAI_REALTIME_VOICE=marin`
- `OPENAI_REALTIME_REASONING_EFFORT=low`

Do not put these in `Secrets.swift` unless the backend sends them as inert display/debug data. The backend owns the actual OpenAI session config.

### Preferred Connection Flow For Phase 1

Use the ephemeral token flow unless implementation testing shows the unified SDP proxy is easier on iOS:

1. iOS calls `POST /api/f2/realtime/session`.
2. Backend builds the full session config, including model, voice, instructions, tool declarations, and optional reasoning config.
3. Backend calls `POST https://api.openai.com/v1/realtime/client_secrets` with the standard OpenAI API key.
4. Backend returns `client_secret.value` plus any F2-specific session id to iOS.
5. iOS creates a WebRTC offer.
6. iOS posts the SDP offer to `https://api.openai.com/v1/realtime/calls` with `Authorization: Bearer <client_secret.value>` and `Content-Type: application/sdp`.
7. iOS sets the returned SDP answer as the remote description.
8. iOS opens the `oai-events` data channel for Realtime events and tool-call orchestration.

Note: OpenAI's client secret default TTL is short; the API reference currently documents one minute for default client-secret expiration, with optional `expires_after` configuration. The iOS app should create the WebRTC session immediately after receiving the secret.

Alternative:

- Use the unified interface where iOS posts SDP to F2, and F2 posts multipart `sdp` + `session` to `/v1/realtime/calls` with the standard API key. This keeps OpenAI call initialization entirely backend-mediated but puts F2 in the critical path for session startup.

### Session Config Sketch

This is illustrative, not a copy-paste contract. Verify exact schema at implementation time.

```json
{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-2",
    "instructions": "You are F2, Bart's learning companion...",
    "output_modalities": ["audio"],
    "audio": {
      "input": {
        "turn_detection": {
          "type": "semantic_vad"
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
    "tools": []
  }
}
```

Voice guidance:

- OpenAI examples currently use `marin`, and release/docs mention new voices such as `marin` and `cedar`.
- Keep voice in backend config.
- If `marin` is unavailable in the target account/model, fall back to a documented available voice after checking live docs.

## iOS Implementation Details

### WebRTC Dependency

iOS does not provide a public native WebRTC framework for app use. WKWebView JavaScript WebRTC is the wrong tool for this feature.

Use this decision order:

1. Check whether OpenAI has shipped an official iOS Realtime SDK by implementation time. If it exists and supports `gpt-realtime-2`, WebRTC audio, data-channel events, and tool-call handling, prefer it.
2. Otherwise use `stasel/WebRTC`, the maintained Swift Package wrapping Google's WebRTC. Expect a large binary dependency; this is acceptable for a real voice feature.

Do not reuse the archived app's raw WebSocket transport. It is useful for audio plumbing and UX, but the new transport should be WebRTC.

### Audio Plumbing

Add `NSMicrophoneUsageDescription` back to `apps/feynd/Feynd/Info.plist`, for example:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Feynd uses the microphone so you can talk with your learning assistant.</string>
```

Configure `AVAudioSession` before starting WebRTC capture:

- category: `.playAndRecord`
- mode: `.voiceChat`
- options: `.defaultToSpeaker`, `.allowBluetoothHFP`, and any AirPlay/Bluetooth options supported by the chosen WebRTC stack and iOS target
- activate with `.notifyOthersOnDeactivation`

The archived `apps/feynd-voice-archive/Feynd/RealtimeClient.swift` already contains a working `AVAudioSession` setup, mic permission flow, capture state, playback state, and transcript callbacks. Reuse the concepts, but update the mode to `.voiceChat` and adapt transport to WebRTC.

### Reuse From Archive

Mine these files before writing new UI or audio code:

- `apps/feynd-voice-archive/Feynd/VoiceSessionView.swift`: voice sheet structure, state-driven labels, orb interaction, permission handling.
- `apps/feynd-voice-archive/Feynd/RealtimeClient.swift`: phase enum, audio session setup, transcript callback pattern, lifecycle cleanup.
- `apps/feynd-voice-archive/Feynd/TTSPlayer.swift`: playback patterns if any local playback remains necessary.
- `apps/feynd-voice-archive/Feynd/Info.plist`: microphone permission wording.

Expected new files:

- `apps/feynd/Feynd/VoiceSessionView.swift`
- `apps/feynd/Feynd/RealtimeVoiceClient.swift`
- `apps/feynd/Feynd/VoiceSessionState.swift` if state gets non-trivial

Add UI entry points:

- Phase 1: `TopicDetailView.swift`, microphone button near "Quiz me".
- Phase 2: `ChatView.swift`, toolbar or composer-adjacent microphone button for global voice.

## Context Strategy

Do not load every F2 thread into the Realtime prompt.

Use three layers:

1. Session instructions: stable F2 behavior, voice style, and tool policy.
2. Small initial context: current topic title, URL, quiz count, recent messages, and a compact source summary.
3. Retrieval tools: fetch relevant chunks as the conversation needs them.

Topic mode initial context:

- F2 identity.
- Selected thread id, title/topic, URL, quiz count, last quizzed date.
- Recent thread messages.
- Small source summary or first bounded slice of source content for Phase 1 only.
- Tool instruction: use `get_topic_context` for deeper source text.

Global mode initial context:

- F2 identity.
- Short recent-topic list only: title, id, last updated, quiz count.
- Tool instruction: search before making claims about saved material.

## Retrieval Layer

Phase 1 can use bounded direct thread context and one topic-context tool. Phase 2 should add chunked retrieval.

Add pgvector in a separate migration:

```sql
create extension if not exists vector;
```

Use `text-embedding-3-small` initially and store `vector(1536)`. It is cheaper and good enough for F2's first retrieval pass. If accuracy is poor, migrate to `text-embedding-3-large` with `vector(3072)`.

Add a chunk/index table:

```sql
create table if not exists f2_topic_chunks (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references f2_threads(id) on delete cascade,
  user_id uuid not null references f2_users(id) on delete cascade,
  chunk_index integer not null,
  text text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique(thread_id, chunk_index)
);
```

Add a vector index after real data volume justifies it. For a tiny Bart-only corpus, correctness and simplicity matter more than index tuning.

Chunk sources:

- `f2_threads.content`
- Longer `messages` histories when useful
- Voice session summaries
- Future uploaded files/transcripts if F2 adds them

Add backend helpers:

- `src/lib/f2/chunks.ts`
- `src/lib/f2/retrieval.ts`

Core functions:

- `ensureThreadChunks(userId, threadId)`
- `searchUserTopics(userId, query, limit)`
- `getThreadContext(userId, threadId, query?, limit?)`

## Tool Design

Expose only narrow, user-scoped tools to the Realtime model.

**Critical security rule: every tool handler must derive `user_id` from the authenticated F2 session or server-side voice session, never from model arguments. Every database query must include `user_id`. Never trust `thread_id` alone.**

### Phase 1 Tool

Only expose:

```text
get_topic_context(thread_id: string, query: string)
```

Behavior:

- Verify `thread_id` belongs to authenticated `user_id`.
- Return topic title, URL, quiz metadata, recent useful messages, and bounded source text/chunks relevant to `query`.
- If retrieval is not built yet, return a bounded slice of `f2_threads.content` plus recent messages.

### Phase 2 Tools

Add only after Phase 1 works:

```text
list_topics(limit?: number)
```

```text
search_topics(query: string, limit?: number)
```

```text
get_topic(thread_id: string)
```

```text
quiz_me(thread_id: string)
```

```text
create_topic_from_spoken_note(title: string, text: string)
```

Do not add `record_voice_turn` as a normal per-turn model tool. The canonical transcript belongs in `f2_voice_sessions.transcript`; save it from session events or app/backend lifecycle code. A later optional tool can be `mark_important_takeaway(...)` if the model needs to deliberately flag a learning insight during a session.

## Vercel Decision Point

F2 is a Next.js app deployed on Vercel.

Vercel serverless functions are not the right place to hold persistent sideband WebSocket connections to OpenAI. Therefore:

- Phase 1 should use client-mediated tool calls or the unified SDP proxy only for startup.
- Do not plan server-side sideband on Vercel.
- If production voice needs server-side sideband control, create a separate durable service such as `f2-voice-broker` on Fly.io, Render, a long-running Node host, or an appropriate Worker/runtime that supports the required WebSocket lifecycle.

This is a decision, not just a risk. Sideband is architecturally cleaner but out of scope unless we add that durable service.

## Sideband vs Client-Mediated Tools

### MVP: Client-Mediated Tool Calls

The iPhone app receives Realtime tool-call events on the data channel, calls authenticated F2 API endpoints, and sends tool outputs back to the Realtime session.

Pros:

- Works with the existing Next.js/Vercel backend.
- Faster to ship.
- No durable WebSocket worker required.

Cons:

- More app-side orchestration.
- Tool schemas are visible to the client.
- Requires careful validation so the client cannot request cross-user data.

This is acceptable for Bart-only/internal MVP because the backend still enforces auth and user scoping.

### Production: Server Sideband Controller

The iPhone establishes WebRTC with OpenAI. A separate durable backend connects to the same Realtime call over a sideband WebSocket using the call id from the `/v1/realtime/calls` response. The backend observes tool calls, executes tools, updates instructions, and persists transcripts.

Build this only if voice becomes core.

## Persistence

Add session-level persistence so voice conversations become part of the learning system.

Suggested table:

```sql
create table if not exists f2_voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references f2_users(id) on delete cascade,
  thread_id uuid references f2_threads(id) on delete set null,
  mode text not null check (mode in ('global', 'topic')),
  realtime_call_id text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transcript jsonb not null default '[]'::jsonb,
  summary text,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

At session end:

- Save transcript events into `f2_voice_sessions.transcript`.
- Save usage/cost metadata when available.
- Generate a compact summary.
- If topic mode, append one voice-session summary message to `f2_threads.messages`.
- Update `updated_at` for touched thread.

Avoid appending every raw transcript turn into `f2_threads.messages`; that array should stay useful for learning context, not become noisy audio telemetry.

## Prompting Guidance

Realtime voice prompt should be shorter and more conversational than the current text prompt.

Behavior:

- Speak directly.
- Be thoughtful but concise.
- Ask one question at a time.
- Use Socratic teaching when the user is trying to learn.
- Use tools before making claims about saved F2 material.
- If uncertain whether a remembered topic exists, search.
- Do not mention tool names.
- When quizzing, wait for Bart's answer before explaining.
- When switching topics, say the new topic in plain language.

Style:

- No long lectures unless asked.
- Prefer 30-90 second spoken answers.
- Offer to go deeper.
- Voice should feel like a patient learning partner, not a customer support bot.

## Voice Quiz Flow

Voice quiz mode should be explicit, not automatic on every voice session.

Flow:

1. User taps a future "Voice quiz" control or says "quiz me" during topic voice.
2. F2 asks one question about the current topic and then waits.
3. Bart answers by voice.
4. F2 evaluates verbally, gives the correction or reinforcement, then asks whether to continue.
5. Default quiz length is 3 questions; allow "keep going" or "stop quiz."
6. At the end, save quiz count, last quizzed date, and a compact summary of strengths/gaps.

Do not build this in Phase 1 unless topic voice is already stable.

## Phased Build Plan

### Phase 1: Topic Voice MVP

Scope:

- Topic-scoped voice only from `TopicDetailView.swift`.
- Realtime session endpoint.
- WebRTC audio connection.
- One tool: `get_topic_context`.
- Initial prompt includes selected topic metadata and bounded context.
- Persist final transcript and summary to `f2_voice_sessions`.

Validation:

- Start a session from one topic.
- Ask questions about the topic.
- Confirm the assistant answers using the topic context.
- Confirm mic routing works through speaker and Bluetooth headset.
- Interrupt the model and confirm conversation recovers.
- End the session.
- Confirm transcript/summary persisted in Supabase.
- Record actual Realtime usage/cost from the session.

### Phase 2: Global Voice + Retrieval

Scope:

- Add global voice from `ChatView.swift`.
- Add chunking and retrieval.
- Add `list_topics`, `search_topics`, and `get_topic` tools.
- Let the assistant switch between saved topics by voice.

Validation:

- Ask: "What was that article I saved about X?"
- Ask cross-topic synthesis questions.
- Confirm retrieved chunks are relevant.
- Confirm no cross-user data can be fetched.

### Phase 3: Tutor Polish

Scope:

- Voice quiz mode.
- "Explain it back to me" mode.
- Spaced review prompts.
- Session summaries with durable learning notes.
- Optional web voice support reusing the same backend contract.
- Optional `f2-voice-broker` if server-side sideband becomes necessary.

Validation:

- Run realistic learning sessions.
- Check cost and latency.
- Check that saved summaries improve later conversations.

## Cost

Official OpenAI pricing as of 2026-05-23 for `gpt-realtime-2`:

- Text input: $4.00 / 1M tokens.
- Text output: $24.00 / 1M tokens.
- Audio input: $32.00 / 1M audio tokens.
- Audio output: $64.00 / 1M audio tokens.
- Cached input is lower, but do not assume caching will materially reduce early MVP cost.

The official docs and release page price audio by tokens, not by a fixed dollars-per-minute value. Any per-minute estimate must be measured from real usage. For planning, add:

- visible session timer
- auto-end after inactivity
- max session length
- usage capture in `f2_voice_sessions.usage`
- a post-MVP report from 5-minute, 10-minute, and 30-minute test sessions

Do not ship an always-open voice mode without cost guardrails.

## Risks And Decisions

### API Drift

Realtime schema and endpoint examples have changed over time. Verify model name, voice names, `client_secrets` request shape, session config, event names, and tool-call event flow against live OpenAI docs immediately before implementation.

### Context Bloat

Do not overfill the Realtime session with all source text. Use retrieval. Long-lived voice sessions should summarize older turns.

### Provider Split

Text F2 currently uses Claude. Voice should use OpenAI Realtime because this is the best product fit. Do not rewrite the whole text stack just to add voice.

### Security

User scoping belongs on the backend. The model can request `thread_id`; the backend must prove ownership through authenticated `user_id`.

## References

- OpenAI model docs: `https://developers.openai.com/api/docs/models/gpt-realtime-2`
- OpenAI release: `https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/`
- OpenAI Realtime WebRTC docs: `https://developers.openai.com/api/docs/guides/realtime-webrtc`
- OpenAI Realtime conversations docs: `https://developers.openai.com/api/docs/guides/realtime-model-capabilities`
- OpenAI Realtime client secrets API reference: `https://developers.openai.com/api/docs/api-reference/realtime-sessions`
- OpenAI server-side controls docs: `https://developers.openai.com/api/docs/guides/realtime-server-controls`
