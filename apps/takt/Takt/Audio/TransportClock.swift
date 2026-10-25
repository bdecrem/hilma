import Foundation

/// The transport position at any host time, read from an engine snapshot: host time → the
/// frame being heard then → transport tick. Ticks are absolute (they keep counting across
/// choruses) and "heard" includes the output latency, so a key pressed exactly when the kick
/// is heard maps to the kick's tick.
struct TransportClock {
    struct Position {
        /// Absolute transport tick.
        let tick: Double
        /// Milliseconds per tick at that moment; infinite while the transport holds.
        let msPerTick: Double
        let tempo: Double
        let rolling: Bool
    }

    let snapshot: EngineSnapshot
    let hostTicksPerSecond: Double

    static let hostTicksPerSecond: Double = {
        var mach = mach_timebase_info_data_t()
        mach_timebase_info(&mach)
        return 1e9 * Double(mach.denom) / Double(mach.numer)
    }()

    init(_ snapshot: EngineSnapshot) {
        self.snapshot = snapshot
        hostTicksPerSecond = Self.hostTicksPerSecond
    }

    /// False until the engine has rendered with host times (offline renders never do).
    var valid: Bool { snapshot.refHostTime > 0 }

    func position(atHost host: UInt64) -> Position {
        let s = snapshot
        let frame = Double(s.refFrame) + (Double(host) - Double(s.refHostTime)) / hostTicksPerSecond * s.sampleRate
        // Within half a frame of the anchor is on it: a tick mapped to a host time and back can
        // land a hair early in floating point, and must not read as the transport before it.
        let a = frame >= Double(s.anchor.frame) - 0.5 ? s.anchor : s.previousAnchor
        guard a.rolling else {
            return Position(tick: a.tick, msPerTick: .infinity, tempo: a.tempo, rolling: false)
        }
        return Position(tick: a.tick + (frame - Double(a.frame)) / a.samplesPerTick,
                        msPerTick: a.samplesPerTick / s.sampleRate * 1000, tempo: a.tempo, rolling: true)
    }

    /// The host time a tick is heard at (the inverse of `position`); nil while held.
    func hostTime(atTick tick: Double) -> UInt64? {
        let s = snapshot
        let a = s.anchor.rolling && (tick >= s.anchor.tick || !s.previousAnchor.rolling) ? s.anchor : s.previousAnchor
        guard a.rolling else { return nil }
        let frame = Double(a.frame) + (tick - a.tick) * a.samplesPerTick
        let host = Double(s.refHostTime) + (frame - Double(s.refFrame)) / s.sampleRate * hostTicksPerSecond
        return host > 0 ? UInt64(host.rounded()) : nil
    }
}
