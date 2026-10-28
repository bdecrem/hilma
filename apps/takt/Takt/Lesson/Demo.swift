import Foundation

/// Show me: the step played for you, from the top, at the tempo on the knob. The Player
/// schedules every press on the monitor at its tick (sample-accurate), lights the keys as each
/// one is heard, and the hand and the pads follow the transport as they would for you; nothing
/// is scored, and your own keys still sound. A run shows two passes, a chord step a chorus.
enum Demo {
    struct Press: Equatable {
        let note: Int
        let velocity: Float
        /// Absolute transport tick (the demo starts at 0).
        let tick: Double
        let lengthTicks: Double
    }

    struct Plan: Equatable {
        let presses: [Press]
        /// The tick the demo ends at: the band stops there.
        let endTicks: Double
    }

    /// Every expected note before the end, each held for most of the way to the next different
    /// tick (a chord on the 1 rings for the bar; the last note of a run holds through the rest).
    /// The downbeat of a bar plays a little stronger.
    static func plan(expected: [ExpectedNote], loopTicks: Int, ticksPerBar: Int, cycle: Int?) -> Plan {
        let bars = loopTicks / ticksPerBar
        let shown = cycle.map { min(bars, 2 * $0) } ?? bars
        let end = Double(shown * ticksPerBar)
        // The expected notes cover a chorus; the demo shows the first `shown` bars of it.
        let ticks = Array(Set(expected.map(\.tick))).sorted()
        var presses: [Press] = []
        for e in expected {
            let at = Double(e.tick)
            guard at < end else { continue }
            let next = ticks.first { $0 > e.tick }.map { Double($0) } ?? Double(ticks[0] + loopTicks)
            let length = min((next - at) * 0.9, end - at)
            let onDownbeat = e.tick % ticksPerBar == 0
            presses.append(Press(note: e.display, velocity: onDownbeat ? 0.8 : 0.7, tick: at, lengthTicks: length))
        }
        return Plan(presses: presses.sorted { $0.tick < $1.tick }, endTicks: end)
    }
}
