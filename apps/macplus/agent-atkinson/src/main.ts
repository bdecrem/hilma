#!/usr/bin/env -S npx tsx
/*
 * Atkinson agent - the mini-side half of the Plus "Atkinson" app.
 *
 * Runs on the Mac mini, spoken to from the Plus over the RetroWiFi-SI / socat
 * link (same transport as the text agent, a different TCP port). The Plus sends
 * one line of text (an image idea); we generate the image, Atkinson-dither it
 * to a 480x300 1bpp frame, and stream the frame back. Then we wait for the next
 * prompt.
 *
 * Run under socat on the mini (what the Plus dials into):
 *   socat TCP-LISTEN:2325,reuseaddr,fork \
 *     EXEC:'npx tsx /path/to/agent-atkinson/src/main.ts',pty,setsid,ctty,stderr
 *
 * Try it locally (type a prompt, watch the frame stream by):
 *   TOGETHER_API_KEY=... npx tsx src/main.ts
 */
import { createInterface } from 'node:readline';
import { promptToFrame } from './draw.ts';
import { encodeFrame, encodeError } from './frame.ts';
import { IMG_W, IMG_H, IMG_RB } from './draw.ts';

function send(s: string) { process.stdout.write(s); }
function line(s = '') { send(s + '\r\n'); }

async function main() {
  line();
  line('  ATKINSON  -  Claude draws, in 1-bit.');
  line('  Type an image idea and press Return. /quit to disconnect.');
  line();

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const raw of rl) {
    const prompt = raw.trim();
    if (!prompt) continue;
    if (prompt === '/quit' || prompt === '/exit') { line('Goodbye.'); break; }

    line(`drawing: ${prompt.slice(0, 60)}`);
    try {
      const packed = await promptToFrame(prompt);
      send(encodeFrame(packed, IMG_W, IMG_H, IMG_RB));
    } catch (err: any) {
      send(encodeError(err?.message ?? String(err)));
    }
  }
  rl.close();
}

main();
