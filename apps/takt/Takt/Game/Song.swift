import Foundation

/// A Stage song (Takt/Content/song-*.json, written by scripts/songs/*.py): a band the renderer
/// plays once through, plus the parts you can take from it (the chords, and the melody when it
/// has one), each the whole part with every
/// note weighted and every chord note's role, which `Charting` cuts into levels. The band's own
/// channel for a part is the whole part, so the record plays it in full when you take the other.
/// A **mod** is the same file made by Agent mode (`ModStore`): the player's own version of a
/// bundled song, with its own charting override, loaded from the account instead of the bundle.
struct Song {
    struct Note: Decodable, Equatable {
        /// Tick in the song (12 a beat, 48 a bar), the MIDI note, the length in ticks.
        let t: Int
        let n: Int
        let len: Int
        /// The weight: 1 the hits the part stands on, 2 the groove, 3 pushes and ornaments.
        let lv: Int
        /// The finger.
        let f: Int?
        /// A chord note's role: root, third, fifth, sixth, seventh, ninth.
        let r: String?
        /// The lowest tier the note is on at all, in every pass of the cutter (1 when absent):
        /// a figure whose new keys must not leak into the levels under it (Blue Lantern II's
        /// hand moves from tier 6, its Hard-only extras from 7; 0.1 (109)).
        let from: Int?
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

    /// What a mod carries beside the song: where it came from, how many turns changed it,
    /// and this song's own charting (the shape of charting.json's `songs.<name>`).
    struct ModInfo: Equatable {
        let id: String
        let base: String
        let baseTitle: String
        let version: Int
        let override: [String: Charting.PartOverride]?
        /// "mod" (Agent mode's version, a card) or "solo" (the teacher's whole track, the Solo
        /// level of its base song; `ModStore.Bundle.kind`).
        var kind = "mod"

        var isSolo: Bool { kind == "solo" }

        static func == (a: ModInfo, b: ModInfo) -> Bool { a.id == b.id && a.version == b.version }
    }

    struct LoadError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    let name: String
    let band: BandData
    let meta: Meta
    /// Nil for a bundled song.
    let mod: ModInfo?
    /// A Reading lesson's line (`Reading.song`): every note is played at the one tier, with the
    /// file's fingers; no charting, no ladder.
    var exact = false

    /// The set list, in order.
    static let catalog = ["song-slow-burn", "song-slow-burn-short", "song-boogie-shoes", "song-pearl-street", "song-dockery", "song-friars-point", "song-halsted", "song-blue-lantern-white", "song-maxwell-street-five", "song-maxwell-street", "song-blue-lantern", "song-hypnotist", "song-hypnotist-2", "song-warm-nine", "song-abyss", "song-abyss-ref"]

    static func bundled(_ name: String) -> Song {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else { fatalError("song \(name).json is not in the bundle") }
        do {
            return try Song(name: name, data: Data(contentsOf: url), mod: nil)
        } catch {
            fatalError("song \(name).json: \(error)")
        }
    }

    /// A song from its file's bytes (a mod's, or a bundled one's); throws on anything the app
    /// could not play, so a bad file from the account is an error to show, not a trap.
    init(name: String, data: Data, mod: ModInfo?) throws {
        self.name = name
        self.mod = mod
        band = try BandData.decode(data, name: name)
        meta = try JSONDecoder().decode(File.self, from: data).song
        try validate()
    }

    private func validate() throws {
        func fail(_ what: String) -> LoadError { LoadError(message: "song \(name): \(what)") }
        let end = band.loopTicks
        guard meta.parts[PartKey.chords.rawValue] != nil else { throw fail("no chords part") }
        guard meta.parts.keys.allSatisfy({ PartKey(rawValue: $0) != nil }) else { throw fail("an unknown part") }
        for key in partKeys {
            let p = part(key)
            guard ["keys", "horns"].contains(p.channel) else { throw fail("part \(key.rawValue) on channel \(p.channel)") }
            guard !p.notes.isEmpty, p.notes.contains(where: { $0.lv == 1 }) else { throw fail("part \(key.rawValue) has no weight-1 notes") }
            if key == .chords, let keep = Charting.bundled.chords.keep {
                guard p.notes.allSatisfy({ $0.r.map(keep.contains) ?? false }) else { throw fail("a chord note without a role charting.json keeps") }
            }
            for n in p.notes {
                guard (1...3).contains(n.lv), n.t >= 0, n.t < end, n.len > 0, (n.from ?? 1) >= 1 else { throw fail("bad note \(n)") }
            }
        }
        guard band.form.count == band.bars, band.bars >= 2, meta.tempo >= 40, !meta.sections.isEmpty,
              meta.sections[0].bar == 0 else { throw fail("form, sections or tempo") }
    }

    /// The charting this song plays by: the bundle's, with a mod's own override on top.
    var charting: Charting {
        guard let o = mod?.override, !o.isEmpty else { return .bundled }
        return Charting.bundled.overriding(song: name, with: o)
    }

    /// A mod's version (0 for a bundled song): what tells a rendered band apart from the last.
    var version: Int { mod?.version ?? 0 }

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

    /// The parts it has, chords first (every song has the chords; Abyss Reference has nothing else).
    var partKeys: [PartKey] { PartKey.allCases.filter { meta.parts[$0.rawValue] != nil } }

    /// The band channel a part replaces.
    func channel(of key: PartKey) -> Channel { part(key).channel == "keys" ? .keys : .horns }

    /// The whole part, in time order.
    func notes(_ key: PartKey) -> [Note] {
        part(key).notes.sorted { ($0.t, $0.n) < ($1.t, $1.n) }
    }

    /// The part at each tier of the charting rules: `[tier - 1][i]` over `notes(key)`. By the
    /// song's own charting unless one is given.
    func masks(_ key: PartKey, charting: Charting? = nil) -> [[Bool]] {
        (charting ?? self.charting).masks(notes(key), song: name, part: key, tempo: meta.tempo, ticksPerBeat: band.ticksPerBeat, ticksPerBar: ticksPerBar)
    }

    /// The part at a tier, in time order.
    func chart(_ key: PartKey, tier: Int, charting: Charting? = nil) -> [Note] {
        let all = notes(key), tiers = masks(key, charting: charting)
        let m = tiers[max(1, min(tiers.count, tier)) - 1]
        return all.indices.filter { m[$0] }.map { all[$0] }
    }

    /// Onsets a second at every tier (the `-LessonCheck` ladder figure): what Agent mode shows
    /// on a level, and what it sends the server to check its own charter against.
    func ladder(_ key: PartKey) -> [Double] {
        let all = notes(key)
        return masks(key).map { m in Double(Set(all.indices.filter { m[$0] }.map { all[$0].t }).count) / seconds }
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
