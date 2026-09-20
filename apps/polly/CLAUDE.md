# Polly (iOS + Mac Catalyst)

Language-learning app, cloned from Dodo (`apps/feynd/`) on 2026-09-17 and
diverging from it. Plan and decisions: [`docs/polly-plan.md`](../../docs/polly-plan.md).

SwiftUI + XcodeGen — `project.yml` is the source of truth, `Polly.xcodeproj`
is generated (`xcodegen generate` after adding/removing files). Bundle ID
`com.bartdecrem.Polly`, Team `274T5WCVD2`, iOS 17+, Catalyst on macOS 14+.

Most of `apps/feynd/CLAUDE.md` applies here with Feynd → Polly: the
bump-build rule (`./apps/polly/bump-build.sh` before any build that lands on a
device), `ENABLE_DEBUG_DYLIB: NO`, never installing to the phone in the
background, `pkill` before replacing the Mac app, and the headless launch
hooks (`-TestLoginUser`, `-StartTab`, `-AutoPlayLevel`, `-NoSFX`,
`-SkipNotifPrompt`, …). Polly-specific: `-OnboardingPage 1|2|3` opens the first
run on that page, `-AutoTryPolly 1` drives it (Italian + a random name) to the
signed-in tabs with zero taps.

A signed-out app always shows the first run (no "seen the intro" flag — Dodo's
persisted across TestFlight updates and hid the flow); "I already have an
account" opens the login screen.

First run (2026-09-17): two intro panels → "Which language?" (Italian, French,
Korean; `PollyLanguage` in OnboardingView.swift) → "What should Polly call
you?" — the name is the account (`POST /api/polly/auth/guest { username,
language }`, no password, claimable with an email from Profile), with "Sign up
with email" and "I already have an account" as the alternatives.

Differences from Dodo so far:
- Deep-link scheme is `polly://`. No universal links / Associated Domains
  until Polly has its own domain.
- `testflight/asc-submit.mjs` reads the app id from `POLLY_ASC_APP_ID`; the
  export plists name profiles "polly appstore" / "polly catalyst appstore"
  (not minted yet — Polly has no App Store Connect record yet).
- The mascot is Dodo's bird as a scarlet macaw with a tri-colour plume (see `branding/BRANDING.md`); the files keep their `Dodo*` names.

Catalyst debug build and the microphone: the Debug config signs with
`Polly/Polly-macOS-debug.entitlements` (just `device.audio-input`, no
sandbox). Xcode turns the hardened runtime on for Catalyst, and a hardened
app without that entitlement gets the mic refused with no prompt — the app
shows "Microphone access denied" and `tccutil reset` changes nothing
(hit on the iMac 2026-09-18). Dodo's Catalyst debug build has the same gap.

Simulator build:
```bash
xcodebuild -project apps/polly/Polly.xcodeproj -scheme Polly \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

## Topic kinds (2026-09-18)

On top of Dodo's inherited kinds, Polly has three of its own, user-set for
now: `guest_lesson` (a lesson someone else made that Polly hosts — a podcast
episode with key words, a story, a check; Lo Scandalo is one), `immersion`
(raw target-language material: book, news, film, show) and `ask` ("teach me
about X"). They lead the Type pickers and the by-type sections; glyphs are
`GuestLessonGlyph` / `ImmersionGlyph` / `AskGlyph` in PollyChrome.swift
(mortarboard, waves, question mark). Backend: `TopicKind` in
`src/lib/polly/threads.ts`, the agent tool descriptions, and schema 003
(the check constraint). Per-kind attributes are next.

## Guest lessons — the lesson plan (2026-09-18)

A `guest_lesson` topic gets its teacher's structure pulled out of the
transcript once and stored in `polly_threads.lesson` (schema 004):
`src/lib/polly/lesson.ts` — `extractLesson` (Sonnet, `POLLY_LESSON_MODEL`)
returns host, series, language, the key words the host teaches (term,
English meaning, the sentence from the episode), 4–8 further expressions from
the story, the story in brief in the target language and in English, a usage
point, and the host's closing question. `ensureLesson(thread)` extracts and
saves on first use and is called by card generation, chat, and the voice
session route; the topics PATCH warms it in `after()` when the kind becomes
`guest_lesson` and clears it when it stops being one. `lessonBlock(thread)`
is the plan as prompt text, shared by every surface:
- cards: `generateLessonCards` in flash.ts — quick drills, not study notes
  (Bart, 2026-09-18: "fun fill in the gap and multiple choice, no academic
  essay around each"): GAP cards (a ≤12-word line from the lesson with the
  word blanked and the English hint in parentheses; play as fill-in), MEANING
  («term»? → English), SAY IT (English → term), TU O LEI; question ≤ 12
  words, answer ≤ 5, every key word first; same card shape as any deck;
- chat: `lessonGuidance` in chat.ts — quizzes make the learner USE the words
  (cloze, translate, formal/informal, retell); the reflection quiz asks in the
  target language;
- voice: talk mode on a guest lesson opens with "retell the story", fixes two
  or three things, drills the key words, then asks the host's closing
  question; Final Review / Second Chance / recert get `lessonExamBlock`.
The deck comes with the plan: `ensureLessonDeck` (flash.ts) builds it —
two cards per key word plus up to four story expressions — when the topic
has no cards yet; called by the lesson route, the kind PATCH and topic
creation (all in `after()`), never by card generation itself.
In the app: `LessonCard` under the source card (byline + key words) opens
`LessonSheet` (Polly/LessonSheet.swift: key words, story expressions, the
story with an English toggle, usage point, the host's question); `PollyThread`
carries `kind` + `lesson`, and a guest lesson opened before its plan exists
calls `POST /api/polly/topics/[id]/lesson` (`ensureLesson(topicId:)`) so the
card fills in. Launch hook `-OpenLesson 1` (with `-OpenTopic <id>`) opens the
sheet for screenshots.
Verified 2026-09-18 on a throwaway guest user with Lo Scandalo's transcript
(deck, chat quiz, prompts), then the user was deleted. Extraction fails soft:
the topic keeps working on the raw transcript.

## Agentic Learning Mode — the level check, the path, Polly's lessons (2026-09-18)

A voice conversation finds the learner's level, Polly plans a five-lesson
path from it and writes the lessons one at a time. Backend
`src/lib/polly/path.ts`, schema 005 (applied); app `Polly/PathViews.swift`.

- **The level check** is voice mode `placement` (`buildLivePlacementInstructions`
  in live.ts): Polly's first utterance is exactly the greeting
  (`PLACEMENT_GREETINGS`: Ciao! / Bonjour ! / 안녕하세요!), then she waits. The
  session response carries `silence_nudge { after_ms, instruction, commentary }`;
  `LiveVoiceClient.armSilenceNudge` sends it once if the learner says nothing
  for 3.5 s after the greeting ends. It has to be BOTH events —
  `session.instructions.append` and `session.commentary.append`: an appended
  instruction alone does not make the live model speak mid-session. Then a
  chat that gets a notch harder each turn (present → past → future →
  opinion) until the learner stumbles twice; English from the start for a
  beginner. No corrections, no teaching.
- **Placement** (`POST /api/polly/path/placement { voice_session_id }`,
  `placeLearner`): one Opus call (`POLLY_PATH_MODEL`, ~25 s) reads the
  transcript → level A0–C1, "you can…", "what's shaky", interests, a path of
  `PATH_LENGTH` = 5 lessons (title, scene, grammar), and lesson 1 in full.
  Stored on `polly_courses` (`level`, `placement`, `path`). A retake replaces
  the path: untouched lessons are deleted, started ones stay as ordinary
  topics with `path_position` null.
- **A lesson is its own topic kind, `lesson`** — only Polly sets it (not in
  `ALL_TOPIC_KINDS`, no picker offers it, a rename can't change it). Its plan
  is a `LessonPlan` like a guest lesson's (host "Polly", `story_summary` = the
  conversation) plus `scene`, `dialogue[]`, `grammar_explained`, `level`, so
  chat, cards and voice work unchanged; `lessonBlock` has a Polly-lesson
  wording. The thread's `content` is the lesson as text.
- **Three steps**, any order, `polly_threads.lesson_steps`: **Talk** — a
  `topic` voice session on the lesson (Polly speaks first and plays the other
  person in the scene; counts once the learner spoke ≥ 3 turns, marked in the
  session's finish call); **Words** and **Grammar** — a card set each.
  `ensureLessonDeck` builds two decks side by side, each only if missing: the
  words (`lesson_step` 'words', the guest-lesson drill prompt) and ten grammar
  drills (`generateGrammarCards`, 'grammar': gap / pick-the-right-one / say-it,
  lesson vocabulary only). `flash/start` takes `lesson_step`; `flash/submit`
  marks the step from the cards played and answers `lesson_step` /
  `lesson_finished`. The decks land a few seconds after the lesson; a step
  started before that gets a 409 and the app asks the lesson route to build
  what's missing.
- **The next lesson** is written when all three steps are done
  (`ensureCurrentLesson` in `after()`, routes have `maxDuration` 300): from the
  path's outline plus how the last one went (missed cards, the Talk
  transcript). `GET /api/polly/path` retries a write that didn't land;
  `writing_since` on the path entry keeps two triggers from both paying.
  Lessons further on stay titles — "locked" is simply "no topic yet".
- **App:** `PathCard` on top of Topics (before the check: "Talk to Polly";
  after: level chip, five-segment progress, next lesson, Start / Continue; ✕
  or "…" → Hide; the sort menu brings it back; `path_card_dismissed_at` is
  server-side so it follows the account; a new path un-hides it), `PathList`
  under it (numbered nodes on a line: done / current with three step dots /
  being written / locked) — path lessons are drawn there and left out of the
  topic list; `PlacementFlowView` (intro → call → "Building your plan" →
  result with "Start lesson 1" / "Not right? Talk again" / "Later");
  `LessonStepsCard` on the lesson's topic screen (Read it → `LessonSheet`
  with the conversation and an English toggle; Talk / Words / Grammar).
- **Checks:** `npx tsx scripts/polly/path-check.ts [beginner|some]` (library
  level: placement, decks, steps, lesson 2, double-trigger), `node
  scripts/polly/path-http-check.mjs [base]` (the same over HTTP as the app
  does it, against production by default — also proves `after()` writes
  lesson 2 on Vercel), `npx tsx scripts/polly/test-live-placement.ts
  [it|fr|ko] [--no-silence]` (the greeting, the silence nudge, the reply, over
  the Live WebSocket). Each makes a throwaway guest and deletes it. Launch
  hooks: `-OpenPlacement 1`, `-PlacementAutoStart 1` (starts the call; the
  sim's silent mic exercises the nudge — look for `F2_LIVE_NUDGE sent`),
  `-PlacementSession <voice session id>` (skips the call and builds the plan
  from that transcript).

## The marquee in the studied language (2026-09-19)

Polly stays an English app; only its marquee — tab names, main-screen titles
and section headers, hero cards and their call to action, celebrations, level
names, "Correct!" — renders in the language being studied, with a Settings
toggle back to English. Settings, functional UI (editing, quiz mechanics,
menus, sheets), dialogs, errors and long prose stay English on purpose. The
scope, the rules, the voice and the glossary are in
[`LOCALIZATION.md`](LOCALIZATION.md) — read it before adding a marquee string.
Mechanism: `Polly/LangUI.swift` — a global `L("Done", "Fatto", "Terminé",
"완료")` reading `UILanguage.shared` (`@Observable`; `Session.state`'s didSet
feeds it the signed-in language), so any body that calls `L` re-renders when
the toggle flips or the language switches. No .strings files.

## Language profiles — the switcher (2026-09-19)

Profile → Learning → **Language** opens `LanguageSwitcherView`: a tile per
language, like Netflix's "Who's watching?". Each language is its own profile:
its own `polly_users` row (schema 007: `account_id` → the root row that holds
the credentials or the guest name; `last_profile_id` on the root), so topics,
cards, Peck, the path, the streak and the level are all separate without any
query knowing about languages. `src/lib/polly/profiles.ts`:
- `GET /api/polly/languages` → the three tiles (`started`, `active`, level,
  topic count, streak).
- `POST /api/polly/languages/switch { language }` → finds or creates the
  sibling profile (username `<root>+<lang>`, random password, a copy of the
  avatar / guest flag / voice prefs, its `polly_courses` row) and re-issues
  the session cookie for it. A started language switches on tap; a new one
  asks "Start French from scratch?" first.
- `/auth/me` reports the root's username for a sibling; a password login lands
  in `last_profile_id`; claiming a guest puts the email on the root and clears
  `is_guest` on every profile; the avatar is written account-wide.
- App: `Session.switchLanguage(to:)` swaps the user, clears `ScreenCache` and
  sets `languageFlip`; `RootView` keys `MainTabsView` on the user id (every
  tab starts fresh, open sheets go down with it) and plays `LanguageFlipView`
  (flag + hello) — it starts inside the switcher sheet the moment a tile is picked and stays over the new tabs ~2 s.
- Not shared between profiles (yet): iMessage pairing and the daily card live
  on the profile that set them up.
- Checks: `node scripts/polly/language-switch-check.mjs [base]` (guest →
  topic → French → isolation → back; prints the cleanup SQL). Launch hook
  `-StartTab flash -OpenProfile 1 -OpenLanguages 1` opens the switcher and `-AutoSwitchLanguage fr` flips as soon as
  the tiles load.
- The old `POST /api/polly/courses` (flip `active_course_id` in place, data
  shared) is unused by the app; don't build on it.

## Content quality — Fast / Thorough (2026-09-19)

Which Claude model and effort each learning feature runs at lives in ONE
table, `TIERS` in `src/lib/polly/quality.ts` (base tier + the "Thorough" tier
per feature), chosen from bake-offs and written up in
[`QUALITY.md`](QUALITY.md) — read it before changing a model anywhere in
Polly. The learner's setting is Profile → Learning → **Polly's care**
(`polly_users.content_quality`, schema 008, account-wide via `PUT
/api/polly/profile { content_quality }`; new language profiles inherit it);
generators call `qualityFor(userId)` themselves, so background work honours
it. Thorough changes the Infinity clean-up (Sonnet 5 medium → Opus 5 high),
lesson/grammar/topic cards (Opus 5 medium → high) and answer grading (Haiku →
Opus 5 low). Lesson-plan extraction is Opus 5 high for everyone. Analyses and
lesson plans record what made them (`curated_by`, `model`).
`LlmRequest.effort` overrides a model's registry effort per call.
Answer grading uses a language rubric (`judgeRubric` in flash.ts): an answer
in the studied language must be correct in that language — Dodo's "same idea,
any wording" bar only applies to English-side answers.
`npx tsx scripts/polly/quality-bench.ts <cleanup|plan|cards|grammar|judge>`.

## The screenshot set (2026-09-19)

`scripts/polly/shots-seed.mjs <dir>` makes a throwaway demo guest on
production (a five-lesson path from a canned level check, plus a copy of
Bart's topics, Infinity chats and cards; SQL through the supabase CLI), and
`scripts/polly/shots.sh <dir>` takes ~30 screens on the booted iOS simulator
with launch hooks only — first run, Topics, Infinity Chat (chat window, study
sheet, vocab, grammar, quiz, clean-up walk, talk), a path lesson, a guest
lesson, Peck (sets, results, miss clinic), the level check, profile, language
switcher — and a contact sheet. `--delete` on the seed script removes the
account. Hooks added for it: `-OpenInfinitySessions 1` (the study sheet, with
`-OpenTopic <infinity id>`) and `-OpenInfinityDrill cleanup`. `-ProfileScrollTo <section>` now takes any
settings section (`appearance`, `daily-card`, `learning`, `account`, …). For an
English-UI set, `xcrun simctl spawn booted defaults write com.bartdecrem.Polly
uiInStudyLanguage -bool NO` before the run (a launch argument doesn't work:
the toggle is read with `as? Bool`). Two things it
ran into: the login route lowercases the identifier while guest names keep
their case (the demo signs in by email), and a copied chat's
`analysis.card_ids` must be remapped or its quiz comes back empty.

## iMessage

Polly shares the iMessage inbox with Dodo and Onething: one BlueBubbles
webhook, one dispatcher (`src/lib/imessage/dispatch.ts`; see the root
CLAUDE.md, "iMessage — one inbox, three apps"). A handle paired to both Polly
and Dodo is routed by prefix (`polly …`), then by which app spoke last, then
by a Haiku classifier. Pairing (`/api/polly/imessage/start`) sends the code
synchronously and answers 502 when the mini is unreachable.

The daily card has its own Vercel cron: `/api/polly/daily-card` at 15:00 UTC
(`vercel.json`) — an hour before Dodo's card and two before Onething's 10am
Pacific question, because Onething claims any text while its question is open.
It was missing until 2026-09-19 (the route was cloned from Dodo, the cron
entry was not, so no card had ever gone out). Sending a card writes
`imessage_routes` for the handle (`rememberRoute` in
`src/lib/imessage/routes.ts`, Dodo's card does the same), so for someone
paired to both apps the answer goes back to the app that asked.

## App Store Connect / TestFlight (set up 2026-09-17, from Bart's MacBook Air)

- App record **"Polly: Learn any language"**, id `6813318254`, SKU `polly`;
  bundle-ID resource `8TN94WRD64` (Associated Domains capability on).
- API key `FA7268Q94U` (Admin) at `~/.appstoreconnect/private_keys/` on the
  Air; issuer `69a6de80-eb13-47e3-e053-5b8c7c11a4d1` (same team as Dodo).
  `testflight/asc-submit.mjs` defaults to this key and app (`ASC_KEY_ID`,
  `POLLY_ASC_APP_ID` override).
- Distribution cert `94KFQFP9A4` (Apple Distribution, expires 2027-09-17),
  private key in the Air's login keychain. Profiles "polly appstore"
  (IOS_APP_STORE), "polly dev" (all dev certs + every enabled iPhone) and
  "polly catalyst appstore" are installed in the Air's Xcode profiles dir.
- Beta groups: "internal" (all builds) and "Testers" with the public link
  https://testflight.apple.com/join/5apKPyf7. Beta review contact = Bart;
  demo account not required (guest sign-in).
- Mac (Catalyst) uploads need a Mac Installer Distribution certificate; the
  team's three (Apple's cap) have their private keys on the iMac, not the
  Air, so Mac builds ship from the iMac.

**Shipping, from either Mac: `./apps/polly/testflight/ship.sh [ios|mac|both] [version]`**
— bumps the build, archives, uploads, waits for processing, adds the build to
Testers and submits it for beta review. Signing is manual and per machine
(each Mac holds a different Apple Distribution key); the script tells the
machines apart by which API key file is present:
- **iMac M4** (set up 2026-09-18): API key `AH7Q68TW6S`, profiles
  "polly appstore imac" + "polly catalyst appstore imac" on this Mac's
  distribution cert `4YB38SZ2F2`, plus "polly dev" for device installs; files
  `polly-*.mobileprovision` / `.provisionprofile` in the Xcode profiles dir.
  The iMac also holds a Mac Installer key, so **Mac (Catalyst) builds ship
  from here** — 0.1 (10) went up for both platforms on 2026-09-18.
- **MacBook Air**: key `FA7268Q94U`, profiles "polly appstore" /
  "polly catalyst appstore" (cert `94KFQFP9A4`); iOS only.
"Another build is in review" on the submit step is harmless: the build is
already with the internal group, and external review frees up when the
earlier build's review ends. Minting a profile for another Mac: the ASC API
`POST /profiles` with that Mac's distribution cert id (match the keychain
cert's serial against `GET /certificates`).

The same by hand, from `apps/polly`:
```bash
./bump-build.sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild archive -project Polly.xcodeproj -scheme Polly \
  -destination 'generic/platform=iOS' -archivePath <p>/Polly.xcarchive -configuration Release \
  CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=polly appstore" "CODE_SIGN_IDENTITY=Apple Distribution"
xcodebuild -exportArchive -archivePath <p>/Polly.xcarchive -exportOptionsPlist testflight/export.plist \
  -exportPath <out> -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_FA7268Q94U.p8 \
  -authenticationKeyID FA7268Q94U -authenticationKeyIssuerID 69a6de80-eb13-47e3-e053-5b8c7c11a4d1
node testflight/asc-submit.mjs <build>        # waits VALID, adds to Testers, submits for beta review
```

Database: `apps/polly/schema/` applied with `~/.local/bin/supabase db query --linked -f <file>`
(project `tqniseocczttrfwtpbdr`, linked from the Air on 2026-09-17).
