import SpriteKit
import SwiftUI

enum LaneStyle {
    /// Lanes are color-coded circles (origin, detroit, gabber).
    case colors
    /// Lanes are shape-coded glyphs — circle, square, triangle (minimal).
    case glyphs
}

enum BeatFX {
    /// Radial glow pulsing up from the bottom on the beat (origin).
    case radialGlow
    /// 5%-opacity full-screen strobe on downbeat kicks (minimal).
    case strobe
    /// Strobe plus screen shake (gabber).
    case strobeShake
    case none
}

enum DodoStyle {
    case originFilled   // warm-gray filled shapes, amber beak/legs
    case minimalLine    // white 1.5pt line art, filled sunglasses
    case detroitLine    // chrome line art, sways
    case gabberLine     // red line art, headbangs
}

/// Everything the scene and the SwiftUI screens need to draw one set.
struct Skin {
    let trackId: String
    let background: SKColor
    let backgroundAlt: SKColor    // menu gradient partner
    let foreground: SKColor
    let dim: SKColor
    let laneColors: [SKColor]
    let laneStyle: LaneStyle
    let beatFX: BeatFX
    let dodoStyle: DodoStyle
    let displayFont: String       // PostScript name
    let bodyFont: String
    let lowercase: Bool           // minimal's all-lowercase voice
    let judgeLabels: (perfect: String, good: String, miss: String)
    let judgeColoredByLane: Bool
    let flavor: [String: String]  // grade letter → results line
    let titleEyebrow: String
    let titleSub: String
    let titleFooter: String

    var accent: SKColor { laneColors[0] }

    func styled(_ s: String) -> String { lowercase ? s.lowercased() : s }
    func flavorLine(for grade: String) -> String { flavor[grade] ?? "" }

    static func forTrack(_ id: String) -> Skin {
        switch id {
        case "ttd01": return .origin
        case "ttd02": return .minimal
        case "ttd03": return .detroit
        case "ttd05": return .afters
        default: return .gabber
        }
    }
}

// SwiftUI conveniences
extension SKColor {
    var ui: Color { Color(self) }
}

extension SKColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1)
    }
}

enum Fonts {
    static let unbounded = "Unbounded-Black"
    static let mono = "SpaceMono-Regular"
    static let monoBold = "SpaceMono-Bold"
}
