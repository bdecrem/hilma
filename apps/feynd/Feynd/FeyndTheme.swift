import SwiftUI

/// Direct port of the design's `F` token bundle (feynd-atoms.jsx).
/// Single source of truth — every screen reads colors from here.
enum FeyndTheme {
    // Surfaces — warm-tinted dark, never pure black.
    static let bg          = Color(hex: 0x0E0C0B)
    static let bgRaised    = Color(hex: 0x161311)
    static let surface     = Color(hex: 0x1A1715)
    static let surface2    = Color(hex: 0x26221F)
    static let surface3    = Color(hex: 0x312C28)
    static let border      = Color(hex: 0x2C2825)
    static let borderSoft  = Color(hex: 0x221F1C)

    // Text.
    static let text        = Color(hex: 0xF4F0EB)
    static let text2       = Color(hex: 0x9A948D)
    static let text3       = Color(hex: 0x5C5853)
    static let text4       = Color(hex: 0x3A3733)

    // Brand + system colors.
    static let coral       = Color(hex: 0xED8264)
    static let coralSoft   = Color(red: 237/255, green: 130/255, blue: 100/255, opacity: 0.16)
    static let coralDim    = Color(red: 237/255, green: 130/255, blue: 100/255, opacity: 0.40)
    static let blue        = Color(hex: 0x0A84FF)
    static let gold        = Color(hex: 0xFFB44A)

    // The warm gradient that fills the profile avatar (radial 30%/25%).
    static let avatarGradient = RadialGradient(
        colors: [Color(hex: 0xF5A08A), Color(hex: 0xED8264), Color(hex: 0xB85A3F)],
        center: UnitPoint(x: 0.3, y: 0.25),
        startRadius: 1, endRadius: 38
    )
}

extension Color {
    /// 0xRRGGBB helper. Keeps the token table compact and readable.
    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
