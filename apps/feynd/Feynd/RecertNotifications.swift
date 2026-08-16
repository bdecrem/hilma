import Foundation
import UserNotifications

/// Local notifications for badge recertification — no APNs, no server: the
/// app knows every certified topic's `recert_due_at` and schedules two
/// on-device reminders per topic (3 days out, and the moment it dims).
/// Re-synced after every topics load; identifiers are stable per topic so a
/// renewed due date replaces the old requests instead of stacking.
enum RecertNotifications {
    private static let prefix = "recert-"

    static func sync(topics: [F2Topic]) {
        #if targetEnvironment(simulator)
        // `-SkipNotifPrompt 1` — keep the permission alert out of headless
        // screenshot runs; local reminders are meaningless in the sim anyway.
        if UserDefaults.standard.bool(forKey: "SkipNotifPrompt") { return }
        #endif
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            center.getPendingNotificationRequests { pending in
                // Clear all our prior requests, then schedule from truth.
                let stale = pending.map(\.identifier).filter { $0.hasPrefix(prefix) }
                center.removePendingNotificationRequests(withIdentifiers: stale)

                for topic in topics where topic.isCertified {
                    guard let due = topic.recertDueAt else { continue }
                    let name = topic.displayLabel
                    schedule(
                        center: center,
                        id: "\(prefix)\(topic.id)-soon",
                        at: due.addingTimeInterval(-3 * 86_400),
                        title: "Refresher due soon",
                        body: "\"\(name)\" dims in 3 days — a 5-minute refresher keeps the badge gold."
                    )
                    schedule(
                        center: center,
                        id: "\(prefix)\(topic.id)-due",
                        at: due,
                        title: "Your mastery badge dimmed",
                        body: "\"\(name)\" needs a quick refresher — 3 questions brings back the gold."
                    )
                }
            }
        }
    }

    private static func schedule(
        center: UNUserNotificationCenter,
        id: String,
        at date: Date,
        title: String,
        body: String
    ) {
        guard date > Date() else { return } // never fire for the past
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let comps = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
