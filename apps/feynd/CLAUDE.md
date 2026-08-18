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

## Headless verification hooks (simulator only, compiled out of device builds)

`simctl launch` arguments for screenshot-driven verification without taps:
- `-TestLoginUser <u> -TestLoginPass <p>` — signs in during bootstrap (use the newx-test account, never Bart's). Point `Secrets.swift` at `.dev` first when the feature under test needs unpushed server code — and restore `.production` after.
- `-StartTab peck|chat|topics` — opens on that tab.
- `-AutoPlayLevel <n>` — opens Peck level *n*'s set in text mode with zero taps (shows prefilled Peck credits when the account has them).
- `-OpenPebbles 1` — straight to the Pebbles quote carousel; add `-OpenPebbleAdd 1` to land on the save-a-quote form. Pair with `-AutoPlayLevel <n> -AutoFinishSet 1` instead to catch the grading screen's random quote.
- `-OpenTopic <threadId>` — push into that topic's detail; add `-OpenFlashCards 1` for its flash hub, `-EditFirstCard 1` (+ `-ShowCardList 1`) for the card-edit sheet, or `-OpenTopicQuotes 1` for the per-topic Quotes shelf.
- `-HoldSplash 1` — pin the launch splash for screenshots. `-TickleDodo 1` — auto-play the map traveler's tickle.
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
  -exportOptionsPlist export.plist -exportPath <out> \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_5A5HNSWA33.p8 \
  -authenticationKeyID 5A5HNSWA33 -authenticationKeyIssuerID 69a6de80-eb13-47e3-e053-5b8c7c11a4d1
```

export.plist: method `app-store-connect`, destination `upload`, signingStyle manual, cert `Apple Distribution`, profile `feynd appstore`, teamID 274T5WCVD2.

Standing facts: profile "feynd appstore" (uuid 66b0aaaa…, IOS_APP_STORE, expires 2027-08) is installed in `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`, minted via the ASC API against distribution cert 4YB38SZ2F2 (in this Mac's keychain). Device/sim builds are iPhone-only (`TARGETED_DEVICE_FAMILY[sdk=iphoneos*]` at TARGET level — project-level conditionals lose to the target's plain "1,2"). `ITSAppUsesNonExemptEncryption` and `NSCameraUsageDescription` (WebRTC links camera APIs) live in project.yml — removing either breaks processing. Poll `/v1/builds?filter[version]=N` until VALID; a processing rejection (e.g. 90683) only surfaces there, not at upload.

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
