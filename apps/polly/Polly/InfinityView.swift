import SwiftUI

// Infinity Chat (Direction 2b) — the study sheet became the screen.
//   InfinityHomeView   the topic's screen: the hero ("Parliamo", the pair) and
//                      the journey — every conversation, spoken or typed.
//   InfinityChatPage   one conversation's page: fixes, words, grammar,
//                      transcript; Quiz and the pair as Continue.
// Talk messy (or type messy), clean it up, master it, carry it on. The chat
// window that used to sit underneath is gone; text is the quieter line under
// the voice button, everywhere.

struct InfinityHomeView: View {
    let topicId: String
    var title: String = "Infinity Chat"

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var chats: [InfinityChat] = []
    @State private var loading = true
    @State private var flow = ChatFlow()
    @State private var openChat: InfinityChat? = nil
    @State private var level: String? = nil

    var body: some View {
        ZStack {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 16) {
                        hero
                        if !chats.isEmpty {
                            HStack {
                                Text(L("Your journey", "Il tuo percorso", "Ton parcours", "나의 여정"))
                                    .font(.system(size: 13, weight: .semibold)).tracking(0.3)
                                    .foregroundStyle(PollyTheme.text3)
                                Spacer()
                            }
                            .padding(.top, 4)
                            ChatRail(chats: chats, flow: flow) { openChat = $0 }
                        } else if loading {
                            ProgressView().tint(PollyTheme.text3).padding(.top, 30)
                        } else {
                            emptyState
                        }
                        Color.clear.frame(height: 86) // room for the floating TabPill
                    }
                    .pollyContentColumn()
                    .padding(16)
                }
                .scrollIndicators(.hidden)
            }
        }
        .navigationBarBackButtonHidden(true)
        .navigationDestination(item: $openChat) { chat in
            InfinityChatPage(chatId: chat.id, seed: chat, topicId: topicId, topicTitle: title)
                .toolbar(.hidden, for: .navigationBar)
        }
        .chatFlow(flow, session: session)
        .task {
            flow.threadId = topicId
            flow.title = title
            flow.textContext = { chat in TextChatContext(threadId: topicId, title: chat?.displayTitle ?? title, chatId: chat?.id) }
            await load()
            #if targetEnvironment(simulator)
            await runLaunchHooks()
            #endif
        }
        .onChange(of: flow.changes) { Task { await load() } }
    }

    // MARK: header — "A1 · 4 chats · 14 words" (mastery is per chat; no stars here)

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            IconCircleButton(systemImage: "chevron.left", fg: PollyTheme.text) { dismiss() }
            VStack(spacing: 3) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold)).tracking(-0.3)
                    .foregroundStyle(PollyTheme.text).lineLimit(1)
                Text(summary)
                    .font(.system(size: 12, weight: .medium)).tracking(-0.1)
                    .foregroundStyle(PollyTheme.gold)
            }
            .frame(maxWidth: .infinity)
            Menu {
                ChatModelMenuItems()
            } label: {
                TopicKebab()
            }
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 12)
    }

    private var summary: String {
        let words = chats.reduce(0) { $0 + ($1.analysis?.vocab.count ?? 0) }
        let n = chats.count
        var parts: [String] = []
        if let level { parts.append(level) }
        parts.append("\(n) \(n == 1 ? L("chat", "chat", "discussion", "대화") : L("chats", "chat", "discussions", "대화"))")
        if words > 0 { parts.append("\(words) \(L("words", "parole", "mots", "단어"))") }
        return parts.joined(separator: " · ")
    }

    // MARK: the hero

    private var hero: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle().fill(PollyTheme.accentSoft).frame(width: 68, height: 68)
                DodoMiniMark(size: 56)
            }
            VStack(spacing: 4) {
                Text(L("Let's talk", "Parliamo", "Parlons", "이야기해요"))
                    .font(.custom("Fredoka", size: 24).weight(.semibold))
                    .foregroundStyle(PollyTheme.text)
                Text(L("Messy is good. Mix in English. We tidy up after.", "Va bene fare pasticci. Mescola pure l’inglese. Sistemiamo dopo.", "Le désordre, c’est bien. Mélange l’anglais. On range après.", "엉망이어도 좋아요. 영어를 섞어도 돼요. 나중에 정리해요."))
                    .font(.system(size: 13.5)).foregroundStyle(PollyTheme.text2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            TalkPair(voiceLabel: L("Start a chat", "Inizia una chat", "Commencer une discussion", "대화 시작"),
                     onVoice: { flow.talk() }, onType: { flow.type() })
                .padding(.top, 2)
        }
        .padding(.horizontal, 18).padding(.top, 20).padding(.bottom, 12)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(PollyTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(PollyTheme.accentDim, lineWidth: 1))
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Text(L("No chats yet", "Ancora nessuna chat", "Aucune discussion pour l’instant", "아직 대화가 없어요"))
                .font(.custom("Fredoka", size: 18).weight(.semibold))
                .foregroundStyle(PollyTheme.text2)
            Text(L("Talk or type — either way it shows up here, ready to clean up.", "Parla o scrivi — in ogni caso la trovi qui, pronta da sistemare.", "Parle ou écris — dans les deux cas elle apparaît ici, à ranger.", "말하거나 입력하세요 — 어느 쪽이든 여기에 나타나요."))
                .font(.system(size: 13.5)).foregroundStyle(PollyTheme.text3)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 24).padding(.horizontal, 20)
    }

    private func load() async {
        if let fetched = try? await PollyAPI.shared.listInfinityChats(threadId: topicId) { chats = fetched }
        loading = false
        if level == nil { level = (try? await PollyAPI.shared.getPath())?.level }
    }

    #if targetEnvironment(simulator)
    /// `-OpenInfinityDrill text|talk|quiz|cleanup|page|vocab|grammar|voice|type` — screenshot
    /// loops: the text chat, a chat's quiz / walk, or its page (and, on the page,
    /// a drill or Continue by voice / by typing).
    private func runLaunchHooks() async {
        // Launch arguments outlive removeObject — take each hook once per launch.
        guard let which = UserDefaults.standard.string(forKey: "OpenInfinityDrill"), LaunchOnce.take("OpenInfinityDrill") else { return }
        try? await Task.sleep(for: .milliseconds(600))
        if which == "text" { flow.type(); return }
        // `talk` — a NEW spoken chat (pair with -VoiceLiveTest 1 and, for the
        // ElevenLabs engine, -voiceEngine eleven).
        if which == "talk" { flow.talk(); return }
        guard let ready = chats.first(where: { $0.hasAnalysis }) else { return }
        switch which {
        case "quiz": flow.quiz(ready)
        case "cleanup": flow.review(ready)
        default:
            UserDefaults.standard.set(which, forKey: "OpenChatSection")
            openChat = ready
        }
    }
    #endif
}

/// The "···" in a topic header.
struct TopicKebab: View {
    var body: some View {
        Image(systemName: "ellipsis")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(PollyTheme.text)
            .frame(width: 36, height: 36)
            .background(PollyTheme.surface, in: Circle())
            .overlay(Circle().stroke(PollyTheme.border, lineWidth: 1))
    }
}

/// Identifiable wrapper so a conversation's quiz can drive a fullScreenCover.
struct InfinityQuizSheet: Identifiable {
    let id = UUID()
    let chat: InfinityChat
    let start: FlashStart
}

// MARK: - A chat's page

struct InfinityChatPage: View {
    let chatId: String
    /// What the list already knew, so the page paints at once.
    let seed: InfinityChat?
    let topicId: String
    let topicTitle: String

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var chat: InfinityChat? = nil
    @State private var flow = ChatFlow()
    @State private var flipped: Set<String> = []
    @State private var showAllFixes = false
    @State private var showTranscript = false
    @State private var vocabPresented = false
    @State private var grammarPresented = false
    @State private var renaming = false
    @State private var titleDraft = ""
    @State private var confirmDelete = false

    private var shown: InfinityChat? { chat ?? seed }

    var body: some View {
        ZStack(alignment: .bottom) {
            PollyTheme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        if let c = shown {
                            if let a = c.analysis, !a.fixes.isEmpty || !a.vocab.isEmpty || !a.grammar.isEmpty {
                                fixes(a)
                                words(a)
                                grammar(a)
                            } else {
                                notYet(c)
                            }
                            transcript(c)
                        } else {
                            ProgressView().tint(PollyTheme.text3).frame(maxWidth: .infinity).padding(.top, 40)
                        }
                        Color.clear.frame(height: 250) // the footer + TabPill float over the end
                    }
                    .pollyContentColumn()
                    .padding(.horizontal, 16).padding(.top, 4)
                }
                .scrollIndicators(.hidden)
            }
            footer
        }
        .navigationBarBackButtonHidden(true)
        .chatFlow(flow, session: session)
        .sheet(isPresented: $vocabPresented) {
            if let c = shown { InfinityVocabView(chat: c).environment(session) }
        }
        .sheet(isPresented: $grammarPresented) {
            if let c = shown { InfinityGrammarView(chat: c).environment(session) }
        }
        .alert(L("Rename chat", "Rinomina la chat", "Renommer la discussion", "대화 이름 바꾸기"), isPresented: $renaming) {
            TextField("Title", text: $titleDraft)
            Button("Save") {
                let t = titleDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                Task { try? await PollyAPI.shared.renameInfinityChat(id: chatId, title: t); await load() }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Delete this chat?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete chat", role: .destructive) {
                Task { try? await PollyAPI.shared.deleteInfinityChat(id: chatId); dismiss() }
            }
            Button("Cancel", role: .cancel) {}
        } message: { Text("The cards it made stay in your deck.") }
        .task {
            flow.threadId = topicId
            flow.title = topicTitle
            flow.textContext = { c in TextChatContext(threadId: topicId, title: c?.displayTitle ?? topicTitle, chatId: c?.id) }
            await load()
            #if targetEnvironment(simulator)
            if let which = UserDefaults.standard.string(forKey: "OpenChatSection") {
                UserDefaults.standard.removeObject(forKey: "OpenChatSection") // set in-app, so this does clear it
                try? await Task.sleep(for: .milliseconds(500))
                if which == "vocab" { vocabPresented = true } else if which == "grammar" { grammarPresented = true }
                else if which == "voice", let c = shown { flow.talk(continuing: c) }
                else if which == "type", let c = shown { flow.type(continuing: c) }
            }
            #endif
        }
        .onChange(of: flow.changes) { Task { await load() } }
    }

    // MARK: header — "✓ Cleaned up · today · 🎤 6 min"

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            IconCircleButton(systemImage: "chevron.left", fg: PollyTheme.text) { dismiss() }
            VStack(spacing: 3) {
                Text(shown?.displayTitle ?? "")
                    .font(.system(size: 17, weight: .semibold)).tracking(-0.3)
                    .foregroundStyle(PollyTheme.text).lineLimit(1)
                if let c = shown { statusLine(c) }
            }
            .frame(maxWidth: .infinity)
            Menu {
                Button { titleDraft = shown?.title ?? ""; renaming = true } label: { Label("Rename", systemImage: "pencil") }
                if shown?.isCleanedUp == true, let c = shown {
                    Button { flow.review(c) } label: { Label(L("Walk the fixes again", "Ripassa le correzioni", "Revoir les corrections", "수정 다시 보기"), systemImage: "sparkles") }
                }
                Button(role: .destructive) { confirmDelete = true } label: { Label("Delete chat", systemImage: "trash") }
            } label: { TopicKebab() }
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 10)
    }

    private func statusLine(_ c: InfinityChat) -> some View {
        let state: String, tint: Color, symbol: String
        if c.isOpen { state = L("Still open", "Ancora aperta", "Encore ouverte", "진행 중"); tint = PollyTheme.accent; symbol = "ellipsis.bubble" }
        else if c.wantsCleanup { state = L("Ready to clean up", "Da sistemare", "À ranger", "정리 전"); tint = PollyTheme.accent; symbol = "sparkles" }
        else if c.isMastered { state = L("Mastered", "Padroneggiata", "Maîtrisée", "마스터"); tint = PollyTheme.gold; symbol = "star.fill" }
        else { state = L("Cleaned up", "Sistemata", "Rangée", "정리됨"); tint = PollyTheme.sprout; symbol = "checkmark" }
        return HStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 10, weight: .bold))
            Text(state)
            Text("·")
            Text(chatDay(c.createdAt))
            Text("·")
            Image(systemName: c.inputSymbol).font(.system(size: 10, weight: .semibold))
            if c.isMixed { Image(systemName: "keyboard").font(.system(size: 10, weight: .semibold)) }
            if let m = c.minutes, !c.isTyped { Text("\(m) min") }
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(tint)
        .lineLimit(1)
    }

    // MARK: sections

    private func sect(_ title: String, count: Int, action: (label: String, run: () -> Void)? = nil) -> some View {
        HStack {
            Text("\(title) · \(count)".uppercased())
                .font(.system(size: 11.5, weight: .semibold)).tracking(0.7)
                .foregroundStyle(PollyTheme.text3)
            Spacer()
            if let action {
                Button(action: action.run) {
                    HStack(spacing: 3) {
                        Text(action.label)
                        Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold))
                    }
                    .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(PollyTheme.accent)
                    .frame(minHeight: 28).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 10)
    }

    /// Fixes, compact: you said → try → why.
    @ViewBuilder
    private func fixes(_ a: InfinityAnalysis) -> some View {
        if !a.fixes.isEmpty {
            sect(L("Fixes", "Correzioni", "Corrections", "수정"), count: a.fixes.count)
            let list = showAllFixes ? a.fixes : Array(a.fixes.prefix(3))
            ForEach(list) { f in
                VStack(alignment: .leading, spacing: 4) {
                    Text(L("YOU SAID", "HAI DETTO", "TU AS DIT", "이렇게 말했어요"))
                        .font(.system(size: 9.5, weight: .bold)).tracking(1).foregroundStyle(PollyTheme.text3)
                    Text("“\(f.said)”").strikethrough().font(.system(size: 13.5)).foregroundStyle(PollyTheme.text3)
                    Text(f.fixed).font(.custom("Fredoka", size: 17).weight(.semibold)).foregroundStyle(PollyTheme.text)
                    Text(f.note).font(.system(size: 12.5)).foregroundStyle(PollyTheme.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(PollyTheme.border, lineWidth: 1))
            }
            if a.fixes.count > 3 && !showAllFixes {
                Button { withAnimation(.easeOut(duration: 0.2)) { showAllFixes = true } } label: {
                    Text("+\(a.fixes.count - 3) \(L("more", "altre", "de plus", "더 보기"))")
                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(PollyTheme.accent)
                        .frame(maxWidth: .infinity, minHeight: 32).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// Words as chips: tap one to flip it to its meaning.
    @ViewBuilder
    private func words(_ a: InfinityAnalysis) -> some View {
        if !a.vocab.isEmpty {
            sect(L("Words", "Parole", "Mots", "단어"), count: a.vocab.count,
                 action: (L("Drill", "Esercitati", "S’entraîner", "연습"), { vocabPresented = true }))
            FlowLayout(spacing: 7) {
                ForEach(a.vocab) { v in
                    let on = flipped.contains(v.term)
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) { if on { flipped.remove(v.term) } else { flipped.insert(v.term) } }
                    } label: {
                        Text(on ? v.meaning : v.term)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(on ? PollyTheme.inkOnAccent : PollyTheme.text)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(on ? PollyTheme.accent : PollyTheme.surface, in: Capsule())
                            .overlay(Capsule().stroke(on ? Color.clear : PollyTheme.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// Grammar: a point, its one line, its drills one tap away.
    @ViewBuilder
    private func grammar(_ a: InfinityAnalysis) -> some View {
        if !a.grammar.isEmpty {
            sect(L("Grammar", "Grammatica", "Grammaire", "문법"), count: a.grammar.count)
            ForEach(a.grammar) { g in
                Button { grammarPresented = true } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(g.point).font(.system(size: 14.5, weight: .semibold)).foregroundStyle(PollyTheme.text)
                                .multilineTextAlignment(.leading)
                            Text("\(g.explain)").font(.system(size: 12.5)).foregroundStyle(PollyTheme.text2).lineLimit(2)
                                .multilineTextAlignment(.leading)
                            Text("\(g.drills.count) \(g.drills.count == 1 ? "drill" : "drills")")
                                .font(.system(size: 11.5, weight: .semibold)).foregroundStyle(PollyTheme.accent)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(PollyTheme.text4)
                    }
                    .padding(13)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(PollyTheme.border, lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func notYet(_ c: InfinityChat) -> some View {
        VStack(spacing: 6) {
            Text(c.isOpen ? L("This chat is still open", "Questa chat è ancora aperta", "Cette discussion est encore ouverte", "아직 진행 중인 대화예요")
                          : L("Not cleaned up yet", "Non ancora sistemata", "Pas encore rangée", "아직 정리 전이에요"))
                .font(.custom("Fredoka", size: 18).weight(.semibold)).foregroundStyle(PollyTheme.text2)
            Text(L("Clean it up and Polly picks the few things worth fixing, the words you reached for, and the grammar behind them.", "Sistemala e Polly sceglie le poche cose da correggere, le parole che cercavi e la grammatica che c’è dietro.", "Range-la et Polly choisit les quelques points à corriger, les mots que tu cherchais et la grammaire derrière.", "정리하면 Polly가 고칠 만한 몇 가지와 찾던 단어, 그 뒤의 문법을 골라 줘요."))
                .font(.system(size: 13.5)).foregroundStyle(PollyTheme.text3)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 26).padding(.horizontal, 12)
    }

    /// The conversation itself, folded away at the end.
    @ViewBuilder
    private func transcript(_ c: InfinityChat) -> some View {
        let turns = (c.transcript ?? []).filter { $0.lane != "agent" }
        if !turns.isEmpty {
            Button { withAnimation(.easeOut(duration: 0.2)) { showTranscript.toggle() } } label: {
                HStack {
                    Text("\(L("Transcript", "Trascrizione", "Transcription", "대화 기록")) · \(turns.count)".uppercased())
                        .font(.system(size: 11.5, weight: .semibold)).tracking(0.7).foregroundStyle(PollyTheme.text3)
                    Spacer()
                    Image(systemName: showTranscript ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10, weight: .bold)).foregroundStyle(PollyTheme.text3)
                }
                .frame(minHeight: 32).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
            if showTranscript {
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(turns) { t in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(t.role == "user" ? L("YOU", "TU", "TOI", "나") : "POLLY")
                                .font(.system(size: 9.5, weight: .bold)).tracking(1)
                                .foregroundStyle(t.role == "user" ? PollyTheme.accent : PollyTheme.text3)
                            Text(t.text).font(.system(size: 14)).foregroundStyle(PollyTheme.text)
                                .fixedSize(horizontal: false, vertical: true)
                                .textSelection(.enabled)
                        }
                    }
                }
                .padding(13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PollyTheme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(PollyTheme.border, lineWidth: 1))
            }
        }
    }

    // MARK: footer — Quiz, then the pair as Continue

    private var footer: some View {
        VStack(spacing: 8) {
            if let c = shown {
                if c.isOpen {
                    EmptyView()
                } else if c.wantsCleanup {
                    wideButton(flow.preparingCleanupId == c.id
                               ? L("Polly's reading it back…", "Polly la rilegge…", "Polly la relit…", "Polly가 다시 읽는 중…")
                               : L("Clean it up · 2 min", "Sistemala · 2 min", "Ranger · 2 min", "정리하기 · 2분"),
                               symbol: "sparkles", tint: PollyTheme.accent, busy: flow.preparingCleanupId == c.id) { flow.cleanUp(c) }
                } else if !c.isCleanedUp, c.hasAnalysis {
                    wideButton(L("Walk through the fixes", "Ripassa le correzioni", "Parcourir les corrections", "수정 살펴보기"),
                               symbol: "sparkles", tint: PollyTheme.accent, busy: false) { flow.review(c) }
                } else if c.hasAnalysis {
                    wideButton(flow.preparingQuizId == c.id ? L("Loading quiz…", "Carico il quiz…", "Chargement du quiz…", "퀴즈 불러오는 중…")
                               : c.isMastered ? L("Quiz again", "Rifai il quiz", "Refaire le quiz", "퀴즈 다시 풀기")
                               : L("Quiz · master it", "Quiz · padroneggiala", "Quiz · maîtrise-la", "퀴즈 · 마스터하기"),
                               symbol: c.isMastered ? "checkmark.seal.fill" : "graduationcap.fill", tint: PollyTheme.sprout,
                               busy: flow.preparingQuizId == c.id) { flow.quiz(c) }
                }
                TalkPair(voiceLabel: L("Continue this chat", "Continua questa chat", "Continuer cette discussion", "이 대화 이어가기"),
                         typeLabel: L("continue by typing", "continua scrivendo", "continue à l’écrit", "입력으로 이어가기"),
                         compact: true,
                         onVoice: { flow.talk(continuing: c) }, onType: { flow.type(continuing: c) })
            }
        }
        .pollyContentColumn()
        .padding(.horizontal, 16).padding(.top, 12)
        .padding(.bottom, 88) // above the floating TabPill
        .background(
            LinearGradient(colors: [PollyTheme.bg.opacity(0), PollyTheme.bg, PollyTheme.bg], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
    }

    private func wideButton(_ title: String, symbol: String, tint: Color, busy: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(PollyTheme.inkOnAccent).scaleEffect(0.8) }
                else { Image(systemName: symbol).font(.system(size: 14, weight: .bold)) }
                Text(title).font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(PollyTheme.inkOnAccent)
            .frame(maxWidth: .infinity).padding(.vertical, 12)
            .background(tint, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func load() async {
        if let fetched = try? await PollyAPI.shared.getInfinityChat(id: chatId) { chat = fetched }
    }
}
