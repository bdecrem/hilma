import Foundation

/// The ear games: endless rounds, one engine. **Chords** (E1, the Ear Trainer): a chord plays,
/// you name its quality; seven levels from "major or minor in C, F, G" to seventh chords.
/// **Intervals** (E2): two notes, you name the distance; seven levels from "fourth or fifth"
/// to both notes at once. 8 right of your last 10 at a level opens the next. Points: 10 × the
/// level, times the combo (up to 4). Pure: a level and a random source in, a round out.
enum EarGame {
    enum Kind: String, CaseIterable {
        case chords, intervals

        var title: String { self == .chords ? "Ear Trainer" : "Intervals" }

        /// Number, title, detail of each level.
        var levels: [(number: Int, title: String, detail: String)] {
            switch self {
            case .chords: EarGame.levels.map { ($0.number, $0.title, $0.detail) }
            case .intervals: EarGame.intervalLevels.map { ($0.number, $0.title, $0.detail) }
            }
        }

        func round<R: RandomNumberGenerator>(level: Int, avoiding last: Round?, using rng: inout R) -> Round {
            switch self {
            case .chords: EarGame.round(level: level, avoiding: last, using: &rng)
            case .intervals: EarGame.intervalRound(level: level, avoiding: last, using: &rng)
            }
        }

        /// What the screen asks before an answer.
        func ask(_ r: Round) -> String {
            switch self {
            case .chords: r.broken ? "One note after another: which chord is it?" : "Which chord?"
            case .intervals: r.broken ? "How far apart?" : "Both at once: how far apart?"
            }
        }
    }

    enum Quality: String, CaseIterable {
        case major, minor, dominant7, diminished, augmented, major7, minor7

        var name: String {
            switch self {
            case .major: "Major"
            case .minor: "Minor"
            case .dominant7: "Dominant 7"
            case .diminished: "Diminished"
            case .augmented: "Augmented"
            case .major7: "Major 7"
            case .minor7: "Minor 7"
            }
        }

        /// Half steps above the root.
        var intervals: [Int] {
            switch self {
            case .major: [0, 4, 7]
            case .minor: [0, 3, 7]
            case .dominant7: [0, 4, 7, 10]
            case .diminished: [0, 3, 6]
            case .augmented: [0, 4, 8]
            case .major7: [0, 4, 7, 11]
            case .minor7: [0, 3, 7, 10]
            }
        }

        /// What to listen for, one line after a miss.
        var hint: String {
            switch self {
            case .major: "Major: bright, settled. The middle note sits four half steps up."
            case .minor: "Minor: darker. The middle note is one half step lower than major."
            case .dominant7: "Dominant 7: major with a flat seventh on top. The blues chord: it wants to move."
            case .diminished: "Diminished: two minor thirds stacked. Tight, tense, unstable."
            case .augmented: "Augmented: two major thirds stacked. Floating, like a question."
            case .major7: "Major 7: major with the seventh a half step under the octave. Soft, dreamy."
            case .minor7: "Minor 7: minor with a flat seventh. Mellow, the jazz minor."
            }
        }
    }

    struct Level: Equatable {
        let number: Int
        let title: String
        let detail: String
        let qualities: [Quality]
        /// Roots as pitch classes (0 = C).
        let roots: [Int]
        /// Any inversion, not just the root on the bottom.
        let inversions: Bool
        /// Notes one after another instead of together.
        let broken: Bool
    }

    static let allRoots = Array(0..<12)

    static let levels: [Level] = [
        Level(number: 1, title: "Major or minor", detail: "C, F and G, root on the bottom",
              qualities: [.major, .minor], roots: [0, 5, 7], inversions: false, broken: false),
        Level(number: 2, title: "Any key", detail: "Major or minor on all twelve roots",
              qualities: [.major, .minor], roots: allRoots, inversions: false, broken: false),
        Level(number: 3, title: "Turned over", detail: "Inversions: the root isn't always on the bottom",
              qualities: [.major, .minor], roots: allRoots, inversions: true, broken: false),
        Level(number: 4, title: "Broken chords", detail: "One note after another",
              qualities: [.major, .minor], roots: allRoots, inversions: true, broken: true),
        Level(number: 5, title: "Add the seventh", detail: "Major, minor or the blues seventh",
              qualities: [.major, .minor, .dominant7], roots: allRoots, inversions: false, broken: false),
        Level(number: 6, title: "Strange ones", detail: "Major, minor, diminished, augmented",
              qualities: [.major, .minor, .diminished, .augmented], roots: allRoots, inversions: false, broken: false),
        Level(number: 7, title: "Sevenths", detail: "Major 7, minor 7, dominant 7, any voicing",
              qualities: [.major7, .minor7, .dominant7], roots: allRoots, inversions: true, broken: false),
    ]

    /// To open the next level: this many right of the last `window` at this one.
    static let needed = 8
    static let window = 10

    struct Round: Equatable {
        let level: Int
        /// The answers on the buttons, and the right one.
        let options: [String]
        let answer: Int
        let notes: [Int]
        /// One note after another (broken chord, melodic interval) instead of together.
        let broken: Bool
        /// What it was, said after the answer ("G minor", "C up to G").
        let name: String
        /// What to listen for, after a miss.
        let hint: String
        /// Chords: the quality and the root (pitch class).
        var quality: Quality?
        var root: Int = 0
        /// Intervals: the interval.
        var interval: Interval?

        var sound: Question.Sound { broken ? .notes(notes) : .chord(notes) }
    }

    /// A round at a level: a quality and root at random, voiced around middle C (the lowest note
    /// between F3 and E4), turned over when the level allows it.
    static func round<R: RandomNumberGenerator>(level n: Int, avoiding last: Round? = nil, using rng: inout R) -> Round {
        let level = levels[n - 1]
        var quality = level.qualities.randomElement(using: &rng)!
        var root = level.roots.randomElement(using: &rng)!
        // Not the same chord on the same root twice in a row.
        for _ in 0..<8 where last.map({ $0.quality == quality && $0.root == root }) ?? false {
            quality = level.qualities.randomElement(using: &rng)!
            root = level.roots.randomElement(using: &rng)!
        }
        let base = 53 + (root - 5 + 12) % 12  // the root between F3 and E4
        var notes = quality.intervals.map { base + $0 }
        if level.inversions {
            for _ in 0..<Int.random(in: 0..<notes.count, using: &rng) {
                notes = Array(notes.dropFirst()) + [notes[0] + 12]
            }
        }
        if level.broken && Bool.random(using: &rng) { notes.reverse() }  // up or down
        return Round(level: n, options: level.qualities.map(\.name), answer: level.qualities.firstIndex(of: quality)!,
                     notes: notes, broken: level.broken, name: "\(QuizBank.names[root]) \(quality.name.lowercased())",
                     hint: quality.hint, quality: quality, root: root)
    }

    /// One play-through: the level you're on, your recent answers there, the combo, the score.
    struct Run: Equatable {
        private(set) var level: Int
        /// Right/wrong at this level, newest last (the last `window` count).
        private(set) var recent: [Bool] = []
        private(set) var combo = 0
        private(set) var score = 0
        private(set) var answered = 0
        /// Set when the last answer opened a new level.
        private(set) var leveledUp = false

        /// The highest level of this game.
        let top: Int

        init(level: Int, top: Int = EarGame.levels.count) {
            self.level = level
            self.top = top
        }

        var rightOfWindow: Int { recent.suffix(EarGame.window).filter { $0 }.count }
        var multiplier: Int { min(4, 1 + combo / 3) }

        /// Records an answer; returns the points it scored.
        @discardableResult
        mutating func answer(right: Bool) -> Int {
            answered += 1
            leveledUp = false
            recent.append(right)
            guard right else {
                combo = 0
                return 0
            }
            combo += 1
            let points = 10 * level * multiplier
            score += points
            if rightOfWindow >= EarGame.needed && level < top {
                level += 1
                recent = []
                leveledUp = true
            }
            return points
        }

        /// Step to another level you've opened (the meter starts over).
        mutating func go(to n: Int) {
            level = n
            recent = []
            combo = 0
            leveledUp = false
        }
    }

    // MARK: Intervals

    enum Interval: Int, CaseIterable {
        case minor2 = 1, major2, minor3, major3, fourth, tritone, fifth, minor6, major6, octave = 12

        /// The name, with the blues' numeral where it has one: a fourth is the step from I to IV.
        var name: String {
            switch self {
            case .minor2: "Half step"
            case .major2: "Whole step"
            case .minor3: "Minor 3rd"
            case .major3: "Major 3rd"
            case .fourth: "Fourth (IV)"
            case .tritone: "Tritone"
            case .fifth: "Fifth (V)"
            case .minor6: "Minor 6th"
            case .major6: "Major 6th"
            case .octave: "Octave"
            }
        }

        /// A song that starts with it (going up), and what it sounds like.
        var hint: String {
            switch self {
            case .minor2: "Half step: the Jaws theme. As close as two notes get."
            case .major2: "Whole step: Happy Birthday, from \"py\" to \"birth\"."
            case .minor3: "Minor 3rd: the start of Greensleeves. Sad, small."
            case .major3: "Major 3rd: When the Saints Go Marching In, from \"Oh\" to \"when\". Bright, sweet."
            case .fourth: "Fourth: Here Comes the Bride. Open, a step up to IV."
            case .tritone: "Tritone: The Simpsons. Half an octave, restless."
            case .fifth: "Fifth: Twinkle Twinkle, from the first \"twinkle\" to the second. Wide, hollow, the power chord."
            case .minor6: "Minor 6th: The Entertainer's leap. Wide and bittersweet."
            case .major6: "Major 6th: My Bonnie Lies Over the Ocean. Wide and warm."
            case .octave: "Octave: Somewhere Over the Rainbow. The same note, higher."
            }
        }
    }

    /// The songs to hum before you guess: the leap at the start of each is the interval. The
    /// interval game's info panel lists them, smallest first.
    static let songs: [(interval: Interval, song: String, from: String, to: String)] = [
        (.major2, "Happy Birthday", "Hap-py", "birth-day"),
        (.major3, "When the Saints Go Marching In", "Oh", "when the"),
        (.fourth, "Here Comes the Bride", "Here", "comes the"),
        (.fifth, "Twinkle Twinkle Little Star", "Twin-kle", "twin-kle"),
        (.octave, "Somewhere Over the Rainbow", "Some-", "where"),
    ]

    struct IntervalLevel: Equatable {
        let number: Int
        let title: String
        let detail: String
        let intervals: [Interval]
        /// Down as well as up.
        let both: Bool
        /// Both notes at once.
        let together: Bool
    }

    static let intervalLevels: [IntervalLevel] = [
        IntervalLevel(number: 1, title: "Fourth or fifth", detail: "I to IV or I to V, going up",
                      intervals: [.fourth, .fifth], both: false, together: false),
        IntervalLevel(number: 2, title: "Add the octave", detail: "Fourth, fifth or octave, going up",
                      intervals: [.fourth, .fifth, .octave], both: false, together: false),
        IntervalLevel(number: 3, title: "Thirds", detail: "Minor and major thirds join the fourth and fifth",
                      intervals: [.minor3, .major3, .fourth, .fifth], both: false, together: false),
        IntervalLevel(number: 4, title: "Going down", detail: "The same, up or down",
                      intervals: [.minor3, .major3, .fourth, .fifth, .octave], both: true, together: false),
        IntervalLevel(number: 5, title: "Sixths", detail: "Thirds, fourth, fifth and both sixths",
                      intervals: [.minor3, .major3, .fourth, .fifth, .minor6, .major6], both: true, together: false),
        IntervalLevel(number: 6, title: "Steps and the tritone", detail: "The small ones and the devil's interval",
                      intervals: [.minor2, .major2, .minor3, .major3, .tritone, .fifth], both: true, together: false),
        IntervalLevel(number: 7, title: "Together", detail: "Both notes at once",
                      intervals: [.minor3, .major3, .fourth, .tritone, .fifth, .major6], both: false, together: true),
    ]

    /// A round: an interval at random from a root between C3 and B3 (so an octave up stays under
    /// C5), up, or down from an octave higher when the level allows.
    static func intervalRound<R: RandomNumberGenerator>(level n: Int, avoiding last: Round? = nil, using rng: inout R) -> Round {
        let level = intervalLevels[n - 1]
        var interval = level.intervals.randomElement(using: &rng)!
        var root = Int.random(in: 0..<12, using: &rng)
        for _ in 0..<8 where last.map({ $0.interval == interval && $0.root == root }) ?? false {
            interval = level.intervals.randomElement(using: &rng)!
            root = Int.random(in: 0..<12, using: &rng)
        }
        let low = 48 + root
        let down = level.both && Bool.random(using: &rng)
        let notes = down ? [low + interval.rawValue, low] : [low, low + interval.rawValue]
        let from = QuizBank.names[notes[0] % 12], to = QuizBank.names[notes[1] % 12]
        let name = level.together ? "\(from) and \(to) together" : "\(from) \(down ? "down" : "up") to \(to)"
        return Round(level: n, options: level.intervals.map(\.name), answer: level.intervals.firstIndex(of: interval)!,
                     notes: notes, broken: !level.together, name: name, hint: interval.hint, root: root, interval: interval)
    }
}
