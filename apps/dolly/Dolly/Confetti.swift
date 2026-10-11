import SwiftUI

/// A burst of candy confetti, once, for a completed level. Draws its own
/// particles for about three seconds, then is empty.
struct Confetti: View {
    var count = 90
    private let started = Date()
    private let skin = Skin.current

    private struct Piece {
        let x0: CGFloat
        let vx: CGFloat
        let vy: CGFloat
        let spin: Double
        let size: CGFloat
        let color: Int
        let delay: Double
    }

    private var pieces: [Piece] {
        var seed: UInt64 = 0x9E3779B97F4A7C15
        func rnd() -> CGFloat {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return CGFloat((seed >> 33) % 10_000) / 10_000
        }
        return (0..<count).map { _ in
            Piece(x0: rnd(), vx: (rnd() - 0.5) * 420, vy: -(260 + rnd() * 420), spin: Double(rnd() * 8 - 4), size: 6 + rnd() * 8, color: Int(rnd() * 5), delay: Double(rnd() * 0.5))
        }
    }

    var body: some View {
        let colors = [skin.primary, skin.reward, skin.good, skin.word, Color(hex: 0xFF9F6B)]
        let all = pieces
        TimelineView(.animation(minimumInterval: 1 / 60)) { ctx in
            let t = ctx.date.timeIntervalSince(started)
            Canvas { g, size in
                guard t < 3.4 else { return }
                for p in all {
                    let life = t - p.delay
                    guard life > 0 else { continue }
                    let x = p.x0 * size.width + p.vx * CGFloat(life)
                    let y = size.height * 0.42 + p.vy * CGFloat(life) + 520 * CGFloat(life * life)
                    guard y < size.height + 20 else { continue }
                    let fade = max(0, min(1, 1.3 - life / 2.6))
                    var ctxG = g
                    ctxG.opacity = fade
                    ctxG.translateBy(x: x, y: y)
                    ctxG.rotate(by: .radians(p.spin * life))
                    let rect = CGRect(x: -p.size / 2, y: -p.size / 3, width: p.size, height: p.size / 1.5)
                    ctxG.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(colors[p.color % colors.count]))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
