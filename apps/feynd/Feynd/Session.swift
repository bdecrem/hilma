import Foundation
import Observation

@Observable
final class Session {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(F2User)
    }

    var state: State = .loading
    var loginError: String? = nil

    func bootstrap() async {
        // On launch, see if a persistent cookie is still good.
        do {
            let user = try await F2API.shared.me()
            state = .signedIn(user)
        } catch {
            state = .signedOut
        }
    }

    func login(username: String, password: String) async {
        loginError = nil
        do {
            let user = try await F2API.shared.login(username: username, password: password)
            state = .signedIn(user)
        } catch F2APIError.unauthenticated, F2APIError.http(401, _) {
            loginError = "Invalid username or password."
        } catch {
            loginError = error.localizedDescription
        }
    }

    func logout() async {
        try? await F2API.shared.logout()
        state = .signedOut
    }
}
