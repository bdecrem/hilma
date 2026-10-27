import SwiftUI

/// In the pads' place between steps: a step's intro waiting for Start, or Lesson complete with
/// the next step's intro under it. The band keeps playing behind it; Start restarts it from the
/// top with the count-in.
struct StepPanel: View {
    let state: LessonState
    @Environment(\.lessonControls) private var controls
    @Environment(\.horizontalSizeClass) private var sizeClass

    init?(state: LessonState) {
        guard state.intro != nil || state.complete != nil else { return nil }
        self.state = state
    }

    var body: some View {
        let compact = sizeClass == .compact
        let shape = RoundedRectangle(cornerRadius: 8)
        // Scrolls when the intro is taller than the pads' box (the Mac's Lesson complete).
        ScrollView {
        VStack(alignment: .leading, spacing: compact ? 10 : 14) {
            if let c = state.complete {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: compact ? 22 : 28, weight: .semibold))
                    Text(c.next == nil ? "Module complete" : "Lesson complete")
                        .font(.display(compact ? 28 : 40))
                        .textCase(.uppercase)
                }
                .foregroundStyle(Palette.good)
                Text("Lesson \(c.number) · \(c.done)")
                    .dataLabel(compact ? 11 : 13, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                if c.next == nil {
                    Text("That's every lesson in \(state.moduleTitle). More are on the way.")
                        .bodyText(compact ? 15 : 18, weight: .semibold)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let card = c.card {
                    Text(card)
                        .bodyText(compact ? 15 : 18, weight: .semibold)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                StaffLines(spacing: 3)
                    .padding(.vertical, compact ? 2 : 6)
                if let n = c.next {
                    Text("Next · Lesson \(n.number) of \(n.count)")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                    about(n, compact: compact, titleSize: compact ? 22 : 30, hand: false)
                }
                // The two buttons side by side where they fit, else one under the other.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { completeButtons(c) }
                    VStack(alignment: .leading, spacing: 8) { completeButtons(c) }
                }
            } else if let i = state.intro {
                Text("\(state.moduleTitle) · Lesson \(i.number) of \(i.count)")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                about(i, compact: compact, titleSize: compact ? 28 : 40, hand: true)
                PrimaryButton(title: "Start", action: controls.beginStep)
                    .padding(.top, 4)
            }
        }
        .padding(compact ? 16 : 24)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .scrollBounceBehavior(.basedOnSize)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
    }

    @ViewBuilder
    private func completeButtons(_ c: LessonEngine.Complete) -> some View {
        if let n = c.next {
            PrimaryButton(title: "Start lesson \(n.number) · \(n.title)", action: controls.nextStep)
        }
        QuietButton(title: "Back to the module", action: controls.back)
    }

    @ViewBuilder
    private func about(_ s: LessonEngine.StepInfo, compact: Bool, titleSize: CGFloat, hand: Bool) -> some View {
        Text(s.title)
            .font(.display(titleSize))
            .textCase(.uppercase)
            .foregroundStyle(Palette.text)
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "flag.checkered").font(.system(size: 11, weight: .semibold))
            Text("Goal · \(s.goal)").dataLabel(11, weight: .semibold)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Palette.signal)
        if let about = s.about {
            Text(about)
                .bodyText(compact ? 14 : 17)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        if !s.fingering.isEmpty {
            // A run: the hand, and the fingers in playing order.
            HStack(alignment: .center, spacing: compact ? 14 : 24) {
                if hand {
                    HandView(lit: Set(s.fingering), right: s.rightHand)
                        .frame(width: compact ? 96 : 140, height: compact ? 80 : 116)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(s.rightHand ? "Right hand · fingering" : "Left hand · fingering")
                        .dataLabel(10)
                        .foregroundStyle(Palette.muted)
                    HStack(spacing: 4) {
                        ForEach(Array(s.fingering.enumerated()), id: \.offset) { _, f in
                            FingerBadge(finger: f, onFill: false)
                        }
                    }
                }
            }
            .padding(.top, compact ? 0 : 4)
        } else if !s.fingers.isEmpty {
            // The hand drawing on an intro; Lesson complete keeps just the legend, so its
            // buttons stay in view.
            HStack(alignment: .center, spacing: compact ? 14 : 28) {
                if hand {
                    HandView(lit: Set(s.fingers.map(\.finger)), right: s.rightHand)
                        .frame(width: compact ? 96 : 140, height: compact ? 80 : 116)
                }
                VStack(alignment: .leading, spacing: compact ? 6 : 10) {
                    ForEach(s.fingers, id: \.finger) { f in
                        HStack(spacing: 10) {
                            FingerBadge(finger: f.finger, onFill: false)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(HandDiagram.name(f.finger))
                                    .bodyText(compact ? 13 : 15, weight: .semibold)
                                    .foregroundStyle(Palette.text)
                                Text("\(f.tone) · on the \(f.beats.map(String.init).joined(separator: " and the "))")
                                    .dataLabel(10)
                                    .foregroundStyle(Palette.muted)
                            }
                        }
                    }
                }
            }
            .padding(.top, compact ? 0 : 4)
        }
    }
}

/// A hand from above, fingers numbered the piano way (1 thumb … 5 pinky): a left hand has the
/// pinky on the left, a right hand the thumb. The fingers the step uses are filled `signal`.
struct HandDiagram: View {
    let used: Set<Int>
    var right = false
    /// Fingers outlined in `cue`: the one that plays next.
    var next: Set<Int> = []

    static func name(_ finger: Int) -> String {
        ["", "Thumb (1)", "Index (2)", "Middle (3)", "Ring (4)", "Pinky (5)"][max(0, min(5, finger))]
    }

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            // Five columns; finger lengths as a share of the height, pinky to thumb.
            let col = w / 5
            let lengths: [CGFloat] = [0.50, 0.66, 0.74, 0.66, 0.42]
            let palmTop = h * 0.56
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: col * 0.5)
                    .fill(Palette.ground)
                    .overlay(RoundedRectangle(cornerRadius: col * 0.5).strokeBorder(Palette.line, lineWidth: 1))
                    .frame(width: col * 4.4, height: h - palmTop)
                    .offset(x: right ? col * 0.5 : col * 0.1, y: palmTop)
                ForEach(0..<5, id: \.self) { i in
                    let finger = right ? i + 1 : 5 - i
                    let thumb = finger == 1
                    let on = used.contains(finger)
                    let cue = !on && next.contains(finger)
                    let len = h * lengths[right ? 4 - i : i]
                    // The thumb sits lower and leans out.
                    let top = thumb ? palmTop - len * 0.35 : palmTop - len + col * 0.4
                    ZStack {
                        Capsule().fill(on ? Palette.signal : Palette.ground)
                        Capsule().strokeBorder(on ? Palette.signal : cue ? Palette.cue : Palette.line, lineWidth: cue ? 1.5 : 1)
                        if on || cue {
                            Text("\(finger)")
                                .font(.system(size: col * 0.5, weight: .bold, design: .rounded))
                                .foregroundStyle(on ? Palette.blackKey : Palette.cue)
                                .rotationEffect(.degrees(thumb ? (right ? 22 : -22) : 0))
                                .offset(y: -len * 0.25)
                        }
                    }
                    .frame(width: col * 0.78, height: len)
                    .rotationEffect(.degrees(thumb ? (right ? -22 : 22) : Double(i - 2) * 3), anchor: .bottom)
                    .offset(x: col * CGFloat(i) + col * 0.11 + (thumb ? (right ? col * 0.3 : -col * 0.05) : 0), y: top + (thumb ? col * 0.25 : 0))
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel((right ? "Right hand: " : "Left hand: ") + used.sorted(by: >).map(Self.name).joined(separator: " and "))
    }
}

/// A finger number in a circle: on a key, and in the intro's legend.
struct FingerBadge: View {
    let finger: Int
    /// On the `signal`-filled key: ink circle, so it reads on orange.
    let onFill: Bool

    var body: some View {
        Text("\(finger)")
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .foregroundStyle(onFill ? Palette.signal : Palette.cue)
            .frame(width: 22, height: 22)
            .background(Circle().fill(onFill ? Palette.blackKey : Palette.ground))
            .overlay(Circle().strokeBorder(onFill ? Palette.blackKey : Palette.cue, lineWidth: 1.5))
    }
}
