import SwiftUI

/// "Your Spanish": the ladder of eight levels, the current one open with
/// its objectives, earned or not. Learning objectives only.
struct ObjectivesSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    private let skin = Skin.current

    var body: some View {
        let ob = state.day?.objectives
        let language = state.user?.language == "zh" ? "Mandarin" : "Spanish"
        ZStack {
            skin.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        Text("Your \(language)").font(skin.display(28)).foregroundStyle(skin.ink)
                        Spacer()
                        CloseButton { dismiss() }
                    }
                    .padding(.top, 18)

                    if let ob {
                        // The current level first, then the rungs above it, then the ones climbed.
                        let current = ob.ladder.filter { $0.n == ob.level }
                        let above = ob.ladder.filter { $0.n > ob.level }
                        let below = ob.ladder.filter { $0.n < ob.level }.reversed()
                        ForEach(current) { rungRow($0, ob) }
                        if !above.isEmpty {
                            Text("Up next".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                            ForEach(above) { rungRow($0, ob) }
                        }
                        if !below.isEmpty {
                            Text("Climbed".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                            ForEach(Array(below)) { rung in
                                Button {
                                    dismiss()
                                    state.showLevel = rung.n
                                } label: { rungRow(rung, ob) }
                                .buttonStyle(.plain)
                            }
                        }
                        Text("A star round after your day works through the next objectives. Earn them all and the level is complete: a flag on your map, kept bright by a short refresher now and then.")
                            .font(skin.ui(13)).foregroundStyle(skin.ink3).multilineTextAlignment(.center).padding(.top, 6)
                        LevelsLink(level: ob.level).padding(.top, 2)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 30)
            }
        }
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private func rungRow(_ rung: Rung, _ ob: ObjectivesView) -> some View {
        let current = rung.n == ob.level
        let done = rung.n < ob.level
        if current {
            Card(padding: 18) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Level \(rung.n)").font(skin.display(22)).foregroundStyle(skin.word)
                        Text(rung.name).font(skin.displayMedium(20)).foregroundStyle(skin.ink)
                        Spacer()
                        Text("\(ob.earned) of \(ob.total)").font(skin.uiBold(14)).foregroundStyle(skin.ink2)
                    }
                    Text(rung.tagline).font(skin.ui(14)).foregroundStyle(skin.ink2)
                    if ob.canDos.isEmpty {
                        Text("Objectives for this level are on their way.").font(skin.uiBold(14)).foregroundStyle(skin.ink3)
                    }
                    ForEach(ob.canDos) { c in
                        HStack(spacing: 10) {
                            ZStack {
                                Circle().fill(c.earned ? skin.good : skin.line).frame(width: 24, height: 24)
                                if c.earned { Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(skin.onGood) }
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.title).font(c.earned ? skin.uiBold(16) : skin.ui(16)).foregroundStyle(c.earned ? skin.ink : skin.ink2)
                                if c.earned, let e = c.evidence, !e.isEmpty, !e.hasPrefix("by hand") {
                                    Text("You said: \(e)").font(skin.ui(13)).foregroundStyle(skin.word).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(done ? skin.primary : Color.white).frame(width: 34, height: 34)
                    if done {
                        Image(systemName: "checkmark").font(.system(size: 14, weight: .heavy)).foregroundStyle(.white)
                    } else {
                        Text("\(rung.n)").font(skin.display(15)).foregroundStyle(skin.ink3)
                    }
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(rung.name).font(skin.displayMedium(17)).foregroundStyle(done ? skin.ink : skin.ink2)
                    Text(rung.authored ? rung.tagline : "\(rung.tagline) Coming later.").font(skin.ui(13)).foregroundStyle(skin.ink3)
                }
                Spacer()
                if done, let lv = state.day?.levels.first(where: { $0.level == rung.n }) {
                    HStack(spacing: 4) {
                        Image(systemName: "flag.fill").font(.system(size: 11, weight: .bold))
                        Text(lv.due ? "due" : "bright").font(skin.uiBold(11))
                    }
                    .foregroundStyle(lv.due ? skin.ink3 : skin.rewardDeep)
                }
                Text(rung.cefr).font(skin.uiBold(11)).foregroundStyle(skin.ink3)
            }
            .padding(.horizontal, 6)
            .opacity(done ? 1 : 0.8)
        }
    }
}
