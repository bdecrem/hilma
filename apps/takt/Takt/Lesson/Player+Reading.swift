import SwiftUI
import os

/// A Reading lesson under way: which lesson, its line as written (notes and rests, both
/// hands), the keys half lit after a miss, and the gate (two clean choruses).
struct ReadingSession {
    let content: Reading
    let index: Int
    /// The line through the song, as the staff draws it.
    let line: [Reading.Note]
    /// The engine's note index of each written note (`tick * 128 + midi`).
    let engineIndex: [Int: Int]
    let trackName: String
    /// Keys half lit after a miss (MIDI note → the uptime it lit), and the engine's notes
    /// already hinted, so a miss lights its key once.
    var hints: [Int: Double] = [:]
    var hinted: Set<Int> = []
    /// Clean choruses this sitting, and the choruses already read (by number).
    var clean = 0
    var read: Set<Int> = []
    /// The tick the band last started from: a chorus counts only when it was played from its top.
    var from = 0.0
    /// The last chorus read: its notes played, of its notes.
    var last: (played: Int, of: Int)?
    /// The lesson was done before this sitting or in it.
    var done: Bool

    var lesson: Reading.Lesson { content.lessons[index] }
    var chorusBars: Int { content.chorusBars(lesson) }
}

extension Player {
    /// Lesson `index` of the Reading module: the track held at bar 1 in practice, the line on
    /// the staff, every note played as written.
    func startReading(_ content: Reading, lesson index: Int, done: Bool) {
        let lesson = content.lessons[index]
        let song = content.song(lesson)
        let line = content.line(lesson, bars: song.bars, ticksPerBeat: song.band.ticksPerBeat)
        startGame(song: song, part: .melody, difficulty: .hard, practice: true)
        guard let game else { return }
        var map: [Int: Int] = [:]
        for (i, n) in game.notes.enumerated() { map[n.t * 128 + n.n] = i }
        reading = ReadingSession(content: content, index: index, line: line, engineIndex: map,
                                 trackName: Reading.band(content.track).name, done: done)
        lessonLog.info("reading: \(lesson.id, privacy: .public) · \(song.bars) bars on \(content.track, privacy: .public)")
    }

    /// A key pressed in a Reading lesson, before the engine judges it: the key half lit after a
    /// miss goes dark when it is played; a key no note due wants half lights the key(s) the note
    /// nearest the press wanted (the right answer, right after the wrong one).
    func readingPress(_ note: Int, tick: Double, msPerTick: Double) {
        guard var r = reading, let game, msPerTick.isFinite, msPerTick > 0 else { return }
        r.hints[note] = nil
        let reach = game.loose(msPerTick: msPerTick)
        let due = game.notes.indices.filter { game.status[$0] == .pending && abs(Double(game.notes[$0].t) - tick) <= reach }
        if !due.isEmpty, !due.contains(where: { game.notes[$0].n == note }),
           let nearest = due.min(by: { abs(Double(game.notes[$0].t) - tick) < abs(Double(game.notes[$1].t) - tick) }) {
            let now = ProcessInfo.processInfo.systemUptime
            for i in due where game.notes[i].t == game.notes[nearest].t { r.hints[game.notes[i].n] = now }
        }
        reading = r
    }

    /// How lit a hinted key is, `elapsed` seconds after it lit: fully (a third of the key to
    /// play now) for a beat, then fading out over half a beat.
    static func hintStrength(elapsed: Double, beat: Double) -> Double {
        elapsed <= beat ? 1 : max(0, 1 - (elapsed - beat) / (beat / 2))
    }

    /// A scrub or a start: what was read from there on is unread again, and a chorus counts
    /// from its top only.
    func readingSeek(to tick: Double) {
        guard var r = reading, let game else { return }
        let chorus = r.chorusBars * game.ticksPerBar
        r.read = r.read.filter { Double(($0 + 1) * chorus) <= tick }
        r.from = tick
        r.hints = [:]
        r.hinted = r.hinted.filter { Double(game.notes[$0].t) < tick }
        reading = r
    }

    /// Every frame: a chorus whose last note's window has passed is read; played from its top
    /// with `cleanShare` of its notes, it is clean; `gate` clean finish the lesson.
    func runReading(_ heard: TransportClock.Position) {
        guard var r = reading, let game, playing, heard.msPerTick.isFinite else { return }
        let chorus = r.chorusBars * game.ticksPerBar
        let reach = game.loose(msPerTick: heard.msPerTick)
        let choruses = game.song.bars / r.chorusBars
        var changed = false
        // A note that just went by unplayed half lights its key (once; not one a scrub skipped).
        let now = ProcessInfo.processInfo.systemUptime
        for (i, n) in game.notes.enumerated() where game.status[i] == .missed && !r.hinted.contains(i) {
            r.hinted.insert(i)
            if Double(n.t) >= heard.tick - reach - Double(2 * game.ticksPerBeat) { r.hints[n.n] = now }
            changed = true
        }
        let stale = r.hints.filter { now - $0.value > 3 }.map(\.key)
        if !stale.isEmpty { for k in stale { r.hints[k] = nil }; changed = true }
        for c in 0..<choruses where !r.read.contains(c) {
            let end = Double((c + 1) * chorus)
            guard heard.tick >= end + reach else { break }
            r.read.insert(c)
            changed = true
            guard r.from <= Double(c * chorus) + 1 else { continue }
            let idx = game.notes.indices.filter { game.notes[$0].t >= c * chorus && game.notes[$0].t < (c + 1) * chorus }
            let played = idx.filter { game.isHit($0) }.count
            r.last = (played, idx.count)
            let clean = Reading.chorus(played: played, of: idx.count, cleanShare: r.content.cleanShare)
            if clean { r.clean += 1 }
            lessonLog.notice("reading: \(r.lesson.id, privacy: .public) chorus \(c + 1) · \(played)/\(idx.count)\(clean ? " clean" : "") · \(r.clean) of \(r.content.gate)")
            if clean, r.clean >= r.content.gate, !r.done {
                r.done = true
                if !ProgressStore.readOnly {
                    progress.jamDone(r.lesson.id, in: r.content.module.code)
                    progress.practiced(.lesson, id: "\(r.content.module.code)·\(r.lesson.id)")
                }
                lessonLog.notice("reading: \(r.lesson.id, privacy: .public) done")
            }
        }
        if changed { reading = r }
    }

    /// What the staff draws, this frame.
    func readingState(tick: Double, msPerTick: Double, bar: Int) -> ReadingState? {
        guard let r = reading, let game else { return nil }
        let lesson = r.lesson
        let tpb = game.ticksPerBeat, tpBar = game.ticksPerBar
        let reach = msPerTick.isFinite && msPerTick > 0 ? game.loose(msPerTick: msPerTick) : Double(tpb) / 2
        // Now: the earliest onset still to play (pending, inside its window); next: the one after.
        var nowT: Int?
        for (i, n) in game.notes.enumerated() where game.status[i] == .pending && Double(n.t) + reach >= tick {
            if nowT == nil || n.t < nowT! { nowT = n.t }
        }
        var nextT: Int?
        if let t = nowT {
            for (i, n) in game.notes.enumerated() where game.status[i] == .pending && n.t > t {
                if nextT == nil || n.t < nextT! { nextT = n.t }
            }
        }
        // The staff shows two beats behind the playhead to sixteen ahead (the view clips).
        let lo = tick - Double(4 * tpb), hi = tick + Double(20 * tpb)
        var notes: [ReadingState.Note] = []
        var nowEvents: [Reading.Event] = []
        for (k, n) in r.line.enumerated() {
            let t = Double(n.tick)
            guard t + Double(n.ticks) >= lo, t <= hi else { continue }
            var state = ReadingState.Mark.ahead
            if let m = n.midi, let i = r.engineIndex[n.tick * 128 + m] {
                switch game.status[i] {
                case .hit: state = .played
                case .missed: state = .missed
                case .pending:
                    if n.tick == nowT { state = .now; nowEvents.append(n.event) }
                    else if n.tick == nextT { state = .next }
                }
            } else if t + Double(n.ticks) <= tick {
                state = .played
            }
            notes.append(ReadingState.Note(id: k, tick: n.tick, ticks: n.ticks, event: n.event, mark: state))
        }
        var bars: [ReadingState.Bar] = []
        let first = max(0, Int(lo) / tpBar), last = min(game.song.bars - 1, Int(hi) / tpBar)
        if first <= last {
            for b in first...last {
                let chord = game.song.chord(atBar: b)
                let changes = b == 0 || chord != game.song.chord(atBar: b - 1)
                let label = r.content.chords[chord] ?? chord
                bars.append(ReadingState.Bar(n: b, tick: b * tpBar, chord: changes ? label : nil,
                                             numeral: changes ? Reading.numeral(chord, key: r.content.key) : nil))
            }
        }
        // This chorus so far: notes played of notes judged.
        let chorus = r.chorusBars * tpBar
        let c = max(0, Int(tick) / chorus)
        var played = 0, judged = 0
        for (i, n) in game.notes.enumerated() where n.t >= c * chorus && n.t < (c + 1) * chorus {
            switch game.status[i] {
            case .hit: played += 1; judged += 1
            case .missed: judged += 1
            case .pending: break
            }
        }
        let beatSeconds = msPerTick.isFinite && msPerTick > 0 ? msPerTick * Double(tpb) / 1000 : 60 / Double(game.song.meta.tempo)
        let uptime = ProcessInfo.processInfo.systemUptime
        let soft = r.hints.mapValues { Self.hintStrength(elapsed: uptime - $0, beat: beatSeconds) }.filter { $0.value > 0 }
        return ReadingState(
            clef: lesson.clef, notes: notes, bars: bars,
            coach: r.done && r.clean >= r.content.gate && nowEvents.isEmpty ? "Two clean. Lesson done." : Reading.coach(nowEvents, lesson: lesson.clef),
            number: r.index + 1, count: r.content.lessons.count,
            subtitle: "\(r.content.module.title) · \(r.index + 1) of \(r.content.lessons.count) · \(lesson.clef.title) · \(r.trackName)",
            played: played, judged: judged, chorus: c + 1, clean: r.clean, gate: r.content.gate, done: r.done,
            cheat: lesson.cheat, fingers: lesson.fingers, soft: soft)
    }
}

/// Everything the Reading screen draws: the staff's notes with their marks, the bars, the coach,
/// the chorus count, the cheat sheet.
struct ReadingState: Equatable {
    enum Mark: Equatable { case ahead, now, next, played, missed }

    struct Note: Equatable, Identifiable {
        let id: Int
        let tick: Int
        let ticks: Int
        let event: Reading.Event
        let mark: Mark
        /// The Stage's staff view: how a played note was judged (its colour on the staff).
        var judgment: GameEngine.Judgment? = nil
    }

    struct Bar: Equatable {
        let n: Int
        let tick: Int
        let chord: String?
        let numeral: String?
    }

    var clef = Reading.Clef.treble
    var notes: [Note] = []
    var bars: [Bar] = []
    var coach = ""
    var number = 1
    var count = 3
    var subtitle = ""
    /// This chorus: notes played of notes judged so far; which chorus; the clean ones and the gate.
    var played = 0
    var judged = 0
    var chorus = 1
    var clean = 0
    var gate = 2
    var done = false
    var cheat: Reading.Cheat? = nil
    var fingers: [String: [String: Int]] = [:]
    /// Keys half lit after a miss, 0...1 (`Player.hintStrength`).
    var soft: [Int: Double] = [:]
}
