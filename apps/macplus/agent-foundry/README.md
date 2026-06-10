# Foundry agent (Retro68-host side)

The server half of **Macinclaude Foundry**. The Plus sends `MAKE <wish>`; this
agent has Claude write a complete classic-Mac app in C, cross-compiles it with
Retro68 (retrying up to 4× with the compiler errors fed back to Claude), and
streams the resulting MacBinary back as an `FNDBIN` hex frame. The Plus decodes
it and writes both forks to the boot disk as a real double-clickable app.

```
Mac Plus ──serial──> RetroWiFi SI ──WiFi/TCP──> <Retro68 host> :2327 ── foundry-agent
```

**Runs on the machine that has the Retro68 toolchain** — the iMac today
(`192.168.7.189`), not the mini. Move it (and change the Plus's Settings host)
once Retro68 is installed on the mini.

## Wire protocol (must match `foundry/foundry_rx.inc`)

```
Plus -> agent:  MAKE <one-line app description>\r
agent -> Plus:  FNDSTS <build-log line>            (many)
                FNDBIN <totalLen> <cksum16>         delivery begins
                <hex lines, 128 bytes = 256 hex chars each>
                FNDEND
              or FNDERR <message>
```
Hex so bytes survive the modem's telnet layer; `cksum16` = sum of file bytes mod
65536, verified on the Plus before the file is kept.

## Files
- `src/codegen.ts` — Claude writes/fixes the app; system prompt carries the
  house skeleton (`testapp/hello.c`) + Retro68/System-6 constraints.
- `src/compile.ts` — `compileApp()`: CMake + Retro68 → `.bin`, or trimmed errors.
- `src/frame.ts` — the FND wire format.
- `src/main.ts` — `node:net` TCP server (`--listen 2327`) or stdin loop, paced output.
- `src/selftest.ts` — offline (frame + compile the skeleton) and live (a full MAKE).
- `testapp/hello.c` — the canonical skeleton (also the selftest's compile fixture).

## Run
```bash
npm install
FOUNDRY_SKIP_LIVE=1 npx tsx src/selftest.ts   # offline: frame + skeleton compile
npx tsx src/selftest.ts                        # + a live MAKE (needs ANTHROPIC_API_KEY)
npx tsx src/main.ts --listen 2327              # what the Plus dials
```
Env: `ANTHROPIC_API_KEY` (or repo `.env.local`), `FOUNDRY_MODEL`, `RETRO68_TOOLCHAIN`.
