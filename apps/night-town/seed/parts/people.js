// Six townspeople: by day they walk to other buildings' doors and wander, at night they go home and vanish inside.
town.register({
  name: 'people', order: 30, layer: 60,
  init(town) {
    const names = ['Ada', 'Bo', 'Cas', 'Dee', 'Eli', 'Fen']
    const shirts = [town.C.red, town.C.blue, town.C.yellow, town.C.lime, town.C.red, town.C.blue]
    const homes = town.buildingsOf('house')
    names.forEach((name, i) => town.addPerson({ name, home: homes[i % homes.length].id, color: shirts[i], wake: 6 + town.rand() * 3 }))
  },
  tick(town, dt) {
    const t = town.state.time
    for (const p of town.state.people) {
      if (p.path.length) continue
      const home = town.building(p.home)
      const awake = t.hour >= p.wake && t.hour < 20
      if (!awake) {
        if (p.doing === 'home' || !home) continue
        if (Math.round(p.x) === home.door.x && Math.round(p.y) === home.door.y) { p.doing = 'home'; p.visible = false; town.event('home', `${p.name} went home`) }
        else if (!town.walkTo(p, home.door.x, home.door.y, 'going home')) { p.doing = 'home'; p.visible = false }
        continue
      }
      if ((p.doing === 'home' || p.doing === 'idle') && town.rand() < dt * 2) {
        const others = town.state.buildings.filter((b) => b.id !== p.home)
        const b = others.length ? town.pick(others) : null
        if (b && town.walkTo(p, b.door.x, b.door.y)) town.event('walk', `${p.name} walks to ${b.name}`)
        else town.walkTo(p, town.randInt(0, town.W - 1), 16)
      }
    }
  },
  draw(ctx, town) {
    const T = town.TILE, h = town.state.time.hours
    for (const p of town.state.people) {
      if (!p.visible) continue
      const bob = p.path.length ? Math.abs(Math.sin(h * 40 + p.id)) * 2 : 0
      const x = p.x * T + T / 2, y = p.y * T + T / 2 - bob
      ctx.fillStyle = town.C.ink; ctx.beginPath(); ctx.arc(x, y - 6, 3.2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = p.color; ctx.fillRect(x - 3.5, y - 3, 7, 7)
      ctx.fillStyle = town.C.ink; ctx.fillRect(x - 3, y + 4, 2, 3); ctx.fillRect(x + 1, y + 4, 2, 3)
    }
  },
})
