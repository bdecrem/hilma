import SwiftUI

/// What the lesson screen's controls do. Empty by default, so a fixed frame draws inert.
struct LessonControls {
    var togglePlay: () -> Void = {}
    /// ⏮: the step from the top with the count-in (the Stage's Restart, the same button).
    var restart: () -> Void = {}
    /// The chorus rail, dragged to a bar: the band holds there; Play counts in from it.
    var scrub: (Int) -> Void = { _ in }
    var nudgeTempo: (Int) -> Void = { _ in }
    /// Toggle mute by channel index (0 drums, 1 bass, 2 keys, 3 horns).
    var toggleMute: (Int) -> Void = { _ in }
    var press: (Int) -> Void = { _ in }
    var release: (Int) -> Void = { _ in }
    /// Tap mode: a finger (by id) down and up, playing the notes due.
    var tapDown: (Int) -> Void = { _ in }
    var tapUp: (Int) -> Void = { _ in }
    /// The card's Continue.
    var continueCard: () -> Void = {}
    /// A step intro's Start, and Lesson complete's next step.
    var beginStep: () -> Void = {}
    var nextStep: () -> Void = {}
    /// Back to the module, or to the map's level when a goal there opened the lesson.
    var back: () -> Void = {}
    var backTitle = "Back to the module"
    /// Show me: the step played for you; again to stop it.
    var showMe: () -> Void = {}
    /// An improv's take to the teacher.
    var sendTake: () -> Void = {}
    /// Your version's notes coming down, this frame, for a keyboard of these keys
    /// (`Player.versionHighway`); read every frame by `VersionHighway`.
    var highway: (ClosedRange<Int>) -> GameState = { _ in GameState() }
}

/// The teacher's idea ("your version") as the game plays it: the notes come down the game's
/// highway onto the keys below, so there is time to get the fingers there. Redrawn every frame
/// while the band plays, like `LiveGameScreen`.
struct VersionHighway: View {
    let keys: ClosedRange<Int>
    let playing: Bool
    var compact = false
    @Environment(\.lessonControls) private var controls

    var body: some View {
        TimelineView(.animation(paused: !playing)) { _ in
            Highway(state: controls.highway(keys), compact: compact)
        }
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel.opacity(0.5)))
    }
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
                    ForEach(state.channels) { c in ChannelStrip(channel: c, index: c.index) }
                    Spacer(minLength: 0)
                }
                .padding(20)
                .frame(width: 210)

                Hairline(vertical: true)

                VStack(spacing: 22) {
                    GeometryReader { geo in
                        if !state.demo, let panel = StepPanel(state: state) {
                            panel.frame(width: geo.size.width, height: geo.size.height)
                        } else if let card = state.card {
                            CardPanel(text: card, title: state.stepTitle)
                                .frame(width: geo.size.width, height: geo.size.height)
                        } else if state.highway {
                            // The highway and its own keyboard, one width, so every lane sits on its key.
                            let keys = LessonState.Run.keyboard(state.run, keys: 24, fallback: 57...80)
                            VStack(spacing: 0) {
                                VersionHighway(keys: keys, playing: state.playing)
                                KeyboardStrip(low: keys.lowerBound, high: keys.upperBound, now: state.nowNotes, next: state.nextNotes,
                                              pressed: state.pressedNotes, fingers: state.fingers)
                                    .frame(height: 128)
                            }
                            .frame(width: geo.size.width, height: geo.size.height)
                        } else if state.demo, let run = state.run {
                            DemoStage(run: run, now: state.nowNotes, next: state.nextNotes, pressed: state.pressedNotes, fingers: state.fingers)
                                .frame(width: geo.size.width, height: geo.size.height)
                        } else if let run = state.run {
                            RunPanel(run: run, beat: state.beat)
                                .frame(width: geo.size.width, height: geo.size.height)
                        } else {
                            PadGrid(state: state, side: PadGrid.side(fitting: geo.size, gap: gap), gap: gap)
                                .frame(width: geo.size.width, height: geo.size.height)
                        }
                    }
                    LessonFooter(state: state)
                }
                .padding(32)
                .frame(maxWidth: .infinity)

                Hairline(vertical: true)

                CoachPanel(state: state)
                    .padding(24)
                    .frame(width: 290)
            }

            // The version's highway brings its own keyboard (above); otherwise the keys run full width.
            if !state.highway || state.intro != nil || state.complete != nil {
                Hairline()
                // A right-hand improv plays higher than the left hand's chords: its keys start at A3.
                let keys = LessonState.Run.keyboard(state.run, keys: 24, fallback: state.improv != nil && state.rightHand ? 57...80 : 48...71)
                KeyboardStrip(low: keys.lowerBound, high: keys.upperBound, now: state.nowNotes, next: state.nextNotes,
                              pressed: state.pressedNotes, fingers: state.fingers)
                    .frame(height: 128)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 18)
            }
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
                    ForEach(state.channels) { c in ChannelStrip(channel: c, index: c.index, compact: true) }
                }

                Spacer(minLength: 16)
                HStack(alignment: .center, spacing: 12) {
                    Text(state.coach)
                        .bodyText(22, weight: .semibold, relativeTo: .title2)
                        .foregroundStyle(Palette.text)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if state.run != nil {
                        NoteDot(mark: state.lastNote, size: 10)
                            .frame(width: 24, height: 24)
                    } else {
                        NoteNeedle(mark: state.lastNote, compact: true)
                    }
                }
                if let theme = state.theme, state.intro == nil || state.demo, state.complete == nil {
                    // The session's card, and beside it Show me (the top bar has no room for it).
                    HStack(spacing: 10) {
                        ThemeCard(theme: theme, fingers: state.handFingers, right: state.rightHand, compact: true)
                        ShowMeButton(on: state.demo, enabled: state.canDemo, size: 44, compact: true)
                    }
                    .padding(.top, 10)
                }
                Spacer(minLength: 16)

                if !state.demo, let panel = StepPanel(state: state) {
                    panel.frame(height: side * 3 + gap * 2)
                } else if let card = state.card {
                    // The card holds the pads' height, so nothing below it moves.
                    CardPanel(text: card, title: state.stepTitle)
                        .frame(height: side * 3 + gap * 2)
                } else if state.highway {
                    // Same width as the keyboard below, so the lanes land on the keys.
                    VersionHighway(keys: LessonState.Run.keyboard(state.run, keys: 18, fallback: 57...74), playing: state.playing, compact: true)
                        .frame(height: side * 3 + gap * 2)
                } else if state.demo, let run = state.run {
                    DemoStage(run: run, now: state.nowNotes, next: state.nextNotes, pressed: state.pressedNotes, fingers: state.fingers, compact: true)
                        .frame(height: side * 3 + gap * 2)
                } else if let run = state.run {
                    RunPanel(run: run, beat: state.beat, compact: true)
                        .frame(height: side * 3 + gap * 2)
                } else {
                    PadGrid(state: state, side: side, gap: gap)
                }

                Spacer(minLength: 16)
                let keys = LessonState.Run.keyboard(state.run, keys: 18, fallback: state.highway || (state.improv != nil && state.rightHand) ? 57...74 : 48...65)
                KeyboardStrip(low: keys.lowerBound, high: keys.upperBound, now: state.nowNotes, next: state.nextNotes,
                              pressed: state.pressedNotes, fingers: state.fingers)
                    .frame(height: 112)
                Spacer(minLength: 14)
                LessonFooter(state: state, compact: true)
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

/// The lesson's footer (2026-11-08): the chorus as a rail you can drag, as on the Stage, over
/// the form's line (or the improv's take and Send it).
struct LessonFooter: View {
    let state: LessonState
    var compact = false

    var body: some View {
        VStack(spacing: compact ? 8 : 10) {
            ChorusRail(state: state)
                .frame(height: 18)
            if let improv = state.improv {
                ImprovBar(state: state, improv: improv, compact: compact)
            } else {
                FormFooter(state: state)
            }
        }
    }
}

/// The chorus as a rail: one segment a bar of the form, filled to the beat being heard, a knob
/// where the band is. Drag anywhere along it to hold the band at that bar; Play counts in from
/// there. The Stage's `Scrubber`, for a lesson's loop.
struct ChorusRail: View {
    let state: LessonState
    @Environment(\.lessonControls) private var controls

    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            let bars = max(1, state.form.count)
            let progress = state.countIn == nil ? (CGFloat(state.bar) + CGFloat(state.beat) / 4) / CGFloat(bars) : 0
            let x = w * progress
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.line).frame(height: 6)
                Capsule().fill(Palette.signal).frame(width: max(0, x), height: 6)
                ForEach(1..<bars, id: \.self) { b in
                    Rectangle()
                        .fill(Palette.ground)
                        .frame(width: 2, height: 6)
                        .offset(x: w * CGFloat(b) / CGFloat(bars) - 1)
                }
                Circle()
                    .fill(Palette.signal)
                    .frame(width: 16, height: 16)
                    .overlay(Circle().strokeBorder(Palette.ground, lineWidth: 2))
                    .offset(x: min(w - 16, max(0, x - 8)))
            }
            .frame(maxHeight: .infinity, alignment: .center)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { v in
                let bar = Int((v.location.x / max(1, w) * CGFloat(bars)).rounded(.down))
                controls.scrub(max(0, min(bars - 1, bar)))
            })
        }
        .accessibilityElement()
        .accessibilityLabel("Bar \(state.bar + 1) of \(state.form.count)")
        .accessibilityHint("Drag to another bar of the chorus")
    }
}

/// Under an improv's pads, in the footer's place: where you are, the take so far, and the button
/// that sends it to the teacher (open from `Player.takeMinimum` notes).
struct ImprovBar: View {
    let state: LessonState
    let improv: LessonState.Improv
    var compact = false
    @Environment(\.lessonControls) private var controls

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(state.countIn.map { "Count-in \($0)" } ?? "Bar \(state.bar + 1) / \(state.form.count) · Chorus \(state.chorus)")
                    .dataLabel(compact ? 11 : 12, weight: .medium)
                    .foregroundStyle(state.countIn == nil ? Palette.text : Palette.signal)
                Text(improv.notes == 0 ? "Your solo. Play anything." : "Your take · \(improv.notes) notes")
                    .dataLabel(compact ? 10 : 11)
                    .foregroundStyle(Palette.muted)
            }
            .fixedSize()
            Spacer(minLength: 8)
            Button(action: controls.sendTake) {
                HStack(spacing: 6) {
                    Image(systemName: "paperplane.fill").font(.system(size: 11, weight: .bold))
                    Text(compact ? "Send it" : "Send it to the teacher").dataLabel(compact ? 11 : 12, weight: .semibold)
                }
                .foregroundStyle(improv.canSend ? Palette.ground : Palette.muted)
                .padding(.horizontal, 14)
                .frame(height: compact ? 36 : 40)
                .background(RoundedRectangle(cornerRadius: 4).fill(improv.canSend ? Palette.signal : Palette.panel))
                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(improv.canSend ? Palette.signal : Palette.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(!improv.canSend)
            .accessibilityLabel(improv.canSend ? "Send your take to the teacher" : "Play a few more notes to send your take")
        }
    }
}
