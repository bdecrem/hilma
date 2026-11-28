// The ground: cream earth with lime grass tufts, drawn under everything.
town.register({
  name: 'ground', order: 0, layer: 0,
  init(town) {
    const tufts = []
    for (let i = 0; i < 260; i++) tufts.push({ x: town.rand() * town.W * town.TILE, y: town.rand() * town.H * town.TILE, s: 2 + town.rand() * 3 })
    town.state.parts.ground.tufts = tufts
  },
  draw(ctx, town) {
    ctx.fillStyle = town.mix(town.C.cream, town.C.lime, 0.18)
    ctx.fillRect(0, 0, town.W * town.TILE, town.H * town.TILE)
    ctx.fillStyle = town.mix(town.C.lime, town.C.ink, 0.15)
    for (const t of town.state.parts.ground.tufts) { ctx.fillRect(t.x, t.y, t.s, 1.5); ctx.fillRect(t.x + 1, t.y - 2, 1, 2) }
  },
})
