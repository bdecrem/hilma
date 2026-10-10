import SwiftUI

/// Home. Today's three steps on top, the trail of days below, one button
/// for whichever part is next. Five states: morning, after the talk, after
/// the things, paused mid-cards, done.
struct MapView: View {
    @Environment(AppState.self) private var state
    private let skin = Skin.current

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                if let day = state.day {
                    dayLine(day)
                    todayCard(day)
                    Trail(nodes: day.trail)
                        .frame(height: 300)
                        .padding(.top, 6)
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
    }

    private var header: some View {
        HStack {
            HStack(spacing: 8) {
                Mascot(size: 36, mood: .idle)
                Text("Dolly").font(skin.display(24)).foregroundStyle(skin.primary)
            }
            Spacer()
            StreakPill(streak: state.day?.streak ?? state.user?.streak ?? 0)
            Button { state.showSettings = true } label: {
                Image(systemName: "gearshape.fill").font(.system(size: 16, weight: .bold))
                    .foregroundStyle(skin.ink2).frame(width: 38, height: 38)
                    .background(Circle().fill(Color.white))
                    .shadow(color: skin.shadow, radius: 6, y: 4)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Settings")
        }
    }

    private func dayLine(_ day: DayView) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Day \(day.n)").font(skin.display(34)).foregroundStyle(skin.word)
            Spacer()
            Text(day.dayState == .done ? "Done for today" : "\(weekday()) · \(day.stepsDone) of 3 done")
                .font(skin.uiBold(14)).foregroundStyle(skin.ink2)
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
                ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
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
                if day.dayState == .done {
                    VStack(spacing: 4) {
                        Text("Tomorrow \(day.dailyLabel)".uppercased()).font(skin.uiBold(11)).tracking(1).foregroundStyle(skin.ink3)
                        Text(day.tomorrow ?? "A new topic").font(skin.displayMedium(19)).foregroundStyle(skin.ink)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(skin.bgTop.opacity(0.6)))
                    .padding(.top, 4)
                } else {
                    BigButton(title: buttonTitle(day)) {
                        if let next = state.nextStep { state.flow = next }
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    private func buttonTitle(_ day: DayView) -> String {
        switch day.dayState {
        case .morning: return "Start today"
        case .afterTalk: return "Next: Three things"
        case .afterThings: return "Next: Cards"
        case .paused: return "Resume cards"
        case .done: return "Done"
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
                        if node.done {
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
