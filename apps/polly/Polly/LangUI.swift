import SwiftUI
import Observation

// App-UI language (2026-09-19). Polly's chrome renders in the language the
// learner is studying (immersion) or in English — a per-device Settings toggle.
// This is a lightweight runtime catalog (not iOS .strings): each call carries
// its own translations — `L("Done", "Fatto", "Terminé", "완료")` — so a string
// and its translations sit together at the call site and the toggle (or a
// language switch) flips every screen live. Only it/fr/ko are supported target
// languages; anything else → en. Glossary and rules: apps/polly/LOCALIZATION.md.

/// The one source of truth for the UI language. `@Observable`, so any view
/// body that calls `L(…)` (directly or through a model's computed property)
/// re-renders when the toggle flips or the signed-in language changes — no
/// per-view plumbing needed.
@Observable
final class UILanguage {
    static let shared = UILanguage()
    static let supported: Set<String> = ["it", "fr", "ko"]

    /// The signed-in learner's studying language (nil when signed out).
    /// Session keeps this in sync with its state.
    var studyLanguage: String? = nil

    /// The Settings toggle: true = the app shows in the studying language.
    var studyUI: Bool {
        didSet { UserDefaults.standard.set(studyUI, forKey: UILang.key) }
    }

    private init() {
        studyUI = (UserDefaults.standard.object(forKey: UILang.key) as? Bool) ?? true
    }

    /// The UI language code right now: the studying language, or "en".
    var code: String {
        guard studyUI, let l = studyLanguage, Self.supported.contains(l) else { return "en" }
        return l
    }
}

/// The app's string lookup: English first, then Italian, French, Korean.
func L(_ en: String, _ it: String, _ fr: String, _ ko: String) -> String {
    switch UILanguage.shared.code {
    case "it": return it
    case "fr": return fr
    case "ko": return ko
    default:   return en
    }
}

enum UILang {
    /// The UserDefaults key for the toggle (true = the studying language).
    static let key = "uiInStudyLanguage"

    /// The UI language code right now: the studying language, or "en".
    static func code(_ session: Session) -> String { UILanguage.shared.code }

    /// English name of a language code ("Italian").
    static func englishName(_ code: String?) -> String? {
        guard let code else { return nil }
        return ["it": "Italian", "fr": "French", "ko": "Korean"][code]
    }

    /// The language's own name ("Italiano").
    static func nativeName(_ code: String?) -> String? {
        guard let code else { return nil }
        return ["it": "Italiano", "fr": "Français", "ko": "한국어"][code]
    }

    /// Whether a studying language is available to switch into (for the setting).
    @MainActor static func studyLanguageName(_ session: Session) -> String? {
        guard case let .signedIn(user) = session.state else { return nil }
        return englishName(user.language)
    }
}

/// Pick a string for an explicit UI language code. English is the base; a
/// missing form falls back to English. Prefer `L(…)` — this is for the rare
/// call that needs a language other than the current one.
func loc(_ code: String, en: String, it: String? = nil, fr: String? = nil, ko: String? = nil) -> String {
    switch code {
    case "it": return it ?? en
    case "fr": return fr ?? en
    case "ko": return ko ?? en
    default:   return en
    }
}
