import SwiftUI
import UIKit

// Color/font tokens mirroring src/app/jam/jam.css ("desk instrument" design
// system). Keep names in sync with the CSS custom properties so a value
// change on one side is easy to port to the other.
//
// Every colour token is dynamic: the light value is the web palette, the
// dark value is "the desk instrument at night" — same material logic
// (enamel panel, raised cards, recessed wells, paper inputs), inverted
// tones. Nothing here is a system colour, so iOS dark mode can't leak in;
// the app's own Appearance setting (`JBTheme.Appearance`) picks the scheme.
enum JBTheme {
    // MARK: Appearance setting (System / Light / Dark)

    /// Stored in UserDefaults under `Appearance.storageKey`; applied at the
    /// root with `.preferredColorScheme(appearance.colorScheme)`.
    enum Appearance: String, CaseIterable, Identifiable {
        case system, light, dark
        static let storageKey = "jam.appearance"
        var id: String { rawValue }
        var label: String {
            switch self {
            case .system: return "System"
            case .light: return "Light"
            case .dark: return "Dark"
            }
        }
        /// nil = follow the device.
        var colorScheme: ColorScheme? {
            switch self {
            case .system: return nil
            case .light: return .light
            case .dark: return .dark
            }
        }
        static var current: Appearance {
            Appearance(rawValue: UserDefaults.standard.string(forKey: storageKey) ?? "") ?? .system
        }
    }

    // MARK: Surfaces

    static let panel = dynamic(0xDCDFD8, 0x1B1D20)      // enamel
    static let panel2 = dynamic(0xE9EBE5, 0x24272B)     // raised card
    static let panel3 = dynamic(0xCFD3CB, 0x141618)     // recessed well / transport
    static let panel4 = dynamic(0xF5F6F2, 0x2C3035)     // paper (inputs, panel keys)

    // MARK: Ink

    static let ink = dynamic(0x14161A, 0xECEEE8)
    static let ink2 = dynamic(0x3A3D44, 0xB9BCB4)
    static let ink3 = dynamic(0x6B6F78, 0x8A8E86)
    static let rule = dynamic(0xB6BAB1, 0x3A3E43)

    // MARK: Signals

    static let orange = dynamic(0xFF4F1F, 0xFF5A2A)
    static let orangeSoft = dynamic(0xFFB39C, 0x8A3A22)
    static let cobalt = dynamic(0x2C5BFF, 0x5A80FF)
    static let green = dynamic(0x0F9F6E, 0x1DB981)
    static let ledOff = dynamic(0xB7BBB2, 0x3A3E43)

    // MARK: Keys (semantic — the "ink rubber key" must stay dark-on-light
    // in light mode and light-on-dark in dark mode, or it vanishes)

    /// Face of the solid ink key (`.jb-key` default): transport Play,
    /// CONTROLS, the segmented "on" pill, section pill on, Send-style keys.
    static let keyFill = dynamic(0x14161A, 0xE6E8E1)
    /// Label on `keyFill`.
    static let keyLabel = dynamic(0xE9EBE5, 0x14161A)
    /// The 2 pt lip under an ink key.
    static let keyLip = dynamic(0x000000, 0x0A0B0C)
    /// The 2 pt lip under a paper (`--panel`) key — the rule in light, a
    /// near-black shadow in dark (the rule would read as a bottom highlight).
    static let panelKeyLip = dynamic(0xB6BAB1, 0x0E1012)
    /// Label on orange keys and lit orange pads — always dark, like the web's
    /// `.jb-key--orange { color: var(--ink) }` on a light panel.
    static let onOrange = Color(hex: 0x14161A)
    /// The `inset 0 1px 0 #fff` top highlight on cards / paper keys: white on
    /// the light panel, a faint sheen at night.
    static let highlight = dynamicRGBA(light: (0xFFFFFF, 1), dark: (0xFFFFFF, 0.10))
    /// The 5 pt fader track — must contrast with the card in both modes.
    static let faderTrack = dynamic(0x6B6F78, 0x8A8E86)
    /// Shaded beat columns in the sequencer: color-mix(panel-3 86%, ink).
    static let beatFace = dynamic(0xB5B9B2, 0x2A2D31)
    /// Top edge of a recessed well (sequencer pad): a shadow by day, a
    /// faint rim at night so the pads separate from the dark panel.
    static let wellEdge = dynamicRGBA(light: (0x000000, 0.10), dark: (0xFFFFFF, 0.09))
    /// Hairline around the synth panels (Panels tab): invisible on the
    /// light enamel (the dark panels contrast by themselves), a faint rim
    /// at night where a #141414 panel sits on the #1B1D20 sheet.
    static let panelEdge = dynamicRGBA(light: (0xFFFFFF, 0), dark: (0xFFFFFF, 0.09))

    // MARK: Dynamic colour helpers

    /// A colour that resolves to `light` or `dark` from the view's trait
    /// environment (so `.preferredColorScheme` and system dark mode both
    /// drive it, and every existing call site adapts without change).
    static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
        })
    }

    static func dynamicRGBA(light: (UInt32, CGFloat), dark: (UInt32, CGFloat)) -> Color {
        Color(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(hex: dark.0, alpha: dark.1) : UIColor(hex: light.0, alpha: light.1)
        })
    }

    // MARK: Type

    /// Condensed uppercase labels — panel silkscreen text.
    static func panelFont(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .default).width(.condensed)
    }

    /// Body copy — chat text, readable prose.
    static func bodyFont(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    /// Numeric readouts (BPM, bars, dB).
    static func monoFont(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    /// Per-synth panel palettes, for the Panels tab — exact port of
    /// `src/app/jam/alt/panels-mobile.css` `[data-skin]` custom properties
    /// (`--ph-bg` / `--ph-accent` / `--ph-glow` / `--ph-dim` / `--ph-rule`).
    /// The synth panels are their own dark instruments in BOTH appearance
    /// modes (the web has one skin per synth), so these stay fixed.
    enum PanelPalette {
        case jb202, jt30, jt10, jt90, jb01, fx

        /// `--ph-bg` — panel background.
        var background: Color {
            switch self {
            case .jb202: return Color(hex: 0x162130)
            case .jt30: return Color(hex: 0x141414)
            case .jt10: return Color(hex: 0x2A2A2A)
            case .jt90: return Color(hex: 0x141414)
            case .jb01: return Color(hex: 0x2A2018)
            case .fx: return Color(hex: 0x1B1D27)
            }
        }

        /// `--ph-accent` — lit LEDs, active knob indicators, headers.
        var accent: Color {
            switch self {
            case .jb202: return Color(hex: 0x6FF1C3)
            case .jt30: return Color(hex: 0xFBBF24)
            case .jt10: return Color(hex: 0x6AA8F0)
            case .jt90: return Color(hex: 0xF87171)
            case .jb01: return Color(hex: 0xFFB840)
            case .fx: return Color(hex: 0x8AEAFF)
            }
        }

        /// `--ph-dim` — secondary/label text on the panel background.
        var dim: Color {
            switch self {
            case .jb202: return Color(hex: 0x88AA99)
            case .jt30: return Color(hex: 0x8F8F8F)
            case .jt10: return Color(hex: 0x9A9A9A)
            case .jt90: return Color(hex: 0x8F8F8F)
            case .jb01: return Color(hex: 0xA89880)
            case .fx: return Color(hex: 0x8D93A8)
            }
        }

        /// `--ph-rule` — hairline dividers within the panel.
        var rule: Color {
            switch self {
            case .jb202: return Color(hex: 0x24404A)
            case .jt30: return Color(hex: 0x2A2A2A)
            case .jt10: return Color(hex: 0x444444)
            case .jt90: return Color(hex: 0x2A2A2A)
            case .jb01: return Color(hex: 0x3D3025)
            case .fx: return Color(hex: 0x2B3044)
            }
        }

        var label: String {
            switch self {
            case .jb202: return "JB202"
            case .jt30: return "JT-30"
            case .jt10: return "JT-10"
            case .jt90: return "JT-90"
            case .jb01: return "JB01"
            case .fx: return "FX"
            }
        }
    }
}

/// Applies the stored Appearance setting to a presentation (the root view
/// and every sheet, which is its own presentation). Reactive: flipping the
/// control in About re-renders everything immediately.
struct JBAppearanceModifier: ViewModifier {
    @AppStorage(JBTheme.Appearance.storageKey) private var raw: String = JBTheme.Appearance.system.rawValue
    func body(content: Content) -> some View {
        content.preferredColorScheme((JBTheme.Appearance(rawValue: raw) ?? .system).colorScheme)
    }
}

extension View {
    func jbAppearance() -> some View { modifier(JBAppearanceModifier()) }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        let r = CGFloat((hex >> 16) & 0xFF) / 255
        let g = CGFloat((hex >> 8) & 0xFF) / 255
        let b = CGFloat(hex & 0xFF) / 255
        self.init(red: r, green: g, blue: b, alpha: alpha)
    }
}
