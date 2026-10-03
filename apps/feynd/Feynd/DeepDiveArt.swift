import SwiftUI

// Deep Dive, the picture: water that darkens and starts to glow with depth,
// the night lagoon seen from under its surface, kelp, pearls, gummy
// jellyfish, air pockets, the dodo in its bubble helmet, and the HUD. One
// frame per call, straight into a SwiftUI Canvas; the game owns the state.

enum DeepDiveArt {
    private static let tau = CGFloat.pi * 2

    private static func col(_ hex: UInt32, _ a: Double = 1) -> Color { Color(hex: hex).opacity(a) }
    private static func clamp(_ v: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat { max(a, min(b, v)) }
    private static func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat { a + (b - a) * t }

    private static func ellipse(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, rot: CGFloat = 0) -> Path {
        var p = Path(ellipseIn: CGRect(x: -rx, y: -ry, width: rx * 2, height: ry * 2))
        p = p.applying(CGAffineTransform(translationX: x, y: y).rotated(by: rot))
        return p
    }

    private static func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
    }

    /// A soft radial glow (the prototype's `soft`): colour at the centre
    /// fading to nothing at (rx, ry).
    private static func soft(_ ctx: inout GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ color: Color) {
        guard rx > 0, ry > 0 else { return }
        var c = ctx
        c.translateBy(x: x, y: y)
        c.scaleBy(x: 1, y: ry / rx)
        c.fill(circle(0, 0, rx), with: .radialGradient(Gradient(colors: [color, color.opacity(0)]),
                                                        center: .zero, startRadius: 0, endRadius: rx))
    }

    private static func font(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .custom("Fredoka", size: size).weight(weight)
    }

    /// Resolved labels, reused across frames: resolving a Text each frame
    /// (through the localization path, for an interpolated string) cost a
    /// third of the frame when this was first profiled. Verbatim text, keyed
    /// by string, size, weight and colour.
    nonisolated(unsafe) private static var labels: [String: GraphicsContext.ResolvedText] = [:]

    private static func label(_ ctx: GraphicsContext, _ text: String, _ size: CGFloat, _ weight: Font.Weight = .bold,
                              _ hex: UInt32 = 0xFFFFFF) -> GraphicsContext.ResolvedText {
        let key = "\(size)|\(weight)|\(hex)|\(text)"
        if let hit = labels[key] { return hit }
        if labels.count > 240 { labels.removeAll(keepingCapacity: true) }
        let r = ctx.resolve(Text(verbatim: text).font(font(size, weight)).foregroundColor(col(hex)))
        labels[key] = r
        return r
    }

    // MARK: frame

    static func draw(_ g: DeepDiveGame, in ctx: inout GraphicsContext) {
        drawWater(g, &ctx)
        drawSurface(g, &ctx)
        for k in g.kelp { drawKelp(g, &ctx, k) }
        for p in g.pockets { drawPocket(g, &ctx, p) }
        for p in g.pearls { drawPearl(g, &ctx, p.x, g.screenY(p.z) + sin(g.time * 2 + p.ph) * 3, p.r, big: p.big) }
        for b in g.bubbles where !b.mine { drawBubble(g, &ctx, b.x, g.screenY(b.z), b.r) }
        for j in g.jellies { drawJelly(g, &ctx, j) }
        drawDodo(g, &ctx)
        for b in g.bubbles where b.mine { drawBubble(g, &ctx, b.x, g.screenY(b.z), b.r) }
        for s in g.sparks {
            var c = ctx
            c.opacity = Double(1 - s.t / s.life)
            c.fill(circle(s.x, g.screenY(s.z), 2.5), with: .color(col(s.col)))
        }
        // Depth vignette.
        let dark = clamp((g.z - 10) / 60, 0, 1)
        if dark > 0 {
            let centre = CGPoint(x: g.W / 2, y: g.H / 2)
            ctx.fill(Path(CGRect(origin: .zero, size: CGSize(width: g.W, height: g.H))),
                     with: .radialGradient(Gradient(colors: [jellyRGBA(10, 8, 30, 0), jellyRGBA(10, 8, 30, 0.5 * dark)]),
                                           center: centre, startRadius: g.H * 0.25, endRadius: g.H * 0.75))
        }
        // No HUD under the title card: the lagoon alone, the dodo bobbing
        // at the surface.
        if g.phase != .title { drawHUD(g, &ctx) }
    }

    // MARK: water

    private static let stops: [(CGFloat, (CGFloat, CGFloat, CGFloat))] = [
        (0, (59, 167, 219)), (10, (38, 137, 189)), (25, (31, 78, 143)), (45, (28, 47, 107)), (70, (23, 24, 61)), (110, (18, 15, 42)),
    ]

    private static func water(_ zIn: CGFloat) -> Color {
        let z = max(0, zIn)
        for i in 1..<stops.count where z <= stops[i].0 {
            let (z0, a) = stops[i - 1], (z1, b) = stops[i]
            let t: CGFloat = (z - z0) / (z1 - z0)
            let r: CGFloat = lerp(a.0, b.0, t) / 255
            let gg: CGFloat = lerp(a.1, b.1, t) / 255
            let bb: CGFloat = lerp(a.2, b.2, t) / 255
            return Color(red: Double(r), green: Double(gg), blue: Double(bb))
        }
        let l = stops[stops.count - 1].1
        return Color(red: Double(l.0 / 255), green: Double(l.1 / 255), blue: Double(l.2 / 255))
    }

    private static func drawWater(_ g: DeepDiveGame, _ ctx: inout GraphicsContext) {
        let W = g.W, H = g.H
        let zTop = max(0, g.camZ), zBot = g.camZ + H / g.ppm
        let yTop = max(0, g.screenY(0))
        ctx.fill(Path(CGRect(origin: .zero, size: CGSize(width: W, height: H))),
                 with: .linearGradient(Gradient(colors: [water(zTop), water((zTop + zBot) / 2), water(zBot)]),
                                       startPoint: CGPoint(x: 0, y: yTop), endPoint: CGPoint(x: 0, y: H)))
        let dark = clamp((g.z - 8) / 50, 0, 1)
        // Caustics near the surface.
        if zTop < 9 {
            for i in 0..<7 {
                let z = CGFloat(i) * 1.3 + 0.4, y = g.screenY(z)
                if y < -20 || y > H + 20 { continue }
                var p = Path()
                var x: CGFloat = -10
                while x <= W + 10 {
                    let fi = CGFloat(i)
                    let w1: CGFloat = sin(x * 0.025 + g.time * 1.3 + fi * 2) * 9
                    let w2: CGFloat = sin(x * 0.06 - g.time * 0.9 + fi) * 4
                    let yy: CGFloat = y + w1 + w2
                    if x == -10 { p.move(to: CGPoint(x: x, y: yy)) } else { p.addLine(to: CGPoint(x: x, y: yy)) }
                    x += 10
                }
                var c = ctx
                c.opacity = Double(0.12 * (1 - z / 9))
                c.stroke(p, with: .color(col(0xDCF6FF)), style: StrokeStyle(lineWidth: 6 + CGFloat(i) * 1.5, lineCap: .round))
            }
        }
        // Bioluminescent specks; the field repeats every 16 m.
        for s in g.specks {
            let z = s.z + floor((g.camZ - s.z) / 16 + 1) * 16, y = g.screenY(z)
            if y < -5 || y > H + 5 { continue }
            let breath: CGFloat = 0.5 + 0.5 * sin(g.time * 1.7 + s.tw)
            let a: CGFloat = (0.2 + 0.8 * dark) * breath
            var c = ctx
            c.opacity = Double(a * 0.9)
            c.fill(circle(s.x * W, y, s.r * (1 + dark * 0.6)), with: .color(col(s.hue)))
            if dark > 0.3 && s.r > 1.2 {
                soft(&ctx, s.x * W, y, s.r * 6, s.r * 6, jellyRGBA(145, 233, 204, 0.15 * dark * a))
            }
        }
    }

    private static func wavePath(_ g: DeepDiveGame, y0: CGFloat, closedBelow: Bool) -> Path {
        var p = Path()
        if closedBelow { p.move(to: CGPoint(x: 0, y: g.H)); p.addLine(to: CGPoint(x: 0, y: y0)) }
        var x: CGFloat = 0
        while x <= g.W + 8 {
            let w1: CGFloat = sin(x * 0.03 + g.time * 1.6) * 4
            let w2: CGFloat = sin(x * 0.07 - g.time * 1.1) * 2.5
            let yy: CGFloat = y0 + w1 + w2
            if x == 0 && !closedBelow { p.move(to: CGPoint(x: x, y: yy)) } else { p.addLine(to: CGPoint(x: x, y: yy)) }
            x += 8
        }
        if closedBelow { p.addLine(to: CGPoint(x: g.W, y: g.H)); p.closeSubpath() }
        return p
    }

    private static func drawSurface(_ g: DeepDiveGame, _ ctx: inout GraphicsContext) {
        let W = g.W, y0 = g.screenY(0)
        if y0 < -40 { return }
        // The night sky over the lagoon, seen through the surface.
        if y0 > 0 {
            ctx.fill(Path(CGRect(x: 0, y: 0, width: W, height: y0)),
                     with: .linearGradient(Gradient(colors: [col(0x2A1E45), col(0x6A3FC4)]), startPoint: .zero, endPoint: CGPoint(x: 0, y: y0)))
            for s in g.stars {
                let y = s.y * y0
                if y > y0 - 6 { continue }
                var c = ctx
                c.opacity = Double(0.4 + 0.4 * sin(g.time + s.tw))
                c.fill(circle(s.x * W, y, 1.1), with: .color(col(0xFFF8C8)))
            }
        }
        for l in g.lanterns {
            let bob = sin(g.time * 1.3 + l.ph) * 3, x = l.x, y = y0 - 14 + bob
            soft(&ctx, x, y + 10, 46, 30, col(l.hue, 0.4))
            ctx.fill(Path(roundedRect: CGRect(x: x - 9, y: y - 24, width: 18, height: 24), cornerRadius: 6), with: .color(col(l.hue)))
            ctx.fill(ellipse(x, y - 13, 4, 5), with: .color(.white.opacity(0.5)))
            ctx.fill(Path(roundedRect: CGRect(x: x - 4, y: y - 27, width: 8, height: 3), cornerRadius: 1), with: .color(col(0x2D2537)))
        }
        // Under the wavy surface: a bright band, lily pads, lantern reflections.
        var c = ctx
        c.clip(to: wavePath(g, y0: y0, closedBelow: true))
        c.fill(Path(CGRect(x: 0, y: y0 - 10, width: W, height: 16)), with: .color(.white.opacity(0.22)))
        c.fill(Path(CGRect(x: 0, y: y0, width: W, height: 34)), with: .color(jellyRGBA(220, 246, 255, 0.14)))
        for l in g.lilies {
            let x = l.x + sin(g.time * 0.7 + l.ph) * 6
            let e = ellipse(x, y0 + 4, l.r, l.r * 0.32)
            c.fill(e, with: .color(col(0x1F6D55)))
            c.stroke(e, with: .color(jellyRGBA(145, 233, 204, 0.6)), lineWidth: 2)
        }
        for l in g.lanterns {
            let x = l.x + sin(g.time * 1.1 + l.ph) * 2
            var r = c
            r.opacity = 0.35
            for i in 0..<5 {
                let fi = CGFloat(i)
                let rx: CGFloat = x + sin(g.time * 2 + fi) * 3
                r.fill(ellipse(rx, y0 + 10 + fi * 12, 10 - fi * 1.5, 3), with: .color(col(l.hue)))
            }
        }
        ctx.stroke(wavePath(g, y0: y0, closedBelow: false), with: .color(.white.opacity(0.75)), lineWidth: 2.2)
    }

    // MARK: things in the water

    /// Glowing lagoon weed: a swaying stem with jelly leaves and a lit tip.
    private static func drawKelp(_ g: DeepDiveGame, _ ctx: inout GraphicsContext, _ k: DDKelp) {
        let yb = g.screenY(k.z + k.h), yt = g.screenY(k.z)
        if yb < -10 || yt > g.H + 10 { return }
        let dark = clamp((k.z - 6) / 30, 0, 1), sway = sin(g.time * 0.8 + k.ph) * 16, len = yb - yt
        let n = 7
        var c = ctx
        c.opacity = Double(0.5 + 0.4 * dark)
        for s in [CGFloat(-1), 1] {
            var pts: [CGPoint] = []
            for i in 0...n {
                let t = CGFloat(i) / CGFloat(n)
                let wiggle: CGFloat = sin(t * 2.6 + g.time * 1.1 + k.ph) * 9 * t
                let px: CGFloat = k.x + s * 6 + wiggle + sway * t * t
                pts.append(CGPoint(x: px, y: yb - len * t))
            }
            var stem = Path()
            stem.move(to: pts[0])
            for i in 1...n { stem.addLine(to: pts[i]) }
            c.stroke(stem, with: .color(col(k.col)), style: StrokeStyle(lineWidth: 5, lineCap: .round))
            for i in 2..<n {
                let p = pts[i]
                let side: CGFloat = (i % 2 == 1 ? 1 : -1) * s
                let ang: CGFloat = side * 0.9 + sin(g.time + CGFloat(i)) * 0.15
                c.fill(ellipse(p.x + side * 9, p.y - 2, 10, 4.5, rot: ang), with: .color(col(k.col, 0.85)))
                c.fill(ellipse(p.x + side * 8, p.y - 4, 4, 1.6, rot: ang), with: .color(.white.opacity(0.35)))
            }
            let tip = pts[n]
            soft(&c, tip.x, tip.y, 22, 22, jellyRGBA(255, 248, 200, 0.4 * dark + 0.1))
            c.fill(circle(tip.x, tip.y, 4.5), with: .color(col(0xFFF8C8)))
        }
    }

    private static func drawPearl(_ g: DeepDiveGame, _ ctx: inout GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, big: Bool) {
        if y < -20 || y > g.H + 20 { return }
        soft(&ctx, x, y, r * 2.6, r * 2.6, jellyRGBA(255, 248, 200, 0.28))
        ctx.fill(circle(x, y, r), with: .radialGradient(
            Gradient(stops: [.init(color: .white, location: 0), .init(color: col(big ? 0xFFE0EF : 0xFFF8C8), location: 0.55),
                             .init(color: col(big ? 0xFF9FC8 : 0xE0C98A), location: 1)]),
            center: CGPoint(x: x - r * 0.35, y: y - r * 0.4), startRadius: r * 0.1, endRadius: r * 1.3))
        ctx.fill(ellipse(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.18, rot: -0.6), with: .color(.white.opacity(0.95)))
    }

    private static func drawJelly(_ g: DeepDiveGame, _ ctx: inout GraphicsContext, _ j: DDJelly) {
        let y = g.screenY(j.z)
        if y < -80 || y > g.H + 120 { return }
        let r = j.r, pulse = 1 + sin(j.pulse) * 0.07, rx = r * pulse, ry = r * (2 - pulse) * 0.85
        let (lt, base, deep) = DeepDiveGame.jellyCols[j.col]
        let dark = clamp((j.z - 10) / 40, 0, 1)
        if dark > 0.2 { soft(&ctx, j.x, y, r * 2.6, r * 2.6, col(base, 0.25 * dark)) }
        // Tentacles.
        for i in 0..<5 {
            let tx: CGFloat = j.x + (CGFloat(i) - 2) * rx * 0.4
            let len: CGFloat = r * (1.5 + CGFloat(i % 2) * 0.4)
            let wob: CGFloat = sin(g.time * 3 + CGFloat(i) + j.ph) * r * 0.3
            var t = Path()
            t.move(to: CGPoint(x: tx, y: y + ry * 0.5))
            t.addCurve(to: CGPoint(x: tx + wob * 0.6, y: y + ry * 0.5 + len),
                       control1: CGPoint(x: tx + wob, y: y + ry * 0.5 + len * 0.4),
                       control2: CGPoint(x: tx - wob, y: y + ry * 0.5 + len * 0.7))
            ctx.stroke(t, with: .color(col(lt, 0.7)), style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
        }
        // The dome.
        var d = Path()
        d.addArc(center: CGPoint(x: j.x, y: y), radius: 1, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false,
                 transform: CGAffineTransform(translationX: j.x, y: y).scaledBy(x: rx, y: ry).translatedBy(x: -j.x, y: -y))
        d.addQuadCurve(to: CGPoint(x: j.x, y: y + ry * 0.45), control: CGPoint(x: j.x + rx * 0.5, y: y + ry * 0.55))
        d.addQuadCurve(to: CGPoint(x: j.x - rx, y: y), control: CGPoint(x: j.x - rx * 0.5, y: y + ry * 0.55))
        d.closeSubpath()
        ctx.fill(d, with: .radialGradient(Gradient(colors: [col(lt), col(base), col(deep)]),
                                          center: CGPoint(x: j.x - rx * 0.35, y: y - ry * 0.5), startRadius: r * 0.1, endRadius: r * 1.3))
        ctx.fill(ellipse(j.x - rx * 0.4, y - ry * 0.5, rx * 0.22, ry * 0.14, rot: -0.6), with: .color(.white.opacity(0.75)))
        // A tiny face.
        ctx.fill(circle(j.x - rx * 0.3, y - ry * 0.1, 2.2), with: .color(col(0x2A1F2B)))
        ctx.fill(circle(j.x + rx * 0.3, y - ry * 0.1, 2.2), with: .color(col(0x2A1F2B)))
        var smile = Path()
        smile.addArc(center: CGPoint(x: j.x, y: y + ry * 0.05), radius: 3.5, startAngle: .degrees(27), endAngle: .degrees(153), clockwise: false)
        ctx.stroke(smile, with: .color(col(0x2A1F2B)), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
    }

    private static func drawBubble(_ g: DeepDiveGame, _ ctx: inout GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat) {
        if y < -20 || y > g.H + 20 { return }
        ctx.fill(circle(x, y, r), with: .radialGradient(
            Gradient(stops: [.init(color: .white.opacity(0.2), location: 0), .init(color: jellyRGBA(220, 246, 255, 0.1), location: 0.75),
                             .init(color: .white.opacity(0.5), location: 1)]),
            center: CGPoint(x: x - r * 0.3, y: y - r * 0.35), startRadius: r * 0.1, endRadius: r * 1.3))
        ctx.stroke(circle(x, y, r), with: .color(.white.opacity(0.5)), lineWidth: max(0.7, r * 0.09))
        ctx.fill(ellipse(x - r * 0.38, y - r * 0.38, r * 0.22, r * 0.12, rot: -0.7), with: .color(.white.opacity(0.9)))
    }

    private static func drawPocket(_ g: DeepDiveGame, _ ctx: inout GraphicsContext, _ p: DDPocket) {
        let y = g.screenY(p.z)
        if y < -80 || y > g.H + 80 { return }
        let k = p.taken, fade = k > 0 ? 1 - k : 1
        var c = ctx
        c.opacity = Double(max(0, fade))
        soft(&c, p.x, y, p.r * 2.2, p.r * 2.2, jellyRGBA(207, 255, 239, 0.3))
        c.stroke(circle(p.x, y, p.r * (1 + k * 0.6)), with: .color(jellyRGBA(207, 255, 239, 0.8)),
                 style: StrokeStyle(lineWidth: 2, dash: [6, 7], dashPhase: -g.time * 30))
        for b in p.bubs {
            let a: CGFloat = b.a + g.time * 0.6
            let d: CGFloat = b.d * p.r * 0.75 * (1 + k)
            let bx: CGFloat = p.x + cos(a) * d
            let bob: CGFloat = sin(g.time * 3 + b.ph) * 2
            let by: CGFloat = y + sin(a) * d * 0.8 + bob
            drawBubble(g, &c, bx, by, b.r)
        }
        c.draw(label(c, "AIR", 11, .heavy, 0xCFFFEF), at: CGPoint(x: p.x, y: y))
    }

    // MARK: the dodo

    private static func pose(_ g: DeepDiveGame) -> DodoPose {
        var p = DodoPose()
        let speed = clamp(g.vz / 3, -1, 1)
        p.scaleX = 1 - speed * 0.08
        p.scaleY = 1 + speed * 0.1
        p.rollDegrees = g.tilt * 180 / .pi
        p.sproutAngle = (-g.tilt * 1.4 - speed * 0.5) * 20
        p.wingAngle = g.held ? 26 : 8
        p.pupilOffset = CGSize(width: clamp(g.vx / 300, -1, 1) * 2.5, height: (g.held ? 0.5 : -0.3) * 2.5)
        p.eyeScaleY = max(0.08, 1 - g.blink)
        switch g.face {
        case .neutral: break
        case .happy: p.mouth = 0.45; p.cheekOpacity = 0.9; p.eyeScaleY = min(p.eyeScaleY, 0.55)
        case .wow: p.pupilScale = 1.3; p.mouth = 0.75
        case .squint: p.squint = 1; p.mouth = 0.35
        case .sweat: p.eyeScaleY = min(p.eyeScaleY, 0.75); p.mouth = 0.15
        case .sleepy: p.eyeScaleY = 0.08
        }
        return p
    }

    private static func drawDodo(_ g: DeepDiveGame, _ ctx: inout GraphicsContext) {
        let y = g.screenY(g.z), s = 0.72 * g.ui
        let flash = g.inv > 0 && Int(g.inv * 12) % 2 == 0
        let bodyY = y - 40 * s, hr = 54 * s
        var c = ctx
        if flash { c.opacity = 0.55 }
        soft(&c, g.x, bodyY, hr * 1.6, hr * 1.6, jellyRGBA(220, 246, 255, 0.16))
        // The helmet's water, with the dodo inside it.
        var inner = c
        inner.clip(to: circle(g.x, bodyY, hr))
        inner.fill(circle(g.x, bodyY, hr), with: .color(jellyRGBA(220, 246, 255, 0.14)))
        drawJellyDodo(&inner, at: CGPoint(x: g.x, y: y), height: 56 * g.ui, pose: pose(g))
        if g.face == .sweat {
            inner.fill(ellipse(g.x + hr * 0.42, bodyY - hr * 0.42, 3.2, 4.6), with: .color(col(0x9FE0F7)))
            inner.fill(ellipse(g.x + hr * 0.40, bodyY - hr * 0.48, 1.1, 1.6), with: .color(.white.opacity(0.8)))
        }
        // The bubble helmet: rim, a cobalt arc, two speculars.
        c.stroke(circle(g.x, bodyY, hr), with: .color(.white.opacity(0.7)), lineWidth: 2.4)
        var arc = Path()
        arc.addArc(center: CGPoint(x: g.x, y: bodyY), radius: hr - 4, startAngle: .degrees(27), endAngle: .degrees(108), clockwise: false)
        c.stroke(arc, with: .color(jellyRGBA(38, 137, 189, 0.35)), style: StrokeStyle(lineWidth: 6, lineCap: .round))
        c.fill(ellipse(g.x - hr * 0.5, bodyY - hr * 0.55, hr * 0.22, hr * 0.1, rot: -0.75), with: .color(.white.opacity(0.85)))
        c.fill(ellipse(g.x + hr * 0.55, bodyY + hr * 0.45, hr * 0.06, hr * 0.14, rot: -0.5), with: .color(.white.opacity(0.5)))
    }

    // MARK: HUD

    private static func drawHUD(_ g: DeepDiveGame, _ ctx: inout GraphicsContext) {
        let W = g.W, H = g.H, s = g.ui, top = g.safeTop + 12
        ctx.fill(Path(CGRect(x: 0, y: 0, width: W, height: top + 100 * s)),
                 with: .linearGradient(Gradient(colors: [jellyRGBA(10, 20, 50, 0.55), jellyRGBA(10, 20, 50, 0)]),
                                       startPoint: .zero, endPoint: CGPoint(x: 0, y: top + 100 * s)))
        var t = ctx
        t.addFilter(.shadow(color: jellyRGBA(5, 20, 50, 0.6), radius: 4, x: 0, y: 2))
        t.draw(label(t, "\(Int(g.z)) m", 40 * s, .heavy), at: CGPoint(x: 18, y: top), anchor: .topLeading)
        let dLabel = g.maxDepth > g.z + 0.5 ? "DEEPEST \(Int(g.maxDepth)) m" : "DEPTH"
        t.draw(label(t, dLabel, 12, .bold, 0xCFFFEF), at: CGPoint(x: 18, y: top + 44 * s), anchor: .topLeading)
        let pearls = label(t, "\(g.pearlCount)", 28 * s, .heavy)
        t.draw(pearls, at: CGPoint(x: W - 18, y: top + 4), anchor: .topTrailing)
        let pw = pearls.measure(in: CGSize(width: 200, height: 60)).width
        drawPearl(g, &ctx, W - 18 - pw - 16, top + 18, 8, big: false)
        t.draw(label(t, "PEARLS", 12, .bold, 0xFFF8C8), at: CGPoint(x: W - 18, y: top + 44 * s), anchor: .topTrailing)
        if g.combo > 1 {
            t.draw(label(t, "×\(g.combo) combo", 12, .bold, 0xFF9FC8), at: CGPoint(x: W - 18, y: top + 60 * s), anchor: .topTrailing)
        }
        // Air meter.
        let ax: CGFloat = 18, ay = top + 70 * s, aw = W - 36, ah: CGFloat = 18
        let low = g.air < 25
        let pulse: CGFloat = low ? 0.6 + 0.4 * sin(g.time * 7) : 1
        ctx.fill(Path(roundedRect: CGRect(x: ax, y: ay, width: aw, height: ah), cornerRadius: 9), with: .color(jellyRGBA(10, 30, 60, 0.45)))
        let fw = max(ah, aw * g.air / 100)
        var m = ctx
        m.opacity = Double(pulse)
        m.fill(Path(roundedRect: CGRect(x: ax, y: ay, width: fw, height: ah), cornerRadius: 9),
               with: .linearGradient(Gradient(colors: low ? [col(0xFF9A96), col(0xFF2B36)] : [col(0xCFFFEF), col(0x91E9CC), col(0x4DC5A2)]),
                                     startPoint: CGPoint(x: 0, y: ay), endPoint: CGPoint(x: 0, y: ay + ah)))
        ctx.fill(Path(roundedRect: CGRect(x: ax + 6, y: ay + 3, width: max(4, fw - 12), height: 5), cornerRadius: 2.5), with: .color(.white.opacity(0.55)))
        ctx.draw(label(ctx, "AIR", 11, .heavy, g.air > 14 ? 0x17131D : 0xFFFFFF),
                 at: CGPoint(x: ax + 10, y: ay + ah / 2 + 0.5), anchor: .leading)
        if g.phase == .dive && g.time - g.startT < 4 {
            var h = t
            h.opacity = Double(clamp(4 - (g.time - g.startT), 0, 1))
            h.draw(label(h, "hold to sink · let go to float", 14), at: CGPoint(x: W / 2, y: H - g.safeBottom - 48), anchor: .top)
        }
        if g.phase == .surfacing {
            t.draw(label(t, "out of air", 26, .heavy, 0xFFF8C8), at: CGPoint(x: W / 2, y: H * 0.3), anchor: .top)
        }
        for f in g.texts {
            var c = t
            c.opacity = Double(1 - f.t * f.t)
            c.draw(label(c, f.s, 20, .heavy, f.col), at: CGPoint(x: f.x, y: g.screenY(f.z) - f.t * 40), anchor: .top)
        }
    }
}
