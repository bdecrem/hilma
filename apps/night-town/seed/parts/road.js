// The roads, tile kind 'road': the main street across the town at row 16, two side streets at rows 7 and 25, and one avenue up column 24 joining them.
town.register({
  name: 'road', order: 10, layer: 10,
  init(town) {
    for (let x = 0; x < town.W; x++) town.set(x, 16, 'road')
    for (let x = 6; x < town.W - 6; x++) { town.set(x, 7, 'road'); town.set(x, 25, 'road') }
    for (let y = 3; y < town.H; y++) town.set(24, y, 'road')
  },
  draw(ctx, town) {
    const T = town.TILE
    for (let y = 0; y < town.H; y++) for (let x = 0; x < town.W; x++) {
      if (town.at(x, y) !== 'road') continue
      ctx.fillStyle = town.mix(town.C.ink, town.C.cream, 0.72); ctx.fillRect(x * T, y * T, T, T)
      ctx.fillStyle = town.C.cream
      if (town.at(x - 1, y) === 'road' && town.at(x + 1, y) === 'road' && x % 2 === 0) ctx.fillRect(x * T + 4, y * T + T / 2 - 1, T - 8, 2)
    }
  },
})
