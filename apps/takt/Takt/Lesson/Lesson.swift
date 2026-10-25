import Foundation

/// A lesson as content (`Takt/Content/lesson-*.json`): the form, the band, the steps with their
/// expected notes, tempos, gates and coach lines. New lessons are data, not code (brief §5).
struct Lesson: Decodable {
    struct Chord: Decodable {
        let numeral: String
        /// Pitch class of the root, C = 0.
        let root: Int
    }

    struct NoteRange: Decodable {
        let low: Int
        let high: Int
    }

    struct LessonChannel: Decodable {
        let name: String
        let channel: String
        /// The tempo that unlocks it; nil = playing from the start.
        let unlockAt: Int?
    }

    struct PatternNote: Decodable {
        /// 1-based beat in the bar.
        let beat: Int
        /// Ticks after the beat (12 per beat; the shuffle's late eighth is 8).
        let tick: Int?
        /// Chord tone: root, third, fifth, sixth, seventh, octave.
        let tone: String
    }

    struct Coach: Decodable {
        let intro: String
        /// The bar before a change. {next}: the next chord.
        let change: String?
        /// Any other bar. {chord}: this bar's chord.
        let hold: String?
        /// Bar 1 after a clean chorus that counts. {left}: choruses still to go, as a word.
        let clean: String?
        /// Bar 1 after a chorus that wasn't clean. {problem}: the Scorer's first finding.
        let again: String?
        /// Bar 1 after a chorus you joined late (not judged).
        let join: String?
        /// Bar 1 after a clean chorus below the step tempo. {tempo}, {gateTempo}.
        let slow: String?
        /// Once the gate passes.
        let passed: String?
        /// The gate's attempts ran out this session.
        let tomorrow: String?
        /// Ramp: a clean chorus that also unlocks a channel. {channel}: its name.
        let unlock: String?
        /// Payoff: the bars the band sits out.
        let alone: String?
    }

    struct Ramp: Decodable {
        let from: Int
        let to: Int
        let by: Int
    }

    enum Kind: String, Decodable {
        case play, card, ramp, payoff
    }

    struct Step: Decodable {
        let id: String
        let kind: Kind
        let title: String
        let skill: String?
        let tempo: Int?
        let pattern: [PatternNote]?
        /// Clean choruses to pass (not necessarily in a row).
        let gate: Int?
        let maxAttempts: Int?
        let ramp: Ramp?
        let aloneBars: [Int]?
        let card: String?
        let coach: Coach
    }

    let code: String
    let title: String
    let band: String
    let chords: [String: Chord]
    let form: [String]
    let range: NoteRange
    /// Where the keyboard shows a root: the root's pitch class above this note (48 = C3).
    let displayRoot: Int
    let channels: [LessonChannel]
    let steps: [Step]

    static let tones = ["root": 0, "third": 4, "fifth": 7, "sixth": 9, "seventh": 10, "octave": 12]

    /// Loads a bundled lesson and checks it. Bad content is a build error, so it traps.
    static func bundled(_ name: String) -> Lesson {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else {
            fatalError("lesson \(name).json is not in the bundle")
        }
        let lesson: Lesson
        do {
            lesson = try JSONDecoder().decode(Lesson.self, from: Data(contentsOf: url))
        } catch {
            fatalError("lesson \(name).json: \(error)")
        }
        lesson.validate()
        return lesson
    }

    private func validate() {
        for chord in form where chords[chord] == nil { fatalError("lesson \(code): no chord \(chord)") }
        for step in steps {
            let c = step.coach
            func need(_ ok: Bool, _ what: String) {
                if !ok { fatalError("lesson \(code) step \(step.id): a \(step.kind) step needs \(what)") }
            }
            switch step.kind {
            case .card:
                need(step.card != nil, "card text")
                continue
            case .play:
                need(step.tempo != nil && step.gate != nil, "tempo and gate")
                need(c.clean != nil && c.again != nil && c.slow != nil && c.passed != nil, "clean, again, slow and passed lines")
                need(step.maxAttempts == nil || c.tomorrow != nil, "a tomorrow line with maxAttempts")
            case .ramp:
                guard let r = step.ramp else { fatalError("lesson \(code) step \(step.id): a ramp step needs ramp") }
                need(r.by > 0 && r.to > r.from, "a rising ramp")
                need(c.clean != nil && c.again != nil && c.slow != nil && c.unlock != nil && c.passed != nil,
                     "clean, again, slow, unlock and passed lines")
            case .payoff:
                need(step.tempo != nil, "tempo")
                need(step.aloneBars.map { !$0.isEmpty && $0.allSatisfy { (1...form.count).contains($0) } } ?? false,
                     "aloneBars inside the form")
                need(c.alone != nil && c.passed != nil, "alone and passed lines")
            }
            need(c.change != nil && c.hold != nil && c.join != nil, "change, hold and join lines")
            guard let pattern = step.pattern, !pattern.isEmpty else {
                fatalError("lesson \(code) step \(step.id): no pattern")
            }
            for p in pattern where Self.tones[p.tone] == nil || !(1...4).contains(p.beat) || !(0..<12).contains(p.tick ?? 0) {
                fatalError("lesson \(code) step \(step.id): bad pattern note \(p)")
            }
        }
    }

    var formBars: [FormBar] { form.map { FormBar(chord: $0, numeral: chords[$0]!.numeral) } }

    /// The notes a step expects in one chorus, in order, with ticks inside the chorus.
    func expected(_ step: Step, ticksPerBeat: Int) -> [ExpectedNote] {
        let pattern = (step.pattern ?? []).sorted { ($0.beat, $0.tick ?? 0) < ($1.beat, $1.tick ?? 0) }
        var notes: [ExpectedNote] = []
        for (bar, name) in form.enumerated() {
            let root = chords[name]!.root
            for p in pattern {
                let interval = Self.tones[p.tone]!
                notes.append(ExpectedNote(
                    tick: (bar * 4 + p.beat - 1) * ticksPerBeat + (p.tick ?? 0),
                    bar: bar,
                    pitchClass: (root + interval) % 12,
                    display: displayRoot + root + interval))
            }
        }
        return notes
    }
}

/// One note the lesson expects: when (ticks into the chorus), which pitch class, and the key
/// the keyboard strip shows for it.
struct ExpectedNote: Equatable {
    let tick: Int
    /// 0-based bar of the form.
    let bar: Int
    let pitchClass: Int
    let display: Int
}

extension String {
    /// Fills `{name}` placeholders in a coach line.
    func filled(_ values: [String: String]) -> String {
        var s = self
        for (k, v) in values { s = s.replacingOccurrences(of: "{\(k)}", with: v) }
        return s
    }
}
