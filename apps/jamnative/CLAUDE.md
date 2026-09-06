# Jambot native (iOS + Mac Catalyst) — build/run playbook

Read `DESIGN.md` first (architecture, bridge contract, screens) and
`PROGRESS.md` (what's done, what's next). This file is the mechanical
how-to; those two are the source of truth for what the app should do.

## Setup

```bash
cd apps/jamnative
cp Jambot/Secrets.swift.example Jambot/Secrets.swift   # gitignored; defaults to https://jambot.to
xcodegen generate
```

`project.yml` is the source of truth; `.xcodeproj` is generated and
committed like Feynd's. Re-run `xcodegen generate` after adding/removing
files or changing `project.yml`.

## Build

```bash
# iOS Simulator
xcodebuild -project Jambot.xcodeproj -scheme Jambot \
  -destination 'platform=iOS Simulator,name=iPhone 16' build

# Mac Catalyst
xcodebuild -project Jambot.xcodeproj -scheme Jambot \
  -destination 'platform=macOS,variant=Mac Catalyst' build

# Device/signing sanity (arm64-specific issues the simulator misses)
xcodebuild -project Jambot.xcodeproj -scheme Jambot \
  -destination 'generic/platform=iOS' build
```

Must print `** BUILD SUCCEEDED **` before declaring anything done.

## Simulator run loop

```bash
xcrun simctl boot "iPhone 16"                     # skips if already booted
xcrun simctl install "iPhone 16" <DerivedData>/Build/Products/Debug-iphonesimulator/Jambot.app
xcrun simctl launch "iPhone 16" com.bartdecrem.Jambot
xcrun simctl io "iPhone 16" screenshot apps/jamnative/.shots/whatever.png
```

`<DerivedData>` — find it with:
```bash
xcodebuild -project Jambot.xcodeproj -scheme Jambot -showBuildSettings \
  -destination 'platform=iOS Simulator,name=iPhone 16' 2>/dev/null | grep -m1 BUILT_PRODUCTS_DIR
```

Screenshots go under `apps/jamnative/.shots/` (gitignored) — never outside
this folder.

## Rules (see also the top-level task brief this project was scaffolded from)

- Never name an app-bundle subfolder "Resources" — breaks device codesign.
- `ENABLE_DEBUG_DYLIB: NO` always — Bart's phone runs an iOS beta where the
  debug-dylib stub launch path black-screens at startup.
- Run `./bump-build.sh` before any build that lands on a device.
- Backend is **production** (`jambot.to`). Only sign in as `jamtest` /
  `jamtest1` from the simulator or a dev build — never Bart's own account
  (`bart`) from anything but the shipped, reviewed app.
- Don't touch `../../public/jam/jambot-web.js` from this app — it's hilma's
  committed engine bundle, referenced by path in `project.yml`. If it needs
  to change, that happens in hilma (`pnpm jam:build`), not here.

## Where the engine bundle comes from

`Jambot/Engine/` holds `engine.html` + `engine-bridge.js`, loaded into a
hidden `WKWebView` alongside `jambot-web.js` — which `project.yml`
references directly from `../../public/jam/jambot-web.js` (hilma's build
output) rather than copying it in. After any jambot change that should reach
this app, someone runs `pnpm jam:build` in hilma, commits the refreshed
bundle, and the next Jambot native build picks it up automatically (no
change needed here).

## Verify checklist (full detail in `DESIGN.md` → "Verify")

1. `xcodegen generate`
2. iOS Simulator build succeeds
3. Catalyst build succeeds
4. Simulator: launch shows the placeholder/real screen for whatever stage is
   current; screenshot to `.shots/`
5. Once the real engine + screens land (stage 3): sign in as `jamtest`, open
   "SEQ TEST techno copy", Play, move a fader, send a chat message
6. Background-audio go/no-go: start playback, background the app, confirm
   audio continues; trigger a render while backgrounded and confirm it
   completes

## Headless verification (no screen control)

Everything is driven with launch arguments; nothing needs a tap. The shell side is
`tooling/sim-run.sh <tag> <launch args…>` (installs the last simulator build on
"iPhone 16" — or `SIM_DEV="iPhone SE 3"` for the 375 pt width check — launches, services the `shot:<name>` handshake into `.shots/<tag>/`,
prints the script log) and `tooling/catalyst-run.sh` for the Mac build.

```bash
# Studio: open a track and run steps (full vocabulary at the top of UI/StudioScript.swift)
tooling/sim-run.sh s-seq -autoLogin jamtest jamtest1 -openTrack "SEQ TEST techno copy" \
  -studioScript "play;wait:3;controls;tab:seq;seq:inst:jt90;seq:section:1;seq:tap:kick:2;pattern:jt90:1;shot:kick2;scope;closeControls;bounce:wav;back"
# Library: duplicate/delete, catalog + public player + remix, About (UI/LibraryScript.swift)
tooling/sim-run.sh s-lib -autoLogin jamtest jamtest1 \
  -libraryScript "list;duplicate:SEQ TEST techno copy;deleteLast;openCatalog:Exp1;player:play;wait:3;remix;closeStudio;deleteLast;about;shot:about"
```

Launch args: `-autoLogin <user> <pass>`, `-openTrack "<title>"`, `-openControls`,
`-studioScript "<steps>"`, `-libraryScript "<steps>"`, `-studioScriptLog <file>`,
`-studioShotDir <dir>`, `-studioExportDir <dir>` (where `bounce:wav|aac` writes),
`-openAbout`, `-openCatalogTrack "<title>"`, `-previewBounce`, `-mockEngine`,
`-forceSignedOut` (login screen, cookie dropped), `-loginScroll catalog`. Library steps
`new` (creates a track, opens Studio and waits for the `-studioScript` to `back`),
`scroll:catalog`, `appearance[:system|light|dark]` (logs stored setting + the window's
effective style); studio steps `openBounce` / `closeBounce`. Give UserDefaults a second
before the harness reinstalls (`appearance:dark;wait:2`) — `simctl install` migrates the
container and can outrun cfprefsd.
Standalone harnesses (each replaces the app UI): `-engineSmoke` (+`-engineSmokeAgent`
/ `-engineSmokeBackground` / `-engineSmokeSeq`), `-seqPreview` (+`-seqScript`,
`-seqShotDir`), `-panelsPreview` (+`-panelsPreviewOpen <id|none>`, `-panelsPreviewKnob`),
`-audioSmoke`, `-exportSmoke` (+`-exportSmokeDir <dir>`; check the files with `afinfo`).

Timing evidence lives in the unified log:
`xcrun simctl spawn "iPhone 16" log show --predicate 'subsystem == "com.bartdecrem.Jambot"' --last 5m --style compact`
(categories `studio`, `cache`, `engine`, `audio`, `script`, `library`).

Catalyst window screenshots need Screen Recording access for the terminal
(`screencapture -l <window id>` otherwise says "could not create image from window");
`tooling/catalyst-run.sh` still runs the script and prints the log, and the window
bounds can be checked with a `CGWindowListCopyWindowInfo` one-liner.

## Design system (stage 11)

`Jambot/UI/Keys.swift` holds the shared controls that mirror `src/app/jam/jam.css`:
`JBKeyStyle` (`.jb-key` — variants orange/ghost/panel/green/ink, sizes `.regular` 48 /
`.small` 34 / `.xs` 28, `square:`, `wide:`; lip + press sink + disabled 0.35),
`JBWordmark`, `JBEyebrow` + `JBGroupRow` (label · rule · trailing keys), `JBSheetHeader`
(every sheet's header: title, optional LED status, DONE key, optional second row),
`JBLed`, `JBFader` (cobalt cap), `JBMSKeys`, `JBTag`, `.jbCard()`, `.jbField()`. Raw
colour/font tokens stay in `Theme.swift`. Keys use the body face (SF, uppercase,
0.12em) like the web's shipped keys; silkscreen labels use the condensed face.
Reference shots of the web app: `JAM_URL=https://jambot.to node scripts/jam/shoot-web-ref.mjs`
(→ `.shots/web/`), to compare against `tooling/sim-run.sh` shots.

## What the app does (stage 10)

Login → Library (your tracks with "…" Duplicate/Delete, "+ New track", the public
catalog "FROM EVERYONE" → read-only player with Play + Remix, gear → About) → Studio
(header: back · Share · Publish/Unpublish over the tap-to-rename title; chat with the
agent; transport: Play/Stop, "bar n/N" or "section k · bar n/N", LED strip, Bounce
(WAV / AAC share sheet), Controls). Controls sheet: Faders · Panels · Seq (remembered
in UserDefaults `jam.controlsMode`); Panels = per-synth panels with hit LEDs polled from
the engine each 16th while the tab is up; Seq = the step sequencer with section
audition ("Loop section" → `render(.section)`), edits re-render in 300 ms, autosave, and
a coalesced `[controls]` note for the next message. Renders are cached on device
(`Caches/renders/<trackId>.pcm`, keyed by session JSON + engine stamp) so reopening an
unchanged track plays instantly; the lock screen shows the track (Now Playing +
remote play/pause). Keyboard: Space play/stop, ⌘↩ send, ⌘K controls, ⌘, About.

## Device install (no Apple ID in Xcode on this Mac)

Profiles are minted through the App Store Connect API, same as Tap Tap Dodo:

```bash
python3 scripts/ios/asc-dev-profile.py com.bartdecrem.Jambot "Jambot dev" 00008150-000038820EFB801C   # once per year / new device
./bump-build.sh
xcodebuild -project Jambot.xcodeproj -scheme Jambot -destination 'generic/platform=iOS' \
  -derivedDataPath build-device CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=Jambot dev" \
  "CODE_SIGN_IDENTITY=Apple Development" build
xcrun devicectl device install app --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 build-device/Build/Products/Debug-iphoneos/Jambot.app
xcrun devicectl device process launch --device 9FBCF85E-F1E3-5646-93DC-F51E897B1C27 com.bartdecrem.Jambot   # phone must be unlocked
```

Bundle id `A43853Z8U5`, profile "Jambot dev" (expires 2027-09-06), certificate `9AYMK558AW` (the keychain's Apple Development: Bart Decrem). `build-device/` is gitignored.

## TestFlight (iOS + Mac; worked end to end 2026-09-06, build 0.1 (6))

App Store Connect app record: **"Jambot: talk, groove."**, id `6809181971`, bundle
`com.bartdecrem.Jambot`, SKU `20260905` (created by Bart in the ASC web UI — the API
cannot create app records). Beta group **"Public"** (`d0521115-2fda-442f-89d2-8bf9ffc93c06`),
public link on, limit 1000: https://testflight.apple.com/join/gDfvCAp1 — the link
installs once a build in the group is approved by beta review.

```bash
cd apps/jamnative
./bump-build.sh                                                     # unique CFBundleVersion per upload
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer     # RELEASE Xcode — ASC rejects beta-SDK uploads
KEY="-authenticationKeyPath $HOME/.appstoreconnect/private_keys/AuthKey_5A5HNSWA33.p8 -authenticationKeyID 5A5HNSWA33 -authenticationKeyIssuerID 69a6de80-eb13-47e3-e053-5b8c7c11a4d1"

# iOS
xcodebuild archive -project Jambot.xcodeproj -scheme Jambot -destination 'generic/platform=iOS' \
  -archivePath build-testflight/Jambot.xcarchive -configuration Release \
  CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=Jambot appstore" "CODE_SIGN_IDENTITY=Apple Distribution"
xcodebuild -exportArchive -archivePath build-testflight/Jambot.xcarchive \
  -exportOptionsPlist testflight/export.plist -exportPath build-testflight/ipa $KEY      # → Jambot.ipa
xcrun altool --upload-app -f build-testflight/ipa/Jambot.ipa -t ios \
  --apiKey 5A5HNSWA33 --apiIssuer 69a6de80-eb13-47e3-e053-5b8c7c11a4d1
node testflight/asc-submit.mjs <buildNumber> IOS

# Mac (Catalyst) — same app record, shows under TestFlight's macOS side
xcodebuild archive -project Jambot.xcodeproj -scheme Jambot -destination 'generic/platform=macOS,variant=Mac Catalyst' \
  -archivePath build-testflight/JambotMac.xcarchive -configuration Release \
  CODE_SIGN_STYLE=Manual "PROVISIONING_PROFILE_SPECIFIER=Jambot catalyst appstore" "CODE_SIGN_IDENTITY=Apple Distribution"
xcodebuild -exportArchive -archivePath build-testflight/JambotMac.xcarchive \
  -exportOptionsPlist testflight/export-mac.plist -exportPath build-testflight/pkg $KEY   # → Jambot.pkg
xcrun altool --upload-app -f build-testflight/pkg/Jambot.pkg -t macos \
  --apiKey 5A5HNSWA33 --apiIssuer 69a6de80-eb13-47e3-e053-5b8c7c11a4d1
node testflight/asc-submit.mjs <buildNumber> MAC_OS
```

`testflight/asc-submit.mjs <build> [IOS|MAC_OS]` polls until the build is VALID, fills the
beta-review metadata if empty (contact Bart, demo account `jamtest` / `jamtest1`, en-US beta
description), makes sure the "Public" group exists with its public link on, adds the build,
expires any other build of that platform still WAITING_FOR_REVIEW (never an approved one),
submits for beta review and prints the public link. `xcrun altool --validate-app` with the
same flags checks a package without uploading.

Standing facts:
- Profiles (minted with `python3 scripts/ios/asc-profile.py com.bartdecrem.Jambot "<name>" <kind>`,
  installed in `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`): "Jambot appstore"
  (IOS_APP_STORE, uuid `9ae09204-fbc4-4013-8ce9-70cc877fba3d`), "Jambot catalyst appstore"
  (MAC_CATALYST_APP_STORE, uuid `f8874e55-2e59-43c8-b58e-78dfd18d4292`, `.provisionprofile`),
  "Jambot dev" (uuid `ffe142d9-95c3-4c75-b7e2-f8bd719d380b`). All against the keychain's
  "Apple Distribution: Bart Decrem" / "Apple Development: Bart Decrem" (team 274T5WCVD2).
- Installer cert `WUZK4CR87J` ("3rd Party Mac Developer Installer") signs the Mac .pkg;
  `export-mac.plist` names it via `installerSigningCertificate`.
- Release Catalyst builds are sandboxed by `Jambot/Jambot-macOS.entitlements`
  (app-sandbox, network.client, files.user-selected.read-write), wired Release-only in
  `project.yml` — `altool --validate-app` rejects an unsandboxed Mac package ("App sandbox
  not enabled"). Debug Catalyst builds stay unsandboxed.
- `ITSAppUsesNonExemptEncryption: false` and `LSApplicationCategoryType` in `project.yml`
  are required for processing; keep them.
- `build-testflight/` is gitignored (archives, ipa, pkg, logs).

## Branding (app icon, launch screen)

The app icon is the **monogram** (the "J" with the orange LED) from
`misc/jambotlogos/` — the grid mark is a UI motif only. `AppIcon.appiconset` is the
iOS 18 single-size set: `icon-1024.png` (light = `jambot-monogram-light.png`),
`icon-1024-dark.png` (`luminosity: dark` = `jambot-monogram-dark.png`),
`icon-1024-tinted.png` (`luminosity: tinted` = grayscale + alpha of
`jambot-monogram-dark-transparent.png` from `jambot-icons.zip`), plus the
`ios-marketing` entry. `branding/` keeps the three 1024 sources and
`icon-preview.png` (60/120/180 on light/dark/tinted grounds). To regenerate, copy the
PNGs again; there is no generator script any more (the old `make_icon.py` wordmark
icon is retired).

If the Dock shows the old icon for the Debug Catalyst app (its DerivedData path is pinned in
Bart's Dock), the bundle is fine — it is the Dock/IconServices cache. Flush it:
`lsregister -f <app>` (`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister`),
`touch <app>`, `rm -rf /private/var/folders/*/*/C/com.apple.iconservices*`, `killall Dock iconservicesagent`.
Verified 2026-09-06: the built `AppIcon.icns` was the monogram all along.

`Jambot/Assets.xcassets/LaunchBackground.colorset` carries the panel colour for both
appearances (`#DCDFD8` light / `#1B1D20` dark) used by `UILaunchScreen` in
`project.yml` — no image, just the background colour.

## Appearance (dark / light)

Every `JBTheme` colour token is dynamic (`Theme.swift` → `dynamic(light, dark)` builds a
`Color(uiColor: UIColor { trait in … })`), so views never branch on the scheme. About →
Appearance (System / Light / Dark) writes `UserDefaults["jam.appearance"]`;
`.jbAppearance()` applies it with `.preferredColorScheme` on `RootView` **and on every
sheet's content** (sheets are their own presentation). Rules when adding UI: solid ink
keys use `keyFill / keyLabel / keyLip` (never `ink` + `.white`/`.black`), paper keys use
`panel4` + `panelKeyLip` + `highlight`, labels on orange use `onOrange`, fields pass their
placeholder through `jbPrompt()` (the system placeholder colour flips in dark mode), and
sheets get `.presentationBackground(JBTheme.panel)`. The synth panel skins
(`PanelPalette`) are fixed dark instruments in both modes. Shoot both modes with
`tooling/shoot-screens.sh dark|light` (→ `.shots/final-<mode>/`; `SIM_DEV="iPhone SE 3"`
for 375 pt) and look at every PNG.

## Catalyst + keyboard shortcuts (wired in stage 10)

- `Jambot/UI/CatalystSupport.swift` — `View.catalystWindowChrome(title:)` sets the Mac
  window's min size (390×700) and a one-time default size (430×860) via
  `UIWindowScene.sizeRestrictions`; no-op on iOS/iPadOS. `View.columnWidth(_:)` /
  `ColumnWidth` centres content in a max-720pt column on regular-width layouts
  (iPad landscape, wide Catalyst window), matching `jam.css`'s wide-viewport rule.
  Applied: `.catalystWindowChrome()` on `RootView`, `.columnWidth()` on Studio and the
  Library. The default size is requested with `requestGeometryUpdate(.Mac(systemFrame:))`
  (setting the UIWindow frame did nothing on Catalyst) plus a 0.6 s retry because AppKit's
  window restoration can land after the first appearance.
- `Jambot/UI/KeyboardShortcuts.swift` — `View.jambotSendShortcut(action:)` (⌘↩),
  `.jambotControlsShortcut(action:)` (⌘K), `.jambotAboutShortcut(action:)` (⌘,),
  `.jambotPlayStopShortcut(action:)` (Space — attach only where a focused text field
  isn't competing for Space). Each is a zero-size hidden button carrying the shortcut.
  Wired: Space + ⌘K + ⌘↩ in `StudioView` (Space only while the composer isn't focused),
  ⌘, in `LibraryView`.
- `Theme.swift` gained `JBTheme.PanelPalette` (`.jb202/.jt30/.jt10/.jt90/.jb01/.fx`) —
  exact port of `src/app/jam/alt/panels-mobile.css` `[data-skin]` colours
  (`background`/`accent`/`dim`/`rule`/`label`) for whoever builds the Panels tab.

Verifying the Catalyst window visually from the shell hit a wall: `System Events`
enumerates 0 windows for the running Catalyst process even with "UI elements enabled"
true system-wide — likely Terminal itself lacks an Accessibility grant, which would
need an interactive permission prompt (out of scope — no screen control). The Catalyst
*build* is verified (`** BUILD SUCCEEDED **`) and the process launches and stays
running; the window-chrome sizing itself is unverified visually pending someone with
Accessibility access to Terminal, or a future stage's screenshot from an actual
attached window id.

## Catalyst presentation rules (learned 2026-09-06)

- A `.sheet` presented from a view inside `navigationDestination` (the Studio) cannot be dismissed on Mac Catalyst — neither by its binding nor by `dismiss()`. Studio panels (Controls, Bounce) are therefore in-window overlays in `StudioView` (`.overlay { if model.controlsOpen { … } }`), like the web app's `.jb-sheet`. Sheets on the Library root (About, public player) work as sheets.
- Catalyst sheets do not inherit the Observation environment: any sheet content that reads `@Environment(Session.self)` must be given `.environment(session)` explicitly or it traps.
- `tooling/catalyst-sheet-probe.sh "<studioScript>" [seconds]` runs a script against the Catalyst build and prints the app's windows every 4 s (works with the screen locked) — the way to check presentations without screen control.
- Every `JBSheetHeader` Done key also answers Escape and ⌘W.
