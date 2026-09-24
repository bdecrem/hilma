import SwiftUI

/// The playable Token Surfers pane: canvas, HUD, swipes, taps and arrow keys.
struct SurfGameView: View {
    let engine: SurfEngine
    var running: Bool
    var compact = false
    var onScore: (Int) -> Void = { _ in }

    @State private var clock = FrameClock()
    @State private var swipeFired = false
    @State private var bruhAt: Date?
    @FocusState private var focused: Bool

    var body: some View {
        TimelineView(.animation(paused: !running)) { tl in
            let now = tl.date
            ZStack {
                Canvas { ctx, size in
                    let dt = clock.tick(now)
                    engine.step(dt)
                    SurfRenderer(e: engine, size: size).draw(&ctx)
                }
                hud(now)
            }
        }
        .contentShape(Rectangle())
        .gesture(swipe)
        .simultaneousGesture(SpatialTapGesture().onEnded { tap($0.location) })
        .overlay(GeometryReader { g in Color.clear.onAppear { width = g.size.width }.onChange(of: g.size.width) { _, w in width = w } })
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow, .space, "a", "d", "w", "s"]) { press in
            switch press.key {
            case .leftArrow, "a": engine.left()
            case .rightArrow, "d": engine.right()
            case .upArrow, .space, "w": engine.jump()
            case .downArrow, "s": engine.roll()
            default: return .ignored
            }
            return .handled
        }
        .onAppear {
            engine.onSound = { SurfAudio.shared.play($0) }
            engine.onCrash = { bruhAt = .now }
        }
        .onChange(of: running) { _, r in
            engine.paused = !r
            clock.reset()
            if !r { onScore(engine.score) }
        }
        .accessibilityLabel("Token Surfers game. Swipe to change lanes, jump or roll.")
    }

    @State private var width: CGFloat = 390

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 14)
            .onChanged { v in
                guard !swipeFired else { return }
                let dx = v.translation.width, dy = v.translation.height
                guard max(abs(dx), abs(dy)) > 22 else { return }
                swipeFired = true
                focused = true
                if abs(dx) > abs(dy) { dx < 0 ? engine.left() : engine.right() }
                else { dy < 0 ? engine.jump() : engine.roll() }
            }
            .onEnded { _ in swipeFired = false }
    }

    /// Taps: left third / right third change lanes, the middle jumps.
    private func tap(_ p: CGPoint) {
        focused = true
        if p.x < width / 3 { engine.left() }
        else if p.x > width * 2 / 3 { engine.right() }
        else { engine.jump() }
    }

    @ViewBuilder private func hud(_ now: Date) -> some View {
        let s = compact ? 0.75 : 1.0
        VStack {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: -4) {
                    StrokedText(text: "x\(engine.multiplier)", font: Theme.anton(34 * s), stroke: 2.5)
                    StrokedText(text: "TOKEN SURFERS", font: Theme.anton(13 * s), stroke: 1.5)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    StrokedText(text: String(format: "%07d", engine.score), font: Theme.anton(30 * s), stroke: 2.5)
                        .monospacedDigit()
                    HStack(spacing: 4) {
                        Circle().fill(Theme.yellow).overlay(Circle().strokeBorder(Color(hex: 0xB9801E), lineWidth: 2))
                            .frame(width: 16 * s, height: 16 * s)
                        StrokedText(text: "\(engine.coins)", font: Theme.anton(17 * s), color: Theme.yellow, stroke: 1.5)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            Spacer()
        }
        .allowsHitTesting(false)

        // event toasts: bugs, stomps, shipped, bruh
        if let bruh = bruhAt, now.timeIntervalSince(bruh) < 1.1 {
            StrokedText(text: "BRUH 💀", font: Theme.black(38 * s), color: .white, stroke: 3)
                .scaleEffect(1 + max(0, 0.3 - now.timeIntervalSince(bruh)))
                .allowsHitTesting(false)
        } else if let ev = engine.lastEvent, engine.time - ev.at < 1.6 {
            StrokedText(text: ev.text, font: Theme.black(24 * s), color: Theme.yellow, stroke: 2.5)
                .offset(y: -30)
                .allowsHitTesting(false)
        }
    }
}

/// Frame delta bookkeeping outside SwiftUI state (mutated from the Canvas).
final class FrameClock {
    private var last: Date?
    func tick(_ now: Date) -> Double {
        defer { last = now }
        guard let last else { return 0 }
        return max(0, now.timeIntervalSince(last))
    }
    func reset() { last = nil }
}
