import SwiftUI

/// Home: the AITA-card-on-a-sunburst from the video's opening shot, turned
/// into a prompt box, plus a shelf of the apps you've made.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    var open: (UUID, String?) -> Void

    @State private var draft = ""
    @State private var renaming: Project?
    @State private var newTitle = ""
    @State private var deleting: Project?
    @FocusState private var focused: Bool

    private static let ideas = [
        "a pomodoro timer that screams at me",
        "flappy bird but it's a splat",
        "a to-do list that judges me 💅",
        "tip calculator for 3am decisions",
        "a snake game with rizz",
        "a mood tracker with cursed emojis",
    ]

    var body: some View {
        ZStack {
            Sunburst(spin: false)
                .ignoresSafeArea()
            PaperGrain(opacity: 0.09).ignoresSafeArea()
            ScrollView {
                VStack(spacing: 22) {
                    header
                    promptCard
                    shelf
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 40)
                .frame(maxWidth: 680)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .alert("Rename app", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("name", text: $newTitle)
            Button("Save") {
                if var p = renaming, !newTitle.isEmpty { p.title = newTitle; model.store.update(p) }
                renaming = nil
            }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
        .confirmationDialog("Delete \(deleting?.title ?? "")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Delete app", role: .destructive) {
                if let p = deleting { model.store.delete(p.id); model.studios[p.id] = nil }
                deleting = nil
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: -8) {
                StrokedText(text: "TOKEN", font: Theme.anton(50), stroke: 3.5)
                StrokedText(text: "SURFERS", font: Theme.anton(50), color: Theme.yellow, stroke: 3.5)
                Text("vibe code while you surf")
                    .font(Theme.black(13))
                    .foregroundStyle(.white)
                    .shadow(color: Theme.ink.opacity(0.6), radius: 0, x: 0, y: 2)
                    .padding(.top, 12)
            }
            Spacer()
            SplatMascot(size: 104)
        }
        .padding(.top, 14)
        .overlay(alignment: .bottomTrailing) {
            if model.store.totalTokens > 0 {
                Text("🪙 \(model.store.totalTokens.formatted()) tokens surfed")
                    .font(Theme.rounded(12, .heavy))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(Capsule().fill(Theme.yellow))
                    .overlay(Capsule().strokeBorder(Theme.ink, lineWidth: 1.5))
                    .offset(y: 16)
            }
        }
    }

    // The reddit-post card from the video, as the prompt box.
    private var promptCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                SplatMascot(size: 26, face: false, animate: false)
                VStack(alignment: .leading, spacing: 0) {
                    Text("r/VibeCoding").font(Theme.black(13)).foregroundStyle(Theme.ink)
                    Text("u/you · just now").font(Theme.rounded(11, .medium)).foregroundStyle(Theme.ink2)
                }
                Spacer()
                Text("NEED APP")
                    .font(Theme.black(10)).foregroundStyle(.white)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(Theme.splat))
            }
            ZStack(alignment: .topLeading) {
                if draft.isEmpty {
                    Text("AITA for wanting an app that…")
                        .font(Theme.heavy(22))
                        .foregroundStyle(Theme.ink.opacity(0.28))
                        .allowsHitTesting(false)
                }
                TextField("", text: $draft, axis: .vertical)
                    .font(Theme.heavy(22))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2...6)
                    .focused($focused)
                    .submitLabel(.go)
                    .onSubmit(start)
            }
            // idea chips
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 7) {
                ForEach(Self.ideas, id: \.self) { idea in
                    Button { draft = idea } label: {
                        Text(idea).font(Theme.rounded(12.5, .bold)).foregroundStyle(Theme.ink)
                            .padding(.horizontal, 10).padding(.vertical, 7)
                            .background(Capsule().fill(Theme.cream))
                            .overlay(Capsule().strokeBorder(Theme.ink.opacity(0.18), lineWidth: 1))
                    }
                    .buttonStyle(SquishStyle())
                }
              }
              .padding(.horizontal, 16)
            }
            .padding(.horizontal, -16)
            HStack(spacing: 14) {
                Label("\(model.store.projects.count)", systemImage: "square.stack.fill")
                Label(model.store.bestScore > 0 ? "best \(model.store.bestScore.formatted())" : "no runs yet", systemImage: "trophy.fill")
                Spacer()
            }
            .font(Theme.rounded(12, .bold))
            .foregroundStyle(Theme.ink2)
            ChunkyButton(title: "SURF IT 🏄", fill: draft.trimmingCharacters(in: .whitespaces).isEmpty ? Theme.ink2.opacity(0.5) : Theme.splat, action: start)
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(16)
        .paperCard(radius: 22)
    }

    @ViewBuilder private var shelf: some View {
        let projects = model.store.projects
        VStack(alignment: .leading, spacing: 12) {
            StrokedText(text: "YOUR APPS", font: Theme.anton(26), stroke: 2.5)
            if projects.isEmpty {
                HStack(spacing: 12) {
                    SplatMascot(size: 52, mood: .dead, animate: false)
                    Text("no apps yet. the splat is bored.\ntype something up there ↑")
                        .font(Theme.rounded(14, .bold)).foregroundStyle(Theme.ink)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .paperCard(radius: 18)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                    ForEach(projects) { p in
                        Button { open(p.id, nil) } label: { AppCard(project: p, building: model.studios[p.id]?.building ?? false) }
                            .buttonStyle(SquishStyle())
                            .contextMenu {
                                Button { newTitle = p.title; renaming = p } label: { Label("Rename", systemImage: "pencil") }
                                ShareLink(item: model.store.exportURL(for: p)) { Label("Share HTML", systemImage: "square.and.arrow.up") }
                                Button(role: .destructive) { deleting = p } label: { Label("Delete", systemImage: "trash") }
                            }
                    }
                }
            }
        }
    }

    private func start() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        focused = false
        let p = model.store.create(prompt: text)
        open(p.id, text)
    }
}

struct AppCard: View {
    let project: Project
    var building = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(hue: project.hue, saturation: 0.55, brightness: 0.95))
                PaperGrain(opacity: 0.12).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text(project.emoji).font(.system(size: 46))
                if building {
                    VStack {
                        HStack {
                            Spacer()
                            Text("COOKING")
                                .font(Theme.black(9)).foregroundStyle(.white)
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(Capsule().fill(Theme.red))
                        }
                        Spacer()
                    }
                    .padding(7)
                }
            }
            .frame(height: 96)
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.ink, lineWidth: 2))
            VStack(alignment: .leading, spacing: 2) {
                Text(project.title).font(Theme.black(15)).foregroundStyle(Theme.ink).lineLimit(1)
                Text(subtitle).font(Theme.rounded(11.5, .semibold)).foregroundStyle(Theme.ink2).lineLimit(1)
            }
        }
        .padding(10)
        .paperCard(radius: 20)
    }

    private var subtitle: String {
        let when = project.updated.formatted(.relative(presentation: .named))
        return project.builds == 0 ? "not built yet" : "\(project.builds) build\(project.builds == 1 ? "" : "s") · \(when)"
    }
}
