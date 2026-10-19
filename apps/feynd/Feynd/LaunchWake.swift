import SwiftUI
import AVFoundation
import CoreText
import UIKit

// The launch: "Wake Up" (2026-10-19). The dodo sleeps on its level stone in
// pre-dawn light, peeks, yawns, its tuft springs up, a happy shake, then the
// wordmark and a gentle push into the app's paper. Light and dark (dusk with
// a moonlit rim). Source of truth: misc/dodo-redesign/launch/dodo-launch-wake.html
// (and PORT_NOTES.md); every function below is a line-for-line port of the
// one with the same name there, drawn into CoreGraphics so two-circle radial
// gradients match the canvas exactly. Frames are pure functions of time.
// The score is baked from the page's own synth by
// scripts/dodo-launch/bake-audio.mjs (Sounds/launch-wake*.m4a).

struct LaunchSplashView: View {
    var onFinish: () -> Void = {}
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    /// Starts on the first frame actually drawn, not on appear: at cold start
    /// the main thread is busy for a moment and the opening beats would be
    /// lost under the system launch screen. The score starts with it.
    @State private var clock = SplashClock()
    @State private var skipAt: Double?
    @State private var player: AVAudioPlayer?
    @State private var finished = false

    /// `-SplashT <seconds>` (simulator) freezes the scene at that time.
    private var frozenT: Double? {
        #if targetEnvironment(simulator)
        if let s = UserDefaults.standard.string(forKey: "SplashT"), let v = Double(s) { return v }
        #endif
        return nil
    }
    private var holding: Bool {
        #if targetEnvironment(simulator)
        return UserDefaults.standard.bool(forKey: "HoldSplash")
        #else
        return false
        #endif
    }

    var body: some View {
        let night = colorScheme == .dark
        let reduce = reduceMotion
        TimelineView(.animation) { tl in
            let t = frozenT ?? clock.time(at: tl.date, onStart: { if frozenT == nil { playScore() } })
            Canvas(rendersAsynchronously: false) { ctx, size in
                #if DEBUG
                let c0 = CFAbsoluteTimeGetCurrent()
                #endif
                ctx.withCGContext { cg in
                    LaunchWake.drawFrame(cg, size: size, t: t, night: night, reduce: reduce, skipAt: skipAt)
                }
                #if DEBUG
                clock.log(CFAbsoluteTimeGetCurrent() - c0)
                #endif
            }
            .onChange(of: t >= LaunchWake.endTime(reduce: reduce, skipAt: skipAt)) { _, done in
                if done { finish() }
            }
        }
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture { skip() }
        .accessibilityLabel("Dodo")
    }

    private func skip() {
        guard let t = clock.now, skipAt == nil, frozenT == nil,
              t < (reduceMotion ? LaunchWake.rbExit : LaunchWake.bExit) else { return }
        skipAt = t
        player?.setVolume(0, fadeDuration: 0.1)
    }

    private func finish() {
        guard !finished, !holding, frozenT == nil else { return }
        finished = true
        #if DEBUG
        clock.report()
        #endif
        onFinish()
    }

    /// Ambient, mixes with other audio, respects the silent switch — and
    /// never touches a session that is already recording.
    private func playScore() {
        let name = reduceMotion ? "launch-wake-reduce" : "launch-wake"
        guard let url = Bundle.main.url(forResource: name, withExtension: "m4a") else { return }
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord {
            try? session.setCategory(.ambient, options: [.mixWithOthers])
            try? session.setActive(true)
        }
        guard let p = try? AVAudioPlayer(contentsOf: url) else { return }
        p.prepareToPlay()
        p.play()
        player = p
    }
}

/// A plain reference type: setting it from inside the timeline never re-renders.
final class SplashClock {
    private var start: Date?
    var now: Double? { start.map { Date().timeIntervalSince($0) } }
    func time(at date: Date, onStart: @escaping () -> Void) -> Double {
        if let s = start { return max(0, date.timeIntervalSince(s)) }
        start = date
        DispatchQueue.main.async(execute: onStart)
        return 0
    }
    #if DEBUG
    private var costs: [Double] = []
    func log(_ c: Double) { costs.append(c) }
    func report() {
        guard !costs.isEmpty else { return }
        let ms = costs.map { $0 * 1000 }.sorted()
        print(String(format: "LaunchWake: %d frames, draw median %.1f ms, p95 %.1f ms, max %.1f ms",
                     ms.count, ms[ms.count / 2], ms[Int(Double(ms.count) * 0.95)], ms.last!))
    }
    #endif
}

enum LaunchWake {
    // ---- the score's beats (CUES / R_CUES) ----
    static let bZ = 0.15, bLight = 0.80, bBlink1 = 1.34, bBlink2 = 1.42, bTuft = 1.88, bShake = 1.97
    static let bWord = 2.15, bAwake = 2.21, bLand = 2.41, bExit = 2.72, bEnd = 3.07   // land → exit = the 0.31 s hold
    static let rbWake = 0.60, rbWord = 0.95, rbExit = 1.90, rbEnd = 2.25
    static let skipExit = 0.3
    static let sleepT = 0.3, awakeT = 2.42

    static func endTime(reduce: Bool, skipAt: Double?) -> Double {
        let v = reduce ? rbEnd : bEnd
        if let s = skipAt { return min(v, s + skipExit) }
        return v
    }

    // ---- geometry ----
    static let W: CGFloat = 390, H: CGFloat = 844
    // Layout, moved down from the page's (2026-10-19, Bart: "too much near the top").
    // The page's lockup ran from the tuft (y 305) to the wordmark baseline (560): its
    // middle at 51 % of the stage, but the bird carries the weight, so it read high, and
    // the phone's status bar (62 pt) vs home bar (34 pt) puts the usable middle lower
    // still. Now everything that belongs to the bird moves down 36 pt and the wordmark
    // tucks 10 pt closer to the stone (74 → 64 pt from the stone's foot to the "d"):
    // tuft 341, bird's middle 396 (47 %, just above center, where a heavy shape sits
    // calm), baseline 586; the lockup's middle at 55 % on an iPhone Air.
    static let drop: CGFloat = 36
    static let stoneX: CGFloat = 195, stoneY: CGFloat = 414 + drop, stoneRX: CGFloat = 44, stoneRY: CGFloat = 15, stoneTH: CGFloat = 13
    static let stoneColor = 0xFF9F4A
    static let dodoS: CGFloat = 1.3
    static let wmSize: CGFloat = 60, wmBaseline: CGFloat = 560 + drop - 10, wmRise: CGFloat = 8
    static let faceY: CGFloat = 360 + drop
    static let skyPre = (0xEAD7D2, 0xE5B6A9), skyDay = (0xFFECD6, 0xFFC9A6), skyNight = (0x3A2850, 0x17131D)
    static let paperDay = 0xF8F2F8, paperNight = 0x17131D
    static let inkDay = 0x2D2537, inkNight = 0xF3EBF6

    struct Star { let x, y, r, a: CGFloat }
    static let stars: [Star] = {
        var R = PWRng(2026), out: [Star] = []
        var i = 0
        while i < 400 && out.count < 7 {
            let x = 30 + R.next() * 330, y = 50 + R.next() * 220
            if abs(x - 195) > 70 { out.append(Star(x: x, y: y, r: 0.7 + R.next() * 0.8, a: 0.28 + R.next() * 0.26)) }
            i += 1
        }
        return out
    }()

    // ---- math ----
    static func clamp(_ x: CGFloat, _ a: CGFloat = 0, _ b: CGFloat = 1) -> CGFloat { max(a, min(b, x)) }
    static func smooth(_ a: CGFloat, _ b: CGFloat, _ x: CGFloat) -> CGFloat { let t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
    static func easeOutCubic(_ t: CGFloat) -> CGFloat { 1 - pow(1 - t, 3) }
    static func easeInOut(_ t: CGFloat) -> CGFloat { t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2 }
    static func wob(_ t: CGFloat, _ A: CGFloat, _ k: CGFloat, _ f: CGFloat) -> CGFloat { t < 0 ? 0 : A * exp(-k * t) * sin(2 * .pi * f * t) }
    static func tri(_ t: CGFloat, _ c: CGFloat, _ w: CGFloat) -> CGFloat { clamp(1 - abs(t - c) / w) }
    static func bump(_ t: CGFloat, _ t0: CGFloat, _ d: CGFloat) -> CGFloat { pow(sin(.pi * clamp((t - t0) / d)), 2) }

    // ---- color ----
    typealias RGB = (CGFloat, CGFloat, CGFloat)
    static func rgb(_ h: Int) -> RGB { (CGFloat(h >> 16 & 255), CGFloat(h >> 8 & 255), CGFloat(h & 255)) }
    static func mix(_ a: RGB, _ b: RGB, _ t: CGFloat) -> RGB {
        // the page rounds through hex
        (((a.0 + (b.0 - a.0) * t)).rounded(), ((a.1 + (b.1 - a.1) * t)).rounded(), ((a.2 + (b.2 - a.2) * t)).rounded())
    }
    static func shade(_ c: RGB, _ t: CGFloat) -> RGB { t >= 0 ? mix(c, (255, 255, 255), t) : mix(c, (26, 15, 36), -t) }
    static func col(_ c: RGB, _ a: CGFloat = 1) -> CGColor { CGColor(srgbRed: c.0 / 255, green: c.1 / 255, blue: c.2 / 255, alpha: a) }
    static func col(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat) -> CGColor { CGColor(srgbRed: r / 255, green: g / 255, blue: b / 255, alpha: a) }
    static func col(_ h: Int, _ a: CGFloat = 1) -> CGColor { col(rgb(h), a) }

    static let space = CGColorSpace(name: CGColorSpace.sRGB)!
    static func grad(_ stops: [(CGFloat, CGColor)]) -> CGGradient {
        CGGradient(colorsSpace: space, colors: stops.map(\.1) as CFArray, locations: stops.map(\.0))!
    }
    static let pad: CGGradientDrawingOptions = [.drawsBeforeStartLocation, .drawsAfterEndLocation]

    /// Fills the current clip (call inside save/clip) with a canvas-style radial gradient.
    static func radial(_ cg: CGContext, _ x0: CGFloat, _ y0: CGFloat, _ r0: CGFloat, _ x1: CGFloat, _ y1: CGFloat, _ r1: CGFloat, _ stops: [(CGFloat, CGColor)]) {
        cg.drawRadialGradient(grad(stops), startCenter: CGPoint(x: x0, y: y0), startRadius: r0,
                              endCenter: CGPoint(x: x1, y: y1), endRadius: r1, options: pad)
    }
    static func linear(_ cg: CGContext, _ x0: CGFloat, _ y0: CGFloat, _ x1: CGFloat, _ y1: CGFloat, _ stops: [(CGFloat, CGColor)]) {
        cg.drawLinearGradient(grad(stops), start: CGPoint(x: x0, y: y0), end: CGPoint(x: x1, y: y1), options: pad)
    }
    /// Fill `path` with a gradient painter.
    static func fill(_ cg: CGContext, _ path: CGPath, _ paint: (CGContext) -> Void) {
        cg.saveGState(); cg.addPath(path); cg.clip(); paint(cg); cg.restoreGState()
    }
    /// Stroke `path` (line width w) with a gradient painter.
    static func strokeGrad(_ cg: CGContext, _ path: CGPath, _ w: CGFloat, _ paint: (CGContext) -> Void) {
        cg.saveGState(); cg.addPath(path); cg.setLineWidth(w); cg.replacePathWithStrokedPath(); cg.clip(); paint(cg); cg.restoreGState()
    }

    static func ellipsePath(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ rot: CGFloat = 0) -> CGPath {
        let rx = max(0.01, rx), ry = max(0.01, ry)
        var t = CGAffineTransform(translationX: x, y: y).rotated(by: rot)
        return CGPath(ellipseIn: CGRect(x: -rx, y: -ry, width: 2 * rx, height: 2 * ry), transform: &t)
    }
    static func ell(_ cg: CGContext, _ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ c: CGColor, _ rot: CGFloat = 0) {
        cg.addPath(ellipsePath(x, y, rx, ry, rot)); cg.setFillColor(c); cg.fillPath()
    }
    static func hl(_ cg: CGContext, _ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ rot: CGFloat = -0.5, _ a: CGFloat = 0.8) {
        ell(cg, x, y, rx, ry, col(255, 255, 255, a), rot)
    }
    /// Canvas `ellipse(x, y, rx, ry, 0, a0, a1, anticlockwise)` appended to a path.
    static func arcE(_ p: CGMutablePath, _ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ a0: CGFloat, _ a1: CGFloat, _ anti: Bool = false) {
        p.addArc(center: .zero, radius: 1, startAngle: a0, endAngle: a1, clockwise: anti,
                 transform: CGAffineTransform(translationX: x, y: y).scaledBy(x: rx, y: ry))
    }
    static func contact(_ cg: CGContext, _ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ a: CGFloat = 0.26) {
        cg.saveGState()
        cg.translateBy(x: x, y: y); cg.scaleBy(x: 1, y: ry / rx)
        cg.addEllipse(in: CGRect(x: -rx, y: -rx, width: 2 * rx, height: 2 * rx)); cg.clip()
        radial(cg, 0, 0, 0, 0, 0, rx, [(0, col(40, 25, 70, a)), (1, col(40, 25, 70, 0))])
        cg.restoreGState()
    }

    // ---- the jelly dodo ----
    static let dA: CGFloat = 39.52, dT: CGFloat = 35.94, dB: CGFloat = 41.97, dN: CGFloat = 2.32, foot: CGFloat = 42.7
    static let bumps: [(CGFloat, CGFloat, CGFloat)] = [(-1.534, 7.12, 0.079), (-0.463, 6.44, 0.089), (0.323, 5.45, 0.158),
                                                        (1.144, 3.82, 0.119), (1.993, 3.78, 0.117), (2.825, 5.40, 0.163)]

    struct Pose {
        var sy: CGFloat = 1, sx: CGFloat = 1, roll: CGFloat = -0.035, blink: CGFloat = 0, squint: CGFloat = 0, mouth: CGFloat = 0
        var eyePop: CGFloat = 1, lookX: CGFloat = 0, lookY: CGFloat = 0
        var tuftDA: CGFloat = -0.55, tuftAmp: CGFloat = 0.95, tuftW: CGFloat = 1.3, wing: CGFloat = 0, blush: CGFloat = 1
        var eyes: (CGFloat, CGFloat) = (0, 0), dx: CGFloat = 0
        var rim: CGFloat = 0, rimCol: RGB = (255, 222, 170)
    }

    static func dodoPath(_ p: Pose) -> CGPath {
        let e = 2 / dN
        var b = bumps
        b[0].0 += p.tuftDA; b[0].1 *= p.tuftAmp; b[0].2 *= p.tuftW
        let w = p.wing
        b[2].0 -= 0.32 * w; b[2].1 += 1.8 * w; b[5].0 += 0.32 * w; b[5].1 += 1.8 * w
        let path = CGMutablePath()
        for i in 0...360 {
            let t = CGFloat(i) / 360 * 2 * .pi, c = cos(t), s = sin(t)
            var x = dA * (c < 0 ? -1 : c > 0 ? 1 : 0) * pow(abs(c), e)
            var y = (s < 0 ? dT : dB) * (s < 0 ? -1 : s > 0 ? 1 : 0) * pow(abs(s), e)
            var add: CGFloat = 0
            for (ang, amp, wd) in b {
                let d = atan2(sin(t - ang), cos(t - ang))
                add += amp * exp(-(d * d) / (2 * wd * wd))
            }
            let m = hypot(x, y) == 0 ? 1 : hypot(x, y)
            x += x / m * add; y += y / m * add
            if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
        }
        path.closeSubpath()
        return path
    }

    static func drawDodo(_ cg: CGContext, _ x: CGFloat, _ y: CGFloat, _ s: CGFloat, _ p: Pose) {
        let sy = p.sy, sx = p.sx, F = foot
        cg.saveGState(); cg.translateBy(x: x, y: y); cg.scaleBy(x: s, y: s)
        // (shadow: false in every launch pose)
        cg.saveGState(); cg.rotate(by: p.roll); cg.scaleBy(x: sx, y: sy); cg.translateBy(x: 0, y: -F)
        let body = dodoPath(p)
        fill(cg, body) { radial($0, -13, -17, 1.5, -6, -4, 62, [(0, col(0xF2FCFF)), (0.09, col(0xDCF6FF)), (0.42, col(0x5EC6EC)), (0.8, col(0x3FA3D3)), (1, col(0x2689BD))]) }
        fill(cg, body) { radial($0, 1, 25, 0, 1, 25, 22, [(0, col(232, 249, 255, 0.92)), (0.5, col(200, 238, 252, 0.45)), (1, col(200, 238, 252, 0))]) }
        fill(cg, body) { radial($0, -11, -18, 0, -11, -18, 12, [(0, col(255, 255, 255, 0.5)), (1, col(255, 255, 255, 0))]) }
        cg.saveGState(); cg.addPath(body); cg.clip()
        if p.rim > 0 {   // light from the top-left: sunrise (warm) or moon (cool)
            let rc = p.rimCol
            let stops: [(CGFloat, CGColor)] = [(0, col(rc.0, rc.1, rc.2, 0.75 * p.rim)), (1, col(rc.0, rc.1, rc.2, 0))]
            strokeGrad(cg, body, 7) { linear($0, -34, -44, 6, 6, stops) }
            strokeGrad(cg, body, 2.5) { linear($0, -34, -44, 6, 6, stops) }
        }
        // fresnel rim: light at the top-left, cool grey-blue at the bottom-right
        let es: [(CGFloat, CGColor)] = [(0, col(232, 244, 250, 0.11)), (0.5, col(176, 214, 234, 0.07)), (1, col(52, 118, 160, 0.07))]
        var lw: CGFloat = 14
        while lw >= 1.5 { strokeGrad(cg, body, lw) { linear($0, -36, -46, 36, 46, es) }; lw -= 1.8 }
        cg.restoreGState()
        cg.addPath(body); cg.setLineWidth(0.6); cg.setStrokeColor(col(8, 75, 120, 0.5)); cg.setLineJoin(.round); cg.strokePath()
        dodoFace(cg, p)
        cg.restoreGState()
        // world-fixed speculars: they follow the body but never squash
        let r = p.roll, cy = -F * sy
        func spot(_ bx: CGFloat, _ by: CGFloat) -> (CGFloat, CGFloat) {
            let X = bx * sx, Y = cy + by * sy
            return (X * cos(r) - Y * sin(r), X * sin(r) + Y * cos(r))
        }
        var (hx, hy) = spot(-19.2, -16.5); hl(cg, hx, hy, 2.9, 1.95, -0.45, 0.95)
        (hx, hy) = spot(21.6, 16.8); hl(cg, hx, hy, 1.85, 4.1, -0.42, 0.45)
        cg.restoreGState()
    }

    static func dodoFace(_ cg: CGContext, _ p: Pose) {
        let bl = p.blush
        for sxn: CGFloat in [-1, 1] {
            let cx = sxn * 22.8, cy: CGFloat = 3.4, r = 5.4 * (1 + 0.12 * (bl - 1))
            cg.saveGState(); cg.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r)); cg.clip()
            radial(cg, cx, cy, 0, cx, cy, r, [(0, col(222, 88, 148, min(0.85, 0.5 * bl))), (0.3, col(255, 135, 188, min(0.7, 0.34 * bl))), (1, col(255, 159, 200, 0))])
            cg.restoreGState()
        }
        let ink = col(0x2A1F2B)
        let squint = p.squint > 0.5
        for sxn: CGFloat in [-1, 1] {
            let open = sxn < 0 ? p.eyes.0 : p.eyes.1
            let closed = max(p.blink, 1 - open)
            cg.saveGState(); cg.translateBy(x: sxn * 14, y: -9)
            if squint {
                cg.setStrokeColor(ink); cg.setLineWidth(1.85); cg.setLineCap(.round); cg.setLineJoin(.round)
                cg.move(to: CGPoint(x: sxn * 3.6, y: -2.9)); cg.addLine(to: CGPoint(x: -sxn * 3.4, y: 0.15)); cg.addLine(to: CGPoint(x: sxn * 3.6, y: 3.1))
                cg.strokePath()
            } else if closed > 0.82 {
                cg.setStrokeColor(ink); cg.setLineWidth(1.4); cg.setLineCap(.round)
                cg.move(to: CGPoint(x: -4, y: 0.4)); cg.addQuadCurve(to: CGPoint(x: 4, y: 0.4), control: CGPoint(x: 0, y: 2.6))
                cg.strokePath()
            } else {
                cg.translateBy(x: p.lookX, y: p.lookY); cg.scaleBy(x: p.eyePop, y: p.eyePop * (1 - closed))
                cg.saveGState(); cg.addEllipse(in: CGRect(x: -4.75, y: -4.75, width: 9.5, height: 9.5)); cg.clip()
                radial(cg, -1, -1.5, 0.5, 0, 0, 4.9, [(0, col(0x3E2E40)), (1, col(0x231925))])
                cg.restoreGState()
                ell(cg, -1.4, -1.7, 1.55, 1.55, col(255, 255, 255, 1))
                ell(cg, 1.6, 1.8, 0.68, 0.68, col(255, 255, 255, 0.78))
            }
            cg.restoreGState()
        }
        // beak: shield, measured from the artwork
        let beak = CGMutablePath()
        beak.move(to: CGPoint(x: -8, y: -0.4))
        beak.addQuadCurve(to: CGPoint(x: 8, y: -0.4), control: CGPoint(x: 0, y: -6.3))
        beak.addCurve(to: CGPoint(x: 0, y: 13), control1: CGPoint(x: 8.3, y: 5.2), control2: CGPoint(x: 4.2, y: 11.2))
        beak.addCurve(to: CGPoint(x: -8, y: -0.4), control1: CGPoint(x: -4.2, y: 11.2), control2: CGPoint(x: -8.3, y: 5.2))
        beak.closeSubpath()
        fill(cg, beak) { linear($0, 0, -3.3, 0, 13, [(0, col(0xFFD56C)), (1, col(0xF3962A))]) }
        ell(cg, 0, 10.6, 2.5, 2.4, col(0xE0742A))
        hl(cg, -2.7, -0.6, 2.3, 1.0, -0.15, 0.75)
        let m = p.mouth
        if m > 0.02 { ell(cg, 0, 16.6 + max(0, m - 1) * 1.7, 1.55 * m, 2.0 * m, col(0x7A1F33)) }
    }

    // ---- poses ----
    static func sunrise(_ st: CGFloat, night: Bool, reduce: Bool, k: CGFloat) -> CGFloat {
        night ? 0 : reduce ? k : smooth(bLight, 1.6, st)
    }

    static func dodoPose(_ st: CGFloat, night: Bool, reduce: Bool, k: CGFloat) -> Pose {
        var p = Pose()
        // asleep: two slow breaths
        p.sy = 1 + 0.03 * (bump(st, 0.05, 0.4) + bump(st, 0.47, 0.38))
        // the peek: the right eye opens halfway, squints, shuts
        let peek = 0.55 * smooth(0.88, 0.95, st) - 0.25 * smooth(0.97, 1.02, st) - 0.3 * smooth(1.04, 1.1, st)
        let both = smooth(1.15, 1.32, st)
        p.eyes = (both, max(both, peek))
        p.blink = max(tri(st, bBlink1, 0.05), tri(st, bBlink2, 0.05))
        let lk = smooth(1.2, 1.4, st) * (1 - smooth(2.1, 2.3, st)); p.lookX = -1.05 * lk; p.lookY = -1 * lk
        p.roll = -0.035 * (1 - smooth(1.2, 1.5, st))
        // the yawn-stretch
        let y = st - 1.45, sv = smooth(0, 0.2, y) * (1 - smooth(0.35, 0.5, y))
        p.sy *= 1 + 0.12 * sv - wob(y - 0.5, 0.04, 7, 3.2)
        p.wing = sv
        if y >= 0.08 && y < 0.43 { p.squint = 1 }
        p.mouth = max(0, 2.3 * smooth(0.06, 0.24, y) - 2.3 * smooth(0.3, 0.44, y))
        p.tuftDA = -0.55 * (1 - 0.3 * sv)
        // the tuft springs upright
        let tt = st - bTuft
        if tt >= 0 {
            let u = easeOutCubic(clamp(tt / 0.08))
            p.tuftDA = -0.55 * (1 - u) + wob(tt, 0.28, 5.5, 4.2)
            p.tuftAmp = 0.95 + 0.05 * u + wob(tt, 0.22, 6, 4.2)
            p.tuftW = 1.3 - 0.3 * u
        }
        // happy fluff-shake
        let ts = st - bShake
        if ts >= 0 && ts < 0.24 {
            let kk = 1 - ts / 0.24, ph = 2 * .pi * 6.25 * ts
            p.dx = 3 * sin(ph) * kk; p.roll = 0.035 * sin(ph + 1) * kk; p.wing = 0.4 * abs(sin(ph)) * kk
        }
        p.blush = 1 + 0.8 * smooth(bAwake, bAwake + 0.2, st)
        p.sy *= 1 - 0.03 * bump(st, bLand, 0.12)   // plants as the wordmark lands
        p.sx = 1 / sqrt(p.sy)
        if night { p.rim = 0.3 + 0.5 * smooth(1.15, 1.6, st); p.rimCol = (205, 215, 255) }
        else { p.rim = 0.7 * sunrise(st, night: night, reduce: reduce, k: k); p.rimCol = (255, 222, 170) }
        return p
    }

    // ---- scene ----
    static func drawSky(_ cg: CGContext, _ rect: CGRect, _ st: CGFloat, night: Bool, reduce: Bool, k: CGFloat, ia: CGFloat) {
        cg.saveGState(); cg.clip(to: rect)
        if night {
            linear(cg, 0, 0, 0, H, [(0, col(skyNight.0)), (1, col(skyNight.1))])
            radial(cg, 195, 380 + drop, 10, 195, 380 + drop, 260, [(0, col(150, 120, 235, 0.18 * ia)), (1, col(150, 120, 235, 0))])
            let sa = reduce ? ia : smooth(0.05, 0.6, st)
            for s in stars { ell(cg, s.x, s.y, s.r, s.r, col(255, 244, 214, s.a * sa)) }
            cg.restoreGState(); return
        }
        let w = sunrise(st, night: night, reduce: reduce, k: k)
        linear(cg, 0, 0, 0, H, [(0, col(mix(rgb(skyPre.0), rgb(skyDay.0), w))), (1, col(mix(rgb(skyPre.1), rgb(skyDay.1), w)))])
        if w > 0 {   // sunrise bloom from the top-left
            let r = 140 + 520 * easeOutCubic(w)
            radial(cg, 18, 30, 0, 18, 30, r, [(0, col(255, 236, 190, 0.75 * w)), (0.35, col(255, 214, 160, 0.35 * w)), (1, col(255, 214, 160, 0))])
            radial(cg, 195, 380 + drop, 10, 195, 380 + drop, 250, [(0, col(255, 255, 255, 0.42 * w * ia)), (1, col(255, 255, 255, 0))])
        }
        cg.restoreGState()
    }

    /// The level stone: the map's node material as a squat puck.
    static func drawStonePuck(_ cg: CGContext) {
        let color = rgb(stoneColor), rx = stoneRX, ry = stoneRY, th = stoneTH
        ell(cg, 9, th + 6, rx + 4, ry + 4, col(48, 30, 80, 0.1))
        contact(cg, 2, th + 2, rx + 8, ry + 2, 0.24)
        let side = CGMutablePath()
        arcE(side, 0, 0, rx, ry, 0, .pi)
        side.addLine(to: CGPoint(x: -rx, y: th))
        arcE(side, 0, th, rx, ry, .pi, 0, true)
        side.closeSubpath()
        fill(cg, side) { linear($0, 0, 0, 0, th + ry, [(0, col(shade(color, -0.08))), (1, col(shade(color, -0.34)))]) }
        fill(cg, side) { radial($0, 0, th + ry * 0.4, 0, 0, th + ry * 0.4, rx * 0.8, [(0, col(shade(color, 0.45), 0.55)), (1, col(shade(color, 0.45), 0))]) }
        cg.addPath(side); cg.setLineWidth(1.1); cg.setStrokeColor(col(shade(color, -0.55), 0.45)); cg.strokePath()
        let top = ellipsePath(0, 0, rx, ry)
        fill(cg, top) { radial($0, -rx * 0.35, -ry * 0.6, 2, 0, 0, rx * 1.05, [(0, col(shade(color, 0.55))), (0.5, col(color)), (1, col(shade(color, -0.2)))]) }
        cg.addPath(top); cg.setLineWidth(1.1); cg.setStrokeColor(col(shade(color, -0.55), 0.5)); cg.strokePath()
        hl(cg, -rx * 0.42, -ry * 0.3, rx * 0.24, ry * 0.28, -0.2, 0.85); hl(cg, rx * 0.5, ry * 0.35, 1.6, 0.9, 0, 0.6)
        let rim = CGMutablePath(); arcE(rim, 0, 0, rx - 2, ry - 1.5, .pi * 1.08, .pi * 1.6)
        cg.addPath(rim); cg.setStrokeColor(col(255, 255, 255, 0.55)); cg.setLineWidth(1.2); cg.strokePath()
    }

    /// Fredoka is a variable font whose default instance is Light; pin the
    /// weight axis to SemiBold (600), as the page's `600 60px Fredoka`.
    static func fredoka(_ size: CGFloat) -> CTFont {
        let base = CTFontDescriptorCreateWithNameAndSize("Fredoka-Light" as CFString, size)
        let wght = 0x77676874 as CFNumber   // 'wght'
        let d = CTFontDescriptorCreateCopyWithVariation(base, wght, 600)
        return CTFontCreateWithFontDescriptor(d, size, nil)
    }
    static let font60 = fredoka(60), font26 = fredoka(26)

    /// Draws `text` centered at x; baseline at y (or vertically centered on y when `middle`).
    static func text(_ cg: CGContext, _ s: String, font: CTFont, color: CGColor, x: CGFloat, y: CGFloat, middle: Bool = false) {
        let attr = NSAttributedString(string: s, attributes: [.init(kCTFontAttributeName as String): font,
                                                              .init(kCTForegroundColorAttributeName as String): color])
        let line = CTLineCreateWithAttributedString(attr)
        let b = CTLineGetBoundsWithOptions(line, [])
        var by = y
        if middle { by = y + (CTFontGetAscent(font) - CTFontGetDescent(font)) / 2 }
        cg.saveGState()
        cg.translateBy(x: x - b.width / 2, y: by)
        cg.scaleBy(x: 1, y: -1)   // CoreText draws y-up
        cg.textPosition = .zero
        CTLineDraw(line, cg)
        cg.restoreGState()
    }

    static func drawZ(_ cg: CGContext, _ st: CGFloat, night: Bool, reduce: Bool, _ a: CGFloat) {
        let p = clamp((st - bZ) / 0.65)
        if p <= 0 || p >= 1 || reduce { return }
        let al = a * smooth(0, 0.2, p) * (1 - smooth(0.7, 1, p)); if al <= 0 { return }
        cg.saveGState()
        cg.translateBy(x: 234 + 24 * p + 3 * sin(p * 6), y: 296 + drop - 54 * p); cg.rotate(by: -0.15 + 0.1 * p)
        cg.scaleBy(x: 0.7 + 0.45 * p, y: 0.7 + 0.45 * p)
        text(cg, "z", font: font26, color: night ? col(243, 235, 246, 0.7 * al) : col(45, 37, 55, 0.62 * al), x: 0, y: 0, middle: true)
        cg.restoreGState()
    }

    static func drawWordmark(_ cg: CGContext, _ st: CGFloat, night: Bool, reduce: Bool, _ alpha: CGFloat) {
        // fast in, hard stop on bLand: position on a quintic ease-out, opacity in the first 60 %
        let k = reduce ? 1 : clamp((st - bWord) / (bLand - bWord)), a = (reduce ? 1 : easeOutCubic(clamp(k / 0.6))) * alpha
        if a <= 0 { return }
        text(cg, "dodo", font: font60, color: col(night ? inkNight : inkDay, a), x: 195, y: wmBaseline + wmRise * pow(1 - k, 5))
    }

    static func drawBird(_ cg: CGContext, _ st: CGFloat, night: Bool, reduce: Bool, k: CGFloat) {
        let p = dodoPose(st, night: night, reduce: reduce, k: k)
        contact(cg, stoneX + 2, stoneY + 2, 34, 7, 0.22)
        drawDodo(cg, stoneX + p.dx, stoneY + 2, dodoS, p)
    }
    static func drawStone(_ cg: CGContext) { cg.saveGState(); cg.translateBy(x: stoneX, y: stoneY); drawStonePuck(cg); cg.restoreGState() }
    static func dimAmount(_ st: CGFloat, night: Bool, reduce: Bool, k: CGFloat) -> CGFloat {
        night ? 0.18 : 0.2 * (1 - sunrise(st, night: night, reduce: reduce, k: k))
    }

    /// A subject layer: drawn, dimmed (source-atop), composited at alpha `a`.
    static func layer(_ cg: CGContext, _ a: CGFloat, dim: CGFloat, _ rect: CGRect, _ draw: () -> Void) {
        if a <= 0 { return }
        cg.saveGState(); cg.setAlpha(a); cg.beginTransparencyLayer(auxiliaryInfo: nil)
        draw()
        if dim > 0 { cg.setBlendMode(.sourceAtop); cg.setFillColor(col(52, 40, 104, dim)); cg.fill(rect) }
        cg.endTransparencyLayer(); cg.restoreGState()
    }

    static func drawFrame(_ cg: CGContext, size: CGSize, t tt: Double, night: Bool, reduce: Bool, skipAt: Double?) {
        let t = CGFloat(tt)
        // 1 unit = 1 logical point of the 390 × 844 stage, scaled to the width, centered vertically
        let s = size.width / W, oy = (size.height - H * s) / 2
        cg.translateBy(x: 0, y: oy); cg.scaleBy(x: s, y: s)
        let full = CGRect(x: 0, y: -oy / s, width: W, height: size.height / s)
        var sceneA: CGFloat = 1, wordA: CGFloat = 1, paperA: CGFloat = 0, ex: CGFloat = 0, k: CGFloat = 0
        if reduce {
            k = smooth(rbWake, rbWake + 0.4, t); sceneA = smooth(0, 0.35, t); wordA = smooth(rbWord, rbWord + 0.4, t); paperA = smooth(rbExit, rbEnd, t)
            if let sk = skipAt { paperA = max(paperA, smooth(sk, sk + skipExit, t)) }
        } else {
            sceneA = smooth(0, 0.25, t)
            if let sk = skipAt, sk < bExit { ex = clamp((t - sk) / skipExit) } else { ex = clamp((t - bExit) / (bEnd - bExit)) }
            paperA = smooth(0.1, 1, ex)
        }
        // the sky's gradient spans the stage; above and below it the end colors continue (pad)
        drawSky(cg, full, t, night: night, reduce: reduce, k: k, ia: sceneA)
        let paper = col(night ? paperNight : paperDay)
        if paperA >= 1 { cg.setFillColor(paper); cg.fill(full); return }
        let zs = 1 + 0.06 * easeInOut(ex)
        cg.saveGState()
        cg.translateBy(x: 195, y: faceY); cg.scaleBy(x: zs, y: zs); cg.translateBy(x: -195, y: -faceY)
        let big = full.insetBy(dx: -200, dy: -200)
        if !reduce {
            layer(cg, sceneA, dim: dimAmount(t, night: night, reduce: false, k: 0), big) {
                drawStone(cg); drawBird(cg, t, night: night, reduce: false, k: 0)
            }
        } else {   // Reduce Motion: stone stays, the sleeping bird crossfades into the awake bird
            layer(cg, sceneA, dim: dimAmount(0, night: night, reduce: true, k: k) * (1 - k), big) { drawStone(cg) }
            layer(cg, sceneA * (1 - smooth(0.45, 1, k)), dim: dimAmount(0, night: night, reduce: true, k: 0), big) {
                drawBird(cg, sleepT, night: night, reduce: true, k: 0)
            }
            layer(cg, sceneA * k, dim: dimAmount(0, night: night, reduce: true, k: 1), big) {
                drawBird(cg, awakeT, night: night, reduce: true, k: 1)
            }
        }
        drawZ(cg, t, night: night, reduce: reduce, sceneA)
        drawWordmark(cg, t, night: night, reduce: reduce, wordA)
        cg.restoreGState()
        if paperA > 0 { cg.setFillColor(col(night ? paperNight : paperDay, paperA)); cg.fill(full) }
    }
}
