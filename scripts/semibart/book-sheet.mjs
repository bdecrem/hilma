// Renders books (the JSON book-try.ts writes) as pages, the way a reader would see them: a title
// card and the ten pages, text in the game's font, drawings as pixel art on cream paper.
// Usage: node scripts/semibart/book-sheet.mjs <out.png> <book.json> [more.json ...]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [out, ...files] = process.argv.slice(2);
const books = files.map(f => JSON.parse(readFileSync(f, 'utf8')));
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = `<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Jersey+15&display=swap" rel="stylesheet">
<style>body{margin:0;background:#16121c;font-family:'Jersey 15',monospace;color:#2a2416;padding:16px}
.book{display:grid;grid-template-columns:repeat(11,150px);gap:8px;margin-bottom:22px}
.card{background:#fff7e6;height:210px;padding:9px;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;overflow:hidden}
.cover{background:#2b3fff;color:#fff7e6}.cover .f{color:#ffd93b;font-size:13px;letter-spacing:.08em;text-transform:uppercase}.cover h2{margin:0;font-weight:400;font-size:21px;line-height:1}
.cover .s{font-size:14px;line-height:1.05;color:#d8dcff}.cover .by{margin-top:auto;font-size:14px}
.t{white-space:pre-wrap;font-size:13px;line-height:1.08}canvas{image-rendering:pixelated;align-self:center;max-width:100%}
.n{margin-top:auto;font-size:11px;color:#9a917e;text-align:right}</style>
${books.map(b => `<div class="book"><div class="card cover"><div class="f">${esc(b.form)}</div><h2>${esc(b.title)}</h2><div class="s">${esc(b.subtitle)}</div><div class="by">by ${esc(b.name)}<br><span style="font-size:11px;color:#9aa2ff">${esc(b.effort)} · ${b.seconds} s</span></div></div>
${b.pages.map((p, i) => `<div class="card">${p.art ? `<canvas data-art='${esc(JSON.stringify(p.art))}'></canvas>` : ''}${p.text ? `<div class="t">${esc(p.text)}</div>` : ''}<div class="n">${i + 1}</div></div>`).join('')}</div>`).join('')}
<script>document.querySelectorAll('canvas').forEach(c=>{const a=JSON.parse(c.dataset.art),w=Math.max(...a.rows.map(r=>r.length)),h=a.rows.length,s=Math.max(1,Math.floor(Math.min(130/w,(c.parentNode.querySelector('.t')?95:170)/h)));c.width=w*s;c.height=h*s;const g=c.getContext('2d');a.rows.forEach((r,y)=>[...r].forEach((ch,x)=>{const col=a.palette[ch];if(col){g.fillStyle=col;g.fillRect(x*s,y*s,s,s)}}))});</script>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 11 * 158 + 32, height: 400 } });
await p.setContent(html); await p.waitForTimeout(1500);
await p.screenshot({ path: out, fullPage: true }); await b.close();
console.log('wrote', out);
