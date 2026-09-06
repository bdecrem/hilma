import SwiftUI

// Color/font tokens mirroring src/app/jam/jam.css ("desk instrument" design
// system). Keep names in sync with the CSS custom properties so a value
// change on one side is easy to port to the other.
enum JBTheme {
    static let panel = Color(hex: 0xDCDFD8)      // enamel
    static let panel2 = Color(hex: 0xE9EBE5)     // raised card
    static let panel3 = Color(hex: 0xCFD3CB)     // recessed well / transport
    static let panel4 = Color(hex: 0xF5F6F2)     // paper (inputs)

    static let ink = Color(hex: 0x14161A)
    static let ink2 = Color(hex: 0x3A3D44)
    static let ink3 = Color(hex: 0x6B6F78)
    static let rule = Color(hex: 0xB6BAB1)

    static let orange = Color(hex: 0xFF4F1F)
    static let orangeSoft = Color(hex: 0xFFB39C)
    static let cobalt = Color(hex: 0x2C5BFF)
    static let green = Color(hex: 0x0F9F6E)
    static let ledOff = Color(hex: 0xB7BBB2)

    /// Condensed uppercase labels — panel silkscreen text.
    static func panelFont(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .default).width(.condensed)
    }

    /// Body copy — chat text, readable prose.
    static func bodyFont(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    /// Numeric readouts (BPM, bars, dB).
    static func monoFont(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
