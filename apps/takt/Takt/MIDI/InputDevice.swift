import Foundation

/// What each keyboard keeps for itself (Bart, 2026-11-11: three MIDI controllers on one Mac):
/// its latency correction and its octave. A MIDI keyboard is known by its CoreMIDI name; the
/// computer keys and the touch keys on screen are `local`. Settings → Input lists them, the
/// calibration saves to the keyboard that tapped, and a lesson or song corrects each press by
/// the keyboard it came from.
enum InputDevice {
    /// The computer keys and the keys on screen.
    static let local = ""

    /// The name shown for a CoreMIDI source. Teenage Engineering's K.O. II calls itself by its
    /// model number, EP-133.
    static func displayName(_ raw: String) -> String {
        if raw == local { return "Computer keys" }
        if raw.uppercased().contains("EP-133") { return "K.O. II" }
        return raw
    }

    // MARK: Latency

    static func latencyKey(_ device: String) -> String { "latency·\(device)" }

    /// This keyboard's own correction, nil until it is calibrated.
    static func measuredOffset(_ device: String) -> Double? {
        UserDefaults.standard.object(forKey: latencyKey(device)) as? Double
    }

    /// The one correction from before corrections were per keyboard.
    static var sharedOffset: Double { UserDefaults.standard.double(forKey: "inputOffsetMs") }

    /// The correction a press from this keyboard gets: its own, or the shared one until it has one.
    static func offset(_ device: String) -> Double { measuredOffset(device) ?? sharedOffset }

    static func setOffset(_ ms: Double, for device: String) {
        UserDefaults.standard.set(ms, forKey: latencyKey(device))
    }

    // MARK: Octave

    static func octaveKey(_ device: String) -> String { "octave·\(device)" }
    static let octaveRange = -3...3

    /// Octaves this keyboard's notes move by, before anything hears them.
    static func octave(_ device: String) -> Int {
        UserDefaults.standard.integer(forKey: octaveKey(device))
    }

    /// A note from a keyboard moved by its octave, kept on the MIDI range.
    static func shifted(_ note: Int, octave: Int) -> Int { min(127, max(0, note + 12 * octave)) }
}
