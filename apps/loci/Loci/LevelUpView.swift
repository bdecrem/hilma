import SwiftUI

/// Quiet celebration when the user crosses into a new level — Loci's port of
/// Feynd's LevelUpView, restyled for paper-and-ink: moss halo, ochre star
/// ring, serif level number. No timer auto-dismiss; the user dwells, then
/// taps the one button.
struct LevelUpView: View {
    let level: Int
    let progress: UserProgress
    var onDismiss: () -> Void

    @State private var heroScale: CGFloat = 0.6
    @State private var heroPulse: Bool = false
    @State private var ringSpread: CGFloat = 0
    @State private var contentOpacity: Double = 0

    var body: some View {
        ZStack {
            Theme.bg
                .ignoresSafeArea()

            RadialGradient(
                colors: [Theme.moss.opacity(0.28), Theme.moss.opacity(0)],
                center: .center, startRadius: 1, endRadius: 320
            )
            .ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer()
                burst
                copy
                Spacer()
                dismissButton
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
            .opacity(contentOpacity)
        }
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.55)) {
                heroScale = 1.0
            }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                heroPulse = true
            }
            withAnimation(.easeOut(duration: 0.9).delay(0.05)) {
                ringSpread = 1.0
            }
            withAnimation(.easeOut(duration: 0.5).delay(0.18)) {
                contentOpacity = 1
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    // MARK: Pieces

    /// Five small ochre stars expanding from behind the moss hero star.
    private var burst: some View {
        ZStack {
            ForEach(0..<5, id: \.self) { i in
                let angle = Angle(degrees: Double(i) * 72 - 90)
                let radius: CGFloat = 100 * ringSpread
                Image(systemName: "star.fill")
                    .font(.system(size: 26, weight: .black))
                    .foregroundStyle(Theme.ochre)
                    .shadow(color: Theme.ochre.opacity(0.4), radius: 8)
                    .offset(
                        x: cos(CGFloat(angle.radians)) * radius,
                        y: sin(CGFloat(angle.radians)) * radius
                    )
                    .opacity(Double(ringSpread))
                    .rotationEffect(.degrees(Double(ringSpread) * 360))
            }

            Image(systemName: "star.fill")
                .font(.system(size: 96, weight: .black))
                .foregroundStyle(Theme.moss)
                .shadow(color: Theme.moss.opacity(0.6), radius: 24)
                .scaleEffect(heroScale * (heroPulse ? 1.04 : 1.0))
        }
        .frame(height: 240)
    }

    private var copy: some View {
        VStack(spacing: 6) {
            Text("LEVEL UP")
                .font(.system(size: 13, weight: .bold))
                .tracking(2.4)
                .foregroundStyle(Theme.moss)

            Text("Level \(level)")
                .font(.system(size: 52, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)

            Text("\(lociLevelTitle(level)) — \(progress.totalStars) total \(progress.totalStars == 1 ? "star" : "stars") earned")
                .font(.system(size: 16, design: .serif))
                .italic()
                .foregroundStyle(Theme.ink2)
                .multilineTextAlignment(.center)

            if progress.toNextLevel > 0 {
                Text("\(progress.toNextLevel) more \(progress.toNextLevel == 1 ? "star" : "stars") to Level \(level + 1)")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.ink3)
                    .padding(.top, 6)
            }
        }
        .padding(.horizontal, 16)
    }

    private var dismissButton: some View {
        Button(action: onDismiss) {
            Text("Keep going")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Theme.surface, in: Capsule())
                .overlay(Capsule().stroke(Theme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
