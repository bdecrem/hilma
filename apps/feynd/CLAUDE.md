# Dodo (iOS + Mac Catalyst)

Native client for F2. **The app's product name is Dodo** — that's the springboard name (`CFBundleDisplayName`), the in-app name, and the brand. The folder, scheme, bundle ID, and type names remain `Feynd` (renaming them would churn provisioning and every build command for zero user-visible gain). SwiftUI + XcodeGen — `project.yml` is the source of truth, `Feynd.xcodeproj` is generated. Bundle ID `com.bartdecrem.Feynd`, Team ID `274T5WCVD2`, iOS 17+. Talks to the same `/api/f2/*` backend as the web app.

**Branding lives in [`branding/`](branding/BRANDING.md)** — the bookworm-dodo mark, app icon SVG source, Fredoka text mark spec, and the official color palette (dark "slate ink" / light "butter paper", marigold accent). The app icon PNGs are rendered from `branding/dodo-icon.svg` via `rsvg-convert`; regenerate all sizes from there, never hand-edit the PNGs.

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
- `dodo://peck` via `simctl openurl` exercises deep-link routing, but SpringBoard shows an "Open in Dodo?" dialog that can't be tapped headlessly and persists over the app until the sim reboots (`simctl shutdown` + `boot` clears it). Production uses the universal link `https://feynd.cc/peck` (AASA served by `/api/f2/aasa` via a next.config rewrite).

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
