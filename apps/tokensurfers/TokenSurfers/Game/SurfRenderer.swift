import SwiftUI
import UIKit

/// Draws Token Surfers as flat-shaded pseudo-3D in the look of misc/3.MP4:
/// peach sunset, cream sun, plum skyline, station walls with posters,
/// lavender rails on dark sleepers, chunky subway cars, gold tokens, and the
/// surfer running away from the camera.
struct SurfRenderer {
    let e: SurfEngine
    let size: CGSize

    // Camera well behind and above the player with a long lens (the Subway
    // Surfers look: a big runner, little perspective distortion). Lane
    // spacing at the player is a third of the width; the feet sit at 86% of
    // the height and the horizon near 40%. Short panes shorten the lens so
    // the horizon stays on screen. The camera lifts with the player.
    private let camBack = 6.0
    private var f: Double { min(size.width * 1.58, size.height * 0.71 * camBack / 3.0) }
    private var camBaseH: Double { max(3.0, size.height * 0.46 * camBack / f) }
    private var camH: Double { camBaseH + e.y * 0.45 }
    private var horizon: Double { size.height * 0.86 - camBaseH * f / camBack }
    private var camX: Double { e.x * 0.55 }
    private var shake: CGPoint {
        guard e.over, e.time - e.deathAt < 0.5 else { return .zero }
        let k = (0.5 - (e.time - e.deathAt)) * 18
        return CGPoint(x: sin(e.time * 60) * k, y: cos(e.time * 47) * k)
    }

    private func P(_ x: Double, _ y: Double, _ z: Double) -> CGPoint? {
        let zr = z + camBack
        guard zr > 0.6 else { return nil }
        return CGPoint(x: size.width / 2 + (x - camX) * f / zr + shake.x,
                       y: horizon + (camH - y) * f / zr + shake.y)
    }

    private func scale(_ z: Double) -> Double { f / max(z + camBack, 0.6) }

    private func quad(_ a: CGPoint?, _ b: CGPoint?, _ c: CGPoint?, _ d: CGPoint?) -> Path? {
        guard let a, let b, let c, let d else { return nil }
        var p = Path()
        p.move(to: a); p.addLine(to: b); p.addLine(to: c); p.addLine(to: d); p.closeSubpath()
        return p
    }

    struct Livery { let body, dark, roof, stripe, glass: Color }
    static let liveries: [Livery] = [
        Livery(body: Color(hex: 0xF0703C), dark: Color(hex: 0xC4522A), roof: Color(hex: 0xF7A27A), stripe: Color(hex: 0xFFF3E0), glass: Color(hex: 0x23213D)),
        Livery(body: Color(hex: 0x2F9C8F), dark: Color(hex: 0x1E746A), roof: Color(hex: 0x5CC0B2), stripe: Color(hex: 0xEAFBF6), glass: Color(hex: 0x1B2B33)),
        Livery(body: Color(hex: 0xE9B53A), dark: Color(hex: 0xBE8C22), roof: Color(hex: 0xF5CE6A), stripe: Color(hex: 0xFFF8E1), glass: Color(hex: 0x2E2A1A)),
        Livery(body: Color(hex: 0x6D55C9), dark: Color(hex: 0x4E3AA0), roof: Color(hex: 0x8E7BE0), stripe: Color(hex: 0xEFEAFF), glass: Color(hex: 0x1F1A3D)),
    ]
    static let terminal = Livery(body: Color(hex: 0x1C1B34), dark: Color(hex: 0x100F22), roof: Color(hex: 0x2A2950), stripe: Color(hex: 0x2FE08A), glass: Color(hex: 0x0B1A12))

    func draw(_ ctx: inout GraphicsContext) {
        if e.over, e.time - e.deathAt > 0.15 { ctx.addFilter(.grayscale(min(1, (e.time - e.deathAt - 0.15) * 2))) }
        drawSky(&ctx)
        drawGround(&ctx)
        drawPlatforms(&ctx)
        drawWalls(&ctx)
        drawTrack(&ctx)

        // Painter's order: lanes from the one farthest from the camera to the
        // nearest (a car beside you can't be drawn through a car in the next
        // lane), then within a lane by near z. Coins over a train sort right
        // after that train so they sit on its roof. The player is drawn in
        // their lane after everything ahead of or under them.
        let lw = SurfEngine.laneWidth
        let laneOrder = [-1, 0, 1].sorted { abs(Double($0) * lw - camX) > abs(Double($1) * lw - camX) }
        let ents = e.entities
        var byLane: [[Int]] = [[], [], []]          // entity indices per lane (-1, 0, 1)
        var trainsIn: [[Int]] = [[], [], []]
        byLane[0].reserveCapacity(64); byLane[1].reserveCapacity(64); byLane[2].reserveCapacity(64)
        for i in ents.indices {
            let ent = ents[i]
            if ent.dead || ent.z >= SurfEngine.viewDepth || (ent.kind == .coin && ent.z < -0.9) { continue }
            byLane[ent.lane + 1].append(i)
            if ent.kind == .train || ent.kind == .rampTrain { trainsIn[ent.lane + 1].append(i) }
        }
        var keys = [Double](repeating: 0, count: ents.count)
        for l in 0..<3 {
            for i in byLane[l] {
                var key = ents[i].z
                if ents[i].kind == .coin {
                    for t in trainsIn[l] where ents[t].z <= ents[i].z && ents[t].z + ents[t].length >= ents[i].z {
                        key = ents[t].z - 0.001
                        break
                    }
                }
                keys[i] = key
            }
            byLane[l].sort { keys[$0] > keys[$1] }
        }
        var playerDrawn = false
        for lane in laneOrder {
            for i in byLane[lane + 1] {
                let ent = ents[i]
                if lane == e.lane, !playerDrawn, keys[i] < -0.35 {
                    let underfoot = (ent.kind == .train || ent.kind == .rampTrain) && ent.z <= 0.35 && ent.z + ent.length >= -0.35
                    if !underfoot { drawPlayer(&ctx); playerDrawn = true }
                }
                switch ent.kind {
                case .train, .rampTrain: drawTrain(&ctx, ent)
                case .coin: drawCoin(&ctx, ent)
                case .barrier: drawBarrier(&ctx, ent)
                case .gate: drawGate(&ctx, ent)
                case .bug: drawBug(&ctx, ent)
                }
            }
            if lane == e.lane, !playerDrawn { drawPlayer(&ctx); playerDrawn = true }
        }
        if !playerDrawn { drawPlayer(&ctx) }
        drawSpeedLines(&ctx)
        drawConfetti(&ctx)
        if e.over, e.time - e.deathAt < 0.12 {
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(hex: 0xFF4B4B).opacity(0.55)))
        }
    }

    // MARK: backdrop

    private func drawSky(_ ctx: inout GraphicsContext) {
        let skyRect = CGRect(x: 0, y: 0, width: size.width, height: horizon + 2)
        ctx.fill(Path(skyRect), with: .linearGradient(
            Gradient(colors: [Color(hex: 0xEE7F52), Color(hex: 0xF6B47C), Color(hex: 0xFAD8A0)]),
            startPoint: .zero, endPoint: CGPoint(x: 0, y: horizon)))
        // sun with a halo
        let r = size.width * 0.12
        let sx = size.width * 0.5 - camX * 4
        let sy = horizon - size.height * 0.1 - r * 0.7
        ctx.fill(Path(ellipseIn: CGRect(x: sx - r * 1.5, y: sy - r * 1.5, width: r * 3, height: r * 3)),
                 with: .color(Color(hex: 0xFCE7B0).opacity(0.28)))
        ctx.fill(Path(ellipseIn: CGRect(x: sx - r, y: sy - r, width: r * 2, height: r * 2)),
                 with: .color(Color(hex: 0xFCEBB8)))
        // two skyline layers, parallax with the camera and a slow drift with distance.
        // Each layer is one period-wide strip, rendered once per size (blocks and
        // lit windows are hundreds of rects) and blitted twice at the offset.
        let period = 900.0
        for layer in 0..<2 {
            let drift = layer == 0 ? 0.006 : 0.012
            let shift = (e.distance * drift * 60).truncatingRemainder(dividingBy: period) + camX * (6 + Double(layer) * 6)
            let strip = SkylineCache.strip(layer: layer, height: size.height, period: period)
            let stripH = strip.size.height
            var bx = -shift.truncatingRemainder(dividingBy: period) - period
            while bx < size.width {
                ctx.draw(Image(uiImage: strip), in: CGRect(x: bx, y: horizon - stripH + 1, width: period, height: stripH))
                bx += period
            }
        }
        ctx.fill(Path(CGRect(x: 0, y: horizon - 12, width: size.width, height: 14)),
                 with: .linearGradient(Gradient(colors: [Color(hex: 0xF9D39A, alpha: 0), Color(hex: 0xF3C3A0, alpha: 0.85)]),
                                       startPoint: CGPoint(x: 0, y: horizon - 12), endPoint: CGPoint(x: 0, y: horizon + 2)))
    }

    private func drawGround(_ ctx: inout GraphicsContext) {
        ctx.fill(Path(CGRect(x: 0, y: horizon, width: size.width, height: size.height - horizon)),
                 with: .linearGradient(Gradient(colors: [Color(hex: 0x9C8FAE), Color(hex: 0x6E6388), Color(hex: 0x584D70)]),
                                       startPoint: CGPoint(x: 0, y: horizon), endPoint: CGPoint(x: 0, y: size.height)))
        // ballast: all the dots in one path, one fill
        var rng = SeededRandom(seed: 99)
        let gap = 2.3
        var z = 60.0 - e.distance.truncatingRemainder(dividingBy: gap)
        var dots = Path()
        while z > -5 {
            for _ in 0..<5 {
                let x = -2.4 + rng.unit() * 4.8
                if let p = P(x, 0, z + rng.unit() * gap) {
                    let r = max(0.6, 0.06 * scale(z))
                    dots.addEllipse(in: CGRect(x: p.x - r, y: p.y - r * 0.5, width: 2 * r, height: r))
                }
            }
            z -= gap
        }
        ctx.fill(dots, with: .color(Color(hex: 0x3F3552).opacity(0.5)))
    }

    /// Station platforms beside the tracks, with a yellow safety line.
    private func drawPlatforms(_ ctx: inout GraphicsContext) {
        let far = SurfEngine.viewDepth, near = -5.0, edge = 1.95, wall = 2.95, h = 0.28
        for side in [-1.0, 1.0] {
            let x0 = edge * side, x1 = wall * side
            if let top = quad(P(x0, h, near), P(x0, h, far), P(x1, h, far), P(x1, h, near)) {
                ctx.fill(top, with: .color(Color(hex: 0xB7ACC6)))
            }
            if (side < 0 && camX > x0) || (side > 0 && camX < x0),
               let face = quad(P(x0, 0, near), P(x0, 0, far), P(x0, h, far), P(x0, h, near)) {
                ctx.fill(face, with: .color(Color(hex: 0x8C819F)))
            }
            let lineX = x0 + side * 0.12
            if let line = quad(P(lineX - 0.05, h + 0.005, near), P(lineX - 0.05, h + 0.005, far), P(lineX + 0.05, h + 0.005, far), P(lineX + 0.05, h + 0.005, near)) {
                ctx.fill(line, with: .color(Color(hex: 0xF2C94C).opacity(0.85)))
            }
        }
    }

    /// Station walls with posters scrolling past.
    private func drawWalls(_ ctx: inout GraphicsContext) {
        let wallX = 2.95, far = SurfEngine.viewDepth, near = -5.0, h = 2.7, base = 0.28
        let texts = ["TOKEN SURFERS", "made with code", "LGTM", "SHIP IT", "brb 3am", "no comments", "x_final_final", "let him cook"]
        let colors = [Color(hex: 0xF2C14E), Color(hex: 0xE25C4B), Color(hex: 0x8C6BE0), Color(hex: 0x3FB5A5), Color(hex: 0xF08BB0), Color(hex: 0x4F8FD6)]
        for side in [-1.0, 1.0] {
            let x = wallX * side
            if let p = quad(P(x, base, near), P(x, base, far), P(x, h, far), P(x, h, near)) {
                ctx.fill(p, with: .color(Color(hex: 0x7C7299)))
            }
            if let trim = quad(P(x, h - 0.12, near), P(x, h - 0.12, far), P(x, h, far), P(x, h, near)) {
                ctx.fill(trim, with: .color(Color(hex: 0x9A90B8)))
            }
            let spacing = 12.0
            var z = far - e.distance.truncatingRemainder(dividingBy: spacing)
            while z > near {
                let idx = abs(Int(((e.distance + z) / spacing).rounded(.down)) + (side > 0 ? 3 : 0))
                let color = colors[idx % colors.count]
                if let edge = quad(P(x, 0.86, z - 0.06), P(x, 0.86, z + 3.66), P(x, 2.19, z + 3.66), P(x, 2.19, z - 0.06)),
                   let p = quad(P(x, 0.9, z), P(x, 0.9, z + 3.6), P(x, 2.15, z + 3.6), P(x, 2.15, z)) {
                    ctx.fill(edge, with: .color(.white.opacity(0.85)))
                    ctx.fill(p, with: .color(color))
                }
                if z < 34, z + 3.6 > -1, let poster = quad(P(x, 0.9, z), P(x, 0.9, z + 3.6), P(x, 2.15, z + 3.6), P(x, 2.15, z)),
                   let c = P(x, 1.52, z + 1.8), let a = P(x, 1.52, z), let b = P(x, 1.52, z + 3.6), let top = P(x, 2.15, z + 1.8) {
                    let word = texts[idx % texts.count]
                    let pw = abs(b.x - a.x), ph = abs(c.y - top.y) * 2
                    if pw > 12, ph > 6, let glyph = GlyphCache.image(word, style: .poster) {
                        // the word rendered once; drawn as an image fitted to the poster
                        let w = min(pw * 0.9, ph * 0.5 * glyph.aspect), h = w / glyph.aspect
                        var cc = ctx
                        cc.clip(to: poster)
                        cc.translateBy(x: c.x, y: c.y)
                        cc.rotate(by: .degrees(side > 0 ? -6 : 6))
                        cc.draw(glyph.image, in: CGRect(x: -w / 2, y: -h / 2, width: w, height: h))
                    }
                }
                z -= spacing
            }
        }
    }

    private func drawTrack(_ ctx: inout GraphicsContext) {
        let far = SurfEngine.viewDepth, near = -5.0
        // sleepers: ~90 rows × 3 lanes as two paths (near, far), two fills
        let gap = 1.1
        var z = far - e.distance.truncatingRemainder(dividingBy: gap)
        let sleeper = Color(hex: 0x4B3440)
        var nearPath = Path(), farPath = Path()
        while z > near {
            for l in -1...1 {
                let cx = Double(l) * SurfEngine.laneWidth
                if let a = P(cx - 0.56, 0, z), let b = P(cx + 0.56, 0, z), let c = P(cx + 0.56, 0, z + 0.34), let d = P(cx - 0.56, 0, z + 0.34) {
                    if z > 55 {
                        farPath.move(to: a); farPath.addLine(to: b); farPath.addLine(to: c); farPath.addLine(to: d); farPath.closeSubpath()
                    } else {
                        nearPath.move(to: a); nearPath.addLine(to: b); nearPath.addLine(to: c); nearPath.addLine(to: d); nearPath.closeSubpath()
                    }
                }
            }
            z -= gap
        }
        ctx.fill(farPath, with: .color(sleeper.opacity(0.45)))
        ctx.fill(nearPath, with: .color(sleeper.opacity(0.9)))
        // rails and their shadows: one path each
        var rails = Path(), shadows = Path()
        for l in -1...1 {
            let cx = Double(l) * SurfEngine.laneWidth
            for dx in [-0.4, 0.4] {
                let x = cx + dx
                if let p = quad(P(x - 0.05, 0.02, near), P(x + 0.05, 0.02, near), P(x + 0.05, 0.02, far), P(x - 0.05, 0.02, far)) { rails.addPath(p) }
                if let sh = quad(P(x + 0.05, 0.0, near), P(x + 0.09, 0.0, near), P(x + 0.09, 0.0, far), P(x + 0.05, 0.0, far)) { shadows.addPath(sh) }
            }
        }
        ctx.fill(shadows, with: .color(Color(hex: 0x4B3440).opacity(0.35)))
        ctx.fill(rails, with: .color(Color(hex: 0xE4DDF7)))
    }

    // MARK: trains

    private func drawTrain(_ ctx: inout GraphicsContext, _ t: SurfEngine.Entity) {
        let cx = Double(t.lane) * SurfEngine.laneWidth
        let w = SurfEngine.trainW, h = SurfEngine.trainH
        let z0 = max(t.z, -5.0), zEnd = t.z + t.length
        let z1 = min(zEnd, SurfEngine.viewDepth)
        guard z1 > z0 else { return }
        let livery = t.tool ? Self.terminal : Self.liveries[t.color % Self.liveries.count]
        let ramp = t.kind == .rampTrain
        let bodyStart = ramp ? max(z0, t.z + SurfEngine.rampLen) : z0

        if let sh = quad(P(cx - w - 0.18, 0, z0), P(cx + w + 0.18, 0, z0), P(cx + w + 0.18, 0, z1), P(cx - w - 0.18, 0, z1)) {
            ctx.fill(sh, with: .color(.black.opacity(0.22)))
        }

        var sideX: Double? = nil
        if camX < cx - w { sideX = cx - w } else if camX > cx + w { sideX = cx + w }

        if let sx = sideX, z1 > bodyStart {
            drawSide(&ctx, t, sx: sx, s0: bodyStart, s1: z1, zEnd: zEnd, livery: livery, ramp: ramp)
        }

        if z1 > bodyStart, let roof = quad(P(cx - w, h, bodyStart), P(cx + w, h, bodyStart), P(cx + w, h, z1), P(cx - w, h, z1)) {
            ctx.fill(roof, with: .color(livery.roof))
            if let strip = quad(P(cx - 0.16, h + 0.01, bodyStart), P(cx + 0.16, h + 0.01, bodyStart), P(cx + 0.16, h + 0.01, z1), P(cx - 0.16, h + 0.01, z1)) {
                ctx.fill(strip, with: .color(.white.opacity(t.tool ? 0.12 : 0.35)))
            }
            var c = t.z + (ramp ? SurfEngine.rampLen : 0) + SurfEngine.carLen
            while c < zEnd - 0.5 {
                if c > bodyStart, c < z1, let gap = quad(P(cx - w, h, c - 0.2), P(cx + w, h, c - 0.2), P(cx + w, h, c + 0.2), P(cx - w, h, c + 0.2)) {
                    ctx.fill(gap, with: .color(Color(hex: 0x1A1524)))
                }
                c += SurfEngine.carLen
            }
        }

        if ramp {
            drawRamp(&ctx, t, cx: cx, livery: livery)
        } else if t.z > -5.0 {
            drawFront(&ctx, t, cx: cx, livery: livery)
        }
    }

    /// The visible side: undercarriage, body, stripe, doors, windows, wheels
    /// and the dark gap between cars.
    private func drawSide(_ ctx: inout GraphicsContext, _ t: SurfEngine.Entity, sx: Double, s0: Double, s1: Double, zEnd: Double, livery: Livery, ramp: Bool) {
        let h = SurfEngine.trainH
        func band(_ y0: Double, _ y1: Double, _ a: Double, _ b: Double) -> Path? {
            quad(P(sx, y0, a), P(sx, y0, b), P(sx, y1, b), P(sx, y1, a))
        }
        if let under = band(0, 0.3, s0, s1) { ctx.fill(under, with: .color(Color(hex: 0x2A2438))) }
        if let body = band(0.3, h, s0, s1) { ctx.fill(body, with: .color(livery.body)) }
        if let stripe = band(0.62, 0.86, s0, s1) { ctx.fill(stripe, with: .color(livery.stripe.opacity(t.tool ? 0.6 : 0.9))) }
        if let roofLine = band(h - 0.16, h, s0, s1) { ctx.fill(roofLine, with: .color(livery.dark)) }

        var c = t.z + (ramp ? SurfEngine.rampLen : 0)
        while c < zEnd - 0.5 {
            let carEnd = min(c + SurfEngine.carLen, zEnd)
            if min(carEnd, s1) > max(c, s0) {
                let d0 = c + 0.35, d1 = c + 1.05
                if d1 > s0, d0 < s1, let door = band(0.32, 1.62, max(d0, s0), min(d1, s1)) {
                    ctx.fill(door, with: .color(livery.dark))
                    let m = (d0 + d1) / 2
                    if m > s0, m < s1, let seam = band(0.32, 1.62, m - 0.02, m + 0.02) {
                        ctx.fill(seam, with: .color(livery.body.opacity(0.7)))
                    }
                }
                var wz = c + 1.5
                while wz + 0.9 < carEnd - 0.3 {
                    if wz + 0.9 > s0, wz < s1, let win = band(1.05, 1.55, max(wz, s0), min(wz + 0.9, s1)) {
                        ctx.fill(win, with: .color(livery.glass))
                        if t.tool {
                            if let bar = band(1.2, 1.27, max(wz + 0.1, s0), min(wz + 0.6, s1)) {
                                ctx.fill(bar, with: .color(Self.terminal.stripe.opacity(0.8)))
                            }
                        } else if let gl = band(1.42, 1.5, max(wz + 0.05, s0), min(wz + 0.85, s1)) {
                            ctx.fill(gl, with: .color(.white.opacity(0.28)))
                        }
                    }
                    wz += 1.35
                }
            }
            if carEnd < zEnd - 0.5, carEnd > s0, carEnd < s1, let gap = band(0, h, carEnd - 0.2, carEnd + 0.2) {
                ctx.fill(gap, with: .color(Color(hex: 0x1A1524)))
            }
            c = carEnd
        }
    }

    private func drawRamp(_ ctx: inout GraphicsContext, _ t: SurfEngine.Entity, cx: Double, livery: Livery) {
        let w = SurfEngine.trainW, h = SurfEngine.trainH, R = SurfEngine.rampLen
        guard t.z + R > -5.0 else { return }
        let z = t.z
        var sideX: Double? = nil
        if camX < cx - w { sideX = cx - w } else if camX > cx + w { sideX = cx + w }
        if let sx = sideX {
            var wedge = Path()
            if let a = P(sx, 0, z), let b = P(sx, 0, z + R), let c = P(sx, h, z + R) {
                wedge.move(to: a); wedge.addLine(to: b); wedge.addLine(to: c); wedge.closeSubpath()
                ctx.fill(wedge, with: .color(livery.dark))
            }
        }
        let bands = 6
        for k in 0..<bands {
            let u0 = Double(k) / Double(bands), u1 = Double(k + 1) / Double(bands)
            if let q = quad(P(cx - w, h * u0, z + R * u0), P(cx + w, h * u0, z + R * u0),
                            P(cx + w, h * u1, z + R * u1), P(cx - w, h * u1, z + R * u1)) {
                ctx.fill(q, with: .color(k % 2 == 0 ? Color(hex: 0xF2C94C) : Color(hex: 0x2A2438)))
            }
        }
        if let outline = quad(P(cx - w, 0, z), P(cx + w, 0, z), P(cx + w, h, z + R), P(cx - w, h, z + R)) {
            ctx.stroke(outline, with: .color(.white), lineWidth: max(1, 0.04 * scale(z)))
        }
        if let tip = P(cx, h * 0.72, z + R * 0.72), let base = P(cx, h * 0.3, z + R * 0.3) {
            var arrow = Path()
            arrow.move(to: base); arrow.addLine(to: tip)
            let lw = max(1.5, 0.07 * scale(z))
            ctx.stroke(arrow, with: .color(.white), style: StrokeStyle(lineWidth: lw, lineCap: .round))
            let s = 0.16 * scale(z)
            var head = Path()
            head.move(to: CGPoint(x: tip.x - s, y: tip.y + s * 0.9))
            head.addLine(to: tip)
            head.addLine(to: CGPoint(x: tip.x + s, y: tip.y + s * 0.9))
            ctx.stroke(head, with: .color(.white), style: StrokeStyle(lineWidth: lw, lineCap: .round, lineJoin: .round))
        }
    }

    private func drawFront(_ ctx: inout GraphicsContext, _ t: SurfEngine.Entity, cx: Double, livery: Livery) {
        let w = SurfEngine.trainW, h = SurfEngine.trainH
        guard let a = P(cx - w, h, t.z), let b = P(cx + w, 0, t.z) else { return }
        let rect = CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y)
        guard rect.width > 2 else { return }
        let front = Path(roundedRect: rect, cornerRadius: rect.width * 0.14)
        ctx.fill(front, with: .color(livery.body))
        var lower = ctx
        lower.clip(to: front)
        lower.fill(Path(CGRect(x: rect.minX, y: rect.maxY - rect.height * 0.14, width: rect.width, height: rect.height * 0.14)),
                   with: .color(Color(hex: 0x2A2438)))
        lower.fill(Path(CGRect(x: rect.minX, y: rect.minY + rect.height * 0.62, width: rect.width, height: rect.height * 0.11)),
                   with: .color(livery.stripe.opacity(t.tool ? 0.5 : 0.9)))
        lower.fill(Path(CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height * 0.08)),
                   with: .color(livery.roof))
        ctx.stroke(front, with: .color(Theme.ink.opacity(0.9)), lineWidth: max(1, rect.width * 0.03))

        let win = CGRect(x: rect.minX + rect.width * 0.13, y: rect.minY + rect.height * 0.15,
                         width: rect.width * 0.74, height: rect.height * 0.32)
        let glass = Path(roundedRect: win, cornerRadius: win.width * 0.08)
        ctx.fill(glass, with: .color(livery.glass))
        if t.tool {
            fitText(&ctx, "> \(t.label)", in: win.insetBy(dx: win.width * 0.05, dy: 0), maxHeight: 0.5, mono: true, color: Self.terminal.stripe)
        } else {
            ctx.fill(Path(roundedRect: CGRect(x: win.minX + win.width * 0.06, y: win.minY + win.height * 0.12, width: win.width * 0.88, height: win.height * 0.16), cornerRadius: 2),
                     with: .color(.white.opacity(0.22)))
        }

        let lr = rect.width * 0.085
        let on = t.speed > 0
        for fx in [0.22, 0.78] {
            let c = CGPoint(x: rect.minX + rect.width * fx, y: rect.minY + rect.height * 0.8)
            if on {
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - lr * 2.4, y: c.y - lr * 2.4, width: lr * 4.8, height: lr * 4.8)),
                         with: .color(Color(hex: 0xFFF2C6).opacity(0.35)))
            }
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - lr, y: c.y - lr, width: lr * 2, height: lr * 2)),
                     with: .color(on ? Color(hex: 0xFFFBE8) : Color(hex: 0xFFE7A8)))
            ctx.stroke(Path(ellipseIn: CGRect(x: c.x - lr, y: c.y - lr, width: lr * 2, height: lr * 2)),
                       with: .color(Theme.ink.opacity(0.6)), lineWidth: max(0.5, lr * 0.15))
        }
        if !t.tool, rect.width > 24 {
            let br = rect.width * 0.09
            let c = CGPoint(x: rect.midX, y: rect.minY + rect.height * 0.55)
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - br, y: c.y - br, width: br * 2, height: br * 2)), with: .color(.white))
            if let glyph = GlyphCache.image(["A", "B", "C", "D"][t.color % 4], style: .badge(t.color % 4)) {
                let h = br * 1.3, w = h * glyph.aspect
                ctx.draw(glyph.image, in: CGRect(x: c.x - w / 2, y: c.y - h / 2, width: w, height: h))
            }
        }
    }

    /// One line of text fitted to a board on screen: the word is rasterized once
    /// (GlyphCache) and drawn as an image, so no text layout happens per frame.
    private func fitText(_ ctx: inout GraphicsContext, _ text: String, in rect: CGRect, maxHeight: Double, mono: Bool = false, color: Color = .white) {
        guard rect.width > 24, rect.height > 6, let glyph = GlyphCache.image(text, style: mono ? .terminal : .board) else { return }
        let h = min(rect.height * maxHeight, rect.width * 0.92 / glyph.aspect)
        guard h > 4 else { return }
        let w = h * glyph.aspect
        ctx.draw(glyph.image, in: CGRect(x: rect.midX - w / 2, y: rect.midY - h / 2, width: w, height: h))
    }

    // MARK: props

    private func drawCoin(_ ctx: inout GraphicsContext, _ c: SurfEngine.Entity) {
        let cx = Double(c.lane) * SurfEngine.laneWidth
        let bob = sin(e.time * 4 + c.z) * 0.06
        guard let p = P(cx, c.y + bob, c.z) else { return }
        let r = 0.28 * scale(c.z)
        guard r > 0.8 else { return }
        let spin = abs(cos(e.time * 5 + c.z * 0.7))
        let wf = max(0.22, spin)
        let rect = CGRect(x: p.x - r * wf, y: p.y - r, width: 2 * r * wf, height: 2 * r)
        let rim = max(0.6, r * 0.12)
        ctx.fill(Path(ellipseIn: rect.offsetBy(dx: 0, dy: r * 0.14)), with: .color(Color(hex: 0xB9801E)))
        ctx.fill(Path(ellipseIn: rect), with: .color(.white.opacity(0.9)))
        ctx.fill(Path(ellipseIn: rect.insetBy(dx: rim, dy: rim)), with: .color(c.token ? Color(hex: 0xFFD84A) : Color(hex: 0xF6BE35)))
        if spin > 0.35 {
            var d = Path()
            let s = r * 0.42 * spin
            d.move(to: CGPoint(x: p.x, y: p.y - s)); d.addLine(to: CGPoint(x: p.x + s * wf, y: p.y))
            d.addLine(to: CGPoint(x: p.x, y: p.y + s)); d.addLine(to: CGPoint(x: p.x - s * wf, y: p.y)); d.closeSubpath()
            ctx.fill(d, with: .color(Color(hex: 0xF0703C)))
        }
    }

    private func drawBarrier(_ ctx: inout GraphicsContext, _ b: SurfEngine.Entity) {
        let cx = Double(b.lane) * SurfEngine.laneWidth
        guard let a = P(cx - 0.58, 0.95, b.z), let d = P(cx + 0.58, 0.35, b.z), let foot = P(cx, 0, b.z) else { return }
        let sr = 0.6 * scale(b.z)
        ctx.fill(Path(ellipseIn: CGRect(x: foot.x - sr, y: foot.y - sr * 0.12, width: 2 * sr, height: sr * 0.24)), with: .color(.black.opacity(0.2)))
        let legW = max(1.5, (d.x - a.x) * 0.06)
        for fx in [0.14, 0.86] {
            let lx = a.x + (d.x - a.x) * fx
            ctx.fill(Path(CGRect(x: lx - legW / 2, y: a.y, width: legW, height: foot.y - a.y)), with: .color(Color(hex: 0xEDE6F5)))
        }
        let board = CGRect(x: a.x, y: a.y, width: d.x - a.x, height: d.y - a.y)
        ctx.fill(Path(roundedRect: board, cornerRadius: 2), with: .color(Theme.red))
        ctx.stroke(Path(roundedRect: board, cornerRadius: 2), with: .color(.white), lineWidth: max(1, board.width * 0.025))
        fitText(&ctx, "made with code", in: board, maxHeight: 0.4)
    }

    private func drawGate(_ ctx: inout GraphicsContext, _ g: SurfEngine.Entity) {
        let cx = Double(g.lane) * SurfEngine.laneWidth
        guard let a = P(cx - 0.6, 2.2, g.z), let d = P(cx + 0.6, 1.4, g.z), let foot = P(cx, 0, g.z) else { return }
        let legW = max(1.5, (d.x - a.x) * 0.05)
        for fx in [0.06, 0.94] {
            let lx = a.x + (d.x - a.x) * fx
            ctx.fill(Path(CGRect(x: lx - legW / 2, y: a.y, width: legW, height: foot.y - a.y)), with: .color(Color(hex: 0xEDE6F5)))
        }
        let board = CGRect(x: a.x, y: a.y, width: d.x - a.x, height: d.y - a.y)
        ctx.fill(Path(roundedRect: board, cornerRadius: 3), with: .color(Color(hex: 0x3FB5A5)))
        ctx.stroke(Path(roundedRect: board, cornerRadius: 3), with: .color(.white), lineWidth: max(1, board.width * 0.02))
        fitText(&ctx, "LGTM ↓ roll", in: board, maxHeight: 0.4)
    }

    private func drawBug(_ ctx: inout GraphicsContext, _ b: SurfEngine.Entity) {
        let cx = Double(b.lane) * SurfEngine.laneWidth + sin(b.phase * 3) * 0.25
        guard let p = P(cx, 0.25, b.z) else { return }
        let r = 0.36 * scale(b.z)
        guard r > 1 else { return }
        for i in 0..<3 {
            let ly = p.y - r * 0.3 + Double(i) * r * 0.35
            let wig = sin(b.phase * 18 + Double(i)) * r * 0.15
            var leg = Path()
            leg.move(to: CGPoint(x: p.x - r * 1.25, y: ly + wig)); leg.addLine(to: CGPoint(x: p.x + r * 1.25, y: ly - wig))
            ctx.stroke(leg, with: .color(Theme.ink), lineWidth: max(1, r * 0.12))
        }
        let shell = CGRect(x: p.x - r, y: p.y - r * 0.8, width: r * 2, height: r * 1.6)
        ctx.fill(Path(ellipseIn: shell), with: .color(Color(hex: 0x6B3FB0)))
        ctx.stroke(Path(ellipseIn: shell), with: .color(.white), lineWidth: max(0.6, r * 0.08))
        let spots: [(Double, Double)] = [(-0.4, -0.2), (0.35, 0.1), (-0.1, 0.4)]
        for (dx, dy) in spots {
            ctx.fill(Path(ellipseIn: CGRect(x: p.x + r * dx - r * 0.15, y: p.y + r * dy - r * 0.15, width: r * 0.3, height: r * 0.3)), with: .color(Color(hex: 0x3A9C5A)))
        }
        var seam = Path(); seam.move(to: CGPoint(x: p.x, y: shell.minY + r * 0.3)); seam.addLine(to: CGPoint(x: p.x, y: shell.maxY))
        ctx.stroke(seam, with: .color(Theme.ink.opacity(0.6)), lineWidth: max(1, r * 0.08))
        for ex in [-0.35, 0.35] {
            ctx.fill(Path(ellipseIn: CGRect(x: p.x + r * ex - r * 0.2, y: shell.minY - r * 0.1, width: r * 0.4, height: r * 0.4)), with: .color(.white))
            ctx.fill(Path(ellipseIn: CGRect(x: p.x + r * ex - r * 0.1, y: shell.minY, width: r * 0.2, height: r * 0.2)), with: .color(Theme.ink))
        }
    }

    // MARK: the surfer

    private func drawPlayer(_ ctx: inout GraphicsContext) {
        if e.invulnerable > 0, e.stumble <= 0, !e.over, Int(e.time * 12) % 2 == 0 { return }
        guard let origin = P(e.x, e.ground, 0) else { return }
        var pose = SurferPose()
        pose.phase = e.runPhase
        pose.lift = max(0, e.y - e.ground)
        pose.vy = e.vy
        pose.rolling = e.rolling
        pose.rollSpin = -e.time * 16
        pose.lean = e.stumble > 0 ? -e.stumble * 1.2 : 0
        pose.sinceLanded = e.time - e.landedAt
        pose.dead = e.over ? e.time - e.deathAt : -1
        pose.t = e.time
        pose.speed = min(1, max(0, (e.speed - 11) / 10))
        pose.sway = e.over ? 0 : max(-1, min(1, (Double(e.lane) * SurfEngine.laneWidth - e.x) / SurfEngine.laneWidth))
        BlobArt.draw(&ctx, origin: origin, unit: scale(0), pose: pose, state: e.blob)
    }

    private func drawSpeedLines(_ ctx: inout GraphicsContext) {
        let k = (e.speed - 15.5) / 5
        guard k > 0 else { return }
        var rng = SeededRandom(seed: UInt64(e.time * 9) + 3)
        let vp = CGPoint(x: size.width / 2, y: horizon)
        for _ in 0..<12 {
            let edge = rng.unit()
            let start: CGPoint = edge < 0.5
                ? CGPoint(x: rng.unit() < 0.5 ? 0 : size.width, y: rng.unit() * size.height)
                : CGPoint(x: rng.unit() * size.width, y: size.height)
            let len = 0.12 + rng.unit() * 0.22
            let end = CGPoint(x: start.x + (vp.x - start.x) * len, y: start.y + (vp.y - start.y) * len)
            var p = Path(); p.move(to: start); p.addLine(to: end)
            ctx.stroke(p, with: .color(.white.opacity(min(0.5, k * 0.5) * (0.4 + rng.unit() * 0.6))), lineWidth: 1 + rng.unit() * 2)
        }
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


/// The skyline strips, rendered once per size (they were hundreds of rect
/// fills per frame). One period wide; the renderer tiles them.
enum SkylineCache {
    nonisolated(unsafe) private static var strips: [String: UIImage] = [:]

    static func strip(layer: Int, height: Double, period: Double) -> UIImage {
        let key = "\(layer)-\(Int(height))"
        if let hit = strips[key] { return hit }
        let tint = layer == 0 ? UIColor(Theme.color(0xC46A8B)) : UIColor(Theme.color(0x9B3F6E))
        let hmul = layer == 0 ? 0.6 : 1.0
        let stripH = ceil(height * 0.11 * hmul) + 2
        let format = UIGraphicsImageRendererFormat()
        format.scale = 3
        format.opaque = false
        let img = UIGraphicsImageRenderer(size: CGSize(width: period, height: stripH), format: format).image { rc in
            let c = rc.cgContext
            var rng = SeededRandom(seed: UInt64(11 + layer))
            var x = 0.0
            // the blocks wrap: draw one period plus the block that straddles the seam
            while x < period + 60 {
                let w = 20 + rng.unit() * 36
                let h = height * (0.035 + rng.unit() * 0.075) * hmul
                for bx in [x, x - period] where bx + w > -2 && bx < period + 2 {
                    c.setFillColor(tint.cgColor)
                    c.fill(CGRect(x: bx, y: stripH - h, width: w + 1, height: h + 1))
                    if layer == 1, w > 26 {
                        var wrng = SeededRandom(seed: UInt64(x * 7) + 3)
                        c.setFillColor(UIColor(Theme.color(0xFFE3A6)).withAlphaComponent(0.7).cgColor)
                        var wy = stripH - h + 6
                        while wy < stripH - 8 {
                            var wx = bx + 5
                            while wx < bx + w - 6 {
                                if wrng.unit() < 0.4 { c.fill(CGRect(x: wx, y: wy, width: 3, height: 4)) }
                                wx += 8
                            }
                            wy += 9
                        }
                    }
                }
                x += w + (layer == 0 ? 0 : 3)
            }
        }
        strips[key] = img
        return img
    }
}


/// Words the scene draws every frame (poster slogans, sign boards, train
/// badges, tool names on terminal trains), rasterized once each and drawn as
/// images — text layout in a Canvas was a measurable slice of every frame.
enum GlyphCache {
    struct Glyph { let image: Image; let aspect: Double }
    enum Style: Hashable { case poster, board, terminal, badge(Int) }
    nonisolated(unsafe) private static var cache: [String: Glyph] = [:]

    static func image(_ text: String, style: Style) -> Glyph? {
        let key = "\(style)|\(text)"
        if let g = cache[key] { return g }
        let font: UIFont
        let color: UIColor
        switch style {
        case .poster: font = UIFont.systemFont(ofSize: 48, weight: .black); color = UIColor.white.withAlphaComponent(0.95)
        case .board: font = UIFont.systemFont(ofSize: 48, weight: .heavy); color = .white
        case .terminal: font = UIFont.monospacedSystemFont(ofSize: 48, weight: .bold); color = UIColor(red: 0.18, green: 0.88, blue: 0.54, alpha: 1)
        case .badge(let i):
            font = UIFont.systemFont(ofSize: 48, weight: .black)
            let darks: [UInt32] = [0xC4522A, 0x1E746A, 0xBE8C22, 0x4E3AA0]
            let v = darks[i % 4]
            color = UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
        }
        let rounded: UIFont
        if case .terminal = style { rounded = font } else if let d = font.fontDescriptor.withDesign(.rounded) { rounded = UIFont(descriptor: d, size: 48) } else { rounded = font }
        let attrs: [NSAttributedString.Key: Any] = [.font: rounded, .foregroundColor: color]
        let size = (text as NSString).size(withAttributes: attrs)
        guard size.width > 0, size.height > 0 else { return nil }
        let canvas = CGSize(width: ceil(size.width) + 4, height: ceil(size.height) + 4)
        let renderer = UIGraphicsImageRenderer(size: canvas, format: { let f = UIGraphicsImageRendererFormat(); f.scale = 2; f.opaque = false; return f }())
        let ui = renderer.image { _ in (text as NSString).draw(at: CGPoint(x: 2, y: 2), withAttributes: attrs) }
        let g = Glyph(image: Image(uiImage: ui), aspect: Double(canvas.width / canvas.height))
        cache[key] = g
        return g
    }
}
