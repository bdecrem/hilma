import SwiftUI
import os
#if targetEnvironment(macCatalyst)
import UIKit
#endif

// Mac Catalyst window sizing + a centred-column helper for regular-width
// layouts (iPad / Mac). Additive, self-contained — apply from the
// integrator's root view; nothing here touches shared files.
//
// Usage (in the integrator's RootView or JambotApp scene root):
//
//     ContentView()
//         .catalystWindowChrome(title: "Jambot")
//
// This sets the Mac window's min/default size once per scene and (on
// Catalyst) sets the scene title. It is a no-op on iOS/iPadOS.
enum CatalystSupport {
    static let minSize = CGSize(width: 390, height: 700)
    static let defaultSize = CGSize(width: 430, height: 860)

    /// Call once, e.g. from `.onAppear` on the root view. Idempotent —
    /// safe to call every time the root view appears.
    @MainActor
    static func configureWindowIfNeeded(title: String = "Jambot") {
        #if targetEnvironment(macCatalyst)
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            windowScene.sizeRestrictions?.minimumSize = minSize
            // Only push the default size the first time we see this scene —
            // otherwise every relaunch of configureWindowIfNeeded (e.g. on
            // every view appearance) would snap a manually-resized window
            // back to the default.
            if !Self.sizedScenes.contains(ObjectIdentifier(windowScene)) {
                windowScene.sizeRestrictions?.minimumSize = minSize
                windowScene.sizeRestrictions?.maximumSize = CGSize(width: 4000, height: 4000)
                if let titleBar = windowScene.titlebar {
                    titleBar.titleVisibility = .visible
                    titleBar.toolbar = nil
                }
                windowScene.title = title
                // Ask AppKit for the default size the first time the scene
                // shows up (setting the UIWindow frame does nothing on
                // Catalyst — the NSWindow keeps its 1024×768 default).
                let origin = windowScene.effectiveGeometry.systemFrame.origin
                let target = CGRect(origin: origin, size: defaultSize)
                let apply = {
                    windowScene.requestGeometryUpdate(.Mac(systemFrame: target)) { error in
                        Logger(subsystem: "com.bartdecrem.Jambot", category: "catalyst").error("window geometry update failed: \(error.localizedDescription, privacy: .public)")
                    }
                }
                apply()
                // AppKit's window restoration can land after the first
                // appearance and put the remembered frame back; ask again.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    if windowScene.effectiveGeometry.systemFrame.size != defaultSize { apply() }
                }
                Self.sizedScenes.insert(ObjectIdentifier(windowScene))
            }
        }
        #endif
    }

    #if targetEnvironment(macCatalyst)
    private static var sizedScenes = Set<ObjectIdentifier>()
    #endif
}

extension View {
    /// Configures Mac Catalyst window min size (390×700), a sensible
    /// default size (430×860), and the window title. No-op on iOS/iPadOS.
    func catalystWindowChrome(title: String = "Jambot") -> some View {
        self.onAppear {
            CatalystSupport.configureWindowIfNeeded(title: title)
        }
    }

    /// Centres content in a max-720pt column on regular-width layouts
    /// (iPad landscape, Mac Catalyst window wider than ~720pt), matching
    /// the web app's wide-viewport rule in jam.css. Compact width (iPhone,
    /// narrow Catalyst window) is unaffected — full width, no change.
    func columnWidth(_ maxWidth: CGFloat = 720) -> some View {
        modifier(ColumnWidth(maxWidth: maxWidth))
    }
}

/// See `View.columnWidth(_:)`. A separate modifier (rather than inlining)
/// so it can read the horizontal size class via `@Environment`.
struct ColumnWidth: ViewModifier {
    let maxWidth: CGFloat
    @Environment(\.horizontalSizeClass) private var sizeClass

    func body(content: Content) -> some View {
        if sizeClass == .regular {
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                content.frame(maxWidth: maxWidth)
                Spacer(minLength: 0)
            }
        } else {
            content
        }
    }
}
