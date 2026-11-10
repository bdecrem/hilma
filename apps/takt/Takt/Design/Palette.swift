import SwiftUI
import UIKit

/// The two themes. Dark is the default on first launch; "paper" is the light one.
/// Stored under the `theme` default, so `-theme paper` on the command line picks it too.
enum Theme: String {
    case dark, paper

    var colorScheme: ColorScheme { self == .dark ? .dark : .light }
}

/// Color tokens from the brief (§2). `signal` means now, `cue` means next.
/// They are the only accents: never add a third, and never use red/green for right/wrong.
///
/// The first pair of each token is the brief's own, the **Electronic** vibe: neutral ink, cold
/// paper, a neon signal. The `blues` pair is the same token a little older (`Vibe`, 2026-11-10):
/// the ink and the paper turned toward sepia, the signal toward amber (a tube's glow instead
/// of a laser's), the cue toward denim. Same roles, same contrast steps, nothing new to learn.
enum Palette {
    static let ground = Color(dark: 0x0D0D0D, paper: 0xF2F0EB, blues: (0x100E0B, 0xF0E8D6))
    static let panel = Color(dark: 0x181818, paper: 0xE6E3DC, blues: (0x1C1813, 0xE4D9C3))
    static let line = Color(dark: 0x2A2A2A, paper: 0xCFCBC2, blues: (0x322B21, 0xCBBEA4))
    static let text = Color(dark: 0xF2F0EB, paper: 0x0D0D0D, blues: (0xF3E9D6, 0x17120C))
    static let muted = Color(dark: 0x9A978F, paper: 0x5E5B54, blues: (0xA69B86, 0x62584A))
    static let signal = Color(dark: 0xFF5A1F, paper: 0xD8430C, blues: (0xF2811F, 0xC2540B))
    static let cue = Color(dark: 0x8FB3FF, paper: 0x2F5BD3, blues: (0x8DA9D6, 0x2D4E96))
    /// Mastered (Bart, 2026-11-09: "some gold'ish variant on orange, not too saturated"): brass,
    /// signal's hue turned toward gold and taken down, for a Stage level played at full speed for
    /// an A or better. Not a third accent for now/next: it only ever marks something done.
    static let mastery = Color(dark: 0xD9A35E, paper: 0x9A6A24)
    /// The needles: a hit, a note off the window (rushed, dragged), a miss or a wrong note.
    static let good = Color(dark: 0x4ADE80, paper: 0x15803D)
    static let warn = Color(dark: 0xFACC15, paper: 0xA16207)
    static let bad = Color(dark: 0xF87171, paper: 0xB91C1C)

    /// Black keys are ink in both themes (ground in dark, text in paper: the same #0D0D0D).
    /// White keys are `panel`.
    static let blackKey = Color(dark: 0x0D0D0D, paper: 0x0D0D0D)
}

extension Color {
    /// A token: dark and paper, and the pair the Blues vibe uses instead when it has one.
    /// Resolved every time a view is made, from the theme's traits and `Vibe.current`.
    init(dark: UInt32, paper: UInt32, blues: (dark: UInt32, paper: UInt32)? = nil) {
        self.init(uiColor: UIColor { traits in
            let light = traits.userInterfaceStyle == .light
            if let blues, Vibe.current == .blues { return UIColor(hex: light ? blues.paper : blues.dark) }
            return UIColor(hex: light ? paper : dark)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
