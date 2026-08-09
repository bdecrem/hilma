import Foundation

/// Hit windows, scoring, combo. Pure state machine — no clocks, no audio.
/// Times come in as song seconds (already calibration-adjusted by the caller).
final class JudgmentEngine {
    struct TapResult {
        let noteIndex: Int
        let judgment: Judgment
        let points: Int
    }

    // Windows (seconds). Perfect ±65ms, Good ±140ms; a late tap out to +180ms
    // (or early to −200ms) still connects weakly, exactly like the prototypes.
    static let perfectWindow = 0.065
    static let goodWindow = 0.14
    static let lateTap = 0.18
    static let earlyTap = 0.2
    static let missAt = 0.18

    let notes: [ChartNote]
    let spb: Double
    private(set) var judged: [Bool]
    private(set) var hit: [Bool]

    private(set) var score = 0
    private(set) var combo = 0
    private(set) var maxCombo = 0
    private(set) var perfects = 0
    private(set) var goods = 0
    private(set) var misses = 0

    init(notes: [ChartNote], spb: Double) {
        self.notes = notes
        self.spb = spb
        judged = Array(repeating: false, count: notes.count)
        hit = Array(repeating: false, count: notes.count)
    }

    func time(of index: Int) -> Double { notes[index].beat * spb }

    /// A tap on `lane` at song time `t`: match the nearest unjudged note in
    /// the window, or nothing (stray taps are free).
    func tap(lane: Int, at t: Double) -> TapResult? {
        var best: Int? = nil
        var bestDt = Double.greatestFiniteMagnitude
        for i in 0..<notes.count where !judged[i] && notes[i].lane == lane {
            let dt = t - time(of: i)
            if dt > Self.lateTap { continue }
            if dt < -Self.earlyTap { break }
            if abs(dt) < abs(bestDt) { best = i; bestDt = dt }
        }
        guard let index = best else { return nil }
        judged[index] = true
        hit[index] = true

        let adt = abs(bestDt)
        let judgment: Judgment
        let base: Int
        if adt <= Self.perfectWindow { judgment = .perfect; base = 100; perfects += 1 }
        else if adt <= Self.goodWindow { judgment = .good; base = 50; goods += 1 }
        else { judgment = .weak; base = 25; goods += 1 }

        combo += 1
        maxCombo = max(maxCombo, combo)
        let points = base + min(combo, 50) * 2
        score += points
        return TapResult(noteIndex: index, judgment: judgment, points: points)
    }

    /// Sweep for notes that slid past the late window. Returns newly missed indices.
    func sweepMisses(now t: Double) -> [Int] {
        var missed: [Int] = []
        for i in 0..<notes.count where !judged[i] {
            if t - time(of: i) > Self.missAt {
                judged[i] = true
                combo = 0
                misses += 1
                missed.append(i)
            }
        }
        return missed
    }

    func result(config: RunConfig) -> RunResult {
        RunResult(config: config, score: score, maxCombo: maxCombo,
                  perfects: perfects, goods: goods, misses: misses)
    }
}
