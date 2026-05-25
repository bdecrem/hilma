import SwiftUI
import UIKit

/// Adaptive design tokens for Feynd.
///
/// Dark mode is "warm-tinted ink" (never pure black). Light mode is its
/// counterpart — "warm-tinted paper" (never pure white). Same coral/gold/blue
/// brand accents; the surface and text scale flips around them.
///
/// Tokens are `Color`s backed by `UIColor(dynamicProvider:)` so the system
/// flips them automatically when the user toggles light/dark in Settings.
enum FeyndTheme {

    // MARK: Surfaces

    // Page background. Warm near-black in dark, warm paper in light.
    static let bg          = adaptive(dark: 0x0E0C0B, light: 0xFAF6EE)

    // Sunken inputs (composer pill, tab pill backdrop) — a hair off the page bg.
    static let bgRaised    = adaptive(dark: 0x161311, light: 0xF1ECDF)

    // Cards, bubbles, mini glyph tiles. In light mode this lifts to white so
    // surfaces read as "raised" against the warm paper bg.
    static let surface     = adaptive(dark: 0x1A1715, light: 0xFFFFFF)

    // Slightly more saturated than surface — active tab segment, level chip,
    // voice control circles.
    static let surface2    = adaptive(dark: 0x26221F, light: 0xECE5D6)

    static let surface3    = adaptive(dark: 0x312C28, light: 0xDFD7C5)

    // Stroke between/around surfaces. Always one tone closer to text than
    // surface so edges read cleanly without shouting.
    static let border      = adaptive(dark: 0x2C2825, light: 0xE0D9CB)
    static let borderSoft  = adaptive(dark: 0x221F1C, light: 0xEFE8DA)

    // MARK: Text

    static let text        = adaptive(dark: 0xF4F0EB, light: 0x1A1612)
    static let text2       = adaptive(dark: 0x9A948D, light: 0x6A6358)
    static let text3       = adaptive(dark: 0x5C5853, light: 0x948C7E)
    // Used for empty stars + ghosted glyph edges — barely visible by design.
    static let text4       = adaptive(dark: 0x3A3733, light: 0xC9C1B0)

    // MARK: Brand — stays consistent across modes, but small tone shifts where
    // legibility on light bg needs help.

    static let coral       = adaptive(dark: 0xED8264, light: 0xE27250)
    static let coralSoft   = adaptiveAlpha(dark: 0xED8264, light: 0xE27250, opacity: 0.16)
    static let coralDim    = adaptiveAlpha(dark: 0xED8264, light: 0xE27250, opacity: 0.40)

    // iMessage blue — system blue is already adaptive in iOS, but we hard-code
    // matching hexes to keep parity with the design's exact palette.
    static let blue        = adaptive(dark: 0x0A84FF, light: 0x007AFF)

    // Star gold — slightly tuned down in light mode so filled stars stay
    // readable on cream paper without screaming.
    static let gold        = adaptive(dark: 0xFFB44A, light: 0xE89C2C)

    // MARK: Composites

    /// The translucent backdrop behind the floating Chat/Topics pill. In dark
    /// it's a deep brown veil; in light it's a paper-tinted off-white veil.
    static let tabPillBg   = adaptive(dark: 0x14110F, light: 0xF6F1E3)

    /// Warm coral radial used for the profile avatar disc.
    /// Same gradient stops in both modes — the disc IS a brand element.
    static let avatarGradient = RadialGradient(
        colors: [Color(hex: 0xF5A08A), Color(hex: 0xED8264), Color(hex: 0xB85A3F)],
        center: UnitPoint(x: 0.3, y: 0.25),
        startRadius: 1, endRadius: 38
    )

    // MARK: Helpers

    /// Build an adaptive Color that resolves to a different hex per trait.
    private static func adaptive(dark: UInt32, light: UInt32) -> Color {
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(hex: dark)
                : UIColor(hex: light)
        })
    }

    /// Adaptive Color with a fixed opacity baked in (for coralSoft etc).
    private static func adaptiveAlpha(dark: UInt32, light: UInt32, opacity: CGFloat) -> Color {
        Color(UIColor { trait in
            let base = trait.userInterfaceStyle == .dark
                ? UIColor(hex: dark)
                : UIColor(hex: light)
            return base.withAlphaComponent(opacity)
        })
    }
}

// MARK: - Hex helpers

extension Color {
    /// 0xRRGGBB → Color. Kept for the brand-fixed colors that don't adapt.
    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        let r = CGFloat((hex >> 16) & 0xFF) / 255
        let g = CGFloat((hex >> 8) & 0xFF) / 255
        let b = CGFloat(hex & 0xFF) / 255
        self.init(red: r, green: g, blue: b, alpha: 1)
    }
}
