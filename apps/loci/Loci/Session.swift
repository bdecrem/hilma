import Foundation
import Observation

/// Auth + home state for the whole app. Views read `home` for the Today
/// screen and topic list; `refreshHome()` after anything that changes cards.
@Observable
final class AppSession {
    enum AuthState: Equatable {
        case loading
        case signedOut
        case signedIn(User)
    }

    var auth: AuthState = .loading
    var home: Home = .empty

    var user: User? {
        if case .signedIn(let u) = auth { return u }
        return nil
    }

    func bootstrap() async {
        do {
            let user = try await API.shared.me()
            auth = .signedIn(user)
            await refreshHome()
        } catch {
            auth = .signedOut
        }
    }

    func signIn(username: String, password: String) async throws {
        let user = try await API.shared.login(username: username, password: password)
        auth = .signedIn(user)
        await refreshHome()
    }

    func signOut() async {
        try? await API.shared.logout()
        auth = .signedOut
        home = .empty
    }

    func refreshHome() async {
        do {
            home = try await API.shared.home()
        } catch {
            // Keep the last good snapshot; Today shows stale data over nothing.
            print("[loci] refreshHome failed: \(error)")
        }
    }
}
