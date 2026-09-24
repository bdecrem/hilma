import SwiftUI

/// The split screen from the video, made usable: the stage (your app, or the
/// code being written) on top, Token Surfers underneath, the caption on the
/// seam, a composer at the bottom. Wide windows go side by side.
struct StudioView: View {
    @Bindable var studio: Studio
    var initialPrompt: String?
    var onBack: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @State private var draft = ""
    @State private var split: CGFloat = 0.5          // stage share while the game is open
    @State private var gameOpen = true
    @State private var userSized = false
    @State private var fullscreenApp = false
    @State private var renaming = false
    @State private var newTitle = ""
    @State private var confirmDelete = false
    @State private var showDone = false
    @State private var dragStart: CGFloat?
    @State private var account = SurfAccount.shared
    @State private var showAccount = false
    @State private var publishing = false
    @State private var publishNote: String?
    @State private var publishedURL: URL?
    @AppStorage("muted") private var muted = false
    @AppStorage("narrator") private var narrator = true
    @AppStorage("music") private var music = true
    @FocusState private var composerFocused: Bool

    var body: some View {
        GeometryReader { g in
            let wide = g.size.width > 720 && g.size.width > g.size.height * 1.05
            Group {
                if wide { wideLayout(g.size) } else { tallLayout(g.size) }
            }
            .background(alignment: .top) {
                (studio.stageTab == .app && !studio.html.isEmpty ? Color.white : Theme.navy).ignoresSafeArea()
            }
        }
        .ignoresSafeArea(.container, edges: wideEdges)
        .statusBarHidden(false)
        .onAppear {
            SurfAudio.shared.start()
            gameOpen = studio.html.isEmpty || studio.building
            if let p = initialPrompt, !p.isEmpty, studio.html.isEmpty, !studio.building { studio.send(p) }
            if ProcessInfo.processInfo.environment["TS_PUBLISH"] != nil {
                Task { try? await Task.sleep(for: .seconds(2)); publish() }
            }
        }
        .onChange(of: studio.building) { _, b in
            if b {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { gameOpen = true; if !userSized { split = 0.5 } }
            }
        }
        .onChange(of: studio.phase) { _, p in
            guard p == .done else { return }
            showDone = true
            // give the finale a moment, then hand the screen back to the app
            Task {
                try? await Task.sleep(for: .seconds(4.5))
                showDone = false
                if !studio.building && !userSized {
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) { gameOpen = false }
                }
            }
        }
        .fullScreenCover(isPresented: $fullscreenApp) { fullscreen }
        .sheet(isPresented: $showAccount) { AccountSheet { publish() } }
        .alert(publishNote ?? "", isPresented: Binding(get: { publishNote != nil }, set: { if !$0 { publishNote = nil } })) {
            if let url = publishedURL {
                ShareLink(item: url) { Text("Share the link") }
            }
            Button("OK", role: .cancel) { publishNote = nil }
        }
        .alert("Rename app", isPresented: $renaming) {
            TextField("name", text: $newTitle)
            Button("Save") { if !newTitle.isEmpty { studio.rename(newTitle) } }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Delete \(studio.project.title)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete app", role: .destructive) {
                studio.store.delete(studio.project.id)
                onBack()
            }
        }
    }

    private var wideEdges: Edge.Set { [] }

    private var gameRunning: Bool { gameOpen && scenePhase == .active && !fullscreenApp }

    // MARK: tall (iPhone, narrow windows)

    private func tallLayout(_ size: CGSize) -> some View {
        let composerH: CGFloat = chipsVisible ? 108 : 70
        let avail = size.height - composerH
        let stageH = gameOpen ? max(160, avail * split) : avail
        let gameH = avail - stageH
        return VStack(spacing: 0) {
            stage
                .frame(height: stageH)
                .clipped()
                .overlay(alignment: .top) { topBar }
            if gameOpen {
                game(compact: gameH < 260)
                    .frame(height: gameH)
                    .clipped()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            composer
                .frame(height: composerH)
        }
        .overlay(alignment: .top) {
            seam(width: size.width)
                .offset(y: stageH - 34)
                .gesture(resize(total: avail))
        }
    }

    // MARK: wide (iPad landscape, Mac windows)

    private func wideLayout(_ size: CGSize) -> some View {
        let side = min(460, max(360, size.width * 0.38))
        return HStack(spacing: 0) {
            stage
                .overlay(alignment: .top) { topBar }
                .clipShape(RoundedRectangle(cornerRadius: 0))
            VStack(spacing: 0) {
                ZStack(alignment: .top) {
                    if gameOpen {
                        game(compact: false)
                    } else {
                        ZStack {
                            Sunburst(spin: false)
                            PaperGrain(opacity: 0.1)
                            VStack(spacing: 14) {
                                SplatMascot(size: 110)
                                Button { withAnimation { gameOpen = true } } label: {
                                    Label("Surf while you wait", systemImage: "figure.surfing")
                                        .font(Theme.black(15)).foregroundStyle(Theme.ink)
                                        .padding(.horizontal, 18).padding(.vertical, 12)
                                        .background(Capsule().fill(.white))
                                }
                                .buttonStyle(SquishStyle())
                            }
                        }
                    }
                    captionOverlay
                        .padding(.top, 70)
                }
                composer.frame(height: chipsVisible ? 108 : 70)
            }
            .frame(width: side)
        }
    }

    // MARK: pieces

    @ViewBuilder private var stage: some View {
        ZStack {
            switch studio.stageTab {
            case .app:
                if studio.html.isEmpty {
                    if studio.building { CodeView(code: studio.codeForDisplay, streaming: true) } else { EmptyStage() }
                } else {
                    PreviewWebView(html: studio.html, version: studio.previewVersion, projectID: studio.project.id)
                        .padding(.top, 52)
                        .background(Color.white)
                }
            case .code:
                CodeView(code: studio.codeForDisplay, streaming: studio.building,
                         isPatch: studio.isPatch && studio.phase == .editing,
                         patchOld: studio.patchOld, patchNew: studio.patchNew)
            }
            if let c = studio.cutaway {
                CutawayView(cutaway: c, bugs: studio.lastBugs)
                    .id(c)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: studio.cutaway)
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            circleButton("chevron.left", label: "Back") { onBack() }
            Button { newTitle = studio.project.title; renaming = true } label: {
                HStack(spacing: 6) {
                    Text(studio.project.emoji).font(.system(size: 18))
                    Text(studio.project.title)
                        .font(Theme.black(15))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                }
                .padding(.horizontal, 12).frame(height: 38)
                .background(Capsule().fill(.white.opacity(0.94)))
                .overlay(Capsule().strokeBorder(Theme.ink.opacity(0.12)))
            }
            .buttonStyle(SquishStyle())
            Spacer(minLength: 4)
            tabs
            menu
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
    }

    private var tabs: some View {
        HStack(spacing: 0) {
            ForEach([Studio.StageTab.app, .code], id: \.self) { t in
                Button {
                    withAnimation(.snappy) { studio.stageTab = t; studio.stagePinned = studio.building }
                } label: {
                    Text(t == .app ? "APP" : "CODE")
                        .font(Theme.black(12))
                        .foregroundStyle(studio.stageTab == t ? .white : Theme.ink)
                        .frame(width: 52, height: 30)
                        .background(Capsule().fill(studio.stageTab == t ? Theme.ink : .clear))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Capsule().fill(.white.opacity(0.94)))
    }

    private var menu: some View {
        Menu {
            Button { fullscreenApp = true } label: { Label("Open app fullscreen", systemImage: "arrow.up.left.and.arrow.down.right") }
                .disabled(studio.html.isEmpty)
            ShareLink(item: studio.store.exportURL(for: studio.project)) { Label("Share HTML", systemImage: "square.and.arrow.up") }
                .disabled(studio.html.isEmpty)
            Divider()
            Button { publish() } label: {
                Label(studio.project.remoteSlug == nil ? "Publish to the gallery" : "Update in the gallery", systemImage: "square.and.arrow.up.on.square")
            }
            .disabled(studio.html.isEmpty || studio.building || publishing)
            if let slug = studio.project.remoteSlug, let url = URL(string: "\(backendURL().absoluteString)/surf/a/\(slug)") {
                ShareLink(item: url) { Label("Share the link", systemImage: "link") }
                Button(role: .destructive) { unpublish() } label: { Label("Unpublish", systemImage: "eye.slash") }
            }
            Divider()
            Toggle(isOn: Binding(get: { !muted }, set: { muted = !$0 })) { Label("Sound", systemImage: "speaker.wave.2") }
            Toggle(isOn: $music) { Label("Music", systemImage: "music.note") }
            Toggle(isOn: $narrator) { Label("Narrator voice", systemImage: "waveform") }
            Divider()
            Button(role: .destructive) { confirmDelete = true } label: { Label("Delete app", systemImage: "trash") }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(Theme.ink)
                .frame(width: 38, height: 38)
                .background(Circle().fill(.white.opacity(0.94)))
        }
        .accessibilityLabel("More")
    }

    private func circleButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(Theme.ink)
                .frame(width: 38, height: 38)
                .background(Circle().fill(.white.opacity(0.94)))
        }
        .buttonStyle(SquishStyle())
        .accessibilityLabel(label)
    }

    private func game(compact: Bool) -> some View {
        SurfGameView(engine: studio.game, running: gameRunning, compact: compact, mode: "build")
            .overlay(alignment: .bottomLeading) {
                SubtitleBox(text: studio.subtitle)
                    .padding(10)
                    .opacity(studio.building || showDone ? 1 : 0)
            }
            .overlay(alignment: .topTrailing) {
                if !studio.building {
                    Button { withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { gameOpen = false } } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(.black.opacity(0.35)))
                    }
                    .padding(.top, 66).padding(.trailing, 10)
                    .accessibilityLabel("Hide game")
                }
            }
    }

    /// The caption rides the seam; it doubles as the resize handle.
    private func seam(width: CGFloat) -> some View {
        VStack(spacing: 4) {
            captionOverlay
                .frame(height: 60)
            if gameOpen {
                Capsule().fill(.white.opacity(0.5)).frame(width: 44, height: 5)
                    .shadow(color: .black.opacity(0.3), radius: 1, y: 1)
            }
        }
        .frame(width: width, height: 72)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var captionOverlay: some View {
        if (studio.building || showDone || studio.phase != .idle && studio.phase != .done) && !studio.caption.isEmpty {
            CaptionBand(caption: studio.caption, id: studio.captionID, size: 32, filler: studio.captionIsFiller)
                .frame(maxWidth: .infinity)
        } else {
            Color.clear.frame(height: 1)
        }
    }

    private func resize(total: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { v in
                guard gameOpen else { return }
                if dragStart == nil { dragStart = split }
                split = min(0.8, max(0.22, (dragStart ?? split) + v.translation.height / total))
                userSized = true
            }
            .onEnded { v in
                dragStart = nil
                if split > 0.78, v.predictedEndTranslation.height > 60 {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { gameOpen = false; split = 0.5 }
                    userSized = false
                }
            }
    }

    // MARK: composer

    private static let followUps = ["make it prettier ✨", "add sound effects 🔊", "more chaos 🌀", "add a high score 🏆", "dark mode 🌚"]

    private var chipsVisible: Bool { !studio.building && !studio.html.isEmpty && !composerFocused && draft.isEmpty }

    private var composer: some View {
        VStack(spacing: 8) {
            if chipsVisible {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        if !gameOpen {
                            chip("🏄 surf") { withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { gameOpen = true } }
                        }
                        ForEach(Self.followUps, id: \.self) { s in chip(s) { studio.send(s) } }
                    }
                    .padding(.horizontal, 12)
                }
                .frame(height: 32)
            }
            HStack(spacing: 10) {
                if studio.building {
                    statusPill
                    Button { studio.stop() } label: {
                        Image(systemName: "stop.fill").font(.system(size: 15, weight: .black)).foregroundStyle(.white)
                            .frame(width: 46, height: 46).background(Circle().fill(Theme.red))
                    }
                    .buttonStyle(SquishStyle())
                    .accessibilityLabel("Stop")
                } else {
                    TextField(studio.html.isEmpty ? "what are we building?" : "change something…", text: $draft, axis: .vertical)
                        .font(Theme.rounded(16, .semibold))
                        .lineLimit(1...3)
                        .focused($composerFocused)
                        .submitLabel(.send)
                        .onSubmit(send)
                        .padding(.horizontal, 16).padding(.vertical, 12)
                        .background(RoundedRectangle(cornerRadius: 23, style: .continuous).fill(.white))
                        .overlay(RoundedRectangle(cornerRadius: 23, style: .continuous).strokeBorder(Theme.ink, lineWidth: 2))
                    if case .failed = studio.phase, draft.isEmpty {
                        roundButton("arrow.clockwise", fill: Theme.yellow, fg: Theme.ink, label: "Retry") { studio.retry() }
                    } else {
                        roundButton("arrow.up", fill: draft.isEmpty ? Theme.ink2.opacity(0.4) : Theme.splat, fg: .white, label: "Send", action: send)
                            .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .padding(.horizontal, 12)
        }
        .padding(.vertical, 10)
        .frame(maxHeight: .infinity)
        .background(Theme.orange.overlay(PaperGrain(opacity: 0.08)))
    }

    private var statusPill: some View {
        HStack(spacing: 10) {
            SplatMascot(size: 28, face: false)
            VStack(alignment: .leading, spacing: 1) {
                Text(phaseLabel).font(Theme.black(14)).foregroundStyle(Theme.ink)
                Text("\(studio.outputTokens.formatted()) tokens · tokens = coins")
                    .font(Theme.rounded(11.5, .semibold)).foregroundStyle(Theme.ink2)
                    .monospacedDigit()
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .frame(height: 46)
        .background(RoundedRectangle(cornerRadius: 23, style: .continuous).fill(.white))
        .overlay(RoundedRectangle(cornerRadius: 23, style: .continuous).strokeBorder(Theme.ink, lineWidth: 2))
    }

    private var phaseLabel: String {
        switch studio.phase {
        case .thinking: return "cooking…"
        case .writing: return "writing the app"
        case .editing: return "patching"
        case .reading: return "reading the code"
        case .running: return "test-driving it"
        default: return "…"
        }
    }

    private func chip(_ s: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(s).font(Theme.rounded(13.5, .bold)).foregroundStyle(Theme.ink)
                .padding(.horizontal, 12).frame(height: 32)
                .background(Capsule().fill(.white.opacity(0.92)))
                .overlay(Capsule().strokeBorder(Theme.ink.opacity(0.8), lineWidth: 1.5))
        }
        .buttonStyle(SquishStyle())
    }

    private func roundButton(_ icon: String, fill: Color, fg: Color, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 18, weight: .black)).foregroundStyle(fg)
                .frame(width: 46, height: 46)
                .background(Circle().fill(fill))
                .overlay(Circle().strokeBorder(Theme.ink, lineWidth: 2))
        }
        .buttonStyle(SquishStyle())
        .accessibilityLabel(label)
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        composerFocused = false
        studio.send(text)
    }

    // MARK: publishing

    private func publish() {
        guard account.signedIn else { showAccount = true; return }
        publishing = true
        Task {
            do {
                let app = try await account.publish(project: studio.project, html: studio.html)
                studio.setRemoteSlug(app.slug)
                publishedURL = URL(string: app.url)
                publishNote = "It's live at \(app.url)"
                SurfAudio.shared.play(.celebrate)
            } catch {
                publishNote = "Couldn't publish: \(error.localizedDescription)"
            }
            publishing = false
        }
    }

    private func unpublish() {
        guard let slug = studio.project.remoteSlug else { return }
        Task {
            do {
                try await account.unpublish(slug: slug)
                studio.setRemoteSlug(nil)
                publishedURL = nil
                publishNote = "Taken down."
            } catch {
                publishNote = "Couldn't unpublish: \(error.localizedDescription)"
            }
        }
    }

    // MARK: fullscreen app

    private var fullscreen: some View {
        ZStack(alignment: .topTrailing) {
            Color.white.ignoresSafeArea()
            PreviewWebView(html: studio.html, version: studio.previewVersion, projectID: studio.project.id)
                .ignoresSafeArea(.container, edges: .bottom)
            Button { fullscreenApp = false } label: {
                Image(systemName: "xmark").font(.system(size: 14, weight: .black)).foregroundStyle(.white)
                    .frame(width: 34, height: 34).background(Circle().fill(.black.opacity(0.5)))
            }
            .padding(10)
            .accessibilityLabel("Close")
        }
    }
}
