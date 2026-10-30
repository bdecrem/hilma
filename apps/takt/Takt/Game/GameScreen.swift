import SwiftUI

/// Everything the game screen draws, this frame. Pure: the Player builds it from the transport
/// and the GameEngine.
struct GameState {
    struct HighwayNote: Identifiable, Equatable {
        let id: Int
        let note: Int
        let tick: Double
        let length: Double
        let status: GameEngine.Status
        let finger: Int?
    }

    /// How far ahead the highway shows, in seconds (the same at every tempo).
    static let lookaheadSeconds = 3.0

    var title = ""
    var style = ""
    var part = Song.PartKey.chords
    var partTitle = ""
    var difficulty = GameEngine.Difficulty.adaptive
    /// The tier being played and the ladder's height.
    var level = 1
    var tiers = 1
    var section = ""
    var chord = ""
    var nextChord = ""
    var bar = 0
    var bars = 1
    var beat = 0
    var score = 0
    var combo = 0
    var maxCombo = 0
    var multiplier = 1
    var accuracy = 1.0
    var progress = 0.0
    var countIn: Int? = nil
    var playing = false
    var pop: GameEngine.Pop? = nil
    var heardTick = 0.0
    var lookaheadTicks = 1.0
    var ticksPerBeat = 12
    var ticksPerBar = 48
    var notes: [HighwayNote] = []
    var keys: ClosedRange<Int> = 48...71
    var nowNotes: Set<Int> = []
    var nextNotes: Set<Int> = []
    var pressedNotes: Set<Int> = []
    var fingers: [Int: Int] = [:]
    /// The hand in the corner: fingers down for the chord in the window, the next chord's
    /// first finger outlined; the right hand for a melody, the left for chords.
    var nowFingers: Set<Int> = []
    var nextFinger: Int? = nil
    var rightHand = true
    var result: GameEngine.Result? = nil
    var lastRun: ProgressStore.ScoreRecord? = nil
    var board: [ProgressStore.ScoreRecord] = []
    var sections: [Song.Section] = []

    var levelTitle: String { "Level \(level)" }
}

/// What the game screen's buttons do.
struct GameControls {
    var togglePlay: () -> Void = {}
    var again: () -> Void = {}
    var leave: () -> Void = {}
}

private struct GameControlsKey: EnvironmentKey {
    static let defaultValue = GameControls()
}

extension EnvironmentValues {
    var gameControls: GameControls {
        get { self[GameControlsKey.self] }
        set { self[GameControlsKey.self] = newValue }
    }
}

/// Stage: the song's notes fall down a highway onto the keyboard, each in its key's lane;
/// the hit line is the top of the keys. The HUD above has the score, the combo and the
/// multiplier; the chord of the bar sits by the hit line. The result takes the highway's
/// place when the song ends.
struct GameScreen: View {
    let state: GameState
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.gameControls) private var controls

    var body: some View {
        let compact = sizeClass == .compact
        VStack(spacing: 0) {
            GameHUD(state: state, compact: compact)
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.top, compact ? 8 : 14)
                .padding(.bottom, 10)
            ProgressRail(state: state)
                .frame(height: 6)
                .padding(.horizontal, compact ? 16 : 24)
            ZStack {
                if let r = state.result {
                    GameResultPanel(state: state, result: r, compact: compact)
                        .padding(compact ? 16 : 32)
                } else {
                    Highway(state: state, compact: compact)
                        .padding(.horizontal, compact ? 16 : 24)
                    if let n = state.countIn {
                        CountInBadge(n: n, compact: compact)
                    } else if !state.playing && state.heardTick > 0 {
                        PausedBadge(compact: compact)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            Hairline()
            KeyboardStrip(low: state.keys.lowerBound, high: state.keys.upperBound, now: state.nowNotes, next: state.nextNotes,
                          pressed: state.pressedNotes, fingers: state.fingers)
                .frame(height: compact ? 112 : 128)
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.vertical, compact ? 10 : 18)
        }
        .background(Palette.ground.ignoresSafeArea())
    }
}

/// Back, the song and its section, the combo with its multiplier, the score.
struct GameHUD: View {
    let state: GameState
    let compact: Bool
    @Environment(\.gameControls) private var controls

    var body: some View {
        HStack(alignment: .center, spacing: compact ? 10 : 20) {
            TransportButton(symbol: "chevron.left", lit: false, size: compact ? 34 : 36, label: "Back to the stage", action: controls.leave)
            VStack(alignment: .leading, spacing: 2) {
                Text(state.title)
                    .font(.display(compact ? 24 : 30))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("\(state.partTitle) · \(state.difficulty == .adaptive ? (compact ? state.levelTitle : "Adaptive · \(state.levelTitle)") : state.difficulty.title)\(compact ? "" : " · \(state.section)")")
                    .dataLabel(compact ? 10 : 12)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 8)
            ComboMeter(combo: state.combo, multiplier: state.multiplier, compact: compact)
            VStack(alignment: .trailing, spacing: 0) {
                Text("\(state.score)")
                    .font(.display(compact ? 30 : 40))
                    .monospacedDigit()
                    .foregroundStyle(Palette.text)
                    .contentTransition(.numericText())
                    .animation(.easeOut(duration: 0.15), value: state.score)
                Text("Score")
                    .dataLabel(10)
                    .foregroundStyle(Palette.muted)
            }
            .frame(minWidth: compact ? 70 : 110, alignment: .trailing)
            if !compact {
                TransportButton(symbol: state.playing ? "pause.fill" : "play.fill", lit: state.playing, size: 36,
                                label: state.playing ? "Pause" : "Play", action: controls.togglePlay)
            }
        }
    }
}

/// The combo as a ring that fills toward the next multiplier, the count in the middle, the
/// multiplier beside it lit in `signal` when it is on.
struct ComboMeter: View {
    let combo: Int
    let multiplier: Int
    let compact: Bool

    var body: some View {
        let size: CGFloat = compact ? 40 : 50
        let steps = GameEngine.steps
        let floor = multiplier == 1 ? 0 : steps[multiplier - 2]
        let ceiling = multiplier - 1 < steps.count ? steps[multiplier - 1] : nil
        let fill = ceiling.map { Double(combo - floor) / Double($0 - floor) } ?? 1
        HStack(spacing: compact ? 6 : 10) {
            ZStack {
                Circle().stroke(Palette.line, lineWidth: compact ? 3 : 4)
                Circle()
                    .trim(from: 0, to: max(0, min(1, fill)))
                    .stroke(combo > 0 ? Palette.signal : Palette.line, style: StrokeStyle(lineWidth: compact ? 3 : 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeOut(duration: 0.15), value: fill)
                VStack(spacing: -2) {
                    Text("\(combo)")
                        .font(.display(compact ? 16 : 20))
                        .monospacedDigit()
                        .foregroundStyle(Palette.text)
                    Text("COMBO")
                        .font(.system(size: compact ? 5 : 6, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Palette.muted)
                }
            }
            .frame(width: size, height: size)
            Text("×\(multiplier)")
                .font(.display(compact ? 22 : 28))
                .foregroundStyle(multiplier > 1 ? Palette.signal : Palette.muted)
                .scaleEffect(multiplier > 1 ? 1 : 0.9)
                .animation(.spring(duration: 0.25, bounce: 0.5), value: multiplier)
                .frame(minWidth: compact ? 30 : 40, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Combo \(combo), times \(multiplier)")
    }
}

/// The song as a rail with its sections, filled to where it is.
struct ProgressRail: View {
    let state: GameState

    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.line)
                Capsule().fill(Palette.signal).frame(width: max(0, w * state.progress))
                ForEach(state.sections.dropFirst(), id: \.bar) { s in
                    Rectangle()
                        .fill(Palette.ground)
                        .frame(width: 2)
                        .offset(x: w * CGFloat(s.bar) / CGFloat(max(1, state.bars)) - 1)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// The notes coming down. Drawn in a Canvas: a capsule per note in its key's lane (black keys
/// narrower and darker), as long as it lasts, sliding in one continuous movement (the screen
/// redraws every frame, `LiveGameScreen`); the grid never moves: a fixed ruler of beat lines up
/// from the hit line, one a beat at the song's tempo, so a note's distance from the line is read
/// in beats; the hit line is `signal` at the bottom; a hit note vanishes with a flash, a missed
/// one slides on past the line and fades.
struct Highway: View {
    let state: GameState
    let compact: Bool

    var body: some View {
        ZStack(alignment: .bottom) {
            Canvas { ctx, size in
                let layout = KeyboardStrip.Layout(low: state.keys.lowerBound, high: state.keys.upperBound, size: size)
                let h = size.height
                let lookahead = state.lookaheadTicks
                func y(_ tick: Double) -> CGFloat { h - CGFloat((tick - state.heardTick) / lookahead) * h }
                // Grid lines sit on whole points: a hairline sliding between pixels shimmers.
                func snap(_ v: CGFloat) -> CGFloat { v.rounded() + 0.5 }

                // The grid: a fixed ruler. One line a beat up from the hit line, never moving; the
                // notes slide past it. The beat nearest the line reads strongest, the rest fade up.
                let beatHeight = CGFloat(state.ticksPerBeat) / lookahead * h
                let beatsShown = Int((h / beatHeight).rounded(.up))
                for b in 1...max(1, beatsShown) {
                    let yy = snap(h - CGFloat(b) * beatHeight)
                    guard yy >= 0 else { continue }
                    var p = Path()
                    p.move(to: CGPoint(x: 0, y: yy))
                    p.addLine(to: CGPoint(x: size.width, y: yy))
                    let fade = 1 - 0.5 * Double(b - 1) / Double(max(1, beatsShown - 1))
                    ctx.stroke(p, with: .color(Palette.line.opacity(fade)), lineWidth: 1)
                }

                // Lanes for the keys the chart uses next: a faint column.
                for note in state.nextNotes.union(state.nowNotes) {
                    let black = KeyboardStrip.isBlack(note)
                    let (x, w) = lane(note, layout: layout)
                    let r = CGRect(x: x - w / 2, y: 0, width: w, height: h)
                    ctx.fill(Path(r), with: .color((black ? Palette.text : Palette.text).opacity(0.035)))
                }

                // The notes.
                for n in state.notes {
                    let black = KeyboardStrip.isBlack(n.note)
                    let (x, w) = lane(n.note, layout: layout)
                    let bottom = y(n.tick)
                    let top = y(n.tick + n.length)
                    let height = max(compact ? 10 : 12, bottom - top)
                    var rect = CGRect(x: x - w / 2, y: bottom - height, width: w, height: height)
                    var color: Color
                    var opacity = 1.0
                    switch n.status {
                    case .pending:
                        color = black ? Palette.cue.opacity(0.85) : Palette.cue
                        if bottom > h {
                            // Past the line, still inside the window: it slides on under the keys.
                            rect.origin.y = min(rect.origin.y, h - 4)
                        }
                    case .hit:
                        continue
                    case .missed:
                        color = Palette.muted
                        opacity = max(0, 1 - (state.heardTick - n.tick) / Double(state.ticksPerBeat))
                    }
                    if rect.maxY < 0 || rect.minY > h { continue }
                    rect = rect.intersection(CGRect(x: -w, y: 0, width: size.width + 2 * w, height: h))
                    let path = Path(roundedRect: rect, cornerRadius: min(5, w / 2))
                    ctx.fill(path, with: .color(color.opacity(opacity)))
                    if black {
                        ctx.stroke(path, with: .color(Palette.blackKey.opacity(0.6 * opacity)), lineWidth: 1)
                    }
                    if let f = n.finger, height >= 20, w >= 18 {
                        ctx.draw(Text("\(f)").font(.system(size: 11, weight: .bold, design: .rounded)).foregroundColor(Palette.blackKey),
                                 at: CGPoint(x: rect.midX, y: rect.maxY - 10), anchor: .center)
                    }
                }

                // The hit line.
                var line = Path()
                line.move(to: CGPoint(x: 0, y: h - 1))
                line.addLine(to: CGPoint(x: size.width, y: h - 1))
                ctx.stroke(line, with: .color(Palette.signal), lineWidth: 2)
            }
            // The chord of the bar by the line, the next one dimmer under it.
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                Text(state.chord)
                    .font(.display(compact ? 30 : 44))
                    .foregroundStyle(Palette.text)
                if !state.nextChord.isEmpty, state.nextChord != state.chord {
                    Text("→ \(state.nextChord)")
                        .dataLabel(compact ? 11 : 13, weight: .semibold)
                        .foregroundStyle(Palette.muted)
                }
                Spacer()
            }
            .padding(.leading, compact ? 6 : 10)
            .padding(.bottom, 8)
            .allowsHitTesting(false)
            if let pop = state.pop {
                HitPop(pop: pop, compact: compact)
                    .id(pop.seq)
                    .padding(.bottom, compact ? 40 : 56)
                    .allowsHitTesting(false)
            }
            // The hand, top right, out of the way of the hit line: the fingers of the chord in
            // the window filled, the next one outlined (the lessons' own hand, your style).
            VStack {
                HStack {
                    Spacer()
                    HandView(lit: state.nowFingers, next: state.nextFinger, right: state.rightHand)
                        .frame(width: compact ? 72 : 108, height: compact ? 60 : 90)
                        .padding(compact ? 6 : 8)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel.opacity(0.85)))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
                        .padding(.top, 10)
                        .padding(.trailing, 2)
                        .accessibilityLabel(state.nowFingers.isEmpty ? "Hand" : "Fingers \(state.nowFingers.sorted().map(String.init).joined(separator: ", "))")
                }
                Spacer()
            }
            .allowsHitTesting(false)
        }
        .clipped()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(state.notes.filter { $0.status == .pending }.count) notes coming, chord \(state.chord)")
    }

    /// The lane's center and width for a key.
    private func lane(_ note: Int, layout: KeyboardStrip.Layout) -> (CGFloat, CGFloat) {
        if KeyboardStrip.isBlack(note) {
            return (layout.blackX(note) + layout.blackWidth / 2, layout.blackWidth * 0.9)
        }
        let i = CGFloat(layout.whites.firstIndex(of: note) ?? 0)
        return (i * layout.white + layout.white / 2, layout.white * 0.72)
    }
}

/// "PERFECT", "GOOD" or "MISS" by the hit line: springs in, fades out.
struct HitPop: View {
    let pop: GameEngine.Pop
    let compact: Bool
    @State private var shown = false

    var body: some View {
        let color: Color = switch pop.judgment {
        case .perfect: Palette.signal
        case .good: Palette.cue
        case .miss: Palette.muted
        }
        Text(pop.judgment.title)
            .font(.display(compact ? 26 : 36))
            .textCase(.uppercase)
            .foregroundStyle(color)
            .scaleEffect(shown ? 1 : 0.6)
            .opacity(shown ? 0 : 1)
            .offset(y: shown ? -24 : 0)
            .onAppear {
                withAnimation(.easeOut(duration: 0.55)) { shown = true }
            }
    }
}

/// The count-in's beat, big, in the middle of the highway.
struct CountInBadge: View {
    let n: Int
    let compact: Bool

    var body: some View {
        VStack(spacing: 4) {
            Text("\(n)")
                .font(.display(compact ? 80 : 120))
                .foregroundStyle(Palette.signal)
                .contentTransition(.numericText())
            Text("Get ready")
                .dataLabel(12, weight: .semibold)
                .foregroundStyle(Palette.muted)
        }
        .id(n)
        .transition(.scale(scale: 0.8).combined(with: .opacity))
        .animation(.spring(duration: 0.25, bounce: 0.4), value: n)
    }
}

struct PausedBadge: View {
    let compact: Bool
    @Environment(\.gameControls) private var controls

    var body: some View {
        VStack(spacing: 12) {
            Text("Paused")
                .font(.display(compact ? 40 : 56))
                .textCase(.uppercase)
                .foregroundStyle(Palette.text)
            PrimaryButton(title: "Keep going", action: controls.togglePlay)
        }
        .padding(28)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
    }
}

/// The run's result in the highway's place: the grade, the score, the counts, the board.
struct GameResultPanel: View {
    let state: GameState
    let result: GameEngine.Result
    let compact: Bool
    @Environment(\.gameControls) private var controls

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        Group {
            if compact {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        headline
                        verdict
                        RunMap(result: result, compact: true)
                        chips
                        StaffLines(spacing: 3)
                        board
                        buttons
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
                .scrollBounceBehavior(.basedOnSize)
            } else {
                // Wide: the run on the left, the board and the buttons on the right, no scrolling.
                HStack(alignment: .top, spacing: 32) {
                    VStack(alignment: .leading, spacing: 18) {
                        headline
                        verdict
                        RunMap(result: result, compact: false)
                        chips
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    Hairline(vertical: true)
                    VStack(alignment: .leading, spacing: 14) {
                        board
                        Spacer(minLength: 0)
                        buttons
                    }
                    .frame(width: 420, alignment: .topLeading)
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.line, lineWidth: 1))
    }

    private var rank: Int? { state.board.firstIndex { $0.id == state.lastRun?.id } }

    private var headline: some View {
        HStack(alignment: .top, spacing: compact ? 18 : 28) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Grade")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                Text(result.grade)
                    .font(.display(compact ? 96 : 130))
                    .foregroundStyle(result.grade == "S" || result.grade == "A" ? Palette.signal : Palette.text)
            }
            VStack(alignment: .leading, spacing: compact ? 8 : 10) {
                Text(state.title)
                    .font(.display(compact ? 28 : 36))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("\(state.partTitle) · \(state.difficulty.title)\(state.difficulty == .adaptive ? " · reached level \(result.level) of \(state.tiers)" : "")")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(result.score)")
                        .font(.display(compact ? 44 : 60))
                        .monospacedDigit()
                        .foregroundStyle(Palette.text)
                    Text("points")
                        .dataLabel(12)
                        .foregroundStyle(Palette.muted)
                }
                if let rank {
                    Text(rank == 0 ? "A new best for this song" : "No. \(rank + 1) on the board")
                        .dataLabel(11, weight: .semibold)
                        .foregroundStyle(rank == 0 ? Palette.signal : Palette.muted)
                }
            }
        }
    }

    /// How it went, in words: the title in the display face, one line under it.
    private var verdict: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(result.verdict.title)
                .font(.display(compact ? 24 : 32))
                .textCase(.uppercase)
                .foregroundStyle(result.grade == "S" || result.grade == "A" ? Palette.signal : Palette.text)
            Text(result.verdict.line)
                .font(.system(size: compact ? 14 : 15))
                .foregroundStyle(Palette.muted)
        }
    }

    /// The two numbers worth keeping: how clean, and the longest streak.
    private var chips: some View {
        HStack(spacing: 8) {
            chip("\(Int((result.accuracy * 100).rounded()))%", "accuracy", lit: result.grade == "S" || result.grade == "A")
            chip("×\(result.maxCombo)", compact ? "combo" : "best combo", lit: false)
            if result.wrong > 0 {
                chip("\(result.wrong)", compact ? "stray" : (result.wrong == 1 ? "stray key" : "stray keys"), lit: false, tint: Palette.bad)
            }
        }
    }

    private func chip(_ value: String, _ label: String, lit: Bool, tint: Color? = nil) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(value)
                .font(.display(compact ? 18 : 22))
                .monospacedDigit()
                .foregroundStyle(tint ?? (lit ? Palette.signal : Palette.text))
            Text(label)
                .dataLabel(9)
                .foregroundStyle(Palette.muted)
                .lineLimit(1)
        }
        .fixedSize()
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Capsule().fill(Palette.ground))
        .overlay(Capsule().strokeBorder(Palette.line, lineWidth: 1))
    }

    private var board: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Board · \(state.title)")
                .dataLabel(11)
                .foregroundStyle(Palette.muted)
            Leaderboard(scores: Array(state.board.prefix(5)), highlight: state.lastRun?.id, compact: compact)
        }
    }

    private var buttons: some View {
        HStack(spacing: 10) {
            PrimaryButton(title: "Play again", action: controls.again)
            QuietButton(title: "Set list", action: controls.leave)
        }
    }
}

/// The run as a strip of the song: a mark per onset where it fell in time, perfect in signal,
/// good in cue, a miss hollow; the stray keys as short red ticks under the line. One look says
/// where it went well and where it fell apart.
struct RunMap: View {
    let result: GameEngine.Result
    let compact: Bool

    var body: some View {
        let h: CGFloat = compact ? 44 : 56
        Canvas { ctx, size in
            let w = size.width
            let base = h - 12  // the strays' row sits under it
            // The song's line.
            var line = Path()
            line.move(to: CGPoint(x: 0, y: base))
            line.addLine(to: CGPoint(x: w, y: base))
            ctx.stroke(line, with: .color(Palette.line), lineWidth: 1)
            // Marks: as wide as the gaps allow, never under 2 pt, never over 10.
            let gap = result.map.count > 1 ? w / CGFloat(result.map.count) : w
            let mw = max(2, min(10, gap * 0.6))
            for m in result.map {
                let x = CGFloat(m.at) * w
                let tall: CGFloat = m.judgment == .perfect ? base - 2 : m.judgment == .good ? (base - 2) * 0.65 : (base - 2) * 0.35
                let r = CGRect(x: x - mw / 2, y: base - tall, width: mw, height: tall)
                let p = Path(roundedRect: r, cornerRadius: min(2, mw / 2))
                switch m.judgment {
                case .perfect: ctx.fill(p, with: .color(Palette.signal))
                case .good: ctx.fill(p, with: .color(Palette.cue))
                case .miss: ctx.stroke(p, with: .color(Palette.muted.opacity(0.7)), lineWidth: 1)
                }
            }
            for at in result.strays {
                let x = CGFloat(at) * w
                var tick = Path()
                tick.move(to: CGPoint(x: x, y: base + 3))
                tick.addLine(to: CGPoint(x: x, y: base + 10))
                ctx.stroke(tick, with: .color(Palette.bad), lineWidth: max(1.5, min(3, mw / 2)))
            }
        }
        .frame(height: h)
        .frame(maxWidth: .infinity)
        .accessibilityLabel("\(result.perfect) perfect, \(result.good) good, \(result.missed) missed, \(result.wrong) stray keys")
    }
}

/// The board: rank, score, grade, part and level, when. The run just played is lit.
struct Leaderboard: View {
    let scores: [ProgressStore.ScoreRecord]
    var highlight: String? = nil
    var compact = false

    var body: some View {
        VStack(spacing: 0) {
            if scores.isEmpty {
                Text("No runs yet. The first one goes on the board.")
                    .bodyText(14)
                    .foregroundStyle(Palette.muted)
                    .padding(.vertical, 8)
            }
            ForEach(Array(scores.enumerated()), id: \.element.id) { i, s in
                let mine = s.id == highlight
                HStack(spacing: compact ? 8 : 14) {
                    Text(String(format: "%02d", i + 1))
                        .dataLabel(11, weight: .semibold)
                        .foregroundStyle(mine ? Palette.signal : Palette.muted)
                        .frame(width: 24, alignment: .leading)
                    Text(s.grade)
                        .font(.display(compact ? 20 : 24))
                        .foregroundStyle(mine ? Palette.signal : Palette.text)
                        .frame(width: 22)
                    Text("\(s.score)")
                        .font(.display(compact ? 20 : 24))
                        .monospacedDigit()
                        .foregroundStyle(Palette.text)
                        .frame(width: compact ? 64 : 84, alignment: .trailing)
                    Text("\(s.part.capitalized) · \(s.difficulty.capitalized)\(s.difficulty == "adaptive" ? " → level \(s.level)" : "")")
                        .dataLabel(10)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 4)
                    Text("\(Int((s.accuracy * 100).rounded()))% · ×\(s.maxCombo)")
                        .dataLabel(10)
                        .foregroundStyle(Palette.muted)
                        .fixedSize()
                    if !compact {
                        Text(s.date.formatted(.dateTime.day().month(.abbreviated)))
                            .dataLabel(10)
                            .foregroundStyle(Palette.muted)
                            .frame(width: 52, alignment: .trailing)
                    }
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 8)
                .background(RoundedRectangle(cornerRadius: 6).fill(mine ? Palette.signal.opacity(0.12) : .clear))
            }
        }
    }
}
