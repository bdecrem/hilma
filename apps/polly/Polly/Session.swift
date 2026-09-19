import Foundation
import Observation

@Observable
final class Session {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(PollyUser)
    }

    var state: State = .loading {
        didSet {
            // The UI language follows the signed-in learner's language.
            if case let .signedIn(user) = state { UILanguage.shared.studyLanguage = user.language }
            else if state == .signedOut { UILanguage.shared.studyLanguage = nil }
        }
    }
    var loginError: String? = nil

    /// User-wide stars + level. Refreshed after login and after each quiz so
    /// the top-left profile badge stays in sync across screens.
    var progress: PollyProgress = .zero

    /// Set to the new level when `refreshProgress()` observes a level
    /// increase. UI watches this and presents the level-up celebration; clear
    /// to nil to dismiss. First post-login refresh is intentionally silent
    /// (no celebration for restoring known state).
    var pendingLevelUp: Int? = nil
    private var hasLoadedProgressOnce = false

    func bootstrap() async {
        #if targetEnvironment(simulator) || (DEBUG && targetEnvironment(macCatalyst))
        // Headless-verification hook, simulator only: `simctl launch …
        // -TestLoginUser <u> -TestLoginPass <p>` signs in before the UI
        // settles, so screenshot loops can reach the signed-in tabs.
        let defaults = UserDefaults.standard
        if let u = defaults.string(forKey: "TestLoginUser"),
           let p = defaults.string(forKey: "TestLoginPass") {
            await login(username: u, password: p)
            NSLog("F2_SESSION test-login state=%@ home=%@", String(describing: state), NSHomeDirectory())
            if case .signedIn = state { return }
        }
        #endif
        // Instant start: restore the last signed-in user from disk so the
        // tabs (and their cached screens) render immediately, then validate
        // the cookie in the background. Only a confirmed 401 signs out —
        // a network hiccup keeps the cached session alive.
        let cached: PollyUser? = ScreenCache.load(key: ScreenCache.sessionUser)
        if let cached {
            state = .signedIn(cached)
        }
        do {
            let user = try await PollyAPI.shared.me()
            state = .signedIn(user)
            ScreenCache.save(user, key: ScreenCache.sessionUser)
            await refreshProgress()
        } catch PollyAPIError.unauthenticated, PollyAPIError.http(401, _) {
            state = .signedOut
            ScreenCache.clear()
        } catch {
            if cached == nil { state = .signedOut }
        }
    }

    func login(username: String, password: String) async {
        loginError = nil
        do {
            let user = try await PollyAPI.shared.login(username: username, password: password)
            state = .signedIn(user)
            ScreenCache.save(user, key: ScreenCache.sessionUser)
            await refreshProgress()
        } catch PollyAPIError.unauthenticated, PollyAPIError.http(401, _) {
            loginError = "Invalid username or password."
        } catch {
            loginError = error.localizedDescription
        }
    }

    /// First run: create + sign into the account for this name and language
    /// (both optional; without them it is an anonymous guest).
    func startGuest(username: String? = nil, language: String? = nil) async {
        loginError = nil
        do {
            let user = try await PollyAPI.shared.guestLogin(username: username, language: language)
            state = .signedIn(user)
            ScreenCache.save(user, key: ScreenCache.sessionUser)
            await refreshProgress()
        } catch PollyAPIError.http(_, let msg) where msg != nil {
            loginError = msg   // "That name is taken", "Names are 2–24…" — the server's words
        } catch {
            loginError = error.localizedDescription
        }
    }

    /// A guest just claimed the account (email + password set on the same
    /// row) — swap in the upgraded user.
    func applyClaimedUser(_ user: PollyUser) {
        state = .signedIn(user)
        ScreenCache.save(user, key: ScreenCache.sessionUser)
    }

    func logout() async {
        try? await PollyAPI.shared.logout()
        state = .signedOut
        progress = .zero
        pendingLevelUp = nil
        hasLoadedProgressOnce = false
        ScreenCache.clear()
    }

    func refreshProgress() async {
        do {
            let next = try await PollyAPI.shared.fetchProgress()
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
