import Foundation
import CoreGraphics

/// Token Surfers rules: three lanes, trains to dodge, barriers to jump or roll
/// under, coins to grab. The agent feeds it: streamed tokens become coin
/// trails, tool calls become trains wearing the tool's name, bugs found by
/// run_app crawl onto the track (stomp them), a finished build rains confetti.
///
/// Plain class (not @Observable): the view pulls state every frame.
final class SurfEngine {
    enum Kind { case coin, train, barrier, highBarrier, bug }

    struct Entity {
        var kind: Kind
        var lane: Int
        var z: Double            // distance ahead of the player (world units)
        var length: Double = 0.4
        var label: String = ""
        var color: Int = 0
        var y: Double = 0.55     // coins float; raised ones sit over barriers
        var speed: Double = 0    // trains may come toward you
        var dead = false
        var phase: Double = 0
        var token = false        // coin born from a streamed token
    }

    struct Particle { var x, y, vx, vy, life, hue, spin: Double }

    static let laneWidth = 1.25
    static let viewDepth = 92.0

    // Player
    private(set) var lane = 0
    private(set) var x = 0.0
    private(set) var y = 0.0
    private var vy = 0.0
    private(set) var rolling = 0.0
    private(set) var stumble = 0.0
    private(set) var invulnerable = 0.0
    private(set) var runPhase = 0.0

    // World
    private(set) var entities: [Entity] = []
    private(set) var distance = 0.0
    private(set) var speed = 11.0
    private var baseSpeed = 11.0
    private var nextRowAt = 26.0
    private var rng = SeededRandom(seed: UInt64(Date().timeIntervalSince1970))
    private(set) var confetti: [Particle] = []
    private(set) var time = 0.0

    // Score
    private(set) var score = 0
    private(set) var coins = 0
    private(set) var streak = 0
    private(set) var crashes = 0
    private(set) var stomps = 0
    var multiplier: Int { 1 + min(4, streak / 20) }

    // Agent feed
    private var tokenBank = 0.0
    private var tokenFlow = 0.0          // smoothed tokens/s, drives a speed boost
    private var pendingTrains: [String] = []
    private var pendingBugs = 0
    private(set) var lastEvent: (text: String, at: Double)?

    var paused = false
    var onCrash: (() -> Void)?
    var onSound: ((SurfSound) -> Void)?

    // MARK: input

    func left() { guard stumble <= 0 else { return }; if lane > -1 { lane -= 1; onSound?(.swipe) } }
    func right() { guard stumble <= 0 else { return }; if lane < 1 { lane += 1; onSound?(.swipe) } }
    func jump() {
        guard y <= 0.001, stumble <= 0 else { return }
        vy = 7.6
        rolling = 0
        onSound?(.jump)
    }
    func roll() {
        guard stumble <= 0 else { return }
        if y > 0.001 { vy = -14 }     // slam down
        rolling = 0.62
        onSound?(.roll)
    }

    // MARK: agent feed

    func feedTokens(_ n: Double) {
        tokenBank += n
        tokenFlow += n
    }

    func toolTrain(_ name: String) { pendingTrains.append(name) }

    func bugs(_ n: Int) {
        pendingBugs += min(n, 8)
        if n > 0 { lastEvent = ("\(n) BUG\(n == 1 ? "" : "S") ON THE TRACK", time) }
    }

    func celebrate() {
        for _ in 0..<90 {
            confetti.append(Particle(x: rng.unit(), y: -0.05 - rng.unit() * 0.3,
                                     vx: (rng.unit() - 0.5) * 0.25, vy: 0.25 + rng.unit() * 0.35,
                                     life: 2.6 + rng.unit(), hue: rng.unit(), spin: rng.unit() * 6))
        }
        streak += 20
        lastEvent = ("SHIPPED  +\(multiplier)x", time)
        onSound?(.celebrate)
    }

    // MARK: tick

    func step(_ rawDt: Double) {
        guard !paused else { return }
        let dt = min(rawDt, 1.0 / 20)
        time += dt

        // Speed: ramps with distance, surges while tokens are streaming.
        tokenFlow *= exp(-dt * 1.5)
        baseSpeed = min(19, 11 + distance / 900)
        let target = baseSpeed + min(4, tokenFlow / 60)
        speed += (target - speed) * min(1, dt * 2)
        let v = stumble > 0 ? speed * 0.35 : speed
        distance += v * dt
        runPhase += dt * v * 0.9
        score += Int((v * dt * 1.2).rounded())

        // Player motion
        let targetX = Double(lane) * Self.laneWidth
        x += (targetX - x) * min(1, dt * 16)
        if y > 0 || vy > 0 {
            vy -= 26 * dt
            y += vy * dt
            if y <= 0 { y = 0; vy = 0; onSound?(.land) }
        }
        rolling = max(0, rolling - dt)
        stumble = max(0, stumble - dt)
        invulnerable = max(0, invulnerable - dt)

        // Move the world
        for i in entities.indices {
            entities[i].z -= (v + entities[i].speed) * dt
            entities[i].phase += dt
        }
        nextRowAt -= v * dt
        entities.removeAll { $0.z + $0.length < -3 || $0.dead }

        spawn()
        collide()
        stepConfetti(dt)
    }

    // MARK: spawning

    private func occupied(_ lane: Int, _ z0: Double, _ z1: Double) -> Bool {
        entities.contains { e in
            e.lane == lane && e.kind != .coin && e.z < z1 && e.z + e.length + e.speed * 2 > z0
        }
    }

    private func spawn() {
        let far = Self.viewDepth - 6

        // Tool trains get priority: a lane that is clear far ahead.
        if !pendingTrains.isEmpty {
            let lanes = [-1, 0, 1].shuffled(using: &rng)
            if let l = lanes.first(where: { !occupied($0, far - 12, far + 12) && trainLeavesExit(lane: $0, z: far) }) {
                let label = pendingTrains.removeFirst()
                entities.append(Entity(kind: .train, lane: l, z: far, length: 9, label: label,
                                       color: rng.int(4), y: 0))
            }
        }

        // Token coins: a trail in a clear lane, one coin per ~7 tokens.
        if tokenBank >= 7 {
            let n = min(Int(tokenBank / 7), 10)
            let lanes = [-1, 0, 1].shuffled(using: &rng)
            if let l = lanes.first(where: { !occupied($0, far - 2, far + Double(n) * 1.6 + 2) }) {
                for k in 0..<n {
                    entities.append(Entity(kind: .coin, lane: l, z: far + Double(k) * 1.6, token: true))
                }
                tokenBank -= Double(n) * 7
            }
        }

        // Bugs crawl in close enough to matter.
        if pendingBugs > 0 {
            let l = rng.int(3) - 1
            if !occupied(l, 38, 42) {
                entities.append(Entity(kind: .bug, lane: l, z: 40, length: 0.5, y: 0, speed: -1.5))
                pendingBugs -= 1
            }
        }

        // Regular course rows.
        while nextRowAt < far {
            layRow(at: nextRowAt + (Self.viewDepth - far))
            nextRowAt += 14 + rng.unit() * 9 - min(5, distance / 1500)
        }
    }

    /// Never block all three lanes with trains near the same depth.
    private func trainLeavesExit(lane: Int, z: Double) -> Bool {
        let others = [-1, 0, 1].filter { $0 != lane }
        let blocked = others.filter { l in
            entities.contains { $0.lane == l && $0.kind == .train && abs($0.z - z) < 14 }
        }
        return blocked.count < 2
    }

    private func layRow(at z: Double) {
        let roll = rng.unit()
        var free = [-1, 0, 1]
        free.shuffle(using: &rng)
        let exitLane = free.removeFirst()           // always passable on foot

        if roll < 0.34 {
            // one or two parked trains
            let count = rng.unit() < 0.45 ? 2 : 1
            for l in free.prefix(count) where !occupied(l, z - 3, z + 10) {
                entities.append(Entity(kind: .train, lane: l, z: z, length: 8 + rng.unit() * 6,
                                       label: "", color: rng.int(4), y: 0,
                                       speed: rng.unit() < 0.25 ? 4 : 0))
            }
            addCoins(lane: exitLane, z: z - 2, n: 6, raised: false)
        } else if roll < 0.62 {
            let l = free[0]
            if !occupied(l, z - 2, z + 2) {
                entities.append(Entity(kind: .barrier, lane: l, z: z, length: 0.3, y: 0))
                addCoins(lane: l, z: z - 2.4, n: 4, raised: true)
            }
            if rng.unit() < 0.5 { addCoins(lane: exitLane, z: z, n: 5, raised: false) }
        } else if roll < 0.82 {
            let l = free[0]
            if !occupied(l, z - 2, z + 2) {
                entities.append(Entity(kind: .highBarrier, lane: l, z: z, length: 0.3, y: 0))
            }
            addCoins(lane: exitLane, z: z - 2, n: 5, raised: false)
        } else {
            addCoins(lane: rng.int(3) - 1, z: z, n: 8, raised: false)
        }
    }

    private func addCoins(lane: Int, z: Double, n: Int, raised: Bool) {
        for k in 0..<n {
            let zz = z + Double(k) * 1.5
            if occupied(lane, zz - 0.5, zz + 0.5) { continue }
            // raised coins trace a jump arc over a barrier
            let arc = raised ? 0.55 + sin(Double(k) / Double(max(n - 1, 1)) * .pi) * 1.3 : 0.55
            entities.append(Entity(kind: .coin, lane: lane, z: zz, y: arc))
        }
    }

    // MARK: collisions

    private func collide() {
        let px = x
        for i in entities.indices where !entities[i].dead {
            let e = entities[i]
            let ex = Double(e.lane) * Self.laneWidth
            let sameLane = abs(px - ex) < 0.62
            let atPlayer = e.z < 0.45 && e.z + e.length > -0.45
            guard sameLane, atPlayer else { continue }

            switch e.kind {
            case .coin:
                if abs(y + 0.55 - e.y) < 1.0 {
                    entities[i].dead = true
                    coins += 1
                    streak += 1
                    score += 10 * multiplier
                    onSound?(.coin)
                }
            case .bug:
                if vy < 0 && y > 0.05 {
                    entities[i].dead = true
                    stomps += 1
                    score += 250 * multiplier
                    vy = 6
                    lastEvent = ("SQUASHED  +\(250 * multiplier)", time)
                    onSound?(.stomp)
                } else if y < 0.45 {
                    hit(i)
                }
            case .barrier:
                if y < 0.75 { hit(i) }
            case .highBarrier:
                if rolling <= 0 { hit(i) }
            case .train:
                hit(i)
            }
        }
    }

    private func hit(_ i: Int) {
        guard invulnerable <= 0 else { return }
        entities[i].dead = entities[i].kind != .train
        if entities[i].kind == .train {
            // bounce off into the nearest free lane
            let options = [lane - 1, lane + 1].filter { (-1...1).contains($0) }
            lane = options.first { !occupied($0, -2, 4) } ?? options.first ?? 0
        }
        crashes += 1
        streak = 0
        stumble = 0.55
        invulnerable = 1.6
        speed *= 0.6
        onSound?(.crash)
        onCrash?()
    }

    private func stepConfetti(_ dt: Double) {
        guard !confetti.isEmpty else { return }
        for i in confetti.indices {
            confetti[i].x += confetti[i].vx * dt
            confetti[i].y += confetti[i].vy * dt
            confetti[i].vy += 0.12 * dt
            confetti[i].life -= dt
            confetti[i].spin += dt * 5
        }
        confetti.removeAll { $0.life <= 0 || $0.y > 1.2 }
    }
}

enum SurfSound { case coin, jump, land, roll, swipe, crash, stomp, celebrate, tick }
