/*
 * The headless browser half. One persistent Chromium + one page, rendered at
 * the Plus canvas size (512x300) so a Plus click maps 1:1 to a browser click.
 * Each render: screenshot the viewport -> Atkinson-dither to 1bpp via the
 * proven dither.py (the single source of truth for the packed-byte layout the
 * Plus blits) -> return the packed bytes.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CW = 512;            // canvas width  (Plus window content)
export const CH = 300;            // canvas height
export const CRB = CW / 8;        // 64 bytes/row
export const FRAME_BYTES = CRB * CH;  // 19200

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DITHER_PY = resolve(HERE, '..', '..', 'atkinson', 'dither.py');
// python3 with Pillow (the mini's /usr/bin/python3 has it; Homebrew's may not)
const PYTHON = process.env.PORT_PYTHON || process.env.ATK_PYTHON || 'python3';

let browser: Browser | null = null;
let page: Page | null = null;

async function ensurePage(): Promise<Page> {
  if (!browser) browser = await chromium.launch({ headless: true });
  if (!page) {
    page = await browser.newPage({
      viewport: { width: CW, height: CH },
      deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (Macintosh; 68000 Mac OS 6) Porthole/0.1',
    });
  }
  return page;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (b) => (err += b));
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}: ${err.slice(0, 200)}`))));
  });
}

/** Screenshot the current page and Atkinson-dither to a packed 1bpp frame. */
export async function shot(): Promise<Buffer> {
  const p = await ensurePage();
  const png = await p.screenshot({ type: 'png' });   // exactly CW x CH
  const dir = await mkdtemp(join(tmpdir(), 'port-'));
  const inPng = join(dir, 'in.png'), outBin = join(dir, 'out.bin'), prev = join(dir, 'p.png');
  try {
    await writeFile(inPng, png);
    await run(PYTHON, [DITHER_PY, inPng, prev, '--size', `${CW}x${CH}`, '--contrast', '1.1', '--bin', outBin]);
    const packed = await readFile(outBin);
    if (packed.length !== FRAME_BYTES) throw new Error(`dither produced ${packed.length}, expected ${FRAME_BYTES}`);
    return packed;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function go(url: string): Promise<string> {
  const p = await ensurePage();
  let u = url.trim();
  if (!/^https?:\/\//i.test(u) && !/^file:/i.test(u)) u = 'https://' + u;
  await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  await settle(p);
  return (await p.title().catch(() => '')) || u;
}

export async function back(): Promise<void> { const p = await ensurePage(); await p.goBack({ timeout: 15000 }).catch(() => {}); await settle(p); }
export async function click(x: number, y: number): Promise<void> { const p = await ensurePage(); await p.mouse.click(x, y).catch(() => {}); await settle(p); }
export async function scroll(dy: number): Promise<void> { const p = await ensurePage(); await p.mouse.wheel(0, dy).catch(() => {}); await settle(p); }
export async function typeText(t: string): Promise<void> { const p = await ensurePage(); await p.keyboard.type(t).catch(() => {}); await settle(p); }
export async function key(code: string): Promise<void> { const p = await ensurePage(); await p.keyboard.press(code).catch(() => {}); await settle(p); }

async function settle(p: Page): Promise<void> {
  await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(250);
}

export async function shutdown(): Promise<void> { try { await browser?.close(); } catch {} browser = null; page = null; }
