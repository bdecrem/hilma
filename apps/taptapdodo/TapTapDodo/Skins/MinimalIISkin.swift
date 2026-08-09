import SpriteKit

// ttd·08 — minimal ii · deeper. Same basement as ttd·02, lower ceiling.
extension Skin {
    static let minimalII = Skin(
        trackId: "ttd08",
        background: SKColor(hex: 0x050505),
        backgroundAlt: SKColor(hex: 0x0A0A0A),
        foreground: SKColor(hex: 0xF2F2F0),
        dim: SKColor(hex: 0x5A5A58),
        laneColors: [SKColor(hex: 0xF2F2F0), SKColor(hex: 0xF2F2F0), SKColor(hex: 0xF2F2F0)],
        laneStyle: .glyphs,
        beatFX: .strobe,
        dodoStyle: .minimalLine,
        displayFont: Fonts.monoBold,
        bodyFont: Fonts.mono,
        lowercase: true,
        judgeLabels: (perfect: "locked", good: "ok", miss: "drift"),
        judgeColoredByLane: false,
        flavor: [
            "S": "you tapped a 3-against-4 polymeter at 128 and never blinked. residency offered.",
            "A": "deep in the pocket. the delay did half the work but you did the rest.",
            "B": "solid until the polymeter. it gets everyone the first time.",
            "C": "the swing threw you. it lands late on purpose. lean back.",
            "D": "the kick never moved. the click never stopped. you, however. again.",
        ],
        titleEyebrow: "ttd·02x",
        titleSub: "same basement, lower ceiling. swing on the hats, sidechain on the drone, a dub chord on dotted-eighth delay, and a 3-against-4 click that refuses to sit still. f minor. 128. ninety seconds.",
        titleFooter: "headphones strongly advised. the sub lives at 43hz."
    )
}
