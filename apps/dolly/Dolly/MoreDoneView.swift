import SwiftUI

/// After an extra call (Talk more): the three things it produced. They are
/// in the pool now and come back tomorrow; no say-back round, no cards.
struct MoreDoneView: View {
    let onDone: () -> Void
    let onMore: () -> Void

    @Environment(AppState.self) private var state
    private let skin = Skin.current

    var body: some View {
        let things = state.day?.lastExtraThings ?? []
        ZStack {
            skin.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    Mascot(size: 150, mood: .happy).padding(.top, 24)
                    Text("From that call").font(skin.display(32)).foregroundStyle(skin.ink)
                    Text("\(state.day?.extraCalls ?? 1) extra \((state.day?.extraCalls ?? 1) == 1 ? "call" : "calls") today · \(max(state.day?.extraMinutes ?? 0, 1)) min")
                        .font(skin.uiBold(14)).foregroundStyle(skin.ink2)

                    VStack(spacing: 12) {
                        ForEach(things) { t in
                            Card(padding: 18) {
                                VStack(alignment: .leading, spacing: 6) {
                                    Tag(text: t.kindLabel, color: tagColor(t.kind))
                                    Text(t.target).font(skin.display(26)).foregroundStyle(skin.word).minimumScaleFactor(0.7)
                                    if let p = t.pinyin, !p.isEmpty { Text(p).font(skin.uiBold(15)).foregroundStyle(skin.ink2) }
                                    Text(t.native).font(skin.uiBold(17)).foregroundStyle(skin.ink)
                                    Text(t.source).font(skin.ui(13)).foregroundStyle(skin.ink3)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    .padding(.horizontal, 20)

                    Text("These come back in tomorrow's call and cards.").font(skin.ui(14)).foregroundStyle(skin.ink2)
                        .multilineTextAlignment(.center).padding(.horizontal, 30)

                    VStack(spacing: 12) {
                        BigButton(title: "Back to the map", action: onDone)
                        BigButton(title: "Talk more", ghost: true, action: onMore)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
                    .padding(.bottom, 28)
                }
            }
        }
    }

    private func tagColor(_ kind: String) -> Color {
        switch kind {
        case "fix": return skin.fix
        case "word": return skin.word
        default: return skin.phrase
        }
    }
}
