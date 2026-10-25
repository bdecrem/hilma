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
    /// "11 of 12 · 23 ms early" under the last-chorus line.
    var lastChorusDetail: String? = nil
    /// MIDI note numbers (C4 = 60) of the key to press now and the one after it.
    var nowNote: Int?
    var nextNote: Int?
    /// Keys held right now, from any input.
    var pressedNotes: Set<Int> = []

    var nextBar: Int { (bar + 1) % form.count }

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
        nextNote: 53
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
        nextNote: 55
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
