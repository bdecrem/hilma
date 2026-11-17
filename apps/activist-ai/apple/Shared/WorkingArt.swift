import SwiftUI

// The four characters that show Ola is working, drawn in code (MOTION.md has the poses and timings
// in numbers, for the web app). Every pose is a pure function of the run's time and a scene, so a
// frame can be drawn live (TimelineView) or off screen at any timestep (the video renders), and
// the Mac and the phone show the same pose and the same rare "special" at the same moment.
// Drawing space: a 100 by 100 box, scaled to the figure's size.

enum WorkingCharacter: String, CaseIterable, Sendable {
  case swing, hop, machine, eyes

  /// Forced for renders (never written to defaults).
  nonisolated(unsafe) static var forced: WorkingCharacter?

  /// One per run, by seed; `defaults write cx.ola.mac OlaWorking <name>` (or cx.ola.phone) forces one.
  static func pick(seed: UInt64) -> WorkingCharacter {
    if let forced { return forced }
    if let s = UserDefaults.standard.string(forKey: "OlaWorking"), let c = WorkingCharacter(rawValue: s.lowercased()) { return c }
    return allCases[Int(seed % UInt64(allCases.count))]
  }
}

enum WorkingMood: String, Sendable { case working, waiting, done, failed }

/// What the figure is doing, in run seconds (time since the request).
struct WorkingScene: Sendable {
  var character: WorkingCharacter
  var seed: UInt64
  var mood: WorkingMood = .working
  /// When this mood began.
  var since: Double = 0
  /// When the current (or the last) working loop began.
  var loopOrigin: Double = 0
  var previous: WorkingMood?
  /// The last new step.
  var beat: Double = -100
  /// Forced specials (renders); nil means the seeded schedule.
  var specials: [Double]?
  var specialKind: Int?
  /// Reduce Motion: a still pose.
  var calm = false
  /// Drawn small, on the run line.
  var compact = false
}

// MARK: motion helpers

enum M {
  static func clamp(_ x: Double, _ a: Double = 0, _ b: Double = 1) -> Double { min(b, max(a, x)) }
  /// 0 before a, 1 after b.
  static func seg(_ t: Double, _ a: Double, _ b: Double) -> Double { clamp((t - a) / (b - a)) }
  static func mix(_ a: Double, _ b: Double, _ x: Double) -> Double { a + (b - a) * x }
  static func inOut(_ x: Double) -> Double { let x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2 }
  static func out(_ x: Double) -> Double { let x = clamp(x); return 1 - pow(1 - x, 3) }
  static func inn(_ x: Double) -> Double { let x = clamp(x); return x * x * x }
  /// A damped spring's step from 0 to 1 (overshoots when z < 1). f in Hz.
  static func spring(_ t: Double, f: Double = 2, z: Double = 0.45) -> Double {
    guard t > 0 else { return 0 }
    let w = 2 * .pi * f, wd = w * sqrt(1 - z * z)
    return 1 - exp(-z * w * t) * (cos(wd * t) + z * w / wd * sin(wd * t))
  }
  /// A damped spring struck once: 0, up to about 0.6 to 0.8, ringing down to 0.
  static func kick(_ t: Double, f: Double = 3, z: Double = 0.3) -> Double {
    guard t > 0 else { return 0 }
    let w = 2 * .pi * f, wd = w * sqrt(1 - z * z)
    return exp(-z * w * t) * sin(wd * t)
  }
  /// A smooth hump from a to b (0 outside, 1 in the middle).
  static func hump(_ t: Double, _ a: Double, _ b: Double) -> Double { let x = seg(t, a, b); return sin(.pi * x) }
  /// A repeatable random number in [0, 1).
  static func rand(_ seed: UInt64, _ k: Int) -> Double {
    var z = seed &+ UInt64(bitPattern: Int64(k)) &* 0x9E37_79B9_7F4A_7C15
    z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
    z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
    z ^= z >> 31
    return Double(z >> 11) / Double(1 << 53)
  }
  /// FNV-1a, so a turn's seed is the same on every device and every launch.
  static func seed(_ s: String) -> UInt64 {
    var h: UInt64 = 0xcbf2_9ce4_8422_2325
    for b in s.utf8 { h = (h ^ UInt64(b)) &* 0x100_0000_01b3 }
    return h
  }
  /// Pose-to-pose keys over a loop (u in 0..<1), eased in and out between keys.
  static func keys(_ u: Double, _ k: [(Double, Double)]) -> Double {
    for i in 0..<(k.count - 1) where u < k[i + 1].0 {
      let x = (u - k[i].0) / (k[i + 1].0 - k[i].0)
      return mix(k[i].1, k[i + 1].1, (1 - cos(.pi * clamp(x))) / 2)
    }
    return k[k.count - 1].1
  }
}

/// The rare special beat: first at 15 to 30 s, then every 20 to 40 s, snapped to the loop.
struct Special { var start: Double; var kind: Int; var length: Double; var end: Double { start + length } }

extension WorkingScene {
  func special(at t: Double, period: Double, kinds: Int, length: (Int) -> Double) -> Special? {
    var raws: [(Double, Int)] = []
    if let specials {
      raws = specials.enumerated().map { ($0.element, specialKind ?? $0.offset % kinds) }
    } else {
      var r = 15 + 15 * M.rand(seed, 900), k = 0
      while r <= t && k < 100_000 {
        raws.append((r, Int(M.rand(seed, 2000 + k) * Double(kinds))))
        if raws.count > 2 { raws.removeFirst() }
        k += 1
        r += 20 + 20 * M.rand(seed, 900 + k)
      }
    }
    for (raw, kind) in raws.reversed() where raw >= loopOrigin - 0.001 {
      let start = loopOrigin + ceil((raw - loopOrigin) / period - 1e-9) * period
      let l = length(kind)
      if t >= start && t < start + l { return Special(start: start, kind: kind, length: l) }
    }
    return nil
  }

  /// Where a mood after the loop takes over: the next loop boundary after `since`, or the end of a
  /// special in progress when `finishSpecial`.
  func exit(period: Double, kinds: Int, length: (Int) -> Double, finishSpecial: Bool) -> Double {
    if finishSpecial, let s = special(at: since, period: period, kinds: kinds, length: length) { return s.end }
    return loopOrigin + ceil((since - loopOrigin) / period - 1e-9) * period
  }
}

// MARK: colors

enum TagInk {
  static func hex(_ v: UInt32) -> Color { Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255) }
  static let navy = hex(0x2B3A6E)
  static let ink = hex(0x1B2550)
  static let paper = hex(0xF5EFE4)
  static let back = hex(0xE6DCCB)
  static let coral = hex(0xE8704A)
  static let mustard = hex(0xE9B44C)
}

/// Draws one frame.
enum WorkingArt {
  /// Frames drawn, for the CPU check.
  nonisolated(unsafe) static var drawn = 0

  static func draw(_ ctx: inout GraphicsContext, size: CGFloat, scene: WorkingScene, t: Double) {
    drawn &+= 1
    var c = ctx
    c.scaleBy(x: size / 100, y: size / 100)
    let small = size < 60
    let t = scene.calm ? calmTime(scene) : t
    var scene = scene
    scene.compact = small
    // On the run line each figure is zoomed to fill its box (anchor, zoom).
    if small {
      let (a, z): (CGPoint, Double) = switch scene.character {
      case .hop: (CGPoint(x: 50, y: 50), 1)  // Hop zooms itself, from its foot
      case .swing: (CGPoint(x: 45, y: 10), 1.12)
      case .machine: (CGPoint(x: 50, y: 86), 1.2)
      case .eyes: (CGPoint(x: 50, y: 52), 1.45)
      }
      c.translateBy(x: a.x, y: a.y); c.scaleBy(x: z, y: z); c.translateBy(x: -a.x, y: -a.y)
      // The tag swings further right than left at its stall: give it the room on that side.
      if scene.character == .swing { c.translateBy(x: -2, y: 0) }
    }
    switch scene.character {
    case .hop: Hop.draw(&c, small: small, s: scene, t: t)
    case .swing: Swing.draw(&c, small: small, size: size, s: scene, t: t)
    case .machine: Machine.draw(&c, small: small, s: scene, t: t)
    case .eyes: Eyes.draw(&c, small: small, s: scene, t: t)
    }
  }

  /// Reduce Motion: the rest pose of the loop, or the settled pose of the mood.
  static func calmTime(_ s: WorkingScene) -> Double {
    switch s.mood {
    case .working: s.loopOrigin
    case .waiting: s.since + 30
    case .done, .failed: s.since + 0.9
    }
  }

  /// How long done and failed take, after which the figure has faded out.
  static let outro: Double = 2.7
  /// After this long waiting, the pose holds and the timeline can pause.
  static let waitSettles: Double = 3.2
}

// MARK: Hop: the comma

enum Hop {
  static let period = 0.74
  static let contact = 0.24
  /// The deepest squash, in the loop's phase.
  static let squash = 0.12
  static let R = 8.6
  static let ground = 91.0
  static let footX = 45.0
  static func length(_ k: Int) -> Double { k == 0 ? 5 * period : 2 * period }

  struct Pose {
    var hop = 0.0, stretch = 1.0, bend = 0.05, sy = 1.0, lean = 0.0, spin = 0.0
    var tail = true, opacity = 1.0, dot = false
    var sx: Double { 1 / pow(sy, 0.8) }
  }

  // The comma of the icon in head radii, head at the origin: start, c1, c2, tip, c3, c4, end.
  static let tailPoints: [CGPoint] = [CGPoint(x: 0.833, y: 0.467), CGPoint(x: 1.033, y: 1.9), CGPoint(x: 0.467, y: 3.0), CGPoint(x: -0.667, y: 3.667), CGPoint(x: 0, y: 2.733), CGPoint(x: 0.2, y: 1.8), CGPoint(x: -0.2, y: 0.933)]

  static let stretchKeys: [(Double, Double)] = [(0, 1.0), (0.12, 0.72), (0.24, 1.14), (0.44, 1.0), (0.78, 1.0), (0.96, 1.07), (1, 1.0)]
  static let bendKeys: [(Double, Double)] = [(0, 0.12), (0.12, 0.24), (0.24, -0.16), (0.47, -0.04), (0.75, 0.14), (0.96, 0.16), (1, 0.12)]
  static let syKeys: [(Double, Double)] = [(0, 1.0), (0.12, 0.84), (0.24, 1.07), (0.42, 1.0), (0.9, 1.03), (1, 1.0)]
  static let leanKeys: [(Double, Double)] = [(0, 0), (0.12, -0.05), (0.34, 0.06), (0.62, -0.03), (0.9, 0.02), (1, 0)]

  /// One hop of the loop at phase u, with height h.
  static func loop(_ u: Double, h: Double) -> Pose {
    var p = Pose()
    p.stretch = M.keys(u, stretchKeys); p.bend = M.keys(u, bendKeys); p.sy = M.keys(u, syKeys); p.lean = M.keys(u, leanKeys)
    if u >= contact { let v = (u - contact) / (1 - contact); p.hop = h * 4 * v * (1 - v) }
    return p
  }

  /// From the deepest squash (u = 0.1) to standing still, with a wobble.
  static func recover(_ p: inout Pose, _ s: Double) {
    let k = M.spring(s, f: 2.6, z: 0.32)
    p.stretch = M.mix(0.72, 1, k); p.bend = M.mix(0.24, 0.05, k); p.sy = M.mix(0.84, 1, k); p.lean = M.mix(-0.05, 0, k); p.hop = 0
  }

  static func working(_ s: WorkingScene, _ t: Double) -> Pose {
    if let sp = s.special(at: t, period: period, kinds: 2, length: length) { return special(sp, t - sp.start, s) }
    let tau = t - s.loopOrigin
    let k = Int(floor(tau / period))
    let u = tau / period - Double(k)
    var h = 25 * (0.92 + 0.16 * M.rand(s.seed, k))
    // A new step: the next hop goes higher.
    let cycleStart = s.loopOrigin + Double(k) * period
    if s.beat > cycleStart - period && s.beat <= cycleStart && t - s.beat < 1.6 { h *= 1.38 }
    var p = loop(u, h: h)
    // Back from waiting: the lean toward the approval relaxes.
    if s.previous == .waiting { p.lean += 0.28 * (1 - M.spring(tau, f: 1.8, z: 0.6)); p.bend += 0.12 * (1 - M.spring(tau, f: 1.8, z: 0.6)) }
    return p
  }

  static func special(_ sp: Special, _ s: Double, _ scene: WorkingScene) -> Pose {
    let P = period
    if sp.kind == 1 {
      // A somersault: a deeper squash, twice the air, one full turn.
      if s < contact * P { var p = loop(s / P, h: 0); p.stretch = M.mix(1, p.stretch, 1.25); return p }
      let v = (s - contact * P) / (2 * P - contact * P)
      var p = Pose()
      p.hop = 46 * 4 * v * (1 - v)
      p.spin = -2 * .pi * M.inOut(M.seg(v, 0.08, 0.86))
      p.stretch = 1 + 0.12 * max(0, 1 - 4 * v) + 0.06 * max(0, 4 * v - 3)
      p.bend = M.mix(-0.2, 0.18, v)
      return p
    }
    // The missed bounce: it lands and the bounce does not come. It stands, looks left, looks right,
    // winds up and takes a big hop with a backflip to catch up.
    var p = Pose()
    if s < squash * P { return loop(s / P, h: 0) }
    recover(&p, s - squash * P)
    let look = -0.26 * (M.spring(s - 1.0, f: 2.2, z: 0.5) - M.spring(s - 1.45, f: 2.2, z: 0.5)) + 0.26 * (M.spring(s - 1.45, f: 2.2, z: 0.5) - M.spring(s - 1.9, f: 2.4, z: 0.55))
    p.lean += look
    let wind = M.inOut(M.seg(s, 2.15, 2.5))
    p.stretch = M.mix(p.stretch, 0.6, wind); p.bend = M.mix(p.bend, 0.4, wind); p.sy = M.mix(p.sy, 0.8, wind)
    if s >= 2.5 {
      let v = M.seg(s, 2.5, 5 * P)
      p = Pose()
      p.hop = 40 * 4 * v * (1 - v)
      p.spin = -2 * .pi * M.inOut(M.seg(v, 0.1, 0.85))
      p.stretch = 1 + 0.16 * max(0, 1 - 4 * v) + 0.07 * max(0, 4 * v - 3)
      p.bend = M.mix(-0.22, 0.14, v)
      p.sy = 1 + 0.05 * max(0, 1 - 4 * v)
    }
    return p
  }

  static func pose(_ s: WorkingScene, _ t: Double) -> Pose {
    if s.mood == .working { return working(s, t) }
    let e = s.exit(period: period, kinds: 2, length: length, finishSpecial: s.mood == .waiting)
    if t < e { var w = s; w.mood = .working; return working(w, t) }
    let x = t - e
    if x < squash * period { return loop(x / period, h: 0) }
    var p = Pose()
    recover(&p, x - squash * period)
    switch s.mood {
    case .waiting:
      // It stands and leans toward the approval, the tail curling under like a bow.
      let k = M.spring(x - 0.35, f: 1.6, z: 0.55)
      p.lean += 0.28 * k; p.bend += 0.12 * k
    case .done:
      // The tail is pulled in: "Ola," becomes "Ola." The full stop pops and settles.
      let r = M.inn(M.seg(x, 0.32, 0.72))
      p.stretch = M.mix(p.stretch, 0.27, r); p.bend = M.mix(p.bend, 0.0, r)
      if x >= 0.72 {
        p.tail = false; p.dot = true; p.stretch = 0.27
        let a = x - 0.72
        if a < 0.32 { let v = a / 0.32; p.hop = 11 * 4 * v * (1 - v) }
        else if a < 0.5 { let v = (a - 0.32) / 0.18; p.hop = 2.4 * 4 * v * (1 - v) }
        p.sy = 1 - 0.22 * M.hump(a, 0.32, 0.4) - 0.1 * M.hump(a, 0.5, 0.56) + 0.08 * M.hump(a, 0, 0.12)
      }
      p.opacity = 1 - M.seg(x, 1.45, 1.85)
    case .failed:
      // A slow deflation: the tail gives, the head slumps back.
      let d = M.out(M.seg(x, 0.15, 0.9))
      p.stretch = M.mix(p.stretch, 0.58, d); p.bend = M.mix(p.bend, 0.5, d); p.sy = M.mix(p.sy, 0.8, d); p.lean = M.mix(p.lean, -0.32, d)
      p.opacity = 1 - M.seg(x, 0.95, 1.45)
    case .working: break
    }
    return p
  }

  static func draw(_ ctx: inout GraphicsContext, small: Bool, s: WorkingScene, t: Double) {
    var p = pose(s, t)
    guard p.opacity > 0.001 else { return }
    ctx.opacity = p.opacity
    // Small, on the run line: the comma fills its box and hops lower.
    if small { ctx.translateBy(x: footX + 4, y: ground); ctx.scaleBy(x: 1.55, y: 1.55); ctx.translateBy(x: -footX - 4, y: -ground); p.hop *= 0.5 }
    // The tail, bent and stretched more toward its tip.
    // In Doubles throughout: mixing CGFloat and Double here was past the release compiler's
    // type-check limit (Xcode 26.3, the Mac archive for the signed download).
    let bend: Double = p.bend, stretch: Double = p.stretch
    let pts: [CGPoint] = tailPoints.map { (q: CGPoint) -> CGPoint in
      let x = Double(q.x), y = Double(q.y)
      let w: Double = M.clamp((hypot(x, y) - 0.85) / (3.72 - 0.85))
      let a: Double = bend * w
      let sc: Double = 1 + (stretch - 1) * w
      let ca: Double = cos(a), sa: Double = sin(a)
      return CGPoint(x: (x * ca - y * sa) * sc, y: (x * sa + y * ca) * sc)
    }
    let tip = pts[3]
    // Its shadow on the ground.
    let air = M.clamp(p.hop / 40)
    let sw = (small ? 24 : 20) * (1 - 0.5 * air)
    ctx.fill(Path(ellipseIn: CGRect(x: footX + 4 - sw / 2, y: ground - 1.6, width: sw, height: 3.6)), with: .color(Ola.ink.opacity(0.13 * (1 - 0.6 * air))))
    var c = ctx
    c.translateBy(x: footX, y: ground - p.hop)
    c.rotate(by: .radians(p.lean))
    if p.spin != 0 {
      let mid = CGPoint(x: -tip.x * R * 0.55, y: -tip.y * R * 0.55)
      c.translateBy(x: mid.x, y: mid.y); c.rotate(by: .radians(p.spin)); c.translateBy(x: -mid.x, y: -mid.y)
    }
    c.scaleBy(x: R, y: R)
    c.translateBy(x: -tip.x, y: -tip.y)
    if p.tail {
      var tail = Path()
      tail.move(to: pts[0]); tail.addCurve(to: pts[3], control1: pts[1], control2: pts[2]); tail.addCurve(to: pts[6], control1: pts[4], control2: pts[5]); tail.closeSubpath()
      c.fill(tail, with: .color(TagInk.coral))
    }
    // The head squashes onto the joint below it.
    let hy = (1 - p.sy) * 0.6
    c.fill(Path(ellipseIn: CGRect(x: -p.sx, y: hy - p.sy, width: 2 * p.sx, height: 2 * p.sy)), with: .color(TagInk.coral))
  }
}

// MARK: Swing: the tag

enum Swing {
  static let period = 1.7
  static let pivot = CGPoint(x: 45, y: 12)
  static let string = 22.0
  static let k = 0.066
  static func length(_ k: Int) -> Double { k == 0 ? 3 * period : 2 * period }

  struct Pose { var theta = 0.0, psi = 0.0, bob = 0.0, slip = 0.0, turn = 1.0, sparkle = 0.0, sparkleTurn = 0.0, opacity = 1.0, bow = 0.0 }

  static func amp(_ s: WorkingScene, _ tau: Double) -> Double {
    let x = tau / period, k = Int(floor(x)), f = x - Double(k)
    let a = 14 * (0.86 + 0.28 * M.rand(s.seed, k)), b = 14 * (0.86 + 0.28 * M.rand(s.seed, k + 1))
    return M.mix(a, b, (1 - cos(.pi * f)) / 2)
  }

  /// The string's angle in degrees (positive swings right).
  static func theta(_ s: WorkingScene, _ t: Double) -> Double {
    let w = 2 * .pi / period
    func loopTheta(_ t: Double) -> Double {
      let tau = t - s.loopOrigin
      var a = amp(s, tau)
      if s.previous == .waiting { a *= 1 - exp(-1.6 * max(0, tau)) }
      // A new step tugs the string: the swing grows for a moment.
      if t > s.beat { let b = t - s.beat; a *= 1 + (s.compact ? 0.4 : 0.7) * (1 - exp(-6 * b)) * exp(-1.1 * b) }
      return a * sin(w * tau)
    }
    func working(_ t: Double) -> Double {
      guard let sp = s.special(at: t, period: period, kinds: 2, length: length), sp.kind == 0 else { return loopTheta(t) }
      // The swing grows, stalls at the top (a tremble), drops and settles back into the loop.
      let x = t - sp.start, peak = 1.25 * period, hang = 0.42
      let top = s.compact ? 12.0 : 36.0  // how far the swing grows above its 14 degrees (on the run line it must stay in its box)
      var th: Double
      if x < peak { th = (14 + top * M.inn(x / peak)) * sin(w * x) }
      else if x < peak + hang { th = 14 + top + 0.9 * sin(2 * .pi * 11 * (x - peak)) * (1 - M.seg(x, peak, peak + hang)) }
      else { let y = x - peak - hang; th = (14 + top * exp(-1.7 * y)) * cos(w * y) }
      let blend = M.inOut(M.seg(x, sp.length - 0.8, sp.length))
      return M.mix(th, loopTheta(t), blend)
    }
    switch s.mood {
    case .working: return working(t)
    case .waiting: return working(t) * exp(-2.4 * max(0, t - s.since)) + 7 * M.spring(t - s.since - 0.6, f: 1.2, z: 0.6)
    case .done: return working(t) * exp(-3.4 * max(0, t - s.since))
    case .failed: return working(t) * exp(-2.6 * max(0, t - s.since))
    }
  }

  static func pose(_ s: WorkingScene, _ t: Double) -> Pose {
    var p = Pose()
    p.theta = theta(s, t)
    // The tag hangs from the string at the eyelet and lags behind it, then overshoots.
    p.psi = theta(s, t - 0.15) * 1.2
    let dv = (theta(s, t + 0.01) - theta(s, t - 0.01)) / 0.02
    p.bow = M.clamp(-dv * 0.022, -3.5, 3.5)
    if s.mood == .working || t < s.since {
      if let sp = s.special(at: t, period: period, kinds: 2, length: length) {
        let x = t - sp.start
        if sp.kind == 0 {
          // At the stall the tag flops over past the string, then springs back.
          let peak = 1.25 * period
          p.psi += (s.compact ? 4 : 20) * M.kick(x - peak, f: 1.3, z: 0.35)
          p.bob = -1.5 * M.hump(x, peak - 0.3, peak + 0.5)
        } else {
          // The twirl: two turns on the string, showing its blank back, and a wobble.
          let e = M.inOut(M.seg(x, 0.25, 1.75))
          p.turn = cos(4 * .pi * e) - 0.3 * M.kick(x - 1.75, f: 2.6, z: 0.3)
          p.bob = -2.2 * M.hump(x, 0.2, 1.9)
        }
      }
    }
    if t > s.beat { p.bob -= 3.2 * M.kick(t - s.beat, f: 3.4, z: 0.32) }
    let x = t - s.since
    switch s.mood {
    case .working:
      if s.previous == .waiting { let r = 1 - M.spring(x, f: 1.6, z: 0.55); p.turn = M.mix(p.turn, 0.62, r); p.psi += 8 * r }
    case .waiting:
      // It stills, then turns on its string toward the approval and bows a little.
      let k = M.spring(x - 0.7, f: 1.3, z: 0.55)
      p.turn = M.mix(p.turn, 0.62, k); p.psi += 8 * k
    case .done:
      // A nod (a dip on the string), and the sparkle twinkles beside it.
      p.bob += 2.6 * M.kick(x - 0.35, f: 2.2, z: 0.35)
      p.sparkle = 1.1 * M.out(M.seg(x, 0.45, 0.62)) - 0.1 * M.seg(x, 0.62, 0.8) - M.inn(M.seg(x, 1.15, 1.45))
      p.sparkleTurn = 45 * M.inOut(M.seg(x, 0.45, 1.45))
      p.opacity = 1 - M.seg(x, 1.45, 1.85)
    case .failed:
      // The string slips on its nail: the tag drops, bounces and hangs crooked.
      p.slip = 7 * M.spring(x - 0.08, f: 1.7, z: 0.3)
      p.psi -= 15 * M.inOut(M.seg(x, 0.25, 0.95))
      p.opacity = 1 - M.seg(x, 0.95, 1.45)
    }
    return p
  }

  static func draw(_ ctx: inout GraphicsContext, small: Bool, size: CGFloat, s: WorkingScene, t: Double) {
    let p = pose(s, t)
    guard p.opacity > 0.001 else { return }
    ctx.opacity = p.opacity
    let th = p.theta * .pi / 180
    let L = string + p.slip
    let eye = CGPoint(x: pivot.x + L * sin(th), y: pivot.y + L * cos(th) + p.bob)
    // The string, bowed against the swing.
    var str = Path()
    str.move(to: pivot)
    let mid = CGPoint(x: (pivot.x + eye.x) / 2 + p.bow * cos(th), y: (pivot.y + eye.y) / 2 - p.bow * sin(th))
    str.addQuadCurve(to: eye, control: mid)
    ctx.stroke(str, with: .color(TagInk.mustard), style: StrokeStyle(lineWidth: small ? 3.2 : 2.6, lineCap: .round))
    // The nail.
    let nr = small ? 3.6 : 2.6
    ctx.fill(Path(ellipseIn: CGRect(x: pivot.x - nr, y: pivot.y - nr, width: 2 * nr, height: 2 * nr)), with: .color(Ola.ink3))
    // The tag, in the icon's own coordinates (eyelet at 268, 520), hanging from the eyelet.
    var c = ctx
    c.translateBy(x: eye.x, y: eye.y)
    c.rotate(by: .degrees(90 - p.psi))
    c.scaleBy(x: k, y: k * max(0.02, abs(p.turn)))
    c.translateBy(x: -268, y: -520)
    let unit = Double(size) / 100 * k  // points per icon unit
    let line = max(16, (small ? 1.1 : 1.3) / unit)
    let back = p.turn < 0
    c.fill(tagShape.offsetBy(dx: 18, dy: 0), with: .color(Ola.ink.opacity(0.12)))
    c.fill(tagShape, with: .color(back ? TagInk.back : TagInk.paper))
    c.stroke(tagShape, with: .color(TagInk.ink), style: StrokeStyle(lineWidth: line, lineJoin: .round))
    if !back {
      if small {
        var cc = c
        cc.translateBy(x: 560, y: 520); cc.scaleBy(x: 2.1, y: 2.1); cc.translateBy(x: -782, y: -640)
        cc.fill(comma, with: .color(TagInk.coral))
      } else {
        c.fill(letters, with: .color(TagInk.ink))
        c.fill(comma, with: .color(TagInk.coral))
      }
    }
    // The eyelet.
    let ring = small ? 62.0 : 44.0
    c.fill(Path(ellipseIn: CGRect(x: 268 - ring, y: 520 - ring, width: 2 * ring, height: 2 * ring)), with: .color(TagInk.mustard))
    let hole = small ? 28.0 : 24.0
    c.fill(Path(ellipseIn: CGRect(x: 268 - hole, y: 520 - hole, width: 2 * hole, height: 2 * hole)), with: .color(TagInk.navy))
    // The sparkle, beside the tag when it is done.
    if p.sparkle > 0.01 {
      var sc = ctx
      sc.translateBy(x: eye.x + 17, y: eye.y + 2)
      sc.rotate(by: .degrees(p.sparkleTurn))
      let r = (small ? 15 : 10) * p.sparkle
      sc.fill(star(r: r), with: .color(TagInk.mustard))
    }
  }

  static func star(r: Double) -> Path {
    var p = Path(), i = r * 0.3
    p.move(to: CGPoint(x: 0, y: -r)); p.addLine(to: CGPoint(x: i * 0.7, y: -i * 0.7)); p.addLine(to: CGPoint(x: r, y: 0)); p.addLine(to: CGPoint(x: i * 0.7, y: i * 0.7))
    p.addLine(to: CGPoint(x: 0, y: r)); p.addLine(to: CGPoint(x: -i * 0.7, y: i * 0.7)); p.addLine(to: CGPoint(x: -r, y: 0)); p.addLine(to: CGPoint(x: -i * 0.7, y: -i * 0.7)); p.closeSubpath()
    return p
  }

  static let tagShape = SVGPath.parse("M 190 390 L 265 310 L 810 310 Q 830 310 830 330 L 830 710 Q 830 730 810 730 L 265 730 L 190 650 Z")
  static let comma: Path = {
    var p = Path(ellipseIn: CGRect(x: 752, y: 568, width: 60, height: 60))
    p.addPath(SVGPath.parse("M 807 612 C 813 655 796 688 762 708 C 782 680 788 652 776 626 Z"))
    return p
  }()
  static let letters = SVGPath.parse(SVGPath.ola)
}

// MARK: Machine: our datacenter

enum Machine {
  static let beat = 0.54
  static var bar: Double { 4 * beat }
  static let ground = 86.0
  static let patterns: [[Bool]] = ["x.x.x.xx", "x..x..x.", "xx.x.x..", "x.xx.x.x", "x...x.x."].map { $0.map { $0 == "x" } }
  static func length(_ k: Int) -> Double { 3 * bar }

  struct Pose {
    var hop = 0.0, sy = 1.0, rot = 0.0, green = 1.0, yellow = 0.3, dx = 0.0, dy = 0.0, opacity = 1.0
    var puff: Double = -1  // age of the last puff, seconds
    var smoke = false
    static func mix(_ a: Pose, _ b: Pose, _ x: Double) -> Pose {
      var p = b
      p.hop = M.mix(a.hop, b.hop, x); p.sy = M.mix(a.sy, b.sy, x); p.rot = M.mix(a.rot, b.rot, x)
      p.green = M.mix(a.green, b.green, x); p.yellow = M.mix(a.yellow, b.yellow, x); p.dx = M.mix(a.dx, b.dx, x); p.dy = M.mix(a.dy, b.dy, x)
      return p
    }
  }

  /// The yellow light's last hit before tau, on the bar's seeded pattern.
  static func lastHit(_ s: WorkingScene, _ tau: Double) -> Double {
    let k = Int(floor(tau / bar))
    for kb in stride(from: k, through: k - 1, by: -1) {
      let pat = patterns[Int(M.rand(s.seed, 3000 + kb) * Double(patterns.count))]
      for i in stride(from: 7, through: 0, by: -1) where pat[i] {
        let h = Double(kb) * bar + Double(i) * beat / 2
        if h <= tau { return h }
      }
    }
    return -10
  }

  static func working(_ s: WorkingScene, _ t: Double) -> Pose {
    var p = Pose()
    let tau = t - s.loopOrigin
    p.yellow = max(0.22, exp(-7 * (tau - lastHit(s, tau))))
    let inBeat = tau.truncatingRemainder(dividingBy: beat)
    p.sy = 1 - 0.035 * M.kick(inBeat, f: 5, z: 0.4)
    let k = Int(floor(tau / bar)), inBar = tau - Double(k) * bar
    // Every fourth bar: wind up on beat 3, hop on beat 4, land on the next downbeat with a puff.
    if k % 2 == 1 {
      p.sy -= 0.09 * M.inn(M.seg(inBar, 2.2 * beat, 3 * beat))
      if inBar >= 3 * beat { let v = (inBar - 3 * beat) / beat; p.hop = 7 * 4 * v * (1 - v); p.sy = 1 + 0.07 * max(0, 1 - 3 * v) }
    }
    if k % 2 == 0 && k > 0 { p.sy -= 0.1 * M.kick(inBar, f: 3.5, z: 0.35); p.puff = inBar }
    if let sp = s.special(at: t, period: bar, kinds: 1, length: length) { dance(&p, t - sp.start, s) }
    // A new step: both lights flash and it chirps.
    if t > s.beat {
      let b = t - s.beat
      p.hop += 3.4 * M.hump(b, 0, 0.24)
      p.green = max(p.green, 1); p.yellow = max(p.yellow, exp(-4 * b))
      p.sy -= 0.05 * M.kick(b - 0.24, f: 4, z: 0.4)
    }
    if s.previous == .waiting { let r = 1 - M.spring(tau, f: 1.6, z: 0.6); p.rot += 3 * r; p.dx += 4 * r; p.dy += 2.4 * r }
    return p
  }

  /// The dance: a bar of rocking with the lights alternating, a bar of hops with a full spin on
  /// beat 4, then a deadpan bar: frozen, the lights glance left and right.
  static func dance(_ p: inout Pose, _ x: Double, _ s: WorkingScene) {
    let b = beat, eighth = Int(floor(x / (b / 2)))
    if x < 2 * bar {
      p.rot = 6 * sin(.pi * x / b)
      let on = eighth % 2 == 0
      p.green = on ? 1 : 0.25; p.yellow = on ? 0.22 : 1
      if x >= bar {
        let y = x - bar
        if y >= b && y < 2 * b { let v = (y - b) / b; p.hop = 5 * 4 * v * (1 - v) }
        if y >= 3 * b { let v = (y - 3 * b) / b; p.hop = 12 * 4 * v * (1 - v); p.rot = 360 * M.inOut(M.seg(v, 0.05, 0.9)); p.sy = 1 + 0.06 * max(0, 1 - 3 * v) }
      }
    } else {
      let y = x - 2 * bar
      p.rot = 0; p.hop = 0; p.green = 1; p.yellow = 1
      p.sy = 1 - 0.1 * M.kick(y, f: 3.2, z: 0.35)
      p.dx = -3 * (M.spring(y - 0.55, f: 3, z: 0.6) - M.spring(y - 1.0, f: 3, z: 0.6)) + 3 * (M.spring(y - 1.0, f: 3, z: 0.6) - M.spring(y - 1.45, f: 3, z: 0.6))
      p.puff = -1
    }
  }

  static func pose(_ s: WorkingScene, _ t: Double) -> Pose {
    if s.mood == .working { return working(s, t) }
    var w = s; w.mood = .working
    let from = working(w, s.since)
    let x = t - s.since
    var to = Pose()
    switch s.mood {
    case .waiting:
      // The lights stop and become eyes looking down at the approval; the box leans toward it.
      to.green = 1; to.yellow = 1; to.dx = 4; to.dy = 2.4; to.rot = 3
      return Pose.mix(from, to, M.spring(x, f: 1.8, z: 0.6))
    case .done:
      to.green = 1; to.yellow = 0
      var p = Pose.mix(from, to, M.spring(x, f: 2.2, z: 0.7))
      p.sy -= 0.07 * M.kick(x - 0.1, f: 2.2, z: 0.35)
      p.puff = x - 0.3
      p.green = 1 + 0.5 * M.hump(x, 0.1, 0.9)
      p.opacity = 1 - M.seg(x, 1.3, 1.75)
      return p
    case .failed:
      let flicker = (x > 0.08 && x < 0.15) || (x > 0.24 && x < 0.3) ? 1.0 : 0.0
      to.green = 0; to.yellow = 0; to.sy = 0.9; to.rot = -4
      var p = Pose.mix(from, to, M.out(M.seg(x, 0, 0.7)))
      p.yellow = max(p.yellow, flicker)
      p.puff = x - 0.45; p.smoke = true
      p.opacity = 1 - M.seg(x, 1.0, 1.5)
      return p
    case .working: return from
    }
  }

  static func draw(_ ctx: inout GraphicsContext, small: Bool, s: WorkingScene, t: Double) {
    draw(&ctx, small: small, pose: pose(s, t))
  }

  /// One pose, drawn (Kit's voice on the phone poses the eyes itself).
  static func draw(_ ctx: inout GraphicsContext, small: Bool, pose p: Pose) {
    guard p.opacity > 0.001 else { return }
    ctx.opacity = p.opacity
    let w = 64.0, h = 42.0, feet = 4.5
    let air = M.clamp(p.hop / 12)
    let sw = 58 * (1 - 0.35 * air)
    ctx.fill(Path(ellipseIn: CGRect(x: 50 - sw / 2, y: ground - 2, width: sw, height: 4.5)), with: .color(Ola.ink.opacity(0.12 * (1 - 0.5 * air))))
    var c = ctx
    c.translateBy(x: 50, y: ground - p.hop)
    c.rotate(by: .degrees(p.rot))
    c.scaleBy(x: 1 / pow(p.sy, 0.7), y: p.sy)
    let lw = small ? 3.6 : 2.2
    let line = Ola.ink3
    for fx in [-22.0, 14.0] { c.fill(Path(roundedRect: CGRect(x: fx, y: -feet - 0.5, width: 8, height: feet + 0.5), cornerRadius: 1.5), with: .color(line)) }
    let box = Path(roundedRect: CGRect(x: -w / 2, y: -feet - h, width: w, height: h), cornerRadius: small ? 7 : 6)
    c.fill(box, with: .color(Ola.field))
    c.stroke(box, with: .color(line), lineWidth: lw)
    for i in 0..<4 {
      var v = Path(); let vx = 6.0 + Double(i) * (small ? 6.5 : 5.5)
      v.move(to: CGPoint(x: vx, y: -feet - h + 9)); v.addLine(to: CGPoint(x: vx, y: -feet - h + (small ? 21 : 19)))
      c.stroke(v, with: .color(line), style: StrokeStyle(lineWidth: small ? 2.8 : 1.8, lineCap: .round))
    }
    let r = small ? 5.4 : 4.2
    for (i, (level, color)) in [(p.green, Ola.leaf), (p.yellow, Ola.lamp)].enumerated() {
      let cx = -18.0 + Double(i) * (small ? 14 : 11) + p.dx, cy = -feet - 11 + p.dy
      if level > 0.45 {
        let g = r + 3.2 * min(1.5, level)
        c.fill(Path(ellipseIn: CGRect(x: cx - g, y: cy - g, width: 2 * g, height: 2 * g)), with: .color(color.opacity(0.22 * min(1, level))))
      }
      c.fill(Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r)), with: .color(Ola.rule))
      c.fill(Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r)), with: .color(color.opacity(M.clamp(level))))
    }
    // A puff from the vents: a landing, a sigh, or smoke.
    if p.puff >= 0 && p.puff < 0.9 {
      let a = p.puff / 0.9
      for j in 0..<2 {
        let pr = (small ? 4 : 3) + 5 * a + Double(j)
        let px = 15 + Double(j) * 9 + 4 * a * (j == 0 ? -1 : 1), py = -feet - h - 3 - 16 * M.out(a) - Double(j) * 3
        c.fill(Path(ellipseIn: CGRect(x: px - pr, y: py - pr, width: 2 * pr, height: 2 * pr)), with: .color((p.smoke ? Ola.ink3 : Ola.ink3).opacity((p.smoke ? 0.45 : 0.3) * (1 - a))))
      }
    }
  }
}

// MARK: Eyes: the 👀, drawn

enum Eyes {
  static let line = 2.3
  static let centers = [CGPoint(x: 36.5, y: 52), CGPoint(x: 63.5, y: 52)]
  static let rx = 12.0, ry = 16.0
  static func length(_ k: Int) -> Double { 2 * line }

  struct Pose {
    var px = -4.5, py = 1.0, open = 1.0, wide = 1.0, pupil = 1.0, sink = 0.0, happy = 0.0, droop = 0.0, cross = 0.0, opacity = 1.0
    static func mix(_ a: Pose, _ b: Pose, _ x: Double) -> Pose {
      var p = b
      p.px = M.mix(a.px, b.px, x); p.py = M.mix(a.py, b.py, x); p.open = M.mix(a.open, b.open, x); p.wide = M.mix(a.wide, b.wide, x)
      p.pupil = M.mix(a.pupil, b.pupil, x); p.sink = M.mix(a.sink, b.sink, x); p.cross = M.mix(a.cross, b.cross, x)
      return p
    }
  }

  /// Blinks on a seeded clock: one in most 4-second slots, sometimes two.
  static func blink(_ s: WorkingScene, _ t: Double) -> Double {
    let slot = Int(floor(t / 4))
    var lid = 1.0
    for k in [slot - 1, slot] {
      guard M.rand(s.seed, 4000 + k) > 0.18 else { continue }
      let b = Double(k) * 4 + 0.4 + 3.0 * M.rand(s.seed, 5000 + k)
      lid = min(lid, closed(t - b))
      if M.rand(s.seed, 6000 + k) < 0.16 { lid = min(lid, closed(t - b - 0.32)) }
    }
    return lid
  }

  /// One blink: shut in 0.07 s, held 0.04 s, open in 0.12 s.
  static func closed(_ x: Double) -> Double {
    if x < 0 || x > 0.23 { return 1 }
    if x < 0.07 { return 1 - M.inn(x / 0.07) }
    if x < 0.11 { return 0 }
    return M.out((x - 0.11) / 0.12)
  }

  /// Reading: fixations left to right, then a return sweep to the next line.
  static func reading(_ s: WorkingScene, _ tau: Double) -> (Double, Double) {
    let k = Int(floor(tau / line)), x = tau - Double(k) * line
    let n = 3 + Int(M.rand(s.seed, 7000 + k) * 3)
    let sweep = line - 0.24
    var px = -5.5
    for i in 1..<n {
      let ti = Double(i) * sweep / Double(n)
      px = M.mix(px, -5.5 + 11 * Double(i) / Double(n - 1), M.inOut(M.seg(x, ti, ti + 0.07)))
    }
    px = M.mix(px, -5.5, M.inOut(M.seg(x, sweep, line)))
    let py = 1 + 1.4 * M.hump(x, sweep, line)
    return (px, py)
  }

  static func working(_ s: WorkingScene, _ t: Double) -> Pose {
    var p = Pose()
    let tau = t - s.loopOrigin
    (p.px, p.py) = reading(s, tau)
    p.open = blink(s, t)
    if let sp = s.special(at: t, period: line, kinds: 3, length: length) { special(&p, sp.kind, t - sp.start) }
    // A new step: a glance down at it, and back.
    if t > s.beat {
      let b = t - s.beat
      let g = M.inOut(M.seg(b, 0, 0.09)) * (1 - M.inOut(M.seg(b, 0.5, 0.68)))
      p.py = M.mix(p.py, 6.5, g); p.px = M.mix(p.px, 0, g)
      p.sink -= 1.6 * M.kick(b, f: 3, z: 0.35)
    }
    if s.previous == .waiting {
      let r = 1 - M.spring(tau, f: 2.4, z: 0.7)
      p.px = M.mix(p.px, 3.5, r); p.py = M.mix(p.py, 6.5, r)
    }
    return p
  }

  static func special(_ p: inout Pose, _ kind: Int, _ x: Double) {
    let center = M.inOut(M.seg(x, 0, 0.2))
    switch kind {
    case 0:
      // A double take: a glance right, back, then a snap right with wide eyes; a suspicious squint.
      let glance = M.inOut(M.seg(x, 0.25, 0.37)) * (1 - M.inOut(M.seg(x, 0.62, 0.74)))
      let snap = M.inOut(M.seg(x, 1.0, 1.07)) * (1 - M.inOut(M.seg(x, 3.3, 3.9)))
      p.px = M.mix(M.mix(p.px, 0, center), 6.5, max(glance, snap)); p.py = M.mix(p.py, 0.5, center)
      p.wide = 1 + 0.22 * M.spring(x - 1.0, f: 3, z: 0.4) * (1 - M.seg(x, 1.9, 2.2))
      p.pupil = 1 - 0.3 * M.hump(x, 1.0, 2.1)
      p.open = min(p.open, 1 - 0.55 * M.hump(x, 2.15, 3.6))
    case 1:
      // An eye roll: up and around under half-shut lids, then a slow blink.
      let a = M.inOut(M.seg(x, 0.3, 1.5))
      let ang = .pi * (1.1 - 1.2 * a)
      let r = 5.5 * M.hump(x, 0.2, 1.6)
      p.px = M.mix(p.px, 0, center) + r * cos(ang); p.py = M.mix(p.py, 0, center) - r * sin(ang) - 2 * M.hump(x, 0.2, 1.6)
      p.open = min(p.open, 1 - 0.4 * M.hump(x, 0.3, 2.2), closed((x - 2.5) * 0.6))
    default:
      // Cross-eyed for a moment, a double blink, a shake.
      p.cross = 6.5 * M.inOut(M.seg(x, 0.3, 0.45)) * (1 - M.inOut(M.seg(x, 1.2, 1.3)))
      p.px = M.mix(p.px, 0, M.hump(x, 0.1, 1.5))
      p.open = min(p.open, closed(x - 1.3), closed(x - 1.6))
      p.px += 1.6 * M.kick(x - 1.9, f: 7, z: 0.15)
    }
  }

  static func pose(_ s: WorkingScene, _ t: Double) -> Pose {
    if s.mood == .working { return working(s, t) }
    var w = s; w.mood = .working
    let from = working(w, s.since)
    let x = t - s.since
    var to = Pose()
    switch s.mood {
    case .waiting:
      // A look down at the approval; one slow blink, then a steady gaze.
      to.px = 3.5; to.py = 6.5
      var p = Pose.mix(from, to, M.inOut(M.seg(x, 0, 0.16)))
      p.open = min(closed((x - 1.5) * 0.7), 1)
      return p
    case .done:
      to.px = 0; to.py = 0
      var p = Pose.mix(from, to, M.inOut(M.seg(x, 0, 0.12)))
      p.happy = M.inOut(M.seg(x, 0.12, 0.32))
      p.sink = -3.5 * M.hump(x, 0.2, 0.55) + 1.2 * M.kick(x - 0.55, f: 3, z: 0.4)
      p.opacity = 1 - M.seg(x, 1.25, 1.7)
      return p
    case .failed:
      to.px = -1.5; to.py = 5
      var p = Pose.mix(from, to, M.out(M.seg(x, 0, 0.5)))
      p.droop = 0.5 * M.out(M.seg(x, 0.1, 0.65))
      p.sink = 3.5 * M.out(M.seg(x, 0.15, 0.9))
      p.opacity = 1 - M.seg(x, 1.0, 1.5)
      return p
    case .working: return from
    }
  }

  static func draw(_ ctx: inout GraphicsContext, small: Bool, s: WorkingScene, t: Double) {
    draw(&ctx, small: small, pose: pose(s, t))
  }

  /// One pose, drawn (Kit's voice on the phone poses the eyes itself).
  static func draw(_ ctx: inout GraphicsContext, small: Bool, pose p: Pose) {
    guard p.opacity > 0.001 else { return }
    ctx.opacity = p.opacity
    let lw = small ? 3.6 : 2.4
    for (i, c0) in centers.enumerated() {
      let c = CGPoint(x: c0.x, y: c0.y + p.sink)
      let ex = rx * p.wide, ey = ry * p.wide
      if p.happy > 0.01 {
        // ^ ^
        var arc = Path()
        arc.move(to: CGPoint(x: c.x - ex * 0.85, y: c.y + 3)); arc.addQuadCurve(to: CGPoint(x: c.x + ex * 0.85, y: c.y + 3), control: CGPoint(x: c.x, y: c.y - ey * 1.05))
        ctx.stroke(arc, with: .color(TagInk.ink.opacity(p.happy)), style: StrokeStyle(lineWidth: small ? 5 : 3.4, lineCap: .round))
        if p.happy > 0.99 { continue }
      }
      let open = max(0, p.open) * (1 - p.happy)
      if open < 0.14 {
        var lid = Path()
        lid.move(to: CGPoint(x: c.x - ex * 0.9, y: c.y)); lid.addQuadCurve(to: CGPoint(x: c.x + ex * 0.9, y: c.y), control: CGPoint(x: c.x, y: c.y + 4))
        ctx.stroke(lid, with: .color(TagInk.ink.opacity(1 - p.happy)), style: StrokeStyle(lineWidth: lw, lineCap: .round))
        continue
      }
      let h = ey * open
      let white = Path(ellipseIn: CGRect(x: c.x - ex, y: c.y - h, width: 2 * ex, height: 2 * h))
      var layer = ctx
      layer.opacity = p.opacity * (1 - p.happy)
      layer.fill(white, with: .color(TagInk.paper))
      layer.drawLayer { l in
        l.clip(to: white)
        let pr = 5.6 * p.pupil * (small ? 1.25 : 1)
        let cross = i == 0 ? p.cross : -p.cross
        let pc = CGPoint(x: c.x + p.px + cross, y: c.y + p.py * open)
        l.fill(Path(ellipseIn: CGRect(x: pc.x - pr, y: pc.y - pr, width: 2 * pr, height: 2 * pr)), with: .color(TagInk.ink))
        if !small { l.fill(Path(ellipseIn: CGRect(x: pc.x - pr * 0.55, y: pc.y - pr * 0.6, width: pr * 0.5, height: pr * 0.5)), with: .color(TagInk.paper)) }
      }
      if p.droop > 0.01 {
        // A heavy upper lid: cover the top of the eye with the lid's own paper and draw its edge.
        let lidY = c.y - h + p.droop * 2 * h
        layer.drawLayer { l in
          l.clip(to: white)
          l.fill(Path(CGRect(x: c.x - ex - 2, y: c.y - h - 2, width: 2 * ex + 4, height: lidY - (c.y - h) + 2)), with: .color(TagInk.back))
        }
        var edge = Path(); edge.move(to: CGPoint(x: c.x - ex * 0.95, y: lidY)); edge.addLine(to: CGPoint(x: c.x + ex * 0.95, y: lidY))
        layer.stroke(edge, with: .color(TagInk.ink), style: StrokeStyle(lineWidth: lw, lineCap: .round))
      }
      layer.stroke(white, with: .color(TagInk.ink), lineWidth: lw)
    }
  }
}

// MARK: the icon's paths

enum SVGPath {
  /// Absolute M, L, Q, C and Z only (all the icon uses).
  static func parse(_ d: String) -> Path {
    var path = Path()
    var nums: [Double] = []
    var cmd: Character = "M"
    func flush() {
      switch cmd {
      case "M", "L":
        var i = 0
        while i + 1 < nums.count {
          let p = CGPoint(x: nums[i], y: nums[i + 1])
          if cmd == "M" && i == 0 { path.move(to: p) } else { path.addLine(to: p) }
          i += 2
        }
      case "Q":
        var i = 0
        while i + 3 < nums.count { path.addQuadCurve(to: CGPoint(x: nums[i + 2], y: nums[i + 3]), control: CGPoint(x: nums[i], y: nums[i + 1])); i += 4 }
      case "C":
        var i = 0
        while i + 5 < nums.count { path.addCurve(to: CGPoint(x: nums[i + 4], y: nums[i + 5]), control1: CGPoint(x: nums[i], y: nums[i + 1]), control2: CGPoint(x: nums[i + 2], y: nums[i + 3])); i += 6 }
      case "Z": path.closeSubpath()
      default: break
      }
      nums = []
    }
    var number = ""
    for ch in d {
      if ch.isNumber || ch == "." || (ch == "-" && number.isEmpty) {
        number.append(ch)
      } else {
        if !number.isEmpty { nums.append(Double(number) ?? 0); number = "" }
        if "MLQCZ".contains(ch) { flush(); cmd = ch; if ch == "Z" { flush() } }
      }
    }
    if !number.isEmpty { nums.append(Double(number) ?? 0) }
    flush()
    return path
  }

  /// "Ola" in Caveat Bold, as outlines (brand/icon/ola-icon-fullbleed.svg).
  static let ola = "M411.71 643.55Q399.5 634.64 392.405 626.885Q385.31 619.13 384.65 611.87Q383.99 605.93 384.815 595.7Q385.64 585.47 386.96 575.5699999999999Q388.28 565.67 389.27 560.72Q390.92 559.0699999999999 390.755 556.265Q390.59000000000003 553.46 390.59000000000003 553.46Q390.26 551.81 392.9 544.7149999999999Q395.54 537.62 397.85 526.4Q404.45 506.6 410.55499999999995 493.235Q416.65999999999997 479.87 422.6 470.3Q428.54 460.73 434.48 452.81Q448.01 438.95 460.055 430.7Q472.1 422.45 482.33000000000004 417.83Q488.93 413.87 494.53999999999996 411.56Q500.15 409.25 503.78 410.9Q522.26 414.86 535.13 427.07Q548.0 439.28 552.29 462.38Q554.6 476.9 555.095 488.615Q555.59 500.33 553.28 511.71500000000003Q550.97 523.1 544.865 536.63Q538.76 550.16 527.87 568.31Q514.34 595.04 498.33500000000004 613.025Q482.33000000000004 631.01 466.32500000000005 640.25Q450.32 649.49 435.96500000000003 650.315Q421.61 651.14 411.71 643.55ZM438.11 621.77Q445.7 620.78 450.485 618.8Q455.27 616.82 460.55 611.21Q465.83000000000004 605.6 475.4 594.71Q483.98 584.81 489.755 577.88Q495.53 570.95 499.655 563.69Q503.78 556.43 507.575 546.365Q511.37 536.3 515.99 520.46Q518.63 510.56 519.7850000000001 505.775Q520.94 500.99 521.27 497.69Q521.6 494.39 521.435 488.615Q521.27 482.84000000000003 521.27 470.96Q520.94 465.35 518.96 458.255Q516.98 451.15999999999997 514.34 448.19Q511.04 444.56 504.44000000000005 441.91999999999996Q497.84000000000003 439.28 490.58000000000004 442.58Q486.62 444.23 480.68 449.345Q474.74 454.46 468.47 461.39Q462.2 468.32 456.59000000000003 475.25Q450.98 482.18 447.68 487.86875Q444.38 493.5575 444.38 495.71Q444.38 495.71 444.21500000000003 497.36Q444.05 499.01 442.73 500.65999999999997Q438.44 505.28 433.82 515.8399999999999Q429.2 526.4 425.24 539.9300000000001Q421.28 553.46 418.64 566.99Q416.0 580.52 415.34000000000003 591.41Q415.34000000000003 596.69 415.34000000000003 600.32Q415.34000000000003 603.95 416.165 606.755Q416.99 609.56 418.97 612.86Q420.95 616.16 427.055 619.46Q433.16 622.76 438.11 621.77ZM563.51 635.63Q557.24 637.28 552.29 632.165Q547.34 627.05 545.36 617.15Q543.38 607.25 546.02 595.04Q547.67 591.08 548.66 587.2850000000001Q549.65 583.49 549.65 581.18Q550.31 577.88 552.29 571.4449999999999Q554.27 565.01 556.5799999999999 558.0799999999999Q558.89 551.15 561.035 545.7049999999999Q563.18 540.26 563.84 538.94Q565.16 538.94 566.15 536.63Q567.14 534.3199999999999 567.14 532.01Q567.14 529.37 568.295 526.0699999999999Q569.4499999999999 522.77 570.77 521.45Q570.77 519.8 571.595 517.655Q572.42 515.51 572.42 514.19Q572.42 512.87 573.2449999999999 511.55Q574.0699999999999 510.23 574.0699999999999 508.90999999999997Q576.38 504.62 580.175 495.21500000000003Q583.97 485.81 588.425 474.26Q592.88 462.71 596.8399999999999 451.49Q600.8 440.27 603.275 432.515Q605.75 424.76 605.75 423.11Q605.75 420.47 607.73 418.16Q609.71 415.85 612.35 415.85Q613.3399999999999 414.86 616.97 414.365Q620.6 413.87 621.92 413.87Q621.92 413.87 623.24 415.19Q624.56 416.51 627.2 419.15Q629.84 421.46 632.315 424.42999999999995Q634.79 427.4 634.79 431.36Q634.79 435.65 633.635 439.61Q632.48 443.57 629.51 450.33500000000004Q626.54 457.1 620.27 470.29999999999995Q617.63 476.9 614.66 482.67499999999995Q611.6899999999999 488.45 611.6899999999999 489.77Q611.6899999999999 491.09000000000003 610.535 493.73Q609.38 496.37 608.06 500.33Q606.74 502.97 604.4300000000001 508.08500000000004Q602.12 513.2 599.645 518.975Q597.17 524.75 595.52 528.875Q593.87 533.0 593.87 533.66Q593.87 534.98 593.7049999999999 536.3Q593.54 537.62 592.22 538.94Q590.9 538.94 590.7349999999999 540.755Q590.5699999999999 542.5699999999999 590.5699999999999 542.5699999999999Q590.5699999999999 545.87 585.29 560.06Q580.01 578.21 575.5550000000001 593.3900000000001Q571.1 608.57 571.1 617.81Q571.1 625.73 568.625 630.02Q566.15 634.31 563.51 635.63ZM616.31 625.07Q614.99 622.43 610.5350000000001 619.79Q606.08 617.15 606.08 615.83Q606.08 614.51 604.595 611.7049999999999Q603.11 608.9 601.79 607.58Q600.14 605.6 602.78 597.845Q605.42 590.09 610.7 578.87Q615.98 567.65 622.25 556.1Q624.89 553.46 627.53 549.1700000000001Q630.17 544.88 631.49 543.56Q631.49 542.24 632.48 541.085Q633.47 539.93 634.79 539.93L637.43 534.65Q638.09 533.33 641.4918085106383 529.37Q644.8936170212766 525.41 649.9068085106383 520.625Q654.92 515.84 659.99375 511.52Q665.0675 507.2 668.45 505.28Q675.38 500.65999999999997 682.8050000000001 500.99Q690.23 501.32 695.51 505.61Q696.5 506.6 699.9649999999999 509.57Q703.43 512.54 707.885 516.17Q712.34 519.8 715.64 522.77L727.85 533.66L722.1016129032258 550.16Q717.95 563.36 720.0125 573.26Q722.075 583.16 726.2 590.42Q727.85 594.05 730.655 596.03Q733.46 598.01 738.0799999999999 598.67Q740.72 599.0 743.03 600.65Q745.34 602.3 745.34 605.93Q745.34 613.85 742.5350000000001 617.315Q739.73 620.78 736.4300000000001 621.44Q725.54 622.76 715.64 619.13Q705.74 615.5 697.8199999999999 600.32Q696.5 598.34 694.355 592.895Q692.21 587.45 691.88 585.8Q690.56 587.45 688.415 589.925Q686.27 592.4 684.29 594.38Q660.86 618.14 644.1131021897811 625.235Q627.3662043795621 632.33 616.31 625.07ZM634.46 597.68Q636.77 598.01 641.72 595.2049999999999Q646.67 592.4 654.92 585.8Q666.14 576.23 673.4 569.96Q680.66 563.69 687.59 553.79L694.85 541.91Q691.55 534.3199999999999 688.91 532.01Q686.27 529.7 683.63 529.7Q679.34 529.7 673.4000000000001 535.145Q667.46 540.59 660.0350000000001 550.985Q652.61 561.38 643.37 576.89Q639.08 584.15 636.77 590.915Q634.46 597.68 634.46 597.68Z"
}
