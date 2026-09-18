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
`-SkipNotifPrompt`, …).

Differences from Dodo so far:
- Deep-link scheme is `polly://`. No universal links / Associated Domains
  until Polly has its own domain.
- `testflight/asc-submit.mjs` reads the app id from `POLLY_ASC_APP_ID`; the
  export plists name profiles "polly appstore" / "polly catalyst appstore"
  (not minted yet — Polly has no App Store Connect record yet).
- Files still named after the dodo (`AnimatedDodo.swift`, `DodoArt.swift`,
  `DodoRadioDial.swift`) draw the placeholder mascot until Polly gets its own.

Simulator build:
```bash
xcodebuild -project apps/polly/Polly.xcodeproj -scheme Polly \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```
