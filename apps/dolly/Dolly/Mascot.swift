import SwiftUI

/// Dolly's mascot — the skin says which jelly (Gummy, in candy): two frames
/// from misc/dodo-redesign (eyes open; > < squish) and a little motion per
/// mood. Talking squishes on a beat, listening leans in, happy bounces,
/// thinking tilts, idle bobs.
struct Mascot: View {
    enum Mood { case idle, talking, listening, thinking, happy, sleepy }

    let size: CGFloat
    let mood: Mood
    @State private var poked = false

    var body: some View {
        let skin = Skin.current
        TimelineView(.animation(minimumInterval: 1 / 30)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            let m = motion(t)
            Image(poked || m.squish ? skin.mascotSquish : skin.mascot)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .scaleEffect(x: m.sx, y: m.sy, anchor: .bottom)
                .rotationEffect(.degrees(m.tilt), anchor: .bottom)
                .offset(y: m.dy)
        }
        .frame(width: size, height: size)
        .contentShape(Rectangle())
        .onTapGesture {
            poked = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { poked = false }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.5), value: poked)
        .accessibilityHidden(true)
    }

    private struct Motion {
        var sx: CGFloat = 1
        var sy: CGFloat = 1
        var tilt: Double = 0
        var dy: CGFloat = 0
        var squish = false
    }

    private func motion(_ t: Double) -> Motion {
        var m = Motion()
        switch mood {
        case .idle:
            let b = sin(t * 1.6)
            m.sy = 1 + 0.025 * b
            m.sx = 1 - 0.02 * b
            m.dy = -3 * max(0, b)
        case .talking:
            // A beak-flap beat: a quick squash every ~0.36 s.
            let p = (t * 2.8).truncatingRemainder(dividingBy: 1)
            let k = p < 0.35 ? sin(p / 0.35 * .pi) : 0
            m.sy = 1 - 0.12 * k
            m.sx = 1 + 0.08 * k
            m.squish = k > 0.75
            m.tilt = 2 * sin(t * 1.3)
        case .listening:
            m.tilt = -7 + 1.5 * sin(t * 1.2)
            m.sx = 0.98
            m.sy = 1.04
        case .thinking:
            m.tilt = 6
            m.dy = 2 * sin(t * 2.2)
        case .happy:
            let b = abs(sin(t * 4))
            m.dy = -18 * b
            m.sy = 1 + 0.06 * b
            m.sx = 1 - 0.04 * b
            m.squish = b > 0.5
        case .sleepy:
            m.sy = 0.96 + 0.02 * sin(t * 0.9)
            m.tilt = 10
        }
        return m
    }
}
