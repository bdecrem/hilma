import SwiftUI

// Deep Dive — the minigame at Peck's level-15 rest stop (and 35, 55, …; see
// PeckMilestone.restGame). The dodo in a bubble helmet dives into Jelly
// Lagoon: hold to sink, let go to float. Pearls are +3, gummy jellyfish cost
// air and bounce you up, rising bubbles bump you, air pockets refill. The
// air runs out in 32 s of diving; the score is the deepest metre reached
// plus three per pearl. Ported 2026-10-02 from the web prototype
// (public/dodo/level15/deep-dive.html), whose numbers these are.
//
// Rules only. DeepDiveArt draws a frame, DeepDiveAudio makes the sound,
// DeepDiveView hosts it and talks to the board. World depth is in metres
// (z, down is positive); x is in screen points. The view tells the game its
// size; 14 m of water fit one screen height.

enum DDPhase { case title, dive, surfacing, done, end }
enum DDFace { case neutral, happy, wow, squint, sweat, sleepy }
enum DDSound: Hashable { case pearl(Int), bump, pop, air, sting, warn, exhale, surface, start }
enum DDHaptic { case pearl, sting, air, surface }

struct DDPearl { var x: CGFloat; var z: CGFloat; var r: CGFloat; var ph: CGFloat; var big = false }
struct DDJelly {
    var x0: CGFloat; var z: CGFloat; var r: CGFloat; var amp: CGFloat; var w: CGFloat
    var ph: CGFloat; var vz: CGFloat; var col: Int; var pulse: CGFloat; var x: CGFloat = 0
}
struct DDBubble { var x: CGFloat; var z: CGFloat; var r: CGFloat; var vz: CGFloat; var ph: CGFloat; var mine = false; var hit = false }
struct DDPocketBubble { var a: CGFloat; var d: CGFloat; var r: CGFloat; var ph: CGFloat }
struct DDPocket { var x: CGFloat; var z: CGFloat; var r: CGFloat; var bubs: [DDPocketBubble]; var ph: CGFloat; var taken: CGFloat = 0 }
struct DDKelp { var x: CGFloat; var z: CGFloat; var h: CGFloat; var ph: CGFloat; var col: UInt32 }
struct DDSpeck { var x: CGFloat; var z: CGFloat; var r: CGFloat; var tw: CGFloat; var hue: UInt32 }
struct DDSpark { var x: CGFloat; var z: CGFloat; var vx: CGFloat; var vz: CGFloat; var t: CGFloat = 0; var life: CGFloat; var col: UInt32 }
struct DDText { var x: CGFloat; var z: CGFloat; var s: String; var t: CGFloat = 0; var col: UInt32 }
struct DDLily { var x: CGFloat; var r: CGFloat; var ph: CGFloat }
struct DDLantern { var x: CGFloat; var hue: UInt32; var ph: CGFloat }
struct DDStar { var x: CGFloat; var y: CGFloat; var tw: CGFloat }

private func ddRnd(_ a: CGFloat, _ b: CGFloat) -> CGFloat { CGFloat.random(in: min(a, b)...max(a, b)) }
private func ddClamp(_ v: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat { max(a, min(b, v)) }

/// A plain class on purpose (like PeckGame): the Canvas closure mutates it
/// every frame, and an @Observable game re-invalidated the canvas on each
/// write — ~1,400 redraws a second and a frozen UI (2026-10-02). The view
/// keeps its own @State for what SwiftUI must react to, fed by `onPhase`.
final class DeepDiveGame {
    static let bestKey = "deepDiveBest"
    static let tau = CGFloat.pi * 2
    /// Gummy jellyfish colourways: grape, pink, cherry, mint (light, base, deep).
    static let jellyCols: [(UInt32, UInt32, UInt32)] = [
        (0xEFE2FF, 0xA77BF2, 0x6A3FC4), (0xFFE0EF, 0xFF9FC8, 0xE9649D),
        (0xFF9A96, 0xFF2B36, 0xBF0D1C), (0xE2FFF4, 0x91E9CC, 0x4DC5A2),
    ]

    // Screen, in points — set by the view every frame.
    var W: CGFloat = 390
    var H: CGFloat = 844
    var safeTop: CGFloat = 0
    var safeBottom: CGFloat = 0
    /// Points per metre: 14 m of water per screen height.
    var ppm: CGFloat { H / 14 }
    /// UI scale for text and the collider (1 at 390 wide, capped).
    var ui: CGFloat { min(W, 430) / 390 }

    private(set) var phase: DDPhase = .title {
        didSet { if phase != oldValue { onPhase?(phase) } }
    }
    var time: CGFloat = 0
    var air: CGFloat = 100
    var pearlCount = 0
    var maxDepth: CGFloat = 0
    var score = 0
    var camZ: CGFloat = -2.2
    var held = false
    var targetX: CGFloat = 195
    var genZ: CGFloat = 0
    var warnT: CGFloat = 0
    var surfaceT: CGFloat = 0
    var combo = 0
    var comboT: CGFloat = 0
    var startT: CGFloat = 0
    /// This device's best score (UserDefaults); the board keeps the real one.
    var best: Int = UserDefaults.standard.integer(forKey: DeepDiveGame.bestKey)
    var endNote = ""
    var endDepth = 0

    // The dodo. z is the feet; the collider sits 0.55 m above them.
    var x: CGFloat = 195
    var z: CGFloat = 0.6
    var vx: CGFloat = 0
    var vz: CGFloat = 0
    var face: DDFace = .neutral
    var faceT: CGFloat = 0
    var blink: CGFloat = 0
    var blinkT: CGFloat = 2
    var inv: CGFloat = 0
    var exhaleT: CGFloat = 0
    var tilt: CGFloat = 0

    var pearls: [DDPearl] = []
    var jellies: [DDJelly] = []
    var bubbles: [DDBubble] = []
    var pockets: [DDPocket] = []
    var kelp: [DDKelp] = []
    var specks: [DDSpeck] = []
    var sparks: [DDSpark] = []
    var texts: [DDText] = []
    var lilies: [DDLily] = []
    var lanterns: [DDLantern] = []
    var stars: [DDStar] = []

    var muted = false

    // Hooks out.
    var onPhase: ((DDPhase) -> Void)?
    var onSound: ((DDSound) -> Void)?
    var onHaptic: ((DDHaptic) -> Void)?
    var onDepth: ((CGFloat) -> Void)?
    var onFinish: ((Int) -> Void)?
    var onClose: (() -> Void)?

    private var lastDate: Date?

    init() {
        newWorld()
    }

    // MARK: world

    /// World depth → screen y.
    func screenY(_ z: CGFloat) -> CGFloat { (z - camZ) * ppm }

    func newWorld() {
        pearls = []; jellies = []; bubbles = []; pockets = []; kelp = []; sparks = []; texts = []
        genZ = 2
        let hues: [UInt32] = [0x91E9CC, 0xDCF6FF, 0xC4A4FF, 0xFFF8C8]
        specks = (0..<110).map { _ in
            DDSpeck(x: ddRnd(0, 1), z: ddRnd(0, 16), r: ddRnd(0.6, 1.6), tw: ddRnd(0, Self.tau), hue: hues.randomElement()!)
        }
        lilies = (0..<5).map { i in DDLily(x: (0.1 + CGFloat(i) * 0.2 + ddRnd(-0.04, 0.04)) * W, r: ddRnd(22, 40), ph: ddRnd(0, Self.tau)) }
        let lhues: [UInt32] = [0xFFD43A, 0xFFAA82, 0xFF9FC8, 0xFFD43A]
        lanterns = (0..<4).map { i in DDLantern(x: (0.18 + CGFloat(i) * 0.22 + ddRnd(-0.05, 0.05)) * W, hue: lhues[i], ph: ddRnd(0, Self.tau)) }
        stars = (0..<40).map { _ in DDStar(x: ddRnd(0, 1), y: ddRnd(0, 1), tw: ddRnd(0, Self.tau)) }
        while genZ < 20 { genChunk() }
    }

    /// Populate world depths [genZ, genZ + 6).
    private func genChunk() {
        let z0 = genZ, z1 = z0 + 6, deep = z0 / 60
        let nP = 2 + Int.random(in: 0..<2)
        for _ in 0..<nP {
            let kind = ddRnd(0, 1), px = ddRnd(40, W - 40), pz = ddRnd(z0, z1)
            if kind < 0.45 {
                for k in 0..<4 {
                    pearls.append(DDPearl(x: ddClamp(px + (CGFloat(k) - 1.5) * 26, 20, W - 20), z: pz + sin(CGFloat(k) * 1.1) * 0.25, r: 8.5, ph: ddRnd(0, Self.tau)))
                }
            } else if kind < 0.75 {
                for k in 0..<4 { pearls.append(DDPearl(x: px, z: pz + CGFloat(k) * 0.42, r: 8.5, ph: ddRnd(0, Self.tau))) }
            } else {
                pearls.append(DDPearl(x: px, z: pz, r: 11, ph: ddRnd(0, Self.tau), big: true))
            }
        }
        let nJ = 1 + Int(z0 / 32) + (ddRnd(0, 1) < deep * 0.6 ? 1 : 0)
        for _ in 0..<nJ {
            let r = ddRnd(16, 26) + deep * 8
            jellies.append(DDJelly(x0: ddRnd(40, W - 40), z: ddRnd(z0 + 0.5, z1), r: r, amp: ddRnd(30, 90) + deep * 50, w: ddRnd(0.5, 0.9) + deep * 0.3,
                                   ph: ddRnd(0, Self.tau), vz: ddRnd(-0.25, 0.12), col: Int.random(in: 0..<Self.jellyCols.count), pulse: ddRnd(0, Self.tau)))
        }
        if Int(z1 / 11) > Int(z0 / 11) || (z0 > 50 && ddRnd(0, 1) < 0.25) {
            let bubs = (0..<9).map { _ in DDPocketBubble(a: ddRnd(0, Self.tau), d: ddRnd(0.2, 1), r: ddRnd(4, 9), ph: ddRnd(0, Self.tau)) }
            pockets.append(DDPocket(x: ddRnd(60, W - 60), z: ddRnd(z0 + 1, z1 - 1), r: 34 * ui, bubs: bubs, ph: ddRnd(0, Self.tau)))
        }
        for _ in 0..<2 {
            kelp.append(DDKelp(x: ddRnd(0, 1) < 0.5 ? ddRnd(8, 44) : W - ddRnd(8, 44), z: ddRnd(z0, z1), h: ddRnd(1.6, 3.4), ph: ddRnd(0, Self.tau),
                               col: ddRnd(0, 1) < 0.5 ? 0x4DC5A2 : 0xA77BF2))
        }
        genZ = z1
    }

    // MARK: control

    func start() {
        phase = .dive; air = 100; pearlCount = 0; maxDepth = 0; score = 0; camZ = -2.2; held = false
        warnT = 0; surfaceT = 0; combo = 0; comboT = 0; startT = time
        x = W / 2; z = 0.7; vx = 0; vz = 0; inv = 0; tilt = 0
        setFace(.happy, 1.5)
        newWorld()
        onSound?(.start)
    }

    func press(x px: CGFloat?) {
        guard phase == .dive else { return }
        held = true
        if let px { targetX = ddClamp(px, 28, W - 28) }
    }

    func move(x px: CGFloat) {
        guard held else { return }
        targetX = ddClamp(px, 28, W - 28)
    }

    func release() { held = false }

    private func setFace(_ f: DDFace, _ t: CGFloat) { face = f; faceT = t }

    private func finish() {
        phase = .end
        let depth = Int(maxDepth)
        endDepth = depth
        if score > best {
            best = score
            UserDefaults.standard.set(score, forKey: Self.bestKey)
            endNote = "A new best. The lagoon keeps the pearls."
        } else {
            endNote = depth >= 60 ? "Down where the plants glow." : depth >= 30 ? "Past the caustics, into the dark." : "The shallows. Deeper next time?"
        }
        onHaptic?(.surface)
        onFinish?(score)
    }

    // MARK: simulation

    func advance(to date: Date) {
        defer { lastDate = date }
        guard let last = lastDate else { return }
        let dt = CGFloat(min(0.05, max(0, date.timeIntervalSince(last))))
        update(dt)
    }

    private func update(_ dt: CGFloat) {
        time += dt
        blinkT -= dt
        if blinkT < 0 { blinkT = ddRnd(2, 5); blink = 1 }
        blink = max(0, blink - dt * 7)
        if faceT > 0 { faceT -= dt; if faceT <= 0 { face = .neutral } }
        inv = max(0, inv - dt)
        comboT = max(0, comboT - dt)
        if comboT == 0 { combo = 0 }
        let viewM = H / ppm

        switch phase {
        case .dive:
            // Buoyancy; hold to sink.
            vz += (held ? 3.4 : -2.8) * dt
            vz -= vz * abs(vz) * 0.14 * dt
            vz = ddClamp(vz, -2.7, 3.1)
            if held { vx += ((targetX - x) * 9 - vx * 5) * dt } else { vx -= vx * 1.8 * dt }
            vx = ddClamp(vx, -420, 420)
            x = ddClamp(x + vx * dt, 28, W - 28)
            z += vz * dt
            if z < 0.55 { z = 0.55; if vz < 0 { vz = 0 } }
            maxDepth = max(maxDepth, z)
            score = Int(maxDepth) + pearlCount * 3
            air -= dt * 100 / 32
            if air < 25 {
                warnT -= dt
                if warnT <= 0 {
                    warnT = 1.1
                    onSound?(.warn)
                    if face == .neutral { setFace(.sweat, 0.9) }
                }
            }
            if air <= 0 {
                air = 0; phase = .surfacing; surfaceT = 0; held = false
                setFace(.sleepy, 99)
                onSound?(.surface)
                for _ in 0..<16 {
                    bubbles.append(DDBubble(x: x + ddRnd(-20, 20), z: z + ddRnd(0, 0.6), r: ddRnd(3, 8), vz: -ddRnd(1, 2), ph: ddRnd(0, Self.tau), mine: true))
                }
            }
            exhaleT -= dt
            if exhaleT <= 0 {
                exhaleT = held ? 0.7 : 1.1
                onSound?(.exhale)
                for _ in 0..<2 {
                    bubbles.append(DDBubble(x: x + ddRnd(-8, 8), z: z - 0.9, r: ddRnd(2.5, 4.5), vz: -ddRnd(0.9, 1.4), ph: ddRnd(0, Self.tau), mine: true))
                }
            }
            onDepth?(ddClamp(z / 70, 0, 1))
            // Ambient bubbles rising from below.
            if ddRnd(0, 1) < dt * 1.6 {
                bubbles.append(DDBubble(x: ddRnd(10, W - 10), z: camZ + viewM + 0.5, r: ddRnd(5, 13), vz: -ddRnd(0.7, 1.4), ph: ddRnd(0, Self.tau)))
            }
        case .surfacing:
            surfaceT += dt
            vz = -max(10, maxDepth / 2.4)
            z += vz * dt
            vx -= vx * 2 * dt
            x += vx * dt
            if ddRnd(0, 1) < dt * 30 {
                bubbles.append(DDBubble(x: x + ddRnd(-24, 24), z: z + ddRnd(0.2, 1.2), r: ddRnd(3, 9), vz: -ddRnd(0.5, 1.5), ph: ddRnd(0, Self.tau), mine: true))
            }
            if z <= 0.6 {
                z = 0.6; vz = 0
                if surfaceT > 0 { phase = .done; surfaceT = 0 }
            }
        case .done:
            surfaceT += dt
            if surfaceT > 0.7 { finish() }
        case .title, .end:
            break
        }

        // Camera.
        let camTarget = (phase == .surfacing || phase == .done || phase == .end)
            ? max(-2.2, z - 0.5 * viewM) : max(-2.2, z - 0.36 * viewM)
        camZ += (camTarget - camZ) * (1 - exp(-dt * (phase == .surfacing ? 9 : 4)))
        while genZ < camZ + viewM + 8 { genChunk() }
        tilt += (ddClamp(vx * 0.0009, -0.35, 0.35) - tilt) * (1 - exp(-dt * 6))

        // Objects.
        for i in jellies.indices {
            jellies[i].z += jellies[i].vz * dt
            jellies[i].x = jellies[i].x0 + sin(time * jellies[i].w + jellies[i].ph) * jellies[i].amp
            jellies[i].pulse += dt * 2.2
        }
        for i in bubbles.indices {
            bubbles[i].z += bubbles[i].vz * dt
            bubbles[i].x += sin(time * 2.5 + bubbles[i].ph) * 14 * dt
        }
        bubbles.removeAll { $0.z <= 0.05 || $0.z <= camZ - 1 }
        for i in sparks.indices {
            sparks[i].t += dt; sparks[i].x += sparks[i].vx * dt; sparks[i].z += sparks[i].vz * dt; sparks[i].vz += 0.6 * dt
        }
        sparks.removeAll { $0.t >= $0.life }
        for i in texts.indices { texts[i].t += dt }
        texts.removeAll { $0.t >= 1 }
        let cull = camZ - 3
        pearls.removeAll { $0.z <= cull }
        jellies.removeAll { $0.z <= cull }
        pockets.removeAll { $0.z <= cull || $0.taken >= 1 }
        kelp.removeAll { $0.z + $0.h <= cull }
        for i in pockets.indices where pockets[i].taken > 0 { pockets[i].taken += dt * 2 }

        guard phase == .dive else { return }
        collide()
    }

    /// The dodo's collider: centre 0.55 m above the feet, radius ~30 pt.
    private func collide() {
        let cx = x, cz = z - 0.55, R = 30 * ui
        pearls.removeAll { p in
            guard hypot(p.x - cx, (p.z - cz) * ppm) < R + p.r else { return false }
            pearlCount += 1; combo += 1; comboT = 2.2
            onSound?(.pearl(combo - 1)); onHaptic?(.pearl)
            setFace(.wow, 0.45)
            for i in 0..<7 {
                sparks.append(DDSpark(x: p.x, z: p.z, vx: ddRnd(-90, 90), vz: ddRnd(-1.6, -0.4), life: ddRnd(0.4, 0.7), col: i % 2 == 1 ? 0xFFF8C8 : 0xFF9FC8))
            }
            texts.append(DDText(x: p.x, z: p.z - 0.3, s: "+3", col: 0xFFF8C8))
            return true
        }
        if inv <= 0 {
            for i in jellies.indices {
                let j = jellies[i]
                let dx = j.x - cx, dz = (j.z - cz) * ppm
                let hitDome = hypot(dx, dz) < R + j.r * 0.85
                let hitTent = abs(dx) < j.r * 0.6 && dz < 0 && dz > -j.r * 1.9
                if hitDome || hitTent {
                    inv = 1.3; air = max(0, air - 11); vz = -2.4; vx = (cx < j.x ? -1 : 1) * 260
                    setFace(.squint, 0.7)
                    onSound?(.sting); onHaptic?(.sting)
                    combo = 0
                    texts.append(DDText(x: cx, z: cz - 0.6, s: "ouch", col: 0xFF9FC8))
                    jellies[i].pulse = 0
                    break
                }
            }
        }
        for i in bubbles.indices where !bubbles[i].mine && !bubbles[i].hit {
            let b = bubbles[i]
            if hypot(b.x - cx, (b.z - cz) * ppm) < R + b.r {
                bubbles[i].hit = true; bubbles[i].z = -5
                vz = min(vz, -1.5)
                onSound?(.bump)
                for _ in 0..<4 { sparks.append(DDSpark(x: b.x, z: b.z, vx: ddRnd(-60, 60), vz: ddRnd(-1, -0.3), life: 0.35, col: 0xDCF6FF)) }
            }
        }
        for i in pockets.indices where pockets[i].taken == 0 {
            let p = pockets[i]
            if hypot(p.x - cx, (p.z - cz) * ppm) < R + p.r * 0.8 {
                pockets[i].taken = 0.001
                air = min(100, air + 40)
                onSound?(.air); onHaptic?(.air)
                setFace(.happy, 1.2)
                texts.append(DDText(x: p.x, z: p.z - 0.7, s: "breathe", col: 0xCFFFEF))
                for _ in 0..<9 {
                    bubbles.append(DDBubble(x: p.x + ddRnd(-30, 30), z: p.z + ddRnd(-0.3, 0.3), r: ddRnd(3, 7), vz: -ddRnd(1, 2), ph: ddRnd(0, Self.tau), mine: true))
                }
            }
        }
    }

    // MARK: headless hooks

    /// Jump the dive to `depth` metres (screenshots of the deep look).
    func warp(to depth: CGFloat) {
        guard phase == .dive else { return }
        z = depth
        camZ = max(-2.2, depth - 0.36 * H / ppm)
        maxDepth = max(maxDepth, depth)
        while genZ < depth + 20 { genChunk() }
    }

    /// Run the air down so the surfacing and the end card follow.
    func drainAir() {
        guard phase == .dive else { return }
        air = min(air, 4)
    }
}
