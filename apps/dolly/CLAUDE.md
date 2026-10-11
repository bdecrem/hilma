# Dolly — a three-minute call a day (iOS)

Built 2026-10-10 from the daily-call v2 design (`src/app/design/daily-call-v2`,
ola.cx/design/daily-call-v2): one text a day with a link into a three-minute
spoken conversation, three things said back, ten cards. **The new build on
Polly's TestFlight**: Polly's App Store record (6813318254, renamed "Dolly:
Three minutes a day" — plain "Dolly" is taken by another account) and bundle
id `com.bartdecrem.Polly`, so Bart's testers get it as an update; Aidan's
Polly (`../polly`, his own account) is untouched. Version 0.2, build 33 on.

Backend: hilma, `src/lib/dolly/` + `/api/dolly/*` (see the project CLAUDE.md
row). Voice: Polly's ElevenLabs + Claude engine, ported — `ElevenVoiceClient.swift`
is Polly's with Dolly's finish; GPT-Live is the gap left in `VoiceClient.swift`.

After the day is done (2026-10-10, later the same day): **Talk more** (mode
`more`, a free extra call of up to ten minutes, counted on the map; after End
its three things are picked, shown in `MoreDoneView` and put in the pool for
tomorrow, with no say-back round and no cards) for everyone, and with
**Settings → Learning objectives** on, **★ Star the day** (mode `star`): a
scripted dialogue on the next four unearned objectives of the learner's rung
(`src/lib/dolly/curriculum.ts`, eight levels, Spanish 1–3 and Mandarin 1–2
authored). Claude writes the script when the round starts (`writeStarScript`:
two exchanges per objective, Dolly's line + its English + a suggested reply in
English with the language behind a tap), Dolly says her lines in order, and
`StarScriptView` shows the current one: each of her turns ends with a hidden
`[[step:N]]` marker that `/api/dolly/eleven/turn` strips before the voice and
stores on the session (`script_step`); the app reads it back through
`GET /api/dolly/voice/:id` after each of her turns. The transcript is then read
for what was demonstrated, three things from the targets, six cards; the day's
node gets a star, all objectives earned moves the rung up. The map line
"Level 1 · Hello · 3 of 10" opens `ObjectivesSheet` (the ladder). **↻ Start
today over** at the bottom of the map (`POST /api/dolly/day/reset`) puts the
day back to the morning; kept words and earned objectives stay. The thinking
is `docs/dolly-pedagogy.md`.

**One map** (2026-10-11): the trail stays a calendar (nodes are days, never
sessions); the skill axis rides on it. A starred day is a bigger golden node;
the day whose star round earned a level's last objective carries a **flag**
("Level 1", `dolly_days.star_level_done`, `trail[].level_done`) — tap it for
`LevelSheet`: every objective with the learner's own line ("You said: …"),
bright or due, Refresh now, a link into the public curriculum. `DoneView`
throws confetti (`Confetti.swift`) on a level-up. A completed level is a
`dolly_levels` row (schema 005): bright for 7 days, then its **refresher** is
due (14, 30, 60, 90 days after each pass — `REFRESH_INTERVALS` in `day.ts`).
Due = the map's one **banner slot** ("Level 1 refresher is due", dismissable
for the day, `bannerDismissed:` in UserDefaults), the flag dims, the level
line says "Level 1 due", the done card's first button becomes "Refresh Level
1", and the next level's star round is refused (409) until it passes. The
refresher (mode `refresh`, `dolly_refreshers`): a scripted call on the level's
two weakest can-dos (`refreshTargets`: the ones whose practice items were
missed most on the cards) in `StarScriptView(mode: "refresh")`, then four
cards through the same `CardsView` (the day's `questions`/`answers` are the
refresher's while it is open; map states `refresh_cards` / `refresh_paused`),
then `RefreshDoneView`: passed when both can-dos were demonstrated in the call
(the same reader as the star round), which keeps the level bright and sets
the next due date; not passed leaves it due with "Try again". A refresher can
also be started from a bright level's sheet ("Refresh it anyway"). With the
toggle off: no level line, no flags, no banner — the trail, the streak and
the done card. **Voice screens end with a Next, not a hang-up**: when a call
is over (the wrap-up said, the script's last line said, or the engine ended
it) the red End becomes "Next: Three things" / "Next: Cards" / "Done", and a
failed call offers "Back to the map". The public curriculum is
`ola.cx/dolly/levels` (`src/app/dolly/levels/page.tsx`, generated from
`curriculum.ts`; `?lang=zh`; `#level-N`), linked from Settings → Learning
objectives, the ladder sheet and a level's sheet (`SafariView.swift`).

**The voice is a native speaker** (2026-10-11): Norah, a Latin American
Spanish library voice, not Bella — an English voice on a multilingual model
slid in and out of an American accent in Spanish. Library voices with live
moderation on are refused by the Speech Engine API (Lucia was); pick one
without it. `apps/dodo-voice-bridge/engines.mjs`, `DOLLY_ELEVEN_VOICE_ID`.

**XP, ranks, the avatar, flash cards** (2026-10-11, later): XP is a ledger
(`dolly_xp`, schema 006, `src/lib/dolly/xp.ts`): one row per thing earned,
unique on (kind, ref), so a retried request or a day done over never pays
twice and nothing is ever taken away — the call 10, the three things 5, a
card right 1, all ten +5, the day 10, streak days 3/7/14/30/60/100/365 +25,
Talk more 10 (the first three a day), a star round 15 and +5 an objective, a
level 100, a refresher passed 50, a flash set 1 a card and +5 clean (the
first five sets a day). The rank is a threshold on the total, birds that talk
and sing: Hatchling 0, Fledgling 100, Chirper 300, Songbird 700, Mockingbird
1,500, Parrot 3,000, Nightingale 6,000, Lyrebird 12,000 — independent of the
CEFR level, which keeps the word "level". `DayView.xp` carries the total, the
rank, the road to the next, today's awards (each finish screen sums the kinds
it is about into an `XpChip`) and `ranked_up` when today's XP crossed a rank
(`RankUpCard` + confetti). The map's header is **you**: the jelly avatar
(Dodo's critters, `Assets.xcassets/Jelly`, `JellyAvatar.swift`; the pick is
`dolly_users.avatar`, everyone gets a stable default from their id, never
Gummy), your name or rank, "Fledgling · 256 XP" and a thin rank bar; a tap
opens `YouSheet` (change the avatar, your name, the ladder, how XP works).
Dolly's own face left the header for the voice and finish screens. After
the day, **Talk more** stays the pink full-width button (ghost under the
star round or a refresher), **Flash cards** is a small link under it (Bart
tried them as two tiles in build 40 and wanted the button back), then a
tally line ("★ Starred · 2 sets of cards
· +48 XP today"). A flash set (`dolly_flash_sets`, `src/lib/dolly/flash.ts`;
`POST /api/dolly/flash` deals, `GET` reports the open one, `POST
/api/dolly/flash/answer`) is ten cards: five from the learner's pool (misses
first) and five grammar chunks from the levels up to their rung (`from:
"grammar"`), five pick and five type by turns, five each way — a reversed
card (`dir: "to_native"`) shows the language and takes the English, graded
loosely by `nativeMatches` — through the same `CardsView(source: .flash)`,
then `FlashDoneView` (right of ten, the XP chip, "Another set"). Dealing a
new set drops an open one. `scripts/dolly/backfill-xp.ts` writes the ledger
for everything from before it existed (run 2026-10-11).

## Files (`Dolly/`)

- `DollyApp.swift` — `@main`, `RootView` (loading / onboarding / map), `FlowView`
  (talk → things → cards → done inside one full-screen cover; the server's day
  state says what comes next), `onOpenURL` for `dolly://today` and the
  `https://ola.cx/dolly/today` universal link (`Dolly.entitlements`,
  `applinks:ola.cx`; the AASA is `src/app/api/dolly/aasa`).
- `AppState.swift` — who is signed in, today's `DayView`, the flow on screen,
  the launch hooks.
- `Skin.swift` — every color, font and radius, the mascot's asset names. One
  instance, `.candy`; `Skin.current` is what views read. The look will change:
  add a skin, keep the names.
- `Mascot.swift` — Gummy (two frames from `misc/dodo-redesign`, Dodo's jelly
  critter) with a motion per mood: idle, talking, listening, thinking, happy.
- `Models.swift`, `DollyAPI.swift` — the JSON and the client.
- `OnboardingView` (welcome → language → starting point → hour → number →
  code), `MapView` (+ `Trail`), `TalkView`, `ThingsView`, `CardsView`,
  `DoneView`, `SettingsView`, `Components.swift`.
- `VoiceClient.swift` (phase, engine enum, protocol, factory),
  `ElevenVoiceClient.swift`.
- `Fonts/` Baloo 2 (ExtraBold, SemiBold) + Quicksand (Medium, Bold), Google
  Fonts static TTFs; PostScript names in `Skin.candy`.

## Build, run, check

```bash
cd apps/dolly && xcodegen generate                      # after adding files or editing project.yml
xcodebuild -project Dolly.xcodeproj -scheme Dolly -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath <dd> build                            # must say BUILD SUCCEEDED
xcrun simctl install <udid> <dd>/Build/Products/Debug-iphonesimulator/Dolly.app
xcrun simctl privacy <udid> grant microphone com.bartdecrem.Polly   # once per sim boot, before a voice run
```

Launch hooks (simulator, `xcrun simctl launch <udid> com.bartdecrem.Polly …`;
with zsh build the arguments as an array):
- `-BackendURL http://localhost:3260` — a local dev server (the worktree's `next dev -p 3260`).
- `-TestSessionToken <value>` — sign in as the test account: the value is what
  `npx tsx scripts/dolly/e2e.ts` prints ("cookie value"). Never Bart's account.
- `-Open map|settings|objectives|level|you|talk|things|cards|done|more|star|refresh|refreshDone|flash|flashDone`
  (`flashDone` deals a set and answers it right through the real routes first)
  — where to open. `talk` needs the day at `morning`, `things` at `after_talk`,
  `cards` at `after_things`: `scripts/dolly/e2e.ts --until talk|things|cards`
  leaves the test account there; `more` and `star` need the day done (a full
  `e2e.ts` run leaves it done and starred, level 1 completed and refreshed
  once, objectives off — turn them on with `PUT /api/dolly/me`; back-date
  `dolly_levels.refresh_due` with the service key to see the due state).
  `-ScrollTo trail` scrolls the map to the trail for a screenshot.
- `-VoiceDrill 1` (with `-Open talk`) — the protocol drill: session up, Dolly
  spoke, audio arrived, a clean end with the finish landing. Read the
  `DOLLY_DRILL` lines: `xcrun simctl spawn <udid> log show --start "<time>"
  --predicate 'composedMessage CONTAINS "DOLLY_"'`. The simulator mic is
  silent, so a drilled call ends with no learner turns and the day stays at
  `morning` by design; the listening side is `e2e.ts --voice`.
- `-voiceHoldToTalk 1` — the push-to-talk key (the Settings toggle's key).

The voice bridge must route the dev engine here: `bash apps/dodo-voice-bridge/run.sh`
(re-points "Dolly (dev)" at this machine; `DOLLY_ELEVEN_SPEECH_ENGINE_ID` in
`.env.local` is that engine, Vercel's is "Dolly").

Without `-TestSessionToken` a fresh install opens on onboarding; the sign-in
code goes out by iMessage for real numbers. The test phones in
`src/lib/dolly/send.ts` get no text: their code is `DOLLY_TEST_CODE` (`.env.local`
and Vercel), which is how `e2e.ts` signs in against production too.

**The voice is slow and clear** (Bart, 2026-10-10 evening): Bella on
`eleven_turbo_v2_5` at `speed: 0.8`, stability 0.6 (`apps/dodo-voice-bridge/engines.mjs`,
`DOLLY_ELEVEN_SPEED` to tune; the v3/v4 models ignore speed, measured), and
the persona in `src/lib/dolly/prompts.ts` asks for a teacher's pace: short
sentences, one idea each, a new word said on its own once. The plan for later
is a pace per rung (one engine per pace, picked at the mint in
`src/lib/dolly/eleven.ts`); for now everyone gets the level-1 pace. Samples
at `~/Desktop/dolly-voice/`.

**Never mint an ElevenLabs token a check will not use.** Every conversation
token holds one of the workspace's concurrent-conversation slots until it
expires, across Dodo, Polly and Dolly, dev and prod engines alike. On
2026-10-10 the day check minting three per run filled the cap
(`concurrent_limit_exceeded`), which fails real calls with "Voice failed"
until the tokens expire. Checks that only exercise the day pass `dry: true`
(test phones only, `/api/dolly/eleven/session`); only `e2e.ts --voice` and the
simulator's `-VoiceDrill` connect for real, and both end their conversation.
Never poll the token endpoint to see whether the cap has cleared: a successful
probe takes a slot.

**Server first, then the app.** A build that reads new fields must not land on a
phone before the server that sends them is READY on Vercel (check
`vercel inspect <deployment>`; a Google Fonts hiccup can fail an unrelated
page's prerender and leave production on the old server — `vercel redeploy`
fixes that). The models decode new fields with defaults since 0.2 (36), and a
non-401 error keeps the session, so the skew now shows an error card instead
of the sign-in screen; keep it that way when adding fields.

## Ship to TestFlight

```bash
./apps/dolly/bump-build.sh            # 0.2 (33) → (34), regenerates the project; commit it
./apps/dolly/testflight/ship-via-mini.sh
```

This Mac has only Xcode 27 beta (App Store Connect refuses beta-SDK archives),
so the archive is built unsigned on the Mac mini over Tailscale
(`admin@100.95.51.98`, Xcode 26.3, folder `~/dolly-ship`), exported here with
`polly appstore m1` (this iMac M1's profile for `com.bartdecrem.Polly`; it
already carries `associated-domains`) and the ASC key `748UX45NAP`, then
`testflight/asc-submit.mjs` waits for processing, adds the build to the Testers
group and submits it for beta review. `scripts/dolly/asc.mjs info|rename|domains|profile`
are the App Store Connect chores.
