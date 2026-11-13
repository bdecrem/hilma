// Bart: ten cute rats
const PAL = { o: '#3b3d4a', g: '#a9a6ad', h: '#c9c6cc', k: '#141414', p: '#ff9ccf', n: '#ff5a1f', t: '#e88fb4', f: '#ff9ccf' };
const PALB = Object.assign({}, PAL, { k: '#a9a6ad' });
const BODY = [
  '...............oo.oo',
  '..............oppopo',
  '.......oooooooopoooo',
  '.....oogggggggggggggo',
  '....oghhhhhggggggkggoo',
  '....ogggggggggggggggggn',
  '...ogggggggggggggggggoo',
  'tt.oggggggggggggggggo',
  '.ttoggggggggggggggoo',
  '...oooooooooooooo',
];
const pad = rs => rs.map(r => r.padEnd(24, '.'));
const FA = pad(BODY.concat(['.....ff....ff....ff']));
const FB = pad(BODY.concat(['......ff....ff...ff']));
const FS = pad(BODY.concat(['.....ff.........ff']));
const flip = rs => rs.map(r => r.split('').reverse().join(''));
const FAL = flip(FA), FBL = flip(FB), FSL = flip(FS);

// Bart: six floor rats on patrol
const WALKERS = [
  { base: 128, sp: 18, off: 0 },
  { base: 131, sp: 24, off: 90 },
  { base: 134, sp: 15, off: 200 },
  { base: 137, sp: 21, off: 330 },
  { base: 140, sp: 27, off: 60 },
  { base: 129, sp: 12, off: 400 },
];
const L = 226;
function walker(w, t, calm) {
  const tt = calm ? 3 : t;
  const p = ((tt * w.sp + w.off) % (2 * L) + 2 * L) % (2 * L);
  const x = 40 + (p < L ? p : 2 * L - p);
  const face = p < L ? 1 : -1;
  return { x: Math.round(x), y: w.base - 11, face };
}
function blink(t, s) { return ((t + s) % 4) < 0.15; }
function drawRat(api, x, y, face, frame, bl) {
  const rows = face > 0 ? (frame === 0 ? FA : frame === 1 ? FB : FS) : (frame === 0 ? FAL : frame === 1 ? FBL : FSL);
  api.sprite(rows, bl ? PALB : PAL, x, y);
}
function floorRats(api, t, front) {
  const calm = api.calm;
  WALKERS.forEach((w, i) => {
    const r = walker(w, t, calm);
    if ((w.base >= api.you.y) !== front) return;
    api.rect(r.x + 2, w.base, 20, 1, 'rgba(0,0,0,0.25)');
    const fr = calm ? 2 : Math.floor(t * 7 + i) % 2;
    drawRat(api, r.x, r.y, r.face, fr, !calm && blink(t, i));
  });
}

// Bart: still rats (sill, desk, shelf top, by the plant)
const SITTERS = [
  { x: 60, y: 61, face: 1, s: 0.7, name: 'sill rat', look: 'Watching the sunset. Better view than mine.' },
  { x: 150, y: 84, face: -1, s: 1.9, name: 'desk rat', look: 'Reviewing a draft. Seems unimpressed.' },
  { x: 282, y: -1, face: -1, s: 2.6, name: 'shelf rat', look: 'Up top with the classics. Tenured, clearly.' },
  { x: 258, y: 119, face: 1, s: 3.3, name: 'plant rat', look: 'Guarding the plant. Or eyeing it.' },
];

return {
  back(api, t) {
    [0, 2].forEach(i => {
      const s = SITTERS[i];
      drawRat(api, s.x, s.y, s.face, 2, !api.calm && blink(t, s.s));
    });
  },
  mid(api, t) {
    const d = SITTERS[1];
    drawRat(api, d.x, d.y, d.face, 2, !api.calm && blink(t, d.s));
    const pr = SITTERS[3];
    api.rect(pr.x + 2, pr.y + 11, 20, 1, 'rgba(0,0,0,0.25)');
    const tw = !api.calm && Math.floor(t * 6) % 3 === 0 ? 1 : 0;
    drawRat(api, pr.x, pr.y - tw, pr.face, 2, !api.calm && blink(t, pr.s));
    floorRats(api, t, false);
  },
  front(api, t) {
    floorRats(api, t, true);
  },
  spots: (t) => {
    const looks = [
      'A rat. Cute. Busy. Going somewhere important.',
      'Fast little thing. Has a meeting.',
      'It squeaked at me. Politely.',
      'Pink ears, pink tail. Very on palette.',
      'Six of them, and counting. Do not count.',
      'Slowest rat. The thinker of the group.',
    ];
    const out = WALKERS.map((w, i) => {
      const r = walker(w, t, false);
      return { name: 'rat', r: [r.x, r.y, 24, 11], look: looks[i] };
    });
    SITTERS.forEach(s => out.push({ name: s.name, r: [s.x, Math.max(0, s.y), 24, 11], look: s.look }));
    return out;
  },
};