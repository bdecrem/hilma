// Three houses on the main road, kind 'house', each a home for people.
town.register({
  name: 'houses', order: 20, layer: 30,
  init(town) {
    town.addBuilding({ kind: 'house', name: 'Red house', x: 18, y: 13, w: 3, h: 3, color: town.C.red })
    town.addBuilding({ kind: 'house', name: 'Yellow house', x: 28, y: 13, w: 3, h: 3, color: town.C.yellow })
    town.addBuilding({ kind: 'house', name: 'Blue house', x: 9, y: 13, w: 3, h: 3, color: town.C.blue })
  },
  draw(ctx, town) {
    for (const b of town.buildingsOf('house')) town.drawBuilding(ctx, b)
  },
})
