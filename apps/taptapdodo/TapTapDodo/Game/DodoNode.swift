import SpriteKit

/// The mascot. Sits centered below the hit line in every set; every behavior
/// is clock-driven from song time (never SKActions — pause/resume stays free).
final class DodoNode: SKNode {
    private let style: DodoStyle
    private let size: CGFloat
    private let spb: Double

    // Clock-driven state, set by the scene.
    var lastPeck: Double = -10
    var lastSad: Double = -10
    var combo: Int = 0
    private var flourishStart: Double = -10

    private let bodyGroup = SKNode()
    private let headGroup = SKNode()
    private var eyeDot: SKShapeNode?
    private var eyeLine: SKShapeNode?
    private var glasses: SKNode?

    init(style: DodoStyle, size: CGFloat, spb: Double) {
        self.style = style
        self.size = size
        self.spb = spb
        super.init()
        build()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Construction

    private struct Palette {
        let body: SKColor
        let shade: SKColor
        let accent: SKColor   // beak + legs
        let eye: SKColor
        let line: SKColor
        let lineWidth: CGFloat
        let filled: Bool
    }

    private var palette: Palette {
        switch style {
        case .originFilled:
            return Palette(body: SKColor(hex: 0xCFC8BC), shade: SKColor(hex: 0xB8B0A2),
                           accent: SKColor(hex: 0xFFB454), eye: SKColor(hex: 0x12101C),
                           line: .clear, lineWidth: 0, filled: true)
        case .minimalLine:
            return Palette(body: .clear, shade: .clear,
                           accent: SKColor(hex: 0xF2F2F0), eye: SKColor(hex: 0xF2F2F0),
                           line: SKColor(hex: 0xF2F2F0), lineWidth: 1.5, filled: false)
        case .detroitLine:
            return Palette(body: .clear, shade: .clear,
                           accent: SKColor(hex: 0xDDE2EC), eye: SKColor(hex: 0xDDE2EC),
                           line: SKColor(hex: 0xC9C2E8), lineWidth: 1.5, filled: false)
        case .gabberLine:
            return Palette(body: .clear, shade: .clear,
                           accent: SKColor(hex: 0xFF2B2B), eye: SKColor(hex: 0xFF2B2B),
                           line: SKColor(hex: 0xFF2B2B), lineWidth: 2, filled: false)
        }
    }

    private func shape(_ path: CGPath, fill: SKColor?, stroke: SKColor?, width: CGFloat) -> SKShapeNode {
        let node = SKShapeNode(path: path)
        node.fillColor = fill ?? .clear
        node.strokeColor = stroke ?? .clear
        node.lineWidth = width
        node.lineCap = .round
        node.isAntialiased = true
        return node
    }

    private func build() {
        let s = size
        let p = palette
        let stroke: SKColor? = p.filled ? nil : p.line
        let fillBody: SKColor? = p.filled ? p.body : nil
        let fillShade: SKColor? = p.filled ? p.shade : nil

        addChild(bodyGroup)

        // body
        let body = CGPath(ellipseIn: CGRect(x: -0.52 * s, y: -0.44 * s, width: 1.04 * s, height: 0.88 * s), transform: nil)
        bodyGroup.addChild(shape(body, fill: fillBody, stroke: stroke, width: p.lineWidth))

        // wing
        var wingTransform = CGAffineTransform(translationX: -0.1 * s, y: -0.05 * s).rotated(by: 0.3)
        let wingRect = CGRect(x: -0.26 * s, y: -0.18 * s, width: 0.52 * s, height: 0.36 * s)
        let wing = CGPath(ellipseIn: wingRect, transform: &wingTransform)
        bodyGroup.addChild(shape(wing, fill: fillShade, stroke: stroke, width: p.lineWidth))

        // tail
        if p.filled {
            for i in 0..<3 {
                let fi = CGFloat(i)
                var tf = CGAffineTransform(translationX: -0.5 * s, y: (0.05 + fi * 0.07) * s).rotated(by: 0.6 + fi * 0.3)
                let tail = CGPath(ellipseIn: CGRect(x: -0.12 * s, y: -0.06 * s, width: 0.24 * s, height: 0.12 * s), transform: &tf)
                bodyGroup.addChild(shape(tail, fill: fillShade, stroke: nil, width: 0))
            }
        } else {
            for i in 0..<3 {
                let fi = CGFloat(i)
                let path = CGMutablePath()
                path.move(to: CGPoint(x: -0.42 * s, y: (0.02 + fi * 0.06) * s))
                path.addLine(to: CGPoint(x: -0.62 * s, y: (0.12 + fi * 0.09) * s))
                bodyGroup.addChild(shape(path, fill: nil, stroke: stroke, width: p.lineWidth))
            }
        }

        // legs
        let legs = CGMutablePath()
        legs.move(to: CGPoint(x: -0.1 * s, y: -0.4 * s))
        legs.addLine(to: CGPoint(x: -0.12 * s, y: -0.62 * s))
        legs.move(to: CGPoint(x: 0.12 * s, y: -0.4 * s))
        legs.addLine(to: CGPoint(x: 0.14 * s, y: -0.62 * s))
        bodyGroup.addChild(shape(legs, fill: nil, stroke: p.filled ? p.accent : p.line,
                                 width: p.filled ? 0.05 * s : p.lineWidth))

        // head group (head + beak + face), positioned at the neck
        headGroup.position = CGPoint(x: 0.38 * s, y: 0.42 * s)
        bodyGroup.addChild(headGroup)

        let head = CGPath(ellipseIn: CGRect(x: -0.26 * s, y: -0.26 * s, width: 0.52 * s, height: 0.52 * s), transform: nil)
        headGroup.addChild(shape(head, fill: fillBody, stroke: stroke, width: p.lineWidth))

        // beak — the big hooked dodo beak
        let beak = CGMutablePath()
        beak.move(to: CGPoint(x: 0.16 * s, y: 0.1 * s))
        beak.addQuadCurve(to: CGPoint(x: 0.55 * s, y: -0.12 * s), control: CGPoint(x: 0.62 * s, y: 0.12 * s))
        beak.addQuadCurve(to: CGPoint(x: 0.14 * s, y: -0.1 * s), control: CGPoint(x: 0.35 * s, y: -0.22 * s))
        beak.closeSubpath()
        headGroup.addChild(shape(beak, fill: p.filled ? p.accent : nil, stroke: stroke, width: p.lineWidth))

        switch style {
        case .originFilled:
            // round eye + blink line, swapped by the clock
            let eye = shape(CGPath(ellipseIn: CGRect(x: -0.01 * s, y: 0.0 * s, width: 0.1 * s, height: 0.1 * s), transform: nil),
                            fill: p.eye, stroke: nil, width: 0)
            headGroup.addChild(eye)
            eyeDot = eye
            let line = shape(CGPath(rect: CGRect(x: -0.02 * s, y: 0.02 * s, width: 0.12 * s, height: 0.03 * s), transform: nil),
                             fill: p.eye, stroke: nil, width: 0)
            line.isHidden = true
            headGroup.addChild(line)
            eyeLine = line
        case .minimalLine, .detroitLine, .gabberLine:
            // sunglasses: the one solid shape on the bird
            let g = SKNode()
            let lens = shape(CGPath(rect: CGRect(x: -0.12 * s, y: 0.01 * s, width: 0.28 * s, height: 0.11 * s), transform: nil),
                             fill: p.accent, stroke: nil, width: 0)
            g.addChild(lens)
            let arm = CGMutablePath()
            arm.move(to: CGPoint(x: -0.12 * s, y: 0.08 * s))
            arm.addLine(to: CGPoint(x: -0.26 * s, y: 0.12 * s))
            g.addChild(shape(arm, fill: nil, stroke: p.line, width: p.lineWidth))
            headGroup.addChild(g)
            glasses = g
        }
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
            if flourishStart < 0 { flourishStart = now }
            switch style {
            case .originFilled:
                // little hop on each beat
                dy += CGFloat(max(0, 1 - beatPhase * 3)) * s * 0.1
            case .minimalLine:
                // lowers the sunglasses briefly, then back up
                let age = now - flourishStart
                if age < 1.2, let glasses {
                    let k = CGFloat(sin(min(1, age / 1.2) * .pi))
                    glasses.position = CGPoint(x: 0, y: -0.06 * s * k)
                }
            case .detroitLine:
                rotation = CGFloat(sin(now * .pi / spb / 2)) * 0.07
            case .gabberLine:
                headGroup.zRotation = -CGFloat(max(0, 1 - beatPhase * 3)) * 0.45
            }
        } else {
            flourishStart = -10
            glasses?.position = .zero
            if style == .gabberLine { headGroup.zRotation = 0 }
        }

        bodyGroup.position = CGPoint(x: 0, y: dy)
        bodyGroup.zRotation = rotation

        // head dips into the peck
        let headDip: CGFloat = pecking ? -0.09 * s : 0
        headGroup.position = CGPoint(x: 0.38 * s, y: 0.42 * s + headDip)

        // origin face: blink + 0.5s sad eyes. minimal: no reaction, too cool.
        if style == .originFilled {
            let sad = sadAge >= 0 && sadAge < 0.5
            let blink = sin(now * 0.7) > 0.995 || sad
            eyeDot?.isHidden = blink
            eyeLine?.isHidden = !blink
        }
    }
}
