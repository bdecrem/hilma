// Bakes the Wake Up launch score (full + Reduce Motion) from the design page's
// own synth (renderOffline) into the app bundle as AAC.
// node scripts/dodo-launch/bake-audio.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const page_ = path.join(root, 'misc/dodo-redesign/launch/dodo-launch-wake.html');
const out = path.join(root, 'apps/feynd/Feynd/Sounds');
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dodo-launch-'));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + page_);
for (const [name, reduce] of [['launch-wake', false], ['launch-wake-reduce', true]]) {
  const { b64, peak } = await page.evaluate(r => renderOffline(r), reduce);
  const wav = path.join(tmp, name + '.wav');
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  const m4a = path.join(out, name + '.m4a');
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '160000', wav, m4a]);
  console.log(name, 'peak', (20 * Math.log10(peak)).toFixed(1), 'dBFS', fs.statSync(m4a).size, 'bytes');
}
await browser.close();
