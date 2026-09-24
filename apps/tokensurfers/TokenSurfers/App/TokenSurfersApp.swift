import SwiftUI

@main
struct TokenSurfersApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .onAppear(perform: configureWindow)
        }
    }

    /// Mac (Catalyst): a resizable window with a sane minimum and a phone-ish first size.
    private func configureWindow() {
        #if targetEnvironment(macCatalyst)
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            scene.sizeRestrictions?.minimumSize = CGSize(width: 400, height: 700)
            scene.sizeRestrictions?.maximumSize = CGSize(width: 2400, height: 1600)
            scene.titlebar?.titleVisibility = .hidden
            scene.titlebar?.toolbar = nil
        }
        #endif
    }
}

/// App-wide state: the store, and one Studio per opened project so a build
/// keeps running (and keeps its state) when you go back to Home.
@Observable
@MainActor
final class AppModel {
    let store = ProjectStore()
    var studios: [UUID: Studio] = [:]

    func studio(for id: UUID) -> Studio? {
        if let s = studios[id] { return s }
        guard let p = store.project(id) else { return nil }
        let s = Studio(store: store, project: p)
        studios[id] = s
        return s
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var openID: UUID?
    @State private var openPrompt: String?

    var body: some View {
        ZStack {
            HomeView { id, prompt in
                openPrompt = prompt
                withAnimation(.spring(response: 0.42, dampingFraction: 0.9)) { openID = id }
            }
            if let id = openID, let studio = model.studio(for: id) {
                StudioView(studio: studio, initialPrompt: openPrompt) {
                    openPrompt = nil
                    withAnimation(.spring(response: 0.42, dampingFraction: 0.9)) { openID = nil }
                }
                .id(id)
                .transition(.move(edge: .trailing))
                .zIndex(1)
            }
        }
        .onOpenURL { _ in }
        .task { autorun() }
    }

    /// Test hook: TS_AUTORUN="<prompt>" opens a new project and builds it;
    /// TS_OPEN="first" opens the most recent project (TS_SEND="<prompt>" then asks for a change).
    private func autorun() {
        let env = ProcessInfo.processInfo.environment
        if let prompt = env["TS_AUTORUN"], !prompt.isEmpty {
            let p = model.store.create(prompt: prompt)
            openPrompt = prompt
            openID = p.id
        } else if env["TS_OPEN"] == "first", let p = model.store.projects.first {
            openID = p.id
            if let follow = env["TS_SEND"], !follow.isEmpty { model.studio(for: p.id)?.send(follow) }
        }
    }
}
