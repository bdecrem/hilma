import SwiftUI

/// Flash-card review session. Tap to flip; after the flip, swipe right =
/// "Got it", swipe left = "Again" (requeues a few cards back). A card counts
/// as known only if it was never missed this session. No red exists here.
struct FlashcardsView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    let cards: [Card]

    @State private var queue: [Card] = []
    @State private var missed: Set<String> = []
    @State private var flipped = false
    @State private var drag: CGSize = .zero
    @State private var xpResult: XpResult?
    @State private var submitting = false
    @State private var submitError: String?

    private var total: Int { cards.count }
    private var remainingUnique: Int { Set(queue.map(\.id)).count }
    private var reviewedCount: Int { total - remainingUnique }
    private var progress: Double {
        total > 0 ? Double(reviewedCount) / Double(total) : 0
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            if let xpResult {
                endScreen(xpResult)
            } else if submitting {
                ProgressView()
            } else if let card = queue.first {
                reviewScreen(card)
            }
        }
        .onAppear {
            if queue.isEmpty && xpResult == nil { queue = cards }
        }
    }

    // MARK: Live review

    private func reviewScreen(_ card: Card) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.inkSecondary)
                }
                ProgressView(value: progress)
                    .tint(Theme.accent)
                    .background(Theme.accentTint)
                Text("\(min(reviewedCount + 1, total)) of \(total)")
                    .font(.system(size: 13).monospacedDigit())
                    .foregroundStyle(Theme.inkTertiary)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)

            Spacer()

            cardView(card)
                .offset(x: drag.width, y: drag.height * 0.2)
                .rotationEffect(.degrees(Double(drag.width / 320) * 6))
                .gesture(dragGesture)
                .onTapGesture {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        flipped.toggle()
                    }
                }

            Spacer()

            HStack(spacing: 16) {
                gradeButton("Again", symbol: "arrow.counterclockwise",
                            color: Theme.correction, tint: Theme.correctionTint) {
                    grade(known: false)
                }
                gradeButton("Got it", symbol: "checkmark",
                            color: Theme.accent, tint: Theme.accentTint) {
                    grade(known: true)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .opacity(flipped ? 1 : 0.3)
        }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                guard flipped else { return }
                drag = value.translation
            }
            .onEnded { value in
                guard flipped else {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { drag = .zero }
                    return
                }
                if value.translation.width > 96 {
                    grade(known: true)
                } else if value.translation.width < -96 {
                    grade(known: false)
                } else {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { drag = .zero }
                }
            }
    }

    private func cardView(_ card: Card) -> some View {
        ZStack {
            front(card)
                .opacity(flipped ? 0 : 1)
                .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0))
            back(card)
                .opacity(flipped ? 1 : 0)
                .rotation3DEffect(.degrees(flipped ? 0 : -180), axis: (x: 0, y: 1, z: 0))
        }
        .frame(width: 320, height: 420)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.hairline, lineWidth: 1))
        .shadow(color: .black.opacity(drag == .zero ? 0 : 0.12), radius: 24, y: 8)
        .overlay(alignment: .topTrailing) {
            Image(systemName: "checkmark")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Theme.accent)
                .padding(20)
                .opacity(drag.width > 40 ? Double((drag.width - 40) / 80) : 0)
        }
        .overlay(alignment: .topLeading) {
            Image(systemName: "arrow.counterclockwise")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Theme.correction)
                .padding(20)
                .opacity(drag.width < -40 ? Double((-drag.width - 40) / 80) : 0)
        }
    }

    private func front(_ card: Card) -> some View {
        VStack(spacing: 12) {
            Spacer()
            Text(card.term)
                .font(.target(40, .semibold))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.5)
            if let romanization = card.romanization {
                Text(romanization)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.inkSecondary)
            }
            Spacer()
            Text("Tap to flip")
                .font(.system(size: 13))
                .foregroundStyle(Theme.inkTertiary)
                .padding(.bottom, 20)
        }
        .padding(24)
    }

    private func back(_ card: Card) -> some View {
        VStack(spacing: 16) {
            Text(card.term)
                .font(.target(22, .semibold))
                .foregroundStyle(Theme.ink)
                .padding(.top, 24)
            Spacer()
            Text(card.meaning)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)
            if let example = card.example {
                VStack(spacing: 4) {
                    Text(example)
                        .font(.target(17))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.center)
                    if let translation = card.exampleTranslation {
                        Text(translation)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.inkSecondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.top, 8)
            }
            Spacer()
        }
        .padding(24)
    }

    private func gradeButton(
        _ label: String, symbol: String, color: Color, tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .medium))
                Text(label)
                    .font(.system(size: 17, weight: .semibold))
            }
            .foregroundStyle(color)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(tint)
            .clipShape(Capsule())
        }
        .disabled(!flipped)
    }

    // MARK: Grading + submit

    private func grade(known: Bool) {
        guard let card = queue.first else { return }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()

        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            drag = CGSize(width: known ? 500 : -500, height: 0)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            queue.removeFirst()
            if known {
                // Card leaves the session; "known" is settled at submit time.
            } else {
                missed.insert(card.id)
                let slot = min(3, queue.count)
                queue.insert(card, at: slot)
            }
            drag = .zero
            flipped = false
            if queue.isEmpty { submit() }
        }
    }

    private func submit() {
        submitting = true
        Task {
            do {
                let results = cards.map { (cardId: $0.id, known: !missed.contains($0.id)) }
                let xp = try await API.shared.submitReviews(results)
                session.take(xp)
                xpResult = xp
            } catch {
                submitError = error.localizedDescription
                // Show the end screen anyway — reviews are worth more than XP.
                xpResult = XpResult(
                    earned: 0, leveledUp: false,
                    level: session.progress.level, levelName: session.progress.levelName,
                    xp: session.progress.xp, nextLevelXp: session.progress.nextLevelXp
                )
            }
            submitting = false
        }
    }

    // MARK: End screen

    private func endScreen(_ xp: XpResult) -> some View {
        VStack(spacing: 16) {
            Spacer()
            if xp.leveledUp {
                VStack(spacing: 8) {
                    Eyebrow(text: "Level up")
                    Text("Level \(xp.level)")
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(Theme.ink)
                    Text(xp.levelName)
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.inkSecondary)
                }
                .padding(.bottom, 16)
            }
            Text("\(total) reviewed\(xp.earned > 0 ? " · +\(xp.earned) XP" : "")")
                .font(.system(size: 20, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.ink)
            if let submitError {
                Text(submitError)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.correction)
            }
            Spacer()
            PrimaryButton(title: "Done") { dismiss() }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
        }
    }
}
