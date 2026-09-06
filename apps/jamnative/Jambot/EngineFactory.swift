import Foundation

/// Single seam that decides which EngineAPI implementation the app runs
/// against. Screens never construct an engine directly — they ask this
/// factory.
///
/// The real engine is ONE `EngineHost` for the whole app (DESIGN.md: "the
/// web view is created once at app start and reused across tracks") —
/// loading the 2 MB bundle takes a few seconds, and `loadSession` replaces
/// the session inside it when another track opens. `RootView` parents its
/// web view via `EngineHostAnchor` and warms it with `ready()`.
@MainActor
enum EngineFactory {
    /// Pass `-mockEngine` as a launch argument (Xcode scheme or
    /// `xcrun simctl launch … -mockEngine`) to force the canned engine.
    static var forceMock: Bool {
        ProcessInfo.processInfo.arguments.contains("-mockEngine")
    }

    static let shared: EngineAPI = forceMock ? MockEngine() : EngineHost()

    /// The real host, when the app is running one (nil under `-mockEngine`).
    static var host: EngineHost? { shared as? EngineHost }

    static func make() -> EngineAPI { shared }
}
