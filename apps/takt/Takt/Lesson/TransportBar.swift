import SwiftUI

/// Lesson title, the staff, play/stop and the tempo readout.
struct TransportBar: View {
    let state: LessonState
    var compact = false
    @Environment(\.lessonControls) private var controls

    var body: some View {
        if compact {
            HStack(alignment: .center, spacing: 10) {
                backButton(size: 34)
                // iPhone: the lesson's title, then "Lesson 2 of 5" (the module's name doesn't
                // fit beside the back button and the transport).
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.lessonTitle.isEmpty ? "\(state.code) \(state.title)" : state.lessonTitle)
                        .font(.display(26))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Text(state.jam ? "Play · lesson \(state.lesson)" : "Lesson \(state.lesson) of \(state.lessonCount)")
                        .dataLabel(12)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 8)
                transportButtons(size: 34)
                TempoKnob(bpm: state.tempo, pending: state.pendingTempo, counts: state.stepTempo, compact: true)
            }
        } else {
            HStack(alignment: .center, spacing: 20) {
                backButton(size: 36)
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    title(size: 30)
                    stepLabel
                }
                StaffLines()
                    .frame(maxWidth: .infinity)
                transportButtons(size: 36)
                TempoKnob(bpm: state.tempo, pending: state.pendingTempo, counts: state.stepTempo)
            }
        }
    }

    private func title(size: CGFloat) -> some View {
        Text(state.lessonTitle.isEmpty ? "\(state.code) \(state.title)" : state.lessonTitle)
            .font(.display(size))
            .textCase(.uppercase)
            .foregroundStyle(Palette.text)
            .lineLimit(1)
    }

    private func backButton(size: CGFloat) -> some View {
        TransportButton(symbol: "chevron.left", lit: false, size: size, label: "Back to the module", action: controls.back)
    }

    private var stepLabel: some View {
        Text(state.moduleTitle.isEmpty ? "Step \(state.step) of \(state.stepCount)"
             : state.jam ? "\(state.moduleTitle) · Play" : "\(state.moduleTitle) · \(state.lesson) of \(state.lessonCount)")
            .dataLabel(12)
            .foregroundStyle(Palette.muted)
            .lineLimit(1)
    }

    private func transportButtons(size: CGFloat) -> some View {
        HStack(spacing: 6) {
            TransportButton(symbol: state.playing ? "pause.fill" : "play.fill", lit: state.playing, size: size,
                            label: state.playing ? "Pause" : "Play", action: controls.togglePlay)
            TransportButton(symbol: "stop.fill", lit: false, size: size, label: "Stop", action: controls.stop)
        }
    }
}

/// A flat square hardware button. `lit` draws the glyph in `signal`.
struct TransportButton: View {
    let symbol: String
    let lit: Bool
    let size: CGFloat
    let label: String
    var action: () -> Void = {}

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size * 0.36, weight: .semibold))
                .foregroundStyle(lit ? Palette.signal : Palette.text)
                .frame(width: size, height: size)
                .background(shape.fill(Palette.panel))
                .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// The LCD tempo readout: the big compressed number and BPM, in a flat panel.
/// A change waiting for the next downbeat shows its number in `cue` (it is "next").
/// Drag up or down to change it, 5 bpm per 24 pt; VoiceOver adjusts it too.
struct TempoReadout: View {
    let bpm: Int
    var pending: Int? = nil
    let size: CGFloat
    @Environment(\.lessonControls) private var controls
    @State private var dragSteps = 0

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("\(pending ?? bpm)")
                .font(.display(size))
                .monospacedDigit()
                .foregroundStyle(pending == nil ? Palette.text : Palette.cue)
            Text("BPM")
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 12)
        .frame(height: size * 1.1)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .contentShape(shape)
        .gesture(DragGesture(minimumDistance: 4)
            .onChanged { g in
                let steps = Int(-g.translation.height / 24)
                if steps != dragSteps {
                    controls.nudgeTempo(5 * (steps - dragSteps))
                    dragSteps = steps
                }
            }
            .onEnded { _ in dragSteps = 0 })
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(pending.map { "\(bpm) bpm, \($0) from the next bar" } ?? "\(bpm) bpm")
        .accessibilityAdjustableAction { direction in
            controls.nudgeTempo(direction == .increment ? 5 : -5)
        }
    }
}
