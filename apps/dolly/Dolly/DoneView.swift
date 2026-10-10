import SwiftUI

/// Day complete: the streak ticks, and what comes back tomorrow. After a star
/// round: what was earned, and the level if it moved. From here: back to the
/// map, Talk more, or (Learning objectives) the star round.
struct DoneView: View {
    var star = false
    let onDone: () -> Void
    var onMore: (() -> Void)? = nil
    var onStar: (() -> Void)? = nil

    @Environment(AppState.self) private var state
    private let skin = Skin.current

    var body: some View {
        let day = state.day
        let starDone = star && day?.star?.state == "done"
        ZStack {
            skin.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    ZStack {
                        Circle().fill(skin.reward).frame(width: 230, height: 230)
                            .shadow(color: skin.reward.opacity(0.5), radius: 30)
                        Mascot(size: 175, mood: .happy)
                        if starDone {
                            Image(systemName: "star.fill").font(.system(size: 44)).foregroundStyle(.white)
                                .shadow(color: skin.rewardDeep, radius: 0, y: 3)
                                .offset(x: 88, y: -88)
                        }
                    }
                    .padding(.top, 24)

                    if starDone, day?.star?.levelUp == true {
                        Text("Level \(day?.objectives.level ?? 0)!").font(skin.display(38)).foregroundStyle(skin.primary)
                        Text(day?.objectives.name ?? "").font(skin.displayMedium(20)).foregroundStyle(skin.ink)
                    } else if starDone {
                        Text("Star day").font(skin.display(34)).foregroundStyle(skin.ink)
                        Text("Level \(day?.objectives.level ?? 1) · \(day?.objectives.earned ?? 0) of \(day?.objectives.total ?? 0)")
                            .font(skin.displayMedium(19)).foregroundStyle(skin.word)
                    } else {
                        Text("Day \(day?.n ?? 0) complete").font(skin.display(34)).foregroundStyle(skin.ink)
                        HStack(spacing: 6) {
                            Image(systemName: "flame.fill").font(.system(size: 20, weight: .bold))
                            Text("\(day?.streak ?? 0) day streak").font(skin.display(22))
                        }
                        .foregroundStyle(skin.primary)
                    }

                    if starDone, let s = day?.star {
                        Card {
                            VStack(alignment: .leading, spacing: 10) {
                                if !s.earned.isEmpty {
                                    Text("You can now".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                                    ForEach(s.earned) { e in
                                        HStack(spacing: 8) {
                                            Image(systemName: "checkmark.circle.fill").foregroundStyle(skin.goodDeep)
                                            Text(e.title).font(skin.uiBold(16)).foregroundStyle(skin.ink)
                                        }
                                    }
                                }
                                let notYet = s.targets.filter { t in !s.earned.contains { $0.id == t.id } }
                                if !notYet.isEmpty {
                                    Text("Next time".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3).padding(.top, 4)
                                    ForEach(notYet) { e in
                                        HStack(spacing: 8) {
                                            Image(systemName: "circle").foregroundStyle(skin.ink3)
                                            Text(e.title).font(skin.ui(16)).foregroundStyle(skin.ink2)
                                        }
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 20)
                    } else {
                        HStack(spacing: 0) {
                            total(mmss(day?.callSeconds ?? 0), "talk")
                            total("\(day?.things.count ?? 0)", "things")
                            total("\(day?.rightCount ?? 0) / \(day?.questions.count ?? 0)", "cards")
                        }
                        .padding(.vertical, 4)

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
                    }

                    VStack(spacing: 12) {
                        if !starDone, let onStar, day?.objectives.on == true, day?.starred == false, day?.objectives.starAvailable == true {
                            BigButton(title: "★ Star the day", action: onStar)
                            if let onMore { BigButton(title: "Talk more", ghost: true, action: onMore) }
                            Button("Back to the map", action: onDone).font(skin.uiBold(15)).foregroundStyle(skin.ink2).padding(.top, 2)
                        } else {
                            BigButton(title: "Back to the map", action: onDone)
                            if let onMore { BigButton(title: "Talk more", ghost: true, action: onMore) }
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
                    .padding(.bottom, 28)
                }
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
