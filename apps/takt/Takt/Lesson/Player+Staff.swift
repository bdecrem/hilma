import Foundation

/// The Stage in staff view (Bart, 2026-11-09: a toggle on the play screen between the highway
/// and "our note-staff mode that we built for the Reading module"). The same run, the same
/// engine and scoring: only the picture changes. The notes the engine has on the part's tier in
/// the window (Adaptive's tier as it moves) are written on the Reading module's staff: a clef
/// from the part's range (treble, bass, or the grand staff split at middle C), each pitch
/// spelled in the song's key, each length from the time to the next onset.
extension Player {
    /// The toggle's choice (`StageViewToggle`), in the defaults so it holds across songs and launches.
    static let stageViewKey = "stageView"
    static var staffView: Bool { UserDefaults.standard.string(forKey: stageViewKey) == "staff" }

    /// What the staff draws this frame, when the staff view is on.
    func staffState(tick: Double, msPerTick: Double) -> ReadingState? {
        guard Self.staffView, let game else { return nil }
        let song = game.song
        let tpb = game.ticksPerBeat, tpBar = game.ticksPerBar
        let clef = staffClef(for: game)
        let reach = msPerTick.isFinite && msPerTick > 0 ? game.loose(msPerTick: msPerTick) : Double(tpb) / 2
        // Two beats behind the playhead to twenty ahead (the view clips), as the Reading lesson.
        let lo = tick - Double(4 * tpb), hi = tick + Double(20 * tpb)
        let window = game.onHighway(from: lo, to: hi + Double(4 * tpb))
        var nowT: Int?
        for w in window where w.status == .pending && Double(w.note.t) + reach >= tick {
            if nowT == nil || w.note.t < nowT! { nowT = w.note.t }
        }
        var nextT: Int?
        if let t = nowT {
            for w in window where w.status == .pending && w.note.t > t {
                if nextT == nil || w.note.t < nextT! { nextT = w.note.t }
            }
        }
        let root = Self.keyRoot(song.meta.key)
        // Onsets per staff, for the lengths: a note lasts until the next onset on its staff.
        func hand(_ n: Int) -> Reading.Hand { clef == .bass || (clef == .grand && n < 60) ? .left : .right }
        let onsets: [Reading.Hand: [Int]] = Dictionary(grouping: window.map(\.note), by: { hand($0.n) })
            .mapValues { Array(Set($0.map(\.t))).sorted() }
        var notes: [ReadingState.Note] = []
        var nowEvents: [Reading.Event] = []
        for w in window where Double(w.note.t) <= hi {
            let n = w.note
            let h = hand(n.n)
            let next = onsets[h]?.first { $0 > n.t }
            let beats = Self.written(ticks: n.len, gap: next.map { $0 - n.t }, ticksPerBeat: tpb)
            let spelled = Self.spell(n.n, root: root)
            let e = Reading.Event(midi: n.n, beats: beats, finger: game.finger(w.index), hand: h,
                                  letter: spelled.letter, accidental: spelled.accidental)
            var mark = ReadingState.Mark.ahead
            var judgment: GameEngine.Judgment?
            switch w.status {
            case .hit(let j): mark = .played; judgment = j
            case .missed: mark = .missed
            case .pending:
                if n.t == nowT { mark = .now; nowEvents.append(e) } else if n.t == nextT { mark = .next }
            }
            notes.append(ReadingState.Note(id: w.index, tick: n.t, ticks: n.len, event: e, mark: mark, judgment: judgment))
        }
        var bars: [ReadingState.Bar] = []
        let first = max(0, Int(lo) / tpBar), last = min(song.bars - 1, Int(hi) / tpBar)
        if first <= last {
            for b in first...last {
                let chord = song.chord(atBar: b)
                let changes = b == 0 || chord != song.chord(atBar: b - 1)
                bars.append(ReadingState.Bar(n: b, tick: b * tpBar, chord: changes ? chord : nil,
                                             numeral: changes ? Reading.numeral(chord, key: root.name) : nil))
            }
        }
        return ReadingState(clef: clef, notes: notes, bars: bars, coach: Reading.coach(nowEvents, lesson: clef))
    }

    /// The part's clef, from the range of every note it has (not the window's, so the staff
    /// never changes clef mid-song): treble when nothing goes under F3 (three ledger lines: every
    /// melody on the Stage sits on it, the lowest at G3), bass when nothing goes over E4, the
    /// grand staff otherwise, split at middle C (the wide comping parts, Dockery's, Friars Point's).
    private func staffClef(for game: GameEngine) -> Reading.Clef {
        let key = "\(game.song.name)|\(game.part.rawValue)"
        if let c = staffClef, c.key == key { return c.clef }
        let clef = Self.clef(for: game.notes.map(\.n))
        staffClef = (key, clef)
        return clef
    }

    static func clef(for pitches: [Int]) -> Reading.Clef {
        guard let lo = pitches.min(), let hi = pitches.max() else { return .treble }
        if lo >= 53 { return .treble }
        if hi <= 64 { return .bass }
        return .grand
    }

    /// The written length of a note in beats, from the time to the next onset on its staff (or
    /// its own length, the last in the window): the values the staff draws (a sixteenth, an
    /// eighth, a quarter, dotted, a half, dotted, a whole). A shuffle's late eighth (a third of
    /// a beat to the next) is written as an eighth, the way swing is read.
    static func written(ticks: Int, gap: Int?, ticksPerBeat: Int) -> Double {
        let b = Double(min(ticks, gap ?? ticks)) / Double(ticksPerBeat)
        let g = Double(gap ?? ticks) / Double(ticksPerBeat)
        if g <= 0.26 { return 0.25 }
        let values = [0.5, 1, 1.5, 2, 3, 4]
        let target = max(b, min(g, 0.5))
        return values.min { abs(log($0 / target)) < abs(log($1 / target)) }!
    }

    /// The key's root: its pitch class, its letter and accidental ("Dm", "F minor", "Bb", "F#").
    static func keyRoot(_ key: String) -> (pc: Int, letter: Character, accidental: Int, name: String) {
        let k = key.trimmingCharacters(in: .whitespaces)
        let semis: [Character: Int] = ["C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11]
        guard let letter = k.first, let base = semis[letter] else { return (0, "C", 0, "C") }
        let second = k.dropFirst().first
        let acc = second == "#" || second == "♯" ? 1 : second == "b" || second == "♭" ? -1 : 0
        let name = String(letter) + (acc > 0 ? "#" : acc < 0 ? "b" : "")
        return (((base + acc) % 12 + 12) % 12, letter, acc, name)
    }

    /// A pitch spelled in the key: each of the twelve degrees on its own letter counted up from
    /// the root (the blues' flat third, flat fifth and flat seventh as flats: E♭ and B♭ in C,
    /// C♮ in A), a double sharp or flat written as its plain neighbour instead.
    static func spell(_ midi: Int, root: (pc: Int, letter: Character, accidental: Int, name: String)) -> (letter: Character, accidental: Int) {
        let letters: [Character] = ["C", "D", "E", "F", "G", "A", "B"]
        let naturals = [0, 2, 4, 5, 7, 9, 11]
        let pc = ((midi % 12) + 12) % 12
        let degree = ((pc - root.pc) % 12 + 12) % 12
        let steps = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][degree]
        let li = (letters.firstIndex(of: root.letter)! + steps) % 7
        var acc = pc - naturals[li]
        if acc > 6 { acc -= 12 }
        if acc < -6 { acc += 12 }
        if abs(acc) <= 1 { return (letters[li], acc) }
        // Plain: a white key as itself, a black key as the flat of the letter above.
        if let w = naturals.firstIndex(of: pc) { return (letters[w], 0) }
        return (letters[naturals.firstIndex(of: pc + 1)!], -1)
    }
}
