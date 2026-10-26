import SwiftUI

/// How the last note landed, as a small meter: the needle swings to the note's timing on a scale
/// of twice the hit window. Green, the middle half, is a hit (near the middle or a little off);
/// yellow is rushed or dragged; red is a wrong note, or a miss with the needle back at rest.
struct NoteNeedle: View {
    let mark: LessonEngine.NoteMark?
    /// The iPhone's: the meter alone, beside the coach line.
    var compact = false

    static let sweep = 50.0

    var body: some View {
        if compact {
            meter.frame(width: 76, height: 40)
        } else {
            HStack(alignment: .center, spacing: 18) {
                meter.frame(width: 148, height: 78)
                VStack(alignment: .leading, spacing: 4) {
                    Text(Self.word(mark))
                        .font(.display(26))
                        .textCase(.uppercase)
                        .foregroundStyle(mark.map(Self.color) ?? Palette.muted)
                    Text("Last note")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                }
            }
        }
    }

    private var meter: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            let r = min(w / 2 / CGFloat(sin(Self.sweep * .pi / 180)), h) * 0.94
            let pivot = CGPoint(x: w / 2, y: h - 2)
            ZStack {
                Canvas { ctx, _ in
                    let thick = max(4, r * 0.12)
                    func arc(_ from: Double, _ to: Double, _ color: Color) {
                        var p = Path()
                        p.addArc(center: pivot, radius: r - thick / 2, startAngle: .degrees(from * Self.sweep - 90),
                                 endAngle: .degrees(to * Self.sweep - 90), clockwise: false)
                        ctx.stroke(p, with: .color(color), lineWidth: thick)
                    }
                    // The scale is ± twice the window: the middle half is a hit.
                    arc(-1, -0.5, Palette.warn.opacity(0.5))
                    arc(-0.5, 0.5, Palette.good.opacity(0.6))
                    arc(0.5, 1, Palette.warn.opacity(0.5))
                    var mid = Path()
                    mid.move(to: CGPoint(x: pivot.x, y: pivot.y - r))
                    mid.addLine(to: CGPoint(x: pivot.x, y: pivot.y - r + thick + 4))
                    ctx.stroke(mid, with: .color(Palette.text), lineWidth: 1.5)
                }
                Capsule()
                    .fill(mark.map(Self.color) ?? Palette.muted)
                    .frame(width: compact ? 3 : 4, height: r * 0.92)
                    .position(x: pivot.x, y: pivot.y - r * 0.46)
                    .rotationEffect(.degrees(Self.angle(mark)), anchor: UnitPoint(x: pivot.x / w, y: pivot.y / h))
                    .animation(.interpolatingSpring(stiffness: 220, damping: 15), value: mark?.seq)
                Circle()
                    .fill(Palette.text)
                    .frame(width: compact ? 7 : 10, height: compact ? 7 : 10)
                    .position(pivot)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Last note: \(Self.word(mark))")
    }

    /// Where the needle points: the offset over twice the window, clamped; a miss rests in the middle.
    static func angle(_ mark: LessonEngine.NoteMark?) -> Double {
        guard let m = mark, let ms = m.offsetMs, m.windowMs > 0 else { return 0 }
        return max(-1, min(1, ms / (2 * m.windowMs))) * sweep
    }

    static func color(_ mark: LessonEngine.NoteMark) -> Color {
        switch mark.kind {
        case .hit: Palette.good
        case .early, .late: Palette.warn
        case .wrong, .missed: Palette.bad
        }
    }

    static func word(_ mark: LessonEngine.NoteMark?) -> String {
        guard let m = mark else { return "Play" }
        switch m.kind {
        case .hit:
            guard let ms = m.offsetMs, abs(ms) > m.windowMs * 0.4 else { return "On time" }
            return ms < 0 ? "A bit early" : "A bit late"
        case .early: return "Rushed"
        case .late: return "Dragged"
        case .wrong: return "Wrong note"
        case .missed: return "Missed"
        }
    }
}
