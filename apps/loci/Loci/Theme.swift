import SwiftUI
import UIKit

/// Loci's design language: paper and ink, with moss green as the single
/// accent. Light mode is warm paper; dark mode is green-tinted ink (never
/// pure black). Questions and big titles render in the system serif (New
/// York) — the app should feel like a good book, not a dashboard.
enum Theme {

    // MARK: Surfaces

    static let bg        = adaptive(dark: 0x0F1210, light: 0xF6F4ED)
    static let surface   = adaptive(dark: 0x171B18, light: 0xFFFFFF)
    static let raised    = adaptive(dark: 0x1F2420, light: 0xEDEAE0)
    static let border    = adaptive(dark: 0x2A302B, light: 0xE2DED2)
    static let borderSoft = adaptive(dark: 0x20251F, light: 0xECE8DC)

    // MARK: Text

    static let ink       = adaptive(dark: 0xEEEDE5, light: 0x1C1A14)
    static let ink2      = adaptive(dark: 0x9DA29A, light: 0x6B675C)
    static let ink3      = adaptive(dark: 0x5D635C, light: 0x9D9789)

    // MARK: Accent + semantic

    /// Moss — the single brand accent.
    static let moss      = adaptive(dark: 0x84B894, light: 0x3E6B4F)
    static let mossDeep  = adaptive(dark: 0x3E6B4F, light: 0x2F5440)
    static let mossSoft  = adaptiveAlpha(dark: 0x84B894, light: 0x3E6B4F, opacity: 0.14)

    /// Grade colors: forgot / shaky / solid.
    static let clay      = adaptive(dark: 0xD07B62, light: 0xB85A42)
    static let ochre     = adaptive(dark: 0xD9A452, light: 0xBC8430)
    static let solid     = moss

    /// Color a 0..1 memory strength: clay → ochre → moss.
    static func strengthColor(_ v: Double) -> Color {
        if v < 0.45 { return clay }
        if v < 0.75 { return ochre }
        return solid
    }

    // MARK: Helpers

    private static func adaptive(dark: UInt32, light: UInt32) -> Color {
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
        })
    }

    private static func adaptiveAlpha(dark: UInt32, light: UInt32, opacity: CGFloat) -> Color {
        Color(UIColor { trait in
            let base = trait.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
            return base.withAlphaComponent(opacity)
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

// MARK: - Shared small components

/// Thin rounded memory-strength bar. `value` 0..1; nil renders an empty track
/// (topic has no cards yet).
struct StrengthBar: View {
    let value: Double?
    var height: CGFloat = 4

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.raised)
                if let value {
                    Capsule()
                        .fill(Theme.strengthColor(value))
                        .frame(width: max(height, geo.size.width * value))
                }
            }
        }
        .frame(height: height)
    }
}

/// Small-caps eyebrow label ("READ FOR", "YOUR TOPICS").
struct Eyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11.5, weight: .semibold))
            .tracking(1.3)
            .foregroundStyle(Theme.ink3)
    }
}

/// Full-width moss action button.
struct PrimaryButton: View {
    let label: String
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Theme.mossDeep, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .opacity(disabled ? 0.45 : 1)
        .allowsHitTesting(!disabled)
    }
}
