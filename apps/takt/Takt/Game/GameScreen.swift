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
    /// Practice: nothing scores, the rail is a scrubber.
    var practice = false
    /// Call (Call.swift, inside practice): the words being said for the step waiting to be
    /// played, where it is in the line, the key just played wrong (until the right one), the end.
    struct CallState: Equatable {
        var phrase = ""
        var step = 0
        var count = 0
        var wrong: Int? = nil
        var done = false
    }
    var call: CallState? = nil
    /// The knob: the band at this fraction of the song's tempo (0.5...1), the band's tempo now,
    /// the one waiting for the downbeat, and the song's own (full speed).
    var speed = 1.0
    var tempo = 0
    var pendingTempo: Int? = nil
    var songTempo = 0
    /// Under full speed a run is practice: it goes on no board and clears no goal.
    var slowed: Bool { speed < 0.999 }
    var speedPercent: Int { Int((speed * 100).rounded()) }
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
    /// A Reading lesson (Player+Reading): the staff takes the highway's place.
    var reading: ReadingState? = nil

    var levelTitle: String { "Level \(level)" }
}

/// What the game screen's buttons do. One transport everywhere (2026-11-08, Bart: "make it so
/// basically the UI is the same everywhere, and I can always change tempo, scrub, pause etc,
/// but if I'm in a game, maybe that will invalidate my score"): play/pause, restart, the knob
/// and the rail are always there and always work; what changes is whether the run still
/// scores. Pausing keeps the score. Scrubbing the rail, four bars back and Practice turn the run
/// into practice (nothing scored from there, the run never finishes); the knob under full speed
/// plays to a result that goes on no board. Restart is a fresh run from the top at the knob's
/// speed, scored again when the knob is at full speed.
struct GameControls {
    var togglePlay: () -> Void = {}
    /// The song from the top at the knob's speed: a fresh run (Play again, Play the run, ⏮, Return).
    var restart: () -> Void = {}
    var leave: () -> Void = {}
    /// Where `leave` goes: the set list, or the map when a goal on the map started the song.
    var leaveTitle = "Set list"
    /// Hold here, nothing scored (the pause card's Practice this part, the result card's Practice).
    var practice: () -> Void = {}
    /// The rail, dragged to a bar: the band holds there; a run becomes practice.
    var scrub: (Int) -> Void = { _ in }
    /// Four bars back, held; a run becomes practice.
    var back: () -> Void = {}
    /// The knob, a run or practice alike: the band's tempo by so many bpm (±5).
    var tempo: (Int) -> Void = { _ in }
    /// Pause → Agent mode on this song, where the run sits.
    var agent: () -> Void = {}
    /// Call on and off: the next note called out, finger then key, the band held.
    var call: () -> Void = {}
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
            // The one transport (2026-11-08): the rail is always the scrubber, and under it the
            // same quiet row in a run as in practice. On the phone the row also holds the knob,
            // restart, play and the teacher (the HUD has no room for them); on the Mac the HUD has those.
            TransportRow(state: state, compact: compact)
                .padding(.horizontal, compact ? 16 : 24)
            ZStack {
                if let r = state.result {
                    GameResultPanel(state: state, result: r, compact: compact)
                        .padding(compact ? 16 : 32)
                } else if let reading = state.reading {
                    ReadingStage(state: state, reading: reading, compact: compact)
                        .padding(.horizontal, compact ? 16 : 24)
                        .padding(.top, compact ? 8 : 14)
                        .padding(.bottom, 8)
                    if let n = state.countIn {
                        CountInBadge(n: n, compact: compact)
                    }
                } else {
                    Highway(state: state, compact: compact)
                        .padding(.horizontal, compact ? 16 : 24)
                    if let n = state.countIn {
                        CountInBadge(n: n, compact: compact)
                    } else if !state.playing && state.heardTick > 0 && !state.practice {
                        PausedBadge(compact: compact)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(.easeOut(duration: 0.25), value: state.practice)
            Hairline()
            KeyboardStrip(low: state.keys.lowerBound, high: state.keys.upperBound, now: state.nowNotes, next: state.nextNotes,
                          pressed: state.pressedNotes, fingers: state.fingers, soft: state.reading?.soft ?? [:])
                .frame(height: compact ? 112 : 128)
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.vertical, compact ? 10 : 18)
        }
        .background(Palette.ground.ignoresSafeArea())
    }
}

/// The lessons' tempo knob on a song: half the song's tempo to the song's own, the arc muted
/// under full speed (the run is practice then). In the HUD on the Mac, by the rail or in the
/// practice row on the phone.
struct GameKnob: View {
    let state: GameState
    let compact: Bool
    @Environment(\.gameControls) private var controls

    var body: some View {
        let top = max(1, state.songTempo)
        TempoKnob(bpm: state.tempo, pending: state.pendingTempo, counts: top, compact: compact,
                  range: max(1, (top + 1) / 2)...top, nudge: controls.tempo)
    }
}

/// Back, the song and its section, the combo with its multiplier, the score, the knob (wide),
/// play.
struct GameHUD: View {
    let state: GameState
    let compact: Bool
    @Environment(\.gameControls) private var controls

    var body: some View {
        HStack(alignment: .center, spacing: compact ? 10 : 20) {
            TransportButton(symbol: "chevron.left", lit: false, size: compact ? 34 : 36, label: controls.leaveTitle == "Map" ? "Back to the map" : "Back to the stage", action: controls.leave)
            VStack(alignment: .leading, spacing: 2) {
                Text(state.title)
                    .font(.display(compact ? 24 : 30))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(state.reading?.subtitle ?? "\(state.partTitle) · \(state.difficulty == .adaptive ? (compact ? state.levelTitle : "Adaptive · \(state.levelTitle)") : state.difficulty.title)\(compact ? "" : " · \(state.section)")\(state.slowed && !state.practice ? " · \(state.speedPercent)% speed" : "")")
                    .dataLabel(compact ? 10 : 12)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 8)
            if let c = state.call {
                // Calling: the words being said, big, where the score was.
                VStack(alignment: .trailing, spacing: 2) {
                    Text(c.done ? "Done" : c.phrase)
                        .font(.display(compact ? 22 : 28))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.signal)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .contentTransition(.identity)
                    Text(c.wrong != nil ? (compact ? "Not that one" : "Not that one · \(c.step) of \(c.count)")
                         : "Call · \(c.step) of \(c.count)\(compact ? "" : " · nothing scored")")
                        .dataLabel(10)
                        .foregroundStyle(c.wrong != nil ? Palette.text : Palette.muted)
                        .lineLimit(1)
                }
                .frame(minWidth: compact ? 70 : 110, alignment: .trailing)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(c.done ? "Done" : "Call: \(c.phrase), \(c.step) of \(c.count)")
            } else if let r = state.reading {
                ReadingMeter(reading: r, compact: compact)
            } else if state.practice {
                // No score to chase: the word, and the speed.
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Practice")
                        .font(.display(compact ? 22 : 28))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.signal)
                    // The phone has room for the speed only when it says something (under full speed).
                    Text(compact ? (state.slowed ? "\(state.speedPercent)% · nothing scored" : "Nothing scored") : "\(state.speedPercent)% speed · nothing scored")
                        .dataLabel(10)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                }
                .frame(minWidth: compact ? 70 : 110, alignment: .trailing)
            } else {
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
            }
            if !compact {
                GameKnob(state: state, compact: false)
                RestartButton(size: 36)
                TransportButton(symbol: state.playing ? "pause.fill" : "play.fill", lit: state.playing, size: 36,
                                label: state.playing ? "Pause" : state.practice ? "Play from here" : "Play", action: controls.togglePlay)
                if state.reading != nil { CheatToggle(compact: false) }
                AskButton(size: 36)
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

/// The song as a rail with its sections, filled to where it is (the plain rail; since
/// 2026-11-08 the screen draws `Scrubber`, which is this with a knob and a drag).
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
/// in beats; the hit line is `signal` at the bottom. A hit note pops ("PERFECT") and stays:
/// its capsule turns to a wash of itself and the line eats it as it slides, so what is left
/// above the line is how long to keep holding; the key down keeps the outline crisp, let go
/// early and the wash fades on its own (0.1 (68)). A missed one slides on past the line and fades.
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
                        // Right, keep holding: the remaining length drains into the line.
                        let held = state.pressedNotes.contains(n.note)
                        let tail = CGRect(x: x - w / 2, y: top, width: w, height: bottom - top)
                        guard tail.maxY > 0, tail.minY < h - 2, tail.height >= 2 else { continue }
                        var c = ctx
                        c.clip(to: Path(CGRect(x: 0, y: 0, width: size.width, height: h - 2)))
                        let shape = Path(roundedRect: tail, cornerRadius: min(5, w / 2))
                        c.fill(shape, with: .color(Palette.cue.opacity(held ? 0.38 : 0.16)))
                        if held { c.stroke(shape, with: .color(Palette.cue.opacity(0.9)), lineWidth: 1.5) }
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

/// "PERFECT", "GOOD", "EARLY", "LATE" or "MISS" by the hit line: springs in, fades out.
struct HitPop: View {
    let pop: GameEngine.Pop
    let compact: Bool
    @State private var shown = false

    var body: some View {
        let color: Color = switch pop.judgment {
        case .perfect: Palette.signal
        case .good: Palette.cue
        case .early, .late: Palette.cue.opacity(0.6)
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
    @Environment(\.ask) private var ask

    var body: some View {
        VStack(spacing: 12) {
            Text("Paused")
                .font(.display(compact ? 40 : 56))
                .textCase(.uppercase)
                .foregroundStyle(Palette.text)
            PrimaryButton(title: "Keep going", action: controls.togglePlay)
            // From the top, a fresh run (the score starts over).
            Button(action: controls.restart) {
                Text("Restart")
                    .dataLabel(12, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.plain)
            // The quiet way out of a hard part: practice it, slower, from a few bars back.
            Button(action: controls.practice) {
                Text("Practice this part")
                    .dataLabel(12, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.plain)
            // Or ask about it: the teacher knows the bar you stopped in.
            Button(action: ask.open) {
                Text("Ask the teacher")
                    .dataLabel(12, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                    .padding(.vertical, 2)
            }
            .buttonStyle(.plain)
            // Or change the part itself: the agent makes your own version of the track.
            Button(action: controls.agent) {
                Text("Agent mode")
                    .dataLabel(12, weight: .semibold)
                    .foregroundStyle(Palette.signal)
                    .padding(.vertical, 2)
            }
            .buttonStyle(.plain)
        }
        .padding(28)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
    }
}

/// The transport, in a run and in practice alike (2026-11-08): the rail as a scrubber (drag to
/// any bar; the band holds there and the run is practice from then on), then one quiet row: the
/// bar and its section, four bars back, Call, and on the phone the knob, restart, play and the
/// teacher. Nothing in it is big: the highway stays the screen.
struct TransportRow: View {
    let state: GameState
    let compact: Bool
    @Environment(\.gameControls) private var controls

    var body: some View {
        VStack(spacing: compact ? 6 : 8) {
            Scrubber(state: state)
                .frame(height: 18)
            HStack(spacing: compact ? 6 : 10) {
                Text(state.countIn.map { "Count-in \($0)" } ?? "Bar \(state.bar + 1)\(compact ? "" : " · \(state.section)")")
                    .dataLabel(10)
                    .foregroundStyle(state.countIn == nil ? Palette.muted : Palette.signal)
                    .lineLimit(1)
                    .frame(minWidth: compact ? 44 : 150, alignment: .leading)
                Spacer(minLength: 4)
                if compact { GameKnob(state: state, compact: true) }
                SmallButton(symbol: "gobackward", label: "Four bars back", action: controls.back)
                if compact {
                    RestartButton(size: 28)
                    SmallButton(symbol: state.playing ? "pause.fill" : "play.fill", lit: state.playing,
                                label: state.playing ? "Pause" : state.practice ? "Play from here" : "Play", action: controls.togglePlay)
                }
                // Call: the next note called out, finger then key, until it is played; lit while on.
                if state.result == nil {
                    Button(action: controls.call) {
                        Text("Call")
                            .dataLabel(10, weight: .semibold)
                            .foregroundStyle(state.call != nil ? Palette.ground : Palette.text)
                            .padding(.horizontal, 10)
                            .frame(height: 28)
                            .background(RoundedRectangle(cornerRadius: 6).fill(state.call != nil ? Palette.signal : Palette.panel))
                            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(state.call != nil ? Palette.signal : Palette.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(state.call != nil ? "Stop calling the notes" : "Call the notes: the next one spoken, finger then key")
                }
                // The phone's HUD has no room for the teacher (or the cheat sheet): they sit here.
                if compact, state.reading != nil { CheatToggle(compact: true).scaleEffect(28 / 34) }
                if compact { AskButton(size: 28) }
            }
        }
        .padding(.top, 2)
    }
}

/// ⏮: the piece from the top, a fresh run at the knob's speed. The same button on the Stage and
/// in a lesson (Return on the Mac's keyboard).
struct RestartButton: View {
    let size: CGFloat
    @Environment(\.gameControls) private var controls

    var body: some View {
        TransportButton(symbol: "backward.end.fill", lit: false, size: size, label: "Restart from the top", action: controls.restart)
    }
}

/// A 28 pt transport button for the practice row.
struct SmallButton: View {
    let symbol: String
    var lit = false
    let label: String
    var action: () -> Void

    var body: some View {
        TransportButton(symbol: symbol, lit: lit, size: 28, label: label, action: action)
    }
}

/// The rail as a scrubber, in a run and in practice: the played part in `signal`, the sections
/// marked, a knob where the run sits. Drag anywhere along it to hold the band at that bar (a
/// run is practice from then on: nothing scored).
struct Scrubber: View {
    let state: GameState
    @Environment(\.gameControls) private var controls

    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            let x = w * CGFloat(state.progress)
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.line).frame(height: 6)
                Capsule().fill(Palette.signal).frame(width: max(0, x), height: 6)
                ForEach(state.sections.dropFirst(), id: \.bar) { s in
                    Rectangle()
                        .fill(Palette.ground)
                        .frame(width: 2, height: 6)
                        .offset(x: w * CGFloat(s.bar) / CGFloat(max(1, state.bars)) - 1)
                }
                Circle()
                    .fill(Palette.signal)
                    .frame(width: 16, height: 16)
                    .overlay(Circle().strokeBorder(Palette.ground, lineWidth: 2))
                    .offset(x: min(w - 16, max(0, x - 8)))
            }
            .frame(maxHeight: .infinity, alignment: .center)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { v in
                let bar = Int((v.location.x / max(1, w) * CGFloat(state.bars)).rounded(.down))
                controls.scrub(max(0, min(state.bars - 1, bar)))
            })
        }
        .accessibilityElement()
        .accessibilityLabel("Bar \(state.bar + 1) of \(state.bars)")
        .accessibilityHint(state.practice ? "Drag to another bar" : "Drag to another bar; the run becomes practice")
    }
}

/// The run's result in the highway's place: the grade and the accuracy, the verdict, the board.
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
            // The song's name is in the HUD above; the card says the part and level once.
            VStack(alignment: .leading, spacing: compact ? 8 : 10) {
                Text("\(state.partTitle) · \(state.difficulty.title)\(state.difficulty == .adaptive ? " · reached level \(result.level) of \(state.tiers)" : "")")
                    .dataLabel(11)
                    .foregroundStyle(Palette.muted)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(Int((result.accuracy * 100).rounded()))%")
                        .font(.display(compact ? 44 : 60))
                        .monospacedDigit()
                        .foregroundStyle(result.grade == "S" || result.grade == "A" ? Palette.signal : Palette.text)
                    Text("accuracy")
                        .dataLabel(12)
                        .foregroundStyle(Palette.muted)
                }
                if state.slowed {
                    // The knob was under full speed: practice, however it went.
                    Text("At \(state.speedPercent)% speed · practice, not on the board")
                        .dataLabel(11, weight: .semibold)
                        .foregroundStyle(Palette.muted)
                } else if let rank {
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

    /// Under the verdict, small: the points (the board ranks by them), the longest streak,
    /// and, when there were any, the stray keys and the right keys early or late (the grade
    /// counts those as played; the chip says where the points went). Accuracy is the headline
    /// number. Narrow, the faults take a second row.
    private var chips: some View {
        let faults = result.wrong + result.early + result.late
        let scores = HStack(spacing: 8) {
            chip(result.score.formatted(.number.grouping(.automatic)), "points", lit: false)
            chip("×\(result.maxCombo)", compact ? "combo" : "best combo", lit: false)
        }
        let leaks = HStack(spacing: 8) {
            if result.wrong > 0 {
                chip("\(result.wrong)", compact ? "stray" : (result.wrong == 1 ? "stray key" : "stray keys"), lit: false, tint: Palette.bad)
            }
            if result.early > 0 { chip("\(result.early)", "early", lit: false) }
            if result.late > 0 { chip("\(result.late)", "late", lit: false) }
        }
        return Group {
            if compact {
                VStack(alignment: .leading, spacing: 8) {
                    scores
                    if faults > 0 { leaks }
                }
            } else {
                HStack(spacing: 8) {
                    scores
                    if faults > 0 { leaks }
                }
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

    /// Play again, Practice (the song held at bar 1 with the scrubber: the way to work on what
    /// the grade says, from the map as from the set list), and the way back.
    private var buttons: some View {
        HStack(spacing: 10) {
            PrimaryButton(title: "Play again", action: controls.restart)
            QuietButton(title: "Practice", action: controls.practice)
            QuietButton(title: controls.leaveTitle, action: controls.leave)
        }
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
