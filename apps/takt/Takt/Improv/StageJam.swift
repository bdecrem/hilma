import Foundation

/// Jam on any Stage song (Bart, 2026-11-13: "for all games, offer an JAM/improvize mode like we
/// offer in the Map, I'm guessing from the main card on Stage. And then the agent offers a
/// variant on that"). The map's improvs (`improv-white`, `improv-five`) are free steps written
/// by hand over a Stage song's band; this is the same step made from the song itself, in a
/// lesson of its own (`jam-<song>`, never a bundled module): the song's band looping with its
/// melody out, any note, the take to the teacher, the idea back, and the whole track as the
/// song's Solo level. IMPROV.md "Jam on any song".
extension Lesson {
    /// A Stage jam's lesson code: "jam-" and the song's name.
    static let stageJamPrefix = "jam-"

    var isStageJam: Bool { code.hasPrefix(Self.stageJamPrefix) }

    /// The bars a jam on `song` loops by, one chorus of the backing: the chords' own cycle when
    /// they repeat every 16 bars or fewer (Hypnotist's 4, Abyss's 8), made a multiple of four
    /// bars; a blues by its 12 bars when most of the song keeps them; else the whole track in
    /// whole four-bar phrases (Restlicht's 124 bars).
    static func jamForm(_ song: Song) -> [String] {
        var music = song.band.form
        while music.count > 1, music.last == "—" { music.removeLast() }
        let n = music.count
        for p in 1...min(16, n) where (0..<n).allSatisfy({ music[$0] == music[$0 % p] }) {
            var bars = p
            while bars % 4 != 0 { bars += p }
            return (0..<bars).map { music[$0 % p] }
        }
        if n >= 24, Double((0..<n).filter { music[$0] == music[$0 % 12] }.count) / Double(n) >= 0.8 {
            return Array(music.prefix(12))
        }
        return Array(music.prefix(max(4, n / 4 * 4)))
    }

    /// A chord symbol's root pitch class ("B♭7" → 10, "F/A" → 5, "D5" → 2); nil when it names none.
    static func root(of chord: String) -> Int? {
        let semis: [Character: Int] = ["C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11]
        guard let first = chord.first, let base = semis[first] else { return nil }
        let next = chord.dropFirst().first
        let acc = next == "#" || next == "♯" ? 1 : next == "b" || next == "♭" ? -1 : 0
        return ((base + acc) % 12 + 12) % 12
    }

    /// Whether a song swings: its drums play the shuffle's late eighth (two thirds through the
    /// beat) more often than the straight one (halfway). The teacher reads the feel.
    static func swung(_ song: Song) -> Bool {
        let tpb = song.band.ticksPerBeat
        let late = song.band.channels.drums.filter { $0.t % tpb == tpb * 2 / 3 }.count
        let straight = song.band.channels.drums.filter { $0.t % tpb == tpb / 2 }.count
        return late > straight
    }

    /// The jam's step in its lesson (the second: `stageJam`).
    static let stageJamStep = 1

    /// The jam on `song`, as a lesson the player opens like any module's jam.
    static func stageJam(_ song: Song) -> Lesson {
        let form = jamForm(song)
        let key = Player.keyRoot(song.meta.key)
        var chords: [String: Chord] = [:]
        for c in Set(form) {
            let r = root(of: c) ?? key.pc
            let numerals = ["I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII"]
            chords[c] = Chord(numeral: c == "—" ? "" : numerals[((r - key.pc) % 12 + 12) % 12], root: r)
        }
        // The band without the part the melody plays (the solo is yours); a song with no melody
        // part (Abyss Reference) plays whole under you.
        let melody = song.partKeys.contains(.melody)
        let out = melody ? (song.channel(of: .melody) == .keys ? "keys" : "horns") : nil
        let band: [String] = ["drums", "bass", "keys", "horns"].filter { $0 != (out ?? "") }
        let id = stageJamPrefix + song.name
        let title = "Jam on \(song.meta.title)"
        let chorus = form.count == 12 ? "the 12 bars" : form.count < song.bars - 1 ? "every \(form.count) bars" : "the whole track"
        // "The riff" reads as "its riff".
        var part = melody ? song.part(.melody).title.lowercased() : ""
        if part.hasPrefix("the ") { part.removeFirst(4) }
        let about = "\(song.meta.title)'s band\(melody ? " without its \(part)" : ""): the solo is yours. Play anything, in \(song.meta.key); the band goes round \(chorus). Leave space, repeat what you like, land somewhere on beat 1. When you're done, send it: the teacher listens, sends back notes and one idea made from what you played, at your level, and writes the whole track as this song's Solo."
        let coach = Coach(intro: "Your solo over \(song.meta.title).", change: "Get ready. {next} on the 1.", hold: "{chord}. Play what you hear.",
                          clean: "That's a chorus. Keep going.", again: "{problem} Keep going.", join: "From the top.",
                          slow: nil, passed: nil, tomorrow: nil, unlock: nil, alone: nil)
        let step = Step(id: id, kind: .free, title: title, skill: nil, tempo: song.meta.tempo, pattern: nil, cycle: nil,
                        hand: "right", key: song.meta.key, flats: nil, band: band, transpose: nil, feel: nil, backing: song.name,
                        form: form, chords: chords, gate: nil, maxAttempts: nil, ramp: nil, aloneBars: nil, scale: nil,
                        minNotes: Player.takeMinimum, card: nil, about: about, coach: coach)
        // The lesson engine opens every lesson on a play step: a root on the 1 under the jam,
        // never shown (the jam opens on its own intro, step 2; `Player.start(stageJam:)`).
        let first = form.first.flatMap { chords[$0] }?.root ?? key.pc
        let warm = Step(id: id + "-root", kind: .play, title: "The root", skill: nil, tempo: song.meta.tempo,
                        pattern: [PatternNote(beat: 1, tick: nil, tone: nil, semitones: nil, bar: nil, finger: 1, chord: nil, note: 48 + first)],
                        cycle: nil, hand: "right", key: song.meta.key, flats: nil, band: band, transpose: nil, feel: nil, backing: song.name,
                        form: form, chords: chords, gate: 1, maxAttempts: nil, ramp: nil, aloneBars: nil, scale: nil, minNotes: nil,
                        card: nil, about: nil,
                        coach: Coach(intro: "The root.", change: coach.change, hold: coach.hold, clean: "Good.", again: "{problem}",
                                     join: coach.join, slow: "Good.", passed: "Good.", tomorrow: nil, unlock: nil, alone: nil))
        let jam = JamSpec(after: 1, title: title, skill: "Your solo over \(song.meta.title)'s band", goal: "Improvise. Get notes and one idea back, at your level.",
                          step: id, theme: Theme(glyph: "hand", title: "Jam", line: "\(song.meta.title)'s band, your solo."))
        let channels = [("Drums", "drums"), ("Bass", "bass"), ("Keys", "keys"), ("Horns", "horns")].map { LessonChannel(name: $0.0, channel: $0.1, unlockAt: nil) }
        return Lesson(code: id, title: song.meta.title, key: song.meta.key,
                      module: Module(code: "jam", title: song.meta.title, detail: "Jam"),
                      lessons: [LessonSpec(title: title, skill: "", goal: "", steps: [warm.id], theme: nil)], later: nil, jams: [jam],
                      band: song.name, chords: chords, form: form, range: NoteRange(low: 48, high: 84), displayRoot: key.pc,
                      channels: channels, steps: [warm, step])
    }
}
