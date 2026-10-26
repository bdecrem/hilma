import SwiftUI

/// What the lesson screen's controls do. Empty by default, so a fixed frame draws inert.
struct LessonControls {
    var togglePlay: () -> Void = {}
    var stop: () -> Void = {}
    var nudgeTempo: (Int) -> Void = { _ in }
    /// Toggle mute by channel index (0 drums, 1 bass, 2 keys, 3 horns).
    var toggleMute: (Int) -> Void = { _ in }
    var press: (Int) -> Void = { _ in }
    var release: (Int) -> Void = { _ in }
    /// The card's Continue.
    var continueCard: () -> Void = {}
    /// A step intro's Start, and Lesson complete's next step.
    var beginStep: () -> Void = {}
    var nextStep: () -> Void = {}
    /// Back to the lessons menu.
    var back: () -> Void = {}
}

private struct LessonControlsKey: EnvironmentKey {
    static let defaultValue = LessonControls()
}

extension EnvironmentValues {
    var lessonControls: LessonControls {
        get { self[LessonControlsKey.self] }
        set { self[LessonControlsKey.self] = newValue }
    }
}

/// The lesson screen. Wide (Mac, regular width) is the primary layout; compact width
/// (iPhone portrait) stacks the same parts top to bottom.
struct LessonScreen: View {
    let state: LessonState
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        Group {
            if sizeClass == .compact {
                StackedLessonLayout(state: state)
            } else {
                WideLessonLayout(state: state)
            }
        }
        .background(Palette.ground.ignoresSafeArea())
    }
}

/// Mac: transport bar / channels | pad grid | coach / keyboard (brief §3).
struct WideLessonLayout: View {
    let state: LessonState
    private let gap: CGFloat = 12

    var body: some View {
        VStack(spacing: 0) {
            TransportBar(state: state)
                .padding(.horizontal, 24)
                .frame(height: 76)
            Hairline()

            HStack(spacing: 0) {
                VStack(spacing: 10) {
                    ForEach(Array(state.channels.enumerated()), id: \.element.id) { i, c in ChannelStrip(channel: c, index: i) }
                    Spacer(minLength: 0)
                }
                .padding(20)
                .frame(width: 210)

                Hairline(vertical: true)

                VStack(spacing: 22) {
                    GeometryReader { geo in
                        if let panel = StepPanel(state: state) {
                            panel.frame(width: geo.size.width, height: geo.size.height)
                        } else if let card = state.card {
                            CardPanel(text: card, title: state.stepTitle)
                                .frame(width: geo.size.width, height: geo.size.height)
                        } else {
                            PadGrid(state: state, side: PadGrid.side(fitting: geo.size, gap: gap), gap: gap)
                                .frame(width: geo.size.width, height: geo.size.height)
                        }
                    }
                    FormFooter(state: state)
                }
                .padding(32)
                .frame(maxWidth: .infinity)

                Hairline(vertical: true)

                CoachPanel(state: state)
                    .padding(24)
                    .frame(width: 290)
            }

            Hairline()
            KeyboardStrip(low: 48, high: 71, now: state.nowNote, next: state.nextNote, pressed: state.pressedNotes,
                          fingers: state.fingers)
                .frame(height: 128)
                .padding(.horizontal, 24)
                .padding(.vertical, 18)
        }
    }
}

/// iPhone portrait: transport → channels 4-up → coach line → pads → 1.5-octave keyboard → footer.
struct StackedLessonLayout: View {
    let state: LessonState
    private let gap: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            // Pads span the content width: side = (width − 2·16 gutter − 3·gap) / 4.
            let side = PadGrid.side(fitting: CGSize(width: geo.size.width - 32, height: .infinity), gap: gap)

            VStack(alignment: .leading, spacing: 0) {
                TransportBar(state: state, compact: true)
                    .padding(.top, 8)
                StaffLines(spacing: 3)
                    .padding(.vertical, 14)
                HStack(spacing: 6) {
                    ForEach(Array(state.channels.enumerated()), id: \.element.id) { i, c in ChannelStrip(channel: c, index: i, compact: true) }
                }

                Spacer(minLength: 16)
                HStack(alignment: .center, spacing: 12) {
                    Text(state.coach)
                        .bodyText(22, weight: .semibold, relativeTo: .title2)
                        .foregroundStyle(Palette.text)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    NoteNeedle(mark: state.lastNote, compact: true)
                }
                Spacer(minLength: 16)

                if let panel = StepPanel(state: state) {
                    panel.frame(height: side * 3 + gap * 2)
                } else if let card = state.card {
                    // The card holds the pads' height, so nothing below it moves.
                    CardPanel(text: card, title: state.stepTitle)
                        .frame(height: side * 3 + gap * 2)
                } else {
                    PadGrid(state: state, side: side, gap: gap)
                }

                Spacer(minLength: 16)
                KeyboardStrip(low: 48, high: 65, now: state.nowNote, next: state.nextNote, pressed: state.pressedNotes,
                              fingers: state.fingers)
                    .frame(height: 112)
                Spacer(minLength: 14)
                FormFooter(state: state)
                    .padding(.bottom, 8)
            }
            .padding(.horizontal, 16)
        }
    }
}

/// A card step (brief §4 step 2): a short piece of theory in the pads' place while the band
/// keeps playing, and Continue.
struct CardPanel: View {
    let text: String
    let title: String
    @Environment(\.lessonControls) private var controls

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        VStack(alignment: .leading, spacing: 20) {
            Text(title)
                .dataLabel(12)
                .foregroundStyle(Palette.muted)
            Text(text)
                .bodyText(26, weight: .semibold, relativeTo: .title)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                ForEach(["I", "IV", "V"], id: \.self) { n in
                    Text(n)
                        .font(.display(34))
                        .foregroundStyle(Palette.text)
                        .frame(width: 64, height: 52)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Palette.ground))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
                }
            }
            Spacer(minLength: 0)
            PrimaryButton(title: "Continue", action: controls.continueCard)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
    }
}

/// The one filled button: `signal` ground, ink text. Used for the next thing to do.
struct PrimaryButton: View {
    let title: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .dataLabel(13, weight: .semibold)
                .lineLimit(1)
                .fixedSize()
                .foregroundStyle(Palette.blackKey)
                .padding(.horizontal, 22)
                .frame(height: 44)
                .background(RoundedRectangle(cornerRadius: 6).fill(Palette.signal))
        }
        .buttonStyle(.plain)
    }
}

/// A flat outlined button, for everything that isn't the next thing to do.
struct QuietButton: View {
    let title: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .dataLabel(13, weight: .semibold)
                .lineLimit(1)
                .fixedSize()
                .foregroundStyle(Palette.text)
                .padding(.horizontal, 18)
                .frame(height: 44)
                .background(RoundedRectangle(cornerRadius: 6).fill(Palette.panel))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
