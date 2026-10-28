import SwiftUI

/// A scale lesson in the pads' place: the run as a staircase of letters that rises with pitch
/// (up climbs, down descends, up-and-down is a hill), the note you're on lit `signal`, the next
/// outlined `cue`, the crossing drawn as an arrow slipping under the step where the thumb
/// tucks. A hand sits under it with the finger that's down lit and the next one outlined; when
/// the next move is thumb under, the thumb curls in.
struct RunPanel: View {
    let run: LessonState.Run
    let beat: Int
    var compact = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .dataLabel(compact ? 11 : 12, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                Spacer(minLength: 0)
            }
            Staircase(run: run, compact: compact)
                .frame(height: compact ? 90 : 124)
                .padding(.top, compact ? 6 : 10)
            // The hand takes what is left, centered.
            HandView(down: run.resting ? nil : run.now?.finger, next: run.next?.finger,
                     tuck: tucking, right: run.right)
                .aspectRatio(240 / 200, contentMode: .fit)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.top, compact ? 6 : 12)
        }
        .padding(compact ? 12 : 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(spoken)
    }

    /// The thumb tucks under when the next step is the thumb crossing.
    private var tucking: Bool {
        guard let a = run.now, let b = run.next, !run.resting else { return false }
        return LessonState.Run.crossing(from: a, to: b, right: run.right) == "Thumb under"
    }

    /// "A minor · going up", "A minor · left hand · going up"
    private var title: String {
        let dir: String
        if let f = run.notes.first?.key, let l = run.notes.last?.key {
            dir = l > f ? "going up" : l < f ? "coming down" : "up and down"
        } else { dir = "" }
        return [run.name, run.right ? "" : "left hand", dir].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var spoken: String {
        guard let now = run.now else { return title }
        let next = run.next.map { ", next \(Key.letter($0.key, flats: run.flats)) with \(LessonState.Run.fingerWord($0.finger).lowercased())" } ?? ""
        return "\(title). \(run.resting ? "Hold" : "Now") \(Key.letter(now.key, flats: run.flats)), \(LessonState.Run.fingerWord(now.finger).lowercased())\(next)"
    }
}

/// The run's notes as steps: one column per note, each raised by its pitch.
struct Staircase: View {
    let run: LessonState.Run
    var compact = false

    var body: some View {
        GeometryReader { g in
            let m = Metrics(run: run, size: g.size, compact: compact)
            let n = m.n, w = m.w, stepH = m.stepH, rise = m.rise, arrowH = m.arrowH
            let top = m.top, x = m.x
            ZStack(alignment: .topLeading) {
                // The risers: a faint line from each step down to the baseline, so it reads as stairs.
                Canvas { ctx, _ in
                    for i in 0..<n {
                        var p = Path()
                        let y = top(i) + stepH
                        p.move(to: CGPoint(x: x(i), y: y))
                        p.addLine(to: CGPoint(x: x(i), y: rise + stepH))
                        p.addLine(to: CGPoint(x: x(i) + w, y: rise + stepH))
                        p.addLine(to: CGPoint(x: x(i) + w, y: y))
                        ctx.stroke(p, with: .color(Palette.line), lineWidth: 1)
                    }
                    // The crossings: an arrow from under one step to the next.
                    for i in 0..<(n - 1) {
                        guard let name = LessonState.Run.crossing(from: run.notes[i], to: run.notes[i + 1], right: run.right) else { continue }
                        let live = run.index == i && !run.resting
                        let color = live ? Palette.signal : Palette.muted
                        let x0 = x(i) + w / 2, x1 = x(i + 1) + w / 2
                        let y0 = rise + stepH + 3
                        var p = Path()
                        p.move(to: CGPoint(x: x0, y: y0))
                        p.addQuadCurve(to: CGPoint(x: x1, y: y0), control: CGPoint(x: (x0 + x1) / 2, y: y0 + arrowH * 0.9))
                        ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: live ? 2.5 : 1.5, lineCap: .round))
                        var head = Path()
                        head.move(to: CGPoint(x: x1 - 5, y: y0 + 7))
                        head.addLine(to: CGPoint(x: x1, y: y0))
                        head.addLine(to: CGPoint(x: x1 + 5, y: y0 + 7))
                        ctx.stroke(head, with: .color(color), style: StrokeStyle(lineWidth: live ? 2.5 : 1.5, lineCap: .round, lineJoin: .round))
                        if w >= 34 {
                            ctx.draw(Text(name.uppercased()).font(.system(size: compact ? 8 : 10, weight: .semibold, design: .monospaced)).foregroundColor(color),
                                     at: CGPoint(x: (x0 + x1) / 2, y: y0 + arrowH * 0.55), anchor: .top)
                        }
                    }
                }
                ForEach(Array(run.notes.enumerated()), id: \.offset) { i, note in
                    Step(note: note, role: role(i), width: w, badge: w >= 34, compact: compact, flats: run.flats)
                        .frame(width: w, height: stepH)
                        .offset(x: x(i), y: top(i))
                        .animation(.easeOut(duration: 0.18), value: run.index)
                }
            }
        }
    }

    /// Where each step sits: one column per note, raised by its pitch.
    struct Metrics {
        let n: Int
        let gap: CGFloat
        let w: CGFloat
        let arrowH: CGFloat
        let stepH: CGFloat
        let rise: CGFloat
        let keys: [Int]

        init(run: LessonState.Run, size: CGSize, compact: Bool) {
            n = max(1, run.notes.count)
            gap = n > 8 ? 3 : (compact ? 5 : 10)
            w = (size.width - gap * CGFloat(n - 1)) / CGFloat(n)
            arrowH = compact ? 26 : 26
            stepH = compact ? 40 : 58
            rise = max(0, size.height - stepH - arrowH)
            keys = run.notes.map(\.key)
        }

        /// Top of step i: higher pitch, higher on screen.
        func top(_ i: Int) -> CGFloat {
            let lo = keys.min() ?? 0, hi = keys.max() ?? 1
            let t = hi == lo ? 0.5 : CGFloat(keys[i] - lo) / CGFloat(hi - lo)
            return rise * (1 - t)
        }

        func x(_ i: Int) -> CGFloat { (w + gap) * CGFloat(i) }
    }

    private func role(_ i: Int) -> Step.Role {
        guard let now = run.index else { return i == 0 ? .next : .ahead }
        if run.resting { return i == now ? .now : .behind }
        if i == now { return .now }
        if i == (now + 1) % run.notes.count, run.notes.count > 1 { return .next }
        return i < now ? .behind : .ahead
    }

    /// One step: the letter and the finger.
    struct Step: View {
        enum Role { case behind, now, next, ahead }
        let note: LessonState.Run.Note
        let role: Role
        let width: CGFloat
        let badge: Bool
        var compact = false
        var flats = false

        var body: some View {
            let shape = RoundedRectangle(cornerRadius: 6)
            let ink: Color = switch role {
            case .now: Palette.ground
            case .behind: Palette.muted
            case .next: Palette.cue
            case .ahead: Palette.text
            }
            ZStack {
                shape.fill(role == .now ? Palette.signal : role == .behind ? Palette.ground : Palette.panel)
                if role == .next {
                    shape.strokeBorder(Palette.cue, lineWidth: 1.5)
                } else if role != .now {
                    shape.strokeBorder(Palette.line, lineWidth: 1)
                }
                VStack(spacing: compact ? 2 : 6) {
                    Text(Key.letter(note.key, flats: flats))
                        .font(.display(badge ? (compact ? 18 : 26) : (compact ? 13 : 18)))
                        .foregroundStyle(ink)
                    if badge, note.finger > 0 {
                        FingerBadge(finger: note.finger, onFill: role == .now)
                            .opacity(role == .behind ? 0.45 : 1)
                    }
                }
            }
            .accessibilityHidden(true)
        }
    }
}

/// The last note as one small dot: green a hit, yellow rushed or dragged, red wrong or missed.
/// It pops on every note.
struct NoteDot: View {
    let mark: LessonEngine.NoteMark?
    var size: CGFloat = 12
    @State private var popped = false

    var body: some View {
        Circle()
            .fill(mark.map(NoteNeedle.color) ?? Palette.line)
            .frame(width: size, height: size)
            .scaleEffect(popped ? 1.0 : 1.5)
            .animation(.spring(response: 0.3, dampingFraction: 0.55), value: popped)
            .onChange(of: mark?.seq) { _, _ in
                popped = false
                DispatchQueue.main.async { popped = true }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Last note: \(NoteNeedle.word(mark))")
    }
}

extension Key {
    /// The letter alone: "A", "C♯" (or "D♭" with `flats`).
    static func letter(_ note: Int, flats: Bool = false) -> String {
        let pc = ((note % 12) + 12) % 12
        return flats ? ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"][pc]
                     : ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][pc]
    }
}
