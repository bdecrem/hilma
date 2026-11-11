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

    // MARK: Shift

    /// The octave a keyboard's notes moved by before the shift was in semitones (2026-11-11).
    static func octaveKey(_ device: String) -> String { "octave·\(device)" }
    static func transposeKey(_ device: String) -> String { "transpose·\(device)" }
    static let transposeRange = -36...36

    /// Semitones this keyboard's notes move by, before anything hears them: its own setting, or
    /// the octave it had before.
    static func transpose(_ device: String) -> Int {
        let d = UserDefaults.standard
        if let t = d.object(forKey: transposeKey(device)) as? Int { return t }
        return 12 * d.integer(forKey: octaveKey(device))
    }

    /// A note from a keyboard moved by its shift, kept on the MIDI range.
    static func shifted(_ note: Int, by semitones: Int) -> Int { min(127, max(0, note + semitones)) }

    /// A shift as Settings shows it: "0", "+1 oct", "+1 oct +2", "−5".
    static func describe(_ t: Int) -> String {
        if t == 0 { return "0" }
        let sign = t < 0 ? "−" : "+"
        let octaves = abs(t) / 12, rest = abs(t) % 12
        if octaves == 0 { return "\(sign)\(rest)" }
        return rest == 0 ? "\(sign)\(octaves) oct" : "\(sign)\(octaves) oct \(sign)\(rest)"
    }
}
