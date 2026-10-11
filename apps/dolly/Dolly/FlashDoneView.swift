import SwiftUI

/// After a flash set: right of ten, the XP it paid (the first five sets a
/// day), a new rank when one came, and another set.
struct FlashDoneView: View {
    let onDone: () -> Void
    let onAgain: () -> Void

    @Environment(AppState.self) private var state
    private let skin = Skin.current

    var body: some View {
        let set = state.flash
        let right = set?.right ?? 0
        let total = set?.total ?? 10
        let clean = right == total && total > 0
        let xp = state.day?.xp ?? .zero
        ZStack {
            skin.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    ZStack {
                        Circle().fill(clean ? skin.reward : skin.word.opacity(0.35)).frame(width: 210, height: 210)
                            .shadow(color: (clean ? skin.reward : skin.word).opacity(0.4), radius: 26)
                        Mascot(size: 160, mood: right >= total / 2 ? .happy : .thinking)
                    }
                    .padding(.top, 24)

                    Text(clean ? "All \(total)!" : "\(right) of \(total)").font(skin.display(40)).foregroundStyle(skin.ink)
                    if let set, set.xp > 0 {
                        XpChip(amount: set.xp, big: true)
                    } else if let set, set.paidLeft == 0 {
                        Text("Practice set: the first five a day earn XP.").font(skin.uiBold(14)).foregroundStyle(skin.ink2)
                    }
                    if let up = xp.rankedUp {
                        RankUpCard(rank: up).padding(.horizontal, 20).padding(.top, 4)
                    }

                    if let set {
                        Card {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("This set".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                                Segments(states: set.questions.indices.map { k in
                                    if let a = set.answers.first(where: { $0.q == k }) { return a.ok ? .ok : .miss }
                                    return .todo
                                }, wide: true)
                                let missed = set.answers.filter { !$0.ok }.compactMap { a in set.questions.indices.contains(a.q) ? set.questions[a.q] : nil }
                                if !missed.isEmpty {
                                    Text("Worth another look".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3).padding(.top, 6)
                                    ForEach(Array(missed.enumerated()), id: \.offset) { _, q in
                                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                                            Text(q.reversed ? q.native : q.target).font(skin.displayMedium(17)).foregroundStyle(skin.word)
                                            Text(q.reversed ? q.target : q.native).font(skin.ui(14)).foregroundStyle(skin.ink2)
                                        }
                                    }
                                }
                                Text("\(set.setsToday) \(set.setsToday == 1 ? "set" : "sets") today · \(set.paidLeft) more \(set.paidLeft == 1 ? "earns" : "earn") XP").font(skin.ui(13)).foregroundStyle(skin.ink3).padding(.top, 4)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 20)
                    }

                    VStack(spacing: 12) {
                        BigButton(title: "Another set", action: onAgain)
                        BigButton(title: "Back to the map", ghost: true, action: onDone)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
                    .padding(.bottom, 28)
                }
            }
            if xp.rankedUp != nil {
                Confetti().ignoresSafeArea()
            }
        }
    }
}
