// Headless Chrome fetcher for the sites that refuse plain HTTP clients (challenge pages, JS-rendered law portals).
// Long-lived worker: one JSON request per line on stdin ({id, url}), one JSON reply per line on stdout:
//   {id, status, final, format: "html"|"pdf", text, pdf_links: [...], data?: base64 (pdf only), error?}
// Runs up to CONC pages at once in one browser context, so cookies set by a challenge carry over to later fetches.
import { chromium } from 'playwright';
import readline from 'node:readline';

const CONC = 4, UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ userAgent: UA, locale: 'en-US', acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const CHALLENGE = /(security verification|confirm you are human|enable javascript and cookies|just a moment|checking your browser|verifying you are human|security check)/i;

async function viaRequest(url) {
  const r = await ctx.request.get(url, { timeout: 45000, maxRedirects: 10 });
  const ct = (r.headers()['content-type'] || '').toLowerCase();
  const body = await r.body();
  return { status: r.status(), final: r.url(), ct, body };
}

async function fetchOne(url) {
  // PDFs: the request API shares the context's cookies; after a page visit has passed a challenge it gets through
  let rq = null;
  try { rq = await viaRequest(url); } catch (e) { rq = null; }
  const isPdf = (x) => x && (x.ct.includes('pdf') || x.body.slice(0, 5).toString() === '%PDF-');
  if (isPdf(rq)) return { status: rq.status, final: rq.final, format: 'pdf', text: '', pdf_links: [], data: rq.body.toString('base64') };

  const p = await ctx.newPage();
  try {
    let resp = null;
    try { resp = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    catch (e) { if (!String(e).includes('Download is starting')) throw e; }
    // give challenge pages and JS apps time; stop early once the text settles above a page's worth
    let text = '', last = -1;
    for (let i = 0; i < 8; i++) {
      await p.waitForTimeout(i < 3 ? 2500 : 4000);
      text = await p.evaluate(() => {
        const main = document.querySelector('la-akoma-ntoso, .akoma-ntoso, #document-content, .document-content, main, article') ;
        const t = (main && main.textContent && main.textContent.trim().length > 1500 ? main.textContent : document.body?.innerText) || '';
        return t;
      }).catch(() => '');
      text = text.replace(/\s+/g, ' ').trim();
      const challenged = CHALLENGE.test(text.slice(0, 600)) && text.length < 2000;
      if (!challenged && text.length >= 1500 && text.length === last) break;
      last = text.length;
    }
    const pdf_links = await p.evaluate(() => Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href).filter(h => /\.pdf(\?|$)|ViewType=Pdf|format=pdf|\/source\.pdf|\/pdf\b/i.test(h)).slice(0, 6)).catch(() => []);
    // the page may have been a PDF rendered in the viewer; retry the request API now that cookies are set
    if (text.length < 1500 && !isPdf(rq)) { try { rq = await viaRequest(url); } catch (e) {} }
    if (isPdf(rq)) return { status: rq.status, final: rq.final, format: 'pdf', text: '', pdf_links, data: rq.body.toString('base64') };
    return { status: resp ? resp.status() : (rq ? rq.status : 0), final: p.url(), format: 'html', text, pdf_links };
  } finally { await p.close().catch(() => {}); }
}

let active = 0; const queue = [];
async function run(job) {
  active++;
  try { out({ id: job.id, ...(await fetchOne(job.url)) }); }
  catch (e) { out({ id: job.id, status: 0, final: job.url, format: 'html', text: '', pdf_links: [], error: String(e).slice(0, 300) }); }
  finally { active--; pump(); }
}
function pump() { while (active < CONC && queue.length) run(queue.shift()); }
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (l) => { if (!l.trim()) return; const j = JSON.parse(l); if (j.quit) { b.close().then(() => process.exit(0)); return; } queue.push(j); pump(); });
rl.on('close', () => { const t = setInterval(() => { if (!active && !queue.length) { clearInterval(t); b.close().then(() => process.exit(0)); } }, 200); });
