import SpriteKit

// ttd·04 — blown-out red/black. Screen shake. 180 BPM. No mercy.
extension Skin {
    static let gabber = Skin(
        trackId: "ttd04",
        background: SKColor(hex: 0x0A0404),
        backgroundAlt: SKColor(hex: 0x1A0808),
        foreground: SKColor(hex: 0xFFEDED),
        dim: SKColor(hex: 0x6A4A4A),
        laneColors: [SKColor(hex: 0xFF2B2B), SKColor(hex: 0xFFF3E8), SKColor(hex: 0xFF6A00)],
        laneStyle: .colors,
        beatFX: .strobeShake,
        dodoStyle: .gabberLine,
        displayFont: Fonts.unbounded,
        bodyFont: Fonts.mono,
        lowercase: false,
        judgeLabels: (perfect: "PERFECT", good: "GOOD", miss: "MISS"),
        judgeColoredByLane: true,
        flavor: [
            "S": "THE KICK RESPECTS YOU. NOTHING ELSE SURVIVED.",
            "A": "Blown out and still standing. Impressive.",
            "B": "The wall of kick won on points.",
            "C": "Flattened. The dodo is somewhere in the debris.",
            "D": "180 BPM took no prisoners. Again.",
        ],
        titleEyebrow: "ttd·04 · unlocked the hard way",
        titleSub: "One kick, distorted past reason. Twice the notes. The dodo headbangs whether you keep up or not.",
        titleFooter: "You S-ranked a set for this. Own it."
    )
}
