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
    /// Which BackingComposer arrangement + tap/ghost voices + masterGain
    /// family this track uses ("origin"/"minimal"/"detroit"/"afters"/"gabber").
    /// Downloaded packs reuse a built-in family with their own skeleton.
    let backingStyle: String
    /// Which of the built-in Skins to render with (a ttd id, e.g. "ttd02").
    let skinRef: String
    /// Seconds of ring-out after the last beat (minimal ii lets the dub
    /// delay tail breathe).
    let tail: Double

    init(id: String, index: Int, name: String, genreLine: String, bpm: Double,
         bars: Int, travel: Double, swing: Double, melodic: Bool,
         sections: [Section], patternBank: [SectionKind: [Pattern]],
         scaleTones: [Double], backingStyle: String? = nil, skinRef: String? = nil,
         tail: Double = 1.5) {
        self.id = id
        self.index = index
        self.name = name
        self.genreLine = genreLine
        self.bpm = bpm
        self.bars = bars
        self.travel = travel
        self.swing = swing
        self.melodic = melodic
        self.sections = sections
        self.patternBank = patternBank
        self.scaleTones = scaleTones
        self.backingStyle = backingStyle ?? TrackDef.defaultStyle(forId: id)
        self.skinRef = skinRef ?? id
        self.tail = tail
    }

    private static func defaultStyle(forId id: String) -> String {
        switch id {
        case "ttd01": return "origin"
        case "ttd02": return "minimal"
        case "ttd03": return "detroit"
        case "ttd05": return "afters"
        default: return "gabber"
        }
    }

    var secondsPerBeat: Double { 60.0 / bpm }
    var totalBeats: Double { Double(bars * 4) }
    var songLength: Double { totalBeats * secondsPerBeat + tail }
    var label: String { String(format: "ttd·%02d", index) }

    func section(atBar bar: Int) -> Section {
        sections.first { $0.bars.contains(bar) } ?? sections[sections.count - 1]
    }

    /// Bar range of the first section of the given kind, or an empty range.
    /// Composers derive every entrance/breakdown boundary from these.
    func sectionRange(_ kind: SectionKind) -> Range<Int> {
        sections.first { $0.kind == kind }?.bars ?? 0..<0
    }

    static func byId(_ id: String) -> TrackDef? { all.first { $0.id == id } }

    // Pager order — the locked set stays last.
    static let all: [TrackDef] = [origin, minimal, detroit, afters, minimalII, gabber]
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

    // ttd·05 — the second minimal set: same basement, five more years in the
    // booth. Rumble under the kick, dub chords in the smoke, ghost 16ths,
    // one resonant filter arc for the whole track. Chart difficulty matches
    // ttd·02 — the new musical layers stay in the backing.
    static let afters = TrackDef(
        id: "ttd05", index: 5, name: "afters",
        genreLine: "minimal techno · 4am cut · rumble + dub",
        bpm: 129, bars: 32, travel: 1.7, swing: 0.53, melodic: false,
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
                Pattern([(0, 0), (2, 1), (4, 0), (6, 2)]),
                Pattern([(0, 0), (3, 1), (4, 0), (7, 2)]),
            ],
            .build: [
                Pattern([(0, 0), (2, 2), (3, 1), (4, 0), (6, 2), (7, 1)]),
                Pattern([(0, 0), (1, 2), (3, 1), (4, 0), (5, 2), (7, 1)]),
            ],
            .breakdown: [Pattern([(0, 0), (4, 0)]), Pattern([(0, 0), (6, 0)])],
            .peak: [
                Pattern([(0, 0), (1, 2), (3, 1), (4, 0), (5, 2), (6, 1), (7, 2)]),
                Pattern([(0, 0), (2, 2), (3, 1), (4, 0), (5, 1), (6, 2), (7, 1)]),
            ],
            .outro: [Pattern([(0, 0), (3, 1), (4, 0), (7, 1)])],
        ],
        scaleTones: []
    )

    // ttd·08 — "minimal ii", the authored F-minor set ported exactly from
    // reference/tap-tap-dodo-minimal-ii.html. Swing, sidechain, dub delay,
    // 3-against-4 polymeter. Chart is authored (MinimalII.chart), not seeded.
    static let minimalII = TrackDef(
        id: "ttd08", index: 8, name: "minimal ii",
        genreLine: "minimal ii · f minor · 128 · swing + dub",
        bpm: 128, bars: 48, travel: 1.7, swing: 0.5, melodic: false,
        sections: [
            Section(kind: .intro, bars: 0..<4),
            Section(kind: .groove, bars: 4..<16),
            Section(kind: .breakdown, bars: 16..<20),
            Section(kind: .peak, bars: 20..<40),
            Section(kind: .outro, bars: 40..<48),
        ],
        patternBank: [
            .intro: [Pattern([(1, 1), (5, 1)])],
            .groove: [Pattern([(0, 0), (3, 1), (4, 0), (7, 1)])],
            .breakdown: [Pattern([(2, 2), (6, 2)])],
            .peak: [Pattern([(0, 0), (3, 1), (4, 0), (7, 1)])],
            .outro: [Pattern([(0, 0)])],
        ],
        scaleTones: [],
        backingStyle: "minimal2",
        tail: 0.75 * (60.0 / 128.0) * 4 + 1.0
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
