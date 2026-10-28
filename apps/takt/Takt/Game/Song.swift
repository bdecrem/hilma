import Foundation

/// A Stage song (Takt/Content/song-*.json, written by scripts/songs/*.py): a band the renderer
/// plays once through, plus the two parts you can take from it, each a chart with every note
/// tagged by the lowest level it appears at (1 easy, 2 medium, 3 hard). The band's own channel
/// for a part is the hard chart, so the record plays the part in full when you take the other.
struct Song {
    struct Note: Decodable, Equatable {
        /// Tick in the song (12 a beat, 48 a bar), the MIDI note, the length in ticks.
        let t: Int
        let n: Int
        let len: Int
        /// 1 easy, 2 medium, 3 hard: the lowest level that plays it.
        let lv: Int
        /// The finger, when the part says (the chords).
        let f: Int?
    }

    struct Part: Decodable {
        let title: String
        /// The instrument your keys play while you take it (the record's synth, or the piano).
        let monitor: String
        /// The band channel it replaces: "keys" or "horns".
        let channel: String
        let notes: [Note]
    }

    struct Section: Decodable, Equatable {
        let bar: Int
        let name: String
    }

    struct Meta: Decodable {
        let title: String
        let style: String
        let key: String
        let tempo: Int
        /// The cover's glyph (`SongArt`).
        let art: String
        let line: String
        let sections: [Section]
        let parts: [String: Part]
    }

    private struct File: Decodable {
        let song: Meta
    }

    enum PartKey: String, CaseIterable, Codable {
        case chords, melody
        var title: String { self == .chords ? "Chords" : "Melody" }
    }

    let name: String
    let band: BandData
    let meta: Meta

    /// The set list, in order.
    static let catalog = ["song-slow-burn", "song-boogie-shoes", "song-hypnotist", "song-warm-nine", "song-abyss"]

    static func bundled(_ name: String) -> Song {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else { fatalError("song \(name).json is not in the bundle") }
        let meta: Meta
        do {
            meta = try JSONDecoder().decode(File.self, from: Data(contentsOf: url)).song
        } catch {
            fatalError("song \(name).json: \(error)")
        }
        let song = Song(name: name, band: .bundled(name), meta: meta)
        song.validate()
        return song
    }

    private func validate() {
        let end = band.loopTicks
        for key in PartKey.allCases {
            guard let p = meta.parts[key.rawValue] else { fatalError("song \(name): no \(key.rawValue) part") }
            guard ["keys", "horns"].contains(p.channel) else { fatalError("song \(name): part \(key.rawValue) on channel \(p.channel)") }
            guard !p.notes.isEmpty, p.notes.contains(where: { $0.lv == 1 }) else { fatalError("song \(name): part \(key.rawValue) is empty at easy") }
            for n in p.notes {
                guard (1...3).contains(n.lv), n.t >= 0, n.t < end, n.len > 0 else { fatalError("song \(name): bad note \(n)") }
            }
        }
        guard band.form.count == band.bars, band.bars >= 2, meta.tempo >= 40, !meta.sections.isEmpty,
              meta.sections[0].bar == 0 else { fatalError("song \(name): form, sections or tempo") }
    }

    var ticksPerBar: Int { band.ticksPerBar }
    /// Bars of music; the band's last bar is a silent tail the game ends in.
    var bars: Int { band.bars - 1 }
    /// Where the game ends: half a bar into the tail, the last chord still ringing.
    var endTick: Int { bars * ticksPerBar + ticksPerBar / 2 }
    var seconds: Double { Double(bars * band.beatsPerBar) * 60 / Double(meta.tempo) }
    var length: String {
        let s = Int(seconds.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    func part(_ key: PartKey) -> Part { meta.parts[key.rawValue]! }

    /// The band channel a part replaces.
    func channel(of key: PartKey) -> Channel { part(key).channel == "keys" ? .keys : .horns }

    /// The part at a level: the notes that play at it, in time order.
    func chart(_ key: PartKey, level: Int) -> [Note] {
        part(key).notes.filter { $0.lv <= level }.sorted { ($0.t, $0.n) < ($1.t, $1.n) }
    }

    func chord(atBar bar: Int) -> String { band.form[max(0, min(band.form.count - 1, bar))] }

    func section(atBar bar: Int) -> String {
        meta.sections.last { $0.bar <= bar }?.name ?? meta.sections[0].name
    }

    /// The keys the part needs: its span, at least two octaves, white keys at both ends.
    func keyboard(_ key: PartKey, keys: Int = 24) -> ClosedRange<Int> {
        let notes = part(key).notes.map(\.n)
        guard let lo = notes.min(), let hi = notes.max() else { return 48...71 }
        var low = min(lo, (lo + hi) / 2 - keys / 2)
        while KeyboardStrip.isBlack(low) { low -= 1 }
        var high = max(hi, low + keys - 1)
        while KeyboardStrip.isBlack(high) { high += 1 }
        return low...high
    }
}
