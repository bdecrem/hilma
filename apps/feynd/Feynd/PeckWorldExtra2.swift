import SwiftUI

// Living Island — the night chapters' own live kinds and stepping pieces (Starlight Garden,
// ch-stars.js; Candy Cosmos, ch-cosmos.js), same names and maths as the JS.

enum PWLiveExtra2 {
    static func draw(_ g: GraphicsContext, _ i: PWItem, _ pl: PWPlace, _ t: CGFloat, poke: CGFloat) {
        let x = pl.x(i.dx), y = pl.y(i.yb)
        switch i.kind {
        // Starlight Garden (ch-stars.js)
        case "firefly": firefly(g, x, y, i.n("rx", 30), i.n("ry", 20), Int(i.n("n", 5)), i.n("ph"), t)
        case "shootingstar": shootingStar(g, x, y, i.n("a"), i.n("L", 120), i.n("per", 13), i.n("ph"), t)
        case "lantern": lantern(g, x, y, PWC.hex(i.s("c")), i.n("s", 1), i.n("ph"), t)
        case "twinkle": twinkle(g, i.list("pts").map(pl.pt), i.n("r", 4), i.n("ph"), t)
        // Candy Cosmos (ch-cosmos.js)
        case "glimmer": glimmer(g, x, y, i.n("r", 3), i.n("ph"), PWC.hex(i.s("c") ?? "#FFF4E0"), t)
        case "comet": comet(g, x, y, pl.pt(i.p("to") ?? CGPoint(x: i.dx + 100, y: i.yb - 40)), i.n("per", 34), i.n("ph"), t)
        case "dish": dish(g, x, y, i.n("s", 1), i.n("ph"), t, poke)
        case "ufo": ufo(g, x, y, i.n("h", 50), t, poke)
        default: break
        }
    }

    // MARK: Starlight Garden

    static func firefly(_ g: GraphicsContext, _ x0: CGFloat, _ y0: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ n: Int, _ ph: CGFloat, _ t: CGFloat) {
        var c = g; c.blendMode = .plusLighter
        for k in 0..<n {
            let fk = CGFloat(k)
            let a = t * 0.3 + ph + fk * 2.39
            let x = x0 + rx * sin(a + fk * 1.7) * cos(a * 0.37 + fk)
            let y = y0 + ry * sin(a * 1.3 + fk * 2.3) - 3 * sin(t * 0.9 + fk)
            let p = 0.5 + 0.5 * sin(t * 1.5 + fk * 1.9 + ph)
            c.fill(pwCircle(x, y, 8), with: .radialGradient(Gradient(colors: [jellyRGBA(255, 240, 140, Double(0.45 * p)), jellyRGBA(255, 240, 140, 0)]),
                                                         center: CGPoint(x: x, y: y), startRadius: 0, endRadius: 8))
            c.fill(pwCircle(x, y, 1.3), with: .color(jellyRGBA(255, 252, 210, Double(0.35 + 0.65 * p))))
        }
    }

    static func shootingStar(_ g: GraphicsContext, _ x0: CGFloat, _ y0: CGFloat, _ a: CGFloat, _ L: CGFloat, _ per: CGFloat, _ ph: CGFloat, _ t: CGFloat) {
        let u = ((t + ph).truncatingRemainder(dividingBy: max(1, per))) / 2.4
        guard u < 1 else { return }
        let ca = cos(a), sa = sin(a), e2 = 1 - (1 - u) * (1 - u)
        let hx = x0 + ca * L * e2, hy = y0 + sa * L * e2, tl = 46 * sin(.pi * u), al = Double(sin(.pi * u))
        let tail = CGPoint(x: hx - ca * tl, y: hy - sa * tl), head = CGPoint(x: hx, y: hy)
        g.stroke(pwPoly([tail, head]), with: .linearGradient(Gradient(colors: [jellyRGBA(255, 250, 230, 0), jellyRGBA(255, 250, 230, 0.85 * al)]),
                                                            startPoint: tail, endPoint: head), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
        var c = g; c.blendMode = .plusLighter
        c.fill(pwCircle(hx, hy, 6), with: .radialGradient(Gradient(colors: [jellyRGBA(255, 250, 230, 0.8 * al), jellyRGBA(255, 250, 230, 0)]),
                                                       center: head, startRadius: 0, endRadius: 6))
    }

    static func lantern(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ col: UInt32, _ s: CGFloat, _ ph: CGFloat, _ t: CGFloat) {
        var c = g; c.translateBy(x: x, y: y); c.rotate(by: .radians(Double(0.1 * sin(t * 1.1 + ph)))); c.scaleBy(x: s, y: s)
        c.stroke(pwPoly([.zero, CGPoint(x: 0, y: 4)]), with: .color(jellyRGBA(255, 236, 190, 0.8)), lineWidth: 0.7)
        var h = c; h.blendMode = .plusLighter
        h.fill(pwCircle(0, 10, 15), with: .radialGradient(Gradient(colors: [PWC.c(col, 0.45), PWC.c(col, 0)]), center: CGPoint(x: 0, y: 10), startRadius: 0, endRadius: 15))
        c.fill(pwEllipse(0, 10, 5, 6), with: .radialGradient(Gradient(stops: [
            .init(color: PWC.c(0xFFF6D0), location: 0), .init(color: PWC.c(col), location: 0.55), .init(color: PWC.c(PWC.shade(col, -0.3)), location: 1),
        ]), center: CGPoint(x: -1.4, y: 8.6), startRadius: 0.5, endRadius: 7.5))
        c.stroke(pwEllipse(0, 10, 2.2, 6), with: .color(PWC.c(PWC.shade(col, -0.45), 0.5)), lineWidth: 0.6)
        c.fill(Path(CGRect(x: -2.4, y: 3.4, width: 4.8, height: 1.8)), with: .color(PWC.c(0x3B2E80)))
        c.fill(Path(CGRect(x: -2.4, y: 15, width: 4.8, height: 1.6)), with: .color(PWC.c(0x3B2E80)))
    }

    static func twinkle(_ g: GraphicsContext, _ pts: [CGPoint], _ r0: CGFloat, _ ph: CGFloat, _ t: CGFloat) {
        for (k, q) in pts.enumerated() {
            let p = 0.5 + 0.5 * sin(t * 1.1 + CGFloat(k) * 2.1 + ph), r = r0 * (0.55 + 0.45 * p)
            var c = g; c.opacity = Double(0.35 + 0.6 * p)
            var h = c; h.blendMode = .plusLighter
            h.fill(pwCircle(q.x, q.y, r * 1.8), with: .radialGradient(Gradient(colors: [jellyRGBA(255, 246, 210, 0.5), jellyRGBA(255, 246, 210, 0)]),
                                                                   center: q, startRadius: 0, endRadius: r * 1.8))
            var st = Path()
            st.move(to: CGPoint(x: q.x, y: q.y - r))
            st.addQuadCurve(to: CGPoint(x: q.x + r * 0.7, y: q.y), control: q)
            st.addQuadCurve(to: CGPoint(x: q.x, y: q.y + r), control: q)
            st.addQuadCurve(to: CGPoint(x: q.x - r * 0.7, y: q.y), control: q)
            st.addQuadCurve(to: CGPoint(x: q.x, y: q.y - r), control: q)
            c.fill(st, with: .color(PWC.c(0xFFF8E0)))
        }
    }
    /// The cosmos' own stepping pieces (drawn whole, no water ring); the context is at the piece.
    static func stepPiece(_ g: GraphicsContext, _ kind: String, _ ang: CGFloat, _ R: inout PWRng) -> Bool {
        switch kind {
        case "chunk": chunk(g, &R); return true
        case "star": starCandy(g, &R); return true
        default: return false
        }
    }
    static func isPiece(_ kind: String) -> Bool { kind == "chunk" || kind == "star" }
    static func stoneSet(_ road: String) -> [String]? {
        road == "stones_cosmos" ? ["chunk", "star", "chunk", "chunk", "star", "chunk", "star", "chunk", "chunk", "star"] : nil
    }
    static func bridge(_ g: GraphicsContext, _ style: String, _ x: CGFloat, _ y: CGFloat, _ ang: CGFloat) -> Bool { false }
    static func pokeable(_ kind: String) -> Bool { kind == "ufo" || kind == "dish" }
    static func target(_ i: PWItem) -> (CGFloat, CGFloat, CGFloat) {
        switch i.kind {
        case "ufo": return (54, 40, 0)
        case "dish": return (40, 34, -4)
        default: return (44, 44, 0)
        }
    }

    // MARK: Candy Cosmos

    static func glintPath(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: x, y: y - r))
        p.addQuadCurve(to: CGPoint(x: x + r, y: y), control: CGPoint(x: x + r * 0.12, y: y - r * 0.12))
        p.addQuadCurve(to: CGPoint(x: x, y: y + r), control: CGPoint(x: x + r * 0.12, y: y + r * 0.12))
        p.addQuadCurve(to: CGPoint(x: x - r, y: y), control: CGPoint(x: x - r * 0.12, y: y + r * 0.12))
        p.addQuadCurve(to: CGPoint(x: x, y: y - r), control: CGPoint(x: x - r * 0.12, y: y - r * 0.12))
        return p
    }
    static func glimmer(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ r0: CGFloat, _ ph: CGFloat, _ col: UInt32, _ t: CGFloat) {
        let k = 0.5 + 0.5 * sin(t * 1.1 + ph), r = r0 * (1 + 0.6 * k)
        var c = g; c.blendMode = .plusLighter
        c.fill(pwCircle(x, y, r * 2.2), with: .radialGradient(Gradient(colors: [PWC.c(col, Double(0.35 * k)), PWC.c(col, 0)]), center: CGPoint(x: x, y: y), startRadius: 0, endRadius: r * 2.2))
        c.fill(glintPath(x, y, r), with: .color(PWC.c(col, Double(0.3 + 0.6 * k))))
    }
    static func comet(_ g: GraphicsContext, _ x0: CGFloat, _ y0: CGFloat, _ to: CGPoint, _ per: CGFloat, _ ph: CGFloat, _ t: CGFloat) {
        let p = ((t + ph).truncatingRemainder(dividingBy: max(1, per))) / per
        guard p <= 0.6 else { return }
        let q = p / 0.6, a = Double(sin(.pi * q))
        let x = x0 + (to.x - x0) * q, y = y0 + (to.y - y0) * q
        let dl = max(1, hypot(to.x - x0, to.y - y0)), ux = (to.x - x0) / dl, uy = (to.y - y0) / dl, Ln: CGFloat = 46
        var c = g; c.blendMode = .plusLighter
        let head = CGPoint(x: x, y: y)
        c.fill(pwPoly([CGPoint(x: x - uy * 3.2, y: y + ux * 3.2), CGPoint(x: x - ux * Ln, y: y - uy * Ln), CGPoint(x: x + uy * 3.2, y: y - ux * 3.2)]),
               with: .linearGradient(Gradient(colors: [jellyRGBA(255, 214, 240, 0.75 * a), jellyRGBA(255, 214, 240, 0)]), startPoint: head, endPoint: CGPoint(x: x - ux * Ln, y: y - uy * Ln)))
        c.fill(pwPoly([CGPoint(x: x - uy * 1.6, y: y + ux * 1.6), CGPoint(x: x - ux * Ln * 0.6 + uy * 4, y: y - uy * Ln * 0.6 - ux * 4), CGPoint(x: x + uy * 1.6, y: y - ux * 1.6)]),
               with: .linearGradient(Gradient(colors: [jellyRGBA(140, 255, 240, 0.5 * a), jellyRGBA(140, 255, 240, 0)]), startPoint: head, endPoint: CGPoint(x: x - ux * Ln * 0.6, y: y - uy * Ln * 0.6)))
        c.fill(pwCircle(x, y, 9), with: .radialGradient(Gradient(colors: [jellyRGBA(255, 250, 235, 0.8 * a), jellyRGBA(255, 250, 235, 0)]), center: head, startRadius: 0, endRadius: 9))
        c.fill(pwCircle(x, y, 2.2), with: .color(.white.opacity(a)))
    }
    static func dish(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ s: CGFloat, _ ph: CGFloat, _ t: CGFloat, _ poke: CGFloat) {
        let rot = -0.45 + sin(t * 0.3 + ph) * 0.55 + poke * 2.4 * sin(poke * .pi)
        var c = g; c.translateBy(x: x, y: y); c.scaleBy(x: s, y: s)
        c.fill(Path(CGRect(x: -1.6, y: 0, width: 3.2, height: 5)), with: .color(PWC.c(0xB9A6F0)))
        c.rotate(by: .radians(Double(rot)))
        var back = Path(); pwArc(0, 0, 1, 0, .pi, into: &back)
        back = back.applying(CGAffineTransform(scaleX: 14, y: 6).concatenating(CGAffineTransform(translationX: 0, y: 1.5)))
        back.addLine(to: CGPoint(x: -14, y: 1.5)); back.closeSubpath()
        c.fill(back, with: .color(PWC.c(0x9A8CC4)))
        c.jfill(pwEllipse(0, 0, 14, 5.4), 0xF1EBFF, -5, -2, 14, line: 0.9)
        c.fill(pwEllipse(0, 0, 9, 3.2), with: .color(jellyRGBA(160, 140, 210, 0.45)))
        c.stroke(pwPoly([CGPoint(x: -6, y: -1), CGPoint(x: 0, y: -12), CGPoint(x: 6, y: -1)]), with: .color(PWC.c(0xFFF4EA)), lineWidth: 1.1)
        c.jfill(pwCircle(0, -12.5, 2.2), 0xFF6FA8, 0, -12.5, 2.2, line: 0.5)
    }
    static func ufo(_ g: GraphicsContext, _ x: CGFloat, _ y0: CGFloat, _ h: CGFloat, _ t: CGFloat, _ poke: CGFloat) {
        let y = y0 + sin(t * 1.1) * 3 - poke * 10 * sin(poke * .pi), tilt = sin(t * 0.6) * 0.05 + poke * 0.2 * sin(t * 10)
        let ba = Double(0.2 + 0.06 * sin(t * 1.4) + poke * 0.25)
        var b = g; b.blendMode = .plusLighter
        b.fill(pwPoly([CGPoint(x: x - 6, y: y + 4), CGPoint(x: x + 6, y: y + 4), CGPoint(x: x + 18, y: y0 + h), CGPoint(x: x - 18, y: y0 + h)]),
               with: .linearGradient(Gradient(colors: [jellyRGBA(170, 255, 235, ba + 0.1), jellyRGBA(170, 255, 235, ba * 0.4)]),
                                     startPoint: CGPoint(x: x, y: y + 4), endPoint: CGPoint(x: x, y: y0 + h)))
        b.fill(pwEllipse(x, y0 + h, 19, 5.5), with: .color(jellyRGBA(170, 255, 235, ba)))
        var c = g; c.translateBy(x: x, y: y); c.rotate(by: .radians(Double(tilt)))
        var dome = Path(); pwArc(0, 0, 1, .pi, 2 * .pi, into: &dome)
        dome = dome.applying(CGAffineTransform(scaleX: 9.5, y: 9)); dome.closeSubpath()
        c.fill(dome, with: .radialGradient(Gradient(stops: [
            .init(color: .white.opacity(0.95), location: 0), .init(color: jellyRGBA(160, 240, 235, 0.75), location: 0.5), .init(color: jellyRGBA(70, 170, 190, 0.9), location: 1),
        ]), center: CGPoint(x: -3, y: -6), startRadius: 0.5, endRadius: 11))
        c.jfill(pwEllipse(0, 1.5, 21, 6.5), 0xC9B4FF, -6, -1, 20, line: 1)
        c.fill(pwEllipse(0, 0.5, 21, 3), with: .color(PWC.c(0xFF8FC0)))
        for k in 0..<5 {
            let a = 0.55 + 0.45 * sin(t * 1.6 - CGFloat(k) * 1.2)
            c.fill(pwCircle(-14 + CGFloat(k) * 7, 0.8, 1.5), with: .color(jellyRGBA(255, 236, 140, Double(a))))
        }
        c.hl(-10, -2, 5, 1.2, rot: -0.1, a: 0.7)
        c.hl(-3.5, -6, 2.2, 1.1, rot: -0.6, a: 0.9)
    }
    static func chunk(_ c: GraphicsContext, _ R: inout PWRng) {
        let n = 7
        let rs = (0..<n).map { _ in 0.82 + R.next() * 0.3 }
        c.stroke(pwEllipse(0, 3, 13, 6.5), with: .color(jellyRGBA(255, 200, 240, 0.38)), lineWidth: 1.1)
        func pth(_ dy: CGFloat) -> Path {
            var p = Path()
            for k in 0...n {
                let a = CGFloat(k) / CGFloat(n) * 2 * .pi
                let q = CGPoint(x: cos(a) * rs[k % n] * 10.5, y: sin(a) * rs[k % n] * 6.4 + dy)
                if k == 0 { p.move(to: q) } else { p.addLine(to: q) }
            }
            p.closeSubpath(); return p
        }
        c.fill(pth(3), with: .color(PWC.c(0x4A3890)))
        c.jfill(pth(0), 0x9E86E0, -2, -1, 11, line: 0.8)
        c.jfill(pwEllipse(-1, -1.4, 6.4, 3.2), 0xFFB8D6, -2.5, -2.5, 6, line: 0)
        c.ell(4.5, 1.6, 1.6, 0.9, jellyRGBA(40, 20, 90, 0.45))
        c.hl(-3.5, -2.6, 2.4, 0.9, rot: -0.2, a: 0.85)
    }
    static func starCandy(_ c: GraphicsContext, _ R: inout PWRng) {
        let rot = (R.next() - 0.5) * 0.8
        func path(_ dy: CGFloat) -> Path {
            var p = Path()
            for k in 0..<10 {
                let a = rot - .pi / 2 + CGFloat(k) * .pi / 5, r: CGFloat = k % 2 == 1 ? 4.6 : 10.5
                let q = CGPoint(x: cos(a) * r, y: sin(a) * r * 0.62 + dy)
                if k == 0 { p.move(to: q) } else { p.addLine(to: q) }
            }
            p.closeSubpath(); return p
        }
        c.stroke(pwEllipse(0, 3, 13, 6.5), with: .color(jellyRGBA(255, 230, 160, 0.35)), lineWidth: 1.1)
        c.fill(path(2.4), with: .color(PWC.c(0xD9901A)))
        c.jfill(path(0), 0xFFD43A, -2, -1.5, 10, line: 0.8)
        c.hl(-2.5, -2, 2.6, 1, rot: -0.2, a: 0.85)
    }
}
