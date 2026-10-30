import Foundation

/// Stage: one run of a song's part. Pure, main thread, like the LessonEngine: the Player feeds
/// it the heard transport tick every frame and every key press, it judges each chart note
/// against the press nearest it (Perfect inside ±45 ms, Good inside ±110 ms, Missed when the
/// window passes), keeps the score, the combo and the multiplier, and on Adaptive moves a tier
/// up or down the part's ladder between blocks (`Charting`, charting.json). There is no
/// failing: the song plays to the end.
final class GameEngine {
    enum Difficulty: String, CaseIterable, Codable {
        case beginner, easy, medium, hard, adaptive

        var title: String { rawValue.capitalized }
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
        /// Extras that aren't the record's own notes: wrong keys.
        let wrong: Int
        let maxCombo: Int
        /// Hits over keys played (hits and wrong keys), 0...1: how clean the playing was, whatever
        /// the level left out or you let go by.
        let accuracy: Double
        /// The highest tier played (adaptive), or the difficulty's.
        let level: Int
        let grade: String

        /// From the hit rate (hits over the chart's notes): how much of the chart you played.
        static func grade(hitRate: Double) -> String {
            hitRate >= 0.97 ? "S" : hitRate >= 0.9 ? "A" : hitRate >= 0.8 ? "B" : hitRate >= 0.65 ? "C" : "D"
        }
    }

    static let perfectMs = 45.0
    static let goodMs = 110.0
    /// Points for a hit, before the multiplier and the level.
    static let points: [Judgment: Int] = [.perfect: 100, .good: 60, .miss: 0]
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
    /// Ticks: the finest part of a beat the part's onsets sit on (a shuffle's thirds, straight
    /// eighths or sixteenths; the beat itself when every onset is on one). The highway's grid.
    let grid: Int
    private(set) var status: [Status]
    /// The tier of each block, decided `ahead` bars before the block starts.
    private(set) var blockLevel: [Int]
    private(set) var score = 0
    private(set) var combo = 0
    private(set) var maxCombo = 0
    private(set) var perfect = 0
    private(set) var good = 0
    private(set) var missed = 0
    private(set) var extras = 0
    private(set) var wrong = 0
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

    /// `start`: the tier an adaptive run starts on (`adaptiveStart`; the ladder's start if nil).
    init(song: Song, part: Song.PartKey, difficulty: Difficulty, start: Int? = nil, charting: Charting = .bundled) {
        self.song = song
        self.part = part
        self.difficulty = difficulty
        self.charting = charting
        ticksPerBeat = song.band.ticksPerBeat
        ticksPerBar = song.ticksPerBar
        notes = song.notes(part)
        masks = song.masks(part, charting: charting)
        func gcd(_ a: Int, _ b: Int) -> Int { b == 0 ? a : gcd(b, a % b) }
        let tpb = song.band.ticksPerBeat
        grid = notes.reduce(tpb) { gcd($0, $1.t % tpb) }
        status = Array(repeating: .pending, count: notes.count)
        let window = charting.adaptive.window
        let blocks = (song.band.bars + window - 1) / window + 1
        let first = charting.tier(difficulty, song: song.name, part: part) ?? start ?? charting.adaptive.start
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

    /// Hits over the keys played: a wrong key costs, a note let go by doesn't (that is the hit
    /// rate, which grades the run).
    var accuracy: Double {
        let played = perfect + good + wrong
        return played == 0 ? 1 : Double(perfect + good) / Double(played)
    }

    var hitRate: Double {
        let judged = perfect + good + missed
        return judged == 0 ? 1 : Double(perfect + good) / Double(judged)
    }

    /// The heard transport tick, every frame: notes whose window has passed are missed, the
    /// next block's tier is decided ahead, and the song ends at its end tick.
    func heard(tick: Double, msPerTick: Double) {
        heardTick = tick
        guard msPerTick.isFinite, msPerTick > 0 else { return }
        let reach = Self.goodMs / msPerTick
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
            // A key the record doesn't play here (at any tier) is wrong, and counts against the
            // level; the record's own notes the level left out don't.
            let bar = Int((tick / Double(ticksPerBar)).rounded(.down))
            if !notes.contains(where: { abs(tick - Double($0.t)) <= reach && $0.n % 12 == note % 12 }) {
                wrong += 1
                barMisses[bar, default: 0] += 1
                missRun += 1
                barMissRun[bar] = max(barMissRun[bar] ?? 0, missRun)
            }
            return
        }
        let ms = abs(b.d * msPerTick)
        let j: Judgment = ms <= Self.perfectMs ? .perfect : .good
        status[b.i] = .hit(j)
        if j == .perfect { perfect += 1 } else { good += 1 }
        combo += 1
        missRun = 0
        maxCombo = max(maxCombo, combo)
        barHits[notes[b.i].t / ticksPerBar, default: 0] += 1
        barOffsets[notes[b.i].t / ticksPerBar, default: []].append(ms)
        score += points(j, multiplier: multiplier, level: level(atBar: notes[b.i].t / ticksPerBar))
        seq += 1
        pop = Pop(judgment: j, note: notes[b.i].n, seq: seq)
    }

    func result() -> Result {
        Result(song: song.name, part: part.rawValue, difficulty: difficulty.rawValue, score: score,
               notes: perfect + good + missed, perfect: perfect, good: good, missed: missed, extras: extras, wrong: wrong,
               maxCombo: maxCombo, accuracy: accuracy, level: difficulty == .adaptive ? topLevel : blockLevel[0],
               grade: Result.grade(hitRate: hitRate))
    }

    /// Tap mode: the keys a tap at `tick` plays, the whole pending chord nearest it that is still
    /// in its window or ahead. Empty once the song has none left.
    func due(at tick: Double, msPerTick: Double) -> [Int] {
        let reach = msPerTick.isFinite && msPerTick > 0 ? Self.goodMs / msPerTick : 0
        var best: Int?
        for i in notes.indices where status[i] == .pending && active(i) && Double(notes[i].t) >= tick - reach {
            if best == nil || abs(Double(notes[i].t) - tick) < abs(Double(best!) - tick) { best = notes[i].t }
        }
        guard let t = best else { return [] }
        return notes.indices.filter { status[$0] == .pending && active($0) && notes[$0].t == t }.map { notes[$0].n }
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
            guard let f = notes[i].f else { continue }
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
