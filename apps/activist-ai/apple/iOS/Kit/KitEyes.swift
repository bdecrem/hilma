import SwiftUI

/// The eyes Kit's voice is drawn with (KitVoiceFigure): two paper eyes with ink pupils in a 100 by
/// 100 box. They were one of the old "Ola is working" figures; since the Hop (OLA-225) only Kit
/// uses them, so only what Kit poses is kept here.
enum Eyes {
  static let line = 2.3
  static let centers = [CGPoint(x: 36.5, y: 52), CGPoint(x: 63.5, y: 52)]
  static let rx = 12.0, ry = 16.0

  static let ink = Color(red: 0x1B / 255, green: 0x25 / 255, blue: 0x50 / 255)
  static let paper = Color(red: 0xF5 / 255, green: 0xEF / 255, blue: 0xE4 / 255)
  static let lid = Color(red: 0xE6 / 255, green: 0xDC / 255, blue: 0xCB / 255)

  struct Pose {
    var px = -4.5, py = 1.0, open = 1.0, wide = 1.0, pupil = 1.0, sink = 0.0, happy = 0.0, droop = 0.0, cross = 0.0, opacity = 1.0
    static func mix(_ a: Pose, _ b: Pose, _ x: Double) -> Pose {
      var p = b
      p.px = E.mix(a.px, b.px, x); p.py = E.mix(a.py, b.py, x); p.open = E.mix(a.open, b.open, x); p.wide = E.mix(a.wide, b.wide, x)
      p.pupil = E.mix(a.pupil, b.pupil, x); p.sink = E.mix(a.sink, b.sink, x); p.cross = E.mix(a.cross, b.cross, x)
      return p
    }
  }

  /// Blinks on a seeded clock: one in most 4-second slots, sometimes two.
  static func blink(seed: UInt64, _ t: Double) -> Double {
    let slot = Int(floor(t / 4))
    var lid = 1.0
    for k in [slot - 1, slot] {
      guard E.rand(seed, 4000 + k) > 0.18 else { continue }
      let b = Double(k) * 4 + 0.4 + 3.0 * E.rand(seed, 5000 + k)
      lid = min(lid, closed(t - b))
      if E.rand(seed, 6000 + k) < 0.16 { lid = min(lid, closed(t - b - 0.32)) }
    }
    return lid
  }

  /// One blink: shut in 0.07 s, held 0.04 s, open in 0.12 s.
  static func closed(_ x: Double) -> Double {
    if x < 0 || x > 0.23 { return 1 }
    if x < 0.07 { let u = x / 0.07; return 1 - u * u * u }
    if x < 0.11 { return 0 }
    return 1 - pow(1 - E.clamp((x - 0.11) / 0.12), 3)
  }

  /// Reading: fixations left to right, then a return sweep to the next line.
  static func reading(seed: UInt64, _ tau: Double) -> (Double, Double) {
    let k = Int(floor(tau / line)), x = tau - Double(k) * line
    let n = 3 + Int(E.rand(seed, 7000 + k) * 3)
    let sweep = line - 0.24
    var px = -5.5
    for i in 1..<n {
      let ti = Double(i) * sweep / Double(n)
      px = E.mix(px, -5.5 + 11 * Double(i) / Double(n - 1), E.inOut(E.seg(x, ti, ti + 0.07)))
    }
    px = E.mix(px, -5.5, E.inOut(E.seg(x, sweep, line)))
    let py = 1 + 1.4 * sin(.pi * E.seg(x, sweep, line))
    return (px, py)
  }

  /// One pose, drawn in the 100 by 100 box.
  static func draw(_ ctx: inout GraphicsContext, pose p: Pose) {
    guard p.opacity > 0.001 else { return }
    ctx.opacity = p.opacity
    let lw = 2.4
    for (i, c0) in centers.enumerated() {
      let c = CGPoint(x: c0.x, y: c0.y + p.sink)
      let ex = rx * p.wide, ey = ry * p.wide
      if p.happy > 0.01 {
        // ^ ^
        var arc = Path()
        arc.move(to: CGPoint(x: c.x - ex * 0.85, y: c.y + 3)); arc.addQuadCurve(to: CGPoint(x: c.x + ex * 0.85, y: c.y + 3), control: CGPoint(x: c.x, y: c.y - ey * 1.05))
        ctx.stroke(arc, with: .color(ink.opacity(p.happy)), style: StrokeStyle(lineWidth: 3.4, lineCap: .round))
        if p.happy > 0.99 { continue }
      }
      let open = max(0, p.open) * (1 - p.happy)
      if open < 0.14 {
        var shut = Path()
        shut.move(to: CGPoint(x: c.x - ex * 0.9, y: c.y)); shut.addQuadCurve(to: CGPoint(x: c.x + ex * 0.9, y: c.y), control: CGPoint(x: c.x, y: c.y + 4))
        ctx.stroke(shut, with: .color(ink.opacity(1 - p.happy)), style: StrokeStyle(lineWidth: lw, lineCap: .round))
        continue
      }
      let h = ey * open
      let white = Path(ellipseIn: CGRect(x: c.x - ex, y: c.y - h, width: 2 * ex, height: 2 * h))
      var layer = ctx
      layer.opacity = p.opacity * (1 - p.happy)
      layer.fill(white, with: .color(paper))
      layer.drawLayer { l in
        l.clip(to: white)
        let pr = 5.6 * p.pupil
        let cross = i == 0 ? p.cross : -p.cross
        let pc = CGPoint(x: c.x + p.px + cross, y: c.y + p.py * open)
        l.fill(Path(ellipseIn: CGRect(x: pc.x - pr, y: pc.y - pr, width: 2 * pr, height: 2 * pr)), with: .color(ink))
        l.fill(Path(ellipseIn: CGRect(x: pc.x - pr * 0.55, y: pc.y - pr * 0.6, width: pr * 0.5, height: pr * 0.5)), with: .color(paper))
      }
      if p.droop > 0.01 {
        // A heavy upper lid: cover the top of the eye with the lid's own paper and draw its edge.
        let lidY = c.y - h + p.droop * 2 * h
        layer.drawLayer { l in
          l.clip(to: white)
          l.fill(Path(CGRect(x: c.x - ex - 2, y: c.y - h - 2, width: 2 * ex + 4, height: lidY - (c.y - h) + 2)), with: .color(lid))
        }
        var edge = Path(); edge.move(to: CGPoint(x: c.x - ex * 0.95, y: lidY)); edge.addLine(to: CGPoint(x: c.x + ex * 0.95, y: lidY))
        layer.stroke(edge, with: .color(ink), style: StrokeStyle(lineWidth: lw, lineCap: .round))
      }
      layer.stroke(white, with: .color(ink), lineWidth: lw)
    }
  }

  /// The few motion helpers the eyes use.
  private enum E {
    static func clamp(_ x: Double) -> Double { min(1, max(0, x)) }
    static func seg(_ t: Double, _ a: Double, _ b: Double) -> Double { clamp((t - a) / (b - a)) }
    static func mix(_ a: Double, _ b: Double, _ x: Double) -> Double { a + (b - a) * x }
    static func inOut(_ x: Double) -> Double { let x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2 }
    /// A repeatable random number in [0, 1).
    static func rand(_ seed: UInt64, _ k: Int) -> Double {
      var z = seed &+ UInt64(bitPattern: Int64(k)) &* 0x9E37_79B9_7F4A_7C15
      z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
      z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
      z ^= z >> 31
      return Double(z >> 11) / Double(1 << 53)
    }
  }
}
