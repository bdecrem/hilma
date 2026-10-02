# Dodo (iOS + Mac Catalyst)

Native client for F2. **The app's product name is Dodo** — that's the springboard name (`CFBundleDisplayName`), the in-app name, and the brand. The folder, scheme, bundle ID, and type names remain `Feynd` (renaming them would churn provisioning and every build command for zero user-visible gain). SwiftUI + XcodeGen — `project.yml` is the source of truth, `Feynd.xcodeproj` is generated. Bundle ID `com.bartdecrem.Feynd`, Team ID `274T5WCVD2`, iOS 17+. Talks to the same `/api/f2/*` backend as the web app.

**Branding lives in [`branding/`](branding/BRANDING.md)** — the jelly dodo (since 2026-10-01): mascot, critters, palette, tokens, icon recipe. The icon PNGs in `AppIcon.appiconset` are composited from `scripts/dodo-jelly/out/dodo-1024.png`; regenerate all sizes together, never hand-edit one.

## Versioning: smallest possible increment, always

Every build that goes anywhere (device, Mac, TestFlight) takes the SMALLEST
version step that identifies it: bump the build number only, via
`./apps/feynd/bump-build.sh` — never the marketing version. The marketing
version (0.2 → 0.3…) moves only when Bart explicitly says so. TestFlight
submissions follow the same rule: same version train, next build number.

## Bump the build number on every build

**Run `./apps/feynd/bump-build.sh` before any build that lands on a device — phone, this Mac, or TestFlight.** No exceptions, and don't wait to be asked.

```bash
./apps/feynd/bump-build.sh          # 0.2 (3) -> 0.2 (4)
./apps/feynd/bump-build.sh 0.3      # also set the marketing version
```

It bumps `CURRENT_PROJECT_VERSION` in `project.yml` and runs `xcodegen generate`.

Why it matters: the version and build number show in **Settings → About**, next to a "Built" timestamp read off the binary itself. That row is how Bart checks whether the build he just installed is the one actually running. This is not hypothetical — a stale Mac process once kept serving an old UI through two "successful" installs, and there was no way to see it from inside the app. A frozen build number makes About lie.

The "Built" timestamp is automatic (it reads the executable's modification date), so it stays honest even if the bump is skipped. The build *number* is the part that needs the script.

After bumping, mention the new version in the message where you report the build — "installed 0.2 (4)".

## Building and installing

Simulator:
```bash
xcodebuild -project apps/feynd/Feynd.xcodeproj -scheme Feynd \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

Bart's iPhone — **since 2026-10-01 a new iPhone Air, device id `2435FC30-6E25-5A07-BAA2-989B3F93D4E1`** (UDID `00008150-000629943684401C`; the previous phone was `9FBCF85E-…`, which the commands below still show — use the new id, and check `xcrun devicectl list devices` when an install says the device can't be located). A development profile must list the phone: "feynd dev air" was re-minted that day with every device and all five development certs (`node apps/feynd/testflight/mint-profile.mjs --name "feynd dev air" --type IOS_APP_DEVELOPMENT --bundle L74V9QD69L --all-dev-certs --devices all`; add `--register-device <udid> --device-name …` for a phone the account has never seen; delete the stale same-named `.mobileprovision` from the profiles folder afterwards). The iMac's "feynd dev domains" predates the new phone and needs the same treatment. **Manual signing**, since the Associated Domains entitlement landed (2026-08-13): no Xcode account is signed in on these Macs, so `-allowProvisioningUpdates` fails ("No Accounts"). Signing is set ON THE TARGET in `project.yml` (since 2026-09-20), never on the command line: the ElevenLabs/LiveKit packages ship resource bundles, command-line build settings reach every target, and a resource bundle given a provisioning profile fails the build ("requires a development team" / "does not support provisioning profiles"). Debug device builds use the profile named by `FEYND_PROFILE` (default "feynd dev domains", the iMac's, expires 2027-08); Release uses "feynd appstore" and, for Catalyst, `FEYND_MAC_PROFILE` = "feynd catalyst appstore". A machine with a differently named profile passes `FEYND_PROFILE=…` — only the app target reads it. The MacBook Air's is **"feynd dev air"** (minted 2026-09-20 via the ASC API with key `FA7268Q94U` against bundle-ID resource `L74V9QD69L`, all four development certs, both registered iPhones; expires 2027-09). The minting flow is documented in `apps/taptapdodo/CLAUDE.md`.
```bash
xcodebuild -project apps/feynd/Feynd.xcodeproj -scheme Feynd \
  -destination 'generic/platform=iOS' -derivedDataPath <dd> build      # add "FEYND_PROFILE=feynd dev air" on the MacBook Air
xcrun devicectl device install app --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 <dd>/Build/Products/Debug-iphoneos/Feynd.app
xcrun devicectl device process launch --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 com.bartdecrem.Feynd
```
The first build on a machine can hang while Xcode downloads LiveKit's binary frameworks (it sat at 0 % CPU for 13 minutes on 2026-09-20 while `curl` fetched the same zips in 3 s). Fix: download the two URLs in the `webrtc-xcframework` and `livekit-uniffi-xcframework` checkouts' `Package.swift` into `~/Library/Caches/org.swift.swiftpm/artifacts/`, named as the URL with every non-alphanumeric character turned into `_`, and resolve again.
The entitlement applies to device builds only (`CODE_SIGN_ENTITLEMENTS[sdk=iphoneos*]` in project.yml) — simulator and Catalyst builds sign exactly as before.
Launch fails with `FBSOpenApplicationErrorDomain error 7` when the phone is locked — the install still succeeded; say so rather than treating it as a failure.

## Headless verification hooks (simulator + Catalyst Debug only, compiled out of device builds)

The marketing captures (site tour/hero, App Store shots, video) are driven by these same hooks from `scripts/dodo-scenes/scenes.json` — see that folder's README. A new screen that should appear in the showcase needs a hook here and one scene entry there.

`simctl launch` arguments for screenshot-driven verification without taps:
- `-TestLoginUser <u> -TestLoginPass <p>` — signs in during bootstrap (use the newx-test account, never Bart's). Point `Secrets.swift` at `.dev` first when the feature under test needs unpushed server code — and restore `.production` after.
- `-StartTab peck|chat|topics` — opens on that tab.
- `-voiceLongTurnWarnSeconds <n>` — the ElevenLabs engine's long-answer chime after n seconds of listening instead of ten minutes (log line `F2_ELEVEN_EV long-turn-warning`).
- `-PlayPentimento 1` (with `-StartTab peck`) — plays Pentimento, the level-10 payoff film (`PentimentoView.swift`, bundled `Feynd/Media/pentimento.mp4`, rendered from `apps/pentimento` with `--variant dodo`), as a replay; `-PlayPentimento 2` plays it as a first clear, so the Fern Hollow transition must follow when it closes. `-MockLevelCount 25 -ScrollToLevel 11` shows the cleared gate's "▶ Pentimento" sign.
- `-PlayPeckGame <5|15|…>` (with `-StartTab peck`) — opens that rest stop's Peck or Perish. Add `-PeckGameScene play|ship|over` to start a round on its own (a bot taps in `play`/`ship`; `over` runs straight into extinction) and `-PeckGameMockBoard 1` for a made-up board with no server round. These hooks also work in the Catalyst Debug binary.
- `-AutoPlayLevel <n>` — opens Peck level *n*'s set in text mode with zero taps (shows prefilled Peck credits when the account has them). Add `-AutoPlayMode mixed` to play it mixed instead (where cloze/fill-in-the-word questions live).
- `-OpenPebbles 1` — straight to the Pebbles quote carousel (needs `-StartTab peck`); add `-OpenPebbleAdd 1` to land on the save-a-quote form. `-TestPebblePhoto <host path to a jpg/png>` attaches it as the photo (downscale + preview); add `-TestPebbleSave 1` to auto-save it as an image pebble through the real multipart upload. Pair with `-AutoPlayLevel <n> -AutoFinishSet 1` instead to catch the grading screen's random quote.
- `-OpenTopic <threadId>` — push into that topic's detail (add `-FreshTopic 1` to show the first-session "give Dodo something to read" banner); add `-OpenFlashCards 1` for its flash hub, `-EditFirstCard 1` (+ `-ShowCardList 1`) for the card-edit sheet, or `-OpenTopicQuotes 1` for the per-topic Quotes shelf. `-OpenFinalReview 1` (with `-OpenTopic <id>`) starts the topic's final review as the user would (it connects a real voice session).
- `-OpenCommunity 1` — open the community-topics directory sheet from the Topics tab.
- `-OpenVoice 1` (with `-OpenTopic <id>`) — straight into that topic's voice session; `-voiceHoldToTalk 1` for push-to-talk. Add `-VoiceLiveTest 1` (also works with `-OpenFinalReview 1`) to run the GPT-Live drill: waits for `session.started` (PASS/FAIL `session-started`), nudges a greeting in Talk mode (scripted modes open on their own), waits for Dodo's words (`dodo-spoke`), measures inbound-rtp audio energy to prove sound actually arrives (`audio-arrived`), does one press/release in hold-to-talk (`ptt-settled`), then Ends and checks `session.closed` came back (`closed-gracefully`) and the transcript PATCH landed (`transcript-uploaded turns=N`). Read the `F2_LIVE_TEST` / `F2_LIVE_EV` / `F2_LIVE_EVENT_ERROR` lines via `xcrun simctl spawn <udid> log show --start "<time>" --predicate 'composedMessage CONTAINS "F2_LIVE"'`. Before the first run: `xcrun simctl privacy <udid> grant microphone com.bartdecrem.Feynd` (the permission alert otherwise blocks and, once shown, survives relaunches until the sim reboots) and `-recertEnabled 0`. The simulator mic is digitally silent, so the drill proves the protocol (connection, opening, audio out, close, upload), never the listening side — for that use `scripts/test-live-dodo.ts`, which speaks to the same session config over WebSocket. Test login: on the iMac M4 `-TestLoginUser $F2_IMAC_TEST_USER -TestLoginPass $F2_IMAC_TEST_PASS` (`newx-test-imac@example.com`, inserted straight into `f2_users` on 2026-09-21 because `F2_TEST_PASS` is not in the iMac's `.env.local`; it has one topic, `92d8ca2d-8834-4db1-94f0-89e9fa5717a6`; a fresh simulator also needs `-hasSeenOnboarding 1`); elsewhere `-TestLoginUser newx-test@example.com -TestLoginPass $F2_TEST_PASS` (`F2_TEST_PASS` in `.env.local`; the account's password was set to it on 2026-09-11). The Catalyst Debug binary ignores a HOME override and shares Bart's login, so don't run `-TestLoginUser` there.
- `-voiceEngine gpt-live` / `-voiceEngine eleven` — pick the engine for any of the voice hooks above (the same UserDefaults key the Profile picker writes). With neither, a fresh simulator runs ElevenLabs + Claude, the default since 2026-09-21 — so the GPT-Live drill above needs `-voiceEngine gpt-live`. The drill is the same one; the engine's own lines are tagged `F2_ELEVEN_*` (agent-ready, agent-state, PTT, transcript) and `audio-arrived` is measured on the rendered PCM of the agent's track. Needs the voice bridge running and pointed at the backend under test (`bash apps/dodo-voice-bridge/run.sh`; with `Secrets` on `.dev` = `http://localhost:3100` that is the "Dodo (dev)" engine, whose id is `ELEVEN_SPEECH_ENGINE_ID` in `.env.local`). For the listening side use `scripts/test-eleven-dodo.ts`.
- `-OpenFabMenu 1` — the Topics screen with the + held open (its "Ask across all topics" pill out); `-OpenGlobalChat 1` — straight into the full-screen global chat; add `-GlobalAsk "question"` to send one message. `-fabHoldHintShown 1` suppresses the one-time "Hold +" hint. See `docs/f2-global-chat.md`.
- `-TestSessionToken <signed f2_session value>` — sign in without the test password: `signSession('<test user id>')` from `src/lib/f2/auth.ts` makes the value (the backend must share that `.env.local`'s session secret, so: local dev). Against PRODUCTION use a guest's cookie value instead (`curl -si -X POST https://feynd.cc/api/f2/auth/guest` — it texts Bart, so reuse one and delete it after). Used on the MacBook Air, which has no `F2_TEST_PASS`.
- `-MockPeckDue N` — fake the weekly Peck deadline N days out (0 = today; fakes a 12-day streak when there is none) so the streak-at-risk banner (Peck + Topics, shows at N ≤ 1) and the flame modal's due line can be screenshotted. `-OpenStreakModal 1` — open the flame's status card without a tap. The real rule lives in `src/lib/f2/streak.ts`; `npx tsx scripts/f2-peck-week-check.ts` drives every transition against the test account (`--reset` zeroes it afterwards).
- `-HoldSplash 1` — pin the launch splash for screenshots. `-TickleDodo 1` — auto-play the map traveler's tickle.
- `-BackendURL http://localhost:3100` — point a simulator run at a local dev server whatever `Secrets.swift` says (the `-TestSessionToken` cookie follows it). With zsh, build the launch arguments as an array (`ARGS=(-TestSessionToken "$T" -BackendURL …); simctl launch … "${ARGS[@]}"`): an unquoted `$ARGS` string is NOT word-split by zsh, so every hook after the first silently becomes part of the first one's value (cost half an hour on 2026-10-01).
- `-OpenProfile 1` (with `-StartTab topics`) — the profile sheet; add `-OpenAvatarPicker 1` for the jelly avatar picker, or `-PickCritter bunny` (any `JellyCritter` raw value: `dodo`, `dodo-pink`, …, `bunny`, `octo`, …) to make that critter the avatar straight away through the real upload.
- `-MockLevelCount 30 -MockCurrentLevel 8` — a 30-level map standing on level 8 (9–30 locked); without `-MockCurrentLevel` the last level is the current one. `-OpenLevelSheet 1` opens the current level's start sheet. `-streakCelebrated 12` keeps the streak celebration from covering a `-MockPeckDue` map shot. `-ScrollToLevel N` is approximate (it can land a region away); no scroll hook = the bottom of the map, `-ScrollTop 1` = the castle.
- Dark-mode shots: the iOS 26.2 simulators on the MacBook Air ignore `simctl ui … appearance dark` for this app (2026-10-01); the iOS 26.0 iPhone 17 (`62B3A7D8-…`) follows it. `apps/feynd/.shots/mapshots.sh <light|dark>` and `moreshots.sh` are the map / sheet / transition capture loops used for the jelly rebrand (they need the local dev server and a token in `.shots/test-token.txt`; `.shots/` is not committed).
- `-ExportPeckWorld <host dir>` — write the Peck island scenery (the map's drawn-in-code background) to `<dir>/peck-world-10|20|30.png` at 3x, one file per region count. No sign-in needed; it's how the map art leaves the app for design handoff.
- `-NoSFX 1` — never start the flash sound-effects audio engine. The simulator's audio server can abort the process (AURemoteIO RPC timeout) when the engine first initialises, which kills any run that opens a flash set headlessly. The showcase capture in `scripts/dodo-scenes` passes it on every launch.
- `-SkipNotifPrompt 1` — suppress the recert notification-permission request so the system alert never covers screenshots. If the alert is already pending from a run without the flag, uninstall the app AND reboot the sim to clear it — it survives app relaunches.
- `dodo://peck` via `simctl openurl` exercises deep-link routing, but SpringBoard shows an "Open in Dodo?" dialog that can't be tapped headlessly and persists over the app until the sim reboots (`simctl shutdown` + `boot` clears it). Production uses the universal link `https://feynd.cc/peck` (AASA served by `/api/f2/aasa` via a next.config rewrite).

## TestFlight upload (worked end to end 2026-08-16, build 0.2 (41))

App Store Connect app record is **"Feynd"** (id 6773165027) — same bundle ID; Dodo is only the display name. Never create a new app record. The "internal" beta group has `hasAccessToAllBuilds`, so every processed build reaches internal testers automatically — do NOT try to add builds to it via the API (422).

```bash
./apps/feynd/bump-build.sh                      # unique CFBundleVersion per upload
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer   # RELEASE Xcode — ASC rejects beta-SDK uploads, and the beta is the selected default on this iMac
xcodebuild archive -project Feynd.xcodeproj -scheme Feynd \
  -destination 'generic/platform=iOS' -archivePath <path>/Feynd.xcarchive -configuration Release
  # signing comes from project.yml's Release config ("feynd appstore", Apple Distribution) — no overrides here
xcodebuild -exportArchive -archivePath <path>/Feynd.xcarchive \
  -exportOptionsPlist testflight/export.plist -exportPath <out> \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_5A5HNSWA33.p8 \
  -authenticationKeyID 5A5HNSWA33 -authenticationKeyIssuerID 69a6de80-eb13-47e3-e053-5b8c7c11a4d1
```

**From the MacBook Air** (worked end to end 2026-10-01, build 119): the Air has its own distribution cert, so its profile is **"feynd appstore air"** (`mint-profile.mjs --name "feynd appstore air" --type IOS_APP_STORE --bundle L74V9QD69L --cert-serial 16F68C261F3542F8691559D7E2F8DA87`, expires 2027-09). Archive with `"FEYND_PROFILE=feynd appstore air"` on the command line, export with `testflight/export-air.plist` and key `FA7268Q94U`, then `ASC_KEY_ID=FA7268Q94U node apps/feynd/testflight/asc-submit.mjs <build> IOS`. Xcode 26.2 (release) is the only Xcode there.

`testflight/export.plist` (checked in): method `app-store-connect`, destination `upload`, signingStyle manual, cert `Apple Distribution`, profile `feynd appstore`, teamID 274T5WCVD2.

One-beta-review-per-train: ASC 422s a new review submission while another
build of the same train is WAITING_FOR_REVIEW — expire the waiting one first.
But NEVER expire an APPROVED build until its replacement is itself APPROVED:
expiring the approved one leaves the public TestFlight link with no
installable build on that platform until review clears (this happened on
macOS with build 70 on 2026-08-28). Poll order per platform: upload new →
wait VALID → add to Testers group → expire any WAITING_FOR_REVIEW builds →
submit new for review → wait APPROVED → only then expire the old approved
build.

Standing facts: profile "feynd appstore" (uuid 66b0aaaa…, IOS_APP_STORE, expires 2027-08) is installed in `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`, minted via the ASC API against distribution cert 4YB38SZ2F2 (in this Mac's keychain). Device/sim builds are iPhone-only (`TARGETED_DEVICE_FAMILY[sdk=iphoneos*]` at TARGET level — project-level conditionals lose to the target's plain "1,2"). `ITSAppUsesNonExemptEncryption` and `NSCameraUsageDescription` (WebRTC links camera APIs) live in project.yml — removing either breaks processing. After upload run `node apps/feynd/testflight/asc-submit.mjs <buildNumber> [IOS|MAC_OS]` (platform defaults to IOS; pass `MAC_OS` for a Catalyst upload) — it polls until VALID, adds the build to the public Testers group, expires any other build WAITING_FOR_REVIEW, and submits for beta review. Poll `/v1/builds?filter[version]=N` until VALID; a processing rejection (e.g. 90683) only surfaces there, not at upload.

## TestFlight for Mac (Catalyst upload — worked end to end 2026-08-25, 0.2 (61))

Same app record as iOS; the Mac build shows under TestFlight's macOS side and
the internal group picks it up automatically. Testers install via the
TestFlight app on macOS.

```bash
./apps/feynd/bump-build.sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild archive -project Feynd.xcodeproj -scheme Feynd \
  -destination 'generic/platform=macOS,variant=Mac Catalyst' \
  -archivePath <path>/FeyndMac.xcarchive -configuration Release
  # signing comes from project.yml's Release config ("feynd catalyst appstore") — no overrides here
xcodebuild -exportArchive -archivePath <path>/FeyndMac.xcarchive \
  -exportOptionsPlist testflight/export-mac.plist -exportPath <out> \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_5A5HNSWA33.p8 \
  -authenticationKeyID 5A5HNSWA33 -authenticationKeyIssuerID 69a6de80-eb13-47e3-e053-5b8c7c11a4d1
```

`testflight/export-mac.plist` (checked in) = the iOS export.plist plus
`installerSigningCertificate: "3rd Party Mac Developer Installer"` — without that key the export fails with
a misleading "profile doesn't include signing certificate …Installer" error.

Standing facts:
- Profile "feynd catalyst appstore" (MAC_CATALYST_APP_STORE, expires 2027-03)
  minted via the ASC API against bundle-ID resource `L74V9QD69L` and
  distribution cert `4YB38SZ2F2`; installed in the user profiles dir.
- Installer cert `WUZK4CR87J` (MAC_INSTALLER_DISTRIBUTION, expires 2027-08) —
  key + cert live in this Mac's login keychain; it signs the upload .pkg.
- Release Catalyst builds are sandboxed via `Feynd/Feynd-macOS.entitlements`
  (App Store requirement), wired Release-only in project.yml so the local
  debug install in /Applications keeps its unsandboxed container (cookies,
  logins). Don't add the entitlements to Debug.
- `LSApplicationCategoryType` in project.yml is required for Mac uploads.
- The Peck world Canvas closure is split into `drawWorld` in
  FlashTabView.swift — the Catalyst RELEASE compile hits Swift's
  type-check-time limit if that code lives inline in the closure.

This Mac (Catalyst):
```bash
xcodebuild -project apps/feynd/Feynd.xcodeproj -scheme Feynd \
  -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath <dd> -allowProvisioningUpdates build
pkill -f "/Contents/MacOS/Feynd"            # REQUIRED — see below
rm -rf /Applications/Dodo.app
cp -R <dd>/Build/Products/Debug-maccatalyst/Feynd.app /Applications/Dodo.app
open -a /Applications/Dodo.app
```

The bundle is installed AS `Dodo.app` (built as Feynd.app, renamed in the
copy) — the Dock label follows the on-disk name, and CFBundleDisplayName
alone wasn't enough to shake "Feynd" out of it.

**Always `pkill` the running Mac app before copying.** A live process survives `rm -rf` of its bundle and `open -a` just reactivates it, so the new binary sits on disk unused and the app keeps showing the old UI. Confirm the relaunch by checking Settings → About shows the build you just made.

## `ENABLE_DEBUG_DYLIB: NO`

Bart's phone runs the iOS 27 beta, where Xcode's debug-dylib stub launch path aborts at startup (black screen). `project.yml` pins `ENABLE_DEBUG_DYLIB: NO` so device builds ship a single binary. Don't remove it.

## Secrets.swift

Gitignored (`Secrets.swift.example` is the template). `.production` → `https://feynd.cc`; `.dev` → the tunnel URL, or `http://localhost:3100` when driving the simulator against a local dev server. **Always restore it to `.production` before building for a real device.**

## Never install to the phone in the background

A device install replaces the bundle and KILLS the running app — a delayed
or retrying background install can land while Bart is mid-exam or
mid-session and destroy client-side state (a Final Review transcript died
this way on 2026-08-14). Install only synchronously, at the moment the
install was asked for. If the phone is locked, report that the install is
pending and stop — never leave a retry loop running.

## The jelly brand (2026-10-01)

The app was rebranded to the jelly dodo in one pass — see
`branding/BRANDING.md` for the mark, palette and tokens. Where things live:

- **Mascot:** `Feynd/JellyDodo.swift` draws it (`drawJellyDodo`, a native port
  of the `dodo` body in `misc/dodo-redesign/jelly-dodos.html`); `AnimatedDodo.swift`
  keeps the pose model, the moods and the views, and `drawAnimatedDodo` just
  forwards. `DodoPose` has `squint` and `mouth` since the jelly has a face
  the bird didn't. The splash choreography is the drop-and-squash in
  `LaunchSplashView.pose`. Peck or Perish's riso dodo (`PeckGameArt.drawDodo`)
  is deliberately not the jelly.
- **Critters + avatar:** `Feynd/JellyAvatar.swift` — `JellyCritter` (the
  catalog; `imageName` = `Jelly/<kind>`), `JellyAvatar.apply` (renders the
  critter on its tinted disc with `UIGraphicsImageRenderer`, uploads it as
  the profile picture, remembers kind + URL in UserDefaults so `ProfileBadge`
  and the profile hero draw the sprite locally while the server still serves
  that URL), `JellyAvatarDisc`, `JellyAvatarPicker` (the sheet; PhotosPicker on
  iOS, `.fileImporter` on Catalyst). The sprites come from
  `node scripts/dodo-jelly/sprites.mjs` (Playwright over the art pages, into
  `Assets.xcassets/Jelly/`, namespaced) — rerun it after the art changes.
- **Launch screen:** the icon's ground, full bleed — sunrise peach
  (`#FFECD6 → #FFC9A6`) by day, the same sky at dusk (`#3A2850 → #17131D`) in
  dark mode — so icon → launch is one picture; `LaunchBackground` (the
  system launch colour shown before SwiftUI draws) is the gradient's middle.
  The first cut was the lavender paper and Bart asked "is white background
  the right design call??" — it wasn't.
- **Theme:** `FeyndTheme.swift` tokens; `inkOnAccent` is adaptive now (white on
  the deep daytime sky, sea-ink on the bright night one). `LaunchBackground`
  colourset matches `bg`.
- **Map:** `PeckJelly.swift` holds the shared jelly drawing (gloss balls,
  ribbons, signs, chests, candy trees, mountains, islands) and the SwiftUI
  pieces (`JellyNodeView`, `JellyChestView`, the critter seats); regions are
  Gumdrop Meadow / Jelly Lagoon / Sprinkle Peaks, with Sugar Castle on a
  cloud bank ABOVE the last level (`PeckFinale` in `PeckTrail.swift`: the
  world has 590pt of finale above the top stone, so the castle clears the
  floating header when the map is scrolled to the top). The traveler stands
  ON the current stone (`PeckGeometry.travelerPoint`), START hangs under it,
  the due board beside it. Chests open with a tap once their level is passed
  (UserDefaults `peckChestsOpened`; no currency behind them). Critters along
  the trail squish on a tap and offer "Make this my avatar" on a long press.
  Dark mode is a moonlit filter over the scenery (`Jelly.dusk`: reds and
  greens roughly halved, blues kept) while unlocked stones, critters and the
  traveler keep their day colours and glow; the region-crossing scene is a
  daytime postcard in both modes. The Peck header follows the system scheme
  (the old "night chrome over Starfall" switch is gone with the night region).
- **Icon:** composited by PIL from `scripts/dodo-jelly/out/dodo-1024.png`
  (BRANDING.md has the recipe).

