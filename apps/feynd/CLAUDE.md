# Feynd (iOS + Mac Catalyst)

Native client for F2. SwiftUI + XcodeGen — `project.yml` is the source of truth, `Feynd.xcodeproj` is generated. Bundle ID `com.bartdecrem.Feynd`, Team ID `274T5WCVD2`, iOS 17+. Talks to the same `/api/f2/*` backend as the web app.

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

Bart's iPhone (device id `9FBCF85E-F1E3-5646-93DC-F51E897B1C27`):
```bash
xcodebuild -project apps/feynd/Feynd.xcodeproj -scheme Feynd \
  -destination 'platform=iOS,id=9FBCF85E-F1E3-5646-93DC-F51E897B1C27' \
  -derivedDataPath <dd> -allowProvisioningUpdates build
xcrun devicectl device install app --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 <dd>/Build/Products/Debug-iphoneos/Feynd.app
xcrun devicectl device process launch --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 com.bartdecrem.Feynd
```
Launch fails with `FBSOpenApplicationErrorDomain error 7` when the phone is locked — the install still succeeded; say so rather than treating it as a failure.

This Mac (Catalyst):
```bash
xcodebuild -project apps/feynd/Feynd.xcodeproj -scheme Feynd \
  -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath <dd> -allowProvisioningUpdates build
pkill -f "Feynd.app/Contents/MacOS/Feynd"   # REQUIRED — see below
rm -rf /Applications/Feynd.app
cp -R <dd>/Build/Products/Debug-maccatalyst/Feynd.app /Applications/
open -a /Applications/Feynd.app
```

**Always `pkill` the running Mac app before copying.** A live process survives `rm -rf` of its bundle and `open -a` just reactivates it, so the new binary sits on disk unused and the app keeps showing the old UI. Confirm the relaunch by checking Settings → About shows the build you just made.

## `ENABLE_DEBUG_DYLIB: NO`

Bart's phone runs the iOS 27 beta, where Xcode's debug-dylib stub launch path aborts at startup (black screen). `project.yml` pins `ENABLE_DEBUG_DYLIB: NO` so device builds ship a single binary. Don't remove it.

## Secrets.swift

Gitignored (`Secrets.swift.example` is the template). `.production` → `https://feynd.cc`; `.dev` → the tunnel URL, or `http://localhost:3100` when driving the simulator against a local dev server. **Always restore it to `.production` before building for a real device.**
