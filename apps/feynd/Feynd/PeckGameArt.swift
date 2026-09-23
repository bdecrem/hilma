import SwiftUI
import UIKit

// Peck or Perish, the drawing. A 1600s naturalist's engraving printed in
// loud riso inks: black line art and hatching over paper, hot pink, marigold
// and lagoon teal laid on with a multiply blend and knocked a little off
// register. Everything is drawn in logical 400 × 720 units; the caller scales.

enum PGC {
    static let paper = Color(hex: 0xF4EBD8)
    static let ink = Color(hex: 0x1E1A22)
    static let pink = Color(hex: 0xFF3E9D)
    static let mari = Color(hex: 0xF2A52B)
    static let teal = Color(hex: 0x00A3A0)
    static let frame = Color(hex: 0x1E1A22)

    static func of(_ c: PGInkColor) -> Color {
        switch c {
        case .ink: return ink
        case .paper: return paper
        case .pink: return pink
        case .mari: return mari
        case .teal: return teal
        }
    }
}

enum PGFont {
    static func ultra(_ s: CGFloat) -> Font { .custom("Ultra-Regular", fixedSize: s) }
    static func fell(_ s: CGFloat) -> Font { .custom("IM_FELL_English_Italic", fixedSize: s) }
    static func roman(_ s: CGFloat) -> Font { .custom("IM_FELL_English_Roman", fixedSize: s) }
    static func caps(_ s: CGFloat) -> Font { .custom("IM_FELL_English_SC", fixedSize: s) }
}

/// Hatch tiles and paper grain, rendered for the current pixel density so the
/// lines land on whole pixels.
struct PGAssets {
    let hatch: GraphicsContext.Shading
    let xhatch: GraphicsContext.Shading
    let grain: GraphicsContext.Shading

    init(pxPerUnit px: CGFloat) {
        hatch = Self.lines(units: 4.2, px: px, both: false)
        xhatch = Self.lines(units: 4.6, px: px, both: true)
        grain = Self.noise(px: px)
    }

    private static func lines(units: CGFloat, px: CGFloat, both: Bool) -> GraphicsContext.Shading {
        let t = max(2, (units * px).rounded())
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = false
        let img = UIGraphicsImageRenderer(size: CGSize(width: t, height: t), format: f).image { ctx in
            let cg = ctx.cgContext
            cg.setStrokeColor(UIColor(red: 30 / 255, green: 26 / 255, blue: 34 / 255, alpha: 0.85).cgColor)
            cg.setLineWidth(max(1, 0.8 * t / units))
            for o in [-t, 0, t] {
                cg.move(to: CGPoint(x: o, y: t)); cg.addLine(to: CGPoint(x: o + t, y: 0))
                if both { cg.move(to: CGPoint(x: o, y: 0)); cg.addLine(to: CGPoint(x: o + t, y: t)) }
            }
            cg.strokePath()
        }
        return .tiledImage(Image(uiImage: img), origin: .zero, sourceRect: CGRect(x: 0, y: 0, width: 1, height: 1), scale: units / t)
    }

    private static func noise(px: CGFloat) -> GraphicsContext.Shading {
        let n = 192
        var rng = PGRandom(seed: 9)
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        f.opaque = false
        let img = UIGraphicsImageRenderer(size: CGSize(width: n, height: n), format: f).image { ctx in
            let cg = ctx.cgContext
            for y in 0..<n {
                for x in 0..<n where rng.next() < 0.07 {
                    let a = 0.04 + rng.next() * 0.16
                    cg.setFillColor(UIColor(red: 30 / 255, green: 26 / 255, blue: 34 / 255, alpha: a).cgColor)
                    cg.fill(CGRect(x: x, y: y, width: 1, height: 1))
                }
            }
        }
        return .tiledImage(Image(uiImage: img), origin: .zero, sourceRect: CGRect(x: 0, y: 0, width: 1, height: 1), scale: 1 / px)
    }
}

/// mulberry32 — the same seeded scatter as the web prototype.
struct PGRandom {
    var a: UInt32
    init(seed: UInt32) { a = seed }
    mutating func next() -> CGFloat {
        a = a &+ 0x6D2B_79F5
        var t = (a ^ (a >> 15)) &* (1 | a)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        return CGFloat(t ^ (t >> 14)) / 4_294_967_296
    }
}

/// A tiny SVG path reader for the fixed shapes (M L C Q Z, upper and lower case).
func svgPath(_ d: String) -> Path {
    var nums: [CGFloat] = []
    var tokens: [(Character, [CGFloat])] = []
    var cmd: Character? = nil
    var buf = ""
    func flushNum() { if !buf.isEmpty, let v = Double(buf) { nums.append(CGFloat(v)) }; buf = "" }
    for ch in d {
        if "MmLlCcQqZz".contains(ch) {
            flushNum()
            if let c = cmd { tokens.append((c, nums)) }
            cmd = ch; nums = []
        } else if ch == "-" {
            if let last = buf.last, last == "e" { buf.append(ch) } else { flushNum(); buf = "-" }
        } else if ch == " " || ch == "," {
            flushNum()
        } else {
            buf.append(ch)
        }
    }
    flushNum()
    if let c = cmd { tokens.append((c, nums)) }
    var p = Path()
    var cur = CGPoint.zero
    var start = CGPoint.zero
    for (c, n) in tokens {
        let rel = c.isLowercase
        func at(_ i: Int) -> CGPoint {
            let q = CGPoint(x: n[i], y: n[i + 1])
            return rel ? CGPoint(x: cur.x + q.x, y: cur.y + q.y) : q
        }
        switch c.uppercased() {
        case "M":
            var i = 0
            while i + 1 < n.count {
                let q = at(i)
                if i == 0 { p.move(to: q); start = q } else { p.addLine(to: q) }
                cur = q; i += 2
            }
        case "L":
            var i = 0
            while i + 1 < n.count { let q = at(i); p.addLine(to: q); cur = q; i += 2 }
        case "C":
            var i = 0
            while i + 5 < n.count {
                let c1 = at(i), c2 = at(i + 2), e = at(i + 4)
                p.addCurve(to: e, control1: c1, control2: c2); cur = e; i += 6
            }
        case "Q":
            var i = 0
            while i + 3 < n.count {
                let c1 = at(i), e = at(i + 2)
                p.addQuadCurve(to: e, control: c1); cur = e; i += 4
            }
        case "Z":
            p.closeSubpath(); cur = start
        default: break
        }
    }
    return p
}

@inline(__always) func pgE(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat) -> Path {
    Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2))
}
@inline(__always) func pgRR(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> Path {
    Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: r)
}

/// A GraphicsContext plus the print shop's moves.
struct PGInk {
    var c: GraphicsContext
    let a: PGAssets

    func paper(_ p: Path) { c.fill(p, with: .color(PGC.paper)) }
    func tint(_ p: Path, _ col: Color, _ alpha: Double) {
        guard alpha > 0 else { return }
        var k = c
        k.blendMode = .multiply
        k.opacity = k.opacity * alpha
        k.translateBy(x: 1.6, y: -1.2)
        k.fill(p, with: .color(col))
    }
    func ink(_ p: Path, _ w: CGFloat) {
        c.stroke(p, with: .color(PGC.ink), style: StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round))
    }
    func shade(_ p: Path, _ d: CGFloat, _ pat: GraphicsContext.Shading? = nil, _ alpha: Double = 1) {
        var k = c
        k.clip(to: p)
        k.clip(to: p.offsetBy(dx: -d, dy: -d), options: .inverse)
        if alpha < 1 { k.opacity = k.opacity * alpha }
        k.fill(Path(p.boundingRect.insetBy(dx: -3, dy: -3)), with: pat ?? a.hatch)
    }
    func part(_ p: Path, _ col: Color?, _ alpha: Double, _ d: CGFloat, _ w: CGFloat, _ pat: GraphicsContext.Shading? = nil) {
        paper(p)
        if let col { tint(p, col, alpha) }
        if d > 0 { shade(p, d, pat) }
        if w > 0 { ink(p, w) }
    }
    func lines(_ v: [CGFloat], _ w: CGFloat, _ alpha: Double = 1) {
        var p = Path()
        var i = 0
        while i + 3 < v.count {
            p.move(to: CGPoint(x: v[i], y: v[i + 1])); p.addLine(to: CGPoint(x: v[i + 2], y: v[i + 3])); i += 4
        }
        var k = c
        if alpha < 1 { k.opacity = k.opacity * alpha }
        k.stroke(p, with: .color(PGC.ink), style: StrokeStyle(lineWidth: w, lineCap: .round))
    }
    func dot(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ col: Color = PGC.ink) {
        c.fill(pgE(x, y, r, r), with: .color(col))
    }
    func xEye(_ x: CGFloat, _ y: CGFloat, _ s: CGFloat) { lines([x - s, y - s, x + s, y + s, x - s, y + s, x + s, y - s], 1.6) }

    /// Text centered at p; shrinks to maxWidth. `echo` adds a multiply copy offset by (dx, dy).
    func text(_ s: String, _ font: Font, _ col: Color, _ p: CGPoint, tracking: CGFloat = 0, maxWidth: CGFloat? = nil,
              echo: (Color, CGFloat)? = nil, anchor: UnitPoint = .center) {
        var k = c
        let base = Text(s).font(font).tracking(tracking)
        let r = k.resolve(base.foregroundColor(col))
        var scale: CGFloat = 1
        if let mw = maxWidth {
            let w = r.measure(in: CGSize(width: 4000, height: 400)).width
            if w > mw { scale = mw / w }
        }
        k.translateBy(x: p.x, y: p.y)
        if scale < 1 { k.scaleBy(x: scale, y: scale) }
        if let (ec, off) = echo {
            var e = k
            e.blendMode = .multiply
            e.draw(e.resolve(base.foregroundColor(ec)), at: CGPoint(x: off, y: off), anchor: anchor)
        }
        k.draw(r, at: .zero, anchor: anchor)
    }
}

enum PeckGameArt {
    // MARK: fixed shapes
    static let eggPath = svgPath("M0 -24 C12 -24 18 -7 18 4 C18 15 10 21 0 21 C-10 21 -18 15 -18 4 C-18 -7 -12 -24 0 -24 Z")
    static let shellPath = svgPath("M-15 4 C-15 -8 -8 -19 0 -19 C8 -19 15 -8 15 4 L11 0 L7 5 L3 -1 L-1 5 L-5 0 L-9 5 Z")
    static let cracks = [svgPath("M-4 -23 L-1 -15 L-6 -9 L-2 -3"), svgPath("M17 -2 L9 1 L12 7 L5 10 L7 16"), svgPath("M-17 6 L-10 5 L-12 12 L-5 13 L-3 20")]
    static let specks: [(CGFloat, CGFloat, CGFloat)] = {
        var r = PGRandom(seed: 5)
        return (0..<15).map { _ in ((r.next() - 0.5) * 26, (r.next() - 0.5) * 34 - 3, 0.8 + r.next() * 1.9) }
    }()
    struct Twig { let x: CGFloat; let y: CGFloat; let a: CGFloat; let l: CGFloat; let front: Bool; let bend: CGFloat }
    static let twigs: [Twig] = {
        var r = PGRandom(seed: 44)
        return (0..<60).map { _ in
            let a = r.next() * .pi * 2
            let rx = 44 + r.next() * 9, ry = 12 + r.next() * 5
            let ta = a + .pi / 2 + (r.next() - 0.5) * 0.9
            let l = 12 + r.next() * 15
            let bend = (r.next() - 0.5) * 6
            return Twig(x: cos(a) * rx, y: sin(a) * ry, a: ta, l: l, front: sin(a) > 0.05, bend: bend)
        }
    }()
    // The bird: the app mascot's geometry, re-inked.
    static let dFeet = [pgRR(-9, 44, 6, 12, 3), pgRR(-13, 53, 12, 5, 2.5), pgRR(3, 44, 6, 12, 3), pgRR(1, 53, 12, 5, 2.5)]
    static let dBody = pgE(0, 32, 20, 16)
    static let dBelly = pgE(0, 35, 12, 10)
    static let dWingL = pgRR(-30, 24, 14, 11, 5.5)
    static let dWingR = pgRR(16, 24, 14, 11, 5.5)
    static let dStem = svgPath("M-0.9 -26 C-1.1 -28.6 -0.4 -30.3 2.2 -32 C2.8 -30.7 2.2 -28.6 1.3 -26 Z")
    static let dLeafL = svgPath("M0.9 -30.9 C-3.9 -36.5 -11.3 -37.4 -16.1 -34.4 C-13.9 -28.7 -5.7 -27.4 0.9 -30.9 Z")
    static let dLeafR = svgPath("M1.7 -32.2 C3.9 -37.8 10.9 -39.6 16.1 -37.8 C15.2 -32.2 8.3 -29.2 1.7 -32.2 Z")
    static let dHead = pgE(0, 0, 26, 26)
    static let dFace = svgPath("M-20 4 C-20 -7 -15 -13 -6.5 -12 Q0 -7.5 6.5 -12 C15 -13 20 -7 20 4 C20 16 11 24 0 24 C-11 24 -20 16 -20 4 Z")
    static let dCrown = svgPath("M-7 -24.5 q-1.4 -2.6 -0.4 -4.6 M-3.2 -25.6 q-0.6 -2.6 0.6 -4.4 M-10.6 -22.6 q-1.8 -2 -1.4 -4.2")
    static let dBeak = pgE(0, 6.3, 6.8, 5)
    static let dEye = pgE(0, 0, 5.5, 5.5)
    static let ratBody = pgE(0, -10, 17, 10)
    static let ratHead = svgPath("M8 -17 Q22 -18 31 -8 Q22 -2 8 -4 Z")
    static let ratEar = pgE(12, -18, 5, 5.5)
    static let pigBody = pgE(0, -21, 27, 17)
    static let pigHead = pgE(22, -27, 12.5, 12)
    static let pigSnout = pgE(34, -24, 5, 6.5)
    static let pigEar = svgPath("M14 -35 L18 -47 L26 -36 Z")
    static let pigTail = svgPath("M-26 -27 c-6 -3 -8 -9 -3 -10 c5 -1 3 6 -2 4")
    static let macBody = pgE(0, -18, 13, 15)
    static let macHead = pgE(4, -39, 12, 11.5)
    static let macEarL = pgE(-8, -41, 4.2, 4.8)
    static let macEarR = pgE(15.5, -42, 3.8, 4.4)
    static let macFace = svgPath("M5 -48 C11 -49 15 -44 15 -38 C15 -32 11 -29 7 -30 C3 -31 0 -34 1 -39 C1 -44 2 -47 5 -48 Z")
    static let macTail = svgPath("M-10 -12 C-26 -12 -30 -32 -19 -40")
    static let bunBody = pgE(0, -12, 14, 11)
    static let bunHead = pgE(12, -22, 8.5, 8)
    static let bunEarA = pgE(9, -37, 3.6, 10)
    static let bunEarB = pgE(15, -36, 3.4, 9.5)
    static let bunTail = pgE(-14, -13, 5, 5)
    static let heart = svgPath("M0 3 C-6 -2 -6 -8 -2 -8 C0 -8 0 -6 0 -5 C0 -6 0 -8 2 -8 C6 -8 6 -2 0 3 Z")
    static let crate = pgRR(-17, -14, 34, 28, 2)
    static let islet = svgPath("M280 215 Q298 199 318 198 Q336 188 352 196 Q372 203 388 215 Z")

    // MARK: the printed plate (drawn once per size, cached as an image)

    static func drawBackground(_ g: PGInk) {
        let w = PG.size.width, h = PG.size.height
        var r = PGRandom(seed: 1598)
        g.c.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)), with: .color(PGC.paper))
        do {
            var k = g.c
            k.blendMode = .multiply
            k.fill(Path(CGRect(x: 0, y: 0, width: w, height: PG.horizon)),
                   with: .linearGradient(Gradient(colors: [PGC.pink.opacity(0), PGC.pink.opacity(0.3)]),
                                         startPoint: CGPoint(x: 0, y: 30), endPoint: CGPoint(x: 0, y: PG.horizon)))
            var y: CGFloat = 4
            while y < PG.horizon - 1 {
                let alpha = 0.06 + 0.30 * pow(Double(1 - y / PG.horizon), 1.5)
                var p = Path()
                var x: CGFloat = -4
                p.move(to: CGPoint(x: x, y: y))
                while x < w + 4 { x += 10 + r.next() * 16; p.addLine(to: CGPoint(x: x, y: y + (r.next() - 0.5) * 0.6)) }
                k.stroke(p, with: .color(PGC.teal.opacity(alpha)), lineWidth: 0.85)
                y += 3.3
            }
        }
        // Halftone sun, rim and rays.
        let sx: CGFloat = 118, sy: CGFloat = 206, sr: CGFloat = 72
        let sky = Path(CGRect(x: 0, y: 0, width: w, height: PG.horizon))
        do {
            var k = g.c
            k.clip(to: sky)
            k.blendMode = .multiply
            k.translateBy(x: 1.6, y: -1.2)
            var dots = Path()
            var yy = -sr
            while yy <= sr {
                let row = Int((yy / 5.4).rounded())
                var xx = -sr
                while xx <= sr {
                    let px = xx + (row % 2 != 0 ? 2.7 : 0)
                    let d = hypot(px, yy) / sr
                    if d <= 1 {
                        let rad = 2.9 * (1 - d * d * 0.6)
                        dots.addEllipse(in: CGRect(x: sx + px - rad, y: sy + yy - rad, width: rad * 2, height: rad * 2))
                    }
                    xx += 5.4
                }
                yy += 5.4
            }
            k.fill(dots, with: .color(PGC.pink))
        }
        do {
            var k = g.c
            k.clip(to: sky)
            k.stroke(pgE(sx, sy, sr + 3, sr + 3), with: .color(PGC.ink), lineWidth: 1.2)
            var rays = Path()
            for i in 0..<30 {
                let a = Double.pi + Double(i) / 29 * Double.pi
                let l: CGFloat = i % 2 == 1 ? 10 : 18
                rays.move(to: CGPoint(x: sx + CGFloat(cos(a)) * (sr + 9), y: sy + CGFloat(sin(a)) * (sr + 9)))
                rays.addLine(to: CGPoint(x: sx + CGFloat(cos(a)) * (sr + 9 + l), y: sy + CGFloat(sin(a)) * (sr + 9 + l)))
            }
            k.stroke(rays, with: .color(PGC.ink), lineWidth: 0.9)
        }
        // Sea.
        let sea = Path(CGRect(x: 0, y: PG.horizon, width: w, height: PG.shore - PG.horizon + 2))
        g.paper(sea)
        g.tint(sea, PGC.teal, 0.62)
        do {
            var row = 0
            var y = PG.horizon + 5
            while y < PG.shore - 2 {
                let sp = 14 + CGFloat(row) * 4
                var p = Path()
                var x = CGFloat(row % 2) * sp / 2 - 10
                while x < w + 10 {
                    p.move(to: CGPoint(x: x, y: y))
                    p.addQuadCurve(to: CGPoint(x: x + sp * 0.5, y: y), control: CGPoint(x: x + sp * 0.25, y: y - 2.2))
                    x += sp
                }
                var k = g.c
                k.opacity = 0.32 + Double(row) * 0.07
                k.stroke(p, with: .color(PGC.ink), lineWidth: 0.9)
                y += 6; row += 1
            }
        }
        g.part(islet, PGC.teal, 0.3, 4, 1.6)
        g.tint(islet, PGC.mari, 0.35)
        for (x0, ht) in [(CGFloat(322), CGFloat(20)), (CGFloat(340), CGFloat(16))] {
            g.lines([x0, 197, x0 + 3, 197 - ht], 1.6)
            var p = Path()
            for a in [-2.7, -2.2, -1.2, -0.5] {
                let top = CGPoint(x: x0 + 3, y: 197 - ht)
                p.move(to: top)
                p.addQuadCurve(to: CGPoint(x: top.x + CGFloat(cos(a)) * 12, y: top.y + CGFloat(sin(a)) * 8 + 3),
                               control: CGPoint(x: top.x + CGFloat(cos(a)) * 7, y: top.y + CGFloat(sin(a)) * 7 - 3))
            }
            g.c.stroke(p, with: .color(PGC.ink), lineWidth: 1.2)
        }
        g.lines([0, PG.horizon, w, PG.horizon], 1.6)
        // Beach.
        var beach = Path()
        beach.move(to: CGPoint(x: 0, y: PG.shore))
        beach.addLine(to: CGPoint(x: w, y: PG.shore))
        beach.addLine(to: CGPoint(x: w, y: PG.meadow + 4))
        var bx = w
        while bx >= 0 { beach.addLine(to: CGPoint(x: bx, y: PG.meadow + CGFloat(sin(Double(bx) * 0.05)) * 3)); bx -= 10 }
        beach.closeSubpath()
        g.paper(beach)
        g.tint(beach, PGC.mari, 0.55)
        for _ in 0..<260 {
            let x = r.next() * w
            let y = PG.shore + 4 + r.next() * (PG.meadow - PG.shore - 4)
            let rad = 0.55 + r.next() * 0.4
            var k = g.c
            k.opacity = 0.25 + Double(r.next()) * 0.4
            k.fill(pgE(x, y, rad, rad), with: .color(PGC.ink))
        }
        var fx: CGFloat = -4
        while fx < w + 8 { let f = pgE(fx, PG.shore + 1, 8, 3.4); g.paper(f); g.ink(f, 1); fx += 15 }
        // Meadow.
        var mead = Path()
        mead.move(to: CGPoint(x: 0, y: PG.meadow))
        var mx: CGFloat = 0
        while mx <= w { mead.addLine(to: CGPoint(x: mx, y: PG.meadow + CGFloat(sin(Double(mx) * 0.05)) * 3)); mx += 10 }
        mead.addLine(to: CGPoint(x: w, y: h)); mead.addLine(to: CGPoint(x: 0, y: h)); mead.closeSubpath()
        g.paper(mead)
        g.tint(mead, PGC.mari, 0.28)
        g.tint(mead, PGC.teal, 0.16)
        do {
            var contours = Path()
            var y = PG.meadow + 7
            while y < h {
                var x: CGFloat = -10
                while x < w {
                    let len = 20 + r.next() * 70, gap = 4 + r.next() * 16
                    contours.move(to: CGPoint(x: x, y: y + CGFloat(sin(Double(x) * 0.02 + Double(y) * 0.1)) * 1.5))
                    var s = x
                    while s < x + len { contours.addLine(to: CGPoint(x: s, y: y + CGFloat(sin(Double(s) * 0.02 + Double(y) * 0.1)) * 1.5)); s += 8 }
                    x += len + gap
                }
                y += 8.5
            }
            var k = g.c
            k.opacity = 0.15
            k.stroke(contours, with: .color(PGC.ink), lineWidth: 0.7)
        }
        var edge = Path()
        edge.move(to: CGPoint(x: 0, y: PG.meadow))
        mx = 0
        while mx <= w { edge.addLine(to: CGPoint(x: mx, y: PG.meadow + CGFloat(sin(Double(mx) * 0.05)) * 3)); mx += 10 }
        g.ink(edge, 1.2)
        // Tufts and flowers.
        for _ in 0..<90 {
            let x = 10 + r.next() * 380
            let y = PG.meadow + 14 + r.next() * (h - PG.meadow - 26)
            if hypot(x - PG.egg.x, y - PG.egg.y) < 84 || PG.burrows.contains(where: { hypot(x - $0.x, y - $0.y) < 40 }) { continue }
            let n = 3 + Int(r.next() * 3)
            var p = Path()
            for j in 0..<n {
                let off = CGFloat(j) - CGFloat(n - 1) / 2
                let a = -CGFloat.pi / 2 + off * 0.35 + (r.next() - 0.5) * 0.2
                let l = 6 + r.next() * 7
                p.move(to: CGPoint(x: x + off * 1.5, y: y))
                p.addQuadCurve(to: CGPoint(x: x + cos(a) * l, y: y + sin(a) * l), control: CGPoint(x: x + cos(a) * l * 0.5, y: y + sin(a) * l * 0.6))
            }
            var k = g.c
            k.blendMode = .multiply
            k.opacity = 0.55
            k.translateBy(x: 1.6, y: -1.2)
            k.stroke(p, with: .color(PGC.teal), style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
            var k2 = g.c
            k2.opacity = 0.8
            k2.stroke(p, with: .color(PGC.ink), style: StrokeStyle(lineWidth: 1.05, lineCap: .round))
        }
        for _ in 0..<26 {
            let x = 16 + r.next() * 368
            let y = PG.meadow + 20 + r.next() * (h - PG.meadow - 40)
            if hypot(x - PG.egg.x, y - PG.egg.y) < 84 { continue }
            for k in 0..<5 {
                let a = CGFloat(k) / 5 * .pi * 2
                g.tint(pgE(x + cos(a) * 2.6, y + sin(a) * 2.6, 1.9, 1.9), PGC.pink, 0.9)
            }
            g.dot(x, y, 1.1)
        }
        for b in PG.burrows {
            g.part(pgE(b.x, b.y + 4, 27, 10.5), PGC.mari, 0.6, 3, 1.6)
            g.c.fill(pgE(b.x, b.y + 1.5, 17, 6.5), with: .color(PGC.ink))
            for _ in 0..<6 { g.dot(b.x + (r.next() - 0.5) * 54, b.y + 8 + r.next() * 6, 0.9 + r.next() * 0.8) }
        }
        palm(g, base: CGPoint(x: 18, y: 388), crown: PG.crowns[0], ctl: 2, flip: false)
        palm(g, base: CGPoint(x: 382, y: 388), crown: PG.crowns[1], ctl: 398, flip: true)
        do {
            var k = g.c
            k.blendMode = .multiply
            k.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)),
                   with: .radialGradient(Gradient(colors: [Color.white.opacity(0), Color(red: 150 / 255, green: 100 / 255, blue: 60 / 255).opacity(0.28)]),
                                         center: CGPoint(x: w / 2, y: h * 0.5), startRadius: h * 0.3, endRadius: h * 0.78))
        }
        g.c.stroke(Path(CGRect(x: 5, y: 5, width: w - 10, height: h - 10)), with: .color(PGC.ink), lineWidth: 2.4)
        g.c.stroke(Path(CGRect(x: 10.5, y: 10.5, width: w - 21, height: h - 21)), with: .color(PGC.ink), lineWidth: 0.8)
    }

    static func palm(_ g: PGInk, base: CGPoint, crown: CGPoint, ctl: CGFloat, flip: Bool) {
        let n = 14
        var left: [CGPoint] = [], right: [CGPoint] = []
        let my = (base.y + crown.y) / 2
        for i in 0...n {
            let u = CGFloat(i) / CGFloat(n), v = 1 - u
            let x = v * v * base.x + 2 * v * u * ctl + u * u * crown.x
            let y = v * v * base.y + 2 * v * u * my + u * u * crown.y
            let dx = 2 * v * (ctl - base.x) + 2 * u * (crown.x - ctl)
            let dy = 2 * v * (my - base.y) + 2 * u * (crown.y - my)
            let d = hypot(dx, dy)
            let nx = -dy / d, ny = dx / d, wd = 7 - 3 * u
            left.append(CGPoint(x: x + nx * wd, y: y + ny * wd))
            right.append(CGPoint(x: x - nx * wd, y: y - ny * wd))
        }
        var trunk = Path()
        trunk.move(to: left[0])
        for q in left { trunk.addLine(to: q) }
        for q in right.reversed() { trunk.addLine(to: q) }
        trunk.closeSubpath()
        g.part(trunk, PGC.mari, 0.55, 3, 1.8)
        var rings = Path()
        for i in 1..<n {
            rings.move(to: left[i])
            rings.addQuadCurve(to: right[i], control: CGPoint(x: (left[i].x + right[i].x) / 2, y: (left[i].y + right[i].y) / 2 + 2.5))
        }
        g.c.stroke(rings, with: .color(PGC.ink), lineWidth: 1)
        for a0 in [-176.0, -146, -116, -86, -56, -26, 4] {
            let a = (flip ? -180 - a0 : a0) * Double.pi / 180
            let len: CGFloat = 50 - (abs(cos(a)) < 0.4 ? 8 : 0)
            var k = g
            k.c.translateBy(x: crown.x, y: crown.y)
            k.c.rotate(by: .radians(a))
            if cos(a) < 0 { k.c.scaleBy(x: 1, y: -1) }
            var leaf = Path()
            leaf.move(to: .zero)
            leaf.addQuadCurve(to: CGPoint(x: len, y: 9), control: CGPoint(x: len * 0.45, y: -13))
            leaf.addQuadCurve(to: .zero, control: CGPoint(x: len * 0.5, y: 5))
            leaf.closeSubpath()
            k.paper(leaf)
            k.tint(leaf, PGC.mari, 0.6)
            k.tint(leaf, PGC.teal, 0.85)
            var cut = k.c
            cut.clip(to: leaf)
            cut.opacity = 0.55
            var ser = Path()
            var s: CGFloat = 6
            while s < len { ser.move(to: CGPoint(x: s, y: -12)); ser.addLine(to: CGPoint(x: s + 5, y: 6)); s += 4 }
            cut.stroke(ser, with: .color(PGC.ink), lineWidth: 0.8)
            k.ink(leaf, 1.3)
            var rib = Path()
            rib.move(to: .zero)
            rib.addQuadCurve(to: CGPoint(x: len, y: 9), control: CGPoint(x: len * 0.5, y: -5))
            k.ink(rib, 1)
        }
        for (ox, oy) in [(CGFloat(-5), CGFloat(4)), (5, 5), (0, 9)] {
            let c = pgE(crown.x + ox, crown.y + oy, 4.6, 4.6)
            g.paper(c); g.tint(c, PGC.mari, 0.6); g.tint(c, PGC.pink, 0.3); g.shade(c, 2); g.ink(c, 1.3)
        }
    }

    // MARK: nest + egg

    static func twigPath(front: Bool) -> Path {
        var p = Path()
        for w in twigs where w.front == front {
            let dx = cos(w.a) * w.l / 2, dy = sin(w.a) * w.l / 2
            p.move(to: CGPoint(x: w.x - dx, y: w.y - dy))
            p.addQuadCurve(to: CGPoint(x: w.x + dx, y: w.y + dy), control: CGPoint(x: w.x + w.bend, y: w.y + w.bend * 0.3))
        }
        return p.offsetBy(dx: PG.egg.x, dy: PG.egg.y + 16)
    }
    static let backTwigs = twigPath(front: false)
    static let frontTwigs = twigPath(front: true)

    static func drawNestBack(_ g: PGInk) {
        g.part(pgE(PG.egg.x, PG.egg.y + 18, 53, 17), PGC.mari, 0.75, 4, 2, g.a.xhatch)
        g.c.fill(pgE(PG.egg.x, PG.egg.y + 13, 36, 8), with: g.a.hatch)
        g.c.stroke(backTwigs, with: .color(PGC.ink), style: StrokeStyle(lineWidth: 1.7, lineCap: .round))
    }

    static func drawNestFront(_ g: PGInk) {
        g.c.stroke(frontTwigs, with: .color(PGC.ink), style: StrokeStyle(lineWidth: 1.7, lineCap: .round))
        var rim = Path()
        rim.addArc(center: .zero, radius: 1, startAngle: .radians(0.15), endAngle: .radians(Double.pi - 0.15), clockwise: false)
        let t = CGAffineTransform(translationX: PG.egg.x, y: PG.egg.y + 18).scaledBy(x: 53, y: 17)
        g.c.stroke(rim.applying(t), with: .color(PGC.ink), lineWidth: 2)
    }

    static func drawEgg(_ g: PGInk, game: PeckGame) {
        let sx = game.eggShake > 0 ? CGFloat(sin(game.t * 62) * game.eggShake * 6) : 0
        var k = g
        k.c.translateBy(x: PG.egg.x + sx, y: PG.egg.y)
        k.c.rotate(by: .radians(Double(sx) * 0.025))
        k.paper(eggPath)
        var sp = k
        sp.c.clip(to: eggPath)
        for s in specks { sp.tint(pgE(s.0, s.1, s.2, s.2 * 0.8), PGC.teal, 0.85) }
        k.tint(eggPath, PGC.mari, 0.12)
        k.shade(eggPath, 4)
        k.ink(eggPath, 2.1)
        let lv = game.P >= 82 ? 3 : (game.P >= 58 ? 2 : (game.P >= 34 ? 1 : 0))
        for i in 0..<lv { k.ink(cracks[i], 1.5) }
    }

    static func drawShell(_ g: PGInk, _ x: CGFloat, _ y: CGFloat, _ rot: Double) {
        var k = g
        k.c.translateBy(x: x, y: y)
        k.c.rotate(by: .radians(rot))
        k.paper(shellPath)
        var sp = k
        sp.c.clip(to: shellPath)
        for s in specks.prefix(6) { sp.tint(pgE(s.0 * 0.8, s.1 * 0.5 - 4, s.2, s.2 * 0.8), PGC.teal, 0.85) }
        k.shade(shellPath, 3)
        k.ink(shellPath, 1.8)
    }

    // MARK: the bird

    struct DodoPose {
        var roll: Double = 0
        var sx: CGFloat = 1
        var sy: CGFloat = 1
        var blink: Double = 1
        var lookX: CGFloat = 0
        var wing: Double = 0
        var specimen: Double = 0
    }

    static func drawDodo(_ g: PGInk, x: CGFloat, y: CGFloat, scale sc: CGFloat, pose o: DodoPose) {
        let col = 1 - o.specimen
        let pat = col < 0.5 ? g.a.xhatch : g.a.hatch
        var k = g
        k.c.translateBy(x: x, y: y)
        do {
            var s = k.c
            s.scaleBy(x: sc, y: sc)
            s.opacity = 0.7
            s.fill(pgE(0, 1, 24, 4.4), with: g.a.hatch)
        }
        k.c.rotate(by: .radians(o.roll))
        k.c.scaleBy(x: sc * o.sx, y: sc * o.sy)
        k.c.translateBy(x: 0, y: -58)
        for f in dFeet { k.part(f, PGC.mari, 0.95 * col, 0, 1.5) }
        k.part(dBody, PGC.teal, 0.8 * col, 5, 2.1, pat)
        k.paper(dBelly); k.ink(dBelly, 1)
        let wa = o.wing * Double.pi / 180
        do {
            var w = k
            w.c.translateBy(x: -23, y: 29); w.c.rotate(by: .radians(20 * Double.pi / 180 + wa)); w.c.translateBy(x: 23, y: -29)
            w.part(dWingL, PGC.teal, 0.9 * col, 3, 1.8, pat)
        }
        do {
            var w = k
            w.c.translateBy(x: 23, y: 29); w.c.rotate(by: .radians(-20 * Double.pi / 180 - wa)); w.c.translateBy(x: -23, y: -29)
            w.part(dWingR, PGC.teal, 0.9 * col, 3, 1.8, pat)
        }
        for p in [dStem, dLeafL, dLeafR] {
            k.paper(p); k.tint(p, PGC.mari, 0.75 * col); k.tint(p, PGC.teal, 0.8 * col)
            if col < 0.5 { k.shade(p, 2, pat) }
            k.ink(p, 1.3)
        }
        k.part(dHead, PGC.teal, 0.8 * col, 6, 2.1, pat)
        k.ink(dCrown, 1.3)
        k.paper(dFace); k.ink(dFace, 1.5)
        k.tint(pgE(-15.6, 8.4, 5.4, 3.6), PGC.pink, 0.55 * col)
        k.tint(pgE(15.6, 8.4, 5.4, 3.6), PGC.pink, 0.55 * col)
        let angry = col > 0.5
        for s: CGFloat in [-1, 1] {
            var e = k
            if angry {
                var cl = Path()
                cl.move(to: CGPoint(x: s * 22, y: -10.3)); cl.addLine(to: CGPoint(x: s * 1, y: -3.3))
                cl.addLine(to: CGPoint(x: s * 1, y: 12)); cl.addLine(to: CGPoint(x: s * 22, y: 12)); cl.closeSubpath()
                e.c.clip(to: cl)
            }
            e.c.translateBy(x: s * 9.4 + o.lookX, y: -2)
            e.c.scaleBy(x: 1, y: CGFloat(max(0.05, o.blink)))
            if col > 0.5 {
                e.c.fill(dEye, with: .color(PGC.ink))
                e.dot(-s * 1.8, -1.6, 2, PGC.paper)
                e.dot(s * 1.9, 2.3, 0.9, PGC.paper)
            } else {
                e.paper(dEye); e.ink(dEye, 1.2); e.dot(0, 0, 1.7)
            }
        }
        if angry { k.lines([-16.5, -9.6, -3.8, -5, 16.5, -9.6, 3.8, -5], 3.2) }
        k.paper(dBeak); k.tint(dBeak, PGC.mari, 0.95 * col); k.shade(dBeak, 1.8, pat); k.ink(dBeak, 1.5)
        k.dot(-2.6, 5, 1); k.dot(2.6, 5, 1)
    }

    static func drawPlinth(_ g: PGInk, rise: Double, year: Int) {
        guard rise > 0 else { return }
        var k = g
        k.c.translateBy(x: PG.home.x, y: PG.home.y)
        k.c.scaleBy(x: 1, y: CGFloat(rise))
        k.part(pgRR(-62, 0, 124, 42, 2), PGC.mari, 0.55, 4, 2)
        k.lines([-66, 0, 66, 0], 3)
        let label = pgRR(-48, 9, 96, 24, 1.5)
        k.paper(label); k.ink(label, 1)
        k.text("Raphus cucullatus", PGFont.fell(11), PGC.ink, CGPoint(x: 0, y: 16.5))
        k.text("1598 – \(year)", PGFont.caps(10), PGC.ink, CGPoint(x: 0, y: 27))
    }

    // MARK: the invaders

    static func drawRat(_ g: PGInk, _ e: PGEnt, t: Double) {
        let ko = e.mode == .ko
        let run = e.mode == .run || e.mode == .flee
        var k = g
        if e.mode == .emerge, let cy = e.clipY { k.c.clip(to: Path(CGRect(x: 0, y: 0, width: PG.size.width, height: cy))) }
        let u = e.et > 0 ? e.t / e.et : 1
        let rise: CGFloat = e.mode == .emerge && e.clipY != nil ? CGFloat(1 - easeOutBack(u)) * 26 : 0
        let pop: CGFloat = e.mode == .emerge && e.clipY == nil ? CGFloat(max(0.05, easeOutBack(u))) : 1
        let bob: CGFloat = run ? abs(CGFloat(sin(e.t * 18))) * 2 : 0
        k.c.translateBy(x: e.x, y: e.y + rise - bob)
        if ko { k.c.translateBy(x: 0, y: -10); k.c.rotate(by: .radians(e.rot)); k.c.translateBy(x: 0, y: 10) }
        k.c.scaleBy(x: e.dir * pop, y: pop)
        let w = CGFloat(sin(e.t * 14)) * 3
        var tail = Path()
        tail.move(to: CGPoint(x: -15, y: -8))
        tail.addCurve(to: CGPoint(x: -46, y: -6 + w), control1: CGPoint(x: -28, y: -12 + w), control2: CGPoint(x: -32, y: 2 - w))
        k.c.stroke(tail, with: .color(PGC.ink), style: StrokeStyle(lineWidth: 3.6, lineCap: .round))
        do {
            var m = k.c
            m.blendMode = .multiply
            m.translateBy(x: 1.6, y: -1.2)
            m.stroke(tail, with: .color(PGC.pink), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
        }
        let s1: CGFloat = run ? CGFloat(sin(e.t * 26)) * 4 : 0
        k.lines([-9, -4, -9 + s1, 1, 9, -4, 9 - s1, 1], 2.4)
        k.part(ratBody, PGC.teal, 0.24, 5, 2, g.a.xhatch)
        k.part(ratHead, PGC.teal, 0.24, 3, 2, g.a.xhatch)
        k.part(ratEar, PGC.pink, 0.85, 0, 1.6)
        if ko { k.xEye(21, -12, 2.2) } else {
            k.dot(21, -12, 2); k.dot(21.6, -12.6, 0.6, PGC.pink); k.lines([17, -16.2, 24.5, -14], 1.7)
        }
        let nose = pgE(31, -8, 2.3, 2.3)
        k.paper(nose); k.tint(nose, PGC.pink, 1); k.ink(nose, 1)
        k.lines([27, -8, 38, -12, 27, -7, 39, -8, 27, -6, 37, -3], 0.8)
    }

    static func drawPig(_ g: PGInk, _ e: PGEnt, t: Double) {
        let ko = e.mode == .ko
        let run = e.mode == .run || e.mode == .flee
        var k = g
        k.c.translateBy(x: e.x, y: e.y - (run ? abs(CGFloat(sin(e.t * 14))) * 2 : 0))
        if ko { k.c.translateBy(x: 0, y: -20); k.c.rotate(by: .radians(e.rot)); k.c.translateBy(x: 0, y: 20) }
        k.c.scaleBy(x: e.dir * 1.05, y: 1.05)
        let s: CGFloat = run ? CGFloat(sin(e.t * 16)) * 3.5 : 0
        k.lines([-15, -8, -15 + s, 0, 13, -8, 13 - s, 0], 5)
        k.ink(pigTail, 1.8)
        k.part(pigBody, PGC.pink, 0.8, 6, 2.2)
        k.lines([-7, -8, -7 - s, 0, 19, -8, 19 + s, 0], 5)
        k.part(pigEar, PGC.pink, 0.95, 0, 1.6)
        k.part(pigHead, PGC.pink, 0.8, 4, 2.2)
        k.part(pigSnout, PGC.pink, 1, 0, 1.8)
        k.c.fill(pgE(33, -26.5, 1.1, 1.8), with: .color(PGC.ink))
        k.c.fill(pgE(33.5, -21.5, 1.1, 1.8), with: .color(PGC.ink))
        if ko { k.xEye(25, -30, 2.2) } else { k.dot(25, -30, 2.1); k.lines([20.5, -35, 29, -32.5], 2) }
        k.lines([26, -18.5, 30.5, -17.5], 1.4)
        if e.mode == .stun {
            let hx = e.x + e.dir * 18, hy = e.y - 50
            for i in 0..<3 {
                let a = t * 6 + Double(i) * 2.1
                let sx = hx + CGFloat(cos(a)) * 13, sy = hy + CGFloat(sin(a)) * 4
                g.lines([sx - 3, sy, sx + 3, sy, sx, sy - 3, sx, sy + 3], 1.3)
            }
        }
    }

    static func fur(_ g: PGInk, _ p: Path, _ d: CGFloat) {
        g.paper(p); g.tint(p, PGC.mari, 0.9); g.tint(p, PGC.pink, 0.38)
        if d > 0 { g.shade(p, d) }
        g.ink(p, 2)
    }

    static func limb(_ g: PGInk, _ v: [CGFloat]) {
        var p = Path()
        var i = 0
        while i + 3 < v.count { p.move(to: CGPoint(x: v[i], y: v[i + 1])); p.addLine(to: CGPoint(x: v[i + 2], y: v[i + 3])); i += 4 }
        g.c.stroke(p, with: .color(PGC.ink), style: StrokeStyle(lineWidth: 4.4, lineCap: .round))
        var m = g.c
        m.blendMode = .multiply
        m.translateBy(x: 1.6, y: -1.2)
        m.stroke(p, with: .color(PGC.mari), style: StrokeStyle(lineWidth: 2, lineCap: .round))
    }

    static func drawMonkey(_ g: PGInk, _ e: PGEnt, t: Double) {
        let ko = e.mode == .ko
        let air = e.mode == .leap && e.air
        var k = g
        k.c.translateBy(x: e.x, y: e.y)
        if ko { k.c.translateBy(x: 0, y: -24); k.c.rotate(by: .radians(e.rot)); k.c.translateBy(x: 0, y: 24) }
        k.c.scaleBy(x: e.dir, y: 1)
        k.c.stroke(macTail, with: .color(PGC.ink), style: StrokeStyle(lineWidth: 4.2, lineCap: .round))
        do {
            var m = k.c
            m.blendMode = .multiply
            m.translateBy(x: 1.6, y: -1.2)
            m.stroke(macTail, with: .color(PGC.mari), style: StrokeStyle(lineWidth: 2, lineCap: .round))
        }
        limb(k, air ? [-6, -6, -13, -3, 6, -6, 13, -3] : [-6, -6, -8, 0, 6, -6, 8, 0])
        fur(k, macBody, 5)
        limb(k, air ? [-7, -27, -15, -45, 7, -27, 17, -45] : [-8, -25, -12, -8, 8, -25, 13, -8])
        fur(k, macEarL, 0); fur(k, macEarR, 0); fur(k, macHead, 4)
        k.paper(macFace); k.tint(macFace, PGC.pink, 0.45); k.ink(macFace, 1.4)
        if ko { k.xEye(6.5, -40, 1.8); k.xEye(11.8, -40, 1.8) } else {
            k.dot(6.5, -40, 1.8); k.dot(11.8, -40, 1.8)
            k.lines([3.5, -44.5, 8.5, -42.5, 14.5, -44.5, 10, -42.5], 1.7)
        }
        if air || ko { k.c.fill(pgE(10, -33, 2.2, 2.7), with: .color(PGC.ink)) } else { k.lines([7.5, -33.5, 12.5, -33.5], 1.4) }
    }

    static func drawBunny(_ g: PGInk, _ e: PGEnt, t: Double) {
        let by = e.y + e.bob
        var k = g
        k.c.translateBy(x: e.x, y: by)
        k.c.scaleBy(x: e.dir, y: 1)
        k.part(bunTail, nil, 0, 2, 1.6)
        k.part(bunBody, PGC.teal, 0.12, 4, 1.8)
        k.part(bunEarA, PGC.teal, 0.12, 0, 1.6)
        k.part(bunEarB, PGC.teal, 0.12, 0, 1.6)
        k.tint(pgE(9, -37, 1.6, 7), PGC.pink, 0.9)
        k.part(bunHead, PGC.teal, 0.12, 3, 1.8)
        if e.sad { k.lines([13, -25, 17, -23], 1.4); k.dot(16, -19, 1.3, PGC.teal) } else { k.dot(15, -23, 1.6) }
        k.dot(20.2, -21, 1.6, PGC.pink)
        var h = g
        h.c.translateBy(x: e.x, y: by - 60 + CGFloat(sin(t * 4)) * 2)
        h.c.scaleBy(x: 1.35, y: 1.35)
        if e.sad { h.c.translateBy(x: -2.5, y: 0); h.c.rotate(by: .radians(-0.3)) }
        h.part(heart, PGC.pink, 0.95, 0, 1.2)
    }

    static func drawCrate(_ g: PGInk, _ e: PGEnt) {
        let u = min(1, e.t / max(0.01, e.dur))
        do {
            var s = g.c
            s.opacity = 0.3 + 0.6 * u
            let cu = CGFloat(u)
            s.fill(pgE(e.p1.x, e.p1.y + 8, 10 + 14 * cu, 3 + 4 * cu), with: g.a.hatch)
        }
        g.tint(pgE(e.p1.x, e.p1.y + 8, 3, 3), PGC.pink, u)
        var k = g
        k.c.translateBy(x: e.x, y: e.y)
        k.c.rotate(by: .radians(e.rot))
        k.c.scaleBy(x: e.sc, y: e.sc)
        k.part(crate, PGC.mari, 0.8, 4, 2)
        k.lines([-17, -6, 17, -6, -17, 6, 17, 6], 1.2)
        k.text("VOC", PGFont.ultra(10), PGC.ink, CGPoint(x: 0, y: 0.5))
    }

    static func drawShip(_ g: PGInk, _ s: PGShip, t: Double) {
        var k = g
        k.c.translateBy(x: s.x, y: s.y + CGFloat(sin(t * 1.6)) * 1.5)
        k.c.rotate(by: .radians(sin(t * 1.2) * 0.025))
        for (mx, top) in [(CGFloat(-18), CGFloat(-54)), (0, -64), (16, -50)] { k.lines([mx, -10, mx, top], 1.8) }
        let sails: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [(-18, 9, -50, 15), (-18, 8, -32, 15), (0, 11, -60, 17), (0, 10, -40, 19), (16, 8, -46, 13), (16, 7, -30, 13)]
        for (mx, w, y0, h) in sails {
            var p = Path()
            p.move(to: CGPoint(x: mx - w, y: y0))
            p.addQuadCurve(to: CGPoint(x: mx + w, y: y0), control: CGPoint(x: mx, y: y0 - 3))
            p.addLine(to: CGPoint(x: mx + w, y: y0 + h))
            p.addQuadCurve(to: CGPoint(x: mx - w, y: y0 + h), control: CGPoint(x: mx, y: y0 + h + 4))
            p.closeSubpath()
            k.part(p, nil, 0, 2.5, 1.3)
        }
        let fw = CGFloat(sin(t * 5)) * 1.5
        let stripes: [(Int, Color?)] = [(0, PGC.mari), (1, nil), (2, PGC.teal)]
        for (i, col) in stripes {
            let y = -64 + CGFloat(i) * 3
            var f = Path()
            f.move(to: CGPoint(x: 0, y: y)); f.addLine(to: CGPoint(x: 14, y: y + fw))
            f.addLine(to: CGPoint(x: 14, y: y + 3 + fw)); f.addLine(to: CGPoint(x: 0, y: y + 3)); f.closeSubpath()
            k.paper(f)
            if let col { k.tint(f, col, 1) }
        }
        var flag = Path()
        flag.move(to: CGPoint(x: 0, y: -64)); flag.addLine(to: CGPoint(x: 14, y: -64 + fw))
        flag.addLine(to: CGPoint(x: 14, y: -55 + fw)); flag.addLine(to: CGPoint(x: 0, y: -55))
        k.ink(flag, 1.1)
        let hull = svgPath("M-40 -10 L22 -10 L24 -22 L42 -22 L40 -10 L34 2 Q0 7 -32 2 Z")
        k.part(hull, PGC.mari, 0.7, 3, 1.7, g.a.xhatch)
        k.lines([-36, -5, 38, -5], 1.2)
        for i in 0..<4 { k.dot(-24 + CGFloat(i) * 12, -2, 1.4) }
        var fx = s.x - 44
        while fx < s.x + 48 { let f = pgE(fx, s.y + 3, 6, 2.4); g.paper(f); g.ink(f, 0.9); fx += 9 }
    }

    // MARK: effects

    static func drawParticles(_ g: PGInk, _ game: PeckGame) {
        for p in game.parts {
            var k = g
            k.c.opacity = 1 - pow(p.t / p.life, 2)
            switch p.k {
            case .bit:
                let c = pgE(p.x, p.y, p.r, p.r)
                switch p.color {
                case .ink: k.c.fill(c, with: .color(PGC.ink))
                case .paper: k.paper(c); k.ink(c, 1)
                default: k.tint(c, PGC.of(p.color), 1)
                }
            case .dust:
                let r = p.r * CGFloat(1 + p.t / p.life)
                let c = pgE(p.x, p.y, r, r)
                k.paper(c); k.ink(c, 0.9)
            case .smoke:
                let r = p.r * CGFloat(1 + 1.6 * p.t / p.life)
                let c = pgE(p.x, p.y, r, r)
                k.paper(c); k.ink(c, 1)
            case .chip:
                k.c.translateBy(x: p.x, y: p.y)
                k.c.rotate(by: .radians(p.rot))
                k.part(pgRR(-p.w / 2, -p.h / 2, p.w, p.h, 1), PGC.mari, 0.85, 0, 1.2)
            }
        }
    }

    static func drawTrails(_ g: PGInk, _ game: PeckGame) {
        for tr in game.trails {
            var k = g
            k.c.opacity = 1 - tr.t / 0.16
            let dx = tr.b.x - tr.a.x, dy = tr.b.y - tr.a.y
            let d = max(1, hypot(dx, dy))
            let nx = -dy / d, ny = dx / d
            for o: CGFloat in [-8, 0, 8] {
                k.lines([tr.a.x + nx * o, tr.a.y + ny * o, tr.a.x + dx * 0.72 + nx * o, tr.a.y + dy * 0.72 + ny * o], o == 0 ? 1.8 : 1.2)
            }
        }
    }

    static func drawStamp(_ g: PGInk, _ s: PGStamp) {
        let u = s.t / s.life
        let pop = CGFloat(1 + 0.8 * (1 - easeOut(s.t / 0.13)))
        var k = g
        k.c.opacity = u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1
        k.c.translateBy(x: s.x, y: s.y - (s.big ? 0 : CGFloat(18 * easeOut(u))))
        k.c.rotate(by: .radians(s.rot))
        k.c.scaleBy(x: pop, y: pop)
        if s.big {
            let box = pgRR(-176, -30, 352, 74, 3)
            k.paper(box); k.tint(box, PGC.mari, 0.35)
            var m = k.c
            m.blendMode = .multiply
            m.translateBy(x: 3, y: 3)
            m.stroke(box, with: .color(PGC.ink), lineWidth: 3)
            k.ink(box, 2.4)
        }
        // Paper halo so the word reads over anything.
        for (dx, dy) in [(-2.0, 0.0), (2, 0), (0, -2), (0, 2)] {
            k.text(s.text, PGFont.ultra(s.size), PGC.paper, CGPoint(x: dx, y: dy), maxWidth: 330)
        }
        k.text(s.text, PGFont.ultra(s.size), PGC.ink, .zero, maxWidth: 330, echo: (PGC.of(s.color), 3))
        if let sub = s.sub { k.text(sub, PGFont.fell(16), PGC.ink, CGPoint(x: 0, y: 28)) }
    }

    static func drawCaption(_ g: PGInk, _ c: PGCaption) {
        let u = c.t / c.life
        var k = g
        k.c.opacity = c.t < 0.12 ? c.t / 0.12 : (u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1)
        let r = k.c.resolve(Text(c.text).font(PGFont.fell(18)).foregroundColor(PGC.paper))
        let tw = min(284, r.measure(in: CGSize(width: 4000, height: 100)).width)
        let w = tw + 44, cx: CGFloat = 200, cy: CGFloat = 686
        var p = Path()
        p.move(to: CGPoint(x: cx - w / 2, y: cy - 15)); p.addLine(to: CGPoint(x: cx + w / 2, y: cy - 15))
        p.addLine(to: CGPoint(x: cx + w / 2 - 9, y: cy)); p.addLine(to: CGPoint(x: cx + w / 2, y: cy + 15))
        p.addLine(to: CGPoint(x: cx - w / 2, y: cy + 15)); p.addLine(to: CGPoint(x: cx - w / 2 + 9, y: cy)); p.closeSubpath()
        var sh = k
        sh.c.translateBy(x: 3, y: 3)
        sh.tint(p, PGC.pink, 1)
        k.c.fill(p, with: .color(PGC.ink))
        k.text(c.text, PGFont.fell(18), PGC.paper, CGPoint(x: cx, y: cy), maxWidth: 284)
    }

    // MARK: HUD

    static func drawThermometer(_ g: PGInk, _ game: PeckGame) {
        let cx: CGFloat = 362, top: CGFloat = 44, by: CGFloat = 186
        let j = sqrt(15 * 15 - 81.0)
        let flash = game.meterFlash > 0 && Int(game.meterFlash * 14) % 2 == 0
        var k = g
        if game.phase == .play && game.P > 75 { k.c.translateBy(x: rnd(-1, 1) * CGFloat((game.P - 75) / 25) * 1.4, y: 0) }
        k.text("P(extinct)", PGFont.caps(14), PGC.ink, CGPoint(x: cx - 14, y: 28), tracking: 1)
        var glass = Path()
        glass.move(to: CGPoint(x: cx - 9, y: by - j))
        glass.addLine(to: CGPoint(x: cx - 9, y: top + 9))
        glass.addArc(center: CGPoint(x: cx, y: top + 9), radius: 9, startAngle: .radians(Double.pi), endAngle: .radians(0), clockwise: false)
        glass.addLine(to: CGPoint(x: cx + 9, y: by - j))
        glass.addArc(center: CGPoint(x: cx, y: by), radius: 15, startAngle: .radians(atan2(-j, 9)),
                     endAngle: .radians(atan2(-j, -9) + 2 * Double.pi), clockwise: false)
        glass.closeSubpath()
        k.paper(glass)
        let h = CGFloat(clampD(game.P, 0, 100) / 100) * (by - j - top - 8)
        var liq = Path(CGRect(x: cx - 4.5, y: by - j - h, width: 9, height: h + j))
        liq.addPath(pgE(cx, by, 10.5, 10.5))
        k.tint(liq, PGC.pink, 1)
        if flash { k.tint(liq, PGC.ink, 0.35) }
        k.shade(glass, 3, nil, 0.5)
        k.ink(glass, 2)
        for i in 1..<4 {
            let y = by - j - (by - j - top - 8) * CGFloat(i) / 4
            k.lines([cx - 9, y, cx - 15, y], 1.2)
        }
        k.text("\(Int(clampD(game.P, 0, 100).rounded()))%", PGFont.ultra(10), PGC.paper, CGPoint(x: cx, y: by + 0.5))
    }

    static func drawHUD(_ g: PGInk, _ game: PeckGame) {
        let yr = game.year
        g.text("Anno Domini", PGFont.caps(13), PGC.ink, CGPoint(x: 22, y: 30), tracking: 2, anchor: .leading)
        g.text("\(yr)", PGFont.ultra(46), PGC.ink, CGPoint(x: 20, y: 62), echo: (PGC.pink, 3.5), anchor: .leading)
        let diff = yr - PG.historyYear
        if game.phase != .title && diff > 0 {
            let s = "beating history by \(diff)"
            let r = g.c.resolve(Text(s).font(PGFont.fell(15)))
            let w = r.measure(in: CGSize(width: 1000, height: 100)).width
            g.tint(Path(CGRect(x: 20, y: 91, width: w + 4, height: 14)), PGC.pink, 1)
            g.text(s, PGFont.fell(15), PGC.ink, CGPoint(x: 22, y: 97), anchor: .leading)
        } else {
            g.text("the last dodo was seen in 1662", PGFont.fell(15), PGC.ink, CGPoint(x: 22, y: 97), anchor: .leading)
        }
        drawThermometer(g, game)
        // Sound key.
        let m = PG.muteKey
        let b = pgE(m.x, m.y, 13, 13)
        g.paper(b); g.ink(b, 1.6)
        var spk = Path()
        spk.move(to: CGPoint(x: m.x - 8, y: m.y - 4)); spk.addLine(to: CGPoint(x: m.x - 4, y: m.y - 4))
        spk.addLine(to: CGPoint(x: m.x + 1, y: m.y - 9)); spk.addLine(to: CGPoint(x: m.x + 1, y: m.y + 9))
        spk.addLine(to: CGPoint(x: m.x - 4, y: m.y + 4)); spk.addLine(to: CGPoint(x: m.x - 8, y: m.y + 4)); spk.closeSubpath()
        g.c.fill(spk, with: .color(PGC.ink))
        if game.muted {
            g.lines([m.x + 4, m.y - 4, m.x + 9, m.y + 4, m.x + 4, m.y + 4, m.x + 9, m.y - 4], 1.5)
        } else {
            var wv = Path()
            wv.addArc(center: CGPoint(x: m.x + 1, y: m.y), radius: 4.5, startAngle: .radians(-0.9), endAngle: .radians(0.9), clockwise: false)
            wv.move(to: CGPoint(x: m.x + 1 + 8 * CGFloat(cos(-0.9)), y: m.y + 8 * CGFloat(sin(-0.9))))
            wv.addArc(center: CGPoint(x: m.x + 1, y: m.y), radius: 8, startAngle: .radians(-0.9), endAngle: .radians(0.9), clockwise: false)
            g.c.stroke(wv, with: .color(PGC.ink), lineWidth: 1.4)
        }
        // Close key.
        let c = PG.closeKey
        let cb = pgE(c.x, c.y, 13, 13)
        g.paper(cb); g.ink(cb, 1.6)
        g.lines([c.x - 4.5, c.y - 4.5, c.x + 4.5, c.y + 4.5, c.x - 4.5, c.y + 4.5, c.x + 4.5, c.y - 4.5], 2)
    }

    // MARK: cards

    static func card(_ g: PGInk, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) {
        let c = pgRR(x, y, w, h, 4)
        g.c.fill(c.offsetBy(dx: 6, dy: 6), with: .color(PGC.ink))
        g.paper(c)
        g.c.fill(c, with: g.a.grain)
        g.ink(c, 2.2)
        g.c.stroke(Path(CGRect(x: x + 7, y: y + 7, width: w - 14, height: h - 14)), with: .color(PGC.ink), lineWidth: 0.8)
        for (cx, cy) in [(x + 7, y + 7), (x + w - 7, y + 7), (x + 7, y + h - 7), (x + w - 7, y + h - 7)] {
            var d = Path()
            d.move(to: CGPoint(x: cx, y: cy - 5)); d.addLine(to: CGPoint(x: cx + 5, y: cy))
            d.addLine(to: CGPoint(x: cx, y: cy + 5)); d.addLine(to: CGPoint(x: cx - 5, y: cy)); d.closeSubpath()
            g.paper(d); g.tint(d, PGC.pink, 1); g.ink(d, 1)
        }
    }

    static func ribbon(_ g: PGInk, _ label: String, centerY: CGFloat, pulse: Double, t: Double) {
        let s = CGFloat(1 + 0.035 * sin(t * 5) * pulse)
        var k = g
        k.c.translateBy(x: 200, y: centerY)
        k.c.scaleBy(x: s, y: s)
        let b = pgRR(-112, -19, 224, 38, 3)
        k.c.fill(b.offsetBy(dx: 4, dy: 4), with: .color(PGC.ink))
        k.paper(b); k.tint(b, PGC.mari, 1); k.ink(b, 2.2)
        k.text(label, PGFont.ultra(17), PGC.ink, CGPoint(x: 0, y: 1), tracking: 1)
    }

    static func rules(_ g: PGInk, y: CGFloat, from x0: CGFloat, to x1: CGFloat, gap: CGFloat) {
        g.lines([x0, y, 200 - gap, y, 200 + gap, y, x1, y], 1.1)
    }

    static func drawTitle(_ g: PGInk, _ game: PeckGame) {
        let y0: CGFloat = 100
        let drop = CGFloat(easeOutBack(min(1, game.t / 0.6)))
        var k = g
        k.c.translateBy(x: 0, y: (1 - drop) * -30)
        k.c.opacity = clampD(game.t / 0.3, 0, 1)
        card(k, 30, y0, 340, 340)
        let head = "Rest stop · Level \(game.level)"
        k.text(head, PGFont.caps(13), PGC.ink, CGPoint(x: 200, y: y0 + 32), tracking: 3)
        rules(k, y: y0 + 33, from: 52, to: 348, gap: 88)
        k.text("PECK", PGFont.ultra(80), PGC.ink, CGPoint(x: 200, y: y0 + 88), echo: (PGC.pink, 4))
        k.text("or", PGFont.fell(30), PGC.ink, CGPoint(x: 200, y: y0 + 138))
        rules(k, y: y0 + 141, from: 118, to: 282, gap: 24)
        k.text("PERISH", PGFont.ultra(60), PGC.ink, CGPoint(x: 203, y: y0 + 190), maxWidth: 290)
        k.text("PERISH", PGFont.ultra(60), PGC.pink, CGPoint(x: 200, y: y0 + 187), maxWidth: 290)
        k.text("Mauritius, 1598. The ships have landed.", PGFont.fell(18), PGC.ink, CGPoint(x: 200, y: y0 + 234), maxWidth: 300)
        k.text("You have one egg.", PGFont.fell(18), PGC.ink, CGPoint(x: 200, y: y0 + 256))
        var dim = k
        dim.c.opacity = dim.c.opacity * 0.8
        dim.text("Peck the rats, pigs and monkeys. Spare the bunnies.", PGFont.fell(14), PGC.ink, CGPoint(x: 200, y: y0 + 282), maxWidth: 300)
        dim.text(titleBoardLine(game), PGFont.caps(13), PGC.ink, CGPoint(x: 200, y: y0 + 305), tracking: 1, maxWidth: 300)
        ribbon(g, "GUARD THE EGG", centerY: PG.titleButtonY, pulse: 1, t: game.t)
    }

    static func titleBoardLine(_ game: PeckGame) -> String {
        guard let b = game.board else { return game.boardError == nil ? "Loading the board" : "The board is offline" }
        guard let top = b.board.first else { return "Nobody has played this rest stop yet" }
        if let best = b.best {
            return top.me ? "You lead this rest stop · \(best)" : "Your best \(best) · Top \(top.handle) \(top.year)"
        }
        return "Top here · \(top.handle) \(top.year)"
    }

    static func drawOver(_ g: PGInk, _ game: PeckGame) {
        let y0: CGFloat = 58
        let drop = CGFloat(easeOutBack(min(1, game.overT / 0.5)))
        var k = g
        k.c.translateBy(x: 0, y: (1 - drop) * -40)
        k.c.opacity = clampD(game.overT / 0.25, 0, 1)
        card(k, 26, y0, 348, 420)
        do {
            var s = k
            s.c.translateBy(x: 200, y: y0 + 54)
            s.c.rotate(by: .radians(-0.09))
            var m = s.c
            m.blendMode = .multiply
            m.stroke(pgRR(-120, -30, 240, 58, 3), with: .color(PGC.pink), lineWidth: 4)
            m.stroke(Path(CGRect(x: -113, y: -23, width: 226, height: 44)), with: .color(PGC.pink), lineWidth: 1.5)
            m.draw(m.resolve(Text("EXTINCT").font(PGFont.ultra(44)).foregroundColor(PGC.pink)), at: CGPoint(x: 0, y: 1), anchor: .center)
        }
        k.text("in the year", PGFont.fell(18), PGC.ink, CGPoint(x: 200, y: y0 + 104))
        k.text("\(game.deathYear)", PGFont.ultra(48), PGC.ink, CGPoint(x: 200, y: y0 + 140), echo: (PGC.pink, 4))
        let d = game.deathYear - PG.historyYear
        func yrs(_ n: Int) -> String { n == 1 ? "1 year" : "\(n) years" }
        let verdict = d > 0 ? "You beat history by \(yrs(d))." : (d == 0 ? "Right on schedule. History checks out." : "History wins by \(yrs(-d)).")
        k.text(verdict, PGFont.fell(18), PGC.ink, CGPoint(x: 200, y: y0 + 180), maxWidth: 300)
        k.text("Rest stop \(game.level) · the board", PGFont.caps(12), PGC.ink, CGPoint(x: 200, y: y0 + 208), tracking: 2)
        rules(k, y: y0 + 209, from: 48, to: 352, gap: 100)
        drawBoard(k, game, top: y0 + 232)
        ribbon(g, "PECK AGAIN", centerY: PG.overButtonY, pulse: game.overT > 0.9 ? 1 : 0, t: game.t)
    }

    static func drawBoard(_ g: PGInk, _ game: PeckGame, top: CGFloat) {
        if game.boardPosting && game.board == nil {
            g.text("Posting your year…", PGFont.fell(15), PGC.ink, CGPoint(x: 200, y: top + 20))
            return
        }
        if let err = game.boardError {
            g.text(err, PGFont.fell(15), PGC.ink, CGPoint(x: 200, y: top + 20), maxWidth: 290)
            return
        }
        guard let b = game.board else { return }
        var rows = Array(b.board.prefix(5))
        if let me = b.board.first(where: { $0.me }), !rows.contains(where: { $0.me }) { rows.append(me) }
        for (i, r) in rows.enumerated() {
            let y = top + CGFloat(i) * 22
            if r.me { g.tint(Path(CGRect(x: 46, y: y - 10, width: 308, height: 20)), PGC.pink, 0.45) }
            g.text("\(r.rank)", PGFont.caps(14), PGC.ink, CGPoint(x: 64, y: y))
            let name = r.me ? "\(r.handle) (you)" : r.handle
            g.text(name, PGFont.fell(16), PGC.ink, CGPoint(x: 84, y: y), maxWidth: 200, anchor: .leading)
            g.text("\(r.year)", PGFont.ultra(16), PGC.ink, CGPoint(x: 338, y: y), anchor: .trailing)
        }
        if rows.count <= 1 {
            g.text("Nobody else has played this rest stop yet.", PGFont.fell(14), PGC.ink,
                   CGPoint(x: 200, y: top + CGFloat(rows.count) * 22 + 6), maxWidth: 300)
        } else if b.newBest == true {
            g.text("A new best for you.", PGFont.caps(12), PGC.ink, CGPoint(x: 200, y: top + CGFloat(rows.count) * 22 + 4), tracking: 2)
        }
    }

    // MARK: frame

    static func draw(_ game: PeckGame, in ctx: GraphicsContext, scale: CGFloat, assets: PGAssets, background: Image?) {
        var base = ctx
        base.scaleBy(x: scale, y: scale)
        let g0 = PGInk(c: base, a: assets)
        var g = g0
        if game.shake > 0 { g.c.translateBy(x: rnd(-game.shake, game.shake), y: rnd(-game.shake, game.shake)) }
        if let background {
            g.c.draw(background, in: CGRect(origin: .zero, size: PG.size))
        } else {
            drawBackground(g)
        }
        let t = game.t
        // Gulls and sea glints.
        for i in 0..<3 {
            let x = CGFloat((Double(i) * 150 + t * (12 + Double(i) * 3)).truncatingRemainder(dividingBy: 470)) - 35
            let y = 128 + CGFloat(i) * 17 + CGFloat(sin(t * 2 + Double(i))) * 4
            let f = CGFloat(sin(t * 7 + Double(i) * 2)) * 2.5
            var p = Path()
            p.move(to: CGPoint(x: x - 7, y: y - f * 0.4))
            p.addQuadCurve(to: CGPoint(x: x, y: y), control: CGPoint(x: x - 3, y: y - 4 - f))
            p.addQuadCurve(to: CGPoint(x: x + 7, y: y - f * 0.4), control: CGPoint(x: x + 3, y: y - 4 - f))
            g.c.stroke(p, with: .color(PGC.ink), style: StrokeStyle(lineWidth: 1.3, lineCap: .round))
        }
        do {
            var p = Path()
            for i in 0..<9 {
                let dirn: Double = i % 2 == 1 ? 9 : -9
                let span = Double(PG.size.width + 40)
                var xv = (Double(i) * 61 + t * dirn).truncatingRemainder(dividingBy: span)
                if xv < 0 { xv += span }
                let x = CGFloat(xv) - 20
                let y = PG.horizon + 9 + CGFloat(i % 4) * 11
                p.move(to: CGPoint(x: x, y: y)); p.addLine(to: CGPoint(x: x + 9, y: y))
            }
            g.c.stroke(p, with: .color(PGC.paper), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
        }
        if let s = game.ship { drawShip(g, s, t: t) }

        let dead = game.phase == .dying || game.phase == .over
        let nestA: Double = game.phase == .over ? 0 : (game.phase == .dying ? clampD(1 - (game.dyingT - 0.8) / 0.4, 0, 1) : 1)
        enum Item { case ent(PGEnt), dodo, nest }
        var scene: [(CGFloat, Item)] = []
        for e in game.ents where !(e.kind == .crate || e.mode == .ko || (e.kind == .monkey && e.air)) { scene.append((e.y, .ent(e))) }
        scene.append((game.dodo.y, .dodo))
        scene.append((PG.egg.y + 16, .nest))
        scene.sort { $0.0 < $1.0 }
        for (_, item) in scene {
            switch item {
            case .dodo:
                if dead {
                    let rise = game.phase == .over ? 1 : easeOutBack(clampD((game.dyingT - 0.8) / 0.5, 0, 1))
                    drawPlinth(g, rise: rise, year: game.deathYear)
                }
                let d = game.dodo
                let pk = d.peck < 1 ? sin(d.peck * Double.pi) : 0
                let br = 0.025 * (0.5 + 0.5 * sin(t * 2 * Double.pi / 3.2))
                let wob = d.walking ? sin(d.walk) : 0
                var pose = DodoPose()
                pose.roll = Double(d.side) * 0.6 * pk + wob * 0.09
                pose.sx = CGFloat(1 - br * 0.6 + pk * 0.06)
                pose.sy = CGFloat(1 + br - pk * 0.1)
                pose.blink = dead ? 1 : d.blink
                pose.lookX = dead ? 0 : d.look
                pose.wing = pk * 40 + (d.walking ? 10 : 0)
                pose.specimen = dead ? game.specimen : 0
                drawDodo(g, x: d.x, y: d.y - (d.walking ? abs(CGFloat(wob)) * 3 : 0), scale: PG.dodoScale, pose: pose)
            case .nest:
                if nestA > 0 {
                    var n = g
                    n.c.opacity = nestA
                    drawNestBack(n)
                    if !game.eggBroken { drawEgg(n, game: game) }
                    drawNestFront(n)
                }
                if game.eggBroken {
                    drawShell(g, PG.egg.x - 72, PG.egg.y + 30, -0.5)
                    drawShell(g, PG.egg.x + 74, PG.egg.y + 34, 0.6)
                }
            case .ent(let e):
                drawEnt(g, e, t: t)
            }
        }
        if game.phase == .title {
            for (i, dir) in [(3, CGFloat(1)), (4, CGFloat(-1))] {
                let b = PG.burrows[i]
                var k = g
                k.c.clip(to: Path(CGRect(x: 0, y: 0, width: PG.size.width, height: b.y + 2)))
                var e = PGEnt(id: -i, kind: .rat, mode: .run, x: b.x - dir * 4, y: b.y + 9 + CGFloat(sin(t * 2 + Double(i))) * 2)
                e.dir = dir
                e.mode = .stun
                drawRat(k, e, t: t)
            }
        }
        for e in game.ents where e.kind == .monkey && e.air && e.mode != .ko { drawMonkey(g, e, t: t) }
        for e in game.ents where e.kind == .crate { drawCrate(g, e) }
        for e in game.ents where e.mode == .ko { drawEnt(g, e, t: t) }
        drawTrails(g, game)
        drawParticles(g, game)
        for s in game.stamps { drawStamp(g, s) }

        drawHUD(g0, game)
        if let c = game.caption { drawCaption(g0, c) }
        if game.phase == .title { drawTitle(g0, game) }
        if game.phase == .over { drawOver(g0, game) }
        g0.c.fill(Path(CGRect(origin: .zero, size: PG.size)), with: assets.grain)
    }

    static func drawEnt(_ g: PGInk, _ e: PGEnt, t: Double) {
        switch e.kind {
        case .rat: drawRat(g, e, t: t)
        case .pig: drawPig(g, e, t: t)
        case .monkey: drawMonkey(g, e, t: t)
        case .bunny: drawBunny(g, e, t: t)
        case .crate: drawCrate(g, e)
        }
    }
}
