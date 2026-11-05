import SwiftUI

/// The tempo as a knob: a 270° ring with the value arc, the number in the middle, a tick where
/// the lesson counts (`counts`), and − / + for taps. Drag the knob up or down to turn it; a
/// change lands on the next downbeat and shows in `cue` until then. Below the tick the arc goes
/// muted: you can slow down to learn, it just won't count. On the Stage the same knob runs
/// over half the song's tempo to the song's own (`range`, `counts` at its top, no tick there)
/// and turns the song (`nudge`); the phone's HUD has no room for the − / + (`buttons`).
struct TempoKnob: View {
    let bpm: Int
    var pending: Int? = nil
    /// The tempo the step counts at (nil: a card, a ramp's target shows as the tick).
    var counts: Int? = nil
    var compact = false
    var range: ClosedRange<Int> = Player.tempoRange
    var buttons = true
    /// What a step of ±5 does; the lesson's controls when nil.
    var nudge: ((Int) -> Void)? = nil
    @Environment(\.lessonControls) private var controls
    @State private var dragSteps = 0

    private var size: CGFloat { compact ? 46 : 58 }
    private static let sweep = 270.0

    private func angle(_ v: Int) -> Angle {
        let lo = Double(range.lowerBound), hi = Double(range.upperBound)
        let t = hi > lo ? (Double(min(max(v, range.lowerBound), range.upperBound)) - lo) / (hi - lo) : 1
        return .degrees(-Self.sweep / 2 + t * Self.sweep)
    }

    private func turn(_ delta: Int) {
        (nudge ?? controls.nudgeTempo)(delta)
    }

    var body: some View {
        let shown = pending ?? bpm
        let below = counts.map { shown < $0 } ?? false
        let arcColor: Color = pending != nil ? Palette.cue : below ? Palette.muted : Palette.signal
        let ring = StrokeStyle(lineWidth: compact ? 3 : 4, lineCap: .round)
        let low = angle(range.lowerBound), high = angle(range.upperBound)
        HStack(spacing: compact ? 4 : 8) {
            if buttons { step(-5, symbol: "minus") }
            ZStack {
                Ring(from: low, to: high).stroke(Palette.line, style: ring)
                Ring(from: low, to: angle(shown))
                    .stroke(arcColor, style: ring)
                    .animation(.easeOut(duration: 0.2), value: shown)
                if let c = counts, c < range.upperBound { tick(at: angle(c)) }
                label(shown)
            }
            .frame(width: size, height: size)
            .contentShape(Circle())
            .gesture(DragGesture(minimumDistance: 4)
                .onChanged { g in
                    let steps = Int(-g.translation.height / 18)
                    if steps != dragSteps {
                        turn(5 * (steps - dragSteps))
                        dragSteps = steps
                    }
                }
                .onEnded { _ in dragSteps = 0 })
            if buttons { step(5, symbol: "plus") }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(pending.map { "\(bpm) bpm, \($0) from the next bar" } ?? "\(bpm) bpm")
        .accessibilityValue(counts.map { $0 < range.upperBound ? "counts at \($0)" : "full speed at \($0)" } ?? "")
        .accessibilityAdjustableAction { direction in
            turn(direction == .increment ? 5 : -5)
        }
    }

    /// The tick: where it counts.
    private func tick(at a: Angle) -> some View {
        Capsule()
            .fill(Palette.text)
            .frame(width: 2, height: compact ? 6 : 8)
            .offset(y: -size / 2)
            .rotationEffect(a)
    }

    private func label(_ shown: Int) -> some View {
        VStack(spacing: compact ? -2 : -1) {
            Text("\(shown)")
                .font(.display(compact ? 20 : 24))
                .monospacedDigit()
                .foregroundStyle(pending == nil ? Palette.text : Palette.cue)
            Text("BPM")
                .font(.system(size: compact ? 7 : 8, weight: .semibold, design: .monospaced))
                .foregroundStyle(Palette.muted)
        }
    }

    private func step(_ delta: Int, symbol: String) -> some View {
        Button { turn(delta) } label: {
            Image(systemName: symbol)
                .font(.system(size: compact ? 10 : 12, weight: .bold))
                .foregroundStyle(Palette.text)
                .frame(width: compact ? 22 : 26, height: compact ? 22 : 26)
                .background(Circle().fill(Palette.panel))
                .overlay(Circle().strokeBorder(Palette.line, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(delta > 0 ? "Faster" : "Slower")
    }

    /// An arc of the ring, angles clockwise from the top.
    private struct Ring: Shape {
        var from: Angle
        var to: Angle
        func path(in rect: CGRect) -> Path {
            var p = Path()
            let c = CGPoint(x: rect.midX, y: rect.midY)
            p.addArc(center: c, radius: min(rect.width, rect.height) / 2, startAngle: from - .degrees(90),
                     endAngle: to - .degrees(90), clockwise: false)
            return p
        }
    }
}
