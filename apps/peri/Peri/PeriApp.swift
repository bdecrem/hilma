import SwiftUI
import Observation

@main
struct PeriApp: App {
    @State private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            ZStack {
                Theme.bg.ignoresSafeArea()
                switch session.auth {
                case .loading:
                    ProgressView().tint(Theme.ink2)
                case .signedOut:
                    LoginView()
                case .signedIn:
                    WalkView()
                }
            }
            .environment(session)
            .task { await session.bootstrap() }
            .preferredColorScheme(.dark)
        }
    }
}

@Observable
final class AppSession {
    enum AuthState: Equatable {
        case loading
        case signedOut
        case signedIn(User)
    }

    var auth: AuthState = .loading

    var user: User? {
        if case .signedIn(let u) = auth { return u }
        return nil
    }

    func bootstrap() async {
        do {
            auth = .signedIn(try await API.shared.me())
        } catch {
            auth = .signedOut
        }
    }

    func signIn(username: String, password: String) async throws {
        auth = .signedIn(try await API.shared.login(username: username, password: password))
    }

    func signOut() async {
        try? await API.shared.logout()
        auth = .signedOut
    }
}
