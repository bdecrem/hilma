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
    var regionName: String { clearedLevel == 10 ? "Jelly Lagoon" : "Sprinkle Peaks" }
    var regionSpan: String { clearedLevel == 10 ? "Levels 11–20" : "Levels 21–30" }
    /// World sky, bottom (old region) → top (new region).
    var skyStops: [(CGFloat, UInt32)] {
        clearedLevel == 10
            ? [(0, 0xC8EDB4), (0.3, 0xE8F4DC), (0.55, 0xCDEFF8), (0.8, 0x9BE3F5), (1, 0xDCF6FF)]
            : [(0, 0x8FDAF2), (0.3, 0xB7E6F5), (0.55, 0xEADFF8), (0.8, 0xF1DEFB), (1, 0xF8DCEE)]
    }
    /// Two candy colours for the new region's trees.
    var upperTree: (c: UInt32, d: UInt32) {
        clearedLevel == 10 ? (0xFF9FC8, 0x7FD3FF) : (0xB994FF, 0xFF7AB0)
    }
    var lowerTree: (c: UInt32, d: UInt32) {
        clearedLevel == 10 ? (0x91E9CC, 0xFFD27A) : (0x7FD3FF, 0xFFD27A)
    }
    /// The old region's ground (bottom of the world) and the new one's hills.
    var lowerHills: [(CGFloat, UInt32)] {
        clearedLevel == 10
            ? [(1056, 0xC8EDB4), (1190, 0xB6E4A3), (1340, 0xA5DA94), (1490, 0x96D088)]
            : [(1056, 0x9BE3F5), (1190, 0x8FDAF2), (1340, 0x7FD2EF), (1490, 0x8FDAF2)]
    }
    var upperHills: [(CGFloat, UInt32)] {
        clearedLevel == 10
            ? [(430, 0xFFE7C2), (560, 0x9BE3F5), (680, 0x7FD2EF), (790, 0x8FDAF2)]
            : [(430, 0xEFDCFF), (560, 0xF7DCF3), (680, 0xFBE3EF), (790, 0xF3D6EE)]
    }
    var shore: (UInt32, UInt32) { clearedLevel == 10 ? (0xFFE7C2, 0xFFF6E8) : (0xEFDCFF, 0xFFFFFF) }
    var glowColor: UInt32 { clearedLevel == 10 ? 0xFFFFFF : 0xFFD43A }
    var clearedColors: JellyTriad { clearedLevel == 10 ? .meadow : .lagoon }
    var nextColors: JellyTriad { clearedLevel == 10 ? .lagoon : .peaks }
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
     c: Jelly.gdCols[i % 6])
}
private let FLIES: [CGPoint] = [
    CGPoint(x: 300, y: 560), CGPoint(x: 90, y: 640), CGPoint(x: 330, y: 700),
    CGPoint(x: 150, y: 610), CGPoint(x: 250, y: 500),
]

struct PeckRegionTransitionView: View {
    let crossing: RegionCrossing
    var onDone: () -> Void = {}

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
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
                            .shadow(color: Color(hex: 0x3A2433).opacity(0.18), radius: 15, y: 5)
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
            // The crossing is a daytime postcard in both modes: its sky and
            // water are fixed colours, so its props stay unfiltered too.
            let ink = JellyInk(dark: false)

            func fill(_ p: Path, _ hex: UInt32, _ o: CGFloat = 1) {
                g.fill(p, with: .color(Color(hex: hex).opacity(o)))
            }

            // Sky — the whole 1600pt world spans old region (bottom) → new (top).
            let stops = crossing.skyStops.map { Gradient.Stop(color: Color(hex: $0.1), location: $0.0) }
            g.fill(Path(CGRect(x: 0, y: 0, width: 390, height: 1600)),
                   with: .linearGradient(Gradient(stops: stops),
                                         startPoint: CGPoint(x: 0, y: 1600), endPoint: .zero))

            // Low sun in the new region; pale echo higher up.
            fill(Path(ellipseIn: CGRect(x: 280, y: 908, width: 76, height: 76)), 0xFFD43A, 0.25)
            fill(Path(ellipseIn: CGRect(x: 294, y: 922, width: 48, height: 48)), 0xFFE27A)
            fill(Path(ellipseIn: CGRect(x: 68, y: 288, width: 84, height: 84)), 0xFFE9C4, 0.45)
            fill(Path(ellipseIn: CGRect(x: 83, y: 303, width: 54, height: 54)), 0xFFE9C4)

            // Ambience of the new region wakes up as the camera arrives.
            let glow = anim(0, 1, t, Cue.walk + 1.6, Cue.gate, easeOutCubic)
            for (i, f) in FLIES.enumerated() {
                let tw = 0.35 + 0.6 * abs(sin(t * 2.5 + CGFloat(i) * 1.7))
                fill(Path(ellipseIn: CGRect(x: f.x - 2.3, y: f.y - 2.3, width: 4.6, height: 4.6)),
                     crossing.glowColor, glow * tw)
            }

            // The new region's shore strip + the old region's ground (bottom of the world).
            fill(Path(CGRect(x: 0, y: 1006, width: 390, height: 46)), crossing.shore.0)
            fill(Path(CGRect(x: 0, y: 1006, width: 390, height: 7)), crossing.shore.1)
            for (y0, c) in crossing.lowerHills {
                var p = Path()
                p.move(to: CGPoint(x: 0, y: y0))
                p.addCurve(to: CGPoint(x: 300, y: y0 - 24), control1: CGPoint(x: 90, y: y0 - 20), control2: CGPoint(x: 200, y: y0 - 10))
                p.addCurve(to: CGPoint(x: 390, y: y0 - 28), control1: CGPoint(x: 340, y: y0 - 29), control2: CGPoint(x: 370, y: y0 - 22))
                p.addLine(to: CGPoint(x: 390, y: 1600)); p.addLine(to: CGPoint(x: 0, y: 1600)); p.closeSubpath()
                fill(p, c)
            }
            // New-region hills (upper half).
            for (y0, c) in crossing.upperHills {
                var p = Path()
                p.move(to: CGPoint(x: 0, y: y0))
                p.addCurve(to: CGPoint(x: 254, y: y0 - 32), control1: CGPoint(x: 74, y: y0 - 26), control2: CGPoint(x: 170, y: y0 - 10))
                p.addCurve(to: CGPoint(x: 390, y: y0 - 36), control1: CGPoint(x: 316, y: y0 - 44), control2: CGPoint(x: 360, y: y0 - 28))
                p.addLine(to: CGPoint(x: 390, y: 1010)); p.addLine(to: CGPoint(x: 0, y: 1010)); p.closeSubpath()
                fill(p, c)
            }

            // Candy trees: the old region's colours below, the new one's above.
            let up = crossing.upperTree, low = crossing.lowerTree
            let trees: [(CGFloat, CGFloat, CGFloat, UInt32)] = [
                (56, 1188, 1.0, low.c), (334, 1240, 0.85, low.d), (48, 1430, 1.05, low.d), (326, 1470, 0.9, low.c),
                (342, 560, 1.05, up.c), (50, 700, 1.2, up.d), (330, 740, 1.35, up.c),
            ]
            for (x, y, k, c) in trees { jellyTree(&g, ink, x: x, y: y, s: k, col: c) }

            // The trail — white dots ahead.
            var trail = Path()
            trail.move(to: TRAIL[0])
            for pt in TRAIL.dropFirst() { trail.addLine(to: pt) }
            g.stroke(trail, with: .color(.white.opacity(0.85)),
                     style: StrokeStyle(lineWidth: 6, lineCap: .round, dash: [0.1, 16]))

            // Node 10 — the burst.
            drawClearedNode(&g, ink, t: t)
            // Node 11 — pulse + START.
            drawNextNode(&g, ink, t: t)
            // The locked stone beyond 11.
            jellyGlossBall(&g, ink, x: 278, y: 452, r: 18, .locked)
            g.stroke(jellyArcPath(center: CGPoint(x: 278, y: 450), r: 3.5, from: .pi, to: 2 * .pi, steps: 8),
                     with: .color(jellyRGBA(90, 75, 110, 0.75)), style: StrokeStyle(lineWidth: 2, lineCap: .round))
            g.fill(Path(roundedRect: CGRect(x: 272.5, y: 450, width: 11, height: 8), cornerRadius: 2), with: .color(jellyRGBA(90, 75, 110, 0.75)))

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

    private func drawClearedNode(_ g: inout GraphicsContext, _ ink: JellyInk, t: CGFloat) {
        var c = g
        c.translateBy(x: 140, y: 1480)
        let ringU = clamp01((t - 0.4) / 0.8)
        var ring = Path(ellipseIn: CGRect(x: 0, y: 0, width: 0, height: 0))
        let rr = 30 + 45 * easeOutCubic(ringU)
        ring = Path(ellipseIn: CGRect(x: -rr, y: -rr, width: rr * 2, height: rr * 2))
        c.stroke(ring, with: .color(Color(hex: 0xFFD43A).opacity(0.7 * (1 - ringU))), lineWidth: 3)
        c.fill(jellyEllipse(0, 20, 32, 10), with: .color(jellyRGBA(60, 30, 60, 0.2)))
        jellyGlossBall(&c, ink, x: 0, y: 0, r: 30, crossing.clearedColors)
        c.draw(Text("\(crossing.clearedLevel)").font(.custom("Fredoka", size: 26).weight(.bold)).foregroundColor(.white.opacity(0.55)), at: CGPoint(x: 0, y: 2.5))
        c.draw(Text("\(crossing.clearedLevel)").font(.custom("Fredoka", size: 26).weight(.bold)).foregroundColor(Color(hex: Jelly.ink)), at: CGPoint(x: 0, y: 1))
        // Three stars pop above.
        for (i, k) in [-1, 0, 1].enumerated() {
            let sc = clamp01(anim(0, 1, t, 0.5 + CGFloat(i) * 0.16, 0.95 + CGFloat(i) * 0.16, easeOutBack))
            var sg = c
            sg.translateBy(x: CGFloat(k) * 24, y: -44 + abs(CGFloat(k)) * 6)
            sg.scaleBy(x: sc, y: sc)
            jellyStar(&sg, x: 0, y: 0, r: k == 0 ? 9 : 7.5, filled: true)
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

    private func drawNextNode(_ g: inout GraphicsContext, _ ink: JellyInk, t: CGFloat) {
        var c = g
        c.translateBy(x: 195, y: 540)
        let pulse = t > Cue.settle ? 0.55 + 0.25 * sin((t - Cue.settle) * 3.2) : 0
        if pulse > 0 {
            let pr = 40 + 6 * sin((t - Cue.settle) * 3.2)
            c.stroke(Path(ellipseIn: CGRect(x: -pr, y: -pr + 3, width: pr * 2, height: pr * 2)),
                     with: .color(.white.opacity(pulse)), lineWidth: 3)
            c.stroke(Path(ellipseIn: CGRect(x: -37, y: -34, width: 74, height: 74)),
                     with: .color(jellyRGBA(255, 210, 90, 0.9 * pulse)), lineWidth: 5)
        }
        c.fill(jellyEllipse(0, 20, 32, 10), with: .color(jellyRGBA(60, 30, 60, 0.2)))
        jellyGlossBall(&c, ink, x: 0, y: 0, r: 30, crossing.nextColors)
        c.draw(Text("\(crossing.nextLevel)").font(.custom("Fredoka", size: 26).weight(.bold)).foregroundColor(.white.opacity(0.55)), at: CGPoint(x: 0, y: 2.5))
        c.draw(Text("\(crossing.nextLevel)").font(.custom("Fredoka", size: 26).weight(.bold)).foregroundColor(Color(hex: Jelly.ink)), at: CGPoint(x: 0, y: 1))
        let startOp = anim(0, 1, t, Cue.settle + 0.2, Cue.settle + 0.7, easeOutCubic)
        if startOp > 0 {
            var r = c
            r.opacity = Double(startOp)
            jellyRibbon(&r, ink, x: 0, y: 44, text: "START", col: Jelly.ink)
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
                JellyCrest()
                    .frame(width: 52, height: 46)
                Text("NEW REGION")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(3)
                    .foregroundStyle(Color(hex: 0x7A4FD6))
                Text(crossing.regionName)
                    .font(.custom("Fredoka", size: 34).weight(.semibold))
                    .foregroundStyle(Color(hex: Jelly.ink))
                Text(crossing.regionSpan)
                    .font(.custom("Fredoka", size: 15).weight(.medium))
                    .foregroundStyle(Color(hex: 0x6A5F73))
                    .padding(.top, 2)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 26)
            .frame(width: 264)
            .background(Color(hex: 0xFFF7FB), in: RoundedRectangle(cornerRadius: 28))
            .shadow(color: Color(hex: 0x3A2433).opacity(0.35), radius: 20, y: 7)
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
                .foregroundStyle(Color(hex: Jelly.ink))
                .padding(.horizontal, 18)
                .padding(.vertical, 9)
                .background(Color(hex: 0xFFF7FB).opacity(0.94), in: Capsule())
                .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 54)
                .transition(.opacity)
        }
    }
}

/// The banner's crest: the jelly dodo, small and pleased.
private struct JellyCrest: View {
    var body: some View {
        Canvas { ctx, size in
            var g = ctx
            var pose = DodoPose()
            pose.cheekOpacity = 0.9
            drawJellyDodo(&g, at: CGPoint(x: size.width / 2, y: size.height - 2), height: size.height - 6, pose: pose, groundShadow: true)
        }
    }
}
