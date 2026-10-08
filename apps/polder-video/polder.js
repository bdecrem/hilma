// POLDER — land below the sea.
// A day on reclaimed land, told with Dutch films of 1920–1934: the sea at dawn,
// the dike, the canals and barges behind it, the town at the water; the sea
// pressing at the gap, the dredgers and cranes of the Zuiderzee works; the
// pumps stopping (bars 73–80: no kick, no bass — the water comes up, the
// picture goes under into light in liquid); the great day, 28 May 1932, when
// the Vlieter closed and the sea became a lake (the peak at 81); the tide
// leaving, the evening steamer, the land dry and quiet; and the water frozen —
// skaters on the canals as the drone fades.
//
// Drawn layers: the WATERLINE, a horizon that rides the bass riff (its note
// lifts it); a band below it darkens — that is the land, below sea level. The
// chord's dub delay prints the picture again at every dotted-eighth echo (the
// engine), and eight LAMPS at the foot of the frame tick down the delay line.
// The bell rings a RIPPLE on the water. A LEVEL readout tells the water's
// height against NAP (Amsterdam Ordnance Datum) — it climbs while the pumps
// are off — and a PUMPS lamp follows the kick.
const LEVEL = [[0, -4.2], [16, -4.1], [40, -3.6], [56, -3.0], [72, -2.4], [73, -2.4], [80, -0.3], [81, -0.3], [96, -2.6], [112, -3.8], [128, -4.2]]; // metres against NAP
const interp = (K, bar) => { for (let i = 1; i < K.length; i++) if (bar <= K[i][0]) return K[i - 1][1] + (K[i][1] - K[i - 1][1]) * (bar - K[i - 1][0]) / Math.max(1e-9, K[i][0] - K[i - 1][0]); return K[K.length - 1][1]; };

defineAct({
  id: 'polder', title: 'POLDER',
  minFloor: 0.5, speed: 0.8, loop: 'pingpong', damage: 0.25, grain: 0.16, scan: 0.5, weave: 1.2, prints: 0.9, echoWindow: 0.16,
  fadeIn: 2, fadeOut: [247, 253],

  shots: [
    // Dawn: the sea, the drone, the chord thrown into the delay.
    { at: 0, clip: 'sea-dawn', offset: 4, light: 'steady', level: 0.9, speed: 0.6, zoom: [1.0, 1.12], contrast: 1.1, water: 0.3 },
    { at: 5, clip: 'sea-far', light: 'steady', level: 0.95, speed: 0.6, zoom: [1.06, 1.0], dissolve: 2, contrast: 1.1, water: 0.4 },
    // The kick: the dike, lit like a slow strobe.
    { at: 8, clip: 'dike-edge', light: 'kick', floor: 0.5, speed: 0.7, zoom: [1.0, 1.15], pan: [-0.2, 0.2], dissolve: 1.5, water: 0.5 },
    { at: 13, clip: 'windmill', light: 'kick', floor: 0.45, speed: 0.7, zoom: [1.0, 1.1], dissolve: 1, contrast: 1.2, water: 0.5 },
    // The riff: the land behind the dike. The waterline arrives with the bass.
    { at: 16, clip: 'dike-road', light: 'kick', floor: 0.55, speed: 0.75, zoom: [1.0, 1.12], dissolve: 1, water: 1 },
    { at: 20, clip: 'canal-farm', light: 'kick', floor: 0.55, speed: 0.75, zoom: [1.12, 1.0], dissolve: 1, water: 1 },
    // The rim lattice: the canals, the trees, a barge in the mist.
    { at: 24, clip: 'canal-trees', light: 'kick', floor: 0.55, speed: 0.8, zoom: [1.0, 1.14], dissolve: 1, water: 1 },
    { at: 28, clip: 'reeds-dusk', light: 'kick', floor: 0.5, speed: 0.75, zoom: [1.0, 1.1], pan: [0.1, -0.1], dissolve: 1.5, contrast: 1.2, water: 1 },
    // The bell: sails and glittering water.
    { at: 32, clip: 'barge-glitter', light: 'kick', floor: 0.55, speed: 0.8, zoom: [1.0, 1.1], dissolve: 1, water: 1 },
    { at: 36, clip: 'barge-field', offset: 2, light: 'kick', floor: 0.55, speed: 0.8, zoom: [1.1, 1.0], dissolve: 1, water: 1 },
    // Opening: the town at the water.
    { at: 40, clip: 'quay', light: 'kick', floor: 0.55, speed: 0.85, zoom: [1.0, 1.1], pan: [-0.15, 0.15], dissolve: 1, glitch: 0.12, water: 1 },
    { at: 44, clip: 'dike-canal', light: 'kick', floor: 0.55, speed: 0.8, zoom: [1.0, 1.12], dissolve: 1, glitch: 0.12, water: 1 },
    { at: 46, clip: 'cyclist', light: 'kick', floor: 0.55, speed: 0.8, zoom: [1.0, 1.08], dissolve: 0.5, glitch: 0.12, water: 1 },
    // The throws: the sea pressing at the gap — only the echoes of the chord remain.
    { at: 48, clip: 'current', offset: 6, light: 'kick', floor: 0.45, speed: 0.7, zoom: [1.0, 1.18], dissolve: 1, prints: 1.4, glitch: 0.2, water: 1 },
    { at: 52, clip: 'current-2', light: 'kick', floor: 0.45, speed: 0.7, zoom: [1.18, 1.0], dissolve: 1.5, prints: 1.4, glitch: 0.2, water: 1 },
    // The work: cranes, clay, the barge dumping.
    { at: 56, clip: 'cranes', light: 'kick', floor: 0.55, speed: 0.85, zoom: [1.0, 1.1], pan: [0.2, -0.2], dissolve: 1, glitch: 0.2, water: 1 },
    { at: 60, clip: 'bucket', light: 'kick', floor: 0.55, speed: 0.85, zoom: [1.0, 1.15], dissolve: 1, glitch: 0.25, flash: { list: ['splash'], prob: 0.2, frames: 2 }, water: 1 },
    { at: 62, clip: 'dump', light: 'kick', floor: 0.55, speed: 0.85, zoom: [1.0, 1.1], dissolve: 0.5, glitch: 0.25, water: 1 },
    // The people and the sky: a figure on the new land, clouds, a rowboat under the dike.
    { at: 64, clip: 'figure', light: 'kick', floor: 0.55, speed: 0.8, zoom: [1.0, 1.12], dissolve: 1.5, contrast: 1.2, water: 1 },
    { at: 68, clip: 'clouds', offset: 3, light: 'kick', floor: 0.5, speed: 0.75, zoom: [1.1, 1.0], dissolve: 1.5, contrast: 1.25, water: 1 },
    { at: 70, clip: 'rowboat', light: 'kick', floor: 0.55, speed: 0.8, zoom: [1.0, 1.12], dissolve: 1, water: 1 },
    // The floor out: the pumps stop. Under: light in liquid, a net in the glitter, a dark canal.
    { at: 72, clip: 'liquid-light', light: 'steady', level: 0.85, speed: 0.6, zoom: [1.0, 1.2], dissolve: 2, contrast: 1.1, water: 0, under: 1 },
    { at: 76, clip: 'net', light: 'steady', level: 0.9, speed: 0.6, zoom: [1.1, 1.0], dissolve: 2, contrast: 1.1, water: 0, under: 1 },
    { at: 78, clip: 'still-water', offset: 3, light: 'steady', level: 1.0, speed: 0.6, zoom: [1.0, 1.15], dissolve: 1.5, contrast: 1.2, water: 0, under: 1 },
    // The great day: 28 May 1932 — the kick and the riff return, the gap closes.
    { at: 80, clip: 'great-day', offset: 9.5, light: 'kick', floor: 0.6, level: 1.1, speed: 0.9, zoom: [1.0, 1.12], dissolve: 0.25, glitch: 0.3, flash: { list: ['splash', 'current'], prob: 0.18, frames: 2 }, water: 1 },
    { at: 84, montage: { list: ['gap-dredgers', 'gap-cranes'], every: '2bar' }, light: 'kick', floor: 0.6, speed: 0.9, modes: { list: ['photo', 'photo', 'photo', 'raster'], every: 'bar' }, dissolve: 0.5, glitch: 0.3, water: 1 },
    // The peak holds: the flats from above, the land the sea left.
    { at: 88, clip: 'flats', offset: 14, light: 'kick', floor: 0.6, speed: 0.8, zoom: [1.0, 1.18], pan: [-0.1, 0.1], dissolve: 1, glitch: 0.2, water: 1 },
    { at: 92, clip: 'cows', light: 'kick', floor: 0.6, speed: 0.85, zoom: [1.08, 1.0], dissolve: 1, glitch: 0.15, water: 1 },
    // The dub mix: the evening. A boat past the pier light, the steamer, a sail.
    { at: 96, clip: 'village-canal', light: 'kick', floor: 0.55, speed: 0.8, zoom: [1.0, 1.1], dissolve: 1.5, water: 1 },
    { at: 100, clip: 'pier-light', offset: 2, light: 'kick', floor: 0.55, speed: 0.8, zoom: [1.0, 1.12], dissolve: 1.5, water: 1 },
    { at: 104, clip: 'steamer', light: 'kick', floor: 0.5, speed: 0.75, zoom: [1.0, 1.1], dissolve: 2, prints: 1.3, water: 1 },
    { at: 108, clip: 'sea-piers', offset: 8, light: 'kick', floor: 0.5, speed: 0.6, zoom: [1.08, 1.0], dissolve: 2, prints: 1.3, contrast: 1.1, water: 1 },
    { at: 110, clip: 'sail-silhouette', light: 'kick', floor: 0.5, speed: 0.6, zoom: [1.0, 1.1], dissolve: 1, prints: 1.3, water: 1 },
    // The sub leaves: the land dry and quiet; the water freezes.
    { at: 112, clip: 'church-land', offset: 6, light: 'kick', floor: 0.55, speed: 0.75, zoom: [1.0, 1.12], dissolve: 2, water: 0.4 },
    { at: 116, clip: 'still-water', offset: 3, light: 'kick', floor: 0.55, speed: 0.7, zoom: [1.1, 1.0], dissolve: 2, contrast: 1.1, water: 0.3 },
    { at: 118, clip: 'skating-canal', light: 'kick', floor: 0.55, speed: 0.75, zoom: [1.0, 1.1], dissolve: 2, water: 0.2 },
    // The kick leaves, the drone fades: skaters, one skater, the sea.
    { at: 120, clip: 'skaters-park', light: 'steady', level: 0.9, speed: 0.7, zoom: [1.0, 1.1], dissolve: 2, water: 0.1 },
    { at: 122, clip: 'skater', light: 'steady', level: 0.9, speed: 0.65, zoom: [1.0, 1.14], pan: [0.1, -0.1], dissolve: 2, contrast: 1.1, water: 0 },
    { at: 126, clip: 'sea-far', offset: 8, light: 'steady', level: 0.8, speed: 0.5, zoom: [1.0, 1.06], dissolve: 2, contrast: 1.05, water: 0 },
  ],

  text: [
    { from: 1, to: 7.5, str: 'POLDER', x: 0.045, y: 0.075, size: 18 },
    { from: 2, to: 7.5, str: 'LAND BELOW THE SEA', x: 0.045, y: 0.11, size: 18, alpha: 0.75 },
    { from: 80, to: 81.5, str: '28 MAY 1932', x: 0.5, y: 0.5, size: 200, font: 'big', align: 'center', type: 'slam' },
    { from: 81.5, to: 84, str: 'THE VLIETER CLOSED · THE SEA BECAME A LAKE', x: 0.5, y: 0.6, size: 18, align: 'center', alpha: 0.8, type: 'static', fade: 0.4 },
    { from: 121, to: 126, str: 'POLDER — DUB TECHNO, 122', x: 0.045, y: 0.885, size: 18, alpha: 0.8 },
    { from: 121.6, to: 126, str: 'FILMS 1920–1934 · EYE FILMMUSEUM / INTERNET ARCHIVE · PUBLIC DOMAIN', x: 0.045, y: 0.92, size: 13, alpha: 0.55 },
  ],

  // The waterline and the land under it; the bell's ripples.
  under(g, f, shot, H) {
    const { w, h } = H;
    const amt = shot.water ?? 1;
    const under = shot.under ? Math.min(1, (f.bar - shot.at) / 2) : 0; // the floor out: the line sinks away, the picture goes under
    if (amt <= 0 && !under) return;
    const base = h * 0.64, lift = h * (0.16 * f.subHeight + 0.05 * f.sub);
    const y = base - lift * (f.sec.sub ? 1 : 0.3) + under * h * 0.5;
    const a = amt * (f.sec.sub ? 0.55 + 0.35 * f.sub : 0.3) * (1 - under);
    if (a > 0.01) {
      // The land below sea level: a band darkening down from the line.
      g.save();
      const gr = g.createLinearGradient(0, y, 0, h);
      gr.addColorStop(0, `rgba(0,0,0,${0.5 * amt})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, y, w, h - y);
      // The line itself, a soft glow and a thin core, waving with the drone.
      g.globalCompositeOperation = 'lighter';
      for (const [lw, al] of [[16, 0.08], [6, 0.22], [1.8, 0.95]]) {
        g.strokeStyle = `rgba(255,255,255,${al * a})`; g.lineWidth = lw; g.beginPath();
        for (let x = 0; x <= w; x += 12) g.lineTo(x, y + Math.sin(x * 0.008 + f.t * 0.7) * 2.5 * (0.5 + 0.5 * f.drone));
        g.stroke();
      }
      g.restore();
    }
    // Ripples: each bell within the last 2.4 s rings out from a point on the line.
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let n = f.bell ? f.bell.n : -1; n >= 0; n--) {
      const b = H.BELLS[n], age = f.t - b.t; if (age > 2.4) break;
      const cx = w * [0.3, 0.52, 0.7][b.note], cy = y - 2;
      for (let r = 0; r < 2; r++) {
        const rr = (age - r * 0.22) * 150; if (rr <= 0) continue;
        const al = 0.32 * Math.max(0, 1 - age / 2.4) * (1 - r * 0.3) * amt;
        g.strokeStyle = `rgba(255,255,255,${al})`; g.lineWidth = 1.2;
        g.beginPath(); g.ellipse(cx, cy, rr, rr * 0.22, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    g.restore();
  },

  // The delay lamps, the level against NAP, the pumps.
  over(o, f, shot, H) {
    if (f.bar < 1.5) return;
    const { W, H: HH } = H;
    // Eight lamps: the stab lights the first, each echo the next, dimmer by the feedback.
    const lit = new Array(8).fill(0);
    for (const e of f.echoes) { if (e.k < 8 && e.within < 0.22) lit[e.k] = Math.max(lit[e.k], e.level * Math.exp(-e.within / 0.12)); }
    const x0 = W * 0.5 - 7 * 26, y = HH * 0.93;
    for (let k = 0; k < 8; k++) {
      const v = lit[k];
      o.fillStyle = `rgba(255,255,255,${0.1 + 0.9 * v})`;
      o.beginPath(); o.arc(x0 + k * 52, y, 3.2 + 2.5 * v, 0, Math.PI * 2); o.fill();
      if (v > 0.3) { o.fillStyle = `rgba(255,255,255,${0.12 * v})`; o.beginPath(); o.arc(x0 + k * 52, y, 12, 0, Math.PI * 2); o.fill(); }
    }
    // The water level against NAP, and the pumps.
    const level = interp(LEVEL, f.bar);
    H.text({ str: `LEVEL  ${level >= 0 ? '+' : '−'}${Math.abs(level).toFixed(2)} M NAP`, x: 0.045, y: 0.93, size: 16, alpha: 0.6 });
    const pumps = f.sec.kick;
    const dot = pumps ? (f.kickEnv > 0.35 ? '●' : '○') : (Math.floor(f.beat) % 2 ? '—' : ' ');
    H.text({ str: `PUMPS ${dot}`, x: 0.955, y: 0.93, size: 16, align: 'right', alpha: pumps ? 0.6 : 0.45 });
  },

  glitch(f) {
    if (f.bar >= 80 && f.bar < 80.5) return { flash: Math.max(0, 0.7 - (f.bar - 80) * 1.6) };
    return {};
  },
});
