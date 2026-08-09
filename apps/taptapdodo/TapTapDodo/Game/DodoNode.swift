import SpriteKit

/// The mascot — the Dodo brand character (ported from the Feynd app's vector
/// art), dressed for the room: black hoodie in the techno sets, pink bandana
/// for origin's club poster, violet scarf for detroit, red sweatband for
/// gabber. The hotter the streak, the harder it vibes — amplitude grows,
/// wings flap from 16, the set flourish lands at 30, full hype at 50.
/// Everything is clock-driven from song time (never SKActions).
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
    private var wings: [SKShapeNode] = []
    private let wingBaseRot: [CGFloat] = [0.35, -0.35]
    private var k: CGFloat { size / 75 }   // art units → points

    private enum Outfit { case hoodie, bandana, scarf, sweatband }
    private var outfit: Outfit {
        switch style {
        case .originFilled: return .bandana
        case .minimalLine: return .hoodie
        case .detroitLine: return .scarf
        case .gabberLine: return .sweatband
        }
    }

    // Brand colors (BRANDING.md) + outfit colors
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
        static let hoodie = SKColor(hex: 0x1C1D20)
        static let hoodiePocket = SKColor(hex: 0x121316)
        static let bandana = SKColor(hex: 0xFF4D8F)
        static let scarf = SKColor(hex: 0xA88BFF)
        static let sweatband = SKColor(hex: 0xFF2B2B)
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

    private func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: x * k, y: -y * k)   // art is y-down; SpriteKit is y-up
    }

    private func build() {
        addChild(figure)
        figure.position = CGPoint(x: 0, y: 26 * k)

        let hooded = outfit == .hoodie

        // legs + feet
        figure.addChild(fillNode(rounded(cx: -6, cy: -50, w: 6, h: 12, r: 3), Ink.feet))
        figure.addChild(fillNode(rounded(cx: 6, cy: -50, w: 6, h: 12, r: 3), Ink.feet))
        figure.addChild(fillNode(rounded(cx: -7, cy: -55.5, w: 12, h: 5, r: 2.5), Ink.feet))
        figure.addChild(fillNode(rounded(cx: 7, cy: -55.5, w: 12, h: 5, r: 2.5), Ink.feet))

        // body (the hoodie replaces slate + belly with black knit + pocket)
        figure.addChild(fillNode(ellipse(cx: 0, cy: -32, rx: 20, ry: 16), hooded ? Ink.hoodie : Ink.slate))
        if hooded {
            figure.addChild(fillNode(rounded(cx: 0, cy: -40, w: 18, h: 8, r: 3), Ink.hoodiePocket))
        } else {
            figure.addChild(fillNode(ellipse(cx: 0, cy: -35, rx: 12, ry: 10), Ink.cream))
        }

        // wings — hoodie sleeves in the techno sets
        wings = []
        for (i, px) in [-23.0, 23.0].enumerated() {
            let wing = fillNode(rounded(cx: 0, cy: 0, w: 14, h: 11, r: 5.5), hooded ? Ink.hoodie : Ink.wing)
            wing.position = CGPoint(x: px * k, y: -29.5 * k)
            wing.zRotation = wingBaseRot[i]
            if outfit == .sweatband {
                let band = fillNode(rounded(cx: 0, cy: 0, w: 6, h: 12, r: 2), Ink.sweatband)
                band.position = CGPoint(x: CGFloat(px < 0 ? -5 : 5) * k, y: 0)
                wing.addChild(band)
            }
            figure.addChild(wing)
            wings.append(wing)
        }

        figure.addChild(headGroup)
        buildHead()

        // neckwear in front, wrapped under the chin
        switch outfit {
        case .bandana:
            let tri = CGMutablePath()
            tri.move(to: CGPoint(x: -12 * k, y: -22 * k))
            tri.addLine(to: CGPoint(x: 12 * k, y: -22 * k))
            tri.addLine(to: CGPoint(x: 0, y: -34 * k))
            tri.closeSubpath()
            figure.addChild(fillNode(tri, Ink.bandana))
            figure.addChild(fillNode(rounded(cx: 0, cy: -23, w: 26, h: 4.5, r: 2.2), Ink.bandana))
        case .scarf:
            figure.addChild(fillNode(rounded(cx: 0, cy: -24, w: 25, h: 6.5, r: 3.2), Ink.scarf))
            let tail = fillNode(rounded(cx: 0, cy: 0, w: 6, h: 14, r: 3), Ink.scarf)
            tail.position = CGPoint(x: 8 * k, y: -32 * k)
            tail.zRotation = -0.15
            figure.addChild(tail)
        default:
            break
        }

        // hoodie drawstrings hanging onto the chest
        if hooded {
            for x in [-4.5, 4.5] {
                figure.addChild(fillNode(rounded(cx: x, cy: -22, w: 1.6, h: 8, r: 0.8), Ink.cream))
            }
        }
    }

    private func buildHead() {
        // sprout paths (art y −26…−39 above the head)
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

        // head; for the hoodie the hood wraps it and the sprout pokes through
        if outfit == .hoodie {
            headGroup.addChild(fillNode(ellipse(cx: 0, cy: 0, rx: 27.5, ry: 27.5), Ink.hoodie))
            headGroup.addChild(sprout)
        } else {
            headGroup.addChild(sprout)
            headGroup.addChild(fillNode(ellipse(cx: 0, cy: 0, rx: 26, ry: 26), Ink.slate))
        }

        let face = CGMutablePath()
        face.move(to: p(-20, 4))
        face.addCurve(to: p(-6.5, -12), control1: p(-20, -7), control2: p(-15, -13))
        face.addQuadCurve(to: p(6.5, -12), control: p(0, -7.5))
        face.addCurve(to: p(20, 4), control1: p(15, -13), control2: p(20, -7))
        face.addCurve(to: p(0, 24), control1: p(20, 16), control2: p(11, 24))
        face.addCurve(to: p(-20, 4), control1: p(-11, 24), control2: p(-20, 16))
        face.closeSubpath()
        headGroup.addChild(fillNode(face, Ink.cream))

        // gabber: red sweatband across the forehead, above the eyes
        if outfit == .sweatband {
            headGroup.addChild(fillNode(rounded(cx: 0, cy: 12.5, w: 37, h: 6, r: 3), Ink.sweatband))
        }

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

    // MARK: - Clock-driven behavior

    func update(songTime now: Double) {
        let s = size
        let peckAge = now - lastPeck
        let sadAge = now - lastSad
        let pecking = peckAge >= 0 && peckAge < (style == .originFilled ? 0.16 : 0.14)

        // the streak is the hype dial
        let excitement = min(1, Double(combo) / 50)

        var dy: CGFloat = 0
        var rotation: CGFloat = 0

        let beatPhase = ((now / spb).truncatingRemainder(dividingBy: 1) + 1)
            .truncatingRemainder(dividingBy: 1)
        let beatPulse = CGFloat(max(0, 1 - beatPhase * 3))

        // idle motion grows with the streak (from combo 8 up)
        let amp = 1 + CGFloat(combo >= 8 ? excitement : 0) * 0.9
        switch style {
        case .originFilled:
            dy = CGFloat(sin(now * .pi * 2 / spb / 2)) * s * 0.03 * amp
        case .minimalLine, .detroitLine, .gabberLine:
            dy = -beatPulse * s * 0.06 * amp
        }
        if pecking { dy -= s * 0.12 }

        // wings flap on the beat from combo 16
        if combo >= 16 {
            let flap = beatPulse * CGFloat(0.25 + 0.45 * excitement)
            wings[0].zRotation = wingBaseRot[0] + flap
            wings[1].zRotation = wingBaseRot[1] - flap
        } else {
            wings[0].zRotation = wingBaseRot[0]
            wings[1].zRotation = wingBaseRot[1]
        }

        // the set's own flourish at 30
        if combo >= 30 {
            switch style {
            case .originFilled:
                dy += beatPulse * s * 0.1
            case .minimalLine:
                sprout.zRotation = CGFloat(sin(now * .pi * 2 / spb)) * 0.35
            case .detroitLine:
                rotation = CGFloat(sin(now * .pi / spb / 2)) * 0.07
            case .gabberLine:
                headGroup.zRotation = -beatPulse * 0.45
            }
        } else {
            sprout.zRotation = 0
            if style == .gabberLine { headGroup.zRotation = 0 }
        }

        // full hype at 50: everyone jumps and pulses with the kick
        if combo >= 50 {
            dy += beatPulse * s * 0.06
            figure.setScale(1 + beatPulse * 0.05)
        } else {
            figure.setScale(1)
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
