// The night town's core (OLA-527). Read TOWN.md for the API. Parts live in parts/, one feature per file.
;(function () {
  const W = 48, H = 32, TILE = 20
  const C = { cream: '#f7efdf', ink: '#16121c', red: '#ff4b1f', blue: '#3d3bff', yellow: '#ffc31f', lime: '#b6f23a' }
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  function mix(a, b, t) { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('') }

  let seed = 20261127
  function rand() { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

  const parts = []
  const state = {
    time: { hours: 0, day: 1, hour: 6, night: false, light: 1 },
    tiles: Array.from({ length: H }, () => Array(W).fill('grass')),
    buildings: [], people: [], events: [], parts: {},
  }
  const town = {
    W, H, TILE, C, mix, state, parts, errors: [],
    rand, randInt: (a, b) => a + Math.floor(rand() * (b - a + 1)), pick: (arr) => arr[Math.floor(rand() * arr.length)],
    register(p) {
      if (!p || !p.name) throw new Error('town.register needs a name')
      if (parts.some((q) => q.name === p.name)) throw new Error('two parts named ' + p.name)
      parts.push({ order: 50, layer: 50, ...p }); if (!state.parts[p.name]) state.parts[p.name] = {}
    },
    part(name) { return parts.find((p) => p.name === name) || null },
    inside: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
    at: (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? state.tiles[y][x] : null),
    set(x, y, kind) { if (town.inside(x, y)) state.tiles[y][x] = kind },
    walkable(x, y) { const k = town.at(x, y); return k !== null && k !== 'building' && k !== 'water' && k !== 'wall' },
    event(kind, text) { state.events.push({ hours: +state.time.hours.toFixed(2), day: state.time.day, kind, text }); if (state.events.length > 300) state.events.shift() },
    // A free rectangle of grass of w x h tiles whose bottom edge touches a road tile below it, or null.
    findSpot(w, h) {
      const spots = []
      for (let y = 1; y + h < H; y++) for (let x = 1; x + w < W; x++) {
        let ok = true
        for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++) { const k = town.at(x + i, y + j); if (j >= 0 && j < h && i >= 0 && i < w ? k !== 'grass' : k === 'building') ok = false }
        if (ok && town.at(x + Math.floor(w / 2), y + h) === 'road') spots.push({ x, y })
      }
      return spots.length ? town.pick(spots) : null
    },
    // Adds a building, marks its tiles. The door is the tile just below the middle of its bottom edge. null if it does not fit.
    addBuilding({ kind, name, x, y, w = 2, h = 2, color = C.red, ...more }) {
      if (x === undefined) { const s = town.findSpot(w, h); if (!s) return null; x = s.x; y = s.y }
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (town.at(x + i, y + j) !== 'grass') return null
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) town.set(x + i, y + j, 'building')
      const b = { id: state.buildings.length + 1, kind, name: name || kind, x, y, w, h, color, door: { x: x + Math.floor(w / 2), y: y + h }, ...more }
      state.buildings.push(b); town.event('build', `${b.name} built`)
      return b
    },
    building: (id) => state.buildings.find((b) => b.id === id) || null,
    buildingsOf: (kind) => state.buildings.filter((b) => b.kind === kind),
    addPerson({ name, home, color = C.blue, ...more }) {
      const h = town.building(home)
      const p = { id: state.people.length + 1, name, home, x: h ? h.door.x : 0, y: h ? h.door.y : 0, path: [], doing: 'home', visible: !h, speed: 8, color, ...more }
      state.people.push(p); return p
    },
    // Breadth-first path over walkable tiles; returns [{x,y}...] (without the start) or null.
    findPath(fx, fy, tx, ty) {
      fx = Math.round(fx); fy = Math.round(fy)
      if (!town.walkable(tx, ty)) return null
      const prev = new Map(), key = (x, y) => y * W + x, q = [[fx, fy]]; prev.set(key(fx, fy), -1)
      while (q.length) {
        const [x, y] = q.shift()
        if (x === tx && y === ty) { const out = []; let k = key(x, y); while (k !== key(fx, fy)) { out.unshift({ x: k % W, y: Math.floor(k / W) }); k = prev.get(k) } return out }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy
          if (town.walkable(nx, ny) && !prev.has(key(nx, ny))) { prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]) }
        }
      }
      return null
    },
    walkTo(p, x, y, doing = 'walking') { const path = town.findPath(p.x, p.y, x, y); if (!path) return false; p.path = path; p.doing = doing; p.visible = true; return true },
    // Moves every walking person along their path; core does this each tick before the parts' ticks.
    move(dt) {
      for (const p of state.people) {
        let step = p.speed * dt
        while (p.path.length && step > 0) {
          const n = p.path[0], dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy)
          if (d <= step) { p.x = n.x; p.y = n.y; p.path.shift(); step -= d } else { p.x += (dx / d) * step; p.y += (dy / d) * step; step = 0 }
        }
        if (!p.path.length && p.doing === 'walking') p.doing = 'idle'
      }
    },
    tick(dt) {
      const t = state.time
      t.hours += dt; t.day = 1 + Math.floor((t.hours + 6) / 24); t.hour = (t.hours + 6) % 24
      const h = t.hour; t.light = h < 5 || h > 21 ? 0 : h < 7 ? (h - 5) / 2 : h > 19 ? (21 - h) / 2 : 1; t.night = t.light < 0.5
      town.move(dt)
      for (const p of sorted('order')) if (p.tick) run(p, 'tick', () => p.tick(town, dt))
    },
    // Runs time forward without waiting, in steps of 0.05 hours (3 minutes).
    advance(hours) { const n = Math.round(hours / 0.05); for (let i = 0; i < n; i++) town.tick(0.05) },
    // The default look of a building: a block, a roof, a door, windows that light up at night.
    drawBuilding(ctx, b, { roof = C.ink, wall = b.color, sign } = {}) {
      const T = TILE, x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T
      ctx.fillStyle = mix(wall, C.ink, 0.25); ctx.fillRect(x + 3, y + 3, w, h)
      ctx.fillStyle = wall; ctx.fillRect(x, y + h * 0.3, w, h * 0.7)
      ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(x - 2, y + h * 0.32); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w + 2, y + h * 0.32); ctx.fill()
      const lit = state.time.light < 0.6
      ctx.fillStyle = lit ? C.yellow : C.cream
      for (let i = 0; i < b.w; i++) ctx.fillRect(x + i * T + T * 0.3, y + h * 0.45, T * 0.4, T * 0.35)
      ctx.fillStyle = C.ink; ctx.fillRect(b.door.x * T + T * 0.3, y + h - T * 0.55, T * 0.4, T * 0.55)
      if (sign) { ctx.fillStyle = C.ink; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText(sign, x + w / 2, y - 3) }
    },
    draw() {
      const ctx = town.ctx; if (!ctx) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = C.cream; ctx.fillRect(0, 0, W * TILE, H * TILE)
      const layers = sorted('layer')
      for (const p of layers) if (p.draw && p.layer < 100) run(p, 'draw', () => { ctx.save(); p.draw(ctx, town); ctx.restore() })
      const dark = 1 - state.time.light
      if (dark > 0) {
        ctx.fillStyle = C.blue; ctx.globalAlpha = dark * 0.55; ctx.fillRect(0, 0, W * TILE, H * TILE); ctx.globalAlpha = 1
        // Lit windows glow through the dark: every building's window row, in sunflower.
        if (state.time.light < 0.6) for (const b of state.buildings) { ctx.fillStyle = C.yellow; for (let i = 0; i < b.w; i++) ctx.fillRect(b.x * TILE + i * TILE + TILE * 0.3, b.y * TILE + b.h * TILE * 0.45, TILE * 0.4, TILE * 0.35) }
      }
      for (const p of layers) if (p.draw && p.layer >= 100) run(p, 'draw', () => { ctx.save(); p.draw(ctx, town); ctx.restore() })
      const t = state.time, hh = Math.floor(t.hour), mm = Math.floor((t.hour - hh) * 60)
      ctx.fillStyle = C.ink; ctx.fillRect(8, 8, 128, 22); ctx.fillStyle = C.yellow; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left'
      ctx.fillText(`DAY ${t.day}  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 16, 24)
    },
    // A short reading of the town, for the mayor.
    summary() {
      const kinds = {}; for (const b of state.buildings) kinds[b.kind] = (kinds[b.kind] || 0) + 1
      const doing = {}; for (const p of state.people) doing[p.doing] = (doing[p.doing] || 0) + 1
      const ev = {}; for (const e of state.events) ev[e.kind] = (ev[e.kind] || 0) + 1
      return { time: { ...state.time }, buildings: kinds, people: state.people.length, doing, events: ev, lastEvents: state.events.slice(-8).map((e) => e.text),
        parts: parts.map((p) => p.name), partData: Object.fromEntries(Object.entries(state.parts).map(([k, v]) => [k, Object.keys(v).slice(0, 8)])), errors: town.errors.slice(0, 5) }
    },
    start({ test = false } = {}) {
      const canvas = document.getElementById('town')
      if (canvas) { canvas.width = W * TILE; canvas.height = H * TILE; town.ctx = canvas.getContext('2d') }
      for (const p of sorted('order')) if (p.init) run(p, 'init', () => p.init(town))
      town.started = true
      if (test) return
      let last = performance.now()
      const frame = (now) => { const dt = Math.min(0.1, (now - last) / 1000) * 0.1; last = now; town.tick(dt); town.draw(); requestAnimationFrame(frame) }
      requestAnimationFrame(frame)
    },
  }
  function sorted(k) { return parts.slice().sort((a, b) => a[k] - b[k]) }
  function run(p, what, fn) { try { fn() } catch (e) { if (town.errors.length < 50) town.errors.push(`${p.name}.${what}: ${e && e.message}`); if (town.throwErrors) throw e } }
  window.town = town
})()
