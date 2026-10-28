import Foundation

/// One bar of the form: the chord and its roman numeral.
struct FormBar: Hashable {
    let chord: String
    let numeral: String
}

enum Forms {
    /// The 12-bar blues in C: I I I I | IV IV I I | V IV I V
    static let bluesC: [FormBar] = [
        "C I", "C I", "C I", "C I",
        "F IV", "F IV", "C I", "C I",
        "G V", "F IV", "C I", "G V",
    ].map { pair in
        let parts = pair.split(separator: " ")
        return FormBar(chord: String(parts[0]), numeral: String(parts[1]))
    }
}

struct ChannelState: Identifiable {
    var id: String { name }
    let name: String
    var unlocked: Bool
    /// The tempo that unlocks a locked channel ("AT 80").
    var unlockAt: Int?
    /// Meter reading, 0...12 segments.
    var level: Int
    var muted = false
    /// Unmuted, waiting for the next downbeat.
    var pendingUnmute = false
    /// The module channel it is (a step may hide some): the mute button's target.
    var index = 0
}

/// Everything the lesson screen draws. The views are pure functions of this. Live, the Player
/// builds it from the transport and the LessonEngine; the fixed frames below are for screenshots.
struct LessonState {
    var code: String
    var title: String
    var step: Int
    var stepCount: Int
    var stepTitle: String = ""
    /// A card step's text: the card takes the pads' place until Continue.
    var card: String? = nil
    var tempo: Int
    /// A tempo change waiting for the next downbeat.
    var pendingTempo: Int? = nil
    var playing: Bool
    var form: [FormBar]
    /// Current bar, 0-based.
    var bar: Int
    /// Current beat in the bar, 0-based.
    var beat: Int
    var chorus: Int
    var cleanChoruses: Int
    var gate: Int
    var channels: [ChannelState]
    var coach: String
    var lastChorus: String?
    /// "11 of 12 · 1 rushed" under the last-chorus line.
    var lastChorusDetail: String? = nil
    /// How the last note landed: the needle.
    var lastNote: LessonEngine.NoteMark? = nil
    /// The count-in's beat (1–4) before bar 1.
    var countIn: Int? = nil
    /// The module and the lesson (1-based) the current step belongs to; the header and the intro.
    var moduleTitle: String = ""
    var lesson: Int = 1
    var lessonCount: Int = 1
    var lessonTitle: String = ""
    var goal: String = ""
    /// A lesson's intro waiting for Start, or Lesson complete: either takes the pads' place.
    var intro: LessonEngine.StepInfo? = nil
    var complete: LessonEngine.Complete? = nil
    /// Keys of this bar's notes → the finger that plays each.
    var fingers: [Int: Int] = [:]
    /// MIDI note numbers (C4 = 60) of the key to press now and the one after it.
    var nowNote: Int?
    var nextNote: Int?
    /// Every key to press now (a chord lights them all), and the next different ones.
    var nowNotes: Set<Int> = []
    var nextNotes: Set<Int> = []
    /// Keys held right now, from any input.
    var pressedNotes: Set<Int> = []
    /// A scale lesson: the run takes the pads' place.
    var run: Run? = nil
    /// Play mode: a jam under `lesson`, no gate.
    var jam = false
    /// The session's theme card beside the coach, with the hand it draws.
    var theme: Lesson.Theme? = nil
    var handFingers: Set<Int> = []
    var rightHand = false
    /// The tempo the step counts at: the knob's tick.
    var stepTempo: Int? = nil

    var nextBar: Int { (bar + 1) % form.count }

    /// One pass of a scale step: its notes in playing order, where the player is in it, and
    /// which pass of the chorus this is.
    struct Run: Equatable {
        struct Note: Equatable {
            let key: Int
            let finger: Int
        }
        /// "A minor"
        let name: String
        let notes: [Note]
        /// The note being played now (held through a rest bar); nil before the first.
        let index: Int?
        /// The bar after the notes: hold the last one, then from the top.
        let resting: Bool
        /// 1-based pass of the chorus, and how many a chorus holds.
        let number: Int
        let count: Int
        /// The right hand (the crossings mirror for the left).
        var right = true
        /// Spell the black keys as flats (the blues scale: E♭, B♭).
        var flats = false

        var now: Note? { index.map { notes[$0] } }
        var next: Note? { index.map { notes[($0 + 1) % notes.count] } }
        /// Going back to the first note after the last.
        var wrapping: Bool { index.map { $0 == notes.count - 1 } ?? false }

        /// How the hand gets from one note to the next: a thumb tucking under, or a finger
        /// crossing over the thumb. Nil for a plain step to the neighbor finger. The right hand
        /// tucks going up and crosses over coming down; the left hand the other way round.
        static func crossing(from a: Note, to b: Note, right: Bool = true) -> String? {
            let up = b.key > a.key
            if b.finger == 1, a.finger > 1, up == right { return "Thumb under" }
            if a.finger == 1, b.finger > 1, up != right { return "\(Self.fingerWord(b.finger)) over" }
            return nil
        }

        static func fingerWord(_ f: Int) -> String {
            ["", "Thumb", "Index", "Middle", "Ring", "Pinky"][max(0, min(5, f))]
        }

        /// The keyboard that shows the whole run: `keys` semitones wide (wider when the run spans
        /// more, two octaves), white keys at both ends, the run centered; `fallback` when there
        /// is no run.
        static func keyboard(_ run: Run?, keys: Int, fallback: ClosedRange<Int>) -> ClosedRange<Int> {
            guard let run, let lo = run.notes.map(\.key).min(), let hi = run.notes.map(\.key).max() else { return fallback }
            if fallback.contains(lo), fallback.contains(hi) { return fallback }
            var low = min(lo, (lo + hi) / 2 - keys / 2)
            while KeyboardStrip.isBlack(low) { low -= 1 }
            var high = max(hi, low + keys - 1)
            while KeyboardStrip.isBlack(high) { high += 1 }
            return low...high
        }
    }

    /// A1 step 1, beat 3 of bar 4, one bar before the first F.
    static let preview = LessonState(
        code: "A1",
        title: "Play the Form",
        step: 1,
        stepCount: 6,
        tempo: 70,
        playing: true,
        form: Forms.bluesC,
        bar: 3,
        beat: 2,
        chorus: 2,
        cleanChoruses: 1,
        gate: 2,
        channels: [
            ChannelState(name: "Drums", unlocked: true, level: 9),
            ChannelState(name: "Bass", unlocked: true, level: 7),
            ChannelState(name: "Keys", unlocked: false, unlockAt: 80, level: 0),
            ChannelState(name: "Horns", unlocked: false, unlockAt: 90, level: 0),
        ],
        coach: "Get ready. F on the 1.",
        lastChorus: "Rushed bar 9.",
        lastChorusDetail: "11 of 12 · 31 ms early",
        nowNote: 48,
        nextNote: 53,
        nowNotes: [48],
        nextNotes: [53]
    )

    /// A1 step 5: the gate at 90, two of three clean, the whole band in, downbeat of bar 11.
    static let gate90 = LessonState(
        code: "A1",
        title: "Play the Form",
        step: 5,
        stepCount: 6,
        tempo: 90,
        playing: true,
        form: Forms.bluesC,
        bar: 10,
        beat: 0,
        chorus: 4,
        cleanChoruses: 2,
        gate: 3,
        channels: [
            ChannelState(name: "Drums", unlocked: true, level: 10),
            ChannelState(name: "Bass", unlocked: true, level: 8),
            ChannelState(name: "Keys", unlocked: true, unlockAt: 80, level: 6),
            ChannelState(name: "Horns", unlocked: true, unlockAt: 90, level: 9),
        ],
        coach: "Three clean at 90 and it's yours.",
        lastChorus: "Clean.",
        lastChorusDetail: "24 of 24 · 6 ms late",
        nowNote: 48,
        nextNote: 55,
        nowNotes: [48, 55],
        nextNotes: []
    )

    /// The frame drawn at launch. DEBUG builds take `-PreviewFrame gate90` for screenshots.
    static var launchFrame: LessonState {
        #if DEBUG
        switch UserDefaults.standard.string(forKey: "PreviewFrame") {
        case nil: return .preview
        case "gate90": return .gate90
        case let name?: fatalError("unknown -PreviewFrame \(name)")
        }
        #else
        return .preview
        #endif
    }
}
