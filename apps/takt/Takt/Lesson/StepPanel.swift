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
        VStack(alignment: .leading, spacing: compact ? 10 : 16) {
            if let c = state.complete {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: compact ? 22 : 28, weight: .semibold))
                    Text("Lesson complete")
                        .font(.display(compact ? 28 : 40))
                        .textCase(.uppercase)
                }
                .foregroundStyle(Palette.good)
                Text(c.done)
                    .dataLabel(compact ? 11 : 13, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                StaffLines(spacing: 3)
                    .padding(.vertical, compact ? 2 : 6)
                Text("Next")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                about(c.next, compact: compact, titleSize: compact ? 22 : 30)
                Spacer(minLength: 0)
                PrimaryButton(title: c.next.kind == .card ? "Next" : "Start \(c.next.title)", action: controls.nextStep)
            } else if let i = state.intro {
                Text("Step \(state.step) of \(state.stepCount)")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                about(i, compact: compact, titleSize: compact ? 28 : 40)
                Spacer(minLength: 0)
                PrimaryButton(title: "Start", action: controls.beginStep)
            }
        }
        .padding(compact ? 16 : 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
    }

    @ViewBuilder
    private func about(_ s: LessonEngine.StepInfo, compact: Bool, titleSize: CGFloat) -> some View {
        Text(s.title)
            .font(.display(titleSize))
            .textCase(.uppercase)
            .foregroundStyle(Palette.text)
        if let about = s.about {
            Text(about)
                .bodyText(compact ? 14 : 17)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        if !s.fingers.isEmpty {
            HStack(alignment: .center, spacing: compact ? 14 : 28) {
                HandDiagram(used: Set(s.fingers.map(\.finger)))
                    .frame(width: compact ? 92 : 150, height: compact ? 70 : 112)
                VStack(alignment: .leading, spacing: compact ? 6 : 10) {
                    ForEach(s.fingers, id: \.finger) { f in
                        HStack(spacing: 10) {
                            FingerBadge(finger: f.finger, onFill: false)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(HandDiagram.name(f.finger))
                                    .bodyText(compact ? 13 : 15, weight: .semibold)
                                    .foregroundStyle(Palette.text)
                                Text("\(f.tone) · on the \(f.beat)")
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

/// A left hand from above, fingers numbered the piano way (1 thumb … 5 pinky, so 5 on the
/// left): the fingers the step uses are filled `signal` with their number.
struct HandDiagram: View {
    let used: Set<Int>

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
                    .offset(x: col * 0.1, y: palmTop)
                ForEach(0..<5, id: \.self) { i in
                    let finger = 5 - i
                    let on = used.contains(finger)
                    let len = h * lengths[i]
                    // The thumb sits lower and leans out.
                    let top = i == 4 ? palmTop - len * 0.35 : palmTop - len + col * 0.4
                    ZStack {
                        Capsule().fill(on ? Palette.signal : Palette.ground)
                        Capsule().strokeBorder(on ? Palette.signal : Palette.line, lineWidth: 1)
                        if on {
                            Text("\(finger)")
                                .font(.system(size: col * 0.5, weight: .bold, design: .rounded))
                                .foregroundStyle(Palette.blackKey)
                                .rotationEffect(.degrees(i == 4 ? -22 : 0))
                                .offset(y: -len * 0.25)
                        }
                    }
                    .frame(width: col * 0.78, height: len)
                    .rotationEffect(.degrees(i == 4 ? 22 : Double(i - 2) * 3), anchor: .bottom)
                    .offset(x: col * CGFloat(i) + col * 0.11 - (i == 4 ? col * 0.05 : 0), y: top + (i == 4 ? col * 0.25 : 0))
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Left hand: " + used.sorted(by: >).map(Self.name).joined(separator: " and "))
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
