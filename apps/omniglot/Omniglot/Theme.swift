import SwiftUI

/// Design tokens — "the interpreter's booth."
/// Light, cool-paper app with one viridian accent; serif (New York) is
/// reserved exclusively for target-language text; the Talk screen is a
/// permanently dark booth. Corrections are ochre pencil marks, never red.
enum Theme {
    // MARK: Light theme (everything except the booth)
    static let bg = Color(hex: 0xF2F3F0)
    static let surface = Color.white
    static let surfaceInset = Color(hex: 0xE9EBE6)
    static let ink = Color(hex: 0x1D2321)
    static let inkSecondary = Color(hex: 0x565E5A)
    static let inkTertiary = Color(hex: 0x8A918D)
    static let hairline = Color(hex: 0xE0E3DE)
    static let accent = Color(hex: 0x166D5B)
    static let accentTint = Color(hex: 0xE3EFEA)
    static let correction = Color(hex: 0x9C6D1E)
    static let correctionTint = Color(hex: 0xF7EEDC)

    // MARK: Booth theme (Talk screen, always dark)
    static let boothBg = Color(hex: 0x101613)
    static let boothSurface = Color(hex: 0x1C2420)
    static let boothControl = Color(hex: 0x232B27)
    static let boothInk = Color(hex: 0xEFEDE4)
    static let boothSecondary = Color(hex: 0x9AA39B)
    static let lamplight = Color(hex: 0xE9C87E)
    static let mint = Color(hex: 0x9FD8C4)
    static let boothOchre = Color(hex: 0xD9A94E)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

extension Font {
    /// Target-language text is always serif (New York) — the app's signature.
    static func target(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
}

/// 13pt uppercase tracked section label ("CHAPTER 12", "GRAMMAR").
struct Eyebrow: View {
    let text: String
    var color: Color = Theme.inkTertiary

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 13, weight: .semibold))
            .tracking(0.6)
            .foregroundStyle(color)
    }
}

/// Full-width viridian capsule button.
struct PrimaryButton: View {
    let title: String
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(disabled ? Theme.inkTertiary : Theme.accent)
                .clipShape(Capsule())
        }
        .disabled(disabled)
    }
}

/// The 4pt level-progress bar: viridian fill on accent-tint track.
struct LevelBar: View {
    let fraction: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.accentTint)
                Capsule()
                    .fill(Theme.accent)
                    .frame(width: max(4, geo.size.width * min(1, max(0, fraction))))
            }
        }
        .frame(height: 4)
    }
}
