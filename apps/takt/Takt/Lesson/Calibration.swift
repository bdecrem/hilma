import Foundation

/// Calibration (brief §5.9), as a timing dial: a click every beat at 90 for as long as you like,
/// a needle that swings to each tap. The needle starts from the saved correction: a tap is
/// measured against the nearest click as heard, then moved by the saved offset, the way a lesson
/// scores it. Centered means the correction is right; a steady lean is how much to move it, and
/// Use this saves that and starts over from the new value. Pure: ticks in, offsets out.
struct Calibration: Equatable {
    /// The first bar is a count-in; taps on it don't count.
    static let listen = 4
    static let tempo = 90
    /// Taps further than this from a click (raw, before the correction) are not taps at it.
    static let maxOffsetMs = 200.0
    /// The correction is kept to this: past it, it is not latency.
    static let clampMs = 150.0
    /// The dial's scale, either side of on time.
    static let scaleMs = 80.0
    /// The average is over this many taps, and needs them all before it is offered.
    static let window = 8
    /// Steady: half the window lands within this of the average (the median absolute deviation).
    static let steadyMs = 20.0

    /// Transport tick of the first click; one per beat after it.
    let firstTick: Double
    let ticksPerBeat: Int
    /// The saved correction the needle starts from, ms (negative: early).
    private(set) var base: Double
    /// Taps in order: the click each was at, and its offset after the correction (negative: early).
    private(set) var taps: [(click: Int, ms: Double)] = []

    init(firstTick: Double, ticksPerBeat: Int, base: Double) {
        self.firstTick = firstTick
        self.ticksPerBeat = ticksPerBeat
        self.base = base
    }

    static func == (a: Calibration, b: Calibration) -> Bool {
        a.firstTick == b.firstTick && a.base == b.base && a.taps.map(\.click) == b.taps.map(\.click)
            && a.taps.map(\.ms) == b.taps.map(\.ms)
    }

    func clickTick(_ k: Int) -> Double { firstTick + Double(k * ticksPerBeat) }

    /// The click being heard at a tick, nil before the first.
    func click(at tick: Double) -> Int? {
        tick < firstTick - 0.5 ? nil : Int(((tick - firstTick) / Double(ticksPerBeat)).rounded(.down))
    }

    /// A press at a heard tick, at the nearest click: the first tap at a click counts, a second
    /// one doesn't, nor do taps in the count-in.
    mutating func tap(tick: Double, msPerTick: Double) {
        let k = Int(((tick - firstTick) / Double(ticksPerBeat)).rounded())
        guard k >= Self.listen, taps.last.map({ $0.click < k }) ?? true else { return }
        let raw = (tick - clickTick(k)) * msPerTick
        guard abs(raw) <= Self.maxOffsetMs else { return }
        taps.append((k, raw - base))
    }

    /// Where the needle points: the last tap.
    var needle: Double? { taps.last?.ms }

    var recent: [Double] { taps.suffix(Self.window).map(\.ms) }

    /// The median of the recent taps, nil until there are a window's worth.
    var average: Double? {
        let r = recent
        guard r.count >= Self.window else { return nil }
        return Self.median(r)
    }

    var steady: Bool {
        guard let a = average else { return false }
        return Self.median(recent.map { abs($0 - a) }) <= Self.steadyMs
    }

    /// The correction Use this saves: the saved one moved by the steady lean, clamped.
    var proposed: Double? {
        guard steady, let a = average else { return nil }
        return min(Self.clampMs, max(-Self.clampMs, base + a))
    }

    /// Saved: the needle starts from the new correction, and the taps start over.
    mutating func rebase(_ offset: Double) {
        base = offset
        taps = []
    }

    static func median(_ v: [Double]) -> Double {
        let s = v.sorted()
        return s.count % 2 == 1 ? s[s.count / 2] : (s[s.count / 2 - 1] + s[s.count / 2]) / 2
    }

    /// The offset in words, "23 ms early" / "on the beat".
    static func words(_ ms: Double) -> String {
        let r = Int(ms.rounded())
        return abs(r) < 3 ? "on the beat" : "\(abs(r)) ms \(r < 0 ? "early" : "late")"
    }
}
