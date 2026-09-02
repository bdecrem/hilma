import SwiftUI
import UIKit

// The lively mascot — a Swift port of the Claude Design dodo (see
// branding/design/mascot-animation-spec.md for the animation bible this
// implements). Geometry comes from the design's `Dodo` JSX: art space is
// head-centered (head r=26 at 0,0; feet at y=58); the position you draw at
// is the FEET point, and squash/stretch anchors there so the ground never
// slides. Everything is transforms — no path morphing.

/// One frame's worth of mascot parameters. Compose freely: reactions are
/// pure functions of time that return a pose (usually layered over idle).
struct DodoPose {
    var scaleX: CGFloat = 1
    var scaleY: CGFloat = 1
    var rollDegrees: CGFloat = 0
    var yOffset: CGFloat = 0
    /// Whole-sprout rotation about the stem base.
    var sproutAngle: CGFloat = 0
    /// Extra symmetric leaf spread: + opens, − droops.
    var leafSpread: CGFloat = 0
    var eyeScaleY: CGFloat = 1
    var pupilScale: CGFloat = 1
    var pupilOffset: CGSize = .zero
    /// Wing out-flap, degrees (0 = resting).
    var wingAngle: CGFloat = 0
    var cheekOpacity: CGFloat = 0.6
    var leftFootLift: CGFloat = 0
    var rightFootLift: CGFloat = 0
    /// Horizontal shake offset (the wrong-answer wobble).
    var xShake: CGFloat = 0
}

/// Deterministic per-cycle jitter (no RNG — frames must be pure in time).
private func hash01(_ n: Int, _ salt: CGFloat) -> CGFloat {
    let v = sin(CGFloat(n) * 127.1 + salt * 311.7) * 43758.5453
    return v - v.rounded(.down)
}

private func bell(_ u: CGFloat) -> CGFloat {
    u > 0 && u < 1 ? sin(u * .pi) : 0
}

/// Spec ease "cubic-bezier(.34,1.56,.64,1)" — a light overshoot pop.
func easeOutBack(_ u: CGFloat) -> CGFloat {
    let c: CGFloat = 1.70158
    let t = u - 1
    return 1 + (c + 1) * t * t * t + c * t * t
}

enum DodoMood {
    /// Idle loop: breathe, counter-swaying leaves, randomized blinks,
    /// a micro look-around every ~8s.
    static func idle(_ t: CGFloat, seed: CGFloat = 0, reduceMotion: Bool = false) -> DodoPose {
        var p = DodoPose()
        // Breath — scaleY 1→1.025→1 over 3.2s, volume-preserving.
        let breath = 0.025 * (0.5 + 0.5 * sin(t * 2 * .pi / 3.2 + seed))
        p.scaleY = 1 + breath
        p.scaleX = 1 - breath * 0.6
        if reduceMotion { return p }

        // Leaves counter-sway ±4°, phase-offset from each other.
        p.leafSpread = 4 * sin(t * 2 * .pi / 3.2 + seed + 0.9)
        p.sproutAngle = 2 * sin(t * 2 * .pi / 5.1 + seed)

        // Blink every 3–5s (per-cycle jitter), 120ms, occasional double.
        let cycle = 4.0 + (hash01(Int((t / 4.0).rounded(.down)), seed) - 0.5) * 2.0
        let cy = Int((t / cycle).rounded(.down))
        let inCycle = t - CGFloat(cy) * cycle
        let blinkAt = 0.6 + hash01(cy, seed + 5) * (cycle - 1.2)
        var eye = blinkShape((inCycle - blinkAt) / 0.12)
        if hash01(cy, seed + 9) > 0.72 {   // double-blink
            eye = min(eye, blinkShape((inCycle - blinkAt - 0.22) / 0.12))
        }
        p.eyeScaleY = eye

        // Micro look-around every ~8s: 2px left, hold, 2px right, back.
        let lookCycle: CGFloat = 8
        let lu = (t + seed * 3).truncatingRemainder(dividingBy: lookCycle) / lookCycle
        if lu > 0.62 && lu < 0.78 {
            p.pupilOffset.width = -2
        } else if lu > 0.80 && lu < 0.92 {
            p.pupilOffset.width = 2
        }
        return p
    }

    private static func blinkShape(_ u: CGFloat) -> CGFloat {
        u > 0 && u < 1 ? 1 - 0.95 * sin(u * .pi) : 1
    }

    /// Walking bob: 2px-ish bounce per step, alternating roll, feet lifts,
    /// sprout trailing the bob by ~80ms. `phase` advances with distance.
    static func walking(_ t: CGFloat, phase: CGFloat) -> DodoPose {
        var p = DodoPose()
        let bounce = abs(sin(phase))
        p.yOffset = -bounce * 13
        p.scaleY = 0.94 + 0.11 * bounce
        p.scaleX = 2 - p.scaleY
        p.rollDegrees = 2 * sin(phase)
        p.sproutAngle = 9 * sin(phase - 0.7)
        p.wingAngle = 10 + 8 * sin(phase * 2)
        p.leftFootLift = max(0, sin(phase)) * 4
        p.rightFootLift = max(0, -sin(phase)) * 4
        p.eyeScaleY = 1
        return p
    }

    /// Happy hop (600ms): anticipate-squash, stretch at apex, land-squash,
    /// sprout boing with damped settle, two wing flaps.
    static func happy(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        if u < 0.13 {                       // anticipation squash
            let a = u / 0.13
            p.scaleY = 1 - 0.06 * a
            p.scaleX = 1 + 0.06 * a
        } else {
            let ju = (u - 0.13) / 0.75
            let hop = bell(ju)
            p.yOffset = -26 * hop
            p.scaleY = 0.96 + 0.12 * hop
            p.scaleX = 2 - p.scaleY
            if ju > 1 {                     // landing squash
                p.scaleY = 0.94; p.scaleX = 1.06
            }
        }
        // Sprout boing: overshoot then two damped oscillations.
        let su = max(0, u - 0.2)
        p.sproutAngle = 14 * exp(-3.2 * su) * sin(su * 14)
        p.wingAngle = 42 * bell(u / 0.5) + 42 * bell((u - 0.45) / 0.5)
        p.cheekOpacity = 0.6 + 0.3 * bell(u)
        return p
    }

    /// Excited (streak / 3 stars): eye pop, cheeks brighten, sprout does a
    /// full wobbling spin. ~1s.
    static func excited(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        p.pupilScale = 1 + 0.35 * easeOutBack(min(1, u / 0.4)) * (1 - max(0, (u - 0.8) / 0.2))
        p.cheekOpacity = 0.6 + 0.3 * bell(u)
        p.sproutAngle = 360 * easeOutBack(u) .truncatingRemainder(dividingBy: 360)
        p.scaleY = 1 + 0.03 * bell(u)
        p.scaleX = 1 - 0.02 * bell(u)
        return p
    }

    /// Thinking: small tilt, one pupil drifts up-left, leaves droop slowly.
    static func thinking(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        p.rollDegrees = 3 * u
        p.pupilOffset = CGSize(width: -2 * u, height: -2 * u)
        p.leafSpread = -6 * u
        return p
    }

    /// Tickled: a giggly wiggle — roll oscillation, squashy bounce, sprout
    /// boing, cheeks up, a double blink. ~1s, then back to idle.
    static func tickled(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        let damp = exp(-2.6 * u)
        p.rollDegrees = 5 * damp * sin(u * 22)
        let bounce = abs(sin(u * .pi * 3)) * damp
        p.yOffset = -8 * bounce
        p.scaleY = 1 + 0.07 * bounce
        p.scaleX = 1 - 0.05 * bounce
        p.sproutAngle = 16 * damp * sin(u * 18 + 1)
        p.cheekOpacity = 0.6 + 0.32 * bell(u)
        p.wingAngle = 24 * damp * abs(sin(u * 12))
        p.eyeScaleY = min(blinkShapePublic((u - 0.25) / 0.12), blinkShapePublic((u - 0.5) / 0.12))
        return p
    }

    static func blinkShapePublic(_ u: CGFloat) -> CGFloat {
        u > 0 && u < 1 ? 1 - 0.95 * sin(u * .pi) : 1
    }

    /// Wrong answer, kept kind: ±3px shake (3 cycles, 240ms), sprout flops,
    /// one slow blink; fully back to idle inside a second.
    static func wrong(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        if u < 0.24 {
            p.xShake = 3 * sin(u / 0.24 * .pi * 6)
        }
        p.leafSpread = -8 * bell(u / 0.9)
        p.eyeScaleY = u > 0.3 && u < 0.75 ? 1 - 0.95 * sin((u - 0.3) / 0.45 * .pi) : 1
        return p
    }
}

/// Draw the mascot into a Canvas. `at` is the FEET point; `size` is the
/// desired footprint height in points (art is 97pt tall in art space).
func drawAnimatedDodo(_ ctx: inout GraphicsContext, at p: CGPoint, height: CGFloat, pose: DodoPose) {
    let k = height / 97
    var g = ctx
    g.translateBy(x: p.x + pose.xShake * (height / 97), y: p.y)
    g.scaleBy(x: k, y: k)
    if pose.rollDegrees != 0 { g.rotate(by: .degrees(pose.rollDegrees)) }
    g.translateBy(x: 0, y: pose.yOffset)
    g.scaleBy(x: pose.scaleX, y: pose.scaleY)
    g.translateBy(x: 0, y: -58)   // into head-centered art space

    func fill(_ path: Path, _ hex: UInt32, _ opacity: CGFloat = 1) {
        g.fill(path, with: .color(Color(hex: hex).opacity(opacity)))
    }
    func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat, _ hex: UInt32, rotate: (angle: CGFloat, cx: CGFloat, cy: CGFloat)? = nil) {
        var path = Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: r)
        if let rot = rotate {
            path = path.applying(
                CGAffineTransform(translationX: rot.cx, y: rot.cy)
                    .rotated(by: rot.angle * .pi / 180)
                    .translatedBy(x: -rot.cx, y: -rot.cy))
        }
        fill(path, hex)
    }

    // Shading helpers — the volume the mascot earned in v3 (see
    // branding/design: Dodo Launch v3). Gradients only; geometry unchanged.
    func radial(_ path: Path, _ stops: [(UInt32, CGFloat)], center: CGPoint, r: CGFloat) {
        let grad = Gradient(stops: stops.map { .init(color: Color(hex: $0.0), location: $0.1) })
        g.fill(path, with: .radialGradient(grad, center: center, startRadius: 0, endRadius: r))
    }
    func linear(_ path: Path, _ stops: [(UInt32, CGFloat)], from a: CGPoint, to b: CGPoint) {
        let grad = Gradient(stops: stops.map { .init(color: Color(hex: $0.0), location: $0.1) })
        g.fill(path, with: .linearGradient(grad, startPoint: a, endPoint: b))
    }
    func stroke(_ path: Path, _ hex: UInt32, _ opacity: CGFloat, _ width: CGFloat) {
        g.stroke(path, with: .color(Color(hex: hex).opacity(opacity)),
                 style: StrokeStyle(lineWidth: width, lineCap: .round))
    }
    let footStops: [(UInt32, CGFloat)] = [(0xF3B546, 0), (0xD9931F, 1)]

    // Feet (lifts raise leg + pad together), with toe notches.
    for side: CGFloat in [-1, 1] {
        var foot = g
        foot.translateBy(x: 0, y: side == -1 ? -pose.leftFootLift : -pose.rightFootLift)
        let legX: CGFloat = side == -1 ? -9 : 3
        let padX: CGFloat = side == -1 ? -13 : 1
        let grad = Gradient(stops: footStops.map { .init(color: Color(hex: $0.0), location: $0.1) })
        foot.fill(Path(roundedRect: CGRect(x: legX, y: 44, width: 6, height: 12), cornerRadius: 3),
                  with: .linearGradient(grad, startPoint: CGPoint(x: 0, y: 44), endPoint: CGPoint(x: 0, y: 58)))
        foot.fill(Path(roundedRect: CGRect(x: padX, y: 53, width: 12, height: 5), cornerRadius: 2.5),
                  with: .linearGradient(grad, startPoint: CGPoint(x: 0, y: 50), endPoint: CGPoint(x: 0, y: 58)))
        for toe: CGFloat in [3.8, 7.4] {
            foot.fill(Path(roundedRect: CGRect(x: padX + toe, y: 55.6, width: 1.6, height: 2.4), cornerRadius: 0.8),
                      with: .color(Color(hex: 0xC9821F).opacity(0.55)))
        }
    }

    // Body + belly.
    radial(Path(ellipseIn: CGRect(x: -20, y: 16, width: 40, height: 32)),
           [(0x8FB0C4, 0), (0x7C9EB2, 0.6), (0x5A7E93, 1)], center: CGPoint(x: -4, y: 25), r: 27)
    radial(Path(ellipseIn: CGRect(x: -12, y: 25, width: 24, height: 20)),
           [(0xFFFBF0, 0), (0xEBDDBE, 1)], center: CGPoint(x: 0, y: 32), r: 12)
    var crease = Path()
    crease.move(to: CGPoint(x: -9, y: 27))
    crease.addQuadCurve(to: CGPoint(x: 9, y: 27), control: CGPoint(x: 0, y: 23))
    stroke(crease, 0x5A7E93, 0.35, 0.9)

    // Wings — resting rotation baked in; flap adds about the shoulder.
    for side: CGFloat in [-1, 1] {
        let restCX: CGFloat = 23 * side, restCY: CGFloat = 29
        let shoulderX: CGFloat = 18 * side, shoulderY: CGFloat = 26
        let t = CGAffineTransform(translationX: shoulderX, y: shoulderY)
            .rotated(by: side * -pose.wingAngle * .pi / 180)
            .translatedBy(x: -shoulderX, y: -shoulderY)
            .translatedBy(x: restCX, y: restCY)
            .rotated(by: side * -20 * .pi / 180)
            .translatedBy(x: -restCX, y: -restCY)
        let wing = Path(roundedRect: CGRect(x: side == -1 ? -30 : 16, y: 24, width: 14, height: 11), cornerRadius: 5.5)
            .applying(t)
        let wc = CGPoint(x: restCX - 2 * side, y: 27).applying(t)
        radial(wing, [(0x7EA2B6, 0), (0x5C8095, 1)], center: wc, r: 9)
        var feather = Path()
        feather.move(to: CGPoint(x: side == -1 ? -27 : 18.5, y: side == -1 ? 31.5 : 31.2))
        feather.addQuadCurve(to: CGPoint(x: side == -1 ? -18.5 : 27, y: side == -1 ? 31.2 : 31.5),
                             control: CGPoint(x: 23 * side, y: 29))
        stroke(feather.applying(t), 0x4E7186, 0.5, 0.8)
    }

    // Sprout — three leaves rotating about the stem base (0,-26).
    var sprout = g
    sprout.translateBy(x: 0, y: -26)
    sprout.rotate(by: .degrees(pose.sproutAngle))
    sprout.translateBy(x: 0, y: 26)
    func spreadT(_ spread: CGFloat) -> CGAffineTransform {
        CGAffineTransform(translationX: 0, y: -26).rotated(by: spread * .pi / 180).translatedBy(x: 0, y: 26)
    }
    var stem = Path()
    stem.move(to: CGPoint(x: -0.9, y: -26))
    stem.addCurve(to: CGPoint(x: 2.2, y: -32), control1: CGPoint(x: -1.1, y: -28.6), control2: CGPoint(x: -0.4, y: -30.3))
    stem.addCurve(to: CGPoint(x: 1.3, y: -26), control1: CGPoint(x: 2.8, y: -30.7), control2: CGPoint(x: 2.2, y: -28.6))
    stem.closeSubpath()
    sprout.fill(stem, with: .color(Color(hex: 0x6FAE5C)))
    do {
        let t = spreadT(-pose.leafSpread)
        var leafL = Path()
        leafL.move(to: CGPoint(x: 0.9, y: -30.9))
        leafL.addCurve(to: CGPoint(x: -16.1, y: -34.4), control1: CGPoint(x: -3.9, y: -36.5), control2: CGPoint(x: -11.3, y: -37.4))
        leafL.addCurve(to: CGPoint(x: 0.9, y: -30.9), control1: CGPoint(x: -13.9, y: -28.7), control2: CGPoint(x: -5.7, y: -27.4))
        leafL.closeSubpath()
        let grad = Gradient(colors: [Color(hex: 0x8CC470), Color(hex: 0x63A24F)])
        sprout.fill(leafL.applying(t), with: .linearGradient(grad, startPoint: CGPoint(x: 0, y: -30).applying(t), endPoint: CGPoint(x: -16, y: -35).applying(t)))
        var rib = Path()
        rib.move(to: CGPoint(x: 0, y: -31.2))
        rib.addQuadCurve(to: CGPoint(x: -14.2, y: -34.2), control: CGPoint(x: -7, y: -33.8))
        sprout.stroke(rib.applying(t), with: .color(.white.opacity(0.45)), style: StrokeStyle(lineWidth: 0.7, lineCap: .round))
    }
    do {
        let t = spreadT(pose.leafSpread)
        var leafR = Path()
        leafR.move(to: CGPoint(x: 1.7, y: -32.2))
        leafR.addCurve(to: CGPoint(x: 16.1, y: -37.8), control1: CGPoint(x: 3.9, y: -37.8), control2: CGPoint(x: 10.9, y: -39.6))
        leafR.addCurve(to: CGPoint(x: 1.7, y: -32.2), control1: CGPoint(x: 15.2, y: -32.2), control2: CGPoint(x: 8.3, y: -29.2))
        leafR.closeSubpath()
        let grad = Gradient(colors: [Color(hex: 0x6FAE5C), Color(hex: 0x4E8C3E)])
        sprout.fill(leafR.applying(t), with: .linearGradient(grad, startPoint: CGPoint(x: 2, y: -32).applying(t), endPoint: CGPoint(x: 16, y: -38).applying(t)))
        var rib = Path()
        rib.move(to: CGPoint(x: 2.6, y: -32.6))
        rib.addQuadCurve(to: CGPoint(x: 14.4, y: -37.2), control: CGPoint(x: 8.5, y: -35.6))
        sprout.stroke(rib.applying(t), with: .color(.white.opacity(0.4)), style: StrokeStyle(lineWidth: 0.7, lineCap: .round))
    }

    // Head, three crown feathers, hooded face.
    radial(Path(ellipseIn: CGRect(x: -26, y: -26, width: 52, height: 52)),
           [(0x93B3C6, 0), (0x7C9EB2, 0.55), (0x5F8398, 1)], center: CGPoint(x: -6, y: -10), r: 32)
    for (x0, y0, dx1, dy1, dx2, dy2, op): (CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat) in
        [(-7, -24.5, -1.4, -2.6, -0.4, -4.6, 0.7), (-3.2, -25.6, -0.6, -2.6, 0.6, -4.4, 0.7), (-10.6, -22.6, -1.8, -2, -1.4, -4.2, 0.55)] {
        var f = Path()
        f.move(to: CGPoint(x: x0, y: y0))
        f.addQuadCurve(to: CGPoint(x: x0 + dx2, y: y0 + dy2), control: CGPoint(x: x0 + dx1, y: y0 + dy1))
        stroke(f, 0x5F8398, op, 1)
    }
    var face = Path()
    face.move(to: CGPoint(x: -20, y: 4))
    face.addCurve(to: CGPoint(x: -6.5, y: -12), control1: CGPoint(x: -20, y: -7), control2: CGPoint(x: -15, y: -13))
    face.addQuadCurve(to: CGPoint(x: 6.5, y: -12), control: CGPoint(x: 0, y: -7.5))
    face.addCurve(to: CGPoint(x: 20, y: 4), control1: CGPoint(x: 15, y: -13), control2: CGPoint(x: 20, y: -7))
    face.addCurve(to: CGPoint(x: 0, y: 24), control1: CGPoint(x: 20, y: 16), control2: CGPoint(x: 11, y: 24))
    face.addCurve(to: CGPoint(x: -20, y: 4), control1: CGPoint(x: -11, y: 24), control2: CGPoint(x: -20, y: 16))
    face.closeSubpath()
    radial(face, [(0xFFFBF0, 0), (0xF9EFDA, 0.7), (0xEBDDBE, 1)], center: CGPoint(x: 0, y: -2), r: 24)

    // Cheeks — soft-edged blush.
    for side: CGFloat in [-1, 1] {
        let c = CGPoint(x: 15.6 * side, y: 8.4)
        let blush = Color(hex: 0xF2A19A)
        let grad = Gradient(stops: [.init(color: blush.opacity(pose.cheekOpacity), location: 0),
                                    .init(color: blush.opacity(pose.cheekOpacity * 0.7), location: 0.6),
                                    .init(color: blush.opacity(0), location: 1)])
        g.fill(Path(ellipseIn: CGRect(x: c.x - 5.4, y: c.y - 3.6, width: 10.8, height: 7.2)),
               with: .radialGradient(grad, center: c, startRadius: 0, endRadius: 5.4))
    }

    // Eyes — iris depth + twin highlights; blink via scaleY about the centre.
    for side: CGFloat in [-1, 1] {
        let cx = 9.4 * side
        var eye = g
        eye.translateBy(x: cx + pose.pupilOffset.width, y: -2 + pose.pupilOffset.height)
        eye.scaleBy(x: pose.pupilScale, y: pose.pupilScale * pose.eyeScaleY)
        let grad = Gradient(stops: [.init(color: Color(hex: 0x4A5560), location: 0),
                                    .init(color: Color(hex: 0x33383E), location: 0.72),
                                    .init(color: Color(hex: 0x22262B), location: 1)])
        eye.fill(Path(ellipseIn: CGRect(x: -5.5, y: -5.5, width: 11, height: 11)),
                 with: .radialGradient(grad, center: .zero, startRadius: 0, endRadius: 5.5))
        eye.fill(Path(ellipseIn: CGRect(x: -1.8 * side - 2.1, y: -4.1, width: 4.2, height: 4.2)), with: .color(.white))
        eye.fill(Path(ellipseIn: CGRect(x: 1.9 * side - 0.9, y: 1.4, width: 1.8, height: 1.8)), with: .color(.white.opacity(0.75)))
    }

    // Beak — gradient, a highlight, nostrils, and a smile crease.
    linear(Path(ellipseIn: CGRect(x: -6.8, y: 1.3, width: 13.6, height: 10)),
           [(0xF8C86E, 0), (0xF0A830, 0.5), (0xD08A1C, 1)], from: CGPoint(x: 0, y: 1.3), to: CGPoint(x: 0, y: 11.3))
    g.fill(Path(ellipseIn: CGRect(x: -4.2, y: 2.6, width: 4, height: 2)), with: .color(.white.opacity(0.32)))
    fill(Path(ellipseIn: CGRect(x: -3.55, y: 4.05, width: 1.9, height: 1.9)), 0xC9821F)
    fill(Path(ellipseIn: CGRect(x: 1.65, y: 4.05, width: 1.9, height: 1.9)), 0xC9821F)
    var smile = Path()
    smile.move(to: CGPoint(x: -5.6, y: 8.2))
    smile.addQuadCurve(to: CGPoint(x: 5.6, y: 8.2), control: CGPoint(x: 0, y: 10.6))
    stroke(smile, 0xC9821F, 0.55, 0.7)
}

/// Standalone idle mascot for placing in layouts (the Peck map traveler).
/// `tickleable` makes a tap play a little reaction — tickle, hop, or
/// eye-pop, cycling so repeat taps stay fun.
struct AnimatedDodoView: View {
    var height: CGFloat = 82
    var seed: CGFloat = 0
    var tickleable: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var reactionStart: Date? = nil
    @State private var reactionKind = 0

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            Canvas { ctx, size in
                let t = CGFloat(timeline.date.timeIntervalSinceReferenceDate)
                var pose = DodoMood.idle(t, seed: seed, reduceMotion: reduceMotion)
                if !reduceMotion, let rs = reactionStart {
                    let u = CGFloat(timeline.date.timeIntervalSince(rs))
                    switch reactionKind % 3 {
                    case 0 where u < 1.0:
                        var p = DodoMood.tickled(u)
                        p.eyeScaleY = min(p.eyeScaleY, pose.eyeScaleY)
                        pose = p
                    case 1 where u < 0.75:
                        pose = DodoMood.happy(u / 0.7)
                    case 2 where u < 1.1:
                        var p = DodoMood.excited(u / 1.0)
                        p.scaleY *= pose.scaleY
                        pose = p
                    default:
                        break
                    }
                }
                var g = ctx
                drawAnimatedDodo(&g, at: CGPoint(x: size.width / 2, y: size.height - 2), height: height, pose: pose)
            }
        }
        .frame(width: height * 0.9, height: height + 4)
        .allowsHitTesting(tickleable)
        .contentShape(Rectangle())
        .onTapGesture {
            guard tickleable else { return }
            reactionKind += 1
            reactionStart = Date()
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            FlashSFX.shared.play(.tap)
        }
        #if targetEnvironment(simulator)
        // `-TickleDodo 1` — auto-play a tickle for screenshot runs.
        .onAppear {
            if tickleable, UserDefaults.standard.bool(forKey: "TickleDodo") {
                UserDefaults.standard.removeObject(forKey: "TickleDodo")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    reactionKind = 0
                    reactionStart = Date()
                }
            }
        }
        #endif
    }
}

/// A mascot that plays one reaction on appear, then settles into idle.
/// Drop-in for results screens and waiting states.
struct ReactionDodoView: View {
    enum Reaction { case none, happy, excited, thinking }
    var reaction: Reaction = .none
    var height: CGFloat = 84
    var seed: CGFloat = 7

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            Canvas { ctx, size in
                let t = CGFloat(timeline.date.timeIntervalSince(start))
                let wall = CGFloat(timeline.date.timeIntervalSinceReferenceDate)
                var pose = DodoMood.idle(wall, seed: seed, reduceMotion: reduceMotion)
                if !reduceMotion {
                    switch reaction {
                    case .happy where t < 1.4:
                        // A beat to land on screen, then the hop.
                        var p = DodoMood.happy((t - 0.35) / 0.7)
                        p.eyeScaleY = pose.eyeScaleY
                        pose = p
                    case .excited where t < 1.8:
                        var p = DodoMood.excited((t - 0.35) / 1.1)
                        p.scaleY *= pose.scaleY
                        pose = p
                    case .thinking:
                        let u = min(1, t / 0.8)
                        pose.rollDegrees += 3 * u
                        pose.pupilOffset = CGSize(width: -2 * u, height: -2 * u)
                        pose.leafSpread += -6 * u
                    default:
                        break
                    }
                }
                var g = ctx
                drawAnimatedDodo(&g, at: CGPoint(x: size.width / 2, y: size.height - 2), height: height, pose: pose)
            }
        }
        .frame(width: height * 1.1, height: height + 4)
        .allowsHitTesting(false)
    }
}

/// The one-second cold-start moment: the mascot pops in with a sprout
/// boing over butter paper, the wordmark fades up, then the whole thing
/// hands off to the app. Purely decorative — Reduce Motion gets a still.
struct LaunchSplashView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @State private var start = Date()

    var body: some View {
        content.onAppear { start = Date() }
    }

    // The v3 launch (branding/design: Dodo Launch v3):
    //   0.00  pop in from the feet (overshoot), ground shadow blooms with it
    //   0.40  sprout boing lags the landing; wing flap
    //   0.50  eyes open with a small overshoot, then a double blink at 1.15
    //   0.70  cheeks warm in
    //   0.80  wordmark rises, letter by letter
    //   1.50  a small hello hop, then settle into the idle loop
    private func pose(_ t: CGFloat) -> DodoPose {
        if reduceMotion {
            var p = DodoMood.idle(t, reduceMotion: true)
            p.eyeScaleY = 1
            return p
        }
        if t < 1.5 {
            var p = DodoPose()
            let pop = easeOutBack(max(0, min(1, t / 0.45)))
            p.scaleX = pop; p.scaleY = pop
            let su = max(0, t - 0.4)
            p.sproutAngle = 14 * exp(-3.4 * su) * sin(su * 15)
            p.wingAngle = 42 * bellPublic(su / 0.5) + 26 * bellPublic((su - 0.55) / 0.45)
            if t < 0.5 {
                p.eyeScaleY = 0.05
            } else {
                let ou = max(0, min(1, (t - 0.5) / 0.22))
                p.eyeScaleY = min(1, easeOutBack(ou))
                p.pupilScale = 1 + 0.15 * (1 - ou)
            }
            p.eyeScaleY = min(p.eyeScaleY, DodoMood.blinkShapePublic((t - 1.15) / 0.12),
                              DodoMood.blinkShapePublic((t - 1.37) / 0.12))
            p.cheekOpacity = 0.6 * max(0, min(1, (t - 0.7) / 0.3))
            return p
        }
        var a = DodoMood.idle(t)
        let hu = (t - 1.5) / 0.6
        if hu < 1.05 {
            let h = DodoMood.happy(hu)
            a.scaleX = h.scaleX; a.scaleY = h.scaleY; a.yOffset = h.yOffset * 0.8
            a.sproutAngle += h.sproutAngle; a.wingAngle = h.wingAngle; a.cheekOpacity = h.cheekOpacity
            if hu < 0.9 { a.eyeScaleY = 1 }
        }
        return a
    }

    private var content: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            TimelineView(.animation(minimumInterval: 1.0 / 40.0)) { timeline in
                let t = reduceMotion ? 3.0 : CGFloat(timeline.date.timeIntervalSince(start))
                SplashFrame(t: t, pose: pose(t), reduceMotion: reduceMotion, dark: colorScheme == .dark)
            }
        }
    }
}

/// One frame of the launch: ground, mascot, wordmark. Split into small
/// views — the Release compiler times out on one big expression.
private struct SplashFrame: View {
    let t: CGFloat
    let pose: DodoPose
    let reduceMotion: Bool
    let dark: Bool

    var body: some View {
        GeometryReader { geo in
            ZStack {
                SplashGround(t: t, reduceMotion: reduceMotion, dark: dark, size: geo.size)
                VStack(spacing: 14) {
                    SplashMascot(pose: pose, dark: dark)
                    SplashWordmark(t: t, reduceMotion: reduceMotion)
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .offset(y: -12)
            }
        }
    }
}

/// Peach bloom behind the bird, a faint sun up top, a slow breath in the
/// bloom, and a few drifting motes.
private struct SplashGround: View {
    let t: CGFloat
    let reduceMotion: Bool
    let dark: Bool
    let size: CGSize

    var body: some View {
        let bloom = Color(hex: dark ? 0x243038 : 0xFCE5D0)
        let sun = Color(hex: dark ? 0x6B4A14 : 0xF6C46A)
        let breath: Double = reduceMotion ? 0 : Double(0.35 + 0.35 * sin(t * 2 * CGFloat.pi / 6.4))
        ZStack {
            RadialGradient(colors: [sun, .clear], center: .init(x: 0.5, y: 0.16), startRadius: 0, endRadius: size.width * 0.36)
                .opacity(0.32)
            RadialGradient(colors: [bloom, .clear], center: .init(x: 0.5, y: 0.5), startRadius: 0, endRadius: size.width * 0.62)
            RadialGradient(colors: [bloom, .clear], center: .init(x: 0.5, y: 0.52), startRadius: 0, endRadius: size.width * 0.5)
                .opacity(breath)
            if !reduceMotion {
                SplashMotes(t: t, dark: dark)
            }
        }
        .frame(width: size.width, height: size.height)
        .ignoresSafeArea()
    }
}

private struct SplashMotes: View {
    let t: CGFloat
    let dark: Bool

    var body: some View {
        let mote = Color(hex: dark ? 0xF6C46A : 0xF0A830)
        Canvas { ctx, size in
            for i in 0..<5 {
                let fi = CGFloat(i)
                let period: CGFloat = 9 + 1.3 * fi
                let u = ((t + fi * 2.1) / period).truncatingRemainder(dividingBy: 1)
                let x = size.width * (0.33 + 0.075 * fi) + 12 * sin(t * 0.5 + fi)
                let y = size.height * 0.68 - u * size.height * 0.46
                let alpha: CGFloat = u < 0.12 ? u / 0.12 * 0.45 : 0.45 - 0.45 * (u - 0.12) / 0.88
                let r: CGFloat = 1.6 + 1.2 * u
                let rect = CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)
                ctx.fill(Path(ellipseIn: rect), with: .color(mote.opacity(Double(alpha))))
            }
        }
    }
}

/// The bird over its ground shadow (grows with the pop, tightens with the hop).
private struct SplashMascot: View {
    let pose: DodoPose
    let dark: Bool

    var body: some View {
        Canvas { ctx, size in
            var g = ctx
            let feet = CGPoint(x: size.width / 2, y: size.height - 6)
            let lift: CGFloat = max(0, min(1, -pose.yOffset / 26))
            let s: CGFloat = min(1, pose.scaleX)
            let rx: CGFloat = 29 * s * (1 - 0.35 * lift)
            let ry: CGFloat = 5 * s * (1 - 0.3 * lift)
            let shadowAlpha: Double = Double((dark ? 0.35 : 0.13) * (1 - 0.5 * lift))
            let rect = CGRect(x: feet.x - rx, y: feet.y + 3 - ry, width: 2 * rx, height: 2 * ry)
            g.fill(Path(ellipseIn: rect), with: .color(Color(hex: dark ? 0x000000 : 0x3E3324).opacity(shadowAlpha)))
            drawAnimatedDodo(&g, at: feet, height: 132, pose: pose)
        }
        .frame(width: 170, height: 150)
    }
}

/// Lowercase wordmark rising letter by letter (0.8s + 50ms stagger).
private struct SplashWordmark: View {
    let t: CGFloat
    let reduceMotion: Bool

    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<4, id: \.self) { i in
                let raw: CGFloat = (t - 0.8 - CGFloat(i) * 0.05) / 0.55
                let u: CGFloat = reduceMotion ? 1 : max(0, min(1, raw))
                Text(i % 2 == 0 ? "d" : "o")
                    .font(.custom("Fredoka", size: 34).weight(.semibold))
                    .foregroundStyle(FeyndTheme.text)
                    .opacity(Double(u))
                    .offset(y: 10 * (1 - easeOutBack(u)))
            }
        }
        .tracking(-0.6)
    }
}

private func bellPublic(_ u: CGFloat) -> CGFloat {
    u > 0 && u < 1 ? sin(u * .pi) : 0
}
