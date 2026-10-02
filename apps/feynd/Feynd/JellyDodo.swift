import SwiftUI
import UIKit

// The jelly dodo — Dodo's mascot since the 2026-10-01 rebrand. A native port
// of the `dodo` body in misc/dodo-redesign/jelly-dodos.html (the sky one):
// a superellipse with gaussian bumps (a tuft, two wing nubs, two feet), a
// radial jelly gradient, an inner rim shadow and rim light, a subsurface
// glow, the kawaii face, and world-fixed speculars. Drawn into a
// GraphicsContext in the page's spec units (body ≈ 84 wide × 90 tall) and
// posed by the same `DodoPose` the old bird used, so every reaction, the
// splash and the Peck traveler kept working the day the bird changed.
//
// Pose mapping, since a jelly has no limbs: squash/stretch/hop/roll apply
// as before (anchored at the feet), `sproutAngle` leans the tuft, `wingAngle`
// puffs the wing nubs, `eyeScaleY` under 0.3 is a closed lid, `squint`
// draws the > < eyes, `mouth` opens the little honk mouth under the beak.

struct JellyPalette: Equatable {
    var light: UInt32
    var base: UInt32
    var dark: UInt32
    /// Inner rim shadow, the spec's `rim` (r, g, b in 0…255, alpha).
    var rimR: Double
    var rimG: Double
    var rimB: Double
    var rimA: Double

    func rim(_ alpha: Double) -> Color {
        Color(red: rimR / 255, green: rimG / 255, blue: rimB / 255).opacity(rimA * alpha)
    }

    static let sky    = JellyPalette(light: 0xDCF6FF, base: 0x5EC6EC, dark: 0x2689BD, rimR: 8,   rimG: 75,  rimB: 120, rimA: 0.5)
    static let pink   = JellyPalette(light: 0xFFE0EF, base: 0xFF9FC8, dark: 0xE9649D, rimR: 185, rimG: 30,  rimB: 100, rimA: 0.55)
    static let peach  = JellyPalette(light: 0xFFE6CF, base: 0xFFAA82, dark: 0xF06C55, rimR: 215, rimG: 70,  rimB: 45,  rimA: 0.5)
    static let mint   = JellyPalette(light: 0xE2FFF4, base: 0x91E9CC, dark: 0x4DC5A2, rimR: 25,  rimG: 135, rimB: 105, rimA: 0.5)
    static let lemon  = JellyPalette(light: 0xFFF8C8, base: 0xFFD43A, dark: 0xE0A100, rimR: 140, rimG: 85,  rimB: 0,   rimA: 0.5)
    static let grape  = JellyPalette(light: 0xEFE2FF, base: 0xA77BF2, dark: 0x6A3FC4, rimR: 50,  rimG: 10,  rimB: 120, rimA: 0.55)
    static let cherry = JellyPalette(light: 0xFF9A96, base: 0xFF2B36, dark: 0xBF0D1C, rimR: 110, rimG: 0,   rimB: 10,  rimA: 0.55)
    static let lime   = JellyPalette(light: 0xEFFFD0, base: 0xA3E45C, dark: 0x4C9F2A, rimR: 30,  rimG: 95,  rimB: 10,  rimA: 0.5)
}

/// The outline maths of the page's `makeOutline` for the dodo spec:
/// `a:39, bt:36, bb:42, n:2.4, np:72` plus six bumps.
enum JellyDodoShape {
    static let a: CGFloat = 39
    static let bt: CGFloat = 36
    static let bb: CGFloat = 42
    static let n: CGFloat = 2.4
    static let np = 72
    static let hp = CGFloat.pi / 2
    /// The spec's `core` — the radius the gradient and glow are sized from.
    static let core: CGFloat = max(a, bt)

    struct Bump {
        var at: CGFloat
        var h: CGFloat
        var w: CGFloat
        /// Push direction; nil pushes radially.
        var dir: CGFloat?
    }

    /// `tuft` leans the head tuft (radians), `wings` adds height to the
    /// wing nubs — the two pose-driven knobs on an otherwise fixed shape.
    static func bumps(tuft: CGFloat, wings: CGFloat) -> [Bump] {
        [
            Bump(at: -hp + 0.05, h: 9, w: 0.07, dir: -hp - 0.15 + tuft),
            Bump(at: -0.38, h: 9, w: 0.09, dir: -0.95),
            Bump(at: 0.3, h: 6 + wings, w: 0.16, dir: nil),
            Bump(at: .pi - 0.3, h: 6 + wings, w: 0.16, dir: nil),
            Bump(at: hp - 0.42, h: 4, w: 0.11, dir: nil),
            Bump(at: hp + 0.42, h: 4, w: 0.11, dir: nil),
        ]
    }

    static func angDiff(_ a: CGFloat, _ b: CGFloat) -> CGFloat {
        var d = a - b
        while d > .pi { d -= 2 * .pi }
        while d < -.pi { d += 2 * .pi }
        return d
    }

    static func outline(tuft: CGFloat = 0, wings: CGFloat = 0) -> [CGPoint] {
        let bs = bumps(tuft: tuft, wings: wings)
        var pts: [CGPoint] = []
        pts.reserveCapacity(np)
        for i in 0..<np {
            let t = -hp + CGFloat(i) / CGFloat(np) * 2 * .pi
            let c = cos(t), s = sin(t)
            var x = a * (c < 0 ? -1 : 1) * pow(abs(c), 2 / n)
            var y = (s < 0 ? bt : bb) * (s < 0 ? -1 : 1) * pow(abs(s), 2 / n)
            for b in bs {
                let d = b.h * exp(-pow(abs(angDiff(t, b.at)) / b.w, 2) / 2)
                if d < 0.01 { continue }
                if let dir = b.dir {
                    x += cos(dir) * d; y += sin(dir) * d
                } else {
                    x += c * d; y += s * d
                }
            }
            pts.append(CGPoint(x: x, y: y))
        }
        return pts
    }

    /// The page's `bodyPath`: quadratic curves through the midpoints, so the
    /// polygon reads as one smooth blob.
    static func path(_ p: [CGPoint]) -> Path {
        var path = Path()
        let n = p.count
        guard n > 2 else { return path }
        path.move(to: CGPoint(x: (p[n - 1].x + p[0].x) / 2, y: (p[n - 1].y + p[0].y) / 2))
        for i in 0..<n {
            let j = (i + 1) % n
            path.addQuadCurve(to: CGPoint(x: (p[i].x + p[j].x) / 2, y: (p[i].y + p[j].y) / 2), control: p[i])
        }
        path.closeSubpath()
        return path
    }

    static let rest: [CGPoint] = outline()
    static let centroid: CGPoint = {
        var mx: CGFloat = 0, my: CGFloat = 0
        for p in rest { mx += p.x; my += p.y }
        return CGPoint(x: mx / CGFloat(rest.count), y: my / CGFloat(rest.count))
    }()
    static let top: CGFloat = rest.map(\.y).min() ?? -45
    static let bottom: CGFloat = rest.map(\.y).max() ?? 45
    static let left: CGFloat = rest.map(\.x).min() ?? -42
    static let right: CGFloat = rest.map(\.x).max() ?? 42
    static let height: CGFloat = bottom - top
    static let width: CGFloat = right - left
}

private func ell(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, rot: CGFloat = 0) -> Path {
    var t = CGAffineTransform(translationX: x, y: y)
    if rot != 0 { t = t.rotated(by: rot) }
    return Path(ellipseIn: CGRect(x: -rx, y: -ry, width: rx * 2, height: ry * 2)).applying(t)
}

/// The page's `soft` / `soft2`: a radial fade of one colour inside an ellipse.
private func softGlow(_ g: inout GraphicsContext, x: CGFloat, y: CGFloat, rx: CGFloat, ry: CGFloat, color: Color) {
    var e = g
    e.translateBy(x: x, y: y)
    e.scaleBy(x: 1, y: ry / rx)
    e.fill(Path(ellipseIn: CGRect(x: -rx, y: -rx, width: rx * 2, height: rx * 2)),
           with: .radialGradient(Gradient(colors: [color, color.opacity(0)]),
                                 center: .zero, startRadius: 0, endRadius: rx))
}

private let jellyInk = Color(hex: 0x2A1F2B)

/// Draw the jelly dodo. `feet` is the point its feet stand on; `height` the
/// body height in points (the rest shape, before any pose squash).
func drawJellyDodo(_ ctx: inout GraphicsContext, at feet: CGPoint, height: CGFloat, pose: DodoPose,
                   palette: JellyPalette = .sky, groundShadow: Bool = false) {
    let unit = height / JellyDodoShape.height
    var g = ctx
    g.translateBy(x: feet.x + pose.xShake * unit, y: feet.y)
    g.scaleBy(x: unit, y: unit)

    if groundShadow {
        let lift = max(0, min(1, -pose.yOffset / 26))
        let rx = 30 * pose.scaleX * (1 - 0.35 * lift)
        let ry = 5 * (1 - 0.3 * lift)
        g.fill(ell(0, 1.5, rx, ry), with: .color(Color(hex: 0x3C1E3C).opacity(0.16 * (1 - 0.5 * lift))))
    }

    if pose.rollDegrees != 0 { g.rotate(by: .degrees(pose.rollDegrees)) }
    g.translateBy(x: 0, y: pose.yOffset)
    g.scaleBy(x: pose.scaleX, y: pose.scaleY)
    g.translateBy(x: 0, y: -JellyDodoShape.bottom)   // feet → spec origin

    let pts = JellyDodoShape.outline(tuft: pose.sproutAngle * .pi / 180 * 0.6,
                                     wings: pose.wingAngle * 0.08)
    let body = JellyDodoShape.path(pts)
    let c = JellyDodoShape.centroid
    let R = JellyDodoShape.core
    let bottom = pts.map(\.y).max() ?? JellyDodoShape.bottom

    // The jelly: light at the upper left, deep at the rim.
    g.fill(body, with: .radialGradient(
        Gradient(stops: [
            .init(color: Color(hex: palette.light), location: 0),
            .init(color: Color(hex: palette.base), location: 0.5),
            .init(color: Color(hex: palette.dark), location: 1),
        ]),
        center: CGPoint(x: c.x - R * 0.35, y: c.y - R * 0.5),
        startRadius: R * 0.05, endRadius: R * 1.35))

    var inner = g
    inner.clip(to: body)

    // Inner rim: the page blurs the outside of the body in with an offset
    // shadow (dark, pushed up-left; white, pushed down-right). Three soft
    // strokes of the shifted outline, clipped to the body, read the same.
    let shadowPath = body.applying(CGAffineTransform(translationX: -2, y: -5))
    for (w, a) in [(18.0, 0.14), (11.0, 0.16), (5.0, 0.22)] {
        inner.stroke(shadowPath, with: .color(palette.rim(a)), lineWidth: w)
    }
    let lightPath = body.applying(CGAffineTransform(translationX: 1.5, y: 4))
    for (w, a) in [(12.0, 0.10), (7.0, 0.14), (3.0, 0.22)] {
        inner.stroke(lightPath, with: .color(.white.opacity(a)), lineWidth: w)
    }

    // Subsurface glow near the bottom.
    softGlow(&inner, x: c.x + R * 0.1, y: bottom - R * 0.32, rx: R * 0.75, ry: R * 0.35, color: .white.opacity(0.28))

    drawJellyFace(&inner, pose: pose)

    // World-fixed speculars, relative to the centroid.
    let hx = c.x - JellyDodoShape.a * 0.42, hy = c.y - JellyDodoShape.bt * 0.5
    var spec = inner
    spec.translateBy(x: hx, y: hy)
    spec.rotate(by: .radians(-0.55))
    spec.scaleBy(x: 1, y: 0.5)
    let hr = JellyDodoShape.a * 0.38
    spec.fill(Path(ellipseIn: CGRect(x: -hr, y: -hr, width: hr * 2, height: hr * 2)),
              with: .radialGradient(Gradient(stops: [
                .init(color: .white.opacity(0.85), location: 0),
                .init(color: .white.opacity(0.35), location: 0.45),
                .init(color: .white.opacity(0), location: 1),
              ]), center: .zero, startRadius: 0, endRadius: hr))
    inner.fill(ell(hx - JellyDodoShape.a * 0.08, hy - JellyDodoShape.bt * 0.02,
                   JellyDodoShape.a * 0.07, JellyDodoShape.a * 0.045, rot: -0.6),
               with: .color(.white.opacity(0.95)))
    inner.fill(ell(c.x + JellyDodoShape.a * 0.55, c.y + JellyDodoShape.bb * 0.35,
                   JellyDodoShape.a * 0.05, JellyDodoShape.a * 0.11, rot: -0.3),
               with: .color(.white.opacity(0.55)))
}

/// The dodo's face in spec units (origin = the superellipse's origin).
private func drawJellyFace(_ g: inout GraphicsContext, pose: DodoPose) {
    // Belly glow.
    softGlow(&g, x: 0, y: 24, rx: 20, ry: 16, color: Color(red: 240 / 255, green: 252 / 255, blue: 1).opacity(0.7))
    // Blush — the page's rgba(255,90,130,.42) at the pose's cheek strength.
    let cheek = Color(red: 1, green: 90 / 255, blue: 130 / 255).opacity(0.42 * Double(pose.cheekOpacity / 0.6))
    softGlow(&g, x: -23, y: 4, rx: 6.5, ry: 4.55, color: cheek)
    softGlow(&g, x: 23, y: 4, rx: 6.5, ry: 4.55, color: cheek)

    for side: CGFloat in [-1, 1] {
        drawJellyEye(&g, x: 14 * side, y: -9, r: 4.6, pose: pose)
    }

    // Beak: a soft teardrop, lit from the top.
    var beak = Path()
    beak.move(to: CGPoint(x: -8, y: -1))
    beak.addQuadCurve(to: CGPoint(x: 8, y: -1), control: CGPoint(x: 0, y: -6))
    beak.addQuadCurve(to: CGPoint(x: 2, y: 12), control: CGPoint(x: 8, y: 7))
    beak.addQuadCurve(to: CGPoint(x: -2, y: 12), control: CGPoint(x: 0, y: 14))
    beak.addQuadCurve(to: CGPoint(x: -8, y: -1), control: CGPoint(x: -8, y: 7))
    beak.closeSubpath()
    g.fill(beak, with: .linearGradient(Gradient(colors: [Color(hex: 0xFFD56C), Color(hex: 0xF3962A)]),
                                       startPoint: CGPoint(x: 0, y: -4), endPoint: CGPoint(x: 0, y: 13)))
    g.fill(ell(0, 10.6, 2.6, 2.2), with: .color(Color(hex: 0xE0742A)))
    g.fill(ell(-3.6, 0, 2.2, 1.1, rot: -0.2), with: .color(.white.opacity(0.75)))

    // The honk mouth, only when a pose opens it.
    if pose.mouth > 0.02 {
        let m = min(1, pose.mouth)
        g.fill(ell(0, 16.9, 1.1 + 1.3 * m, 1.3 + 2.0 * m), with: .color(Color(hex: 0x7A1F33)))
    }
}

private func drawJellyEye(_ g: inout GraphicsContext, x: CGFloat, y: CGFloat, r: CGFloat, pose: DodoPose) {
    let style = StrokeStyle(lineWidth: max(2, r * 0.42), lineCap: .round, lineJoin: .round)
    if pose.squint > 0.5 {
        // > < eyes, pointing inward.
        let s: CGFloat = x < 0 ? 1 : -1
        let rr = r * 1.15
        var p = Path()
        p.move(to: CGPoint(x: x - s * rr * 0.7, y: y - rr * 0.6))
        p.addLine(to: CGPoint(x: x + s * rr * 0.55, y: y))
        p.addLine(to: CGPoint(x: x - s * rr * 0.7, y: y + rr * 0.6))
        g.stroke(p, with: .color(jellyInk), style: StrokeStyle(lineWidth: max(2, rr * 0.42), lineCap: .round, lineJoin: .round))
        return
    }
    if pose.eyeScaleY < 0.3 {
        // Closed lid: a happy arc below the eye's centre.
        var p = Path()
        let cx = x, cy = y - r * 0.5, ar = r * 0.85
        for k in 0...8 {
            let a = 0.25 * CGFloat.pi + 0.5 * CGFloat.pi * CGFloat(k) / 8
            let pt = CGPoint(x: cx + cos(a) * ar, y: cy + sin(a) * ar)
            if k == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        g.stroke(p, with: .color(jellyInk), style: StrokeStyle(lineWidth: max(2, r * 0.38), lineCap: .round, lineJoin: .round))
        return
    }
    _ = style
    let rr = r * pose.pupilScale
    let ey = max(0.3, pose.eyeScaleY)
    let lx = x + pose.pupilOffset.width * 0.8
    let ly = y + pose.pupilOffset.height * 0.8
    g.fill(ell(lx, ly, rr, rr * 1.12 * ey), with: .color(jellyInk))
    g.fill(ell(lx - rr * 0.32, ly - rr * 0.38 * ey, rr * 0.36, rr * 0.36 * ey), with: .color(.white))
    g.fill(ell(lx + rr * 0.35, ly + rr * 0.4 * ey, rr * 0.15, rr * 0.15 * ey), with: .color(.white.opacity(0.8)))
}
