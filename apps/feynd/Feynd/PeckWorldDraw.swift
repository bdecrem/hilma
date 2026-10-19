import SwiftUI

// Living Island — the native drawing: a port of misc/dodo-redesign/living-island/world/live.js
// (the live animation kinds and the stand-ins for the gate, bridge, stepping stones, ribbon road
// and wood signs) plus the concept's material helpers (jfill, hl, ell, contact, cast). Function
// names follow the JS so the two stay diffable. Everything draws in content coordinates handed in
// by the caller (`PWPlace`), from the manifest's (dx, yb).

// MARK: - Colour

enum PWC {
    static func rgb(_ h: UInt32) -> (Double, Double, Double) { Jelly.rgb(h) }
    /// The concept's `shade`: t ≥ 0 mixes toward white, t < 0 toward #1a0f24.
    static func shade(_ c: UInt32, _ t: Double) -> UInt32 { t >= 0 ? mix(c, 0xFFFFFF, t) : mix(c, 0x1A0F24, -t) }
    static func mix(_ a: UInt32, _ b: UInt32, _ t: Double) -> UInt32 {
        let (ar, ag, ab) = rgb(a)
        let (br, bg, bb) = rgb(b)
        let r: Double = ar + (br - ar) * t
        let gg: Double = ag + (bg - ag) * t
        let bl: Double = ab + (bb - ab) * t
        return Jelly.hex(r, gg, bl)
    }
    static func c(_ h: UInt32, _ a: Double = 1) -> Color { Color(hex: h).opacity(a) }
    /// `Jelly.dusk` as a filter: what the night does to the baked tiles, for what's drawn natively over them.
    static let duskMatrix: ColorMatrix = {
        var m = ColorMatrix()
        m.r1 = 0.40; m.r2 = 0; m.r3 = 0; m.r4 = 0; m.r5 = 10.0 / 255
        m.g1 = 0; m.g2 = 0.56; m.g3 = 0; m.g4 = 0; m.g5 = 10.0 / 255
        m.b1 = 0; m.b2 = 0; m.b3 = 0.68; m.b4 = 0; m.b5 = 24.0 / 255
        m.a1 = 0; m.a2 = 0; m.a3 = 0; m.a4 = 1; m.a5 = 0
        return m
    }()
    static func hex(_ s: String?) -> UInt32 {
        guard var s else { return 0xFFFFFF }
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        return UInt32(s, radix: 16) ?? 0xFFFFFF
    }
}

// MARK: - Shapes

func pwEllipse(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, rot: CGFloat = 0) -> Path {
    jellyEllipse(x, y, max(0.01, rx), max(0.01, ry), rot: rot)
}
func pwCircle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path { pwEllipse(x, y, r, r) }
func pwRRect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> Path {
    Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: min(r, min(w, h) / 2))
}
/// An arc as the canvas draws it: from a0 to a1, increasing angle (clockwise on screen).
func pwArc(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ a0: CGFloat, _ a1: CGFloat, into p: inout Path, move: Bool = false) {
    let n = max(4, Int(abs(a1 - a0) / 0.12))
    for k in 0...n {
        let a = a0 + (a1 - a0) * CGFloat(k) / CGFloat(n)
        let q = CGPoint(x: x + cos(a) * r, y: y + sin(a) * r)
        if k == 0 && (move || p.isEmpty) { p.move(to: q) } else { p.addLine(to: q) }
    }
}
func pwPoly(_ pts: [CGPoint]) -> Path {
    var p = Path()
    guard let f = pts.first else { return p }
    p.move(to: f)
    for q in pts.dropFirst() { p.addLine(to: q) }
    return p
}

extension GraphicsContext {
    /// `ell`: a filled ellipse.
    func ell(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ c: Color, rot: CGFloat = 0) {
        fill(pwEllipse(x, y, rx, ry, rot: rot), with: .color(c))
    }
    /// `hl`: a white highlight.
    func hl(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, rot: CGFloat = -0.5, a: Double = 0.8) {
        fill(pwEllipse(x, y, rx, ry, rot: rot), with: .color(.white.opacity(a)))
    }
    /// `jfill`: jelly gradient (lit top-left, the colour, a shaded rim) plus a soft outline.
    func jfill(_ path: Path, _ c: UInt32, _ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat, line: CGFloat = 1.2) {
        fill(path, with: .radialGradient(Gradient(stops: [
            .init(color: PWC.c(PWC.shade(c, 0.55)), location: 0),
            .init(color: PWC.c(c), location: 0.42),
            .init(color: PWC.c(PWC.shade(c, -0.32)), location: 1),
        ]), center: CGPoint(x: cx - r * 0.4, y: cy - r * 0.5), startRadius: r * 0.05, endRadius: r * 1.75))
        if line > 0 { stroke(path, with: .color(PWC.c(PWC.shade(c, -0.55), 0.45)), lineWidth: line) }
    }
    /// `contact`: a squashed soft shadow where a thing meets the ground.
    func contact(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, a: Double = 0.26) {
        fill(pwEllipse(x, y, rx, ry), with: .radialGradient(Gradient(colors: [jellyRGBA(40, 25, 70, a), jellyRGBA(40, 25, 70, 0)]),
                                                         center: CGPoint(x: x, y: y), startRadius: 0, endRadius: max(rx, ry)))
    }
}

// MARK: - Live kinds (live.js `LIVE.*`)

/// The live layers, split the way they stack: `back` is water life under the road and bridges;
/// `mid` sits over the road and under the stones and critters; `front` floats over everything.
enum PWLiveLayer { case back, mid, front }

enum PWLive {
    /// Things that make their own light: they keep their colours at night instead of taking the dusk.
    static func emissive(_ kind: String) -> Bool {
        ["campfire", "beam", "firefly", "twinkle", "glimmer", "shootingstar", "comet", "lantern", "ufo"].contains(kind)
    }
    static func layer(_ kind: String) -> PWLiveLayer {
        switch kind {
        case "river", "foam", "ripple", "fish", "bubbles": return .back
        case "smoke", "zz", "butterfly", "firefly", "shootingstar", "twinkle", "comet", "lantern", "steam", "glimmer": return .front
        default: return .mid
        }
    }

    /// Rough vertical reach of a kind, for culling (points around its anchor).
    static func reach(_ i: PWItem) -> CGFloat {
        switch i.kind {
        case "beam": return i.n("L", 170) + 20
        case "shootingstar": return i.n("L", 120) + 60
        case "cablecar", "sled", "twinkle": return 2000
        case "comet": return 400
        case "ufo": return 90
        case "river", "foam": return 2000
        case "smoke": return 80
        case "boat", "ferry", "balloon": return 80
        default: return 70
        }
    }

    static func draw(_ g: GraphicsContext, _ i: PWItem, _ pl: PWPlace, _ t: CGFloat, poke: CGFloat) {
        let x = pl.x(i.dx), y = pl.y(i.yb)
        switch i.kind {
        case "river": river(g, i.list("pts").map(pl.pt), t)
        case "foam": foam(g, i.list("pts").map(pl.pt), t)
        case "campfire": campfire(g, x, y, t, poke)
        case "smoke": smoke(g, x, y, t)
        case "zz": zz(g, x, y, t)
        case "windmill": windmill(g, x, y, t, poke)
        case "beam": beam(g, x, y, i.n("a", -.pi / 2), i.n("L", 170), t, poke)
        case "bobber": bobber(g, x, y, pl.pt(i.p("tip") ?? CGPoint(x: i.dx, y: i.yb)), t)
        case "buoy": buoy(g, x, y, PWC.hex(i.s("c")), i.n("ph"), t, poke)
        case "spout": spout(g, x, y, i.n("ph"), i.n("s", 1), t, poke)
        case "jelly": jellyfish(g, x, y, PWC.hex(i.s("c")), i.n("ph"), t)
        case "boat": boat(g, x, y, i.n("ph"), i.n("drift", 6), PWC.hex(i.s("hull") ?? "#FF7FB0"), t, poke)
        case "drops": drops(g, x, y, i.n("dir", -1), t)
        case "butterfly": butterfly(g, x, y, PWC.hex(i.s("c")), i.n("ph"), t)
        case "ripple": ripple(g, x, y, t)
        case "fish": fish(g, x, y, i.n("rx", 46), i.n("ry", 18), Int(i.n("n", 5)), t)
        case "bubbles": bubbles(g, x, y, t)
        case "ferry": ferry(g, x, y, i.n("m", 1), t, poke)
        default: PWLiveExtra.draw(g, i, pl, t, poke: poke)
        }
    }

    static func river(_ g: GraphicsContext, _ pts: [CGPoint], _ t: CGFloat) {
        guard pts.count > 1 else { return }
        let p = pwPoly(pts)
        g.stroke(p, with: .color(jellyRGBA(235, 252, 255, 0.7)), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [7, 23], dashPhase: -t * 18))
        var g2 = g; g2.translateBy(x: 3, y: 3)
        g2.stroke(p, with: .color(jellyRGBA(235, 252, 255, 0.5)), style: StrokeStyle(lineWidth: 1.6, lineCap: .round, dash: [3, 41], dashPhase: -t * 18 + 13))
    }
    static func foam(_ g: GraphicsContext, _ pts: [CGPoint], _ t: CGFloat) {
        let k = 0.5 + 0.5 * sin(t * 0.9)
        let p = pwPoly(pts.map { CGPoint(x: $0.x, y: $0.y - 4 - k * 4 + sin($0.x / 20 + t) * 1.2) })
        g.stroke(p, with: .color(.white.opacity(Double(0.25 + k * 0.35))), lineWidth: 1.4)
    }
    static func campfire(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ t: CGFloat, _ poke: CGFloat) {
        let f = sin(t * 11) * 0.5 + sin(t * 7.3) * 0.5, boost = 1 + poke * 0.6
        g.fill(pwCircle(x, y - 4, 26 * boost), with: .radialGradient(Gradient(colors: [jellyRGBA(255, 200, 90, Double(0.35 + f * 0.06 + poke * 0.2)), jellyRGBA(255, 200, 90, 0)]),
                                                                 center: CGPoint(x: x, y: y - 4), startRadius: 1, endRadius: 26 * boost))
        for (s, c, ph) in [(1.0, 0xFF6A3D, 0.0), (0.72, 0xFFB23A, 1.3), (0.42, 0xFFF0A0, 2.1)] as [(CGFloat, UInt32, CGFloat)] {
            let h = (15 + sin(t * 9 + ph) * 2.5) * s * boost, w = 6.5 * s, sw = sin(t * 6 + ph) * 1.6
            var p = Path()
            p.move(to: CGPoint(x: x - w, y: y - 1))
            p.addQuadCurve(to: CGPoint(x: x + sw, y: y - h), control: CGPoint(x: x - w - 1, y: y - h * 0.5))
            p.addQuadCurve(to: CGPoint(x: x + w, y: y - 1), control: CGPoint(x: x + w + 1, y: y - h * 0.5))
            p.closeSubpath()
            g.fill(p, with: .color(PWC.c(c)))
        }
        let sparks = poke > 0 ? 9 : 3
        for k in 0..<sparks {
            let p = (t * (poke > 0 ? 1.4 : 0.7) + CGFloat(k) / CGFloat(sparks)).truncatingRemainder(dividingBy: 1)
            g.ell(x + sin(p * 9 + CGFloat(k)) * (5 + poke * 8), y - 16 - p * 26 * (1 + poke), 1, 1, jellyRGBA(255, 190, 80, Double(1 - p)))
        }
    }
    static func smoke(_ g: GraphicsContext, _ x0: CGFloat, _ y0: CGFloat, _ t: CGFloat) {
        for k in 0..<4 {
            let p = (t * 0.22 + CGFloat(k) / 4).truncatingRemainder(dividingBy: 1)
            let x = x0 + sin(p * 5 + CGFloat(k)) * 4 + p * 16, y = y0 - p * 60, r = 3.5 + p * 7
            g.fill(pwCircle(x, y, r), with: .color(.white.opacity(Double(0.6 * (1 - p)))))
        }
    }
    static func zz(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ t: CGFloat) {
        let p = (t * 0.4).truncatingRemainder(dividingBy: 1)
        let big = g.resolve(Text("z").font(.custom("Fredoka", size: 6 + p * 3).weight(.semibold)).foregroundColor(.white.opacity(Double((1 - p) * 0.95))))
        g.draw(big, at: CGPoint(x: x + p * 6, y: y - p * 14 - 3))
        let smallA = Double(0.8 * abs(sin(t)))
        let small = g.resolve(Text("z").font(.custom("Fredoka", size: 5).weight(.semibold)).foregroundColor(.white.opacity(smallA)))
        g.draw(small, at: CGPoint(x: x + 6, y: y))
    }
    static func windmill(_ g: GraphicsContext, _ hx: CGFloat, _ hy: CGFloat, _ t: CGFloat, _ poke: CGFloat) {
        // a tap spins the sails up and lets them settle (poke decays 1 → 0)
        let a0 = t * 0.6 + poke * poke * 9
        var c = g
        c.translateBy(x: hx, y: hy)
        for k in 0..<4 {
            var s = c
            s.rotate(by: .radians(Double(a0 + CGFloat(k) * .pi / 2)))
            s.fill(pwRRect(3, -1, 42, 13, 3), with: .color(jellyRGBA(40, 30, 60, 0.12)))
            s.fill(pwRRect(0, -1.6, 44, 3.2, 1.6), with: .color(PWC.c(0xC98A52)))
            s.fill(pwRRect(9, -2, 35, 12, 3), with: .color(PWC.c(k % 2 == 1 ? 0xFFF4EA : 0xFFD6E6)))
            var lines = Path()
            for q in stride(from: CGFloat(16), to: 44, by: 7) { lines.move(to: CGPoint(x: q, y: -2)); lines.addLine(to: CGPoint(x: q, y: 10)) }
            lines.move(to: CGPoint(x: 9, y: 4)); lines.addLine(to: CGPoint(x: 44, y: 4))
            s.stroke(lines, with: .color(jellyRGBA(200, 110, 140, 0.55)), lineWidth: 0.8)
        }
        c.jfill(pwCircle(0, 0, 5), 0xFFD43A, 0, 0, 5, line: 1)
        c.hl(-1.6, -1.6, 1.6, 0.9)
    }
    static func beam(_ g: GraphicsContext, _ lx: CGFloat, _ ly: CGFloat, _ a0: CGFloat, _ L: CGFloat, _ t: CGFloat, _ poke: CGFloat) {
        let a = a0 + sin(t * 0.35) * 0.9
        var p = Path(); p.move(to: CGPoint(x: lx, y: ly)); pwArc(lx, ly, L, a - 0.13, a + 0.13, into: &p); p.closeSubpath()
        var c = g; c.blendMode = .plusLighter
        c.fill(p, with: .radialGradient(Gradient(colors: [jellyRGBA(255, 245, 190, Double(0.35 + poke * 0.4)), jellyRGBA(255, 245, 190, 0)]),
                                        center: CGPoint(x: lx, y: ly), startRadius: 2, endRadius: L))
        let r = 4 + sin(t * 2) * 0.6 + poke * 4
        g.ell(lx, ly, r, r, jellyRGBA(255, 250, 200, 0.9))
    }
    static func bobber(_ g: GraphicsContext, _ bx: CGFloat, _ by0: CGFloat, _ tip: CGPoint, _ t: CGFloat) {
        let by = by0 + sin(t * 2.2) * 1.2 + (sin(t * 0.7) > 0.93 ? 2 : 0)
        var line = Path(); line.move(to: tip); line.addQuadCurve(to: CGPoint(x: bx, y: by - 2), control: CGPoint(x: bx - 4, y: (tip.y + by) / 2 + 6))
        g.stroke(line, with: .color(.white.opacity(0.75)), lineWidth: 0.7)
        let r = (t * 0.6).truncatingRemainder(dividingBy: 1)
        g.stroke(pwEllipse(bx, by + 1, 3 + r * 8, 1.4 + r * 3), with: .color(.white.opacity(Double(0.6 * (1 - r)))), lineWidth: 1)
        var top = Path(); pwArc(bx, by - 1, 2.4, .pi, 2 * .pi, into: &top); top.closeSubpath()
        var bot = Path(); pwArc(bx, by - 1, 2.4, 0, .pi, into: &bot); bot.closeSubpath()
        g.fill(top, with: .color(PWC.c(0xFF4F86)))
        g.fill(bot, with: .color(.white))
    }
    static func buoy(_ g: GraphicsContext, _ bx: CGFloat, _ by: CGFloat, _ col: UInt32, _ ph: CGFloat, _ t: CGFloat, _ poke: CGFloat) {
        let yy = by + sin(t * 1.6 + ph) * 1.4 - poke * 4 * sin(poke * .pi), rot = sin(t * 1.3 + ph) * 0.12 + poke * 0.3 * sin(t * 12)
        g.ell(bx + 3, by + 4, 9, 3.4, jellyRGBA(20, 80, 130, 0.25))
        g.stroke(pwEllipse(bx, by + 2, 9, 3.4), with: .color(.white.opacity(0.7)), lineWidth: 1.1)
        var c = g; c.translateBy(x: bx, y: yy); c.rotate(by: .radians(Double(rot)))
        var p = Path()
        p.move(to: CGPoint(x: -6, y: 1))
        p.addQuadCurve(to: CGPoint(x: 0, y: -13), control: CGPoint(x: -6, y: -12))
        p.addQuadCurve(to: CGPoint(x: 6, y: 1), control: CGPoint(x: 6, y: -12))
        p.addQuadCurve(to: CGPoint(x: -6, y: 1), control: CGPoint(x: 0, y: 4))
        c.jfill(p, col, -2, -8, 8, line: 0.9)
        c.fill(Path(CGRect(x: -5.6, y: -6, width: 11.2, height: 2.6)), with: .color(.white.opacity(0.9)))
        c.hl(-2.6, -9.5, 1.6, 0.8)
    }
    static func spout(_ g: GraphicsContext, _ sx: CGFloat, _ sy: CGFloat, _ ph: CGFloat, _ s: CGFloat, _ t: CGFloat, _ poke: CGFloat) {
        var cyc = ((t + ph).truncatingRemainder(dividingBy: 6)) / 6
        if poke > 0 { cyc = (1 - poke) * 0.45 }
        guard cyc < 0.45 else { return }
        let p = cyc / 0.45, h = sin(p * .pi) * 26 * s * (poke > 0 ? 1.4 : 1)
        var jet = Path()
        jet.move(to: CGPoint(x: sx - 2, y: sy))
        jet.addQuadCurve(to: CGPoint(x: sx, y: sy - h), control: CGPoint(x: sx - 1, y: sy - h * 0.6))
        jet.addQuadCurve(to: CGPoint(x: sx + 2, y: sy), control: CGPoint(x: sx + 1, y: sy - h * 0.6))
        g.fill(jet, with: .color(jellyRGBA(225, 248, 255, 0.9)))
        for k in 0..<7 {
            let a = -CGFloat.pi / 2 + CGFloat(k - 3) * 0.42, r = h * 0.35 * min(1, p * 2)
            g.ell(sx + cos(a) * r, sy - h + sin(a) * r * 0.6 + r * 0.6, 2.2, 2.2, jellyRGBA(225, 248, 255, Double(0.85 * (1 - p * 0.6))))
        }
    }
    static func jellyfish(_ g: GraphicsContext, _ x0: CGFloat, _ y0: CGFloat, _ c: UInt32, _ ph: CGFloat, _ t: CGFloat) {
        let pu = sin(t * 1.8 + ph), x = x0 + sin(t * 0.3 + ph) * 4, y = y0 + pu * 2.5
        g.ell(x + 3, y + 10, 8, 2.4, jellyRGBA(10, 60, 110, 0.25))
        var tent = Path()
        for k in -2...2 {
            let fk = CGFloat(k)
            tent.move(to: CGPoint(x: x + fk * 2.4, y: y))
            tent.addQuadCurve(to: CGPoint(x: x + fk * 2.2, y: y + 11 + pu), control: CGPoint(x: x + fk * 2.6 + sin(t * 2.4 + fk + ph) * 2.2, y: y + 6))
        }
        g.stroke(tent, with: .color(PWC.c(c, 0.8)), style: StrokeStyle(lineWidth: 1.2, lineCap: .round))
        var bell = Path()
        pwArc(x, y, 1, .pi, 2 * .pi, into: &bell)
        bell = bell.applying(CGAffineTransform(translationX: -x, y: -y).concatenating(CGAffineTransform(scaleX: 8 - pu * 0.8, y: 6 + pu * 0.6)).concatenating(CGAffineTransform(translationX: x, y: y)))
        bell.addQuadCurve(to: CGPoint(x: x - 8 + pu * 0.8, y: y), control: CGPoint(x: x, y: y + 2.4))
        var c2 = g; c2.opacity = 0.9
        c2.jfill(bell, c, x - 2, y - 3, 8, line: 0)
        g.hl(x - 3, y - 3.4, 2.4, 1.1, rot: -0.4, a: 0.85)
        g.ell(x - 2.4, y - 1, 0.9, 0.9, PWC.c(0x2A1F2B)); g.ell(x + 2.4, y - 1, 0.9, 0.9, PWC.c(0x2A1F2B))
    }
    static func boat(_ g: GraphicsContext, _ x0: CGFloat, _ y: CGFloat, _ ph: CGFloat, _ drift: CGFloat, _ hull: UInt32, _ t: CGFloat, _ poke: CGFloat) {
        let x = x0 + sin(t * 0.25 + ph) * drift
        let bob = sin(t * 1.3) * 1.6 - poke * 3 * sin(poke * .pi), rot = sin(t * 1.1) * 0.05 + poke * 0.18 * sin(t * 9)
        g.ell(x + 5, y + 6, 26, 6, jellyRGBA(20, 80, 130, 0.3))
        var wake = Path(); pwArc(x, y + 3, 1, 0.1, .pi - 0.1, into: &wake)
        wake = wake.applying(CGAffineTransform(translationX: -x, y: -(y + 3)).concatenating(CGAffineTransform(scaleX: 27, y: 6)).concatenating(CGAffineTransform(translationX: x, y: y + 3)))
        wake.move(to: CGPoint(x: x - 34, y: y + 4)); wake.addQuadCurve(to: CGPoint(x: x - 50, y: y + 5), control: CGPoint(x: x - 42, y: y + 2))
        g.stroke(wake, with: .color(.white.opacity(0.7)), lineWidth: 1.2)
        var c = g; c.translateBy(x: x, y: y + bob); c.rotate(by: .radians(Double(rot)))
        var h = Path()
        h.move(to: CGPoint(x: -24, y: -6)); h.addLine(to: CGPoint(x: 24, y: -6))
        h.addQuadCurve(to: CGPoint(x: 10, y: 6), control: CGPoint(x: 22, y: 5)); h.addLine(to: CGPoint(x: -12, y: 6))
        h.addQuadCurve(to: CGPoint(x: -24, y: -6), control: CGPoint(x: -22, y: 5)); h.closeSubpath()
        c.jfill(h, hull, -8, -4, 22, line: 1.2)
        c.fill(Path(CGRect(x: -21, y: -4, width: 42, height: 2)), with: .color(.white.opacity(0.9)))
        c.fill(Path(CGRect(x: -1.2, y: -50, width: 2.4, height: 45)), with: .color(PWC.c(0xC98A52)))
        var sail = Path(); sail.move(to: CGPoint(x: 2, y: -48)); sail.addQuadCurve(to: CGPoint(x: 22, y: -9), control: CGPoint(x: 20, y: -30)); sail.addLine(to: CGPoint(x: 2, y: -9)); sail.closeSubpath()
        c.fill(sail, with: .linearGradient(Gradient(colors: [.white, PWC.c(0xF1E3F0)]), startPoint: CGPoint(x: 2, y: -48), endPoint: CGPoint(x: 22, y: -9)))
        c.stroke(sail, with: .color(jellyRGBA(160, 110, 150, 0.4)), lineWidth: 0.8)
        var stripe = Path(); stripe.move(to: CGPoint(x: 2, y: -30)); stripe.addQuadCurve(to: CGPoint(x: 17, y: -18), control: CGPoint(x: 13, y: -26)); stripe.addLine(to: CGPoint(x: 2, y: -18)); stripe.closeSubpath()
        c.fill(stripe, with: .color(PWC.c(0x5EC6EC)))
        var jib = Path(); jib.move(to: CGPoint(x: -2, y: -44)); jib.addQuadCurve(to: CGPoint(x: -16, y: -10), control: CGPoint(x: -14, y: -26)); jib.addLine(to: CGPoint(x: -2, y: -10)); jib.closeSubpath()
        c.fill(jib, with: .color(PWC.c(0xFFF6E6)))
        let fw = sin(t * 4) * 1.5
        c.fill(pwPoly([CGPoint(x: 1, y: -50), CGPoint(x: 10, y: -48 + fw), CGPoint(x: 1, y: -45)]), with: .color(PWC.c(0xFFD43A)))
        c.hl(-14, -2, 4, 1.2, rot: 0, a: 0.7)
    }
    static func drops(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ d: CGFloat, _ t: CGFloat) {
        for k in 0..<4 {
            let p = (t * 1.2 + CGFloat(k) / 4).truncatingRemainder(dividingBy: 1)
            g.ell(x + d * p * 4, y + p * 12, 1, 1.5, jellyRGBA(120, 210, 245, Double(1 - p)))
        }
    }
    static func butterfly(_ g: GraphicsContext, _ cx: CGFloat, _ cy: CGFloat, _ col: UInt32, _ ph: CGFloat, _ t: CGFloat) {
        let a = t * 0.5 + ph, x = cx + sin(a) * 26 + sin(a * 2.3) * 8, y = cy + sin(a * 1.7) * 10, fl = abs(sin(t * 12 + ph))
        g.ell(x + 6, y + 18, 3, 1, jellyRGBA(40, 25, 70, 0.12))
        for sd in [-1.0, 1.0] as [CGFloat] { g.ell(x + sd * 2.6 * fl, y - 1, 2.8 * fl + 0.4, 3.4, PWC.c(col), rot: sd * 0.4) }
        g.ell(x, y, 0.8, 2.4, PWC.c(0x4A2E4A))
    }
    static func ripple(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ t: CGFloat) {
        let p = (t * 0.5).truncatingRemainder(dividingBy: 1)
        g.stroke(pwEllipse(x + p * 6, y, 3 + p * 4, 1.5 + p * 1.5), with: .color(.white.opacity(Double(0.5 * (1 - p)))), lineWidth: 1)
    }
    static func fish(_ g: GraphicsContext, _ x0: CGFloat, _ y0: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ n: Int, _ t: CGFloat) {
        let cols: [UInt32] = [0xFFB36B, 0xFFD43A, 0xFF7FB0]
        for k in 0..<n {
            let a = t * 0.5 + CGFloat(k) * 0.55, x = x0 + cos(a) * rx, y = y0 + sin(a) * ry + sin(t * 3 + CGFloat(k)) * 1.2
            let dir: CGFloat = -sin(a) > 0 ? 1 : -1
            var c = g; c.translateBy(x: x, y: y); c.scaleBy(x: dir, y: 1); c.opacity = 0.85
            let col = PWC.c(cols[k % 3])
            c.fill(pwEllipse(0, 0, 4.2, 2.2), with: .color(col))
            c.fill(pwPoly([CGPoint(x: -3.6, y: 0), CGPoint(x: -7, y: -2.4), CGPoint(x: -7, y: 2.4)]), with: .color(col))
            c.fill(pwCircle(2.2, -0.5, 0.6), with: .color(PWC.c(0x2A1F2B)))
        }
    }
    static func bubbles(_ g: GraphicsContext, _ x0: CGFloat, _ y0: CGFloat, _ t: CGFloat) {
        for k in 0..<5 {
            let p = (t * 0.35 + CGFloat(k) / 5).truncatingRemainder(dividingBy: 1)
            let x = x0 + sin(p * 7 + CGFloat(k) * 2) * 4, y = y0 - p * 18, r = 1.2 + p * 2.2
            g.stroke(pwCircle(x, y, r), with: .color(.white.opacity(Double(0.85 * (1 - p)))), lineWidth: 0.9)
        }
    }
    static func ferry(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ m: CGFloat, _ t: CGFloat, _ poke: CGFloat) {
        let bob = sin(t * 1.2) * 1.4 - poke * 3 * sin(poke * .pi), rot = sin(t * 0.9) * 0.04
        g.ell(x + 4, y + 6, 24, 5, jellyRGBA(20, 80, 130, 0.3))
        var wake = Path(); pwArc(x, y + 3, 1, 0.1, .pi - 0.1, into: &wake)
        wake = wake.applying(CGAffineTransform(translationX: -x, y: -(y + 3)).concatenating(CGAffineTransform(scaleX: 25, y: 5)).concatenating(CGAffineTransform(translationX: x, y: y + 3)))
        g.stroke(wake, with: .color(.white.opacity(0.7)), lineWidth: 1.1)
        var c = g; c.translateBy(x: x, y: y + bob); c.rotate(by: .radians(Double(rot))); c.scaleBy(x: m, y: 1)
        var h = Path()
        h.move(to: CGPoint(x: -22, y: -4)); h.addLine(to: CGPoint(x: 22, y: -4))
        h.addQuadCurve(to: CGPoint(x: 10, y: 6), control: CGPoint(x: 20, y: 5)); h.addLine(to: CGPoint(x: -14, y: 6))
        h.addQuadCurve(to: CGPoint(x: -22, y: -4), control: CGPoint(x: -21, y: 4)); h.closeSubpath()
        c.jfill(h, 0x5EC6EC, -8, -2, 20, line: 1.1)
        c.fill(Path(CGRect(x: -19, y: -2.6, width: 38, height: 1.8)), with: .color(.white.opacity(0.9)))
        c.jfill(pwRRect(-12, -18, 22, 14, 3), 0xFFF4EA, -6, -14, 12, line: 0.8)
        for wx in [-8.0, -2.0, 4.0] as [CGFloat] { c.fill(pwRRect(wx, -15, 4, 4, 1.2), with: .color(PWC.c(0x9BE3F5))) }
        var roof = Path(); roof.move(to: CGPoint(x: -14, y: -18)); roof.addQuadCurve(to: CGPoint(x: 12, y: -18), control: CGPoint(x: -1, y: -26)); roof.closeSubpath()
        c.jfill(roof, 0xFF7FB0, -4, -21, 10, line: 0.9)
        c.fill(pwRRect(4, -28, 4, 9, 1.6), with: .color(PWC.c(0xFFD43A)))
        c.hl(-14, 0, 4, 1.1, rot: 0, a: 0.7)
    }
}

// MARK: - Stand-ins: road, stones, gate, bridge, signs (live.js `W.draw*`)

enum PWTrail {
    struct RibbonStyle {
        var edge: UInt32 = 0xEDBF98, base: UInt32 = 0xFFF4E3, dash: UInt32 = 0xFF9FC8
        var grass: Color = jellyRGBA(60, 90, 40, 0.18)
        init() {}
        init(_ d: [String: String]) {
            if let v = d["edge"] { edge = PWC.hex(v) }
            if let v = d["base"] { base = PWC.hex(v) }
            if let v = d["dash"] { dash = PWC.hex(v) }
            if let v = d["grass"] { grass = PWTrail.cssColor(v) }
        }
    }
    /// "rgba(r,g,b,a)" or "#hex"
    static func cssColor(_ s: String) -> Color {
        if s.hasPrefix("rgba") {
            let nums = s.replacingOccurrences(of: "rgba(", with: "").replacingOccurrences(of: ")", with: "")
                .split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            if nums.count == 4 { return jellyRGBA(nums[0], nums[1], nums[2], nums[3]) }
        }
        return PWC.c(PWC.hex(s))
    }

    /// The candy ribbon road (concept `drawRoad`).
    static func ribbon(_ g: GraphicsContext, _ p: Path, _ s: RibbonStyle) {
        let round = StrokeStyle(lineWidth: 34, lineCap: .round, lineJoin: .round)
        var sh = g; sh.translateBy(x: 4, y: 6)
        sh.stroke(p, with: .color(jellyRGBA(50, 40, 80, 0.14)), style: round)
        g.stroke(p, with: .color(s.grass), style: StrokeStyle(lineWidth: 31, lineCap: .round, lineJoin: .round))
        g.stroke(p, with: .color(PWC.c(s.edge)), style: StrokeStyle(lineWidth: 27, lineCap: .round, lineJoin: .round))
        g.stroke(p, with: .color(PWC.c(s.base)), style: StrokeStyle(lineWidth: 22, lineCap: .round, lineJoin: .round))
        var hi = g; hi.translateBy(x: -2.5, y: -2)
        hi.stroke(p, with: .color(.white.opacity(0.75)), style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
        var lo = g; lo.translateBy(x: 2, y: 3)
        lo.stroke(p, with: .color(jellyRGBA(230, 170, 140, 0.25)), style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
        g.stroke(p, with: .color(PWC.c(s.dash)), style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [9, 11]))
    }

    /// Stepping pieces across water (concept `stepPiece`): rock, lily, stone, plank, ring.
    static func stepPiece(_ g: GraphicsContext, _ kind: String, _ x: CGFloat, _ y: CGFloat, _ ang: CGFloat, _ R: inout PWRng) {
        var c = g; c.translateBy(x: x, y: y)
        if PWLiveExtra2.isPiece(kind) { _ = PWLiveExtra2.stepPiece(c, kind, ang, &R); return }
        c.stroke(pwEllipse(0, 2.5, 13, 7), with: .color(.white.opacity(0.65)), lineWidth: 1.1)
        c.ell(3, 5, 11, 5.6, jellyRGBA(15, 80, 120, 0.3))
        switch kind {
        case "rock":
            let n = 7
            let rs = (0..<n).map { _ in 0.8 + R.next() * 0.3 }
            func pth(_ dy: CGFloat) -> Path {
                var p = Path()
                for k in 0...n {
                    let a = CGFloat(k) / CGFloat(n) * 2 * .pi, r = rs[k % n]
                    let q = CGPoint(x: cos(a) * r * 11, y: sin(a) * r * 6.2 + dy)
                    if k == 0 { p.move(to: q) } else { p.addLine(to: q) }
                }
                p.closeSubpath(); return p
            }
            c.fill(pth(1.8), with: .color(PWC.c(0x9C8FB4)))
            c.jfill(pth(0), 0xD7CDE6, -2, -1, 11, line: 0.8)
            c.stroke(pwPoly([CGPoint(x: -3, y: -2), CGPoint(x: 1, y: 1), CGPoint(x: 5, y: 0)]), with: .color(jellyRGBA(120, 100, 150, 0.35)), lineWidth: 0.8)
            c.hl(-4, -2.4, 3, 1.1, rot: -0.2, a: 0.8)
        case "lily":
            var l = c; l.scaleBy(x: 1, y: 0.62); l.rotate(by: .radians(Double(ang * 2 + 1)))
            var pad = Path(); pad.move(to: .zero); pwArc(0, 0, 11, 0.3, 2 * .pi - 0.3, into: &pad); pad.closeSubpath()
            l.jfill(pad, 0x5CC77E, -3, -2, 11, line: 0.9)
            var veins = Path()
            for k in 0..<5 { let a = 0.9 + CGFloat(k) * 1.1; veins.move(to: .zero); veins.addLine(to: CGPoint(x: cos(a) * 9, y: sin(a) * 9)) }
            l.stroke(veins, with: .color(jellyRGBA(30, 110, 60, 0.35)), lineWidth: 0.9)
            c.hl(-4, -2, 2.6, 1, rot: -0.2, a: 0.6)
            if R.next() < 0.6 {
                for k in 0..<6 {
                    var f = c; f.translateBy(x: 3, y: -2); f.rotate(by: .radians(Double(k) / 6 * 2 * .pi))
                    f.ell(0, -2.4, 1.4, 2.6, PWC.c(k % 2 == 1 ? 0xFFC2DD : 0xFF8FBC))
                }
                c.ell(3, -2, 1.1, 1.1, PWC.c(0xFFE36A))
            }
        case "ring":
            var r = c; r.scaleBy(x: 1, y: 0.55)
            var donut = Path(); donut.addEllipse(in: CGRect(x: -11, y: -11, width: 22, height: 22)); donut.addEllipse(in: CGRect(x: -5, y: -5, width: 10, height: 10))
            r.fill(donut, with: .color(PWC.c(0xFFF4EA)), style: FillStyle(eoFill: true))
            var stripes = r; stripes.clip(to: donut, style: FillStyle(eoFill: true))
            for k in 0..<6 {
                var w = Path(); w.move(to: .zero); pwArc(0, 0, 12, CGFloat(k) / 6 * 2 * .pi + 0.2, CGFloat(k) / 6 * 2 * .pi + 0.65, into: &w); w.closeSubpath()
                stripes.fill(w, with: .color(PWC.c(0xFF4F86)))
            }
            r.fill(pwCircle(0, 0, 5), with: .color(jellyRGBA(60, 170, 220, 0.9)))
            r.stroke(pwCircle(0, 0, 11), with: .color(jellyRGBA(150, 40, 80, 0.35)), lineWidth: 1)
            c.hl(-5, -3.4, 3, 1, rot: -0.2, a: 0.85)
        case "plank":
            var p = c; p.rotate(by: .radians(Double(ang + .pi / 2 + (R.next() - 0.5) * 0.3)))
            p.fill(pwRRect(-11, -3, 22, 8, 2), with: .color(PWC.c(0xA86C45)))
            p.fill(pwRRect(-11, -4.5, 22, 8, 2), with: .color(PWC.c(0xE6AC78)))
            p.stroke(pwPoly([CGPoint(x: -10, y: -0.5), CGPoint(x: 10, y: -0.5)]), with: .color(jellyRGBA(150, 90, 50, 0.5)), lineWidth: 0.7)
            p.ell(-8, -2.5, 0.8, 0.8, PWC.c(0x7A4A2A)); p.ell(8, -2.5, 0.8, 0.8, PWC.c(0x7A4A2A))
            p.fill(Path(CGRect(x: -9, y: -4, width: 18, height: 0.9)), with: .color(.white.opacity(0.4)))
        default:
            if PWLiveExtra.stepPiece(c, kind, ang, &R) { break }
            c.fill(pwEllipse(0, 1.5, 9.5, 5.6), with: .color(PWC.c(0xE2B98F)))
            c.jfill(pwEllipse(0, 0, 9.5, 5.4), 0xFFF0DE, 0, 0, 9, line: 0.8)
            c.ell(0, 0, 4, 2.2, PWC.c(0xFFB3D1))
            c.hl(-3.5, -2, 2.4, 1, rot: -0.2, a: 0.85)
        }
    }
    static let stoneSeq = ["rock", "lily", "stone", "rock", "plank", "lily", "ring", "rock", "stone", "lily", "rock", "plank", "lily", "stone", "ring", "rock", "lily"]

    /// The candy-cane gate across the road at a chapter boundary (concept `gate`).
    static func gate(_ g: GraphicsContext, _ gx: CGFloat, _ gy: CGFloat, text: String, board: UInt32, ink: UInt32, lift: CGFloat) {
        let half: CGFloat = 25, ph: CGFloat = 46 + lift
        let posts = [CGPoint(x: gx - half, y: gy), CGPoint(x: gx + half, y: gy + 4)]
        let a = posts[0], b = posts[1], mx = (a.x + b.x) / 2, my = min(a.y, b.y) - ph - 16
        for p in posts { pwCast(g, p.x, p.y, pwRRect(-3.5, -ph, 7, ph, 3), a: 0.16) }
        var shadow = Path(); shadow.move(to: CGPoint(x: a.x + 14, y: a.y + 4)); shadow.addQuadCurve(to: CGPoint(x: b.x + 16, y: b.y + 6), control: CGPoint(x: mx + 24, y: a.y + 12))
        g.stroke(shadow, with: .color(jellyRGBA(48, 30, 80, 0.12)), style: StrokeStyle(lineWidth: 7, lineCap: .round))
        for p in posts {
            g.contact(p.x, p.y + 1, 8, 3, a: 0.35)
            let body = pwRRect(p.x - 3.8, p.y - ph, 7.6, ph, 3.8)
            g.fill(body, with: .color(PWC.c(0xFFF4EA)))
            var s = g; s.clip(to: body)
            var k = -ph - 4
            while k < 4 {
                s.fill(pwPoly([CGPoint(x: p.x - 4, y: p.y + k), CGPoint(x: p.x + 4, y: p.y + k - 5), CGPoint(x: p.x + 4, y: p.y + k - 1.5), CGPoint(x: p.x - 4, y: p.y + k + 3.5)]), with: .color(PWC.c(0xFF4F86)))
                k += 8
            }
            s.fill(Path(CGRect(x: p.x + 1, y: p.y - ph, width: 3, height: ph)), with: .color(jellyRGBA(80, 20, 50, 0.15)))
        }
        var arch = Path(); arch.move(to: CGPoint(x: a.x, y: a.y - ph + 2)); arch.addQuadCurve(to: CGPoint(x: b.x, y: b.y - ph + 2), control: CGPoint(x: mx, y: my - 8))
        g.stroke(arch, with: .color(PWC.c(0xFFF4EA)), style: StrokeStyle(lineWidth: 8, lineCap: .round))
        g.stroke(arch, with: .color(PWC.c(0xFF4F86)), style: StrokeStyle(lineWidth: 8, lineCap: .butt, dash: [4, 5]))
        var gloss = Path(); gloss.move(to: CGPoint(x: a.x - 1, y: a.y - ph)); gloss.addQuadCurve(to: CGPoint(x: b.x - 1, y: b.y - ph), control: CGPoint(x: mx, y: my - 11))
        g.stroke(gloss, with: .color(.white.opacity(0.7)), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
        for p in posts { g.jfill(pwCircle(p.x, p.y - ph - 1, 5.4), 0xFFD43A, p.x, p.y - ph - 1, 5.4, line: 1); g.hl(p.x - 2, p.y - ph - 3, 1.8, 1, rot: -0.5, a: 0.9) }
        let label = g.resolve(Text(text).font(.custom("Fredoka", size: 7.6).weight(.semibold)).foregroundColor(PWC.c(ink)))
        let w = label.measure(in: CGSize(width: 400, height: 40)).width + 12, py = my + 4
        g.fill(pwRRect(mx - w / 2 + 2, py - 5, w, 13, 5), with: .color(jellyRGBA(40, 30, 60, 0.22)))
        g.fill(pwRRect(mx - w / 2 - 1.5, py - 8, w + 3, 15, 6), with: .color(PWC.c(board)))
        g.fill(pwRRect(mx - w / 2, py - 6.5, w, 12, 5), with: .color(.white))
        g.draw(label, at: CGPoint(x: mx, y: py - 0.5))
    }

    /// Plank bridge with candy rails across the road (concept `drawBridge`).
    static func bridge(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ ang: CGFloat) {
        let half: CGFloat = 24
        var c = g; c.translateBy(x: x, y: y); c.rotate(by: .radians(Double(ang)))
        c.fill(pwRRect(-half + 3, -8, half * 2, 30, 4), with: .color(jellyRGBA(20, 60, 90, 0.28)))
        var k = -half
        while k < half {
            c.fill(pwRRect(k, -15, 4.6, 30, 1.4), with: .color(PWC.c(Int(k.rounded()) % 2 != 0 ? 0xD99A66 : 0xE6AC78)))
            c.fill(Path(CGRect(x: k + 0.6, y: -14, width: 1, height: 28)), with: .color(.white.opacity(0.35)))
            k += 5.2
        }
        for sd in [-1.0, 1.0] as [CGFloat] {
            c.fill(pwRRect(-half, sd * 16 + 1, half * 2 + 4, 4, 2), with: .color(jellyRGBA(40, 30, 60, 0.22)))
            let rail = pwRRect(-half - 2, sd * 16 - 2, half * 2 + 4, 4, 2)
            c.fill(rail, with: .color(PWC.c(0xFFF4EA)))
            var s = c; s.clip(to: rail)
            var q = -half - 4
            while q < half + 4 {
                s.fill(pwPoly([CGPoint(x: q, y: sd * 16 - 2), CGPoint(x: q + 3, y: sd * 16 - 2), CGPoint(x: q + 1, y: sd * 16 + 2), CGPoint(x: q - 2, y: sd * 16 + 2)]), with: .color(PWC.c(0xFF6F9F)))
                q += 6
            }
            for kx in [-half - 2, 0, half + 2] { c.jfill(pwCircle(kx, sd * 16, 3.4), 0xFF9FC8, kx, sd * 16, 3.4, line: 0.8) }
        }
    }

    /// The concept's `woodSign`, with an optional second line (the rest stop's "3 of 10 cleared here").
    static func woodSign(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ text: String, sub: String? = nil,
                         board: UInt32 = 0xB07A50, plate: UInt32 = 0xFBE9CC, ink: UInt32 = 0x6B3E2A, h: CGFloat = 40) {
        let title = g.resolve(Text(text.uppercased()).font(.custom("Fredoka", size: 9.5).weight(.semibold)).foregroundColor(PWC.c(ink)))
        let subT = sub.map { g.resolve(Text($0).font(.custom("Fredoka", size: 8.5).weight(.medium)).foregroundColor(PWC.c(ink, 0.8))) }
        let tw = title.measure(in: CGSize(width: 400, height: 40)).width
        let sw = subT?.measure(in: CGSize(width: 400, height: 40)).width ?? 0
        let w = max(tw, sw) + 18, hh: CGFloat = sub == nil ? 18 : 29
        let top = -(h + (sub == nil ? 0 : 11))
        var c = g; c.translateBy(x: x, y: y)
        pwCast(c, 0, 0, { var p = Path(); p.addRect(CGRect(x: -2, y: top + 10, width: 4, height: -top - 10)); p.addRect(CGRect(x: -w / 2 - 2, y: top, width: w + 4, height: hh + 4)); return p }(), a: 0.14)
        c.contact(0, 0, 10, 3.5)
        c.fill(Path(CGRect(x: -2.2, y: top + 12, width: 4.4, height: -top - 12)),
               with: .linearGradient(Gradient(colors: [PWC.c(0xC08A5C), PWC.c(0x8E5B3A)]), startPoint: CGPoint(x: -2, y: 0), endPoint: CGPoint(x: 2, y: 0)))
        c.fill(pwRRect(-w / 2 - 2.5, top - 0.5, w + 5, hh + 5, 6), with: .color(PWC.c(board)))
        c.fill(pwRRect(-w / 2, top + 2, w, hh, 4.5),
               with: .linearGradient(Gradient(colors: [PWC.c(0xFFFBF2), PWC.c(plate)]), startPoint: CGPoint(x: 0, y: top), endPoint: CGPoint(x: 0, y: top + hh)))
        c.fill(pwRRect(-w / 2 + 3, top + 3.5, w - 6, 2.2, 1.1), with: .color(.white.opacity(0.7)))
        if let subT {
            c.draw(title, at: CGPoint(x: 0, y: top + 11))
            c.draw(subT, at: CGPoint(x: 0, y: top + 22))
        } else {
            c.draw(title, at: CGPoint(x: 0, y: top + 11))
        }
    }
}

/// `cast`: the silhouette sheared down-right three times, a cheap soft shadow.
func pwCast(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ path: Path, a: Double = 0.17, len: CGFloat = 0.5, sq: CGFloat = 0.4) {
    let alpha = a * 0.42
    for (dx, dy) in [(0.0, 0.0), (1.1, 0.6), (-0.9, -0.5)] as [(CGFloat, CGFloat)] {
        let t = CGAffineTransform(a: 1, b: 0, c: -len * 0.9, d: -sq, tx: x + dx, ty: y + dy)
        g.fill(path.applying(t), with: .color(jellyRGBA(48, 30, 80, alpha)))
    }
}

/// mulberry32, as the art page seeds it — stepping stones match the page.
struct PWRng {
    private var a: UInt32
    init(_ seed: UInt32) { a = seed }
    mutating func next() -> CGFloat {
        a = a &+ 0x6D2B79F5
        var t = (a ^ (a >> 15)) &* (1 | a)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        return CGFloat((t ^ (t >> 14))) / 4294967296
    }
}
