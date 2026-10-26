import SwiftUI

/// The progression map: Level 1 as a path of stops, lessons as squares and quizzes as circles,
/// winding down the screen. Done stops are filled, the next one to play is lit in `signal`,
/// locked and coming-soon ones are outlines. Tap an open stop to play it.
struct MapScreen: View {
    let app: AppModel
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        let path = LessonEntry.path
        // The first stop that's open and not done: you are here.
        let here = path.firstIndex { e in
            switch app.status(e) {
            case .done, .quizDone, .locked, .soon, .game: false  // the endless game is never "next"
            case .module(let done, let of): done < of
            default: true
            }
        }
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                Text("Map")
                    .font(.display(compact ? 40 : 52))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                StaffLines()
                    .frame(maxWidth: .infinity)
                TransportButton(symbol: "gearshape", lit: false, size: compact ? 34 : 36, label: "Settings") {
                    app.route = .settings
                }
            }
            .padding(.top, compact ? 8 : 24)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    LevelHeader(number: 1, title: "The blues", detail: "\(path.filter { $0.module && app.progress.lesson($0.code).completed != nil }.count) of \(path.filter(\.module).count) modules")
                        .padding(.top, compact ? 22 : 32)
                        .padding(.bottom, 8)
                    ForEach(Array(path.enumerated()), id: \.element.id) { i, entry in
                        MapStop(entry: entry, status: app.status(entry), here: i == here, side: i % 2 == 0 ? .leading : .trailing,
                                last: i == path.count - 1) { app.start(entry) }
                    }
                    LevelHeader(number: 2, title: "Later", detail: "Minor blues")
                        .opacity(0.5)
                        .padding(.top, 16)
                }
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)

            TabBar(app: app)
                .padding(.top, 10)
                .padding(.bottom, compact ? 4 : 20)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
    }
}

private struct LevelHeader: View {
    let number: Int
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("Level \(number)")
                .dataLabel(13, weight: .semibold)
                .foregroundStyle(Palette.muted)
            Text(title)
                .font(.display(26))
                .textCase(.uppercase)
                .foregroundStyle(Palette.text)
            Spacer(minLength: 8)
            Text(detail)
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
                .multilineTextAlignment(.trailing)
        }
    }
}

/// One stop: the marker on its side of the path, the line down to the next stop, the label.
private struct MapStop: View {
    let entry: LessonEntry
    let status: EntryStatus
    let here: Bool
    let side: HorizontalAlignment
    let last: Bool
    let action: () -> Void

    private var done: Bool {
        switch status {
        case .done, .quizDone, .quizToday: true
        case .module(let done, let of): done >= of
        default: false
        }
    }

    var body: some View {
        let marker = Marker(code: entry.code, quiz: !entry.module, done: done, here: here, open: status.open)
        let label = VStack(alignment: side == .leading ? .leading : .trailing, spacing: 3) {
            Text(entry.title)
                .font(.display(22))
                .textCase(.uppercase)
                .foregroundStyle(status.open ? Palette.text : Palette.muted)
            Text(caption)
                .dataLabel(10)
                .foregroundStyle(here ? Palette.signal : Palette.muted)
        }
        .multilineTextAlignment(side == .leading ? .leading : .trailing)

        HStack(spacing: 14) {
            if side == .leading { marker; label; Spacer(minLength: 0) } else { Spacer(minLength: 0); label; marker }
        }
        .frame(height: 76)
        .background(alignment: .top) {
            // The path: from this stop's marker to the next one's, on the other side.
            if !last {
                GeometryReader { g in
                    Path { p in
                        let x0 = side == .leading ? 32.0 : g.size.width - 32
                        let x1 = side == .leading ? g.size.width - 32 : 32.0
                        p.move(to: CGPoint(x: x0, y: 38))
                        p.addCurve(to: CGPoint(x: x1, y: 38 + 76), control1: CGPoint(x: x0, y: 38 + 50),
                                   control2: CGPoint(x: x1, y: 38 + 26))
                    }
                    .stroke(done ? Palette.text.opacity(0.5) : Palette.line, style: StrokeStyle(lineWidth: 2, dash: done ? [] : [4, 5]))
                }
                .frame(height: 76 * 2)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: action)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(entry.code) \(entry.title), \(caption)\(here ? ", you are here" : "")")
        .accessibilityAddTraits(status.open ? .isButton : [])
    }

    private var caption: String {
        if here { return status == .quizNew ? "You are here · find your level" : "You are here" }
        switch status {
        case .new: return "New"
        case .inProgress(let n, let of): return "Lesson \(n) of \(of)"
        case .done(let tempo): return tempo > 0 ? "Done · \(tempo) bpm" : "Done"
        case .game(let kind, let level): return "Level \(level) of \(kind.levels.count)"
        case .quizNew: return "Find your level"
        case .quizToday(let level), .quizDone(let level): return "Your level: \(level.title)"
        case .locked(let after): return "After \(after)"
        case .soon: return "Coming soon"
        case .module(let done, let of): return "\(done) of \(of) lessons"
        }
    }
}

/// A lesson is a square, a quiz a circle: done filled, here lit, locked an outline.
private struct Marker: View {
    let code: String
    let quiz: Bool
    let done: Bool
    let here: Bool
    let open: Bool

    var body: some View {
        let shape = quiz ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: 10))
        ZStack {
            if here {
                shape.fill(Palette.signal)
            } else if done {
                shape.fill(Palette.text)
            } else {
                shape.fill(Palette.ground)
                shape.stroke(open ? Palette.muted : Palette.line, style: StrokeStyle(lineWidth: 2, dash: open ? [] : [4, 4]))
            }
            Text(code)
                .font(.display(22))
                .foregroundStyle(here ? Palette.blackKey : done ? Palette.ground : (open ? Palette.text : Palette.muted))
        }
        .frame(width: 64, height: 64)
    }
}
