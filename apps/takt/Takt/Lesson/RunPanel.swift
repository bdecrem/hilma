import SwiftUI

/// A scale lesson in the pads' place: the run as a row of note tiles (the note being played
/// filled `signal`, the next outlined `cue`, the ones behind you dimmed), the crossings drawn
/// under the row as an arrow with its name ("Thumb under"), and a readout of now and next with
/// the hand showing which finger is down and which comes next.
struct RunPanel: View {
    let run: LessonState.Run
    let beat: Int
    var compact = false

    private var rowSize: Int { 8 }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        VStack(alignment: .leading, spacing: compact ? 10 : 18) {
            Text(title)
                .dataLabel(compact ? 11 : 12, weight: .semibold)
                .foregroundStyle(Palette.muted)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                tileRow(row)
            }
            readout
                .padding(.top, compact ? 2 : 8)
        }
        .padding(compact ? 14 : 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .accessibilityElement(children: .contain)
    }

    /// "A minor · up"
    private var title: String {
        let dir: String
        if let f = run.notes.first?.key, let l = run.notes.last?.key {
            dir = l > f ? "up" : l < f ? "down" : "up and down"
        } else { dir = "" }
        return [run.name, dir].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// The notes in rows of up to eight, each with its index into the run.
    private var rows: [[(Int, LessonState.Run.Note)]] {
        let all = Array(run.notes.enumerated()).map { ($0.offset, $0.element) }
        return stride(from: 0, to: all.count, by: rowSize).map { Array(all[$0..<min($0 + rowSize, all.count)]) }
    }

    private func role(_ i: Int) -> RunTile.Role {
        guard let now = run.index else { return i == 0 ? .next : .upcoming }
        if run.resting { return i == now ? .now : .done }
        if i == now { return .now }
        if i == (now + 1) % run.notes.count, run.notes.count > 1 { return .next }
        return i < now ? .done : .upcoming
    }

    private func tileRow(_ row: [(Int, LessonState.Run.Note)]) -> some View {
        let gap: CGFloat = compact ? 4 : 8
        let tileH: CGFloat = compact ? 52 : 92
        let arrowH: CGFloat = compact ? 26 : 34
        return VStack(spacing: 0) {
            HStack(spacing: gap) {
                ForEach(row, id: \.0) { i, n in
                    RunTile(note: n, role: role(i), compact: compact)
                        .frame(maxWidth: .infinity)
                        .frame(height: tileH)
                }
                // A short last row keeps the first row's tile width.
                ForEach(0..<(rowSize - row.count), id: \.self) { _ in Color.clear.frame(maxWidth: .infinity).frame(height: tileH) }
            }
            Canvas { ctx, size in
                let w = (size.width - gap * CGFloat(rowSize - 1)) / CGFloat(rowSize)
                for (k, pair) in row.enumerated().dropLast() {
                    let (i, a) = pair
                    let b = row[k + 1].1
                    guard let name = LessonState.Run.crossing(from: a, to: b) else { continue }
                    let x0 = w * CGFloat(k) + w / 2 + gap * CGFloat(k)
                    let x1 = x0 + w + gap
                    let live = run.index == i && !run.resting
                    let color = live ? Palette.signal : Palette.muted
                    var p = Path()
                    p.move(to: CGPoint(x: x0, y: 2))
                    p.addQuadCurve(to: CGPoint(x: x1, y: 2), control: CGPoint(x: (x0 + x1) / 2, y: arrowH * 0.95))
                    ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: live ? 2 : 1.5, lineCap: .round))
                    var head = Path()
                    head.move(to: CGPoint(x: x1 - 5, y: 9))
                    head.addLine(to: CGPoint(x: x1, y: 2))
                    head.addLine(to: CGPoint(x: x1 + 5, y: 9))
                    ctx.stroke(head, with: .color(color), style: StrokeStyle(lineWidth: live ? 2 : 1.5, lineCap: .round, lineJoin: .round))
                    ctx.draw(Text(name.uppercased()).font(.system(size: compact ? 8 : 10, weight: .semibold, design: .monospaced)).foregroundColor(color),
                             at: CGPoint(x: (x0 + x1) / 2, y: arrowH * 0.62), anchor: .top)
                }
            }
            .frame(height: arrowH)
        }
    }

    private var readout: some View {
        let now = run.now, next = run.next
        let crossing: String? = if let now, let next { LessonState.Run.crossing(from: now, to: next) } else { nil }
        return HStack(alignment: .top, spacing: compact ? 18 : 36) {
            column(label: run.resting ? "Hold" : "Now", note: now, color: Palette.signal,
                   hint: run.resting ? "Keep it down" : now.map { LessonState.Run.fingerWord($0.finger) } ?? "")
            column(label: "Next", note: next, color: Palette.cue,
                   hint: run.wrapping ? "From the top · \(next.map { LessonState.Run.fingerWord($0.finger) } ?? "")"
                        : crossing ?? next.map { LessonState.Run.fingerWord($0.finger) } ?? "")
            Spacer(minLength: 0)
            if !compact {
                HandDiagram(used: now.map { [$0.finger] } ?? [], right: true, next: next.map { [$0.finger] } ?? [])
                    .frame(width: 124, height: 92)
            }
        }
    }

    private func column(label: String, note: LessonState.Run.Note?, color: Color, hint: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(note.map { Key.name($0.key) } ?? "—")
                    .font(.display(compact ? 30 : 44))
                    .foregroundStyle(note == nil ? Palette.muted : color)
                if let note, note.finger > 0 {
                    FingerBadge(finger: note.finger, onFill: false)
                }
            }
            Text(hint)
                .dataLabel(compact ? 10 : 11, weight: .semibold)
                .foregroundStyle(Palette.text)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

/// One note of the run: the letter, its finger, and whether it is behind, now, next or ahead.
struct RunTile: View {
    enum Role { case done, now, next, upcoming }

    let note: LessonState.Run.Note
    let role: Role
    var compact = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        let ink: Color = switch role {
        case .now: Palette.ground
        case .done: Palette.muted
        case .next: Palette.cue
        case .upcoming: Palette.text
        }
        ZStack {
            shape.fill(role == .now ? Palette.signal : role == .done ? Palette.ground : Palette.panel)
            if role == .next {
                shape.strokeBorder(Palette.cue, lineWidth: 1.5)
                CornerTick(inset: 5, leg: 8).fill(Palette.cue)
            } else if role != .now {
                shape.strokeBorder(Palette.line, lineWidth: 1)
            }
            VStack(spacing: compact ? 3 : 8) {
                Text(Key.name(note.key))
                    .font(.display(compact ? 18 : 30))
                    .foregroundStyle(ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if note.finger > 0 {
                    FingerBadge(finger: note.finger, onFill: role == .now)
                        .opacity(role == .done ? 0.5 : 1)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(Key.name(note.key)), finger \(note.finger)\(role == .now ? ", now" : role == .next ? ", next" : "")")
    }
}
