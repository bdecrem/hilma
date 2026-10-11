import SwiftUI

/// Home. Today's three steps on top, the trail of days below, one button
/// for whichever part is next. Five states: morning, after the talk, after
/// the things, paused mid-cards, done.
struct MapView: View {
    @Environment(AppState.self) private var state
    private let skin = Skin.current

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(spacing: 18) {
                header
                if let day = state.day {
                    if day.objectives.on, let b = day.banner, !bannerDismissed(b, day) {
                        banner(b, day)
                    }
                    dayLine(day)
                    todayCard(day)
                    Trail(nodes: day.trail,
                          dueLevels: Set(day.levels.filter(\.due).map(\.level)),
                          showFlags: day.objectives.on,
                          onLevel: { n in state.showLevel = n })
                        .frame(height: 300)
                        .padding(.top, 6)
                        .id("trail")
                    startOver(day)
                } else if let err = state.loadError {
                    Card {
                        VStack(spacing: 12) {
                            Text("Couldn't reach Dolly.").font(skin.displayMedium(20)).foregroundStyle(skin.ink)
                            Text(err).font(skin.ui(14)).foregroundStyle(skin.ink2).multilineTextAlignment(.center)
                            BigButton(title: "Try again", ghost: true) { Task { await state.refresh() } }
                        }
                    }
                } else {
                    ProgressView().padding(.top, 60)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 40)
        }
        .refreshable { await state.refresh() }
        .task {
            // Coming back to the map after a flow or a day boundary: re-read.
            if state.flow == nil { await state.refresh() }
        }
        .onChange(of: state.flow) { _, flow in
            if flow == nil { Task { await state.refresh() } }
        }
        .task {
            // `-ScrollTo trail`: a simulator drive looks at the trail.
            guard UserDefaults.standard.string(forKey: "ScrollTo") == "trail" else { return }
            while state.day == nil { try? await Task.sleep(for: .milliseconds(200)) }
            try? await Task.sleep(for: .seconds(1))
            withAnimation { proxy.scrollTo("trail", anchor: .bottom) }
        }
        }
    }

    /// Top left: you — the jelly avatar, your rank and XP, a tap for the whole
    /// story. Top right: the streak and the gear. (Dolly's own face, Gummy, is
    /// on the voice and finish screens; the map is yours.)
    private var header: some View {
        let xp = state.day?.xp ?? .zero
        let critter = JellyCritter.from(state.user?.avatar)
        return HStack(spacing: 10) {
            Button {
                state.showYou = true
            } label: {
                HStack(spacing: 10) {
                    JellyAvatarDisc(critter: critter, size: 46)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(state.user?.name ?? xp.rank.name).font(skin.display(18)).foregroundStyle(skin.ink).lineLimit(1)
                        HStack(spacing: 6) {
                            Text(state.user?.name == nil ? "\(xp.total) XP" : "\(xp.rank.name) · \(xp.total) XP")
                                .font(skin.uiBold(12)).foregroundStyle(skin.ink2).lineLimit(1)
                            RankBar(progress: xp.progress, height: 5).frame(width: 44)
                        }
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel("You: \(xp.rank.name), \(xp.total) XP")
            Spacer(minLength: 4)
            StreakPill(streak: state.day?.streak ?? state.user?.streak ?? 0)
        }
    }

    // MARK: The banner slot — one thing at a time, dismissable for the day.

    @State private var dismissedBanner: String?

    private func bannerKey(_ b: Banner, _ day: DayView) -> String { "bannerDismissed:\(b.kind):\(b.level):\(day.day)" }

    private func bannerDismissed(_ b: Banner, _ day: DayView) -> Bool {
        dismissedBanner == bannerKey(b, day) || UserDefaults.standard.bool(forKey: bannerKey(b, day))
    }

    private func banner(_ b: Banner, _ day: DayView) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(skin.line).frame(width: 40, height: 40)
                Image(systemName: "flag.fill").font(.system(size: 17, weight: .bold)).foregroundStyle(skin.ink3)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(b.title).font(skin.displayMedium(17)).foregroundStyle(skin.ink)
                Text(b.text).font(skin.ui(13)).foregroundStyle(skin.ink2).fixedSize(horizontal: false, vertical: true)
                Button {
                    if day.dayState.inRefresher {
                        state.flow = .cards
                    } else {
                        state.refreshLevel = b.level
                        state.flow = .refresh
                    }
                } label: {
                    Text(day.dayState.inRefresher ? "Finish the cards" : "Refresh now")
                        .font(skin.uiBold(14)).foregroundStyle(skin.onPrimary)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Capsule().fill(skin.primary))
                        .background(Capsule().fill(skin.primaryDeep).offset(y: 3))
                }
                .buttonStyle(PressStyle())
                .padding(.top, 4)
            }
            Spacer(minLength: 0)
            Button {
                let key = bannerKey(b, day)
                UserDefaults.standard.set(true, forKey: key)
                withAnimation { dismissedBanner = key }
            } label: {
                Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(skin.ink3).frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss")
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color.white.opacity(0.78)))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(skin.line, lineWidth: 2))
    }

    private func dayLine(_ day: DayView) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Day \(day.n)").font(skin.display(34)).foregroundStyle(skin.word)
                Spacer()
                Text(day.stepsDone == 3 ? "Done for today" : "\(weekday()) · \(day.stepsDone) of 3 done")
                    .font(skin.uiBold(14)).foregroundStyle(skin.ink2)
            }
            if day.objectives.on {
                Button { state.showObjectives = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "star.fill").font(.system(size: 12, weight: .bold)).foregroundStyle(skin.reward)
                        Text("Level \(day.objectives.level) · \(day.objectives.name) · \(day.objectives.earned) of \(day.objectives.total)")
                            .font(skin.uiBold(14)).foregroundStyle(skin.ink2)
                        if let due = day.objectives.refreshDue {
                            Image(systemName: "flag.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(skin.ink3)
                            Text("Level \(due.level) due").font(skin.uiBold(12)).foregroundStyle(skin.ink3)
                        }
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(skin.ink3)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Your objectives")
            }
        }
    }

    private func todayCard(_ day: DayView) -> some View {
        let steps: [(String, String)] = [
            ("Talk", "3 min with Dolly"),
            ("Three things", "say them back"),
            ("Cards", day.dayState == .paused ? "\(day.answers.count) of \(day.questions.count) · paused" : day.questions.isEmpty ? "ten questions" : "\(day.questions.count) questions"),
        ]
        return Card {
            VStack(spacing: 14) {
                Text(day.topic).font(skin.displayMedium(18)).foregroundStyle(skin.ink2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if day.stepsDone == 3 {
                    // Done: the three parts in one quiet row.
                    HStack(spacing: 14) {
                        ForEach(Array(steps.enumerated()), id: \.offset) { _, s in
                            HStack(spacing: 6) {
                                Image(systemName: "checkmark.circle.fill").font(.system(size: 15, weight: .bold)).foregroundStyle(skin.goodDeep)
                                Text(s.0).font(skin.uiBold(13)).foregroundStyle(skin.ink2)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
                ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                    if day.stepsDone < 3 {
                    let done = i < day.stepsDone
                    let cur = i == day.stepsDone
                    HStack(spacing: 12) {
                        ZStack {
                            Circle().fill(done ? skin.good : cur ? skin.reward : skin.line).frame(width: 32, height: 32)
                                .background(Circle().fill(done ? skin.goodDeep : cur ? skin.rewardDeep : .clear).offset(y: 3))
                            if done {
                                Image(systemName: "checkmark").font(.system(size: 14, weight: .heavy)).foregroundStyle(skin.onGood)
                            } else {
                                Text("\(i + 1)").font(skin.display(16)).foregroundStyle(cur ? skin.onReward : skin.ink2)
                            }
                        }
                        Text(s.0).font(skin.displayMedium(19)).foregroundStyle(cur || done ? skin.ink : skin.ink3)
                        Spacer()
                        Text(s.1).font(skin.ui(14)).foregroundStyle(skin.ink3)
                    }
                    .opacity(i > day.stepsDone ? 0.6 : 1)
                    }
                }
                if day.stepsDone == 3 {
                    VStack(spacing: 4) {
                        Text("Tomorrow \(day.dailyLabel)".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                        Text(day.tomorrow ?? "A new topic").font(skin.displayMedium(19)).foregroundStyle(skin.ink)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(skin.bgTop.opacity(0.6)))
                    afterDay(day)
                } else {
                    BigButton(title: buttonTitle(day)) {
                        if let next = state.nextStep { state.flow = next }
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    /// Below the tomorrow block: the star round or a refresher when there is
    /// one, Talk more (pink and full width otherwise), a small Flash cards
    /// link, and today's tally.
    @ViewBuilder
    private func afterDay(_ day: DayView) -> some View {
        VStack(spacing: 12) {
            if day.dayState.inRefresher {
                BigButton(title: day.dayState == .refreshPaused ? "Refresher: resume cards" : "Refresher: cards") {
                    if let next = state.nextStep { state.flow = next }
                }
            } else if day.dayState.inStarRound {
                BigButton(title: day.dayState == .starAfterTalk ? "Star round: three things" : day.dayState == .starPaused ? "Star round: resume cards" : "Star round: cards") {
                    if let next = state.nextStep { state.flow = next }
                }
            } else if day.objectives.on, let due = day.objectives.refreshDue {
                // A completed level's refresher comes before the next star round.
                BigButton(title: "Refresh Level \(due.level): \(due.name)") {
                    state.refreshLevel = due.level
                    state.flow = .refresh
                }
                BigButton(title: "Talk more", ghost: true) { state.flow = .more }
            } else if day.objectives.on, !day.starred, day.objectives.starAvailable {
                BigButton(title: "★ Star the day") { state.flow = .star }
                BigButton(title: "Talk more", ghost: true) { state.flow = .more }
            } else {
                BigButton(title: "Talk more") { state.flow = .more }
            }
            // Flash cards: a small jelly pill under the button.
            FlashPill {
                state.flash = nil
                state.flow = .flash
            }
            .padding(.top, 2)
            let tally = tallyLine(day)
            if !tally.isEmpty {
                Text(tally).font(skin.ui(12)).foregroundStyle(skin.ink3).multilineTextAlignment(.center)
            }
        }
        .padding(.top, 2)
    }

    /// "Starred · 2 extra calls · 3 sets of cards · +48 XP today"
    private func tallyLine(_ day: DayView) -> String {
        var parts: [String] = []
        if day.starred { parts.append("★ Starred") }
        if day.extraCalls > 0 { parts.append("\(day.extraCalls) extra \(day.extraCalls == 1 ? "call" : "calls")") }
        if day.flashToday > 0 { parts.append("\(day.flashToday) \(day.flashToday == 1 ? "set" : "sets") of cards") }
        if day.xp.today > 0 { parts.append("+\(day.xp.today) XP today") }
        return parts.joined(separator: " · ")
    }

    /// A small way back to the morning, for doing today over.
    @State private var confirmReset = false
    @State private var resetting = false

    private func startOver(_ day: DayView) -> some View {
        Button {
            confirmReset = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.counterclockwise").font(.system(size: 12, weight: .bold))
                Text(resetting ? "Starting over…" : "Start today over").font(skin.uiBold(13))
            }
            .foregroundStyle(skin.ink3)
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .disabled(resetting || day.dayState == .morning)
        .opacity(day.dayState == .morning ? 0.35 : 1)
        .confirmationDialog("Start today over?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Start over", role: .destructive) {
                Task {
                    resetting = true
                    defer { resetting = false }
                    if let fresh = try? await DollyAPI.shared.resetToday() { state.apply(fresh) }
                    await state.refresh()
                }
            }
            Button("Keep today", role: .cancel) {}
        } message: {
            Text("The call, the three things, the cards, any extra calls and the star round go back to the morning. What you've learned stays.")
        }
    }

    private func buttonTitle(_ day: DayView) -> String {
        switch day.dayState {
        case .morning: return "Start today"
        case .afterTalk: return "Next: Three things"
        case .afterThings: return "Next: Cards"
        case .paused: return "Resume cards"
        case .done, .starAfterTalk, .starAfterThings, .starPaused, .refreshCards, .refreshPaused: return "Done"
        }
    }

    private func weekday() -> String {
        let f = DateFormatter()
        f.dateFormat = "EEEE"
        return f.string(from: Date())
    }
}

/// The trail of days, bottom to top, the design's curve: eight nodes on a
/// 335 × 300 stage scaled to the width.
struct Trail: View {
    let nodes: [TrailNode]
    /// Completed levels whose refresher is due: their flags are dimmed.
    var dueLevels: Set<Int> = []
    var showFlags = true
    var onLevel: ((Int) -> Void)? = nil
    private let skin = Skin.current
    private static let xs: [CGFloat] = [70, 160, 250, 292, 236, 142, 68, 112]
    private static let stage = CGSize(width: 335, height: 300)

    private func point(_ i: Int, _ s: CGFloat) -> CGPoint {
        CGPoint(x: Self.xs[min(i, Self.xs.count - 1)] * s, y: (282 - CGFloat(i) * 38) * s)
    }

    private func path(from: Int, to: Int, _ s: CGFloat) -> Path {
        var p = Path()
        p.move(to: point(from, s))
        if to > from {
            for i in (from + 1)...to {
                let a = point(i - 1, s)
                let b = point(i, s)
                p.addCurve(to: b, control1: CGPoint(x: a.x, y: a.y - 22 * s), control2: CGPoint(x: b.x, y: b.y + 22 * s))
            }
        }
        return p
    }

    var body: some View {
        GeometryReader { geo in
            let s = min(geo.size.width / Self.stage.width, geo.size.height / Self.stage.height)
            let todayIdx = nodes.firstIndex(where: \.today) ?? 0
            ZStack(alignment: .topLeading) {
                path(from: 0, to: nodes.count - 1, s)
                    .stroke(skin.trailNext, style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [2, 9]))
                path(from: 0, to: todayIdx, s)
                    .stroke(skin.primary, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                ForEach(Array(nodes.enumerated()), id: \.offset) { i, node in
                    let p = point(i, s)
                    let bonus = node.n % 7 == 0
                    Group {
                        if node.done, node.starred {
                            // A starred day: a bigger, golden node. With a flag when it completed a level.
                            let flag = showFlags ? node.levelDone : nil
                            let dim = flag.map { dueLevels.contains($0) } ?? false
                            ZStack {
                                Circle().fill(LinearGradient(colors: [Color(hex: 0xFFF2A8), skin.reward], startPoint: .top, endPoint: .bottom)).frame(width: 40, height: 40)
                                    .background(Circle().fill(skin.rewardDeep).offset(y: 3))
                                    .overlay(Circle().stroke(Color.white, lineWidth: 2.4))
                                Image(systemName: "star.fill").font(.system(size: 18, weight: .bold)).foregroundStyle(skin.onReward)
                                if let flag {
                                    HStack(spacing: 4) {
                                        Image(systemName: "flag.fill").font(.system(size: 13, weight: .bold))
                                        Text("Level \(flag)").font(skin.uiBold(12))
                                    }
                                    .foregroundStyle(dim ? skin.ink3 : skin.primaryDeep)
                                    .padding(.horizontal, 9).padding(.vertical, 4)
                                    .background(Capsule().fill(Color.white))
                                    .shadow(color: skin.shadow, radius: 5, y: 3)
                                    .offset(x: 0, y: -34)
                                }
                            }
                            .contentShape(Rectangle().size(width: 110, height: 80))
                            .onTapGesture { if let flag { onLevel?(flag) } }
                            .accessibilityLabel(flag.map { "Day \(node.n), starred, level \($0) completed" } ?? "Day \(node.n), starred")
                        } else if node.done {
                            ZStack {
                                Circle().fill(skin.primary).frame(width: 30, height: 30)
                                    .overlay(Circle().stroke(Color.white, lineWidth: 2))
                                Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(skin.onPrimary)
                            }
                        } else if node.today {
                            ZStack {
                                PulseRing(color: skin.reward)
                                Circle().fill(skin.reward).frame(width: 38, height: 38)
                                    .overlay(Circle().stroke(Color.white, lineWidth: 2.4))
                                Text("\(node.n)").font(skin.display(15)).foregroundStyle(skin.onReward)
                                Text("Today").font(skin.uiBold(12)).foregroundStyle(skin.ink2).offset(x: 46)
                            }
                        } else if bonus {
                            Image(systemName: "star.fill").font(.system(size: 22)).foregroundStyle(skin.reward)
                                .shadow(color: .white, radius: 0, x: 0, y: 0)
                        } else {
                            ZStack {
                                Circle().fill(skin.bgMid).frame(width: 30, height: 30)
                                    .overlay(Circle().stroke(skin.trailNext, style: StrokeStyle(lineWidth: 2, dash: [3, 4])))
                                Text("\(node.n)").font(skin.uiBold(12)).foregroundStyle(skin.ink3)
                            }
                        }
                    }
                    .position(p)
                }
            }
            .frame(width: Self.stage.width * s, height: Self.stage.height * s)
            .frame(maxWidth: .infinity)
        }
    }
}

/// The ring that breathes around today.
struct PulseRing: View {
    let color: Color

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.8) / 1.8
            Circle().stroke(color.opacity(0.9 * (1 - t)), lineWidth: 3)
                .frame(width: 38 + 26 * t, height: 38 + 26 * t)
        }
    }
}
