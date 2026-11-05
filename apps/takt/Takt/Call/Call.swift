import Foundation

/// Call (0.1 (106), 2026-11-05): the next note called out loud, finger then key ("three, C"),
/// then "tuck" or "over" when the hand crosses after it, and nothing moves until that key is
/// played; then the next one. No rhythm, nothing scored: a spoken walk through a line, so the
/// fingering goes into the hand before the tempo does. Pure: a list of steps from any content
/// that can say its notes in order with a finger each (a Stage chart at its tier, a lesson
/// step's pattern, later an improv's scale), a cursor, a key in, a verdict out. The voice is
/// `CallVoice`; the Player wires it to a song (Player+Call.swift).
enum Call {
    /// How the hand gets to the next step: the thumb under on the way up, or a finger over
    /// the thumb on the way down (the left hand the other way round). Said after the note
    /// before the crossing: "three, C, tuck", then "one, D".
    enum Crossing: String, Equatable {
        case tuck, over
    }

    struct Note: Equatable {
        let key: Int
        let finger: Int?
    }

    /// One thing to play: a key, or a chord's keys together, with their fingers; where it sits
    /// in its source (a tick); which of the source's notes it is (`indices`, so the Stage can
    /// mark them played); and the crossing after it, if any.
    struct Step: Equatable {
        /// Low to high.
        let notes: [Note]
        let tick: Int
        let indices: [Int]
        var crossing: Crossing?

        var keys: Set<Int> { Set(notes.map(\.key)) }
        var fingers: Set<Int> { Set(notes.compactMap(\.finger)) }
        var chord: Bool { notes.count > 1 }
    }

    enum Verdict: Equatable {
        /// One of a chord's keys down, the rest to come.
        case waiting
        /// The step played: the next one is current.
        case advance
        /// A key the step doesn't ask for; the step stays.
        case wrong(Int)
        /// The last step played.
        case done
    }

    /// How the black keys are said: sharps (G sharp) or flats (A flat).
    enum Spelling: Equatable {
        case sharps, flats

        /// The flat keys spell flat ("F", "B♭", "Dm", "Gm", "E♭ blues"), everything else sharp.
        static func of(key name: String) -> Spelling {
            let flat: Set<String> = ["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm"]
            let root = name.replacingOccurrences(of: "♭", with: "b").split(separator: " ").first.map(String.init) ?? ""
            return flat.contains(root) ? .flats : .sharps
        }
    }

    /// The words the voice says, one clip each (`Takt/Sounds/call-<clip>.caf`).
    enum Word: Equatable {
        case finger(Int)
        case key(Int, Spelling)
        case tuck, over, no, done

        static let fingers = ["one", "two", "three", "four", "five"]
        static let sharps = ["c", "c-sharp", "d", "d-sharp", "e", "f", "f-sharp", "g", "g-sharp", "a", "a-sharp", "b"]
        static let flats = ["c", "d-flat", "d", "e-flat", "e", "f", "g-flat", "g", "a-flat", "a", "b-flat", "b"]
        /// Every clip the voice needs.
        static let clips: [String] = fingers + Array(Set(sharps + flats)).sorted() + ["tuck", "over", "no", "done"]

        var clip: String {
            switch self {
            case .finger(let f): Self.fingers[max(1, min(5, f)) - 1]
            case .key(let k, let s): (s == .flats ? Self.flats : Self.sharps)[((k % 12) + 12) % 12]
            case .tuck: "tuck"
            case .over: "over"
            case .no: "no"
            case .done: "done"
            }
        }

        /// The word on the screen: "3", "C♯", "tuck".
        var text: String {
            switch self {
            case .finger(let f): "\(f)"
            case .key: clip.replacingOccurrences(of: "-sharp", with: "♯").replacingOccurrences(of: "-flat", with: "♭").uppercased()
            default: clip
            }
        }
    }

    // MARK: Steps from content

    /// Steps over notes in time order, those at one tick a chord; `right` for the right hand.
    static func steps(_ notes: [(index: Int, tick: Int, key: Int, finger: Int?)], right: Bool) -> [Step] {
        var steps: [Step] = []
        for n in notes.sorted(by: { ($0.tick, $0.key) < ($1.tick, $1.key) }) {
            if let last = steps.last, last.tick == n.tick {
                steps[steps.count - 1] = Step(notes: last.notes + [Note(key: n.key, finger: n.finger)], tick: n.tick, indices: last.indices + [n.index])
            } else {
                steps.append(Step(notes: [Note(key: n.key, finger: n.finger)], tick: n.tick, indices: [n.index]))
            }
        }
        for i in steps.indices.dropLast() {
            steps[i].crossing = crossing(from: steps[i], to: steps[i + 1], right: right)
        }
        return steps
    }

    /// Between two single notes: the thumb under a finger going up (the right hand; down for
    /// the left), a finger over the thumb coming down, inside a crossing's reach
    /// (`Fingering.crossMax`); past that the hand jumps and there is nothing to call.
    static func crossing(from a: Step, to b: Step, right: Bool) -> Crossing? {
        guard !a.chord, !b.chord, let fa = a.notes[0].finger, let fb = b.notes[0].finger else { return nil }
        let d = b.notes[0].key - a.notes[0].key
        guard d != 0, abs(d) <= Fingering.crossMax else { return nil }
        let up = d > 0
        if fb == 1, fa > 1, up == right { return .tuck }
        if fa == 1, fb > 1, up != right { return .over }
        return nil
    }

    /// The Stage: the part's notes the tier of their bar asks for, from `tick` on, with the
    /// tier's fingers; the melody is the right hand, the chords the left.
    static func steps(game: GameEngine, from tick: Double) -> [Step] {
        let notes = game.notes.indices.filter { game.active($0) && Double(game.notes[$0].t) >= tick }
            .map { (index: $0, tick: game.notes[$0].t, key: game.notes[$0].n, finger: game.finger($0)) }
        return steps(notes, right: game.part == .melody)
    }

    /// A lesson step: a chorus of its expected notes (`Lesson.expected`), the right hand unless
    /// the step says otherwise.
    static func steps(expected: [ExpectedNote], right: Bool) -> [Step] {
        steps(expected.enumerated().map { (index: $0, tick: $1.tick, key: $1.display, finger: $1.finger) }, right: right)
    }

    // MARK: What is said

    /// A step's words: the fingers low to high, then the keys, then the crossing.
    static func words(for step: Step, spelling: Spelling) -> [Word] {
        var words: [Word] = step.notes.compactMap { $0.finger.map(Word.finger) }
        words += step.notes.map { Word.key($0.key, spelling) }
        if let c = step.crossing { words.append(c == .tuck ? .tuck : .over) }
        return words
    }

    /// The words on the screen: "3 · C · tuck", a chord "5 3 1 · A C F".
    static func phrase(_ words: [Word]) -> String {
        var groups: [String] = []
        var fingers: [String] = []
        var keys: [String] = []
        func flush() {
            if !fingers.isEmpty { groups.append(fingers.joined(separator: " ")); fingers = [] }
            if !keys.isEmpty { groups.append(keys.joined(separator: " ")); keys = [] }
        }
        for w in words {
            switch w {
            case .finger: fingers.append(w.text)
            case .key: keys.append(w.text)
            default:
                flush()
                groups.append(w.text)
            }
        }
        flush()
        return groups.joined(separator: " · ")
    }

    // MARK: The engine

    /// The cursor over the steps: a key in, a verdict out. A chord waits for all of its keys;
    /// a wrong key leaves the step where it is.
    struct Engine: Equatable {
        let steps: [Step]
        let right: Bool
        let spelling: Spelling
        private(set) var index = 0
        private(set) var held: Set<Int> = []
        private(set) var wrong = 0

        init(steps: [Step], right: Bool, spelling: Spelling) {
            self.steps = steps
            self.right = right
            self.spelling = spelling
        }

        var current: Step? { index < steps.count ? steps[index] : nil }
        var next: Step? { index + 1 < steps.count ? steps[index + 1] : nil }
        var finished: Bool { index >= steps.count }
        var words: [Word] { current.map { Call.words(for: $0, spelling: spelling) } ?? [] }
        var phrase: String { Call.phrase(words) }

        mutating func played(key: Int) -> Verdict {
            guard let step = current else { return .done }
            guard step.keys.contains(key) else {
                wrong += 1
                return .wrong(key)
            }
            held.insert(key)
            guard held.isSuperset(of: step.keys) else { return .waiting }
            held = []
            index += 1
            return finished ? .done : .advance
        }
    }
}
