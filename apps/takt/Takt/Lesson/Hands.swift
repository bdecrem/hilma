import SwiftUI

/// The hand under a scale lesson comes in seven drawings (Settings → Display → Hand; concepts at
/// ola.cx/takt/hands), all on one contract: `down` is filled `signal` (and `lit`, an intro's
/// whole-hand pose), `next` is outlined `cue`, `tuck` folds the thumb in under the palm, `right`
/// mirrors the drawing for the left hand.
enum HandStyle: String, CaseIterable, Identifiable {
    case kontur, linie, skizze, automat, greif, schaltplan, bauhaus

    static let key = "hand"
    var id: String { rawValue }

    var title: String {
        switch self {
        case .kontur: "Kontur"
        case .linie: "Linie"
        case .skizze: "Skizze"
        case .automat: "Automat"
        case .greif: "Greif"
        case .schaltplan: "Schaltplan"
        case .bauhaus: "Bauhaus"
        }
    }

    var detail: String {
        switch self {
        case .kontur: "One outline, traced from a photo"
        case .linie: "A clean hand-drawn line"
        case .skizze: "A normal hand, sketched"
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
    @AppStorage(HandStyle.key) private var chosen: HandStyle = .kontur

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

    @ViewBuilder
    private var drawing: some View {
        if current == .kontur {
            KonturHand(motion: KonturMotion(fold: tuck ? 1 : 0, press: (2...5).map { tone($0) == .on ? 1 : 0 }),
                       tone: tone, right: right)
                .frame(width: 240, height: 200)
        } else if current == .skizze {
            SkizzeHand(tone: tone, tuck: tuck, right: right)
                .frame(width: 240, height: 200)
                .scaleEffect(x: right ? 1 : -1)
        } else {
            parts
        }
    }

    private var parts: some View {
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
        case .kontur, .skizze: EmptyView()
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
        case .kontur, .skizze: EmptyView()
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
        case .kontur, .linie, .skizze: 24
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

// MARK: - 6 · Skizze: a normal hand, one outline, no seams; the lesson's marks drawn over it.

/// The whole hand as one closed line, the way a hand is sketched: palm, four fingers and the
/// thumb in a single outline, no line where a finger meets the palm. `fold` 0 is the thumb out
/// to the side, 1 the thumb folded in under the palm (its points slide onto the palm's edge).
struct SkizzeSilhouette: Shape {
    var fold: CGFloat
    var animatableData: CGFloat {
        get { fold }
        set { fold = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let t = fold
        func mix(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t) }
        var p = Path()
        p.move(to: CGPoint(x: 86, y: 198))
        p.addCurve(to: SkizzeGeometry.heel, control1: CGPoint(x: 80, y: 194), control2: CGPoint(x: 76, y: 184))
        // The thumb: the outer edge sweeps out from the heel (the thenar) to the tip, the inner edge
        // runs back into the web at the index finger's base. Folded, every point sits on the palm's edge.
        p.addCurve(to: mix(CGPoint(x: 7, y: 106), CGPoint(x: 68, y: 162)),
                   control1: mix(CGPoint(x: 46, y: 180), CGPoint(x: 70, y: 172)),
                   control2: mix(CGPoint(x: 18, y: 126), CGPoint(x: 67, y: 168)))
        p.addCurve(to: mix(CGPoint(x: 36, y: 86), CGPoint(x: 69, y: 150)),
                   control1: mix(CGPoint(x: 1, y: 96), CGPoint(x: 66, y: 158)),
                   control2: mix(CGPoint(x: 29, y: 76), CGPoint(x: 68, y: 153)))
        p.addCurve(to: SkizzeGeometry.web,
                   control1: mix(CGPoint(x: 44, y: 96), CGPoint(x: 70, y: 147)),
                   control2: mix(CGPoint(x: 62, y: 118), CGPoint(x: 71, y: 143)))
        var previous: CGPoint? = nil
        for f in 2...5 {
            let g = SkizzeGeometry.finger(f)
            if let previous {
                p.addQuadCurve(to: g.leftBottom, control: CGPoint(x: (previous.x + g.leftBottom.x) / 2, y: g.leftBottom.y + 7))
            } else {
                p.addQuadCurve(to: g.leftBottom, control: CGPoint(x: 71, y: 136))
            }
            p.addCurve(to: g.leftTop, control1: g.leftC1, control2: g.leftC2)
            p.addCurve(to: g.rightTop, control1: g.tipC1, control2: g.tipC2)
            p.addCurve(to: g.rightBottom, control1: g.rightC1, control2: g.rightC2)
            previous = g.rightBottom
        }
        p.addCurve(to: CGPoint(x: 206, y: 198), control1: CGPoint(x: 228, y: 150), control2: CGPoint(x: 226, y: 186))
        return p
    }
}

enum SkizzeGeometry {
    struct Finger {
        let leftBottom, leftC1, leftC2, leftTop, tipC1, tipC2, rightTop, rightC1, rightC2, rightBottom: CGPoint
        let lean: Double
        /// A point in the finger's own upright frame, placed on the leaning finger.
        let place: (CGFloat, CGFloat) -> CGPoint
    }

    static let heel = CGPoint(x: 73, y: 177)
    static let web = CGPoint(x: 72, y: 139)
    /// The thumb as the overlays see it: a capsule from `thumbBase` along the drawn thumb's axis,
    /// out at `thumbOut`, under the palm at `thumbIn`.
    static let thumbBase = CGPoint(x: 64, y: 157)
    static let thumbLength: CGFloat = 80
    static let thumbWidth: CGFloat = 30
    static let thumbOut: Double = -35.5
    static let thumbIn: Double = 58

    static func wob(_ f: Int, _ k: Int) -> CGFloat { CGFloat((f * 7 + k * 3) % 5) * 0.5 - 1 }

    static func rotate(_ p: CGPoint, about c: CGPoint, degrees: Double) -> CGPoint {
        let a = degrees * .pi / 180, dx = p.x - c.x, dy = p.y - c.y
        return CGPoint(x: c.x + dx * CGFloat(cos(a)) - dy * CGFloat(sin(a)), y: c.y + dx * CGFloat(sin(a)) + dy * CGFloat(cos(a)))
    }

    static func finger(_ f: Int) -> Finger {
        let g = HandView.fingers[f]
        let lean = Double(f - 3) * 3.5
        let pivot = CGPoint(x: g.x, y: HandView.fingerBottom)
        let bottom = HandView.fingerBottom + 2
        func r(_ x: CGFloat, _ y: CGFloat) -> CGPoint { rotate(CGPoint(x: x, y: y), about: pivot, degrees: lean) }
        let l = g.x - g.w / 2, rr = g.x + g.w / 2, tipY = g.top + g.w / 2
        return Finger(
            leftBottom: r(l + 2, bottom),
            leftC1: r(l + wob(f, 1), bottom - 34), leftC2: r(l + wob(f, 2), tipY + 14), leftTop: r(l + 1, tipY),
            tipC1: r(l + 1, g.top - 2 + wob(f, 3)), tipC2: r(rr - 1, g.top - 2 + wob(f, 4)), rightTop: r(rr - 1, tipY),
            rightC1: r(rr + wob(f, 5), tipY + 14), rightC2: r(rr, bottom - 34), rightBottom: r(rr - 2, bottom),
            lean: lean, place: { x, y in r(x, y) })
    }

    /// The thumb's path from out to under: an arc about its base, for the dotted motion line.
    static func thumbArc(radius: CGFloat) -> [CGPoint] {
        stride(from: 0, through: 24, by: 1).map { i in
            let a = (thumbOut + (thumbIn - thumbOut) * Double(i) / 24) * .pi / 180
            return CGPoint(x: thumbBase.x + radius * CGFloat(sin(a)), y: thumbBase.y - radius * CGFloat(cos(a)))
        }
    }
}

/// The drawing: the silhouette, nails and knuckles in pencil, then the lesson's marks on top as a
/// teacher would add them: a marker over the finger that's down, a dotted outline around the next,
/// and when the thumb goes under, its dotted ghost and the dotted arc it travels.
private struct SkizzeHand: View {
    let tone: (Int) -> HandTone
    let tuck: Bool
    let right: Bool

    var body: some View {
        ZStack {
            SkizzeSilhouette(fold: tuck ? 1 : 0).fill(Palette.panel)
            SkizzeSilhouette(fold: tuck ? 1 : 0)
                .stroke(Palette.text, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
            pencil
            ForEach(2...5, id: \.self) { f in mark(f) }
            thumb
            if tuck { motion }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.7), value: tuck)
    }

    /// Nails at the tips, a knuckle under each finger.
    private var pencil: some View {
        Path { p in
            for f in 2...5 {
                let g = SkizzeGeometry.finger(f), fg = HandView.fingers[f]
                p.move(to: g.place(fg.x - 6, fg.top + 21))
                p.addCurve(to: g.place(fg.x + 6, fg.top + 21), control1: g.place(fg.x - 7, fg.top + 8), control2: g.place(fg.x + 7, fg.top + 8))
                p.move(to: g.place(fg.x - 5, 143))
                p.addQuadCurve(to: g.place(fg.x + 5, 143), control: g.place(fg.x, 139))
            }
        }
        .stroke(Palette.line, style: StrokeStyle(lineWidth: 1.3, lineCap: .round))
    }

    private func mark(_ f: Int) -> some View {
        let g = HandView.fingers[f]
        let t = tone(f)
        let len = HandView.fingerBottom - g.top - 8
        return ZStack {
            Capsule().fill(t == .on ? Palette.signal.opacity(0.92) : t == .cue ? Palette.cue.opacity(0.08) : .clear)
            Capsule().strokeBorder(t == .cue ? Palette.cue : .clear, style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [3, 4]))
            number(f, counter: -Double(f - 3) * 3.5).position(x: (g.w - 8) / 2, y: 36)
        }
        .frame(width: g.w - 8, height: len)
        .rotationEffect(.degrees(Double(f - 3) * 3.5), anchor: .bottom)
        .position(x: g.x, y: HandView.fingerBottom - 4 - len / 2)
    }

    private var thumb: some View {
        let t = tone(1)
        let angle = tuck ? SkizzeGeometry.thumbIn : SkizzeGeometry.thumbOut
        let ghost = tuck
        let stroke: Color = ghost ? (t == .cue ? Palette.cue : Palette.muted) : (t == .cue ? Palette.cue : .clear)
        return ZStack {
            Capsule().fill(!ghost && t == .on ? Palette.signal.opacity(0.92) : !ghost && t == .cue ? Palette.cue.opacity(0.08) : .clear)
            Capsule().strokeBorder(stroke, style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [3, 4]))
            number(1, counter: -angle).position(x: SkizzeGeometry.thumbWidth / 2, y: 30)
        }
        .frame(width: SkizzeGeometry.thumbWidth, height: SkizzeGeometry.thumbLength)
        .rotationEffect(.degrees(angle), anchor: .bottom)
        .position(x: SkizzeGeometry.thumbBase.x, y: SkizzeGeometry.thumbBase.y - SkizzeGeometry.thumbLength / 2)
    }

    /// The dotted arc from where the thumb was to where it goes, with a small arrowhead.
    private var motion: some View {
        let pts = SkizzeGeometry.thumbArc(radius: SkizzeGeometry.thumbLength - 6)
        let color = tone(1) == .cue ? Palette.cue : Palette.muted
        return Path { p in
            p.addLines(pts)
            if let end = pts.last, pts.count > 2 {
                let prev = pts[pts.count - 2]
                let dx = end.x - prev.x, dy = end.y - prev.y, n = max(hypot(dx, dy), 0.001)
                let ux = dx / n, uy = dy / n
                p.move(to: CGPoint(x: end.x - 7 * ux + 4 * uy, y: end.y - 7 * uy - 4 * ux))
                p.addLine(to: end)
                p.addLine(to: CGPoint(x: end.x - 7 * ux - 4 * uy, y: end.y - 7 * uy + 4 * ux))
            }
        }
        .stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round, dash: [2, 4]))
        .transition(.opacity)
    }

    private func number(_ f: Int, counter: Double) -> some View {
        let t = tone(f)
        let ghost = f == 1 && tuck
        return Text("\(f)")
            .font(.system(size: 14, weight: .bold, design: .monospaced))
            .foregroundStyle(t == .on && !ghost ? Palette.ground : t == .cue ? Palette.cue : Palette.muted)
            .rotationEffect(.degrees(counter))
            .scaleEffect(x: right ? 1 : -1)
    }
}

// MARK: - 0 · Kontur: one outline traced from a photo of a hand on the keys, from the player's seat.

/// Everything in the Kontur drawing that moves, as one animatable value: `fold` 0 is the thumb
/// out beside the palm, 1 the thumb under it (the fingers spread so its nail shows between 3 and
/// 4, the palm narrows where the thumb left); `press[f - 2]` is finger f pushed down on its key.
struct KonturMotion: VectorArithmetic {
    var fold: Double = 0
    var press: [Double] = [0, 0, 0, 0]

    static var zero: KonturMotion { KonturMotion() }
    static func + (a: KonturMotion, b: KonturMotion) -> KonturMotion {
        KonturMotion(fold: a.fold + b.fold, press: zip(a.press, b.press).map(+))
    }
    static func - (a: KonturMotion, b: KonturMotion) -> KonturMotion {
        KonturMotion(fold: a.fold - b.fold, press: zip(a.press, b.press).map(-))
    }
    mutating func scale(by rhs: Double) {
        fold *= rhs
        press = press.map { $0 * rhs }
    }
    var magnitudeSquared: Double { fold * fold + press.reduce(0) { $0 + $1 * $1 } }
}

/// The drawing's parts, in the reference photo's pixel space (the hand ≈ x 76–598, y 36–612),
/// fitted into the 240 × 200 box. Traced over a photo of a right hand on the keys seen from the
/// player's seat: fingers up the screen and foreshortened, the thumb a short broad lobe on the
/// left with its nail toward the keys. The fingers reach below the knuckle line into the palm,
/// the thumb's base lies inside it; the drawing strokes every part first and fills them after,
/// so together they are one outline with no seam, and a part can still pass behind another.
struct KonturDrawing {
    struct Finger {
        let baseX, baseW, tipX, tipY, tipW: CGFloat
        let num: CGPoint
    }

    static let box = CGRect(x: 70, y: 30, width: 534, height: 586)
    static let scale: CGFloat = 200 / 586
    /// The outline's width in the box (2.6 in the photo's space).
    static let lineWidth: CGFloat = 2.6 * scale
    static let fingerRoot: CGFloat = 336
    static let fingers: [Int: Finger] = [
        2: Finger(baseX: 240, baseW: 104, tipX: 216, tipY: 66, tipW: 72, num: CGPoint(x: 230, y: 205)),
        3: Finger(baseX: 340, baseW: 102, tipX: 322, tipY: 34, tipW: 72, num: CGPoint(x: 333, y: 185)),
        4: Finger(baseX: 445, baseW: 104, tipX: 438, tipY: 38, tipW: 72, num: CGPoint(x: 441, y: 185)),
        5: Finger(baseX: 546, baseW: 94, tipX: 552, tipY: 94, tipW: 64, num: CGPoint(x: 544, y: 220)),
    ]
    /// How far each finger slides sideways when the thumb goes under.
    static let spread: [Int: CGFloat] = [2: -16, 3: -6, 4: 26, 5: 34]
    /// How far a pressed finger's tip goes down.
    static let dip: CGFloat = 24
    /// The thumb out: four cubic segments from where the thenar leaves the palm's edge, up the
    /// outer edge, over the tip, down the inner edge to the web, and back inside the palm.
    static let thumbOut: [CGPoint] = [
        CGPoint(x: 158, y: 452),
        CGPoint(x: 124, y: 408), CGPoint(x: 88, y: 336), CGPoint(x: 86, y: 258),
        CGPoint(x: 76, y: 219), CGPoint(x: 134, y: 203), CGPoint(x: 144, y: 242),
        CGPoint(x: 162, y: 262), CGPoint(x: 190, y: 296), CGPoint(x: 206, y: 324),
        CGPoint(x: 200, y: 384), CGPoint(x: 178, y: 424),
    ]
    /// The thumb under: the same four segments as a capsule from under the palm to the gap
    /// between fingers 3 and 4, where only its tip shows.
    static let thumbIn: [CGPoint] = capsule(from: CGPoint(x: 210, y: 440), to: CGPoint(x: 402, y: 222), width: 58)
    static let numOut = CGPoint(x: 126, y: 300)
    static let numIn = CGPoint(x: 402, y: 182)

    static func capsule(from a: CGPoint, to b: CGPoint, width: CGFloat) -> [CGPoint] {
        let r = width / 2, ang = atan2(b.y - a.y, b.x - a.x)
        let n = CGPoint(x: -sin(ang) * r, y: cos(ang) * r)
        let e = CGPoint(x: cos(ang) * r * 4 / 3, y: sin(ang) * r * 4 / 3)
        func mix(_ p: CGPoint, _ q: CGPoint, _ t: CGFloat) -> CGPoint { CGPoint(x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t) }
        let a0 = CGPoint(x: a.x - n.x, y: a.y - n.y), b0 = CGPoint(x: b.x - n.x, y: b.y - n.y)
        let b1 = CGPoint(x: b.x + n.x, y: b.y + n.y), a1 = CGPoint(x: a.x + n.x, y: a.y + n.y)
        return [
            a0,
            mix(a0, b0, 1 / 3), mix(a0, b0, 2 / 3), b0,
            CGPoint(x: b0.x + e.x, y: b0.y + e.y), CGPoint(x: b1.x + e.x, y: b1.y + e.y), b1,
            mix(b1, a1, 1 / 3), mix(b1, a1, 2 / 3), a1,
            mix(a1, a0, 1 / 3), mix(a1, a0, 2 / 3),
        ]
    }

    let fold: CGFloat
    let press: [CGFloat]
    let transform: CGAffineTransform

    init(motion: KonturMotion, right: Bool) {
        fold = CGFloat(min(max(motion.fold, 0), 1))
        press = motion.press.map { CGFloat($0) }
        var t = CGAffineTransform(translationX: (240 - Self.box.width * Self.scale) / 2, y: 0)
            .scaledBy(x: Self.scale, y: Self.scale)
            .translatedBy(x: -Self.box.minX, y: -Self.box.minY)
        if !right { t = t.concatenating(CGAffineTransform(scaleX: -1, y: 1).translatedBy(x: -240, y: 0)) }
        transform = t
    }

    private func mix(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: a.x + (b.x - a.x) * fold, y: a.y + (b.y - a.y) * fold) }
    private func spread(_ f: Int) -> CGFloat { (Self.spread[f] ?? 0) * fold }
    private func dip(_ f: Int) -> CGFloat { Self.dip * press[f - 2] }

    func point(_ p: CGPoint) -> CGPoint { p.applying(transform) }

    var thumb: Path {
        let p = zip(Self.thumbOut, Self.thumbIn).map { mix($0, $1) }
        var path = Path()
        path.move(to: p[0])
        path.addCurve(to: p[3], control1: p[1], control2: p[2])
        path.addCurve(to: p[6], control1: p[4], control2: p[5])
        path.addCurve(to: p[9], control1: p[7], control2: p[8])
        path.addCurve(to: p[0], control1: p[10], control2: p[11])
        path.closeSubpath()
        return path.applying(transform)
    }

    /// The thumb's tip (the middle of its nail), where its number goes when it is under.
    var thumbTip: CGPoint {
        let p = zip(Self.thumbOut, Self.thumbIn).map { mix($0, $1) }
        return point(CGPoint(x: (p[3].x + p[6].x) / 2 + (p[4].x + p[5].x - p[3].x - p[6].x) * 0.375,
                             y: (p[3].y + p[6].y) / 2 + (p[4].y + p[5].y - p[3].y - p[6].y) * 0.375))
    }

    var thumbNumber: CGPoint { point(mix(Self.numOut, Self.numIn)) }

    /// Wrist left, up the left edge (under the thumb out; the thenar folded in on a tuck), the
    /// web, the knuckle line following the fingers' spread, down the right edge, wrist right.
    var palm: Path {
        let s2 = spread(2), s3 = spread(3), s4 = spread(4), s5 = spread(5)
        let left: [(CGPoint, CGPoint)] = [
            (CGPoint(x: 276, y: 600), CGPoint(x: 276, y: 600)), (CGPoint(x: 236, y: 548), CGPoint(x: 238, y: 548)),
            (CGPoint(x: 190, y: 492), CGPoint(x: 200, y: 494)), (CGPoint(x: 158, y: 452), CGPoint(x: 172, y: 446)),
            (CGPoint(x: 144, y: 400), CGPoint(x: 154, y: 398)), (CGPoint(x: 144, y: 352), CGPoint(x: 148, y: 344)),
        ]
        var pts = left.map { mix($0.0, $0.1) }
        pts.append(CGPoint(x: 206 + s2 - 8 * fold, y: 324 - 6 * fold))
        pts.append(CGPoint(x: 290 + (s2 + s3) / 2, y: 300))
        pts.append(CGPoint(x: 392 + (s3 + s4) / 2, y: 296))
        pts.append(CGPoint(x: 498 + (s4 + s5) / 2, y: 300))
        pts.append(CGPoint(x: 592 + s5, y: 310))
        pts.append(CGPoint(x: 597 + s5, y: 370))
        pts.append(CGPoint(x: 591 + s5, y: 455))
        pts.append(CGPoint(x: 573 + s5 * 0.6, y: 540))
        pts.append(CGPoint(x: 562 + s5 * 0.3, y: 600))
        var path = Path()
        path.move(to: pts[0])
        for i in 1..<pts.count {
            let a = pts[i - 1], b = pts[i], m = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
            if i == 1 { path.addLine(to: m) } else { path.addQuadCurve(to: m, control: a) }
        }
        let a = pts[pts.count - 1], b = pts[0]
        path.addLine(to: a)
        path.addCurve(to: b, control1: CGPoint(x: a.x - 40, y: a.y + 14), control2: CGPoint(x: b.x + 40, y: b.y + 14))
        path.closeSubpath()
        return path.applying(transform)
    }

    /// A finger from its root inside the palm, up the left side (a gentle bulge at the middle
    /// joint, the finger is widest there in this view), over the tip, down the right side.
    func finger(_ f: Int, closed: Bool) -> Path {
        let g = Self.fingers[f]!, dx = spread(f)
        let lx0 = g.baseX - g.baseW / 2 + dx, rx0 = g.baseX + g.baseW / 2 + dx, y0 = Self.fingerRoot
        let r = g.tipW / 2, cy = g.tipY + r + dip(f), lx1 = g.tipX - r + dx, rx1 = g.tipX + r + dx
        let k = 1.2 * r
        var p = Path()
        p.move(to: CGPoint(x: lx0, y: y0))
        p.addCurve(to: CGPoint(x: lx1, y: cy), control1: CGPoint(x: lx0 - 3, y: y0 - (y0 - cy) * 0.35), control2: CGPoint(x: lx1 - 4, y: cy + (y0 - cy) * 0.45))
        p.addCurve(to: CGPoint(x: rx1, y: cy), control1: CGPoint(x: lx1, y: cy - k), control2: CGPoint(x: rx1, y: cy - k))
        p.addCurve(to: CGPoint(x: rx0, y: y0), control1: CGPoint(x: rx1 + 4, y: cy + (y0 - cy) * 0.45), control2: CGPoint(x: rx0 + 3, y: y0 - (y0 - cy) * 0.35))
        if closed { p.closeSubpath() }
        return p.applying(transform)
    }

    func number(_ f: Int) -> CGPoint {
        let g = Self.fingers[f]!
        return point(CGPoint(x: g.num.x + spread(f), y: g.num.y + dip(f) * 0.5))
    }

    /// The palm and the fingers together: what covers the thumb.
    var cover: Path {
        var p = palm
        for f in 2...5 { p.addPath(finger(f, closed: true)) }
        return p
    }
}

/// The drawing: every part's outline stroked first (together, the outline of the whole hand),
/// then the fills in order so the thumb goes under the palm and the fingers sit on it, then the
/// lines between the fingers and around the thumb on top, outside the palm, the next finger's
/// in `cue`; the finger that's down is filled `signal` from the knuckle line up.
private struct KonturHand: View, Animatable {
    var motion: KonturMotion
    let tone: (Int) -> HandTone
    let right: Bool

    var animatableData: KonturMotion {
        get { motion }
        set { motion = newValue }
    }

    var body: some View {
        let d = KonturDrawing(motion: motion, right: right)
        ZStack {
            Canvas { ctx, _ in
                let ink = Palette.text, panel = Palette.panel
                let w = KonturDrawing.lineWidth
                let line = StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round)
                let palm = d.palm, thumb = d.thumb
                let fingers = (2...5).map { d.finger($0, closed: true) }
                for p in [thumb, palm] + fingers {
                    ctx.stroke(p, with: .color(ink), style: StrokeStyle(lineWidth: w * 2, lineJoin: .round))
                }
                ctx.fill(thumb, with: .color(tone(1) == .on ? Palette.signal : panel))
                ctx.fill(palm, with: .color(panel))
                var outside = ctx
                outside.clip(to: palm, options: .inverse)
                for f in 2...5 {
                    ctx.fill(fingers[f - 2], with: .color(panel))
                    if tone(f) == .on { outside.fill(fingers[f - 2], with: .color(Palette.signal)) }
                }
                for f in 2...5 {
                    outside.stroke(d.finger(f, closed: false), with: .color(tone(f) == .cue ? Palette.cue : ink), style: line)
                }
                var uncovered = ctx
                uncovered.clip(to: d.cover, options: .inverse)
                uncovered.stroke(thumb, with: .color(tone(1) == .cue ? Palette.cue : ink), style: line)
            }
            ForEach(2...5, id: \.self) { f in
                number(f).position(d.number(f))
            }
            number(1).position(motion.fold > 0.5 ? CGPoint(x: d.thumbTip.x, y: d.thumbTip.y - 40 * KonturDrawing.scale) : d.thumbNumber)
                .opacity(motion.fold > 0.5 ? (motion.fold - 0.5) * 2 : 1 - motion.fold * 2)
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.75), value: motion)
    }

    private func number(_ f: Int) -> some View {
        let t = tone(f)
        let under = f == 1 && motion.fold > 0.5
        return Text("\(f)")
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .foregroundStyle(t == .on && !under ? Palette.ground : t == .cue ? Palette.cue : Palette.muted)
    }
}

/// Settings → Display: the hands side by side, the chosen one outlined `signal`; tap to pick.
struct HandPicker: View {
    @AppStorage(HandStyle.key) private var chosen: HandStyle = .kontur

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
