import SwiftUI

/// The session's theme beside the coach: one small drawing and a line that says what this
/// lesson (or jam) is about. From the module file's `theme` (glyph, title, line). Glyphs:
/// `steps[:n]` a staircase, `hill` up and down, `tuck` the thumb going under, `over` the middle
/// finger crossing, `hand` the fingers in use, `keys:135` a chord on a mini keyboard, `rock` the
/// thumb rocking 5 ↔ 6, `walk` a walking line, `form` i iv v over the twelve bars, `alone` the
/// band out for 11–12, `tempo` the knob going up, `blue` the flat note, `bars:13` chord stacks
/// on those beats.
struct ThemeCard: View {
    let theme: Lesson.Theme
    var fingers: Set<Int> = []
    var right = true
    var compact = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        HStack(alignment: .center, spacing: compact ? 12 : 14) {
            ThemeGlyph(spec: theme.glyph, fingers: fingers, right: right)
                .frame(width: compact ? 54 : 64, height: compact ? 40 : 48)
            VStack(alignment: .leading, spacing: compact ? 2 : 4) {
                Text(theme.title)
                    .dataLabel(compact ? 10 : 11, weight: .semibold)
                    .foregroundStyle(Palette.signal)
                    .lineLimit(1)
                Text(theme.line)
                    .bodyText(compact ? 13 : 14)
                    .foregroundStyle(Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .lineLimit(compact ? 2 : nil)
            }
            Spacer(minLength: 0)
        }
        .padding(compact ? 10 : 12)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Theme: \(theme.title). \(theme.line)")
    }
}

/// The drawings, in a 72 × 54 box scaled to fit.
struct ThemeGlyph: View {
    let spec: String
    var fingers: Set<Int> = []
    var right = true

    private var kind: String { String(spec.split(separator: ":").first ?? "") }
    private var arg: String { spec.split(separator: ":").count > 1 ? String(spec.split(separator: ":")[1]) : "" }

    var body: some View {
        GeometryReader { g in
            let s = min(g.size.width / 72, g.size.height / 54)
            drawing
                .frame(width: 72, height: 54)
                .scaleEffect(s)
                .frame(width: g.size.width, height: g.size.height)
        }
    }

    @ViewBuilder
    private var drawing: some View {
        switch kind {
        case "steps":
            let n = Int(arg) ?? 5
            Stairs(count: n, lit: n > 5 ? n - 1 : 2, descending: false)
        case "fall": Stairs(count: 5, lit: 2, descending: true)
        case "hill": Hill()
        case "tuck": HandView(down: 3, next: 1, tuck: true, right: right)
        case "over": HandView(down: 1, next: 3, right: right)
        case "hand": HandView(lit: fingers, right: right)
        case "keys": MiniKeys(dots: arg.compactMap { Int(String($0)) }, rock: false)
        case "rock": MiniKeys(dots: [1, 5], rock: true)
        case "walk": Walk()
        case "form": FormGrid(alone: false)
        case "alone": FormGrid(alone: true)
        case "tempo": KnobUp()
        case "blue": Stairs(count: 6, lit: 3, descending: false, blue: 3)
        case "bars": Bars(beats: arg.compactMap { Int(String($0)) })
        default: EmptyView()
        }
    }

    /// Ascending (or descending) squares, one lit, one outlined next; `blue` tints a step cue.
    private struct Stairs: View {
        let count: Int
        let lit: Int
        let descending: Bool
        var blue: Int? = nil
        var body: some View {
            Canvas { ctx, size in
                let n = max(count, 2)
                let gap: CGFloat = 3
                let span: CGFloat = size.width - gap * CGFloat(n - 1)
                let w: CGFloat = min(14, span / CGFloat(n))
                let h: CGFloat = 12
                let rise: CGFloat = (size.height - h) / CGFloat(n - 1)
                let total: CGFloat = w * CGFloat(n) + gap * CGFloat(n - 1)
                let x0: CGFloat = (size.width - total) / 2
                for i in 0..<n {
                    let level = descending ? n - 1 - i : i
                    let x: CGFloat = x0 + CGFloat(i) * (w + gap)
                    let y: CGFloat = size.height - h - CGFloat(level) * rise
                    let p = Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: 3)
                    if i == lit {
                        ctx.fill(p, with: .color(Palette.signal))
                    } else if i == blue {
                        ctx.fill(p, with: .color(Palette.cue.opacity(0.25)))
                        ctx.stroke(p, with: .color(Palette.cue), lineWidth: 1.2)
                    } else if i == lit + 1 {
                        ctx.stroke(p, with: .color(Palette.cue), lineWidth: 1.2)
                    } else {
                        ctx.stroke(p, with: .color(Palette.muted), lineWidth: 1)
                    }
                }
            }
        }
    }

    private struct Hill: View {
        var body: some View {
            Canvas { ctx, size in
                let n = 7, gap: CGFloat = 3
                let w = (size.width - gap * CGFloat(n - 1)) / CGFloat(n)
                let h: CGFloat = 12
                let rise = (size.height - h) / 3
                for i in 0..<n {
                    let level = i < 4 ? i : 6 - i
                    let rect = CGRect(x: CGFloat(i) * (w + gap), y: size.height - h - CGFloat(level) * rise, width: w, height: h)
                    let p = Path(roundedRect: rect, cornerRadius: 3)
                    if i == 3 { ctx.fill(p, with: .color(Palette.signal)) } else if i == 4 { ctx.stroke(p, with: .color(Palette.cue), lineWidth: 1.2) } else { ctx.stroke(p, with: .color(Palette.muted), lineWidth: 1) }
                }
            }
        }
    }

    /// Seven white keys, five black, dots on the named white keys (1 = the root). `rock` draws
    /// the thumb's move between the fifth and the sixth.
    private struct MiniKeys: View {
        let dots: [Int]
        let rock: Bool
        var body: some View {
            Canvas { ctx, size in
                let w = size.width / 7
                for i in 0..<7 {
                    let r = CGRect(x: CGFloat(i) * w + 0.5, y: 0, width: w - 1, height: size.height)
                    ctx.fill(Path(roundedRect: r, cornerRadius: 2), with: .color(Palette.panel))
                    ctx.stroke(Path(roundedRect: r, cornerRadius: 2), with: .color(Palette.line), lineWidth: 1)
                }
                for i in [0, 1, 3, 4, 5] {
                    let r = CGRect(x: CGFloat(i + 1) * w - w * 0.3, y: 0, width: w * 0.6, height: size.height * 0.58)
                    ctx.fill(Path(roundedRect: r, cornerRadius: 1.5), with: .color(Palette.blackKey))
                }
                let targets = rock ? [1, 5, 6] : dots
                for d in targets where (1...7).contains(d) {
                    let c = CGPoint(x: (CGFloat(d) - 0.5) * w, y: size.height * 0.8)
                    let p = Path(ellipseIn: CGRect(x: c.x - 4.5, y: c.y - 4.5, width: 9, height: 9))
                    if rock && d == 6 {
                        ctx.stroke(p, with: .color(Palette.cue), lineWidth: 1.5)
                    } else {
                        ctx.fill(p, with: .color(Palette.signal))
                    }
                }
                if rock {
                    // The thumb rocks: an arc from the fifth to the sixth and back.
                    var a = Path()
                    let from = CGPoint(x: 4.5 * w, y: size.height * 0.62), to = CGPoint(x: 5.5 * w, y: size.height * 0.62)
                    a.move(to: from)
                    a.addQuadCurve(to: to, control: CGPoint(x: 5 * w, y: size.height * 0.4))
                    ctx.stroke(a, with: .color(Palette.cue), style: StrokeStyle(lineWidth: 1.3, lineCap: .round, dash: [2, 2]))
                }
            }
        }
    }

    private struct Walk: View {
        var body: some View {
            Canvas { ctx, size in
                let xs: [CGFloat] = [0.12, 0.37, 0.62, 0.87].map { $0 * size.width }
                let ys: [CGFloat] = [0.8, 0.6, 0.4, 0.22].map { $0 * size.height }
                var line = Path()
                line.move(to: CGPoint(x: xs[0], y: ys[0]))
                for i in 1..<4 { line.addLine(to: CGPoint(x: xs[i], y: ys[i])) }
                ctx.stroke(line, with: .color(Palette.line), lineWidth: 1.5)
                for i in 0..<4 {
                    let p = Path(ellipseIn: CGRect(x: xs[i] - 5, y: ys[i] - 5, width: 10, height: 10))
                    if i == 0 { ctx.fill(p, with: .color(Palette.signal)) } else { ctx.fill(p, with: .color(Palette.panel)); ctx.stroke(p, with: .color(Palette.text), lineWidth: 1.3) }
                }
            }
        }
    }

    /// The twelve bars as a 4 × 3 grid: i outlined, iv in cue, v in signal; `alone` hollows 11–12.
    private struct FormGrid: View {
        let alone: Bool
        var body: some View {
            Canvas { ctx, size in
                let gap: CGFloat = 3
                let w = (size.width - gap * 3) / 4, h = (size.height - gap * 2) / 3
                let numerals = ["i", "i", "i", "i", "iv", "iv", "i", "i", "v", "iv", "i", "v"]
                for b in 0..<12 {
                    let r = CGRect(x: CGFloat(b % 4) * (w + gap), y: CGFloat(b / 4) * (h + gap), width: w, height: h)
                    let p = Path(roundedRect: r, cornerRadius: 2.5)
                    if alone {
                        if b >= 10 { ctx.stroke(p, with: .color(Palette.signal), style: StrokeStyle(lineWidth: 1.3, dash: [2, 2])) }
                        else { ctx.fill(p, with: .color(Palette.line)) }
                    } else {
                        switch numerals[b] {
                        case "iv": ctx.fill(p, with: .color(Palette.cue))
                        case "v": ctx.fill(p, with: .color(Palette.signal))
                        default: ctx.stroke(p, with: .color(Palette.muted), lineWidth: 1)
                        }
                    }
                }
            }
        }
    }

    private struct KnobUp: View {
        var body: some View {
            Canvas { ctx, size in
                let c = CGPoint(x: size.width / 2, y: size.height / 2 + 2)
                let r = min(size.width, size.height) / 2 - 4
                var track = Path()
                track.addArc(center: c, radius: r, startAngle: .degrees(135), endAngle: .degrees(45), clockwise: false)
                ctx.stroke(track, with: .color(Palette.line), style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                var arc = Path()
                arc.addArc(center: c, radius: r, startAngle: .degrees(135), endAngle: .degrees(-20), clockwise: false)
                ctx.stroke(arc, with: .color(Palette.signal), style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                var arrow = Path()
                let tip = CGPoint(x: c.x + r * cos(-20 * .pi / 180), y: c.y + r * sin(-20 * .pi / 180))
                arrow.move(to: CGPoint(x: tip.x - 6, y: tip.y + 1))
                arrow.addLine(to: CGPoint(x: tip.x + 1, y: tip.y - 5))
                arrow.addLine(to: CGPoint(x: tip.x + 4, y: tip.y + 4))
                ctx.stroke(arrow, with: .color(Palette.signal), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
        }
    }

    /// One bar: four beats, chord stacks (three dots) on the named beats.
    private struct Bars: View {
        let beats: [Int]
        var body: some View {
            Canvas { ctx, size in
                let bar = CGRect(x: 1, y: size.height * 0.15, width: size.width - 2, height: size.height * 0.7)
                ctx.stroke(Path(roundedRect: bar, cornerRadius: 4), with: .color(Palette.line), lineWidth: 1)
                for b in 1...4 {
                    let x = bar.minX + (CGFloat(b) - 0.5) * bar.width / 4
                    if beats.contains(b) {
                        for k in 0..<3 {
                            let y = bar.midY + CGFloat(k - 1) * 9
                            ctx.fill(Path(ellipseIn: CGRect(x: x - 3.5, y: y - 3.5, width: 7, height: 7)), with: .color(Palette.signal))
                        }
                    } else {
                        ctx.fill(Path(ellipseIn: CGRect(x: x - 1.5, y: bar.midY - 1.5, width: 3, height: 3)), with: .color(Palette.muted))
                    }
                }
            }
        }
    }
}
