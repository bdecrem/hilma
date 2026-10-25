import SwiftUI

/// Which screen is up. The band plays under every one of them (principle 1: the band is
/// already playing); only the lesson screen scores what you play.
enum Route: Equatable {
    case lessons, lesson, result, settings, calibrate
}

/// The app's screens and what they share: the player (band, monitor, lesson), the progress
/// store and the account. Screens switch at once, without animation (principle 5).
@Observable
final class AppModel {
    var route: Route = .lessons {
        didSet { player?.inLesson = route == .lesson }
    }
    let player: Player?
    let progress: ProgressStore
    let account: AccountStore
    /// The Mac's save panel for the loop (Export MIDI, ⌘E).
    var exporting = false
    /// Where calibration goes when it is done: the lesson (first time) or Settings.
    private var afterCalibration: Route = .lessons

    init(player: Player?, progress: ProgressStore, account: AccountStore) {
        self.player = player
        self.progress = progress
        self.account = account
        #if DEBUG
        if let r = UserDefaults.standard.string(forKey: "Route") {
            switch r {
            case "lessons": route = .lessons
            case "lesson": route = .lesson
            case "settings": route = .settings
            case "calibrate": route = .calibrate
            default: fatalError("unknown -Route \(r)")
            }
        }
        #endif
        player?.inLesson = route == .lesson
    }

    /// The lesson as it stands: a finished or fresh one starts from the top, one in progress
    /// picks up where it was.
    func open(lesson code: String) {
        guard let player, player.content.code == code else { return }
        if player.finish != nil { player.restartLesson() }
        guard Player.calibrated else { return calibrate(then: .lesson) }
        route = .lesson
    }

    func calibrate(then next: Route) {
        afterCalibration = next
        route = .calibrate
    }

    func leaveCalibration() { route = afterCalibration }

    func restart(lesson code: String) {
        guard let player, player.content.code == code else { return }
        player.restartLesson()
        route = .lesson
    }

    /// The lesson screen watches for the payoff finishing.
    func lessonFinished() { route = .result }
}

/// The catalog the menu shows. A1 is the lesson; A2 is a stub until it exists (brief §5: "A2
/// stub screen only"), unlocked by finishing A1.
struct LessonEntry: Identifiable {
    let code: String
    let title: String
    let meta: String
    /// Finishing this lesson unlocks the entry.
    let after: String?
    /// There is a lesson behind it.
    let playable: Bool

    var id: String { code }

    static let catalog = [
        LessonEntry(code: "A1", title: "Play the Form", meta: "Left hand · 12-bar blues in C · 15 min",
                    after: nil, playable: true),
        LessonEntry(code: "A2", title: "The Right Hand", meta: "Blues scale · call and response",
                    after: "A1", playable: false),
    ]
}
