import SwiftUI
import UIKit

/// Peri's look: a night walk. Deep slate-indigo surfaces, one warm amber
/// accent (the streetlight / the low sun). Serif for the wordmark and big
/// moments — kinship with Loci, different hour of the day.
enum Theme {
    // Surfaces — indigo-tinted ink, never pure black.
    static let bg       = adaptive(dark: 0x0E1018, light: 0x12141D)
    static let surface  = adaptive(dark: 0x171A26, light: 0x1B1E2B)
    static let raised   = adaptive(dark: 0x202434, light: 0x252937)
    static let border   = adaptive(dark: 0x2C3144, light: 0x303548)

    // Text.
    static let ink      = Color(UIColor(rgb: 0xEDEDF2))
    static let ink2     = Color(UIColor(rgb: 0x9AA0B5))
    static let ink3     = Color(UIColor(rgb: 0x5E6478))

    // Accent.
    static let amber     = Color(UIColor(rgb: 0xF0B35E))
    static let amberDeep = Color(UIColor(rgb: 0xD98E2B))
    static let amberSoft = Color(UIColor(rgb: 0xF0B35E)).opacity(0.14)

    // Grades (shared meaning with Loci).
    static let clay  = Color(UIColor(rgb: 0xE0826B))
    static let ochre = Color(UIColor(rgb: 0xE3B45C))
    static let solid = Color(UIColor(rgb: 0x8FC9A0))

    /// The orb — warm gradient disc that breathes while Peri speaks.
    static let orbGradient = RadialGradient(
        colors: [
            Color(UIColor(rgb: 0xF7CE8C)),
            Color(UIColor(rgb: 0xF0B35E)),
            Color(UIColor(rgb: 0xB36F1F)),
        ],
        center: UnitPoint(x: 0.35, y: 0.3),
        startRadius: 4,
        endRadius: 150
    )

    private static func adaptive(dark: UInt32, light: UInt32) -> Color {
        // Peri is dark in both system modes — it's a pocket app for outside.
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
        })
    }
}

extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}
