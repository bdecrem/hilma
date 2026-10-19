import SwiftUI

// Living Island — live kinds, stepping pieces and bridges that belong to one chapter, ported from
// that chapter's ch-*.js in misc/dodo-redesign/living-island/world/ (same names, same maths).
// PWLive and PWTrail fall through to here for any kind they don't know.

enum PWLiveExtra {
    static func draw(_ g: GraphicsContext, _ i: PWItem, _ pl: PWPlace, _ t: CGFloat, poke: CGFloat) {
        let x = pl.x(i.dx), y = pl.y(i.yb)
        switch i.kind {
        // Sprinkle Peaks (ch-peaks.js)
        case "cablecar": cablecar(g, i.list("pts").map(pl.pt), i.n("ph"), PWC.hex(i.s("c") ?? "#FF7FB0"), t)
        case "sled": sled(g, i.list("pts").map(pl.pt), i.n("ph"), t)
        case "steam": steam(g, x, y, t)
        case "pennant": pennant(g, x, y, i.dx, PWC.hex(i.s("c")), t)
        // Marshmallow Clouds (ch-clouds.js)
        case "balloon": balloon(g, i, pl, t, poke)
        case "kite": kite(g, x, y, i.n("L", 60), i.n("a"), PWC.hex(i.s("c1")), PWC.hex(i.s("c2")), i.n("ph"), t)
        case "vane": vane(g, x, y, i.p("chime").map(pl.pt), t)
        case "birds": birds(g, x, y, Int(i.n("n", 3)), i.n("rx", 30), i.n("ry", 10), i.n("ph"), t)
        default: PWLiveExtra2.draw(g, i, pl, t, poke: poke)
        }
    }
    static func stepPiece(_ g: GraphicsContext, _ kind: String, _ ang: CGFloat, _ R: inout PWRng) -> Bool {
        PWLiveExtra2.stepPiece(g, kind, ang, &R)
    }
    static func stoneSet(_ road: String) -> [String]? { PWLiveExtra2.stoneSet(road) }
    static func bridge(_ g: GraphicsContext, _ style: String, _ x: CGFloat, _ y: CGFloat, _ ang: CGFloat) -> Bool {
        if style == "rainbow" { rainbowBridge(g, x, y, ang); return true }
        return PWLiveExtra2.bridge(g, style, x, y, ang)
    }
    static func pokeable(_ kind: String) -> Bool {
        ["balloon", "cablecar", "kite"].contains(kind) || PWLiveExtra2.pokeable(kind)
    }
    static func target(_ i: PWItem) -> (CGFloat, CGFloat, CGFloat) {
        switch i.kind {
        case "balloon": return (50, 70, -36 * i.n("sz", 1))
        case "kite": return (40, 40, 0)
        default: return PWLiveExtra2.target(i)
        }
    }

    // MARK: Sprinkle Peaks

    /// Where along a polyline a fraction u of its length falls, and the segment's angle.
    static func along(_ pts: [CGPoint], _ u: CGFloat) -> (CGPoint, CGFloat) {
        guard pts.count > 1 else { return (pts.first ?? .zero, 0) }
        var d: [CGFloat] = [0]
        for k in 1..<pts.count { d.append(d[k - 1] + hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y)) }
        let want = u * (d.last ?? 0)
        var i = 1
        while i < pts.count - 1 && d[i] < want { i += 1 }
        let a = pts[i - 1], b = pts[i], f = (want - d[i - 1]) / max(0.0001, d[i] - d[i - 1])
        return (CGPoint(x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f), atan2(b.y - a.y, b.x - a.x))
    }

    static func cablecar(_ g: GraphicsContext, _ pts: [CGPoint], _ ph: CGFloat, _ col: UInt32, _ t: CGFloat) {
        let cyc = (t / 40 + ph).truncatingRemainder(dividingBy: 1)
        let tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2, u = tri * tri * (3 - 2 * tri)
        let (p, _) = along(pts, u)
        let sw = sin(t * 1.4 + ph * 9) * 0.05
        g.ell(p.x + 22, p.y + 52, 10, 3.4, jellyRGBA(48, 30, 80, 0.12))
        var c = g; c.translateBy(x: p.x, y: p.y); c.rotate(by: .radians(Double(sw)))
        c.stroke(pwPoly([.zero, CGPoint(x: 0, y: 6)]), with: .color(PWC.c(0x4A3478)), lineWidth: 1.2)
        c.fill(pwCircle(0, 0, 1.8), with: .color(PWC.c(0x4A3478)))
        c.jfill(pwRRect(-9, 6, 18, 15, 4), col, -3, 10, 12, line: 1)
        c.fill(pwRRect(-6.5, 9, 13, 6, 1.6), with: .color(PWC.c(0xDDF6FF)))
        c.stroke(pwPoly([CGPoint(x: 0, y: 9), CGPoint(x: 0, y: 15)]), with: .color(.white.opacity(0.9)), lineWidth: 0.8)
        c.fill(pwRRect(-10, 4.6, 20, 3, 1.4), with: .color(.white))
        c.hl(-5, 17.5, 2.4, 0.9, rot: 0, a: 0.7)
    }

    static func sled(_ g: GraphicsContext, _ pts: [CGPoint], _ ph: CGFloat, _ t: CGFloat) {
        let cyc = (t / 9 + ph).truncatingRemainder(dividingBy: 1), T = cyc * 9
        guard T <= 5 else { return }
        let alpha = T < 0.4 ? T / 0.4 : T > 4.4 ? max(0, (5 - T) / 0.6) : 1
        let s: CGFloat
        if T < 0.4 { s = 0 }
        else if T < 3.6 { s = pow((T - 0.4) / 3.2, 1.6) * 0.96 }
        else { let q = 1 - min(1, (T - 3.6) / 0.8); s = 0.96 + (1 - q * q) * 0.04 }
        let (p, ang) = along(pts, s)
        var c = g; c.opacity = Double(alpha)
        let sp: CGFloat = T > 0.4 && T < 4 ? min(1, (T - 0.4) / 1.5) : 0
        for k in 1...3 {
            let fk = CGFloat(k)
            c.ell(p.x - cos(ang) * (8 + fk * 6), p.y - sin(ang) * (8 + fk * 6) - fk, 2 + fk * 1.2, 1.4 + fk * 0.6, .white.opacity(Double(0.7 * sp * (1 - fk / 4))))
        }
        c.ell(p.x + 3, p.y + 5, 11, 3, jellyRGBA(48, 30, 80, 0.16))
        var s2 = c; s2.translateBy(x: p.x, y: p.y)
        var r = s2; r.rotate(by: .radians(Double(ang)))
        var runners = Path()
        for o in [-3.4, 3.4] as [CGFloat] {
            runners.move(to: CGPoint(x: -9, y: o)); runners.addLine(to: CGPoint(x: 7, y: o))
            runners.addQuadCurve(to: CGPoint(x: 10, y: o - 3), control: CGPoint(x: 11, y: o))
        }
        r.stroke(runners, with: .color(PWC.c(0x8A5CE0)), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
        r.jfill(pwRRect(-8, -4.6, 15, 9.2, 2.6), 0xFF4F86, -3, -2, 9, line: 0.8)
        r.fill(Path(CGRect(x: -6, y: -3.6, width: 11, height: 1.2)), with: .color(.white.opacity(0.75)))
        // the rider: a little mint jelly in a scarf
        s2.jfill(pwEllipse(0, -6, 5.4, 5), 0x91E9CC, -1.6, -8, 6, line: 0)
        s2.fill(pwRRect(-5, -3.4, 10, 2.2, 1), with: .color(PWC.c(0xFFD43A)))
        s2.ell(-1.8, -7, 0.7, 0.7, PWC.c(0x2A1F2B)); s2.ell(1.8, -7, 0.7, 0.7, PWC.c(0x2A1F2B))
        s2.hl(-2.2, -9.2, 1.6, 0.8, rot: -0.4, a: 0.85)
    }

    static func steam(_ g: GraphicsContext, _ x0: CGFloat, _ y0: CGFloat, _ t: CGFloat) {
        for k in 0..<3 {
            let p = (t / 3 + CGFloat(k) / 3).truncatingRemainder(dividingBy: 1)
            let x = x0 + sin(p * 6 + CGFloat(k) * 2) * 3, y = y0 - p * 22
            var w = Path(); w.move(to: CGPoint(x: x - 2, y: y + 4)); w.addQuadCurve(to: CGPoint(x: x - 1, y: y - 4), control: CGPoint(x: x + 3, y: y))
            g.stroke(w, with: .color(.white.opacity(Double(0.75 * sin(p * .pi)))), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
        }
    }

    static func pennant(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ dx: CGFloat, _ col: UInt32, _ t: CGFloat) {
        let w = sin(t * 2.2 + dx) * 1.6
        g.stroke(pwPoly([CGPoint(x: x, y: y + 10), CGPoint(x: x, y: y - 2)]), with: .color(PWC.c(0x8E5B3A)), lineWidth: 1.2)
        var f = Path(); f.move(to: CGPoint(x: x, y: y - 2))
        f.addQuadCurve(to: CGPoint(x: x + 11, y: y + 1 + w), control: CGPoint(x: x + 6, y: y - 1 + w))
        f.addQuadCurve(to: CGPoint(x: x, y: y + 4), control: CGPoint(x: x + 6, y: y + 2 + w * 0.5))
        f.closeSubpath()
        g.fill(f, with: .color(PWC.c(col)))
    }

    // MARK: Marshmallow Clouds

    static func balloon(_ g: GraphicsContext, _ i: PWItem, _ pl: PWPlace, _ t: CGFloat, _ poke: CGFloat) {
        let s = i.n("sz", 1), ph = i.n("ph")
        let rise = i.n("rise", 6) * (1 + poke * 2)
        let x = pl.x(i.dx) + sin(t * 0.27 + ph) * 2.5
        let y = pl.y(i.yb) - rise * (0.5 + 0.5 * sin(t * 0.4 + ph)) - poke * 10 * sin(poke * .pi)
        if let anc = i.p("anchor") {
            let a = pl.pt(anc)
            var rope = Path(); rope.move(to: CGPoint(x: x, y: y)); rope.addQuadCurve(to: a, control: CGPoint(x: (x + a.x) / 2 + 3, y: (y + a.y) / 2 + 4))
            g.stroke(rope, with: .color(jellyRGBA(150, 100, 70, 0.8)), lineWidth: 0.8)
            let lift = y - a.y
            g.ell(a.x + 10 * s, a.y + 4, 12 * s, 3.2 * s, jellyRGBA(110, 80, 160, Double(0.1 + 0.05 * max(0, min(1, -lift / 40)))))
        }
        var c = g; c.translateBy(x: x, y: y); c.scaleBy(x: s, y: s)
        c.fill(pwRRect(-5, -8, 10, 8, 2), with: .color(PWC.c(0xD99A66)))
        c.fill(Path(CGRect(x: -5, y: -5, width: 10, height: 1.2)), with: .color(PWC.c(0xB9784A)))
        var ropes = Path(); ropes.move(to: CGPoint(x: -4.5, y: -8)); ropes.addLine(to: CGPoint(x: -7, y: -17)); ropes.move(to: CGPoint(x: 4.5, y: -8)); ropes.addLine(to: CGPoint(x: 7, y: -17))
        c.stroke(ropes, with: .color(jellyRGBA(120, 80, 50, 0.8)), lineWidth: 0.7)
        var env = Path()
        env.move(to: CGPoint(x: -7, y: -17))
        env.addCurve(to: CGPoint(x: 0, y: -58), control1: CGPoint(x: -24, y: -26), control2: CGPoint(x: -22, y: -58))
        env.addCurve(to: CGPoint(x: 7, y: -17), control1: CGPoint(x: 22, y: -58), control2: CGPoint(x: 24, y: -26))
        env.closeSubpath()
        c.fill(env, with: .color(PWC.c(PWC.hex(i.s("c2")))))
        var inside = c; inside.clip(to: env)
        for w in [-14.0, 0.0, 14.0] as [CGFloat] { inside.fill(pwEllipse(w * 0.9, -37, 4.2, 22), with: .color(PWC.c(PWC.hex(i.s("c1"))))) }
        inside.fill(Path(CGRect(x: -24, y: -60, width: 48, height: 44)), with: .linearGradient(Gradient(stops: [
            .init(color: .white.opacity(0.25), location: 0), .init(color: .white.opacity(0), location: 0.55), .init(color: jellyRGBA(70, 40, 110, 0.25), location: 1),
        ]), startPoint: CGPoint(x: -20, y: 0), endPoint: CGPoint(x: 22, y: 0)))
        c.stroke(env, with: .color(jellyRGBA(90, 60, 120, 0.35)), lineWidth: 0.9)
        c.fill(pwRRect(-7.5, -19, 15, 3, 1.4), with: .color(PWC.c(0xFFD43A)))
        c.hl(-9, -47, 3.4, 6, rot: 0.35, a: 0.6)
    }

    static func kite(_ g: GraphicsContext, _ hx: CGFloat, _ hy: CGFloat, _ L: CGFloat, _ a0: CGFloat, _ c1: UInt32, _ c2: UInt32, _ ph: CGFloat, _ t: CGFloat) {
        let a = a0 + sin(t * 0.5 + ph) * 0.12
        let kx = hx + cos(a) * L, ky = hy + sin(a) * L + sin(t * 1.1 + ph) * 2
        g.ell(kx + 16, ky + 70, 7, 3, jellyRGBA(110, 80, 160, 0.12))
        var str = Path(); str.move(to: CGPoint(x: hx, y: hy)); str.addQuadCurve(to: CGPoint(x: kx, y: ky + 7), control: CGPoint(x: (hx + kx) / 2 + 10, y: (hy + ky) / 2 + 16))
        g.stroke(str, with: .color(.white.opacity(0.9)), lineWidth: 0.8)
        var tail = Path(); tail.move(to: CGPoint(x: kx, y: ky + 9))
        var bows: [CGPoint] = []
        for k in 1...5 {
            let fk = CGFloat(k)
            let p = CGPoint(x: kx + sin(t * 2 + fk * 0.8 + ph) * 3 * fk * 0.5 + fk * 1.5, y: ky + 9 + fk * 6)
            bows.append(p); tail.addLine(to: p)
        }
        g.stroke(tail, with: .color(jellyRGBA(120, 90, 160, 0.7)), lineWidth: 0.8)
        for (k, p) in bows.enumerated() {
            g.fill(pwPoly([CGPoint(x: p.x - 2.6, y: p.y - 1.4), CGPoint(x: p.x + 2.6, y: p.y + 1.4), CGPoint(x: p.x + 2.6, y: p.y - 1.4), CGPoint(x: p.x - 2.6, y: p.y + 1.4)]),
                   with: .color(PWC.c(k % 2 == 1 ? c2 : c1)))
        }
        var c = g; c.translateBy(x: kx, y: ky); c.rotate(by: .radians(Double(sin(t * 0.8 + ph) * 0.15)))
        c.fill(pwPoly([CGPoint(x: 0, y: -11), CGPoint(x: -8, y: -1), CGPoint(x: 0, y: 9)]), with: .color(PWC.c(c1)))
        c.fill(pwPoly([CGPoint(x: 0, y: -11), CGPoint(x: 8, y: -1), CGPoint(x: 0, y: 9)]), with: .color(PWC.c(c2)))
        var edge = pwPoly([CGPoint(x: 0, y: -11), CGPoint(x: 8, y: -1), CGPoint(x: 0, y: 9), CGPoint(x: -8, y: -1)]); edge.closeSubpath()
        c.stroke(edge, with: .color(jellyRGBA(120, 60, 90, 0.45)), lineWidth: 0.8)
        var spars = Path(); spars.move(to: CGPoint(x: 0, y: -11)); spars.addLine(to: CGPoint(x: 0, y: 9)); spars.move(to: CGPoint(x: -8, y: -1)); spars.addLine(to: CGPoint(x: 8, y: -1))
        c.stroke(spars, with: .color(.white.opacity(0.7)), lineWidth: 0.8)
    }

    static func vane(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ chime: CGPoint?, _ t: CGFloat) {
        let a = t * 0.12 + sin(t * 0.37) * 0.8, c = cos(a), sn = sin(a)
        var v = g; v.translateBy(x: x, y: y)
        v.stroke(pwPoly([CGPoint(x: -12 * c, y: -3 * sn), CGPoint(x: 12 * c, y: 3 * sn)]), with: .color(PWC.c(0x8A6AC8)), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
        v.fill(pwPoly([CGPoint(x: 15 * c, y: 3.8 * sn), CGPoint(x: 9 * c, y: 2.2 * sn - 3), CGPoint(x: 9 * c, y: 2.2 * sn + 3)]), with: .color(PWC.c(0xFFD43A)))
        v.fill(pwPoly([CGPoint(x: -9 * c, y: -2.2 * sn), CGPoint(x: -14 * c, y: -3.5 * sn - 4), CGPoint(x: -14 * c, y: -3.5 * sn + 3)]), with: .color(PWC.c(0xFF7FB0)))
        guard let ch = chime else { return }
        g.fill(pwEllipse(ch.x, ch.y + 3, 6, 1.6), with: .color(PWC.c(0xB994FF)))
        let cols: [UInt32] = [0xBFF3E3, 0xFFD6E8, 0xFFF4B0, 0xCFC2FF]
        for (k, col) in cols.enumerated() {
            let fk = CGFloat(k)
            let px = ch.x - 4.5 + fk * 3, an = sin(t * 1.3 + fk * 0.9) * 0.12, h: CGFloat = 9 + CGFloat(k % 2) * 3
            let top = CGPoint(x: px + sin(an) * 3, y: ch.y + 7)
            g.stroke(pwPoly([CGPoint(x: px, y: ch.y + 4), top]), with: .color(jellyRGBA(150, 110, 80, 0.7)), lineWidth: 0.6)
            g.stroke(pwPoly([top, CGPoint(x: px + sin(an) * h, y: ch.y + 4 + cos(an) * h)]), with: .color(PWC.c(col)), lineWidth: 1.8)
        }
    }

    static func birds(_ g: GraphicsContext, _ x0: CGFloat, _ y0: CGFloat, _ n: Int, _ rx: CGFloat, _ ry: CGFloat, _ ph: CGFloat, _ t: CGFloat) {
        var p = Path()
        for k in 0..<n {
            let fk = CGFloat(k)
            let a = t * 0.18 + ph + fk * 0.9, x = x0 + cos(a) * rx + fk * 5, y = y0 + sin(a) * ry - fk * 3
            let w = 3.2 - fk * 0.4, f = 0.4 + 0.6 * (0.5 + 0.5 * sin(t * 3 + fk * 1.7))
            p.move(to: CGPoint(x: x - w, y: y - w * f))
            p.addQuadCurve(to: CGPoint(x: x, y: y), control: CGPoint(x: x - w * 0.4, y: y - w * 0.6 * f))
            p.addQuadCurve(to: CGPoint(x: x + w, y: y - w * f), control: CGPoint(x: x + w * 0.4, y: y - w * 0.6 * f))
        }
        g.stroke(p, with: .color(jellyRGBA(100, 84, 150, 0.7)), style: StrokeStyle(lineWidth: 1, lineCap: .round))
    }

    static func rainbowBridge(_ g: GraphicsContext, _ x: CGFloat, _ y: CGFloat, _ ang: CGFloat) {
        let half: CGFloat = 40, w: CGFloat = 13
        let bands: [UInt32] = [0xFF7FB0, 0xFFB36B, 0xFFE08A, 0x8EE6A6, 0x7FD2EF, 0xB994FF]
        var c = g; c.translateBy(x: x, y: y); c.rotate(by: .radians(Double(ang)))
        c.fill(pwRRect(-half + 10, -w + 16, half * 2 - 6, w * 2, w), with: .color(jellyRGBA(110, 80, 160, 0.14)))
        let bw = (w * 2) / CGFloat(bands.count)
        for (k, b) in bands.enumerated() { c.fill(Path(CGRect(x: -half, y: -w + CGFloat(k) * bw, width: half * 2, height: bw + 0.3)), with: .color(PWC.c(b))) }
        var deck = c; deck.clip(to: pwRRect(-half, -w, half * 2, w * 2, 3))
        deck.fill(Path(CGRect(x: -half, y: -w, width: half * 2, height: w * 2)), with: .linearGradient(Gradient(stops: [
            .init(color: jellyRGBA(90, 60, 140, 0.18), location: 0), .init(color: .white.opacity(0.12), location: 0.25),
            .init(color: .white.opacity(0.12), location: 0.75), .init(color: jellyRGBA(90, 60, 140, 0.18), location: 1),
        ]), startPoint: CGPoint(x: -half, y: 0), endPoint: CGPoint(x: half, y: 0)))
        deck.fill(Path(CGRect(x: -half, y: -w + 1, width: half * 2, height: 1.4)), with: .color(.white.opacity(0.45)))
        for sd in [-1.0, 1.0] as [CGFloat] {
            c.fill(pwRRect(-half + 1, sd * (w + 2) - 1.6 + 2.5, half * 2, 3.2, 1.6), with: .color(jellyRGBA(90, 60, 140, 0.2)))
            c.fill(pwRRect(-half, sd * (w + 2) - 1.6, half * 2, 3.2, 1.6), with: .color(.white))
            for k in [-half, -half / 2, 0, half / 2, half] { c.jfill(pwCircle(k, sd * (w + 2), 2.6), 0xFFE6F2, k, sd * (w + 2), 2.6, line: 0.7) }
        }
        for e in [-1.0, 1.0] as [CGFloat] {
            for (dx, dy, r) in [(0.0, -12.0, 7.0), (2.0, 0.0, 8.5), (0.0, 12.0, 7.0), (-5.0, -5.0, 5.0), (-5.0, 6.0, 5.0)] as [(CGFloat, CGFloat, CGFloat)] {
                let px = e * (half + 2 - dx), py = dy
                c.jfill(pwCircle(px, py, r), 0xFFFFFF, px, py, r, line: 0)
            }
        }
    }
}
