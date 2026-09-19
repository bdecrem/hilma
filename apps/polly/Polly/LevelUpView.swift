import SwiftUI

/// Quiet celebration that appears the moment the user crosses into a new level.
///
/// Design notes — read top to bottom:
///   - Visual language is the Voice mode orb: warm coral radial glow on the
///     warm-dark page bg. Same brand vocabulary as the rest of the app, so the
///     moment feels earned rather than bolted-on game UI.
///   - One animated star is the hero, with five smaller stars exploding outward
///     in a slow ring. Echoes the StarRow + Feynman-node motifs already used.
///   - Copy keeps the loop visible: current level, current starred-topic count,
///     and what's needed for the NEXT level. Learning apps reward, then aim.
///   - Tap-anywhere dismisses. No timer-based auto-dismiss — let the user dwell.
struct LevelUpView: View {
    let level: Int
    let progress: PollyProgress
    var onDismiss: () -> Void

    @State private var heroScale: CGFloat = 0.6
    @State private var heroPulse: Bool = false
    @State private var ringSpread: CGFloat = 0
    @State private var contentOpacity: Double = 0

    var body: some View {
        ZStack {
            // Solid backdrop — celebration fully owns the frame, no bleed-through.
            PollyTheme.bg
                .ignoresSafeArea()

            // Coral halo — same vocabulary as Voice mode's orb.
            RadialGradient(
                colors: [PollyTheme.accent.opacity(0.35), PollyTheme.accent.opacity(0)],
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
            // Intentionally no tap-anywhere dismiss — the user has to tap the
            // explicit button so they can dwell on the moment.
        }
        .onAppear {
            // Hero star pops in with a bounce.
            withAnimation(.spring(response: 0.45, dampingFraction: 0.55)) {
                heroScale = 1.0
            }
            // Subtle continuous pulse on the hero — the level "breathes".
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                heroPulse = true
            }
            // Surrounding stars expand outward.
            withAnimation(.easeOut(duration: 0.9).delay(0.05)) {
                ringSpread = 1.0
            }
            // Copy fades in just behind the burst.
            withAnimation(.easeOut(duration: 0.5).delay(0.18)) {
                contentOpacity = 1
            }
            // Light haptic — earned, not loud.
            #if os(iOS)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            #endif
        }
    }

    // MARK: - Pieces

    /// Five small gold stars exploding from behind the coral hero star.
    private var burst: some View {
        ZStack {
            // Ring of five stars at 72° offsets.
            ForEach(0..<5, id: \.self) { i in
                let angle = Angle(degrees: Double(i) * 72 - 90)
                let radius: CGFloat = 100 * ringSpread
                Image(systemName: "star.fill")
                    .font(.system(size: 26, weight: .black))
                    .foregroundStyle(PollyTheme.gold)
                    .shadow(color: PollyTheme.gold.opacity(0.5), radius: 8)
                    .offset(
                        x: cos(CGFloat(angle.radians)) * radius,
                        y: sin(CGFloat(angle.radians)) * radius
                    )
                    .opacity(Double(ringSpread))
                    .rotationEffect(.degrees(Double(ringSpread) * 360))
            }

            // Hero star — coral, soft pulse.
            Image(systemName: "star.fill")
                .font(.system(size: 96, weight: .black))
                .foregroundStyle(PollyTheme.accent)
                .shadow(color: PollyTheme.accent.opacity(0.7), radius: 24)
                .scaleEffect(heroScale * (heroPulse ? 1.04 : 1.0))
        }
        .frame(height: 240)
    }

    private var copy: some View {
        VStack(spacing: 6) {
            Text(L("LEVEL UP", "NUOVO LIVELLO", "NIVEAU SUPÉRIEUR", "레벨 업"))
                .font(.system(size: 13, weight: .bold))
                .tracking(2.4)
                .foregroundStyle(PollyTheme.accent)

            Text(L("Level \(level)", "Livello \(level)", "Niveau \(level)", "레벨 \(level)"))
                .font(.system(size: 52, weight: .bold))
                .tracking(-0.8)
                .foregroundStyle(PollyTheme.text)

            Text(headlineCopy)
                .font(.system(size: 16))
                .foregroundStyle(PollyTheme.text2)
                .multilineTextAlignment(.center)

            if progress.toNextLevel > 0 {
                Text(nextGoalCopy)
                    .font(.system(size: 13))
                    .foregroundStyle(PollyTheme.text3)
                    .padding(.top, 6)
            }
        }
        .padding(.horizontal, 16)
    }

    private var dismissButton: some View {
        Button(action: onDismiss) {
            Text(L("Keep going", "Continua", "Continuer", "계속하기"))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(PollyTheme.text)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(PollyTheme.surface, in: Capsule())
                .overlay(Capsule().stroke(PollyTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Copy

    private var headlineCopy: String {
        let n = progress.totalStars
        return "\(n) total \(n == 1 ? "star" : "stars") earned"
    }

    private var nextGoalCopy: String {
        let n = progress.toNextLevel
        return "\(n) more \(n == 1 ? "star" : "stars") to reach L\(level + 1)"
    }
}
