// GAMI second sweep, browser pass (2026-11-16). Runs on the Mac mini (a Stanford IP too, and nobody is looking
// at its screen): a visible Chrome with its own profile visits every candidate URL sweep.py collected
// (debug/sweep-candidates.json), follows the PDF links on the rendered page, and keeps the first PDF whose first
// pages carry the paper's title (pdftotext). With --search it also asks Bing and DuckDuckGo for the exact title
// and tries the results. Updates manifest.csv, logs to debug/sweep.md.
// usage: GAMI_DIR=~/GAMI node sweep-browser.mjs [--ids a,b] [--workers 4] [--search] [--limit N]
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';
let chromium; try { ({ chromium } = await import('playwright-core')); } catch { ({ chromium } = await import('playwright')); }

const OUT = process.env.GAMI_DIR || path.join(os.homedir(), 'GAMI');
const PAPERS = path.join(OUT, 'papers'), LOG = path.join(OUT, 'debug', 'sweep.md'), MANIFEST = path.join(OUT, 'manifest.csv');
const SIDE = JSON.parse(fs.readFileSync(path.join(OUT, 'debug', 'sweep-candidates.json'), 'utf8'));
const TMP = path.join(OUT, 'debug', 'sweep-tmp'); fs.mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2); const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const onlyIds = opt('--ids')?.split(','), workers = Number(opt('--workers') || 4), limit = Number(opt('--limit') || 1e9), search = args.includes('--search');
const PROXY = 'https://stanford.idm.oclc.org/login?url=';

function parseCsv(t) { const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows; }
const cf = (s) => /[",\n]/.test(s ?? '') ? `"${String(s).replace(/"/g, '""')}"` : (s ?? '');
const squash = (s) => (s || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '');
const isPdf = (b) => b && b.subarray(0, 1024).toString('latin1').trimStart().startsWith('%PDF');

let seq = 0;
function titleInPdf(buf, title) {
  const f = path.join(TMP, `c${process.pid}-${seq++}.pdf`); fs.writeFileSync(f, buf);
  try {
    const text = squash(execFileSync('pdftotext', ['-l', '3', f, '-'], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    const t = squash(title).slice(0, 60);
    if (!t || !text) return false;
    if (text.includes(t.slice(0, 40))) return true;
    for (let i = 0; i + 30 <= t.length; i += 3) if (text.includes(t.slice(i, i + 30))) return true;
    return false;
  } catch { return false; } finally { fs.rmSync(f, { force: true }); }
}

const BLOCK = /just a moment|attention required|access denied|verify you are|are you a robot|captcha|security check|validate user/i;

// open a URL; resolve with PDF bytes if the response or a download is a PDF, else leave the page for link reading
async function visit(ctx, url, wantPage) {
  const p = await ctx.newPage(); let hit = null;
  const got = new Promise((resolve) => {
    p.on('response', async (res) => { const ct = res.headers()['content-type'] || '';
      if (/pdf|octet-stream|download/i.test(ct)) { try { const b = await res.body(); if (isPdf(b)) { hit = b; resolve(b); } } catch {} } });
    p.on('download', async (d) => { try { const b = fs.readFileSync(await d.path()); if (isPdf(b)) { hit = b; resolve(b); } } catch {} });
  });
  let status = 0;
  const nav = p.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }).then(r => { status = r?.status() || 0; }).catch(() => {});
  await Promise.race([got, nav.then(() => p.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {}))]);
  if (!hit) { // a challenge page: give it time to clear itself
    for (let k = 0; k < 10 && !hit && BLOCK.test(await p.title().catch(() => '')); k++) await p.waitForTimeout(2500);
    if (!hit) await Promise.race([got, p.waitForTimeout(wantPage ? 1500 : 6000)]);
  }
  if (hit || !wantPage) { const t = await p.title().catch(() => ''); const u = p.url(); await p.close().catch(() => {}); return { buf: hit, title: t, url: u, status }; }
  return { page: p, status };
}

// same-origin PDF link: fetch it from inside the article page (the browser's own cookies and fingerprint)
async function fetchInPage(page, url) {
  const r = await page.evaluate(async (url) => { try {
    const r = await fetch(url, { credentials: 'include' }); const buf = new Uint8Array(await r.arrayBuffer());
    if (!new TextDecoder('latin1').decode(buf.slice(0, 1024)).trimStart().startsWith('%PDF')) return null;
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin); } catch { return null; } }, url).catch(() => null);
  return r ? Buffer.from(r, 'base64') : null;
}
// Chrome's viewer showed a PDF but the bytes were not caught: ask again with the context's cookies
async function refetch(ctx, url) { try { const r = await ctx.request.get(url, { timeout: 40000 }); const b = await r.body(); return isPdf(b) ? b : null; } catch { return null; } }

// one visit at a time per site, a few seconds apart (Emerald answers a burst with "Validate User")
const hostQ = new Map();
async function politely(url, fn) { let h = ''; try { h = new URL(url.startsWith(PROXY) ? url.slice(PROXY.length) : url).hostname.replace(/^www\./, ''); } catch {}
  if (/doi\.org$/.test(h)) return fn();
  const prev = hostQ.get(h) || Promise.resolve(); let done; const mine = new Promise(r => done = r); hostQ.set(h, prev.then(() => mine));
  await prev; try { return await fn(); } finally { setTimeout(done, /emerald/.test(h) ? 45000 : 3500); } }

function pdfLinks(pageUrl, doi, found) {
  const u = new URL(pageUrl), h = u.hostname, c = [];
  if (found.meta) c.push(found.meta);
  if (doi) {
    if (h.includes('tandfonline')) c.push(`${u.origin}/doi/pdf/${doi}?download=true`);
    if (h.includes('springer')) c.push(`${u.origin}/content/pdf/${doi}.pdf`);
    if (h.includes('sagepub')) c.push(`${u.origin}/doi/pdf/${doi}?download=true`);
    if (h.includes('wiley')) c.push(`${u.origin}/doi/pdfdirect/${doi}?download=true`);
    if (h.includes('worldscientific') || h.includes('inderscienceonline') || h.includes('icevirtuallibrary') || h.includes('emerald') || h.includes('liebertpub') || h.includes('journals.uchicago') || h.includes('annualreviews'))
      c.push(`${u.origin}/doi/pdf/${doi}`, `${u.origin}/doi/epdf/${doi}`);
  }
  if (h.includes('mdpi.com')) c.push(pageUrl.replace(/\/(htm|pdf).*$/, '').replace(/\/$/, '') + '/pdf');
  const strong = found.links.filter(l => /\.pdf(\?|#|$)|\/pdf\/|\/pdf\?|\/pdf$|pdfft|pdfdirect|article-pdf|\/epdf\/|viewcontent\.cgi|\/bitstreams?\/|\/download|downloadpdf|type=printable|blobtype=pdf|\/files\//i.test(l.href));
  const texty = found.links.filter(l => /\bpdf\b|download|full[- ]?text|view article/i.test(l.text) && !strong.includes(l));
  for (const l of strong.concat(texty)) c.push(l.href);
  const seen = new Set();
  return c.filter(x => x && /^https?:/.test(x) && !/\.(css|js|png|jpe?g|svg|gif)(\?|$)/i.test(x) && !/facebook|twitter|linkedin|mailto:|javascript:|\/terms|\/privacy|citation|\.ris|\.bib|supplement/i.test(x) && !seen.has(x) && seen.add(x));
}

async function tryUrl(ctx, url, row, tried, depth = 0) {
  let v; try { v = await visit(ctx, url, true); } catch (e) { tried.push(`${url.slice(0, 100)} → error ${e.message.split('\n')[0].slice(0, 60)}`); return null; }
  if (v.buf) { if (titleInPdf(v.buf, row.title)) return v.buf; tried.push(`${url.slice(0, 100)} → a pdf, but not this paper`); return null; }
  const p = v.page;
  if (/\.pdf(\?|$)|\/pdf(\/|\?|$)|article-pdf|pdfdirect/i.test(p.url()) && !(await p.title().catch(() => ''))) { // the viewer
    const b = await refetch(ctx, p.url()); if (b && titleInPdf(b, row.title)) { await p.close().catch(() => {}); return b; } }
  try {
    const title = await p.title().catch(() => '');
    if (BLOCK.test(title)) { tried.push(`${url.slice(0, 100)} → bot check on ${new URL(p.url()).hostname}`); return null; }
    const found = await p.evaluate(() => ({ meta: document.querySelector('meta[name="citation_pdf_url"]')?.content || null,
      links: [...document.querySelectorAll('a[href]')].map(a => ({ href: a.href, text: (a.innerText || a.title || a.getAttribute('aria-label') || '').trim().slice(0, 60) })) })).catch(() => ({ meta: null, links: [] }));
    const links = pdfLinks(p.url(), row.doi, found).slice(0, depth ? 3 : 6);
    const here = p.url(), origin = new URL(here).origin;
    for (const l of links) {
      if (l.startsWith(origin)) { const b = await fetchInPage(p, l); if (b && titleInPdf(b, row.title)) return b; if (b) continue; }
      const o = await visit(ctx, l, false).catch(() => ({}));
      if (BLOCK.test(o.title || '')) { tried.push(`${l.slice(0, 100)} → bot check on ${new URL(o.url).hostname}`); break; }
      if (!o.buf && o.url && /\.pdf(\?|$)|\/pdf(\/|\?|$)|article-pdf|pdfdirect/i.test(o.url) && !o.title) o.buf = await refetch(ctx, o.url);
      if (o.buf && titleInPdf(o.buf, row.title)) return o.buf;
      if (process.env.SWEEP_DEBUG) tried.push(`    link ${l.slice(0, 130)} → ${o.buf ? 'pdf, other title' : `no pdf (${o.status}, "${(o.title || '').slice(0, 30)}", ${(o.url || '').slice(0, 80)})`}`);
      // a repository item page one click further down (handle → bitstream)
      if (!o.buf && depth === 0 && /handle|\/items\/|\/record\/|\/id\/eprint|\/publications\//.test(l) && l !== here) { const b = await tryUrl(ctx, l, row, tried, 1); if (b) return b; }
    }
    tried.push(`${url.slice(0, 100)} → "${title.slice(0, 40)}" (${v.status}), ${links.length} links, none this paper's pdf`);
    return null;
  } finally { await p.close().catch(() => {}); }
}

async function searchUrls(ctx, row) {
  const q = `"${row.title.replace(/["“”]/g, '').slice(0, 180)}"`, out = [];
  for (const [name, url, sel] of [['bing', 'https://www.bing.com/search?q=' + encodeURIComponent(q), 'li.b_algo h2 a'], ['ddg', 'https://duckduckgo.com/html/?q=' + encodeURIComponent(q), 'a.result__a']]) {
    const p = await ctx.newPage();
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); await p.waitForTimeout(1500);
      const hrefs = await p.evaluate((sel) => [...document.querySelectorAll(sel)].map(a => a.href), sel);
      for (let h of hrefs.slice(0, 8)) { try { const u = new URL(h); if (u.hostname.includes('duckduckgo') && u.searchParams.get('uddg')) h = u.searchParams.get('uddg');
        if (u.hostname.includes('bing.com') && u.searchParams.get('u')) { const b = u.searchParams.get('u').replace(/^a1/, ''); h = Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(); } } catch {}
        if (/^https?:/.test(h) && !/researchgate\.net|academia\.edu|scholar\.google|books\.google|amazon\.|semanticscholar\.org|scite\.ai|wikipedia\.org|youtube\./.test(h)) out.push(h); }
    } catch {} finally { await p.close().catch(() => {}); }
  }
  return [...new Set(out)].slice(0, 8);
}

const rows = parseCsv(fs.readFileSync(MANIFEST, 'utf8')); const hdr = rows[0];
const recs = rows.slice(1).filter(r => r.length >= hdr.length).map(r => Object.fromEntries(hdr.map((h, i) => [h, r[i]])));
let todo = recs.filter(r => r.status !== 'downloaded' && (!onlyIds || onlyIds.includes(r.article_id)));
todo = todo.map((r, i) => [((i * 7919) % 1009), r]).sort((a, b) => a[0] - b[0]).map(x => x[1]).slice(0, limit); // spread publishers out
const save = () => fs.writeFileSync(MANIFEST, [hdr.join(',')].concat(recs.map(x => hdr.map(h => cf(x[h])).join(','))).join('\n') + '\n');
const log = (s) => { fs.appendFileSync(LOG, s + '\n'); };
log(`\n## Browser sweep · ${new Date().toLocaleString()} · ${todo.length} papers${search ? ' · with web search' : ''}\n`);
const ctx = await chromium.launchPersistentContext(path.join(OUT, '.chrome-profile'), { headless: false, channel: 'chrome', viewport: { width: 1280, height: 900 }, locale: 'en-US', acceptDownloads: true,
  args: ['--disable-blink-features=AutomationControlled'], ignoreDefaultArgs: ['--enable-automation'] });
let got = 0, n = 0;
async function worker() {
  for (;;) { const row = todo.shift(); if (!row) return;
    const t0 = Date.now(), tried = []; let buf = null, src = '';
    const side = SIDE[row.article_id] || { urls: [] };
    if (!row.doi && side.doi) row.doi = side.doi;
    let urls = (side.urls || []).filter(u => !(/^https?:\/\/(dx\.)?doi\.org\//.test(u) && row.doi)); // the proxied DOI covers the bare one
    if (row.doi && !urls.some(u => u.startsWith(PROXY))) urls.push(PROXY + 'https://doi.org/' + row.doi);
    urls = urls.slice(0, 7);
    try {
      for (const u of urls) { buf = await politely(u, () => tryUrl(ctx, u, row, tried)); if (buf) { src = u.startsWith(PROXY) ? 'stanford' : new URL(u).hostname; break; } }
      if (!buf && search) for (const u of await searchUrls(ctx, row)) { if (urls.includes(u)) continue; buf = await politely(u, () => tryUrl(ctx, u, row, tried)); if (buf) { src = 'search/' + new URL(u).hostname; break; } }
    } catch (e) { tried.push(`error ${e.message.split('\n')[0]}`); }
    n++;
    const out = [`### [${row.article_id}] ${row.title.slice(0, 110)}`].concat(tried.map(t => `  - ${t}`));
    if (buf) { got++; fs.writeFileSync(path.join(PAPERS, `${row.article_id}.pdf`), buf);
      Object.assign(row, { status: 'downloaded', source: `sweep-browser/${src}`, file: `${row.article_id}.pdf`, note: '' });
      out.push(`- **DOWNLOADED** (${src}, ${Math.round(buf.length / 1024)} KB, ${Math.round((Date.now() - t0) / 1000)}s)\n`); }
    else { const bot = tried.filter(t => /bot check/.test(t)).pop();
      if (row.status === 'no_doi' && row.doi) row.status = 'failed';
      row.note = (bot || tried.at(-1) || 'no candidate URL').slice(0, 160); out.push(`- still missing (${Math.round((Date.now() - t0) / 1000)}s)\n`); }
    log(out.join('\n')); save();
    console.log(`${n} [${row.article_id}] ${buf ? 'GOT ' + src : 'no'} · ${got} so far`);
  }
}
await Promise.all(Array.from({ length: workers }, worker));
await ctx.close();
log(`**Browser sweep result:** ${got} downloaded.\n`); console.log('DONE', got);
