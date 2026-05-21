# F2

## 0. How to work on F2 (operating rules — read first)

These override the cautious defaults from the parent CLAUDE.md when working inside F2.

**Work independently. Minimize asking.** Bart explicitly wants you to *do* things, not narrate options. If a question can be resolved by reading code, trying a command, checking env vars, or making a small reversible change — resolve it yourself. Only ask when (a) the action is irreversible/destructive and not yet approved, (b) it spends real money or sends real messages to other people, or (c) the underlying intent is genuinely ambiguous in a way no amount of investigation will fix.

Before asking a question, do this checklist:
- Can I figure this out by reading a file? → read it.
- Can I figure this out by running a command? → run it.
- Is this reversible? → just do it.
- Is "the answer" a preference I could pick a reasonable default for and then surface? → pick + tell.

When you do report back, lead with what you *did*, not what you're *thinking about doing*.

**Test your work at every stage, proportional to stakes.** No "I think this works" without evidence. The bar scales with the action:

| Stage | Verification |
|-------|--------------|
| Wrote SQL / migration | Apply it to a real DB, then `SELECT` against it (or describe the table) to confirm shape. Don't ship migrations on vibes. |
| Wrote a backend route | `curl` it. Show the actual response. If it touches Supabase, `SELECT` the row that was created. |
| Wrote an SMS command | Hit the dev webhook (sms-bot has `/dev/webhook` that captures responses) with realistic input. Show the captured reply. |
| Wrote a prompt | Run the prompt with a real input through the actual model. Show what the model said. |
| Wrote UI | Open it in the browser. Screenshot it (Playwright MCP if needed). Look at it. |
| Changed schema for an existing table | Run the migration against a copy or with a transaction you can roll back; confirm before pushing. |

If a stage *can't* be tested locally (e.g. requires a real Twilio number, real cron schedule), say so explicitly and identify the smallest realistic substitute (dev webhook, manual trigger, etc.).

**Failure-mode bias.** If a test fails or returns something weird, don't paper over it — figure out *why*, fix the root cause, and re-test. Don't proceed with "this looks fine" after a red flag.

**Tell, don't ask, for trivia.** "Should I name this column `phone` or `phone_number`?" → pick one, write it, mention it in the report. Same for: file names, function signatures, log line formats, comment style, where minor helpers live.

**Cross-repo work is normal.** F2 touches three places (this folder, `src/app/f2/` in hilma, `commands/f2.ts` in `../vibeceo/sms-bot/`). Just do the work in the right place; don't ask permission to edit a sibling repo.

## 1. The project (what Bart told me)

F2 is take 3 on a learning-app concept Bart has been exploring. The previous two attempts were both versions of **Feynd** (see §2).

The idea: **use AI to help Bart learn anything.** Bart is trying to understand *how* he learns, then build tech around that. The shape is still evolving — it's a discovery journey. The long-arc bet is that someone will build the AI-first equivalent of Khan Academy / Udemy / Duolingo, and F2 is exploring that direction.

F2 will have a backend and support multiple frontends. **SMS will be the first UI** (built on top of sms-bot — see §3). Web and a native iOS app will follow.

**First feature to build:**

1. Bart texts a URL of something he's learning about.
2. F2 stores the URL.
3. Bart can have chat conversations about that source.
4. F2 can quiz Bart on it.

That's all that's been specified so far. Don't build past it without asking.

## 2. Feynd (the prior app, for reference)

**Location:** `../feynd/` (sibling folder under `apps/`). Confusingly often misspelled "feydn" — the real folder is `feynd`.

**What it is:** A native iOS app — a Feynman-inspired AI tutor for learning frontier AI topics. Swift / SwiftUI, iOS 17+, generated from `project.yml` via xcodegen. Bundle id `com.bartdecrem.Feynd`. Talks to Anthropic Claude directly (`AnthropicClient.swift`) plus a custom backend (`FeyndAPI.swift`).

**Shape of the app** (files in `apps/feynd/Feynd/`):
- `CoursesView.swift` — list of curated courses, each a card with title / video count / hours.
- `CourseDetailView.swift` — header, progress bar (`watched / total`), video list, concept map.
- `Course.swift` + `CourseData/frontier-ai-2026.json` — first bundled course: ~14h tour of recent talks/interviews on frontier AI, with concepts grouped (Pretraining & scaling, Architecture, …).
- Each video row exposes four actions: **Watch** (opens URL, auto-marks watched), **Chat** (text thread, `ChatThreadView.swift`), **Voice ask** (Realtime API, `VoiceSessionView.swift` + `RealtimeClient.swift` + `TTSPlayer.swift`), **Quiz** (`QuizView.swift`, `ClaudeQuizView.swift`).
- `DeviceIdentity.swift` — per-device UUID; no accounts.
- Watching videos lights up related concept chips on the concept map (`progress.litConcepts(in: course)`).

**Concepts F2 could borrow** (none are committed yet): the source → chat → quiz triad; per-source progress; the concept-map idea. Voice and video probably drop out for an SMS-first app. Don't import Feynd code directly — reference and rewrite.

## 3. sms-bot (the SMS backend F2 will plug into)

**Location:** `../../../vibeceo/sms-bot/` (sister repo at `../vibeceo/sms-bot/` from hilma's root). Long-running Node/TypeScript Express service. Entry: `sms-bot/src/index.ts` → `lib/sms/bot.ts`. Listens on port 3030. Loads `.env.local`, requires `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and Twilio creds.

**Inbound: Twilio is the front door.**
- `POST /sms/webhook` (`lib/sms/webhooks.ts`) receives Twilio's payload (`From`, `Body`, MMS media).
- `POST /whatsapp/webhook` uses the same pipeline.
- `POST /dev/webhook` captures bot responses for local testing instead of sending real SMS.
- `TWILIO_ENABLED=FALSE` switches to a mock client that logs but doesn't send.

**Routing** (`lib/sms/handlers.ts → processIncomingSms`, two stages):
1. **Keyword commands.** Registry in `sms-bot/commands/` — one file per command (`ai-daily.ts`, `crypto.ts`, `kg.ts`, `recruit.ts`, `amber.ts`, `stock-news.ts`, …). Each exports a handler that takes a `CommandContext` (from, message, twilioClient, sendSmsResponse, etc.). First match wins. **F2 will add `commands/f2.ts` here.**
2. **Orchestrated routing** for non-keyword messages (`lib/sms/orchestrated-routing.ts`). Loads user context (personalization + subscriptions + recent messages + any active "thread state") via `lib/context-loader.ts`, runs an AI orchestrator that picks an intent, delegates. Active threads (e.g. recruit-source-approval, cs-handle-setup) get first crack at YES/NO follow-ups — this is how multi-turn flows work.

**State: Supabase.**
- `lib/supabase.ts` is the shared client.
- Subscribers live in a Supabase table (`lib/subscribers.ts`: `getSubscriber`, `createNewSubscriber`, `confirmSubscriber`, …).
- Conversation history, thread state, and personalization are all Supabase-backed.
- F2 will reuse the same Supabase instance with new tables prefixed `f2_`, linked to subscribers by phone.

**Outbound:**
- Same Twilio client. `lib/sms/orchestrated-send.ts` + `splitMessageIntoChunks` (in `handlers.ts`) split replies >1600 chars across multiple SMS, record bot replies into conversation history.

**Scheduler:**
- `lib/scheduler/` plus per-feature schedulers (`ai-daily-scheduler.ts`, `stock-scheduler.ts`, `peer-review-scheduler.ts`, plus jobs from `agents/*`) register cron/interval tasks at boot in `bot.ts`. Most are currently disabled; the message-queue processor and a few daily jobs run today. Scheduled broadcasts go out via the same Twilio client to active subscribers.

**Other inbound channels share the same brain:** Email webhook (`email-webhooks.ts`), Supabase webhook (`supabase-webhooks.ts`), MMS handler (`mms-handler.ts`), and a `/cs-chat` HTTP endpoint that runs the cs-chat agent.

**For F2, the natural seam is:** one new `commands/f2.ts` (keyword + thread handlers), persist F2 user state in Supabase `f2_*` tables linked by phone, reuse the existing Twilio + chunking + scheduler infra. Don't reinvent SMS plumbing.

## 4. Supabase CLI access — the canonical way

**TL;DR: use `supabase db query --linked` for anything that isn't a trivial one-line SELECT.** It accepts both DDL and DML and goes through the Supabase Management API (no `psql`, no `DATABASE_URL` needed). The repo is already linked to the `sms-bot` project (`supabase/config.toml` is committed; project ref `tqniseocczttrfwtpbdr`).

### First-time setup on a new machine (one-time, ~30 seconds)

`supabase login` is the only step. The CLI needs a TTY, so Bart runs it himself (token saves to `~/.supabase/access-token` and is picked up by every future session on this machine):

```
! supabase login
```

The `!` runs in this Claude session's shell with a TTY. Pick "no browser" if needed; copy the URL it prints, authorize in browser, paste the verification code back. Done forever on this machine.

After login, sanity check: `supabase projects list` should show `sms-bot` (ref `tqniseocczttrfwtpbdr`) and others.

### Running SQL

**Migrations / DDL / anything multi-statement** — `supabase db query --linked`:
```bash
supabase db query --linked -f apps/f2/schema/001_f2_threads.sql   # apply a migration file
supabase db query --linked "create index … ; analyze f2_threads"  # one-off DDL inline
supabase db query --linked "select count(*) from f2_threads"      # also works for reads
```

**Quick one-line SELECTs** — `./scripts/db` (repo root):
```bash
./scripts/db "select count(*) from sms_subscribers"
./scripts/db < query.sql
echo "select * from f2_threads limit 5" | ./scripts/db
```

The wrapper hits the `exec_sql` RPC via curl + service key, pretty-prints JSON, exits non-zero on Postgres errors. **It is SELECT-only** — the project's `exec_sql` RPC has a hardcoded guard that rejects anything else. Don't try to make it do DDL; use `supabase db query --linked` instead.

### Adding a new F2 migration

1. Drop a file in `apps/f2/schema/`, numbered, idempotent (`create … if not exists`, `alter … if not exists` patterns).
2. `supabase db query --linked -f apps/f2/schema/00X_thing.sql`.
3. Verify shape: `./scripts/db "select column_name, data_type from information_schema.columns where table_name='…' order by ordinal_position"`.

### Credentials & alternate paths

Already in `hilma/.env.local` (and `vibeceo/sms-bot/.env.local`):
- `SUPABASE_URL` — project URL (`https://tqniseocczttrfwtpbdr.supabase.co`)
- `SUPABASE_SERVICE_KEY` — service-role, bypasses RLS. Used by `./scripts/db` and backend code.
- `SUPABASE_ANON_KEY` — anon key, RLS applies. For client-side / browser code.

Other paths that work but are rarely the right call:
- **PostgREST via curl** — fine for simple table reads/writes against the service key, e.g. `curl -s -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" "$SUPABASE_URL/rest/v1/f2_threads?select=*&limit=5"`. Doesn't accept raw SQL.
- **Node `@supabase/supabase-js`** — for application code: `createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY).from('f2_threads').select(...)`. See `vibeceo/sms-bot/scripts/supabase-query.ts` for the pattern.
- **`psql`** — not installed, no `DATABASE_URL` in env. If you ever want it, the connection string is in the Supabase dashboard → Project Settings → Database, but `supabase db query --linked` covers every case `psql` would.
