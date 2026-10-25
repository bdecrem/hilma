import Foundation

/// The loop you leave with (brief §5.8): the payoff chorus as a Standard MIDI File, type 0, one
/// track, 480 ticks per quarter. Tempo and 4/4 at the top, the notes on channel 1 as played
/// (velocity, length, timing; not quantized), and the end of the track on the downbeat after bar
/// 12, so the clip is exactly the chorus and drops onto Ableton's grid at bar 1.
enum MIDIFile {
    static let ppq = 480

    struct Note: Equatable {
        /// Quarter-note ticks (`ppq`) from bar 1.
        let tick: Int
        let length: Int
        let note: Int
        let velocity: Int
    }

    /// The chorus's notes in file ticks. An early first note (before bar 1) starts on bar 1, and
    /// nothing rings past the end of the chorus.
    static func notes(_ finish: LessonEngine.Finish, ticksPerBeat: Int, bars: Int) -> [Note] {
        let scale = Double(ppq) / Double(ticksPerBeat)
        let end = bars * 4 * ppq
        return finish.presses.compactMap { p in
            let on = max(0, Int((p.tick * scale).rounded()))
            let off = min(end, Int(((p.tick + p.lengthTicks) * scale).rounded()))
            guard on < end else { return nil }
            return Note(tick: on, length: max(1, off - on), note: p.note,
                        velocity: min(127, max(1, Int((p.velocity * 127).rounded()))))
        }
        .sorted { ($0.tick, $0.note) < ($1.tick, $1.note) }
    }

    static func data(notes: [Note], tempo: Double, bars: Int, name: String) -> Data {
        var events: [(tick: Int, order: Int, bytes: [UInt8])] = []
        events.append((0, 0, [0xFF, 0x03] + vlq(name.utf8.count) + Array(name.utf8)))
        let usPerQuarter = Int((60_000_000 / tempo).rounded())
        events.append((0, 0, [0xFF, 0x51, 0x03, UInt8(usPerQuarter >> 16 & 0xFF), UInt8(usPerQuarter >> 8 & 0xFF), UInt8(usPerQuarter & 0xFF)]))
        // 4/4, a click per quarter, 8 thirty-seconds per quarter.
        events.append((0, 0, [0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]))
        for n in notes {
            // At the same tick a note-off goes before a note-on (a key restruck).
            events.append((n.tick, 2, [0x90, UInt8(n.note), UInt8(n.velocity)]))
            events.append((n.tick + n.length, 1, [0x80, UInt8(n.note), 0x40]))
        }
        let end = bars * 4 * ppq
        events.sort { ($0.tick, $0.order) < ($1.tick, $1.order) }

        var track: [UInt8] = []
        var last = 0
        for e in events {
            track += vlq(e.tick - last) + e.bytes
            last = e.tick
        }
        track += vlq(end - last) + [0xFF, 0x2F, 0x00]

        var out: [UInt8] = Array("MThd".utf8) + be32(6) + be16(0) + be16(1) + be16(ppq)
        out += Array("MTrk".utf8) + be32(track.count) + track
        return Data(out)
    }

    static func vlq(_ value: Int) -> [UInt8] {
        var v = value
        var bytes = [UInt8(v & 0x7F)]
        v >>= 7
        while v > 0 {
            bytes.insert(UInt8(v & 0x7F) | 0x80, at: 0)
            v >>= 7
        }
        return bytes
    }

    private static func be16(_ v: Int) -> [UInt8] { [UInt8(v >> 8 & 0xFF), UInt8(v & 0xFF)] }
    private static func be32(_ v: Int) -> [UInt8] { [UInt8(v >> 24 & 0xFF), UInt8(v >> 16 & 0xFF), UInt8(v >> 8 & 0xFF), UInt8(v & 0xFF)] }

    /// What a file says, read back (the check): tempo, time signature, notes, length in ticks.
    struct Parsed {
        var format = -1, tracks = 0, ppq = 0
        var usPerQuarter = 0
        var timeSignature: [UInt8] = []
        var name = ""
        var notes: [Note] = []
        var endTick = 0
    }

    static func parse(_ data: Data) -> Parsed? {
        let b = [UInt8](data)
        func u(_ i: Int, _ n: Int) -> Int { (0..<n).reduce(0) { $0 << 8 | Int(b[i + $1]) } }
        guard b.count > 22, String(bytes: b[0..<4], encoding: .ascii) == "MThd",
              String(bytes: b[14..<18], encoding: .ascii) == "MTrk" else { return nil }
        var p = Parsed(format: u(8, 2), tracks: u(10, 2), ppq: u(12, 2))
        let trackEnd = 22 + u(18, 4)
        guard trackEnd == b.count else { return nil }
        var i = 22, tick = 0
        var open: [Int: (tick: Int, velocity: Int)] = [:]
        func readVLQ() -> Int {
            var v = 0
            while true {
                let byte = b[i]; i += 1
                v = v << 7 | Int(byte & 0x7F)
                if byte & 0x80 == 0 { return v }
            }
        }
        while i < trackEnd {
            tick += readVLQ()
            let status = b[i]; i += 1
            if status == 0xFF {
                let type = b[i]; i += 1
                let len = readVLQ()
                let body = Array(b[i..<i + len]); i += len
                switch type {
                case 0x03: p.name = String(decoding: body, as: UTF8.self)
                case 0x51: p.usPerQuarter = body.reduce(0) { $0 << 8 | Int($1) }
                case 0x58: p.timeSignature = body
                case 0x2F: p.endTick = tick
                default: break
                }
            } else if status & 0xF0 == 0x90 {
                open[Int(b[i])] = (tick, Int(b[i + 1])); i += 2
            } else if status & 0xF0 == 0x80 {
                let n = Int(b[i]); i += 2
                if let o = open.removeValue(forKey: n) { p.notes.append(Note(tick: o.tick, length: tick - o.tick, note: n, velocity: o.velocity)) }
            } else {
                return nil
            }
        }
        p.notes.sort { ($0.tick, $0.note) < ($1.tick, $1.note) }
        return p
    }
}
