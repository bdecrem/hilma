import Foundation

/// Calibration (brief §5.9): four clicks to listen, eight to tap along with. Each tap is
/// measured against the nearest click as heard; the median of the eight is how early (or late)
/// this player presses when they line their own note up with the band, on this setup (monitor
/// latency, the keyboard, the hand). The Player then moves every scored press by that much.
/// Pure: ticks in, an offset out.
struct Calibration: Equatable {
    static let listen = 4
    static let taps = 8
    static let tempo = 90
    /// Taps further than this from a click are not taps at it.
    static let maxOffsetMs = 150.0
    /// The correction is kept to a third of a beat window and a bit: past that it is not latency.
    static let clampMs = 80.0
    static let needed = 6

    /// Transport tick of the first click; one per beat after it.
    let firstTick: Double
    let ticksPerBeat: Int
    /// Offsets in ms (negative: early) by click, the tapped clicks only.
    private(set) var offsets: [Int: Double] = [:]

    init(firstTick: Double, ticksPerBeat: Int) {
        self.firstTick = firstTick
        self.ticksPerBeat = ticksPerBeat
    }

    var clickTicks: [Double] {
        (0..<(Self.listen + Self.taps)).map { firstTick + Double($0 * ticksPerBeat) }
    }

    /// After the last click and a beat for a late tap.
    var endTick: Double { firstTick + Double((Self.listen + Self.taps) * ticksPerBeat) }

    /// The click being heard at a tick (for the dots), nil before the first.
    func click(at tick: Double) -> Int? {
        tick < firstTick - 0.5 ? nil : min(Self.listen + Self.taps - 1, Int(((tick - firstTick) / Double(ticksPerBeat)).rounded(.down)))
    }

    /// A press at a heard tick. Taps during the listening clicks don't count; the first tap at a
    /// click counts, a second one doesn't.
    mutating func tap(tick: Double, msPerTick: Double) {
        let k = Int(((tick - firstTick) / Double(ticksPerBeat)).rounded())
        guard k >= Self.listen, k < Self.listen + Self.taps, offsets[k] == nil else { return }
        let ms = (tick - (firstTick + Double(k * ticksPerBeat))) * msPerTick
        guard abs(ms) <= Self.maxOffsetMs else { return }
        offsets[k] = ms
    }

    var tapped: Int { offsets.count }

    /// The median offset, clamped; nil with fewer than `needed` taps.
    var result: Double? {
        guard offsets.count >= Self.needed else { return nil }
        let s = offsets.values.sorted()
        let m = s.count % 2 == 1 ? s[s.count / 2] : (s[s.count / 2 - 1] + s[s.count / 2]) / 2
        return min(Self.clampMs, max(-Self.clampMs, m))
    }

    /// The offset in words, "23 ms early" / "on the beat".
    static func words(_ ms: Double) -> String {
        let r = Int(ms.rounded())
        return abs(r) < 3 ? "on the beat" : "\(abs(r)) ms \(r < 0 ? "early" : "late")"
    }
}
