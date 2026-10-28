import SwiftUI

/// Stage: the set list. Every song open: a cover, the style, key, tempo and length, the
/// part and the level you take it at, your best, Play. The band on the menu keeps playing
/// until a song starts.
struct StageScreen: View {
    let app: AppModel
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var board: Song?

    var body: some View {
        let compact = sizeClass == .compact
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 16) {
                Text("Stage")
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
                VStack(alignment: .leading, spacing: 12) {
                    Text("Five songs, all yours from the start. Take the chords or the melody, pick a level, and play with the band. Adaptive climbs as you play clean.")
                        .bodyText(compact ? 14 : 16)
                        .foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, compact ? 16 : 24)
                    ForEach(app.songs, id: \.name) { song in
                        SongCard(app: app, song: song, compact: compact) { board = song }
                    }
                }
                .padding(.bottom, 16)
            }
            .scrollBounceBehavior(.basedOnSize)

            Spacer(minLength: 12)
            if let player = app.player {
                NowPlayingStrip(player: player)
            }
            TabBar(app: app)
                .padding(.top, 10)
                .padding(.bottom, compact ? 4 : 20)
        }
        .padding(.horizontal, compact ? 16 : 40)
        .frame(maxWidth: compact ? .infinity : 820, alignment: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.ground.ignoresSafeArea())
        .sheet(item: $board) { song in
            BoardSheet(app: app, song: song)
        }
    }
}

extension Song: Identifiable {
    var id: String { name }
}

/// One song on the set list.
struct SongCard: View {
    let app: AppModel
    let song: Song
    let compact: Bool
    let showBoard: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let part = app.stagePart(song)
        let difficulty = app.stageDifficulty(song)
        let best = app.progress.best(song: song.name, part: part.rawValue)
        VStack(alignment: .leading, spacing: compact ? 12 : 14) {
            HStack(alignment: .top, spacing: compact ? 14 : 20) {
                SongArt(kind: song.meta.art)
                    .frame(width: compact ? 72 : 96, height: compact ? 72 : 96)
                VStack(alignment: .leading, spacing: 4) {
                    Text(song.meta.title)
                        .font(.display(compact ? 30 : 38))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text("\(song.meta.style) · \(song.meta.key) · \(song.meta.tempo) bpm · \(song.length)")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                    Text(song.meta.line)
                        .bodyText(compact ? 13 : 14)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: compact ? 10 : 16) {
                Chips(title: "Part", options: Song.PartKey.allCases.map { ($0.rawValue, $0.title) }, picked: part.rawValue) {
                    app.pick(song: song, part: Song.PartKey(rawValue: $0)!)
                }
                if !compact {
                    Chips(title: "Level", options: GameEngine.Difficulty.allCases.map { ($0.rawValue, $0.title) }, picked: difficulty.rawValue) {
                        app.pick(song: song, difficulty: GameEngine.Difficulty(rawValue: $0)!)
                    }
                }
            }
            if compact {
                Chips(title: "Level", options: GameEngine.Difficulty.allCases.map { ($0.rawValue, $0.title) }, picked: difficulty.rawValue) {
                    app.pick(song: song, difficulty: GameEngine.Difficulty(rawValue: $0)!)
                }
            }
            Text(Charting.bundled.line(difficulty, song: song.name, part: part))
                .dataLabel(10)
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                PrimaryButton(title: "Play") { app.play(song: song) }
                QuietButton(title: "Board", action: showBoard)
                Spacer(minLength: 8)
                if let best {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("Best")
                            .dataLabel(10)
                            .foregroundStyle(Palette.muted)
                        Text(best.grade)
                            .font(.display(compact ? 22 : 26))
                            .foregroundStyle(Palette.signal)
                        Text("\(best.score)")
                            .font(.display(compact ? 22 : 26))
                            .monospacedDigit()
                            .foregroundStyle(Palette.text)
                    }
                } else {
                    Text("Not played yet")
                        .dataLabel(10)
                        .foregroundStyle(Palette.muted)
                }
            }
        }
        .padding(compact ? 16 : 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
    }
}

/// A row of small choices; the picked one is filled `signal`.
struct Chips: View {
    let title: String
    let options: [(key: String, title: String)]
    let picked: String
    let pick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .dataLabel(9)
                .foregroundStyle(Palette.muted)
            HStack(spacing: 4) {
                ForEach(options, id: \.key) { o in
                    let on = o.key == picked
                    Button { pick(o.key) } label: {
                        Text(o.title)
                            .dataLabel(10, weight: .semibold)
                            .foregroundStyle(on ? Palette.blackKey : Palette.text)
                            .padding(.horizontal, 10)
                            .frame(height: 28)
                            .background(RoundedRectangle(cornerRadius: 5).fill(on ? Palette.signal : Palette.ground))
                            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(on ? Palette.signal : Palette.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
        }
    }
}

/// A song's board, the whole thing.
struct BoardSheet: View {
    let app: AppModel
    let song: Song
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        let compact = sizeClass == .compact
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(song.meta.title)
                        .font(.display(32))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.text)
                    Text("Board · best runs, any part")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                }
                Spacer()
                QuietButton(title: "Done") { dismiss() }
            }
            ScrollView {
                Leaderboard(scores: Array(app.progress.scores(song: song.name).prefix(20)), compact: compact)
            }
        }
        .padding(24)
        .frame(minWidth: compact ? 0 : 560, minHeight: compact ? 0 : 420)
        .background(Palette.ground.ignoresSafeArea())
    }
}

/// A song's cover: a drawing in the app's own line, one colour on the panel.
struct SongArt: View {
    let kind: String

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        Canvas { ctx, size in
            let w = size.width, h = size.height
            let ink = Palette.text, hot = Palette.signal, dim = Palette.muted
            switch kind {
            case "river":
                // A slow river: five lazy lines, the middle one lit.
                for i in 0..<5 {
                    var p = Path()
                    let y0 = h * (0.2 + 0.15 * CGFloat(i))
                    p.move(to: CGPoint(x: 0, y: y0))
                    p.addCurve(to: CGPoint(x: w, y: y0 + (i % 2 == 0 ? 6 : -6)),
                               control1: CGPoint(x: w * 0.35, y: y0 - 14), control2: CGPoint(x: w * 0.65, y: y0 + 14))
                    ctx.stroke(p, with: .color(i == 2 ? hot : i % 2 == 0 ? ink : dim), lineWidth: i == 2 ? 3 : 1.5)
                }
            case "boogie":
                // The boogie: a staircase that climbs and jumps back, the thumb's step lit.
                let n = 6
                let sw = w / CGFloat(n + 1)
                for i in 0..<n {
                    let x = sw * 0.5 + sw * CGFloat(i)
                    let y = h * 0.82 - CGFloat(i % 4) * h * 0.16
                    let r = CGRect(x: x, y: y - 10, width: sw * 0.8, height: 10)
                    ctx.fill(Path(roundedRect: r, cornerRadius: 2), with: .color(i % 4 == 1 ? hot : ink))
                }
            case "pulse":
                // Minimal: a grid of dots, one lit, one row of rims.
                let cols = 6, rows = 4
                for r in 0..<rows {
                    for c in 0..<cols {
                        let x = w * (0.14 + 0.72 * CGFloat(c) / CGFloat(cols - 1))
                        let y = h * (0.2 + 0.6 * CGFloat(r) / CGFloat(rows - 1))
                        let on = (r == 1 && c == 3)
                        let rr: CGFloat = on ? 5 : (r + c) % 3 == 0 ? 3 : 2
                        ctx.fill(Path(ellipseIn: CGRect(x: x - rr, y: y - rr, width: 2 * rr, height: 2 * rr)),
                                 with: .color(on ? hot : (r + c) % 3 == 0 ? ink : dim))
                    }
                }
            case "nine":
                // Deep house: nine soft stacked bars pushed off the grid, one warm.
                for i in 0..<9 {
                    let y = h * (0.14 + 0.09 * CGFloat(i))
                    let push: CGFloat = i % 4 == 1 || i % 4 == 3 ? 10 : 0
                    let r = CGRect(x: w * 0.16 + push, y: y, width: w * 0.5 + CGFloat(i % 3) * 8, height: 5)
                    ctx.fill(Path(roundedRect: r, cornerRadius: 2.5), with: .color(i == 4 ? hot : i % 2 == 0 ? ink : dim))
                }
            case "abyss":
                // Dub: one stab and its echoes, each fainter and lower.
                for i in 0..<5 {
                    let x = w * (0.16 + 0.17 * CGFloat(i))
                    let hh = h * (0.5 - 0.09 * CGFloat(i))
                    let r = CGRect(x: x, y: h * 0.72 - hh, width: w * 0.08, height: hh)
                    ctx.fill(Path(roundedRect: r, cornerRadius: 2), with: .color(i == 0 ? hot : ink.opacity(1 - 0.18 * Double(i))))
                }
                var p = Path()
                p.move(to: CGPoint(x: w * 0.1, y: h * 0.72))
                p.addLine(to: CGPoint(x: w * 0.9, y: h * 0.72))
                ctx.stroke(p, with: .color(dim), lineWidth: 1)
            default:
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.4, y: h * 0.4, width: w * 0.2, height: h * 0.2)), with: .color(hot))
            }
        }
        .background(shape.fill(Palette.ground))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
        .clipShape(shape)
        .accessibilityHidden(true)
    }
}
