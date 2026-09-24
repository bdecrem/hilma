import SwiftUI

/// The surfer: Splat's tube-man cousin. A tall orange inflatable tube that
/// flops as it runs, two floppy arms flailing, a crown of three short rays
/// on top (the starburst in it) with the bulb on the middle one, a face high
/// on the tube, stubby legs in chunky sneakers. Drawn in world units
/// (y up) into any GraphicsContext: the runner draws its back, Home draws
/// its face.
struct SurferPose {
    var phase: Double = 0          // run cycle, radians
    var lift: Double = 0           // height above the surface it stands on
    var vy: Double = 0
    var rolling: Double = 0        // seconds of roll left
    var rollSpin: Double = 0       // radians
    var lean: Double = 0           // radians (stumble)
    var sinceLanded: Double = 10
    var dead: Double = -1          // seconds since the crash; < 0 = alive
    var t: Double = 0              // clock for blinks, the bulb and the flop
    var front = false
    var mood: Mood = .happy
    var speed: Double = 0.5        // 0..1, how hard the tube flops

    enum Mood { case happy, wow, dead, cool }
}

enum SurferArt {
    static let legLen = 0.28
    static let bodyH = 0.92
    static let halfW = 0.24
    static let orange = Color(hex: 0xE9804F)
    static let dark = Color(hex: 0xC9602F)
    static let ink = Color(hex: 0x17131F)
    static let yellow = Color(hex: 0xFFD53A)
    static let teal = Color(hex: 0x52C7C0)
    static let pink = Color(hex: 0xF7A8C8)

    /// Standing height from the sole to the crown, for layout.
    static let height = legLen + bodyH + 0.3

    /// `origin` is the ground point under the character on screen; `unit` is
    /// pixels per world unit. y goes up inside.
    static func draw(_ ctx: inout GraphicsContext, origin: CGPoint, unit: CGFloat, pose p: SurferPose) {
        var c = ctx
        c.translateBy(x: origin.x, y: origin.y)
        c.scaleBy(x: unit, y: -unit)

        let sh = max(0.35, 1 - p.lift * 0.22)
        c.fill(Path(ellipseIn: CGRect(x: -0.42 * sh, y: -0.08 * sh, width: 0.84 * sh, height: 0.16 * sh)),
               with: .color(.black.opacity(0.28)))

        if p.dead >= 0 { drawDead(&c, p); return }
        if p.rolling > 0 { drawRolling(&c, p); return }

        let air = p.lift > 0.03
        let squash = p.sinceLanded < 0.14 ? 1 - (0.14 - p.sinceLanded) * 1.3 : 1.0
        let stretch = air ? 1.08 : 1.0
        let base = CGPoint(x: 0, y: p.lift + legLen)

        var body = c
        body.translateBy(x: base.x, y: base.y)
        body.rotate(by: .radians(-p.lean * 0.8))
        body.scaleBy(x: 1 / (squash * stretch), y: squash * stretch)
        body.translateBy(x: -base.x, y: -base.y)

        let tube = Tube(pose: p, base: base, air: air)
        drawLegs(&body, tube: tube, p, air: air)
        drawTube(&body, tube: tube, p)
        drawArms(&body, tube: tube, p, air: air)
        drawCrown(&body, tube: tube, p)
        if p.front {
            drawFace(&body, tube: tube, p)
        } else {
            drawSeam(&body, tube: tube)
        }
    }

    // MARK: the tube

    /// The wobbling centreline: the bottom is planted, the top flops.
    struct Tube {
        let base: CGPoint
        let amp: Double
        let omega: Double
        let t: Double
        let lean: Double
        let height: Double

        init(pose p: SurferPose, base: CGPoint, air: Bool) {
            self.base = base
            amp = (air ? 0.05 : 0.08) + p.speed * 0.06
            omega = air ? 4 : 9
            t = p.t
            lean = air ? -0.05 : -0.08 - p.speed * 0.06
            height = bodyH
        }

        func x(_ u: Double) -> Double { amp * sin(omega * t - u * 2.4) * pow(u, 1.3) + lean * u * u }
        func y(_ u: Double) -> Double { base.y + height * u }
        func w(_ u: Double) -> Double { halfW * (1 - 0.14 * u) }
        func point(_ u: Double, _ side: Double) -> CGPoint { CGPoint(x: base.x + x(u) + side * w(u), y: y(u)) }
        func center(_ u: Double) -> CGPoint { CGPoint(x: base.x + x(u), y: y(u)) }

        var path: Path {
            var p = Path()
            let n = 14
            p.move(to: point(0, -1))
            for k in 1...n { p.addLine(to: point(Double(k) / Double(n), -1)) }
            let top = center(1)
            p.addQuadCurve(to: point(1, 1), control: CGPoint(x: top.x, y: top.y + w(1) * 1.1))
            for k in stride(from: n - 1, through: 0, by: -1) { p.addLine(to: point(Double(k) / Double(n), 1)) }
            let bottom = center(0)
            p.addQuadCurve(to: point(0, -1), control: CGPoint(x: bottom.x, y: bottom.y - w(0) * 0.9))
            p.closeSubpath()
            return p
        }
    }

    private static func capsule(_ a: CGPoint, _ b: CGPoint, _ w: Double) -> Path {
        var p = Path()
        p.move(to: a); p.addLine(to: b)
        return p.strokedPath(StrokeStyle(lineWidth: w, lineCap: .round))
    }

    private static func drawTube(_ c: inout GraphicsContext, tube: Tube, _ p: SurferPose) {
        let shape = tube.path
        c.stroke(shape, with: .color(.white), style: StrokeStyle(lineWidth: 0.06, lineJoin: .round))
        c.fill(shape, with: .color(orange))
        // light from the left: a darker band down the right side, and a soft top highlight
        var shade = c
        shade.clip(to: shape)
        let left = tube.base.x - halfW - 0.2, right = tube.base.x + halfW + 0.25
        shade.fill(Path(CGRect(x: left, y: tube.base.y - 0.1, width: right - left, height: bodyH + 0.3)),
                   with: .linearGradient(Gradient(stops: [.init(color: .white.opacity(0.12), location: 0.15),
                                                          .init(color: .clear, location: 0.45),
                                                          .init(color: dark.opacity(0.42), location: 0.85)]),
                                         startPoint: CGPoint(x: left, y: 0), endPoint: CGPoint(x: right, y: 0)))
        // seams every third of the way up, like an inflatable
        for u in [0.34, 0.67] {
            var seam = Path()
            seam.move(to: tube.point(u, -1))
            seam.addQuadCurve(to: tube.point(u, 1), control: CGPoint(x: tube.center(u).x, y: tube.center(u).y - 0.05))
            shade.stroke(seam, with: .color(dark.opacity(0.35)), lineWidth: 0.02)
        }
    }

    private static func drawSeam(_ c: inout GraphicsContext, tube: Tube) {
        var seam = Path()
        seam.move(to: tube.center(0.05))
        for k in 1...10 { seam.addLine(to: tube.center(0.05 + Double(k) * 0.09)) }
        c.stroke(seam, with: .color(dark.opacity(0.5)), style: StrokeStyle(lineWidth: 0.025, lineCap: .round))
    }

    private static func drawCrown(_ c: inout GraphicsContext, tube: Tube, _ p: SurferPose) {
        let top = tube.center(1)
        let flop = tube.amp * sin(tube.omega * p.t - 2.4) * 0.6
        let rays: [(Double, Double)] = [(-0.75, 0.2), (0.75, 0.2), (flop * 2, 0.27)]   // (angle from up, length)
        for (i, ray) in rays.enumerated() {
            let (a, len) = ray
            let tip = CGPoint(x: top.x + sin(a) * len, y: top.y + cos(a) * len - 0.02)
            let root = CGPoint(x: top.x + sin(a) * 0.04, y: top.y - 0.06)
            c.fill(capsule(root, tip, 0.15), with: .color(.white))
            c.fill(capsule(root, tip, 0.1), with: .color(i == 2 ? orange : orange))
            if i == 2 {
                let pulse = 0.5 + 0.5 * sin(p.t * 5)
                c.fill(Path(ellipseIn: CGRect(x: tip.x - 0.15, y: tip.y - 0.15, width: 0.3, height: 0.3)),
                       with: .color(yellow.opacity(0.18 + 0.2 * pulse)))
                c.fill(Path(ellipseIn: CGRect(x: tip.x - 0.08, y: tip.y - 0.08, width: 0.16, height: 0.16)), with: .color(yellow))
                c.stroke(Path(ellipseIn: CGRect(x: tip.x - 0.08, y: tip.y - 0.08, width: 0.16, height: 0.16)), with: .color(ink), lineWidth: 0.025)
            }
        }
    }

    /// Two floppy tube arms, four segments each, flailing.
    private static func drawArms(_ c: inout GraphicsContext, tube: Tube, _ p: SurferPose, air: Bool) {
        let ua = 0.74
        for side in [-1.0, 1.0] {
            var q = tube.point(ua, side)
            q.x -= side * 0.03
            let lens = [0.22, 0.2, 0.18, 0.15]
            var angle = air ? 0.35 : 0.95            // from straight up, outward
            let wave = p.t * (air ? 6 : 9) + (side > 0 ? 0 : 1.9)
            for (i, len) in lens.enumerated() {
                let bend = sin(wave + Double(i) * 1.25) * (air ? 0.35 : 0.55)
                angle += bend
                let next = CGPoint(x: q.x + side * sin(angle) * len, y: q.y + cos(angle) * len)
                let w = 0.13 - Double(i) * 0.015
                c.fill(capsule(q, next, w + 0.04), with: .color(.white))
                c.fill(capsule(q, next, w), with: .color(i % 2 == 0 ? orange : Color(hex: 0xF0985F)))
                q = next
            }
            c.fill(Path(ellipseIn: CGRect(x: q.x - 0.075, y: q.y - 0.075, width: 0.15, height: 0.15)), with: .color(dark))
        }
    }

    private static func drawLegs(_ c: inout GraphicsContext, tube: Tube, _ p: SurferPose, air: Bool) {
        let sides: [Double] = sin(p.phase) > 0 ? [1, -1] : [-1, 1]
        for side in sides {
            let legPhase = p.phase + (side > 0 ? 0 : .pi)
            let swing = sin(legPhase)
            let hip = CGPoint(x: tube.base.x + side * 0.12, y: tube.base.y + 0.06)
            let foot: CGPoint = air
                ? CGPoint(x: hip.x + side * 0.05, y: p.lift + 0.2 + (p.vy > 0 ? 0.04 : 0))
                : CGPoint(x: hip.x - swing * 0.03, y: p.lift + 0.06 + max(0, swing) * 0.22)
            let far = air ? false : swing > 0
            c.fill(capsule(hip, CGPoint(x: foot.x, y: foot.y + 0.08), far ? 0.12 : 0.14), with: .color(far ? dark.opacity(0.85) : dark))
            drawSneaker(&c, at: foot, scale: far ? 0.88 : 1, front: p.front)
        }
    }

    private static func drawSneaker(_ c: inout GraphicsContext, at f: CGPoint, scale s: Double, front: Bool) {
        let w = 0.27 * s, h = 0.16 * s
        let rect = CGRect(x: f.x - w / 2, y: f.y, width: w, height: h)
        let shoe = Path(roundedRect: rect, cornerRadius: h * 0.45)
        c.fill(shoe, with: .color(.white))
        c.stroke(shoe, with: .color(ink), lineWidth: 0.025)
        c.fill(Path(roundedRect: CGRect(x: rect.minX, y: rect.minY, width: w, height: h * 0.32), cornerRadius: h * 0.16), with: .color(ink))
        c.fill(Path(CGRect(x: f.x - w * 0.16, y: rect.minY + h * 0.38, width: w * 0.32, height: h * 0.2)), with: .color(orange))
        if front {
            for k in 0..<2 {
                c.fill(Path(CGRect(x: f.x - w * 0.2, y: rect.minY + h * 0.62 + Double(k) * h * 0.14, width: w * 0.4, height: 0.015)),
                       with: .color(ink.opacity(0.35)))
            }
        }
    }

    private static func drawFace(_ c: inout GraphicsContext, tube: Tube, _ p: SurferPose) {
        let blink = p.t.truncatingRemainder(dividingBy: 3.7) < 0.12 && p.mood == .happy
        let e = 0.085
        let eyeC = tube.center(0.76)
        for side in [-1.0, 1.0] {
            let ex = eyeC.x + side * 0.1, ey = eyeC.y
            switch p.mood {
            case .dead:
                var x = Path()
                x.move(to: CGPoint(x: ex - 0.06, y: ey - 0.06)); x.addLine(to: CGPoint(x: ex + 0.06, y: ey + 0.06))
                x.move(to: CGPoint(x: ex + 0.06, y: ey - 0.06)); x.addLine(to: CGPoint(x: ex - 0.06, y: ey + 0.06))
                c.stroke(x, with: .color(ink), style: StrokeStyle(lineWidth: 0.04, lineCap: .round))
            case .cool:
                let lens = CGRect(x: ex - 0.09, y: ey - 0.06, width: 0.18, height: 0.12)
                c.fill(Path(roundedRect: lens, cornerRadius: 0.05), with: .color(ink))
                c.fill(Path(ellipseIn: CGRect(x: lens.minX + 0.03, y: lens.maxY - 0.05, width: 0.05, height: 0.03)), with: .color(.white.opacity(0.7)))
            default:
                if blink {
                    c.fill(capsule(CGPoint(x: ex - 0.05, y: ey), CGPoint(x: ex + 0.05, y: ey), 0.03), with: .color(ink))
                } else {
                    let big = p.mood == .wow ? 1.25 : 1.0
                    c.fill(Path(ellipseIn: CGRect(x: ex - e * 1.25 * big, y: ey - e * 1.25 * big, width: e * 2.5 * big, height: e * 2.5 * big)), with: .color(.white))
                    c.fill(Path(ellipseIn: CGRect(x: ex - e * big, y: ey - e * big, width: e * 2 * big, height: e * 2 * big)), with: .color(ink))
                    c.fill(Path(ellipseIn: CGRect(x: ex + e * 0.15, y: ey + e * 0.25, width: e * 0.6, height: e * 0.6)), with: .color(.white))
                }
            }
            let cheek = tube.center(0.64)
            c.fill(Path(ellipseIn: CGRect(x: cheek.x + side * 0.16 - 0.06, y: cheek.y - 0.03, width: 0.12, height: 0.06)), with: .color(pink.opacity(0.85)))
        }
        if p.mood == .cool {
            let bridge = tube.center(0.76)
            c.fill(Path(CGRect(x: bridge.x - 0.02, y: bridge.y - 0.01, width: 0.04, height: 0.02)), with: .color(ink))
        }
        let m = tube.center(0.6)
        switch p.mood {
        case .wow:
            c.fill(Path(ellipseIn: CGRect(x: m.x - 0.045, y: m.y - 0.06, width: 0.09, height: 0.11)), with: .color(ink))
        case .dead:
            c.fill(capsule(CGPoint(x: m.x - 0.06, y: m.y), CGPoint(x: m.x + 0.06, y: m.y), 0.03), with: .color(ink))
        default:
            var smile = Path()
            smile.move(to: CGPoint(x: m.x - 0.08, y: m.y + 0.03))
            smile.addQuadCurve(to: CGPoint(x: m.x + 0.08, y: m.y + 0.03), control: CGPoint(x: m.x, y: m.y - 0.09))
            c.fill(smile, with: .color(ink))
            if p.mood == .cool {
                c.fill(Path(ellipseIn: CGRect(x: m.x - 0.025, y: m.y - 0.04, width: 0.05, height: 0.035)), with: .color(Color(hex: 0xE8402E)))
            }
        }
    }

    private static func drawRolling(_ c: inout GraphicsContext, _ p: SurferPose) {
        // curled into a ball, crown spinning with it
        let bc = CGPoint(x: 0, y: p.lift + 0.42)
        var s = c
        s.translateBy(x: bc.x, y: bc.y)
        s.rotate(by: .radians(p.rollSpin))
        let ball = Path(ellipseIn: CGRect(x: -0.44, y: -0.36, width: 0.88, height: 0.72))
        s.stroke(ball, with: .color(.white), lineWidth: 0.06)
        s.fill(ball, with: .color(orange))
        var shade = s
        shade.clip(to: ball)
        shade.fill(Path(CGRect(x: 0.05, y: -0.4, width: 0.5, height: 0.8)), with: .color(dark.opacity(0.35)))
        for a in [-0.75, 0.0, 0.75] {
            let tip = CGPoint(x: sin(a) * 0.5, y: cos(a) * 0.5)
            s.fill(capsule(CGPoint(x: sin(a) * 0.3, y: cos(a) * 0.3), tip, 0.14), with: .color(.white))
            s.fill(capsule(CGPoint(x: sin(a) * 0.3, y: cos(a) * 0.3), tip, 0.09), with: .color(orange))
        }
        for k in 0..<3 {
            let y = bc.y - 0.1 + Double(k) * 0.12
            c.fill(capsule(CGPoint(x: -0.75, y: y), CGPoint(x: -0.5 - Double(k) * 0.04, y: y), 0.03), with: .color(.white.opacity(0.7)))
        }
    }

    private static func drawDead(_ c: inout GraphicsContext, _ p: SurferPose) {
        let d = p.dead
        let arc = d < 1 ? 1.5 * sin(d * .pi) : 0
        let pivot = CGPoint(x: 0, y: legLen + bodyH * 0.5 + arc)
        var s = c
        s.translateBy(x: pivot.x, y: pivot.y)
        s.rotate(by: .radians(min(d, 1.1) * 8.5))
        s.translateBy(x: -pivot.x, y: -pivot.y)
        var q = p
        q.front = true
        q.mood = .dead
        q.lift = arc
        q.speed = 0
        let tube = Tube(pose: q, base: CGPoint(x: 0, y: arc + legLen), air: true)
        drawLegs(&s, tube: tube, q, air: true)
        drawTube(&s, tube: tube, q)
        drawArms(&s, tube: tube, q, air: true)
        drawCrown(&s, tube: tube, q)
        drawFace(&s, tube: tube, q)
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
                p.speed = running ? 0.5 : 0.1
                SurferArt.draw(&ctx, origin: CGPoint(x: size.width / 2, y: size.height - unit * 0.12), unit: unit, pose: p)
            }
        }
        .frame(width: unit * 2.2, height: unit * (SurferArt.height + 0.2))
    }
}
