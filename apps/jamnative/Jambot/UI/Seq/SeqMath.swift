import Foundation

/// Pure helpers for the native step sequencer — the view-side half of
/// `src/app/jam/seq/model.ts` (notes, labels, paging, arrangement maths).
/// Pattern EDITS live in the engine (`engine-bridge.js` `seq`); nothing here
/// mutates a pattern.
enum SeqMath {
    // Canonical voice order per drum machine (matches the engines' VOICES).
    static let drumVoices: [String: [String]] = [
        "jt90": ["kick", "snare", "clap", "rimshot", "lowtom", "midtom", "hitom", "ch", "oh", "crash", "ride"],
        "jb01": ["kick", "snare", "clap", "ch", "oh", "lowtom", "hitom", "cymbal"],
    ]

    static let voiceShort: [String: String] = [
        "kick": "BD", "snare": "SD", "clap": "CP", "rimshot": "RS", "lowtom": "LT", "midtom": "MT", "hitom": "HT",
        "ch": "CH", "oh": "OH", "crash": "CR", "ride": "RD", "cymbal": "CY",
    ]

    static let instrumentNames: [String: String] = [
        "jb01": "JB01 drums", "jt90": "JT90 drums", "jb202": "JB202 bass", "jt30": "JT30 acid",
        "jt10": "JT10 lead", "jp9000": "JP9000 modular", "jbs": "Sampler",
    ]

    private static let monoTypes: Set<String> = ["jb202", "jt30", "jt10"]

    enum Kind { case drums, mono }

    static func kind(of type: String) -> Kind? {
        if drumVoices[type] != nil { return .drums }
        if monoTypes.contains(type) { return .mono }
        return nil
    }

    static func voices(for type: String) -> [String] { drumVoices[type] ?? drumVoices["jt90"]! }

    static func shortLabel(_ voice: String) -> String { voiceShort[voice] ?? String(voice.prefix(2)).uppercased() }

    // MARK: Notes (sharps only on output; flats accepted on input)

    private static let noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    private static let noteMap: [String: Int] = [
        "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "Fb": 4, "E#": 5, "F": 5, "F#": 6, "Gb": 6,
        "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11, "Cb": 11, "B#": 0,
    ]

    /// Editing range C0–C7 (MIDI 12–96).
    static let noteMin = 12
    static let noteMax = 96

    /// Pitch-bar range per synth type (MIDI): the span a melody is drawn against.
    static let pitchRange: [String: (Int, Int)] = [
        "jb202": (24, 60), // C1–C4
        "jt30": (24, 60),
        "jt10": (36, 84),  // C2–C6
    ]

    static func noteToMidi(_ name: String) -> Int? {
        let s = name.trimmingCharacters(in: .whitespaces)
        guard let re = try? NSRegularExpression(pattern: "^([A-Ga-g][#b]?)(-?\\d+)$"),
              let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
              let lr = Range(m.range(at: 1), in: s), let or = Range(m.range(at: 2), in: s) else { return nil }
        var letter = String(s[lr])
        letter = letter.prefix(1).uppercased() + letter.dropFirst()
        guard let semi = noteMap[letter], let octave = Int(s[or]) else { return nil }
        return (octave + 1) * 12 + semi
    }

    static func midiToNote(_ midi: Int) -> String {
        let idx = ((midi % 12) + 12) % 12
        return "\(noteNames[idx])\(Int((Double(midi) / 12).rounded(.down)) - 1)"
    }

    /// Move a note by semitones, clamped to C0–C7.
    static func shiftNote(_ name: String, by semitones: Int) -> String {
        let m = noteToMidi(name) ?? 36
        return midiToNote(max(noteMin, min(noteMax, m + semitones)))
    }

    /// 0…1 position of a note inside the synth's pitch range (clamped).
    static func pitchFrac(_ name: String, type: String) -> Double {
        let (lo, hi) = pitchRange[type] ?? (24, 60)
        guard let m = noteToMidi(name) else { return 0 }
        return max(0, min(1, Double(m - lo) / Double(hi - lo)))
    }

    // MARK: Paging

    static let page = 8

    /// "BAR 2 · STEPS 9–16" for a page of `per` steps.
    static func pageLabel(page: Int, length: Int, per: Int) -> String {
        let first = page * per
        let last = min(length, first + per)
        let bar = first / 16 + 1
        let a = first % 16 + 1
        let b = a + (last - first) - 1
        return "BAR \(bar) · STEPS \(a)–\(b)"
    }

    // MARK: Arrangement

    static func sectionStarts(_ arr: [ArrangementEntry]) -> [Int] {
        var out: [Int] = []
        var at = 0
        for s in arr { out.append(at); at += max(0, s.bars) }
        return out
    }

    static func sectionAtBar(_ arr: [ArrangementEntry], bar: Int) -> Int? {
        let starts = sectionStarts(arr)
        for i in stride(from: arr.count - 1, through: 0, by: -1) where bar >= starts[i] {
            return bar < starts[i] + max(0, arr[i].bars) ? i : nil
        }
        return nil
    }

    /// Section the playhead is in (song scope: by bar; section audition: that section).
    static func playingSection(_ arr: [ArrangementEntry], scope: RenderScope, playStep16: Int?) -> Int? {
        guard let step = playStep16, !arr.isEmpty else { return nil }
        if case .section(let index) = scope { return min(index, arr.count - 1) }
        return sectionAtBar(arr, bar: step / 16)
    }

    /// 1-based section numbers that play `name` on `inst`.
    static func sectionsUsing(_ arr: [ArrangementEntry], inst: String, name: String) -> [Int] {
        arr.enumerated().compactMap { i, s in s.patterns[inst] == name ? i + 1 : nil }
    }

    // MARK: Views

    /// One flag per step: any voice hit (drums) / gate (mono).
    static func hitRow(_ p: SeqPattern) -> [Bool] {
        switch p.data {
        case .mono(let m):
            return m.map(\.gate)
        case .drums(let d):
            return (0..<p.length).map { i in d.values.contains { i < $0.count && $0[i].isOn } }
        }
    }

    static func voiceHasHits(_ p: SeqPattern, voice: String) -> Bool {
        p.drums?[voice]?.contains { $0.isOn } ?? false
    }
}

/// Coalesces sequencer edits into one agent note per instrument+pattern,
/// exactly like `Studio.tsx`'s `seqEditsRef`: the last 8 edits, with "…, "
/// in front once older ones were dropped. The Studio sends the latest text
/// per key with the next message and calls `reset()` afterwards.
@MainActor
final class SeqNoteCoalescer {
    private struct Entry { var edits: [String] = []; var dropped = 0 }
    private var entries: [String: Entry] = [:]

    init() {}

    /// Returns the full note text for `key` after adding `edit`.
    func add(key: String, head: String, edit: String) -> String {
        var e = entries[key] ?? Entry()
        e.edits.append(edit)
        while e.edits.count > 8 { e.edits.removeFirst(); e.dropped += 1 }
        entries[key] = e
        return "\(head): \(e.dropped > 0 ? "…, " : "")\(e.edits.joined(separator: ", "))"
    }

    /// Call after the notes were sent with a message (the web clears its map there).
    func reset() { entries = [:] }
}
