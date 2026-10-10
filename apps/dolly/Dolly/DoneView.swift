import SwiftUI

/// Day complete: the streak ticks, and what comes back tomorrow.
struct DoneView: View {
    let onDone: () -> Void

    @Environment(AppState.self) private var state
    private let skin = Skin.current

    var body: some View {
        let day = state.day
        ZStack {
            skin.background.ignoresSafeArea()
            VStack(spacing: 16) {
                ZStack {
                    Circle().fill(skin.reward).frame(width: 250, height: 250)
                        .shadow(color: skin.reward.opacity(0.5), radius: 30)
                    Mascot(size: 190, mood: .happy)
                }
                .padding(.top, 30)

                Text("Day \(day?.n ?? 0) complete").font(skin.display(34)).foregroundStyle(skin.ink)
                HStack(spacing: 6) {
                    Image(systemName: "flame.fill").font(.system(size: 20, weight: .bold))
                    Text("\(day?.streak ?? 0) day streak").font(skin.display(22))
                }
                .foregroundStyle(skin.primary)

                HStack(spacing: 0) {
                    total(mmss(day?.callSeconds ?? 0), "talk")
                    total("\(day?.things.count ?? 0)", "things")
                    total("\(day?.rightCount ?? 0) / \(day?.questions.count ?? 0)", "cards")
                }
                .padding(.vertical, 6)

                if let back = day?.comingBack, !back.isEmpty {
                    Card {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Coming back tomorrow".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                            FlowChips(items: back)
                            Text("Dolly will work these into tomorrow's call.").font(skin.ui(14)).foregroundStyle(skin.ink2)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 20)
                }

                Spacer(minLength: 0)
                BigButton(title: "Back to the map", action: onDone)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 28)
            }
        }
    }

    private func total(_ big: String, _ small: String) -> some View {
        VStack(spacing: 2) {
            Text(big).font(skin.display(24)).foregroundStyle(skin.ink)
            Text(small).font(skin.uiBold(12)).foregroundStyle(skin.ink3)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Chips that wrap onto as many lines as they need.
struct FlowChips: View {
    let items: [String]
    private let skin = Skin.current

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                chip(item)
            }
        }
    }

    private func chip(_ text: String) -> some View {
        Text(text)
            .font(skin.displayMedium(16))
            .foregroundStyle(skin.word)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Capsule().fill(skin.bgTop))
    }
}
