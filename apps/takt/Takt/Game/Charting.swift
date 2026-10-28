import Foundation

/// How a part becomes a level (Takt/Content/charting.json; CHARTING.md is the guide). A song
/// carries each part whole: every note has a weight (`lv`: 1 the hits the part stands on, 2
/// the groove, 3 the pushes and ornaments) and every chord note its role (root, third, …).
/// Each part has a ladder of tiers, easiest first; a tier says how many chord notes to keep,
/// which weights play, how close two onsets may come and how long a silence may last. Easy,
/// Medium and Hard name a tier each (a song may name its own), Adaptive walks the ladder.
struct Charting: Decodable {
    struct Tier: Decodable {
        /// What the level is, for the set list.
        let line: String
        /// Chord notes kept, by the ladder's `keep` order; nil keeps them all.
        let notes: Int?
        /// The heaviest weight played as written.
        let hits: Int
        /// Seconds at least between two onsets.
        let gap: Double
        /// Seconds at most without an onset where the part plays: a longer silence borrows the
        /// heaviest of the lighter hits inside it that fits the gap. Nil borrows nothing.
        let space: Double?
        /// Points per hit times this.
        let bonus: Double
    }

    struct Ladder: Decodable {
        /// Roles in the order a chord keeps them (the chords part).
        let keep: [String]?
        let easy: Int
        let medium: Int
        let hard: Int
        let tiers: [Tier]

        /// Tier n, 1-based.
        func tier(_ n: Int) -> Tier { tiers[max(1, min(tiers.count, n)) - 1] }
    }

    struct Adaptive: Decodable {
        /// The tier a run starts on.
        let start: Int
        /// Bars in a block: the tier changes between blocks.
        let window: Int
        /// Bars before a block starts that its tier is decided.
        let ahead: Int
        /// A window at or above this hit rate climbs a tier, below `ease` drops one.
        let climb: Double
        let ease: Double
        /// Notes judged in a window before it moves.
        let judged: Int
    }

    let chords: Ladder
    let melody: Ladder
    let adaptive: Adaptive
    /// Per song, per part, per difficulty: a tier instead of the ladder's.
    let songs: [String: [String: [String: Int]]]

    static let bundled: Charting = {
        guard let url = Bundle.main.url(forResource: "charting", withExtension: "json") else { fatalError("charting.json is not in the bundle") }
        do {
            let c = try JSONDecoder().decode(Charting.self, from: Data(contentsOf: url))
            c.validate()
            return c
        } catch {
            fatalError("charting.json: \(error)")
        }
    }()

    private func validate() {
        for (name, l) in [("chords", chords), ("melody", melody)] {
            let n = l.tiers.count
            guard n >= 1, [l.easy, l.medium, l.hard].allSatisfy({ (1...n).contains($0) }),
                  l.tiers.allSatisfy({ $0.hits >= 1 && $0.gap >= 0 && ($0.space ?? .infinity) > $0.gap && $0.bonus > 0 })
            else { fatalError("charting.json: the \(name) ladder") }
        }
        guard adaptive.window >= 1, adaptive.ahead >= 0, adaptive.ahead < adaptive.window, adaptive.ease <= adaptive.climb
        else { fatalError("charting.json: adaptive") }
    }

    func ladder(_ part: Song.PartKey) -> Ladder { part == .chords ? chords : melody }

    /// The tier a fixed difficulty plays (nil on adaptive).
    func tier(_ difficulty: GameEngine.Difficulty, song: String, part: Song.PartKey) -> Int? {
        let l = ladder(part)
        if let own = songs[song]?[part.rawValue]?[difficulty.rawValue] { return max(1, min(l.tiers.count, own)) }
        switch difficulty {
        case .easy: return l.easy
        case .medium: return l.medium
        case .hard: return l.hard
        case .adaptive: return nil
        }
    }

    /// The set list's line for a difficulty.
    func line(_ difficulty: GameEngine.Difficulty, song: String, part: Song.PartKey) -> String {
        guard let t = tier(difficulty, song: song, part: part) else {
            let n = ladder(part).tiers.count
            return "Starts at level \(adaptive.start) of \(n). Clean \(adaptive.window) bars and it climbs a level; miss a few and it steps back."
        }
        return "Level \(t) of \(ladder(part).tiers.count). " + ladder(part).tier(t).line
    }

    /// Which of `notes` (the whole part, in time order) play at each tier: `[tier - 1][i]`.
    func masks(_ notes: [Song.Note], part: Song.PartKey, tempo: Int, ticksPerBeat: Int) -> [[Bool]] {
        let l = ladder(part)
        let secondsPerTick = 60 / (Double(tempo) * Double(ticksPerBeat))
        // Onsets: the notes that start on one tick, with the lightest weight among them.
        var onsets: [(t: Int, lv: Int, idx: [Int])] = []
        for (i, n) in notes.enumerated() {
            if let last = onsets.last, last.t == n.t {
                onsets[onsets.count - 1].idx.append(i)
                onsets[onsets.count - 1].lv = min(last.lv, n.lv)
            } else {
                onsets.append((n.t, n.lv, [i]))
            }
        }
        let rank: (Song.Note) -> Int = { n in l.keep?.firstIndex(of: n.r ?? "") ?? (l.keep?.count ?? 0) }
        return l.tiers.map { tier in
            var mask = Array(repeating: false, count: notes.count)
            let gapTicks = tier.gap / secondsPerTick
            var taken: [Int] = []  // onset ticks, sorted
            func fits(_ t: Int) -> Bool {
                var lo = 0, hi = taken.count
                while lo < hi { let m = (lo + hi) / 2; if taken[m] < t { lo = m + 1 } else { hi = m } }
                if lo < taken.count, Double(taken[lo] - t) < gapTicks - 0.001 { return false }
                if lo > 0, Double(t - taken[lo - 1]) < gapTicks - 0.001 { return false }
                return true
            }
            func take(_ o: (t: Int, lv: Int, idx: [Int])) {
                var lo = 0, hi = taken.count
                while lo < hi { let m = (lo + hi) / 2; if taken[m] < o.t { lo = m + 1 } else { hi = m } }
                taken.insert(o.t, at: lo)
                var kept = o.idx
                if let cap = tier.notes, kept.count > cap {
                    kept = Array(kept.sorted { (rank(notes[$0]), notes[$0].n) < (rank(notes[$1]), notes[$1].n) }.prefix(cap))
                }
                for i in kept { mask[i] = true }
            }
            // The hits the tier plays, heaviest first, then early first, wherever they fit the gap.
            for o in onsets.sorted(by: { ($0.lv, $0.t) < ($1.lv, $1.t) }) where o.lv <= tier.hits && fits(o.t) { take(o) }
            // Then the silences longer than `space`: each borrows the heaviest lighter hit inside
            // it that fits, the one nearest its middle, until none is too long or nothing fits.
            if let space = tier.space {
                let spaceTicks = space / secondsPerTick
                var changed = true
                while changed {
                    changed = false
                    var holes = zip(taken, taken.dropFirst()).filter { Double($1 - $0) > spaceTicks + 0.001 }
                    // The part's first and last onsets bound the silences before and after.
                    if let f = taken.first, let o = onsets.first, Double(f - o.t) > spaceTicks { holes.insert((o.t - 1, f), at: 0) }
                    if let l = taken.last, let o = onsets.last, Double(o.t - l) > spaceTicks { holes.append((l, o.t + 1)) }
                    if taken.isEmpty, let a = onsets.first, let z = onsets.last { holes = [(a.t - 1, z.t + 1)] }
                    for (a, z) in holes {
                        let mid = Double(a + z) / 2
                        let pick = onsets.filter { $0.t > a && $0.t < z && !taken.contains($0.t) && fits($0.t) }
                            .min { ($0.lv, abs(Double($0.t) - mid)) < ($1.lv, abs(Double($1.t) - mid)) }
                        if let o = pick { take(o); changed = true }
                    }
                }
            }
            return mask
        }
    }
}
