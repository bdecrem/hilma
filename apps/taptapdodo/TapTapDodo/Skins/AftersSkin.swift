import SpriteKit

// ttd·05 — the second room. Same monochrome basement as minimal, warmer
// white, deeper black. Everything else the sound decides.
extension Skin {
    static let afters = Skin(
        trackId: "ttd05",
        background: SKColor(hex: 0x030303),
        backgroundAlt: SKColor(hex: 0x0C0B0A),
        foreground: SKColor(hex: 0xEDECE7),
        dim: SKColor(hex: 0x56544E),
        laneColors: [SKColor(hex: 0xEDECE7), SKColor(hex: 0xEDECE7), SKColor(hex: 0xEDECE7)],
        laneStyle: .glyphs,
        beatFX: .strobe,
        dodoStyle: .minimalLine,
        displayFont: Fonts.monoBold,
        bodyFont: Fonts.mono,
        lowercase: true,
        judgeLabels: (perfect: "locked", good: "ok", miss: "drift"),
        judgeColoredByLane: false,
        flavor: [
            "S": "four a.m. and not one hit out of place. residents take notes.",
            "A": "deep in the pocket. the sunglasses never moved.",
            "B": "rolling. a little drift on the edges. the room stays with you.",
            "C": "the groove asked for less. give it less, then come back.",
            "D": "the floor cleared. happens to everyone once.",
        ],
        titleEyebrow: "ttd·05 · second room",
        titleSub: "same kick, deeper pocket. chords in the smoke, rumble under the floor. hold the groove longer this time.",
        titleFooter: "sound on. this one breathes."
    )
}
