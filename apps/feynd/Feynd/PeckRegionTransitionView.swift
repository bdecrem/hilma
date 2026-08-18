import SwiftUI
import UIKit

// The region level-up scene — a Swift port of the Claude Design
// choreography (branding/design/peck-levelup-scene.jsx). Four beats over
// ten seconds: Clear (the finished node bursts: ring, stars, confetti, the
// dodo does a happy hop) → Walk (the dodo hops up the trail while the
// camera pans out of the old region) → Gate (the new region's banner pops
// in while its ambience lights up) → Settle (the next level pulses START).
// Plays once on crossing 10→11 and 20→21, then hands back to the map.

struct RegionCrossing: Identifiable {
    let clearedLevel: Int            // 10 or 20
    var id: Int { clearedLevel }

    var nextLevel: Int { clearedLevel + 1 }
    var regionName: String { clearedLevel == 10 ? "Fern Hollow" : "Starfall Summit" }
    var regionSpan: String { clearedLevel == 10 ? "Levels 11–20" : "Levels 21–30" }
    /// World sky, bottom (old region) → top (new region).
    var skyStops: [(CGFloat, UInt32)] {
        clearedLevel == 10
            ? [(0, 0xF2A87B), (0.24, 0xFFCF9A), (0.5, 0xFFE9C4), (0.75, 0xFFEFD1), (1, 0xFFF3DC)]
            : [(0, 0x1B2A38), (0.2, 0x33405C), (0.5, 0xB27A7E), (0.75, 0xF2A87B), (1, 0xFFDCA8)]
    }
    var upperTree: (c: UInt32, d: UInt32, t: UInt32) {
        clearedLevel == 10 ? (0x4F7D4A, 0x3E6B42, 0x5C4632) : (0x2C3B4A, 0x1D2934, 0x2A2E33)
    }
    var glowColor: UInt32 { clearedLevel == 10 ? 0xFFD98A : 0xEDE6D2 }
}

// Choreography cues (authored seconds).
private enum Cue {
    static let clear: CGFloat = 0
    static let walk: CGFloat = 2.4
    static let gate: CGFloat = 5.6
    static let settle: CGFloat = 8.0
    static let total: CGFloat = 10.0
}

private func clamp01(_ v: CGFloat) -> CGFloat { max(0, min(1, v)) }
private func bell(_ u: CGFloat) -> CGFloat { u > 0 && u < 1 ? sin(u * .pi) : 0 }
private func easeInOutCubic(_ u: CGFloat) -> CGFloat {
    u < 0.5 ? 4 * u * u * u : 1 - pow(-2 * u + 2, 3) / 2
}
private func easeOutCubic(_ u: CGFloat) -> CGFloat { 1 - pow(1 - u, 3) }
private func easeInOutSine(_ u: CGFloat) -> CGFloat { -(cos(.pi * u) - 1) / 2 }
private func anim(_ from: CGFloat, _ to: CGFloat, _ t: CGFloat, _ start: CGFloat, _ end: CGFloat, _ ease: (CGFloat) -> CGFloat) -> CGFloat {
    from + (to - from) * ease(clamp01((t - start) / max(0.0001, end - start)))
}

/// Trail waypoints in world space (390 × 1600), node 10 → beside node 11.
private let TRAIL: [CGPoint] = [
    CGPoint(x: 190, y: 1495), CGPoint(x: 240, y: 1360), CGPoint(x: 150, y: 1220),
    CGPoint(x: 230, y: 1060), CGPoint(x: 170, y: 930), CGPoint(x: 230, y: 800),
    CGPoint(x: 170, y: 700), CGPoint(x: 215, y: 640), CGPoint(x: 128, y: 596),
]
private func trailAt(_ s: CGFloat) -> CGPoint {
    let t = clamp01(s) * CGFloat(TRAIL.count - 1)
    let i = min(Int(t), TRAIL.count - 2)
    let f = t - CGFloat(i)
    return CGPoint(x: TRAIL[i].x + (TRAIL[i + 1].x - TRAIL[i].x) * f,
                   y: TRAIL[i].y + (TRAIL[i + 1].y - TRAIL[i].y) * f)
}

private let CONFETTI: [(a: CGFloat, r: CGFloat, c: UInt32)] = (0..<10).map { i in
    (a: CGFloat(i) / 10 * 2 * .pi + 0.4, r: 46 + CGFloat(i % 3) * 22,
     c: [0xF0A830, 0xF2A19A, 0x7BB662][i % 3])
}
private let FLIES: [CGPoint] = [
    CGPoint(x: 300, y: 560), CGPoint(x: 90, y: 640), CGPoint(x: 330, y: 700),
    CGPoint(x: 150, y: 610), CGPoint(x: 250, y: 500),
]
private let STAR = "M0,-7 L2.1,-2.2 L7,-2.2 L3,0.8 L4.3,5.8 L0,2.8 L-4.3,5.8 L-3,0.8 L-7,-2.2 L-2.1,-2.2"

struct PeckRegionTransitionView: View {
    let crossing: RegionCrossing
    var onDone: () -> Void = {}

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()
    @State private var finished = false

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()
            TimelineView(.animation(minimumInterval: 1.0 / 40.0)) { timeline in
                let t = min(Cue.total, CGFloat(timeline.date.timeIntervalSince(start)) * (reduceMotion ? 4 : 1))
                GeometryReader { geo in
                    let w = min(geo.size.width, 430)
                    let h = min(geo.size.height - 40, 860)
                    ZStack {
                        scene(t: t)
                            .frame(width: 390, height: 800)
                            .clipShape(RoundedRectangle(cornerRadius: 44))
                            .shadow(color: Color(hex: 0x3E3324).opacity(0.18), radius: 15, y: 5)
                            .scaleEffect(min(w / 400, h / 810))
                        banner(t: t)
                        caption(t: t)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .onChange(of: t >= Cue.total) { _, done in
                    if done && !finished {
                        finished = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { onDone() }
                    }
                }
            }
            // Skippable — a tap hands straight back to the map.
            .contentShape(Rectangle())
            .onTapGesture { if !finished { finished = true; onDone() } }
        }
        .task { FlashSFX.shared.play(.fanfare) }
    }

    // MARK: - The world

    private func scene(t: CGFloat) -> some View {
        Canvas { ctx, _ in
            let camTop = anim(800, 0, t, Cue.walk + 0.2, Cue.gate + 0.2, easeInOutCubic)
            var g = ctx
            g.translateBy(x: 0, y: -camTop)

            func fill(_ p: Path, _ hex: UInt32, _ o: CGFloat = 1) {
                g.fill(p, with: .color(Color(hex: hex).opacity(o)))
            }

            // Sky — the whole 1600pt world spans old region (bottom) → new (top).
            let stops = crossing.skyStops.map { Gradient.Stop(color: Color(hex: $0.1), location: $0.0) }
            g.fill(Path(CGRect(x: 0, y: 0, width: 390, height: 1600)),
                   with: .linearGradient(Gradient(stops: stops),
                                         startPoint: CGPoint(x: 0, y: 1600), endPoint: .zero))

            // Low sun in the new region; pale echo higher up.
            fill(Path(ellipseIn: CGRect(x: 280, y: 908, width: 76, height: 76)), 0xF0A830, 0.25)
            fill(Path(ellipseIn: CGRect(x: 294, y: 922, width: 48, height: 48)), 0xF5B94E)
            fill(Path(ellipseIn: CGRect(x: 68, y: 288, width: 84, height: 84)), 0xFFE9C4, 0.45)
            fill(Path(ellipseIn: CGRect(x: 83, y: 303, width: 54, height: 54)), 0xFFE9C4)

            // Ambience of the new region wakes up as the camera arrives.
            let glow = anim(0, 1, t, Cue.walk + 1.6, Cue.gate, easeOutCubic)
            for (i, f) in FLIES.enumerated() {
                let tw = 0.35 + 0.6 * abs(sin(t * 2.5 + CGFloat(i) * 1.7))
                fill(Path(ellipseIn: CGRect(x: f.x - 2.3, y: f.y - 2.3, width: 4.6, height: 4.6)),
                     crossing.glowColor, glow * tw)
            }

            // Old-region water strip + meadow hills (bottom of the world).
            fill(Path(CGRect(x: 0, y: 1006, width: 390, height: 46)), 0xA8D8D8)
            fill(Path(CGRect(x: 0, y: 1006, width: 390, height: 7)), 0xC4E6E2)
            let meadowHills: [(CGFloat, UInt32)] = [(1056, 0xCDE3B4), (1190, 0xB5D89A), (1340, 0x9CCB80), (1490, 0x7FBA66)]
            for (y0, c) in meadowHills {
                var p = Path()
                p.move(to: CGPoint(x: 0, y: y0))
                p.addCurve(to: CGPoint(x: 300, y: y0 - 24), control1: CGPoint(x: 90, y: y0 - 20), control2: CGPoint(x: 200, y: y0 - 10))
                p.addCurve(to: CGPoint(x: 390, y: y0 - 28), control1: CGPoint(x: 340, y: y0 - 29), control2: CGPoint(x: 370, y: y0 - 22))
                p.addLine(to: CGPoint(x: 390, y: 1600)); p.addLine(to: CGPoint(x: 0, y: 1600)); p.closeSubpath()
                fill(p, c)
            }
            // New-region hills (upper half).
            let newHills: [(CGFloat, UInt32)] = [(430, 0xA3B871), (560, 0x84A765), (680, 0x668F57), (790, 0x4E7B4A)]
            for (y0, c) in (crossing.clearedLevel == 10 ? newHills
                            : [(430, 0x2C3B4A), (560, 0x24313D), (680, 0x1D2934), (790, 0x16202A)]) {
                var p = Path()
                p.move(to: CGPoint(x: 0, y: y0))
                p.addCurve(to: CGPoint(x: 254, y: y0 - 32), control1: CGPoint(x: 74, y: y0 - 26), control2: CGPoint(x: 170, y: y0 - 10))
                p.addCurve(to: CGPoint(x: 390, y: y0 - 36), control1: CGPoint(x: 316, y: y0 - 44), control2: CGPoint(x: 360, y: y0 - 28))
                p.addLine(to: CGPoint(x: 390, y: 1010)); p.addLine(to: CGPoint(x: 0, y: 1010)); p.closeSubpath()
                fill(p, c)
            }

            // Trees: meadow greens below, the new region's palette above.
            let up = crossing.upperTree
            let trees: [(CGFloat, CGFloat, CGFloat, UInt32, UInt32, UInt32)] = [
                (56, 1188, 1.0, 0x6FAE5C, 0x5F9E4C, 0x8A6B4A),
                (334, 1240, 0.85, 0x6FAE5C, 0x5F9E4C, 0x8A6B4A),
                (48, 1430, 1.05, 0x6FAE5C, 0x5F9E4C, 0x8A6B4A),
                (326, 1470, 0.9, 0x6FAE5C, 0x5F9E4C, 0x8A6B4A),
                (342, 560, 1.05, up.c, up.d, up.t),
                (50, 700, 1.2, up.c, up.d, up.t),
                (330, 740, 1.35, up.c, up.d, up.t),
            ]
            for (x, y, k, c, d, tr) in trees { drawTree(&g, x: x, y: y, k: k, canopy: c, shade: d, trunk: tr) }

            // The trail — stepping-stone dots.
            var trail = Path()
            trail.move(to: TRAIL[0])
            for pt in TRAIL.dropFirst() { trail.addLine(to: pt) }
            g.stroke(trail, with: .color(Color(hex: 0xFFF3DC).opacity(0.8)),
                     style: StrokeStyle(lineWidth: 4.5, lineCap: .round, dash: [0.1, 13]))

            // Node 10 — the burst.
            drawClearedNode(&g, t: t)
            // Node 11 — pulse + START.
            drawNextNode(&g, t: t)
            // Padlock beyond 11.
            fill(Path(ellipseIn: CGRect(x: 260, y: 434, width: 36, height: 36)), 0xFFF3DC, 0.35)
            fill(Path(roundedRect: CGRect(x: 272.4, y: 450.5, width: 11.2, height: 8.6), cornerRadius: 2.2), 0x4A3B2A, 0.6)

            // The dodo — celebrate, then walk the trail.
            let s = anim(0, 1, t, Cue.walk, Cue.gate + 0.5, easeInOutSine)
            let walking = s > 0 && s < 1
            let pos = trailAt(s)
            let phase = s * 9 * .pi
            var pose: DodoPose
            if t < Cue.walk {
                pose = DodoMood.happy((t - 0.95) / 0.9)
                let idle = DodoMood.idle(t, seed: 3)
                pose.eyeScaleY = idle.eyeScaleY
                pose.sproutAngle += idle.sproutAngle
            } else if walking {
                pose = DodoMood.walking(t, phase: phase)
            } else {
                pose = DodoMood.idle(t, seed: 3)
                // Arrival flourish: one more hop + wing flap at the gate.
                let au = (t - (Cue.gate + 0.7)) / 0.9
                pose.yOffset -= 26 * bell(au)
                pose.wingAngle += 42 * bell((t - (Cue.gate + 0.8)) / 0.6)
                pose.sproutAngle += 7 * bell(au) * sin((t - Cue.gate - 0.7) * 16)
            }
            drawAnimatedDodo(&g, at: CGPoint(x: pos.x, y: pos.y), height: 92, pose: pose)
        }
    }

    private func drawTree(_ g: inout GraphicsContext, x: CGFloat, y: CGFloat, k: CGFloat, canopy: UInt32, shade: UInt32, trunk: UInt32) {
        var c = g
        c.translateBy(x: x, y: y)
        c.scaleBy(x: k, y: k)
        var trunkP = Path()
        trunkP.move(to: CGPoint(x: -2, y: 0))
        trunkP.addCurve(to: CGPoint(x: 0, y: -37), control1: CGPoint(x: -3.5, y: -13), control2: CGPoint(x: -2.5, y: -25))
        trunkP.addCurve(to: CGPoint(x: 2, y: 0), control1: CGPoint(x: 2.5, y: -25), control2: CGPoint(x: 3.5, y: -13))
        trunkP.closeSubpath()
        c.fill(trunkP, with: .color(Color(hex: trunk)))
        var can = Path()
        can.move(to: CGPoint(x: 0, y: -28))
        can.addCurve(to: CGPoint(x: -26, y: -54), control1: CGPoint(x: -22, y: -24), control2: CGPoint(x: -35, y: -38))
        can.addCurve(to: CGPoint(x: -2, y: -78), control1: CGPoint(x: -35, y: -70), control2: CGPoint(x: -18, y: -85))
        can.addCurve(to: CGPoint(x: 28, y: -60), control1: CGPoint(x: 12, y: -89), control2: CGPoint(x: 33, y: -77))
        can.addCurve(to: CGPoint(x: 9, y: -33), control1: CGPoint(x: 39, y: -46), control2: CGPoint(x: 27, y: -30))
        can.addCurve(to: CGPoint(x: 0, y: -28), control1: CGPoint(x: 6, y: -31), control2: CGPoint(x: 3, y: -29))
        can.closeSubpath()
        c.fill(can, with: .color(Color(hex: canopy)))
        var sh = Path()
        sh.move(to: CGPoint(x: -4, y: -32))
        sh.addCurve(to: CGPoint(x: -22, y: -50), control1: CGPoint(x: -18, y: -30), control2: CGPoint(x: -27, y: -40))
        sh.addCurve(to: CGPoint(x: 2, y: -42), control1: CGPoint(x: -14, y: -44), control2: CGPoint(x: -6, y: -40))
        sh.addCurve(to: CGPoint(x: -4, y: -32), control1: CGPoint(x: 0, y: -38), control2: CGPoint(x: -2, y: -34))
        sh.closeSubpath()
        c.fill(sh, with: .color(Color(hex: shade).opacity(0.7)))
    }

    private func drawClearedNode(_ g: inout GraphicsContext, t: CGFloat) {
        var c = g
        c.translateBy(x: 140, y: 1480)
        let ringU = clamp01((t - 0.4) / 0.8)
        var ring = Path(ellipseIn: CGRect(x: 0, y: 0, width: 0, height: 0))
        let rr = 30 + 45 * easeOutCubic(ringU)
        ring = Path(ellipseIn: CGRect(x: -rr, y: -rr, width: rr * 2, height: rr * 2))
        c.stroke(ring, with: .color(Color(hex: 0xF0A830).opacity(0.7 * (1 - ringU))), lineWidth: 3)
        c.fill(Path(ellipseIn: CGRect(x: -30, y: -30, width: 60, height: 60)), with: .color(Color(hex: 0xF0A830)))
        c.draw(Text("\(crossing.clearedLevel)").font(.custom("Fredoka", size: 24).weight(.semibold)).foregroundColor(Color(hex: 0x7A4A12)), at: CGPoint(x: 0, y: 1))
        // Three stars pop above.
        if let star = Path(STAR) {
            for (i, k) in [-1, 0, 1].enumerated() {
                let sc = clamp01(anim(0, 1, t, 0.5 + CGFloat(i) * 0.16, 0.95 + CGFloat(i) * 0.16, easeOutBack))
                var sg = c
                sg.translateBy(x: CGFloat(k) * 24, y: -44 + abs(CGFloat(k)) * 6)
                sg.scaleBy(x: sc, y: sc)
                sg.fill(star, with: .color(Color(hex: 0xF0A830)))
                sg.stroke(star, with: .color(Color(hex: 0xFFF3DC)), lineWidth: 1.5)
            }
        }
        // Confetti radiates and falls.
        let u = clamp01((t - 0.45) / 0.95)
        if u > 0 && u < 1 {
            let e = easeOutCubic(u)
            for cf in CONFETTI {
                var piece = c
                piece.translateBy(x: cos(cf.a) * cf.r * e, y: sin(cf.a) * cf.r * e - 20 * e + 30 * u * u)
                piece.rotate(by: .degrees(e * 140))
                piece.fill(Path(roundedRect: CGRect(x: -3, y: -3, width: 6, height: 6), cornerRadius: 2),
                           with: .color(Color(hex: cf.c).opacity(1 - u)))
            }
        }
    }

    private func drawNextNode(_ g: inout GraphicsContext, t: CGFloat) {
        var c = g
        c.translateBy(x: 195, y: 540)
        let pulse = t > Cue.settle ? 0.55 + 0.25 * sin((t - Cue.settle) * 3.2) : 0
        if pulse > 0 {
            let pr = 33 + 5 * sin((t - Cue.settle) * 3.2)
            c.stroke(Path(ellipseIn: CGRect(x: -pr, y: -pr, width: pr * 2, height: pr * 2)),
                     with: .color(Color(hex: 0xF0A830).opacity(pulse)), lineWidth: 3)
        }
        c.fill(Path(ellipseIn: CGRect(x: -30, y: -30, width: 60, height: 60)), with: .color(Color(hex: 0xFFF9EC)))
        c.stroke(Path(ellipseIn: CGRect(x: -30, y: -30, width: 60, height: 60)), with: .color(Color(hex: 0xF0A830)), lineWidth: 3)
        c.draw(Text("\(crossing.nextLevel)").font(.custom("Fredoka", size: 24).weight(.semibold)).foregroundColor(Color(hex: 0x33383E)), at: CGPoint(x: 0, y: 1))
        let startOp = anim(0, 1, t, Cue.settle + 0.2, Cue.settle + 0.7, easeOutCubic)
        if startOp > 0 {
            c.draw(Text("START").font(.custom("Fredoka", size: 13).weight(.semibold)).tracking(3)
                    .foregroundColor(Color(hex: 0xC77E2B).opacity(startOp)), at: CGPoint(x: 0, y: 52))
        }
    }

    // MARK: - Banner + caption overlays

    @ViewBuilder
    private func banner(t: CGFloat) -> some View {
        let sc = anim(0.6, 1, t, Cue.gate + 0.15, Cue.gate + 0.75, easeOutBack)
        let op = anim(0, 1, t, Cue.gate + 0.15, Cue.gate + 0.5, easeOutCubic)
            * (1 - clamp01((t - (Cue.settle + 0.35)) / 0.5))
        if op > 0.01 {
            VStack(spacing: 4) {
                SproutGlyph()
                    .frame(width: 64, height: 28)
                Text("NEW REGION")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(3)
                    .foregroundStyle(Color(hex: 0xC77E2B))
                Text(crossing.regionName)
                    .font(.custom("Fredoka", size: 34).weight(.semibold))
                    .foregroundStyle(Color(hex: 0x2A2E33))
                Text(crossing.regionSpan)
                    .font(.custom("Fredoka", size: 15).weight(.medium))
                    .foregroundStyle(Color(hex: 0x5C554A))
                    .padding(.top, 2)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 26)
            .frame(width: 264)
            .background(Color(hex: 0xFBF4E6), in: RoundedRectangle(cornerRadius: 28))
            .shadow(color: Color(hex: 0x141A12).opacity(0.35), radius: 20, y: 7)
            .scaleEffect(sc)
            .opacity(op)
            .offset(y: -80)
        }
    }

    @ViewBuilder
    private func caption(t: CGFloat) -> some View {
        if t > 0.35 && t < 2.2 {
            Text("Level \(crossing.clearedLevel) cleared!")
                .font(.custom("Fredoka", size: 17).weight(.semibold))
                .foregroundStyle(Color(hex: 0x2A2E33))
                .padding(.horizontal, 18)
                .padding(.vertical, 9)
                .background(Color(hex: 0xFFF9EC).opacity(0.92), in: Capsule())
                .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 54)
                .transition(.opacity)
        }
    }
}

/// The three-leaf sprout, standalone (banner crest).
private struct SproutGlyph: View {
    var body: some View {
        Canvas { ctx, size in
            var g = ctx
            g.translateBy(x: size.width / 2, y: size.height)
            g.scaleBy(x: 1.9, y: 1.9)
            var stem = Path()
            stem.move(to: CGPoint(x: -0.9, y: 0))
            stem.addCurve(to: CGPoint(x: 2.2, y: -6), control1: CGPoint(x: -1.1, y: -2.6), control2: CGPoint(x: -0.4, y: -4.3))
            stem.addCurve(to: CGPoint(x: 1.3, y: 0), control1: CGPoint(x: 2.8, y: -4.7), control2: CGPoint(x: 2.2, y: -2.6))
            stem.closeSubpath()
            g.fill(stem, with: .color(Color(hex: 0x6FAE5C)))
            var l = Path()
            l.move(to: CGPoint(x: 0.9, y: -4.9))
            l.addCurve(to: CGPoint(x: -16.1, y: -8.4), control1: CGPoint(x: -3.9, y: -10.5), control2: CGPoint(x: -11.3, y: -11.4))
            l.addCurve(to: CGPoint(x: 0.9, y: -4.9), control1: CGPoint(x: -13.9, y: -2.7), control2: CGPoint(x: -5.7, y: -1.4))
            l.closeSubpath()
            g.fill(l, with: .color(Color(hex: 0x7BB662)))
            var r = Path()
            r.move(to: CGPoint(x: 1.7, y: -6.2))
            r.addCurve(to: CGPoint(x: 16.1, y: -11.8), control1: CGPoint(x: 3.9, y: -11.8), control2: CGPoint(x: 10.9, y: -13.6))
            r.addCurve(to: CGPoint(x: 1.7, y: -6.2), control1: CGPoint(x: 15.2, y: -6.2), control2: CGPoint(x: 8.3, y: -3.2))
            r.closeSubpath()
            g.fill(r, with: .color(Color(hex: 0x5F9E4C)))
        }
    }
}
