import Foundation

// Swift port of src/app/jam/controls.ts's slider math + display formatting.
// The engine (JS) already builds the ControlGroup/Control list (see
// EngineAPI.controls()) — this file only covers the pure functions the
// Controls sheet needs to turn a 0...1 slider position into a value and
// back, honouring log scale, and to format a value for the readout.

enum ControlsMath {
    static func toSlider(_ c: Control, value: Double) -> Double {
        if c.scale == "log" {
            return log(value / c.min) / log(c.max / c.min)
        }
        return (value - c.min) / (c.max - c.min)
    }

    static func fromSlider(_ c: Control, t: Double) -> Double {
        let v: Double
        if c.scale == "log" {
            v = c.min * pow(c.max / c.min, t)
        } else {
            v = c.min + t * (c.max - c.min)
        }
        let step = c.step > 0 ? c.step : 1
        let snapped = (v / step).rounded() * step
        let clamped = max(c.min, min(c.max, snapped))
        return (clamped * 1000).rounded() / 1000
    }

    static func format(_ c: Control, value: Double) -> String {
        switch c.unit {
        case "dB":
            let s = String(format: "%.1f", value).replacingOccurrences(of: ".0", with: "")
            return "\(value > 0 ? "+" : "")\(s) dB"
        case "Hz":
            if value >= 1000 {
                var s = String(format: "%.2f", value / 1000)
                while s.hasSuffix("0") { s.removeLast() }
                if s.hasSuffix(".") { s.removeLast() }
                return "\(s) kHz"
            }
            return "\(Int(value.rounded())) Hz"
        case "semitones":
            return "\(value > 0 ? "+" : "")\(Int(value.rounded())) st"
        case "ms":
            return "\(Int(value.rounded())) ms"
        case "s", "seconds":
            return String(format: "%.1f s", value)
        case "0-1":
            return String(format: "%.2f", value)
        case "cents":
            return "\(value > 0 ? "+" : "")\(Int(value.rounded())) c"
        default:
            return "\(Int(value.rounded()))"
        }
    }
}

/// "3h ago" / "2d ago" style relative time from an ISO-8601 timestamp, for
/// the library row readout — port of Catalog.tsx's `relTime`.
func relTime(_ iso: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    var date = formatter.date(from: iso)
    if date == nil {
        formatter.formatOptions = [.withInternetDateTime]
        date = formatter.date(from: iso)
    }
    guard let date else { return "" }
    let seconds = max(0, Date().timeIntervalSince(date))
    if seconds < 60 { return "just now" }
    let minutes = Int(seconds / 60)
    if minutes < 60 { return "\(minutes)m ago" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h ago" }
    let days = hours / 24
    if days < 30 { return "\(days)d ago" }
    let months = days / 30
    if months < 12 { return "\(months)mo ago" }
    return "\(months / 12)y ago"
}
