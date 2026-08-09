import SpriteKit
import UIKit
import AVFoundation

struct RunSettings {
    var travelScale: Double = 1.0      // note-speed setting, ±15%
    var calibration: Double = 0        // seconds; applied to judgment only
    var hapticsOn: Bool = true
    var kickHapticsOn: Bool = true
}

/// SpriteKit owns gameplay. Notes are never animated with SKActions — every
/// frame repositions them analytically from the Conductor's clock, so pause,
/// resume and drift are non-issues by construction.
final class GameScene: SKScene {
    private let track: TrackDef
    private let chart: [ChartNote]
    private let skin: Skin
    private let config: RunConfig
    private let settings: RunSettings
    private let conductor: Conductor
    private let synth = SynthEngine.shared
    private let judge: JudgmentEngine
    private let plan: BackingPlan
    private var scheduler: BackingScheduler?
    private let haptics: Haptics
    private let onFinish: (RunResult) -> Void
    private let onExit: () -> Void

    private let reduceMotion = UIAccessibility.isReduceMotionEnabled
    private var travel: Double { track.travel * settings.travelScale }

    // layout
    private var W: CGFloat = 0
    private var H: CGFloat = 0
    private var topInset: CGFloat = 0
    private var hitLineY: CGFloat = 0
    private var laneWidth: CGFloat = 0

    // nodes
    private let world = SKNode()
    private var glowNode: SKSpriteNode?
    private var strobeNode: SKSpriteNode?
    private var noteNodes: [Int: SKShapeNode] = [:]
    private let notesLayer = SKNode()
    private let fxLayer = SKNode()
    private var dodo: DodoNode?
    private var scoreLabel: SKLabelNode!
    private var comboLabel: SKLabelNode!
    private var judgeLabel: SKLabelNode!
    private var microJudgeLabel: SKLabelNode!
    private var countdownLabel: SKLabelNode!
    private var pausedOverlay: SKNode?
    private var pauseButtonRect: CGRect = .null

    // clock-driven fx state
    private struct Flash { let lane: Int; let start: Double; let node: SKShapeNode }
    private var flashes: [Flash] = []
    private var judgeShownAt = -10.0
    private var comboPopAt = -10.0
    private var paused_ = false
    private var finished = false
    private var started = false

    init(size: CGSize, track: TrackDef, chart: [ChartNote], skin: Skin, config: RunConfig,
         settings: RunSettings, haptics: Haptics,
         onFinish: @escaping (RunResult) -> Void, onExit: @escaping () -> Void) {
        self.track = track
        self.chart = chart
        self.skin = skin
        self.config = config
        self.settings = settings
        self.haptics = haptics
        self.onFinish = onFinish
        self.onExit = onExit
        conductor = Conductor(bpm: track.bpm, leadIn: 3.2)
        judge = JudgmentEngine(notes: chart, spb: track.secondsPerBeat)
        plan = BackingComposer.plan(for: track)
        super.init(size: size)
        scaleMode = .resizeFill
        backgroundColor = skin.background
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - Layout

    private func laneX(_ lane: Int) -> CGFloat {
        let pad = W * 0.08
        let w = (W - pad * 2) / 3
        return pad + w * CGFloat(lane) + w / 2
    }

    private func lane(atX x: CGFloat) -> Int {
        let pad = W * 0.08
        if x < pad { return 0 }
        if x > W - pad { return 2 }
        return min(2, max(0, Int((x - pad) / ((W - pad * 2) / 3))))
    }

    override func didMove(to view: SKView) {
        W = size.width
        H = size.height
        topInset = view.safeAreaInsets.top
        hitLineY = H * 0.22
        laneWidth = (W * 0.84) / 3

        addChild(world)
        buildBeatFX()
        buildLanes()
        world.addChild(notesLayer)
        world.addChild(fxLayer)
        buildDodo()
        buildHUD()
        observeInterruptions()

        // Warm the audio graph, then start the clock. The plan carries the
        // set's whole routing: master gain, compressor, delay and duck buses.
        synth.stopAllVoices()
        synth.conductor = conductor
        synth.apply(plan.config)
        synth.start()

        let sched = BackingScheduler(plan: plan, conductor: conductor, synth: synth)
        sched.onKickScheduled = { [weak self] kickTime in self?.scheduleKickHaptic(at: kickTime) }
        scheduler = sched

        conductor.start()
        sched.start()

        // Audible count-in: four quiet ticks on the beats leading into beat 0,
        // so the tempo is in the player's ear before the first note arrives.
        let spb = track.secondsPerBeat
        for i in 1...4 {
            let t = -Double(i) * spb
            synth.schedule(HatVoice.afters(at: t, open: false, velocity: 0.55, seed: UInt64(900 + i)))
        }

        started = true
    }

    private func buildBeatFX() {
        switch skin.beatFX {
        case .radialGlow:
            let node = SKSpriteNode(texture: Self.radialGlowTexture(color: skin.laneColors[0]))
            node.size = CGSize(width: H * 1.8, height: H * 1.8)
            node.position = CGPoint(x: W / 2, y: H * 0.15)
            node.alpha = 0.05
            node.zPosition = -1
            world.addChild(node)
            glowNode = node
        case .strobe, .strobeShake:
            let node = SKSpriteNode(color: skin.foreground, size: CGSize(width: W, height: H))
            node.position = CGPoint(x: W / 2, y: H / 2)
            node.alpha = 0
            node.zPosition = -1
            world.addChild(node)
            strobeNode = node
        case .none:
            break
        }
    }

    private static func radialGlowTexture(color: SKColor) -> SKTexture {
        let side = 512
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
        let image = renderer.image { ctx in
            let colors = [color.withAlphaComponent(1).cgColor, color.withAlphaComponent(0).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            ctx.cgContext.drawRadialGradient(
                gradient,
                startCenter: CGPoint(x: side / 2, y: side / 2), startRadius: 0,
                endCenter: CGPoint(x: side / 2, y: side / 2), endRadius: CGFloat(side) / 2,
                options: [])
        }
        return SKTexture(image: image)
    }

    private func buildLanes() {
        let railColor = skin.foreground.withAlphaComponent(skin.laneStyle == .glyphs ? 0.08 : 0.07)
        for i in 0..<3 {
            let x = laneX(i)
            let path = CGMutablePath()
            switch skin.laneStyle {
            case .glyphs:
                // single center rail, stopping short of the target glyph
                path.move(to: CGPoint(x: x, y: H))
                path.addLine(to: CGPoint(x: x, y: hitLineY + laneWidth * 0.3))
            case .colors:
                path.move(to: CGPoint(x: x - laneWidth / 2 + 6, y: H))
                path.addLine(to: CGPoint(x: x - laneWidth / 2 + 6, y: hitLineY))
                path.move(to: CGPoint(x: x + laneWidth / 2 - 6, y: H))
                path.addLine(to: CGPoint(x: x + laneWidth / 2 - 6, y: hitLineY))
            }
            let rail = SKShapeNode(path: path)
            rail.strokeColor = railColor
            rail.lineWidth = 1
            world.addChild(rail)
        }

        let hitLine = SKShapeNode(path: {
            let p = CGMutablePath()
            p.move(to: CGPoint(x: W * 0.06, y: hitLineY))
            p.addLine(to: CGPoint(x: W * 0.94, y: hitLineY))
            return p
        }())
        hitLine.strokeColor = skin.foreground.withAlphaComponent(skin.laneStyle == .glyphs ? 0.6 : 0.5)
        hitLine.lineWidth = skin.laneStyle == .glyphs ? 1.5 : 2
        world.addChild(hitLine)

        // lane targets on the hit line
        for i in 0..<3 {
            let target: SKShapeNode
            switch skin.laneStyle {
            case .colors:
                target = SKShapeNode(circleOfRadius: laneWidth * 0.28)
                target.strokeColor = skin.laneColors[i].withAlphaComponent(0.33)
                target.lineWidth = 2
            case .glyphs:
                target = Self.glyphNode(lane: i, radius: laneWidth * 0.2)
                target.strokeColor = skin.dim
                target.lineWidth = 1.5
            }
            target.fillColor = .clear
            target.position = CGPoint(x: laneX(i), y: hitLineY)
            world.addChild(target)
            targetNodes.append(target)
        }
    }

    private var targetNodes: [SKShapeNode] = []

    /// circle / square / triangle, matching the minimal prototype's drawGlyph.
    private static func glyphNode(lane: Int, radius r: CGFloat) -> SKShapeNode {
        let path: CGPath
        switch lane {
        case 0:
            path = CGPath(ellipseIn: CGRect(x: -r, y: -r, width: 2 * r, height: 2 * r), transform: nil)
        case 1:
            path = CGPath(rect: CGRect(x: -r * 0.88, y: -r * 0.88, width: r * 1.76, height: r * 1.76), transform: nil)
        default:
            let p = CGMutablePath()
            p.move(to: CGPoint(x: 0, y: r))
            p.addLine(to: CGPoint(x: r * 0.95, y: -r * 0.75))
            p.addLine(to: CGPoint(x: -r * 0.95, y: -r * 0.75))
            p.closeSubpath()
            path = p
        }
        return SKShapeNode(path: path)
    }

    private func buildDodo() {
        let node = DodoNode(style: skin.dodoStyle,
                            size: min(64, W * 0.16),
                            spb: track.secondsPerBeat)
        node.position = CGPoint(x: W / 2, y: hitLineY - min(70, H * 0.09))
        world.addChild(node)
        dodo = node
    }

    private func kerned(_ text: String, font: String, size: CGFloat, color: SKColor, kern: CGFloat = 0) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .font: UIFont(name: font, size: size) ?? UIFont.monospacedSystemFont(ofSize: size, weight: .bold),
            .foregroundColor: color,
            .kern: kern,
        ])
    }

    private func buildHUD() {
        let isGlyphs = skin.laneStyle == .glyphs
        let hudY = H - topInset - 34

        scoreLabel = SKLabelNode()
        scoreLabel.horizontalAlignmentMode = .left
        scoreLabel.position = CGPoint(x: 20, y: hudY)
        addChild(scoreLabel)

        comboLabel = SKLabelNode()
        comboLabel.horizontalAlignmentMode = .right
        comboLabel.position = CGPoint(x: W - 20, y: hudY)
        addChild(comboLabel)

        judgeLabel = SKLabelNode()
        judgeLabel.horizontalAlignmentMode = .center
        judgeLabel.position = CGPoint(x: W / 2, y: H * 0.66)
        judgeLabel.alpha = 0
        addChild(judgeLabel)

        microJudgeLabel = SKLabelNode()
        microJudgeLabel.horizontalAlignmentMode = .center
        microJudgeLabel.position = CGPoint(x: W / 2, y: H * 0.66 - 22)
        microJudgeLabel.alpha = 0
        addChild(microJudgeLabel)

        countdownLabel = SKLabelNode()
        countdownLabel.horizontalAlignmentMode = .center
        countdownLabel.position = CGPoint(x: W / 2, y: H * 0.6)
        addChild(countdownLabel)

        buildPauseButton(hudY: hudY)

        _ = isGlyphs
        updateScoreHUD()
    }

    /// Small "‖" pause glyph — two SKShapeNode bars, top-center between the
    /// score and the combo, on the same safe-area-respecting HUD line. Claims
    /// only touches inside a generous 44pt hit rect, checked before judgment.
    private func buildPauseButton(hudY: CGFloat) {
        let center = CGPoint(x: W / 2, y: hudY + 6)
        let barSize = CGSize(width: 3.5, height: 14)
        let container = SKNode()
        container.position = center
        for dx in [-4.0, 4.0] {
            let bar = SKShapeNode(rectOf: barSize, cornerRadius: 1.5)
            bar.fillColor = skin.dim
            bar.strokeColor = .clear
            bar.position = CGPoint(x: dx, y: 0)
            container.addChild(bar)
        }
        container.alpha = 0.9
        addChild(container)
        let r: CGFloat = 22   // 44pt square hit target
        pauseButtonRect = CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r)
    }

    private func updateScoreHUD() {
        let isGlyphs = skin.laneStyle == .glyphs
        scoreLabel.attributedText = kerned(String(judge.score),
                                           font: isGlyphs ? Fonts.mono : Fonts.unbounded,
                                           size: isGlyphs ? 14 : 20,
                                           color: skin.foreground,
                                           kern: isGlyphs ? 2 : 0)
        let comboThreshold = isGlyphs ? 4 : 3
        let comboText = judge.combo >= comboThreshold ? "\(judge.combo)×" : ""
        comboLabel.attributedText = kerned(comboText,
                                           font: isGlyphs ? Fonts.mono : Fonts.unbounded,
                                           size: isGlyphs ? 13 : 15,
                                           color: isGlyphs ? skin.dim : skin.laneColors[1],
                                           kern: isGlyphs ? 2 : 0)
    }

    private func showJudge(_ text: String, color: SKColor, micro: String? = nil) {
        let isGlyphs = skin.laneStyle == .glyphs
        judgeLabel.attributedText = kerned(skin.styled(text),
                                           font: isGlyphs ? Fonts.monoBold : Fonts.unbounded,
                                           size: isGlyphs ? 13 : 24,
                                           color: color,
                                           kern: isGlyphs ? 6 : 1)
        if let micro {
            microJudgeLabel.attributedText = kerned(skin.styled(micro),
                                                    font: Fonts.mono, size: 10,
                                                    color: skin.dim, kern: 3)
        }
        microJudgeLabel.alpha = micro == nil ? 0 : 1
        judgeShownAt = conductor.songTime
        judgeLabel.alpha = 1
    }

    // MARK: - Interruptions & pause

    private func observeInterruptions() {
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let self,
                  let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            // Pause on .began; stay paused after .ended — the player resumes
            // with a tap once they're ready, and the clock realigns exactly.
            if type == .began { self.pauseGame() }
        }
        // Headphones yanked mid-run: pause rather than blasting the speaker.
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
            if reason == .oldDeviceUnavailable { self?.pauseGame() }
        }
    }

    func pauseGame() {
        guard started, !finished, !paused_ else { return }
        paused_ = true
        conductor.pause()
        synth.pause()
        showPausedOverlay()
    }

    func resumeGame() {
        guard paused_ else { return }
        paused_ = false
        pausedOverlay?.removeFromParent()
        pausedOverlay = nil
        synth.start()
        conductor.resume()
    }

    private func showPausedOverlay() {
        let isGlyphs = skin.laneStyle == .glyphs
        let overlay = SKNode()
        overlay.zPosition = 100
        let scrim = SKSpriteNode(color: skin.background, size: CGSize(width: W, height: H))
        scrim.alpha = 0.72
        scrim.position = CGPoint(x: W / 2, y: H / 2)
        overlay.addChild(scrim)

        let title = SKLabelNode()
        title.attributedText = kerned(skin.styled("PAUSED"),
                                      font: isGlyphs ? Fonts.monoBold : Fonts.unbounded,
                                      size: 16, color: skin.foreground,
                                      kern: isGlyphs ? 6 : 1)
        title.position = CGPoint(x: W / 2, y: H / 2 + 64)
        overlay.addChild(title)

        overlay.addChild(overlayButton(text: "RESUME", name: "ttd.resume", filled: true,
                                       at: CGPoint(x: W / 2, y: H / 2)))
        overlay.addChild(overlayButton(text: "EXIT", name: "ttd.exit", filled: false,
                                       at: CGPoint(x: W / 2, y: H / 2 - 72)))

        addChild(overlay)
        pausedOverlay = overlay
    }

    /// One tappable overlay option, styled per skin. The name is carried by
    /// both the shape and its label so nodes(at:) hit-tests either.
    private func overlayButton(text: String, name: String, filled: Bool, at position: CGPoint) -> SKNode {
        let isGlyphs = skin.laneStyle == .glyphs
        let size = CGSize(width: 200, height: 52)
        let shape = isGlyphs
            ? SKShapeNode(rectOf: size)
            : SKShapeNode(rectOf: size, cornerRadius: size.height / 2)
        if filled {
            shape.fillColor = skin.foreground
            shape.strokeColor = .clear
        } else {
            shape.fillColor = .clear
            shape.strokeColor = skin.foreground.withAlphaComponent(0.6)
            shape.lineWidth = 1.5
        }
        shape.name = name
        shape.position = position

        let label = SKLabelNode()
        label.attributedText = kerned(skin.styled(text),
                                      font: isGlyphs ? Fonts.monoBold : Fonts.unbounded,
                                      size: 14,
                                      color: filled ? skin.background : skin.foreground,
                                      kern: isGlyphs ? 4 : 1)
        label.verticalAlignmentMode = .center
        label.name = name
        shape.addChild(label)
        return shape
    }

    // MARK: - Input

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        if paused_ {
            // Explicit buttons only — no more tap-anywhere-to-resume.
            for touch in touches {
                let hit = nodes(at: touch.location(in: self))
                if hit.contains(where: { $0.name == "ttd.resume" }) {
                    if settings.hapticsOn { haptics.ui() }
                    resumeGame(); return
                }
                if hit.contains(where: { $0.name == "ttd.exit" }) {
                    if settings.hapticsOn { haptics.ui() }
                    exitRun(); return
                }
            }
            return
        }
        guard started, !finished else { return }
        // Judge every touch independently with its own hardware timestamp.
        for touch in touches {
            let loc = touch.location(in: self)
            // The pause button claims its touches before judgment, and only
            // those — lane taps elsewhere are never eaten.
            if pauseButtonRect.contains(loc) {
                pauseGame()
                return
            }
            let lane = lane(atX: loc.x)
            let t = conductor.songTime(atTouchTimestamp: touch.timestamp) - settings.calibration
            handleTap(lane: lane, at: t)
        }
    }

    private func handleTap(lane: Int, at t: Double) {
        guard let result = judge.tap(lane: lane, at: t) else { return }
        let note = chart[result.noteIndex]
        let now = conductor.songTime

        // The lane voice fires when the player hits it — the player plays the line.
        let audioAt = now + 0.006
        switch track.backingStyle {
        case "origin":
            let freq = track.scaleTones[note.pitchIndex ?? 0]
            synth.schedule(PluckVoice.origin(at: audioAt, freq: freq))
        case "minimal":
            synth.schedule(StabVoice(at: audioAt, lane: lane, vol: 0.3))
        case "detroit":
            let freq = track.scaleTones[note.pitchIndex ?? 0]
            synth.schedule(PluckVoice.detroit(at: audioAt, freq: freq))
        case "afters":
            synth.schedule(AftersTapVoice(at: audioAt, lane: lane, vol: 0.32))
        case "minimal2":
            synth.schedule(MinimalIITapVoice(at: audioAt, lane: lane, vol: 0.3 * note.vel + 0.06))
        default:
            synth.schedule(GabberStabVoice(at: audioAt, lane: lane, vol: 0.35))
        }

        spawnFlash(lane: lane, at: now)
        dodo?.lastPeck = now

        let label: String
        let color: SKColor
        var micro: String? = nil
        switch result.judgment {
        case .perfect:
            label = skin.judgeLabels.perfect
            color = skin.judgeColoredByLane ? skin.laneColors[lane] : skin.foreground
            if settings.hapticsOn { haptics.perfect() }
        case .good, .weak:
            label = skin.judgeLabels.good
            color = skin.judgeColoredByLane ? skin.laneColors[lane] : skin.foreground
            // The skill loop: non-perfect hits say which side they landed on.
            micro = result.deltaMs < 0 ? "early" : "late"
            if settings.hapticsOn { haptics.good() }
        case .miss:
            label = skin.judgeLabels.miss
            color = skin.dim
        }
        showJudge(label, color: color, micro: micro)

        if judge.combo > 0, judge.combo % 25 == 0 {
            comboPopAt = now
            if settings.hapticsOn { haptics.good() }
        }

        if let node = noteNodes.removeValue(forKey: result.noteIndex) {
            node.removeFromParent()
        }
        updateScoreHUD()
    }

    private func handleMiss(index: Int) {
        let note = chart[index]
        let now = conductor.songTime
        let audioAt = now + 0.006

        // Quiet ghost so the melody survives even a bad run. Miss haptic:
        // nothing — absence reads as failure.
        switch track.backingStyle {
        case "origin":
            synth.schedule(GhostVoice(at: audioAt, freq: track.scaleTones[note.pitchIndex ?? 0]))
        case "minimal":
            synth.schedule(StabVoice(at: audioAt, lane: note.lane, vol: 0.06))
        case "detroit":
            synth.schedule(GhostVoice(at: audioAt, freq: track.scaleTones[note.pitchIndex ?? 0]))
        case "afters":
            synth.schedule(AftersTapVoice(at: audioAt, lane: note.lane, vol: 0.06))
        case "minimal2":
            synth.schedule(MinimalIITapVoice(at: audioAt, lane: note.lane, vol: 0.05))
        default:
            synth.schedule(GabberStabVoice(at: audioAt, lane: note.lane, vol: 0.05))
        }

        dodo?.lastSad = now
        showJudge(skin.judgeLabels.miss, color: skin.dim)

        // The note fades in place instead of vanishing.
        if let node = noteNodes[index] {
            switch skin.laneStyle {
            case .colors:
                node.fillColor = skin.dim.withAlphaComponent(0.4)
                node.children.forEach { $0.alpha = 0 }
            case .glyphs:
                node.fillColor = .clear
                node.strokeColor = skin.dim
                node.alpha = 0.2
            }
        }
        updateScoreHUD()
    }

    // MARK: - Note rendering

    /// Velocity → size, only on authored charts: accents 1.15×, ghosts 0.92×.
    private lazy var chartUsesVelocity: Bool = chart.contains { $0.vel != 1 }

    private func makeNoteNode(index: Int) -> SKShapeNode {
        let note = chart[index]
        let velScale: CGFloat = chartUsesVelocity ? (note.vel >= 1 ? 1.15 : 0.92) : 1
        let node: SKShapeNode
        switch skin.laneStyle {
        case .colors:
            let r = laneWidth * 0.2 * velScale
            node = SKShapeNode(circleOfRadius: r)
            node.fillColor = skin.laneColors[note.lane]
            node.strokeColor = .clear
            let inner = SKShapeNode(circleOfRadius: r * 0.4)
            inner.fillColor = skin.background.withAlphaComponent(0.55)
            inner.strokeColor = .clear
            node.addChild(inner)
        case .glyphs:
            node = Self.glyphNode(lane: note.lane, radius: laneWidth * 0.16 * velScale)
            node.fillColor = skin.foreground
            node.strokeColor = .clear
        }
        node.position = CGPoint(x: laneX(note.lane), y: H + 50)
        return node
    }

    private func spawnFlash(lane: Int, at time: Double) {
        let node: SKShapeNode
        switch skin.laneStyle {
        case .colors:
            node = SKShapeNode(circleOfRadius: laneWidth * 0.28)
            node.strokeColor = skin.laneColors[lane]
            node.lineWidth = 3
        case .glyphs:
            node = Self.glyphNode(lane: lane, radius: laneWidth * 0.2)
            node.strokeColor = skin.foreground
            node.lineWidth = 1.5
        }
        node.fillColor = .clear
        node.position = CGPoint(x: laneX(lane), y: hitLineY)
        fxLayer.addChild(node)
        flashes.append(Flash(lane: lane, start: time, node: node))
    }

    // MARK: - Frame loop

    override func update(_ currentTime: TimeInterval) {
        guard started, !finished, !paused_ else { return }
        let now = conductor.songTime

        for index in judge.sweepMisses(now: now) {
            handleMiss(index: index)
        }

        positionNotes(now: now)
        updateFlashes(now: now)
        updateBeatFX(now: now)
        updateCountdown(now: now)

        // judgment label fade + entry pop, clock-driven like everything else
        let judgeAge = now - judgeShownAt
        let judgeHold = skin.laneStyle == .glyphs ? 0.22 : 0.26
        let judgeAlpha = judgeAge < judgeHold ? 1 : max(0, 1 - (judgeAge - judgeHold) / 0.08)
        judgeLabel.alpha = judgeAlpha
        judgeLabel.setScale(judgeAge < 0.08 ? 0.85 + 0.15 * judgeAge / 0.08 : 1)
        if microJudgeLabel.alpha > 0 { microJudgeLabel.alpha = judgeAlpha }

        // combo milestone pop (every 25)
        let comboAge = now - comboPopAt
        comboLabel.setScale(comboAge < 0.25 ? 1 + 0.3 * (1 - comboAge / 0.25) : 1)

        dodo?.combo = judge.combo
        dodo?.update(songTime: now)

        // minimal ii: lane 2's target breathes on the 3-cycle through peak A
        if track.backingStyle == "minimal2", targetNodes.count == 3 {
            let bar = Int(now / track.secondsPerBeat / 4)
            if bar >= 20, bar < 28 {
                let phase = ((now / track.secondsPerBeat).truncatingRemainder(dividingBy: 1.5)) / 1.5
                targetNodes[2].alpha = 0.7 + 0.3 * CGFloat(max(0, 1 - phase * 3))
            } else {
                targetNodes[2].alpha = 1
            }
        }

        if now > track.songLength { finish() }
    }

    private func positionNotes(now: Double) {
        let spb = track.secondsPerBeat
        let fall = H - hitLineY + 40
        for (index, note) in chart.enumerated() {
            let dt = note.beat * spb - now
            let visible = dt <= travel && dt >= -0.25 && !(judge.hit[index])
            if visible {
                let node = noteNodes[index] ?? {
                    let n = makeNoteNode(index: index)
                    noteNodes[index] = n
                    notesLayer.addChild(n)
                    return n
                }()
                node.position.y = hitLineY + CGFloat(dt / travel) * fall
            } else if let node = noteNodes.removeValue(forKey: index) {
                node.removeFromParent()
            }
        }
    }

    private func updateFlashes(now: Double) {
        let life = skin.laneStyle == .glyphs ? 0.25 : 0.3
        flashes.removeAll { flash in
            let age = (now - flash.start) / life
            if age >= 1 { flash.node.removeFromParent(); return true }
            let grow = skin.laneStyle == .glyphs ? 0.3 / 0.2 : 0.35 / 0.28
            flash.node.setScale(1 + CGFloat(age) * CGFloat(grow))
            flash.node.alpha = CGFloat(1 - age)
            return false
        }
    }

    private func updateBeatFX(now: Double) {
        let spb = track.secondsPerBeat
        switch skin.beatFX {
        case .radialGlow:
            guard let glowNode else { return }
            if reduceMotion || now < 0 { glowNode.alpha = 0.05; return }
            let beatPhase = (now / spb).truncatingRemainder(dividingBy: 1)
            glowNode.alpha = 0.05 + CGFloat(max(0, 1 - beatPhase * 3)) * 0.06
        case .strobe, .strobeShake:
            guard let strobeNode else { return }
            if reduceMotion { strobeNode.alpha = 0; return }
            // flick up on scheduled downbeat kicks, decaying over 90ms
            var flash = 0.0
            for kick in plan.kickTimes {
                let age = now - kick
                if age < -0.001 { break }
                let beat = (kick / spb).rounded()
                if age < 0.09, beat.truncatingRemainder(dividingBy: 4) == 0 {
                    flash = max(flash, (1 - age / 0.09) * 0.05)
                }
            }
            strobeNode.alpha = CGFloat(flash)
            if skin.beatFX == .strobeShake {
                var shake = 0.0
                for kick in plan.kickTimes {
                    let age = now - kick
                    if age < -0.001 { break }
                    if age < 0.12 { shake = max(shake, 1 - age / 0.12) }
                }
                let amp = CGFloat(shake) * 3
                world.position = CGPoint(
                    x: CGFloat(sin(now * 173)) * amp,
                    y: CGFloat(cos(now * 211)) * amp)
            }
        case .none:
            break
        }
    }

    private func updateCountdown(now: Double) {
        guard now < 0 else {
            countdownLabel.alpha = 0
            return
        }
        let spb = track.secondsPerBeat
        let n = min(3, Int(ceil(-now / spb / 2)))
        let isGlyphs = skin.laneStyle == .glyphs
        let text: String
        if now > -0.6 {
            text = isGlyphs ? "· go ·" : "GO"
        } else {
            text = isGlyphs ? "· \(n) ·" : String(n)
        }
        countdownLabel.attributedText = kerned(text,
                                               font: isGlyphs ? Fonts.monoBold : Fonts.unbounded,
                                               size: isGlyphs ? 15 : 56,
                                               color: skin.foreground.withAlphaComponent(0.9),
                                               kern: isGlyphs ? 3 : 0)
        countdownLabel.alpha = 1
    }

    // MARK: - Haptics & finish

    /// The phone thumps with the kick through the drop — the first bars of
    /// the peak section, if the player has kick haptics on.
    private func scheduleKickHaptic(at kickTime: Double) {
        guard settings.kickHapticsOn, !reduceMotion else { return }
        let spb = track.secondsPerBeat
        guard kickTime >= plan.dropTime - 0.01, kickTime < plan.dropTime + spb * 8 else { return }
        let delay = kickTime - conductor.songTime
        guard delay > -0.05 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0, delay)) { [weak self] in
            guard let self, !self.paused_, !self.finished else { return }
            self.haptics.kick()
        }
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        scheduler?.stop()
        synth.stopAllVoices()
        conductor.pause()
        let result = judge.result(config: config)
        let callback = onFinish
        DispatchQueue.main.async { callback(result) }
    }

    /// Idempotent teardown: exit, finish and the view's onDisappear can race —
    /// the scheduler stop / voice flush / conductor pause must run exactly once.
    func abort() {
        guard !finished else { return }
        finished = true
        scheduler?.stop()
        synth.stopAllVoices()
        conductor.pause()
    }

    /// Abort the run from the paused overlay and hand control back to set select.
    private func exitRun() {
        guard !finished else { return }
        abort()
        pausedOverlay?.removeFromParent()
        pausedOverlay = nil
        paused_ = false
        let callback = onExit
        DispatchQueue.main.async { callback() }
    }
}
