import Foundation

/// What the teacher is told about where the player is (Ask, 0.1 (113); `AppModel.chatContext`):
/// the pure parts. A line of notes reads the way the improv teacher reads a take
/// (`src/lib/takt/improv-agent.ts`): one line a bar, its chord, every note with its beat and
/// its length in beats. Checked by `-LessonCheck`.
enum ChatContext {
    static let names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]

    /// "D" for any D; "D4" for the key (C4 = 60).
    static func pitchName(_ n: Int) -> String { names[(n % 12 + 12) % 12] }
    static func name(_ n: Int) -> String { pitchName(n) + "\(n / 12 - 1)" }

    /// A beat inside the bar, 1-based: "1", "2.5", "3.67". And a length in beats: "1.5", "0.33".
    static func beat(_ tickInBar: Int, ticksPerBeat tpb: Int) -> String { number(Double(tickInBar) / Double(max(1, tpb)) + 1) }
    static func beats(_ ticks: Int, ticksPerBeat tpb: Int) -> String { number(Double(ticks) / Double(max(1, tpb))) }

    private static func number(_ x: Double) -> String {
        let r = (x * 100).rounded() / 100
        if r == r.rounded() { return String(Int(r)) }
        var s = String(format: "%.2f", r)
        while s.hasSuffix("0") { s.removeLast() }
        return s
    }

    /// Notes as a line a bar: "Bar 13 (Snare in), Dm7: D5 on 1 for 1.5, F4 on 3.5 for 1.5"; a bar
    /// with nothing in it reads "rest". Ticks run from the song's start; `chords` is the chord of
    /// every bar; `sections` name the bars they start on.
    static func transcript(notes: [(t: Int, n: Int, len: Int)], chords: [String], sections: [(bar: Int, name: String)] = [],
                           bars: Int, ticksPerBeat tpb: Int, ticksPerBar: Int) -> String {
        var byBar: [Int: [(t: Int, n: Int, len: Int)]] = [:]
        for n in notes where n.t >= 0 && n.t / ticksPerBar < bars { byBar[n.t / ticksPerBar, default: []].append(n) }
        var lines: [String] = []
        for bar in 0..<max(0, bars) {
            let chord = bar < chords.count ? chords[bar] : (chords.last ?? "")
            let section = sections.first { $0.bar == bar }.map { " (\($0.name))" } ?? ""
            let head = "Bar \(bar + 1)\(section)\(chord.isEmpty ? "" : ", \(chord)"):"
            guard let inBar = byBar[bar], !inBar.isEmpty else {
                lines.append("\(head) rest")
                continue
            }
            let out = inBar.sorted { ($0.t, $0.n) < ($1.t, $1.n) }
                .map { "\(name($0.n)) on \(beat($0.t % ticksPerBar, ticksPerBeat: tpb)) for \(beats($0.len, ticksPerBeat: tpb))" }
            lines.append("\(head) \(out.joined(separator: ", "))")
        }
        return lines.joined(separator: "\n")
    }

    /// A take so far (`Improv.Take`, ticks from its first downbeat), the same way, over the form
    /// it loops, each chorus marked where it starts.
    static func transcript(take: Improv.Take, form: [String], ticksPerBeat tpb: Int = 12) -> String {
        let chords = (0..<take.bars).map { form.isEmpty ? "" : form[$0 % form.count] }
        let sections = form.isEmpty ? [] : stride(from: 0, to: take.bars, by: form.count).map { (bar: $0, name: "chorus \($0 / form.count + 1)") }
        return transcript(notes: take.notes.map { ($0.t, $0.n, $0.len) }, chords: chords, sections: sections,
                          bars: take.bars, ticksPerBeat: tpb, ticksPerBar: 4 * tpb)
    }

    /// "D 34, F 20, A 12": the keys of a line by how often they come, most first (pitch classes).
    static func keys(_ notes: [Int]) -> String {
        var counts: [Int: Int] = [:]
        for n in notes { counts[(n % 12 + 12) % 12, default: 0] += 1 }
        return counts.sorted { ($0.value, -$0.key) > ($1.value, -$1.key) }.map { "\(names[$0.key]) \($0.value)" }.joined(separator: ", ")
    }

    /// "E4–F5": the lowest key to the highest.
    static func range(_ notes: [Int]) -> String {
        guard let lo = notes.min(), let hi = notes.max() else { return "" }
        return "\(name(lo))–\(name(hi))"
    }

    /// The notes allowed, from the root up: "D E F G A B C".
    static func scaleLine(allowed: Set<Int>, root: Int) -> String {
        (0..<12).map { (root + $0) % 12 }.filter { allowed.contains($0) }.map { names[$0] }.joined(separator: " ")
    }

    /// A key the way a song file spells it, said in full: "Dm" → "D minor", "A" → "A major";
    /// "A minor" and "E♭ blues" stay as they are.
    static func keyName(_ key: String) -> String {
        let k = key.trimmingCharacters(in: .whitespaces)
        if k.isEmpty || k.contains(" ") { return k }
        if k.hasSuffix("m"), k.count <= 3 { return "\(k.dropLast()) minor" }
        if k.count <= 2 { return "\(k) major" }
        return k
    }
}
