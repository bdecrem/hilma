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
    /// The chapter catalog for the current language, shared by Home + Library.
    var topics: TopicsResponse?
    /// True when the catalog failed to load and there's nothing cached —
    /// Home/Library show a retry row instead of a silently empty course.
    var topicsLoadFailed = false

    func refreshTopics() async {
        do {
            topics = try await API.shared.topics()
            topicsLoadFailed = false
        } catch {
            topicsLoadFailed = topics == nil
        }
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
        topics = nil
        apply(try await API.shared.login(email: email, password: password))
    }

    func signUp(email: String, password: String, language: String, level: Int) async throws {
        topics = nil
        apply(try await API.shared.signup(email: email, password: password, language: language, level: level))
    }

    func switchLanguage(_ code: String) async throws {
        apply(try await API.shared.updateLanguage(code))
        topics = nil
        await refreshTopics()
    }

    func signOut() async {
        try? await API.shared.logout()
        // Even if the logout POST failed (offline), the local session must
        // die — otherwise the next launch quietly signs the user back in.
        API.shared.clearSessionCookie()
        auth = .signedOut
        progress = .zero
        topics = nil
    }

    /// Fold an XP award into the visible progress.
    func take(_ xp: XpResult) {
        progress = xp.progress
    }

    private func apply(_ res: AuthResponse) {
        auth = .signedIn(res.user)
        progress = res.progress
    }
}
