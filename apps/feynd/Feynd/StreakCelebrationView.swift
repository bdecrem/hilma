import SwiftUI

/// The streak moment — shown when the daily-card streak crosses a milestone
/// (and on tap of the flame pill, as a status card). An excited Dodo, a
/// drift of sparkles, the flame count, and what the streak is paying.
struct StreakMilestone: Identifiable {
    let days: Int
    let multiplier: Int
    /// True when this is a milestone crossing (big copy); false when the
    /// user just tapped the pill to peek.
    var celebration: Bool = true
    var id: Int { days * (celebration ? 1 : -1) }
}

struct StreakCelebrationView: View {
    let milestone: StreakMilestone
    var onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var heroScale: CGFloat = 0.6
    @State private var contentOpacity: Double = 0
    @State private var sparkleOn = false

    var body: some View {
        ZStack {
            FeyndTheme.bg.ignoresSafeArea()

            // Warm ember halo behind the flame.
            RadialGradient(
                colors: [Color(hex: 0xE8853A).opacity(0.30), Color(hex: 0xE8853A).opacity(0)],
                center: .center, startRadius: 1, endRadius: 320
            )
            .ignoresSafeArea()

            sparkles

            VStack(spacing: 22) {
                Spacer()

                ZStack {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 88, weight: .bold))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(hex: 0xF0A830), Color(hex: 0xE0635A)],
                                startPoint: .top, endPoint: .bottom
                            )
                        )
                    Text("\(milestone.days)")
                        .font(.system(size: 34, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .offset(y: 14)
                }
                .scaleEffect(heroScale)

                Text(milestone.celebration ? "\(milestone.days)-day streak!" : "\(milestone.days)-day streak")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(FeyndTheme.text)

                Text(subtitle)
                    .font(.system(size: 16.5))
                    .foregroundStyle(FeyndTheme.text2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 36)

                ReactionDodoView(reaction: .excited, height: 96)

                Spacer()

                Button(action: onDismiss) {
                    Text("Keep it going")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(hex: 0x261C06))
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(FeyndTheme.gold, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 28)
                .padding(.bottom, 30)
            }
            .opacity(contentOpacity)
        }
        .onTapGesture { onDismiss() }
        .onAppear {
            if reduceMotion {
                heroScale = 1; contentOpacity = 1; return
            }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.55)) { heroScale = 1 }
            withAnimation(.easeOut(duration: 0.4)) { contentOpacity = 1 }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                sparkleOn = true
            }
        }
    }

    /// What the streak pays, and what's next on the ladder.
    private var subtitle: String {
        let m = milestone.multiplier
        let next: String
        switch milestone.days {
        case ..<4: next = "XP ×2 starts at 4 days."
        case ..<10: next = "×3 lights up at 10 days."
        case ..<14: next = "×4 lights up at 14 days."
        default: next = "Maximum burn."
        }
        let now = m > 1
            ? "Every answer pays ×\(m) — daily cards and Peck rounds alike."
            : "Answer the daily card every day to build it."
        return "\(now) \(next)"
    }

    private struct Sparkle: Identifiable {
        let id: Int
        let x: CGFloat
        let y: CGFloat
        let size: CGFloat
    }

    private static let sparklePoints: [Sparkle] = [
        Sparkle(id: 0, x: 0.18, y: 0.22, size: 14),
        Sparkle(id: 1, x: 0.82, y: 0.18, size: 11),
        Sparkle(id: 2, x: 0.10, y: 0.48, size: 9),
        Sparkle(id: 3, x: 0.90, y: 0.42, size: 13),
        Sparkle(id: 4, x: 0.24, y: 0.66, size: 10),
        Sparkle(id: 5, x: 0.76, y: 0.62, size: 9),
        Sparkle(id: 6, x: 0.50, y: 0.12, size: 10),
        Sparkle(id: 7, x: 0.64, y: 0.30, size: 8),
    ]

    /// A loose drift of sparkles around the flame — decorative, cheap, and
    /// static under Reduce Motion.
    private var sparkles: some View {
        GeometryReader { geo in
            ForEach(Self.sparklePoints) { p in
                sparkleImage(p, in: geo.size)
            }
        }
        .allowsHitTesting(false)
    }

    private func sparkleImage(_ p: Sparkle, in size: CGSize) -> some View {
        let anim: Animation? = reduceMotion ? nil :
            Animation.easeInOut(duration: 1.2 + Double(p.id) * 0.18)
                .repeatForever(autoreverses: true)
                .delay(Double(p.id) * 0.12)
        return Image(systemName: p.id % 2 == 0 ? "sparkles" : "sparkle")
            .font(.system(size: p.size, weight: .bold))
            .foregroundStyle(FeyndTheme.gold.opacity(sparkleOn ? 0.85 : 0.25))
            .scaleEffect(sparkleOn ? 1.0 : 0.6)
            .position(x: size.width * p.x, y: size.height * p.y)
            .animation(anim, value: sparkleOn)
    }
}
