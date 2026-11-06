import SwiftUI

/// What Agent mode opens on: a song (bundled, or a mod to continue) and, from the pause menu,
/// where the player is in it.
struct AgentTarget: Identifiable, Equatable {
    let song: Song
    let position: ModStore.Position?
    var id: String { "\(song.name)@\(song.version)" }
    static func == (a: AgentTarget, b: AgentTarget) -> Bool { a.id == b.id }
}

/// Agent mode: the Stage's agentic superpower, in a sheet over the set list or a paused run.
/// Tell the agent what to change about a track's charts — "Medium is way too hard, get rid of
/// half the notes", "add a funky super hard solo at the end" — and it makes the player's own
/// version of the track (the original stays), one turn at a time: its working steps appear as
/// it goes, then its report, then the new version as a card with the levels' figures and Play.
/// The thread continues across messages; a mod's card on the set list reopens it.
struct AgentSheet: View {
    let app: AppModel
    let target: AgentTarget
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var thread: [ModStore.Message] = []
    @State private var input = ""
    @State private var working = false
    @State private var steps: [String] = []
    @State private var started = Date()
    @State private var error: String?
    /// The mod as it stands after the last turn that changed it (a mod opened from its card
    /// starts here).
    @State private var landed: Song?
    @State private var title: String?
    @State private var confirmRemove = false
    @State private var removing = false
    /// The mod's history (v0 the original), the panel that lists it, the version being restored.
    @State private var versions: [ModStore.Version] = []
    @State private var showVersions = false
    @State private var restoring: Int?
    @FocusState private var focused: Bool

    /// The first asks on an empty thread; a tap sends one.
    static let suggestions = [
        "Medium on the melody is way too hard — get rid of half the notes.",
        "Add a funky, super hard solo chorus at the end.",
        "Easy on the chords: two chords a bar, nothing more.",
        "Make the comping groove harder: more pushes, more fills.",
    ]

    private var compact: Bool { sizeClass == .compact }
    /// The mod this thread belongs to, if it exists yet.
    private var mod: Song? { landed ?? (target.song.mod != nil ? target.song : nil) }
    private var base: Song? { app.baseSong(of: mod ?? target.song) ?? (target.song.mod == nil ? target.song : nil) }

    var body: some View {
        VStack(spacing: 0) {
            header
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.top, compact ? 18 : 22)
                .padding(.bottom, 14)
            Hairline()
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if thread.isEmpty && !working {
                            intro
                        }
                        if showVersions, let mod {
                            VersionsPanel(versions: versions, current: mod.version, restoring: restoring, compact: compact) { restore($0) }
                        }
                        ForEach(Array(thread.enumerated()), id: \.offset) { _, m in
                            MessageRow(message: m, compact: compact)
                        }
                        if working {
                            WorkingPanel(steps: steps, started: started, compact: compact)
                                .id("working")
                        }
                        if let error {
                            Text(error)
                                .bodyText(14)
                                .foregroundStyle(Palette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let landed, !working {
                            ModCard(app: app, mod: landed, base: base, compact: compact, fromRun: target.position != nil) {
                                dismiss()
                                app.play(song: landed)
                            } practice: {
                                dismiss()
                                app.practice(song: landed)
                            }
                            .id("landed")
                        }
                    }
                    .padding(.horizontal, compact ? 16 : 24)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollBounceBehavior(.basedOnSize)
                .onChange(of: steps.count) { withAnimation { proxy.scrollTo("working", anchor: .bottom) } }
                .onChange(of: thread.count) { withAnimation { proxy.scrollTo("working", anchor: .bottom) } }
                .onChange(of: working) { if !working { withAnimation { proxy.scrollTo("landed", anchor: .bottom) } } }
            }
            Hairline()
            composer
                .padding(.horizontal, compact ? 16 : 24)
                .padding(.vertical, 14)
        }
        .frame(minWidth: compact ? 0 : 680, minHeight: compact ? 0 : 640)
        .background(Palette.ground.ignoresSafeArea())
        .onAppear(perform: load)
        .confirmationDialog("Remove this version?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove \(mod?.meta.title ?? "it")", role: .destructive) { remove() }
        } message: {
            Text("The thread and the charts go with it. \(base?.meta.title ?? "The original") stays.")
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Agent mode")
                    .font(.display(compact ? 30 : 40))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.signal)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let mod {
                    Text("\(mod.meta.title) · v\(mod.version) · from \(mod.mod?.baseTitle ?? "")")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(compact ? 2 : 1)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("\(target.song.meta.title) · your own version")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                }
                if let p = target.position {
                    Text("You paused at bar \(p.bar), \(p.section) · \(p.part) · \(p.difficulty == "adaptive" ? "level \(p.level)" : p.difficulty)")
                        .dataLabel(10)
                        .foregroundStyle(Palette.cue)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if mod != nil, versions.count >= 2, !working {
                // The history: every version this thread made, any of them one tap away.
                Button { withAnimation(.easeInOut(duration: 0.2)) { showVersions.toggle() } } label: {
                    Text(compact ? "V\(mod?.version ?? 0)" : "Versions")
                        .dataLabel(11, weight: .semibold)
                        .foregroundStyle(showVersions ? Palette.blackKey : Palette.signal)
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .background(RoundedRectangle(cornerRadius: 6).fill(showVersions ? Palette.signal : .clear))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(showVersions ? Palette.signal : Palette.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Versions, \(versions.count)")
                .accessibilityAddTraits(showVersions ? [.isSelected] : [])
            }
            if mod != nil && !working {
                Button { confirmRemove = true } label: {
                    Text(removing ? "Removing…" : "Remove")
                        .dataLabel(11, weight: .semibold)
                        .foregroundStyle(Palette.muted)
                        .padding(.horizontal, 12)
                        .frame(height: 32)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(removing)
            }
            QuietButton(title: "Done") { dismiss() }
        }
    }

    /// An empty thread: what this is, and four things to ask.
    private var intro: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Tell the agent what to change about \(target.song.meta.title): the charts for the chords or the melody, a level that's too hard or too thin, a solo that isn't there yet. It makes your own version of the track and the original stays. Then play it.")
                .bodyText(compact ? 14 : 15)
                .foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
            Text("Try one")
                .dataLabel(10)
                .foregroundStyle(Palette.muted)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], alignment: .leading, spacing: 10) {
                ForEach(Self.suggestions, id: \.self) { s in
                    Button { send(s) } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Rectangle().fill(Palette.signal).frame(width: 3)
                            Text(s)
                                .bodyText(13)
                                .foregroundStyle(Palette.text)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                        .padding(.trailing, 12)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Palette.panel))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(working ? (app.account.state == .unknown ? "Connecting to ola.cx…" : "The agent is working…") : (thread.isEmpty ? "What should change?" : "Anything else?"), text: $input, axis: .vertical)
                .lineLimit(1...4)
                .bodyText(15)
                .foregroundStyle(Palette.text)
                .textInputAutocapitalization(.sentences)
                .focused($focused)
                .disabled(working)
                .onSubmit { send(input) }
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .background(RoundedRectangle(cornerRadius: 6).fill(Palette.panel))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(focused ? Palette.signal : Palette.line, lineWidth: 1))
            Button { send(input) } label: {
                Text("Send")
                    .dataLabel(13, weight: .semibold)
                    .foregroundStyle(canSend ? Palette.blackKey : Palette.muted)
                    .padding(.horizontal, 20)
                    .frame(height: 44)
                    .background(RoundedRectangle(cornerRadius: 6).fill(canSend ? Palette.signal : Palette.panel))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(canSend ? Palette.signal : Palette.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .keyboardShortcut(.return, modifiers: [.command])
        }
    }

    private var canSend: Bool { !working && !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    // MARK: Work

    private func load() {
        if target.song.mod != nil {
            landed = target.song
            title = target.song.meta.title
            let bundle = app.mods.bundle(for: target.song)
            thread = bundle?.messages ?? []
            versions = bundle?.versions ?? []
        } else if let pending = app.mods.pendingThread(for: target.song.name) {
            thread = pending.messages
            title = pending.title
        }
        #if DEBUG
        // `-AgentVersions 1` opens the history panel at once (the screenshots).
        if UserDefaults.standard.bool(forKey: "AgentVersions") { showVersions = true }
        // `-AgentRestore <n>` restores that version at once (the check of the real flow).
        if UserDefaults.standard.integer(forKey: "AgentRestore") > 0 || UserDefaults.standard.string(forKey: "AgentRestore") == "0" {
            let n = UserDefaults.standard.integer(forKey: "AgentRestore")
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { restore(n) }
        }
        if let say = UserDefaults.standard.string(forKey: "AgentSay"), !say.isEmpty {
            UserDefaults.standard.removeObject(forKey: "AgentSay")
            send(say)
        }
        #endif
    }

    private func send(_ text: String) {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !working else { return }
        input = ""
        error = nil
        steps = []
        started = Date()
        working = true
        let now = ISO8601DateFormatter().string(from: Date())
        thread.append(.init(role: "user", text: message, at: now, steps: nil))
        let song = landed ?? target.song
        Task { @MainActor in
            // The account comes up a moment after launch; a message sent before it is known
            // would go out without a session. Wait for it, briefly.
            var waited = 0
            while app.account.state == .unknown && waited < 40 {
                try? await Task.sleep(for: .milliseconds(250))
                waited += 1
            }
            guard app.account.state != .unknown else {
                error = "Can't reach ola.cx. Agent mode needs the account; your songs still play."
                working = false
                return
            }
            for await event in app.mods.send(message, song: song, position: target.position) {
                switch event {
                case .created(let t):
                    title = t
                case .status(let s):
                    steps.append(s)
                case .reply(let r):
                    thread.append(.init(role: "agent", text: r, at: ISO8601DateFormatter().string(from: Date()), steps: steps))
                case .done(let b):
                    title = b.title
                    versions = b.versions
                    if b.version >= 1, let s = try? b.song() {
                        landed = s
                        app.adopt(mod: s, from: target.song)
                    }
                case .failed(let e):
                    error = e
                }
            }
            working = false
        }
    }

    /// Back to an earlier version: the server files it as the next one; the card and the
    /// thread follow.
    private func restore(_ version: Int) {
        guard let m = mod?.mod, restoring == nil, !working else { return }
        restoring = version
        error = nil
        Task { @MainActor in
            do {
                let b = try await app.mods.rollBack(m.id, to: version)
                versions = b.versions
                if let last = b.messages.last, last.role == "agent" { thread.append(last) }
                if let s = try? b.song() {
                    landed = s
                    app.adopt(mod: s, from: target.song)
                }
                withAnimation(.easeInOut(duration: 0.2)) { showVersions = false }
            } catch {
                self.error = (error as? ModStore.Failure)?.message ?? "Couldn't go back: can't reach ola.cx."
            }
            restoring = nil
        }
    }

    private func remove() {
        guard let m = mod?.mod else { return }
        removing = true
        Task { @MainActor in
            do {
                try await app.remove(modID: m.id)
                dismiss()
            } catch {
                self.error = (error as? ModStore.Failure)?.message ?? "Couldn't remove it: can't reach ola.cx."
            }
            removing = false
        }
    }
}

/// The history, newest first: the version, what made it, its line; Restore on every one but
/// the current. A restore is a new version with the old content, so nothing is ever lost.
struct VersionsPanel: View {
    let versions: [ModStore.Version]
    let current: Int
    let restoring: Int?
    let compact: Bool
    let restore: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Versions")
                    .dataLabel(10, weight: .semibold)
                    .foregroundStyle(Palette.muted)
                Spacer()
                Text("Restore brings one back as the next version; nothing is lost.")
                    .dataLabel(9)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.bottom, 8)
            if versions.isEmpty {
                Text("No history yet: the next change starts it.")
                    .bodyText(compact ? 13 : 14)
                    .foregroundStyle(Palette.muted)
            }
            ForEach(versions.sorted { $0.version > $1.version }) { v in
                let now = v.version == current
                HStack(alignment: .top, spacing: compact ? 10 : 14) {
                    Text("v\(v.version)")
                        .font(.display(compact ? 20 : 24))
                        .monospacedDigit()
                        .foregroundStyle(now ? Palette.signal : Palette.text)
                        .frame(width: compact ? 34 : 44, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(v.ask)
                            .bodyText(compact ? 13 : 14, weight: .semibold)
                            .foregroundStyle(Palette.text)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                        if !v.line.isEmpty {
                            Text(v.line)
                                .bodyText(compact ? 12 : 13)
                                .foregroundStyle(Palette.muted)
                                .lineLimit(2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 8)
                    if now {
                        Text("Now")
                            .dataLabel(10, weight: .semibold)
                            .foregroundStyle(Palette.signal)
                            .frame(height: 28)
                    } else {
                        Button { restore(v.version) } label: {
                            Text(restoring == v.version ? "Restoring…" : "Restore")
                                .dataLabel(10, weight: .semibold)
                                .foregroundStyle(Palette.text)
                                .padding(.horizontal, 10)
                                .frame(height: 28)
                                .background(RoundedRectangle(cornerRadius: 6).fill(Palette.ground))
                                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(restoring != nil)
                    }
                }
                .padding(.vertical, 8)
                if v.version != versions.map(\.version).min() { Hairline() }
            }
        }
        .padding(compact ? 14 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
        .transition(.opacity)
    }
}

/// One message of the thread: yours on the right in a quiet panel, the agent's on the left.
struct MessageRow: View {
    let message: ModStore.Message
    let compact: Bool

    var body: some View {
        let mine = message.role == "user"
        HStack {
            if mine { Spacer(minLength: compact ? 40 : 120) }
            VStack(alignment: .leading, spacing: 5) {
                Text(mine ? "You" : "Agent")
                    .dataLabel(9, weight: .semibold)
                    .foregroundStyle(mine ? Palette.muted : Palette.signal)
                Text(message.text)
                    .bodyText(compact ? 14 : 15)
                    .foregroundStyle(Palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                if !mine, let steps = message.steps, !steps.isEmpty {
                    Text("\(steps.count) \(steps.count == 1 ? "step" : "steps") · \(steps.suffix(2).joined(separator: " · "))")
                        .dataLabel(9)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
            .padding(.horizontal, mine ? 14 : 0)
            .padding(.vertical, mine ? 10 : 0)
            .background(mine ? RoundedRectangle(cornerRadius: 6).fill(Palette.panel) : nil)
            .overlay(mine ? RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line, lineWidth: 1) : nil)
            if !mine { Spacer(minLength: compact ? 24 : 80) }
        }
    }
}

/// The agent at work: a pulse, the seconds, and the steps as they happen, the last one lit.
struct WorkingPanel: View {
    let steps: [String]
    let started: Date
    let compact: Bool
    @State private var pulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Circle()
                    .fill(Palette.signal)
                    .frame(width: 10, height: 10)
                    .scaleEffect(pulse ? 1 : 0.6)
                    .opacity(pulse ? 1 : 0.4)
                    .animation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true), value: pulse)
                    .onAppear { pulse = true }
                Text("Working")
                    .dataLabel(11, weight: .semibold)
                    .foregroundStyle(Palette.signal)
                TimelineView(.periodic(from: started, by: 1)) { ctx in
                    Text("\(Int(ctx.date.timeIntervalSince(started))) s")
                        .dataLabel(11)
                        .foregroundStyle(Palette.muted)
                        .monospacedDigit()
                }
                Spacer()
            }
            ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(i == steps.count - 1 ? "▶" : "✓")
                        .dataLabel(10)
                        .foregroundStyle(i == steps.count - 1 ? Palette.signal : Palette.muted)
                        .frame(width: 14)
                    Text(s)
                        .bodyText(compact ? 13 : 14)
                        .foregroundStyle(i == steps.count - 1 ? Palette.text : Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if steps.isEmpty {
                Text("Reading the song…")
                    .bodyText(compact ? 13 : 14)
                    .foregroundStyle(Palette.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Palette.panel))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line, lineWidth: 1))
        .animation(.easeOut(duration: 0.25), value: steps.count)
    }
}

/// The version as it stands: its name, where it came from, the line, each part's levels as
/// onsets a second against the original, and Play.
struct ModCard: View {
    let app: AppModel
    let mod: Song
    let base: Song?
    let compact: Bool
    let fromRun: Bool
    let play: () -> Void
    let practice: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                SongArt(kind: mod.meta.art)
                    .frame(width: compact ? 56 : 72, height: compact ? 56 : 72)
                VStack(alignment: .leading, spacing: 4) {
                    Text(mod.meta.title)
                        .font(.display(compact ? 26 : 32))
                        .textCase(.uppercase)
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    HStack(spacing: 8) {
                        VersionBadge(version: mod.version)
                        Text("\(mod.meta.style) · \(mod.meta.key) · \(mod.meta.tempo) bpm · \(mod.length)")
                            .dataLabel(10)
                            .foregroundStyle(Palette.muted)
                            .lineLimit(1)
                    }
                    Text(mod.meta.line)
                        .bodyText(compact ? 13 : 14)
                        .foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            ForEach(mod.partKeys, id: \.rawValue) { k in
                LadderStrip(mod: mod, base: base, part: k, compact: compact)
            }
            HStack(spacing: 10) {
                PrimaryButton(title: fromRun ? "Play it" : "Play", action: play)
                QuietButton(title: "Practice", action: practice)
                Spacer(minLength: 0)
            }
        }
        .padding(compact ? 16 : 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(shape.fill(Palette.panel))
        .overlay(shape.strokeBorder(Palette.signal, lineWidth: 1))
    }
}

/// "V3" in signal, for a mod's card.
struct VersionBadge: View {
    let version: Int

    var body: some View {
        Text("v\(version)")
            .dataLabel(9, weight: .semibold)
            .foregroundStyle(Palette.blackKey)
            .padding(.horizontal, 6)
            .frame(height: 18)
            .background(RoundedRectangle(cornerRadius: 4).fill(Palette.signal))
            .accessibilityLabel("Version \(version), your own")
    }
}

/// One part's four levels as onsets a second, each against the original's figure when it moved.
struct LadderStrip: View {
    let mod: Song
    let base: Song?
    let part: Song.PartKey
    let compact: Bool

    private func figure(_ song: Song, _ d: GameEngine.Difficulty) -> Double? {
        guard song.partKeys.contains(part), let tier = song.charting.tier(d, song: song.name, part: part) else { return nil }
        let ladder = song.ladder(part)
        return tier - 1 < ladder.count ? ladder[tier - 1] : nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(mod.part(part).title) · \(part.title) · onsets a second")
                .dataLabel(9)
                .foregroundStyle(Palette.muted)
            HStack(spacing: compact ? 6 : 10) {
                ForEach(GameEngine.Difficulty.allCases.filter { $0 != .adaptive }, id: \.rawValue) { d in
                    let now = figure(mod, d)
                    let was = base.flatMap { figure($0, d) }
                    let moved = now != nil && was != nil && abs(now! - was!) > 0.005
                    VStack(alignment: .leading, spacing: 1) {
                        Text(d.title)
                            .dataLabel(9)
                            .foregroundStyle(Palette.muted)
                            .lineLimit(1)
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text(now.map { String(format: "%.2f", $0) } ?? "—")
                                .font(.display(compact ? 18 : 22))
                                .monospacedDigit()
                                .foregroundStyle(moved ? Palette.signal : Palette.text)
                            if moved, let was {
                                Text(String(format: "was %.2f", was))
                                    .dataLabel(8)
                                    .foregroundStyle(Palette.muted)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .padding(.horizontal, compact ? 8 : 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Palette.ground))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(moved ? Palette.signal.opacity(0.5) : Palette.line, lineWidth: 1))
                }
            }
        }
    }
}
