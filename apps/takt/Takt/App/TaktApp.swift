import SwiftUI

@main
struct TaktApp: App {
    @AppStorage("theme") private var theme: Theme = .dark

    var body: some Scene {
        WindowGroup {
            LessonScreen(state: .preview)
                .preferredColorScheme(theme.colorScheme)
                #if targetEnvironment(macCatalyst)
                .background(MacWindow())
                #endif
        }
        .commands {
            CommandGroup(after: .toolbar) {
                Toggle("Paper Theme", isOn: Binding(
                    get: { theme == .paper },
                    set: { theme = $0 ? .paper : .dark }
                ))
                .keyboardShortcut("l", modifiers: [.command, .shift])
            }
        }
    }
}

#if targetEnvironment(macCatalyst)
/// Mac window chrome: the brief's 1100×720 minimum, no title text and no toolbar,
/// so the transport bar is the top of the window.
struct MacWindow: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView { Probe() }
    func updateUIView(_ uiView: UIView, context: Context) {}

    final class Probe: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard let scene = window?.windowScene else { return }
            scene.sizeRestrictions?.minimumSize = CGSize(width: 1100, height: 720)
            scene.titlebar?.titleVisibility = .hidden
            scene.titlebar?.toolbar = nil
        }
    }
}
#endif
