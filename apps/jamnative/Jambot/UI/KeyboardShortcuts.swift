import SwiftUI

// Keyboard shortcuts for Catalyst / iPad-with-keyboard. These are plain
// `.keyboardShortcut` view modifiers bundled as small, targeted helpers —
// apply each to the specific button/view it controls, in the integrator's
// StudioView / ControlsSheetView / wherever makes sense. Nothing here is
// wired up automatically; nothing here touches shared files.
//
// Where to apply (for the integrator):
//   - `.jambotPlayStopShortcut { model.togglePlay() }` — attach to the
//     transport's Play/Stop button, or invisibly to the Studio root via
//     `.background(Button(action:){}.jambotPlayStopShortcut{...}.opacity(0))`
//     if the transport button itself shouldn't also fire on plain Return.
//   - `.keyboardShortcut(.jambotSend)` — on the composer's Send button.
//   - `.keyboardShortcut(.jambotControls)` — on the Controls-sheet toggle
//     button in the Studio header.
//   - `.keyboardShortcut(.jambotAbout)` — on the About menu item / button
//     in the Library header.
extension KeyEquivalent {
    /// ⌘K — open Controls.
    static let jambotControls = KeyEquivalent("k")
    /// ⌘, — open About. (`,` is also the system Settings convention.)
    static let jambotAbout = KeyEquivalent(",")
}

extension View {
    /// ⌘↩ — send the current composer text.
    func jambotSendShortcut(action: @escaping () -> Void) -> some View {
        self.background(
            Button(action: action) { EmptyView() }
                .keyboardShortcut(.return, modifiers: .command)
                .opacity(0)
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        )
    }

    /// ⌘K — open the Controls sheet.
    func jambotControlsShortcut(action: @escaping () -> Void) -> some View {
        self.background(
            Button(action: action) { EmptyView() }
                .keyboardShortcut(.jambotControls, modifiers: .command)
                .opacity(0)
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        )
    }

    /// ⌘, — open About.
    func jambotAboutShortcut(action: @escaping () -> Void) -> some View {
        self.background(
            Button(action: action) { EmptyView() }
                .keyboardShortcut(.jambotAbout, modifiers: .command)
                .opacity(0)
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        )
    }

    /// Space — toggle play/stop. Only attach this on a view that is not
    /// also a text field (Space in a focused TextField/TextEditor must keep
    /// typing a literal space) — e.g. the Studio root, guarded by the
    /// integrator to skip firing while the composer has focus.
    func jambotPlayStopShortcut(action: @escaping () -> Void) -> some View {
        self.background(
            Button(action: action) { EmptyView() }
                .keyboardShortcut(.space, modifiers: [])
                .opacity(0)
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        )
    }
}
