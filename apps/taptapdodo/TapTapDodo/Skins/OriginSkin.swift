import SpriteKit

// ttd·01 — club poster: ink navy, cream, pink/amber/teal lanes, Unbounded 900.
extension Skin {
    static let origin = Skin(
        trackId: "ttd01",
        background: SKColor(hex: 0x12101C),
        backgroundAlt: SKColor(hex: 0x1B1830),
        foreground: SKColor(hex: 0xF5EFE6),
        dim: SKColor(hex: 0x6B6580),
        laneColors: [SKColor(hex: 0xFF4D8F), SKColor(hex: 0xFFB454), SKColor(hex: 0x3EE6C1)],
        laneStyle: .colors,
        beatFX: .radialGlow,
        dodoStyle: .originFilled,
        displayFont: Fonts.unbounded,
        bodyFont: Fonts.mono,
        lowercase: false,
        judgeLabels: (perfect: "PERFECT", good: "GOOD", miss: "MISS"),
        judgeColoredByLane: true,
        flavor: [
            "S": "Flawless. Sixteen years since Tap Tap Revenge and the thumbs still work.",
            "A": "The dodo is fed. The species recovers. Science baffled.",
            "B": "Solid set. The dodo nods approvingly, as much as a dodo can.",
            "C": "The dodo survived worse. Barely. Run it back.",
            "D": "This is how extinction happens. One more try.",
        ],
        titleEyebrow: "est. extinct · back for one more set",
        titleSub: "Three lanes. One synth track. Tap when the notes hit the line. The dodo pecks the rest.",
        titleFooter: "Sound on. Headphones better."
    )
}
