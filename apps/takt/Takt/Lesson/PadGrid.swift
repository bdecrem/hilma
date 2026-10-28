import SwiftUI

/// The 12-bar form as a 4×3 page of pads, like a sequencer.
/// The current bar's pad is filled `signal`; the next one is outlined in `cue` with a corner tick.
struct PadGrid: View {
    let state: LessonState
    let side: CGFloat
    var gap: CGFloat = 10

    var body: some View {
        VStack(spacing: gap) {
            ForEach(0..<3, id: \.self) { row in
                HStack(spacing: gap) {
                    ForEach(0..<4, id: \.self) { col in
                        let i = row * 4 + col
                        Pad(
                            number: i + 1,
                            bar: state.form[i],
                            role: i == state.bar ? .now : i == state.nextBar ? .next : .rest,
                            beat: state.beat,
                            side: side
                        )
                    }
                }
            }
        }
    }

    /// Pad side that fits 4 columns and 3 rows in `size`: min((w − 3·gap) / 4, (h − 2·gap) / 3).
    static func side(fitting size: CGSize, gap: CGFloat) -> CGFloat {
        max(0, min((size.width - 3 * gap) / 4, (size.height - 2 * gap) / 3))
    }
}

struct Pad: View {
    enum Role { case now, next, rest }

    let number: Int
    let bar: FormBar
    let role: Role
    let beat: Int
    let side: CGFloat

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        let ink = role == .now ? Palette.ground : Palette.text
        let label = role == .now ? Palette.ground : Palette.muted
        let pad = side * 0.11

        ZStack {
            shape.fill(role == .now ? Palette.signal : Palette.panel)
            if role == .next {
                shape.strokeBorder(Palette.cue, lineWidth: 1.5)
                CornerTick(inset: 6, leg: max(8, side * 0.09)).fill(Palette.cue)
            } else if role == .rest {
                shape.strokeBorder(Palette.line, lineWidth: 1)
            }

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(String(format: "%02d", number))
                    Spacer(minLength: 0)
                    Text(bar.chord)
                }
                .dataLabel(side < 100 ? 11 : 12, weight: .medium)
                .foregroundStyle(label)

                Spacer(minLength: 0)

                Text(bar.numeral)
                    .font(.system(size: side * 0.3, weight: .semibold, design: .monospaced))
                    .foregroundStyle(ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)

                Spacer(minLength: 0)

                BeatLEDs(beat: role == .now ? beat : nil, size: max(5, side * 0.065))
                    .opacity(role == .now ? 1 : 0)
            }
            .padding(pad)
        }
        .frame(width: side, height: side)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Bar \(number), \(bar.chord), \(bar.numeral)\(role == .now ? ", now" : role == .next ? ", next" : "")")
    }
}

/// Four beat LEDs drawn on the `signal` pad: lit beats filled in `ground`, the rest outlined.
struct BeatLEDs: View {
    let beat: Int?
    let size: CGFloat

    var body: some View {
        HStack(spacing: size * 0.6) {
            ForEach(0..<4, id: \.self) { i in
                let shape = RoundedRectangle(cornerRadius: 1.5)
                ZStack {
                    if let beat, i <= beat {
                        shape.fill(Palette.ground)
                    } else {
                        shape.strokeBorder(Palette.ground, lineWidth: 1)
                    }
                }
                .frame(width: size, height: size)
            }
        }
    }
}

/// Bar counter, chorus number and the gate rings, under the grid.
struct FormFooter: View {
    let state: LessonState

    var body: some View {
        // The iPhone's 370 pt can't always hold all of it (bar 10+ with a 3-ring gate);
        // then the rings speak for "clean" and the word goes.
        ViewThatFits(in: .horizontal) {
            row(gateLabel: "Clean \(state.cleanChoruses) of \(state.gate)")
            row(gateLabel: "\(state.cleanChoruses) of \(state.gate)")
        }
        .dataLabel(12, weight: .medium)
        .lineLimit(1)
    }

    private func row(gateLabel: String) -> some View {
        HStack(spacing: 14) {
            // fixedSize: inside the HStack the labels were measured without their tracking
            // and truncated by a character even with room to spare.
            if state.demo {
                Text(state.countIn.map { "Watching · count-in \($0)" } ?? "Watching")
                    .foregroundStyle(Palette.signal)
                    .fixedSize()
            } else if let n = state.countIn {
                Text("Count-in \(n)")
                    .foregroundStyle(Palette.signal)
                    .fixedSize()
            } else if let run = state.run {
                Text("Run \(run.number) of \(run.count)")
                    .foregroundStyle(Palette.text)
                    .fixedSize()
            } else {
                Text("Bar \(state.bar + 1) / \(state.form.count)")
                    .foregroundStyle(Palette.text)
                    .fixedSize()
            }
            Text("Chorus \(state.chorus)")
                .foregroundStyle(Palette.muted)
                .fixedSize()
            Spacer(minLength: 0)
            // A card has no gate; a jam counts its clean choruses and never ends.
            if state.gate > 0 {
                HStack(spacing: 10) {
                    GateRings(clean: state.cleanChoruses, required: state.gate)
                    Text(gateLabel)
                        .foregroundStyle(Palette.muted)
                        .fixedSize()
                }
            } else if state.jam {
                Text(state.cleanChoruses > 0 ? "Clean × \(state.cleanChoruses)" : "Play along")
                    .foregroundStyle(state.cleanChoruses > 0 ? Palette.good : Palette.muted)
                    .fixedSize()
            }
        }
    }
}
