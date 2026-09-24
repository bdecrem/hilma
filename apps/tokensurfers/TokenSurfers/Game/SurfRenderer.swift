import SwiftUI

/// Draws Token Surfers as flat-shaded pseudo-3D, the look of misc/3.MP4:
/// peach sunset, cream sun, plum skyline, lavender rails on dark sleepers,
/// chunky trains, gold coins, the splat running away from the camera.
struct SurfRenderer {
    let e: SurfEngine
    let size: CGSize

    // Camera: behind and above the player; projection fitted to the pane so
    // the player's feet sit at 86% of the height and three lanes fit the width.
    // In a tall, narrow pane the camera rises so the horizon stays near a third.
    private let camBack = 4.2
    private var f: Double { min(size.height * 0.80, size.width * 0.95) }
    private var camH: Double { max(2.6, size.height * 0.52 * camBack / f) }
    private var horizon: Double { size.height * 0.86 - camH * f / camBack }
    private var camX: Double { e.x * 0.55 }

    private func P(_ x: Double, _ y: Double, _ z: Double) -> CGPoint? {
        let zr = z + camBack
        guard zr > 0.6 else { return nil }
        return CGPoint(x: size.width / 2 + (x - camX) * f / zr,
                       y: horizon + (camH - y) * f / zr)
    }

    private func scale(_ z: Double) -> Double { f / max(z + camBack, 0.6) }

    private func quad(_ a: CGPoint?, _ b: CGPoint?, _ c: CGPoint?, _ d: CGPoint?) -> Path? {
        guard let a, let b, let c, let d else { return nil }
        var p = Path()
        p.move(to: a); p.addLine(to: b); p.addLine(to: c); p.addLine(to: d); p.closeSubpath()
        return p
    }

    static let trainColors: [(front: Color, side: Color, top: Color)] = [
        (Color(hex: 0xE2764A), Color(hex: 0xB9542F), Color(hex: 0xF09A70)),   // orange
        (Color(hex: 0x2F9C8F), Color(hex: 0x1E746A), Color(hex: 0x5CC0B2)),   // teal
        (Color(hex: 0xE9B53A), Color(hex: 0xBE8C22), Color(hex: 0xF5CE6A)),   // mustard
        (Color(hex: 0x6D55C9), Color(hex: 0x4E3AA0), Color(hex: 0x8E7BE0)),   // purple
    ]

    func draw(_ ctx: inout GraphicsContext) {
        if e.stumble > 0.2 { ctx.addFilter(.grayscale(1)) }
        drawSky(&ctx)
        drawGround(&ctx)
        drawWalls(&ctx)
        drawTrack(&ctx)
        let drawables = e.entities.filter { !$0.dead && $0.z < SurfEngine.viewDepth }.sorted { $0.z > $1.z }
        var playerDrawn = false
        for ent in drawables {
            if !playerDrawn && ent.z < -0.2 {
                drawPlayer(&ctx); playerDrawn = true
            }
            switch ent.kind {
            case .train: drawTrain(&ctx, ent)
            case .coin: drawCoin(&ctx, ent)
            case .barrier: drawBarrier(&ctx, ent, high: false)
            case .highBarrier: drawBarrier(&ctx, ent, high: true)
            case .bug: drawBug(&ctx, ent)
            }
        }
        if !playerDrawn { drawPlayer(&ctx) }
        drawConfetti(&ctx)
    }

    // MARK: backdrop

    private func drawSky(_ ctx: inout GraphicsContext) {
        let skyRect = CGRect(x: 0, y: 0, width: size.width, height: horizon + 2)
        ctx.fill(Path(skyRect), with: .linearGradient(
            Gradient(colors: [Color(hex: 0xF08A57), Color(hex: 0xF6B47C), Color(hex: 0xF9D39A)]),
            startPoint: .zero, endPoint: CGPoint(x: 0, y: horizon)))
        // sun
        let r = size.width * 0.12
        ctx.fill(Path(ellipseIn: CGRect(x: size.width * 0.5 - r - camX * 4, y: horizon - r * 1.15, width: r * 2, height: r * 2)),
                 with: .color(Color(hex: 0xFCE7B0)))
        // skyline, parallax
        var rng = SeededRandom(seed: 11)
        var x = -40.0 - (camX * 10).truncatingRemainder(dividingBy: 40)
        while x < size.width + 40 {
            let w = 22 + rng.unit() * 34
            let h = size.height * (0.05 + rng.unit() * 0.1)
            let c = rng.unit() < 0.5 ? Color(hex: 0xA7466E) : Color(hex: 0x8B3D6E)
            ctx.fill(Path(CGRect(x: x, y: horizon - h, width: w + 1, height: h + 1)), with: .color(c))
            x += w
        }
        // haze
        ctx.fill(Path(CGRect(x: 0, y: horizon - 10, width: size.width, height: 12)),
                 with: .linearGradient(Gradient(colors: [Color(hex: 0xF9D39A, alpha: 0), Color(hex: 0xF3C3A0, alpha: 0.8)]),
                                       startPoint: CGPoint(x: 0, y: horizon - 10), endPoint: CGPoint(x: 0, y: horizon + 2)))
    }

    private func drawGround(_ ctx: inout GraphicsContext) {
        ctx.fill(Path(CGRect(x: 0, y: horizon, width: size.width, height: size.height - horizon)),
                 with: .linearGradient(Gradient(colors: [Color(hex: 0x9C8FAE), Color(hex: 0x6E6388), Color(hex: 0x5A4F72)]),
                                       startPoint: CGPoint(x: 0, y: horizon), endPoint: CGPoint(x: 0, y: size.height)))
    }

    /// Station walls on both sides with coloured billboards scrolling past.
    private func drawWalls(_ ctx: inout GraphicsContext) {
        let wallX = 2.75, far = SurfEngine.viewDepth, near = -3.0, h = 2.4
        for side in [-1.0, 1.0] {
            let x = wallX * side
            if let p = quad(P(x, 0, near), P(x, 0, far), P(x, h, far), P(x, h, near)) {
                ctx.fill(p, with: .color(Color(hex: 0x7C7299)))
            }
            // billboards every 11 units
            let spacing = 11.0
            let offset = e.distance.truncatingRemainder(dividingBy: spacing)
            var k = 0
            var z = far - offset
            let colors = [Color(hex: 0xF2C14E), Color(hex: 0xE25C4B), Color(hex: 0x8C6BE0), Color(hex: 0x3FB5A5), Color(hex: 0xF08BB0)]
            while z > near {
                let idx = Int((e.distance + z) / spacing + (side > 0 ? 2 : 0)) % colors.count
                if let p = quad(P(x, 0.7, z), P(x, 0.7, z + 3.6), P(x, 2.0, z + 3.6), P(x, 2.0, z)) {
                    ctx.fill(p, with: .color(colors[abs(idx)]))
                }
                z -= spacing
                k += 1
            }
        }
    }

    private func drawTrack(_ ctx: inout GraphicsContext) {
        let far = SurfEngine.viewDepth, near = -3.0
        // sleepers
        let gap = 1.1
        var z = far - e.distance.truncatingRemainder(dividingBy: gap)
        let sleeper = Color(hex: 0x4B3440)
        while z > near {
            for l in -1...1 {
                let cx = Double(l) * SurfEngine.laneWidth
                if let p = quad(P(cx - 0.55, 0, z), P(cx + 0.55, 0, z), P(cx + 0.55, 0, z + 0.32), P(cx - 0.55, 0, z + 0.32)) {
                    ctx.fill(p, with: .color(sleeper.opacity(z > 50 ? 0.5 : 0.9)))
                }
            }
            z -= gap
        }
        // rails
        for l in -1...1 {
            let cx = Double(l) * SurfEngine.laneWidth
            for dx in [-0.4, 0.4] {
                let x = cx + dx
                if let p = quad(P(x - 0.045, 0.02, near), P(x + 0.045, 0.02, near), P(x + 0.045, 0.02, far), P(x - 0.045, 0.02, far)) {
                    ctx.fill(p, with: .color(Color(hex: 0xE4DDF7)))
                }
            }
        }
    }

    // MARK: things

    private func drawTrain(_ ctx: inout GraphicsContext, _ t: SurfEngine.Entity) {
        let cx = Double(t.lane) * SurfEngine.laneWidth
        let w = 0.56, h = 2.15
        let z0 = max(t.z, -2.5), z1 = t.z + t.length
        let col = Self.trainColors[t.color % Self.trainColors.count]
        // side facing the camera
        let sideX = cx < camX ? cx + w : cx - w
        if abs(cx - camX) > 0.2, let p = quad(P(sideX, 0, z0), P(sideX, 0, z1), P(sideX, h, z1), P(sideX, h, z0)) {
            ctx.fill(p, with: .color(col.side))
            // windows along the side
            var wz = z0 + 0.8
            while wz < z1 - 1 {
                if let wp = quad(P(sideX, 1.15, wz), P(sideX, 1.15, wz + 1.1), P(sideX, 1.75, wz + 1.1), P(sideX, 1.75, wz)) {
                    ctx.fill(wp, with: .color(Color(hex: 0x23213D)))
                }
                wz += 1.8
            }
        }
        // roof
        if let p = quad(P(cx - w, h, z0), P(cx + w, h, z0), P(cx + w, h, z1), P(cx - w, h, z1)) {
            ctx.fill(p, with: .color(col.top))
        }
        // front
        guard t.z > -2.4, let a = P(cx - w, h, t.z), let b = P(cx + w, 0, t.z) else { return }
        let rect = CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y)
        let front = Path(roundedRect: rect, cornerRadius: rect.width * 0.08)
        ctx.fill(front, with: .color(col.front))
        ctx.stroke(front, with: .color(Theme.ink.opacity(0.85)), lineWidth: max(1, rect.width * 0.025))
        let win = CGRect(x: rect.minX + rect.width * 0.14, y: rect.minY + rect.height * 0.14,
                         width: rect.width * 0.72, height: rect.height * 0.3)
        ctx.fill(Path(roundedRect: win, cornerRadius: win.width * 0.06), with: .color(Color(hex: 0x23213D)))
        let lr = rect.width * 0.09
        for fx in [0.24, 0.76] {
            ctx.fill(Path(ellipseIn: CGRect(x: rect.minX + rect.width * fx - lr, y: rect.minY + rect.height * 0.72 - lr,
                                            width: lr * 2, height: lr * 2)),
                     with: .color(Color(hex: 0xFFF2C6)))
        }
        if !t.label.isEmpty, rect.width > 26 {
            let label = Text(t.label)
                .font(.system(size: max(7, rect.width * 0.13), weight: .heavy, design: .monospaced))
                .foregroundStyle(.white)
            ctx.draw(label, at: CGPoint(x: rect.midX, y: rect.minY + rect.height * 0.54))
        }
    }

    private func drawCoin(_ ctx: inout GraphicsContext, _ c: SurfEngine.Entity) {
        let cx = Double(c.lane) * SurfEngine.laneWidth
        let bob = sin(e.time * 4 + c.z) * 0.06
        guard let p = P(cx, c.y + bob, c.z) else { return }
        let r = 0.26 * scale(c.z)
        guard r > 0.8 else { return }
        let spin = abs(cos(e.time * 5 + c.z * 0.7))
        let rect = CGRect(x: p.x - r * max(0.25, spin), y: p.y - r, width: 2 * r * max(0.25, spin), height: 2 * r)
        ctx.fill(Path(ellipseIn: rect.offsetBy(dx: 0, dy: r * 0.12)), with: .color(Color(hex: 0xB9801E)))
        ctx.fill(Path(ellipseIn: rect), with: .color(c.token ? Color(hex: 0xFFCF3A) : Color(hex: 0xF6BE35)))
        ctx.stroke(Path(ellipseIn: rect.insetBy(dx: rect.width * 0.2, dy: r * 0.35)),
                   with: .color(Color(hex: 0xFFE9A0)), lineWidth: max(0.6, r * 0.14))
    }

    private func drawBarrier(_ ctx: inout GraphicsContext, _ b: SurfEngine.Entity, high: Bool) {
        let cx = Double(b.lane) * SurfEngine.laneWidth
        let y0 = high ? 1.25 : 0.3, y1 = high ? 1.95 : 0.95
        guard let a = P(cx - 0.6, y1, b.z), let d = P(cx + 0.6, y0, b.z), let foot = P(cx, 0, b.z) else { return }
        let legW = max(1.5, (d.x - a.x) * 0.05)
        for fx in [0.12, 0.88] {
            let lx = a.x + (d.x - a.x) * fx
            ctx.fill(Path(CGRect(x: lx - legW / 2, y: a.y, width: legW, height: foot.y - a.y)), with: .color(Color(hex: 0xEDE6F5)))
        }
        let board = CGRect(x: a.x, y: a.y, width: d.x - a.x, height: d.y - a.y)
        ctx.fill(Path(roundedRect: board, cornerRadius: 2), with: .color(high ? Color(hex: 0x3FB5A5) : Theme.red))
        ctx.stroke(Path(roundedRect: board, cornerRadius: 2), with: .color(.white), lineWidth: max(1, board.width * 0.02))
        if board.width > 34 {
            let t = Text(high ? "LGTM ↓" : "made with code")
                .font(.system(size: max(6, board.height * 0.3), weight: .heavy, design: .rounded))
                .foregroundStyle(.white.opacity(0.92))
            ctx.draw(t, at: CGPoint(x: board.midX, y: board.midY))
        }
    }

    private func drawBug(_ ctx: inout GraphicsContext, _ b: SurfEngine.Entity) {
        let cx = Double(b.lane) * SurfEngine.laneWidth + sin(b.phase * 3) * 0.25
        guard let p = P(cx, 0.25, b.z) else { return }
        let r = 0.34 * scale(b.z)
        guard r > 1 else { return }
        // legs
        for i in 0..<3 {
            let ly = p.y - r * 0.3 + Double(i) * r * 0.35
            let wig = sin(b.phase * 18 + Double(i)) * r * 0.15
            var leg = Path()
            leg.move(to: CGPoint(x: p.x - r * 1.25, y: ly + wig)); leg.addLine(to: CGPoint(x: p.x + r * 1.25, y: ly - wig))
            ctx.stroke(leg, with: .color(Theme.ink), lineWidth: max(1, r * 0.12))
        }
        let shell = CGRect(x: p.x - r, y: p.y - r * 0.8, width: r * 2, height: r * 1.6)
        ctx.fill(Path(ellipseIn: shell), with: .color(Color(hex: 0x6B3FB0)))
        ctx.fill(Path(ellipseIn: shell.insetBy(dx: r * 0.5, dy: r * 0.15).offsetBy(dx: r * 0.45, dy: 0)), with: .color(Color(hex: 0x3A9C5A)))
        var seam = Path(); seam.move(to: CGPoint(x: p.x, y: shell.minY + r * 0.3)); seam.addLine(to: CGPoint(x: p.x, y: shell.maxY))
        ctx.stroke(seam, with: .color(Theme.ink.opacity(0.6)), lineWidth: max(1, r * 0.08))
        for ex in [-0.35, 0.35] {
            ctx.fill(Path(ellipseIn: CGRect(x: p.x + r * ex - r * 0.2, y: shell.minY - r * 0.1, width: r * 0.4, height: r * 0.4)), with: .color(.white))
            ctx.fill(Path(ellipseIn: CGRect(x: p.x + r * ex - r * 0.1, y: shell.minY, width: r * 0.2, height: r * 0.2)), with: .color(Theme.ink))
        }
    }

    private func drawPlayer(_ ctx: inout GraphicsContext) {
        // blink while invulnerable
        if e.invulnerable > 0, e.stumble <= 0, Int(e.time * 12) % 2 == 0 { return }
        guard let ground = P(e.x, 0, 0), let body = P(e.x, 0.62 + e.y, 0) else { return }
        let s = scale(0)
        let shadowW = 0.9 * s * (1 - min(0.5, e.y * 0.2))
        ctx.fill(Path(ellipseIn: CGRect(x: ground.x - shadowW / 2, y: ground.y - shadowW * 0.12, width: shadowW, height: shadowW * 0.24)),
                 with: .color(.black.opacity(0.25)))

        let r = 0.62 * s
        let squashY = e.rolling > 0 ? 0.55 : (e.y > 0 ? 1.08 : 1 + sin(e.runPhase * 2) * 0.05)
        let squashX = e.rolling > 0 ? 1.25 : (e.y > 0 ? 0.94 : 1)
        var c = ctx
        c.translateBy(x: body.x, y: body.y + (e.rolling > 0 ? r * 0.35 : 0))
        c.rotate(by: .radians(e.stumble > 0 ? e.stumble * 9 : sin(e.runPhase) * 0.12 + (e.rolling > 0 ? e.time * 14 : 0)))
        c.scaleBy(x: squashX, y: squashY)
        let rect = CGRect(x: -r, y: -r, width: 2 * r, height: 2 * r)
        let shape = SplatShape(wobble: e.runPhase * 0.6).path(in: rect)
        c.stroke(shape, with: .color(.white), style: StrokeStyle(lineWidth: max(2, r * 0.1), lineJoin: .round))
        c.fill(shape, with: .color(Theme.splat))
        c.fill(Path(ellipseIn: rect.insetBy(dx: r * 0.72, dy: r * 0.72)), with: .color(Theme.splatDark.opacity(0.5)))
    }

    private func drawConfetti(_ ctx: inout GraphicsContext) {
        let palette = [Theme.yellow, Theme.splat, .white, Theme.pink, Theme.mint, Theme.lavender]
        for p in e.confetti {
            var c = ctx
            c.translateBy(x: p.x * size.width, y: p.y * size.height)
            c.rotate(by: .radians(p.spin))
            let s = 7.0
            c.fill(Path(CGRect(x: -s / 2, y: -s / 2, width: s, height: s * 0.7)),
                   with: .color(palette[Int(p.hue * Double(palette.count)) % palette.count].opacity(min(1, p.life))))
        }
    }
}
