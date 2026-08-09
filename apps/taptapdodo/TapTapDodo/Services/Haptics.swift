import CoreHaptics
import UIKit

/// CHHapticEngine wrapper with pre-created players.
/// Perfect: sharp 0.8/0.9 · Good: 0.5 · Miss: nothing (absence reads as
/// failure) · Kick thump: soft 0.3 during the drop.
final class Haptics {
    private var engine: CHHapticEngine?
    private var perfectPlayer: CHHapticPatternPlayer?
    private var goodPlayer: CHHapticPatternPlayer?
    private var kickPlayer: CHHapticPatternPlayer?
    private let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    init() {
        guard supported else { return }
        engine = try? CHHapticEngine()
        engine?.resetHandler = { [weak self] in
            try? self?.engine?.start()
            self?.buildPlayers()
        }
        engine?.playsHapticsOnly = true
        try? engine?.start()
        buildPlayers()
    }

    private func buildPlayers() {
        perfectPlayer = transientPlayer(intensity: 0.8, sharpness: 0.9)
        goodPlayer = transientPlayer(intensity: 0.5, sharpness: 0.6)
        kickPlayer = transientPlayer(intensity: 0.3, sharpness: 0.25)
    }

    private func transientPlayer(intensity: Float, sharpness: Float) -> CHHapticPatternPlayer? {
        guard let engine else { return nil }
        let event = CHHapticEvent(eventType: .hapticTransient, parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
        ], relativeTime: 0)
        guard let pattern = try? CHHapticPattern(events: [event], parameters: []) else { return nil }
        return try? engine.makePlayer(with: pattern)
    }

    func perfect() { try? perfectPlayer?.start(atTime: CHHapticTimeImmediate) }
    func good() { try? goodPlayer?.start(atTime: CHHapticTimeImmediate) }
    func kick() { try? kickPlayer?.start(atTime: CHHapticTimeImmediate) }
}
