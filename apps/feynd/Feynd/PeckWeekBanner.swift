import SwiftUI
import UserNotifications

/// The weekly Peck rule: a daily streak also needs one full Peck level
/// every 7 days. The server carries the deadline on JumboState
/// (`peckDue` / `peckDaysLeft`); this file is the client side — the
/// 48-hour banner, the on-device reminders, and the shared wording.
enum PeckWeek {
    /// True when the deadline is today or tomorrow and there is a streak
    /// to lose.
    static func atRisk(_ state: JumboState?) -> Bool {
        guard let state, (state.dailyStreak ?? 0) >= 1,
              let left = state.peckDaysLeft else { return false }
        return left <= 1
    }

    /// "today" / "tomorrow" / "Sunday" / "in 7 days".
    static func dueWord(due: String, daysLeft: Int) -> String {
        switch daysLeft {
        case ...0: return "today"
        case 1: return "tomorrow"
        case 2...6:
            if let date = parse(due) { return date.formatted(.dateTime.weekday(.wide)) }
            return "in \(daysLeft) days"
        default: return "in \(daysLeft) days"
        }
    }

    /// The server's PT calendar day as a local Date at midnight.
    static func parse(_ day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}

/// "Your 12-day streak needs a Peck level by tomorrow." Same quiet card as
/// the refresher banner, ember instead of gold; tap opens the current
/// level. Dismiss hides it for the rest of the day — it comes back on the
/// deadline day itself.
struct PeckWeekBanner: View {
    let state: JumboState?

    @AppStorage("peckWeekBannerDismissed") private var dismissed = ""

    private static let ember = Color(hex: 0xE8853A)

    var body: some View {
        if let hit = warning, dismissed != hit.key {
            Button {
                DeepLinkRouter.shared.requestPeckPlay()
            } label: {
                card(hit)
            }
            .buttonStyle(.plain)
            .transition(.opacity)
        }
    }

    private struct Warning {
        let streak: Int
        let daysLeft: Int
        let due: String
        var key: String { "\(due)|\(daysLeft)" }
    }

    private var warning: Warning? {
        guard PeckWeek.atRisk(state), let state, let due = state.peckDue,
              let left = state.peckDaysLeft else { return nil }
        return Warning(streak: state.dailyStreak ?? 0, daysLeft: left, due: due)
    }

    private func card(_ hit: Warning) -> some View {
        HStack(spacing: 11) {
            Image(systemName: "flame.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Self.ember)
                .frame(width: 28, height: 28)
                .background(Self.ember.opacity(0.14), in: Circle())

            (Text("Your ").foregroundColor(FeyndTheme.text2)
             + Text("\(hit.streak)-day streak").bold().foregroundColor(FeyndTheme.text)
             + Text(" needs a Peck level by \(hit.daysLeft <= 0 ? "tonight" : "tomorrow").")
                .foregroundColor(FeyndTheme.text2))
                .font(.system(size: 13.5))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                withAnimation(.easeOut(duration: 0.2)) { dismissed = hit.key }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9.5, weight: .bold))
                    .foregroundStyle(FeyndTheme.text3)
                    .frame(width: 26, height: 26)
                    .background(FeyndTheme.surface2, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss for today")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(FeyndTheme.surface, in: RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(Self.ember.opacity(0.4), lineWidth: 1))
        .contentShape(Rectangle())
    }
}

/// Local reminders for the Peck deadline — the same shape as
/// RecertNotifications: two on-device requests, re-synced from truth on
/// every map load, stable identifiers so a moved deadline replaces them.
/// 10am the day before, 6pm on the day.
enum PeckWeekNotifications {
    private static let soonId = "peckweek-soon"
    private static let dueId = "peckweek-due"

    static func sync(state: JumboState?) {
        #if targetEnvironment(simulator)
        if UserDefaults.standard.bool(forKey: "SkipNotifPrompt") { return }
        #endif
        let center = UNUserNotificationCenter.current()
        // No streak, nothing at stake: clear ours and schedule nothing.
        guard let state, (state.dailyStreak ?? 0) >= 1,
              let due = state.peckDue, let dueDay = PeckWeek.parse(due) else {
            center.removePendingNotificationRequests(withIdentifiers: [soonId, dueId])
            return
        }
        let streak = state.dailyStreak ?? 0
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            center.removePendingNotificationRequests(withIdentifiers: [soonId, dueId])
            let cal = Calendar.current
            if let dayBefore = cal.date(byAdding: .day, value: -1, to: dueDay),
               let at = cal.date(bySettingHour: 10, minute: 0, second: 0, of: dayBefore) {
                schedule(center: center, id: soonId, at: at,
                         title: "Streak at risk",
                         body: "Your \(streak)-day streak needs one Peck level by tomorrow night.")
            }
            if let at = cal.date(bySettingHour: 18, minute: 0, second: 0, of: dueDay) {
                schedule(center: center, id: dueId, at: at,
                         title: "Last call for your streak",
                         body: "Play one Peck level tonight or your \(streak)-day streak resets.")
            }
        }
    }

    private static func schedule(
        center: UNUserNotificationCenter, id: String, at date: Date, title: String, body: String
    ) {
        guard date > Date() else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
