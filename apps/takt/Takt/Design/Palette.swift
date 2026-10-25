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
enum Palette {
    static let ground = Color(dark: 0x0D0D0D, paper: 0xF2F0EB)
    static let panel = Color(dark: 0x181818, paper: 0xE6E3DC)
    static let line = Color(dark: 0x2A2A2A, paper: 0xCFCBC2)
    static let text = Color(dark: 0xF2F0EB, paper: 0x0D0D0D)
    static let muted = Color(dark: 0x9A978F, paper: 0x5E5B54)
    static let signal = Color(dark: 0xFF5A1F, paper: 0xD8430C)
    static let cue = Color(dark: 0x8FB3FF, paper: 0x2F5BD3)

    /// Black keys are ink in both themes (ground in dark, text in paper: the same #0D0D0D).
    /// White keys are `panel`.
    static let blackKey = Color(dark: 0x0D0D0D, paper: 0x0D0D0D)
}

extension Color {
    init(dark: UInt32, paper: UInt32) {
        self.init(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .light ? paper : dark)
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
