import Foundation

/// The brief's "clean chorus" (§4, v1; tune later).
struct ScoringRules {
    /// Pitch classes count in any octave from C2 to C5: mini keyboards shift octaves.
    var low = 36
    var high = 72
    /// ≥ 90% of expected notes hit (right pitch class, inside the timing window).
    var minAccuracy = 0.9
    /// Extra notes (wrong, doubled, stray) allowed per chorus.
    var maxExtras = 2

    /// ±60 ms at ≤ 80 bpm, ±45 ms above.
    func windowMs(tempo: Double) -> Double { tempo <= 80.001 ? 60 : 45 }
}

/// A key the player pressed, placed on the transport.
struct PlayedNote {
    let note: Int
    /// Absolute transport tick at the moment of the press, as heard.
    let tick: Double
    /// Milliseconds per tick at that moment, for offsets in ms.
    let msPerTick: Double
    /// For the exported loop: how hard, and how long it was held (nil: still down).
    var velocity: Float = 0.8
    var lengthTicks: Double?
}

/// How one chorus went: every expected note's mark, the extras, the verdict and its wording.
struct ChorusResult {
    enum Mark { case hit, early, late, wrong, missed }
    enum ExtraKind { case doubled, wrong, high, low, stray }

    struct Judged {
        let expected: ExpectedNote
        var mark: Mark
        /// Signed (negative = early), for the notes matched by pitch class within half a beat.
        var offsetMs: Double?
    }

    struct Extra {
        let bar: Int
        let kind: ExtraKind
        let note: Int
    }

    let chorus: Int
    let notes: [Judged]
    let extras: [Extra]
    let bars: Int
    let clean: Bool
    /// Findings in the order they matter, as coach sentences ("Rushed bar 9.").
    let problems: [String]

    var hits: Int { notes.filter { $0.mark == .hit }.count }
    var offsets: [Double] { notes.compactMap(\.offsetMs) }
    /// Rush (negative) or drag over the matched notes.
    var meanOffsetMs: Double? { offsets.isEmpty ? nil : offsets.reduce(0, +) / Double(offsets.count) }

    /// The Mac's "Last chorus" line.
    var summary: String {
        clean ? (["Clean."] + problems.prefix(1)).joined(separator: " ") : problems.prefix(2).joined(separator: " ")
    }

    /// How far the matched notes scatter around their mean (standard deviation, ms).
    var spreadMs: Double? {
        guard let m = meanOffsetMs, offsets.count > 1 else { return nil }
        return (offsets.map { ($0 - m) * ($0 - m) }.reduce(0, +) / Double(offsets.count)).squareRoot()
    }

    /// "12 of 12 · on the beat", "11 of 12 · 23 ms early · 1 extra", "9 of 12 · centered · ±47 ms":
    /// the lean (mean offset) and, when the notes scatter 10 ms or more, the spread.
    var detail: String {
        var parts = ["\(hits) of \(notes.count)"]
        if let m = meanOffsetMs {
            let lean = Int(abs(m).rounded())
            let spread = Int((spreadMs ?? 0).rounded())
            if lean >= 5 {
                parts.append("\(lean) ms \(m < 0 ? "early" : "late")")
            } else {
                parts.append(spread >= 10 ? "centered" : "on the beat")
            }
            if spread >= 10 { parts.append("±\(spread) ms") }
        }
        if !extras.isEmpty { parts.append("\(extras.count) extra") }
        return parts.joined(separator: " · ")
    }
}

enum Scorer {
    /// Judges chorus `chorus` (0-based) against the step's expected notes. `played` are the
    /// presses that belong to this chorus; ticks are absolute, `loopTicks` per chorus.
    ///
    /// Each expected note takes the nearest press of its pitch class (in range) within its
    /// association window: half a beat, or half the gap to a neighboring expected note when
    /// that is closer. That press is a hit inside the timing window, early or late outside it.
    /// Every other press is an extra: doubled (a second press of a matched note), wrong (the
    /// wrong pitch class, or out of range, near an expected note) or stray.
    static func judge(chorus: Int, expected: [ExpectedNote], played: [PlayedNote], loopTicks: Int,
                      ticksPerBeat: Int, rules: ScoringRules) -> ChorusResult {
        let base = Double(chorus * loopTicks)
        let ticksPerBar = 4 * ticksPerBeat
        let bars = loopTicks / ticksPerBar
        let n = expected.count
        var window = [Double](repeating: Double(ticksPerBeat) / 2, count: n)
        for i in 0..<n {
            let prev = i > 0 ? expected[i - 1].tick : expected[n - 1].tick - loopTicks
            let next = i < n - 1 ? expected[i + 1].tick : expected[0].tick + loopTicks
            window[i] = min(window[i], Double(expected[i].tick - prev) / 2, Double(next - expected[i].tick) / 2)
        }
        func inRange(_ note: Int) -> Bool { (rules.low...rules.high).contains(note) }

        let presses = played.sorted { $0.tick < $1.tick }
        var used = [Bool](repeating: false, count: presses.count)
        var judged: [ChorusResult.Judged] = []
        for (i, e) in expected.enumerated() {
            let at = base + Double(e.tick)
            var best: Int?
            for (j, p) in presses.enumerated()
            where !used[j] && inRange(p.note) && p.note % 12 == e.pitchClass && abs(p.tick - at) <= window[i] {
                if best == nil || abs(p.tick - at) < abs(presses[best!].tick - at) { best = j }
            }
            guard let j = best else {
                judged.append(.init(expected: e, mark: .missed))
                continue
            }
            used[j] = true
            let p = presses[j]
            let ms = (p.tick - at) * p.msPerTick
            let tempo = 60000 / (p.msPerTick * Double(ticksPerBeat))
            let mark: ChorusResult.Mark = abs(ms) <= rules.windowMs(tempo: tempo) ? .hit : ms < 0 ? .early : .late
            judged.append(.init(expected: e, mark: mark, offsetMs: ms))
        }

        var extras: [ChorusResult.Extra] = []
        for (j, p) in presses.enumerated() where !used[j] {
            var bar = min(bars - 1, max(0, Int(((p.tick - base) / Double(ticksPerBar)).rounded(.down))))
            var kind = ChorusResult.ExtraKind.stray
            for (i, e) in expected.enumerated() where abs(p.tick - (base + Double(e.tick))) <= window[i] {
                bar = e.bar
                if p.note > rules.high { kind = .high }
                else if p.note < rules.low { kind = .low }
                else { kind = p.note % 12 == e.pitchClass ? .doubled : .wrong }
                if kind != .doubled && judged[i].mark == .missed { judged[i].mark = .wrong }
                break
            }
            extras.append(.init(bar: bar, kind: kind, note: p.note))
        }

        let hits = judged.filter { $0.mark == .hit }.count
        let accurate = n > 0 && Double(hits) / Double(n) >= rules.minAccuracy - 1e-9
        let tidy = extras.count <= rules.maxExtras
        return ChorusResult(chorus: chorus, notes: judged, extras: extras, bars: bars, clean: accurate && tidy,
                            problems: problems(judged, extras, bars: bars, extrasFirst: accurate && !tidy))
    }

    /// The findings as sentences, most frequent first (the extras first when they alone
    /// failed the chorus).
    private static func problems(_ notes: [ChorusResult.Judged], _ extras: [ChorusResult.Extra], bars: Int,
                                 extrasFirst: Bool) -> [String] {
        func barsOf(_ mark: ChorusResult.Mark) -> [Int] { notes.filter { $0.mark == mark }.map(\.expected.bar) }
        func barsOf(_ kinds: [ChorusResult.ExtraKind]) -> [Int] { extras.filter { kinds.contains($0.kind) }.map(\.bar) }
        func sentence(_ list: [Int], _ one: String, _ many: String) -> (Int, String)? {
            guard !list.isEmpty else { return nil }
            return (list.count, "\(list.count == 1 ? one : many) \(barList(list, total: bars)).")
        }
        let timing = [
            sentence(barsOf(.early), "Rushed", "Rushed"),
            sentence(barsOf(.late), "Dragged", "Dragged"),
            sentence(barsOf(.missed), "Missed", "Missed"),
        ]
        // A wrong or out-of-range press marks the expected note it replaced as .wrong; the
        // sentence comes from the press, which says what was wrong with it.
        let presses = [
            sentence(barsOf([.wrong]), "Wrong note in", "Wrong notes in"),
            sentence(barsOf([.high]), "Too high in", "Too high in"),
            sentence(barsOf([.low]), "Too low in", "Too low in"),
            sentence(barsOf([.doubled, .stray]), "Extra note in", "Extra notes in"),
        ]
        func ranked(_ xs: [(Int, String)?]) -> [String] {
            xs.compactMap { $0 }.enumerated()
                .sorted { ($0.element.0, -$0.offset) > ($1.element.0, -$1.offset) }
                .map(\.element.1)
        }
        return extrasFirst ? ranked(presses) + ranked(timing) : ranked(timing + presses)
    }

    /// "bar 9", "bars 5 and 9", "bars 1–4 and 9", "every bar" (1-based in the text).
    static func barList(_ zeroBased: [Int], total: Int) -> String {
        let bars = Array(Set(zeroBased)).sorted().map { $0 + 1 }
        if bars.count == total { return "every bar" }
        var items: [String] = []
        var i = 0
        while i < bars.count {
            var j = i
            while j + 1 < bars.count && bars[j + 1] == bars[j] + 1 { j += 1 }
            if j - i >= 2 {
                items.append("\(bars[i])–\(bars[j])")
            } else {
                items += bars[i...j].map(String.init)
            }
            i = j + 1
        }
        let joined = items.count == 1 ? items[0] : items.dropLast().joined(separator: ", ") + " and " + items.last!
        return (bars.count == 1 ? "bar " : "bars ") + joined
    }
}
