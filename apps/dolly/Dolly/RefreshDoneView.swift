import SwiftUI

/// After a refresher's four cards: the level stays bright (and when the next
/// one is due), or it is still due and can be tried again.
struct RefreshDoneView: View {
    let onDone: () -> Void
    let onAgain: () -> Void

    @Environment(AppState.self) private var state
    private let skin = Skin.current

    var body: some View {
        let r = state.day?.refresh
        let passed = r?.passed == true
        ZStack {
            skin.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    ZStack {
                        Circle().fill(passed ? skin.reward : skin.line).frame(width: 210, height: 210)
                            .shadow(color: (passed ? skin.reward : skin.ink3).opacity(0.4), radius: 26)
                        Mascot(size: 160, mood: passed ? .happy : .thinking)
                        Image(systemName: "flag.fill").font(.system(size: 40, weight: .bold)).foregroundStyle(passed ? .white : skin.ink3)
                            .shadow(color: passed ? skin.rewardDeep : .clear, radius: 0, y: 3)
                            .offset(x: 80, y: -80)
                    }
                    .padding(.top, 24)

                    Text(passed ? "Level \(r?.level ?? 0) stays bright" : "Not this time").font(skin.display(32)).foregroundStyle(skin.ink)
                        .multilineTextAlignment(.center)
                    Text(passed
                         ? "Next refresher \(r?.nextDue.map { "around \(pretty($0))" } ?? "in a while")."
                         : "Level \(r?.level ?? 0) is still due. Try it again whenever you like.")
                        .font(skin.uiBold(15)).foregroundStyle(skin.ink2).multilineTextAlignment(.center).padding(.horizontal, 30)
                    if passed, let xp = state.day?.xp, xp.sum(["refresh"]) > 0 { XpChip(amount: xp.sum(["refresh"]), big: true) }
                    if let up = state.day?.xp.rankedUp { RankUpCard(rank: up).padding(.horizontal, 20) }

                    if let r {
                        Card {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Two things from \(r.name)".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                                ForEach(r.targets) { t in
                                    let got = r.demonstrated.contains { $0.id == t.id }
                                    HStack(spacing: 8) {
                                        Image(systemName: got ? "checkmark.circle.fill" : "circle").foregroundStyle(got ? skin.goodDeep : skin.ink3)
                                        Text(t.title).font(got ? skin.uiBold(16) : skin.ui(16)).foregroundStyle(got ? skin.ink : skin.ink2)
                                    }
                                }
                                Text("Cards: \(r.right) of \(r.total)").font(skin.ui(13)).foregroundStyle(skin.ink3).padding(.top, 2)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 20)
                    }

                    VStack(spacing: 12) {
                        BigButton(title: "Back to the map", action: onDone)
                        if !passed { BigButton(title: "Try again", ghost: true, action: onAgain) }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
                    .padding(.bottom, 28)
                }
            }
        }
    }

    private func pretty(_ day: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: day) else { return day }
        let out = DateFormatter()
        out.dateFormat = "MMMM d"
        return out.string(from: d)
    }
}
