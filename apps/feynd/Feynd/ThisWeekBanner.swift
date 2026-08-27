import SwiftUI

/// The week's one renewal, surfaced: "This week: Einstein… refresher — due
/// Friday." Renewals land at most once a week (server rule), so this is a
/// single quiet line, not a list. Dismissing hides it until next week, on
/// both tabs that show it (Topics + Peck).
struct ThisWeekBanner: View {
    let topics: [F2Topic]
    /// Topics tab can push straight into the topic; Peck has no topic stack,
    /// so it renders the same card without navigation.
    var navigable: Bool = false

    @AppStorage("thisWeekBannerDismissed") private var dismissedWeek = ""

    var body: some View {
        if dismissedWeek != Self.weekKey(), let hit = dueThisWeek {
            Group {
                if navigable {
                    NavigationLink(value: hit.topic) { card(hit) }
                        .buttonStyle(.plain)
                } else {
                    card(hit)
                }
            }
            .transition(.opacity)
        }
    }

    private func card(_ hit: (topic: F2Topic, due: Date)) -> some View {
        HStack(spacing: 11) {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(FeyndTheme.gold)
                .frame(width: 28, height: 28)
                .background(FeyndTheme.gold.opacity(0.14), in: Circle())

            (Text("This week: ").foregroundColor(FeyndTheme.text2)
             + Text(hit.topic.displayLabel).bold().foregroundColor(FeyndTheme.text)
             + Text(" refresher — due \(dayWord(hit.due)).").foregroundColor(FeyndTheme.text2))
                .font(.system(size: 13.5))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    dismissedWeek = Self.weekKey()
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9.5, weight: .bold))
                    .foregroundStyle(FeyndTheme.text3)
                    .frame(width: 26, height: 26)
                    .background(FeyndTheme.surface2, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss for this week")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(FeyndTheme.gold.opacity(0.35), lineWidth: 1))
        .contentShape(Rectangle())
    }

    /// The soonest still-ahead renewal that falls inside the current
    /// calendar week. Lapsed badges have their own banner in the topic.
    private var dueThisWeek: (topic: F2Topic, due: Date)? {
        guard let week = Calendar.current.dateInterval(of: .weekOfYear, for: Date()) else { return nil }
        let now = Date()
        return topics
            .compactMap { t -> (topic: F2Topic, due: Date)? in
                guard t.isCertified, let due = t.recertDueAt else { return nil }
                return (t, due)
            }
            .filter { $0.due >= now && week.contains($0.due) }
            .min { $0.due < $1.due }
    }

    private func dayWord(_ due: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(due) { return "today" }
        if cal.isDateInTomorrow(due) { return "tomorrow" }
        return due.formatted(.dateTime.weekday(.wide))
    }

    /// "2026-W36" — dismissal is per calendar week, shared across tabs.
    static func weekKey(_ date: Date = Date()) -> String {
        let cal = Calendar.current
        let y = cal.component(.yearForWeekOfYear, from: date)
        let w = cal.component(.weekOfYear, from: date)
        return "\(y)-W\(w)"
    }
}
