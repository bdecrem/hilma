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
        do {
            let user = try await JamAPI.shared.me()
            state = .signedIn(user)
        } catch JamAPIError.unauthenticated, JamAPIError.http(401, _) {
            state = .signedOut
        } catch {
            state = .signedOut
        }
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
}
