import Foundation

/// THE CLOCK. One object owns musical time; audio scheduling, note positions
/// and judgment all derive from it. Song time is seconds relative to beat 0
/// (negative during the count-in), computed from mach host time — never from
/// Date(), frame timestamps, or SKAction timing.
final class Conductor {
    let bpm: Double
    let leadIn: Double

    private(set) var songStartHostTime: UInt64 = 0
    private(set) var running = false
    private var pausedAt: Double = 0

    /// Seconds per mach tick.
    static let ticksToSeconds: Double = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(info.numer) / Double(info.denom) / 1_000_000_000
    }()

    var secondsPerBeat: Double { 60.0 / bpm }

    init(bpm: Double, leadIn: Double = 3.2) {
        self.bpm = bpm
        self.leadIn = leadIn
    }

    /// Current song time in seconds (negative during count-in).
    var songTime: Double {
        guard running else { return pausedAt }
        return songTime(atHostTime: mach_absolute_time())
    }

    func songTime(atHostTime host: UInt64) -> Double {
        let delta = Int64(bitPattern: host &- songStartHostTime)
        return Double(delta) * Self.ticksToSeconds - leadIn
    }

    /// UITouch.timestamp lives in the systemUptime domain — the same clock as
    /// mach_absolute_time in seconds. Judging with the touch's own timestamp
    /// (not the frame that processed it) is worth ~a frame of accuracy.
    func songTime(atTouchTimestamp t: TimeInterval) -> Double {
        let startUptime = Double(songStartHostTime) * Self.ticksToSeconds
        return t - startUptime - leadIn
    }

    func time(ofBeat beat: Double) -> Double { beat * secondsPerBeat }
    func beat(atTime t: Double) -> Double { t / secondsPerBeat }
    var currentBeat: Double { beat(atTime: songTime) }

    func start() {
        songStartHostTime = mach_absolute_time()
        pausedAt = -leadIn
        running = true
    }

    /// Interruption-safe pause: freeze song time.
    func pause() {
        guard running else { return }
        pausedAt = songTime
        running = false
    }

    /// Rebuild the host-time anchor so the clock realigns exactly where it froze.
    func resume() {
        guard !running else { return }
        let elapsed = pausedAt + leadIn
        let elapsedTicks = UInt64(max(0, elapsed) / Self.ticksToSeconds)
        songStartHostTime = mach_absolute_time() &- elapsedTicks
        running = true
    }
}
