/* Chapter 2 — Jelly Lagoon (levels 11–20). The concept's lagoon (sand islands under every stone,
   turquoise shallows with caustics, deep blue between, palms, whale, octo, sailboat, buoys,
   jellyfish, a dock with a rowboat) plus the brief for 15–20: the Deep Dive platform at 15 with
   its bubble-helmet rack, a coral reef seen through the shallows, a village on stilts, a jelly
   whale family, and the ferry dock at the foot of the peaks where the gate stands (20). */
(function () {
  'use strict';
  const L = window.L, K = window.K, W = window.WORLD, TAU = Math.PI * 2;
  const { ell, hl, jfill, jgrad, cast, contact, rect, island, palm } = K;

  function wig(x) { return Math.sin(x / 37 + 1.4) * 5 + Math.sin(x / 13 + 0.3) * 1.6; }
  function geom(B) {
    if (B._g) return B._g;
    const g = {};
    // the far shore: the foot of the next chapter, rising on the free side of the last node
    g.shoreY = W.yBound(B.k + 1);
    const gp = W.roadAtY(g.shoreY, B.i1, B.i1 + 1);
    g.gate = { x: gp.x, y: gp.y, tx: gp.tx, ty: gp.ty };
    const s = B.node(9).m;
    g.topEdge = x => g.shoreY + (g.gate.x - x) * 0.22 * s + wig(x) - wig(g.gate.x);
    // the near shore is the meadow's (drawn over us); for gradients we only need its height
    g.nearY = W.yBound(B.k);
    // islands: one under every stone, then the scenery isles (canonical anchors)
    g.isles = B.nodes.map(n => ({ x: n.x, y: n.y + 10, rx: 44, ry: 27, grass: true, node: true }));
    const A = (j, dx, dy, rx, ry, grass = true) => { const p = B.A(j, dx, dy); return { x: p.x, y: p.y, rx, ry, grass, m: p.m }; };
    g.palmIsle = A(0, 128, -34, 50, 30);
    g.chestIsle = A(1, 92, 26, 24, 14, false);
    g.signIsle = A(2, 104, 34, 30, 17);
    g.octoRock = A(1, 196, -14, 0, 0);
    g.diveIsle = A(4, -142, -30, 52, 30);
    g.chest16Isle = A(5, 92, 22, 24, 14, false);
    g.villageIsle = A(6, 140, 54, 58, 26);
    g.dockIsle = A(7, 164, -12, 44, 26);
    g.rockIsle = A(8, 150, 44, 22, 13, false);
    g.floe = A(8, -140, -40, 0, 0);
    g.farIsle = A(3, -88, -58, 26, 15);
    g.isles.push(g.palmIsle, g.chestIsle, g.signIsle, g.diveIsle, g.chest16Isle, g.villageIsle, g.dockIsle, g.rockIsle, g.farIsle);
    // things in the water
    g.whale = B.A(3, 168, 18);
    g.boat = B.A(2, -112, -48);
    g.jellies = [B.A(3, -86, 52), B.A(3, -64, 76)];
    g.reef = B.A(4, 126, 54);
    g.whales = [B.A(6, -132, -44), B.A(6, -96, -24)];
    g.buoys = [[B.A(0, -96, -40), '#FF4F86', 0], [B.A(3, 90, -70), '#FFD43A', 1.7], [B.A(5, 150, -40), '#FF9F4A', 3.1], [B.A(7, -70, 40), '#5EC6EC', 4.2], [B.A(9, 120, 30), '#FF4F86', 2.3]];
    g.ferryDock = B.A(9, 150, -62);
    return (B._g = g);
  }

  function waterPoly(ctx, B, g) {
    ctx.beginPath(); ctx.moveTo(-20, g.nearY + 400);
    for (let x = -20; x <= W.DW + 20; x += 5) ctx.lineTo(x, g.topEdge(x));
    ctx.lineTo(W.DW + 20, g.nearY + 400); ctx.closePath();
  }

  function ground(ctx, B) {
    const g = geom(B), DW = W.DW, R = B.rng(31);
    const top = g.shoreY, bot = g.nearY;
    ctx.save(); waterPoly(ctx, B, g); ctx.clip();
    // open water: shallow turquoise at both shores, deep blue across the middle
    const gr = ctx.createLinearGradient(0, top - 40, 0, bot + 20);
    gr.addColorStop(0, '#5CCBE0'); gr.addColorStop(0.12, '#2A9AD6'); gr.addColorStop(0.45, '#1C78C4'); gr.addColorStop(0.8, '#2490D2'); gr.addColorStop(1, '#38AEDD');
    ctx.fillStyle = gr; ctx.fillRect(-20, top - 120, DW + 40, bot - top + 520);
    for (let i = 0; i < 46; i++) { const x = R() * DW, y = top + 40 + R() * (bot - top - 80); ell(ctx, x, y, 50 + R() * 70, 16 + R() * 22, R() < 0.6 ? 'rgba(12,70,150,.16)' : 'rgba(120,210,240,.10)', R() - 0.5); }
    // shallows along the near (meadow) shore and the far shore, and around every island
    const near = ctx.createLinearGradient(0, bot + 10, 0, bot - 150); near.addColorStop(0, 'rgba(140,240,226,1)'); near.addColorStop(0.35, 'rgba(84,214,222,.85)'); near.addColorStop(1, 'rgba(56,174,221,0)');
    ctx.fillStyle = near; ctx.fillRect(-20, bot - 200, DW + 40, 320);
    const far = ctx.createLinearGradient(0, top - 10, 0, top + 120); far.addColorStop(0, 'rgba(170,240,236,1)'); far.addColorStop(0.4, 'rgba(96,206,226,.7)'); far.addColorStop(1, 'rgba(56,174,221,0)');
    ctx.fillStyle = far; ctx.fillRect(-20, top - 100, DW + 40, 240);
    for (const s of g.isles) {
      if (!s.rx) continue;
      ctx.save(); ctx.translate(s.x, s.y); ctx.scale(1, (s.ry + 22) / (s.rx + 34));
      const ig = ctx.createRadialGradient(0, 0, s.rx * 0.9, 0, 0, s.rx + 34); ig.addColorStop(0, 'rgba(140,240,226,1)'); ig.addColorStop(0.45, 'rgba(84,214,222,.8)'); ig.addColorStop(1, 'rgba(56,174,221,0)');
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(0, 0, s.rx + 34, 0, TAU); ctx.fill(); ctx.restore();
    }
    // the coral reef under the shallows by 15–16: blobs and fans seen through the water
    reef(ctx, g.reef.x, g.reef.y, B.rng(5));
    // caustic light cells in the shallows
    ctx.save();
    ctx.beginPath();
    for (let x = -10; x <= DW + 10; x += 6) ctx.lineTo(x, bot - 70 - Math.sin(x / 31) * 8); ctx.lineTo(DW + 10, bot + 40); ctx.lineTo(-10, bot + 40); ctx.closePath();
    ctx.moveTo(-10, top - 20); for (let x = -10; x <= DW + 10; x += 6) ctx.lineTo(x, g.topEdge(x) + 66 + Math.sin(x / 27) * 8); ctx.lineTo(DW + 10, top - 20); ctx.closePath();
    for (const s of g.isles) { if (!s.rx) continue; ctx.moveTo(s.x + s.rx + 24, s.y); ctx.ellipse(s.x, s.y, s.rx + 24, s.ry + 16, 0, 0, TAU); }
    ctx.moveTo(g.reef.x + 70, g.reef.y); ctx.ellipse(g.reef.x, g.reef.y, 70, 40, 0, 0, TAU);
    ctx.clip();
    ctx.lineJoin = 'round';
    const cell = 15;
    for (let gy = top - 30; gy < bot + 30; gy += cell * 0.7) for (let gx = -6 + R() * cell; gx < DW + 10; gx += cell * (0.8 + R() * 0.6)) {
      if (R() < 0.3) continue;
      const cx = gx + (R() - 0.5) * 9, cy = gy + (R() - 0.5) * 7;
      ctx.strokeStyle = `rgba(255,255,255,${0.16 + R() * 0.26})`; ctx.lineWidth = 0.9;
      const m = 4 + Math.floor(R() * 3), sc = 0.7 + R() * 0.8, a0 = R() * TAU; ctx.beginPath();
      for (let k = 0; k < m; k++) { const a = a0 + k / m * TAU + R() * 0.5, r = (3.5 + R() * 3) * sc, x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r * 0.6; if (R() < 0.75) { k ? ctx.quadraticCurveTo(cx + Math.cos(a - 0.5) * r * 1.2, cy + Math.sin(a - 0.5) * r * 0.75, x1, y1) : ctx.moveTo(x1, y1); } else ctx.moveTo(x1, y1); }
      ctx.stroke();
    }
    ctx.restore();
    // wave ticks in open water, clear of the trail and the islands
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let i = 0; i < 120; i++) {
      const x = R() * DW, y = top + 60 + R() * (bot - top - 140);
      if (W.distToRoad(x, y) < 34 || g.isles.some(s => Math.abs(x - s.x) < s.rx + 30 && Math.abs(y - s.y) < s.ry + 22)) continue;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 8, y); ctx.quadraticCurveTo(x + 12, y + 3, x + 16, y); ctx.stroke();
    }
    for (const s of g.isles) if (s.rx) island(ctx, s.x, s.y, s.rx, s.ry, null, s.grass);
    ctx.restore();
    // the far shore: foam on the water's top edge (the land above is the next chapter's)
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, g.topEdge(x) + 1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([10, 7]); ctx.beginPath(); for (let x = -10; x <= DW + 10; x += 5) ctx.lineTo(x, g.topEdge(x) + 7 + Math.sin(x / 17) * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  function reef(ctx, x0, y0, R) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    const cols = ['#FF7FB0', '#FFB36B', '#B994FF', '#FF5E7E', '#7FE0C8', '#FFD43A'];
    for (let k = 0; k < 26; k++) {
      const a = R() * TAU, r = Math.sqrt(R()), x = x0 + Math.cos(a) * 58 * r, y = y0 + Math.sin(a) * 30 * r, c = cols[k % cols.length];
      if (k % 3 === 0) { // fan coral
        ctx.save(); ctx.translate(x, y); ctx.rotate((R() - 0.5) * 0.8);
        ctx.beginPath(); ctx.moveTo(0, 4); for (let q = 0; q <= 8; q++) { const aa = Math.PI + q / 8 * Math.PI; ctx.lineTo(Math.cos(aa) * 9, Math.sin(aa) * 8); } ctx.closePath();
        ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let q = 0; q <= 6; q++) { const aa = Math.PI + q / 6 * Math.PI; ctx.moveTo(0, 3); ctx.lineTo(Math.cos(aa) * 8, Math.sin(aa) * 7); } ctx.stroke();
        ctx.restore();
      } else if (k % 3 === 1) { // brain coral blob
        ctx.beginPath(); ctx.ellipse(x, y, 5 + R() * 5, 3.5 + R() * 3, 0, 0, TAU); ctx.fillStyle = jgrad(ctx, c, x - 2, y - 2, 8); ctx.fill();
      } else { // branching coral
        ctx.strokeStyle = c; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath();
        for (let q = -1; q <= 1; q++) { ctx.moveTo(x, y + 3); ctx.quadraticCurveTo(x + q * 4, y - 2, x + q * 6, y - 8 - R() * 3); } ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------- landmarks ---------- */
  function divingPlatform(ctx, x, y, m) {
    // a candy diving tower on the island, its board reaching out over the water toward the trail
    ctx.save(); ctx.translate(x, y);
    cast(ctx, 0, 0, c => { c.beginPath(); c.rect(-12, -58, 24, 58); }, { a: 0.16 });
    contact(ctx, 0, 1, 20, 5, 0.3);
    for (const sx of [-10, 8]) { ctx.fillStyle = '#FFF4EA'; L.rrect(ctx, sx, -56, 3.4, 56, 1.6); ctx.fill(); ctx.save(); L.rrect(ctx, sx, -56, 3.4, 56, 1.6); ctx.clip(); ctx.fillStyle = '#5EC6EC'; for (let k = -60; k < 4; k += 7) ctx.fillRect(sx - 1, k, 6, 3); ctx.restore(); }
    for (let k = 0; k < 4; k++) { ctx.fillStyle = '#E6AC78'; L.rrect(ctx, -9, -12 - k * 12, 18, 2.4, 1); ctx.fill(); }
    // top deck + board
    L.rrect(ctx, -14, -60, 28, 6, 2); jfill(ctx, '#FF7FB0', -6, -60, 14, 0.9);
    ctx.save(); ctx.scale(m, 1);
    L.rrect(ctx, 10, -61, 34, 3.6, 1.8); ctx.fillStyle = '#FFE9A8'; ctx.fill(); ctx.strokeStyle = 'rgba(160,110,60,.45)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.restore();
    // a little flag
    ctx.strokeStyle = '#B9784A'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-12, -60); ctx.lineTo(-12, -74); ctx.stroke();
    ctx.fillStyle = '#FFD43A'; ctx.beginPath(); ctx.moveTo(-12, -74); ctx.lineTo(-3, -71); ctx.lineTo(-12, -68); ctx.fill();
    hl(ctx, -8, -58, 3, 1, 0, 0.7);
    ctx.restore();
  }
  function helmetRack(ctx, x, y) {
    // bubble helmets on a candy rack, waiting for divers
    ctx.save(); ctx.translate(x, y);
    contact(ctx, 0, 1, 22, 4, 0.28);
    ctx.fillStyle = '#C98A52'; ctx.fillRect(-20, -14, 2.4, 14); ctx.fillRect(18, -14, 2.4, 14); L.rrect(ctx, -21, -16, 43, 3.2, 1.4); ctx.fill();
    for (const hx of [-12, 0, 12]) {
      ctx.beginPath(); ctx.arc(hx, -22, 6.4, 0, TAU);
      const g = ctx.createRadialGradient(hx - 2, -25, 0.5, hx, -22, 7); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.6, 'rgba(200,240,255,.55)'); g.addColorStop(1, 'rgba(120,200,240,.75)');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(60,150,200,.6)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#FFD43A'; L.rrect(ctx, hx - 5, -17.5, 10, 2.6, 1.2); ctx.fill();
      hl(ctx, hx - 2.4, -25, 1.8, 1, -0.5, 0.95);
    }
    ctx.restore();
  }
  function stiltHut(ctx, x, y, roof, s = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    // stilts into the water, with ripples
    for (const sx of [-12, -4, 4, 12]) { ctx.fillStyle = '#A86C45'; ctx.fillRect(sx - 1.2, -12, 2.4, 14); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(sx, 2, 3.6, 1.2, 0, 0, TAU); ctx.stroke(); }
    ell(ctx, 3, 4, 18, 4, 'rgba(20,80,120,.25)');
    L.rrect(ctx, -16, -15, 32, 4, 1.4); ctx.fillStyle = '#D99A66'; ctx.fill();
    // hut body
    L.rrect(ctx, -12, -34, 24, 20, 4); jfill(ctx, '#FFF0D6', -4, -28, 16, 0.9);
    ctx.beginPath(); ctx.arc(0, -21, 4.2, Math.PI, 0); ctx.lineTo(4.2, -15); ctx.lineTo(-4.2, -15); ctx.closePath(); ctx.fillStyle = '#9C2F57'; ctx.fill();
    ctx.beginPath(); ctx.arc(7, -27, 2.6, 0, TAU); ctx.fillStyle = '#FFE08A'; ctx.fill();
    // thatch-candy roof
    ctx.beginPath(); ctx.moveTo(-17, -32); ctx.quadraticCurveTo(0, -52, 17, -32); ctx.quadraticCurveTo(0, -28, -17, -32); jfill(ctx, roof, -6, -42, 16, 1);
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let k = -12; k <= 12; k += 6) { ctx.moveTo(k * 0.4, -46); ctx.lineTo(k, -32); } ctx.stroke();
    hl(ctx, -7, -41, 3.4, 1.4, -0.6, 0.75);
    ctx.restore();
  }
  function boardwalk(ctx, x0, y0, x1, y1) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 4.6)), ang = Math.atan2(y1 - y0, x1 - x0);
    ctx.save();
    for (let k = 0; k <= n; k++) {
      const u = k / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
      ctx.fillStyle = 'rgba(20,70,100,.22)'; ctx.fillRect(-4, 2, 9, 3);
      ctx.fillStyle = k % 2 ? '#D99A66' : '#E6AC78'; L.rrect(ctx, -5, -2, 10, 4, 1); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
  function jellyWhale(ctx, x, y, s, c, flip) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (flip ? -1 : 1), s);
    ell(ctx, 4, 6, 30, 9, 'rgba(20,80,130,.3)');
    ctx.beginPath(); ctx.ellipse(0, 0, 27, 13, 0, Math.PI, TAU); ctx.quadraticCurveTo(0, 4, -27, 0); jfill(ctx, c, -8, -8, 22, 1.2);
    ctx.beginPath(); ctx.ellipse(0, -0.5, 22, 3, 0, 0, Math.PI); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    hl(ctx, -12, -9, 5, 2, -0.3, 0.75);
    ell(ctx, -15, -4, 1.8, 1.8, '#2A1F2B'); ell(ctx, -15.5, -4.6, 0.6, 0.6, '#fff');
    ell(ctx, -19, -1.5, 2.6, 1.3, 'rgba(255,120,170,.45)');
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 1, 31, 6, 0, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.save(); ctx.translate(36, -2); ctx.rotate(0.3);
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(-2, -4, -9, -9); ctx.quadraticCurveTo(-1, -7, 0, -2); ctx.quadraticCurveTo(1, -7, 9, -9); ctx.quadraticCurveTo(2, -4, 0, 4); jfill(ctx, c, -2, -5, 8, 1); ctx.restore();
    ell(ctx, 36, 3, 7, 2, 'rgba(255,255,255,.7)');
    ctx.restore();
  }
  function dockWithRowboat(ctx, dx, dy, m) {
    ctx.save(); ctx.translate(dx, dy); ctx.scale(m, 1);
    ctx.fillStyle = 'rgba(20,80,120,.28)'; ctx.fillRect(4, -2, 34, 9);
    for (let q = 0; q < 7; q++) { ctx.fillStyle = q % 2 ? '#D99A66' : '#E6AC78'; L.rrect(ctx, q * 4.8, -6, 4.4, 10, 1); ctx.fill(); }
    for (const py of [-6, 4]) { ctx.beginPath(); ctx.arc(32, py, 2.2, 0, TAU); jfill(ctx, '#C98A52', 32, py, 2.2, 0.6); }
    const bx = 26, by = 16;
    ell(ctx, bx + 3, by + 4, 15, 4, 'rgba(20,80,120,.3)');
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(bx, by + 2, 16, 4.6, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - 14, by - 3); ctx.quadraticCurveTo(bx, by + 8, bx + 14, by - 3); ctx.quadraticCurveTo(bx, by - 1, bx - 14, by - 3); jfill(ctx, '#FFD43A', bx - 4, by, 12, 1);
    ctx.beginPath(); ctx.ellipse(bx, by - 1.6, 11, 2.2, 0, 0, TAU); ctx.fillStyle = '#B9784A'; ctx.fill();
    ctx.strokeStyle = '#FFF4EA'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(bx - 10, by - 3); ctx.lineTo(18, 2); ctx.stroke();
    ctx.restore();
  }
  function rockIslet(ctx, x, y, r = 12) {
    ell(ctx, x + 3, y + 5, r + 3, r * 0.5, 'rgba(20,80,120,.28)');
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(x, y + 3, r + 4, r * 0.62, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.66, 0, 0, TAU); jfill(ctx, '#D9CFE6', x - 4, y - 4, r, 0.8);
    hl(ctx, x - r * 0.4, y - r * 0.35, r * 0.3, r * 0.12, -0.2, 0.8);
  }
  function floe(ctx, x, y) {
    ell(ctx, x + 3, y + 5, 26, 7, 'rgba(20,80,120,.25)');
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(x, y + 3, 28, 8, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 24, y); ctx.lineTo(x - 14, y - 7); ctx.lineTo(x + 6, y - 8); ctx.lineTo(x + 22, y - 3); ctx.lineTo(x + 18, y + 5); ctx.lineTo(x - 18, y + 6); ctx.closePath();
    ctx.fillStyle = '#BFE4F5'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 24, y - 2); ctx.lineTo(x - 14, y - 9); ctx.lineTo(x + 6, y - 10); ctx.lineTo(x + 22, y - 5); ctx.lineTo(x + 18, y + 2); ctx.lineTo(x - 18, y + 3); ctx.closePath();
    jfill(ctx, '#F2FBFF', x - 6, y - 6, 22, 0.8);
    hl(ctx, x - 10, y - 6, 6, 1.4, -0.1, 0.9);
  }

  function props(B, add, ctx) {
    const g = geom(B), R = B.rng(77);
    // the palm-lollipop island by 11, with a starfish and a shell
    add(g.palmIsle.y, () => { palm(ctx, g.palmIsle.x - 14, g.palmIsle.y, 1.0, -6, R); palm(ctx, g.palmIsle.x + 20, g.palmIsle.y + 4, 0.82, 8, R); L.star(ctx, g.palmIsle.x + 8, g.palmIsle.y + 14, 4, '#FF9F4A', '#E07A2A'); ell(ctx, g.palmIsle.x - 28, g.palmIsle.y + 12, 3, 2.2, '#FFC2DD'); });
    add(g.octoRock.y, () => rockIslet(ctx, g.octoRock.x, g.octoRock.y + 4, 16));
    add(g.rockIsle.y, () => rockIslet(ctx, g.rockIsle.x, g.rockIsle.y - 2, 13));
    add(g.floe.y, () => floe(ctx, g.floe.x, g.floe.y + 4));
    add(g.farIsle.y, () => palm(ctx, g.farIsle.x + 4, g.farIsle.y, 0.75, -5, R));
    // the whale and its family (spouts are live)
    add(g.whale.y, () => jellyWhale(ctx, g.whale.x, g.whale.y, 1, '#8D7CF0', g.whale.m < 0));
    add(g.whales[0].y, () => jellyWhale(ctx, g.whales[0].x, g.whales[0].y, 1.08, '#FF9FC8', g.whales[0].m > 0));
    add(g.whales[1].y, () => jellyWhale(ctx, g.whales[1].x, g.whales[1].y, 0.6, '#FFC2DD', g.whales[1].m > 0));
    // Deep Dive at 15: the tower and the helmet rack
    add(g.diveIsle.y - 2, () => divingPlatform(ctx, g.diveIsle.x - g.diveIsle.m * 6, g.diveIsle.y - 2, g.diveIsle.m));
    add(g.diveIsle.y + 8, () => helmetRack(ctx, g.diveIsle.x + g.diveIsle.m * 22, g.diveIsle.y + 10));
    // the stilt village by 17, joined by a boardwalk to its island
    add(g.villageIsle.y - 30, () => {
      const v = g.villageIsle, s = v.m;
      boardwalk(ctx, v.x - s * 30, v.y - 4, v.x + s * 58, v.y - 34);
      boardwalk(ctx, v.x + s * 58, v.y - 34, v.x + s * 20, v.y - 52);
    });
    add(g.villageIsle.y - 36, () => { const v = g.villageIsle; stiltHut(ctx, v.x + v.m * 58, v.y - 30, '#FF9F4A', 1); });
    add(g.villageIsle.y - 50, () => { const v = g.villageIsle; stiltHut(ctx, v.x + v.m * 18, v.y - 48, '#5EC6EC', 0.86); });
    add(g.villageIsle.y - 2, () => { const v = g.villageIsle; stiltHut(ctx, v.x - v.m * 26, v.y - 2, '#B994FF', 1.05); });
    // the dock with its rowboat by 18
    add(g.dockIsle.y, () => { palm(ctx, g.dockIsle.x - g.dockIsle.m * 12, g.dockIsle.y - 2, 0.9, 6, R); dockWithRowboat(ctx, g.dockIsle.x + g.dockIsle.m * 12, g.dockIsle.y + 6, g.dockIsle.m); });
    // the ferry dock at the far shore (20): pilings, a deck and a bell post
    add(g.ferryDock.y, () => {
      const f = g.ferryDock, s = f.m;
      for (let k = 0; k < 6; k++) { const x = f.x + s * k * 9, y = f.y + k * 2; ctx.fillStyle = 'rgba(20,70,100,.25)'; ctx.fillRect(x - 1, y + 2, 3, 8); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); jfill(ctx, '#C98A52', x, y - 1, 2.6, 0.6); }
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(0.22 * s);
      for (let q = 0; q < 10; q++) { ctx.fillStyle = q % 2 ? '#D99A66' : '#E6AC78'; L.rrect(ctx, s > 0 ? q * 5 - 2 : -q * 5 - 3, -8, 4.6, 12, 1); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = '#A86C45'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(f.x - s * 4, f.y - 2); ctx.lineTo(f.x - s * 4, f.y - 22); ctx.lineTo(f.x + s * 4, f.y - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f.x + s * 1, f.y - 20); ctx.quadraticCurveTo(f.x + s * 4, f.y - 13, f.x + s * 7, f.y - 20); ctx.closePath(); jfill(ctx, '#FFD43A', f.x + s * 3, f.y - 17, 4, 0.8);
    });
  }

  function fg(B, put) {
    // lily pads and water flowers along the screen edges
    const n = j => B.node(j).y;
    const lily = (o, x, y, R, side) => {
      const cx = x + (side < 0 ? 14 : -14);
      for (const [dx, dy, r, rot] of [[0, 0, 30, 0.3], [side < 0 ? 26 : -26, 34, 20, 1.9]]) {
        o.save(); o.translate(cx + dx, y + dy); o.scale(1, 0.62); o.rotate(rot);
        o.beginPath(); o.moveTo(0, 0); o.arc(0, 0, r, 0.25, TAU - 0.25); o.closePath();
        o.fillStyle = jgrad(o, '#2F9A62', 0, 0, r); o.fill();
        o.strokeStyle = 'rgba(20,70,40,.45)'; o.lineWidth = 1; o.beginPath(); for (let k = 0; k < 5; k++) { const a = 0.6 + k * 1.1; o.moveTo(0, 0); o.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); } o.stroke();
        o.restore();
      }
      o.save(); o.translate(cx + (side < 0 ? 6 : -6), y - 6);
      for (let k = 0; k < 7; k++) { o.save(); o.rotate(k / 7 * TAU); o.beginPath(); o.ellipse(0, -7, 4, 8, 0, 0, TAU); o.fillStyle = k % 2 ? '#F7A6C8' : '#E9789F'; o.fill(); o.restore(); }
      o.beginPath(); o.arc(0, 0, 3.6, 0, TAU); o.fillStyle = '#F2CF4A'; o.fill(); o.restore();
    };
    for (const [side, y] of [[-1, n(1) + 40], [1, n(2) - 20], [1, n(5) + 40], [-1, n(6) + 10], [-1, n(8) + 60], [1, n(9) + 20]]) put({ side, y, draw: lily });
  }

  function manifest(B, put) {
    const g = geom(B);
    const shore = []; for (let x = -10; x <= W.DW + 10; x += 8) shore.push({ x, y: g.topEdge(x) + 6 });
    put.live('foam', { pts: shore });
    for (const [p, c, ph] of g.buoys) put.live('buoy', { x: p.x, y: p.y, c, ph });
    put.live('spout', { x: g.whale.x - g.whale.m * -12 - 3, y: g.whale.y - 13, ph: 0 });
    put.live('spout', { x: g.whales[0].x + g.whales[0].m * 14, y: g.whales[0].y - 14, ph: 2.2, s: 1.1 });
    put.live('spout', { x: g.whales[1].x + g.whales[1].m * 8, y: g.whales[1].y - 9, ph: 3.7, s: 0.6 });
    put.live('jelly', { x: g.jellies[0].x, y: g.jellies[0].y, c: '#FFB3E0', ph: 0 });
    put.live('jelly', { x: g.jellies[1].x, y: g.jellies[1].y, c: '#C9B3FF', ph: 1.9 });
    put.live('boat', { x: g.boat.x, y: g.boat.y });
    put.live('fish', { x: g.reef.x, y: g.reef.y, rx: 46, ry: 18, n: 5 });
    put.live('bubbles', { x: g.diveIsle.x + g.diveIsle.m * 48, y: g.diveIsle.y + 6 });
    put.live('ferry', { x: g.ferryDock.x + g.ferryDock.m * 56, y: g.ferryDock.y + 22, m: g.ferryDock.m });
    put.glow({ x: g.villageIsle.x + g.villageIsle.m * 58 + 7, y: g.villageIsle.y - 57, r: 14, c: '#FFE08A' });
    put.glow({ x: g.villageIsle.x + g.villageIsle.m * 18 + 6, y: g.villageIsle.y - 71, r: 12, c: '#FFE08A' });
    put.glow({ x: g.villageIsle.x - g.villageIsle.m * 26 + 7, y: g.villageIsle.y - 30, r: 14, c: '#FFE08A' });
    // critters: the octo on its rock, the penguin on its floe, the sprite over the village, a bunny on the dive island
    put.critter({ kind: 'octo', x: g.octoRock.x, y: g.octoRock.y, size: 40 });
    put.critter({ kind: 'penguin', x: g.floe.x, y: g.floe.y - 2, size: 40 });
    put.critter({ kind: 'sprite', x: g.villageIsle.x + g.villageIsle.m * 10, y: g.villageIsle.y - 86, size: 34, float: true });
    put.critter({ kind: 'gummy', x: g.dockIsle.x - g.dockIsle.m * 26, y: g.dockIsle.y + 4, size: 32 });
    put.chest(12, { x: g.chestIsle.x, y: g.chestIsle.y - 2 });
    put.chest(16, { x: g.chest16Isle.x, y: g.chest16Isle.y - 2 });
    const name = B.at(2, 0, 0); put.sign({ role: 'region', level: B.i0 + 3, x: g.signIsle.x, y: g.signIsle.y - 2 });
    put.sign({ role: 'rest', level: B.i0 + 5, x: g.diveIsle.x + g.diveIsle.m * 24, y: g.diveIsle.y - 12 });
    put.gate({ x: g.gate.x, y: g.gate.y + 4, angle: +Math.atan2(g.gate.ty, g.gate.tx).toFixed(3), to: B.k + 1 });
  }

  /* chapter-specific live kinds (ported in PeckLiveLayer.swift) */
  W.LIVE.fish = (ctx, e, t) => {
    const x0 = W.CX + e.dx, y0 = W.H - e.yb;
    for (let k = 0; k < (e.n || 5); k++) {
      const a = t * 0.5 + k * 0.55, x = x0 + Math.cos(a) * e.rx, y = y0 + Math.sin(a) * e.ry + Math.sin(t * 3 + k) * 1.2, dir = -Math.sin(a) > 0 ? 1 : -1;
      ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 2.2, 0, 0, TAU); ctx.fillStyle = ['#FFB36B', '#FFD43A', '#FF7FB0'][k % 3]; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3.6, 0); ctx.lineTo(-7, -2.4); ctx.lineTo(-7, 2.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2A1F2B'; ctx.beginPath(); ctx.arc(2.2, -0.5, 0.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
  };
  W.LIVE.bubbles = (ctx, e, t) => {
    const x0 = W.CX + e.dx, y0 = W.H - e.yb;
    for (let k = 0; k < 5; k++) {
      const p = (t * 0.35 + k / 5) % 1, x = x0 + Math.sin(p * 7 + k * 2) * 4, y = y0 - p * 18, r = 1.2 + p * 2.2;
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - p)})`; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    }
  };
  W.LIVE.ferry = (ctx, e, t) => {
    const x = W.CX + e.dx, y = W.H - e.yb, bob = Math.sin(t * 1.2) * 1.4, rot = Math.sin(t * 0.9) * 0.04, m = e.m || 1;
    ell(ctx, x + 4, y + 6, 24, 5, 'rgba(20,80,130,.3)');
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(x, y + 3, 25, 5, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.save(); ctx.translate(x, y + bob); ctx.rotate(rot); ctx.scale(m, 1);
    ctx.beginPath(); ctx.moveTo(-22, -4); ctx.lineTo(22, -4); ctx.quadraticCurveTo(20, 5, 10, 6); ctx.lineTo(-14, 6); ctx.quadraticCurveTo(-21, 4, -22, -4); ctx.closePath(); jfill(ctx, '#5EC6EC', -8, -2, 20, 1.1);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(-19, -2.6, 38, 1.8);
    L.rrect(ctx, -12, -18, 22, 14, 3); jfill(ctx, '#FFF4EA', -6, -14, 12, 0.8);
    for (const wx of [-8, -2, 4]) { L.rrect(ctx, wx, -15, 4, 4, 1.2); ctx.fillStyle = '#9BE3F5'; ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-14, -18); ctx.quadraticCurveTo(-1, -26, 12, -18); ctx.closePath(); jfill(ctx, '#FF7FB0', -4, -21, 10, 0.9);
    ctx.fillStyle = '#FFD43A'; L.rrect(ctx, 4, -28, 4, 9, 1.6); ctx.fill();
    hl(ctx, -14, 0, 4, 1.1, 0, 0.7);
    ctx.restore();
  };

  W.chapter({
    id: 'lagoon', name: 'JELLY LAGOON', title: 'Jelly Lagoon', road: 'stones',
    node: ['#DCF6FF', '#5EC6EC', '#2689BD'], gateBanner: ['TO SPRINKLE PEAKS', '#8A5CE0', '#5A34A8'],
    sign: { board: '#2D86B8', plate: '#EAF8FF', ink: '#1E5E85' },
    edgeColor: '#2490D2', finaleSky: ['#BFE9FF', '#DDF4FF', '#F4DCF6'],
    geom, ground, props, fg, manifest, topEdge: B => geom(B).topEdge,
  });
})();
