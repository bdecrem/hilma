import Foundation

/// What the ear check found: how hard the daily challenges start (1, 2 or 3).
enum QuizLevel: String, Codable, CaseIterable {
    /// Starting out: theory and ear both.
    case new
    /// Hears it, doesn't know the names yet.
    case ear
    /// Knows the form, the ear is behind.
    case theory
    /// Both.
    case both

    var title: String {
        switch self {
        case .new: "Starting out"
        case .ear: "Good ear"
        case .theory: "Knows the form"
        case .both: "Ear and form"
        }
    }

    var line: String {
        switch self {
        case .new: "Daily challenges start with the easy ones: plain chords, big steps, the 12 bars."
        case .ear: "Your ear is ahead of the names. Daily challenges start at the middle level; the form questions will catch you up."
        case .theory: "You know the form; your ear is catching up. Daily challenges start at the middle level."
        case .both: "Ear and form both. Daily challenges go straight to the harder ones: inversions, sevenths, the turnaround."
        }
    }
}

/// One question. Listening questions carry the sound; the player can hear it again.
struct Question: Identifiable, Equatable {
    enum Kind: String { case listen, theory }
    enum Sound: Equatable {
        /// Notes struck together.
        case chord([Int])
        /// One note, then another.
        case notes([Int])
    }

    let id: String
    let kind: Kind
    /// 1 easy … 3 hard.
    let level: Int
    let prompt: String
    let options: [String]
    let answer: Int
    /// One line after the answer: why.
    let explain: String
    var sound: Sound?
}

/// The question bank and how a quiz is put together. Pure: the date and the record in, the five
/// questions out.
enum QuizBank {
    static let names = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]

    /// Major or minor triads on a few roots, close position around middle C (and harder: first
    /// inversion, sevenths).
    static var chords: [Question] {
        var out: [Question] = []
        for (root, level) in [(60, 1), (55, 1), (53, 1), (57, 2), (62, 2), (64, 3)] {
            let n = names[root % 12]
            out.append(Question(id: "triad-maj-\(n)", kind: .listen, level: level, prompt: "Major or minor?",
                                options: ["Major", "Minor"], answer: 0,
                                explain: "\(n) major: the middle note is four half steps up. It sounds open, settled.",
                                sound: .chord([root, root + 4, root + 7])))
            out.append(Question(id: "triad-min-\(n)", kind: .listen, level: level, prompt: "Major or minor?",
                                options: ["Major", "Minor"], answer: 1,
                                explain: "\(n) minor: the middle note is three half steps up, one lower than major. It sounds darker.",
                                sound: .chord([root, root + 3, root + 7])))
        }
        out.append(Question(id: "inv-maj-F", kind: .listen, level: 3, prompt: "Major or minor? (the root isn't on the bottom)",
                            options: ["Major", "Minor"], answer: 0,
                            explain: "F major with A on the bottom. Turned over, it still sounds major.",
                            sound: .chord([57, 60, 65])))
        out.append(Question(id: "inv-min-D", kind: .listen, level: 3, prompt: "Major or minor? (the root isn't on the bottom)",
                            options: ["Major", "Minor"], answer: 1,
                            explain: "D minor with F on the bottom. Turned over, it still sounds minor.",
                            sound: .chord([53, 57, 62])))
        out.append(Question(id: "dom7-C", kind: .listen, level: 3, prompt: "Plain major, or major with a blue seventh on top?",
                            options: ["Plain major", "With the seventh"], answer: 1,
                            explain: "C7: C E G and B♭. That B♭ is the blues: every chord in the 12-bar can carry it.",
                            sound: .chord([48, 52, 55, 58])))
        out.append(Question(id: "dom7-plain-G", kind: .listen, level: 3, prompt: "Plain major, or major with a blue seventh on top?",
                            options: ["Plain major", "With the seventh"], answer: 0,
                            explain: "Just G B D. No F on top, so no bluesy pull.",
                            sound: .chord([55, 59, 62])))
        return out
    }

    /// Two notes: did it go up or down? Smaller steps are harder.
    static var steps: [Question] {
        [(60, 67, 1), (67, 60, 1), (60, 64, 1), (64, 62, 2), (57, 59, 2), (62, 61, 3), (55, 56, 3)].map { a, b, level in
            let up = b > a
            let size = abs(b - a)
            return Question(id: "step-\(a)-\(b)", kind: .listen, level: level, prompt: "The second note: higher or lower?",
                            options: ["Higher", "Lower"], answer: up ? 0 : 1,
                            explain: "\(names[a % 12]) to \(names[b % 12]): \(up ? "up" : "down") \(size) half step\(size == 1 ? "" : "s").",
                            sound: .notes([a, b]))
        }
    }

    static var theory: [Question] {
        [
            Question(id: "form-bars", kind: .theory, level: 1, prompt: "How many bars in one chorus of the blues?",
                     options: ["8", "12", "16"], answer: 1,
                     explain: "Twelve: four on I, two on IV, two on I, then V, IV, I, V."),
            Question(id: "form-IV-C", kind: .theory, level: 1, prompt: "The blues in C. Which chord is IV?",
                     options: ["D", "F", "G"], answer: 1,
                     explain: "Count up from C: C D E F. The fourth note names the IV chord."),
            Question(id: "form-V-C", kind: .theory, level: 1, prompt: "The blues in C. Which chord is V?",
                     options: ["F", "G", "A"], answer: 1,
                     explain: "C D E F G: the fifth note is G."),
            Question(id: "form-bar5", kind: .theory, level: 1, prompt: "Bar 5 of the blues. Which chord?",
                     options: ["I", "IV", "V"], answer: 1,
                     explain: "Bars 5 and 6 go to IV: the first change of the form."),
            Question(id: "form-bar9", kind: .theory, level: 2, prompt: "Bar 9: the top of the last line. Which chord?",
                     options: ["I", "IV", "V"], answer: 2,
                     explain: "Bar 9 is V, the farthest from home: V, IV, I, V."),
            Question(id: "form-bar12", kind: .theory, level: 2, prompt: "Bar 12, the turnaround. Which chord?",
                     options: ["I", "IV", "V"], answer: 2,
                     explain: "V in bar 12 pulls you back to I at the top."),
            Question(id: "form-IV-F", kind: .theory, level: 2, prompt: "The blues in F. Which chord is IV?",
                     options: ["B♭", "C", "G"], answer: 0,
                     explain: "F G A B♭: the fourth is B♭."),
            Question(id: "form-V-G", kind: .theory, level: 2, prompt: "The blues in G. Which chord is V?",
                     options: ["C", "D", "E"], answer: 1,
                     explain: "G A B C D: the fifth is D."),
            Question(id: "shuffle", kind: .theory, level: 2, prompt: "In a shuffle, the second eighth note of each beat lands…",
                     options: ["Exactly halfway", "Late, two thirds in", "Early"], answer: 1,
                     explain: "Long-short: the beat in three, the second note on the third part."),
            Question(id: "fifth-of-F", kind: .theory, level: 2, prompt: "Root and fifth on F: which two notes?",
                     options: ["F and A", "F and C", "F and B♭"], answer: 1,
                     explain: "F G A B♭ C: the fifth is C. Your left hand played these in the payoff."),
            Question(id: "dom7-name", kind: .theory, level: 3, prompt: "C7 is C E G and…",
                     options: ["B", "B♭", "A"], answer: 1,
                     explain: "The seventh is flat: B♭. That's the dominant seventh, the blues chord."),
            Question(id: "quick-change", kind: .theory, level: 3, prompt: "A \"quick change\" blues goes to IV in bar…",
                     options: ["2", "4", "10"], answer: 0,
                     explain: "Bar 2 visits IV, then back to I for bars 3 and 4."),
        ]
    }

    static var all: [Question] { chords + steps + theory }

    static func question(_ id: String) -> Question? { all.first { $0.id == id } }

    /// The ear check, the first time: five, easy to hard, both kinds.
    static var placement: [Question] {
        ["form-bars", "triad-maj-C", "form-IV-C", "step-64-62", "triad-min-A"].map { question($0)! }
    }

    /// Ear (listening right) and form (theory right) from the ear check's answers.
    static func level(placement answers: [String: Bool]) -> QuizLevel {
        let qs = placement
        let ear = qs.filter { $0.kind == .listen && answers[$0.id] == true }.count   // of 3
        let form = qs.filter { $0.kind == .theory && answers[$0.id] == true }.count  // of 2
        switch (ear >= 2, form >= 2) {
        case (true, true): return .both
        case (true, false): return .ear
        case (false, true): return .theory
        case (false, false): return .new
        }
    }

    /// Today's five for a challenge: missed questions of its kind first (box 0, at most two), then
    /// the least known, at the level's difficulty (more if the pool runs short). The same five all
    /// day (seeded by the date).
    static func daily(_ challenge: Challenge, level: QuizLevel, boxes: [String: Int], day: String, count: Int = 5) -> [Question] {
        var rng = SeededRandom(seed: UInt64(stableHash(day)))
        let kind: [Question] = switch challenge {
        case .chords: chords
        case .form: theory
        case .steps: steps
        case .chorus, .earCheck: []
        }
        let maxLevel = level == .both ? 3 : (level == .new ? 1 : 2)
        var pool = kind.filter { $0.level <= maxLevel }
        if pool.count < count { pool = kind.filter { $0.level <= maxLevel + 1 } }
        let missed = pool.filter { boxes[$0.id] == 0 }.shuffled(using: &rng).prefix(2)
        var picked = Array(missed)
        let rest = pool.filter { !picked.contains($0) }
            .shuffled(using: &rng)
            .sorted { (boxes[$0.id] ?? -1) < (boxes[$1.id] ?? -1) }  // unseen (-1) and weak first
        picked += rest.prefix(count - picked.count)
        return picked.shuffled(using: &rng)
    }

    /// Today's challenge. The ear check until it's done; then four in turn by day of the year
    /// (the daily text names the same one: `challengeFor` in src/lib/takt/daily.ts).
    enum Challenge: Equatable {
        case earCheck, chords, form, steps, chorus

        var title: String {
            switch self {
            case .earCheck: "the 5-question ear check"
            case .chords: "5 ear questions: major or minor"
            case .form: "5 questions on the 12-bar form"
            case .steps: "5 listening questions: higher or lower"
            case .chorus: "one clean chorus of your blues lesson"
            }
        }
    }

    static func challenge(placed: Bool, date: Date = Date(), calendar: Calendar = .current) -> Challenge {
        guard placed else { return .earCheck }
        let doy = calendar.ordinality(of: .day, in: .year, for: date)!
        return [Challenge.chords, .form, .steps, .chorus][(doy - 1) % 4]
    }

    /// The same number for the same string on every launch (Swift's hashValue is seeded per run).
    static func stableHash(_ s: String) -> Int {
        var h: UInt64 = 1469598103934665603
        for b in s.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        return Int(h & 0x7FFF_FFFF_FFFF)
    }
}

/// SplitMix64: a repeatable shuffle.
struct SeededRandom: RandomNumberGenerator {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}

/// A quiz in progress: which question, what was answered.
struct QuizSession: Equatable {
    enum Mode: Equatable { case placement, daily }
    let mode: Mode
    let questions: [Question]
    private(set) var index = 0
    /// The choice made on each answered question.
    private(set) var choices: [Int] = []

    init(mode: Mode, questions: [Question]) {
        self.mode = mode
        self.questions = questions
    }

    var current: Question? { index < questions.count ? questions[index] : nil }
    /// The current question has been answered (the explanation shows, Next waits).
    var answered: Bool { choices.count > index }
    var finished: Bool { index >= questions.count }
    var score: Int { zip(questions, choices).filter { $0.answer == $1 }.count }

    /// Answers the current question; returns whether it was right. A second answer is ignored.
    @discardableResult
    mutating func choose(_ option: Int) -> Bool? {
        guard let q = current, !answered else { return nil }
        choices.append(option)
        return q.answer == option
    }

    mutating func next() {
        guard answered else { return }
        index += 1
    }

    var results: [String: Bool] {
        Dictionary(uniqueKeysWithValues: zip(questions, choices).map { ($0.id, $0.answer == $1) })
    }
}
