import Foundation
import Observation

/// Which part of the day a full-screen flow starts on. `more` is a free
/// extra call after the day; `star` the guided round (Learning objectives).
enum FlowStep: String {
    case talk, things, cards, done, more, star
}

/// The app's one piece of shared state: who is signed in, today, and what
/// is on screen above the map.
@MainActor
@Observable
final class AppState {
    enum Phase: Equatable {
        case loading
        case signedOut
        case signedIn
    }

    var phase: Phase = .loading
    var user: UserView?
    var day: DayView?
    var loadError: String?
    /// The full-screen day flow, when one is up.
    var flow: FlowStep?
    var showSettings = false
    var showObjectives = false
    /// Hold-to-talk, a device-side voice setting (UserDefaults).
    static let holdToTalkKey = "voiceHoldToTalk"

    /// Launch hooks for a simulator drive (see apps/dolly/CLAUDE.md):
    /// -BackendURL, -TestSessionToken, -Open map|settings|talk|things|cards|done.
    func boot() async {
        let defaults = UserDefaults.standard
        if let token = defaults.string(forKey: "TestSessionToken"), !token.isEmpty {
            DollyAPI.installTestSession(token)
        }
        await refresh()
        if phase == .signedIn, let open = defaults.string(forKey: "Open") {
            switch open {
            case "settings": showSettings = true
            case "objectives": showObjectives = true
            case "talk", "things", "cards", "done", "more", "star": flow = FlowStep(rawValue: open)
            default: break
            }
        }
    }

    /// Me + today. A 401 signs out.
    func refresh() async {
        do {
            let res = try await DollyAPI.shared.today()
            user = res.user
            day = res.day
            loadError = nil
            phase = .signedIn
        } catch DollyAPIError.unauthenticated {
            user = nil
            day = nil
            phase = .signedOut
        } catch {
            loadError = error.localizedDescription
            if phase == .loading { phase = user == nil ? .signedOut : .signedIn }
        }
    }

    func signedIn(_ user: UserView) async {
        self.user = user
        phase = .signedIn
        await refresh()
    }

    func signOut() async {
        await DollyAPI.shared.logout()
        user = nil
        day = nil
        flow = nil
        showSettings = false
        phase = .signedOut
    }

    /// A day the server just returned (a finished session, a graded card).
    func apply(_ day: DayView) {
        self.day = day
    }

    /// Whichever part is next, from the map's button.
    var nextStep: FlowStep? {
        guard let day else { return nil }
        switch day.dayState {
        case .morning: return .talk
        case .afterTalk, .starAfterTalk: return .things
        case .afterThings, .paused, .starAfterThings, .starPaused: return .cards
        case .done: return nil
        }
    }

    /// ola.cx/dolly/today and dolly://today: the map, or the flow already in progress.
    func openToday() {
        guard phase == .signedIn else { return }
        showSettings = false
        if flow == nil, let next = nextStep { flow = next }
    }
}
