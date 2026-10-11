import SwiftUI

/// A completed level, from its flag on the trail: what was mastered, with
/// the learner's own line for each objective, whether it is bright or due a
/// refresher, and the way into one. Links to the full curriculum.
struct LevelSheet: View {
    let level: Int
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    private let skin = Skin.current

    private var view: LevelView? { state.day?.levels.first { $0.level == level } }

    var body: some View {
        ZStack {
            skin.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Level \(level) · \(view?.cefr ?? "")".uppercased()).font(skin.uiBold(11)).tracking(1.2).foregroundStyle(skin.ink3)
                            Text(view?.name ?? "Level \(level)").font(skin.display(30)).foregroundStyle(skin.ink)
                        }
                        Spacer()
                        CloseButton { dismiss() }
                    }
                    .padding(.top, 18)

                    if let v = view {
                        HStack(spacing: 14) {
                            ZStack {
                                Circle().fill(v.due ? skin.line : skin.reward).frame(width: 64, height: 64)
                                    .background(Circle().fill(v.due ? skin.trailNext : skin.rewardDeep).offset(y: 4))
                                Image(systemName: "flag.fill").font(.system(size: 26, weight: .bold)).foregroundStyle(v.due ? skin.ink3 : skin.onReward)
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                Text(v.due ? "Refresher due" : "Bright").font(skin.display(20)).foregroundStyle(v.due ? skin.ink2 : skin.ink)
                                Text(v.due ? "Completed \(pretty(v.completedDay)). A short call on two things, then four cards, keeps it." : "Completed \(pretty(v.completedDay)) · refresher due \(pretty(v.refreshDue))")
                                    .font(skin.ui(13)).foregroundStyle(skin.ink2).fixedSize(horizontal: false, vertical: true)
                                if v.refreshCount > 0 {
                                    Text("Refreshed \(v.refreshCount) \(v.refreshCount == 1 ? "time" : "times")").font(skin.uiBold(12)).foregroundStyle(skin.ink3)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 4)

                        if v.due || state.day?.dayState.inRefresher == true {
                            BigButton(title: state.day?.dayState.inRefresher == true ? "Refresher: finish the cards" : "Refresh now") {
                                dismiss()
                                if state.day?.dayState.inRefresher == true {
                                    state.flow = .cards
                                } else {
                                    state.refreshLevel = level
                                    state.flow = .refresh
                                }
                            }
                        }

                        Card(padding: 18) {
                            VStack(alignment: .leading, spacing: 14) {
                                Text("You can".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                                ForEach(v.canDos) { c in
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack(spacing: 10) {
                                            ZStack {
                                                Circle().fill(skin.good).frame(width: 24, height: 24)
                                                Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(skin.onGood)
                                            }
                                            Text(c.title).font(skin.uiBold(16)).foregroundStyle(skin.ink)
                                        }
                                        if let e = c.evidence, !e.isEmpty, !e.hasPrefix("by hand") {
                                            Text("You said: \(e)").font(skin.ui(14)).foregroundStyle(skin.word)
                                                .padding(.leading, 34).fixedSize(horizontal: false, vertical: true)
                                        }
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        if !v.due {
                            BigButton(title: "Refresh it anyway", ghost: true) {
                                dismiss()
                                state.refreshLevel = level
                                state.flow = .refresh
                            }
                        }
                        LevelsLink(title: "This level in the full curriculum", level: level).padding(.top, 4)
                    } else {
                        Text("This level isn’t completed yet.").font(skin.uiBold(15)).foregroundStyle(skin.ink2).padding(.top, 30)
                        LevelsLink(level: level)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 30)
            }
        }
        .presentationDragIndicator(.visible)
    }

    private func pretty(_ day: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: day) else { return day }
        let out = DateFormatter()
        out.dateFormat = "MMM d"
        return out.string(from: d)
    }
}
