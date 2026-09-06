import Foundation
import Observation

@Observable
final class Session {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(JamUser)
    }

    var state: State = .loading
    var loginError: String? = nil

    func bootstrap() async {
        // DEBUG-only: `-autoLogin <user> <pass>` signs in on launch so the
        // simulator can be driven headlessly (no on-screen typing) — see
        // "NO SCREEN CONTROL" in DESIGN.md/PROGRESS.md verify steps.
        if let (user, pass) = Self.autoLoginCredentials() {
            await login(username: user, password: pass)
            return
        }
        do {
            let user = try await JamAPI.shared.me()
            state = .signedIn(user)
        } catch JamAPIError.unauthenticated, JamAPIError.http(401, _) {
            state = .signedOut
        } catch {
            state = .signedOut
        }
    }

    private static func autoLoginCredentials() -> (String, String)? {
        let args = CommandLine.arguments
        guard let idx = args.firstIndex(of: "-autoLogin"), idx + 2 < args.count else { return nil }
        return (args[idx + 1], args[idx + 2])
    }

    func login(username: String, password: String) async {
        loginError = nil
        do {
            let user = try await JamAPI.shared.login(username: username, password: password)
            state = .signedIn(user)
        } catch JamAPIError.unauthenticated, JamAPIError.http(401, _) {
            loginError = "Invalid username or password."
        } catch {
            loginError = error.localizedDescription
        }
    }

    func signup(username: String, password: String) async {
        loginError = nil
        do {
            let user = try await JamAPI.shared.signup(username: username, password: password)
            state = .signedIn(user)
        } catch {
            loginError = error.localizedDescription
        }
    }

    func logout() async {
        try? await JamAPI.shared.logout()
        state = .signedOut
    }

    /// The server answered 401 mid-session (cookie expired or revoked):
    /// drop to the login screen. Mirrors the web app's `onAuthLost`.
    func authLost() {
        JamAPI.shared.clearCookies()
        loginError = "Signed out — please sign in again."
        state = .signedOut
    }
}
