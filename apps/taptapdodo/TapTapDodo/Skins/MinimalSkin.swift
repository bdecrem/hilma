import SpriteKit

// ttd·02 — monochrome basement: black/white, shape-coded lanes, strobe,
// Space Mono, everything lowercase.
extension Skin {
    static let minimal = Skin(
        trackId: "ttd02",
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
            "S": "metronomic. the booth nods once. highest possible honor.",
            "A": "locked in. the dodo kept its sunglasses on the whole time.",
            "B": "solid groove, some drift. the floor forgives.",
            "C": "the kick was right there. it never moved. run it back.",
            "D": "this is why the species went out. again.",
        ],
        titleEyebrow: "ttd·02",
        titleSub: "same bird. no melody. 130 bpm, one kick, three lanes: circle, square, triangle. hold the groove.",
        titleFooter: "sound on. subwoofer ideal. this is a basement now."
    )
}
