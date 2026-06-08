# Atkinson agent (mini side)

The server half of the Plus **Atkinson** app. The Plus sends one line of text (an
image idea); this agent generates an image, Atkinson-dithers it to a 480x300 1bpp
frame, and streams the frame back over the serial/TCP link. Then it waits for the
next prompt.

```
Mac Plus ──serial──> RetroWiFi SI ──WiFi/TCP──> Mac mini :2325 ── socat ── atkinson-agent
```

## Wire protocol (must match `atkinson/atkinson.c`)

```
Plus -> agent:  "<prompt text>\r"
agent -> Plus:  optional status lines, then a frame:
    "ATKIMG <w> <h> <rowbytes>\r\n"
    <h lines, each rowbytes*2 hex chars + \r\n>   (one image row per line)
    "ATKEND\r\n"
  or on failure  "ATKERR <message>\r\n"
```

Hex (not raw binary) so the bytes survive the modem's telnet layer — a raw `0xFF`
would be read as a telnet IAC — and so the 68000 parser stays trivial. 480x300 →
60 bytes/row → 18000 bytes → 36000 hex chars ≈ 37 s to "develop" at 9600 baud.

## Files

- `src/draw.ts`  — `promptToFrame()`: generate image (OpenAI `gpt-image-1` or
  Together FLUX, via `ATK_IMAGE_PROVIDER`), then Atkinson-dither + pack to 1bpp by
  shelling out to the proven `../atkinson/dither.py` (the single source of truth
  for the packed-byte layout the Plus consumes).
- `src/frame.ts` — `encodeFrame()` / `encodeError()`: the wire format above.
- `src/main.ts`  — stdin line loop (the socat-facing program).
- `src/selftest.ts` — generate + dither + encode + validate a frame WITHOUT the
  Plus, and write a PNG so the dithered result is visible.

## Run it

```bash
npm install

# self-test (no Plus, no serial): prompt -> frame -> validate -> /tmp/atkinson-selftest.png
OPENAI_API_KEY=... npm run selftest "a lighthouse at dusk"

# live, locally (type a prompt, watch the hex frame stream by):
OPENAI_API_KEY=... npm start

# on the mini, what the Plus dials into (port 2325, NOT the text agent's 2323/2324):
socat TCP-LISTEN:2325,reuseaddr,fork \
  EXEC:'npx tsx /path/to/agent-atkinson/src/main.ts',pty,setsid,ctty,stderr
```

Env:
- `OPENAI_API_KEY` (default provider) or `TOGETHER_API_KEY` with `ATK_IMAGE_PROVIDER=together`
- `ATK_IMAGE_MODEL` — override the model id
- `python3` + Pillow on PATH (for `dither.py`)

## Status

Agent half verified end-to-end via `npm run selftest` (real image → 18000-byte
frame → 300 hex rows + `ATKEND`, hex round-trips exactly). The Plus parser was
verified against a real frame by `../atkinson/rxtest.c`. The only untested link is
the physical serial wire (blocked on the Plus↔modem cable; see
`apps/macplus/CLAUDE.md`). The mini listener on 2325 is **not yet a LaunchDaemon** —
hand-start it (or mirror `sh.macplus.terminal.plist`) before trusting boot=ready.
```
