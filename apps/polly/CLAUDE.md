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
- cards: `generateLessonCards` in flash.ts — meaning cards (story sentence →
  English) and production cards (English → term, with the story sentence as
  cloze), every key word first; same card shape as any deck;
- chat: `lessonGuidance` in chat.ts — quizzes make the learner USE the words
  (cloze, translate, formal/informal, retell); the reflection quiz asks in the
  target language;
- voice: talk mode on a guest lesson opens with "retell the story", fixes two
  or three things, drills the key words, then asks the host's closing
  question; Final Review / Second Chance / recert get `lessonExamBlock`.
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
- Mac (Catalyst) uploads need a Mac Installer Distribution certificate and
  the team already has three (Apple's cap); none of their private keys are
  on the Air, so Catalyst TestFlight waits until one is revoked or its
  .p12 is copied over from the iMac.

iOS upload, from `apps/polly`:
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
