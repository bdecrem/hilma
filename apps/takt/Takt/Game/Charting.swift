import Foundation

/// How a part becomes a level (Takt/Content/charting.json; CHARTING.md is the guide). A song
/// carries each part whole: every note has a weight (`lv`: 1 the hits the part stands on, 2
/// the groove, 3 the pushes and ornaments) and every chord note its role (root, third, …).
/// Each part has a ladder of tiers, easiest first; a tier says how many chord notes to keep,
/// which weights play, how close two onsets may come and how long a silence may last. Beginner,
/// Easy, Easy+, Medium and Hard name a tier each (a song may name its own), Adaptive walks the
/// ladder. A note's `from` keeps it off every tier under that number, in every pass.
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
        /// Beats: only onsets with a note at least this long, or as long as the part's usual
        /// weight-1 note (its median length) when that is shorter, so a line of short stabs keeps
        /// them all. A Beginner note shorter than a beat shows as a stub among the anchors.
        let minBeats: Double?

        /// The same tier with a song's own gap, space or minBeats (`Charting.songs`); space 0
        /// borrows nothing, minBeats 0 takes onsets of any length.
        func patched(_ p: Charting.TierPatch) -> Tier {
            Tier(line: line, notes: notes, hits: hits, gap: p.gap ?? gap,
                 space: p.space.map { $0 > 0 ? $0 : nil } ?? space, bonus: bonus, phrase: phrase,
                 fromAbove: fromAbove, minBeats: p.minBeats.map { $0 > 0 ? $0 : nil } ?? minBeats)
        }
    }

    /// A song's change to one tier of a ladder: a gap or a space of its own (0 = never borrows),
    /// or a minBeats of its own (Halsted's Beginner, 0.5: its solo has few notes a beat long, and
    /// at 1 the tier went 14 s without a note, CHARTING.md rule 24).
    struct TierPatch: Codable, Equatable {
        let gap: Double?
        let space: Double?
        var minBeats: Double? = nil
    }

    /// A song's changes to one part's ladder: a tier of its own for a difficulty, a phrase of
    /// its own (bars), and tier knobs by tier number (1-based).
    struct PartOverride: Codable, Equatable {
        let beginner: Int?
        let easy: Int?
        let easyPlus: Int?
        let medium: Int?
        let hard: Int?
        let phrase: Int?
        let tiers: [String: TierPatch]?

        enum CodingKeys: String, CodingKey {
            case beginner, easy, easyPlus = "easy+", medium, hard, phrase, tiers
        }

        func level(_ d: GameEngine.Difficulty) -> Int? {
            switch d {
            case .beginner: return beginner
            case .easy: return easy
            case .easyPlus: return easyPlus
            case .medium: return medium
            case .hard: return hard
            case .adaptive, .solo: return nil
            }
        }
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
        /// "easy+" in the file: the rung between Easy and Medium (0.1 (109)).
        let easyPlus: Int
        let medium: Int
        let hard: Int
        let tiers: [Tier]

        enum CodingKeys: String, CodingKey {
            case keep, phrase, beginner, easy, easyPlus = "easy+", medium, hard, tiers
        }

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
            ghosts = try c.decodeIfPresent(Ghosts.self, forKey: .ghosts)
        }

        /// When Adaptive puts rungs of its own between two tiers (`rungs`). Nil: the tiers alone.
        let ghosts: Ghosts?

        private enum CodingKeys: String, CodingKey {
            case start, resume, window, ahead, climb, ease, judged, spreadMaxMs, afterClimb, afterDrop, missRun, floorBelowStart, ghosts
        }
    }

    /// A step adding at least `share` of the lower tier's notes or `keys` new keys gets a rung of
    /// Adaptive's own; one adding `twoShare` or `twoKeys` gets two.
    struct Ghosts: Decodable {
        let share: Double
        let keys: Int
        let twoShare: Double
        let twoKeys: Int
    }

    /// A rung of Adaptive's ladder: a tier (`step` 0), or one of the `steps` rungs Adaptive puts
    /// between it and the tier above (`step` 1…steps), never offered as a difficulty.
    struct Rung: Equatable {
        let tier: Int
        let step: Int
        let steps: Int
        let mask: [Bool]

        /// The tier's number, a ghost's with its share of the way up ("4.5", "4.3").
        var name: String { step == 0 ? "\(tier)" : String(format: "%.1f", Double(tier) + Double(step) / Double(steps + 1)) }
        /// How far up from its tier, 0..<1.
        var fraction: Double { step == 0 ? 0 : Double(step) / Double(steps + 1) }
    }

    /// Adaptive's ladder (Bart, 2026-11-13, on Restlicht's melody: Easy "just two notes", Medium
    /// "5 notes / fingers, quite spread out", Adaptive toggling between them; "a little algorithm
    /// that can make up a difficulty in between… or 'ghost difficulties' not shown in the ui that
    /// are used for adaptive mode"). Every tier, and between two neighbours whose step is big
    /// (`Ghosts`), one or two rungs made from the two: the lower tier plus part of what the upper
    /// one adds, in this order: the notes it adds on the lower tier's own onsets (a chord's next
    /// note); then, on a melody, each new key with every note of it, nearest the lower tier's keys
    /// first, then the new onsets on the keys the hand already has (more of the tune); on a chords
    /// part the new onsets by weight, the heaviest first; each group of new onsets those on a beat
    /// before those between. A rung is cut where the notes added so far come nearest an even
    /// share, at a group's edge (a key never arrives half), and only where every rung adds 15% of
    /// the step. Each rung holds the one below and sits inside the one above, so the gap, the
    /// silence rule and Rock Band's rule (a climb never takes a note away) hold on every rung as
    /// on the tiers. `rungs` in src/lib/takt/charting.ts is the same (`charting-check.ts`).
    func rungs(_ notes: [Song.Note], masks: [[Bool]], part: Song.PartKey, ticksPerBeat: Int) -> [Rung] {
        var out: [Rung] = []
        for (ti, m) in masks.enumerated() {
            out.append(Rung(tier: ti + 1, step: 0, steps: 0, mask: m))
            guard ti + 1 < masks.count, let g = adaptive.ghosts else { continue }
            let up = masks[ti + 1]
            let extra = notes.indices.filter { up[$0] && !m[$0] }
            let below = notes.indices.filter { m[$0] }
            guard !extra.isEmpty else { continue }
            let ticks = Set(below.map { notes[$0].t })
            let keys = Set(below.map { notes[$0].n })
            var newKeys: [Int] = []
            for i in extra where !keys.contains(notes[i].n) && !newKeys.contains(notes[i].n) { newKeys.append(notes[i].n) }
            let room = Double(max(1, below.count))
            guard Double(extra.count) >= g.share * room || newKeys.count >= g.keys else { continue }
            func beats(_ group: [Int]) -> [[Int]] {
                [group.filter { notes[$0].t % ticksPerBeat == 0 }, group.filter { notes[$0].t % ticksPerBeat != 0 }]
            }
            var units: [[Int]] = [extra.filter { ticks.contains(notes[$0].t) }]
            let fresh = extra.filter { !ticks.contains(notes[$0].t) }
            if part == .melody {
                func near(_ k: Int) -> Int { keys.map { abs($0 - k) }.min() ?? 0 }
                func count(_ k: Int) -> Int { fresh.filter { notes[$0].n == k }.count }
                newKeys.sort { (near($0), -count($0), $0) < (near($1), -count($1), $1) }
                for k in newKeys { units.append(fresh.filter { notes[$0].n == k }) }
                units += beats(fresh.filter { keys.contains(notes[$0].n) })
            } else {
                var weight: [Int: Int] = [:]
                for i in fresh { weight[notes[i].t] = min(weight[notes[i].t] ?? 9, notes[i].lv) }
                for lv in 1...3 { units += beats(fresh.filter { weight[notes[$0].t] == lv }) }
            }
            let us = units.filter { !$0.isEmpty }
            var cum = [0]
            for u in us { cum.append(cum.last! + u.count) }
            let least = 0.15 * Double(extra.count)
            func cuts(_ steps: Int) -> [Int]? {
                var out: [Int] = []
                var prev = 0
                for j in 1...steps {
                    let target = Double(j * extra.count) / Double(steps + 1)
                    var best = -1
                    if prev + 1 <= us.count - (steps - j) - 1 {
                        for cut in (prev + 1)...(us.count - (steps - j) - 1) where best < 0 || abs(Double(cum[cut]) - target) < abs(Double(cum[best]) - target) {
                            best = cut
                        }
                    }
                    if best < 0 { return nil }
                    out.append(best)
                    prev = best
                }
                let edges = [0] + out + [us.count]
                return zip(edges, edges.dropFirst()).allSatisfy { Double(cum[$1] - cum[$0]) >= least } ? out : nil
            }
            let two = Double(extra.count) >= g.twoShare * room || newKeys.count >= g.twoKeys
            guard let cs = (two ? cuts(2) : nil) ?? cuts(1) else { continue }
            for (j, cut) in cs.enumerated() {
                var mask = m
                for u in us.prefix(cut) { for i in u { mask[i] = true } }
                out.append(Rung(tier: ti + 1, step: j + 1, steps: cs.count, mask: mask))
            }
        }
        return out
    }

    let chords: Ladder
    let melody: Ladder
    let adaptive: Adaptive
    /// Per song, per part: a tier instead of the ladder's for a difficulty (`"easy": 2`), a
    /// `phrase` (bars) instead of the ladder's, and a gap or space of its own on a tier
    /// (`"tiers": {"2": {"space": 0}}`). Slow Burn melody since 0.1 (59): its Easy is tier 2
    /// with no silence-borrowing and a chorus-long phrase, so Easy is the tune's anchors, about
    /// one a bar (the ladder's two-bar cover and 1.8 s borrowing put it near the top).
    private(set) var songs: [String: [String: PartOverride]]

    /// The same charting with a song's own override (a mod's, from its bundle) in `songs`.
    func overriding(song: String, with override: [String: PartOverride]) -> Charting {
        var c = self
        c.songs[song] = override
        return c
    }

    /// The phrase (bars) the song's part keeps every key in: the song's own, or the ladder's.
    func phrase(song: String, part: Song.PartKey) -> Int? {
        if let own = songs[song]?[part.rawValue]?.phrase { return max(1, own) }
        return ladder(part).phrase
    }

    /// The ladder's tiers as the song plays them: the song's patches applied.
    func tiers(song: String, part: Song.PartKey) -> [Tier] {
        let l = ladder(part)
        guard let patches = songs[song]?[part.rawValue]?.tiers else { return l.tiers }
        return l.tiers.enumerated().map { i, t in patches[String(i + 1)].map(t.patched) ?? t }
    }

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
            guard n >= 1, [l.beginner, l.easy, l.easyPlus, l.medium, l.hard].allSatisfy({ (1...n).contains($0) }),
                  l.beginner < l.easy, l.easy <= l.easyPlus, l.easyPlus <= l.medium, l.medium <= l.hard,
                  l.tiers.allSatisfy({ $0.hits >= 1 && $0.gap >= 0 && ($0.space ?? .infinity) > $0.gap && $0.bonus > 0 && ($0.phrase ?? 1) >= 1 && ($0.minBeats ?? 0) >= 0 }),
                  l.tiers.dropFirst().allSatisfy({ $0.fromAbove != true }), !(l.tiers[0].fromAbove == true && n < 2),
                  (l.phrase ?? 1) >= 1
            else { fatalError("charting.json: the \(name) ladder") }
            // Every tier is the one below plus more (`masks` seeds each tier with the last), so
            // a tier may only loosen the rules: a smaller gap, heavier hits, bigger chords.
            func loosens(_ tiers: [Tier], _ what: String) {
                for (lo, hi) in zip(tiers, tiers.dropFirst()) {
                    guard hi.gap <= lo.gap, hi.hits >= lo.hits, (hi.notes ?? .max) >= (lo.notes ?? .max),
                          (hi.phrase ?? l.phrase ?? 1) <= (lo.phrase ?? l.phrase ?? 1),
                          (hi.minBeats ?? 0) <= (lo.minBeats ?? 0), ((hi.space ?? .infinity) > hi.gap) else {
                        fatalError("charting.json: \(what) tightens a rule going up (gap, hits, notes and phrase may only loosen)")
                    }
                }
            }
            loosens(l.tiers, "the \(name) ladder")
            for (song, parts) in songs {
                guard let o = parts[name] else { continue }
                guard [o.beginner, o.easy, o.easyPlus, o.medium, o.hard].allSatisfy({ $0 == nil || (1...n).contains($0!) }),
                      (o.phrase ?? 1) >= 1, (o.tiers ?? [:]).keys.allSatisfy({ Int($0).map { (1...n).contains($0) } ?? false }),
                      (o.tiers ?? [:]).values.allSatisfy({ ($0.gap ?? 0) >= 0 && ($0.space ?? 0) >= 0 && ($0.minBeats ?? 0) >= 0 })
                else { fatalError("charting.json: songs.\(song).\(name)") }
                loosens(tiers(song: song, part: name == "chords" ? .chords : .melody), "songs.\(song).\(name)")
            }
        }
        guard (1...melody.tiers.count).contains(adaptive.start), (1...chords.tiers.count).contains(adaptive.start),
              adaptive.window >= 1, adaptive.ahead >= 0, adaptive.ahead < adaptive.window, adaptive.ease <= adaptive.climb,
              adaptive.resume >= 0, adaptive.afterClimb >= 0, adaptive.afterDrop >= 0, (adaptive.missRun ?? 1) >= 1,
              adaptive.floorBelowStart >= 0, (adaptive.spreadMaxMs ?? 1) > 0,
              adaptive.ghosts.map({ $0.share > 0 && $0.keys >= 1 && $0.twoShare >= $0.share && $0.twoKeys >= $0.keys }) ?? true
        else { fatalError("charting.json: adaptive") }
    }

    func ladder(_ part: Song.PartKey) -> Ladder { part == .chords ? chords : melody }

    /// The tier a fixed difficulty plays (nil on adaptive).
    func tier(_ difficulty: GameEngine.Difficulty, song: String, part: Song.PartKey) -> Int? {
        let l = ladder(part)
        if let own = songs[song]?[part.rawValue]?.level(difficulty) { return max(1, min(l.tiers.count, own)) }
        switch difficulty {
        case .beginner: return l.beginner
        case .easy: return l.easy
        case .easyPlus: return l.easyPlus
        case .medium: return l.medium
        case .hard: return l.hard
        case .adaptive: return nil
        // The teacher's whole track is played as written: the top of its own ladder.
        case .solo: return l.tiers.count
        }
    }

    /// The set list's line for a difficulty.
    func line(_ difficulty: GameEngine.Difficulty, song: String, part: Song.PartKey) -> String {
        if difficulty == .solo { return "The teacher's whole track from your take, every note as written." }
        guard let t = tier(difficulty, song: song, part: part) else {
            let n = ladder(part).tiers.count
            return "Level \(adaptive.start) of \(n) the first time, then just under where your last run got to. Clean bars climb it a level at a time, with steps of its own between two levels where the jump is big; misses and wrong keys step it back at once, and the band plays whatever the level leaves out."
        }
        return "Level \(t) of \(ladder(part).tiers.count). " + ladder(part).tier(t).line
    }

    /// Which of `notes` (the whole part, in time order) play at each tier: `[tier - 1][i]`.
    func masks(_ notes: [Song.Note], song: String, part: Song.PartKey, tempo: Int, ticksPerBeat: Int, ticksPerBar: Int) -> [[Bool]] {
        let l = ladder(part)
        let ladderPhrase = phrase(song: song, part: part)
        let tiers = tiers(song: song, part: part)
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
        // The part's usual weight-1 length: the median (the longest of a tie).
        let anchors = notes.filter { $0.lv == 1 }.map(\.len).sorted()
        let usualLength = anchors.isEmpty ? Int.max : anchors[anchors.count / 2]
        let rank: (Song.Note) -> Int = { n in l.keep?.firstIndex(of: n.r ?? "") ?? (l.keep?.count ?? 0) }
        // Each tier starts from the one below it and adds (Rock Band's rule: everything on a lower
        // difficulty is on the higher one), so climbing a level never takes a note away.
        var seed: Set<Int> = []
        // The phrase picks the bottom tier worked out for the tier above (below): that tier takes
        // them first, so it charts exactly as it would with nothing under it.
        var preferred: Set<Int> = []
        // What the tier above the bottom one takes by rule with nothing under it (its phrase
        // picks and its hits): that tier is seeded with it, so whatever Beginner chose among it,
        // the tier charts exactly as it would without Beginner (its borrows follow from the same
        // taken set). Since 0.1 (60): a Beginner anchor taken first used to count a key as
        // covered and drop the cover's own pick for it.
        var aboveRule: Set<Int> = []
        typealias Onset = (t: Int, lv: Int, idx: [Int])
        return tiers.enumerated().map { ti, tier in
            var mask = Array(repeating: false, count: notes.count)
            // What this tier sees at all: a note with `from` is on no chart under that tier, in
            // any pass (the phrase cover too), so a figure's new keys don't leak into the levels
            // under it (Blue Lantern II's hand moves, 0.1 (109)). An onset keeps the notes the
            // tier sees, the lightest weight among them.
            func seen(by tierNumber: Int) -> [Onset] {
                onsets.compactMap { o in
                    let idx = o.idx.filter { (notes[$0].from ?? 1) <= tierNumber }
                    return idx.isEmpty ? nil : (t: o.t, lv: idx.map { notes[$0].lv }.min()!, idx: idx)
                }
            }
            let visible = seen(by: ti + 1)
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
                    // By the keep order, low first; a role already kept (the root an octave up)
                    // goes last, so two notes are root and third (or fifth), never an octave.
                    let sorted = kept.sorted { (rank(notes[$0]), notes[$0].n) < (rank(notes[$1]), notes[$1].n) }
                    var seen = Set<String>(), firsts: [Int] = [], repeats: [Int] = []
                    for i in sorted {
                        if seen.insert(notes[i].r ?? "").inserted { firsts.append(i) } else { repeats.append(i) }
                    }
                    kept = Array((firsts + repeats).prefix(cap))
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
                    // A phrase whose keys can't all fit (a fast run's keys under a wide gap: Halsted's
                    // stop time on a chorus-long phrase) would try every subset; past `budget` steps
                    // the widest cover found so far stands. Every song before Halsted finishes far
                    // under it, so their charts are what an unbounded search gives.
                    var steps = 0
                    let budget = 200_000
                    func search(_ k: Int) -> Bool {
                        if k == open.count {
                            if chosen.count > best.count { best = chosen }
                            return chosen.count == open.count
                        }
                        steps += 1
                        if steps > budget { return false }
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
            func chart(_ t: Tier, pool: [Onset], prefer: Set<Int>) -> (picks: Set<Int>, rule: Set<Int>) {
                gapTicks = t.gap / secondsPerTick
                let before = isTaken
                if let phrase = t.phrase ?? ladderPhrase {
                    let span = phrase * ticksPerBar
                    phrasePass(pool, span: span, slot: ladderPhrase.map { $0 * ticksPerBar }.flatMap { $0 < span ? $0 : nil }, prefer: prefer)
                }
                let byPhrase = isTaken.subtracting(before)
                // The hits the tier plays, heaviest first, then early first, wherever they fit the gap.
                for o in pool.sorted(by: { ($0.lv, $0.t) < ($1.lv, $1.t) }) where o.lv <= t.hits && !isTaken.contains(o.t) && fits(o.t) { take(o) }
                // What the tier took by rule: its phrase picks (a ladder with a phrase) or its
                // hits, and, for the bottom tier's pool, both (not what it borrows for a silence,
                // below). Since 0.1 (59) Beginner may choose among the hits too: a song with a
                // chorus-long phrase (Slow Burn) has few phrase picks a chorus, and Beginner cut
                // from those alone left four bars empty.
                let picks = (t.phrase ?? ladderPhrase) != nil ? byPhrase : isTaken.subtracting(before)
                let rule = isTaken.subtracting(before)
                // Then the silences longer than `space`: each borrows the heaviest lighter hit inside
                // it that fits, the one nearest its middle, until none is too long or nothing fits.
                if let space = t.space {
                    let spaceTicks = space / secondsPerTick
                    var changed = true
                    while changed {
                        changed = false
                        var holes = zip(taken, taken.dropFirst()).filter { Double($1 - $0) > spaceTicks + 0.001 }
                        // The part's first and last onsets bound the silences before and after.
                        if let f = taken.first, let o = visible.first, Double(f - o.t) > spaceTicks { holes.insert((o.t - 1, f), at: 0) }
                        if let l = taken.last, let o = visible.last, Double(o.t - l) > spaceTicks { holes.append((l, o.t + 1)) }
                        if taken.isEmpty, let a = visible.first, let z = visible.last { holes = [(a.t - 1, z.t + 1)] }
                        for (a, z) in holes {
                            let mid = Double(a + z) / 2
                            let pick = pool.filter { $0.t > a && $0.t < z && !isTaken.contains($0.t) && fits($0.t) }
                                .min { ($0.lv, abs(Double($0.t) - mid)) < ($1.lv, abs(Double($1.t) - mid)) }
                            if let o = pick { take(o); changed = true }
                        }
                    }
                }
                return (picks, rule)
            }
            // The tier below, whole (its onsets fit this tier's gap: the ladder only loosens).
            for o in visible where seed.contains(o.t) { take(o) }
            if ti == 1, tiers[0].fromAbove == true {
                for o in visible where aboveRule.contains(o.t) && !isTaken.contains(o.t) && fits(o.t) { take(o) }
            }
            // The bottom tier (Beginner) is cut from the chart the tier above makes with nothing
            // under it: it takes its notes only among the onsets that chart takes by rule (its
            // phrase picks, or its hits; worked out here, then undone), and the tier above takes
            // those first. So adding a bottom tier changes nothing above it, where a free anchor
            // a tick or two from the only D of a phrase would block that D at the tier above and
            // move its whole grid.
            // What a tier may take at all: an onset with a note long enough (`minBeats`, capped
            // at the part's usual weight-1 length).
            func allowed(_ t: Tier, _ pool: [Onset]) -> [Onset] {
                guard let beats = t.minBeats, beats > 0 else { return pool }
                let minLen = min(Int((beats * Double(ticksPerBeat)).rounded()), usualLength)
                return pool.filter { o in o.idx.contains { notes[$0].len >= minLen } }
            }
            var pool = visible
            if ti == 0, tier.fromAbove == true {
                let saved = (taken, isTaken, mask)
                let above = chart(tiers[1], pool: allowed(tiers[1], seen(by: 2)), prefer: [])
                (taken, isTaken, mask) = saved
                preferNext = above.picks
                aboveRule = above.rule
                pool = visible.filter { above.rule.contains($0.t) }
            }
            _ = chart(tier, pool: allowed(tier, pool), prefer: prefer)
            return mask
        }
    }
}
