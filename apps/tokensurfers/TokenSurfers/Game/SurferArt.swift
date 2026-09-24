import SwiftUI

/// The surfer: Splat with legs. An orange paper starburst for a body, stubby
/// legs in chunky sneakers, mitten arms, a red scarf that streams toward the
/// camera, an antenna bulb and a goggles strap (the robot in it), and a navy
/// laptop backpack with a `>_` sticker. Drawn in world units (y up) into any
/// GraphicsContext: the runner draws its back, Home draws its face.
struct SurferPose {
    var phase: Double = 0          // run cycle, radians
    var lift: Double = 0           // height above the surface it stands on
    var vy: Double = 0
    var rolling: Double = 0        // seconds of roll left
    var rollSpin: Double = 0       // radians
    var lean: Double = 0           // radians (stumble)
    var sinceLanded: Double = 10
    var dead: Double = -1          // seconds since the crash; < 0 = alive
    var t: Double = 0              // clock for blinks and the bulb
    var front = false
    var mood: Mood = .happy
    var speed: Double = 0.5        // 0..1, scarf and lean

    enum Mood { case happy, wow, dead, cool }
}

enum SurferArt {
    static let r = 0.42                         // body radius, world units
    static let legLen = 0.30
    static let orange = Color(hex: 0xE9804F)
    static let dark = Color(hex: 0xC9602F)
    static let red = Color(hex: 0xE8402E)
    static let redDark = Color(hex: 0xB02A1C)
    static let navy = Color(hex: 0x1C1B34)
    static let ink = Color(hex: 0x17131F)
    static let green = Color(hex: 0x2FE08A)
    static let teal = Color(hex: 0x52C7C0)
    static let cream = Color(hex: 0xFFF6EA)
    static let pink = Color(hex: 0xF7A8C8)

    /// Standing height from the sole to the bulb, for layout.
    static let height = legLen + r * 2.0 + 0.35

    /// `origin` is the ground point under the character on screen; `unit` is
    /// pixels per world unit. y goes up inside.
    static func draw(_ ctx: inout GraphicsContext, origin: CGPoint, unit: CGFloat, pose p: SurferPose) {
        var c = ctx
        c.translateBy(x: origin.x, y: origin.y)
        c.scaleBy(x: unit, y: -unit)

        // Shadow on the surface, smaller the higher you are.
        let sh = max(0.35, 1 - p.lift * 0.22)
        c.fill(Path(ellipseIn: CGRect(x: -0.5 * sh, y: -0.09 * sh, width: 1.0 * sh, height: 0.18 * sh)),
               with: .color(.black.opacity(0.28)))

        if p.dead >= 0 { drawDead(&c, p); return }
        if p.rolling > 0 { drawRolling(&c, p); return }

        let air = p.lift > 0.03
        let bob = air ? 0 : 0.045 * abs(sin(p.phase))
        let squash = p.sinceLanded < 0.14 ? 1 - (0.14 - p.sinceLanded) * 1.4 : 1.0
        let bc = CGPoint(x: 0, y: p.lift + legLen + r * 0.85 + bob)

        var body = c
        body.translateBy(x: 0, y: bc.y)
        body.rotate(by: .radians(-p.lean * 0.9 - (air ? 0 : sin(p.phase) * 0.04)))
        body.scaleBy(x: 1 / squash, y: squash)
        body.translateBy(x: 0, y: -bc.y)

        if p.front { drawScarf(&body, bc: bc, p, behind: true) }
        drawLegs(&body, bc: bc, p, air: air)
        drawArms(&body, bc: bc, p, air: air)
        drawBody(&body, bc: bc, p)
        if p.front {
            drawFace(&body, bc: bc, p)
            drawGoggles(&body, bc: bc, p, down: p.mood == .cool)
        } else {
            drawBackpack(&body, bc: bc)
            drawStrap(&body, bc: bc)
        }
        drawAntenna(&body, bc: bc, p)
        if !p.front { drawScarf(&body, bc: bc, p, behind: false) }
    }

    // MARK: pieces

    private static func capsule(_ a: CGPoint, _ b: CGPoint, _ w: Double) -> Path {
        var p = Path()
        p.move(to: a); p.addLine(to: b)
        return p.strokedPath(StrokeStyle(lineWidth: w, lineCap: .round))
    }

    private static func drawBody(_ c: inout GraphicsContext, bc: CGPoint, _ p: SurferPose) {
        let rect = CGRect(x: bc.x - r, y: bc.y - r, width: 2 * r, height: 2 * r)
        let shape = SplatShape(wobble: p.phase * 0.5 + p.t * 0.3).path(in: rect)
        c.stroke(shape, with: .color(.white), style: StrokeStyle(lineWidth: 0.06, lineJoin: .round))
        c.fill(shape, with: .color(orange))
        var shade = c
        shade.clip(to: shape)
        shade.fill(Path(CGRect(x: bc.x - r, y: bc.y - r, width: 2 * r, height: r * 0.9)),
                   with: .linearGradient(Gradient(colors: [dark.opacity(0.45), dark.opacity(0)]),
                                         startPoint: CGPoint(x: 0, y: bc.y - r), endPoint: CGPoint(x: 0, y: bc.y - r * 0.1)))
        // the paper's inner disc
        c.fill(Path(ellipseIn: rect.insetBy(dx: r * 0.7, dy: r * 0.7)), with: .color(dark.opacity(p.front ? 0 : 0.35)))
    }

    private static func drawLegs(_ c: inout GraphicsContext, bc: CGPoint, _ p: SurferPose, air: Bool) {
        // The leg swinging forward is farther from the camera (drawn first, lifted).
        let sides: [Double] = sin(p.phase) > 0 ? [1, -1] : [-1, 1]
        for side in sides {
            let legPhase = p.phase + (side > 0 ? 0 : .pi)
            let swing = sin(legPhase)
            let hip = CGPoint(x: bc.x + side * 0.15, y: bc.y - r * 0.5)
            var foot: CGPoint
            if air {
                foot = CGPoint(x: hip.x + side * 0.06, y: p.lift + 0.2 + (p.vy > 0 ? 0.04 : 0))
            } else {
                foot = CGPoint(x: hip.x - swing * 0.03, y: p.lift + 0.06 + max(0, swing) * 0.24)
            }
            let far = air ? false : swing > 0
            let legW = far ? 0.12 : 0.14
            c.fill(capsule(hip, CGPoint(x: foot.x, y: foot.y + 0.08), legW), with: .color(far ? dark.opacity(0.85) : dark))
            drawSneaker(&c, at: foot, scale: far ? 0.88 : 1, front: p.front, side: side)
        }
    }

    private static func drawSneaker(_ c: inout GraphicsContext, at f: CGPoint, scale s: Double, front: Bool, side: Double) {
        let w = 0.27 * s, h = 0.16 * s
        let rect = CGRect(x: f.x - w / 2, y: f.y, width: w, height: h)
        let shoe = Path(roundedRect: rect, cornerRadius: h * 0.45)
        c.fill(shoe, with: .color(.white))
        c.stroke(shoe, with: .color(ink), lineWidth: 0.025)
        c.fill(Path(roundedRect: CGRect(x: rect.minX, y: rect.minY, width: w, height: h * 0.32), cornerRadius: h * 0.16),
               with: .color(ink))
        // stripe
        c.fill(Path(CGRect(x: f.x - w * 0.16, y: rect.minY + h * 0.38, width: w * 0.32, height: h * 0.2)),
               with: .color(orange))
        if front {
            for k in 0..<2 {
                c.fill(Path(CGRect(x: f.x - w * 0.2, y: rect.minY + h * 0.62 + Double(k) * h * 0.14, width: w * 0.4, height: 0.015)),
                       with: .color(ink.opacity(0.35)))
            }
        }
    }

    private static func drawArms(_ c: inout GraphicsContext, bc: CGPoint, _ p: SurferPose, air: Bool) {
        for side in [-1.0, 1.0] {
            let legPhase = p.phase + (side > 0 ? 0 : .pi)
            let swing = -sin(legPhase)
            let sh = CGPoint(x: bc.x + side * r * 0.78, y: bc.y + r * 0.05)
            let ang = air ? 1.15 : swing * 0.65 - 0.15
            let len = air ? 0.3 : 0.2 + 0.09 * abs(swing)
            let end = CGPoint(x: sh.x + side * len * cos(ang), y: sh.y + len * sin(ang))
            c.fill(capsule(sh, end, 0.12), with: .color(orange))
            c.stroke(capsule(sh, end, 0.12), with: .color(.white), lineWidth: 0.025)
            c.fill(Path(ellipseIn: CGRect(x: end.x - 0.075, y: end.y - 0.075, width: 0.15, height: 0.15)), with: .color(dark))
        }
    }

    private static func drawBackpack(_ c: inout GraphicsContext, bc: CGPoint) {
        let rect = CGRect(x: bc.x - 0.24, y: bc.y - r * 0.15 - 0.2, width: 0.48, height: 0.42)
        let bag = Path(roundedRect: rect, cornerRadius: 0.09)
        c.fill(bag, with: .color(navy))
        c.stroke(bag, with: .color(.white), lineWidth: 0.035)
        // flap
        c.fill(Path(roundedRect: CGRect(x: rect.minX + 0.04, y: rect.maxY - 0.15, width: 0.4, height: 0.12), cornerRadius: 0.05),
               with: .color(Color(hex: 0x2A2950)))
        // >_ sticker
        var chevron = Path()
        chevron.move(to: CGPoint(x: rect.minX + 0.12, y: rect.minY + 0.08))
        chevron.addLine(to: CGPoint(x: rect.minX + 0.2, y: rect.minY + 0.14))
        chevron.addLine(to: CGPoint(x: rect.minX + 0.12, y: rect.minY + 0.2))
        c.stroke(chevron, with: .color(green), style: StrokeStyle(lineWidth: 0.035, lineCap: .round, lineJoin: .round))
        c.fill(Path(CGRect(x: rect.minX + 0.24, y: rect.minY + 0.08, width: 0.11, height: 0.035)), with: .color(green))
    }

    private static func drawStrap(_ c: inout GraphicsContext, bc: CGPoint) {
        let y = bc.y + r * 0.32
        c.fill(capsule(CGPoint(x: bc.x - r * 0.72, y: y), CGPoint(x: bc.x + r * 0.72, y: y), 0.075), with: .color(ink))
        c.fill(Path(roundedRect: CGRect(x: bc.x - 0.055, y: y - 0.055, width: 0.11, height: 0.11), cornerRadius: 0.02),
               with: .color(Color(hex: 0x8A8AA0)))
    }

    private static func drawGoggles(_ c: inout GraphicsContext, bc: CGPoint, _ p: SurferPose, down: Bool) {
        let y = down ? bc.y + r * 0.02 : bc.y + r * 0.5
        c.fill(capsule(CGPoint(x: bc.x - r * 0.8, y: y), CGPoint(x: bc.x + r * 0.8, y: y), 0.07), with: .color(ink))
        for side in [-1.0, 1.0] {
            let lens = CGRect(x: bc.x + side * 0.17 - 0.11, y: y - 0.08, width: 0.22, height: 0.16)
            let path = Path(roundedRect: lens, cornerRadius: 0.06)
            c.fill(path, with: .color(down ? Color(hex: 0x2B7A78) : teal))
            c.stroke(path, with: .color(ink), lineWidth: 0.03)
            c.fill(Path(ellipseIn: CGRect(x: lens.minX + 0.03, y: lens.maxY - 0.07, width: 0.06, height: 0.035)),
                   with: .color(.white.opacity(0.8)))
        }
    }

    private static func drawFace(_ c: inout GraphicsContext, bc: CGPoint, _ p: SurferPose) {
        let blink = p.t.truncatingRemainder(dividingBy: 3.7) < 0.12 && p.mood == .happy
        let e = 0.1
        for side in [-1.0, 1.0] {
            let ex = bc.x + side * 0.16, ey = bc.y + r * 0.06
            switch p.mood {
            case .dead:
                var x = Path()
                x.move(to: CGPoint(x: ex - 0.07, y: ey - 0.07)); x.addLine(to: CGPoint(x: ex + 0.07, y: ey + 0.07))
                x.move(to: CGPoint(x: ex + 0.07, y: ey - 0.07)); x.addLine(to: CGPoint(x: ex - 0.07, y: ey + 0.07))
                c.stroke(x, with: .color(ink), style: StrokeStyle(lineWidth: 0.045, lineCap: .round))
            case .cool:
                break   // goggles are down
            default:
                if blink {
                    c.fill(capsule(CGPoint(x: ex - 0.06, y: ey), CGPoint(x: ex + 0.06, y: ey), 0.035), with: .color(ink))
                } else {
                    let big = p.mood == .wow ? 1.25 : 1.0
                    c.fill(Path(ellipseIn: CGRect(x: ex - e * 1.25 * big, y: ey - e * 1.25 * big, width: e * 2.5 * big, height: e * 2.5 * big)), with: .color(.white))
                    c.fill(Path(ellipseIn: CGRect(x: ex - e * big, y: ey - e * big, width: e * 2 * big, height: e * 2 * big)), with: .color(ink))
                    c.fill(Path(ellipseIn: CGRect(x: ex + e * 0.15, y: ey + e * 0.25, width: e * 0.7, height: e * 0.7)), with: .color(.white))
                }
            }
            // cheek
            c.fill(Path(ellipseIn: CGRect(x: bc.x + side * 0.3 - 0.07, y: bc.y - r * 0.12 - 0.035, width: 0.14, height: 0.07)),
                   with: .color(pink.opacity(0.85)))
        }
        // mouth
        switch p.mood {
        case .wow:
            c.fill(Path(ellipseIn: CGRect(x: bc.x - 0.05, y: bc.y - r * 0.32 - 0.06, width: 0.1, height: 0.12)), with: .color(ink))
        case .dead:
            c.fill(capsule(CGPoint(x: bc.x - 0.07, y: bc.y - r * 0.3), CGPoint(x: bc.x + 0.07, y: bc.y - r * 0.3), 0.035), with: .color(ink))
        default:
            var m = Path()
            m.move(to: CGPoint(x: bc.x - 0.08, y: bc.y - r * 0.22))
            m.addQuadCurve(to: CGPoint(x: bc.x + 0.08, y: bc.y - r * 0.22), control: CGPoint(x: bc.x, y: bc.y - r * 0.38))
            c.fill(m, with: .color(ink))
            if p.mood == .cool {
                c.fill(Path(ellipseIn: CGRect(x: bc.x - 0.03, y: bc.y - r * 0.33, width: 0.06, height: 0.04)), with: .color(red))
            }
        }
    }

    private static func drawAntenna(_ c: inout GraphicsContext, bc: CGPoint, _ p: SurferPose) {
        let base = CGPoint(x: bc.x, y: bc.y + r * 0.9)
        let tip = CGPoint(x: bc.x + sin(p.t * 7) * 0.05 - p.speed * 0.06, y: base.y + 0.26)
        c.fill(capsule(base, tip, 0.04), with: .color(ink))
        let pulse = 0.5 + 0.5 * sin(p.t * 5)
        c.fill(Path(ellipseIn: CGRect(x: tip.x - 0.14, y: tip.y - 0.14, width: 0.28, height: 0.28)),
               with: .color(Color(hex: 0xFFD53A).opacity(0.18 + 0.2 * pulse)))
        c.fill(Path(ellipseIn: CGRect(x: tip.x - 0.075, y: tip.y - 0.075, width: 0.15, height: 0.15)),
               with: .color(Color(hex: 0xFFD53A)))
        c.stroke(Path(ellipseIn: CGRect(x: tip.x - 0.075, y: tip.y - 0.075, width: 0.15, height: 0.15)),
                 with: .color(ink), lineWidth: 0.025)
    }

    /// Two red tails. The wind comes from the left, so behind the runner they
    /// whip off to the right at neck height, short and fluttering; on the
    /// front view they trail off to the sides.
    private static func drawScarf(_ c: inout GraphicsContext, bc: CGPoint, _ p: SurferPose, behind: Bool) {
        let knot = CGPoint(x: bc.x + (behind ? 0.06 : 0), y: bc.y + r * (behind ? 0.12 : 0.12))
        let wind = 0.6 + p.speed * 0.8
        let tails: [(Double, Double)] = behind ? [(1, 0.0), (1, -0.09)] : [(-1, 0), (1, 0)]
        for (dir, drop) in tails {
            var pts: [CGPoint] = [knot]
            for k in 1...4 {
                let kk = Double(k)
                let flutter = sin(p.t * 15 + kk * 1.1 + drop * 40) * 0.035 * kk * wind
                let q = behind
                    ? CGPoint(x: knot.x + dir * kk * 0.15, y: knot.y + drop * kk - kk * 0.02 - p.vy * 0.01 * kk + flutter)
                    : CGPoint(x: knot.x + dir * (0.2 + kk * 0.13), y: knot.y - kk * 0.03 + flutter)
                pts.append(q)
            }
            for pass in 0..<2 {
                for k in 0..<(pts.count - 1) {
                    let w = 0.11 - Double(k) * 0.013 + (pass == 0 ? 0.035 : 0)
                    c.fill(capsule(pts[k], pts[k + 1], w), with: .color(pass == 0 ? redDark : red))
                }
            }
        }
        c.fill(Path(ellipseIn: CGRect(x: knot.x - 0.075, y: knot.y - 0.065, width: 0.15, height: 0.13)), with: .color(red))
        c.stroke(Path(ellipseIn: CGRect(x: knot.x - 0.075, y: knot.y - 0.065, width: 0.15, height: 0.13)), with: .color(redDark), lineWidth: 0.02)
    }

    private static func drawRolling(_ c: inout GraphicsContext, _ p: SurferPose) {
        let bc = CGPoint(x: 0, y: p.lift + r * 0.8)
        var s = c
        s.translateBy(x: bc.x, y: bc.y)
        s.rotate(by: .radians(p.rollSpin))
        s.scaleBy(x: 1.15, y: 0.85)
        let rect = CGRect(x: -r, y: -r, width: 2 * r, height: 2 * r)
        let shape = SplatShape(wobble: 0).path(in: rect)
        s.stroke(shape, with: .color(.white), style: StrokeStyle(lineWidth: 0.06, lineJoin: .round))
        s.fill(shape, with: .color(orange))
        s.fill(Path(ellipseIn: rect.insetBy(dx: r * 0.7, dy: r * 0.7)), with: .color(dark.opacity(0.4)))
        // motion streaks
        for k in 0..<3 {
            let y = bc.y - 0.1 + Double(k) * 0.12
            c.fill(capsule(CGPoint(x: -r * 1.3, y: y), CGPoint(x: -r * 0.8 - Double(k) * 0.05, y: y), 0.03), with: .color(.white.opacity(0.7)))
        }
        drawScarf(&c, bc: CGPoint(x: 0, y: bc.y + 0.1), p, behind: true)
    }

    private static func drawDead(_ c: inout GraphicsContext, _ p: SurferPose) {
        let d = p.dead
        let arc = d < 1 ? 1.5 * sin(d * .pi) : 0
        let bc = CGPoint(x: 0, y: legLen + r * 0.85 + arc)
        var s = c
        s.translateBy(x: bc.x, y: bc.y)
        s.rotate(by: .radians(min(d, 1.1) * 8.5))
        s.translateBy(x: -bc.x, y: -bc.y)
        var q = p
        q.front = true
        q.mood = .dead
        q.lift = arc
        drawScarf(&s, bc: bc, q, behind: true)
        drawLegs(&s, bc: bc, q, air: true)
        drawArms(&s, bc: bc, q, air: true)
        drawBody(&s, bc: bc, q)
        drawFace(&s, bc: bc, q)
        drawGoggles(&s, bc: bc, q, down: false)
        drawAntenna(&s, bc: bc, q)
    }
}

/// The surfer as a SwiftUI view: front view running in place, for Home and
/// the cards. `unit` = pixels per world unit.
struct SurferHero: View {
    var unit: CGFloat = 80
    var mood: SurferPose.Mood = .happy
    var running = true
    var front = true

    var body: some View {
        TimelineView(.animation(paused: !running)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            Canvas { ctx, size in
                var p = SurferPose()
                p.t = t
                p.phase = running ? t * 9 : 0
                p.front = front
                p.mood = mood
                p.speed = 0.6
                SurferArt.draw(&ctx, origin: CGPoint(x: size.width / 2, y: size.height - unit * 0.12), unit: unit, pose: p)
            }
        }
        .frame(width: unit * 2.2, height: unit * (SurferArt.height + 0.25))
    }
}
