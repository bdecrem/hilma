import SpriteKit

/// The mascot — the actual Dodo brand character, ported from the Feynd app's
/// vector art (apps/feynd/Feynd/DodoArt.swift): slate head, cream hooded
/// face, sprout, marigold beak and feet. Same art in every set; the per-set
/// styles only change how it moves. Every behavior is clock-driven from song
/// time (never SKActions — pause/resume stays free).
final class DodoNode: SKNode {
    private let style: DodoStyle
    private let size: CGFloat
    private let spb: Double

    // Clock-driven state, set by the scene.
    var lastPeck: Double = -10
    var lastSad: Double = -10
    var combo: Int = 0

    private let figure = SKNode()
    private let headGroup = SKNode()
    private var sprout = SKNode()
    private var eyeGroups: [SKNode] = []
    private var k: CGFloat { size / 75 }   // art units → points

    // Brand colors (BRANDING.md — the character never re-tints per skin)
    private enum Ink {
        static let slate = SKColor(hex: 0x7C9EB2)
        static let wing = SKColor(hex: 0x6A8FA3)
        static let cream = SKColor(hex: 0xF9EFDA)
        static let eye = SKColor(hex: 0x33383E)
        static let beak = SKColor(hex: 0xF0A830)
        static let nostril = SKColor(hex: 0xC9821F)
        static let blush = SKColor(hex: 0xF2A19A)
        static let feet = SKColor(hex: 0xF0A830)
        static let sproutStem = SKColor(hex: 0x6FAE5C)
        static let sproutLeft = SKColor(hex: 0x7BB662)
        static let sproutRight = SKColor(hex: 0x5F9E4C)
    }

    init(style: DodoStyle, size: CGFloat, spb: Double) {
        self.style = style
        self.size = size
        self.spb = spb
        super.init()
        build()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Construction (art space: head center (0,0), y-up, ×k)

    private func fillNode(_ path: CGPath, _ color: SKColor, alpha: CGFloat = 1) -> SKShapeNode {
        let node = SKShapeNode(path: path)
        node.fillColor = color.withAlphaComponent(alpha)
        node.strokeColor = .clear
        node.isAntialiased = true
        return node
    }

    private func ellipse(cx: CGFloat, cy: CGFloat, rx: CGFloat, ry: CGFloat) -> CGPath {
        CGPath(ellipseIn: CGRect(x: (cx - rx) * k, y: (cy - ry) * k,
                                 width: rx * 2 * k, height: ry * 2 * k), transform: nil)
    }

    private func rounded(cx: CGFloat, cy: CGFloat, w: CGFloat, h: CGFloat, r: CGFloat) -> CGPath {
        CGPath(roundedRect: CGRect(x: (cx - w / 2) * k, y: (cy - h / 2) * k,
                                   width: w * k, height: h * k),
               cornerWidth: r * k, cornerHeight: r * k, transform: nil)
    }

    private func build() {
        addChild(figure)
        figure.position = CGPoint(x: 0, y: 26 * k)   // center the mass on the node

        // legs + feet (art y 44…58 below head → negative here)
        figure.addChild(fillNode(rounded(cx: -6, cy: -50, w: 6, h: 12, r: 3), Ink.feet))
        figure.addChild(fillNode(rounded(cx: 6, cy: -50, w: 6, h: 12, r: 3), Ink.feet))
        figure.addChild(fillNode(rounded(cx: -7, cy: -55.5, w: 12, h: 5, r: 2.5), Ink.feet))
        figure.addChild(fillNode(rounded(cx: 7, cy: -55.5, w: 12, h: 5, r: 2.5), Ink.feet))

        // body + belly
        figure.addChild(fillNode(ellipse(cx: 0, cy: -32, rx: 20, ry: 16), Ink.slate))
        figure.addChild(fillNode(ellipse(cx: 0, cy: -35, rx: 12, ry: 10), Ink.cream))

        // wings — rounded rects rotated at their pivots
        for (px, rot) in [(-23.0, 0.35), (23.0, -0.35)] {
            let wing = fillNode(rounded(cx: 0, cy: 0, w: 14, h: 11, r: 5.5), Ink.wing)
            wing.position = CGPoint(x: px * k, y: -29.5 * k)
            wing.zRotation = rot
            figure.addChild(wing)
        }

        figure.addChild(headGroup)
        buildHead()
    }

    private func buildHead() {
        // sprout (art y −26…−39 above head → positive here)
        let stem = CGMutablePath()
        stem.move(to: p(-0.9, -26))
        stem.addCurve(to: p(2.2, -32), control1: p(-1.1, -28.6), control2: p(-0.4, -30.3))
        stem.addCurve(to: p(1.3, -26), control1: p(2.8, -30.7), control2: p(2.2, -28.6))
        stem.closeSubpath()

        let leafL = CGMutablePath()
        leafL.move(to: p(0.9, -30.9))
        leafL.addCurve(to: p(-16.1, -34.4), control1: p(-3.9, -36.5), control2: p(-11.3, -37.4))
        leafL.addCurve(to: p(0.9, -30.9), control1: p(-13.9, -28.7), control2: p(-5.7, -27.4))
        leafL.closeSubpath()

        let leafR = CGMutablePath()
        leafR.move(to: p(1.7, -32.2))
        leafR.addCurve(to: p(16.1, -37.8), control1: p(3.9, -37.8), control2: p(10.9, -39.6))
        leafR.addCurve(to: p(1.7, -32.2), control1: p(15.2, -32.2), control2: p(8.3, -29.2))
        leafR.closeSubpath()

        sprout = SKNode()
        sprout.addChild(fillNode(stem, Ink.sproutStem))
        sprout.addChild(fillNode(leafL, Ink.sproutLeft))
        sprout.addChild(fillNode(leafR, Ink.sproutRight))
        headGroup.addChild(sprout)

        // head + hooded cream face
        headGroup.addChild(fillNode(ellipse(cx: 0, cy: 0, rx: 26, ry: 26), Ink.slate))

        let face = CGMutablePath()
        face.move(to: p(-20, 4))
        face.addCurve(to: p(-6.5, -12), control1: p(-20, -7), control2: p(-15, -13))
        face.addQuadCurve(to: p(6.5, -12), control: p(0, -7.5))
        face.addCurve(to: p(20, 4), control1: p(15, -13), control2: p(20, -7))
        face.addCurve(to: p(0, 24), control1: p(20, 16), control2: p(11, 24))
        face.addCurve(to: p(-20, 4), control1: p(-11, 24), control2: p(-20, 16))
        face.closeSubpath()
        headGroup.addChild(fillNode(face, Ink.cream))

        // eyes with highlights, grouped so the blink can squash them
        eyeGroups = []
        for sx in [-1.0, 1.0] {
            let eye = SKNode()
            eye.position = CGPoint(x: sx * 9.4 * k, y: -2 * k)
            eye.addChild(fillNode(ellipse(cx: 0, cy: 0, rx: 5.5, ry: 5.5), Ink.eye))
            eye.addChild(fillNode(ellipse(cx: -sx * 1.8, cy: 2, rx: 2.1, ry: 2.1), .white))
            headGroup.addChild(eye)
            eyeGroups.append(eye)
        }

        // beak + nostrils + blush
        headGroup.addChild(fillNode(ellipse(cx: 0, cy: -6.3, rx: 6.8, ry: 5), Ink.beak))
        headGroup.addChild(fillNode(ellipse(cx: -2.6, cy: -5, rx: 0.95, ry: 0.95), Ink.nostril))
        headGroup.addChild(fillNode(ellipse(cx: 2.6, cy: -5, rx: 0.95, ry: 0.95), Ink.nostril))
        headGroup.addChild(fillNode(ellipse(cx: -15.6, cy: -8.4, rx: 4.2, ry: 2.6), Ink.blush, alpha: 0.6))
        headGroup.addChild(fillNode(ellipse(cx: 15.6, cy: -8.4, rx: 4.2, ry: 2.6), Ink.blush, alpha: 0.6))
    }

    private func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: x * k, y: -y * k)   // art is y-down; SpriteKit is y-up
    }

    // MARK: - Clock-driven behavior

    func update(songTime now: Double) {
        let s = size
        let peckAge = now - lastPeck
        let sadAge = now - lastSad
        let pecking = peckAge >= 0 && peckAge < (style == .originFilled ? 0.16 : 0.14)

        var dy: CGFloat = 0
        var rotation: CGFloat = 0

        let beatPhase = ((now / spb).truncatingRemainder(dividingBy: 1) + 1)
            .truncatingRemainder(dividingBy: 1)

        switch style {
        case .originFilled:
            // idle bob, two-beat period
            dy = CGFloat(sin(now * .pi * 2 / spb / 2)) * s * 0.03
        case .minimalLine, .detroitLine, .gabberLine:
            // head-nod snapping on the kick, not a bounce
            dy = -CGFloat(max(0, 1 - beatPhase * 4)) * s * 0.06
        }
        if pecking { dy -= s * 0.12 }

        // combo flourishes
        if combo >= 30 {
            switch style {
            case .originFilled:
                // little hop on each beat
                dy += CGFloat(max(0, 1 - beatPhase * 3)) * s * 0.1
            case .minimalLine:
                // the sprout dances
                sprout.zRotation = CGFloat(sin(now * .pi * 2 / spb)) * 0.35
            case .detroitLine:
                rotation = CGFloat(sin(now * .pi / spb / 2)) * 0.07
            case .gabberLine:
                headGroup.zRotation = -CGFloat(max(0, 1 - beatPhase * 3)) * 0.45
            }
        } else {
            sprout.zRotation = 0
            if style == .gabberLine { headGroup.zRotation = 0 }
        }

        figure.position = CGPoint(x: 0, y: 26 * k + dy)
        figure.zRotation = rotation

        // head dips (and tips forward) into the peck
        if pecking {
            headGroup.position = CGPoint(x: 0, y: -0.09 * s)
            if style != .gabberLine || combo < 30 { headGroup.zRotation = -0.15 }
        } else {
            headGroup.position = .zero
            if style != .gabberLine || combo < 30 { headGroup.zRotation = 0 }
        }

        // blink (everyone) + 0.5s sad squint (origin keeps its feelings)
        let sad = style == .originFilled && sadAge >= 0 && sadAge < 0.5
        let blink = sin(now * 0.7) > 0.995 || sad
        for group in eyeGroups {
            group.yScale = blink ? 0.15 : 1
        }
    }
}
