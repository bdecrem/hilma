# Polly — Infinity Chat rebuild, Direction 2b: "text as a peer to voice"

Status: **decided 2026-09-19** (Bart). Build spec for Claude Code.
Design pages (read them first, they are the source of truth for the screens):
`public/polly/design/index.html` (diagnosis), `direction-2b.html` (the chosen
direction), `direction-2.html` / `direction-1.html` (rejected, for context).
Open them in a browser from the repo (`open public/polly/design/direction-2b.html`).

## The decision in one paragraph

Voice is the app. The study sheet (`InfinityHomeView`) becomes the screen, not a
sheet over Dodo's chat window. Text chat is a *peer* to voice: wherever there is
a voice button there is a smaller "⌨ or type instead" line under it, which opens
one full-screen text chat about the same thing. That thread has **no modes**:
studied-language text is practice (Polly replies in Italian, ≤1 folded fix);
English is a question (answered) or an instruction (the agent does it, returns a
card), after which Polly resumes the Italian thread. A typed chat is the same
object as a spoken one — same clean-up, words, grammar, quiz, mastery, Peck.

## What goes away

- `TopicDetailView` for `infinity` topics. Topics → `InfinityHomeView` directly (push, not sheet).
- `InfinityChatBar` (the pinned "Study" bar). Delete.
- The star row on Infinity (mastery is per chat). Header subtitle becomes `A1 · 4 chats · 14 words`.
- The chat window under path lessons and guest/immersion lessons (`LessonStepsCard` / `LessonCard` + source card become the screen body).
- The "O✦" model button on these screens (moves to the kebab / Settings).

## What gets built (app, `apps/polly/Polly/`)

1. **`TalkPair(context:)`** — one component: full-width accent voice button + a
   text-link line beneath ("⌨ or type instead" / "or continue by typing").
   Never two equal buttons, never a segmented control. Used on: Infinity home
   hero, a chat page's Continue, immersion/guest-lesson topic ("Parliamone"),
   path lesson Talk step ("Parla con Giulia").
2. **`TextChatView(context:)`** — full-screen cover, one screen for every mode.
   Header: ✕, title, subtitle "⌨ typing · N min", a 🎤 that hands the
   conversation to `VoiceSessionView` with the typed transcript as context.
   Body: the existing message list + composer from `TopicDetailView` (reuse
   bubbles, streaming, tool cards). Composer placeholder in the studied
   language ("Scrivi in italiano…"). Footer line: "Finish & clean up · n fixes
   so far". Context pill at top when there is a source (immersion/guest).
   Also finishes itself after an hour of quiet.
3. **Infinity home** (`InfinityHomeView`) — hero card (mascot, "Parliamo", the
   pair) + **journey rail** of chats, newest first: reuse the node/line drawing
   from `PathList` (`PathViews.swift`). One status line per chat, one action only
   on the chat that needs it (Clean it up / Quiz). Rows carry a 🎤 / ⌨ mark.
4. **`InfinityChatPage`** — a chat's own page: Fixes (compact you-said → try →
   why), Words (chips, tap to flip), Grammar (points → drills), Transcript.
   Footer: `Quiz · master it` / `Quiz again`, then the pair as Continue.
   `InfinityVocabView` / `InfinityGrammarView` become the section drill-ins.
5. **Immersion / guest-lesson topic screen** — source card, lesson card, the
   pair ("Parliamone"), steps row (Cards · Quiz · Quotes), "Your chats about
   this" list (same rail). Chats about a source are Infinity-style chats scoped
   to that topic.
6. **Path lesson screen** — Read-it card, the pair, the three step tiles. No chat.
7. **Peck miss clinic** — "Talk it through with Polly" opens `TextChatView`
   with the card as context (no pair there).
8. **Voice session subtitle** — "TALKING ABOUT · CHAT INFINITA" → the chat's
   title when continuing, else nothing.
9. Marquee strings through `L(...)` as usual (see `LOCALIZATION.md`).

## What gets built (server, `src/lib/polly/`)

- **One chat route, two lanes, no client mode.** In `chat.ts`: classify the turn
  — studied-language text → *practice* prompt (reply in the studied language at
  the learner's level, at most one gentle fix, appended as a short folded note,
  keep the conversation going with a question); English → *agent* (`agent.ts`),
  ≤2 sentences + a card, then a follow-up assistant turn that resumes the
  practice thread with Polly's last question. A leading "Polly, …" forces the
  agent lane. Return the lane on the response so the client can style it.
- **Infinity-aware agent tools:** `list_chats`, `rename_chat`,
  `cards_from_chats(n, focus, chat_ids?)`, `weak_spots(days)` (fixes grouped by
  grammar point). Today the agent has `add_flash_cards` but no notion of an
  Infinity chat — that is why it answered "no titled sources, notes, or
  documents on file".
- **Typed chats are chats.** `POST /api/polly/infinity/chats` accepts a message
  transcript as well as `voice_session_id`; `infinity.ts` clean-up runs on either.
  Add `input: 'voice' | 'text' | 'mixed'` on the row (schema migration in
  `apps/polly/schema/`, applied by hand with `supabase db query --linked -f`).
- **Continue / handoff.** The voice session route takes `continue_chat_id`; its
  finish appends fragments and re-runs clean-up on the delta only. Text → voice
  passes the typed transcript; voice → keyboard (the radio's existing button)
  opens `TextChatView` with the spoken transcript above.
- Source-scoped chats: `thread_id` already scopes an `InfinityChat`; an
  immersion/guest topic just gets the same table.

## Order of work (each step a commit; F2 gates apply — spec the behaviour, then drive it)

1. **Server first, the risky bit:** the no-modes lane classifier + resume
   behaviour. Prove it with `scripts/polly/` a check that sends: Italian → gets
   Italian + ≤1 fix; English question → English answer + Italian resume; English
   instruction → tool call + card + resume; "Polly, …" → agent; a beginner's
   mixed "I went to the… palestra?" → practice, not agent. If this doesn't hold,
   the fallback is a ✦ toggle in the composer — decide then, don't redesign.
2. Infinity-aware tools + typed chats accepted + `input` column.
3. `TalkPair` + `TextChatView` (reusing the chat list/composer).
4. Infinity home + `InfinityChatPage`; routing change; delete the bar.
5. Immersion / guest topic screen; path lesson screen; Peck miss clinic hook.
6. Handoff both ways; voice subtitle.
7. Screenshot set: extend `scripts/polly/shots.sh` with the new screens.

## Verify (Gate 2)

Simulator, throwaway guest (`scripts/polly/shots-seed.mjs`): Topics → Chat
infinita opens the home (no chat window); "type instead" → text chat → Italian
turn → folded fix; English instruction → card; ✕ / Finish → the chat appears in
the journey with ⌨; its page shows fixes/words/grammar; Continue by voice opens
the radio with context; the guest lesson (Lo Scandaloso) shows the pair and no
composer; a path lesson shows the pair and no composer. `xcodebuild` must
succeed for the simulator and `generic/platform=iOS`; run `./apps/polly/bump-build.sh`
before any device build.

## Decisions on the open questions (defaults, change if you disagree)

- Typed chats count for the streak; a lesson's Talk step stays voice-only.
- "Type instead" stays a text link for now; promote to a ghost button if typed
  chats don't show up in the journey after a couple of weeks.
- "Ask Polly" from anywhere: the Topics "+" FAB gets a second item that opens
  `TextChatView` with no context. Small; do it last.
- Continue on a mastered chat is allowed; the new part gets its own fixes and
  the star returns after the next quiz.
