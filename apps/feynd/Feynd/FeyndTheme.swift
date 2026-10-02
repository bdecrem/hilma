import SwiftUI
import UIKit

/// Adaptive design tokens for Dodo (see apps/feynd/branding/BRANDING.md).
///
/// The jelly palette (2026-10-01): the app is a lavender-white paper in
/// light mode and an indigo night in dark, the two backgrounds the jelly
/// art pages in misc/dodo-redesign sit on. Sky — the mascot's own jelly —
/// is the accent in both modes; grape (lavender) and mint support it, lemon
/// is the star gold, pink the blush. Nothing is pure black or pure white.
///
/// Tokens are `Color`s backed by `UIColor(dynamicProvider:)` so the system
/// flips them automatically when the user toggles light/dark in Settings.
enum FeyndTheme {

    // MARK: Surfaces

    // Page background. Indigo night in dark, lavender paper in light.
    static let bg          = adaptive(dark: 0x17131D, light: 0xF8F2F8)

    // Sunken inputs (composer pill, tab pill backdrop) — a hair off the page bg.
    static let bgRaised    = adaptive(dark: 0x1E1826, light: 0xEFE7F3)

    // Cards, bubbles, mini glyph tiles. In light mode this lifts to a cool
    // near-white so surfaces read as "raised" against the lavender bg.
    static let surface     = adaptive(dark: 0x271F31, light: 0xFFFCFF)

    // Slightly more saturated than surface — active tab segment, level chip,
    // voice control circles.
    static let surface2    = adaptive(dark: 0x332A3F, light: 0xF1E8F5)

    static let surface3    = adaptive(dark: 0x3F354C, light: 0xE4D8EA)

    // Stroke between/around surfaces. Always one tone closer to text than
    // surface so edges read cleanly without shouting.
    static let border      = adaptive(dark: 0x3D3349, light: 0xE6DBEC)
    static let borderSoft  = adaptive(dark: 0x2E2639, light: 0xF0E8F4)

    // MARK: Text

    // The art pages' ink: plum-black on paper, pink-white at night.
    static let text        = adaptive(dark: 0xF3EBF6, light: 0x2D2537)
    static let text2       = adaptive(dark: 0xB3A8BC, light: 0x6A5F73)
    static let text3       = adaptive(dark: 0x7A6F85, light: 0x9A8FA4)
    // Used for empty stars + ghosted glyph edges — barely visible by design.
    static let text4       = adaptive(dark: 0x463D52, light: 0xD6CCDD)

    // MARK: Brand — stays consistent across modes, but small tone shifts where
    // legibility on light bg needs help.

    /// Sky — the mascot's jelly, and the app's primary accent. Bright on
    /// the night, deep on paper so text set in it stays legible.
    static let accent      = adaptive(dark: 0x5EC6EC, light: 0x2689BD)
    static let accentSoft  = adaptiveAlpha(dark: 0x5EC6EC, light: 0x2689BD, opacity: 0.16)
    static let accentDim   = adaptiveAlpha(dark: 0x5EC6EC, light: 0x2689BD, opacity: 0.40)

    /// Ink for text sitting ON the accent (buttons, pills): deep sea on the
    /// bright night sky, white on the deep daytime one.
    static let inkOnAccent = adaptive(dark: 0x0B2A3D, light: 0xFFFFFF)

    /// Grape — the lavender jelly. Secondary accent (rings, wayfinding).
    static let slate       = adaptive(dark: 0xB994FF, light: 0x7A4FD6)

    /// Mint — success / growth accents.
    static let sprout      = adaptive(dark: 0x7FE0C4, light: 0x2FA482)

    /// Pink jelly — the blush. Rare, warm highlights.
    static let blush       = Color(hex: 0xFF9FC8)

    // iMessage blue — system blue is already adaptive in iOS, but we hard-code
    // matching hexes to keep parity with the design's exact palette.
    static let blue        = adaptive(dark: 0x0A84FF, light: 0x007AFF)

    // Lemon jelly — stars and XP. Its own warm tone so filled stars read
    // apart from the sky accent; tuned down in light mode for paper.
    static let gold        = adaptive(dark: 0xFFD43A, light: 0xE0A100)

    // MARK: Composites

    /// The translucent backdrop behind the floating Chat/Topics pill.
    static let tabPillBg   = adaptive(dark: 0x1D1726, light: 0xF4EDF8)

    /// Sky jelly radial used for the profile avatar disc when there is no
    /// picture. Same gradient stops in both modes — the disc IS the mascot.
    static let avatarGradient = RadialGradient(
        colors: [Color(hex: 0xDCF6FF), Color(hex: 0x5EC6EC), Color(hex: 0x2689BD)],
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
