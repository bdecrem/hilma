import Foundation

/// Presses scheduled on the monitor ahead of the transport, waiting to be heard: when the
/// transport reaches one its key goes down (and the lesson hears it, for the autoplays), and at
/// its length the key comes up again. Show me and the DEBUG autoplays keep one each (Player).
struct PressQueue {
    struct Press: Equatable {
        let note: Int
        let velocity: Float
        /// Absolute transport tick.
        let tick: Double
        let lengthTicks: Double
    }

    struct Release: Equatable {
        let note: Int
        let tick: Double
    }

    private(set) var presses: [Press] = []
    private(set) var releases: [Release] = []

    mutating func add(_ more: [Press]) { presses += more }

    /// Everything heard by `tick`: the presses due, then the releases due (a press queues its
    /// release as it goes down, so a short note comes up in the same frame).
    mutating func advance(to tick: Double) -> (down: [Press], up: [Release]) {
        var down: [Press] = []
        while let i = presses.firstIndex(where: { $0.tick <= tick }) {
            let p = presses.remove(at: i)
            down.append(p)
            releases.append(Release(note: p.note, tick: p.tick + p.lengthTicks))
        }
        var up: [Release] = []
        while let i = releases.firstIndex(where: { $0.tick <= tick }) { up.append(releases.remove(at: i)) }
        return (down, up)
    }

    /// Drops everything; returns the notes still down, to let go of.
    mutating func clear() -> [Int] {
        let held = releases.map(\.note)
        presses.removeAll()
        releases.removeAll()
        return held
    }
}
