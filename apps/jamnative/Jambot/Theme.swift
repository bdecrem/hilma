import SwiftUI

// Color/font tokens mirroring src/app/jam/jam.css ("desk instrument" design
// system). Keep names in sync with the CSS custom properties so a value
// change on one side is easy to port to the other.
enum JBTheme {
    static let panel = Color(hex: 0xDCDFD8)      // enamel
    static let panel2 = Color(hex: 0xE9EBE5)     // raised card
    static let panel3 = Color(hex: 0xCFD3CB)     // recessed well / transport
    static let panel4 = Color(hex: 0xF5F6F2)     // paper (inputs)

    static let ink = Color(hex: 0x14161A)
    static let ink2 = Color(hex: 0x3A3D44)
    static let ink3 = Color(hex: 0x6B6F78)
    static let rule = Color(hex: 0xB6BAB1)

    static let orange = Color(hex: 0xFF4F1F)
    static let orangeSoft = Color(hex: 0xFFB39C)
    static let cobalt = Color(hex: 0x2C5BFF)
    static let green = Color(hex: 0x0F9F6E)
    static let ledOff = Color(hex: 0xB7BBB2)

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

    /// Per-synth panel palettes, for the Panels tab (stage 6) — exact port
    /// of `src/app/jam/alt/panels-mobile.css` `[data-skin]` custom
    /// properties (`--ph-bg` / `--ph-accent` / `--ph-glow` / `--ph-dim` /
    /// `--ph-rule`). Kept here so any agent can reach for a consistent
    /// palette without re-deriving hex values. Not wired into any view by
    /// this stage.
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

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
