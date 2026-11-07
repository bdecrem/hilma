import SwiftUI

/// The level up next, over the map: its goals from the plan, where you stand on each, and a
/// button per goal that opens the right step at the right tempo. Full screen on iPhone, a 480 pt
/// card on the Mac. The venue's story stays hidden until the level clears.
struct LevelGoalsScreen: View {
    let app: AppModel
    let stop: MapWorld.Stop
    let level: LearningPlan.Level
    let goals: GoalProgress
    let compact: Bool

    var body: some View {
        if compact {
            content
                .background(Palette.ground.ignoresSafeArea())
                .transition(.identity)
        } else {
            ZStack {
                Palette.ground.opacity(0.75).ignoresSafeArea()
                    .onTapGesture { app.openVenue = nil }
                    .accessibilityHidden(true)
                content
                    .frame(width: 480)
                    .frame(maxHeight: 820)
                    .background(Palette.ground)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
                    .padding(.vertical, 30)
            }
        }
    }

    private var content: some View {
        let venue = stop.venue.isPlaceholder ? "Venue to come" : stop.venue.name
        let done = level.items.filter { goals.done(level, $0) }.count
        return VStack(spacing: 0) {
            HStack {
                Button { app.openVenue = nil } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left").font(.system(size: 11, weight: .bold))
                        Text("Map").dataLabel(11, weight: .semibold)
                    }
                    .foregroundStyle(Palette.text)
                    .padding(.horizontal, 14)
                    .frame(height: 40)
                    .overlay(Capsule().strokeBorder(Palette.text, lineWidth: 2))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to the map")
                Spacer()
                // The phone's card covers the map's header, the teacher's button with it.
                if compact { AskButton(size: 34) }
                Text(level.items.isEmpty ? "Up next" : "\(done) of \(level.items.count) done")
                    .dataLabel(10, weight: .semibold)
                    .foregroundStyle(Palette.ground)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 2).fill(Palette.signal))
            }
            .padding(.horizontal, 16)
            .padding(.top, compact ? 8 : 16)
            .padding(.bottom, 14)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Level \(level.n) · \(venue)")
                            .dataLabel(11, weight: .semibold)
                            .foregroundStyle(Palette.signal)
                        Text(level.title)
                            .font(.display(40))
                            .textCase(.uppercase)
                            .foregroundStyle(Palette.text)
                            .lineLimit(2)
                            .minimumScaleFactor(0.6)
                        Text(level.text)
                            .bodyText(14.5)
                            .lineSpacing(3)
                            .foregroundStyle(Palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        if let q = level.quarter {
                            Text(q).dataLabel(10).foregroundStyle(Palette.muted)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 18)

                    Hairline().padding(.horizontal, 20)

                    if level.items.isEmpty {
                        Text("The goals for this level aren't written yet.")
                            .bodyText(14)
                            .foregroundStyle(Palette.muted)
                            .padding(20)
                    } else {
                        ForEach(level.items) { item in
                            GoalRow(item: item, fingers: app.fingerLine(item), done: goals.done(level, item),
                                    status: goals.status(level, item), action: goals.action(level, item), compact: compact,
                                    practice: item.kind == .song ? { app.start(goal: item, level: level, practice: true) } : nil) {
                                app.start(goal: item, level: level)
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)
                            Hairline().padding(.horizontal, 20)
                        }
                    }
                    if let about = app.plan.about {
                        Text(about)
                            .dataLabel(9)
                            .foregroundStyle(Palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(20)
                    }
                }
                .padding(.bottom, compact ? 8 : 16)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}

/// One goal: the mark, the words, a scale's fingering, where it stands, and its button (a song
/// goal has Practice beside it: the song held at bar 1 with the scrubber; 0.1 (113)).
private struct GoalRow: View {
    let item: LearningPlan.Item
    /// A scale goal's fingering, the way you'd say it ("1-2-3, tuck, …").
    let fingers: String?
    let done: Bool
    let status: String
    let action: String
    let compact: Bool
    var practice: (() -> Void)? = nil
    let start: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                if done {
                    Circle().fill(Palette.signal)
                    Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(Palette.ground)
                } else {
                    Circle().strokeBorder(Palette.line, lineWidth: 2)
                }
            }
            .frame(width: 22, height: 22)
            .padding(.top, 2)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.display(compact ? 19 : 21))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.text)
                Text(item.detail)
                    .bodyText(13)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let fingers {
                    // The pattern under the hand, in the color the keys use for the next finger.
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "hand.raised").font(.system(size: 11, weight: .semibold))
                        Text("Fingers · \(fingers)").bodyText(13, weight: .semibold)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .foregroundStyle(Palette.cue)
                    .padding(.top, 2)
                }
                Text(status)
                    .dataLabel(10, weight: .semibold)
                    .foregroundStyle(done ? Palette.signal : Palette.text)
                HStack(spacing: 8) {
                    Button(action: start) {
                        Text(action)
                            .dataLabel(11, weight: .semibold)
                            .foregroundStyle(done ? Palette.text : Palette.ground)
                            .padding(.horizontal, 14)
                            .frame(height: 34)
                            .background(RoundedRectangle(cornerRadius: 4).fill(done ? Palette.panel : Palette.signal))
                            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(done ? Palette.line : Palette.signal, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    if let practice {
                        Button(action: practice) {
                            Text("Practice")
                                .dataLabel(11, weight: .semibold)
                                .foregroundStyle(Palette.muted)
                                .padding(.horizontal, 12)
                                .frame(height: 34)
                                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Palette.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Practice \(item.title): the song held at bar 1, the scrubber and the speed")
                    }
                }
                .padding(.top, 4)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(item.title), \(fingers.map { "fingers \($0), " } ?? "")\(done ? "done" : status)")
    }
}
