import SwiftUI

/// The hand under a scale lesson comes in five drawings (Settings → Display → Hand; concepts at
/// ola.cx/takt/hands), all on one contract: `down` is filled `signal` (and `lit`, an intro's
/// whole-hand pose), `next` is outlined `cue`, `tuck` folds the thumb in under the palm, `right`
/// mirrors the drawing for the left hand.
enum HandStyle: String, CaseIterable, Identifiable {
    case linie, automat, greif, schaltplan, bauhaus

    static let key = "hand"
    var id: String { rawValue }

    var title: String {
        switch self {
        case .linie: "Linie"
        case .automat: "Automat"
        case .greif: "Greif"
        case .schaltplan: "Schaltplan"
        case .bauhaus: "Bauhaus"
        }
    }

    var detail: String {
        switch self {
        case .linie: "A clean hand-drawn line"
        case .automat: "The robot hand"
        case .greif: "The griffin's claw"
        case .schaltplan: "The circuit hand"
        case .bauhaus: "Circle, bar, half-circle"
        }
    }
}

enum HandTone { case on, cue, rest }

/// A right (or left) hand from above, fingers up, in a 240 × 200 box scaled to fit. Every finger
/// carries its number. The thumb is a group rotated about its base: out to the side at rest,
/// folded in under the palm (as a ghost) when it tucks.
struct HandView: View {
    var down: Int?
    /// Fingers filled `signal` besides `down` (an intro lights every finger the run uses).
    var lit: Set<Int> = []
    var next: Int?
    var tuck = false
    var right = true
    /// A fixed style (the Settings thumbnails); nil draws the chosen one.
    var style: HandStyle? = nil
    @AppStorage(HandStyle.key) private var chosen: HandStyle = .linie

    /// Finger geometry, right hand: (center x, top y, width), thumb to pinky by number. Fingers
    /// end at `fingerBottom`; the thumb is `thumbLength` long from its base in the palm's side.
    static let fingers: [(x: CGFloat, top: CGFloat, w: CGFloat)] = [
        (0, 0, 0),
        (86, 72, 40),
        (92, 22, 38),
        (134, 6, 38),
        (175, 20, 36),
        (212, 52, 32),
    ]
    static let fingerBottom: CGFloat = 132
    static let thumbBase = CGPoint(x: 86, y: 164)
    static let thumbLength: CGFloat = 92

    private var current: HandStyle { style ?? chosen }

    func tone(_ f: Int) -> HandTone {
        down == f || lit.contains(f) ? .on : next == f ? .cue : .rest
    }

    var body: some View {
        GeometryReader { g in
            let s = min(g.size.width / 240, g.size.height / 200)
            drawing
                .frame(width: 240, height: 200)
                .scaleEffect(s)
                .frame(width: g.size.width, height: g.size.height)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    private var drawing: some View {
        ZStack {
            palm.zIndex(1)
            thumb.zIndex(2)
            ForEach(2...5, id: \.self) { f in
                let g = Self.fingers[f]
                let len = Self.fingerBottom - g.top
                let lean = Double(f - 3) * (current == .schaltplan || current == .bauhaus ? 0 : 3.5)
                finger(f, width: g.w, length: len, thumb: false, ghost: false)
                    .overlay(number(f, width: g.w, length: len, counter: -lean))
                    .frame(width: g.w, height: len)
                    .rotationEffect(.degrees(lean), anchor: .bottom)
                    .position(x: g.x, y: g.top + len / 2)
                    .zIndex(1.5)
            }
        }
        .scaleEffect(x: right ? 1 : -1)
    }

    private var thumb: some View {
        let g = Self.fingers[1]
        let len = Self.thumbLength
        let angle: Double = tuck ? 58 : -42
        return finger(1, width: g.w, length: len, thumb: true, ghost: tuck)
            .overlay(number(1, width: g.w, length: len, counter: -angle))
            .frame(width: g.w, height: len)
            .opacity(tuck && current != .linie ? 0.45 : 1)
            .rotationEffect(.degrees(angle), anchor: .bottom)
            .position(x: Self.thumbBase.x, y: Self.thumbBase.y - len / 2)
            .animation(.spring(response: 0.45, dampingFraction: 0.7), value: tuck)
    }

    @ViewBuilder
    private func finger(_ f: Int, width w: CGFloat, length len: CGFloat, thumb: Bool, ghost: Bool) -> some View {
        let t = tone(f)
        switch current {
        case .linie: LinieFinger(tone: t, w: w, len: len, seed: f, ghost: ghost)
        case .automat: AutomatFinger(tone: t, w: w, len: len, thumb: thumb)
        case .greif: GreifFinger(tone: t, w: w, len: len)
        case .schaltplan: SchaltplanFinger(tone: t, w: w, len: len)
        case .bauhaus: BauhausFinger(tone: t, w: w, len: len)
        }
    }

    @ViewBuilder
    private var palm: some View {
        switch current {
        case .linie: LiniePalm()
        case .automat: AutomatPalm()
        case .greif: GreifPalm()
        case .schaltplan: SchaltplanPalm()
        case .bauhaus: BauhausPalm()
        }
    }

    /// The finger's number, upright whatever the finger's lean.
    private func number(_ f: Int, width w: CGFloat, length len: CGFloat, counter: Double) -> some View {
        let t = tone(f)
        let dy: CGFloat = switch current {
        case .linie: 24
        case .automat: 26
        case .greif: 40
        case .schaltplan: 34
        case .bauhaus: w / 2 + 28
        }
        let dx: CGFloat = current == .schaltplan ? 15 : 0
        return Text("\(f)")
            .font(.system(size: 14, weight: .bold, design: .monospaced))
            .foregroundStyle(t == .on ? Palette.ground : t == .cue ? Palette.cue : Palette.muted)
            .rotationEffect(.degrees(counter))
            .scaleEffect(x: right ? 1 : -1)
            .position(x: w / 2 + dx, y: dy)
    }

    private var spoken: String {
        var parts: [String] = []
        if let down { parts.append("\(LessonState.Run.fingerWord(down)) down") }
        if !lit.isEmpty { parts.append(lit.sorted().map { LessonState.Run.fingerWord($0).lowercased() }.joined(separator: ", ")) }
        if let next { parts.append("\(LessonState.Run.fingerWord(next).lowercased()) next") }
        if tuck { parts.append("thumb tucks under") }
        return (right ? "Right hand" : "Left hand") + (parts.isEmpty ? "" : ": " + parts.joined(separator: ", "))
    }
}

// MARK: - Shared strokes

private func strokeColor(_ t: HandTone, rest: Color = Palette.text) -> Color {
    switch t { case .on: Palette.signal; case .cue: Palette.cue; case .rest: rest }
}

// MARK: - 1 · Linie: one line, a little wobble, a knuckle crease.

private struct LinieFinger: View {
    let tone: HandTone
    let w: CGFloat
    let len: CGFloat
    let seed: Int
    var ghost = false

    private func wob(_ k: Int) -> CGFloat { CGFloat((seed * 7 + k * 3) % 5) - 2 }

    var body: some View {
        let tipR = w / 2
        let outline = Path { p in
            p.move(to: CGPoint(x: wob(1) * 0.4, y: len + 6))
            p.addCurve(to: CGPoint(x: 1, y: tipR), control1: CGPoint(x: -1, y: len - 30 + wob(2)), control2: CGPoint(x: wob(3) * 0.5, y: tipR + 12))
            p.addCurve(to: CGPoint(x: w - 1, y: tipR), control1: CGPoint(x: 1, y: -2), control2: CGPoint(x: w - 1, y: -2 + wob(4) * 0.5))
            p.addCurve(to: CGPoint(x: w + wob(6) * 0.4, y: len + 6), control1: CGPoint(x: w + wob(5) * 0.5, y: tipR + 14), control2: CGPoint(x: w + 1, y: len - 28))
        }
        ZStack {
            outline.fill(tone == .on ? Palette.signal : tone == .cue ? Palette.cue.opacity(0.14) : Palette.ground)
            outline.stroke(ghost ? Palette.muted : strokeColor(tone),
                           style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round, dash: ghost ? [5, 4] : []))
            Path { p in
                p.move(to: CGPoint(x: w / 2 - 9, y: 46))
                p.addQuadCurve(to: CGPoint(x: w / 2 + 9, y: 46), control: CGPoint(x: w / 2, y: 50))
            }
            .stroke(tone == .on ? Palette.ground : Palette.line, lineWidth: 1.6)
        }
    }
}

private struct LiniePalm: View {
    var body: some View {
        let p = Path { p in
            p.move(to: CGPoint(x: 74, y: 118))
            p.addCurve(to: CGPoint(x: 86, y: 198), control1: CGPoint(x: 72, y: 150), control2: CGPoint(x: 70, y: 182))
            p.addLine(to: CGPoint(x: 206, y: 198))
            p.addCurve(to: CGPoint(x: 218, y: 118), control1: CGPoint(x: 222, y: 182), control2: CGPoint(x: 222, y: 150))
            p.addCurve(to: CGPoint(x: 74, y: 118), control1: CGPoint(x: 170, y: 110), control2: CGPoint(x: 120, y: 110))
            p.closeSubpath()
        }
        ZStack {
            p.fill(Palette.ground)
            p.stroke(Palette.text, style: StrokeStyle(lineWidth: 2.2, lineJoin: .round))
        }
        .frame(width: 240, height: 200)
    }
}

// MARK: - 2 · Automat: segments, pin joints, a fingertip sensor.

private struct AutomatFinger: View {
    let tone: HandTone
    let w: CGFloat
    let len: CGFloat
    let thumb: Bool

    var body: some View {
        let shares: [CGFloat] = thumb ? [0.5, 0.5] : [0.3, 0.3, 0.4]
        let fill = tone == .on ? Palette.signal : Palette.panel
        let stroke = strokeColor(tone, rest: Palette.line)
        ZStack(alignment: .top) {
            ForEach(Array(shares.enumerated()), id: \.offset) { i, share in
                let y = shares.prefix(i).reduce(CGFloat(0)) { $0 + len * $1 }
                let h = len * share - 3
                let inset: CGFloat = i == 0 ? 3 : 0
                RoundedRectangle(cornerRadius: i == 0 ? 10 : 5)
                    .fill(fill)
                    .overlay(RoundedRectangle(cornerRadius: i == 0 ? 10 : 5).strokeBorder(stroke, lineWidth: tone == .cue ? 2 : 1.5))
                    .frame(width: w - inset * 2, height: h)
                    .position(x: w / 2, y: y + h / 2)
                if i < shares.count - 1 {
                    Circle().fill(tone == .on ? Palette.ground : Palette.line)
                        .frame(width: 6.4, height: 6.4)
                        .position(x: w / 2, y: y + h + 1.5)
                }
                if i == 0 {
                    Circle().fill(tone == .on ? Palette.ground : Palette.muted)
                        .frame(width: 4.4, height: 4.4)
                        .position(x: w / 2, y: 8)
                }
            }
        }
        .frame(width: w, height: len)
    }
}

private struct AutomatPalm: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Palette.panel)
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.line, lineWidth: 1.5))
                .frame(width: 148, height: 88)
                .position(x: 146, y: 156)
            ForEach(Array([CGPoint(x: 84, y: 124), CGPoint(x: 208, y: 124), CGPoint(x: 84, y: 188), CGPoint(x: 208, y: 188)].enumerated()), id: \.offset) { _, c in
                ZStack {
                    Circle().fill(Palette.ground).overlay(Circle().strokeBorder(Palette.muted, lineWidth: 1.2)).frame(width: 8, height: 8)
                    Path { p in
                        p.move(to: CGPoint(x: -2.5, y: -2.5)); p.addLine(to: CGPoint(x: 2.5, y: 2.5))
                        p.move(to: CGPoint(x: 2.5, y: -2.5)); p.addLine(to: CGPoint(x: -2.5, y: 2.5))
                    }
                    .stroke(Palette.muted, lineWidth: 1.2)
                    .frame(width: 0, height: 0)
                }
                .position(c)
            }
            ForEach(0..<5, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1.5).fill(Palette.line)
                    .frame(width: 60, height: 3)
                    .position(x: 146, y: 141.5 + CGFloat(i) * 8)
            }
        }
        .frame(width: 240, height: 200)
    }
}

// MARK: - 3 · Greif: tapered, ridged, a talon that hooks toward the thumb.

private struct GreifFinger: View {
    let tone: HandTone
    let w: CGFloat
    let len: CGFloat

    var body: some View {
        let cx = w / 2
        let body = Path { p in
            p.move(to: CGPoint(x: 0, y: len + 4))
            p.addCurve(to: CGPoint(x: cx - 10, y: 14), control1: CGPoint(x: -2, y: len - 40), control2: CGPoint(x: cx - 8, y: 36))
            p.addCurve(to: CGPoint(x: cx - 16, y: -10), control1: CGPoint(x: cx - 14, y: 4), control2: CGPoint(x: cx - 12, y: -6))
            p.addCurve(to: CGPoint(x: cx + 10, y: 24), control1: CGPoint(x: cx - 2, y: -4), control2: CGPoint(x: cx + 8, y: 8))
            p.addCurve(to: CGPoint(x: w, y: len + 4), control1: CGPoint(x: cx + 12, y: 50), control2: CGPoint(x: w + 2, y: len - 40))
            p.closeSubpath()
        }
        ZStack {
            body.fill(tone == .on ? Palette.signal : Palette.panel)
            body.stroke(strokeColor(tone), style: StrokeStyle(lineWidth: 2, lineJoin: .round))
            ForEach([0.42, 0.56, 0.7], id: \.self) { k in
                let y = len * k
                let hw = (w / 2) * (0.55 + k * 0.45)
                Path { p in
                    p.move(to: CGPoint(x: cx - hw, y: y))
                    p.addQuadCurve(to: CGPoint(x: cx + hw, y: y), control: CGPoint(x: cx, y: y - 6))
                }
                .stroke(tone == .on ? Palette.ground : Palette.line, lineWidth: 1.4)
            }
            Circle().fill(tone == .on ? Palette.ground : Palette.line).frame(width: 9, height: 9).position(x: cx, y: len - 6)
        }
    }
}

private struct GreifPalm: View {
    var body: some View {
        let pad = Path { p in
            p.move(to: CGPoint(x: 78, y: 122))
            p.addCurve(to: CGPoint(x: 92, y: 200), control1: CGPoint(x: 70, y: 150), control2: CGPoint(x: 70, y: 184))
            p.addLine(to: CGPoint(x: 200, y: 200))
            p.addCurve(to: CGPoint(x: 214, y: 122), control1: CGPoint(x: 224, y: 184), control2: CGPoint(x: 224, y: 150))
            p.addCurve(to: CGPoint(x: 78, y: 122), control1: CGPoint(x: 170, y: 108), control2: CGPoint(x: 122, y: 108))
            p.closeSubpath()
        }
        ZStack {
            pad.fill(Palette.panel)
            pad.stroke(Palette.text, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
            Path { p in
                for row in 0..<3 {
                    for col in 0..<4 {
                        let x = 92 + CGFloat(col) * 30 + CGFloat(row % 2) * 15
                        let y = 136 + CGFloat(row) * 18
                        p.move(to: CGPoint(x: x, y: y))
                        p.addQuadCurve(to: CGPoint(x: x + 22, y: y), control: CGPoint(x: x + 11, y: y - 8))
                    }
                }
            }
            .stroke(Palette.line, lineWidth: 1.3)
        }
        .frame(width: 240, height: 200)
    }
}

// MARK: - 4 · Schaltplan: a trace, a pad at the tip, a node at the knuckle, a via halfway.

private struct SchaltplanFinger: View {
    let tone: HandTone
    let w: CGFloat
    let len: CGFloat

    var body: some View {
        let cx = w / 2
        let color = strokeColor(tone, rest: Palette.muted)
        ZStack {
            Path { p in
                p.move(to: CGPoint(x: cx, y: len))
                p.addLine(to: CGPoint(x: cx, y: 10))
            }
            .stroke(color, style: StrokeStyle(lineWidth: tone == .rest ? 6 : 8, lineCap: .round, dash: tone == .cue ? [6, 5] : []))
            Rectangle()
                .fill(tone == .on ? Palette.signal : Palette.panel)
                .overlay(Rectangle().strokeBorder(color, lineWidth: 2))
                .frame(width: 18, height: 18)
                .rotationEffect(.degrees(45))
                .position(x: cx, y: 7)
            Circle().fill(Palette.ground).overlay(Circle().strokeBorder(color, lineWidth: 2.5))
                .frame(width: 12, height: 12).position(x: cx, y: len)
            Circle().fill(tone == .on ? Palette.ground : color).frame(width: 6, height: 6).position(x: cx, y: (10 + len) / 2)
        }
        .shadow(color: tone == .on ? Palette.signal.opacity(0.8) : .clear, radius: 4)
    }
}

private struct SchaltplanPalm: View {
    var body: some View {
        ZStack {
            Rectangle().strokeBorder(Palette.line, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                .frame(width: 148, height: 88).position(x: 146, y: 156)
            // The bus from each finger's node to the chip.
            Path { p in
                for f in 2...5 {
                    let x = HandView.fingers[f].x
                    p.move(to: CGPoint(x: x, y: HandView.fingerBottom))
                    p.addLine(to: CGPoint(x: x, y: 124))
                    p.addLine(to: CGPoint(x: 146, y: 124))
                    p.addLine(to: CGPoint(x: 146, y: 136))
                }
            }
            .stroke(Palette.line, lineWidth: 1.5)
            RoundedRectangle(cornerRadius: 3).fill(Palette.panel)
                .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(Palette.text, lineWidth: 1.5))
                .frame(width: 56, height: 40).position(x: 146, y: 156)
            Path { p in
                for i in 0..<5 {
                    let x = 124 + CGFloat(i) * 11
                    p.move(to: CGPoint(x: x, y: 128)); p.addLine(to: CGPoint(x: x, y: 136))
                    p.move(to: CGPoint(x: x, y: 176)); p.addLine(to: CGPoint(x: x, y: 184))
                }
            }
            .stroke(Palette.muted, lineWidth: 2)
            Text("TAKT").font(.system(size: 9, weight: .medium, design: .monospaced)).tracking(1)
                .foregroundStyle(Palette.muted).position(x: 146, y: 157)
        }
        .frame(width: 240, height: 200)
    }
}

// MARK: - 5 · Bauhaus: a bar with a half-circle cap; the palm a circle.

private struct BauhausFinger: View {
    let tone: HandTone
    let w: CGFloat
    let len: CGFloat

    var body: some View {
        let stroke = strokeColor(tone)
        ZStack(alignment: .top) {
            Rectangle().fill(tone == .on ? Palette.signal : Palette.panel)
                .overlay(Rectangle().strokeBorder(stroke, lineWidth: 2))
                .frame(width: w, height: len - w / 2)
                .position(x: w / 2, y: w / 2 + (len - w / 2) / 2)
            Path { p in
                p.move(to: CGPoint(x: 0, y: w / 2))
                p.addArc(center: CGPoint(x: w / 2, y: w / 2), radius: w / 2, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
                p.closeSubpath()
            }
            .fill(tone == .on ? Palette.ground : tone == .cue ? Palette.cue : Palette.text)
        }
        .frame(width: w, height: len)
    }
}

private struct BauhausPalm: View {
    var body: some View {
        ZStack {
            Circle().fill(Palette.panel).overlay(Circle().strokeBorder(Palette.text, lineWidth: 2))
                .frame(width: 92, height: 92).position(x: 146, y: 158)
            Circle().fill(Palette.text).frame(width: 12, height: 12).position(x: 146, y: 158)
        }
        .frame(width: 240, height: 200)
    }
}

/// Settings → Display: the five hands side by side, the chosen one outlined `signal`; tap to pick.
struct HandPicker: View {
    @AppStorage(HandStyle.key) private var chosen: HandStyle = .linie

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                ForEach(HandStyle.allCases) { style in
                    let on = style == chosen
                    Button {
                        chosen = style
                    } label: {
                        VStack(spacing: 4) {
                            HandView(down: 3, next: 1, style: style)
                                .frame(height: 54)
                            Text(style.title)
                                .dataLabel(9, weight: on ? .semibold : .regular)
                                .foregroundStyle(on ? Palette.text : Palette.muted)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 2)
                        .frame(maxWidth: .infinity)
                        .background(RoundedRectangle(cornerRadius: 6).fill(on ? Palette.ground : .clear))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(on ? Palette.signal : Palette.line, lineWidth: on ? 1.5 : 1))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(style.title)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            Text(chosen.detail)
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
        }
    }
}
