import SwiftUI

// App-UI language (2026-09-19). Polly's chrome can render in the language the
// learner is studying (immersion) or in English — a per-device Settings toggle.
// This is a lightweight runtime catalog (not iOS .strings): each call carries
// its own translations, so screens localize incrementally and the toggle flips
// them live. Only it/fr/ko are supported target languages; anything else → en.

enum UILang {
    /// The AppStorage key for the toggle (true = the studying language).
    static let key = "uiInStudyLanguage"

    /// The UI language code right now: the studying language, or "en".
    @MainActor static func code(_ session: Session) -> String {
        let studyUI = (UserDefaults.standard.object(forKey: key) as? Bool) ?? true
        guard studyUI, case let .signedIn(user) = session.state,
              let l = user.language, ["it", "fr", "ko"].contains(l) else { return "en" }
        return l
    }

    /// Whether a studying language is available to switch into (for the setting).
    @MainActor static func studyLanguageName(_ session: Session) -> String? {
        guard case let .signedIn(user) = session.state, let l = user.language else { return nil }
        return ["it": "Italian", "fr": "French", "ko": "Korean"][l]
    }
}

/// Pick a string for a UI language code. English is the base; supply the
/// target-language forms. A missing form falls back to English.
func loc(_ code: String, en: String, it: String? = nil, fr: String? = nil, ko: String? = nil) -> String {
    switch code {
    case "it": return it ?? en
    case "fr": return fr ?? en
    case "ko": return ko ?? en
    default:   return en
    }
}

/// A View modifier that re-renders when the UI-language toggle flips, so `loc`
/// calls in the body update live. Add `.observesUILanguage()` where needed —
/// or just declare `@AppStorage(UILang.key)` in the view.
private struct UILanguageObserver: ViewModifier {
    @AppStorage(UILang.key) private var studyUI = true
    func body(content: Content) -> some View { content }
}
extension View {
    func observesUILanguage() -> some View { modifier(UILanguageObserver()) }
}
