#if DEBUG
import Foundation

/// DEBUG: plays the current step for you, to test gates and unlocks fast (brief §5). The Player
/// schedules each press on the monitor at its tick (sample-accurate) and hands it to the lesson
/// through the same path as a key press when it is heard. `-Autoplay <mode>` or Debug → Autoplay.
struct Autoplay {
    enum Mode: String, CaseIterable, Identifiable {
        /// Every note on the tick.
        case perfect
        /// A good human: ±40 ms, inside the ±60 ms window. Passes.
        case loose
        /// ±130 ms, 12% missed, 12% wrong, 15% doubled. Never clean.
        case sloppy
        /// Every note 75 ms early. Never clean at 70 (window ±60).
        case rush

        var id: String { rawValue }
        var title: String { rawValue.capitalized }
    }

    struct Press {
        let note: Int
        let velocity: Float
        let tick: Double
        let lengthTicks: Double
    }

    let mode: Mode
    /// Expected notes up to this absolute tick have been planned.
    var plannedThrough: Double

    /// Presses for the expected notes after `plannedThrough`, up to `horizon` (absolute ticks).
    /// Offsets are in ms, turned into ticks at `msPerTick`. Seeded per note: the same chorus
    /// plays the same way every run.
    mutating func plan(through horizon: Double, expected: [ExpectedNote], loopTicks: Int, msPerTick: Double) -> [Press] {
        guard horizon > plannedThrough, !expected.isEmpty, msPerTick.isFinite else { return [] }
        let n = expected.count
        var out: [Press] = []
        var chorus = Int((plannedThrough / Double(loopTicks)).rounded(.down))
        while true {
            for (i, e) in expected.enumerated() {
                let at = Double(chorus * loopTicks + e.tick)
                guard at > plannedThrough else { continue }
                guard at <= horizon else {
                    plannedThrough = horizon
                    return out
                }
                let gap = Double((i + 1 < n ? expected[i + 1].tick : expected[0].tick + loopTicks) - e.tick)
                out += presses(for: e, at: at, seed: UInt64(chorus * n + i), gap: gap, msPerTick: msPerTick)
            }
            chorus += 1
        }
    }

    private func presses(for e: ExpectedNote, at: Double, seed: UInt64, gap: Double, msPerTick: Double) -> [Press] {
        var rng = SplitMix64(seed: seed &* 0x9E37_79B9_7F4A_7C15 &+ UInt64(Mode.allCases.firstIndex(of: mode)!))
        let length = gap * 0.5
        func press(_ note: Int, offsetMs: Double, velocity: Float = 0.75, length: Double = length) -> Press {
            Press(note: note, velocity: velocity, tick: at + offsetMs / msPerTick, lengthTicks: length)
        }
        switch mode {
        case .perfect:
            return [press(e.display, offsetMs: 0)]
        case .loose:
            return [press(e.display, offsetMs: rng.uniform(-40, 40), velocity: Float(rng.uniform(0.6, 0.9)))]
        case .rush:
            return [press(e.display, offsetMs: -75)]
        case .sloppy:
            if rng.uniform(0, 1) < 0.12 { return [] }
            var note = e.display
            if rng.uniform(0, 1) < 0.12 { note += rng.uniform(0, 1) < 0.5 ? 1 : 2 }
            let offset = rng.uniform(-130, 130)
            var out = [press(note, offsetMs: offset, velocity: Float(rng.uniform(0.5, 0.9)))]
            if rng.uniform(0, 1) < 0.15 { out.append(press(note, offsetMs: offset + 180, length: length * 0.5)) }
            return out
        }
    }
}

/// A small seeded generator, so autoplay is reproducible.
struct SplitMix64 {
    var state: UInt64

    init(seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    mutating func uniform(_ low: Double, _ high: Double) -> Double {
        low + (high - low) * Double(next() >> 11) / Double(1 << 53)
    }
}
#endif
