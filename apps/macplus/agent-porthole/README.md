# agent-porthole

Mini-side half of the Plus **Porthole** browser. A long-running `node:net` TCP
server (port **2336**) driving a real headless Chromium. The Plus sends a command
per line; the mini renders the page at 512×300 (1:1 with the Plus canvas),
Atkinson-dithers the screenshot to 1-bit, zlib-compresses it, and streams a binary
frame. The Plus displays it and sends back clicks/scrolls/keys.

## Protocol

Up (Plus → agent), one line + `\r`:
`GO <url>` · `CLICK <x> <y>` · `SCROLL <dy>` · `KEY <code>` · `TYPE <text>` · `BACK`

Down (agent → Plus), binary (see `src/frame.ts`):
- `'F'` frame — `x,y,w,h,rowbytes` (u16 BE) + `clen` (u32 BE) + `clen` bytes zlib
  (inflates to `h*rowbytes` of 1-bit rows). Full screen = `(0,0,512,300)`.
- `'S'` status, `'T'` title — `len` (u16 BE) + text.

## Run / test

```bash
npm install
npx playwright install chromium      # one-time; downloads the browser
npm run selftest                     # render -> dither -> frame -> inflate round-trip + PNG (no Plus)
npx tsx src/main.ts --listen 2336    # the server
```

`npm run selftest` writes `/tmp/porthole-selftest.png` so you can eyeball the 1-bit
render. `src/gentestframe.ts` regenerates the Plus-side test vectors
(`../porthole/test_frame.h`, `test_frame_z.h`).

## Deploy on the mini

Wired into `backend/` like the other agents (run-service.sh / install-agents.sh /
update.sh / BACKEND.md, service name `porthole`, port 2336). After pushing:

```bash
ssh admin@192.168.7.50 'bash ~/hilma-deploy/apps/macplus/backend/update.sh'
# one-time, the first time only:
ssh admin@192.168.7.50 'cd ~/hilma-deploy/apps/macplus/agent-porthole && npx playwright install chromium'
ssh admin@192.168.7.50 'bash ~/hilma-deploy/apps/macplus/backend/install-agents.sh porthole'
```

Note: this runs a persistent headless Chromium on the mini.
