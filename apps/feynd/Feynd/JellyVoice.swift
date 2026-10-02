import SwiftUI
import UIKit

// The voice screen's jelly kit (2026-10-02). The bone "Dodo Radio" it
// replaces (DodoRadioDial, in git history) was the old brand's object; in
// the jelly brand the dodo itself is the voice. It stands on a jelly cushion
// and performs the session: looks around while tuning in, leans in wide-eyed
// while you talk, looks up and away while it thinks (three bouncing jelly
// dots), and talks with its little mouth while rings ripple out behind it.
// Under it sits either a squishy press-to-talk key (hold-to-talk) or a row
// of jelly bars (hands-free). The same kit dresses the grading wait and the
// Final Review's grade ball.

/// What the voice screen's dodo is doing.
enum VoiceMood: String, Equatable {
    case tuning      // connecting
    case listening   // ready; Dodo's turn to listen
    case talking     // hold-to-talk: the key is held, you are speaking
    case thinking    // hold-to-talk: released, waiting for the reply
    case speaking    // Dodo is talking
    case ended
}

// MARK: - A jelly ball (buttons, the grade, the thinking dots)

/// A glossy ball in a triad's colours: dark base under it, lit from the
/// upper left, an inner rim, two highlights. The map's level stones are the
/// same recipe (`JellyNodeView`).
struct JellyBall: View {
    let triad: JellyTriad
    let diameter: CGFloat
    var drop: CGFloat = 6

    var body: some View {
        let r = diameter / 2
        ZStack {
            Circle().fill(Color(hex: triad.dark)).offset(y: drop)
            Circle().fill(RadialGradient(stops: [
                .init(color: Color(hex: triad.light), location: 0),
                .init(color: Color(hex: triad.base), location: 0.55),
                .init(color: Color(hex: triad.dark), location: 1),
            ], center: UnitPoint(x: 0.325, y: 0.275), startRadius: r * 0.05, endRadius: r * 1.25))
            Circle()
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.6), .clear, jellyRGBA(60, 20, 60, 0.28)],
                                             startPoint: .top, endPoint: .bottom), lineWidth: max(3, r * 0.14))
                .blur(radius: max(1.2, r * 0.06))
                .clipShape(Circle())
            Ellipse()
                .fill(RadialGradient(colors: [.white.opacity(0.9), .white.opacity(0)], center: .center,
                                     startRadius: 0, endRadius: r * 0.5))
                .frame(width: r, height: r * 0.5)
                .rotationEffect(.radians(-0.5))
                .offset(x: -r * 0.3, y: -r * 0.45)
            Ellipse()
                .fill(.white.opacity(0.95))
                .frame(width: r * 0.18, height: r * 0.11)
                .rotationEffect(.radians(-0.6))
                .offset(x: -r * 0.5, y: -r * 0.42)
        }
        .frame(width: diameter, height: diameter)
    }
}

/// The jelly press: a button squashes under the finger and wobbles back.
struct JellyPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(x: configuration.isPressed ? 1.09 : 1, y: configuration.isPressed ? 0.9 : 1, anchor: .bottom)
            .animation(.spring(response: 0.24, dampingFraction: 0.42), value: configuration.isPressed)
    }
}

extension JellyTriad {
    static let cherry = JellyTriad(light: 0xFF9A96, base: 0xFF2B36, dark: 0xBF0D1C)
    static let peach = JellyTriad(light: 0xFFE6CF, base: 0xFFAA82, dark: 0xF06C55)
    static let glass = JellyTriad(light: 0xFFFFFF, base: 0xF1E8F5, dark: 0xCDBFDA)
    static let glassNight = JellyTriad(light: 0x5A4D6E, base: 0x3A3048, dark: 0x241D2E)
}

// MARK: - The stage: the dodo on its cushion

struct JellyVoiceStage: View {
    let mood: VoiceMood
    var dodoHeight: CGFloat = 164

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    /// The mood being left and when — poses blend across a quarter second.
    @State private var from: VoiceMood = .tuning
    @State private var changedAt = Date.distantPast

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion)) { timeline in
            Canvas { ctx, size in
                draw(ctx, size: size, now: timeline.date)
            }
        }
        .frame(width: 300, height: dodoHeight + 118)
        .onChange(of: mood) { old, _ in
            from = old
            changedAt = Date()
        }
        .accessibilityElement()
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        switch mood {
        case .tuning: return "Connecting"
        case .listening: return "Dodo is listening"
        case .talking: return "Listening to you. Release to send."
        case .thinking: return "Dodo is thinking"
        case .speaking: return "Dodo is speaking"
        case .ended: return "Session ended"
        }
    }

    /// The dodo's pose for a mood at time `t`. Layered over the idle loop so
    /// it always breathes and blinks.
    static func pose(_ mood: VoiceMood, t: CGFloat, still: Bool) -> DodoPose {
        var p = DodoMood.idle(t, seed: 2, reduceMotion: still)
        let m: CGFloat = still ? 0 : 1          // motion gate
        switch mood {
        case .tuning:
            // Looking around for the signal, tuft twitching.
            p.rollDegrees = 3 * sin(t * 1.3) * m
            p.pupilOffset = CGSize(width: 2.6 * sin(t * 1.7) * m, height: -1.2)
            p.sproutAngle = 12 * sin(t * 4.2) * m
        case .listening:
            // Leaning in, big eyes, a slow curious tilt.
            p.scaleY *= 1.02
            p.pupilScale = 1.12
            p.rollDegrees = 2.2 * sin(t * 0.9) * m
            p.cheekOpacity = 0.72
            p.sproutAngle += 5 * sin(t * 2.1) * m
        case .talking:
            // You are speaking: all ears, pressed down a little like the
            // key, nodding along. No blinking.
            let nod = sin(t * 5.5) * m
            p.scaleY = 0.93 + 0.012 * nod
            p.scaleX = 1.07 - 0.01 * nod
            p.pupilScale = 1.18
            p.eyeScaleY = 1
            p.cheekOpacity = 0.85
            p.wingAngle = 8
        case .thinking:
            p.rollDegrees = 4
            p.pupilOffset = CGSize(width: -2.4, height: -2.6)
            p.sproutAngle = -9 + 3 * sin(t * 2) * m
            p.scaleY *= 0.99
        case .speaking:
            // Syllables: a fast flap shaped by a slower phrase envelope.
            let syll = still ? 0.4 : abs(sin(t * 9.2)) * (0.55 + 0.45 * abs(sin(t * 2.1 + 0.7)))
            p.mouth = 0.2 + 0.8 * syll
            p.scaleY = 1 + 0.035 * syll
            p.scaleX = 1 - 0.02 * syll
            p.yOffset = -3 * syll
            p.wingAngle = 16 * abs(sin(t * 3.4)) * m
            p.sproutAngle = 7 * sin(t * 6) * m
            p.cheekOpacity = 0.8
        case .ended:
            p.eyeScaleY = 0.1
            p.scaleY = 0.97
            p.scaleX = 1.02
            p.sproutAngle = -14
            p.cheekOpacity = 0.45
        }
        return p
    }

    private static func mix(_ a: DodoPose, _ b: DodoPose, _ u: CGFloat) -> DodoPose {
        func l(_ x: CGFloat, _ y: CGFloat) -> CGFloat { x + (y - x) * u }
        var p = b
        p.scaleX = l(a.scaleX, b.scaleX); p.scaleY = l(a.scaleY, b.scaleY)
        p.rollDegrees = l(a.rollDegrees, b.rollDegrees); p.yOffset = l(a.yOffset, b.yOffset)
        p.sproutAngle = l(a.sproutAngle, b.sproutAngle); p.wingAngle = l(a.wingAngle, b.wingAngle)
        p.pupilScale = l(a.pupilScale, b.pupilScale)
        p.pupilOffset = CGSize(width: l(a.pupilOffset.width, b.pupilOffset.width),
                               height: l(a.pupilOffset.height, b.pupilOffset.height))
        p.cheekOpacity = l(a.cheekOpacity, b.cheekOpacity); p.mouth = l(a.mouth, b.mouth)
        p.eyeScaleY = u < 0.5 ? a.eyeScaleY : b.eyeScaleY
        return p
    }

    private func draw(_ context: GraphicsContext, size: CGSize, now: Date) {
        var ctx = context
        let t = CGFloat(now.timeIntervalSinceReferenceDate)
        let dark = scheme == .dark
        let cx = size.width / 2
        // Room under the feet for the cushion's drop edge and shadow.
        let ground = size.height - 56
        let centre = CGPoint(x: cx, y: ground - dodoHeight * 0.5)
        let dt = CGFloat(now.timeIntervalSince(changedAt))
        let u: CGFloat = reduceMotion ? 1 : max(0, min(1, dt / 0.28))
        let ease = 1 - (1 - u) * (1 - u)

        // ── Behind the dodo: what the moment sounds like.
        let sky = Color(hex: 0x5EC6EC)
        switch mood {
        case .speaking:
            // Ripples leaving the dodo.
            for i in 0..<3 {
                let k = reduceMotion ? CGFloat(i) / 3 : (t * 0.55 + CGFloat(i) / 3).truncatingRemainder(dividingBy: 1)
                let r = dodoHeight * 0.46 + dodoHeight * 0.5 * k
                ctx.stroke(Path(ellipseIn: CGRect(x: centre.x - r, y: centre.y - r, width: r * 2, height: r * 2)),
                           with: .color(sky.opacity(Double((1 - k) * 0.55 * ease))), lineWidth: 1.5 + 3 * (1 - k))
            }
        case .listening:
            // One calm mint breath: "go ahead".
            let r = dodoHeight * 0.62 + (reduceMotion ? 0 : 5 * sin(t * 2))
            ctx.stroke(Path(ellipseIn: CGRect(x: centre.x - r, y: centre.y - r, width: r * 2, height: r * 2)),
                       with: .color(Color(hex: 0x4DC5A2).opacity(0.35 * Double(ease))), lineWidth: 3)
        case .talking:
            // You're live: a lemon ring and a warm glow.
            let r = dodoHeight * 0.64
            ctx.fill(Path(ellipseIn: CGRect(x: centre.x - r * 1.25, y: centre.y - r * 1.25, width: r * 2.5, height: r * 2.5)),
                     with: .radialGradient(Gradient(colors: [Color(hex: 0xFFD43A).opacity(0.3 * Double(ease)), Color(hex: 0xFFD43A).opacity(0)]),
                                           center: centre, startRadius: r * 0.5, endRadius: r * 1.25))
            ctx.stroke(Path(ellipseIn: CGRect(x: centre.x - r, y: centre.y - r, width: r * 2, height: r * 2)),
                       with: .color(Color(hex: 0xFFD43A).opacity(0.95 * Double(ease))), lineWidth: 5)
        case .tuning:
            // A dashed ring turning: finding the station.
            let r = dodoHeight * 0.62
            var ring = ctx
            ring.translateBy(x: centre.x, y: centre.y)
            ring.rotate(by: .radians(reduceMotion ? 0 : Double(t) * 0.8))
            ring.stroke(Path(ellipseIn: CGRect(x: -r, y: -r, width: r * 2, height: r * 2)),
                        with: .color((dark ? Color.white : Color(hex: 0x7A4FD6)).opacity(0.35)),
                        style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [3, 13]))
        case .thinking, .ended:
            break
        }

        // ── The cushion: a peach jelly pad with its own drop edge and gloss.
        let pad = JellyTriad.peach
        let rx: CGFloat = dodoHeight * 0.6, ry: CGFloat = dodoHeight * 0.13
        ctx.fill(jellyEllipse(cx, ground + ry * 0.9 + 8, rx * 1.08, ry * 0.9),
                 with: .color(jellyRGBA(60, 30, 60, dark ? 0.45 : 0.16)))
        ctx.fill(jellyEllipse(cx, ground + ry * 0.55 + 6, rx, ry), with: .color(Color(hex: pad.dark)))
        ctx.fill(jellyEllipse(cx, ground + ry * 0.55, rx, ry),
                 with: .radialGradient(Gradient(stops: [
                    .init(color: Color(hex: pad.light), location: 0),
                    .init(color: Color(hex: pad.base), location: 0.6),
                    .init(color: Color(hex: pad.dark), location: 1),
                 ]), center: CGPoint(x: cx - rx * 0.3, y: ground), startRadius: 2, endRadius: rx * 1.05))
        ctx.fill(jellyEllipse(cx - rx * 0.42, ground + ry * 0.22, rx * 0.26, ry * 0.2, rot: -0.08),
                 with: .color(.white.opacity(0.6)))

        // ── The dodo.
        let target = Self.pose(mood, t: t, still: reduceMotion)
        let pose = u >= 1 ? target : Self.mix(Self.pose(from, t: t, still: reduceMotion), target, ease)
        let lift = max(0, min(1, -pose.yOffset / 26))
        ctx.fill(jellyEllipse(cx, ground + ry * 0.45, dodoHeight * 0.3 * pose.scaleX * (1 - 0.3 * lift), ry * 0.42),
                 with: .color(jellyRGBA(120, 40, 40, 0.22)))
        drawJellyDodo(&ctx, at: CGPoint(x: cx, y: ground + ry * 0.45), height: dodoHeight, pose: pose)

        // ── Thinking: three jelly dots bouncing by its head.
        if mood == .thinking {
            let cols: [JellyTriad] = [.peaks, .lagoon, .gold]
            for i in 0..<3 {
                let fi = CGFloat(i)
                let hop: CGFloat = reduceMotion ? 0 : max(0, sin(t * 5.2 - fi * 0.7)) * 9
                let x = cx + dodoHeight * 0.36 + fi * 17
                let y = ground - dodoHeight * 0.98 - hop - fi * 3
                var dot = ctx
                dot.opacity = Double(ease)
                jellyGlossBall(&dot, JellyInk(dark: false), x: x, y: y, r: 5.5 + fi * 0.6, cols[i])
            }
        }
    }
}

// MARK: - Press-to-talk: one big squishy key

struct JellyTalkKey: View {
    let mood: VoiceMood
    var onKeyDown: () -> Void = {}
    var onKeyUp: () -> Void = {}

    @State private var keyPressed = false

    private var held: Bool { mood == .talking || keyPressed }
    private var enabled: Bool { mood == .listening || mood == .speaking || mood == .thinking || mood == .talking }

    private var legend: String {
        switch mood {
        case .talking: return "Listening…"
        case .thinking: return "One moment"
        case .speaking: return "Press to cut in"
        case .tuning: return "Tuning in"
        case .ended: return "Ended"
        case .listening: return keyPressed ? "Listening…" : "Hold to talk"
        }
    }

    private var triad: JellyTriad {
        if !enabled { return .locked }
        return held ? .gold : .lagoon
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 30, style: .continuous)
        ZStack {
            if held {
                shape.fill(Color(hex: 0xFFD43A).opacity(0.45)).blur(radius: 14).padding(-8)
            }
            // The key's side, then its lit top.
            shape.fill(Color(hex: triad.dark)).offset(y: 7)
            shape.fill(RadialGradient(stops: [
                .init(color: Color(hex: triad.light), location: 0),
                .init(color: Color(hex: triad.base), location: 0.5),
                .init(color: Color(hex: triad.dark), location: 1),
            ], center: UnitPoint(x: 0.3, y: 0.1), startRadius: 4, endRadius: 190))
            shape
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.65), .clear, jellyRGBA(60, 20, 60, 0.3)],
                                             startPoint: .top, endPoint: .bottom), lineWidth: 6)
                .blur(radius: 2.5)
                .clipShape(shape)
            Ellipse()
                .fill(RadialGradient(colors: [.white.opacity(0.9), .white.opacity(0)], center: .center,
                                     startRadius: 0, endRadius: 46))
                .frame(width: 92, height: 24)
                .rotationEffect(.degrees(-6))
                .offset(x: -62, y: -22)
            Ellipse().fill(.white.opacity(0.95)).frame(width: 9, height: 5.5)
                .rotationEffect(.degrees(-20)).offset(x: -98, y: -20)

            HStack(spacing: 10) {
                Image(systemName: held ? "waveform" : "mic.fill")
                    .font(.system(size: 21, weight: .bold))
                    .contentTransition(.symbolEffect(.replace))
                Text(legend)
                    .font(.custom("Fredoka", size: 19).weight(.semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(Color(hex: Jelly.ink).opacity(enabled ? 1 : 0.6))
        }
        .frame(width: 236, height: 76)
        .scaleEffect(x: held ? 1.045 : 1, y: held ? 0.9 : 1, anchor: .bottom)
        .offset(y: held ? 4 : 0)
        .contentShape(shape)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard enabled, !keyPressed else { return }
                    keyPressed = true
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    onKeyDown()
                }
                .onEnded { _ in
                    guard keyPressed else { return }
                    keyPressed = false
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onKeyUp()
                }
        )
        // Under-damped on purpose: the key wobbles as it comes back up.
        .animation(.spring(response: 0.26, dampingFraction: 0.45), value: held)
        .animation(.easeOut(duration: 0.2), value: enabled)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(held ? "Listening, release to send" : "Press and hold to talk")
    }
}

// MARK: - Hands-free: jelly bars

/// Seven gumdrop bars that bounce with the conversation: tall while Dodo
/// speaks, a murmur while it listens, nearly still otherwise.
struct JellyVoiceBars: View {
    let mood: VoiceMood
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let cols: [UInt32] = [0xFF9FC8, 0xFFAA82, 0xFFD43A, 0x91E9CC, 0x5EC6EC, 0xA77BF2, 0xFF9FC8]
    private let speeds: [Double] = [5.2, 6.4, 4.5, 6.9, 5.7, 4.9, 6.1]
    private let phases: [Double] = [0.0, 1.3, 2.4, 3.1, 4.3, 5.2, 0.7]

    private var activity: Double {
        switch mood {
        case .speaking: return 1.0
        case .listening: return 0.32
        default: return 0.1
        }
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 24.0, paused: reduceMotion)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            Canvas { ctx, size in
                let w: CGFloat = 15, gap: CGFloat = 10
                let total = CGFloat(cols.count) * w + CGFloat(cols.count - 1) * gap
                let x0 = (size.width - total) / 2
                for i in 0..<cols.count {
                    let wave = reduceMotion ? 0.5 : 0.5 + 0.5 * sin(t * speeds[i] + phases[i])
                    let h = CGFloat(15 + (4 + 44 * activity) * wave)
                    let x = x0 + CGFloat(i) * (w + gap)
                    let rect = CGRect(x: x, y: (size.height - h) / 2, width: w, height: h)
                    let c = cols[i]
                    ctx.fill(Path(roundedRect: rect.offsetBy(dx: 0, dy: 3), cornerRadius: w / 2),
                             with: .color(Color(hex: Jelly.shade(c, 0.72))))
                    ctx.fill(Path(roundedRect: rect, cornerRadius: w / 2),
                             with: .linearGradient(Gradient(colors: [Color(hex: Jelly.tint(c, 0.55)), Color(hex: c), Color(hex: Jelly.shade(c, 0.82))]),
                                                   startPoint: CGPoint(x: rect.minX, y: rect.minY), endPoint: CGPoint(x: rect.maxX, y: rect.maxY)))
                    ctx.fill(Path(roundedRect: CGRect(x: x + 3, y: rect.minY + 4, width: 3.2, height: max(3, h * 0.36)), cornerRadius: 1.6),
                             with: .color(.white.opacity(0.75)))
                }
            }
        }
        .frame(width: 200, height: 76)
        .opacity(mood == .ended ? 0.5 : 1)
        .accessibilityHidden(true)
    }
}

// MARK: - The backdrop: slow jelly bubbles

struct JellyBubbleBackdrop: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let dayCols: [UInt32] = [0x5EC6EC, 0xFF9FC8, 0xFFD43A, 0x91E9CC, 0xA77BF2, 0xFFAA82]
    /// At night the warm ones turn muddy on indigo; keep the cool jellies.
    private let nightCols: [UInt32] = [0x5EC6EC, 0xFF9FC8, 0xA77BF2, 0x91E9CC, 0x7A8CFF, 0xC77DFF]

    var body: some View {
        let cols = scheme == .dark ? nightCols : dayCols
        return TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: reduceMotion)) { timeline in
            let t = CGFloat(timeline.date.timeIntervalSinceReferenceDate)
            Canvas { ctx, size in
                let dark = scheme == .dark
                func frac(_ v: CGFloat) -> CGFloat { v - v.rounded(.down) }
                // A warm bloom low behind the stage.
                let bloomC = CGPoint(x: size.width / 2, y: size.height * 0.46)
                ctx.fill(Path(CGRect(origin: .zero, size: size)),
                         with: .radialGradient(Gradient(colors: [
                            (dark ? Color(hex: 0x5A3A6E) : Color(hex: 0xFFE9D6)).opacity(dark ? 0.55 : 0.9),
                            (dark ? Color(hex: 0x5A3A6E) : Color(hex: 0xFFE9D6)).opacity(0),
                         ]), center: bloomC, startRadius: 10, endRadius: size.width * 0.82))
                for i in 0..<9 {
                    let fi = CGFloat(i)
                    let r = 26 + 70 * frac(fi * 0.37 + 0.2)
                    let speed = 0.006 + 0.007 * frac(fi * 0.53)
                    let rise = reduceMotion ? frac(fi * 0.283 + 0.1) : frac(t * speed + fi * 0.283)
                    let x = size.width * frac(fi * 0.618 + 0.13) + (reduceMotion ? 0 : 10 * sin(t * 0.3 + fi))
                    let y = size.height * 1.1 - (size.height * 1.25) * rise
                    let c = Color(hex: cols[i % cols.count])
                    let a: Double = dark ? 0.2 : 0.2
                    ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                             with: .radialGradient(Gradient(stops: [
                                .init(color: .white.opacity(dark ? 0.3 : 0.6), location: 0),
                                .init(color: c.opacity(a), location: 0.3),
                                .init(color: c.opacity(a * 0.5), location: 0.8),
                                .init(color: c.opacity(0), location: 1),
                             ]), center: CGPoint(x: x - r * 0.32, y: y - r * 0.36), startRadius: 0, endRadius: r * 1.25))
                }
                if dark {
                    for i in 0..<10 {
                        let fi = CGFloat(i)
                        let tw = reduceMotion ? 0.5 : 0.3 + 0.5 * abs(sin(t * (0.7 + 0.2 * frac(fi * 0.41)) + fi))
                        let x = size.width * frac(fi * 0.618 + 0.21), y = size.height * (0.05 + 0.8 * frac(fi * 0.755))
                        ctx.fill(Path(ellipseIn: CGRect(x: x - 1.5, y: y - 1.5, width: 3, height: 3)),
                                 with: .color(Color(hex: 0xFBEEF6).opacity(Double(tw) * 0.7)))
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Waiting on a grade

/// "Dodo is scoring your round…": the thinking dodo (its three jelly dots
/// bouncing by its head) over the line.
struct JellyGradingView: View {
    let text: String

    var body: some View {
        VStack(spacing: 6) {
            JellyVoiceStage(mood: .thinking, dodoHeight: 132)
            Text(text)
                .font(.custom("Fredoka", size: 18).weight(.medium))
                .foregroundStyle(FeyndTheme.text2)
        }
    }
}

/// The Final Review's letter on a jelly ball: lemon when it passes, the
/// map's locked grey when it doesn't.
struct JellyGradeBall: View {
    let grade: String
    let passed: Bool
    var diameter: CGFloat = 168

    var body: some View {
        ZStack {
            Ellipse()
                .fill(jellyRGBA(60, 30, 60, 0.18))
                .frame(width: diameter * 1.02, height: diameter * 0.22)
                .offset(y: diameter * 0.52)
            JellyBall(triad: passed ? .gold : .locked, diameter: diameter, drop: 9)
            Text(grade)
                .font(.custom("Fredoka", size: diameter * 0.52).weight(.bold))
                .foregroundStyle(.white.opacity(0.55))
                .offset(y: 4)
            Text(grade)
                .font(.custom("Fredoka", size: diameter * 0.52).weight(.bold))
                .foregroundStyle(Color(hex: Jelly.ink))
                .offset(y: 1.5)
        }
        .frame(width: diameter, height: diameter + 14)
    }
}
