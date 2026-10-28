import Foundation

/// Stage: one run of a song's part. Pure, main thread, like the LessonEngine: the Player feeds
/// it the heard transport tick every frame and every key press, it judges each chart note
/// against the press nearest it (Perfect inside ±45 ms, Good inside ±110 ms, Missed when the
/// window passes), keeps the score, the combo and the multiplier, and on Adaptive moves the
/// level up or down between four-bar blocks. There is no failing: the song plays to the end.
final class GameEngine {
    enum Difficulty: String, CaseIterable, Codable {
        case easy, medium, hard, adaptive

        var title: String { rawValue.capitalized }
        /// The chart level, nil on adaptive (it moves).
        var level: Int? {
            switch self {
            case .easy: 1
            case .medium: 2
            case .hard: 3
            case .adaptive: nil
            }
        }
        var line: String {
            switch self {
            case .easy: "The bones of the part, one key at a time."
            case .medium: "Two notes where there were one, on the 1 and the 3."
            case .hard: "The part as the record plays it."
            case .adaptive: "Starts easy. Clean four bars and it climbs; miss a few and it eases off."
            }
        }
    }

    enum Judgment: Equatable {
        case perfect, good, miss
        var title: String {
            switch self {
            case .perfect: "Perfect"
            case .good: "Good"
            case .miss: "Miss"
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
        let missed: Int
        let extras: Int
        let maxCombo: Int
        /// Hits over notes, 0...1.
        let accuracy: Double
        /// The highest level played (adaptive), or the difficulty's.
        let level: Int
        let grade: String

        static func grade(accuracy: Double) -> String {
            accuracy >= 0.97 ? "S" : accuracy >= 0.9 ? "A" : accuracy >= 0.8 ? "B" : accuracy >= 0.65 ? "C" : "D"
        }
    }

    static let perfectMs = 45.0
    static let goodMs = 110.0
    /// Points for a hit, before the multiplier and the level.
    static let points: [Judgment: Int] = [.perfect: 100, .good: 60, .miss: 0]
    /// Combo thresholds for ×2, ×3, ×4.
    static let steps = [8, 16, 32]
    /// Adaptive: a block at or above this hit rate climbs, below this one eases off.
    static let climb = 0.9
    static let ease = 0.6
    static let block = 4

    let song: Song
    let part: Song.PartKey
    let difficulty: Difficulty
    let ticksPerBeat: Int
    let ticksPerBar: Int
    /// The hard chart in time order; a note plays at a level when its `lv` is at or under it.
    let notes: [Song.Note]
    private(set) var status: [Status]
    /// The level of each four-bar block, decided two bars before the block starts.
    private(set) var blockLevel: [Int]
    private(set) var score = 0
    private(set) var combo = 0
    private(set) var maxCombo = 0
    private(set) var perfect = 0
    private(set) var good = 0
    private(set) var missed = 0
    private(set) var extras = 0
    private(set) var pop: Pop?
    private(set) var finished = false
    private var seq = 0
    private var heardTick = -Double.infinity
    private var checked = -Double.infinity
    /// Hits and misses per bar, for the adaptive decision.
    private var barHits: [Int: Int] = [:]
    private var barMisses: [Int: Int] = [:]

    init(song: Song, part: Song.PartKey, difficulty: Difficulty) {
        self.song = song
        self.part = part
        self.difficulty = difficulty
        ticksPerBeat = song.band.ticksPerBeat
        ticksPerBar = song.ticksPerBar
        notes = song.chart(part, level: 3)
        status = Array(repeating: .pending, count: notes.count)
        let blocks = (song.band.bars + Self.block - 1) / Self.block + 1
        blockLevel = Array(repeating: difficulty.level ?? 1, count: blocks)
    }

    var endTick: Int { song.endTick }

    func level(atBar bar: Int) -> Int {
        let b = max(0, bar) / Self.block
        return b < blockLevel.count ? blockLevel[b] : blockLevel.last ?? 1
    }

    /// The bar being heard (0 before the song starts).
    var heardBar: Int { heardTick.isFinite ? max(0, Int((heardTick / Double(ticksPerBar)).rounded(.down))) : 0 }

    /// The level now (the bar being heard).
    var level: Int { level(atBar: heardBar) }

    /// The highest level played so far.
    var topLevel: Int { (0...heardBar).map { level(atBar: $0) }.max() ?? 1 }

    var multiplier: Int { 1 + Self.steps.filter { combo >= $0 }.count }

    /// Points for a hit at the level being played: the multiplier, and more for a harder level.
    static func points(_ j: Judgment, multiplier: Int, level: Int) -> Int {
        let base = points[j]! * multiplier
        return level == 1 ? base : level == 2 ? base * 3 / 2 : base * 2
    }

    /// Whether note `i` plays at the level of its bar.
    func active(_ i: Int) -> Bool { notes[i].lv <= level(atBar: notes[i].t / ticksPerBar) }

    var accuracy: Double {
        let judged = perfect + good + missed
        return judged == 0 ? 1 : Double(perfect + good) / Double(judged)
    }

    /// The heard transport tick, every frame: notes whose window has passed are missed, the
    /// next block's level is decided two bars ahead, and the song ends at its end tick.
    func heard(tick: Double, msPerTick: Double) {
        heardTick = tick
        guard msPerTick.isFinite, msPerTick > 0 else { return }
        let reach = Self.goodMs / msPerTick
        for i in notes.indices where status[i] == .pending && active(i) {
            let deadline = Double(notes[i].t) + reach
            guard deadline > checked, deadline <= tick else { continue }
            status[i] = .missed
            missed += 1
            combo = 0
            barMisses[notes[i].t / ticksPerBar, default: 0] += 1
            seq += 1
            pop = Pop(judgment: .miss, note: notes[i].n, seq: seq)
        }
        checked = max(checked, tick)
        if difficulty == .adaptive { adapt(tick: tick) }
        if !finished, tick >= Double(endTick) { finished = true }
    }

    /// Two bars before a block starts, its level is set from the four bars before that: at or
    /// above `climb` hit rate (with at least four notes judged) goes up, under `ease` goes down.
    private func adapt(tick: Double) {
        let bar = Int((tick / Double(ticksPerBar)).rounded(.down))
        // Block k is decided when bar 4k − 2 is reached, from the four bars before that one.
        let k = (bar + 2) / Self.block
        guard k >= 1, k < blockLevel.count, !decided.contains(k) else { return }
        decided.insert(k)
        let to = k * Self.block - 2, from = to - Self.block
        var hits = 0, misses = 0
        for b in from..<to where b >= 0 {
            hits += barHits[b] ?? 0
            misses += barMisses[b] ?? 0
        }
        let current = blockLevel[k - 1]
        var level = current
        if hits + misses >= 4 {
            let rate = Double(hits) / Double(hits + misses)
            if rate >= Self.climb { level = min(3, current + 1) }
            else if rate < Self.ease { level = max(1, current - 1) }
        }
        for b in k..<blockLevel.count { blockLevel[b] = level }
    }
    private var decided: Set<Int> = []

    /// A key press at a transport tick: the nearest pending note of its pitch class inside the
    /// Good window takes it (the exact key first); anything else is an extra.
    func played(note: Int, tick: Double, msPerTick: Double) {
        guard !finished, msPerTick.isFinite, msPerTick > 0 else { return }
        let reach = Self.goodMs / msPerTick
        var best: (i: Int, d: Double, exact: Bool)?
        for i in notes.indices where status[i] == .pending && active(i) && notes[i].n % 12 == note % 12 {
            let d = tick - Double(notes[i].t)
            guard abs(d) <= reach else { continue }
            let exact = notes[i].n == note
            if best == nil || (exact && !best!.exact) || (exact == best!.exact && abs(d) < abs(best!.d)) { best = (i, d, exact) }
        }
        guard let b = best else {
            extras += 1
            return
        }
        let ms = abs(b.d * msPerTick)
        let j: Judgment = ms <= Self.perfectMs ? .perfect : .good
        status[b.i] = .hit(j)
        if j == .perfect { perfect += 1 } else { good += 1 }
        combo += 1
        maxCombo = max(maxCombo, combo)
        barHits[notes[b.i].t / ticksPerBar, default: 0] += 1
        score += Self.points(j, multiplier: multiplier, level: level(atBar: notes[b.i].t / ticksPerBar))
        seq += 1
        pop = Pop(judgment: j, note: notes[b.i].n, seq: seq)
    }

    func result() -> Result {
        Result(song: song.name, part: part.rawValue, difficulty: difficulty.rawValue, score: score,
               notes: perfect + good + missed, perfect: perfect, good: good, missed: missed, extras: extras,
               maxCombo: maxCombo, accuracy: accuracy, level: difficulty.level ?? topLevel,
               grade: Result.grade(accuracy: accuracy))
    }

    /// The active notes between two ticks, with their state, for the highway.
    func notes(from: Double, to: Double) -> [(index: Int, note: Song.Note, status: Status)] {
        var out: [(Int, Song.Note, Status)] = []
        for i in notes.indices {
            let t = Double(notes[i].t)
            guard t >= from, t <= to, active(i) else { continue }
            out.append((i, notes[i], status[i]))
        }
        return out
    }

    /// Keys of the pending notes inside the window now, and of the next tick's notes after.
    func cue(at tick: Double, msPerTick: Double) -> (now: Set<Int>, next: Set<Int>, fingers: [Int: Int]) {
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
        for i in notes.indices where status[i] == .pending && active(i) {
            let t = Double(notes[i].t)
            if abs(t - tick) <= reach || notes[i].t == nextTick, let f = notes[i].f { fingers[notes[i].n] = f }
        }
        return (now, next.subtracting(now), fingers)
    }
}
