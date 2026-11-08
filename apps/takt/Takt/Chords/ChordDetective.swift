import Foundation

/// Chord Detective (0.1 (117)): hold any keys and Takt names what you play, spelled the way the
/// chord spells it; play a few chords and it spots the famous progressions among them. Pure: the
/// sheet (`ChordSheet`) feeds it the held keys, the checks feed it lists of notes.
enum ChordDetective {
    /// A family, for matching progressions: major (with its sixths, sevenths, nines and the power
    /// chord), minor, dominant, and the rest (diminished, augmented, suspended).
    enum Family { case major, minor, dominant, power, other, suspended }

    struct Quality {
        let suffix: String
        let long: String
        let intervals: [Int]
        let family: Family
    }

    /// In priority order: when one set of keys spells two chords from the same bass, the earlier wins.
    static let qualities: [Quality] = [
        Quality(suffix: "", long: "major", intervals: [0, 4, 7], family: .major),
        Quality(suffix: "m", long: "minor", intervals: [0, 3, 7], family: .minor),
        Quality(suffix: "7", long: "dominant seventh", intervals: [0, 4, 7, 10], family: .dominant),
        Quality(suffix: "maj7", long: "major seventh", intervals: [0, 4, 7, 11], family: .major),
        Quality(suffix: "m7", long: "minor seventh", intervals: [0, 3, 7, 10], family: .minor),
        Quality(suffix: "dim", long: "diminished", intervals: [0, 3, 6], family: .other),
        Quality(suffix: "aug", long: "augmented", intervals: [0, 4, 8], family: .other),
        Quality(suffix: "sus4", long: "suspended fourth", intervals: [0, 5, 7], family: .suspended),
        Quality(suffix: "sus2", long: "suspended second", intervals: [0, 2, 7], family: .suspended),
        Quality(suffix: "6", long: "major sixth", intervals: [0, 4, 7, 9], family: .major),
        Quality(suffix: "m6", long: "minor sixth", intervals: [0, 3, 7, 9], family: .minor),
        Quality(suffix: "m7♭5", long: "half-diminished", intervals: [0, 3, 6, 10], family: .other),
        Quality(suffix: "dim7", long: "diminished seventh", intervals: [0, 3, 6, 9], family: .other),
        Quality(suffix: "m(maj7)", long: "minor major seventh", intervals: [0, 3, 7, 11], family: .minor),
        Quality(suffix: "7sus4", long: "dominant seventh, suspended fourth", intervals: [0, 5, 7, 10], family: .dominant),
        Quality(suffix: "add9", long: "major, added ninth", intervals: [0, 2, 4, 7], family: .major),
        Quality(suffix: "m(add9)", long: "minor, added ninth", intervals: [0, 2, 3, 7], family: .minor),
        Quality(suffix: "9", long: "dominant ninth", intervals: [0, 2, 4, 7, 10], family: .dominant),
        Quality(suffix: "maj9", long: "major ninth", intervals: [0, 2, 4, 7, 11], family: .major),
        Quality(suffix: "m9", long: "minor ninth", intervals: [0, 2, 3, 7, 10], family: .minor),
        Quality(suffix: "7♯9", long: "dominant seventh, sharp nine: the Hendrix chord", intervals: [0, 3, 4, 7, 10], family: .dominant),
        Quality(suffix: "7", long: "dominant seventh, no fifth", intervals: [0, 4, 10], family: .dominant),
        Quality(suffix: "maj7", long: "major seventh, no fifth", intervals: [0, 4, 11], family: .major),
        Quality(suffix: "m7", long: "minor seventh, no fifth", intervals: [0, 3, 10], family: .minor),
        Quality(suffix: "5", long: "power chord", intervals: [0, 7], family: .power),
    ]

    static let letters: [Character] = ["C", "D", "E", "F", "G", "A", "B"]
    static let naturals = [0, 2, 4, 5, 7, 9, 11]
    /// Interval above the root → (letters up from the root's, the degree as written).
    static let degrees: [Int: (step: Int, label: String)] = [
        0: (0, "R"), 1: (1, "♭2"), 2: (1, "2"), 3: (2, "♭3"), 4: (2, "3"), 5: (3, "4"), 6: (4, "♭5"),
        7: (4, "5"), 8: (4, "♯5"), 9: (5, "6"), 10: (6, "♭7"), 11: (6, "7"),
    ]
    /// Roots as players write them: minor chords on C♯, F♯, G♯; major ones on D♭, A♭.
    static let minorRoots = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"]
    static let majorRoots = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]
    static let intervalNames = ["Octave", "Minor second", "Major second", "Minor third", "Major third", "Perfect fourth",
                                "Tritone", "Perfect fifth", "Minor sixth", "Major sixth", "Minor seventh", "Major seventh"]

    struct Reading: Equatable {
        enum Kind: Equatable { case note, interval, chord, unknown }
        let kind: Kind
        /// Big: "C7", "Am/E", "Major third", "?".
        let display: String
        /// Under it: "C dominant seventh", "A minor, E in the bass", "C up to E".
        let long: String
        /// The keys held, upward from the bass, each once, spelled in the chord.
        let notes: [String]
        /// A chord's degrees ("R", "3", "5", "♭7"); empty otherwise.
        let degrees: [String]
        /// A chord's root (pitch class) and family; nil / .other otherwise.
        let root: Int?
        let family: Family
        let pitchClasses: Set<Int>
    }

    static func pc(_ n: Int) -> Int { ((n % 12) + 12) % 12 }

    static func rootName(_ pc: Int, family: Family) -> String {
        family == .minor || family == .other ? minorRoots[pc] : majorRoots[pc]
    }

    /// The note `interval` above a root spelled `root`, on the letter its degree names; a double
    /// sharp or flat falls back to the plain name.
    static func spell(root: String, interval: Int, pc: Int) -> String {
        guard let first = root.first, let rl = letters.firstIndex(of: first), let degree = degrees[interval] else {
            return majorRoots[pc]
        }
        let li = (rl + degree.step) % 7
        var acc = (pc - naturals[li] + 12) % 12
        if acc > 6 { acc -= 12 }
        guard abs(acc) <= 1 else { return majorRoots[pc] }
        return String(letters[li]) + (acc == 1 ? "♯" : acc == -1 ? "♭" : "")
    }

    /// What the held keys are. Nil for no keys.
    static func read(_ held: Set<Int>) -> Reading? {
        let notes = held.sorted()
        guard let low = notes.first, let high = notes.last else { return nil }
        let pcs = Set(notes.map(pc))
        let bass = pc(low)
        if pcs.count == 1 {
            let n = majorRoots[bass]
            return Reading(kind: .note, display: n, long: "One note", notes: [n], degrees: [], root: nil, family: .other, pitchClasses: pcs)
        }
        // Every key as the root, the bass first; an exact match of the intervals wins, a root in
        // the bass before one above it, then the earlier quality.
        var best: (rank: (Int, Int), root: Int, quality: Int)?
        for r in [bass] + pcs.sorted().filter({ $0 != bass }) {
            let rel = pcs.map { (($0 - r) % 12 + 12) % 12 }.sorted()
            for (qi, q) in qualities.enumerated() where rel == q.intervals {
                let rank = (r == bass ? 0 : 1, qi)
                if best == nil || rank < best!.rank { best = (rank, r, qi) }
            }
        }
        guard let found = best else {
            if pcs.count == 2 {
                let lo = majorRoots[bass], hi = majorRoots[pc(high)]
                return Reading(kind: .interval, display: intervalNames[pc(high - low)], long: "\(lo) up to \(hi)",
                               notes: [lo, hi], degrees: [], root: nil, family: .other, pitchClasses: pcs)
            }
            return Reading(kind: .unknown, display: "?", long: "Not one in the book. Move a key and see.",
                           notes: pcs.sorted().map { majorRoots[$0] }, degrees: [], root: nil, family: .other, pitchClasses: pcs)
        }
        let r = found.root
        let q = qualities[found.quality]
        let rootSpelled = rootName(r, family: q.family)
        var tones: [Int: String] = [:]
        for i in q.intervals { tones[(r + i) % 12] = spell(root: rootSpelled, interval: i, pc: (r + i) % 12) }
        var display = rootSpelled + q.suffix
        var long = "\(rootSpelled) \(q.long)"
        if bass != r, let b = tones[bass] {
            display += "/\(b)"
            long += ", \(b) in the bass"
        }
        var seen = Set<Int>()
        var ordered: [String] = []
        for n in notes where !seen.contains(pc(n)) {
            seen.insert(pc(n))
            ordered.append(tones[pc(n)] ?? majorRoots[pc(n)])
        }
        return Reading(kind: .chord, display: display, long: long, notes: ordered,
                       degrees: q.intervals.compactMap { degrees[$0]?.label }, root: r, family: q.family, pitchClasses: pcs)
    }

    // MARK: Progressions

    struct Progression {
        enum Step { case major, minor, dominant }
        let name: String
        let numerals: String
        let line: String
        /// Each chord's root above the first, and what it must be.
        let steps: [(offset: Int, kind: Step)]
        /// The key's tonic above the first chord, and whether the key is minor.
        let tonic: (offset: Int, minor: Bool)
    }

    struct Match: Equatable {
        let name: String
        /// "i–♭VII–♭VI–V in A minor".
        let numerals: String
        let line: String
    }

    static let progressions: [Progression] = [
        Progression(name: "The four chords of pop", numerals: "I–V–vi–IV",
                    line: "Let It Be, Don't Stop Believin', With or Without You. Same four chords.",
                    steps: [(0, .major), (7, .major), (9, .minor), (5, .major)], tonic: (0, false)),
        Progression(name: "Pop's four, starting sad", numerals: "vi–IV–I–V",
                    line: "The same four chords from the minor one. Half the radio lives here.",
                    steps: [(0, .minor), (8, .major), (3, .major), (10, .major)], tonic: (3, false)),
        Progression(name: "The fifties", numerals: "I–vi–IV–V",
                    line: "Doo-wop's walk: Stand By Me, Earth Angel, Every Breath You Take.",
                    steps: [(0, .major), (9, .minor), (5, .major), (7, .major)], tonic: (0, false)),
        Progression(name: "The Andalusian cadence", numerals: "i–♭VII–♭VI–V",
                    line: "Four steps down to the V: flamenco, Hit the Road Jack, Runaway.",
                    steps: [(0, .minor), (10, .major), (8, .major), (7, .major)], tonic: (0, true)),
        Progression(name: "Pachelbel's opening", numerals: "I–V–vi–iii",
                    line: "The first four chords of the Canon in D. Half the wedding playlist starts here.",
                    steps: [(0, .major), (7, .major), (9, .minor), (4, .minor)], tonic: (0, false)),
        Progression(name: "The ii–V–I", numerals: "ii–V–I",
                    line: "Jazz's favorite sentence: away, tension, home.",
                    steps: [(0, .minor), (5, .major), (10, .major)], tonic: (10, false)),
        Progression(name: "The rock turnaround", numerals: "I–♭VII–IV",
                    line: "The borrowed ♭VII: Gloria, Hey Jude's na-na-nas.",
                    steps: [(0, .major), (10, .major), (5, .major)], tonic: (0, false)),
        Progression(name: "The minor blues", numerals: "i–iv–v",
                    line: "Three minor chords, the changes of Takt's Level 3.",
                    steps: [(0, .minor), (5, .minor), (7, .minor)], tonic: (0, true)),
        Progression(name: "Three chords and the truth", numerals: "I–IV–V",
                    line: "Where rock'n'roll, folk and the blues start: La Bamba, Twist and Shout.",
                    steps: [(0, .major), (5, .major), (7, .major)], tonic: (0, false)),
        Progression(name: "That's the blues", numerals: "I7–IV7",
                    line: "Two sevenths a fourth apart: the move every 12-bar makes.",
                    steps: [(0, .dominant), (5, .dominant)], tonic: (0, false)),
    ]

    static func accepts(_ step: Progression.Step, _ family: Family) -> Bool {
        switch step {
        case .major: return family == .major || family == .dominant || family == .power
        case .minor: return family == .minor
        case .dominant: return family == .dominant
        }
    }

    /// The longest famous progression the last chords make, if any.
    static func detect(_ trail: [Reading]) -> Match? {
        for p in progressions.sorted(by: { $0.steps.count > $1.steps.count }) where trail.count >= p.steps.count {
            let tail = Array(trail.suffix(p.steps.count))
            guard let r0 = tail[0].root else { continue }
            let fits = zip(tail, p.steps).allSatisfy { c, s in
                guard let r = c.root else { return false }
                return ((r - r0) % 12 + 12) % 12 == s.offset && accepts(s.kind, c.family)
            }
            guard fits else { continue }
            let tonic = (r0 + p.tonic.offset) % 12
            let key = p.tonic.minor ? "\(minorRoots[tonic]) minor" : majorRoots[tonic]
            return Match(name: p.name, numerals: "\(p.numerals) in \(key)", line: p.line)
        }
        return nil
    }

    /// The chords played, newest last: a chord counts once the keys spell one. Adding or lifting
    /// keys on the same root without letting go refines it (C, then the B: Cmaj7); the same chord
    /// again after letting go doesn't count twice; a new root, even played legato, is a new chord.
    struct Trail: Equatable {
        private(set) var chords: [Reading] = []
        private(set) var match: Match?
        private var released = true

        /// Feed every change of the held keys; true when the trail changed.
        @discardableResult
        mutating func update(held: Set<Int>) -> Bool {
            guard !held.isEmpty else {
                released = true
                return false
            }
            guard let c = ChordDetective.read(held), c.kind == .chord, let root = c.root else { return false }
            if let last = chords.last {
                if last.display == c.display { return false }
                if last.root == root && (!released || last.family == c.family) {
                    chords[chords.count - 1] = c
                    released = false
                    match = ChordDetective.detect(chords)
                    return true
                }
            }
            chords.append(c)
            if chords.count > 8 { chords.removeFirst(chords.count - 8) }
            released = false
            match = ChordDetective.detect(chords)
            return true
        }

        mutating func clear() {
            chords = []
            match = nil
            released = true
        }
    }
}
