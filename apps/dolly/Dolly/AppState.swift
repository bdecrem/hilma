import Foundation
import Observation

/// Which part of the day a full-screen flow starts on. `more` is a free
/// extra call after the day; `star` the guided round (Learning objectives).
enum FlowStep: String {
    case talk, things, cards, done, more, star
    /// After an extra call: the three things it produced.
    case moreDone
    /// A completed level's refresher: a short scripted call, then four cards, then the verdict.
    case refresh, refreshDone
    /// Flash cards: a set of ten, then the score.
    case flash, flashDone
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
    /// The You sheet (avatar, rank, XP), from the header.
    var showYou = false
    /// The flash set on screen (dealt when the flow opens; nil = deal a new one).
    var flash: FlashView?
    /// A completed level's sheet (a flag on the trail, tapped).
    var showLevel: Int?
    /// Which level the next refresher is for (nil: the server picks the due one).
    var refreshLevel: Int?
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
            case "you": showYou = true
            case "talk", "things", "cards", "done", "more", "star", "refresh", "refreshDone", "flash": flow = FlowStep(rawValue: open)
            case "flashDone":
                // A set dealt and answered right through the real routes (test account), then its score.
                if let set = try? await DollyAPI.shared.dealFlash() {
                    var last: FlashAnswerResponse?
                    for (i, q) in set.questions.enumerated() { last = try? await DollyAPI.shared.answerFlash(id: set.id, q: i, answer: q.target) }
                    flash = last?.set
                    if let d = last?.day { day = d }
                    flow = .flashDone
                }
            case "level": showLevel = day?.levels.last?.level ?? 1
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
            // Anything but a 401 (offline, a server error, a reply this build
            // cannot read) keeps the session: the map shows the error and a
            // Try again, nobody is sent back to sign in.
            loadError = error.localizedDescription
            if phase == .loading { phase = hasSessionCookie ? .signedIn : .signedOut }
        }
    }

    private var hasSessionCookie: Bool {
        (HTTPCookieStorage.shared.cookies ?? []).contains { $0.name == "dolly_session" && !$0.value.isEmpty }
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
        case .afterThings, .paused, .starAfterThings, .starPaused, .refreshCards, .refreshPaused: return .cards
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
