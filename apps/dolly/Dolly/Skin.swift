import SwiftUI

/// Everything about how Dolly looks that is not layout: colors, type, the
/// mascot, a few radii. One instance per skin; the app reads `Skin.current`.
/// The candy skin is the first; the look will change, the names should not.
struct Skin {
    let bgTop: Color
    let bgMid: Color
    let bgBottom: Color
    let card: Color
    let cardTint: Color
    let ink: Color
    let ink2: Color
    let ink3: Color
    let line: Color
    let primary: Color
    let primaryHi: Color
    let primaryDeep: Color
    let onPrimary: Color
    let voiceTop: Color
    let voiceBottom: Color
    let onVoice: Color
    let reward: Color
    let rewardDeep: Color
    let onReward: Color
    let good: Color
    let goodDeep: Color
    let onGood: Color
    let bad: Color
    let onBad: Color
    let fix: Color
    let word: Color
    let phrase: Color
    let trailNext: Color
    let shadow: Color

    let rCard: CGFloat
    let rInput: CGFloat

    let display: String
    let displayMedium: String
    let ui: String
    let uiBold: String

    let mascot: String
    let mascotSquish: String

    static let candy = Skin(
        bgTop: Color(hex: 0xEBDFFF), bgMid: Color(hex: 0xFFE6F3), bgBottom: Color(hex: 0xDFFFF4),
        card: .white, cardTint: Color(hex: 0xFFF7FB),
        ink: Color(hex: 0x3B2A5A), ink2: Color(hex: 0x7A6A99), ink3: Color(hex: 0xA99BC4), line: Color(hex: 0xEFE3F7),
        primary: Color(hex: 0xFF4FA3), primaryHi: Color(hex: 0xFF7FC0), primaryDeep: Color(hex: 0xD9307F), onPrimary: .white,
        voiceTop: Color(hex: 0x9A7BFF), voiceBottom: Color(hex: 0x6B47F0), onVoice: .white,
        reward: Color(hex: 0xFFD93D), rewardDeep: Color(hex: 0xE2B800), onReward: Color(hex: 0x5A4300),
        good: Color(hex: 0x5FF0C0), goodDeep: Color(hex: 0x1FB98A), onGood: Color(hex: 0x0D4D38),
        bad: Color(hex: 0xFF6B8A), onBad: .white,
        fix: Color(hex: 0xFF4FA3), word: Color(hex: 0x7B5CFF), phrase: Color(hex: 0x3FE0AB),
        trailNext: Color(hex: 0xE4D4F5), shadow: Color(hex: 0x7B5CFF).opacity(0.18),
        rCard: 28, rInput: 18,
        display: "Baloo2-ExtraBold", displayMedium: "Baloo2-SemiBold", ui: "Quicksand-Medium", uiBold: "Quicksand-Bold",
        mascot: "Gummy", mascotSquish: "GummySquish"
    )

    static var current: Skin { .candy }

    var background: LinearGradient {
        LinearGradient(colors: [bgTop, bgMid, bgBottom], startPoint: .top, endPoint: .bottom)
    }

    var voiceBackground: LinearGradient {
        LinearGradient(colors: [voiceTop, voiceBottom], startPoint: .top, endPoint: .bottom)
    }

    func display(_ size: CGFloat) -> Font { .custom(display, size: size) }
    func displayMedium(_ size: CGFloat) -> Font { .custom(displayMedium, size: size) }
    func ui(_ size: CGFloat) -> Font { .custom(ui, size: size) }
    func uiBold(_ size: CGFloat) -> Font { .custom(uiBold, size: size) }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
