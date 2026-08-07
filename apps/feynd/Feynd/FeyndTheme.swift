import SwiftUI
import UIKit

/// Adaptive design tokens for Dodo (see apps/feynd/branding/BRANDING.md).
///
/// The palette comes from the bookworm-dodo mark: dark mode is "slate ink"
/// (the bird's eye color family, never pure black), light mode is "butter
/// paper" (the book's cream family, never pure white). Marigold — the beak —
/// is the accent in both modes; slate blue and sprout green support it, and
/// star gold stays its own warmer tone so stars read apart from buttons.
///
/// Tokens are `Color`s backed by `UIColor(dynamicProvider:)` so the system
/// flips them automatically when the user toggles light/dark in Settings.
enum FeyndTheme {

    // MARK: Surfaces

    // Page background. Deep slate in dark, butter paper in light.
    static let bg          = adaptive(dark: 0x14191D, light: 0xFBF5E6)

    // Sunken inputs (composer pill, tab pill backdrop) — a hair off the page bg.
    static let bgRaised    = adaptive(dark: 0x1B2127, light: 0xF2EAD6)

    // Cards, bubbles, mini glyph tiles. In light mode this lifts to warm
    // near-white so surfaces read as "raised" against the butter bg.
    static let surface     = adaptive(dark: 0x202830, light: 0xFFFDF7)

    // Slightly more saturated than surface — active tab segment, level chip,
    // voice control circles. Light mode uses the book-page cream.
    static let surface2    = adaptive(dark: 0x2B343D, light: 0xF0E6CC)

    static let surface3    = adaptive(dark: 0x36414B, light: 0xE2D7BA)

    // Stroke between/around surfaces. Always one tone closer to text than
    // surface so edges read cleanly without shouting.
    static let border      = adaptive(dark: 0x333E48, light: 0xE3D9C2)
    static let borderSoft  = adaptive(dark: 0x273038, light: 0xF0E9D8)

    // MARK: Text

    // Dark-mode text is the mark's face cream; light-mode text is its eye ink.
    static let text        = adaptive(dark: 0xF7F0DE, light: 0x33383E)
    static let text2       = adaptive(dark: 0xA0ACB4, light: 0x606C75)
    static let text3       = adaptive(dark: 0x64717B, light: 0x939DA5)
    // Used for empty stars + ghosted glyph edges — barely visible by design.
    static let text4       = adaptive(dark: 0x3C4854, light: 0xCEC9B8)

    // MARK: Brand — stays consistent across modes, but small tone shifts where
    // legibility on light bg needs help.

    /// Marigold — the beak, and the app's primary accent.
    static let accent      = adaptive(dark: 0xF0A830, light: 0xDD9420)
    static let accentSoft  = adaptiveAlpha(dark: 0xF0A830, light: 0xDD9420, opacity: 0.16)
    static let accentDim   = adaptiveAlpha(dark: 0xF0A830, light: 0xDD9420, opacity: 0.40)

    /// Ink for text sitting ON the accent (buttons, pills).
    static let inkOnAccent = Color(hex: 0x261C06)

    /// Slate blue — the bird's body. Secondary accent.
    static let slate       = adaptive(dark: 0x8FB0C4, light: 0x6A8FA3)

    /// Sprout green — the sprout on its head. Success / growth accents.
    static let sprout      = adaptive(dark: 0x7BB662, light: 0x5F9E4C)

    /// Blush — the cheeks. Rare, warm highlights.
    static let blush       = Color(hex: 0xF2A19A)

    // iMessage blue — system blue is already adaptive in iOS, but we hard-code
    // matching hexes to keep parity with the design's exact palette.
    static let blue        = adaptive(dark: 0x0A84FF, light: 0x007AFF)

    // Star gold — warmer than the marigold accent so filled stars read as
    // their own thing; tuned down in light mode for cream paper.
    static let gold        = adaptive(dark: 0xFFB44A, light: 0xE89C2C)

    // MARK: Composites

    /// The translucent backdrop behind the floating Chat/Topics pill. In dark
    /// it's a deep slate veil; in light it's a paper-tinted off-white veil.
    static let tabPillBg   = adaptive(dark: 0x181F25, light: 0xF7F1E0)

    /// Marigold radial used for the profile avatar disc.
    /// Same gradient stops in both modes — the disc IS a brand element.
    static let avatarGradient = RadialGradient(
        colors: [Color(hex: 0xF6C46A), Color(hex: 0xF0A830), Color(hex: 0xB97A14)],
        center: UnitPoint(x: 0.3, y: 0.25),
        startRadius: 1, endRadius: 38
    )

    // MARK: Helpers

    /// Public builder for one-off adaptive colors (e.g. the Peck map's
    /// scenery palette) so views don't reimplement the trait dance.
    static func adaptiveColor(dark: UInt32, light: UInt32) -> Color {
        adaptive(dark: dark, light: light)
    }

    /// Build an adaptive Color that resolves to a different hex per trait.
    private static func adaptive(dark: UInt32, light: UInt32) -> Color {
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(hex: dark)
                : UIColor(hex: light)
        })
    }

    /// Adaptive Color with a fixed opacity baked in (for accentSoft etc).
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
