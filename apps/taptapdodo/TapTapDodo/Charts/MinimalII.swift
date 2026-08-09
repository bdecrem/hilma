import Foundation

/// ttd·08 "minimal ii" — the authored track. Chart and structure are an exact
/// port of reference/tap-tap-dodo-minimal-ii.html: fixed (not seeded), swung,
/// velocity-accented, with the 3-against-4 polymeter through peak A.
enum MinimalII {
    static let bpm = 128.0
    static let swing = 0.06          // beats of delay on offbeat eighths
    static let bars = 48

    /// Odd eighth-note positions land late. Applied to chart AND backing.
    static func swung(_ beat: Double) -> Double {
        let e = beat * 2
        let r = e.rounded()
        return (abs(e - r) < 1e-6 && Int(r) % 2 == 1) ? beat + swing : beat
    }

    /// The web file's section map, verbatim.
    static func sec(_ bar: Int) -> String {
        if bar < 4 { return "intro" }
        if bar < 8 { return "groove" }
        if bar < 12 { return "layered" }
        if bar < 16 { return "roll" }
        if bar < 20 { return "break1" }
        if bar < 28 { return "peakA" }
        if bar < 32 { return "break2" }
        if bar < 40 { return "peakB" }
        if bar < 44 { return "strip" }
        return "outro"
    }

    // patterns: [eighth offset 0..7, lane, vel]
    private static let P: [String: [(Int, Int, Double)]] = [
        "intro":   [(1, 1, 0.7), (5, 1, 0.7)],
        "groove":  [(0, 0, 1), (3, 1, 0.7), (4, 0, 0.7), (7, 1, 0.7)],
        "layered": [(0, 0, 1), (2, 2, 0.7), (3, 1, 0.7), (4, 0, 0.7), (6, 2, 0.7), (7, 1, 1)],
        "roll":    [(0, 1, 1), (1, 0, 0.7), (3, 0, 0.7), (4, 2, 0.7), (5, 0, 0.7), (7, 0, 1)],
        "break1":  [(2, 2, 0.7), (6, 2, 0.7)],
        "break2":  [(0, 0, 1), (4, 0, 0.7)],
        "strip":   [(0, 0, 1), (5, 1, 0.7)],
        "outro":   [(0, 0, 1)],
    ]

    static func chart() -> [ChartNote] {
        var notes: [ChartNote] = []
        func mk(_ bar: Int, _ e: Int, _ lane: Int, _ vel: Double) {
            notes.append(ChartNote(beat: swung(Double(bar * 4) + Double(e) * 0.5),
                                   lane: lane, pitchIndex: nil, vel: vel))
        }
        for bar in 0..<bars {
            let s = sec(bar)
            if s == "peakA" {
                for (e, l, v) in P["groove"]! { mk(bar, e, l, v) }
                continue
            }
            if s == "peakB" {
                for (e, l, v) in P[bar % 2 == 0 ? "layered" : "roll"]! { mk(bar, e, l, v) }
                continue
            }
            for (e, l, v) in P[s]! { mk(bar, e, l, v) }
        }
        // peak A polymeter: lane 2 on the global eighth grid, step 3,
        // crossing barlines — the player taps the 3-against-4.
        let e0 = 20 * 8
        var e = e0
        while e < 28 * 8 {
            let beat = Double(e) * 0.5
            notes.append(ChartNote(beat: swung(beat), lane: 2, pitchIndex: nil,
                                   vel: (e - e0) % 6 == 0 ? 1 : 0.7))
            e += 3
        }
        // collision scrub, exactly as the web file does it: same-lane pairs
        // closer than 0.24 beats drop the lower-velocity note.
        notes.sort { $0.beat != $1.beat ? $0.beat < $1.beat : $0.lane < $1.lane }
        var i = notes.count - 1
        while i > 0 {
            let a = notes[i], b = notes[i - 1]
            if a.lane == b.lane, a.beat - b.beat < 0.24 {
                notes.remove(at: a.vel <= b.vel ? i : i - 1)
            }
            i -= 1
        }
        return notes
    }
}
