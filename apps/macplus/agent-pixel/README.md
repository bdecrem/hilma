# agent-pixel — Daily Pixel canvas service (:2337)

The mini half of Daily Pixel (`../pixel/`): one persistent, collaborative
64x64 1-bit canvas. The Plus connects by direct TCP, gets the full canvas,
paints pixels, and sees other contributors' strokes live. Claude visits once
a day (or when invited from the Plus's Canvas menu) and adds a few strokes
plus a one-line note, so a drawing emerges over weeks.

Dependency-free node (no npm install):

    node server.mjs --listen 2337

## Protocol

Client lines end `\r` or `\n`:

    SYNC                resend the full canvas
    SET <x> <y> <0|1>   set one pixel (persisted + broadcast)
    CLAUDE              invite Claude to draw now (2-minute guard)

Server:

    PXINFO 64 64            frame header
    PXROW <row> <hex16>     one row, 8 packed bytes (bit7 = leftmost, 1 = black)
    PXEND                   frame complete
    PXNOTE <text>           latest note / status
    PX <x> <y> <v>          live single-pixel update (not echoed to sender)
    PXERR <msg>

## State & env

- `PIXEL_STATE` — canvas file, default `~/.pixel-canvas.json`, written
  atomically. A corrupt file is moved aside to `*.corrupt-<ts>` (loudly) and
  a fresh canvas started — never silently discarded.
- `ANTHROPIC_API_KEY` — required for the daily Claude strokes (from
  `~/.macplus-backend.env` via run-service.sh). Without it the server still
  runs; Claude's visits just fail into the log.
- `PIXEL_MODEL` — default `claude-opus-4-8`.
- `PIXEL_AI_HOURS` — hours between Claude visits, default 24. `0` disables
  the timer (invites still work).
- `PIXEL_FAKE_AI=1` — canned strokes instead of the API (selftest).

## Verify

    node selftest.mjs          # 12 asserts: frame, SET, broadcast, persistence,
                               # fake-Claude contribution, SYNC. No key needed.

Plus-side parser test: `cd ../pixel && clang -o /tmp/pxtest rxtest.c && /tmp/pxtest`.
