import Foundation

/// Stage: one run of a song's part. Pure, main thread, like the LessonEngine: the Player feeds
/// it the heard transport tick every frame and every key press, it judges each chart note
/// against the press nearest it (Perfect inside ±45 ms, Good inside ±150 ms, Early or Late
/// inside half a beat, Missed when that passes), keeps the score, the combo and the
/// multiplier, and on Adaptive moves a tier up or down the part's ladder between blocks
/// (`Charting`, charting.json). There is no failing: the song plays to the end.
final class GameEngine {
    enum Difficulty: String, CaseIterable, Codable {
        case beginner, easy, easyPlus = "easy+", medium, hard, adaptive
        /// Solo (0.1 (114)): not a rung but another line, the improv teacher's whole track
        /// written from the player's take (`ModStore.solo(of:)`), every note of it; the chip
        /// appears on a song's card once the player has one, after Adaptive.
        case solo

        /// Easy+ (0.1 (109)): a rung between Easy and Medium, for a song whose Medium grew
        /// (Blue Lantern II's riff moved here when its Medium took on the hand moves).
        var title: String { self == .easyPlus ? "Easy+" : rawValue.capitalized }

        /// The rungs of a ladder, in order, and Adaptive: what every song's card shows.
        static var ladder: [Difficulty] { allCases.filter { $0 != .solo } }
    }

    enum Judgment: String, Equatable, Codable {
        case perfect, good, early, late, miss
        var title: String {
            switch self {
            case .perfect: "Perfect"
            case .good: "Good"
            case .early: "Early"
            case .late: "Late"
            case .miss: "Miss"
            }
        }
        /// The right key out of the Good window: played, not in time.
        var loose: Bool { self == .early || self == .late }
        /// Worst last: a chord's mark is its worst note's.
        var rank: Int {
            switch self {
            case .perfect: 0
            case .good: 1
            case .early, .late: 2
            case .miss: 3
            }
        }
    }

    enum Status: Equatable {
        case pending
        case hit(Judgment)
        case missed
    }

    /// The last judgment, for the pop at the hit line: `seq` counts so the same one twice
    /// still pops.
    struct Pop: Equatable {
        let judgment: Judgment
        let note: Int
        let seq: Int
    }

    struct Result: Equatable, Codable {
        let song: String
        let part: String
        let difficulty: String
        let score: Int
        let notes: Int
        let perfect: Int
        let good: Int
        /// The right key past the Good window but inside half a beat, before the note and
        /// after it: played, out of time.
        let early: Int
        let late: Int
        let missed: Int
        let extras: Int
        /// Extras that aren't the record's own notes: wrong keys.
        let wrong: Int
        let maxCombo: Int
        /// Notes played (perfect, good, early or late) over the chart's notes plus the wrong
        /// keys, 0...1: a note that went by costs, a wrong key costs, the right key inside half
        /// a beat pays. The grade follows it: a letter says how much of the tune you played.
        let accuracy: Double
        /// Notes inside the Good window over the same, 0...1: how much of it was in time. The
        /// points say the rest; an S wants this too.
        let timing: Double
        /// The mean offset of the notes played, ms, negative early. A steady lean is the
        /// setup's latency, not the hand: the verdict sends it to the calibration.
        let leanMs: Double
        /// The highest tier played (adaptive), or the difficulty's.
        let level: Int
        let grade: String
        /// The run as a map: every judged onset at its place in the song (0...1), and how it
        /// went, for the result screen's strip.
        let map: [Mark]
        /// Where the wrong keys fell (0...1).
        let strays: [Double]

        struct Mark: Equatable, Codable {
            let at: Double
            let judgment: Judgment
        }

        /// The letter from the accuracy; an S ("every note where it belongs") wants the timing
        /// as clean, else it is an A.
        static func grade(accuracy: Double, timing: Double = 1) -> String {
            accuracy >= 0.97 ? (timing >= 0.97 ? "S" : "A") : accuracy >= 0.9 ? "A" : accuracy >= 0.8 ? "B" : accuracy >= 0.65 ? "C" : "D"
        }

        /// The accuracy a grade starts at (an A: 0.9), so "an A or better" is one comparison.
        static func floor(of grade: String) -> Double? {
            ["S": 0.97, "A": 0.9, "B": 0.8, "C": 0.65, "D": 0][grade]
        }

        /// A run whose notes lean this far one way on average is early or late by the setup
        /// (the speakers, the keyboard), not by the hand; from this many notes it is a lean,
        /// not a few rushed ones.
        static let leanMs = 60.0
        static let leanNotes = 8

        /// The one line the result leads with, and the one under it: the line names what
        /// weighed most, a lean, the right keys out of time, stray keys, or notes that went by.
        var verdict: (title: String, line: String) {
            let title: String
            switch grade {
            case "S": title = "Clean run"
            case "A": title = "Tight"
            case "B": title = "Solid"
            case "C": title = "Getting there"
            default: title = "Rough one"
            }
            if grade == "S" { return (title, "Every note where it belongs.") }
            let played = perfect + good + early + late
            if played >= Self.leanNotes, abs(leanMs) >= Self.leanMs {
                return (title, "Your notes lean \(Int(abs(leanMs).rounded())) ms \(leanMs < 0 ? "early" : "late") all run. That's latency, not you: Settings → Calibration.")
            }
            let loose = early + late
            if loose > 0, loose >= missed, loose >= wrong {
                if early >= loose * 4 / 5 { return (title, "Right keys, \(early) of them early. Sit back on the beat.") }
                if late >= loose * 4 / 5 { return (title, "Right keys, \(late) of them late. Lean into the beat.") }
                return (title, "Right keys, loose time: \(early) early, \(late) late.")
            }
            switch grade {
            case "A": return (title, "A couple got away. Nothing to see.")
            case "B": return (title, "The tune is in your hands.")
            case "C": return (title, wrong > missed ? "A few stray keys crept in." : "Let the notes come to you.")
            default: return (title, wrong > missed ? "Stray keys everywhere. Keep to the lit lanes." : "Most of the notes went by. Breathe, and play less.")
            }
        }
    }

    static let perfectMs = 45.0
    static let goodMs = 150.0
    /// The right key past the Good window still plays its note inside this much of a beat
    /// either side (the lesson scorer's own reach): Early or Late, a hit for the accuracy, a
    /// third of the points. Past it the note went by. Half a beat is 357 ms at Blue Lantern's
    /// 84, 236 at Hypnotist's 127: a hand that rushes the and-of-three onto the three is still
    /// playing the tune. Bart's 55% on a run he played well but for three or four notes, 0.1 (108).
    static let looseBeats = 0.5
    /// Points for a hit, before the multiplier and the level.
    static let points: [Judgment: Int] = [.perfect: 100, .good: 60, .early: 30, .late: 30, .miss: 0]
    /// Combo thresholds for ×2, ×3, ×4.
    static let steps = [8, 16, 32]

    let song: Song
    let part: Song.PartKey
    let difficulty: Difficulty
    let ticksPerBeat: Int
    let ticksPerBar: Int
    let charting: Charting
    /// The whole part in time order, and which notes play at each tier (`[tier - 1][i]`).
    let notes: [Song.Note]
    let masks: [[Bool]]
    /// A melody's fingers, per tier (`[tier - 1][i]`, nil off the tier): the tier's own line
    /// fingered by hand position (`Fingering`), since the file's fingers go by pitch over the
    /// whole record. The chords part keeps its hand-set voicings.
    let fingers: [[Int?]]
    private(set) var status: [Status]
    /// The tier of each block, decided `ahead` bars before the block starts.
    private(set) var blockLevel: [Int]
    private(set) var score = 0
    private(set) var combo = 0
    private(set) var maxCombo = 0
    private(set) var perfect = 0
    private(set) var good = 0
    private(set) var early = 0
    private(set) var late = 0
    private(set) var missed = 0
    private(set) var extras = 0
    private(set) var wrong = 0
    private var wrongTicks: [Double] = []
    /// The signed offsets (ms) of the notes played, summed: the lean.
    private var offsetSum = 0.0
    private(set) var pop: Pop?
    private(set) var finished = false
    private var seq = 0
    private var heardTick = -Double.infinity
    private var checked = -Double.infinity
    /// Hits and misses per bar, for the adaptive decision; a wrong key is a miss. The offsets
    /// (ms, unsigned) of the hits per bar are the spread.
    private var barHits: [Int: Int] = [:]
    private var barMisses: [Int: Int] = [:]
    private var barOffsets: [Int: [Double]] = [:]
    /// Misses (and wrong keys) in a row, now; and the longest run that ended in each bar.
    private(set) var missRun = 0
    private var barMissRun: [Int: Int] = [:]
    /// Blocks still to hold after the last climb or drop.
    private var cooldown = 0
    /// The tier the run started on: it never sinks more than `floorBelowStart` under it.
    private let startLevel: Int
    /// Every tier change, for the log and the checks: the block it took effect, from, to, the
    /// window's hit rate and its spread.
    private(set) var changes: [(block: Int, from: Int, to: Int, rate: Double, spreadMs: Double)] = []

    /// Practice (the Stage's pause menu, 0.1 (61)): notes still judge and pop at the hit line
    /// and the band still fills what the level leaves out, but nothing scores, the combo and
    /// the counts hold, nothing adapts, the run never finishes and nothing goes on the board.
    var practice = false

    /// Practice moves the run to `tick` (a scrub, four bars back): every note from there on is
    /// pending again, whatever happened to it; what came before keeps its judgment.
    func seek(to tick: Double) {
        for i in notes.indices where Double(notes[i].t) >= tick { status[i] = .pending }
        heardTick = tick
        checked = tick
        pop = nil
    }

    /// Call (Call.swift): note `i` played where the voice asked for it, no timing judged: a hit
    /// that scores nothing and doesn't pop, so the highway shows the line as played.
    func called(_ i: Int) {
        guard notes.indices.contains(i) else { return }
        status[i] = .hit(.perfect)
    }

    /// `start`: the tier an adaptive run starts on (`adaptiveStart`; the ladder's start if nil).
    /// The charting is the song's own (a mod's override on the bundle's) unless one is given.
    init(song: Song, part: Song.PartKey, difficulty: Difficulty, start: Int? = nil, charting: Charting? = nil) {
        self.song = song
        self.part = part
        self.difficulty = difficulty
        let charting = charting ?? song.charting
        self.charting = charting
        ticksPerBeat = song.band.ticksPerBeat
        ticksPerBar = song.ticksPerBar
        let notes = song.notes(part)
        // A Reading line is played as written: one tier, every note, its own fingers.
        let masks = song.exact ? [notes.map { _ in true }] : song.masks(part, charting: charting)
        self.notes = notes
        self.masks = masks
        fingers = song.exact ? [notes.map(\.f)] : part == .melody ? masks.map { m in
            let on = notes.indices.filter { m[$0] }
            let f = Fingering.plan(on.map { notes[$0] }, ticksPerBeat: song.band.ticksPerBeat)
            var row = [Int?](repeating: nil, count: notes.count)
            for (k, i) in on.enumerated() { row[i] = f[k] }
            return row
        } : masks.map { _ in notes.map { $0.f } }
        status = Array(repeating: .pending, count: notes.count)
        let window = charting.adaptive.window
        let blocks = (song.band.bars + window - 1) / window + 1
        let first = song.exact ? 1 : charting.tier(difficulty, song: song.name, part: part) ?? start ?? charting.adaptive.start
        startLevel = max(1, min(masks.count, first))
        blockLevel = Array(repeating: startLevel, count: blocks)
    }

    /// Where an adaptive run starts: `resume` tiers under the top of the last adaptive run of
    /// this song and part, so a player who got to level 5 doesn't sit through level 1 again.
    static func adaptiveStart(song: String, part: Song.PartKey, records: [ProgressStore.ScoreRecord],
                              charting: Charting = .bundled) -> Int {
        let a = charting.adaptive
        guard let last = records.filter({ $0.song == song && $0.part == part.rawValue && $0.difficulty == Difficulty.adaptive.rawValue })
            .max(by: { $0.date < $1.date }) else { return a.start }
        return max(a.start, min(charting.ladder(part).tiers.count, last.level - a.resume))
    }

    var endTick: Int { song.endTick }
    /// The ladder's height.
    var tiers: Int { masks.count }

    func level(atBar bar: Int) -> Int {
        let b = max(0, bar) / charting.adaptive.window
        return b < blockLevel.count ? blockLevel[b] : blockLevel.last ?? 1
    }

    /// The bar being heard (0 before the song starts).
    var heardBar: Int { heardTick.isFinite ? max(0, Int((heardTick / Double(ticksPerBar)).rounded(.down))) : 0 }

    /// The level now (the bar being heard).
    var level: Int { level(atBar: heardBar) }

    /// The highest level played so far.
    var topLevel: Int { (0...heardBar).map { level(atBar: $0) }.max() ?? 1 }

    var multiplier: Int { 1 + Self.steps.filter { combo >= $0 }.count }

    /// Points for a hit at the tier being played: the multiplier, and the tier's bonus.
    func points(_ j: Judgment, multiplier: Int, level: Int) -> Int {
        Int((Double(Self.points[j]! * multiplier) * charting.ladder(part).tier(level).bonus).rounded())
    }

    /// Whether note `i` plays at the tier of its bar.
    func active(_ i: Int) -> Bool { masks[level(atBar: notes[i].t / ticksPerBar) - 1][i] }

    /// The finger on note `i` at the tier of its bar (the file's own when the tier has none).
    func finger(_ i: Int) -> Int? { fingers[level(atBar: notes[i].t / ticksPerBar) - 1][i] ?? notes[i].f }

    /// The record fills what the level leaves out: the part's notes in `bar` that don't play at
    /// its tier, for the Player to schedule on the part's instrument. Decided once the bar's
    /// block is (`ahead` bars before it starts).
    func fill(bar: Int) -> [Song.Note] {
        notes.indices.filter { notes[$0].t / ticksPerBar == bar && !active($0) }.map { notes[$0] }
    }

    func isHit(_ i: Int) -> Bool {
        if case .hit = status[i] { return true }
        return false
    }

    /// Notes played, in time or not.
    var hits: Int { perfect + good + early + late }

    /// Notes played over the notes judged plus the wrong keys: a note that went by costs, a
    /// wrong key costs, the right key inside half a beat pays.
    var accuracy: Double {
        let judged = hits + missed + wrong
        return judged == 0 ? 1 : Double(hits) / Double(judged)
    }

    /// Notes inside the Good window over the same.
    var timing: Double {
        let judged = hits + missed + wrong
        return judged == 0 ? 1 : Double(perfect + good) / Double(judged)
    }

    /// The mean offset of the notes played, ms, negative early.
    var leanMs: Double { hits == 0 ? 0 : offsetSum / Double(hits) }

    /// How far past its tick a note can still be played, in ticks: half a beat, and never less
    /// than the Good window (a tempo where half a beat is under 150 ms).
    func loose(msPerTick: Double) -> Double { max(Self.goodMs / msPerTick, Self.looseBeats * Double(ticksPerBeat)) }

    /// The heard transport tick, every frame: notes whose window has passed are missed, the
    /// next block's tier is decided ahead, and the song ends at its end tick.
    func heard(tick: Double, msPerTick: Double) {
        heardTick = tick
        guard msPerTick.isFinite, msPerTick > 0 else { return }
        let reach = loose(msPerTick: msPerTick)
        if practice {
            // A pass-by still shows (the note slides past, the pop says miss); no counts move.
            for i in notes.indices where status[i] == .pending && active(i) {
                let deadline = Double(notes[i].t) + reach
                guard deadline > checked, deadline <= tick else { continue }
                status[i] = .missed
                seq += 1
                pop = Pop(judgment: .miss, note: notes[i].n, seq: seq)
            }
            checked = max(checked, tick)
            return
        }
        for i in notes.indices where status[i] == .pending && active(i) {
            let deadline = Double(notes[i].t) + reach
            guard deadline > checked, deadline <= tick else { continue }
            status[i] = .missed
            missed += 1
            missRun += 1
            barMissRun[notes[i].t / ticksPerBar] = max(barMissRun[notes[i].t / ticksPerBar] ?? 0, missRun)
            // A chord with one finger dropped is a miss for that note, but it breaks the combo
            // only when the whole chord went by unplayed: a 30-combo shouldn't go on one finger.
            let chordHit = notes.indices.contains { $0 != i && notes[$0].t == notes[i].t && active($0) && isHit($0) }
            if !chordHit { combo = 0 }
            barMisses[notes[i].t / ticksPerBar, default: 0] += 1
            seq += 1
            pop = Pop(judgment: .miss, note: notes[i].n, seq: seq)
        }
        checked = max(checked, tick)
        if difficulty == .adaptive { adapt(tick: tick) }
        if !finished, tick >= Double(endTick) { finished = true }
    }

    /// `ahead` bars before a block starts, its tier is set from the `window` bars before that:
    /// at or above `climb` hit rate (with `judged` notes at least, and the hits not scattered past
    /// `spreadMaxMs`) a tier up, under `ease` (or after `missRun` misses in a row) one down, one
    /// tier at a time. A change is followed by `afterClimb` / `afterDrop` blocks of holding, so
    /// the player meets a new tier for a whole phrase and a drop has room to recover: no
    /// ping-pong. The run never sinks under `floorBelowStart` tiers below where it began.
    private func adapt(tick: Double) {
        let a = charting.adaptive
        let bar = Int((tick / Double(ticksPerBar)).rounded(.down))
        // Block k is decided when bar k·window − ahead is reached, from the window before it.
        let k = (bar + a.ahead) / a.window
        guard k >= 1, k < blockLevel.count, !decided.contains(k) else { return }
        decided.insert(k)
        // Two windows. Drops read the last `window` bars (reaching back up to twice that for
        // `judged` notes, so a sparse level at a slow tempo is judged on enough notes to mean
        // something); climbs read up to twice the window, the bars at this tier only. Falling
        // apart shows in a phrase, being ready for more takes a whole phrase at the tier:
        // Rocksmith's complaint was levelling up too soon.
        let to = k * a.window - a.ahead
        struct Window {
            var hits = 0, misses = 0, longestRun = 0
            var offsets: [Double] = []
            var judged: Int { hits + misses }
            var rate: Double { judged > 0 ? Double(hits) / Double(judged) : 1 }
            var spread: Double { let s = offsets.sorted(); return s.isEmpty ? 0 : s[s.count / 2] }
        }
        func window(_ from: Int, _ to: Int) -> Window {
            var w = Window()
            for b in from..<to where b >= 0 {
                w.hits += barHits[b] ?? 0
                w.misses += barMisses[b] ?? 0
                w.offsets += barOffsets[b] ?? []
                w.longestRun = max(w.longestRun, barMissRun[b] ?? 0)
            }
            return w
        }
        var from = to - a.window
        var short = window(from, to)
        while short.judged < a.judged, from > max(0, to - 2 * a.window) { from -= 1; short = window(from, to) }
        let current = blockLevel[k - 1]
        // The climb's evidence comes from bars played at this tier only (a window that is
        // mostly the easier tier before a climb says nothing about the new one), at least a
        // whole phrase of them.
        let atTier = ((to - 2 * a.window)..<to).filter { $0 >= 0 && self.level(atBar: $0) == current }
        var long = Window()
        for b in atTier { let w = window(b, b + 1); long.hits += w.hits; long.misses += w.misses; long.offsets += w.offsets }
        var level = current
        let floor = max(1, startLevel - a.floorBelowStart)
        // A cooldown holds climbs only: a player who falls apart right after a climb (or a
        // drop) goes down at once, not after the hold.
        let held = cooldown > 0
        if held { cooldown -= 1 }
        var rate = short.rate, spread = short.spread
        if short.judged >= a.judged, short.rate < a.ease || (a.missRun.map { short.longestRun >= $0 } ?? false) {
            level = max(floor, distinct(from: current, up: false))
            if level != current { cooldown = a.afterDrop }
        } else if !held, atTier.count >= a.window, long.judged >= a.judged, long.rate >= a.climb,
                  long.spread <= (a.spreadMaxMs ?? .infinity) {
            level = distinct(from: current, up: true)
            if level != current { cooldown = a.afterClimb }
            rate = long.rate
            spread = long.spread
        }
        if level != current { changes.append((k, current, level, rate, spread)) }
        for b in k..<blockLevel.count { blockLevel[b] = level }
    }
    private var decided: Set<Int> = []

    /// The next tier up (or down) whose chart differs from `tier`'s: a thin part can cut the same
    /// notes on two or three tiers, and a climb that changes nothing teaches nothing. The ends of
    /// the ladder when nothing differs.
    func distinct(from tier: Int, up: Bool) -> Int {
        var t = tier
        while up ? t < tiers : t > 1 {
            t += up ? 1 : -1
            if masks[t - 1] != masks[tier - 1] { return t }
        }
        return t
    }

    /// A key press at a transport tick: a pending note of its pitch class takes it, the one
    /// inside the Good window (the exact key first, then the nearest) or else the earliest
    /// inside half a beat, so a hand running late pays each note it meant and never the one
    /// after it; anything else is an extra.
    func played(note: Int, tick: Double, msPerTick: Double) {
        guard !finished, msPerTick.isFinite, msPerTick > 0 else { return }
        let reach = Self.goodMs / msPerTick
        let outer = loose(msPerTick: msPerTick)
        var best: (i: Int, d: Double, exact: Bool, near: Bool)?
        for i in notes.indices where status[i] == .pending && active(i) && notes[i].n % 12 == note % 12 {
            let d = tick - Double(notes[i].t)
            guard abs(d) <= outer else { continue }
            let exact = notes[i].n == note
            let near = abs(d) <= reach
            guard let b = best else { best = (i, d, exact, near); continue }
            let better: Bool
            if near != b.near { better = near }
            else if near { better = (exact && !b.exact) || (exact == b.exact && abs(d) < abs(b.d)) }
            else { better = notes[i].t < notes[b.i].t || (notes[i].t == notes[b.i].t && exact && !b.exact) }
            if better { best = (i, d, exact, near) }
        }
        guard let b = best else {
            if practice { return }
            extras += 1
            // A wrong key is one the tune has nowhere within a beat of here (at any tier): the
            // right key further off than half a beat is a miss, not a wrong key, and the
            // record's own notes the level left out are neither.
            if !notes.contains(where: { abs(tick - Double($0.t)) <= Double(ticksPerBeat) && $0.n % 12 == note % 12 }) {
                wrong += 1
                wrongTicks.append(tick)
            }
            // A key the record doesn't play here counts against the level; its own notes the
            // level left out don't.
            let bar = Int((tick / Double(ticksPerBar)).rounded(.down))
            if !notes.contains(where: { abs(tick - Double($0.t)) <= reach && $0.n % 12 == note % 12 }) {
                barMisses[bar, default: 0] += 1
                missRun += 1
                barMissRun[bar] = max(barMissRun[bar] ?? 0, missRun)
            }
            return
        }
        let ms = b.d * msPerTick
        let j: Judgment = abs(ms) <= Self.perfectMs ? .perfect : abs(ms) <= Self.goodMs ? .good : ms < 0 ? .early : .late
        status[b.i] = .hit(j)
        if practice {
            seq += 1
            pop = Pop(judgment: j, note: notes[b.i].n, seq: seq)
            return
        }
        switch j {
        case .perfect: perfect += 1
        case .good: good += 1
        case .early: early += 1
        case .late: late += 1
        case .miss: break
        }
        offsetSum += ms
        combo += 1
        missRun = 0
        maxCombo = max(maxCombo, combo)
        barHits[notes[b.i].t / ticksPerBar, default: 0] += 1
        barOffsets[notes[b.i].t / ticksPerBar, default: []].append(abs(ms))
        score += points(j, multiplier: multiplier, level: level(atBar: notes[b.i].t / ticksPerBar))
        seq += 1
        pop = Pop(judgment: j, note: notes[b.i].n, seq: seq)
    }

    func result() -> Result {
        // The map: one mark an onset (a chord is one mark, its worst note), judged ones only.
        let end = Double(song.endTick)
        var map: [Result.Mark] = []
        var lastT = -1
        for i in notes.indices where active(i) {
            let j: Judgment?
            switch status[i] {
            case .hit(let h): j = h
            case .missed: j = .miss
            case .pending: j = nil
            }
            guard let j else { continue }
            if notes[i].t == lastT, let last = map.last {
                let worst = j.rank > last.judgment.rank ? j : last.judgment
                map[map.count - 1] = Result.Mark(at: last.at, judgment: worst)
            } else {
                map.append(Result.Mark(at: Double(notes[i].t) / end, judgment: j))
                lastT = notes[i].t
            }
        }
        return Result(song: song.name, part: part.rawValue, difficulty: difficulty.rawValue, score: score,
                      notes: hits + missed, perfect: perfect, good: good, early: early, late: late, missed: missed,
                      extras: extras, wrong: wrong, maxCombo: maxCombo, accuracy: accuracy, timing: timing, leanMs: leanMs,
                      level: difficulty == .adaptive ? topLevel : blockLevel[0],
                      grade: Result.grade(accuracy: accuracy, timing: timing), map: map, strays: wrongTicks.map { min(1, max(0, $0 / end)) })
    }

    /// Tap mode: the keys a tap at `tick` plays, the whole pending chord nearest it that can
    /// still be played (inside half a beat behind) or ahead. Empty once the song has none left.
    func due(at tick: Double, msPerTick: Double) -> [Int] {
        let reach = msPerTick.isFinite && msPerTick > 0 ? loose(msPerTick: msPerTick) : 0
        var best: Int?
        for i in notes.indices where status[i] == .pending && active(i) && Double(notes[i].t) >= tick - reach {
            if best == nil || abs(Double(notes[i].t) - tick) < abs(Double(best!) - tick) { best = notes[i].t }
        }
        guard let t = best else { return [] }
        return notes.indices.filter { status[$0] == .pending && active($0) && notes[$0].t == t }.map { notes[$0].n }
    }

    /// The active notes starting between two ticks, with their state.
    func notes(from: Double, to: Double) -> [(index: Int, note: Song.Note, status: Status)] {
        var out: [(Int, Song.Note, Status)] = []
        for i in notes.indices {
            let t = Double(notes[i].t)
            guard t >= from, t <= to, active(i) else { continue }
            out.append((i, notes[i], status[i]))
        }
        return out
    }

    /// What the highway shows between two ticks: every active note starting by `to` that is
    /// still sounding at `from` (a hit note stays on the highway while it lasts, 0.1 (68)).
    func onHighway(from: Double, to: Double) -> [(index: Int, note: Song.Note, status: Status)] {
        var out: [(Int, Song.Note, Status)] = []
        for i in notes.indices {
            let t = Double(notes[i].t)
            guard t <= to, t + Double(notes[i].len) >= from, active(i) else { continue }
            out.append((i, notes[i], status[i]))
        }
        return out
    }

    /// Keys of the pending notes inside the window now, and of the next tick's notes after,
    /// with the fingers of each (the hand in the corner shows them).
    func cue(at tick: Double, msPerTick: Double) -> (now: Set<Int>, next: Set<Int>, fingers: [Int: Int],
                                                     nowFingers: Set<Int>, nextFingers: Set<Int>) {
        let reach = msPerTick.isFinite ? Self.goodMs / msPerTick : 0
        var now: Set<Int> = []
        var nextTick: Int?
        var next: Set<Int> = []
        var fingers: [Int: Int] = [:]
        for i in notes.indices where status[i] == .pending && active(i) {
            let t = Double(notes[i].t)
            if abs(t - tick) <= reach {
                now.insert(notes[i].n)
            } else if t > tick {
                if nextTick == nil || notes[i].t < nextTick! { nextTick = notes[i].t; next = [] }
                if notes[i].t == nextTick { next.insert(notes[i].n) }
            }
        }
        // Fingers for the chord in the window and the one after it, no further: two chords'
        // badges on neighbouring keys read as one.
        var nowFingers: Set<Int> = []
        var nextFingers: Set<Int> = []
        for i in notes.indices where status[i] == .pending && active(i) {
            let t = Double(notes[i].t)
            guard let f = finger(i) else { continue }
            if abs(t - tick) <= reach {
                fingers[notes[i].n] = f
                nowFingers.insert(f)
            } else if notes[i].t == nextTick {
                fingers[notes[i].n] = f
                nextFingers.insert(f)
            }
        }
        return (now, next.subtracting(now), fingers, nowFingers, nextFingers)
    }
}
