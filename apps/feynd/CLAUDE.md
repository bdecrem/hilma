# Dodo (iOS + Mac Catalyst)

Native client for F2. **The app's product name is Dodo** — that's the springboard name (`CFBundleDisplayName`), the in-app name, and the brand. The folder, scheme, bundle ID, and type names remain `Feynd` (renaming them would churn provisioning and every build command for zero user-visible gain). SwiftUI + XcodeGen — `project.yml` is the source of truth, `Feynd.xcodeproj` is generated. Bundle ID `com.bartdecrem.Feynd`, Team ID `274T5WCVD2`, iOS 17+. Talks to the same `/api/f2/*` backend as the web app.

**Branding lives in [`branding/`](branding/BRANDING.md)** — the bookworm-dodo mark, app icon SVG source, Fredoka text mark spec, and the official color palette (dark "slate ink" / light "butter paper", marigold accent). The app icon PNGs are rendered from `branding/dodo-icon.svg` via `rsvg-convert`; regenerate all sizes from there, never hand-edit the PNGs.

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

Bart's iPhone (device id `9FBCF85E-F1E3-5646-93DC-F51E897B1C27`) — **manual signing required** since the Associated Domains entitlement landed (2026-08-13): no Xcode account is signed in on this iMac, so `-allowProvisioningUpdates` fails ("No Accounts") and the old auto team profile lacks the capability anyway. Use the ASC-minted profile "feynd dev domains" (expires 2027-08, includes `applinks:feynd.cc`; the minting flow is documented in `apps/taptapdodo/CLAUDE.md` — same key, Feynd bundle-ID resource `L74V9QD69L`):
```bash
xcodebuild -project apps/feynd/Feynd.xcodeproj -scheme Feynd \
  -destination 'generic/platform=iOS' -derivedDataPath <dd> \
  CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=feynd dev domains" \
  "CODE_SIGN_IDENTITY=Apple Development" build
xcrun devicectl device install app --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 <dd>/Build/Products/Debug-iphoneos/Feynd.app
xcrun devicectl device process launch --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 com.bartdecrem.Feynd
```
The entitlement applies to device builds only (`CODE_SIGN_ENTITLEMENTS[sdk=iphoneos*]` in project.yml) — simulator and Catalyst builds sign exactly as before.
Launch fails with `FBSOpenApplicationErrorDomain error 7` when the phone is locked — the install still succeeded; say so rather than treating it as a failure.

## Headless verification hooks (simulator + Catalyst Debug only, compiled out of device builds)

The marketing captures (site tour/hero, App Store shots, video) are driven by these same hooks from `scripts/dodo-scenes/scenes.json` — see that folder's README. A new screen that should appear in the showcase needs a hook here and one scene entry there.

`simctl launch` arguments for screenshot-driven verification without taps:
- `-TestLoginUser <u> -TestLoginPass <p>` — signs in during bootstrap (use the newx-test account, never Bart's). Point `Secrets.swift` at `.dev` first when the feature under test needs unpushed server code — and restore `.production` after.
- `-StartTab peck|chat|topics` — opens on that tab.
- `-AutoPlayLevel <n>` — opens Peck level *n*'s set in text mode with zero taps (shows prefilled Peck credits when the account has them). Add `-AutoPlayMode mixed` to play it mixed instead (where cloze/fill-in-the-word questions live).
- `-OpenPebbles 1` — straight to the Pebbles quote carousel (needs `-StartTab peck`); add `-OpenPebbleAdd 1` to land on the save-a-quote form. `-TestPebblePhoto <host path to a jpg/png>` attaches it as the photo (downscale + preview); add `-TestPebbleSave 1` to auto-save it as an image pebble through the real multipart upload. Pair with `-AutoPlayLevel <n> -AutoFinishSet 1` instead to catch the grading screen's random quote.
- `-OpenTopic <threadId>` — push into that topic's detail (add `-FreshTopic 1` to show the first-session "give Dodo something to read" banner); add `-OpenFlashCards 1` for its flash hub, `-EditFirstCard 1` (+ `-ShowCardList 1`) for the card-edit sheet, or `-OpenTopicQuotes 1` for the per-topic Quotes shelf.
- `-OpenCommunity 1` — open the community-topics directory sheet from the Topics tab.
- `-OpenVoice 1` (with `-OpenTopic <id>`) — straight into that topic's voice session; `-voiceHoldToTalk 1` for push-to-talk. Add `-VoiceCutInTest 1` to run the scripted hold-to-talk drill: it injects text user turns (`debugSay`) since the sim mic is silent, cuts into Dodo's live audio with a topic change, measures inbound-rtp audio energy to prove the old reply stops arriving (PASS/FAIL `old-audio-stopped`), checks the reply answers the new question (PASS/FAIL `new-question-answered`), then taps mid-speech (PASS/FAIL `tap-stayed-quiet`) and read `F2_REALTIME_TEST` / `F2_REALTIME_CUT_IN` / `F2_REALTIME_EVENT_ERROR` in the sim log — the notification prompt is skipped with `-recertEnabled 0`. The simulator mic is digitally silent (WebRTC media-source audioLevel stays 0), so the drill exercises the protocol, not the speech gate: a release only commits when the press lasted ≥350ms and mean mic power (`-PTTMinPower`, default 3e-4) was reached — silent taps/holds just stop Dodo. Check `F2_REALTIME_PTT release … power=` on a real device to tune. The Catalyst Debug binary ignores a HOME override and shares Bart's login, so don't run `-TestLoginUser` there.
- `-HoldSplash 1` — pin the launch splash for screenshots. `-TickleDodo 1` — auto-play the map traveler's tickle.
- `-NoSFX 1` — never start the flash sound-effects audio engine. The simulator's audio server can abort the process (AURemoteIO RPC timeout) when the engine first initialises, which kills any run that opens a flash set headlessly. The showcase capture in `scripts/dodo-scenes` passes it on every launch.
- `-SkipNotifPrompt 1` — suppress the recert notification-permission request so the system alert never covers screenshots. If the alert is already pending from a run without the flag, uninstall the app AND reboot the sim to clear it — it survives app relaunches.
- `dodo://peck` via `simctl openurl` exercises deep-link routing, but SpringBoard shows an "Open in Dodo?" dialog that can't be tapped headlessly and persists over the app until the sim reboots (`simctl shutdown` + `boot` clears it). Production uses the universal link `https://feynd.cc/peck` (AASA served by `/api/f2/aasa` via a next.config rewrite).

## TestFlight upload (worked end to end 2026-08-16, build 0.2 (41))

App Store Connect app record is **"Feynd"** (id 6773165027) — same bundle ID; Dodo is only the display name. Never create a new app record. The "internal" beta group has `hasAccessToAllBuilds`, so every processed build reaches internal testers automatically — do NOT try to add builds to it via the API (422).

```bash
./apps/feynd/bump-build.sh                      # unique CFBundleVersion per upload
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer   # RELEASE Xcode — ASC rejects beta-SDK uploads, and the beta is the selected default on this iMac
xcodebuild archive -project Feynd.xcodeproj -scheme Feynd \
  -destination 'generic/platform=iOS' -archivePath <path>/Feynd.xcarchive -configuration Release \
  CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=feynd appstore" \
  "CODE_SIGN_IDENTITY=Apple Distribution"
xcodebuild -exportArchive -archivePath <path>/Feynd.xcarchive \
  -exportOptionsPlist testflight/export.plist -exportPath <out> \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_5A5HNSWA33.p8 \
  -authenticationKeyID 5A5HNSWA33 -authenticationKeyIssuerID 69a6de80-eb13-47e3-e053-5b8c7c11a4d1
```

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
  -archivePath <path>/FeyndMac.xcarchive -configuration Release \
  CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=feynd catalyst appstore" \
  "CODE_SIGN_IDENTITY=Apple Distribution"
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
