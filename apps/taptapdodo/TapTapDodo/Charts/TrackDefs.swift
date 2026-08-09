import Foundation

/// Everything the generator and the audio engine need to know about one set.
/// A run is fully determined by (TrackDef, seed).
struct TrackDef {
    let id: String          // "ttd01"
    let index: Int          // 1-based, for "ttd·01" labels
    let name: String        // "origin"
    let genreLine: String   // set-select copy
    let bpm: Double
    let bars: Int
    let travel: Double      // seconds a note is visible falling
    let swing: Double       // 0.5 = straight eighths
    let melodic: Bool
    let sections: [Section]
    let patternBank: [SectionKind: [Pattern]]
    /// Scale tones for melodic sets (Hz), indexed by ChartNote.pitchIndex.
    let scaleTones: [Double]

    var secondsPerBeat: Double { 60.0 / bpm }
    var totalBeats: Double { Double(bars * 4) }
    var songLength: Double { totalBeats * secondsPerBeat + 1.5 }
    var label: String { String(format: "ttd·%02d", index) }

    func section(atBar bar: Int) -> Section {
        sections.first { $0.bars.contains(bar) } ?? sections[sections.count - 1]
    }

    static func byId(_ id: String) -> TrackDef? { all.first { $0.id == id } }

    static let all: [TrackDef] = [origin, minimal, detroit, gabber]
}

// Note frequencies (Hz)
enum Tone {
    static let A1 = 55.0, E2 = 82.41, F2 = 87.31, G2 = 98.0, A2 = 110.0
    static let B2 = 123.47, C3 = 130.81, D3 = 146.83, E3 = 164.81, G3 = 196.0
    static let A3 = 220.0, B3 = 246.94, C4 = 261.63, D4 = 293.66, E4 = 329.63
    static let G4 = 392.0, A4 = 440.0, B4 = 493.88, C5 = 523.25, E5 = 659.25
}

extension TrackDef {

    // ttd·01 — the melodic set from reference/tap-tap-dodo.html.
    // The lane plucks ARE the lead line; the player plays it.
    static let origin = TrackDef(
        id: "ttd01", index: 1, name: "origin",
        genreLine: "melodic synth · A minor · plucks",
        bpm: 126, bars: 28, travel: 1.75, swing: 0.5, melodic: true,
        sections: [
            Section(kind: .intro, bars: 0..<4),
            Section(kind: .groove, bars: 4..<12),
            Section(kind: .build, bars: 12..<16),
            Section(kind: .peak, bars: 16..<24),
            Section(kind: .outro, bars: 24..<28),
        ],
        patternBank: [
            .intro: [Pattern([(0, 0), (2, 1), (4, 2), (6, 1)])],
            .groove: [
                Pattern([(0, 0), (3, 1), (4, 2), (6, 0), (7, 1)]),
                Pattern([(0, 0), (2, 1), (4, 2), (6, 0), (7, 1)]),
                Pattern([(0, 0), (3, 2), (4, 1), (6, 0)]),
            ],
            .build: [
                Pattern([(0, 0), (2, 2), (3, 1), (4, 0), (5, 2), (6, 1), (7, 2)]),
                Pattern([(0, 0), (2, 1), (3, 2), (4, 0), (6, 1), (7, 2)]),
            ],
            .peak: [
                Pattern([(0, 0), (1, 1), (2, 2), (3, 1), (4, 0), (5, 1), (6, 2), (7, 1)]),
                Pattern([(0, 0), (1, 2), (2, 1), (3, 0), (4, 2), (5, 1), (6, 0), (7, 1)]),
            ],
            .outro: [Pattern([(0, 0), (3, 1), (4, 2), (6, 0), (7, 1)])],
        ],
        scaleTones: [Tone.A3, Tone.C4, Tone.D4, Tone.E4, Tone.G4, Tone.A4, Tone.C5, Tone.E5]
    )

    // ttd·02 — the percussive set from reference/tap-tap-dodo-minimal.html.
    // Lanes are instruments (sub / rim / tick), not melody.
    static let minimal = TrackDef(
        id: "ttd02", index: 2, name: "minimal",
        genreLine: "minimal techno · percussive lanes",
        bpm: 130, bars: 32, travel: 1.7, swing: 0.5, melodic: false,
        sections: [
            Section(kind: .intro, bars: 0..<4),
            Section(kind: .groove, bars: 4..<12),
            Section(kind: .build, bars: 12..<16),
            Section(kind: .breakdown, bars: 16..<20),
            Section(kind: .peak, bars: 20..<28),
            Section(kind: .outro, bars: 28..<32),
        ],
        patternBank: [
            .intro: [Pattern([(1, 1), (3, 1), (5, 1), (7, 1)])],
            .groove: [
                Pattern([(0, 0), (3, 1), (4, 0), (7, 1)]),
                Pattern([(0, 0), (3, 1), (4, 0), (6, 1)]),
                Pattern([(0, 0), (2, 1), (4, 0), (7, 1)]),
            ],
            .build: [
                Pattern([(0, 0), (2, 2), (3, 1), (4, 0), (6, 2), (7, 1)]),
                Pattern([(0, 0), (2, 2), (4, 0), (5, 1), (6, 2)]),
            ],
            .breakdown: [Pattern([(0, 0), (4, 0)])],
            .peak: [
                Pattern([(0, 0), (1, 2), (3, 1), (4, 0), (5, 2), (6, 1), (7, 2)]),
                Pattern([(0, 0), (2, 2), (3, 1), (4, 0), (5, 1), (6, 2), (7, 1)]),
            ],
            .outro: [Pattern([(0, 0), (3, 1), (4, 0), (7, 1)])],
        ],
        scaleTones: []
    )

    // ttd·03 — Detroit strings, swung hats, minor 9ths. 122 and warm.
    static let detroit = TrackDef(
        id: "ttd03", index: 3, name: "detroit",
        genreLine: "detroit strings · swung hats · 122",
        bpm: 122, bars: 32, travel: 1.75, swing: 0.56, melodic: true,
        sections: [
            Section(kind: .intro, bars: 0..<4),
            Section(kind: .groove, bars: 4..<12),
            Section(kind: .build, bars: 12..<16),
            Section(kind: .breakdown, bars: 16..<20),
            Section(kind: .peak, bars: 20..<28),
            Section(kind: .outro, bars: 28..<32),
        ],
        patternBank: [
            .intro: [Pattern([(0, 0), (4, 1), (6, 2)])],
            .groove: [
                Pattern([(0, 0), (3, 1), (4, 2), (7, 1)]),
                Pattern([(0, 0), (2, 2), (4, 1), (7, 0)]),
                Pattern([(0, 0), (3, 2), (6, 1), (7, 0)]),
            ],
            .build: [
                Pattern([(0, 0), (2, 1), (3, 2), (4, 0), (6, 1), (7, 2)]),
                Pattern([(0, 0), (2, 2), (4, 1), (5, 0), (6, 2), (7, 1)]),
            ],
            .breakdown: [Pattern([(0, 0), (4, 2)]), Pattern([(0, 0), (6, 1)])],
            .peak: [
                Pattern([(0, 0), (1, 1), (2, 2), (4, 0), (5, 2), (6, 1), (7, 0)]),
                Pattern([(0, 0), (2, 1), (3, 2), (4, 0), (5, 1), (6, 2), (7, 1)]),
            ],
            .outro: [Pattern([(0, 0), (3, 1), (4, 2), (7, 1)])],
        ],
        scaleTones: [Tone.A3, Tone.B3, Tone.C4, Tone.E4, Tone.G4, Tone.A4, Tone.B4, Tone.C5]
    )

    // ttd·04 — 180 BPM distorted kick chaos. Unlocked by S-ranking any other set.
    static let gabber = TrackDef(
        id: "ttd04", index: 4, name: "gabber",
        genreLine: "distorted kick chaos · 180 · unlock: S rank",
        bpm: 180, bars: 32, travel: 1.75, swing: 0.5, melodic: false,
        sections: [
            Section(kind: .intro, bars: 0..<4),
            Section(kind: .groove, bars: 4..<12),
            Section(kind: .build, bars: 12..<16),
            Section(kind: .breakdown, bars: 16..<18),
            Section(kind: .peak, bars: 18..<28),
            Section(kind: .outro, bars: 28..<32),
        ],
        patternBank: [
            .intro: [Pattern([(0, 0), (4, 1)])],
            .groove: [
                Pattern([(0, 0), (2, 1), (4, 0), (6, 2)]),
                Pattern([(0, 0), (2, 2), (4, 0), (6, 1)]),
            ],
            .build: [
                Pattern([(0, 0), (2, 1), (3, 2), (4, 0), (6, 1), (7, 2)]),
                Pattern([(0, 0), (1, 1), (2, 0), (4, 2), (5, 1), (6, 0)]),
            ],
            .breakdown: [Pattern([(0, 0), (4, 0)])],
            .peak: [
                Pattern([(0, 0), (1, 1), (2, 2), (3, 0), (4, 1), (5, 2), (6, 0), (7, 1)]),
                Pattern([(0, 0), (1, 2), (2, 0), (3, 1), (4, 0), (5, 2), (6, 1), (7, 0)]),
                Pattern([(0, 0), (1, 1), (2, 0), (3, 2), (4, 0), (5, 1), (6, 2), (7, 0)]),
            ],
            .outro: [Pattern([(0, 0), (2, 1), (4, 0), (6, 2)])],
        ],
        scaleTones: []
    )
}
