# Ola's opencode: the terminal interface with Ola's name on it

`ola` in a terminal shows opencode's own interface. Stock opencode draws its logo and says "OpenCode" there;
this folder builds the same program with Ola's wordmark, window title and a few sentences (2026-11-17, Bart:
"I like the idea of using OLA logo and wording"). Tracker: OLA-113.

**The fork is cosmetic and stays cosmetic.** Everything Ola does differently (the account, the door, skills,
permissions, which models) is config and OlaKit, never a change here. A behavior change in this folder turns
an hour of upkeep per opencode release into a real fork; put it in config or ask upstream instead.

There is no copy of opencode's source in this repo. The fork is three small files:

| File | What |
|---|---|
| `UPSTREAM` | the opencode release Ola is built from: repo, tag, the tag's commit, the npm package |
| `rebrand.mjs` | every change, as exact text to replace and how many times it must appear (the logo in `packages/tui/src/logo.ts`, the window title, "Tell Ola what to do differently", "close Ola", "restart Ola", "Ola crashed"). If upstream reworded or moved one it stops with `patches no longer apply: <file>: <text>` |
| `build.sh` | fresh checkout of the pinned commit, the bun version opencode's `package.json` names, `rebrand.mjs`, opencode's own build → `dist/<target>/opencode` with `LICENSE` and `BUILD` |
| `check-upstream.sh` | the daily check (below) |

```bash
./build.sh                          # this Mac's architecture, about four minutes the first time
./build.sh darwin-arm64 darwin-x64  # both Macs
dist/darwin-arm64/opencode --version
```

Source and bun live under `~/Library/Caches/ola-opencode-fork` (`OLA_OPENCODE_CACHE`), about 2 GB; safe to
delete. `dist/` is not committed (a 220 MB binary per target). The build refuses a tag whose commit is not the
one in `UPSTREAM`, and checks that the binary carries Ola's words.

**License.** opencode is MIT. `dist/<target>/LICENSE` is its notice and travels with the binary; when the
binary goes into the Mac app, the notice goes into the bundle and the app's credits.

Left as opencode on purpose: internal ids (`opencode.settings`, the theme named `opencode`), the provider
names "OpenCode Go" / "OpenCode Console" (their products), the update dialog, the `opencode` binary name and
its `--help`, and the "Continue  opencode -s <id>" line printed when a conversation ends (it becomes `ola -c`
when the binary is wired into the `ola` command).

## Status

Built and looked at on 2026-11-17 (the home screen draws "ola" in opencode's block letters). **Not yet what
`ola` runs**: the Mac app still installs stock opencode from npm (`apple/tools/install-local-opencode.sh`).
Wiring it in (the binary inside the signed app bundle, OlaKit pointing at it, `cli-selftest.sh` against it)
waits for the sign-in and skills work on the same files to land.

## The daily check

```bash
apps/activist-ai/opencode-fork/check-upstream.sh
```

One line, and an exit code: `0` up to date; `1` a new release and Ola's changes apply to it cleanly; `2` a new
release and they no longer apply (the line names the sentence); `3` could not check. It reads the version from
npm and, only when there is a new one, fetches that tag and dry-runs `rebrand.mjs`. It builds nothing.

## Moving to a new release

Ola pins one opencode version everywhere (`apps/activist-ai/package.json`, the workspace image, this folder),
so moving is one decision for all of them, not something the daily check does by itself.

1. `check-upstream.sh` says a release is out. Read opencode's `CHANGELOG.md` for it.
2. Exit 2: fix the named line in `rebrand.mjs` (find the sentence's new home or wording in the new source).
   Also grep the new `packages/tui/src` for `OpenCode` in text a person reads and add what is new.
3. Put the new tag and its commit (`git ls-remote --tags <repo> v<version>`) in `UPSTREAM`, run `./build.sh`,
   look at the interface in a terminal.
4. Move the rest of Ola to the same version (the lead's call: `package.json`, the image tag, the suites), then
   `apple/tools/cli-selftest.sh` against an app that carries the new binary.
