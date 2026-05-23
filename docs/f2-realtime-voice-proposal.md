# F2 / Feynd Realtime Voice Proposal

Date: 2026-05-23

Audience: Claude Code agent responsible for the overall F2/Feynd architecture.

## Summary

Add a native voice conversation mode to the Feynd iPhone app using OpenAI `gpt-realtime-2` over WebRTC, while keeping all F2 data access, topic retrieval, tool execution, and persistence behind the existing F2 backend.

The user experience should feel like talking to F2 about anything Bart has saved: URLs, pasted text, topic chats, quiz history, and future F2 sources. The technical design should not dump the whole database into a Realtime session. Use retrieval and server-side tools so the model pulls only the topic context it needs.

## Current Codebase Context

Relevant paths:

- `apps/feynd/`: SwiftUI iPhone app.
- `apps/feynd/Feynd/F2API.swift`: Existing authenticated HTTP client.
- `apps/feynd/Feynd/ChatView.swift`: Global text chat UI.
- `apps/feynd/Feynd/TopicDetailView.swift`: Per-topic text chat and quiz UI.
- `apps/feynd/Feynd/TopicsView.swift`: Topic list.
- `src/app/api/f2/*`: Existing Next.js API routes.
- `src/lib/f2/agent.ts`: Shared F2 message entrypoint for web/iMessage/iOS/SMS.
- `src/lib/f2/chat.ts`: Current Claude-based text routing.
- `src/lib/f2/threads.ts`: Supabase access for `f2_threads`.
- `apps/f2/schema/*.sql`: F2 Supabase migrations.
- `apps/f2/CLAUDE.md`: Required project context and operating rules.

Current F2 shape:

- Threads live in `f2_threads`.
- Threads can be URL-backed or topic-only.
- Thread data includes `user_id`, `client`, `handle`, `url`, `topic`, `content`, `messages`, `quiz_count`, and `last_quizzed_at`.
- The iPhone app already uses cookie-backed auth via the existing `f2_session` cookie.
- Text chat currently routes through `/api/f2/messages` and then `processMessage()`.

## Product Goal

Add voice mode in two places:

1. Global voice chat: talk to F2 across the full learning archive.
2. Topic voice chat: talk about one selected topic with that topic as the default context.

The assistant should support:

- Natural back-and-forth voice conversation.
- Topic lookup across saved F2 content.
- Deep discussion of URL/paste content already stored in Supabase.
- Switching topics by voice.
- Quiz mode by voice.
- Durable transcript and summary persistence back into F2.

## OpenAI Realtime Guidance To Use

Use OpenAI `gpt-realtime-2`, released in May 2026 for the Realtime API.

Prefer WebRTC for the iPhone client. OpenAI's current Realtime docs recommend WebRTC for client/mobile-style interactions, with WebSockets more appropriate for server-side middle tiers.

Keep private application logic on the server:

- Do not put OpenAI standard API keys in the iPhone app.
- Do not give the client direct Supabase service access.
- Do not expose arbitrary database tools client-side.
- Use authenticated backend endpoints to mint Realtime credentials or proxy SDP session creation.

OpenAI supports server-side controls / sideband connections for Realtime sessions. That is the cleanest long-term design for private tools, but it may require a durable Node service because the current F2 backend appears to be a Next.js/Vercel-style app.

## Recommended Architecture

### High-Level Flow

1. User taps Voice in the iPhone app.
2. iPhone asks F2 backend to start a Realtime session.
3. Backend authenticates the existing `f2_session` cookie.
4. Backend creates a Realtime session for `gpt-realtime-2`.
5. iPhone establishes a WebRTC audio connection to OpenAI.
6. Realtime model speaks directly with the user.
7. Model requests F2 context through tools.
8. Tool calls are fulfilled by the F2 backend, not by direct database access from the app.
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

Response shape depends on chosen connection method:

- MVP: return an ephemeral OpenAI Realtime client secret and the initial session config.
- Alternative: accept the client's SDP offer and return the OpenAI SDP answer through the unified `/v1/realtime/calls` flow.

Use the existing session cookie auth from `src/lib/f2/auth.ts`.

Recommended model config:

```json
{
  "type": "realtime",
  "model": "gpt-realtime-2",
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
  }
}
```

Voice can be changed before first audio output. After the model emits audio, OpenAI sessions do not allow changing the voice for that session.

### iPhone App

Add files under `apps/feynd/Feynd/`:

- `VoiceSessionView.swift`
- `RealtimeVoiceClient.swift`
- `VoiceSessionState.swift` if state gets non-trivial

Add UI entry points:

- `ChatView.swift`: toolbar or composer-adjacent microphone button for global voice.
- `TopicDetailView.swift`: microphone button near "Quiz me" for topic-scoped voice.

Implementation notes:

- Use native WebRTC if available in the project, or add the smallest viable dependency for iOS WebRTC.
- Reuse `F2API.swift` auth/cookie behavior for the session bootstrap endpoint.
- Show a simple state machine: connecting, listening, speaking, muted, reconnecting, ended.
- Include explicit mute/end controls.
- Capture server events over the WebRTC data channel for transcripts, tool status, and error reporting.

## Context Strategy

Do not load every F2 thread into the Realtime prompt.

Use three layers:

1. Session instructions: stable F2 behavior, voice style, and tool policy.
2. Small initial context: current topic title, URL, quiz count, recent messages, and a compact archive summary.
3. Retrieval tools: fetch relevant chunks as the conversation needs them.

### Initial Prompt Shape

Global mode:

- "You are F2, Bart's learning companion."
- "You can discuss any saved topic, but you must use tools to retrieve specific saved material."
- Include a short list of recent topics: title, id, last updated, quiz count.

Topic mode:

- Same F2 identity.
- Include selected thread id, title/topic, URL, quiz count, last quizzed date.
- Include recent thread messages.
- Include a small source summary if available.
- Use tools for deeper source text instead of assuming full context.

## Retrieval Layer

Add a chunk/index table:

```sql
create table if not exists f2_topic_chunks (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references f2_threads(id) on delete cascade,
  user_id uuid not null references f2_users(id) on delete cascade,
  chunk_index integer not null,
  text text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector,
  created_at timestamptz not null default now(),
  unique(thread_id, chunk_index)
);
```

If `pgvector` is not enabled in the Supabase project, add it as a migration before the table. Use the current preferred OpenAI embedding model at implementation time.

Chunk sources:

- `f2_threads.content`
- Longer `messages` histories when useful
- Future uploaded files/transcripts if F2 adds them

Add backend helpers:

- `src/lib/f2/chunks.ts`
- `src/lib/f2/retrieval.ts`

Core functions:

- `ensureThreadChunks(threadId)`
- `searchUserTopics(userId, query, limit)`
- `getThreadContext(userId, threadId, query?, limit?)`

For MVP, retrieval can start with Postgres full-text search or simple text search. For the real version, use vector search.

## Tool Design

Expose only narrow, user-scoped tools to the Realtime model.

Recommended tools:

```text
list_topics(limit?: number)
```

Returns recent topic ids, titles, URLs, timestamps, quiz counts.

```text
search_topics(query: string, limit?: number)
```

Searches across the user's topic titles, source chunks, and maybe recent messages.

```text
get_topic(thread_id: string)
```

Returns title, URL, metadata, summary, and selected source chunks.

```text
get_topic_context(thread_id: string, query: string)
```

Returns the best source chunks for a question about a specific topic.

```text
record_voice_turn(thread_id?: string, user_text: string, assistant_text: string)
```

Persists voice transcripts into the appropriate F2 thread.

```text
quiz_me(thread_id: string)
```

Reuses or mirrors existing quiz behavior from `/api/f2/topics/[id]/quiz`.

```text
create_topic_from_spoken_note(title: string, text: string)
```

Optional later tool for "save this as a topic."

Important: all tool handlers must derive `user_id` from the authenticated session, never from model arguments.

## Sideband vs Client-Mediated Tools

There are two viable designs.

### MVP: Client-Mediated Tool Calls

The iPhone app receives Realtime tool-call events on the data channel, calls authenticated F2 API endpoints, and sends tool outputs back to the Realtime session.

Pros:

- Works with the existing Next.js backend.
- Faster to ship.
- No durable WebSocket worker required.

Cons:

- More app-side orchestration.
- Tool schemas are visible to the client.
- Requires careful validation so the client cannot request cross-user data.

This is acceptable for Bart-only/internal MVP because the backend still enforces auth and user scoping.

### Production: Server Sideband Controller

The iPhone establishes WebRTC with OpenAI. The backend also connects to the same Realtime call over a sideband WebSocket using the call id. The backend observes tool calls, executes tools, updates instructions, and persists transcripts.

Pros:

- Best security boundary.
- Keeps business logic client-agnostic.
- Easier to share voice support across iOS, web, SIP, or future clients.

Cons:

- Needs a durable Node service or runtime that can hold WebSocket connections.
- Vercel serverless may not be the right host for this piece.

Recommendation:

- Build MVP with client-mediated tools.
- Plan a `f2-voice-broker` service if voice becomes central.

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
  created_at timestamptz not null default now()
);
```

At session end:

- Save transcript events.
- Generate a compact summary.
- If topic mode, append a voice-session summary to the thread's `messages`.
- Update `updated_at` for touched thread.

Avoid appending every raw partial transcript into `f2_threads.messages`; that array should stay useful for learning context, not become noisy audio telemetry.

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

## Phased Build Plan

### Phase 1: Topic Voice MVP

Scope:

- Topic-scoped voice only from `TopicDetailView.swift`.
- Realtime session endpoint.
- WebRTC audio connection.
- Initial prompt includes selected topic metadata and a bounded amount of content.
- Persist final transcript summary to the thread.

Do not build full archive search yet.

Validation:

- Start a session from one topic.
- Ask questions about the topic.
- Confirm the assistant answers using the topic context.
- End the session.
- Confirm transcript/summary persisted in Supabase.

### Phase 2: Global Voice + Retrieval

Scope:

- Add global voice from `ChatView.swift`.
- Add chunking and retrieval.
- Add `list_topics`, `search_topics`, and `get_topic_context` tools.
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

Validation:

- Run realistic learning sessions.
- Check cost and latency.
- Check that saved summaries improve later conversations.

## Risks And Decisions

### Vercel / Serverless Runtime

If using server sideband controls, do not assume Vercel serverless can hold the needed WebSocket lifecycle. Verify runtime first. If it is unsuitable, use a separate small Node service.

### Cost

Realtime audio can get expensive in long open sessions. Add:

- visible session timer
- auto-end after inactivity
- max session length
- optional text transcript only after session end

### Context Bloat

Do not overfill the Realtime session with all source text. Use retrieval. Long-lived voice sessions should summarize older turns.

### Provider Split

Text F2 currently uses Claude. Voice should use OpenAI Realtime because this is the best product fit. Do not rewrite the whole text stack just to add voice.

### Security

All tool calls must be scoped by authenticated `user_id`. Never trust `thread_id` alone. Every query should include `user_id`.

## Concrete First PR

The first implementation PR should do only this:

1. Add `POST /api/f2/realtime/session`.
2. Add iOS `VoiceSessionView.swift` and `RealtimeVoiceClient.swift`.
3. Add a microphone button to `TopicDetailView.swift`.
4. Start `gpt-realtime-2` topic-scoped sessions.
5. Persist a session summary or transcript stub.
6. Document manual test steps.

Defer global retrieval until topic voice works end to end.

## References

- OpenAI release: `gpt-realtime-2`, `gpt-realtime-translate`, and `gpt-realtime-whisper` announced May 7, 2026.
- OpenAI Realtime WebRTC docs: client/mobile connections should use WebRTC.
- OpenAI Realtime conversations docs: sessions are stateful, can use `gpt-realtime-2`, and support session updates, audio, image input, and tools.
- OpenAI server-side controls docs: use sideband connections when private tool use and business logic should remain server-side.
