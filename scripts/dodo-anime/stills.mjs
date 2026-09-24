// Stills of anime Dodo on his own, drawn by the page's own code (public/dodo/anime.html#still):
//   icon-1024.png         app icon, full bleed, no rounded corners (iOS masks its own)
//   poster.png            2000×3000 character poster with type
//   poster-clean.png      the same poster, no type
//   dodo-transparent.png  2048² cutout on transparency
// Usage: node scripts/dodo-anime/stills.mjs <outdir>
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const out = process.argv[2] || '.';
const url = pathToFileURL(path.resolve('public/dodo/anime.html')).href + '#still';
const browser = await chromium.launch();

async function shoot(name, w, h, dsf, build, transparent = false) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(([fn, w, h, transparent]) => {
    document.body.innerHTML = '';
    document.body.style.cssText = `margin:0;background:${transparent ? 'transparent' : '#000'}`;
    document.documentElement.style.background = transparent ? 'transparent' : '#000';
    const style = document.createElement('style');
    style.textContent = 'body::after{display:none!important}';
    document.head.appendChild(style);
    const stage = document.createElement('div');
    stage.style.cssText = `position:relative;width:${w}px;height:${h}px;overflow:hidden`;
    document.body.appendChild(stage);
    new Function('A', 'stage', 'w', 'h', fn)(window.__anime, stage, w, h);
  }, [build, w, h, transparent]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}`, omitBackground: transparent });
  if (errors.length) console.log(name, errors);
  await page.close();
}

// Shared: place a dodo <svg> into an outer SVG at (x, y, width, height).
const place = `const at = (svg, x, y, ww, hh) => svg.replace('<svg ', '<svg x="' + x + '" y="' + y + '" width="' + ww + '" height="' + hh + '" ');`;

// ── App icon: bust on a summer sky, cloud tower behind.
await shoot('icon-1024.png', 1024, 1024, 1, `${place}
  const R = A.rng(11), defs = [];
  let s = '<rect width="1024" height="1024" fill="' + A.grad(defs, [[0, '#0e3fb0'], [.45, '#2c7ae8'], [1, '#8fd2fb']]) + '"/>';
  s += '<circle cx="170" cy="150" r="460" fill="' + A.rgrad(defs, [[0, '#ffffff', 1], [.07, '#fffbe8', .95], [.3, '#bfe6ff', .35], [1, '#8fd2fb', 0]]) + '"/>';
  s += A.cumulo(defs, R, 560, 1090, 1500, 560, { sh: '#a8b4ee', lit: '#ffffff', hi: '#fffaf0', base: '#b4c0f0' });
  s += '<path fill="#fff6b0" stroke="#ffb82e" stroke-width="5" d="' + A.star4(850, 170, 40) + '"/><path fill="#fff" d="' + A.star4(930, 270, 18) + '"/>';
  const d = A.dodoSVG({ view: 'front', expr: 'normal', vb: '-50 -56 100 100' });
  s += at(d, 0, 0, 1024, 1024);
  stage.innerHTML = '<svg width="1024" height="1024" viewBox="0 0 1024 1024"><defs>' + defs.join('') + '</defs>' + s + '</svg>';
  // Wind in the scarf.
  const [a, b] = A.tailPaths(1.1, -1, 2.6);
  stage.querySelector('.t1').setAttribute('d', a); stage.querySelector('.t2').setAttribute('d', b);
`);

// ── Poster: full figure, three-quarter, looking up at the sky.
const posterBody = (withType) => `${place}
  const W = 1000, H = 1500, R = A.rng(1998), defs = [];
  let s = '<rect width="' + W + '" height="' + H + '" fill="' + A.grad(defs, [[0, '#0b3aa8'], [.3, '#2f7fea'], [.62, '#9fd8ff'], [.78, '#e6f7ff'], [.781, '#5ab84a'], [1, '#3a9a3c']]) + '"/>';
  s += '<circle cx="190" cy="170" r="620" fill="' + A.rgrad(defs, [[0, '#ffffff', 1], [.06, '#fffbe8', .95], [.28, '#bfe6ff', .35], [1, '#8fd2fb', 0]]) + '"/>';
  s += A.cumulo(defs, R, 560, 1160, 1400, 900, { sh: '#a8b4ee', lit: '#ffffff', hi: '#fffaf0', base: '#b4c0f0' });
  s += A.cumulo(defs, R, 80, 560, 300, 90, { sh: '#bcc8f2', lit: '#fff', base: '#c8d2f6' });
  s += '<path d="M1010,260L640,380" stroke="#fff" stroke-width="3" opacity=".8" stroke-linecap="round"/><circle cx="640" cy="380" r="3" fill="#fff"/>';
  s += A.ridge(R, W, 1150, 30, '#6f9fe6', 7, 1180) + A.ridge(R, W, 1162, 16, '#4f86d4', 11, 1180) + A.ridge(R, W, 1170, 8, '#2f7d5b', 30, 1182);
  let y = 1172, hh = 8, k = 0; while (y < H) { s += '<rect x="0" y="' + y + '" width="' + W + '" height="' + hh + '" fill="' + (k % 2 ? '#62c24e' : '#4fae43') + '"/>'; if (k % 3 === 1) s += '<rect x="0" y="' + (y + hh * .2) + '" width="' + W + '" height="' + (hh * .5) + '" fill="#9ad8f6" opacity=".5"/>'; y += hh; hh *= 1.3; k++; }
  for (const [f, r, c, o] of [[.3, 40, '#ffe6c8', .22], [.52, 18, '#c8e6ff', .3], [.8, 70, '#fff0d0', .1], [1.08, 26, '#ffd0f0', .2]]) s += '<circle cx="' + (190 + (820 - 190) * f) + '" cy="' + (170 + (1300 - 170) * f) + '" r="' + r + '" fill="' + c + '" opacity="' + o + '"/>';
  s += '<path fill="#fff6b0" stroke="#ffb82e" stroke-width="4" d="' + A.star4(820, 560, 30) + '"/><path fill="#fff" d="' + A.star4(870, 640, 13) + '"/><path fill="#fff" d="' + A.star4(150, 820, 16) + '"/>';
  const d = A.dodoSVG({ view: 'q', expr: 'normal', look: [1.2, -2], vb: '-60 -60 120 124' });
  const dw = 820, dh = dw * 124 / 120, top = 1368 - dh * 118 / 124;
  s += at(d, (W - dw) / 2, top, dw, dh);
  stage.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><defs>' + defs.join('') + '</defs>' + s + '</svg>';
  const [a, b] = A.tailPaths(1.3, -1, 3.2);
  stage.querySelector('.t1').setAttribute('d', a); stage.querySelector('.t2').setAttribute('d', b);
  stage.querySelector('.wr').setAttribute('transform', 'rotate(-14 16.5 27.5)');
  ${withType ? `
  const t = document.createElement('div');
  t.innerHTML = '<div style="position:absolute;right:54px;top:58px;writing-mode:vertical-rl;font-family:Dela Gothic One;font-size:150px;line-height:1;color:#fff;-webkit-text-stroke:14px #1b3a94;paint-order:stroke fill;letter-spacing:.02em">ドードー</div>' +
    '<div style="position:absolute;right:232px;top:70px;writing-mode:vertical-rl;font-family:Shippori Mincho B1;font-weight:800;font-size:30px;letter-spacing:.3em;color:#fff;text-shadow:0 2px 10px rgba(10,30,100,.45)">海までの道</div>' +
    '<div style="position:absolute;left:56px;bottom:56px;color:#fff;font-family:Zen Maru Gothic;text-shadow:0 2px 12px rgba(0,40,0,.45)"><div style="font-weight:900;font-size:20px;letter-spacing:.34em;color:#ffe25a">CHARACTER FILE · No.001</div><div style="font-family:Dela Gothic One;font-size:84px;line-height:1;margin-top:8px;-webkit-text-stroke:10px #1b3a94;paint-order:stroke fill">DODO</div><div style="font-weight:700;font-size:24px;margin-top:10px;letter-spacing:.06em">The Road to the Sea</div></div>';
  stage.appendChild(t);` : ''}
`;
await shoot('poster.png', 1000, 1500, 2, posterBody(true));
await shoot('poster-clean.png', 1000, 1500, 2, posterBody(false));

// ── Cutout on transparency.
await shoot('dodo-transparent.png', 1024, 1024, 2, `${place}
  const d = A.dodoSVG({ view: 'q', expr: 'normal', vb: '-60 -58 120 120' });
  stage.innerHTML = '<svg width="1024" height="1024" viewBox="0 0 1024 1024">' + at(d, 0, 0, 1024, 1024) + '</svg>';
  const [a, b] = A.tailPaths(1.3, -1, 2.6);
  stage.querySelector('.t1').setAttribute('d', a); stage.querySelector('.t2').setAttribute('d', b);
`, true);

await browser.close();
console.log('done');
