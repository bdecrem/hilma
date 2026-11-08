import Foundation

/// Fingers for a one-note-at-a-time line, by hand position rather than by pitch: the line is
/// walked once and every note gets the finger that costs the hand the least from the note
/// before (a dynamic program over the five fingers). The costs are a pianist's habits for the
/// right hand: neighbour fingers for steps, wider pairs for wider intervals up to what the
/// hand reaches (the thumb to the pinky an octave), the thumb tucking under on the way up and
/// a finger crossing over it on the way down, and a jump of the whole hand only where there
/// is time for it (a rest, a long note) or nothing else will do. The same finger never slides
/// between two keys inside a beat (after a beat and a half it may reach the next key over, the
/// thumb on F taking the E), and a repeated key keeps its finger. The left hand is the
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
        // Inside a beat there is no time to move the hand: no finger slides to another key within
        // the octave, and within a fifth nothing crosses but the thumb under 2–4 (or 2–4 over it)
        // and no pair stretches past its reach. A jump there was priced like one after a beat's
        // rest, and Halsted at 148 took it (the riff's A4 on the thumb to G4 on the pinky).
        if gap <= 1, abs(d) <= 12 {
            if a == b { return 50 }
            if abs(d) <= 7 {
                if (d > 0) == (b > a) {
                    if abs(d) > reach[min(a, b) * 10 + max(a, b)]!.max { return 50 }
                } else {
                    let thumbCross = d > 0 ? (b == 1 && (2...4).contains(a)) : (a == 1 && (2...4).contains(b))
                    if !(thumbCross && abs(d) <= crossMax) { return 50 }
                }
            }
        }
        // The same finger again on another key: a reach when it is the next key over and there
        // is time for it (a beat and a half: the thumb on F reaching down to E after a held
        // note, keeping the hand where it lies), otherwise the hand jumps (and another finger
        // would do). Scale speed, a beat a note, is no time: there the thumb tucks.
        if a == b { return abs(d) <= 2 && gap >= 1.5 ? 1 : shift + 0.5 }
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

// MARK: The hand (LEVELING.md, 2026-11-08)

extension Fingering {
    /// The white-key index of a note (a black key counts as the white key under it), so a hand
    /// position reads as where the thumb sits, in keys.
    static func whiteIndex(_ n: Int) -> Int {
        let pc = ((n % 12) + 12) % 12
        return Int((Double(n) / 12).rounded(.down)) * 7 + [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pc]
    }

    /// Where the hand sits for a note under a finger: the white key the thumb lies on (the right
    /// hand; the pinky's key for the left), finger f sitting f − 1 keys over it.
    static func thumbKey(_ n: Int, finger: Int, right: Bool = true) -> Int {
        right ? whiteIndex(n) - (finger - 1) : whiteIndex(n) + (finger - 1)
    }

    struct Move: Equatable {
        enum Kind { case tuck, over, jump }
        /// Index into the notes of the note the hand moves onto.
        let index: Int
        let kind: Kind
    }

    /// How often the hand moves over a fingered line (the server's `handMoves` in
    /// src/lib/takt/fingering.ts is the same rule). The hand sits where its thumb lies; a note
    /// under finger f says the thumb is f − 1 white keys under it. One position reads within a
    /// key of itself (1 on F and 5 on D is a stretch, the thumb on F reaching to E a reach), so
    /// the position is the span of thumb keys read since the last move, and a note that widens
    /// it past two keys is a move; so is a thumb-under going up or a finger over the thumb
    /// coming down. Rests don't excuse a move.
    static func moves(_ notes: [Song.Note], fingers: [Int], right: Bool = true) -> [Move] {
        guard notes.count >= 2, fingers.count == notes.count else { return [] }
        var out: [Move] = []
        var lo = thumbKey(notes[0].n, finger: fingers[0], right: right), hi = lo
        for i in 1..<notes.count {
            let d = (right ? 1 : -1) * (notes[i].n - notes[i - 1].n)
            let fa = fingers[i - 1], fb = fingers[i]
            let here = thumbKey(notes[i].n, finger: fb, right: right)
            let tuck = d > 0 && fb == 1 && fa > 1
            let over = d < 0 && fa == 1 && fb > 1
            if tuck || over || max(hi, here) - min(lo, here) > 2 {
                out.append(Move(index: i, kind: tuck ? .tuck : over ? .over : .jump))
                lo = here
                hi = here
            } else {
                lo = min(lo, here)
                hi = max(hi, here)
            }
        }
        return out
    }

    /// The hand's figures for a line, fingered by the rule above: moves, moments (moves within
    /// two bars of each other are one moment to the player), positions (places the hand has not
    /// sat before, within a key) and the span in semitones.
    struct Figures: Equatable {
        let moves: Int
        let moments: Int
        let positions: Int
        let span: Int
        /// "6/3 · 3 · 13": moves/moments · positions · span, as LEVELING.md tabulates them.
        var short: String { "\(moves)/\(moments) · \(positions) · \(span)" }
    }

    static func figures(_ notes: [Song.Note], right: Bool = true, ticksPerBeat: Int) -> Figures {
        guard !notes.isEmpty else { return Figures(moves: 0, moments: 0, positions: 0, span: 0) }
        let f = plan(notes, right: right, ticksPerBeat: ticksPerBeat)
        let mv = moves(notes, fingers: f, right: right)
        // Moves within two bars of the move before join its moment (a tuck up into a figure
        // and the hand coming home are one moment to the player).
        var moments = 0, last = -Int.max / 2
        for m in mv {
            if notes[m.index].t - last >= 8 * ticksPerBeat { moments += 1 }
            last = notes[m.index].t
        }
        var positions = [thumbKey(notes[0].n, finger: f[0], right: right)]
        for m in mv {
            let k = thumbKey(notes[m.index].n, finger: f[m.index], right: right)
            if !positions.contains(where: { abs($0 - k) <= 1 }) { positions.append(k) }
        }
        let pitches = notes.map(\.n)
        return Figures(moves: mv.count, moments: moments, positions: positions.count, span: pitches.max()! - pitches.min()!)
    }

    /// The leveling sheet's hand budget for a map level (LEVELING.md §2; `src/lib/takt/leveling.ts`
    /// is the same table): the most moves, moments and positions a line may ask for, and how
    /// wide it may be. `solo` is the improv teacher's whole track at Level 1 (Bart: "maybe 4").
    struct Budget: Equatable {
        let level: Int
        let positions: Int
        let moves: Int
        let moments: Int
        let span: Int

        static func of(level: Int, solo: Bool = false) -> Budget {
            switch max(1, level) {
            case 1: return solo ? Budget(level: 1, positions: 2, moves: 4, moments: 2, span: 12) : Budget(level: 1, positions: 3, moves: 6, moments: 3, span: 13)
            case 2: return Budget(level: 2, positions: 3, moves: 12, moments: 6, span: 24)
            case 3: return Budget(level: 3, positions: 4, moves: 20, moments: 10, span: 24)
            case 4...6: return Budget(level: level, positions: 5, moves: 30, moments: 15, span: 24)
            default: return Budget(level: level, positions: 99, moves: 999, moments: 999, span: 48)
            }
        }

        func holds(_ f: Figures) -> Bool {
            f.moves <= moves && f.moments <= moments && f.positions <= positions && f.span <= span
        }
    }
}
