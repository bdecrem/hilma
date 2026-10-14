// GAMI step 2: fetch PDFs through headless Chromium on the Stanford network (IP-authenticated proxy).
// usage: node scripts/gami/fetch.mjs [--ids a,b] [--limit N] [--headed]
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';

const OUT = path.join(os.homedir(), 'Desktop/GAMI');
const PAPERS = path.join(OUT, 'papers'), LOG = path.join(OUT, 'debug', 'attempts.md'), MANIFEST = path.join(OUT, 'manifest.csv'), SHOTS = path.join(OUT, 'debug');
const PROXY = 'https://stanford.idm.oclc.org/login?url=';
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const onlyIds = opt('--ids')?.split(','); const limit = Number(opt('--limit') || 1e9); const headed = args.includes('--headed');

function parseCsv(t) { const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows; }
const cf = (s) => /[",\n]/.test(s ?? '') ? `"${String(s).replace(/"/g, '""')}"` : (s ?? '');
const log = (s) => { fs.appendFileSync(LOG, s + '\n'); console.log(s); };

function candidates(pageUrl, doi, meta, links) {
  const u = new URL(pageUrl), h = u.hostname, c = [];
  if (meta) c.push(['citation_pdf_url', meta]);
  if (h.includes('tandfonline')) c.push(['tandf', `${u.origin}/doi/pdf/${doi}`]);
  if (h.includes('sciencedirect')) links.filter(l => /\/pdfft/.test(l)).forEach(l => c.push(['sciencedirect', l]));
  if (h.includes('springer')) c.push(['springer', `${u.origin}/content/pdf/${doi}.pdf`]);
  if (h.includes('sagepub')) c.push(['sage', `${u.origin}/doi/pdf/${doi}?download=true`]);
  if (h.includes('wiley')) c.push(['wiley', `${u.origin}/doi/pdfdirect/${doi}?download=true`]);
  links.filter(l => /\.pdf(\?|$)|\/pdf\/|\/pdf\?|\/pdfft|pdfdirect/i.test(l)).forEach(l => c.push(['link', l]));
  const seen = new Set(); return c.filter(([, x]) => x && !seen.has(x) && seen.add(x));
}

async function fetchInPage(page, url) {
  return page.evaluate(async (url) => {
    const r = await fetch(url, { credentials: 'include' });
    const buf = new Uint8Array(await r.arrayBuffer());
    if (new TextDecoder('latin1').decode(buf.slice(0, 5)).startsWith('%PDF')) {
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { ok: true, b64: btoa(bin), bytes: buf.length };
    }
    const text = new TextDecoder().decode(buf.slice(0, 200000));
    const m = text.match(/https:\/\/pdf\.sciencedirectassets\.com\/[^"'<> ]+/);
    return { ok: false, status: r.status, ct: r.headers.get('content-type'), next: m ? m[0].replace(/&amp;/g, '&') : null };
  }, url);
}

async function openPdf(ctx, url) {
  // visit the PDF link like a reader would; catch the bytes from the response or the download
  const p = await ctx.newPage();
  try {
    const got = new Promise((resolve) => {
      p.on('response', async (res) => {
        const ct = res.headers()['content-type'] || '';
        if (/pdf|octet-stream/i.test(ct)) { try { const b = await res.body(); if (b.subarray(0, 5).toString('latin1').startsWith('%PDF')) resolve(b); } catch {} }
      });
      p.on('download', async (d) => { try { const f = await d.path(); const b = fs.readFileSync(f); if (b.subarray(0, 5).toString('latin1').startsWith('%PDF')) resolve(b); } catch {} });
    });
    p.goto(url, { timeout: 45000 }).catch(() => {});
    const buf = await Promise.race([got, new Promise(r => setTimeout(() => r(null), 30000))]);
    return { buf, title: await p.title().catch(() => ''), url: p.url() };
  } finally { await p.close().catch(() => {}); }
}

async function getPaper(page, row) {
  const t0 = Date.now(), tried = [], dest = path.join(PAPERS, `${row.article_id}.pdf`);
  let resp; try { resp = await page.goto(PROXY + 'https://doi.org/' + row.doi, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
  catch (e) { return { ok: false, tried: [`navigation failed: ${e.message.split('\n')[0]}`] }; }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  let title = await page.title();
  if (/just a moment|attention required|access denied|verify|robot/i.test(title)) { if (args.includes('--wait-human')) { await page.bringToFront(); log(`  - bot check on ${new URL(page.url()).hostname}: waiting up to 3 min for a click`); }
    for (let k = 0; k < (args.includes('--wait-human') ? 72 : 12) && /just a moment|verify|robot/i.test(await page.title()); k++) await page.waitForTimeout(2500); await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); title = await page.title(); }
  const blocked = /just a moment|attention required|access denied|verify|robot|captcha/i.test(title);
  const meta = await page.evaluate(() => document.querySelector('meta[name="citation_pdf_url"]')?.content || null);
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href));
  const cands = blocked ? [] : candidates(page.url(), row.doi, meta, links); // a blocked publisher: skip straight to open copies
  tried.push(`landed on ${page.url().slice(0, 80)} (${resp?.status()}) "${title.slice(0, 50)}", ${cands.length} PDF links`);
  for (const [src, url0] of cands.slice(0, 3)) {
    const o = await openPdf(page.context(), url0);
    if (o.buf) { fs.writeFileSync(dest, o.buf);
      return { ok: true, src, kb: Math.round(o.buf.length / 1024), secs: Math.round((Date.now() - t0) / 1000), tried }; }
    tried.push(`${src} ${url0.slice(0, 80)} → no PDF (ended on "${o.title.slice(0, 40)}" ${o.url.slice(0, 60)})`);
  }
  for (const url0 of (SIDE[row.article_id]?.oa || []).slice(0, 4)) {
    const o = await openPdf(page.context(), url0);
    if (o.buf) { fs.writeFileSync(dest, o.buf);
      return { ok: true, src: 'open-copy', kb: Math.round(o.buf.length / 1024), secs: Math.round((Date.now() - t0) / 1000), tried }; }
    tried.push(`open copy ${url0.slice(0, 80)} → no PDF`);
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${row.article_id}.png`) }).catch(() => {});
  return { ok: false, blocked, landed: page.url(), tried, secs: Math.round((Date.now() - t0) / 1000) };
}

const SIDE = fs.existsSync(path.join(OUT, 'debug', 'candidates.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'debug', 'candidates.json'), 'utf8')) : {};
const slow = args.includes('--slow');
const want = (args.includes('--include-human') ? ['paywalled', 'failed', 'needs_human'] : args.includes('--slow') ? ['paywalled', 'failed'] : ['paywalled']);
const rows = parseCsv(fs.readFileSync(MANIFEST, 'utf8')); const hdr = rows[0];
const recs = rows.slice(1).filter(r => r.length >= hdr.length).map(r => Object.fromEntries(hdr.map((h, i) => [h, r[i]])));
const todo = recs.filter(r => r.doi && (onlyIds || want.includes(r.status)) && (onlyIds ? onlyIds.includes(r.article_id) : !r.doi.startsWith('10.1016/'))).slice(0, limit);
log(`\n## Browser fetch · ${new Date().toLocaleString()} · ${todo.length} papers via the Stanford proxy (visible Chrome)\n`);
const ctx = await chromium.launchPersistentContext(path.join(OUT, '.chrome-profile'), { headless: !headed, channel: 'chrome', viewport: { width: 1280, height: 900 }, locale: 'en-US', args: ['--disable-blink-features=AutomationControlled'], ignoreDefaultArgs: ['--enable-automation'] });
const browser = ctx;
const page = ctx.pages()[0] || await ctx.newPage();
let got = 0;
for (const row of todo) {
  log(`### ${row.n}. [${row.article_id}] ${row.title.slice(0, 110)}`);
  const r = await getPaper(page, row);
  r.tried.forEach(t => log(`  - ${t}`));
  if (r.ok) { got++; log(`- **DOWNLOADED** (${r.src}, ${r.kb} KB, ${r.secs}s)\n`);
    Object.assign(row, { status: 'downloaded', source: `stanford/${r.src}`, file: `${row.article_id}.pdf`, note: '' }); }
  else if (r.blocked) { log(`- **NEEDS A HUMAN** (bot check on ${new URL(r.landed).hostname}), queued for Bart\n`); Object.assign(row, { status: 'needs_human', note: `bot check on ${new URL(r.landed).hostname}` }); }
  else { log(`- **FAILED** (${r.secs}s), screenshot in debug/${row.article_id}.png\n`); Object.assign(row, { status: 'failed', note: r.tried.at(-1)?.slice(0, 160) }); }
  fs.writeFileSync(MANIFEST, [hdr.join(',')].concat(recs.map(x => hdr.map(h => cf(x[h])).join(','))).join('\n') + '\n');
  await page.waitForTimeout(slow ? 20000 + Math.random() * 20000 : 3000 + Math.random() * 2000);
}
await browser.close();
log(`**Browser fetch result:** ${got} of ${todo.length} downloaded.\n`);
