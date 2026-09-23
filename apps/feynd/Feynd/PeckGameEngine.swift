import SwiftUI

// Peck or Perish — the minigame at Peck's rest stops (levels 5, 15, 25, …).
// Rats, pigs and monkeys off the Dutch ships run at the dodo's one egg; tap
// them before they reach it. Every bite raises P(extinct); at 100% the dodo
// goes extinct and the score is that year (history says 1662).
//
// This file is the rules only. PeckGameArt draws a frame, PeckGameAudio makes
// the sound, PeckGameView hosts it and talks to the board. The numbers were
// tuned with a bot on the web prototype: a casual player dies around 1670, a
// sharp one around 1700.

enum PG {
    /// The game is always laid out on this logical canvas and scaled to fit.
    static let size = CGSize(width: 400, height: 720)
    static let horizon: CGFloat = 214
    static let shore: CGFloat = 262
    static let meadow: CGFloat = 294
    static let egg = CGPoint(x: 200, y: 590)
    static let home = CGPoint(x: 200, y: 598)
    static let dodoScale: CGFloat = 1.12
    static let burrows: [CGPoint] = [
        CGPoint(x: 64, y: 336), CGPoint(x: 200, y: 322), CGPoint(x: 336, y: 336),
        CGPoint(x: 42, y: 472), CGPoint(x: 358, y: 472), CGPoint(x: 80, y: 642), CGPoint(x: 320, y: 648),
    ]
    static let crowns: [CGPoint] = [CGPoint(x: 46, y: 276), CGPoint(x: 354, y: 276)]
    static let firstYear = 1598
    static let historyYear = 1662
    /// On-canvas keys, bottom corners.
    static let muteKey = CGPoint(x: 28, y: 690)
    static let closeKey = CGPoint(x: 372, y: 690)
    /// Ribbon buttons (center y); both are 224 × 38.
    static let titleButtonY: CGFloat = 439
    static let overButtonY: CGFloat = 436
}

enum PGKind { case rat, pig, monkey, bunny, crate }
enum PGMode { case emerge, run, stun, flee, ko, leap, hop, fly }
enum PGPhase { case title, play, dying, over }
enum PGInkColor { case ink, paper, pink, mari, teal }
enum PGSound { case start, peck(Int), thud, chomp, oink, squeak, horn, boom, burst, crack, fanfare, whistle }
enum PGHaptic { case peck, bite, oops, extinct, history }

struct PGEnt {
    let id: Int
    let kind: PGKind
    var mode: PGMode
    var x: CGFloat
    var y: CGFloat
    var side: CGFloat = 1
    var dir: CGFloat = 1
    var t: Double = 0
    var et: Double = 0
    var clipY: CGFloat? = nil
    var hp = 1
    var r: CGFloat = 34
    var speed: CGFloat = 0
    var dmg: Double = 0
    var vx: CGFloat = 0
    var vy: CGFloat = 0
    var rot: Double = 0
    var vr: Double = 0
    var kx: CGFloat = 0
    var stunEnd: Double = 0
    var pts: [CGPoint] = []
    var hdur: Double = 0
    var air = false
    var bob: CGFloat = 0
    var sad = false
    var p0 = CGPoint.zero
    var p1 = CGPoint.zero
    var dur: Double = 0
    var sc: CGFloat = 1
    var dead = false
}

struct PGParticle {
    enum K { case bit, dust, chip, smoke }
    var k: K
    var x: CGFloat
    var y: CGFloat
    var vx: CGFloat
    var vy: CGFloat
    var life: Double
    var t: Double = 0
    var r: CGFloat = 3
    var color: PGInkColor = .pink
    var rot: Double = 0
    var vr: Double = 0
    var w: CGFloat = 8
    var h: CGFloat = 3
}

struct PGStamp {
    var text: String
    var sub: String? = nil
    var x: CGFloat
    var y: CGFloat
    var t: Double = 0
    var life: Double = 0.75
    var rot: Double
    var size: CGFloat = 24
    var color: PGInkColor = .pink
    var big = false
}

struct PGTrail { var a: CGPoint; var b: CGPoint; var t: Double = 0 }
struct PGCaption { var text: String; var t: Double = 0; var pri: Int; var life: Double = 1.9 }
struct PGShip { var x: CGFloat; var y: CGFloat; var t: Double = 0 }

struct PGDodo {
    var x: CGFloat = PG.home.x
    var y: CGFloat = PG.home.y
    var from = CGPoint.zero
    var to = CGPoint.zero
    var dash: Double = 1
    var peck: Double = 1
    var side: CGFloat = 1
    var idle: Double = 0
    var walk: Double = 0
    var walking = false
    var blinkT: Double = 2
    var blinkAt: Double = -9
    var blink: Double = 1
    var look: CGFloat = 0
}

/// The rest stop's board, as the server returns it.
struct PeckGameBoard: Decodable {
    let level: Int
    let best: Int?
    let plays: Int
    let board: [Row]
    let players: Int
    let newBest: Bool?

    struct Row: Decodable {
        let rank: Int
        let handle: String
        let year: Int
        let me: Bool
    }

    enum CodingKeys: String, CodingKey {
        case level, best, plays, board, players
        case newBest = "new_best"
    }
}

@inline(__always) func rnd(_ a: CGFloat, _ b: CGFloat) -> CGFloat { a + CGFloat.random(in: 0...1) * (b - a) }
@inline(__always) func rndD(_ a: Double, _ b: Double) -> Double { a + Double.random(in: 0...1) * (b - a) }
@inline(__always) func clampD(_ v: Double, _ a: Double, _ b: Double) -> Double { max(a, min(b, v)) }
@inline(__always) func clampG(_ v: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat { max(a, min(b, v)) }
func easeOut(_ u: Double) -> Double { let v = clampD(u, 0, 1); return 1 - pow(1 - v, 3) }
func easeOutBack(_ u: Double) -> Double {
    let v = clampD(u, 0, 1)
    let c = 1.70158
    let x = v - 1
    return 1 + (c + 1) * x * x * x + c * x * x
}

final class PeckGame {
    let level: Int
    var phase: PGPhase = .title
    var t: Double = 0
    var elapsed: Double = 0
    var P: Double = 8
    var ents: [PGEnt] = []
    var parts: [PGParticle] = []
    var stamps: [PGStamp] = []
    var trails: [PGTrail] = []
    var caption: PGCaption?
    var shake: CGFloat = 0
    var ship: PGShip?
    var kills: [PGKind: Int] = [:]
    var dyingT: Double = 0
    var overT: Double = 0
    var deathYear = PG.firstYear
    var meterFlash: Double = 0
    var eggShake: Double = 0
    var eggBroken = false
    var specimen: Double = 0
    var dodo = PGDodo()
    var muted = false
    var touching = false

    // The board (set by PeckGameView).
    var board: PeckGameBoard?
    var boardError: String?
    var boardPosting = false

    // Hooks out.
    var onSound: ((PGSound) -> Void)?
    var onHaptic: ((PGHaptic) -> Void)?
    var onMusic: ((Bool, Double) -> Void)?
    var onFinish: ((Int) -> Void)?
    var onClose: (() -> Void)?
    var onMute: ((Bool) -> Void)?

    // Debug: start later in the run, let a bot play.
    var skipTo: Double = 0
    var autoplay = false
    private var botT: Double = 0

    private var spawnT: Double = 0.8
    private var bunnyT: Double = 9
    private var crateT: Double = 0
    private var combo = 0
    private var lastHit: Double = -9
    private var passed1662 = false
    private var firstSeen: Set<String> = []
    private var recent: [Int] = []
    private var nid = 0
    private var lastDate: Date?

    init(level: Int) { self.level = level }

    var year: Int {
        switch phase {
        case .title: return PG.firstYear
        case .play: return PG.firstYear + Int(elapsed)
        default: return deathYear
        }
    }

    // MARK: captions

    static let pecked: [PGKind: [String]] = [
        .rat: ["Back on the boat.", "Flightless, not helpless.", "Rat, returned to sender.", "Not today, rodent."],
        .pig: ["That pig had a plan.", "Go back to the ship, pig."],
        .monkey: ["Evolution did not prepare you for this.", "Tree privileges revoked."],
        .crate: ["Return to sender.", "Unopened. Unloved."],
    ]
    static let bitten: [PGKind: [String]] = [
        .rat: ["The rats brought friends.", "That was the egg.", "Somewhere, a naturalist sighs."],
        .pig: ["Pigs eat eggs. Look it up.", "The pig had a plan."],
        .monkey: ["Tiny hands, big appetite.", "Monkey business. Literally."],
    ]
    static let friend = ["That was a friend.", "Wrong animal.", "The bunny will remember this."]

    private func say(_ text: String, _ pri: Int) {
        if let c = caption, c.t < 0.9, c.pri > pri { return }
        caption = PGCaption(text: text, pri: pri)
    }

    private func stamp(_ text: String, _ x: CGFloat, _ y: CGFloat, color: PGInkColor = .pink, size: CGFloat = 24, life: Double = 0.75) {
        let s = PGStamp(text: text, x: clampG(x, 130, PG.size.width - 130), y: clampG(y, 130, PG.size.height - 60),
                        life: life, rot: rndD(-0.22, 0.22), size: size, color: color)
        stamps.append(s)
        if stamps.count > 9 { stamps.removeFirst() }
    }

    private func burst(_ x: CGFloat, _ y: CGFloat, _ n: Int) {
        let cols: [PGInkColor] = [.pink, .mari, .teal, .ink]
        for _ in 0..<n {
            let a = rnd(0, .pi * 2)
            let s = rnd(90, 260)
            parts.append(PGParticle(k: .bit, x: x, y: y, vx: cos(a) * s, vy: sin(a) * s - 120,
                                    life: rndD(0.4, 0.75), r: rnd(1.8, 4.4), color: cols.randomElement()!))
        }
    }

    private func dust(_ x: CGFloat, _ y: CGFloat) {
        for _ in 0..<6 {
            parts.append(PGParticle(k: .dust, x: x + rnd(-8, 8), y: y + rnd(-3, 3), vx: rnd(-40, 40), vy: rnd(-50, -10),
                                    life: rndD(0.35, 0.55), r: rnd(3, 6)))
        }
    }

    private func chips(_ x: CGFloat, _ y: CGFloat, _ n: Int) {
        for _ in 0..<n {
            let a = rnd(0, .pi * 2)
            let s = rnd(120, 300)
            parts.append(PGParticle(k: .chip, x: x, y: y, vx: cos(a) * s, vy: sin(a) * s - 160, life: rndD(0.5, 0.9),
                                    rot: rndD(0, 6), vr: rndD(-14, 14), w: rnd(6, 12), h: rnd(2.5, 4)))
        }
    }

    private func smoke(_ x: CGFloat, _ y: CGFloat) {
        for _ in 0..<5 {
            parts.append(PGParticle(k: .smoke, x: x + rnd(-6, 6), y: y + rnd(-4, 4), vx: rnd(-30, -5), vy: rnd(-20, -6),
                                    life: rndD(0.7, 1.1), r: rnd(4, 7)))
        }
    }

    // MARK: spawns

    private func nextID() -> Int { nid += 1; return nid }

    private func pickBurrow() -> CGPoint {
        let opts = (0..<PG.burrows.count).filter { !recent.contains($0) }
        let i = opts.randomElement() ?? 0
        recent.append(i)
        if recent.count > 2 { recent.removeFirst() }
        return PG.burrows[i]
    }

    private func spawnRat(_ p: CGPoint, emerge: Double, clipY: CGFloat?) {
        let side: CGFloat = p.x < PG.egg.x - 4 ? -1 : (p.x > PG.egg.x + 4 ? 1 : (Bool.random() ? -1 : 1))
        var e = PGEnt(id: nextID(), kind: .rat, mode: .emerge, x: p.x, y: p.y)
        e.side = side; e.dir = -side; e.et = emerge; e.clipY = clipY; e.r = 34; e.dmg = 9
        e.speed = (50 + CGFloat(elapsed) * 0.95) * rnd(0.9, 1.15)
        ents.append(e)
    }

    private func spawnPig() {
        let side: CGFloat = Bool.random() ? -1 : 1
        var e = PGEnt(id: nextID(), kind: .pig, mode: .run, x: side < 0 ? -40 : PG.size.width + 40, y: rnd(400, 660))
        e.side = side; e.dir = -side; e.hp = 2; e.r = 44; e.dmg = 15
        e.speed = (34 + CGFloat(elapsed) * 0.5) * rnd(0.9, 1.1)
        ents.append(e)
    }

    private func spawnMonkey() {
        let i = Bool.random() ? 0 : 1
        let c = PG.crowns[i]
        let side: CGFloat = i == 1 ? 1 : -1
        let tg = CGPoint(x: PG.egg.x + side * 34, y: PG.egg.y + 18)
        let a = CGPoint(x: c.x + (tg.x - c.x) * 0.36, y: c.y + (tg.y - c.y) * 0.36 + 50)
        let b = CGPoint(x: c.x + (tg.x - c.x) * 0.7, y: c.y + (tg.y - c.y) * 0.7 + 14)
        var e = PGEnt(id: nextID(), kind: .monkey, mode: .leap, x: c.x, y: c.y)
        e.side = side; e.dir = -side; e.pts = [c, a, b, tg]; e.r = 38; e.dmg = 11; e.air = true
        e.hdur = max(0.36, 0.56 - elapsed * 0.0025)
        ents.append(e)
    }

    private func spawnBunny() {
        let side: CGFloat = Bool.random() ? -1 : 1
        var e = PGEnt(id: nextID(), kind: .bunny, mode: .hop, x: side < 0 ? -30 : PG.size.width + 30, y: rnd(420, 670))
        e.dir = -side; e.r = 32; e.speed = rnd(62, 82)
        ents.append(e)
    }

    private func spawnCrate() {
        guard let ship else { return }
        let p0 = CGPoint(x: ship.x - 40, y: ship.y - 14)
        var e = PGEnt(id: nextID(), kind: .crate, mode: .fly, x: p0.x, y: p0.y)
        e.p0 = p0; e.p1 = CGPoint(x: rnd(90, 310), y: rnd(370, 540)); e.dur = 1.25; e.r = 42; e.sc = 0.4
        ents.append(e)
        smoke(p0.x - 4, p0.y)
        onSound?(.boom)
    }

    private func crateLand(_ i: Int) {
        ents[i].dead = true
        let p = ents[i].p1
        for _ in 0..<3 { spawnRat(CGPoint(x: p.x + rnd(-20, 20), y: p.y + rnd(-8, 10)), emerge: 0.14, clipY: nil) }
        chips(p.x, p.y, 9)
        onSound?(.burst)
        shake = max(shake, 4)
    }

    // MARK: rules

    func hittable(_ e: PGEnt) -> Bool {
        if e.dead { return false }
        if e.kind == .crate { return e.mode == .fly && e.t / e.dur > 0.45 }
        switch e.mode {
        case .run, .emerge, .stun, .leap, .hop: return true
        default: return false
        }
    }

    func hitPoint(_ e: PGEnt) -> CGPoint {
        switch e.kind {
        case .rat: return CGPoint(x: e.x + e.dir * 6, y: e.y - 10)
        case .pig: return CGPoint(x: e.x + e.dir * 8, y: e.y - 22)
        case .monkey: return CGPoint(x: e.x + e.dir * 2, y: e.y - 26)
        case .bunny: return CGPoint(x: e.x + e.dir * 4, y: e.y - 16 + e.bob)
        case .crate: return CGPoint(x: e.x, y: e.y)
        }
    }

    private func bite(_ i: Int) {
        guard phase == .play else { return }
        let e = ents[i]
        P += e.dmg
        meterFlash = 0.6
        eggShake = 0.45
        shake = max(shake, 6)
        onSound?(.chomp)
        onHaptic?(.bite)
        stamp("CHOMP", PG.egg.x + e.side * 22, PG.egg.y - 34, size: 26)
        say(Self.bitten[e.kind]?.randomElement() ?? "", 2)
        for _ in 0..<4 {
            parts.append(PGParticle(k: .bit, x: PG.egg.x + e.side * 14, y: PG.egg.y, vx: e.side * rnd(40, 160),
                                    vy: rnd(-220, -80), life: 0.6, r: rnd(1.8, 3), color: .teal))
        }
        ents[i].mode = .flee; ents[i].t = 0; ents[i].dir = e.side
        ents[i].vx = e.side * rnd(220, 280); ents[i].vy = rnd(-60, 40)
    }

    private func dodoStrike(_ tx: CGFloat, _ ty: CGFloat) {
        let side: CGFloat = tx >= dodo.x ? 1 : -1
        dodo.side = side
        let fx = clampG(tx - side * 30, 42, PG.size.width - 42)
        let fy = clampG(ty + 50, PG.meadow + 50, PG.size.height - 18)
        trails.append(PGTrail(a: CGPoint(x: dodo.x, y: dodo.y - 40), b: CGPoint(x: fx, y: fy - 40)))
        dodo.from = CGPoint(x: dodo.x, y: dodo.y)
        dodo.to = CGPoint(x: fx, y: fy)
        dodo.dash = 0; dodo.peck = 0; dodo.idle = 0
    }

    private func peck(_ i: Int, _ hp: CGPoint) {
        dodoStrike(hp.x, hp.y)
        let e = ents[i]
        if e.kind == .bunny {
            combo = 0; P += 10; meterFlash = 0.6
            onSound?(.squeak); onHaptic?(.oops)
            stamp("NO!", hp.x, hp.y - 34, size: 30)
            say(Self.friend.randomElement()!, 3)
            let d: CGFloat = e.x < PG.size.width / 2 ? -1 : 1
            ents[i].mode = .flee; ents[i].sad = true; ents[i].t = 0; ents[i].dir = d; ents[i].vx = d * 300; ents[i].vy = -20
            return
        }
        combo = (t - lastHit < 1.15) ? combo + 1 : 1
        lastHit = t
        onSound?(.peck(combo)); onHaptic?(.peck)
        if e.kind == .pig && e.hp > 1 {
            ents[i].hp -= 1; ents[i].mode = .stun; ents[i].t = 0; ents[i].stunEnd = 0.4; ents[i].kx = e.side * 260
            stamp("OINK", hp.x, hp.y - 36, size: 24)
            onSound?(.oink)
            burst(hp.x, hp.y, 5)
            return
        }
        if e.kind == .crate {
            ents[i].dead = true
            kills[.crate, default: 0] += 1
            P = max(0, P - 2)
            stamp("SMASH", hp.x, hp.y - 30, color: .mari, size: 26)
            chips(e.x, e.y, 12)
            onSound?(.burst)
            shake = max(shake, 3)
            if Bool.random() { say(Self.pecked[.crate]!.randomElement()!, 1) }
            return
        }
        kills[e.kind, default: 0] += 1
        ents[i].mode = .ko; ents[i].t = 0
        ents[i].vx = dodo.side * rnd(160, 260); ents[i].vy = rnd(-540, -420)
        ents[i].vr = Double(dodo.side) * rndD(8, 14); ents[i].rot = 0
        P = max(0, P - (0.6 + 0.15 * Double(min(combo - 1, 4))))
        let cols: [PGInkColor] = [.pink, .mari, .teal]
        stamp(combo >= 2 ? "PECK ×\(combo)" : "PECK!", hp.x, hp.y - 30, color: cols[combo % 3],
              size: 22 + CGFloat(min(combo, 6)) * 2.5)
        burst(hp.x, hp.y, 8)
        shake = max(shake, 2.5)
        if combo == 5 { say("Peck or perish.", 2) } else if Double.random(in: 0...1) < 0.3 { say(Self.pecked[e.kind]?.randomElement() ?? "", 1) }
    }

    private func missPeck(_ x: CGFloat, _ y: CGFloat) {
        dodoStrike(x, y)
        combo = 0
        dust(x, y)
        onSound?(.thud)
    }

    /// A touch landed at logical canvas coordinates.
    func tap(at p: CGPoint) {
        if hypot(p.x - PG.muteKey.x, p.y - PG.muteKey.y) < 22 {
            muted.toggle(); onMute?(muted); return
        }
        if hypot(p.x - PG.closeKey.x, p.y - PG.closeKey.y) < 22 {
            onClose?(); return
        }
        switch phase {
        case .title:
            start()
        case .over:
            if overT > 0.9, abs(p.x - 200) < 124, abs(p.y - PG.overButtonY) < 26 { start() }
        case .dying:
            break
        case .play:
            var best: Int? = nil
            var bd: CGFloat = .greatestFiniteMagnitude
            for (i, e) in ents.enumerated() where hittable(e) {
                let hp = hitPoint(e)
                let d = hypot(hp.x - p.x, hp.y - p.y) / e.r
                if d < 1 && d < bd { bd = d; best = i }
            }
            if let best { peck(best, hitPoint(ents[best])) } else { missPeck(p.x, p.y) }
        }
    }

    /// Space / Return on a keyboard.
    func keyStart() {
        if phase == .title || (phase == .over && overT > 0.9) { start() }
    }

    func start() {
        phase = .play
        elapsed = skipTo
        P = 8
        ents = []; parts = []; stamps = []; trails = []; caption = nil
        spawnT = 0.8; bunnyT = 9; ship = nil; crateT = 0; combo = 0; lastHit = -9
        kills = [:]; passed1662 = elapsed >= 65; dyingT = 0; overT = 0; eggShake = 0; eggBroken = false; specimen = 0
        firstSeen = []; recent = []; boardError = nil
        dodo = PGDodo()
        onSound?(.start)
        say("Mauritius, 1598. Guard the egg.", 3)
    }

    private func die() {
        phase = .dying; dyingT = 0; P = 100
        deathYear = PG.firstYear + Int(elapsed)
        onSound?(.whistle); onHaptic?(.extinct)
        shake = 9; caption = nil
        for i in ents.indices {
            if ents[i].kind == .crate { ents[i].dead = true; continue }
            if ents[i].mode == .ko || ents[i].mode == .flee { continue }
            let s: CGFloat = ents[i].x < PG.egg.x ? -1 : 1
            ents[i].mode = .flee; ents[i].t = 0; ents[i].dir = s; ents[i].vx = s * rnd(200, 300); ents[i].vy = rnd(-40, 40)
        }
        dodo.from = CGPoint(x: dodo.x, y: dodo.y); dodo.to = PG.home; dodo.dash = 0; dodo.peck = 1
        boardPosting = true
        onFinish?(deathYear)
    }

    // MARK: update

    func advance(to date: Date) {
        let dt = lastDate.map { min(0.05, max(0, date.timeIntervalSince($0))) } ?? 0
        lastDate = date
        if dt > 0 { update(dt) }
    }

    func update(_ dt: Double) {
        t += dt
        if phase == .play { updatePlay(dt) }
        if let s = ship {
            var sh = s
            sh.t += dt
            sh.x = 470 + (262 - 470) * CGFloat(easeOut(sh.t / 4))
            ship = sh
            if phase == .play {
                crateT -= dt
                if crateT <= 0 && sh.t > 4 {
                    spawnCrate()
                    crateT = max(1.5, 3.1 - (elapsed - 66) * 0.03)
                }
            }
        }
        updateEnts(dt)
        if phase == .play && P >= 100 { die() }
        if phase == .dying {
            dyingT += dt
            eggShake = eggBroken ? 0 : 0.6
            if !eggBroken && dyingT > 0.75 {
                eggBroken = true
                onSound?(.crack)
                shake = 7
                stamp("CRACK", PG.egg.x, PG.egg.y - 44, size: 36, life: 1)
                let cols: [PGInkColor] = [.teal, .paper, .ink]
                for _ in 0..<10 {
                    parts.append(PGParticle(k: .bit, x: PG.egg.x, y: PG.egg.y, vx: rnd(-200, 200), vy: rnd(-380, -120),
                                            life: rndD(0.6, 1), r: rnd(2, 4), color: cols.randomElement()!))
                }
            }
            specimen = clampD((dyingT - 0.6) / 0.8, 0, 1)
            if dyingT > 1.8 { phase = .over; overT = 0 }
        }
        if phase == .over { overT += dt }
        updateDodo(dt)
        updateEffects(dt)
        onMusic?(phase == .play, min(176, 112 + elapsed * 0.8))
    }

    private func updatePlay(_ dt: Double) {
        elapsed += dt
        let late = max(0, elapsed - 75)
        P += (0.1 + elapsed * 0.004 + late * late * 0.0025) * dt
        spawnT -= dt
        if spawnT <= 0 {
            let floor = max(0.24, 0.36 - max(0, elapsed - 80) * 0.004)
            spawnT = max(floor, 1.45 - 0.0135 * elapsed) * (ship != nil ? 1.15 : 1) * rndD(0.8, 1.2)
            let r = Double.random(in: 0...1)
            var kind: PGKind = .rat
            if elapsed >= 38 { kind = r < 0.5 ? .rat : (r < 0.72 ? .pig : .monkey) } else if elapsed >= 18 { kind = r < 0.72 ? .rat : .pig }
            switch kind {
            case .pig: spawnPig()
            case .monkey: spawnMonkey()
            default:
                let b = pickBurrow()
                spawnRat(b, emerge: 0.34, clipY: b.y + 2)
            }
            if kind == .pig && !firstSeen.contains("pig") { firstSeen.insert("pig"); say("Pigs. From the ship. They eat eggs.", 3) }
            if kind == .monkey && !firstSeen.contains("monkey") { firstSeen.insert("monkey"); say("Monkeys. In the palms. Obviously.", 3) }
        }
        bunnyT -= dt
        if bunnyT <= 0 && elapsed > 8 {
            spawnBunny()
            bunnyT = rndD(7, 11)
            if !firstSeen.contains("bunny") { firstSeen.insert("bunny"); say("A friend. Do not peck the friend.", 3) }
        }
        if ship == nil && elapsed >= 62 {
            ship = PGShip(x: 470, y: PG.horizon + 16)
            onSound?(.horn)
            say("A boat. Of course it's a boat.", 4)
            crateT = 4.4
        }
        if !passed1662 && elapsed >= 65 {
            passed1662 = true
            onSound?(.fanfare); onHaptic?(.history)
            stamps.append(PGStamp(text: "BEATING HISTORY", sub: "the last dodo was seen in 1662", x: 200, y: 400,
                                  life: 2.2, rot: -0.08, size: 30, color: .mari, big: true))
            say("History had you extinct by now.", 4)
        }
        #if targetEnvironment(simulator) || (targetEnvironment(macCatalyst) && DEBUG)
        if autoplay {
            botT -= dt
            if botT <= 0 {
                botT = 0.26
                let near = ents.filter { hittable($0) && $0.kind != .bunny && $0.t > 0.25 }
                    .min { hypot($0.x - PG.egg.x, $0.y - PG.egg.y) < hypot($1.x - PG.egg.x, $1.y - PG.egg.y) }
                if let near { tap(at: hitPoint(near)) }
            }
        }
        #endif
    }

    private func updateEnts(_ dt: Double) {
        let sdt = CGFloat(dt)
        var i = 0
        while i < ents.count {
            ents[i].t += dt
            let e = ents[i]
            let tg = CGPoint(x: PG.egg.x + e.side * (e.kind == .pig ? 46 : 34), y: PG.egg.y + 18)
            switch e.mode {
            case .emerge:
                if e.t >= e.et { ents[i].mode = .run; ents[i].t = 0 }
            case .run:
                let dx = tg.x - e.x, dy = tg.y - e.y
                let d = hypot(dx, dy)
                let step = e.speed * sdt
                if d <= step {
                    ents[i].x = tg.x; ents[i].y = tg.y; ents[i].dir = -e.side
                    bite(i)
                } else {
                    ents[i].x += dx / d * step; ents[i].y += dy / d * step
                    if abs(dx) > 2 { ents[i].dir = dx > 0 ? 1 : -1 }
                }
            case .stun:
                ents[i].x += e.kx * sdt
                ents[i].kx *= CGFloat(pow(0.02, dt))
                if e.t > e.stunEnd { ents[i].mode = .run }
            case .flee:
                ents[i].x += e.vx * sdt; ents[i].y += e.vy * sdt
                if e.x < -90 || e.x > PG.size.width + 90 || e.y > PG.size.height + 90 || e.y < -90 { ents[i].dead = true }
            case .ko:
                ents[i].vy += 1400 * sdt
                ents[i].x += e.vx * sdt; ents[i].y += ents[i].vy * sdt
                ents[i].rot += e.vr * dt
                if e.y > PG.size.height + 140 { ents[i].dead = true }
            case .leap:
                let ht = e.hdur + 0.2
                let k = Int(e.t / ht)
                if k >= 3 {
                    ents[i].x = e.pts[3].x; ents[i].y = e.pts[3].y; ents[i].air = false; ents[i].dir = -e.side
                    bite(i)
                } else {
                    let u = (e.t - Double(k) * ht) / e.hdur
                    let a = e.pts[k], b = e.pts[k + 1]
                    if u <= 1 {
                        let arc: CGFloat = k == 0 ? 40 : 46
                        ents[i].x = a.x + (b.x - a.x) * CGFloat(u)
                        ents[i].y = a.y + (b.y - a.y) * CGFloat(u) - CGFloat(sin(u * .pi)) * arc
                        ents[i].air = true
                    } else {
                        ents[i].x = b.x; ents[i].y = b.y; ents[i].air = false
                    }
                }
            case .hop:
                ents[i].x += e.dir * e.speed * sdt
                ents[i].bob = -abs(CGFloat(sin(e.t * 7))) * 16
                if e.x < -50 || e.x > PG.size.width + 50 { ents[i].dead = true }
            case .fly:
                let u = min(1, e.t / e.dur)
                ents[i].x = e.p0.x + (e.p1.x - e.p0.x) * CGFloat(u)
                ents[i].y = e.p0.y + (e.p1.y - e.p0.y) * CGFloat(u) - CGFloat(sin(u * .pi)) * 170
                ents[i].sc = 0.4 + 0.6 * CGFloat(u)
                ents[i].rot += dt * 4
                if u >= 1 { crateLand(i) }
            }
            i += 1
        }
        ents.removeAll { $0.dead }
    }

    private func updateDodo(_ dt: Double) {
        if dodo.dash < 1 {
            dodo.dash = min(1, dodo.dash + dt / (phase == .dying ? 0.3 : 0.07))
            let u = CGFloat(easeOut(dodo.dash))
            dodo.x = dodo.from.x + (dodo.to.x - dodo.from.x) * u
            dodo.y = dodo.from.y + (dodo.to.y - dodo.from.y) * u
        }
        if dodo.peck < 1 { dodo.peck = min(1, dodo.peck + dt / 0.22) }
        dodo.idle += dt
        dodo.walking = false
        if phase == .play && dodo.idle > 0.75 && dodo.dash >= 1 {
            let dx = PG.home.x - dodo.x, dy = PG.home.y - dodo.y
            let d = hypot(dx, dy)
            if d > 2 {
                let sp = min(d, 260 * CGFloat(dt))
                dodo.x += dx / d * sp; dodo.y += dy / d * sp
                dodo.walk += dt * 14
                dodo.walking = true
            } else {
                dodo.x = PG.home.x; dodo.y = PG.home.y
            }
        }
        dodo.blinkT -= dt
        if dodo.blinkT < 0 { dodo.blinkT = 2.4 + Double.random(in: 0...2.6); dodo.blinkAt = t }
        let bu = (t - dodo.blinkAt) / 0.14
        dodo.blink = bu > 0 && bu < 1 ? 1 - 0.95 * sin(bu * .pi) : 1
        var target: CGFloat = 0
        var nd: CGFloat = .greatestFiniteMagnitude
        for e in ents where hittable(e) && e.kind != .bunny {
            let d = hypot(e.x - dodo.x, e.y - dodo.y)
            if d < nd { nd = d; target = clampG((e.x - dodo.x) / 40, -1.8, 1.8) }
        }
        dodo.look += (target - dodo.look) * CGFloat(min(1, dt * 10))
    }

    private func updateEffects(_ dt: Double) {
        let sdt = CGFloat(dt)
        for i in parts.indices {
            parts[i].t += dt
            let g: CGFloat = parts[i].k == .smoke ? -20 : (parts[i].k == .dust ? 0 : 900)
            parts[i].vy += g * sdt
            parts[i].x += parts[i].vx * sdt
            parts[i].y += parts[i].vy * sdt
            parts[i].rot += parts[i].vr * dt
        }
        parts.removeAll { $0.t >= $0.life }
        for i in stamps.indices { stamps[i].t += dt }
        stamps.removeAll { $0.t >= $0.life }
        for i in trails.indices { trails[i].t += dt }
        trails.removeAll { $0.t >= 0.16 }
        if var c = caption { c.t += dt; caption = c.t > c.life ? nil : c }
        shake *= CGFloat(pow(0.004, dt))
        if shake < 0.3 { shake = 0 }
        if eggShake > 0 && phase == .play { eggShake = max(0, eggShake - dt) }
        if meterFlash > 0 { meterFlash -= dt }
    }
}
