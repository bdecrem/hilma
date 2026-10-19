import SwiftUI
import UIKit

// The lively mascot. The pose model and the reactions follow
// branding/design/mascot-animation-spec.md (the animation bible written for
// the bookworm bird); since 2026-10-01 the body they drive is the jelly dodo
// in JellyDodo.swift. The position you draw at is the FEET point, and
// squash/stretch anchors there so the ground never slides.

/// One frame's worth of mascot parameters. Compose freely: reactions are
/// pure functions of time that return a pose (usually layered over idle).
struct DodoPose {
    var scaleX: CGFloat = 1
    var scaleY: CGFloat = 1
    var rollDegrees: CGFloat = 0
    var yOffset: CGFloat = 0
    /// Whole-sprout rotation about the stem base.
    var sproutAngle: CGFloat = 0
    /// Extra symmetric leaf spread: + opens, − droops.
    var leafSpread: CGFloat = 0
    var eyeScaleY: CGFloat = 1
    var pupilScale: CGFloat = 1
    var pupilOffset: CGSize = .zero
    /// Wing out-flap, degrees (0 = resting).
    var wingAngle: CGFloat = 0
    var cheekOpacity: CGFloat = 0.6
    var leftFootLift: CGFloat = 0
    var rightFootLift: CGFloat = 0
    /// Horizontal shake offset (the wrong-answer wobble).
    var xShake: CGFloat = 0
    /// > < eyes (1) instead of the round ones — the giggle / honk face.
    var squint: CGFloat = 0
    /// The little open mouth under the beak, 0 closed … 1 wide.
    var mouth: CGFloat = 0
}

/// Deterministic per-cycle jitter (no RNG — frames must be pure in time).
private func hash01(_ n: Int, _ salt: CGFloat) -> CGFloat {
    let v = sin(CGFloat(n) * 127.1 + salt * 311.7) * 43758.5453
    return v - v.rounded(.down)
}

private func bell(_ u: CGFloat) -> CGFloat {
    u > 0 && u < 1 ? sin(u * .pi) : 0
}

/// Spec ease "cubic-bezier(.34,1.56,.64,1)" — a light overshoot pop.
func easeOutBack(_ u: CGFloat) -> CGFloat {
    let c: CGFloat = 1.70158
    let t = u - 1
    return 1 + (c + 1) * t * t * t + c * t * t
}

enum DodoMood {
    /// Idle loop: breathe, counter-swaying leaves, randomized blinks,
    /// a micro look-around every ~8s.
    static func idle(_ t: CGFloat, seed: CGFloat = 0, reduceMotion: Bool = false) -> DodoPose {
        var p = DodoPose()
        // Breath — scaleY 1→1.025→1 over 3.2s, volume-preserving.
        let breath = 0.025 * (0.5 + 0.5 * sin(t * 2 * .pi / 3.2 + seed))
        p.scaleY = 1 + breath
        p.scaleX = 1 - breath * 0.6
        if reduceMotion { return p }

        // Leaves counter-sway ±4°, phase-offset from each other.
        p.leafSpread = 4 * sin(t * 2 * .pi / 3.2 + seed + 0.9)
        p.sproutAngle = 2 * sin(t * 2 * .pi / 5.1 + seed)

        // Blink every 3–5s (per-cycle jitter), 120ms, occasional double.
        let cycle = 4.0 + (hash01(Int((t / 4.0).rounded(.down)), seed) - 0.5) * 2.0
        let cy = Int((t / cycle).rounded(.down))
        let inCycle = t - CGFloat(cy) * cycle
        let blinkAt = 0.6 + hash01(cy, seed + 5) * (cycle - 1.2)
        var eye = blinkShape((inCycle - blinkAt) / 0.12)
        if hash01(cy, seed + 9) > 0.72 {   // double-blink
            eye = min(eye, blinkShape((inCycle - blinkAt - 0.22) / 0.12))
        }
        p.eyeScaleY = eye

        // Micro look-around every ~8s: 2px left, hold, 2px right, back.
        let lookCycle: CGFloat = 8
        let lu = (t + seed * 3).truncatingRemainder(dividingBy: lookCycle) / lookCycle
        if lu > 0.62 && lu < 0.78 {
            p.pupilOffset.width = -2
        } else if lu > 0.80 && lu < 0.92 {
            p.pupilOffset.width = 2
        }
        return p
    }

    private static func blinkShape(_ u: CGFloat) -> CGFloat {
        u > 0 && u < 1 ? 1 - 0.95 * sin(u * .pi) : 1
    }

    /// Walking bob: 2px-ish bounce per step, alternating roll, feet lifts,
    /// sprout trailing the bob by ~80ms. `phase` advances with distance.
    static func walking(_ t: CGFloat, phase: CGFloat) -> DodoPose {
        var p = DodoPose()
        let bounce = abs(sin(phase))
        p.yOffset = -bounce * 13
        p.scaleY = 0.94 + 0.11 * bounce
        p.scaleX = 2 - p.scaleY
        p.rollDegrees = 2 * sin(phase)
        p.sproutAngle = 9 * sin(phase - 0.7)
        p.wingAngle = 10 + 8 * sin(phase * 2)
        p.leftFootLift = max(0, sin(phase)) * 4
        p.rightFootLift = max(0, -sin(phase)) * 4
        p.eyeScaleY = 1
        return p
    }

    /// Happy hop (600ms): anticipate-squash, stretch at apex, land-squash,
    /// sprout boing with damped settle, two wing flaps.
    static func happy(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        if u < 0.13 {                       // anticipation squash
            let a = u / 0.13
            p.scaleY = 1 - 0.06 * a
            p.scaleX = 1 + 0.06 * a
        } else {
            let ju = (u - 0.13) / 0.75
            let hop = bell(ju)
            p.yOffset = -26 * hop
            p.scaleY = 0.96 + 0.12 * hop
            p.scaleX = 2 - p.scaleY
            if ju > 1 {                     // landing squash
                p.scaleY = 0.94; p.scaleX = 1.06
            }
        }
        // Sprout boing: overshoot then two damped oscillations.
        let su = max(0, u - 0.2)
        p.sproutAngle = 14 * exp(-3.2 * su) * sin(su * 14)
        p.wingAngle = 42 * bell(u / 0.5) + 42 * bell((u - 0.45) / 0.5)
        p.cheekOpacity = 0.6 + 0.3 * bell(u)
        p.mouth = 0.5 * bell(u / 0.9)
        return p
    }

    /// Excited (streak / 3 stars): eye pop, cheeks brighten, sprout does a
    /// full wobbling spin. ~1s.
    static func excited(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        p.pupilScale = 1 + 0.35 * easeOutBack(min(1, u / 0.4)) * (1 - max(0, (u - 0.8) / 0.2))
        p.cheekOpacity = 0.6 + 0.3 * bell(u)
        p.sproutAngle = 360 * easeOutBack(u) .truncatingRemainder(dividingBy: 360)
        p.scaleY = 1 + 0.03 * bell(u)
        p.scaleX = 1 - 0.02 * bell(u)
        p.mouth = 0.9 * bell(u / 0.95)
        return p
    }

    /// Thinking: small tilt, one pupil drifts up-left, leaves droop slowly.
    static func thinking(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        p.rollDegrees = 3 * u
        p.pupilOffset = CGSize(width: -2 * u, height: -2 * u)
        p.leafSpread = -6 * u
        return p
    }

    /// Tickled: a giggly wiggle — roll oscillation, squashy bounce, sprout
    /// boing, cheeks up, a double blink. ~1s, then back to idle.
    static func tickled(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        let damp = exp(-2.6 * u)
        p.rollDegrees = 5 * damp * sin(u * 22)
        let bounce = abs(sin(u * .pi * 3)) * damp
        p.yOffset = -8 * bounce
        p.scaleY = 1 + 0.07 * bounce
        p.scaleX = 1 - 0.05 * bounce
        p.sproutAngle = 16 * damp * sin(u * 18 + 1)
        p.cheekOpacity = 0.6 + 0.32 * bell(u)
        p.wingAngle = 24 * damp * abs(sin(u * 12))
        p.eyeScaleY = min(blinkShapePublic((u - 0.25) / 0.12), blinkShapePublic((u - 0.5) / 0.12))
        p.squint = u < 0.72 ? 1 : 0
        p.mouth = 0.7 * damp
        return p
    }

    static func blinkShapePublic(_ u: CGFloat) -> CGFloat {
        u > 0 && u < 1 ? 1 - 0.95 * sin(u * .pi) : 1
    }

    /// Wrong answer, kept kind: ±3px shake (3 cycles, 240ms), sprout flops,
    /// one slow blink; fully back to idle inside a second.
    static func wrong(_ u01: CGFloat) -> DodoPose {
        var p = DodoPose()
        let u = max(0, min(1, u01))
        if u < 0.24 {
            p.xShake = 3 * sin(u / 0.24 * .pi * 6)
        }
        p.leafSpread = -8 * bell(u / 0.9)
        p.eyeScaleY = u > 0.3 && u < 0.75 ? 1 - 0.95 * sin((u - 0.3) / 0.45 * .pi) : 1
        return p
    }
}

/// Draw the mascot into a Canvas. `at` is the FEET point; `height` is the
/// body height in points. The jelly dodo (JellyDodo.swift) does the drawing.
func drawAnimatedDodo(_ ctx: inout GraphicsContext, at p: CGPoint, height: CGFloat, pose: DodoPose,
                      groundShadow: Bool = false) {
    drawJellyDodo(&ctx, at: p, height: height, pose: pose, groundShadow: groundShadow)
}

/// Standalone idle mascot for placing in layouts (the Peck map traveler).
/// `tickleable` makes a tap play a little reaction — tickle, hop, or
/// eye-pop, cycling so repeat taps stay fun.
struct AnimatedDodoView: View {
    var height: CGFloat = 82
    var seed: CGFloat = 0
    var tickleable: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var reactionStart: Date? = nil
    @State private var reactionKind = 0

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            Canvas { ctx, size in
                let t = CGFloat(timeline.date.timeIntervalSinceReferenceDate)
                var pose = DodoMood.idle(t, seed: seed, reduceMotion: reduceMotion)
                if !reduceMotion, let rs = reactionStart {
                    let u = CGFloat(timeline.date.timeIntervalSince(rs))
                    switch reactionKind % 3 {
                    case 0 where u < 1.0:
                        var p = DodoMood.tickled(u)
                        p.eyeScaleY = min(p.eyeScaleY, pose.eyeScaleY)
                        pose = p
                    case 1 where u < 0.75:
                        pose = DodoMood.happy(u / 0.7)
                    case 2 where u < 1.1:
                        var p = DodoMood.excited(u / 1.0)
                        p.scaleY *= pose.scaleY
                        pose = p
                    default:
                        break
                    }
                }
                var g = ctx
                drawAnimatedDodo(&g, at: CGPoint(x: size.width / 2, y: size.height - 3), height: height, pose: pose,
                                 groundShadow: true)
            }
        }
        .frame(width: height * 1.25, height: height * 1.45)
        .allowsHitTesting(tickleable)
        .contentShape(Rectangle())
        .onTapGesture {
            guard tickleable else { return }
            reactionKind += 1
            reactionStart = Date()
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            FlashSFX.shared.play(.boing)
        }
        #if targetEnvironment(simulator)
        // `-TickleDodo 1` — auto-play a tickle for screenshot runs.
        .onAppear {
            if tickleable, UserDefaults.standard.bool(forKey: "TickleDodo") {
                UserDefaults.standard.removeObject(forKey: "TickleDodo")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    reactionKind = 0
                    reactionStart = Date()
                }
            }
        }
        #endif
    }
}

/// A mascot that plays one reaction on appear, then settles into idle.
/// Drop-in for results screens and waiting states.
struct ReactionDodoView: View {
    enum Reaction { case none, happy, excited, thinking }
    var reaction: Reaction = .none
    var height: CGFloat = 84
    var seed: CGFloat = 7

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            Canvas { ctx, size in
                let t = CGFloat(timeline.date.timeIntervalSince(start))
                let wall = CGFloat(timeline.date.timeIntervalSinceReferenceDate)
                var pose = DodoMood.idle(wall, seed: seed, reduceMotion: reduceMotion)
                if !reduceMotion {
                    switch reaction {
                    case .happy where t < 1.4:
                        // A beat to land on screen, then the hop.
                        var p = DodoMood.happy((t - 0.35) / 0.7)
                        p.eyeScaleY = pose.eyeScaleY
                        pose = p
                    case .excited where t < 1.8:
                        var p = DodoMood.excited((t - 0.35) / 1.1)
                        p.scaleY *= pose.scaleY
                        pose = p
                    case .thinking:
                        let u = min(1, t / 0.8)
                        pose.rollDegrees += 3 * u
                        pose.pupilOffset = CGSize(width: -2 * u, height: -2 * u)
                        pose.leafSpread += -6 * u
                    default:
                        break
                    }
                }
                var g = ctx
                drawAnimatedDodo(&g, at: CGPoint(x: size.width / 2, y: size.height - 3), height: height, pose: pose,
                                 groundShadow: true)
            }
        }
        .frame(width: height * 1.3, height: height * 1.45)
        .allowsHitTesting(false)
    }
}
