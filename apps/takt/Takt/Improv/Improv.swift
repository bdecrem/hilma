import Foundation

/// Improv (IMPROV.md): a free step (`Lesson.Kind.free`) records what you play over its backing
/// as a take; "Send it" hands the take to the improv teacher on ola.cx, who answers with notes and
/// one idea; the idea becomes a step you can play over the same backing ("your version").
enum Improv {
    /// A take as the server reads it: ticks from the downbeat the take starts on.
    struct Take: Equatable {
        struct Note: Equatable {
            let t: Int
            let n: Int
            let v: Double
            let len: Int
        }
        let tempo: Int
        let bars: Int
        let notes: [Note]

        var json: [String: Any] {
            ["tempo": tempo, "ticksPerBeat": 12, "beatsPerBar": 4, "bars": bars,
             "notes": notes.map { ["t": $0.t, "n": $0.n, "v": $0.v, "len": $0.len] }]
        }
    }

    /// What you play on an improv, as you play it: every press with its transport tick, its
    /// length once the key comes up. One epoch (a Stop starts a new take).
    struct Recorder: Equatable {
        struct Press: Equatable {
            let note: Int
            let tick: Double
            let velocity: Double
            var end: Double?
        }
        private(set) var epoch = -1
        private(set) var presses: [Press] = []

        mutating func reset() {
            epoch = -1
            presses = []
        }

        mutating func press(_ note: Int, tick: Double, velocity: Double, epoch e: Int) {
            if e != epoch {
                epoch = e
                presses = []
            }
            presses.append(Press(note: note, tick: tick, velocity: velocity))
        }

        mutating func release(_ note: Int, tick: Double, epoch e: Int) {
            guard e == epoch, let i = presses.lastIndex(where: { $0.note == note && $0.end == nil }) else { return }
            presses[i].end = max(tick, presses[i].tick + 1)
        }

        /// The take, from the first chorus you played in (a note up to half a beat early counts
        /// for it) to the end of the bar you're in at `now`; a key still down rings to `now`.
        func take(chorusTicks: Int, ticksPerBeat: Int, formBars: Int, tempo: Int, now: Double) -> Take? {
            guard let first = presses.first else { return nil }
            let lead = Double(ticksPerBeat) / 2
            let startChorus = max(0, Int(((first.tick + lead) / Double(chorusTicks)).rounded(.down)))
            let start = Double(startChorus * chorusTicks)
            let last = max(now, presses.map { $0.end ?? $0.tick }.max() ?? now)
            let barTicks = Double(chorusTicks / max(1, formBars))
            let bars = max(1, Int(((last - start) / barTicks).rounded(.up)))
            let notes = presses.map { p in
                Take.Note(t: max(0, Int((p.tick - start).rounded())), n: p.note, v: (p.velocity * 100).rounded() / 100,
                          len: max(1, Int(((p.end ?? now) - p.tick).rounded())))
            }
            return Take(tempo: tempo, bars: bars, notes: notes)
        }

        var count: Int { presses.count }
    }

    /// The take against what a level asks of it: whole choruses, notes, the share on the notes allowed.
    struct Count: Equatable {
        var choruses = 0
        var notes = 0
        var inScale = 1.0

        static func of(_ take: Take, formBars: Int, allowed: Set<Int>) -> Count {
            let inside = take.notes.filter { allowed.contains(($0.n % 12 + 12) % 12) }.count
            return Count(choruses: take.bars / max(1, formBars), notes: take.notes.count,
                         inScale: take.notes.isEmpty ? 1 : Double(inside) / Double(take.notes.count))
        }
    }

    /// The teacher's answer (`src/lib/takt/improv-agent.ts`).
    struct Review: Equatable, Decodable {
        struct Idea: Equatable, Decodable {
            struct Note: Equatable, Decodable {
                /// Ticks from the idea's start, MIDI note, length in ticks, finger.
                let t: Int
                let n: Int
                let len: Int
                let f: Int
            }
            let title: String
            let why: String
            let bars: Int
            let notes: [Note]
        }
        let headline: String
        let notes: [String]
        let idea: Idea
    }

    /// The idea as a step over the improv's own backing (its band, key, feel and form): a jam
    /// whose pattern is the idea, every note an exact key, looping every `bars` bars and judged
    /// run by run. Its id says which take it came from.
    static func versionStep(_ idea: Review.Idea, of improv: Lesson.Step, take: String) -> Lesson.Step {
        let pattern = idea.notes.map { n in
            Lesson.PatternNote(beat: n.t % 48 / 12 + 1, tick: n.t % 12, tone: nil, semitones: nil, bar: n.t / 48, finger: n.f, chord: nil, note: n.n)
        }
        let c = improv.coach
        let coach = Lesson.Coach(intro: "Your version. Show me plays it first.", change: c.change, hold: c.hold,
                                 clean: "That's it. Again, and make it yours.", again: "{problem} Again.", join: c.join,
                                 slow: nil, passed: nil, tomorrow: nil, unlock: nil, alone: nil)
        return Lesson.Step(id: versionPrefix + take, kind: .jam, title: idea.title, skill: nil, tempo: improv.tempo,
                           pattern: pattern, cycle: idea.bars, hand: improv.hand ?? "right", key: improv.key, flats: improv.flats,
                           band: improv.band, transpose: improv.transpose, feel: improv.feel, backing: improv.backing,
                           form: improv.form, chords: improv.chords, gate: nil, maxAttempts: nil, ramp: nil, aloneBars: nil,
                           scale: nil, minNotes: nil, card: nil, about: idea.why, coach: coach)
    }

    static let versionPrefix = "version-"

    // MARK: XP (IMPROV.md: what earns what)

    enum XP {
        static let improv = 30
        static let version = 50
        static let versionClean = 25
        static let lesson = 20
        static let stage = 10
        static let goal = 100
    }
}

extension Lesson {
    /// This module with the improv teacher's idea as its last step (any earlier one replaced),
    /// a jam under the same lesson as the improv it came from. Returns the module and the step's index.
    func withVersion(_ step: Step, after improv: Step) -> (Lesson, Int) {
        let steps = self.steps.filter { !$0.id.hasPrefix(Improv.versionPrefix) } + [step]
        let after = jams?.first { $0.step == improv.id }?.after ?? lessons.count
        let jam = JamSpec(after: after, title: step.title, skill: "Your version, from the teacher", goal: "Play it over the band. Show me plays it first.",
                          step: step.id, theme: Theme(glyph: "hand", title: "Your version", line: step.about ?? ""))
        let jams = (self.jams ?? []).filter { !$0.step.hasPrefix(Improv.versionPrefix) } + [jam]
        let l = Lesson(code: code, title: title, key: key, module: module, lessons: lessons, later: later, jams: jams, band: band,
                       chords: chords, form: form, range: range, displayRoot: displayRoot, channels: channels, steps: steps)
        return (l, steps.count - 1)
    }
}
