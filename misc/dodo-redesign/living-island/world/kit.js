/* Living Island drawing kit — the concept's material helpers and landmark drawers,
   copied from src/concept-E-living.js (same names, same maths) so the art page and the
   world builder stay diffable. Placement-dependent drawers take their anchors as
   arguments instead of reading the concept's absolute coordinates. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const E = window.L;
  /* ---------- material helpers ---------- */
  function jgrad(ctx, c, cx, cy, r) {
    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, r * 0.05, cx, cy, r * 1.2);
    g.addColorStop(0, E.shade(c, 0.55)); g.addColorStop(0.5, c); g.addColorStop(1, E.shade(c, -0.32)); return g;
  }
  function jfill(ctx, c, cx, cy, r, line = 1.2) {
    ctx.fillStyle = jgrad(ctx, c, cx, cy, r); ctx.fill();
    if (line) { ctx.lineWidth = line; ctx.strokeStyle = E.rgba(E.shade(c, -0.55), 0.45); ctx.stroke(); }
  }
  function hl(ctx, x, y, rx, ry, rot = -0.5, a = 0.8) { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); }
  function ell(ctx, x, y, rx, ry, col, rot = 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); }
  /* cast shadow: silhouette built with base at origin, object toward -y. Falls down-right. */
  function cast(ctx, x, y, pathFn, o = {}) {
    const a = (o.a ?? 0.17) * 0.42;
    for (const [dx, dy] of [[0, 0], [1.1, 0.6], [-0.9, -0.5]]) {
      ctx.save(); ctx.translate(x + dx, y + dy); ctx.transform(1, 0, -(o.len ?? 0.5) * 0.9, -(o.sq ?? 0.4), 0, 0);
      pathFn(ctx); ctx.fillStyle = `rgba(48,30,80,${a})`; ctx.fill(); ctx.restore();
    }
  }
  function contact(ctx, x, y, rx, ry, a = 0.26) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(40,25,70,${a})`); g.addColorStop(1, 'rgba(40,25,70,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx, 0, TAU); ctx.fill(); ctx.restore();
  }
  const circ = (cx, cy, r) => c => { c.beginPath(); c.arc(cx, cy, r, 0, TAU); };
  const rect = (x, y, w, h, r = 3) => c => E.rrect(c, x, y, w, h, r);

  function woodSign(ctx, x, y, text, o = {}) {
    ctx.save(); ctx.translate(x, y);
    ctx.font = `600 ${o.size || 8.5}px Fredoka, ui-rounded, system-ui, sans-serif`;
    const tw = ctx.measureText(text.toUpperCase()).width, w = tw + 18, h = 17, top = -(o.h || 40);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-2, top + 10, 4, -top - 10); c.rect(-w / 2 - 2, top, w + 4, h + 4); }, { a: 0.14 });
    contact(ctx, 0, 0, 10, 3.5);
    const pg = ctx.createLinearGradient(-2, 0, 2, 0); pg.addColorStop(0, '#C08A5C'); pg.addColorStop(1, '#8E5B3A');
    ctx.fillStyle = pg; ctx.fillRect(-2.2, top + 12, 4.4, -top - 12);
    ctx.fillStyle = o.board || '#B07A50'; E.rrect(ctx, -w / 2 - 2.5, top - 0.5, w + 5, h + 5, 6); ctx.fill();
    const bg = ctx.createLinearGradient(0, top, 0, top + h); bg.addColorStop(0, '#FFFBF2'); bg.addColorStop(1, o.plate || '#FBE9CC');
    ctx.fillStyle = bg; E.rrect(ctx, -w / 2, top + 2, w, h, 4.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; E.rrect(ctx, -w / 2 + 3, top + 3.5, w - 6, 2.2, 1.1); ctx.fill();
    ctx.fillStyle = o.ink || '#6B3E2A'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text.toUpperCase(), 0, top + 11);
    ctx.restore();
  }

  function tuft(ctx, x, y, s, dark, light) {
    ctx.lineCap = 'round'; ctx.lineWidth = 1.1 * s; ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x - 2 * s, y); ctx.quadraticCurveTo(x - 2.5 * s, y - 3 * s, x - 4 * s, y - 5 * s);
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x, y - 4 * s, x + 0.6 * s, y - 7 * s);
    ctx.moveTo(x + 2 * s, y); ctx.quadraticCurveTo(x + 2.6 * s, y - 3 * s, x + 4.2 * s, y - 4.6 * s);
    ctx.stroke();
    ctx.strokeStyle = light; ctx.lineWidth = 0.8 * s; ctx.beginPath(); ctx.moveTo(x - 0.3 * s, y - 2 * s); ctx.quadraticCurveTo(x - 0.2 * s, y - 4.5 * s, x + 0.5 * s, y - 6.4 * s); ctx.stroke();
  }
  function flower(ctx, x, y, s, col) {
    ctx.fillStyle = 'rgba(60,110,50,.35)'; ctx.beginPath(); ctx.ellipse(x + 1, y + 2.4 * s, 2.6 * s, 1 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col;
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU - 0.3; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 1.7 * s, y + Math.sin(a) * 1.5 * s, 1.35 * s, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#FFE36A'; ctx.beginPath(); ctx.arc(x, y, 0.95 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x - 1.6 * s, y - 1.4 * s, 0.55 * s, 0, TAU); ctx.fill();
  }
  function flowerPatch(ctx, R, cx, cy, rx, ry, n, cols, s = 1) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = R() * TAU, r = Math.sqrt(R()); pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); }
    pts.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of pts) flower(ctx, x, y, s * (0.8 + R() * 0.5), cols[Math.floor(R() * cols.length)]);
  }

  /* gumdrop tree: jelly canopy with gumdrop fruit */
  function gumTree(ctx, x, y, s, canopy, fruits, R) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-2.5, -24, 5, 24); c.arc(0, -36, 18, 0, TAU); }, { a: 0.16 });
    contact(ctx, 0, 0, 14, 4.5, 0.3);
    const tg = ctx.createLinearGradient(-3, 0, 3, 0); tg.addColorStop(0, '#E7B488'); tg.addColorStop(1, '#A86C45');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-3.4, 0); ctx.quadraticCurveTo(-2, -12, -2.6, -24); ctx.lineTo(2.6, -24); ctx.quadraticCurveTo(2, -12, 3.4, 0); ctx.fill();
    // canopy: three lobes
    ctx.beginPath(); ctx.arc(-9, -32, 11, 0, TAU); ctx.arc(9, -33, 11, 0, TAU); ctx.arc(0, -41, 13, 0, TAU); ctx.arc(0, -30, 12, 0, TAU);
    ctx.fillStyle = jgrad(ctx, canopy, -2, -38, 20); ctx.fill();
    ctx.fillStyle = E.rgba(E.shade(canopy, -0.35), 0.35); ctx.beginPath(); ctx.ellipse(3, -24, 15, 5, 0, 0, Math.PI); ctx.fill();
    hl(ctx, -7, -46, 5, 2.4, -0.6, 0.75);
    if (fruits) for (let k = 0; k < 5; k++) {
      const fx = -12 + R() * 24, fy = -44 + R() * 18, c = fruits[k % fruits.length];
      ctx.beginPath(); ctx.moveTo(fx - 2.6, fy + 2); ctx.quadraticCurveTo(fx - 2.6, fy - 3.4, fx, fy - 3.4); ctx.quadraticCurveTo(fx + 2.6, fy - 3.4, fx + 2.6, fy + 2); ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(fx - 1.3, fy - 2, 0.9, 1.4);
    }
    ctx.restore();
  }
  function palm(ctx, x, y, s, lean, R) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    cast(ctx, 0, 0, c => { c.beginPath(); c.moveTo(-2, 0); c.quadraticCurveTo(lean * 0.5, -22, lean, -40); c.lineTo(lean + 3, -40); c.quadraticCurveTo(lean * 0.5 + 3, -22, 2, 0); c.arc(lean, -42, 14, 0, TAU); }, { a: 0.14 });
    contact(ctx, 0, 0, 9, 3);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 4.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(lean * 0.5, -22, lean, -40); ctx.stroke();
    ctx.strokeStyle = '#FF7FB0'; ctx.lineWidth = 4.2; ctx.setLineDash([2.4, 3.4]); ctx.stroke(); ctx.setLineDash([]);
    const cols = ['#5ED08A', '#7FE0A0', '#4DBE7A'];
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.62, L = 16 + (k % 2) * 3;
      ctx.save(); ctx.translate(lean, -41); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(5, -L * 0.5, 1.5, -L); ctx.quadraticCurveTo(-4, -L * 0.5, 0, 0);
      ctx.fillStyle = cols[k % 3]; ctx.fill(); ctx.strokeStyle = 'rgba(30,110,70,.4)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(lean, -41, 4.2, 0, TAU); jfill(ctx, '#FF9F4A', lean, -41, 4.2, 0.8);
    hl(ctx, lean - 1.4, -42.6, 1.4, 0.8);
    ctx.restore();
  }

  /* ---------- LAYER 1: ground ---------- */
  function island(ctx, x, y, rx, ry, e, grass = true) {
    ell(ctx, x + 5, y + 7, rx + 6, ry + 5, 'rgba(20,90,130,.22)');
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(x, y + 2, rx + 4, ry + 3.5, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.ellipse(x, y + 3, rx + 9, ry + 7, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.ellipse(x, y + 1.5, rx + 1, ry + 1, 0, 0, TAU); ctx.fillStyle = '#E8D3A8'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); const g = ctx.createLinearGradient(x - rx, y - ry, x + rx * 0.5, y + ry); g.addColorStop(0, '#FFF3D8'); g.addColorStop(1, '#E9CB98'); ctx.fillStyle = g; ctx.fill();
    if (grass) {
      ctx.beginPath(); ctx.ellipse(x - 2, y - 3, rx * 0.78, ry * 0.68, 0, 0, TAU);
      const gg = ctx.createLinearGradient(x - rx, y - ry, x + rx * 0.4, y + ry); gg.addColorStop(0, '#D6F3B8'); gg.addColorStop(1, '#8BC86F'); ctx.fillStyle = gg; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,225,.75)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(x - 2, y - 2.4, rx * 0.78 - 1, ry * 0.68 - 1, 0, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
    }
  }
  /* stepping pieces: flat rock, lily pad, candy ring, plank, jelly stone */
  function stepPiece(ctx, kind, x, y, ang, R) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(0, 2.5, 13, 7, 0, 0, TAU); ctx.stroke();
    ell(ctx, 3, 5, 11, 5.6, 'rgba(15,80,120,.3)');
    if (kind === 'rock') {
      const n = 7, rs = []; for (let k = 0; k < n; k++) rs.push(0.8 + R() * 0.3);
      const pth = (dy, sc) => { ctx.beginPath(); for (let k = 0; k <= n; k++) { const a = k / n * TAU, r = rs[k % n] * sc; ctx.lineTo(Math.cos(a) * r * 11, Math.sin(a) * r * 6.2 + dy); } ctx.closePath(); };
      pth(1.8, 1); ctx.fillStyle = '#9C8FB4'; ctx.fill();
      pth(0, 1); jfill(ctx, '#D7CDE6', -2, -1, 11, 0.8);
      ctx.strokeStyle = 'rgba(120,100,150,.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(1, 1); ctx.lineTo(5, 0); ctx.stroke();
      hl(ctx, -4, -2.4, 3, 1.1, -0.2, 0.8);
    } else if (kind === 'lily') {
      ctx.scale(1, 0.62); ctx.rotate(ang * 2 + 1);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 11, 0.3, TAU - 0.3); ctx.closePath(); jfill(ctx, '#5CC77E', -3, -2, 11, 0.9);
      ctx.strokeStyle = 'rgba(30,110,60,.35)'; ctx.lineWidth = 0.9; ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = 0.9 + k * 1.1; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); } ctx.stroke();
      ctx.rotate(-(ang * 2 + 1)); ctx.scale(1, 1 / 0.62); hl(ctx, -4, -2, 2.6, 1, -0.2, 0.6);
      if (R() < 0.6) { for (let k = 0; k < 6; k++) { ctx.save(); ctx.translate(3, -2); ctx.rotate(k / 6 * TAU); ell(ctx, 0, -2.4, 1.4, 2.6, k % 2 ? '#FFC2DD' : '#FF8FBC'); ctx.restore(); } ell(ctx, 3, -2, 1.1, 1.1, '#FFE36A'); }
    } else if (kind === 'ring') {
      ctx.save(); ctx.scale(1, 0.55);
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.arc(0, 0, 5, 0, TAU, true); ctx.fillStyle = '#FFF4EA'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = '#FF4F86'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 12, k / 6 * TAU + 0.2, k / 6 * TAU + 0.65); ctx.fill(); } ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fillStyle = 'rgba(60,170,220,.9)'; ctx.fill();
      ctx.strokeStyle = 'rgba(150,40,80,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke();
      ctx.restore(); hl(ctx, -5, -3.4, 3, 1, -0.2, 0.85);
    } else if (kind === 'plank') {
      ctx.rotate(ang + Math.PI / 2 + (R() - 0.5) * 0.3);
      E.rrect(ctx, -11, -3, 22, 8, 2); ctx.fillStyle = '#A86C45'; ctx.fill();
      E.rrect(ctx, -11, -4.5, 22, 8, 2); ctx.fillStyle = '#E6AC78'; ctx.fill();
      ctx.strokeStyle = 'rgba(150,90,50,.5)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-10, -0.5); ctx.lineTo(10, -0.5); ctx.stroke();
      ell(ctx, -8, -2.5, 0.8, 0.8, '#7A4A2A'); ell(ctx, 8, -2.5, 0.8, 0.8, '#7A4A2A');
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-9, -4, 18, 0.9);
    } else {
      ctx.beginPath(); ctx.ellipse(0, 1.5, 9.5, 5.6, 0, 0, TAU); ctx.fillStyle = '#E2B98F'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 5.4, 0, 0, TAU); jfill(ctx, '#FFF0DE', 0, 0, 9, 0.8);
      ell(ctx, 0, 0, 4, 2.2, '#FFB3D1'); hl(ctx, -3.5, -2, 2.4, 1, -0.2, 0.85);
    }
    ctx.restore();
  }
  function cottage(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c => { c.beginPath(); c.moveTo(-30, 0); c.lineTo(-34, -42); c.quadraticCurveTo(0, -100, 34, -42); c.lineTo(30, 0); c.closePath(); c.rect(14, -102, 10, 44); }, { a: 0.18 });
    contact(ctx, 0, 2, 44, 9, 0.3);
    // body
    E.rrect(ctx, -30, -46, 60, 47, 12); jfill(ctx, '#FFE3A6', -6, -26, 40);
    ctx.fillStyle = 'rgba(200,120,60,.18)'; E.rrect(ctx, -30, -10, 60, 11, 6); ctx.fill();
    // chimney
    E.rrect(ctx, 13, -100, 11, 40, 3); jfill(ctx, '#B89CF2', 16, -90, 14, 1);
    E.rrect(ctx, 11, -103, 15, 6, 3); jfill(ctx, '#CDB7FA', 16, -102, 8, 1);
    // frosting roof
    ctx.beginPath(); ctx.moveTo(-38, -40);
    ctx.bezierCurveTo(-38, -78, -16, -92, 0, -92); ctx.bezierCurveTo(16, -92, 38, -78, 38, -40);
    const drips = [[38, -40], [30, -33], [22, -40], [12, -30], [2, -40], [-8, -34], [-18, -40], [-28, -31], [-38, -40]];
    for (let k = 1; k < drips.length; k++) { const [ax, ay] = drips[k - 1], [bx, by] = drips[k]; ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 6, bx, by); }
    ctx.closePath(); jfill(ctx, '#FF7FB0', -10, -74, 44, 1.4);
    hl(ctx, -20, -74, 9, 3.4, -0.7, 0.75);
    for (const [sx, sy, c] of [[-14, -60, '#FFD43A'], [6, -76, '#5EC6EC'], [18, -58, '#FFFFFF'], [-2, -56, '#91E9CC'], [-24, -50, '#FFFFFF'], [24, -46, '#FFD43A']]) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(sx * 0.1); ctx.fillStyle = c; E.rrect(ctx, -2.2, -0.8, 4.4, 1.6, 0.8); ctx.fill(); ctx.restore(); }
    // round door
    ctx.beginPath(); ctx.arc(-8, -16, 13, 0, TAU); ctx.fillStyle = '#E8A36C'; ctx.fill();
    ctx.beginPath(); ctx.arc(-8, -16, 10.5, Math.PI, 0); ctx.lineTo(2.5, 0); ctx.lineTo(-18.5, 0); ctx.closePath();
    const dg = ctx.createLinearGradient(-18, -26, 2, 0); dg.addColorStop(0, '#D8577F'); dg.addColorStop(1, '#9C2F57'); ctx.fillStyle = dg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -26); ctx.lineTo(-8, 0); ctx.stroke();
    ell(ctx, -3.5, -12, 1.5, 1.5, '#FFD43A');
    // window
    ctx.beginPath(); ctx.arc(16, -24, 8, 0, TAU); ctx.fillStyle = '#E8A36C'; ctx.fill();
    ctx.beginPath(); ctx.arc(16, -24, 6, 0, TAU); const wg = ctx.createLinearGradient(10, -30, 22, -18); wg.addColorStop(0, '#FFF6C8'); wg.addColorStop(1, '#FFC66A'); ctx.fillStyle = wg; ctx.fill();
    ctx.strokeStyle = '#E8A36C'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(10, -24); ctx.lineTo(22, -24); ctx.moveTo(16, -30); ctx.lineTo(16, -18); ctx.stroke();
    // flower box
    E.rrect(ctx, 7, -16, 18, 4, 2); ctx.fillStyle = '#B9784A'; ctx.fill();
    for (let k = 0; k < 5; k++) flower(ctx, 9 + k * 3.6, -17, 0.55, ['#FF9FC8', '#FFFFFF', '#A77BF2'][k % 3]);
    // doorstep
    ell(ctx, -8, 1.5, 12, 3, '#F3DDB6');
    hl(ctx, -22, -40, 4, 2, -0.5, 0.7);
    // napping cat on the roof
    ctx.save(); ctx.translate(-14, -84); ctx.rotate(-0.42);
    ell(ctx, 1, 3, 11, 3, 'rgba(120,40,80,.25)');
    ctx.beginPath(); ctx.ellipse(0, -2, 11, 6.5, 0, 0, TAU); jfill(ctx, '#91E9CC', -2, -4, 10, 1);
    ctx.fillStyle = '#7FD9BC'; ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(-10, -13); ctx.lineTo(-4.5, -8); ctx.fill(); ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-1.5, -13.5); ctx.lineTo(0.5, -7.5); ctx.fill();
    ctx.strokeStyle = '#7FD9BC'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.quadraticCurveTo(15, 3, 12, 7); ctx.stroke();
    ctx.strokeStyle = '#2A1F2B'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-7, -3, 1.6, 0.1, Math.PI - 0.1); ctx.moveTo(-1.4, -3); ctx.arc(-3, -3, 1.6, 0.1, Math.PI - 0.1); ctx.stroke();
    ell(ctx, -9.5, -0.5, 1.8, 1, 'rgba(255,110,160,.45)');
    hl(ctx, -2, -6.5, 3.4, 1.4, -0.2, 0.7);
    ctx.restore();
    ctx.restore();
  }
  function nest(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    contact(ctx, 2, 3, 20, 6, 0.3);
    ell(ctx, 0, 0, 17, 8, '#B9784A');
    ctx.beginPath(); ctx.ellipse(0, -5, 8, 10, 0, 0, TAU); jfill(ctx, '#DDF6FF', -2, -8, 9, 1);
    for (const [a, b] of [[-3, -9], [2, -4], [-1, -1], [3, -10]]) ell(ctx, a, b, 1.1, 0.8, '#5EC6EC');
    hl(ctx, -3, -10, 2.4, 1.2, -0.5, 0.9);
    ctx.lineCap = 'round';
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI, rx = 16, ry = 6; ctx.strokeStyle = k % 2 ? '#E6B074' : '#C98A52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-rx * Math.cos(a) - 4, ry * Math.sin(a) - 2); ctx.lineTo(-rx * Math.cos(a) + 4, ry * Math.sin(a) + 1); ctx.stroke(); }
    ctx.strokeStyle = '#F2C68E'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, 1, 15, 5, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.restore();
  }
  function critter(ctx, kind, x, y, s, o = {}) {
    cast(ctx, x, y, circ(0, -12 * s, 12 * s), { a: 0.13 });
    contact(ctx, x, y + 0.5, 15 * s, 4.5 * s, 0.22);
    E.drawCritter(ctx, kind, x, y, s, Object.assign({ shadow: false }, o));
  }
  function garden(ctx, x, y, R) {
    // brown-sugar soil bed with carrot candy
    ctx.save(); ctx.translate(x, y);
    contact(ctx, 4, 4, 62, 22, 0.18);
    ctx.beginPath(); E.rrect(ctx, -54, -22, 108, 44, 16); const g = ctx.createLinearGradient(0, -22, 0, 22); g.addColorStop(0, '#C9855A'); g.addColorStop(1, '#A4643F'); ctx.fillStyle = g; ctx.fill();
    for (let r = 0; r < 3; r++) {
      const ry = -12 + r * 12;
      ctx.beginPath(); ctx.ellipse(0, ry, 48, 4.5, 0, 0, TAU); ctx.fillStyle = '#DDA076'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,200,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, ry - 0.8, 46, 3.4, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      for (let k = 0; k < 7; k++) {
        const cx = -40 + k * 13.3 + (r % 2) * 5, cy = ry;
        ctx.fillStyle = '#4DBE7A'; for (const a of [-0.5, 0, 0.5]) { ctx.save(); ctx.translate(cx, cy - 2); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -4, 1.6, 4.4, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        ctx.beginPath(); ctx.moveTo(cx - 3, cy - 1.5); ctx.quadraticCurveTo(cx, cy + 4, cx + 3, cy - 1.5); ctx.closePath(); ctx.fillStyle = '#FF8A3D'; ctx.fill();
        ell(ctx, cx - 1, cy - 1, 0.9, 0.5, 'rgba(255,255,255,.7)');
      }
    }
    // candy-stick fence on the far side
    for (let k = -52; k <= 52; k += 8.6) {
      ctx.fillStyle = 'rgba(60,30,40,.18)'; ctx.fillRect(k + 1.5, -24, 2.6, 4);
      ctx.fillStyle = '#FFF4EA'; E.rrect(ctx, k - 1.3, -36, 2.6, 13, 1.3); ctx.fill();
      ctx.fillStyle = '#FF6F9F'; ctx.fillRect(k - 1.3, -32, 2.6, 2); ctx.fillRect(k - 1.3, -27.5, 2.6, 2);
    }
    ctx.fillStyle = '#FFF4EA'; E.rrect(ctx, -54, -32, 108, 2.2, 1); ctx.fill();
    ctx.restore();
  }
  function wateringCan(ctx, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.35);
    E.rrect(ctx, -6, -6, 12, 10, 3); jfill(ctx, '#5EC6EC', -2, -3, 8, 0.8);
    ctx.strokeStyle = '#3FA6D6'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(-13, -5); ctx.stroke();
    ctx.beginPath(); ctx.arc(1, -7, 4, Math.PI, 0); ctx.stroke();
    ctx.restore();
  }
  /* (ox, oy) = the orchard's centre; the concept's orchard sat at (95, 1820). */
  const ORCHARD = [[38, 1782, 1.0, '#7ED67C'], [108, 1770, 1.05, '#8EDC86'], [168, 1797, 0.92, '#7ED67C'], [22, 1846, 1.05, '#86D980'], [80, 1846, 1.12, '#7ED67C'], [145, 1866, 0.95, '#8EDC86']];
  function orchardTrees(ox, oy) { return ORCHARD.map(([x, y, s, c]) => [x - 95 + ox, y - 1820 + oy, s, c]); }
  function orchard(ctx, R, ox, oy) {
    const fr = ['#FF6F9F', '#FFD43A', '#FF9F4A', '#A77BF2'];
    for (const [x, y, s, c] of orchardTrees(ox, oy)) gumTree(ctx, x, y, s, c, fr, R);
  }
  function orchardFront(ctx, ox, oy) {
    ctx.save(); ctx.translate(ox - 95, oy - 1820);
    // ladder against a tree, basket of gumdrops
    ctx.save(); ctx.translate(98, 1849);
    ctx.strokeStyle = '#C08A5C'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -30); ctx.moveTo(7, 0); ctx.lineTo(0, -30); for (let k = 1; k < 5; k++) { ctx.moveTo(-k * 1.6 + 0, -k * 6.5 + 0); ctx.lineTo(7 - k * 1.6, -k * 6.5); } ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(122, 1872);
    contact(ctx, 1, 1, 10, 3);
    ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(8, -7); ctx.lineTo(6, 0); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fillStyle = '#D99A66'; ctx.fill();
    ctx.strokeStyle = '#B9784A'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(7, -4); ctx.stroke();
    for (const [a, c] of [[-5, '#FF6F9F'], [-1, '#FFD43A'], [3, '#A77BF2'], [6, '#FF9F4A'], [1, '#91E9CC']]) { ctx.beginPath(); ctx.arc(a, -8 - (a === 1 ? 2.5 : 0), 2.6, Math.PI, 0); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); }
    ctx.restore();
    for (const [x, y, c] of [[60, 1862, '#FF6F9F'], [176, 1820, '#FFD43A'], [52, 1798, '#A77BF2'], [130, 1790, '#FF9F4A']]) { ctx.beginPath(); ctx.arc(x, y, 2.6, Math.PI, 0); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); ell(ctx, x + 1, y + 0.8, 3, 0.9, 'rgba(40,25,70,.2)'); }
    ctx.restore();
  }
  function tent(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c => { c.beginPath(); c.moveTo(-30, 0); c.lineTo(0, -40); c.lineTo(30, 0); c.closePath(); }, { a: 0.18 });
    contact(ctx, 0, 1, 36, 7, 0.3);
    ctx.beginPath(); ctx.moveTo(-31, 0); ctx.quadraticCurveTo(-14, -18, 0, -40); ctx.quadraticCurveTo(14, -18, 31, 0); ctx.closePath();
    const g = ctx.createLinearGradient(-30, -40, 30, 0); g.addColorStop(0, '#FFB8D4'); g.addColorStop(0.5, '#FF7FB0'); g.addColorStop(1, '#D9497F'); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let k = -40; k < 40; k += 12) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + 5, 0); ctx.lineTo(1.2 + k * 0.05, -40); ctx.lineTo(-1.2 + k * 0.05, -40); ctx.fill(); } ctx.restore();
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(-3, -12, 0, -22); ctx.quadraticCurveTo(3, -12, 9, 0); ctx.closePath(); ctx.fillStyle = '#6E2A4C'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.quadraticCurveTo(5, -12, 12, 0); ctx.lineTo(4, 0); ctx.quadraticCurveTo(3, -10, 0, -22); ctx.fillStyle = '#FFC2DD'; ctx.fill();
    ctx.strokeStyle = 'rgba(120,30,70,.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-31, 0); ctx.quadraticCurveTo(-14, -18, 0, -40); ctx.quadraticCurveTo(14, -18, 31, 0); ctx.stroke();
    ctx.strokeStyle = '#B9784A'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, -48); ctx.stroke();
    ctx.fillStyle = '#FFD43A'; ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(9, -45.5); ctx.lineTo(0, -43); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-31, 0); ctx.lineTo(-40, 4); ctx.moveTo(31, 0); ctx.lineTo(40, 4); ctx.stroke();
    hl(ctx, -10, -24, 4, 1.6, -1, 0.55);
    ctx.restore();
  }
  function campfireBase(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    contact(ctx, 0, 1, 18, 6, 0.3);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ell(ctx, Math.cos(a) * 12, Math.sin(a) * 5 + 1, 3.4, 2.4, k % 2 ? '#D9D0E0' : '#EDE6F2'); hl(ctx, Math.cos(a) * 12 - 1, Math.sin(a) * 5, 1.2, 0.6, 0, 0.9); }
    ell(ctx, 0, 1, 9, 3.6, '#5A3A3A');
    ctx.lineCap = 'round'; for (const a of [0.5, -0.5, 1.6]) { ctx.save(); ctx.rotate(a * 0.4); ctx.strokeStyle = '#A86C45'; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(-9, 1); ctx.lineTo(9, -1); ctx.stroke(); ctx.strokeStyle = '#D99A66'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, -2); ctx.stroke(); ctx.restore(); }
    ctx.restore();
    // log seats
    for (const [lx, ly, r] of [[-26, 2, 0.2], [24, 10, -0.3]]) {
      ctx.save(); ctx.translate(x + lx, y + ly); ctx.rotate(r);
      contact(ctx, 1, 3, 14, 4, 0.25);
      E.rrect(ctx, -12, -4.5, 24, 9, 4.5); jfill(ctx, '#C98A52', -4, -3, 12, 0.8);
      ell(ctx, 12, 0, 3, 4.5, '#F2C68E'); ctx.strokeStyle = '#C98A52'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(12, 0, 1.6, 2.6, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // marshmallow stick
    ctx.strokeStyle = '#A86C45'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 24, y - 2); ctx.lineTo(x - 8, y - 12); ctx.stroke();
    E.rrect(ctx, x - 10, y - 15, 5, 5, 1.6); ctx.fillStyle = '#FFF7F0'; ctx.fill();
  }
  function windmillBody(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c => { c.beginPath(); c.moveTo(-20, 0); c.lineTo(-13, -62); c.lineTo(0, -80); c.lineTo(13, -62); c.lineTo(20, 0); c.closePath(); }, { a: 0.18 });
    contact(ctx, 0, 1, 28, 7, 0.32);
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(-17, -32, -13, -62); ctx.lineTo(13, -62); ctx.quadraticCurveTo(17, -32, 20, 0); ctx.closePath();
    const g = ctx.createLinearGradient(-20, 0, 20, 0); g.addColorStop(0, '#FFFDF8'); g.addColorStop(0.55, '#FFEFE0'); g.addColorStop(1, '#E8C6B8'); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(255,111,159,.85)';
    for (let k = -80; k < 40; k += 13) { ctx.beginPath(); ctx.moveTo(-30, k); ctx.lineTo(30, k - 16); ctx.lineTo(30, k - 10); ctx.lineTo(-30, k + 6); ctx.fill(); }
    ctx.fillStyle = 'rgba(80,30,60,.12)'; ctx.fillRect(6, -70, 20, 80); ctx.restore();
    ctx.strokeStyle = 'rgba(150,60,90,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(-17, -32, -13, -62); ctx.lineTo(13, -62); ctx.quadraticCurveTo(17, -32, 20, 0); ctx.stroke();
    // cap
    ctx.beginPath(); ctx.moveTo(-17, -60); ctx.quadraticCurveTo(-16, -84, 0, -86); ctx.quadraticCurveTo(16, -84, 17, -60); ctx.quadraticCurveTo(0, -55, -17, -60); jfill(ctx, '#A77BF2', -6, -76, 20, 1.2);
    hl(ctx, -8, -77, 4, 1.8, -0.8, 0.75);
    ell(ctx, 0, -88, 3, 3, '#FFD43A');
    // door + window
    ctx.beginPath(); ctx.arc(0, -10, 6, Math.PI, 0); ctx.lineTo(6, 0); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fillStyle = '#9C2F57'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -40, 4.5, 0, TAU); ctx.fillStyle = '#FFE08A'; ctx.fill(); ctx.strokeStyle = '#E8A36C'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
    // sugar sacks
    for (const [sx, sy, s] of [[x + 24, y + 4, 1], [x + 33, y + 8, 0.8]]) {
      contact(ctx, sx + 1, sy, 8 * s, 2.5 * s, 0.3);
      ctx.beginPath(); ctx.moveTo(sx - 6 * s, sy); ctx.quadraticCurveTo(sx - 8 * s, sy - 10 * s, sx - 2.5 * s, sy - 12 * s); ctx.lineTo(sx + 2.5 * s, sy - 12 * s); ctx.quadraticCurveTo(sx + 8 * s, sy - 10 * s, sx + 6 * s, sy); ctx.closePath();
      jfill(ctx, '#F7EBDD', sx - 2, sy - 7, 8 * s, 0.8);
      ctx.fillStyle = '#FF6F9F'; ctx.fillRect(sx - 3 * s, sy - 12 * s, 6 * s, 1.5 * s);
    }
  }
  function beehive(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, rect(-12, -42, 24, 42, 8), { a: 0.16 });
    contact(ctx, 0, 1, 16, 5, 0.3);
    ctx.fillStyle = '#A86C45'; ctx.fillRect(-9, -14, 2.6, 14); ctx.fillRect(6.4, -14, 2.6, 14); E.rrect(ctx, -13, -17, 26, 4, 2); ctx.fill();
    for (let k = 0; k < 4; k++) { const w = 13 - Math.abs(k - 1.2) * 2.4; ctx.beginPath(); ctx.ellipse(0, -21 - k * 6.4, w, 4.6, 0, 0, TAU); jfill(ctx, '#FFC94A', -3, -24 - k * 6, w, 0.8); }
    ctx.beginPath(); ctx.arc(0, -23, 3, 0, TAU); ctx.fillStyle = '#6E3E1E'; ctx.fill();
    hl(ctx, -5, -42, 3, 1.4, -0.5, 0.8);
    ctx.restore();
  }
  function lighthouse(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    // rocks
    for (const [rx, ry, r] of [[-12, 4, 9], [10, 6, 8], [0, 8, 10], [-20, 9, 6]]) { ell(ctx, rx + 2, ry + 3, r + 1, r * 0.55, 'rgba(30,70,100,.25)'); ctx.beginPath(); ctx.ellipse(rx, ry, r, r * 0.62, 0, 0, TAU); jfill(ctx, '#D9CFE6', rx - 2, ry - 2, r, 0.8); }
    cast(ctx, 0, 0, c => { c.beginPath(); c.moveTo(-11, 0); c.lineTo(-7, -66); c.lineTo(7, -66); c.lineTo(11, 0); c.closePath(); c.arc(0, -72, 9, 0, TAU); }, { a: 0.16, len: 0.6, sq: 0.25 });
    ctx.beginPath(); ctx.moveTo(-11, 2); ctx.lineTo(-7, -60); ctx.lineTo(7, -60); ctx.lineTo(11, 2); ctx.closePath();
    const g = ctx.createLinearGradient(-11, 0, 11, 0); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.6, '#F5ECF2'); g.addColorStop(1, '#D8C6D4'); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#FF4F86'; for (const k of [-8, -30, -52]) { ctx.beginPath(); ctx.moveTo(-14, k); ctx.lineTo(14, k - 4); ctx.lineTo(14, k - 13); ctx.lineTo(-14, k - 9); ctx.fill(); } ctx.fillStyle = 'rgba(70,20,50,.14)'; ctx.fillRect(4, -62, 10, 66); ctx.restore();
    ctx.beginPath(); ctx.arc(0, -1, 3.4, Math.PI, 0); ctx.lineTo(3.4, 2); ctx.lineTo(-3.4, 2); ctx.fillStyle = '#6E2A4C'; ctx.fill();
    E.rrect(ctx, -10, -63, 20, 4, 2); ctx.fillStyle = '#4FC0EA'; ctx.fill();
    E.rrect(ctx, -6.5, -74, 13, 11, 3); ctx.fillStyle = '#FFF3B0'; ctx.fill(); ctx.strokeStyle = '#4FC0EA'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, -73); ctx.quadraticCurveTo(0, -86, 8, -73); ctx.closePath(); jfill(ctx, '#FF4F86', -2, -78, 8, 1);
    ell(ctx, 0, -84, 1.8, 1.8, '#FFD43A');
    ctx.restore();
  }
  function pier(ctx, x0, y0, y1) {
    // planks from beach (y0) out to y1
    ctx.save();
    for (let y = y0; y > y1; y -= 8) { ctx.fillStyle = 'rgba(20,70,100,.25)'; ctx.fillRect(x0 + 10, y + 4, 2.6, 7); ctx.fillRect(x0 - 8, y + 4, 2.6, 7); }
    ctx.fillStyle = 'rgba(20,70,100,.25)'; ctx.fillRect(x0 - 8 + 4, y1 + 4, 20, y0 - y1);
    for (let y = y0; y > y1; y -= 4.6) { ctx.fillStyle = (Math.round(y / 4.6) % 2) ? '#D99A66' : '#E6AC78'; E.rrect(ctx, x0 - 10, y - 4, 20, 4, 1.2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x0 - 9, y - 3.6, 18, 0.8); }
    for (const px of [x0 - 10, x0 + 8]) for (let y = y0; y > y1 - 2; y -= 22) { ctx.beginPath(); ctx.arc(px + 1, y - 3, 2.6, 0, TAU); jfill(ctx, '#C98A52', px, y - 4, 2.6, 0.6); }
    ctx.restore();
  }
  /* The hamster itself is a native sprite seated at (x, y); this draws its rod and bucket. */
  function hamsterFishing(ctx, x, y, tip) {
    ctx.strokeStyle = '#A86C45'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 9, y - 10); ctx.quadraticCurveTo(x + 22, y - 22, tip.x, tip.y); ctx.stroke();
    // bucket
    ctx.save(); ctx.translate(x - 10, y + 2); contact(ctx, 0, 0, 6, 2); ctx.beginPath(); ctx.moveTo(-4.5, -8); ctx.lineTo(4.5, -8); ctx.lineTo(3.5, 0); ctx.lineTo(-3.5, 0); ctx.closePath(); jfill(ctx, '#5EC6EC', -1, -4, 6, 0.7); ell(ctx, 0, -8, 4.5, 1.3, '#2D86B8'); ctx.restore();
  }
  function fgLeaf(ctx, x, y, L, w, a, c) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -w, L, 0); ctx.quadraticCurveTo(L * 0.5, w, 0, 0);
    const g = ctx.createLinearGradient(0, -w, 0, w); g.addColorStop(0, E.shade(c, 0.18)); g.addColorStop(1, E.shade(c, -0.25)); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = E.rgba(E.shade(c, -0.45), 0.6); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(L * 0.85, 0); ctx.stroke();
    ctx.restore();
  }
  function fgBranch(ctx, x, y, s, side, R, c) {
    // a leafy branch reaching in from the edge
    const dir = side < 0 ? 1 : -1, len = 70 * s;
    ctx.save(); ctx.lineCap = 'round';
    const ex = x + dir * len, ey = y + 14 * s, cx = x + dir * len * 0.5, cy = y - 18 * s;
    ctx.strokeStyle = '#5A3A2E'; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(x - dir * 10, y + 6); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
    for (let k = 0; k < 14; k++) {
      const t = 0.2 + k / 14 * 0.85, px = (1 - t) * (1 - t) * (x - dir * 10) + 2 * (1 - t) * t * cx + t * t * ex, py = (1 - t) * (1 - t) * (y + 6) + 2 * (1 - t) * t * cy + t * t * ey;
      const up = k % 2 ? -1 : 1, a = (dir > 0 ? 0 : Math.PI) + up * (0.7 + R() * 0.5) + (dir > 0 ? 0.25 : -0.25);
      fgLeaf(ctx, px, py, (15 + R() * 8) * s, (5.5 + R() * 2) * s, a, R() < 0.3 ? E.shade(c, 0.12) : c);
    }
    ctx.restore();
  }
  function fgBush(ctx, x, y, s, side, R, c) {
    const dir = side < 0 ? 1 : -1;
    ctx.save();
    const sh = ctx.createRadialGradient(x, y + s * 0.5, 4, x, y + s * 0.5, s * 1.4); sh.addColorStop(0, 'rgba(20,50,40,.35)'); sh.addColorStop(1, 'rgba(20,50,40,0)');
    ctx.fillStyle = sh; ctx.fillRect(x - s * 1.6, y - s, s * 3.2, s * 3);
    const lobes = [[0, 0, s], [dir * s * 0.75, s * 0.35, s * 0.62], [dir * s * 0.25, -s * 0.62, s * 0.66], [-dir * s * 0.3, s * 0.55, s * 0.7]];
    for (const [dx, dy, r] of lobes) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU);
      const g = ctx.createRadialGradient(x + dx - r * 0.4, y + dy - r * 0.5, r * 0.1, x + dx, y + dy, r * 1.05);
      g.addColorStop(0, E.shade(c, 0.22)); g.addColorStop(0.5, c); g.addColorStop(1, E.shade(c, -0.4)); ctx.fillStyle = g; ctx.fill();
    }
    // leaf scallops on the lit rim
    for (let k = 0; k < 16; k++) { const [dx, dy, r] = lobes[k % lobes.length], a = -Math.PI * 0.95 + R() * Math.PI * 0.9; fgLeaf(ctx, x + dx + Math.cos(a) * r * 0.82, y + dy + Math.sin(a) * r * 0.82, 9 + R() * 5, 3.6, a, E.shade(c, 0.1)); }
    for (let k = 0; k < 3; k++) { const a = R() * TAU, r = R() * s * 0.6; ell(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, 2.6, 2.6, ['#FF8FBC', '#FFF4EA', '#FFD43A'][k]); }
    ctx.restore();
  }
  function fgTrunk(ctx, x, y, s, side, R, c) {
    // a cropped tree: trunk rising out of frame, canopy mass at the top edge of the trunk
    const top = y - 190 * s, w = 24 * s;
    ctx.save();
    const tg = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); tg.addColorStop(0, '#8E5E40'); tg.addColorStop(0.45, '#6B4430'); tg.addColorStop(1, '#3E2820');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(x - w * 0.8, y + 10); ctx.quadraticCurveTo(x - w * 0.45, y - 20, x - w / 2, top); ctx.lineTo(x + w / 2, top); ctx.quadraticCurveTo(x + w * 0.45, y - 20, x + w * 0.9, y + 10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,24,18,.45)'; ctx.lineWidth = 1.3; for (let k = 0; k < 7; k++) { const yy = top + 20 + k * 24 * s; ctx.beginPath(); ctx.moveTo(x - w * 0.3 + R() * 4, yy); ctx.quadraticCurveTo(x, yy + 8, x + w * 0.2, yy + 16); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,220,180,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - w * 0.32, top + 10); ctx.lineTo(x - w * 0.36, y - 10); ctx.stroke();
    ctx.restore();
    fgBush(ctx, x + (side < 0 ? 14 : -14), top - 6, 40 * s, side, R, c);
    fgBush(ctx, x, y + 14, 24 * s, side, R, E.shade(c, -0.06));
  }

  window.K = { TAU, beehive, campfireBase, cast, contact, cottage, critter, ell, fgBranch, fgBush, fgLeaf, fgTrunk, flower, flowerPatch, garden, gumTree, hamsterFishing, hl, island, jfill, jgrad, lighthouse, nest, orchard, orchardFront, orchardTrees, palm, pier, stepPiece, tent, tuft, wateringCan, windmillBody, woodSign, circ, rect, ORCHARD };
})();
