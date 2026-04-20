# LearnAI

First build of the "learn how AI works" iOS app.

**Pattern A** — OpenAI Realtime (`gpt-realtime`) owns the voice UI (WebRTC, VAD, barge-in, audio playback). Substantive questions get routed to Claude Opus 4.7 via a single `ask_opus` tool. The Realtime model speaks the tool result back to the user.

## Key storage

The OpenAI and Anthropic keys live on the **hilma backend**, not in the app.

**Backend env vars** (in hilma `.env.local` and Vercel project settings):
- `OPENAI_API_KEY` — already set
- `ANTHROPIC_API_KEY` — already set
- `LEARNAI_SHARED_SECRET` — bearer shared with the iOS app (set locally; add to Vercel before prod deploy)

**App secrets** (in `LearnAI/Secrets.swift`, gitignored):
- `backendBaseURL` — `https://hilma-nine.vercel.app` (or your tunn3l subdomain for local dev)
- `backendSecret` — matches `LEARNAI_SHARED_SECRET`

**Backend endpoints** (under `src/app/api/learnai/` in hilma):
- `POST /api/learnai/realtime-session` — mints ephemeral OpenAI Realtime `ek_…`
- `POST /api/learnai/opus-answer` — proxies Anthropic Messages to `claude-opus-4-7`

Both endpoints require the `x-learnai-secret` header.

## One-time setup

1. Install xcodegen: `brew install xcodegen`.
2. Copy `Secrets.swift.example` → `Secrets.swift` and fill in `backendSecret`.
3. Generate the Xcode project:
   ```bash
   cd apps/LearnAI
   xcodegen
   open LearnAI.xcodeproj
   ```
4. First build: Xcode resolves Swift packages (LiveKit WebRTC, MetaCodable, swift-realtime-openai). Approve the MetaCodable macro when prompted.
5. Run on a real device for best mic behavior; Simulator works but audio routing is flaky.

## Files

| File | Role |
|------|------|
| `LearnAIApp.swift` | `@main` entry |
| `ContentView.swift` | Big record-orb UI, transcript log |
| `RealtimeSession.swift` | Wraps `Conversation`, registers `ask_opus` tool, dispatches function calls to Opus |
| `AnthropicClient.swift` | Minimal Messages API client for `claude-opus-4-7` |
| `OpenAIClient.swift` | Mints an ephemeral Realtime client_secret from the standard API key |
| `Secrets.swift` | API keys (gitignored) |

## How a turn flows

1. User taps the orb to unmute, speaks.
2. Realtime API detects speech via server VAD.
3. If the question is chatty → model replies directly in voice.
4. If substantive → model calls `ask_opus(question: …)`. Typically says a short filler ("let me think…") first.
5. `RealtimeSession` sees the function call in `conversation.entries`, POSTs to Anthropic Messages API.
6. Opus returns a plain-prose answer (no markdown, designed to be spoken).
7. `RealtimeSession` submits `function_call_output` and triggers a new response. Realtime voices Opus's answer.
8. Barge-in works automatically via WebRTC.

## TODO

- Add `LEARNAI_SHARED_SECRET` to Vercel env before the first prod deploy that uses these routes.
- Rotate `backendSecret` via an auth flow (signed user identity) instead of a shared constant before any public release.
- Swap the 150ms entry-polling loop in `RealtimeSession.observeFunctionCalls` for direct server-event subscription via the lower-level `RealtimeAPI` class.
- Stream Opus tokens (speak as they arrive) instead of waiting for the full answer.
- Add real web-search and YouTube tools (currently only `ask_opus`).
- Handle expired ephemeral keys (10-min TTL; long idle sessions go dead).
