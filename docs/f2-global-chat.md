# Dodo's global chat — reference

Built 2026-09-20. One conversation, typed or spoken, that knows everything in all of ONE user's topics. The universe is always that user's own library: every table is keyed by `user_id`, the search function takes the user id, and the end-to-end check asserts a second account sees none of it.

## How you get there

Topics screen → **hold the +** (0.32 s). The + turns to an ×, the screen steps back, and one pill springs out above it: **Ask across all topics — One chat that knows your whole library**. A tap on the + still means "new topic". The first time there are two or more topics, a hint ("Hold + to ask across all topics") slides in beside the button for four seconds, once (`fabHoldHintShown`). VoiceOver gets a named action on the button.

The chat is a full-screen cover (`GlobalChatView.swift`), like Polly's text chat: × on the left, **All topics ⌄** in the middle (the menu holds "New conversation"; the subtitle says "Dodo knows your 23 topics", or "Reading 2 new topics…" while it catches up), a mic on the right. The mic opens the radio in `mode: "global"` — the SAME conversation out loud; its turns are appended to the thread when the call ends and carry a faint waveform mark. Under an answer, small chips name the topics it drew on; a tap closes the chat and opens that topic. Empty state: three starters ("What connects my topics?", "What should I review next?", "Quiz me across everything").

## The knowledge layer (`src/lib/f2/knowledge.ts`, schema `051_f2_knowledge.sql`)

A big account holds 4M+ characters, so nothing like "all the material in the prompt" is possible on a spoken turn. Two layers instead:

1. **Digests** (`f2_topic_digests`) — a 120–220-word index card per topic, written by `claude-sonnet-5` whenever the material's hash changes: what it is, key ideas, names and terms, what it is good for. ALL of a user's digests, each prefixed with where the learner stands (stars, last touched / quizzed, refresher overdue, study focus, weak spots from the last graded exam), form the **map** that is in every global prompt (`buildKnowledgeMap`; ≈ 400 tokens a topic, capped at 120K chars by shrinking the oldest entries to one line).
2. **Chunks** (`f2_topic_chunks`) — `buildFullContent(thread)` cut into ≈ 1,400-char paragraph-aware pieces, embedded with OpenAI `text-embedding-3-small` into a pgvector column (HNSW, cosine) beside a generated `tsvector`. `f2_search_chunks(p_user, p_embedding, p_query, p_limit, p_thread, p_min_sim)` fuses the top vector and full-text matches by reciprocal rank, inside one user's rows. A vector match must clear cosine similarity 0.22 — nearest-neighbour search always returns *something*, and measured on-topic questions score 0.27–0.55 against their passage while unrelated ones score 0.07–0.16.

**Keeping it fresh.** `indexTopic` is a no-op when the hash is unchanged. It is scheduled (`scheduleTopicIndex`, via `after()`) by the writers of material — `createThread`, `setAdditionalSources`, `setBookSummary` (when ready) and the two raw updates in `topics/[id]/sources` — and whatever those miss (quotes, a route cut off mid-index, a script) is caught by `ensureUserIndexed`, which runs when the global chat opens (`POST /api/f2/global-chat/index`, ~25 s a pass, the client loops while `pending > 0`) and nightly (`GET /api/f2/knowledge/backfill`, Vercel cron 10:20 UTC, `Authorization: Bearer CRON_SECRET`; `?user=<id>` for one account). `npx tsx scripts/f2-knowledge-backfill.ts <user|--all> [--force]` does the same from a machine with working keys. The first backfill (2026-09-20) indexed 97 topics / 8.4M chars into 8,134 chunks in two cron calls, no failures.

## A turn (`src/lib/f2/global-chat.ts`, `runGlobalTurn`)

1. **Retrieve first.** The user's message is embedded and searched before Claude is called (≈ 0.4–0.7 s); up to five passages ride in with the question, marked as retrieved. No tool round-trip, so a spoken turn stays quick. Short turns ("yes", "go on") skip it.
2. **Claude** gets the map in the (cached) system prompt, the conversation, the passages, and a `search_material` tool (`query`, optional `topic` title) for up to two further rounds.
3. **Sources** are decided from the ANSWER, not from what was retrieved: a topic is a source when the reply names its title, or shares at least four distinctive words with one of its passages.

The typed chat (`/api/f2/global-chat`) runs it on `claude-sonnet-5` (or `opus-5` when asked) with adaptive thinking at low effort, plain-text replies (the app does not render markdown). Global **voice** on the ElevenLabs engine runs the same function from `/api/f2/eleven/turn` on `claude-opus-5` with thinking off; the map is in the prompt stored on the session row, together with the last dozen turns of the typed conversation. On **GPT-Live** there is no per-turn search: the live prompt gets a compact map (titles + standing) and its Responses backend gets the full map — it can say what you have and connect topics, but not quote a passage. The ElevenLabs engine is the one that really knows the material.

## Storage and routes

`f2_global_chats` (`052_f2_global_chat.sql`): one row per user, `messages: [{ role, text, created_at, via?: 'voice', sources?: [{ thread_id, topic }] }]`, last 400 kept, last 40 sent to the model. "New conversation" empties it.

| Route | What |
|---|---|
| `GET /api/f2/global-chat` | `{ messages, index: { topics, indexed, pending } }` |
| `POST /api/f2/global-chat` `{ text, model? }` | `{ reply, sources, messages }` |
| `DELETE /api/f2/global-chat` | new conversation |
| `POST /api/f2/global-chat/index` | one catch-up pass over un-indexed topics |
| `GET /api/f2/knowledge/backfill` | cron / manual backfill (CRON_SECRET) |
| `PATCH /api/f2/live/session/:id` | for a `global` voice session, also appends the transcript to the chat (once) |

## Verifying

- `npx tsx scripts/f2-global-chat-check.ts [--base URL] [--keep]` — as a guest: pastes two unrelated topics, indexes them, finds a buried detail and cites its topic, asks a question spanning the library, asks one the library cannot answer, a follow-up in the other topic, checks a second guest sees nothing, clears the chat, deletes the guests. **Every guest sign-up texts Bart** (`notifyAdminNewAccount`) — run it sparingly.
- Simulator: `-OpenFabMenu 1` (the held + with its pill out), `-OpenGlobalChat 1`, `-GlobalAsk "question"` (sends one message). Sign in with `-TestSessionToken <f2_session value>` (a guest's cookie works against production).
- Global voice: `npx tsx scripts/test-eleven-dodo.ts global --guest --base https://feynd.cc` with the prod engine id.
