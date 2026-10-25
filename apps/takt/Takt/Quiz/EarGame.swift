import Foundation

/// The Ear Trainer: an endless chord-recognition game. A chord plays, you name its quality, the
/// next one comes. Seven levels from "major or minor in C, F, G" to seventh chords; 8 right of
/// your last 10 at a level opens the next. Points: 10 × the level, times the combo (up to 4).
/// Pure: a level and a random source in, a round out.
enum EarGame {
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
        let quality: Quality
        /// Pitch class.
        let root: Int
        let notes: [Int]
        let broken: Bool
        let options: [Quality]

        var sound: Question.Sound { broken ? .notes(notes) : .chord(notes) }
        var answer: Int { options.firstIndex(of: quality)! }
        var rootName: String { QuizBank.names[root] }
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
        return Round(level: n, quality: quality, root: root, notes: notes, broken: level.broken, options: level.qualities)
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

        init(level: Int) { self.level = level }

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
            if rightOfWindow >= EarGame.needed && level < EarGame.levels.count {
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
}
