import OlaKit
import SwiftUI

/// Kit's voice: the eyes (KitEyes.swift), posed by the meeting.
/// Kit speaking: they look at you and bob with the loudness of its voice. You speaking: a steady,
/// attentive look that dips a little as you talk. Thinking: a glance up and aside. Connecting:
/// the reading sweep. Muted: heavy lids (Kit cannot hear you). Over: ^ ^; cut short: a still look.
struct KitVoiceFigure: View {
  enum Mode: Equatable { case connecting, listening, thinking, speaking, muted, over, rest, unavailable }
  var mode: Mode
  var kitLevel: Float = 0
  var youLevel: Float = 0
  var size: CGFloat = 176
  /// A fixed time for screenshots; nil = live.
  var frozen: Double? = nil
  @State private var smoother = Smoother()
  @Environment(\.accessibilityReduceMotion) private var reduce
  @Environment(\.scenePhase) private var phase

  var body: some View {
    ZStack {
      // A disc behind the eyes: lamp-lit and swelling with Kit's voice while it speaks. Light in
      // dark mode too, because the eyes are drawn in ink.
      Circle().fill(mode == .speaking ? Self.lit : Self.disc)
        .frame(width: size * 0.9, height: size * 0.9)
        .scaleEffect(mode == .speaking ? 1 + 0.08 * CGFloat(kitLevel) : 1)
        .animation(.easeOut(duration: 0.12), value: kitLevel)
        .animation(.easeInOut(duration: 0.35), value: mode)
      figure
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }

  static let disc = Color.ola(0xefe9df, 0xe2d9ca)
  static let lit = Color.ola(0xf6eccf, 0xecd9a4)

  var figure: some View {
    Group {
      if let frozen {
        canvas(at: frozen, settle: true)
      } else {
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: phase != .active || mode == .over && smoother.settled)) { ctx in
          canvas(at: ctx.date.timeIntervalSinceReferenceDate, settle: reduce)
        }
      }
    }
  }

  func canvas(at t: Double, settle: Bool) -> some View {
    let target = Self.pose(mode, t: reduce ? 0 : t, kit: Double(kitLevel), you: Double(youLevel))
    let p = settle ? target : smoother.step(to: target, t: t)
    return Canvas { ctx, _ in
      var c = ctx
      c.scaleBy(x: size / 100, y: size / 100)
      Eyes.draw(&c, pose: p)
    }
  }

  static let seed: UInt64 = 0x4B17

  static func pose(_ mode: Mode, t: Double, kit: Double, you: Double) -> Eyes.Pose {
    var p = Eyes.Pose()
    p.px = 0; p.py = 0
    p.open = Eyes.blink(seed: seed, t)
    switch mode {
    case .connecting:
      (p.px, p.py) = Eyes.reading(seed: seed, t)
    case .listening:
      // On you; a small dip as you speak, like a nod along.
      p.px = 0.6 * sin(t * 0.7)
      p.py = 1.5 + 2.2 * you
      p.sink = 1.4 * you
    case .thinking:
      p.px = 4.8; p.py = -5.6
      p.open = min(p.open, 0.9)
    case .speaking:
      // The loudness of Kit's voice lifts the eyes and opens them a touch.
      p.px = 1.1 * sin(t * 1.3)
      p.py = -0.5
      p.sink = -4.5 * kit
      p.wide = 1 + 0.1 * kit
      p.pupil = 1 + 0.14 * kit
    case .muted:
      p.py = 2.5
      p.droop = 0.42
    case .over:
      p.happy = 1
    case .rest:
      p.py = 1.5
    case .unavailable:
      p.px = -1.5; p.py = 5; p.droop = 0.5; p.sink = 2.5
    }
    return p
  }

  /// Eases each frame toward the target pose, so a change of mode is a movement, not a cut.
  /// A reference type: a Canvas closure never sees @State set after the first body.
  final class Smoother {
    var pose: Eyes.Pose?
    var last: Double = 0
    var settled = false

    func step(to target: Eyes.Pose, t: Double) -> Eyes.Pose {
      guard var p = pose, t > last, t - last < 0.5 else {
        pose = target; last = t
        return target
      }
      let k = 1 - exp(-(t - last) * 12)
      last = t
      p = Eyes.Pose.mix(p, target, k)
      p.open = target.open  // blinks are already shaped; do not smooth them away
      p.droop = p.droop + (target.droop - p.droop) * k
      p.happy = p.happy + (target.happy - p.happy) * k
      p.wide = p.wide + (target.wide - p.wide) * k
      settled = abs(p.happy - target.happy) < 0.01 && abs(p.px - target.px) < 0.05
      pose = p
      return p
    }
  }
}
