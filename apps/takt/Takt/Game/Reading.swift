import Foundation

/// The Reading module (2026-11-07): learn to read the staff by playing a track from it.
/// Three lessons, the right hand on the treble clef, the left on the bass clef, both on the
/// grand staff; each is the same track in practice mode with a reading line written in
/// notation (`Content/reading-R.json`), drawn as a staff that scrolls past a fixed playhead
/// instead of the Stage's highway. Pure: the content, the staff's arithmetic, the coach's
/// words and the gate. The screen is `ReadingStage`, the session `Player+Reading`.
struct Reading: Decodable {
    struct Module: Decodable {
        let code: String
        let title: String
        let detail: String
    }

    enum Clef: String, Decodable {
        case treble, bass, grand

        var title: String {
            switch self {
            case .treble: "Treble clef"
            case .bass: "Bass clef"
            case .grand: "Grand staff"
            }
        }
    }

    enum Hand: String, Decodable {
        case right, left
    }

    /// Note names under the notes: on (lessons 1 and 2), faint (lesson 3), off. A chip on the
    /// screen cycles them.
    enum Names: String, Decodable, CaseIterable {
        case on, faint, off

        var next: Names { Names.allCases[(Names.allCases.firstIndex(of: self)! + 1) % Names.allCases.count] }
    }

    /// One lesson: its staff, its default names, and one line per hand, a 12-bar chorus (or any
    /// length; it repeats through the track) written a bar a string.
    struct Lesson: Decodable {
        let id: String
        let title: String
        let goal: String
        let clef: Clef
        let names: Names
        /// The bars, each like "C4/q E4/q G4/h" or "C4/h r/h" (w h. h q. q e; `/n` after
        /// the length sets the finger; `r` is a rest).
        let right: [String]?
        let left: [String]?
        /// The five-finger position: a finger per key, by name ("C4": 1).
        let fingers: [String: [String: Int]]
        /// The cheat sheet: a heading, a line, the notes it draws, the mnemonics, a closing line.
        let cheat: Cheat
    }

    struct Cheat: Decodable, Equatable {
        let title: String
        let lead: String
        let notes: [String]
        let mnemonics: [Mnemonic]
        let tip: String
        /// Draw the note values row (1 beat, 2 beats, 4 beats, a rest).
        let values: Bool
    }

    struct Mnemonic: Decodable, Equatable {
        let label: String
        let letters: String
        let words: String
    }

    let module: Module
    /// The track the line is played to: a bundled band or song file (its band). A placeholder
    /// until the module's own track exists.
    let track: String
    /// The band's tempo, full speed (the knob runs from half of it).
    let tempo: Int
    let key: String
    /// The band channel the reading line replaces.
    let channel: String
    /// The form's chord names as shown ("C" → "C7").
    let chords: [String: String]
    /// A chorus is clean when this share of its notes was played; this many clean finish a lesson.
    let cleanShare: Double
    let gate: Int
    let lessons: [Lesson]

    static let file = "reading-R"

    static let bundled: Reading = {
        guard let url = Bundle.main.url(forResource: file, withExtension: "json") else { fatalError("\(file).json is not in the bundle") }
        do {
            return try load(Data(contentsOf: url))
        } catch {
            fatalError("\(file).json: \(error)")
        }
    }()

    /// Bad content traps at load (as the lessons do): every bar adds up, every key has a finger.
    static func load(_ data: Data) throws -> Reading {
        let r = try JSONDecoder().decode(Reading.self, from: data)
        for l in r.lessons {
            guard l.right != nil || l.left != nil else { throw LoadError("\(l.id): no line") }
            for hand in [Hand.right, .left] {
                guard let bars = l.bars(hand) else { continue }
                for (i, bar) in bars.enumerated() {
                    let events = try parse(bar: bar, hand: hand, fingers: l.fingers[hand.rawValue] ?? [:])
                    let beats = events.reduce(0) { $0 + $1.beats }
                    guard abs(beats - 4) < 0.001 else { throw LoadError("\(l.id) \(hand.rawValue) bar \(i + 1): \(beats) beats") }
                }
            }
            if let r = l.right, let lh = l.left, r.count != lh.count { throw LoadError("\(l.id): hands of different lengths") }
        }
        return r
    }

    struct LoadError: LocalizedError {
        let message: String
        init(_ m: String) { message = m }
        var errorDescription: String? { message }
    }

    // MARK: The line

    /// A written event: a note (or a rest) in a bar, its length in beats.
    struct Event: Equatable {
        let midi: Int?
        let beats: Double
        let finger: Int?
        let hand: Hand
        /// The spelling: the letter and its accidental (+1 sharp, -1 flat).
        let letter: Character?
        let accidental: Int
    }

    static let lengths: [String: Double] = ["w": 4, "h.": 3, "h": 2, "q.": 1.5, "q": 1, "e": 0.5]

    static func parse(bar: String, hand: Hand, fingers: [String: Int]) throws -> [Event] {
        try bar.split(separator: " ").map { token in
            let parts = token.split(separator: "/").map(String.init)
            guard parts.count == 2 || parts.count == 3, let beats = lengths[parts[1]] else { throw LoadError("bad token \(token)") }
            if parts[0] == "r" { return Event(midi: nil, beats: beats, finger: nil, hand: hand, letter: nil, accidental: 0) }
            guard let p = pitch(parts[0]) else { throw LoadError("bad pitch \(parts[0])") }
            let finger = parts.count == 3 ? Int(parts[2]) : fingers[parts[0]]
            guard let f = finger, (1...5).contains(f) else { throw LoadError("no finger for \(parts[0])") }
            return Event(midi: p.midi, beats: beats, finger: f, hand: hand, letter: p.letter, accidental: p.accidental)
        }
    }

    /// "C4" = 60, "F#3", "Bb4".
    static func pitch(_ s: String) -> (midi: Int, letter: Character, accidental: Int)? {
        let semis: [Character: Int] = ["C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11]
        guard let letter = s.first, let base = semis[letter], let octave = Int(String(s.last!)) else { return nil }
        let mid = s.dropFirst().dropLast()
        let acc = mid == "#" ? 1 : mid == "b" ? -1 : mid.isEmpty ? 0 : 99
        guard acc != 99 else { return nil }
        return ((octave + 1) * 12 + base + acc, letter, acc)
    }

    /// A note on the staff: where it sits in the song, what it is, how it is written.
    struct Note: Equatable {
        let tick: Int
        let ticks: Int
        let event: Event
        var midi: Int? { event.midi }
        var rest: Bool { event.midi == nil }
    }

    /// The lesson's line through `bars` bars of the track: the chorus again and again, both
    /// hands, notes and rests, in time order.
    func line(_ lesson: Lesson, bars: Int, ticksPerBeat: Int) -> [Note] {
        let tpBar = 4 * ticksPerBeat
        var out: [Note] = []
        for hand in [Hand.right, .left] {
            guard let chorus = lesson.bars(hand) else { continue }
            let parsed = chorus.map { try! Self.parse(bar: $0, hand: hand, fingers: lesson.fingers[hand.rawValue] ?? [:]) }
            for bar in 0..<bars {
                var t = bar * tpBar
                for e in parsed[bar % parsed.count] {
                    let ticks = Int((e.beats * Double(ticksPerBeat)).rounded())
                    out.append(Note(tick: t, ticks: ticks, event: e))
                    t += ticks
                }
            }
        }
        return out.sorted { ($0.tick, $0.midi ?? -1) < ($1.tick, $1.midi ?? -1) }
    }

    /// The bars of a chorus.
    func chorusBars(_ lesson: Lesson) -> Int { (lesson.right ?? lesson.left ?? []).count }

    /// The lesson as a Stage song: the track's band, one part (both hands), every note played.
    func song(_ lesson: Lesson) -> Song {
        let band = Self.band(track)
        // Whole choruses only; the band's last bar is the tail the run ends in.
        let chorus = chorusBars(lesson)
        let bars = max(chorus, ((band.bars - 1) / chorus) * chorus)
        let notes = line(lesson, bars: bars, ticksPerBeat: band.ticksPerBeat).compactMap { n -> Song.Note? in
            guard let m = n.midi else { return nil }
            // Held for its written length, a hair short so the next key retriggers.
            return Song.Note(t: n.tick, n: m, len: max(1, n.ticks - 1), lv: 1, f: n.event.finger, r: nil, from: nil)
        }
        let part = Song.Part(title: lesson.title, monitor: "piano", channel: channel, notes: notes)
        let sections = stride(from: 0, to: bars, by: chorus).map { Song.Section(bar: $0, name: "Chorus \($0 / chorus + 1)") }
        let meta = Song.Meta(title: lesson.title, style: "Reading", key: key, tempo: tempo, art: "", line: lesson.goal,
                             sections: sections, parts: [Song.PartKey.melody.rawValue: part])
        var b = band
        b.bars = bars + 1
        b.form = Array((0..<(bars + 1)).map { band.form[$0 % band.form.count] })
        return Song(reading: "reading-\(lesson.id)", band: b, meta: meta)
    }

    static func band(_ name: String) -> BandData {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else { fatalError("reading track \(name).json is not in the bundle") }
        do {
            return try BandData.decode(Data(contentsOf: url), name: name)
        } catch {
            fatalError("reading track \(name): \(error)")
        }
    }

    // MARK: The staff

    /// A note's place on a staff: diatonic steps above the bottom line (a line every even
    /// step; middle C on the treble clef is -2, on the bass clef 10).
    static func step(letter: Character, octave: Int, clef: Clef) -> Int {
        let index = Int("CDEFGAB".firstIndex(of: letter)!.utf16Offset(in: "CDEFGAB"))
        let dia = index + 7 * octave
        return dia - (clef == .bass ? 4 + 7 * 2 : 2 + 7 * 4)   // G2 on the bass clef, E4 on the treble
    }

    static func step(_ e: Event, clef: Clef) -> Int? {
        guard let m = e.midi, let letter = e.letter else { return nil }
        // The octave of the written letter: B#3 sounds as C4 but is written on B3's line.
        let octave = (m - e.accidental) / 12 - 1
        return step(letter: letter, octave: octave, clef: clef)
    }

    /// The staff a note is read on: one clef, or the grand staff split by hand.
    static func clef(of e: Event, in lesson: Clef) -> Clef {
        lesson != .grand ? lesson : e.hand == .right ? .treble : .bass
    }

    /// Where a step is, in words: "Second line", "Third space", "Middle C, its own little line".
    static func place(step: Int, clef: Clef) -> String {
        if clef == .treble, step == -2 { return "Middle C, its own little line" }
        if clef == .bass, step == 10 { return "Middle C, its own little line" }
        if step == -1 { return "Just under the staff" }
        if step == 9 { return "Just over the staff" }
        if step < -1 { return "Below the staff" }
        if step > 9 { return "Above the staff" }
        if step % 2 == 0 { return ["Bottom", "Second", "Middle", "Fourth", "Top"][step / 2] + " line" }
        return ["First", "Second", "Third", "Fourth"][(step - 1) / 2] + " space"
    }

    static let fingerNames = ["", "Thumb", "Index", "Middle", "Ring", "Pinky"]

    /// The coach under the staff for the notes up next: the name, where it sits, the finger.
    /// "G. Second line. Pinky." With both hands, the other hand's note after it.
    static func coach(_ now: [Event], lesson: Clef) -> String {
        guard let lead = now.first(where: { $0.hand == .right }) ?? now.first, let step = step(lead, clef: clef(of: lead, in: lesson)) else { return "" }
        var s = "\(name(lead)). \(place(step: step, clef: clef(of: lead, in: lesson))). \(fingerNames[lead.finger ?? 0])"
        if lesson != .grand && lead.hand == .left { s += ", left hand" }
        s += "."
        if let other = now.first(where: { $0.hand != lead.hand }) { s += " Left hand \(name(other))." }
        return s
    }

    /// The note's name as written: "C", "F♯", "B♭".
    static func name(_ e: Event) -> String {
        guard let l = e.letter else { return "" }
        return String(l) + (e.accidental > 0 ? "♯" : e.accidental < 0 ? "♭" : "")
    }

    /// The chord's degree in the key, as the form is read: "I", "IV", "V".
    static func numeral(_ chord: String, key: String) -> String {
        guard let c = pitch(String(chord.prefix(while: { !$0.isNumber && $0 != "m" && $0 != "7" }) + "4")),
              let k = pitch(key + "4") else { return "" }
        let d = ((c.midi - k.midi) % 12 + 12) % 12
        return ["I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII"][d]
    }

    // MARK: The gate

    /// A chorus read: its notes played over its notes. Clean at `cleanShare`.
    static func chorus(played: Int, of total: Int, cleanShare: Double) -> Bool {
        total > 0 && Double(played) / Double(total) >= cleanShare - 1e-9
    }
}

extension Reading.Lesson {
    func bars(_ hand: Reading.Hand) -> [String]? { hand == .right ? right : left }
}

extension Song {
    /// A reading lesson's song (`Reading.song`): built in code, every note on the one tier.
    init(reading name: String, band: BandData, meta: Meta) {
        self.name = name
        self.band = band
        self.meta = meta
        mod = nil
        exact = true
    }
}
