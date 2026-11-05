import Foundation

/// Fingers for a one-note-at-a-time line, by hand position rather than by pitch: the line is
/// walked once and every note gets the finger that costs the hand the least from the note
/// before (a dynamic program over the five fingers). The costs are a pianist's habits for the
/// right hand: neighbour fingers for steps, wider pairs for wider intervals up to what the
/// hand reaches (the thumb to the pinky an octave), the thumb tucking under on the way up and
/// a finger crossing over it on the way down, and a jump of the whole hand only where there
/// is time for it (a rest, a long note) or nothing else will do. The same finger never slides
/// between two keys inside a phrase, and a repeated key keeps its finger. The left hand is the
/// mirror (the pinky low). The Stage fingers each tier's chart with this (0.1 (104)), so a
/// level's line is fingered as the line it is, not as the whole record's.
enum Fingering {
    /// What two fingers of the right hand reach going up (the lower finger on the lower key),
    /// in semitones: comfortable, and the most they stretch. Keyed `lower * 10 + upper`.
    static let reach: [Int: (easy: Int, max: Int)] = [
        12: (5, 7), 13: (7, 9), 14: (9, 11), 15: (12, 14),
        23: (3, 4), 24: (5, 6), 25: (7, 9),
        34: (3, 4), 35: (5, 7),
        45: (3, 4),
    ]

    /// The thumb under finger `a` going up, or `a` over the thumb coming down: easiest from the
    /// middle finger, then the ring, then the index; the pinky rarely.
    static func crossCost(_ a: Int) -> Double { [3: 1.4, 4: 1.6, 2: 2.0][a] ?? 3.0 }
    /// A crossing covers a fourth at most; past that the hand jumps.
    static let crossMax = 5

    /// Moving the whole hand: nearly free after a rest or a long note, dear mid-phrase.
    static func shiftCost(gapBeats: Double) -> Double {
        gapBeats >= 2 ? 1 : gapBeats >= 1 ? 2.5 : 5
    }

    static func isBlack(_ n: Int) -> Bool { [1, 3, 6, 8, 10].contains(((n % 12) + 12) % 12) }

    /// How many fingers apart two keys sit when the hand lies over them a finger a white key:
    /// a step one, a third two, a fourth or fifth three or four, an octave the whole hand.
    static func fingersApart(_ s: Int) -> Int { max(1, min(4, Int((Double(s) / 2.0).rounded()))) }

    /// The cost of playing the next key with finger `b` after finger `a`, for the right hand:
    /// `d` is the interval up (negative down), `gap` the beats between the onsets.
    static func cost(from a: Int, to b: Int, interval d: Int, gapBeats gap: Double) -> Double {
        let shift = shiftCost(gapBeats: gap)
        if d == 0 { return a == b ? 0 : 1 }
        if gap <= 0 {
            // Two keys at once: a lower finger on the lower key, inside the hand's stretch.
            guard (d > 0) == (b > a), a != b, let r = reach[min(a, b) * 10 + max(a, b)], abs(d) <= r.max else { return 50 }
            return abs(d) <= r.easy ? 0 : Double(abs(d) - r.easy) * 1.5
        }
        // The same finger again on another key: the hand jumps (and another finger would do).
        if a == b { return shift + 0.5 }
        let up = d > 0
        let s = abs(d)
        if up == (b > a) {
            // In order: the pair's reach, a little when the pair doesn't lie over the keys the
            // way the hand does (2 and 4 on a step, 1 and 2 on a fifth), more for a stretch.
            let k = abs(b - a)
            let r = reach[min(a, b) * 10 + max(a, b)]!
            if s <= r.easy { return 0.3 * Double(abs(k - fingersApart(s))) }
            if s <= r.max { return 1.5 * Double(s - r.easy) }
            return shift
        }
        // Against the order: the thumb under (up) or a finger over the thumb (down), easiest
        // over a half step; any other crossing is a jump of the hand.
        if up, b == 1, s <= crossMax { return min(crossCost(a) + 0.1 * Double(s), shift) }
        if !up, a == 1, s <= crossMax { return min(crossCost(b) + 0.1 * Double(s), shift) }
        return shift + 1
    }

    /// A finger on its own: the thumb and the pinky sit badly on a black key.
    static func unary(_ f: Int, note n: Int) -> Double {
        isBlack(n) ? (f == 1 ? 0.5 : f == 5 ? 0.3 : 0) : 0
    }

    /// The fingers of `notes` (in time order), one each, for the right hand or, mirrored, the
    /// left. `ticksPerBeat` turns the gaps between onsets into beats.
    static func plan(_ notes: [Song.Note], right: Bool = true, ticksPerBeat: Int) -> [Int] {
        guard !notes.isEmpty else { return [] }
        // Fingers 1...5 as indices 0...4. The left hand is the right hand in a mirror: the same
        // fingers over the intervals flipped (its thumb is the high side), so the one table serves.
        let n = notes.count
        var best = [[Double]](repeating: [Double](repeating: 0, count: 5), count: n)
        var from = [[Int]](repeating: [Int](repeating: 0, count: 5), count: n)
        func key(_ i: Int) -> Int { right ? notes[i].n : -notes[i].n }
        for f in 0..<5 { best[0][f] = unary(f + 1, note: notes[0].n) }
        for i in 1..<n {
            let d = key(i) - key(i - 1)
            let gap = Double(notes[i].t - notes[i - 1].t) / Double(ticksPerBeat)
            for b in 0..<5 {
                var low = Double.infinity, arg = 0
                for a in 0..<5 {
                    let c = best[i - 1][a] + cost(from: a + 1, to: b + 1, interval: d, gapBeats: gap)
                    if c < low { low = c; arg = a }
                }
                best[i][b] = low + unary(b + 1, note: notes[i].n)
                from[i][b] = arg
            }
        }
        var f = (0..<5).min { best[n - 1][$0] < best[n - 1][$1] }!
        var out = [Int](repeating: 0, count: n)
        for i in stride(from: n - 1, through: 0, by: -1) {
            out[i] = f + 1
            f = from[i][f]
        }
        return out
    }
}
