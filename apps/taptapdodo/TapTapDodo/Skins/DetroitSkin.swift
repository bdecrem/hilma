import SpriteKit

// ttd·03 — deep violet, chrome accents. Strings and swing.
extension Skin {
    static let detroit = Skin(
        trackId: "ttd03",
        background: SKColor(hex: 0x160F2E),
        backgroundAlt: SKColor(hex: 0x221845),
        foreground: SKColor(hex: 0xE8E4F5),
        dim: SKColor(hex: 0x7A7098),
        laneColors: [SKColor(hex: 0xA88BFF), SKColor(hex: 0xDDE2EC), SKColor(hex: 0x6FD6E8)],
        laneStyle: .colors,
        beatFX: .radialGlow,
        dodoStyle: .detroitLine,
        displayFont: Fonts.unbounded,
        bodyFont: Fonts.mono,
        lowercase: false,
        judgeLabels: (perfect: "PERFECT", good: "GOOD", miss: "MISS"),
        judgeColoredByLane: true,
        flavor: [
            "S": "Strings held. Somewhere a window opens over the expressway.",
            "A": "Smooth operator. The chords noticed you noticing them.",
            "B": "The swing carried you most of the way.",
            "C": "The strings deserve better. So does the bird.",
            "D": "Transmission lost. Re-tune and come back.",
        ],
        titleEyebrow: "ttd·03 · motor city",
        titleSub: "Swung hats and minor ninths. The strings hold the room together while you work.",
        titleFooter: "122 BPM. Let it roll."
    )
}
