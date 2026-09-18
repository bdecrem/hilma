# Polly — plan (2026-09-17)

Polly is a language-learning app cloned from Dodo (`apps/feynd/`, F2 backend).
It starts ~80% identical and is expected to diverge. Working name: Polly (parrot
+ polyglot; public name TBD — "Amazon Polly" collides, check before launch).

## What changes vs Dodo

- The user first picks a **language**. ~99% study one; the data model allows
  several (one course per language) and the UI gets a switcher later.
- Topics become **chapters** of that language, built with the app, with a
  **linear progression** (ordered, locked / active / done).
- Kept from Dodo: conversations, flash cards, the Peck-style game, iMessage
  daily reminders, streaks, voice tests.

## Decisions

| Area | Decision |
|---|---|
| Frontend | Full copy of the Dodo iOS/Catalyst app into `apps/polly/` (`Polly/`, scheme `Polly`, bundle `com.bartdecrem.Polly`). Feynd/F2 type names renamed to Polly now. Version starts at 0.1 (1). |
| Web client | None. iOS + Mac (Catalyst) only. |
| Data | New `polly_*` tables in the same Supabase project — no `app` column on `f2_*`. Schema in `apps/polly/schema/`, starting from a consolidated baseline of Dodo's current schema, reshaped for languages. |
| Accounts | Separate: `polly_users`. No shared login with Dodo. |
| Backend logic | Cloned: `src/lib/f2/` → `src/lib/polly/`, `src/app/api/f2/` → `src/app/api/polly/`. Extract shared modules only when duplication actually hurts. |
| Infrastructure | Same Vercel project (hilma); env vars are already there. Own domain later (needed for universal links). |
| iMessage | Same Mac mini and number as Dodo. One inbound router in front of both apps (handle owned by one app → that app; owned by both → the app that texted that chat last), and echo detection checks both apps' outbound ledgers. Second Apple ID only if real usage shows confusion. |
| App Store Connect | New app record + TestFlight. Bart creates the record in the web UI (API can't); everything else via the ASC API. |

## Data model (v1)

- `polly_users` — cloned from `f2_users`, plus `native_language`, `active_course_id`.
- `polly_courses` — one row per target language (`target_language`, level).
- `polly_chapters` — from `f2_threads`: `course_id`, `position`, `status`, `goals`, chat `messages`; drops URL/summary columns.
- `polly_cards` — flash cards + spaced repetition, language-shaped (term, translation, example, audio, direction), unique per course by lemma.
- `polly_sets`, `polly_voice_sessions`, `polly_imessage_pending` / `_outbound`.
- Not cloned for v1: `f3_*` (Loci), community topics, artifacts, book/audio summaries.

## Order of work (each step a commit)

1. Copy + rename the iOS app; build and run it unchanged. **Done 2026-09-17.**
2. Fork the backend to `/api/polly/*` + `polly_*` tables (baseline clone); point the app at it; verify with a Polly test account. **Done 2026-09-17** (schema 001 applied; verified against production).
3. iMessage router in front of both apps.
4. Diverge: language picker, courses, linear chapters, language-shaped cards; trim the non-v1 features. **Started 2026-09-17:** `polly_courses` (schema 002), first-run language + name flow, tutor prompt knows the language. Chapters, language-shaped cards and the trim are next.
5. App Store Connect record, profiles, TestFlight. **Done 2026-09-17 (iOS)** — public link https://testflight.apple.com/join/5apKPyf7; Catalyst waits on a Mac Installer certificate (see apps/polly/CLAUDE.md).
6. Agentic Learning Mode — voice level check → a five-lesson path → lessons as a topic kind with Talk / Words / Grammar steps. **Done 2026-09-18** (see apps/polly/CLAUDE.md).
