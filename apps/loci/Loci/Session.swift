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
    var progress: UserProgress = .zero
    /// Set to the new level when a refresh crosses a level boundary; the UI
    /// presents the celebration and clears it.
    var pendingLevelUp: Int? = nil
    /// Level seen on the previous progress fetch — nil until the first one,
    /// so restoring a signed-in session never fires a false celebration.
    private var lastSeenLevel: Int? = nil

    var user: User? {
        if case .signedIn(let u) = auth { return u }
        return nil
    }

    func setAvatarUrl(_ url: String?) {
        if case .signedIn(var u) = auth {
            u.avatarUrl = url
            auth = .signedIn(u)
        }
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
        progress = .zero
        pendingLevelUp = nil
        lastSeenLevel = nil
    }

    func refreshHome() async {
        do {
            home = try await API.shared.home()
        } catch {
            // Keep the last good snapshot; Today shows stale data over nothing.
            print("[loci] refreshHome failed: \(error)")
        }
        await refreshProgress()
    }

    /// Fetch stars/level and detect crossing a level boundary. Reviews award
    /// stars server-side, so this runs after every home refresh (which the
    /// review and voice flows trigger on dismiss).
    func refreshProgress() async {
        do {
            let next = try await API.shared.fetchProgress()
            if let last = lastSeenLevel, next.level > last {
                pendingLevelUp = next.level
            }
            lastSeenLevel = next.level
            progress = next
        } catch {
            print("[loci] refreshProgress failed: \(error)")
        }
    }
}
