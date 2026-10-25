import SwiftUI

/// Lesson title, the staff, play/stop and the tempo readout.
struct TransportBar: View {
    let state: LessonState
    var compact = false

    var body: some View {
        if compact {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    title(size: 26)
                    stepLabel
                }
                Spacer(minLength: 8)
                controls(size: 34)
                TempoReadout(bpm: state.tempo, size: 30)
            }
        } else {
            HStack(alignment: .center, spacing: 20) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    title(size: 30)
                    stepLabel
                }
                StaffLines()
                    .frame(maxWidth: .infinity)
                controls(size: 36)
                TempoReadout(bpm: state.tempo, size: 38)
            }
        }
    }

    private func title(size: CGFloat) -> some View {
        Text("\(state.code) \(state.title)")
            .font(.display(size))
            .textCase(.uppercase)
            .foregroundStyle(Palette.text)
            .lineLimit(1)
    }

    private var stepLabel: some View {
        Text("Step \(state.step) of \(state.stepCount)")
            .dataLabel(12)
            .foregroundStyle(Palette.muted)
            .lineLimit(1)
    }

    private func controls(size: CGFloat) -> some View {
        HStack(spacing: 6) {
            TransportButton(symbol: "play.fill", lit: state.playing, size: size, label: "Play")
            TransportButton(symbol: "stop.fill", lit: false, size: size, label: "Stop")
        }
    }
}

/// A flat square hardware button. `lit` draws the glyph in `signal`.
struct TransportButton: View {
    let symbol: String
    let lit: Bool
    let size: CGFloat
    let label: String

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        Button {} label: {
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
struct TempoReadout: View {
    let bpm: Int
    let size: CGFloat

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("\(bpm)")
                .font(.display(size))
                .monospacedDigit()
                .foregroundStyle(Palette.text)
            Text("BPM")
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 12)
        .frame(height: size * 1.1)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(bpm) bpm")
    }
}
