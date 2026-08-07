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

    /// User-wide stars + level. Refreshed after login and after each quiz so
    /// the top-left profile badge stays in sync across screens.
    var progress: F2Progress = .zero

    /// Set to the new level when `refreshProgress()` observes a level
    /// increase. UI watches this and presents the level-up celebration; clear
    /// to nil to dismiss. First post-login refresh is intentionally silent
    /// (no celebration for restoring known state).
    var pendingLevelUp: Int? = nil
    private var hasLoadedProgressOnce = false

    func bootstrap() async {
        // Instant start: restore the last signed-in user from disk so the
        // tabs (and their cached screens) render immediately, then validate
        // the cookie in the background. Only a confirmed 401 signs out —
        // a network hiccup keeps the cached session alive.
        let cached: F2User? = ScreenCache.load(key: ScreenCache.sessionUser)
        if let cached {
            state = .signedIn(cached)
        }
        do {
            let user = try await F2API.shared.me()
            state = .signedIn(user)
            ScreenCache.save(user, key: ScreenCache.sessionUser)
            await refreshProgress()
        } catch F2APIError.unauthenticated, F2APIError.http(401, _) {
            state = .signedOut
            ScreenCache.clear()
        } catch {
            if cached == nil { state = .signedOut }
        }
    }

    func login(username: String, password: String) async {
        loginError = nil
        do {
            let user = try await F2API.shared.login(username: username, password: password)
            state = .signedIn(user)
            ScreenCache.save(user, key: ScreenCache.sessionUser)
            await refreshProgress()
        } catch F2APIError.unauthenticated, F2APIError.http(401, _) {
            loginError = "Invalid username or password."
        } catch {
            loginError = error.localizedDescription
        }
    }

    func logout() async {
        try? await F2API.shared.logout()
        state = .signedOut
        progress = .zero
        pendingLevelUp = nil
        hasLoadedProgressOnce = false
        ScreenCache.clear()
    }

    func refreshProgress() async {
        do {
            let next = try await F2API.shared.fetchProgress()
            let previousLevel = progress.level
            progress = next
            if hasLoadedProgressOnce, next.level > previousLevel {
                pendingLevelUp = next.level
            }
            hasLoadedProgressOnce = true
        } catch {
            // Non-fatal — the badge just keeps the last known value.
        }
    }

    /// Clear the pending celebration once the user has acknowledged it.
    func clearPendingLevelUp() {
        pendingLevelUp = nil
    }

    /// Patch the avatar URL on the signed-in user so the ProfileBadge picks it
    /// up immediately without a server round-trip.
    func setAvatarUrl(_ url: String?) {
        if case let .signedIn(user) = state {
            var u = user
            u.avatarUrl = url
            state = .signedIn(u)
        }
    }
}
