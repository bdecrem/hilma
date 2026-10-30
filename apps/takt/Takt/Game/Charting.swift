import Foundation

/// How a part becomes a level (Takt/Content/charting.json; CHARTING.md is the guide). A song
/// carries each part whole: every note has a weight (`lv`: 1 the hits the part stands on, 2
/// the groove, 3 the pushes and ornaments) and every chord note its role (root, third, …).
/// Each part has a ladder of tiers, easiest first; a tier says how many chord notes to keep,
/// which weights play, how close two onsets may come and how long a silence may last. Beginner,
/// Easy, Medium and Hard name a tier each (a song may name its own), Adaptive walks the ladder.
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
        /// Bars: this tier's own phrase (see the ladder's), for a tier sparser than the ladder's
        /// phrase allows (Beginner keeps every key of each four bars, not each two).
        let phrase: Int?
        /// The bottom tier only: cut from the chart the tier above makes with nothing under it
        /// (it takes its notes only among the onsets that chart takes by rule, and the tier above
        /// takes those first), so this tier changes nothing above it. Beginner.
        let fromAbove: Bool?
    }

    struct Ladder: Decodable {
        /// Roles in the order a chord keeps them (the chords part).
        let keep: [String]?
        /// Bars: every key the part plays in each phrase this long stays at every tier (its
        /// heaviest, earliest onset that fits the gap), before the weights fill in. Thinning the
        /// rhythm must never thin the line down to one key. Nil: the weights alone.
        let phrase: Int?
        let beginner: Int
        let easy: Int
        let medium: Int
        let hard: Int
        let tiers: [Tier]

        /// Tier n, 1-based.
        func tier(_ n: Int) -> Tier { tiers[max(1, min(tiers.count, n)) - 1] }
    }

    struct Adaptive: Decodable {
        /// The tier a first run starts on.
        let start: Int
        /// Later runs start this many tiers under the top of the last adaptive run of the song
        /// and part.
        let resume: Int
        /// Bars in a block: the tier changes between blocks.
        let window: Int
        /// Bars before a block starts that its tier is decided.
        let ahead: Int
        /// A window at or above this hit rate climbs a tier, below `ease` drops one.
        let climb: Double
        let ease: Double
        /// Notes judged in a window before it moves.
        let judged: Int
        /// No climb while the window's hits scatter more than this (median absolute offset, ms):
        /// lucky isn't solid. Nil: the hit rate alone.
        let spreadMaxMs: Double?
        /// Blocks held after a climb (the player meets the new tier for a whole phrase before
        /// the next) and after a drop (long enough to recover; this is what stops ping-pong).
        let afterClimb: Int
        let afterDrop: Int
        /// This many misses in a row drop a tier at the next decision, whatever the rate. Nil: never.
        let missRun: Int?
        /// A run never sinks more than this under the tier it started on (and never under 1).
        let floorBelowStart: Int

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            start = try c.decode(Int.self, forKey: .start)
            resume = try c.decodeIfPresent(Int.self, forKey: .resume) ?? 0
            window = try c.decode(Int.self, forKey: .window)
            ahead = try c.decode(Int.self, forKey: .ahead)
            climb = try c.decode(Double.self, forKey: .climb)
            ease = try c.decode(Double.self, forKey: .ease)
            judged = try c.decode(Int.self, forKey: .judged)
            spreadMaxMs = try c.decodeIfPresent(Double.self, forKey: .spreadMaxMs)
            afterClimb = try c.decodeIfPresent(Int.self, forKey: .afterClimb) ?? 0
            afterDrop = try c.decodeIfPresent(Int.self, forKey: .afterDrop) ?? 0
            missRun = try c.decodeIfPresent(Int.self, forKey: .missRun)
            floorBelowStart = try c.decodeIfPresent(Int.self, forKey: .floorBelowStart) ?? Int.max
        }

        private enum CodingKeys: String, CodingKey {
            case start, resume, window, ahead, climb, ease, judged, spreadMaxMs, afterClimb, afterDrop, missRun, floorBelowStart
        }
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
            guard n >= 1, [l.beginner, l.easy, l.medium, l.hard].allSatisfy({ (1...n).contains($0) }),
                  l.beginner < l.easy, l.easy <= l.medium, l.medium <= l.hard,
                  l.tiers.allSatisfy({ $0.hits >= 1 && $0.gap >= 0 && ($0.space ?? .infinity) > $0.gap && $0.bonus > 0 && ($0.phrase ?? 1) >= 1 }),
                  l.tiers.dropFirst().allSatisfy({ $0.fromAbove != true }), !(l.tiers[0].fromAbove == true && n < 2),
                  (l.phrase ?? 1) >= 1
            else { fatalError("charting.json: the \(name) ladder") }
            // Every tier is the one below plus more (`masks` seeds each tier with the last), so
            // a tier may only loosen the rules: a smaller gap, heavier hits, bigger chords.
            for (lo, hi) in zip(l.tiers, l.tiers.dropFirst()) {
                guard hi.gap <= lo.gap, hi.hits >= lo.hits, (hi.notes ?? .max) >= (lo.notes ?? .max),
                      (hi.phrase ?? l.phrase ?? 1) <= (lo.phrase ?? l.phrase ?? 1) else {
                    fatalError("charting.json: the \(name) ladder tightens a rule going up (gap, hits, notes and phrase may only loosen)")
                }
            }
        }
        guard (1...melody.tiers.count).contains(adaptive.start), (1...chords.tiers.count).contains(adaptive.start),
              adaptive.window >= 1, adaptive.ahead >= 0, adaptive.ahead < adaptive.window, adaptive.ease <= adaptive.climb,
              adaptive.resume >= 0, adaptive.afterClimb >= 0, adaptive.afterDrop >= 0, (adaptive.missRun ?? 1) >= 1,
              adaptive.floorBelowStart >= 0, (adaptive.spreadMaxMs ?? 1) > 0
        else { fatalError("charting.json: adaptive") }
    }

    func ladder(_ part: Song.PartKey) -> Ladder { part == .chords ? chords : melody }

    /// The tier a fixed difficulty plays (nil on adaptive).
    func tier(_ difficulty: GameEngine.Difficulty, song: String, part: Song.PartKey) -> Int? {
        let l = ladder(part)
        if let own = songs[song]?[part.rawValue]?[difficulty.rawValue] { return max(1, min(l.tiers.count, own)) }
        switch difficulty {
        case .beginner: return l.beginner
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
            return "Level \(adaptive.start) of \(n) the first time, then just under where your last run got to. Clean bars climb it a level at a time, misses and wrong keys step it back at once, and the band plays whatever the level leaves out."
        }
        return "Level \(t) of \(ladder(part).tiers.count). " + ladder(part).tier(t).line
    }

    /// Which of `notes` (the whole part, in time order) play at each tier: `[tier - 1][i]`.
    func masks(_ notes: [Song.Note], part: Song.PartKey, tempo: Int, ticksPerBeat: Int, ticksPerBar: Int) -> [[Bool]] {
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
        // Each tier starts from the one below it and adds (Rock Band's rule: everything on a lower
        // difficulty is on the higher one), so climbing a level never takes a note away.
        var seed: Set<Int> = []
        // The phrase picks the bottom tier worked out for the tier above (below): that tier takes
        // them first, so it charts exactly as it would with nothing under it.
        var preferred: Set<Int> = []
        typealias Onset = (t: Int, lv: Int, idx: [Int])
        return l.tiers.enumerated().map { ti, tier in
            var mask = Array(repeating: false, count: notes.count)
            var gapTicks = tier.gap / secondsPerTick
            var taken: [Int] = []  // onset ticks, sorted
            var isTaken: Set<Int> = []
            let prefer = preferred
            var preferNext: Set<Int> = []
            defer { seed = isTaken; preferred = preferNext }
            func fits(_ t: Int) -> Bool {
                var lo = 0, hi = taken.count
                while lo < hi { let m = (lo + hi) / 2; if taken[m] < t { lo = m + 1 } else { hi = m } }
                if lo < taken.count, Double(taken[lo] - t) < gapTicks - 0.001 { return false }
                if lo > 0, Double(t - taken[lo - 1]) < gapTicks - 0.001 { return false }
                return true
            }
            func take(_ o: Onset) {
                var lo = 0, hi = taken.count
                while lo < hi { let m = (lo + hi) / 2; if taken[m] < o.t { lo = m + 1 } else { hi = m } }
                taken.insert(o.t, at: lo)
                isTaken.insert(o.t)
                var kept = o.idx
                if let cap = tier.notes, kept.count > cap {
                    kept = Array(kept.sorted { (rank(notes[$0]), notes[$0].n) < (rank(notes[$1]), notes[$1].n) }.prefix(cap))
                }
                for i in kept { mask[i] = true }
            }
            func untake(_ o: Onset) {
                if let at = taken.firstIndex(of: o.t) { taken.remove(at: at) }
                isTaken.remove(o.t)
                for i in o.idx { mask[i] = false }
            }
            // Every key of each phrase, each at its heaviest, earliest onset that fits: a
            // depth-first search over the keys (a key may also be skipped), backtracking when a
            // later key has nothing left that fits (one key's early pick can crowd another's
            // only onsets), for the widest cover a phrase can have; the first widest found wins,
            // so the order candidates are tried in is the preference: `prefer` first, then the
            // heaviest, then (with `slot`, ticks) one key a slot where it can, so a long phrase
            // has a note every couple of bars, then the earliest.
            func phrasePass(_ pool: [Onset], span: Int, slot: Int?, prefer: Set<Int>) {
                guard let last = pool.last?.t else { return }
                for p in 0...(last / span) {
                    let window = pool.filter { $0.t >= p * span && $0.t < (p + 1) * span }.sorted { ($0.lv, $0.t) < ($1.lv, $1.t) }
                    var keys: [Int] = []
                    for o in window { for i in o.idx where !keys.contains(notes[i].n) { keys.append(notes[i].n) } }
                    let open = keys.filter { key in !window.contains { o in isTaken.contains(o.t) && o.idx.contains { notes[$0].n == key } } }
                    var chosen: [Int] = []
                    var best: [Int] = []
                    func search(_ k: Int) -> Bool {
                        if k == open.count {
                            if chosen.count > best.count { best = chosen }
                            return chosen.count == open.count
                        }
                        if chosen.count + (open.count - k) <= best.count { return false }  // can't beat the best
                        var cands = window.indices.filter { wi in
                            let o = window[wi]
                            return !isTaken.contains(o.t) && o.idx.contains(where: { notes[$0].n == open[k] }) && fits(o.t)
                        }
                        let used = Set(chosen.map { wi in slot.map { (window[wi].t - p * span) / $0 } ?? 0 })
                        cands.sort { a, b in
                            let pa = prefer.contains(window[a].t) ? 0 : 1, pb = prefer.contains(window[b].t) ? 0 : 1
                            let ua = slot.map { used.contains((window[a].t - p * span) / $0) ? 1 : 0 } ?? 0
                            let ub = slot.map { used.contains((window[b].t - p * span) / $0) ? 1 : 0 } ?? 0
                            return (pa, window[a].lv, ua, window[a].t) < (pb, window[b].lv, ub, window[b].t)
                        }
                        for wi in cands {
                            let o = window[wi]
                            take(o)
                            chosen.append(wi)
                            if search(k + 1) { return true }
                            untake(o)
                            chosen.removeLast()
                        }
                        return search(k + 1)  // without this key
                    }
                    if !search(0) { for wi in best { take(window[wi]) } }
                }
            }
            // A tier's three passes over `pool`: the phrase keys, the hits, the silences. Returns
            // what the tier took by rule: its phrase picks (a ladder with a phrase) or its hits,
            // not what it borrowed for a silence.
            func chart(_ t: Tier, pool: [Onset], prefer: Set<Int>) -> Set<Int> {
                gapTicks = t.gap / secondsPerTick
                let before = isTaken
                if let phrase = t.phrase ?? l.phrase {
                    let span = phrase * ticksPerBar
                    phrasePass(pool, span: span, slot: l.phrase.map { $0 * ticksPerBar }.flatMap { $0 < span ? $0 : nil }, prefer: prefer)
                }
                let byPhrase = isTaken.subtracting(before)
                // The hits the tier plays, heaviest first, then early first, wherever they fit the gap.
                for o in pool.sorted(by: { ($0.lv, $0.t) < ($1.lv, $1.t) }) where o.lv <= t.hits && !isTaken.contains(o.t) && fits(o.t) { take(o) }
                let picks = (t.phrase ?? l.phrase) != nil ? byPhrase : isTaken.subtracting(before)
                // Then the silences longer than `space`: each borrows the heaviest lighter hit inside
                // it that fits, the one nearest its middle, until none is too long or nothing fits.
                if let space = t.space {
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
                            let pick = pool.filter { $0.t > a && $0.t < z && !isTaken.contains($0.t) && fits($0.t) }
                                .min { ($0.lv, abs(Double($0.t) - mid)) < ($1.lv, abs(Double($1.t) - mid)) }
                            if let o = pick { take(o); changed = true }
                        }
                    }
                }
                return picks
            }
            // The tier below, whole (its onsets fit this tier's gap: the ladder only loosens).
            for o in onsets where seed.contains(o.t) { take(o) }
            // The bottom tier (Beginner) is cut from the chart the tier above makes with nothing
            // under it: it takes its notes only among the onsets that chart takes by rule (its
            // phrase picks, or its hits; worked out here, then undone), and the tier above takes
            // those first. So adding a bottom tier changes nothing above it, where a free anchor
            // a tick or two from the only D of a phrase would block that D at the tier above and
            // move its whole grid.
            var pool = onsets
            if ti == 0, tier.fromAbove == true {
                let saved = (taken, isTaken, mask)
                preferNext = chart(l.tiers[1], pool: onsets, prefer: [])
                (taken, isTaken, mask) = saved
                pool = onsets.filter { preferNext.contains($0.t) }
            }
            _ = chart(tier, pool: pool, prefer: prefer)
            return mask
        }
    }
}
