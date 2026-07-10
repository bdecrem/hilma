import Foundation
import Observation

@Observable
final class AppSession {
    enum AuthState: Equatable {
        case loading
        case signedOut
        case signedIn(OmniUser)
    }

    var auth: AuthState = .loading
    var progress: Progress = .zero
    /// Set when an XP award crosses a level boundary; a view shows it once.
    var pendingLevelUp: Int?
    /// The chapter catalog for the current language, shared by Home + Library.
    var topics: TopicsResponse?

    func refreshTopics() async {
        topics = try? await API.shared.topics()
    }

    var user: OmniUser? {
        if case .signedIn(let u) = auth { return u }
        return nil
    }

    var currentLanguage: Language {
        language(for: user?.language ?? "es")
    }

    func bootstrap() async {
        do {
            apply(try await API.shared.me())
        } catch {
            auth = .signedOut
        }
    }

    func signIn(email: String, password: String) async throws {
        apply(try await API.shared.login(email: email, password: password))
    }

    func signUp(email: String, password: String, language: String, level: Int) async throws {
        apply(try await API.shared.signup(email: email, password: password, language: language, level: level))
    }

    func switchLanguage(_ code: String) async throws {
        apply(try await API.shared.updateLanguage(code))
        topics = nil
        await refreshTopics()
    }

    func signOut() async {
        try? await API.shared.logout()
        auth = .signedOut
        progress = .zero
    }

    /// Fold an XP award into the visible progress.
    func take(_ xp: XpResult) {
        if xp.leveledUp { pendingLevelUp = xp.level }
        progress = xp.progress
    }

    private func apply(_ res: AuthResponse) {
        auth = .signedIn(res.user)
        progress = res.progress
    }
}
